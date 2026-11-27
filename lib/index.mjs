import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildCard,
  buildRiskReviewPrompt,
  clip,
  decideRisk,
  decideTask,
  decideContinuity,
  buildContinuity,
  continuityStatus,
  handoffRecordProblem,
  handoffEntryFrom,
  decideEvidence,
  decideImpact,
  decideRecovery,
  decideVerification,
  auditIndex,
  advanceInjectedMark,
  cardMarkCovers,
  decideIndexGate,
  changeRecordProblem,
  checkRecordProblem,
  configSourceChain,
  recoveryRecordProblem,
  evidenceRecordProblem,
  isTaskConfirmation,
  emptyReasoningState,
  parseRiskReview,
  reduceReasoningEvent,
  redactSecrets,
  renderReasoningState,
  runGuardSelfTest,
  simulateGuardScenario,
  memoryKey,
  memoryRecordProblem,
  mergeLlmEntries,
  authorityFor,
  decideCompress,
  pickHandoff,
  GUARD_BUILD,
  decideRecall,
  decideRecord,
  decideReasoning,
  shouldForceCompress,
  emptyState,
  hashCard,
  normalizeConfig,
  effectiveConfig,
  openReasoningQuestions,
  parseIndexMemory,
  reduceEvent,
  renderIndexMarkdown,
  upsertGeneratedBlock,
  mergeTaskState,
} from './core.mjs';

// Settings-page schema; schemastery is declared in package.json. hmr:2026-11-21T01:09
let z = null;
try {
  const mod = await import('@deepseek-ai/schemastery');
  z = mod.default ?? mod;
} catch {}

export const name = 'dsh-agents-guard';
export const inject = ['tools', 'sessionProjections', 'sessions', 'agents', 'systemPrompt'];

const configField = (schema) => (schema && typeof schema.volatile === 'function' ? schema.volatile() : schema);

export const Config = z ? z.object({
  enabled: configField(z.boolean().default(true)),
  developerMode: configField(z.boolean().default(false)),
  workflowEnabled: configField(z.boolean().default(false)),
  continuityEnabled: configField(z.boolean().default(true)),
  reasoningEnabled: configField(z.boolean().default(true)),
  memoryEnabled: configField(z.boolean().default(true)),
  compressPressureRatio: configField(z.number().min(0.05).max(1).default(0.75)),
  writeIndex: configField(z.boolean().default(true)),
  indexFileName: configField(z.string().default('AGENT_CONTEXT_INDEX.md')),
  indexRoot: configField(z.string().default('')),
  maxCardChars: configField(z.number().step(1).min(500).max(20000).default(4200)),
  maxRequirements: configField(z.number().step(1).min(1).max(100).default(12)),
  maxDecisions: configField(z.number().step(1).min(1).max(100).default(6)),
  maxOpenItems: configField(z.number().step(1).min(1).max(100).default(6)),
  maxFailures: configField(z.number().step(1).min(1).max(100).default(6)),
  maxChangedFiles: configField(z.number().step(1).min(1).max(200).default(10)),
  maxLlmEntries: configField(z.number().step(1).min(1).max(200).default(40)),
  memoryTextMax: configField(z.number().step(1).min(100).max(2000).default(600)),
  recentMemoryMax: configField(z.number().step(1).min(3).max(50).default(12)),
  recallGate: configField(z.boolean().default(true)),
  recordGate: configField(z.boolean().default(true)),
  reasoningGate: configField(z.boolean().default(true)),
  reasoningRiskGate: configField(z.boolean().default(true)),
  semanticReview: configField(z.boolean().default(true)),
  riskReviewFailure: configField(z.string().default('allow')),
  writeReasoningState: configField(z.boolean().default(true)),
  reasoningStateFile: configField(z.string().default('AGENT_REASONING_STATE.json')),
  loopThreshold: configField(z.number().step(1).min(2).max(10).default(2)),
  toolRepeatThreshold: configField(z.number().step(1).min(2).max(10).default(3)),
  reasoningTools: configField(z.array(z.string()).default(['write', 'edit', 'pwsh', 'compress', 'run_code'])),
  reasoningVerifyTools: configField(z.array(z.string()).default(['read', 'glob', 'grep', 'web_search', 'web_fetch', 'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace'])),
  maxReasoningQuestions: configField(z.number().step(1).min(1).max(100).default(8)),
  taskGate: configField(z.boolean().default(false)),
  taskGateTools: configField(z.array(z.string()).default(['write', 'edit', 'pwsh', 'run_code', 'plugin_manager'])),
  evidenceGate: configField(z.boolean().default(false)),
  maxEvidence: configField(z.number().step(1).min(1).max(100).default(20)),
  impactGate: configField(z.boolean().default(false)),
  impactGateTools: configField(z.array(z.string()).default(['write', 'edit', 'pwsh', 'run_code', 'plugin_manager'])),
  verificationGate: configField(z.boolean().default(false)),
  recoveryGate: configField(z.boolean().default(false)),
  indexGate: configField(z.boolean().default(false)),
  continuityGate: configField(z.boolean().default(true)),
  continuityMaxChars: configField(z.number().step(1).min(300).max(4000).default(1600)),
  continuityFile: configField(z.string().default('AGENT_CONTINUITY.md')),
  writeContinuity: configField(z.boolean().default(true)),
}) : undefined;

function taskListFrom(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 20) : [];
}

function configValues(input) {
  if (!input || typeof input !== 'object') return input;
  const values = {};
  for (const [key, value] of Object.entries(input)) {
    values[key] = value && typeof value.get === 'function' ? value.get() : value;
  }
  return values;
}

