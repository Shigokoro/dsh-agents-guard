import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCard,
  clip,
  redactSecrets,
  memoryKey,
  memoryRecordProblem,
  mergeLlmEntries,
  authorityFor,
  decideAmbiguity,
  decideCompress,
  decideRecall,
  decideRecord,
  decideReasoning,
  shouldForceCompress,
  emptyState,
  hashCard,
  normalizeConfig,
  openReasoningQuestions,
  parseIndexMemory,
  reduceEvent,
  renderIndexMarkdown,
  upsertGeneratedBlock,
} from './core.mjs';

// Settings-page schema; schemastery is declared in package.json. hmr:2026-11-21T01:09
let z = null;
try {
  const mod = await import('@deepseek-ai/schemastery');
  z = mod.default ?? mod;
} catch {}

export const name = 'dsh-agents-guard';
export const inject = ['tools', 'sessionProjections', 'sessions', 'agents', 'systemPrompt'];

export const Config = z ? z.object({
  enabled: z.boolean().default(true),
  compressPressureRatio: z.number().min(0.05).max(1).default(0.8),
  writeIndex: z.boolean().default(true),
  indexFileName: z.string().default('AGENT_CONTEXT_INDEX.md'),
  indexRoot: z.string().default(''),
  maxCardChars: z.number().step(1).min(500).max(20000).default(4200),
  maxRequirements: z.number().step(1).min(1).max(100).default(12),
  maxDecisions: z.number().step(1).min(1).max(100).default(6),
  maxOpenItems: z.number().step(1).min(1).max(100).default(6),
  maxFailures: z.number().step(1).min(1).max(100).default(6),
  maxChangedFiles: z.number().step(1).min(1).max(200).default(10),
  maxLlmEntries: z.number().step(1).min(1).max(200).default(40),
  recallGate: z.boolean().default(true),
  recordGate: z.boolean().default(true),
  ambiguityGate: z.boolean().default(true),
  ambiguityAllowRunCodeWithAsk: z.boolean().default(true),
  ambiguityTools: z.array(z.string()).default(['write', 'edit', 'pwsh', 'run_code', 'compress']),
  reasoningGate: z.boolean().default(true),
  reasoningAllowReadOnlyRunCode: z.boolean().default(false),
  reasoningTools: z.array(z.string()).default(['write', 'edit', 'pwsh', 'compress', 'run_code']),
  reasoningVerifyTools: z.array(z.string()).default(['read', 'glob', 'grep', 'web_search', 'web_fetch', 'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace']),
  maxReasoningQuestions: z.number().step(1).min(1).max(100).default(8),
}).volatile() : undefined;

