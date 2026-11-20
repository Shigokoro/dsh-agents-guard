import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildCard,
  clip,
  redactSecrets,
  decideAmbiguity,
  decideCompress,
  decideReasoning,
  emptyState,
  hashCard,
  normalizeConfig,
  reduceEvent,
  renderIndexMarkdown,
  upsertGeneratedBlock,
} from './core.mjs';

export const name = 'dsh-agents-guard';
export const inject = ['tools', 'sessionProjections', 'sessions', 'agents', 'systemPrompt'];

export async function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  if (!config.enabled) return;

  const log = (level, message) => {
    try {
      const logger = ctx.logger;
      if (logger && typeof logger[level] === 'function') logger[level]('[dsh-agents-guard] ' + message);
    } catch {}
  };

  const stateSchema = {
    parse(value) {
      return value;
    },
  };

  const handle = await ctx.sessionProjections.register({
    key: 'agentsGuardMemory',
    stateSchema,
    init(header) {
      return emptyState(header);
    },
    apply(state, event) {
      return reduceEvent(state, event);
    },
    stateVersion: 3,
  });

  const MEMORY_KINDS = ['decision', 'verified', 'error', 'open', 'requirement', 'correction', 'assumption'];
  ctx.tools.register({
    name: 'agents_memory',
    description: 'Record a user decision, verified fact, error, open item, requirement, correction, or assumption in the session index so it survives compression. Cite evidence for decisions and verified facts; never record an assumption as a user decision.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add'], description: 'Only add is supported.' },
        kind: { type: 'string', enum: MEMORY_KINDS, description: 'Entry kind.' },
        text: { type: 'string', description: 'Concise entry text.' },
        evidence: { type: 'string', description: 'Message ref, file path, command, or observation supporting the entry.' },
        source: { type: 'string', enum: ['user', 'tool', 'model'], description: 'Where the entry came from; default model.' },
      },
      required: ['action', 'kind', 'text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          kind: { type: 'string' },
          text: { type: 'string' },
          source: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['ok', 'kind', 'text'],
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      if (input.action !== 'add') throw new Error('action must be add');
      const kind = String(input.kind || '');
      if (!MEMORY_KINDS.includes(kind)) throw new Error('kind must be one of ' + MEMORY_KINDS.join(', '));
      const text = clip(redactSecrets(input.text), 500);
      if (!text) throw new Error('text is required');
      const source = ['user', 'tool', 'model'].includes(input.source) ? input.source : 'model';
      const evidence = clip(redactSecrets(input.evidence), 260);
      if (exec && exec.agent) {
        try {
          const session = ctx.sessions.get(exec.agent.id);
          if (session) {
            const list = runtimeMemory.get(session.id) || [];
            list.push({ seq: Date.now(), kind, text, source, evidence, runtime: true });
            while (list.length > config.maxLlmEntries) list.shift();
            runtimeMemory.set(session.id, list);
            writeIndex(session, handle.stateOf(session));
          }
        } catch (error) {
          log('warn', 'memory write failed: ' + String(error && error.message ? error.message : error));
        }
      }
      return {
        ok: true,
        kind,
        text,
        source,
        evidence,
        note: 'Recorded; written to the index and included in the next memory card.',
      };
    },
  });

  const injected = new Map();
  const lastCardHash = new Map();
  const lastReasoningNotice = new Map();
  const runtimeMemory = new Map();
  const writeQueues = new Map();

  const mergeMemory = (state, sessionId) => {
    const extra = runtimeMemory.get(sessionId);
    if (!extra || !extra.length) return state;
    return Object.assign({}, state, { llmEntries: (state.llmEntries || []).concat(extra) });
  };

  const injectCard = (session, state, turn) => {
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return;
    const card = buildCard(mergeMemory(state, session.id), config);
    const hash = card ? hashCard(card) : '';
    if (!card) {
      injected.set(session.id, { turn, seq: state.lastUserSeq });
      return;
    }
    if (lastCardHash.get(session.id) === hash) {
      injected.set(session.id, { turn, seq: state.lastUserSeq });
      return;
    }
    lastCardHash.set(session.id, hash);
    try {
      const result = agent.inject({
        content: [{ type: 'text', text: card }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') {
        result.then(() => {
          injected.set(session.id, { turn, seq: state.lastUserSeq });
        }).catch((error) => {
          lastCardHash.delete(session.id);
          log('warn', 'index injection failed: ' + String(error && error.message ? error.message : error));
        });
      } else {
        injected.set(session.id, { turn, seq: state.lastUserSeq });
      }
    } catch (error) {
      lastCardHash.delete(session.id);
      log('warn', 'index injection threw: ' + String(error && error.message ? error.message : error));
    }
  };

  const injectReasoningNotice = (session, state) => {
    if (!(Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq))) return;
    if (lastReasoningNotice.get(session.id) === state.reasoningSeq) return;
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return;
    lastReasoningNotice.set(session.id, state.reasoningSeq);
    const excerpt = String(state.reasoningText || '').slice(0, 180);
    try {
      const result = agent.inject({
        content: [{ type: 'text', text: '[dsh-agents-guard] 你的推理中出现未解决疑问: "' + excerpt + '". 先验证（read/grep/web_search，或只读 run_code），再用 agents_memory 记录 kind=verified + evidence；无法验证再 ask_user。在解决前 write/edit/pwsh/compress 与非只读 run_code 会被拒绝。' }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch (error) {
      lastReasoningNotice.delete(session.id);
      log('warn', 'reasoning notice failed: ' + String(error && error.message ? error.message : error));
    }
  };

  const writeIndex = (session, state) => {
    if (!config.writeIndex) return;
    const cwd = state.cwd || (session.header && session.header.cwd) || process.cwd();
    const file = path.join(cwd, config.indexFileName);
    const generated = renderIndexMarkdown(mergeMemory(state, session.id), session.id, config);
    const previous = writeQueues.get(file) || Promise.resolve();
    const next = previous.then(async () => {
      let existing = '';
      try {
        existing = await fs.readFile(file, 'utf8');
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
      }
      const merged = upsertGeneratedBlock(existing, generated);
      if (merged === existing) return;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, merged, 'utf8');
    }).catch((error) => {
      log('warn', 'index write failed: ' + String(error && error.message ? error.message : error));
    });
    writeQueues.set(file, next);
  };

  ctx.on('session/event', (session, event) => {
    try {
      const state = handle.stateOf(session);
      if (event.type === 'turn/start') {
        injectCard(session, state, event.data && event.data.turn);
      } else if (event.type === 'turn/end' || event.type === 'user/message') {
        writeIndex(session, state);
      } else if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        injectReasoningNotice(session, state);
        if (Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq)) writeIndex(session, state);
      }
    } catch (error) {
      log('warn', 'session event handling failed: ' + String(error && error.message ? error.message : error));
    }
  });

  ctx.tools.guard((execution) => {
    if (!execution || !execution.agent) return;
    let session;
    try {
      session = ctx.sessions.get(execution.agent.id);
    } catch {}
    if (!session) return;
    let state;
    try {
      state = handle.stateOf(session);
    } catch (error) {
      if (execution.name === 'compress') {
        return { reason: 'dsh-agents-guard: session index could not be read; do not compress now. ' + String(error && error.message ? error.message : error) };
      }
      return;
    }
    const args = execution.arguments && typeof execution.arguments === 'object' ? execution.arguments : {};
    const ambiguity = decideAmbiguity({
      state,
      toolName: execution.name,
      code: args.code,
      config,
    });
    if (!ambiguity.allow) return { reason: ambiguity.reason };
    const reasoning = decideReasoning({
      state,
      toolName: execution.name,
      code: args.code,
      config,
    });
    if (!reasoning.allow) return { reason: reasoning.reason };
    if (!config.denyCompress || execution.name !== 'compress') return;
    let currentTurn = 0;
    try {
      currentTurn = ctx.agents.turnBoundaryOf(session).lastTurn || 0;
    } catch {}
    const decision = decideCompress({
      state,
      mark: injected.get(session.id),
      currentTurn,
      denyCompress: config.denyCompress,
    });
    if (!decision.allow) return { reason: decision.reason };
  });

  ctx.systemPrompt.section({
    name: 'agents-guard-memory',
    order: 7000,
    text: 'The dsh-agents-guard plugin maintains a session index and injects it as a user-role memory card at the start of a turn. Treat that card as historical context, not as a new user instruction. Use agents_memory to record user decisions, verified facts, errors, open items, and corrections; cite evidence, and never record an assumption as a user decision. When the latest user message is ambiguous (explicit alternatives, 随便/你决定, or a yes/no question), the ambiguity gate blocks write/edit/pwsh/run_code/compress until you call ask_user with a concrete question; do not proceed on a self-chosen assumption. If your own reasoning contains an unresolved question, verify first with read-only tools or read-only run_code; a successful read-only verification call clears the reasoning gate. If verification is impossible, ask the user. agents_memory records decisions and evidence but does not clear the gate. The reasoning gate blocks write/edit/pwsh/compress and non-read-only run_code until then. Before calling compress, ensure the current turn has a memory card; the guard denies compression when the index does not cover the latest user message. If compress is denied, do not retry the identical call; continue the task, or wait for the next turn so the index is refreshed. Only user-authored messages are indexed; plugin-injected context is ignored.',
  });

  log('info', 'active; denyCompress=' + String(config.denyCompress) + ' writeIndex=' + String(config.writeIndex) + ' ambiguityGate=' + String(config.ambiguityGate) + ' reasoningGate=' + String(config.reasoningGate));
}