export async function apply(ctx, rawConfig) {
  const config = effectiveConfig(configValues(rawConfig), { explicit: null });
  if (!config.enabled) return;

  const log = (level, message) => {
    try {
      const logger = ctx.logger;
      if (logger && typeof logger[level] === 'function') logger[level]('[dsh-agents-guard] ' + message);
    } catch {}
  };
  // Authorization must reflect a task mutation immediately, even when a tool
  // is called inside the same run_code program before the projection catches up.
  const liveTasks = new Map();
  const liveHandoffs = new Map();
  // Continuity must survive a projection lag and a host reload: keep a small
  // per-session sidecar next to the capsule and merge live, projected and persisted values.
  const persistedHandoffs = new Map();
  const continuityStateFileFor = (session) => {
    const cwd = session && session.header && session.header.cwd;
    if (!cwd) return null;
    return path.join(String(cwd), 'AGENT_CONTINUITY.json');
  };
  const readPersistedContinuity = (session) => {
    try {
      const file = continuityStateFileFor(session);
      if (!file) return undefined;
      let stat;
      try { stat = fsSync.statSync(file); } catch { persistedHandoffs.delete(session.id); return undefined; }
      const cached = persistedHandoffs.get(session.id);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.cleared ? null : cached.continuity;
      let parsed = null;
      try { parsed = JSON.parse(fsSync.readFileSync(file, 'utf8')); } catch { return undefined; }
      if (!parsed || parsed.version !== 1) return undefined;
      const record = { mtimeMs: stat.mtimeMs, size: stat.size, cleared: parsed.cleared === true, continuity: parsed.continuity || null };
      persistedHandoffs.set(session.id, record);
      return record.cleared ? null : record.continuity;
    } catch { return undefined; }
  };
  const writePersistedContinuity = (session, continuity, cleared) => {
    try {
      const file = continuityStateFileFor(session);
      if (!file) return;
      fsSync.mkdirSync(path.dirname(file), { recursive: true });
      const payload = {
        version: 1,
        sessionId: session.id,
        savedAt: new Date().toISOString(),
        cleared: cleared === true,
        continuity: cleared === true ? null : continuity || null,
      };
      fsSync.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
      const stat = fsSync.statSync(file);
      persistedHandoffs.set(session.id, { mtimeMs: stat.mtimeMs, size: stat.size, cleared: cleared === true, continuity: continuity || null });
    } catch (error) {
      log('warn', 'continuity state write failed: ' + String(error && error.message ? error.message : error));
    }
  };
  const liveTaskOf = (session, state) => liveTasks.get(session.id) || (state && state.task) || null;
  const setLiveTask = (session, task) => {
    if (!session) return;
    if (task) liveTasks.set(session.id, task);
    else liveTasks.delete(session.id);
  };
  const stateWithLiveTask = (session, state) => {
    const task = liveTasks.get(session.id);
    return task ? Object.assign({}, state, { task }) : state;
  };
  const syncLiveTask = (session, projected) => {
    // liveTasks is a cache; the projection is authoritative (see mergeTaskState).
    setLiveTask(session, mergeTaskState(liveTasks.get(session.id) || null, projected));
  };
  const liveContinuityOf = (session, state) => {
    const live = liveHandoffs.has(session.id) ? liveHandoffs.get(session.id) : null;
    const projected = (state && state.continuity) || null;
    const persisted = readPersistedContinuity(session);
    // An explicit clear wins until a new save arrives; otherwise valid entries
    // always beat incomplete ones and the newest covered user message wins.
    if (persisted === null && !live) return null;
    return pickHandoff([live, projected, persisted === undefined ? null : persisted]);
  };
  const continuitySourceOf = (session, state) => {
    const live = liveHandoffs.has(session.id) ? liveHandoffs.get(session.id) : null;
    const projected = (state && state.continuity) || null;
    const persisted = readPersistedContinuity(session);
    if (persisted === null && !live) return 'cleared';
    const resolved = pickHandoff([live, projected, persisted === undefined ? null : persisted]);
    if (!resolved) return 'none';
    // Report the layer that actually supplied the resolved value, so a live status
    // can name the source instead of guessing from whichever layer is non-empty.
    const same = (item) => item && Number(item.savedSeq || 0) === Number(resolved.savedSeq || 0) &&
      String(item.next || '') === String(resolved.next || '');
    if (same(live)) return 'live';
    if (same(persisted)) return 'persisted';
    if (same(projected)) return 'projected';
    if (persisted === null) return 'cleared';
    return 'none';
  };
  const setLiveContinuity = (session, continuity) => {
    if (!session) return;
    const value = continuity || null;
    if (value) liveHandoffs.set(session.id, value);
    else liveHandoffs.delete(session.id);
  };
  const clearLiveContinuity = (session) => {
    if (!session) return;
    liveHandoffs.delete(session.id);
    writePersistedContinuity(session, null, true);
  };
  const stateWithLiveContinuity = (session, state) => {
    const resolved = liveContinuityOf(session, state);
    const projected = state && state.continuity;
    let continuity = resolved;
    if (resolved && projected && Number(resolved.savedSeq || 0) === Number(projected.savedSeq || 0)) {
      continuity = Object.assign({}, resolved, {
        compressedSeq: Math.max(Number(resolved.compressedSeq) || 0, Number(projected.compressedSeq) || 0),
        updatedSeq: Math.max(Number(resolved.updatedSeq) || 0, Number(projected.updatedSeq) || 0),
      });
    }
    return Object.assign({}, state, { continuity });
  };

  const entryId = (() => {
    try {
      const entry = ctx.fiber && ctx.fiber.entry;
      return (entry && entry.options && entry.options.id) || 'agents-guard';
    } catch { return 'agents-guard'; }
  })();
  const readSettingsValues = () => {
    try {
      const service = typeof ctx.get === 'function' ? ctx.get('settings') : null;
      if (!service || typeof service.describe !== 'function') return null;
      const rows = service.describe();
      if (!Array.isArray(rows)) return null;
      const row = rows.find((item) => item && (item.ns === entryId || item.ns === 'agents-guard' || String(item.ns).includes('dsh-agents-guard')));
      if (!row) return null;
      const value = row.value && typeof row.value === 'object' ? row.value : {};
      return { value, user: row.user && typeof row.user === 'object' ? row.user : {} };
    } catch (error) {
      log('warn', 'live settings read failed: ' + String(error && error.message ? error.message : error));
      return null;
    }
  };
  const readEntryConfig = () => {
    try {
      const entry = ctx.fiber && ctx.fiber.entry;
      const value = entry && entry.options ? entry.options.config : null;
      if (!value || typeof value !== 'object') return null;
      const values = configValues(value);
      return Object.keys(values).length ? values : null;
    } catch { return null; }
  };
  let configSource = 'mount';
  let configDumped = false;
  const dumpConfig = (from, entryFound, liveFound) => {
    if (configDumped) return;
    const target = process.env.DSH_GUARD_CONFIG_DUMP;
    if (!target) return;
    configDumped = true;
    try {
      fsSync.writeFileSync(target, JSON.stringify({
        build: GUARD_BUILD,
        from,
        entryFound,
        liveFound,
        gates: {
          workflowEnabled: Boolean(config.workflowEnabled),
          taskGate: Boolean(config.taskGate),
          evidenceGate: Boolean(config.evidenceGate),
          impactGate: Boolean(config.impactGate),
          verificationGate: Boolean(config.verificationGate),
          recoveryGate: Boolean(config.recoveryGate),
          indexGate: Boolean(config.indexGate),
          continuityGate: Boolean(config.continuityGate),
        },
      }, null, 2), 'utf8');
    } catch {}
  };
  const syncConfig = () => {
    const live = readSettingsValues();
    // Entry config is what the settings page actually writes, and the loader
    // keeps it live on the fiber; prefer it over the object captured at mount.
    const entry = readEntryConfig();
    const merged = configSourceChain({ entry, live, raw: configValues(rawConfig) });
    configSource = merged.from;
    Object.assign(config, effectiveConfig(merged.values, { explicit: merged.explicit }));
    dumpConfig(merged.from, Boolean(entry), Boolean(live));
  };
  const refreshConfig = () => syncConfig();
  for (const eventName of ['loader/volatile-update', 'app-boot/config-reload', 'settings/document-updated', 'settings/changed', 'config/changed']) {
    try { ctx.on(eventName, refreshConfig); } catch {}
  }

  // Log each distinct pressure failure once. A silent null here disables both
  // the 80% reminder and the emergency compress exemption, and that used to be
  // indistinguishable from "pressure is simply below the threshold".
  const pressureLogged = new Set();
  const logPressureOnce = (message) => {
    if (pressureLogged.has(message)) return;
    pressureLogged.add(message);
    log('warn', message);
  };
  const readContextPressure = (session) => {
    try {
      if (typeof ctx.get !== 'function') { logPressureOnce('context pressure unavailable: ctx.get is missing; the 80% compress exemption cannot fire'); return null; }
      const meter = ctx.get('tokenMeter');
      if (!meter || typeof meter.contextPressure !== 'function') { logPressureOnce('context pressure unavailable: tokenMeter.contextPressure is missing; the 80% compress exemption cannot fire'); return null; }
      const pressure = meter.contextPressure(session);
      if (!pressure) { logPressureOnce('context pressure unavailable: tokenMeter returned no pressure for this session'); return null; }
      const pressureTokens = Number(pressure.pressureTokens);
      const contextWindow = Number(pressure.contextWindow);
      if (!Number.isFinite(pressureTokens) || !Number.isFinite(contextWindow) || pressureTokens <= 0 || contextWindow <= 0) { logPressureOnce('context pressure unavailable: tokenMeter returned non-positive contentWindow/pressureTokens'); return null; }
      return { pressureTokens, contextWindow };
    } catch (error) {
      log('warn', 'context pressure read failed: ' + String(error && error.message ? error.message : error));
      return null;
    }
  };

  const hasService = (name, method) => {
    try {
      if (typeof ctx.get !== 'function') return false;
      const service = ctx.get(name);
      return Boolean(service && (!method || typeof service[method] === 'function'));
    } catch { return false; }
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
      return reduceEvent(state, event, config);
    },
    stateVersion: 5,
  });

  const reasoningHandle = await ctx.sessionProjections.register({
    key: 'agentsGuardReasoning',
    stateSchema,
    init(header) {
      return emptyReasoningState(header);
    },
    apply(state, event) {
      return reduceReasoningEvent(state, event, config);
    },
    stateVersion: 4,
  });

  const MEMORY_KINDS = ['decision', 'verified', 'error', 'open', 'requirement', 'correction', 'assumption'];
  ctx.tools.register({
    name: 'agents_memory',
    description: 'Record a distilled conclusion, requirement, correction, decision, verified fact, error, or open item in the session index so it survives compression. First-choice recording tool: when the user states a requirement, correction, decision, or acceptance criterion, call this before any write operation or compression. Write your own concise conclusion within the configured limit (default 600 characters), never a transcript or a copy of the raw user message; locate the original through agents_index search (userLog). Cite evidence for decisions and verified facts; never record an assumption as a user decision.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add'], description: 'Only add is supported.' },
        kind: { type: 'string', enum: MEMORY_KINDS, description: 'Entry kind.' },
        text: { type: 'string', description: 'Distilled conclusion or requirement in your own words, within the configured limit (default 600 characters); never paste the raw user message.' },
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
          persisted: { type: 'boolean' },
          stored: { type: 'string' },
          file: { type: 'string' },
          error: { type: 'string' },
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
      const memoryLimit = config.memoryTextMax || 600;
      const problem = memoryRecordProblem(input.text, memoryLimit);
      if (problem) throw new Error(problem);
      const text = clip(redactSecrets(input.text), memoryLimit);
      if (!text) throw new Error('text is required');
      const source = 'model';
      const evidence = clip(redactSecrets(input.evidence), 260);
      const authority = authorityFor(kind);
      const id = 'mem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const persistence = { persisted: false, stored: "session", file: null, error: null };
      if (exec && exec.agent) {
        try {
          const session = ctx.sessions.get(exec.agent.id);
          if (session) {
            const list = runtimeMemory.get(session.id) || [];
            list.push({ id, seq: Date.now(), kind, text, source, evidence, authority, runtime: true });
            while (list.length > config.maxLlmEntries) list.shift();
            runtimeMemory.set(session.id, list);
            persistence.stored = "memory";
            if (config.writeIndex) {
              // Wait for this write (bounded) instead of reporting success from a
              // fire-and-forget enqueue: ok must mean the entry reached the disk.
              const pending = writeIndex(session, handle.stateOf(session));
              const settled = await Promise.race([
                pending,
                new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 2000)),
              ]);
              if (settled && settled.timedOut) {
                persistence.error = "index write did not settle within 2000ms";
                persistence.pending = true;
              } else if (settled && settled.error) {
                persistence.error = settled.error;
              } else {
                persistence.persisted = true;
                persistence.file = (settled && settled.file) || indexFileFor(session);
                persistence.stored = "disk";
              }
            }
          }
        } catch (error) {
          persistence.error = String(error && error.message ? error.message : error);
          log('warn', 'memory write failed: ' + persistence.error);
        }
      }
      let note;
      if (!config.writeIndex) {
        note = "Recorded in this session only: writeIndex is off, so AGENT_CONTEXT_INDEX.md is not updated and the entry will not survive a restart. Turn writeIndex on in the settings to persist it.";
      } else if (persistence.persisted) {
        note = "Written to " + persistence.file + "; it is included in the next memory card and survives a restart.";
      } else {
        note = "Kept in this session only: the index write failed" + (persistence.error ? " (" + persistence.error + ")" : "") + ". Retry agents_memory or check the indexRoot path; the entry is not durable yet.";
      }
      return {
        ok: config.writeIndex ? persistence.persisted : true,
        kind,
        text,
        source,
        evidence,
        authority,
        persisted: persistence.persisted,
        stored: persistence.stored,
        file: persistence.file,
        error: persistence.error,
        note,
      };
    },
  });

  ctx.tools.register({
    name: 'agents_index',
    description: 'First-choice recall tool. Read the dsh-agents-guard session index as structured data instead of opening AGENT_CONTEXT_INDEX.md manually, and call this before session_search, glob, or grep when the task involves earlier work, prior discussion, requirements, decisions, corrections, or open issues. Returns the compact memory card, the generated Markdown block, counts, and the current open reasoning questions. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'search', 'audit'], description: 'get returns the index; search filters entries by query; audit checks index completeness for indexGate.' },
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
          audit: { type: 'object' },
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
        task: state.task ? 1 : 0,
        evidence: (state.evidence || []).length,
        changes: (state.changes || []).length,
        checks: (state.checks || []).length,
        recovery: (state.recovery || []).length,
        indexAudit: state.indexAudit ? state.indexAudit.status : null,
        lastUserSeq: state.lastUserSeq,
        lastTurn: state.lastTurn,
      };
      if (input.action === 'audit') {
        const audit = auditIndex(counts);
        return { ok: true, format: 'audit', text: JSON.stringify({ status: audit.status, counts, missing: audit.missing, critical: audit.critical, advisory: audit.advisory, note: audit.note }), counts, audit: Object.assign({ counts }, audit), updatedAt: new Date().toISOString() };
      }
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
    description: 'Host-side read-only verification for one or more open reasoning questions. Supports read_file, list_dir, and grep only; all reads go through the DSH workspaceFiles service, so DSH owns path/symlink/permission handling. No writes, network, shell, or arbitrary code. Pass questionId or questionIds; a successful result resolves every listed ID and reports unknown IDs in missingIds. Use this while the reasoning gate is active instead of run_code.',
    parameters: {
      type: 'object',
      properties: {
        questionId: { type: 'string', description: 'One question ID shown in the reasoning-question card, e.g. q-123-0.' },
        questionIds: { type: 'array', items: { type: 'string' }, description: 'Multiple question IDs to resolve in one call. Use this when the user answers a question list in one reply.' },
        op: { type: 'string', enum: ['read_file', 'list_dir', 'grep'], description: 'Fixed read-only operation.' },
        path: { type: 'string', description: 'File or directory path, absolute or relative to the session cwd.' },
        pattern: { type: 'string', description: 'Regular expression for op=grep.' },
        maxBytes: { type: 'number', description: 'Read cap for read_file or per file (default 65536, max 262144).' },
      },
      required: ['op', 'path'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          questionId: { type: 'string' },
          questionIds: { type: 'array', items: { type: 'string' } },
          resolvedIds: { type: 'array', items: { type: 'string' } },
          missingIds: { type: 'array', items: { type: 'string' } },
          op: { type: 'string' },
          path: { type: 'string' },
          matchCount: { type: 'number' },
          truncated: { type: 'boolean' },
          evidence: { type: 'string' },
          result: { type: 'object' },
        },
        required: ['ok', 'op', 'questionIds', 'resolvedIds'],
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
      const requested = [];
      if (typeof input.questionId === 'string' && input.questionId.trim()) requested.push(input.questionId.trim());
      if (Array.isArray(input.questionIds)) {
        for (const item of input.questionIds) {
          if (typeof item === 'string' && item.trim()) requested.push(item.trim());
        }
      }
      const requestedIds = Array.from(new Set(requested));
      if (!requestedIds.length) throw new Error('questionId or questionIds is required');
      const openIds = new Set(openQuestions.map((item) => item.id));
      const resolvedIds = requestedIds.filter((id) => openIds.has(id));
      const missingIds = requestedIds.filter((id) => !openIds.has(id));
      if (!resolvedIds.length) throw new Error('none of the requested IDs are open reasoning questions: ' + requestedIds.join(', '));
      const questionId = resolvedIds[0];
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
        const loaded = await workspaceFiles.readBytes(scope, filePath, { range: { offset: 0, length } }, signal);
        const data = loaded && loaded.data !== undefined ? loaded.data : loaded;
        const total = loaded && Number.isFinite(Number(loaded.bytes)) ? Number(loaded.bytes) : measured;
        return {
          text: redactSecrets(Buffer.from(data).toString('utf8')),
          bytes: total !== undefined ? total : data.length,
          truncated: total !== undefined ? total > maxBytes : false,
        };
      };
      if (op === 'read_file') {
        const info = await workspaceFiles.stat(scope, targetPath, signal);
        const filePath = info.absolutePath || targetPath;
        const file = await readCapped(filePath, info);
        const evidence = 'agents_verify read_file ' + filePath + ' (' + file.bytes + ' bytes)';
        return { ok: true, questionId, questionIds: resolvedIds, resolvedIds, missingIds, op, path: filePath, matchCount: 1, truncated: file.truncated, evidence, result: { text: file.text.slice(0, 12000) } };
      }
      if (op === 'list_dir') {
        const listing = await workspaceFiles.list(scope, targetPath, signal);
        const entries = listing.entries || [];
        const limited = entries.slice(0, 200);
        const result = limited.map((entry) => ({ name: entry.name, type: entry.type === 'directory' ? 'dir' : entry.type === 'file' ? 'file' : 'other' }));
        const evidence = 'agents_verify list_dir ' + (listing.path || targetPath) + ' (' + entries.length + ' entries)';
        return { ok: true, questionId, questionIds: resolvedIds, resolvedIds, missingIds, op, path: listing.path || targetPath, matchCount: result.length, truncated: entries.length > limited.length, evidence, result: { entries: result } };
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
      return { ok: true, questionId, questionIds: resolvedIds, resolvedIds, missingIds, op, path: targetPath, matchCount: matches.length, truncated, evidence, result: { matches } };
    },
  });

  ctx.tools.register({
    name: 'agents_task',
    description: 'Task/authorization state for the taskGate. start records a model-proposed goal, scope, and exclusions; it is not user approval. status is read-only. confirm succeeds only when the latest user message is a confirmation of the pending proposal; close closes the task. The host owns source/confirmed sequence numbers; the model cannot claim user-confirmed authorization.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'status', 'close', 'confirm'] },
        goal: { type: 'string', description: 'Concrete task goal for start.' },
        scope: { type: 'array', items: { type: 'string' }, description: 'Allowed path prefixes for start; empty means no path restriction.' },
        exclusions: { type: 'array', items: { type: 'string' }, description: 'Forbidden path prefixes for start.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'Optional ordered step plan; each completed step should be followed by agents_handoff save and can be compressed at the boundary.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          task: { type: 'object' },
          authorization: { type: 'object' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || '');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      const task = liveTaskOf(session, state);
      if (action === 'start') {
        const goal = String(input.goal || '').trim();
        if (!goal) throw new Error('goal is required for action=start');
        const proposed = { id: 'task-' + (Number(state.lastUserSeq) || 0) + '-' + Date.now(), goal, scope: taskListFrom(input.scope), exclusions: taskListFrom(input.exclusions), steps: taskListFrom(input.steps), status: 'proposed', sourceSeq: state.lastUserSeq, confirmedSeq: 0, updatedSeq: Number(state.lastUserSeq) || 0 };
        setLiveTask(session, proposed);
        return { ok: true, action, task: proposed };
      }
      if (action === 'status') {
        const status = { ok: true, action };
        if (task) {
          const taskId = task.id || ('task-' + String(Number(task.sourceSeq) || 0));
          status.task = Object.assign({}, task, { id: taskId });
          status.authorization = { taskId, status: task.status, scope: task.scope || [], denied: task.exclusions || [], steps: task.steps || [], sourceSeq: Number(task.sourceSeq) || 0, confirmedSeq: Number(task.confirmedSeq) || 0 };
        }
        return status;
      }
      if (action === 'close') {
        if (!task) throw new Error('no task to close');
        const closed = Object.assign({}, task, { id: task.id || ('task-' + String(Number(state.lastUserSeq) || 0)), status: 'closed', updatedSeq: Number(state.lastUserSeq) || 0 });
        setLiveTask(session, closed);
        return { ok: true, action, task: closed };
      }
      if (action === 'confirm') {
        if (!task) throw new Error('no task to confirm');
        if (task.status === 'active') return { ok: true, action, task };
        if (task.status !== 'proposed') throw new Error('no proposed task to confirm');
        if (!isTaskConfirmation(state.lastUserText)) throw new Error('the latest user message is not a task confirmation; ask the user to confirm the proposed scope');
        const active = Object.assign({}, task, { id: task.id || ('task-' + String(Number(state.lastUserSeq) || 0)), status: 'active', confirmedSeq: state.lastUserSeq, updatedSeq: Number(state.lastUserSeq) || 0 });
        setLiveTask(session, active);
        return { ok: true, action, task: active };
      }
      throw new Error('action must be start, status, close, or confirm');
    },
  });

  ctx.tools.register({
    name: 'agents_handoff',
    description: 'Context-continuity handoff. Use this when a long task needs to survive compression: save a distilled step/next/preserve/discard/risks capsule; status and render are read-only; clear removes it. The host also projects task/authorization/change/invariants/checks/recovery/open questions, so a missing model handoff does not lose recorded state. Do not paste raw transcripts. At each completed step, save the next step before compressing; the 80% context threshold is only the fallback.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['save', 'status', 'render', 'clear'] },
        step: { type: 'string', description: 'Completed step label; max 120 characters.' },
        next: { type: 'string', description: 'What resumes after compression; required for save; max 500 characters.' },
        preserve: { type: 'array', items: { type: 'string' }, description: 'Key facts that must survive; max 12 entries.' },
        discard: { type: 'array', items: { type: 'string' }, description: 'Temporary logs/duplicate outputs/failed-attempt details safe to drop; max 12 entries.' },
        risks: { type: 'array', items: { type: 'string' }, description: 'Risks or constraints that must not be forgotten; max 8 entries.' },
        note: { type: 'string', description: 'Optional caveat; max 300 characters.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          status: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
          continuity: { type: 'object' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || '');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      const current = liveContinuityOf(session, state);
      const effective = Object.assign({}, state, { continuity: current });
      if (action === 'status') {
        const capsule = buildContinuity(effective, config);
        const projected = state && state.continuity;
        const response = {
          ok: true,
          action,
          status: capsule.status,
          missing: capsule.missing,
          build: GUARD_BUILD,
          source: continuitySourceOf(session, state),
          projectedStatus: projected ? String(projected.status || 'ready') : 'none',
          lastUserSeq: Number(state.lastUserSeq) || 0,
        };
        if (current) {
          response.savedSeq = Number(current.savedSeq) || 0;
          response.coveredUserSeq = Number(current.lastUserSeq) || 0;
          response.continuity = current;
        }
        return response;
      }
      if (action === 'render') {
        const capsule = buildContinuity(effective, config);
        return { ok: true, action, status: capsule.status, missing: capsule.missing, text: capsule.text };
      }
      if (action === 'clear') {
        clearLiveContinuity(session);
        writeContinuity(session, Object.assign({}, effective, { continuity: null }));
        return { ok: true, action, build: GUARD_BUILD };
      }
      if (action !== 'save') throw new Error('action must be save, status, render, or clear');
      const problem = handoffRecordProblem(input, config.continuityMaxChars);
      if (problem) throw new Error('agents_handoff: ' + problem);
      const entry = handoffEntryFrom(input, Number(state.lastUserSeq) || 0, effective);
      setLiveContinuity(session, entry);
      writePersistedContinuity(session, entry, false);
      writeContinuity(session, Object.assign({}, effective, { continuity: entry }));
      return {
        ok: true,
        action,
        build: GUARD_BUILD,
        status: 'ready',
        savedSeq: entry.savedSeq,
        coveredUserSeq: entry.lastUserSeq,
        continuity: entry,
      };
    },
  });

  ctx.tools.register({
    name: 'agents_evidence',
    description: 'Structured evidence ledger. add records a claim with source, mechanism, conditions, result, positive control, and note; the host stores it only after a successful result and assigns the stable ID. The model may mark observed or contradicted, never verified. list/get are read-only. evidenceGate (default false) requires a usable evidence reference for verified/decision agents_memory entries.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'get'] },
        id: { type: 'string', description: 'Evidence ID for get.' },
        claim: { type: 'string', description: 'What is claimed; at most 500 characters.' },
        source: { type: 'string', enum: ['file', 'command', 'message', 'observation'] },
        mechanism: { type: 'string', description: 'How it was checked, e.g. workspaceFiles read, command, log line.' },
        conditions: { type: 'string', description: 'Conditions under which the observation holds.' },
        result: { type: 'string', description: 'Observed result; at most 500 characters.' },
        status: { type: 'string', enum: ['observed', 'contradicted'] },
        positiveControl: { type: 'string', description: 'Optional positive control that proves the check can detect the event.' },
        note: { type: 'string', description: 'Caveats or limits; at most 500 characters.' },
        limit: { type: 'number', description: 'list cap, default 20, max 50.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          evidence: { type: 'object' },
          items: { type: 'array', items: { type: 'object' } },
          count: { type: 'number' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || '');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      if (action === 'add') {
        const problem = evidenceRecordProblem(input);
        if (problem) throw new Error('agents_evidence: ' + problem);
        return { ok: true, action, evidence: { claim: input.claim, source: input.source, mechanism: input.mechanism, conditions: input.conditions || '', result: input.result, status: input.status || 'observed', positiveControl: input.positiveControl || '', note: input.note || '' } };
      }
      if (action === 'list') {
        const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
        const items = (state.evidence || []).slice(-limit);
        return { ok: true, action, items, count: items.length };
      }
      if (action === 'get') {
        const id = String(input.id || '').trim();
        const item = (state.evidence || []).find((entry) => entry.id === id);
        if (!item) throw new Error('evidence not found: ' + id);
        return { ok: true, action, evidence: item };
      }
      throw new Error('action must be add, list, or get');
    },
  });

  ctx.tools.register({
    name: 'agents_change',
    description: 'Structured change plan. action=plan records target, direct/indirect impact, explicit invariants, and a verification plan before a mutation; the host assigns the ID only after success. action=status lists recorded changes; action=apply marks a planned change applied; action=verify requires at least one recorded passing check (verificationGate enforces this). impactGate (default false) requires a planned change with invariants before protected mutations.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['plan', 'status', 'apply', 'verify'] },
        changeId: { type: 'string', description: 'Change ID for apply/verify.' },
        target: { type: 'string', description: 'File, object, or surface this change touches; max 260 characters.' },
        direct: { type: 'array', items: { type: 'string' }, description: 'Directly affected objects.' },
        indirect: { type: 'array', items: { type: 'string' }, description: 'Shared components, callers, caches, or downstream consumers.' },
        invariants: { type: 'array', items: { type: 'string' }, description: 'What must not change; at least one is required.' },
        verification: { type: 'array', items: { type: 'string' }, description: 'How the target and the regressions will be checked.' },
        note: { type: 'string', description: 'Constraints or scope notes; max 500 characters.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          change: { type: 'object' },
          items: { type: 'array', items: { type: 'object' } },
          count: { type: 'number' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || 'status');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      if (action === 'plan') {
        const problem = changeRecordProblem(input);
        if (problem) throw new Error('agents_change: ' + problem);
        return { ok: true, action, change: { target: clip(input.target, 260), direct: taskListFrom(input.direct), indirect: taskListFrom(input.indirect), invariants: taskListFrom(input.invariants), verification: taskListFrom(input.verification), note: clip(input.note, 500) } };
      }
      if (action === 'status') {
        const items = (state.changes || []).slice(-20);
        return { ok: true, action, items, count: items.length };
      }
      const changeId = String(input.changeId || '').trim();
      if (!changeId) throw new Error('changeId is required for ' + action);
      const change = (state.changes || []).find((item) => item.id === changeId);
      if (!change) throw new Error('change not found: ' + changeId);
      if (action === 'verify') {
        const passed = (state.checks || []).some((item) => item.changeId === changeId && item.status === 'pass');
        if (!passed) throw new Error('agents_change: no passing check is recorded for ' + changeId + '; record the target check and the regression check with agents_check first');
      }
      return { ok: true, action, change: Object.assign({}, change, { status: action === 'apply' ? 'applied' : 'verified' }) };
    },
  });

  ctx.tools.register({
    name: 'agents_check',
    description: 'Verification ledger. action=add attaches an assertion, command, expected/actual result, and evidence reference to a change; action=record updates a check to pass/fail/pending after a real observation; action=status lists checks. A check is model-stated evidence, not a host proof; verificationGate (default false) requires a pass before agents_change action=verify. The host projects exactly one safe run_code call: add a check in its own run_code call and read status separately; add+status in one program is not projected.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'status', 'record'] },
        checkId: { type: 'string', description: 'Check ID for record.' },
        changeId: { type: 'string', description: 'Owning change ID.' },
        assertion: { type: 'string', description: 'What is checked; max 500 characters.' },
        command: { type: 'string', description: 'Reproducible command or read path.' },
        expected: { type: 'string', description: 'Expected result; max 300 characters.' },
        actual: { type: 'string', description: 'Observed result; max 300 characters.' },
        status: { type: 'string', enum: ['pass', 'fail', 'pending'] },
        evidence: { type: 'string', description: 'Evidence ID or short provenance; max 300 characters.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          check: { type: 'object' },
          items: { type: 'array', items: { type: 'object' } },
          count: { type: 'number' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || 'status');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      if (action === 'add') {
        const problem = checkRecordProblem(input);
        if (problem) throw new Error('agents_check: ' + problem);
        const change = (state.changes || []).find((item) => item.id === String(input.changeId));
        if (!change) throw new Error('agents_check: change not found: ' + input.changeId);
        return { ok: true, action, check: { changeId: change.id, assertion: clip(input.assertion, 500), command: clip(input.command, 500), expected: clip(input.expected, 300), actual: clip(input.actual, 300), status: 'pending', evidence: clip(input.evidence, 300) } };
      }
      if (action === 'status') {
        const items = (state.checks || []).slice(-30);
        return { ok: true, action, items, count: items.length };
      }
      const checkId = String(input.checkId || '').trim();
      if (!checkId) throw new Error('checkId is required for record');
      const check = (state.checks || []).find((item) => item.id === checkId);
      if (!check) throw new Error('check not found: ' + checkId);
      const status = ['pass', 'fail', 'pending'].includes(String(input.status)) ? String(input.status) : 'pending';
      return { ok: true, action, check: Object.assign({}, check, { status, actual: clip(input.actual, 300) }) };
    },
  });

  ctx.tools.register({
    name: 'agents_recovery',
    description: 'Recovery ledger. action=baseline records the exact restore point (copy, commit, exported config) before a high-impact mutation; action=rollback records that the baseline was used; action=verify records a verified restore; action=status lists entries. recoveryGate (default false) requires a baseline before high-impact writes.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['baseline', 'status', 'rollback', 'verify'] },
        recoveryId: { type: 'string', description: 'Recovery ID for rollback/verify.' },
        changeId: { type: 'string', description: 'Owning change ID; required for baseline and must exist.' },
        baseline: { type: 'string', description: 'Exact saved copy, commit, or restore point; required for baseline.' },
        rollback: { type: 'string', description: 'How to restore; max 500 characters.' },
        note: { type: 'string', description: 'Scope or caveats; max 300 characters.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          recovery: { type: 'object' },
          items: { type: 'array', items: { type: 'object' } },
          count: { type: 'number' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || 'status');
      const agent = exec && exec.agent;
      const session = agent ? ctx.sessions.get(agent.id) : null;
      if (!session) throw new Error('no active session');
      const state = handle.stateOf(session);
      if (action === 'baseline') {
        const problem = recoveryRecordProblem(input);
        if (problem) throw new Error('agents_recovery: ' + problem);
        const changeId = String(input.changeId || '').trim();
        const change = (state.changes || []).find((item) => item.id === changeId);
        if (!change) throw new Error('agents_recovery: change not found: ' + changeId + '; run agents_change action=plan first and pass its id');
        return { ok: true, action, recovery: { changeId, baseline: clip(input.baseline, 500), rollback: clip(input.rollback, 500), status: 'baseline', note: clip(input.note, 300) } };
      }
      if (action === 'status') {
        const items = (state.recovery || []).slice(-20);
        return { ok: true, action, items, count: items.length };
      }
      const recoveryId = String(input.recoveryId || '').trim();
      if (!recoveryId) throw new Error('recoveryId is required for ' + action);
      const item = (state.recovery || []).find((entry) => entry.id === recoveryId);
      if (!item) throw new Error('recovery not found: ' + recoveryId);
      return { ok: true, action, recovery: Object.assign({}, item, { status: action === 'rollback' ? 'rolled-back' : 'verified' }) };
    },
  });
  ctx.tools.register({
    name: 'agents_guard_dev',
    description: 'Developer-mode test harness. Requires developerMode=true. action=status reads the live projection/config summary without mutation; action=self_test runs deterministic gate fixtures and returns one pass/fail per gate; action=simulate returns the decision for one named scenario. Read-only: it never mutates a session projection, the Markdown index, or the reasoning-state file.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'self_test', 'simulate', 'probe_write'] },
        scenario: { type: 'string', enum: ['reasoning', 'risk', 'recall', 'record', 'compress', 'memory'] },
        toolName: { type: 'string', description: 'Tool name to evaluate for simulate (default write).' },
        code: { type: 'string', description: 'Code or memory text for simulate.' },
        question: { type: 'string', description: 'Question text for simulate scenario=reasoning.' },
        enforceGates: { type: 'boolean', description: 'When false, simulate uses developerMode=true to test the bypass path.' },
        // probe_write has no path argument; it always uses .tmp/guard-dev under the session cwd.
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          result: { type: 'object' },
          status: { type: 'object' },
        },
        required: ['ok', 'action'],
      },
      render(args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const action = String(input.action || '');
      if (!config.developerMode) throw new Error('agents_guard_dev requires developerMode=true');
      if (action === 'self_test') {
        const result = runGuardSelfTest();
        return { ok: result.ok, action, result };
      }
      if (action === 'simulate') {
        const result = simulateGuardScenario(input);
        return { ok: Boolean(result && result.decision && result.decision.allow), action, result };
      }
      if (action === 'probe_write') {
        const agent = exec && exec.agent;
        const session = agent ? ctx.sessions.get(agent.id) : null;
        if (!session) throw new Error('no active session');
        const cwd = (session.header && session.header.cwd) || process.cwd();
        const dir = path.join(cwd, '.tmp', 'guard-dev');
        const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        const file = path.join(dir, 'probe-' + stamp + '.txt');
        const payload = 'guard-dev-write:' + stamp;
        await fs.mkdir(dir, { recursive: true });
        try {
          await fs.writeFile(file, payload, 'utf8');
          const verified = await fs.readFile(file, 'utf8');
          const bytes = Buffer.byteLength(payload, 'utf8');
          return { ok: verified === payload, action, result: { path: file, bytes, content: verified } };
        } finally {
          try { await fs.unlink(file); } catch {}
        }
      }
      if (action === 'status') {
        const agent = exec && exec.agent;
        const session = agent ? ctx.sessions.get(agent.id) : null;
        if (!session) throw new Error('no active session');
        const memoryState = handle.stateOf(session);
        const reasoningState = reasoningHandle.stateOf(session);
        const open = openReasoningQuestions(memoryState);
        return {
          ok: true,
          action,
          status: {
            developerMode: Boolean(config.developerMode),
            groups: {
              workflowEnabled: Boolean(config.workflowEnabled),
              configSource,
              continuityEnabled: Boolean(config.continuityEnabled),
              reasoningEnabled: Boolean(config.reasoningEnabled),
              memoryEnabled: Boolean(config.memoryEnabled),
            },
            config: {
              recallGate: Boolean(config.recallGate),
              recordGate: Boolean(config.recordGate),
              reasoningGate: Boolean(config.reasoningGate),
              taskGate: Boolean(config.taskGate),
              evidenceGate: Boolean(config.evidenceGate),
              impactGate: Boolean(config.impactGate),
              verificationGate: Boolean(config.verificationGate),
              recoveryGate: Boolean(config.recoveryGate),
              indexGate: Boolean(config.indexGate),
              reasoningRiskGate: Boolean(config.reasoningRiskGate),
              semanticReview: Boolean(config.semanticReview),
              riskReviewFailure: config.riskReviewFailure,
              memoryTextMax: config.memoryTextMax,
              maxReasoningQuestions: config.maxReasoningQuestions,
            },
            memory: {
              openQuestions: open.map((item) => ({ id: item.id, text: item.text })),
              lastUserSeq: memoryState.lastUserSeq,
              userLog: (memoryState.userLog || []).length,
              changedFiles: (memoryState.changedFiles || []).length,
              task: memoryState.task || null, authorization: memoryState.authorization || null,
              evidence: (memoryState.evidence || []).length, changes: (memoryState.changes || []).length,
              checks: (memoryState.checks || []).length, recovery: (memoryState.recovery || []).length,
              indexAudit: memoryState.indexAudit ? memoryState.indexAudit.status : null,
            },
            settingsView: (() => {
              const live = readSettingsValues();
              if (!live) return null;
              return { userKeys: Object.keys(live.user || {}).sort(), groupFields: ['workflowEnabled', 'continuityEnabled', 'reasoningEnabled', 'memoryEnabled'] };
            })(),
            capabilities: {
              settings: hasService('settings', 'describe'),
              tokenMeter: hasService('tokenMeter', 'contextPressure'),
              workspaceFiles: hasService('workspaceFiles', 'stat'),
              llm: hasService('llm', 'stream'),
              toolsGuard: typeof ctx.tools?.guard === 'function',
            },
            reasoning: {
              version: reasoningState.version,
              risk: reasoningState.risk ? { id: reasoningState.risk.id, kind: reasoningState.risk.kind, review: reasoningState.risk.review } : null,
              recentMemory: (reasoningState.recentMemory || []).slice(-5),
              operationKeywords: (reasoningState.operationKeywords || []).slice(-8),
            },
          },
        };
      }
      throw new Error('action must be status, self_test, or simulate');
    },
  });

  const injected = new Map();
  const lastCardHash = new Map();
  const lastInjectedCompressions = new Map();
  const lastReasoningNotice = new Map();
  const lastRiskNotice = new Map();
  const riskReviews = new Map();
  const runtimeMemory = new Map();
  const writeQueues = new Map();

  const persistedLoaded = new Set();