export async function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  if (!config.enabled) return;

  const log = (level, message) => {
    try {
      const logger = ctx.logger;
      if (logger && typeof logger[level] === 'function') logger[level]('[dsh-agents-guard] ' + message);
    } catch {}
  };

  const readContextPressure = (session) => {
    try {
      if (typeof ctx.get !== 'function') return null;
      const meter = ctx.get('tokenMeter');
      if (!meter || typeof meter.contextPressure !== 'function') return null;
      const pressure = meter.contextPressure(session);
      if (!pressure) return null;
      const pressureTokens = Number(pressure.pressureTokens);
      const contextWindow = Number(pressure.contextWindow);
      if (!Number.isFinite(pressureTokens) || !Number.isFinite(contextWindow) || pressureTokens <= 0 || contextWindow <= 0) return null;
      return { pressureTokens, contextWindow };
    } catch (error) {
      log('warn', 'context pressure read failed: ' + String(error && error.message ? error.message : error));
      return null;
    }
  };

  const workspaceFileService = () => {
    try {
      if (typeof ctx.get !== 'function') return null;
      const service = ctx.get('workspaceFiles');
      if (!service || typeof service.stat !== 'function' || typeof service.readBytes !== 'function' || typeof service.list !== 'function') return null;
      return service;
    } catch (error) {
      log('warn', 'workspace file service read failed: ' + String(error && error.message ? error.message : error));
      return null;
    }
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
    description: 'Record a distilled conclusion, requirement, correction, decision, verified fact, error, or open item in the session index so it survives compression. First-choice recording tool: when the user states a requirement, correction, decision, or acceptance criterion, call this before any write operation or compression. Write your own concise conclusion (<=600 characters), never a transcript or a copy of the raw user message; locate the original through agents_index search (userLog). Cite evidence for decisions and verified facts; never record an assumption as a user decision.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add'], description: 'Only add is supported.' },
        kind: { type: 'string', enum: MEMORY_KINDS, description: 'Entry kind.' },
        text: { type: 'string', description: 'Distilled conclusion or requirement in your own words (<=600 characters); never paste the raw user message.' },
        evidence: { type: 'string', description: 'Message ref, file path, command, or observation supporting the entry.' },
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
          authority: { type: 'string' },
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
      const problem = memoryRecordProblem(input.text);
      if (problem) throw new Error(problem);
      const text = clip(redactSecrets(input.text), 600);
      if (!text) throw new Error('text is required');
      const source = 'model';
      const evidence = clip(redactSecrets(input.evidence), 260);
      const authority = authorityFor(kind);
      const id = 'mem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      if (exec && exec.agent) {
        try {
          const session = ctx.sessions.get(exec.agent.id);
          if (session) {
            const list = runtimeMemory.get(session.id) || [];
            list.push({ id, seq: Date.now(), kind, text, source, evidence, authority, runtime: true });
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
        authority,
        note: 'Recorded; written to the index and included in the next memory card.',
      };
    },
  });

  ctx.tools.register({
    name: 'agents_index',
    description: 'First-choice recall tool. Read the dsh-agents-guard session index as structured data instead of opening AGENT_CONTEXT_INDEX.md manually, and call this before session_search, glob, or grep when the task involves earlier work, prior discussion, requirements, decisions, corrections, or open issues. Returns the compact memory card, the generated Markdown block, counts, and the current open reasoning questions. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'search'], description: 'get returns the index; search filters entries by query.' },
        format: { type: 'string', enum: ['card', 'markdown'], description: 'card is compact; markdown is the generated index block.' },
        query: { type: 'string', description: 'Case-insensitive search text for action=search.' },
        limit: { type: 'number', description: 'Maximum search matches (default 20, max 50).' },
      },
      required: [],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          format: { type: 'string' },
          text: { type: 'string' },
          counts: { type: 'object' },
          matches: { type: 'array' },
          updatedAt: { type: 'string' },
        },
        required: ['ok'],
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      await loadPersistedMemory(session);
      const state = mergeMemory(handle.stateOf(session), session.id);
      const openQuestions = openReasoningQuestions(state);
      const counts = {
        requirements: state.requirements.length,
        userLog: (state.userLog || []).length,
        decisions: state.decisions.length,
        openItems: state.openItems.length,
        failures: state.failures.length,
        changedFiles: state.changedFiles.length,
        llmEntries: (state.llmEntries || []).length,
        openReasoningQuestions: openQuestions.length,
        lastUserSeq: state.lastUserSeq,
        lastTurn: state.lastTurn,
      };
      if (input.action === 'search') {
        const query = String(input.query || '').trim().toLowerCase();
        if (!query) throw new Error('query is required for action=search');
        const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
        const sections = [
          ['requirements', state.requirements],
          ['userLog', state.userLog || []],
          ['decisions', state.decisions],
          ['openItems', state.openItems],
          ['failures', state.failures],
          ['changedFiles', state.changedFiles],
          ['llmEntries', state.llmEntries || []],
        ];
        const matches = [];
        for (const [section, items] of sections) {
          for (const item of items) {
            const text = String(item.text || '');
            const evidence = String(item.evidence || '');
            if (!text.toLowerCase().includes(query) && !evidence.toLowerCase().includes(query)) continue;
            matches.push({ section, seq: item.seq, text, evidence, source: section === 'llmEntries' ? 'distilled-memory' : section === 'userLog' ? 'raw-user-message' : 'index' });
            if (matches.length >= limit) break;
          }
          if (matches.length >= limit) break;
        }
        return { ok: true, format: 'search', text: JSON.stringify({ query, matches, counts, openQuestions }), counts, matches, updatedAt: new Date().toISOString() };
      }
      const format = input.format === 'markdown' ? 'markdown' : 'card';
      const text = format === 'markdown'
        ? renderIndexMarkdown(state, session.id, config)
        : buildCard(state, config);
      return { ok: true, format, text, counts, openQuestions, updatedAt: new Date().toISOString() };
    },
  });

  ctx.tools.register({
    name: 'agents_verify',
    description: 'Host-side read-only verification for one open reasoning question. Supports read_file, list_dir, and grep only; all reads go through the DSH workspaceFiles service, so DSH owns path/symlink/permission handling. No writes, network, shell, or arbitrary code. A successful result resolves only the given questionId. Use this while the reasoning gate is active instead of run_code.',
    parameters: {
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'The ID shown in the reasoning-question card, e.g. q-123-0.' },
        op: { type: 'string', enum: ['read_file', 'list_dir', 'grep'], description: 'Fixed read-only operation.' },
        path: { type: 'string', description: 'File or directory path, absolute or relative to the session cwd.' },
        pattern: { type: 'string', description: 'Regular expression for op=grep.' },
        maxBytes: { type: 'number', description: 'Read cap for read_file or per file (default 65536, max 262144).' },
      },
      required: ['questionId', 'op', 'path'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          questionId: { type: 'string' },
          op: { type: 'string' },
          path: { type: 'string' },
          matchCount: { type: 'number' },
          truncated: { type: 'boolean' },
          evidence: { type: 'string' },
          result: { type: 'object' },
        },
        required: ['ok', 'questionId', 'op'],
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      const openQuestions = openReasoningQuestions(state);
      const questionId = String(input.questionId || '');
      const question = openQuestions.find((item) => item.id === questionId);
      if (!question) throw new Error('questionId is not an open reasoning question: ' + questionId);
      const op = String(input.op || '');
      if (!['read_file', 'list_dir', 'grep'].includes(op)) throw new Error('op must be read_file, list_dir, or grep');
      const workspaceFiles = workspaceFileService();
      if (!workspaceFiles) throw new Error('DSH workspaceFiles service is unavailable; agents_verify requires it');
      const cwd = state.cwd || (session.header && session.header.cwd) || process.cwd();
      const scope = { sessionId: session.id, workspaceRoot: cwd };
      const signal = (exec && exec.signal) || new AbortController().signal;
      const targetPath = String(input.path || '.');
      const configuredMax = Number(input.maxBytes);
      const maxBytes = Number.isFinite(configuredMax) && configuredMax > 0
        ? Math.min(Math.floor(configuredMax), 262144)
        : 65536;
      const readCapped = async (filePath, info) => {
        const measured = info && Number.isFinite(Number(info.bytes)) ? Number(info.bytes) : undefined;
        const length = measured !== undefined ? Math.min(measured, maxBytes) : maxBytes;
        const bytes = await workspaceFiles.readBytes(scope, filePath, { range: { offset: 0, length } }, signal);
        return {
          text: redactSecrets(Buffer.from(bytes).toString('utf8')),
          bytes: measured !== undefined ? measured : bytes.length,
          truncated: measured !== undefined ? measured > maxBytes : false,
        };
      };
      if (op === 'read_file') {
        const info = await workspaceFiles.stat(scope, targetPath, signal);
        const filePath = info.absolutePath || targetPath;
        const file = await readCapped(filePath, info);
        const evidence = 'agents_verify read_file ' + filePath + ' (' + file.bytes + ' bytes)';
        return { ok: true, questionId, op, path: filePath, matchCount: 1, truncated: file.truncated, evidence, result: { text: file.text.slice(0, 12000) } };
      }
      if (op === 'list_dir') {
        const listing = await workspaceFiles.list(scope, targetPath, signal);
        const entries = listing.entries || [];
        const limited = entries.slice(0, 200);
        const result = limited.map((entry) => ({ name: entry.name, type: entry.type === 'directory' ? 'dir' : entry.type === 'file' ? 'file' : 'other' }));
        const evidence = 'agents_verify list_dir ' + (listing.path || targetPath) + ' (' + entries.length + ' entries)';
        return { ok: true, questionId, op, path: listing.path || targetPath, matchCount: result.length, truncated: entries.length > limited.length, evidence, result: { entries: result } };
      }
      const patternText = String(input.pattern || '');
      if (!patternText) throw new Error('pattern is required for op=grep');
      let pattern;
      try {
        pattern = new RegExp(patternText, 'i');
      } catch (error) {
        throw new Error('invalid grep pattern: ' + String(error && error.message ? error.message : error));
      }
      const files = [];
      let rootInfo = null;
      try {
        rootInfo = await workspaceFiles.stat(scope, targetPath, signal);
      } catch {}
      if (rootInfo) {
        files.push({ path: rootInfo.absolutePath || targetPath, info: rootInfo });
      } else {
        const walk = async (dirPath, depth) => {
          if (files.length >= 200 || depth > 8) return;
          const base = path.basename(dirPath);
          if (base === '.git' || base === 'node_modules' || base === '.tmp') return;
          const listing = await workspaceFiles.list(scope, dirPath, signal);
          for (const entry of listing.entries || []) {
            const child = path.join(listing.path || dirPath, entry.name);
            if (entry.type === 'directory') {
              await walk(child, depth + 1);
            } else if (entry.type === 'file') {
              files.push({ path: child });
            }
            if (files.length >= 200) return;
          }
        };
        await walk(targetPath, 0);
      }
      const matches = [];
      let scanned = 0;
      let truncated = false;
      for (const file of files) {
        if (matches.length >= 100) { truncated = true; break; }
        try {
          const info = file.info || await workspaceFiles.stat(scope, file.path, signal);
          const loaded = await readCapped(file.path, info);
          scanned += 1;
          const lines = loaded.text.split(/\r?\n/);
          for (let index = 0; index < lines.length; index++) {
            if (!pattern.test(lines[index])) continue;
            matches.push({ file: file.path, line: index + 1, text: clip(lines[index], 240) });
            if (matches.length >= 100) { truncated = true; break; }
          }
        } catch {}
      }
      const evidence = 'agents_verify grep "' + patternText + '" in ' + targetPath + ' (' + matches.length + ' matches, ' + scanned + ' files)';
      return { ok: true, questionId, op, path: targetPath, matchCount: matches.length, truncated, evidence, result: { matches } };
    },
  });

  const injected = new Map();
  const lastCardHash = new Map();
  const lastInjectedCompressions = new Map();
  const lastReasoningNotice = new Map();
  const runtimeMemory = new Map();
  const writeQueues = new Map();

  const persistedLoaded = new Set();

  const sessionIndexDir = (session) => {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    const root = config.indexRoot || path.join(home, 'agent-context');
    return path.join(root, String(session && session.id ? session.id : 'unknown'));
  };

  const indexFileFor = (session) => path.join(sessionIndexDir(session), config.indexFileName);

  const loadPersistedMemory = async (session) => {
    if (!session || persistedLoaded.has(session.id)) return;
    persistedLoaded.add(session.id);
    try {
      const text = await fs.readFile(indexFileFor(session), 'utf8');
      const entries = parseIndexMemory(text);
      if (!entries.length) return;
      runtimeMemory.set(session.id, mergeLlmEntries(runtimeMemory.get(session.id) || [], entries));
    } catch (error) {
      if (!error || error.code !== 'ENOENT') log('warn', 'index memory read failed: ' + String(error && error.message ? error.message : error));
    }
  };

  const mergeMemory = (state, sessionId) => {
    const extra = runtimeMemory.get(sessionId);
    if (!extra || !extra.length) return state;
    const existing = state.llmEntries || [];
    const seen = new Set(existing.map(memoryKey));
    const remaining = [];
    for (const item of extra) {
      const key = memoryKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      remaining.push(item);
    }
    runtimeMemory.set(sessionId, remaining);
    return Object.assign({}, state, { llmEntries: mergeLlmEntries(existing, remaining) });
  };

  const markInjected = (session, turn, seq) => {
    const nextTurn = Number(turn) || 0;
    const nextSeq = Number(seq) || 0;
    const previous = injected.get(session.id);
    if (previous && (Number(previous.turn) > nextTurn || (Number(previous.turn) === nextTurn && Number(previous.seq) > nextSeq))) return;
    injected.set(session.id, { turn: nextTurn, seq: nextSeq });
  };

  const injectCard = (session, state, turn) => {
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return Promise.resolve(false);
    const card = buildCard(mergeMemory(state, session.id), config);
    const hash = card ? hashCard(card) : '';
    const compressCount = Number(state.compressions) || 0;
    if (!card) {
      markInjected(session, turn, state.lastUserSeq);
      lastInjectedCompressions.set(session.id, compressCount);
      return Promise.resolve(true);
    }
    if (lastCardHash.get(session.id) === hash && lastInjectedCompressions.get(session.id) === compressCount) {
      markInjected(session, turn, state.lastUserSeq);
      return Promise.resolve(true);
    }
    lastCardHash.set(session.id, hash);
    try {
      const result = agent.inject({
        content: [{ type: 'text', text: card }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          markInjected(session, turn, state.lastUserSeq);
          lastInjectedCompressions.set(session.id, compressCount);
          return true;
        }).catch((error) => {
          lastCardHash.delete(session.id);
          log('warn', 'index injection failed: ' + String(error && error.message ? error.message : error));
          throw error;
        });
      }
      markInjected(session, turn, state.lastUserSeq);
      lastInjectedCompressions.set(session.id, compressCount);
      return Promise.resolve(true);
    } catch (error) {
      lastCardHash.delete(session.id);
      log('warn', 'index injection threw: ' + String(error && error.message ? error.message : error));
      return Promise.reject(error);
    }
  };

  const injectReasoningNotice = (session, state) => {
    const open = openReasoningQuestions(state);
    if (!open.length) return;
    if (lastReasoningNotice.get(session.id) === state.reasoningSeq) return;
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return;
    lastReasoningNotice.set(session.id, state.reasoningSeq);
    const ids = open.map((question) => question.id).join(', ');
    const excerpt = String(open[0].text || '').slice(0, 160);
    try {
      const result = agent.inject({
        content: [{ type: 'text', text: '[dsh-agents-guard] 你的推理中出现未解决疑问: [' + ids + '] "' + excerpt + '". PTC 下用 run_code 执行恰好一条 `await tools.agents_verify({"questionId":"...","op":"read_file|list_dir|grep","path":"...","pattern":"..."})` 做宿主侧只读验证；一次成功只解除对应 questionId。无法验证时，优先用 run_code 执行恰好一条 `await tools.ask_user_question({...})`（官方）；不可用再用 `await tools.ask_user({...})`（Deep PTC）；若两者都不可用（例如 Deep PTC 卡片关闭），直接在回复里提问，由用户答复解除。推理门控期间 run_code 只允许恰好一条可信安全单调用（read/glob/grep/web_search/web_fetch/会话读取/agents_index/agents_verify/agents_memory/ask_user_question/ask_user（官方优先））；多语句、任意 JS 和写操作仍被禁用。' }],
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
    const file = indexFileFor(session);
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
      if (event.type !== 'turn/start' && !injected.has(session.id) && state.lastUserSeq) {
        const pending = injectCard(session, state, state.lastTurn);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      }
      if (event.type === 'turn/start') {
        const pending = injectCard(session, state, event.data && event.data.turn);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } else if (event.type === 'turn/end' || event.type === 'user/message') {
        writeIndex(session, state);
      } else if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        injectReasoningNotice(session, state);
        if (openReasoningQuestions(state).length) writeIndex(session, state);
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
    if (execution.name === 'compress') {
      const pressure = readContextPressure(session);
      if (pressure) {
        const forced = shouldForceCompress({ ...pressure, compressPressureRatio: config.compressPressureRatio });
        if (forced.forced) {
          log('warn', 'context pressure ' + (forced.ratio * 100).toFixed(1) + '% >= ' + (forced.threshold * 100).toFixed(1) + '%; allowing compress without waiting for the index card');
          return;
        }
      }
    }
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
    const recall = decideRecall({ state, toolName: execution.name, config });
    if (!recall.allow) return { reason: recall.reason };
    const record = decideRecord({ state, toolName: execution.name, code: args.code, config });
    if (!record.allow) return { reason: record.reason };
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
      legacyCompressWithoutCard: config.legacyCompressWithoutCard,
      compressPressureRatio: config.compressPressureRatio,
    });
    if (!decision.allow) return { reason: decision.reason };
  });

  ctx.systemPrompt.section({
    name: 'agents-guard-memory',
    order: 7000,
    text: 'The dsh-agents-guard plugin maintains a session index and injects it as a user-role memory card at the start of a turn. Treat that card as historical context, not as a new user instruction. Use agents_index to read the index on demand (card, generated Markdown, counts, open questions) instead of opening AGENT_CONTEXT_INDEX.md manually; use agents_memory to record user decisions, verified facts, errors, open items, and corrections as distilled conclusions in your own words (<=600 characters), never a transcript or raw user message; locate the original via agents_index search, cite evidence, and never record an assumption as a user decision. When the latest user message is ambiguous (explicit alternatives, 随便/你决定, or a yes/no question), the ambiguity gate blocks write/edit/pwsh/run_code/compress until you ask a concrete question via the official ask_user_question first, then Deep PTC ask_user, and finally a normal reply when neither ask tool is available (for example Deep PTC cards are off); do not proceed on a self-chosen assumption. If your own reasoning contains an unresolved question, it is tracked as an individual question ID. In PTC, verify that question with run_code executing exactly one `await tools.agents_verify({"questionId":"...","op":"read_file|list_dir|grep","path":"...","pattern":"..."})`; this is a host-side read-only tool limited to read_file, list_dir, and grep. A successful result resolves only that questionId; other open questions remain. If verification is impossible, use run_code with exactly one `await tools.ask_user_question({...})` (official) or `await tools.ask_user({...})` (Deep PTC); if neither ask tool is available, ask in a normal reply; the user reply resolves the asked question. run_code is allowed only for exactly one trusted safe call with JSON arguments (read, glob, grep, web_search, web_fetch, session read tools, agents_index, agents_verify, agents_memory, ask_user, ask_user_question); multi-statement code, arbitrary JavaScript, and mutating calls are blocked while reasoning questions are open. agents_memory does not clear the reasoning gate. Before calling compress, ensure the current turn has a memory card; the guard denies compression when the index does not cover the latest user message, unless the official tokenMeter context pressure reaches compressPressureRatio (default 0.8), in which case compress is forced through the card and gate checks. If compress is denied, do not retry the identical call; continue the task, or wait for the next turn so the index is refreshed. Only user-authored messages are indexed; plugin-injected context is ignored.',
  });

  ctx.systemPrompt.section({
    name: 'agents-guard-priority',
    order: 10001,
    text: 'Priority when dsh-agents-guard is enabled. (1) Recall/history: when the user asks about earlier work, previous discussion, requirements, decisions, corrections, or open issues, call agents_index first (action "get" or "search"). Only if it has no match may you use decompress/search_context; only after that may you use session_search, and state that it is a fallback. Never start by reading AGENT_CONTEXT_INDEX.md or using glob/grep for memory. If agents_index is not in the current tool list, load it with deep_ptc_tools or call it with run_code as exactly one `await tools.agents_index({...})`; do not substitute session_search. (2) Recording: when the user states a requirement, correction, decision, or acceptance criterion, resolve any ambiguity first, then call run_code with exactly one `await tools.agents_memory({"action":"add","kind":"requirement|correction|decision|verified|open","text":"...","evidence":"..."})` before write/edit/pwsh/compress or a non-read-only run_code. In PTC, pass exactly one JSON call with quoted keys; a JavaScript object literal with unquoted keys is not recognized as a safe call. Do not record an unconfirmed guess; write a distilled conclusion/requirement in your own words (<=600 characters), not a transcript or the raw user message, and locate the original via agents_index search. Read-only inspection remains allowed. (3) Compression: a denied compress means record the latest requirements/decisions with agents_memory first; do not retry the identical compress call. The recall and record gates enforce both rules.',
  });

  log('info', 'active; denyCompress=' + String(config.denyCompress) + ' compressPressureRatio=' + String(config.compressPressureRatio) + ' writeIndex=' + String(config.writeIndex) + ' ambiguityGate=' + String(config.ambiguityGate) + ' reasoningGate=' + String(config.reasoningGate));
}