// Last read failure per session. A failed read must not mark the session as
// loaded, otherwise the disk memory stays invisible for the whole process.
const persistedErrors = new Map();

  const sessionIndexDir = (session) => {
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    const root = config.indexRoot || path.join(home, 'agent-context');
    return path.join(root, String(session && session.id ? session.id : 'unknown'));
  };

  const indexFileFor = (session) => path.join(sessionIndexDir(session), config.indexFileName);

  // Synchronous on purpose: the card is injected inside the turn/start handler,
  // and an await there would move the injection out of the handler (the guard
  // tests, and the host, observe the inject call synchronously). The file is a
  // few KB and is read once per session; later turns hit the loaded marker.
  const loadPersistedMemory = (session) => {
    if (!session) return false;
    if (persistedLoaded.has(session.id)) return true;
    try {
      const text = fsSync.readFileSync(indexFileFor(session), 'utf8');
      const entries = parseIndexMemory(text);
      if (entries.length) {
        // Disk entries only fill what the projection lost: mergeLlmEntries keeps
        // the in-process entries first and never rewrites one already known.
        runtimeMemory.set(session.id, mergeLlmEntries(runtimeMemory.get(session.id) || [], entries));
      }
      persistedLoaded.add(session.id);
      persistedErrors.delete(session.id);
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        // Nothing written yet; a later agents_memory call creates the file.
        persistedLoaded.add(session.id);
        persistedErrors.delete(session.id);
        return true;
      }
      persistedErrors.set(session.id, String(error && error.message ? error.message : error));
      log('warn', 'index memory read failed (will retry next turn): ' + persistedErrors.get(session.id));
      return false;
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
    // The compress gate compares mark.seq with the latest user message seq.
    // Turn values are best-effort (turn/start may arrive before the message
    // is reduced), so a newer seq must always advance the mark.
    const next = advanceInjectedMark(injected.get(session.id), nextTurn, nextSeq);
    if (next) injected.set(session.id, next);
  };

  const injectCard = (session, state, turn) => {
    // Durable half of the memory: read the index before the card is built, so a
    // memory recorded before a restart reaches the model again. The load never
    // throws; a failure keeps the session unmarked and is retried next turn.
    loadPersistedMemory(session);
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') {
      // Record the attempt anyway. The card text is built from the same
      // projection the compress gate reads, so a session where the agent
      // service is briefly unavailable must not freeze the mark forever.
      markInjected(session, turn, state.lastUserSeq);
      log('warn', 'index card not injected: agent or agent.inject is unavailable (turn ' + String(turn) + ')');
      return Promise.resolve(false);
    }
    let completedOperations = [];
    let operationKeywords = [];
    let recentMemory = [];
    try {
      const rstate = reasoningHandle.stateOf(session);
      completedOperations = rstate.completed || [];
      operationKeywords = rstate.operationKeywords || [];
      recentMemory = rstate.recentMemory || [];
    } catch {}
    const card = buildCard(Object.assign({}, mergeMemory(state, session.id), { completedOperations, operationKeywords, recentMemory }), config);
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
    // Mark before the asynchronous injection resolves. The old order only
    // advanced the mark after agent.inject resolved, so a pending or rejected
    // promise left a stale turn behind and every later compress was denied
    // with "the session index card belongs to turn 1, current turn is 3".
    markInjected(session, turn, state.lastUserSeq);
    lastInjectedCompressions.set(session.id, compressCount);
    try {
      const result = agent.inject({ role: 'user',
        content: [{ type: 'text', text: card }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') {
        return result.then(() => true).catch((error) => {
          lastCardHash.delete(session.id);
          log('warn', 'index injection failed (turn ' + String(turn) + '): ' + String(error && error.message ? error.message : error));
          throw error;
        });
      }
      return Promise.resolve(true);
    } catch (error) {
      lastCardHash.delete(session.id);
      log('warn', 'index injection threw (turn ' + String(turn) + '): ' + String(error && error.message ? error.message : error));
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
      const result = agent.inject({ role: 'user',
        content: [{ type: 'text', text: '[dsh-agents-guard] 你的推理中出现未解决疑问: [' + ids + '] "' + excerpt + '". PTC 下用 run_code 执行恰好一条 `await tools.agents_verify({"questionId":"...","op":"read_file|list_dir|grep","path":"...","pattern":"..."})` 做宿主侧只读验证；一次成功只解除对应 questionId。无法验证时，优先用 run_code 执行恰好一条 `await tools.ask_user_question({...})`（官方）；不可用再用 `await tools.ask_user({...})`（Deep PTC）；若两者都不可用（例如 Deep PTC 卡片关闭），直接在回复里提问，由用户答复解除。推理门控期间 run_code 只允许恰好一条可信安全单调用（read/glob/grep/web_search/web_fetch/会话读取/agents_index/agents_verify/agents_memory/ask_user_question/ask_user（官方优先））；多语句、任意 JS 和写操作仍被禁用。' }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch (error) {
      lastReasoningNotice.delete(session.id);
      log('warn', 'reasoning notice failed: ' + String(error && error.message ? error.message : error));
    }
  };


  const lastContinuityNotice = new Map();
  const maybeRemindContinuity = (session, state) => {
    if (!config.continuityGate || config.developerMode) return;
    const pressure = readContextPressure(session);
    if (!pressure) return;
    const ratio = pressure.pressureTokens / pressure.contextWindow;
    if (!Number.isFinite(ratio) || ratio < config.compressPressureRatio) return;
    const effective = stateWithLiveContinuity(session, state);
    const status = continuityStatus(effective);
    if (status === 'ready') return;
    const key = String(state.lastTurn || 0) + ':' + String(state.lastUserSeq || 0) + ':' + String(state.lastCompressSeq || 0);
    if (lastContinuityNotice.get(session.id) === key) return;
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return;
    lastContinuityNotice.set(session.id, key);
    const capsule = buildContinuity(effective, config);
    const text = '[dsh-agents-guard] context pressure ' + (ratio * 100).toFixed(1) + '% >= ' + (config.compressPressureRatio * 100).toFixed(0) + '% compression threshold; handoff status: ' + status + (capsule.missing.length ? '; missing: ' + capsule.missing.join(', ') : '') + '. If this is a multi-step task, call agents_handoff action=save with step/next/preserve/discard/risks before the next step or compression. Keep task scope, active change invariants, open questions, checks and recovery baseline; mark raw logs, duplicate outputs and failed-attempt details as discard. The 80% threshold is the host fallback; a step-boundary handoff is the primary path. Do not paste raw transcripts. After compression, resume from the injected continuity card and do not redo completed operations.';
    try {
      const result = agent.inject({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin:dsh-agents-guard' } });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch (error) {
      lastContinuityNotice.delete(session.id);
      log('warn', 'continuity reminder failed: ' + String(error && error.message ? error.message : error));
    }
  };

  // Resolves to { written, file, reason, error } and never rejects, so the
  // fire-and-forget callers stay safe while agents_memory can await it.
  const writeIndex = (session, state) => {
    if (!config.writeIndex) return Promise.resolve({ written: false, reason: "writeIndex is off" });
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
      if (merged === existing) return { written: false, file, reason: 'unchanged' };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, merged, 'utf8');
      return { written: true, file };
    }).catch((error) => {
      const message = String(error && error.message ? error.message : error);
      log('warn', 'index write failed: ' + message);
      return { written: false, file, error: message };
    });
    writeQueues.set(file, next);
    return next;
  };


  const continuityFileFor = (session) => {
    if (!config.writeContinuity) return null;
    const cwd = session && session.header && session.header.cwd;
    if (!cwd) return null;
    const name = path.basename(String(config.continuityFile || 'AGENT_CONTINUITY.md'));
    return path.join(String(cwd), name);
  };

  const writeContinuity = (session, state) => {
    const file = continuityFileFor(session);
    if (!file) return;
    const capsule = buildContinuity(state, config);
    const previous = writeQueues.get(file) || Promise.resolve();
    const next = previous.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, capsule.text + '\n', 'utf8');
    }).catch((error) => {
      log('warn', 'continuity write failed: ' + String(error && error.message ? error.message : error));
    });
    writeQueues.set(file, next);
  };

  const reasoningFileFor = (session) => {
    if (!config.writeReasoningState) return null;
    const cwd = session && session.header && session.header.cwd;
    if (!cwd) return null;
    const name = path.basename(String(config.reasoningStateFile || 'AGENT_REASONING_STATE.json'));
    return path.join(String(cwd), name);
  };

  const writeReasoningState = (session) => {
    const file = reasoningFileFor(session);
    if (!file) return;
    let state;
    try { state = reasoningHandle.stateOf(session); } catch { return; }
    try {
      const memoryState = handle.stateOf(session);
      if (state && state.risk && state.risk.kind === 'ambiguity' && !openReasoningQuestions(memoryState).length) {
        state = Object.assign({}, state, { version: 4, risk: null });
      }
    } catch {}
    const review = riskReviews.get(session.id) || null;
    const payload = renderReasoningState(state, session.id, state && state.risk ? review : null);
    const previous = writeQueues.get(file) || Promise.resolve();
    const next = previous.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    }).catch((error) => {
      log('warn', 'reasoning state write failed: ' + String(error && error.message ? error.message : error));
    });
    writeQueues.set(file, next);
  };

  const injectRiskNotice = (session, state) => {
    const risk = state && state.risk;
    if (!risk) return;
    if (lastRiskNotice.get(session.id) === risk.id) return;
    const agent = ctx.agents.get(session.id);
    if (!agent || typeof agent.inject !== 'function') return;
    lastRiskNotice.set(session.id, risk.id);
    const text = '[dsh-agents-guard] risk [' + risk.id + '] ' + risk.kind + ': ' + String(risk.reason || '').slice(0, 240)
      + '. Before the next mutating call, end your reasoning with exactly one line:'
      + ' GUARD_STATE {"ambiguity":"none|low|blocking","progress":"new_evidence|exclusion|decision|none","loop":"none|suspected","drift":"aligned|risk","next":"short"}.'
      + ' Do not claim progress you did not make; read-only checks and agents_verify remain allowed.'
      + ' Check agents_index completed operations and recent memory; if this operation already ran, verify it read-only and record the conclusion before retrying.';
    try {
      const result = agent.inject({ role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'plugin:dsh-agents-guard' },
      });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch (error) {
      lastRiskNotice.delete(session.id);
      log('warn', 'risk notice failed: ' + String(error && error.message ? error.message : error));
    }
  };

  const reviewRisk = async (session, memoryState, reasoningState) => {
    const risk = reasoningState && reasoningState.risk;
    if (!risk || !config.semanticReview) return;
    const previous = riskReviews.get(session.id);
    if (previous && previous.riskId === risk.id) return;
    riskReviews.set(session.id, { riskId: risk.id, status: 'pending', reason: '' });
    const finish = (status, reason, review) => {
      riskReviews.set(session.id, { riskId: risk.id, status, reason: String(reason || '').slice(0, 240), review: review || null });
      try {
        const agent = ctx.agents.get(session.id);
        if (agent && typeof agent.inject === 'function') {
          const text = '[dsh-agents-guard] independent review for ' + risk.id + ': ' + status
            + (reason ? ' - ' + String(reason).slice(0, 240) : '')
            + (status === 'blocking' ? '. Resolve the risk or emit a truthful GUARD_STATE before mutating.' : '');
          const result = agent.inject({ role: 'user',  content: [{ type: 'text', text }], source: { kind: 'plugin:dsh-agents-guard' } });
          if (result && typeof result.then === 'function') result.catch(() => {});
        }
      } catch {}
      writeReasoningState(session);
    };
    try {
      const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
      if (!llm || typeof llm.stream !== 'function') { finish('skipped', 'llm service unavailable'); return; }
      const request = typeof session.requestContext === 'function' ? session.requestContext() : null;
      if (!request || !request.provider || !request.model) { finish('skipped', 'current model route unavailable'); return; }
      const prompt = buildRiskReviewPrompt({ reasoningState, memoryState, config });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      let text = '';
      try {
        const stream = llm.stream({
          provider: request.provider,
          model: request.model,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          maxTokens: 320,
          temperature: 0,
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
          if (text.length > 4000) break;
        }
      } finally {
        clearTimeout(timer);
      }
      const reviewed = parseRiskReview(text);
      if (!reviewed) { finish('error', 'review returned no valid JSON'); return; }
      const blocking = reviewed.ambiguity === 'blocking' || reviewed.loop === 'suspected' || reviewed.drift === 'risk';
      finish(blocking ? 'blocking' : 'clear', reviewed.reason, reviewed);
    } catch (error) {
      finish('error', String(error && error.message ? error.message : error));
    }
  };
  ctx.on('session/event', (session, event) => {
    try {
      const state = handle.stateOf(session);
      const rstate = reasoningHandle.stateOf(session);
      if (event.type === 'user/message' || event.type === 'turn/start') {
        syncLiveTask(session, state.task || null);
      }
      if (event.type === 'turn/start' || event.type === 'assistant/message') maybeRemindContinuity(session, state);
      const staleAmbiguityRisk = !!(rstate && rstate.risk && rstate.risk.kind === 'ambiguity' && (Number(rstate.version) < 4 || !openReasoningQuestions(state).length));
      if (rstate && rstate.risk && !staleAmbiguityRisk) {
        injectRiskNotice(session, rstate);
        if (config.semanticReview) {
          const pending = reviewRisk(session, state, rstate);
          if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        }
      }
      if (event.type !== 'turn/start' && state.lastUserSeq && !cardMarkCovers(injected.get(session.id), state.lastUserSeq)) {
        const pending = injectCard(session, state, state.lastTurn);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      }
      if (event.type === 'turn/start') {
        const pending = injectCard(session, state, event.data && event.data.turn);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      } else if (event.type === 'turn/end' || event.type === 'user/message') {
        writeIndex(session, state);
        const mergedContinuity = stateWithLiveContinuity(session, state);
        if (mergedContinuity.continuity) writeContinuity(session, mergedContinuity);
      } else if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        injectReasoningNotice(session, state);
        if (openReasoningQuestions(state).length || (rstate && rstate.risk)) writeIndex(session, state);
      }
      if (event.type === 'turn/end' || event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'assistant/attempt') {
        writeReasoningState(session);
      }
    } catch (error) {
      log('warn', 'session event handling failed: ' + String(error && error.message ? error.message : error));
    }
  });

  const guardRegistered = (() => {
    if (!ctx.tools || typeof ctx.tools.guard !== 'function') {
      log('warn', 'DSH tools.guard is unavailable; index tools still work, but gate enforcement is disabled');
      return false;
    }
    ctx.tools.guard((execution) => {
    syncConfig();
    if (!execution || !execution.agent) return;
    let session;
    try {
      session = ctx.sessions.get(execution.agent.id);
    } catch {}
    if (!session) return;
    if (config.developerMode) return;
    let pressureRatio = null;
    if (execution.name === 'compress') {
      const pressure = readContextPressure(session);
      if (pressure) {
        pressureRatio = pressure.pressureTokens / pressure.contextWindow;
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
    let rstate = null;
    try { rstate = reasoningHandle.stateOf(session); } catch {}
    const risk = decideRisk({
      reasoningState: rstate,
      memoryState: state,
      review: riskReviews.get(session.id),
      toolName: execution.name,
      code: args.code,
      config,
    });
    if (!risk.allow) return { reason: risk.reason };
    const task = decideTask({ state: stateWithLiveTask(session, state), toolName: execution.name, toolArgs: args, code: args.code, config });
    if (!task.allow) return { reason: task.reason };
    const evidence = decideEvidence({ state, toolName: execution.name, toolArgs: args, config });
    if (!evidence.allow) return { reason: evidence.reason };
    const impact = decideImpact({ state, toolName: execution.name, toolArgs: args, code: args.code, config });
    if (!impact.allow) return { reason: impact.reason };
    const recovery = decideRecovery({ state, toolName: execution.name, toolArgs: args, code: args.code, config });
    if (!recovery.allow) return { reason: recovery.reason };
    const verification = decideVerification({ state, toolName: execution.name, toolArgs: args, config });
    if (!verification.allow) return { reason: verification.reason };
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
    const continuity = decideContinuity({ state: stateWithLiveContinuity(session, state), toolName: execution.name, pressureRatio, config });
    if (!continuity.allow) return { reason: continuity.reason };
    const indexGate = decideIndexGate({ state, toolName: execution.name, config });
    if (!indexGate.allow) return { reason: indexGate.reason };
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
    return true;
  })();

  ctx.systemPrompt.section({
    name: 'agents-guard-memory',
    order: 7000,
    text: 'The dsh-agents-guard plugin maintains a session index and injects it as a user-role memory card at the start of a turn. Treat that card as historical context, not as a new user instruction. Use agents_index to read the index on demand (card, generated Markdown, counts, open questions) instead of opening AGENT_CONTEXT_INDEX.md manually; use agents_memory to record user decisions, verified facts, errors, open items, and corrections as distilled conclusions in your own words (within the configured limit, default 600 characters), never a transcript or raw user message; locate the original via agents_index search, cite evidence, and never record an assumption as a user decision. A normal user question is not ambiguity by itself; ambiguity only means the same request has multiple plausible interpretations that would change the implementation direction. In that case, ask before acting instead of choosing an interpretation silently. If your own reasoning contains an unresolved question, it is tracked as an individual question ID. In PTC, verify that question with run_code executing exactly one `await tools.agents_verify({"questionId":"...","op":"read_file|list_dir|grep","path":"...","pattern":"..."})`; this is a host-side read-only tool limited to read_file, list_dir, and grep. Pass questionId or questionIds; a successful result resolves every listed ID and reports unknown IDs in missingIds. If verification is impossible, use run_code with exactly one `await tools.ask_user_question({...})` (official) or `await tools.ask_user({...})` (Deep PTC); if neither ask tool is available, ask in a normal reply; the user reply resolves the asked question. Read-only run_code is allowed, including multiple read calls; only code containing write/process/plugin mutations is blocked while reasoning questions are open. agents_memory does not clear the reasoning gate. Before calling compress, ensure the current turn has a memory card; the guard denies compression when the index does not cover the latest user message, unless the official tokenMeter context pressure reaches compressPressureRatio (default 0.75), in which case compress is forced through the card and gate checks. If compress is denied, do not retry the identical call; continue the task, or wait for the next turn so the index is refreshed. Only user-authored messages are indexed; plugin-injected context is ignored.',
  });

  ctx.systemPrompt.section({
    name: 'agents-guard-priority',
    order: 10001,
    text: 'Developer mode (config.developerMode) bypasses all gates for testing; it does not bypass DSH permissions or the index. Do not leave it on in normal use. Priority when dsh-agents-guard is enabled. (1) Recall/history: when the user asks about earlier work, previous discussion, requirements, decisions, corrections, or open issues, call agents_index first (action "get" or "search"). Only if it has no match may you use decompress/search_context; only after that may you use session_search, and state that it is a fallback. Never start by reading AGENT_CONTEXT_INDEX.md or using glob/grep for memory. If agents_index is not in the current tool list, load it with deep_ptc_tools or call it with run_code as exactly one `await tools.agents_index({...})`; do not substitute session_search. (2) Recording: when the user states a requirement, correction, decision, or acceptance criterion, call run_code with exactly one `await tools.agents_memory({"action":"add","kind":"requirement|correction|decision|verified|open","text":"...","evidence":"..."})` before write/edit/pwsh/compress or a mutating run_code. In PTC, pass exactly one call; both a JSON object and an ordinary JavaScript object literal are recognized. Use agents_task to propose goal/scope/exclusions before a non-trivial mutation; a proposal is not user authorization. Do not record an unconfirmed guess; write a distilled conclusion/requirement in your own words within the configured limit (default 600 characters), not a transcript or the raw user message, and locate the original via agents_index search. Read-only inspection, including read-only run_code, remains allowed. (2b) Before repeating a write/edit/pwsh operation, call agents_index and inspect completed operations and recent memory. If the operation may already have run, verify it with read-only evidence and record the verified conclusion with agents_memory; never blindly redo it. (3) Compression: a denied compress means record the latest requirements/decisions with agents_memory first; do not retry the identical compress call. The recall and record gates enforce both rules.',
  });

  ctx.systemPrompt.section({
    name: 'agents-guard-risk',
    order: 10002,
    text: 'Risk self-report (dsh-agents-guard): when the guard reports a risk, or before the next mutating call after such a report, end your reasoning with exactly one line: GUARD_STATE {"ambiguity":"none|low|blocking","progress":"new_evidence|exclusion|decision|none","loop":"none|suspected","drift":"aligned|risk","next":"short"}. Use blocking only when a decision changes the implementation. Never claim progress you did not make; read-only verification and agents_verify remain available. The guard stores only distilled state in AGENT_REASONING_STATE.json; it never stores the raw reasoning. When you finish a non-trivial turn with unresolved uncertainties or a decision that changes implementation, end the reasoning with exactly one line: GUARD_SUMMARY {"goal":"short","decisions":["short"],"uncertainties":["short"],"next":"short"}. Only entries in uncertainties become open questions; omit the line when there are none, and never paste raw reasoning. Before repeating a write/edit/pwsh operation, check agents_index completed operations and recent memory; if it may already have run, verify it read-only and record the verified conclusion with agents_memory.',
  });


  ctx.systemPrompt.section({
    name: 'agents-guard-continuity',
    order: 10003,
    text: 'Context-continuity protocol (dsh-agents-guard). For a long or multi-step task, create agents_task with an ordered steps list. After each completed step, call agents_handoff action=save with step, next, preserve, discard, and risks before compressing at that step boundary; the step-boundary handoff is the primary path. Preserve task scope, the active change and its invariants, checks, recovery baseline, open questions, and the next step. Mark raw logs, duplicate command outputs, and failed-attempt details as discard; never paste a transcript. The 80% context threshold is only the host fallback: at or above it compression is allowed with the host projection even without a model handoff. After compression, resume from the injected continuity card and do not redo completed operations. Host-projected state is deterministic; model preserve/next notes are distilled, not independently verified.',
  });
  log('info', 'active; denyCompress=' + String(config.denyCompress) + ' compressPressureRatio=' + String(config.compressPressureRatio) + ' writeIndex=' + String(config.writeIndex) + ' reasoningGate=' + String(config.reasoningGate) + ' developerMode=' + String(config.developerMode) + ' toolsGuard=' + String(guardRegistered));
}
