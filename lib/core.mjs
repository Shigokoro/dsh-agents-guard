// Pure, deterministic session-memory helpers for dsh-agents-guard.
// No host imports: unit tests can exercise this file directly.

export const GUARD_BUILD = '0.8.7';

export const CARD_BEGIN = '<!-- dsh-agents-guard:begin -->';
export const CARD_END = '<!-- dsh-agents-guard:end -->';

export const MEMORY_AUTHORITIES = ['user-confirmed', 'user-stated', 'tested', 'model-inferred', 'assumption'];

export function authorityFor(kind) {
  return kind === 'assumption' ? 'assumption' : 'model-inferred';
}

export function memoryKey(entry) {
  return [entry && entry.kind, entry && entry.text, entry && entry.evidence].join('|');
}

export const MEMORY_TEXT_MAX = 600;

// Memory is a distilled conclusion, not the transcript. Raw user text is
// searchable through the index (userLog); agents_memory must not become a
// second copy of it.
export function memoryRecordProblem(text, max) {
  const configured = Number(max);
  const limit = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : MEMORY_TEXT_MAX;
  const value = String(text || '').trim();
  if (!value) return 'text is required';
  if (value.length > limit) {
    return 'distill the memory to at most ' + limit + ' characters; do not paste the raw user message (locate the original with agents_index search)';
  }
  if ((value.match(/\n/g) || []).length >= 4) {
    return 'distill the memory into a conclusion instead of pasting a multi-line transcript; locate the original with agents_index search';
  }
  return '';
}

export function mergeLlmEntries(existing, extra) {
  const seen = new Set();
  const out = [];
  for (const item of (existing || []).concat(extra || [])) {
    const key = memoryKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const CONFIG_GROUPS = Object.freeze({
  workflowEnabled: ['taskGate', 'evidenceGate', 'impactGate', 'verificationGate', 'recoveryGate'],
  continuityEnabled: ['continuityGate', 'writeContinuity'],
  reasoningEnabled: ['reasoningGate', 'reasoningRiskGate', 'semanticReview', 'writeReasoningState'],
  memoryEnabled: ['recallGate', 'recordGate', 'indexGate', 'writeIndex'],
});

export const DEFAULT_CONFIG = {
  enabled: true,
  developerMode: false,
  workflowEnabled: false,
  continuityEnabled: true,
  reasoningEnabled: true,
  memoryEnabled: true,
  denyCompress: true,
  compressPressureRatio: 0.75,
  legacyCompressWithoutCard: true,
  writeIndex: true,
  indexFileName: 'AGENT_CONTEXT_INDEX.md',
  indexRoot: '',
  maxCardChars: 4200,
  maxRequirements: 12,
  maxDecisions: 6,
  maxOpenItems: 6,
  maxFailures: 6,
  maxChangedFiles: 10,
  maxLlmEntries: 40,
  memoryTextMax: 600,
  recentMemoryMax: 12,
  recallGate: true,
  recordGate: true,
  reasoningGate: true,
  reasoningRiskGate: true,
  semanticReview: true,
  riskReviewFailure: 'allow',
  writeReasoningState: true,
  reasoningStateFile: 'AGENT_REASONING_STATE.json',
  loopThreshold: 2,
  toolRepeatThreshold: 3,
  reasoningTools: ['write', 'edit', 'pwsh', 'compress', 'run_code'],
  reasoningVerifyTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace'],
  maxReasoningQuestions: 8,
  taskGate: false,
  taskGateTools: ['write', 'edit', 'pwsh', 'run_code', 'plugin_manager'],
  evidenceGate: false,
  maxEvidence: 20,
  impactGate: false,
  impactGateTools: ['write', 'edit', 'pwsh', 'run_code', 'plugin_manager'],
  verificationGate: false,
  recoveryGate: false,
  indexGate: false,
  continuityGate: true,
  continuityMaxChars: 1600,
  continuityFile: 'AGENT_CONTINUITY.md',
  writeContinuity: true,
};

function hasOwn(value, key) {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key));
}

function toBoolean(value) {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'false' || text === '0' || text === 'no' || text === 'off' || text === '') return false;
    if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  }
  return Boolean(value);
}

// `explicit` is the settings-page user layer when the host exposes it. It
// distinguishes a switch the user actually set from a schema default, so an
// old profile is not silently upgraded to a new group state.
export function normalizeConfig(input, options) {
  const raw = input && typeof input === 'object' ? input : {};
  const explicit = options && Object.prototype.hasOwnProperty.call(options, 'explicit')
    ? options.explicit
    : raw;
  const cfg = Object.assign({}, DEFAULT_CONFIG, raw);
  // The settings page saves into the host user layer while `value` can still
  // be the profile/schema layer. Overlay every explicit user field before
  // deriving groups; otherwise child switches such as taskGate never reach
  // the running Guard even though the UI reports a successful save.
  if (explicit && typeof explicit === 'object') {
    for (const [key, value] of Object.entries(explicit)) {
      if (value !== undefined) cfg[key] = value;
    }
  }
  cfg.riskReviewFailure = cfg.riskReviewFailure === 'block' ? 'block' : 'allow';
  for (const key of ['enabled', 'developerMode', 'denyCompress', 'legacyCompressWithoutCard', 'writeIndex', 'recallGate', 'recordGate', 'reasoningGate', 'reasoningRiskGate', 'semanticReview', 'writeReasoningState', 'taskGate', 'evidenceGate', 'impactGate', 'verificationGate', 'recoveryGate', 'indexGate', 'continuityGate', 'writeContinuity']) cfg[key] = toBoolean(cfg[key]);
  for (const [group, children] of Object.entries(CONFIG_GROUPS)) {
    if (hasOwn(explicit, group)) cfg[group] = toBoolean(explicit[group]);
    else cfg[group] = children.some((key) => Boolean(cfg[key]));
  }
  // Guard invariants: these two are not user policies and must not be switchable.
  cfg.denyCompress = true;
  cfg.legacyCompressWithoutCard = true;
  if (!Array.isArray(cfg.reasoningTools)) cfg.reasoningTools = DEFAULT_CONFIG.reasoningTools.slice();
  else cfg.reasoningTools = cfg.reasoningTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.reasoningVerifyTools)) cfg.reasoningVerifyTools = DEFAULT_CONFIG.reasoningVerifyTools.slice();
  else cfg.reasoningVerifyTools = cfg.reasoningVerifyTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.taskGateTools)) cfg.taskGateTools = DEFAULT_CONFIG.taskGateTools.slice();
  else cfg.taskGateTools = cfg.taskGateTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.impactGateTools)) cfg.impactGateTools = DEFAULT_CONFIG.impactGateTools.slice();
  else cfg.impactGateTools = cfg.impactGateTools.map((name) => String(name)).filter(Boolean);
  const pressureRatio = Number(cfg.compressPressureRatio);
  cfg.compressPressureRatio = Number.isFinite(pressureRatio) && pressureRatio > 0 && pressureRatio <= 1
    ? pressureRatio
    : DEFAULT_CONFIG.compressPressureRatio;
  if (!cfg.continuityFile || typeof cfg.continuityFile !== 'string') cfg.continuityFile = DEFAULT_CONFIG.continuityFile;
  for (const key of ['maxCardChars', 'maxRequirements', 'maxDecisions', 'maxOpenItems', 'maxFailures', 'maxChangedFiles', 'maxLlmEntries', 'maxReasoningQuestions', 'maxEvidence', 'continuityMaxChars']) {
    const n = Number(cfg[key]);
    cfg[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CONFIG[key];
  }
  const memoryMax = Number(cfg.memoryTextMax);
  cfg.memoryTextMax = Number.isFinite(memoryMax) && memoryMax >= 100 && memoryMax <= 2000
    ? Math.floor(memoryMax)
    : DEFAULT_CONFIG.memoryTextMax;
  for (const key of ['loopThreshold', 'toolRepeatThreshold']) {
    const n = Number(cfg[key]);
    cfg[key] = Number.isFinite(n) && n >= 2 && n <= 10 ? Math.floor(n) : DEFAULT_CONFIG[key];
  }
  const recentMax = Number(cfg.recentMemoryMax);
  cfg.recentMemoryMax = Number.isFinite(recentMax) && recentMax >= 3 && recentMax <= 50
    ? Math.floor(recentMax)
    : DEFAULT_CONFIG.recentMemoryMax;
  if (!cfg.indexFileName || typeof cfg.indexFileName !== 'string') cfg.indexFileName = DEFAULT_CONFIG.indexFileName;
  if (typeof cfg.indexRoot !== 'string') cfg.indexRoot = '';
  if (!cfg.reasoningStateFile || typeof cfg.reasoningStateFile !== 'string') cfg.reasoningStateFile = DEFAULT_CONFIG.reasoningStateFile;
  return cfg;
}

// Runtime policy = group master switch AND the independent child setting.
// The raw child values remain in normalizeConfig() for the settings form and
// for re-enabling a group without losing the user's advanced choices.
export function effectiveConfig(input, options) {
  const cfg = normalizeConfig(input, options);
  const out = Object.assign({}, cfg);
  for (const [group, children] of Object.entries(CONFIG_GROUPS)) {
    out[group] = toBoolean(out[group]);
    for (const child of children) out[child] = out[group] && toBoolean(out[child]);
  }
  return out;
}

export function emptyState(header) {
  return {
    version: 4,
    cwd: header && header.cwd ? String(header.cwd) : '',
    requirements: [],
    decisions: [],
    openItems: [],
    failures: [],
    changedFiles: [],
    pendingCalls: {},
    llmEntries: [],
    reasoningSeq: 0,
    reasoningText: '',
    reasoningSummary: null,
    resolvedReasoningTexts: [],
    reasoningClarifiedSeq: 0,
    reasoningAskedSeq: 0,
    reasoningQuestions: [],
    verifyPending: null,
    lastUserSeq: 0,
    lastUserText: '',
    agentsIndexSeq: 0,
    memoryRecordedSeq: 0,
    userLog: [],
    lastUserTurn: 0,
    lastAssistantSeq: 0,
    lastTurn: 0,
    compressions: 0,
    lastCompressSeq: 0,
    task: null,
    authorization: null,
    evidence: [],
    changes: [],
    checks: [],
    recovery: [],
    indexAudit: null,
    continuity: null,
  };
}

export function clip(value, max) {
  let text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  text = text.split(CARD_BEGIN).join('[begin]').split(CARD_END).join('[end]');
  if (text.length > max) text = text.slice(0, Math.max(1, max - 1)) + '…';
  return text;
}

export function redactSecrets(text) {
  return String(text == null ? '' : text)
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_GITHUB_PAT]')
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_SECRET]')
    .replace(/(Bearer|token)\s+[A-Za-z0-9._-]{20,}/gi, '$1 [REDACTED]');
}

function redactState(state) {
  return Object.assign({}, state, {
    requirements: (state.requirements || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text) })),
    llmEntries: (state.llmEntries || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text), evidence: redactSecrets(item.evidence) })),
    decisions: (state.decisions || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text) })),
    openItems: (state.openItems || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text) })),
    failures: (state.failures || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text) })),
    changedFiles: (state.changedFiles || []).map((item) => Object.assign({}, item, { text: redactSecrets(item.text) })),
    reasoningText: redactSecrets(state.reasoningText),
    reasoningSummary: state.reasoningSummary ? {
      goal: redactSecrets(state.reasoningSummary.goal || ''),
      decisions: (state.reasoningSummary.decisions || []).map((item) => redactSecrets(item)),
      uncertainties: (state.reasoningSummary.uncertainties || []).map((item) => redactSecrets(item)),
      next: redactSecrets(state.reasoningSummary.next || ''),
      constraints: (state.reasoningSummary.constraints || []).map((item) => redactSecrets(item)),
    } : null,
    reasoningQuestions: (state.reasoningQuestions || []).map((item) => Object.assign({}, item, {
      text: redactSecrets(item.text),
      evidence: redactSecrets(item.evidence || ''),
    })),
    continuity: state.continuity ? Object.assign({}, state.continuity, {
      step: redactSecrets(state.continuity.step || ''),
      next: redactSecrets(state.continuity.next || ''),
      preserve: (state.continuity.preserve || []).map((item) => redactSecrets(item)),
      discard: (state.continuity.discard || []).map((item) => redactSecrets(item)),
      risks: (state.continuity.risks || []).map((item) => redactSecrets(item)),
      note: redactSecrets(state.continuity.note || ''),
    }) : null,
  });
}

export function textOf(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text);
  }
  return parts.join('\n');
}

export function isCorrection(text) {
  return /(不对|不是这样|改成|改为|应该|必须|不要|别这样|错误|纠正|漏了|忘记|yet|wrong|should|must|do not|don't|instead)/i.test(text);
}

export function isDecision(text) {
  return /(决定|采用|选择|方案|已确认|确认使用|结论|下一步将|计划|decided|will use|chosen|conclusion)/i.test(text);
}

export function isOpen(text) {
  return /(待定|待验证|尚未|未完成|未验证|TODO|open question|pending|need to|下一步|剩余)/i.test(text) || /[?？]/.test(text);
}

const MUTATION_PATTERN = /(writeFile|appendFile|unlink|rename|copyFile|mkdir|createWriteStream|child_process|execFile|spawn|node:child_process|Bun\.write|Deno\.write|eval\s*\(|new\s+Function|tools\.(write|edit|write_file|edit_file|apply_patch|pwsh|terminal|bash|shell|exec|run_code|plugin_manager)|tools\s*\[\s*['"](write|edit|write_file|edit_file|apply_patch|pwsh|terminal|bash|shell|exec|run_code|plugin_manager)['"]|fs\.(write|append|rm|unlink|rename|copyFile|mkdir|chmod|chown|truncate|symlink|link|createWriteStream))/i;

export function codeIsReadOnly(code) {
  const text = String(code || '');
  return Boolean(text.trim()) && !MUTATION_PATTERN.test(text);
}

export function codeAsksUser(code) {
  const text = String(code || '');
  if (!/(ask_user_question|ask_user|userQuestions)/.test(text)) return false;
  if (MUTATION_PATTERN.test(text)) return false;
  return true;
}

export function codeVerifies(code) {
  const text = String(code || '');
  if (!text.trim() || !codeIsReadOnly(text)) return false;
  if (/(agents_memory|ask_user_question|ask_user|plugin_manager)/.test(text)) return false;
  return true;
}

export const SAFE_RUN_CODE_TOOLS = [
  'read', 'glob', 'grep', 'web_search', 'web_fetch',
  'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace',
  'agents_index', 'agents_verify', 'agents_memory', 'agents_task', 'agents_handoff', 'agents_evidence', 'agents_change', 'agents_check', 'agents_recovery', 'ask_user', 'ask_user_question',
];

export function safeRunCodeCall(code) {
  const text = String(code || '').trim();
  const match = text.match(/^(?:return\s+)?await\s+tools\.([A-Za-z0-9_]+)\(\s*(\{[\s\S]*\})\s*\)\s*;?$/);
  if (!match) return null;
  const name = match[1];
  if (!SAFE_RUN_CODE_TOOLS.includes(name)) return null;
  const input = parseLooseObject(match[2]);
  if (!input) return null;
  return { name, input };
}

export function taskCallFromCode(code) {
  const text = String(code || '');
  const match = text.match(/await\s+tools\.agents_task\s*\(\s*(\{[\s\S]*?\})\s*\)/) || text.match(/agents_task[\s\S]{0,40}?(\{[\s\S]*?\})/);
  if (!match) return null;
  try {
    return parseLooseObject(match[1]);
  } catch { return null; }
}

export function embeddedHandoffCall(code) {
  const text = String(code || '');
  for (const match of text.matchAll(/await\s+tools\.agents_handoff\(\s*(\{[\s\S]*?\})\s*\)/g)) {
    try {
      const input = parseLooseObject(match[1]);
      if (input && typeof input === 'object') return input;
    } catch {}
  }
  return null;
}

export function embeddedToolCalls(code) {
  const text = String(code || '');
  const allCalls = Array.from(text.matchAll(/await\s+tools\.([A-Za-z0-9_]+)/g));
  if (!allCalls.length || allCalls.some((item) => !SAFE_RUN_CODE_TOOLS.includes(item[1]))) return [];
  const matches = Array.from(text.matchAll(/await\s+tools\.([A-Za-z0-9_]+)\(\s*(\{[\s\S]*?\})\s*\)/g));
  const calls = [];
  for (const match of matches) {
    try {
      const input = parseLooseObject(match[2]);
      if (input && SAFE_RUN_CODE_TOOLS.includes(match[1])) calls.push({ name: match[1], input });
    } catch {}
  }
  // A call whose arguments are not a literal object cannot be projected.
  // Require every detected call to have been parsed so a multi-call program
  // never silently loses only part of its ledger writes.
  return matches.length === allCalls.length ? calls : [];
}

export function embeddedLedgerCalls(code) {
  const entries = [];
  for (const item of embeddedToolCalls(code)) {
    if (item.name === 'agents_change') entries.push({ change: item.input });
    else if (item.name === 'agents_check') entries.push({ check: item.input });
    else if (item.name === 'agents_recovery') entries.push({ recovery: item.input });
    else if (item.name === 'agents_handoff') entries.push({ handoff: item.input });
  }
  return entries;
}

export function embeddedToolCall(code) {
  const calls = embeddedToolCalls(code);
  return calls.length === 1 ? calls[0] : null;
}

export function isSafeGateRunCode(code) {
  return Boolean(safeRunCodeCall(code) || embeddedToolCalls(code).length);
}

export function parseLooseObject(text) {
  const source = String(text || '');
  const quoted = source.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  try {
    const value = JSON.parse(quoted);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function verifyIdsFromArgs(input) {
  const ids = [];
  if (typeof input.questionId === 'string' && input.questionId.trim()) ids.push(input.questionId.trim());
  if (Array.isArray(input.questionIds)) {
    for (const item of input.questionIds) {
      if (typeof item === 'string' && item.trim()) ids.push(item.trim());
    }
  }
  return Array.from(new Set(ids));
}

export function agentsVerifyQuestionIds(code) {
  const call = safeRunCodeCall(code);
  if (!call || call.name !== 'agents_verify') return [];
  const input = call.input;
  if (!['read_file', 'list_dir', 'grep'].includes(String(input.op || ''))) return [];
  return verifyIdsFromArgs(input);
}

export function agentsVerifyQuestionId(code) {
  return agentsVerifyQuestionIds(code)[0] || '';
}

export function isAgentsVerifyRunCode(code) {
  return agentsVerifyQuestionIds(code).length > 0;
}

export function isAskUserRunCode(code) {
  const call = safeRunCodeCall(code);
  return Boolean(call && (call.name === 'ask_user' || call.name === 'ask_user_question'));
}

export function isReasoningQuestion(text) {
  const value = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').trim();
  if (!value) return false;
  if (/(我不确定|我不清楚|I am not sure|I'm not sure)/i.test(value)) return true;
  if (!/[?？]/.test(value)) return false;
  if (/(不确定|不清楚|尚未确认|待确认|需要确认|需要验证|尚未验证|待验证|存疑|疑问|not sure|uncertain|unclear)/i.test(value)) return true;
  if (/(是否|要不要|该不该|能不能|可不可以|为什么|怎么|如何|哪个)[^。！？\n]*[?？]/.test(value)) return true;
  if (/(还是|或者)[^。！？\n]*[?？]/.test(value)) return true;
  if (/(need to (check|verify|confirm)|should (i|we)|what|which|whether)/i.test(value)) return true;
  return false;
}

export function extractReasoningQuestions(text) {
  const value = String(text || '').trim();
  if (!value) return [];
  const segments = [];
  for (const line of value.split(/\n+/)) {
    for (const piece of line.split(/(?<=[。！？!?])\s*/)) {
      const candidate = piece.trim();
      if (candidate && isReasoningQuestion(candidate)) segments.push(candidate);
    }
  }
  if (!segments.length && isReasoningQuestion(value)) segments.push(value);
  const seen = new Set();
  const out = [];
  for (const candidate of segments) {
    const key = candidate.replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 4) break;
  }
  return out;
}

export function openReasoningQuestions(state) {
  if (Number(state && state.version) < 3) return [];
  const list = state && Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions : [];
  return list.filter((item) => item && !item.resolvedSeq && item.status !== 'resolved' && item.source === 'summary');
}

function trimReasoningQuestions(list, max = DEFAULT_CONFIG.maxReasoningQuestions) {
  if (list.length <= max) return list;
  const open = list.filter((item) => !item.resolvedSeq);
  const resolved = list.filter((item) => item.resolvedSeq);
  return resolved.slice(-2).concat(open).slice(-max);
}

function addReasoningQuestions(state, event, questions, summary) {
  const candidates = [];
  for (const raw of Array.isArray(questions) ? questions : []) {
    const key = clip(String(raw || '').replace(/\s+/g, ' ').trim(), 300);
    if (!key || candidates.includes(key)) continue;
    candidates.push(key);
    if (candidates.length >= 4) break;
  }
  const list = (Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions : []).map((item) => Object.assign({}, item));
  const resolvedKeys = new Set((state.resolvedReasoningTexts || []).map((item) => String(item || '').replace(/\s+/g, ' ').trim()));
  for (let index = 0; index < candidates.length; index++) {
    const key = candidates[index];
    if (resolvedKeys.has(key)) continue;
    const existing = list.find((item) => String(item.text || '').replace(/\s+/g, ' ').trim() === key);
    if (existing) {
      if (!existing.resolvedSeq) {
        existing.seq = event.seq;
        existing.lastSeenSeq = event.seq;
      }
      continue;
    }
    list.push({
      id: 'q-' + String(event.seq) + '-' + String(index),
      seq: event.seq,
      lastSeenSeq: event.seq,
      text: key,
      source: summary ? 'summary' : 'explicit',
      status: 'open',
      askedSeq: 0,
      resolvedSeq: 0,
      evidence: '',
    });
  }
  const next = {
    reasoningQuestions: trimReasoningQuestions(list),
    reasoningSeq: event.seq,
    reasoningText: '',
    lastAssistantSeq: event.seq,
  };
  if (summary) next.reasoningSummary = summary;
  return Object.assign({}, state, next);
}

export function markReasoningAsked(state, seq) {
  const list = Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions.map((item) => Object.assign({}, item)) : [];
  if (list.length) {
    const open = list.filter((item) => !item.resolvedSeq);
    if (open.length) {
      const latest = open[open.length - 1];
      latest.status = 'waiting';
      latest.askedSeq = seq;
    }
    return Object.assign({}, state, { reasoningQuestions: list, reasoningAskedSeq: seq });
  }
  return Object.assign({}, state, { reasoningAskedSeq: seq });
}

export function resolveReasoningQuestion(state, questionId, seq, evidence) {
  const id = String(questionId || '');
  if (!id) return state;
  const list = Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions.map((item) => Object.assign({}, item)) : [];
  let found = false;
  let resolvedText = '';
  const nextList = list.map((item) => {
    if (item.id !== id || item.resolvedSeq) return item;
    found = true;
    resolvedText = item.text;
    return Object.assign({}, item, {
      status: 'resolved',
      resolvedSeq: seq,
      evidence: clip(redactSecrets(evidence || ''), 260),
    });
  });
  if (found) {
    const key = String(resolvedText || '').replace(/\s+/g, ' ').trim();
    const resolvedReasoningTexts = (state.resolvedReasoningTexts || []).filter((item) => item !== key).concat(key).filter(Boolean).slice(-80);
    const next = Object.assign({}, state, {
      reasoningQuestions: nextList,
      resolvedReasoningTexts,
      reasoningClarifiedSeq: Math.max(Number(state.reasoningClarifiedSeq) || 0, seq),
    });
    const stillOpen = nextList.filter((item) => !item.resolvedSeq);
    if (!stillOpen.length && next.risk && next.risk.kind === 'ambiguity') next.risk = null;
    return next;
  }
  if (id.indexOf('legacy-') === 0 && !list.length) {
    return Object.assign({}, state, {
      reasoningSeq: 0,
      reasoningText: '',
      reasoningAskedSeq: 0,
      reasoningClarifiedSeq: seq,
    });
  }
  return state;
}

function resolveWaitingReasoning(state, seq) {
  const list = Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions.map((item) => Object.assign({}, item)) : [];
  if (list.length) {
    let changed = false;
    const nextList = list.map((item) => {
      if (!item.resolvedSeq && item.status === 'waiting' && Number(item.askedSeq) > 0) {
        changed = true;
        return Object.assign({}, item, {
          status: 'resolved',
          resolvedSeq: seq,
          evidence: 'user reply seq ' + String(seq),
        });
      }
      return item;
    });
    if (!changed) return state;
    const resolvedTexts = nextList.filter((item) => item.resolvedSeq && item.resolvedSeq === seq).map((item) => String(item.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const resolvedReasoningTexts = (state.resolvedReasoningTexts || []).concat(resolvedTexts).filter((item, index, all) => all.indexOf(item) === index).slice(-80);
    const open = nextList.filter((item) => !item.resolvedSeq);
    const latest = open.length ? open[open.length - 1] : null;
    return Object.assign({}, state, {
      reasoningQuestions: nextList,
      resolvedReasoningTexts,
      reasoningSeq: latest ? latest.seq : 0,
      reasoningText: latest ? latest.text : '',
      reasoningAskedSeq: 0,
      reasoningClarifiedSeq: seq,
    });
  }
  if (Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq)) {
    return Object.assign({}, state, {
      reasoningSeq: 0,
      reasoningText: '',
      reasoningAskedSeq: seq,
      reasoningClarifiedSeq: seq,
    });
  }
  return state;
}

export function reasoningTextOf(data) {
  const parts = [];
  const content = data && data.message && data.message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'reasoning' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text);
    }
  }
  const stream = data && data.stream;
  if (Array.isArray(stream)) {
    for (const record of stream) {
      if (!record || record.type !== 'reasoning-chunks' || !Array.isArray(record.texts)) continue;
      for (const text of record.texts) if (typeof text === 'string' && text.trim()) parts.push(text);
    }
  }
  return parts.join('\n');
}

function addBounded(list, item, max) {
  if (!item || !item.text) return list;
  const kept = [];
  for (const existing of list) {
    if (existing.text === item.text) continue;
    kept.push(existing);
  }
  kept.push(item);
  return kept.slice(-max);
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function isWriteTool(name) {
  return /^(write|edit|write_file|edit_file|str_replace_editor|apply_patch|ops_write_file|ops_edit_file)$/.test(String(name || ''));
}

export function isMutatingToolName(name) {
  const value = String(name || '');
  if (!value) return false;
  if (value === 'agents_memory' || value === 'agents_index' || value === 'agents_verify' || value === 'ask_user' || value === 'ask_user_question') return false;
  if (/^(plugin_manager|pluginmanager|plugin_install|plugin_uninstall|plugin_set|set_bundle)$/i.test(value)) return true;
  return /(^|[_:-])(write|edit|patch|delete|create|remove|move|rename|terminal|bash|shell|exec(ute)?|run|command|push|upload|merge|close|comment|update)([_:-]|$)/i.test(value);
}

function toolNameFor(state, toolCallId) {
  const call = toolCallId && state.pendingCalls ? state.pendingCalls[toolCallId] : undefined;
  return call && call.name ? call.name : 'tool';
}

function migrateState(state) {
  if (!state) return state;
  const next = Object.assign({}, state, {
    version: Math.max(4, Number(state.version) || 4),
    continuity: state.continuity || null,
    task: state.task || null,
    authorization: state.authorization || null,
    evidence: Array.isArray(state.evidence) ? state.evidence : [],
    changes: Array.isArray(state.changes) ? state.changes : [],
    checks: Array.isArray(state.checks) ? state.checks : [],
    recovery: Array.isArray(state.recovery) ? state.recovery : [],
    indexAudit: state.indexAudit || null,
  });
  if (Number(state.version) < 3) {
    next.reasoningQuestions = [];
    next.reasoningText = '';
    next.reasoningSummary = null;
    next.reasoningSeq = 0;
    next.reasoningAskedSeq = 0;
    next.reasoningClarifiedSeq = 0;
  }
  return next;
}

export function reduceEvent(state, event, config) {
  state = migrateState(state);
  if (!state || !event || typeof event.type !== 'string') return state;
  const data = event.data || {};
  if (event.type === 'user/message') {
    const sourceKind = data.source && data.source.kind;
    if (sourceKind && sourceKind !== 'user') return state;
    const fullText = textOf(data.content);
    const text = clip(fullText, 360);
    if (!text) return state;
    const item = { seq: event.seq, turn: state.lastTurn, text, correction: isCorrection(text), authority: 'user-stated' };
    const answered = resolveWaitingReasoning(state, event.seq);
    let next = Object.assign({}, answered, {
      requirements: addBounded(answered.requirements, item, DEFAULT_CONFIG.maxRequirements * 2),
      userLog: addBounded(answered.userLog || [], { seq: event.seq, text: clip(fullText, 4000) }, 500),
      reasoningClarifiedSeq: event.seq,
      reasoningAskedSeq: 0,
      lastUserSeq: event.seq,
      lastUserText: clip(fullText, 4000),
      lastUserTurn: state.lastTurn,
      continuity: state.continuity ? Object.assign({}, state.continuity, { status: 'stale' }) : null,
    });
    const task = next.task;
    if (task && task.status === 'proposed') {
      if (isTaskConfirmation(fullText)) {
        const active = Object.assign({}, task, { status: 'active', confirmedSeq: event.seq, updatedSeq: event.seq });
        next = Object.assign({}, next, {
          task: active,
          authorization: { taskId: active.id, status: 'active', scope: active.scope || [], denied: active.exclusions || [], sourceSeq: active.sourceSeq, confirmedSeq: event.seq },
        });
      } else if (isTaskDenial(fullText)) {
        const closed = Object.assign({}, task, { status: 'closed', updatedSeq: event.seq });
        next = Object.assign({}, next, { task: closed, authorization: { taskId: closed.id, status: 'denied', scope: closed.scope || [], denied: closed.exclusions || [], sourceSeq: closed.sourceSeq, confirmedSeq: 0 } });
      }
    }
    return next;
  }
  if (event.type === 'turn/start') {
    const turn = Number(data.turn) || state.lastTurn;
    return Object.assign({}, state, { lastTurn: turn });
  }
  if (event.type === 'turn/end') {
    const turn = Number(data.turn) || state.lastTurn;
    return Object.assign({}, state, { lastTurn: turn });
  }
  if (event.type === 'assistant/message') {
    const rawReasoning = reasoningTextOf(data);
    const summary = parseGuardSummary(rawReasoning);
    const reasoning = stripGuardSummary(stripGuardState(redactSecrets(rawReasoning || '')));
    if (summary) state = addReasoningQuestions(state, event, summary.uncertainties, summary);
    const text = clip(redactSecrets(textOf(data.message && data.message.content)), 360);
    if (!text) return state;
    let next = Object.assign({}, state, { lastAssistantSeq: event.seq });
    if (isDecision(text)) {
      next = Object.assign({}, next, {
        decisions: addBounded(next.decisions, { seq: event.seq, text }, DEFAULT_CONFIG.maxDecisions * 2),
      });
    }
    if (isOpen(text)) {
      next = Object.assign({}, next, {
        openItems: addBounded(next.openItems, { seq: event.seq, text }, DEFAULT_CONFIG.maxOpenItems * 2),
      });
    }
    return next;
  }
  if (event.type === 'assistant/attempt') {
    const rawReasoning = reasoningTextOf(data);
    const summary = parseGuardSummary(rawReasoning);
    const reasoning = stripGuardSummary(stripGuardState(redactSecrets(rawReasoning || '')));
    if (summary) return addReasoningQuestions(state, event, summary.uncertainties, summary);
    return state;
  }
  if (event.type === 'tool/call') {
    const name = String(data.name || 'tool');
    const args = parseArgs(data.arguments);
    const pending = Object.assign({}, state.pendingCalls || {});
    {
      const file = args.file_path || args.path || args.filename;
      const record = { name, file: typeof file === 'string' ? clip(file, 260) : '' };
      record.verify = DEFAULT_CONFIG.reasoningVerifyTools.includes(name) || (name === 'run_code' && codeVerifies(args.code));
      if (name === 'agents_verify') {
        const directIds = verifyIdsFromArgs(args);
        if (directIds.length) {
          record.verifyQuestionIds = directIds;
          record.verifyQuestionId = directIds[0];
        }
      }
      if (name === 'run_code') {
        const verifyIds = agentsVerifyQuestionIds(args.code);
        if (verifyIds.length) {
          record.verifyQuestionIds = verifyIds;
          record.verifyQuestionId = verifyIds[0];
        }
        const safe = safeRunCodeCall(args.code);
        if (safe && safe.name === 'agents_memory') {
          record.memory = {
            kind: String(safe.input.kind || ''),
            text: clip(safe.input.text, 500),
            evidence: clip(safe.input.evidence, 260),
          };
        }
        if (safe && safe.name === 'agents_task') {
          record.task = { action: String(safe.input.action || ''), goal: clip(safe.input.goal, 400), scope: taskList(safe.input.scope), exclusions: taskList(safe.input.exclusions), steps: taskList(safe.input.steps, 20) };
        }
        if (safe && safe.name === 'agents_handoff') record.handoff = safe.input;
        if (safe && safe.name === 'agents_evidence') record.evidence = safe.input;
        if (safe && ['agents_change', 'agents_check', 'agents_recovery'].includes(safe.name)) record[safe.name.slice(7)] = safe.input;
        if (safe && safe.name === 'agents_index' && String(safe.input.action || '') === 'audit') record.audit = true;
        const embedded = embeddedToolCall(args.code);
        if (!safe && embedded && embedded.name === 'agents_memory') {
          record.memory = {
            kind: String(embedded.input.kind || ''),
            text: clip(embedded.input.text, 500),
            evidence: clip(embedded.input.evidence, 260),
          };
        }
        if (!safe && embedded && embedded.name === 'agents_task') {
          record.task = { action: String(embedded.input.action || ''), goal: clip(embedded.input.goal, 400), scope: taskList(embedded.input.scope), exclusions: taskList(embedded.input.exclusions), steps: taskList(embedded.input.steps, 20) };
        }
        if (!safe && embedded && embedded.name === 'agents_handoff') record.handoff = embedded.input;
        if (!safe && embedded && embedded.name === 'agents_evidence') record.evidence = embedded.input;
        if (embedded && ['agents_change', 'agents_check', 'agents_recovery'].includes(embedded.name)) record[embedded.name.slice(7)] = embedded.input;
        if (embedded && embedded.name === 'agents_index' && String(embedded.input.action || '') === 'audit') record.audit = true;
        // PTC can execute several safe calls in one run_code. When there is more
        // than one, embeddedToolCall() is intentionally null; keep every ledger
        // call so the tool/result can project all of them instead of silently
        // dropping the plan before impactGate reads it.
        if (!embedded) {
          const calls = embeddedLedgerCalls(args.code);
          if (calls.length) record.calls = calls;
          // A mixed program can still contain one literal agents_handoff call.
          // Project that save even when another call in the program is dynamic,
          // otherwise the compression gate never sees the handoff.
          if (!calls.some((item) => item.handoff)) {
            const handoff = embeddedHandoffCall(args.code);
            if (handoff) record.handoff = handoff;
          }
        }
        const directTask = taskCallFromCode(args.code);
        if (!record.task && directTask) {
          record.task = { action: String(directTask.action || ''), goal: clip(directTask.goal, 400), scope: taskList(directTask.scope), exclusions: taskList(directTask.exclusions), steps: taskList(directTask.steps, 20) };
        }
      }
      if (name === 'agents_memory') {
        record.memory = {
          kind: String(args.kind || ''),
          text: clip(args.text, 500),
          evidence: clip(args.evidence, 260),
        };
      }
      if (name === 'agents_task') {
        record.task = { action: String(args.action || ''), goal: clip(args.goal, 400), scope: taskList(args.scope), exclusions: taskList(args.exclusions), steps: taskList(args.steps, 20) };
      }
      if (name === 'agents_evidence') {
        record.evidence = { claim: args.claim, source: args.source, mechanism: args.mechanism, conditions: args.conditions, result: args.result, status: args.status, positiveControl: args.positiveControl, note: args.note };
      }
      if (name === 'agents_change') record.change = args;
      if (name === 'agents_check') record.check = args;
      if (name === 'agents_recovery') record.recovery = args;
      if (name === 'agents_handoff') record.handoff = args;
      if (name === 'agents_index' && String(args.action || '') === 'audit') record.audit = true;
      if (data.callId) pending[data.callId] = record;
      if (record.memory || record.task || record.handoff || record.evidence || record.change || record.check || record.recovery || record.audit || record.calls) pending.__last__ = record;
    }
    const keys = Object.keys(pending);
    while (keys.length > 30) {
      const oldest = keys.shift();
      if (oldest) delete pending[oldest];
    }
    let next = Object.assign({}, state, { pendingCalls: pending });
    const directVerifyIds = name === 'agents_verify' ? verifyIdsFromArgs(args) : [];
    const codeVerifyIds = name === 'run_code' ? agentsVerifyQuestionIds(args.code) : [];
    const pendingVerifyIds = directVerifyIds.length ? directVerifyIds : codeVerifyIds;
    if (pendingVerifyIds.length) {
      next = Object.assign({}, next, {
        verifyPending: {
          questionIds: pendingVerifyIds,
          seq: event.seq,
          callId: String(data.callId || ''),
        },
      });
    }
    const safeCallForState = name === 'run_code' ? safeRunCodeCall(args.code) : null;
    const embeddedCallForState = name === 'run_code' && codeIsReadOnly(args.code) ? embeddedToolCall(args.code) : null;
    const recallCallForState = safeCallForState || embeddedCallForState;
    if (name === 'agents_index' || (recallCallForState && recallCallForState.name === 'agents_index')) {
      next = Object.assign({}, next, { agentsIndexSeq: event.seq });
    }
    if (name === 'compress') {
      next = Object.assign({}, next, {
        compressions: (state.compressions || 0) + 1,
        lastCompressSeq: event.seq,
        continuity: next.continuity ? Object.assign({}, next.continuity, { compressedSeq: event.seq }) : null,
      });
    }
    if (name === 'ask_user' || name === 'ask_user_question') {
      next = markReasoningAsked(next, event.seq);
    }
    if (name === 'run_code' && codeAsksUser(args.code)) {
      next = markReasoningAsked(next, event.seq);
    }
    return next;
    return next;
  }
  if (event.type === 'tool/result') {
    const message = data.message || {};
    const callId = message.toolCallId;
    const matchedCall = callId && state.pendingCalls ? state.pendingCalls[callId] : undefined;
    const lastCall = state.pendingCalls ? state.pendingCalls.__last__ : undefined;
    const call = matchedCall || lastCall;
    const name = toolNameFor(state, callId);
    const isError = Boolean(data.error || message.isError);
    let next = state;
    if (lastCall) {
      const pending = Object.assign({}, next.pendingCalls);
      delete pending.__last__;
      next = Object.assign({}, next, { pendingCalls: pending });
    }
    if (call && call.evidence && !isError) {
      next = Object.assign({}, next, {
        evidence: addBounded(next.evidence, evidenceEntryFrom(call.evidence, event.seq), normalizeConfig(config).maxEvidence),
      });
    }
    if (call && call.audit && !isError) {
      let audit = null;
      try {
        const raw = textOf(message.content);
        const parsed = JSON.parse(raw);
        if (parsed && parsed.audit && typeof parsed.audit === 'object') audit = parsed.audit;
      } catch {}
      if (audit) next = Object.assign({}, next, { indexAudit: Object.assign({}, audit, { seq: event.seq }) });
    }
    if (call && Array.isArray(call.calls) && call.calls.length && !isError) {
      for (let slot = 0; slot < call.calls.length; slot++) {
        const entry = call.calls[slot];
        const suffix = slot ? '-' + String(slot) : '';
        if (entry.handoff) {
          const action = String(entry.handoff.action || '');
          if (action === 'save' && handoffHasNext(entry.handoff)) {
            next = Object.assign({}, next, { continuity: handoffEntryFrom(entry.handoff, event.seq, next) });
          } else if (action === 'clear') {
            next = Object.assign({}, next, { continuity: null });
          }
        } else if (entry.change) {
          const action = String(entry.change.action || 'plan');
          const changeId = String(entry.change.changeId || '');
          if (action === 'plan') {
            const created = changeEntryFrom(entry.change, event.seq);
            created.id = created.id + suffix;
            next = Object.assign({}, next, { changes: addBounded(next.changes, created, 40) });
          } else if (action === 'apply') {
            next = updateChange(next, changeId, { status: 'applied', updatedSeq: event.seq });
          } else if (action === 'verify') {
            next = updateChange(next, changeId, { status: 'verified', verifiedSeq: event.seq });
          }
        } else if (entry.check) {
          const action = String(entry.check.action || 'add');
          if (action === 'add') {
            const created = checkEntryFrom(entry.check, event.seq);
            created.id = created.id + suffix;
            next = Object.assign({}, next, { checks: addBounded(next.checks, created, 80) });
          } else if (action === 'record') {
            const status = ['pass', 'fail', 'pending'].includes(String(entry.check.status)) ? String(entry.check.status) : 'pending';
            next = updateCheck(next, entry.check.checkId, { status, actual: clip(entry.check.actual, 300), updatedSeq: event.seq });
          }
        } else if (entry.recovery) {
          const action = String(entry.recovery.action || 'baseline');
          if (action === 'baseline') {
            const created = recoveryEntryFrom(entry.recovery, event.seq);
            created.id = created.id + suffix;
            next = Object.assign({}, next, { recovery: addBounded(next.recovery, created, 40) });
          } else if (action === 'rollback') {
            next = updateRecovery(next, entry.recovery.recoveryId, { status: 'rolled-back', updatedSeq: event.seq });
          } else if (action === 'verify') {
            next = updateRecovery(next, entry.recovery.recoveryId, { status: 'verified', updatedSeq: event.seq });
          }
        }
      }
    }
    if (call && call.change && !isError) {
      const action = String(call.change.action || 'plan');
      const changeId = String(call.change.changeId || '');
      if (action === 'plan') {
        const entry = changeEntryFrom(call.change, event.seq);
        next = Object.assign({}, next, { changes: addBounded(next.changes, entry, 40) });
      } else if (action === 'apply') {
        next = updateChange(next, changeId, { status: 'applied', updatedSeq: event.seq });
      } else if (action === 'verify') {
        next = updateChange(next, changeId, { status: 'verified', verifiedSeq: event.seq });
      }
    }
    if (call && call.check && !isError) {
      const action = String(call.check.action || 'add');
      if (action === 'add') {
        next = Object.assign({}, next, { checks: addBounded(next.checks, checkEntryFrom(call.check, event.seq), 80) });
      } else if (action === 'record') {
        const status = ['pass', 'fail', 'pending'].includes(String(call.check.status)) ? String(call.check.status) : 'pending';
        next = updateCheck(next, call.check.checkId, { status, actual: clip(call.check.actual, 300), updatedSeq: event.seq });
      }
    }
    if (call && call.recovery && !isError) {
      const action = String(call.recovery.action || 'baseline');
      if (action === 'baseline') {
        next = Object.assign({}, next, { recovery: addBounded(next.recovery, recoveryEntryFrom(call.recovery, event.seq), 40) });
      } else if (action === 'rollback') {
        next = updateRecovery(next, call.recovery.recoveryId, { status: 'rolled-back', updatedSeq: event.seq });
      } else if (action === 'verify') {
        next = updateRecovery(next, call.recovery.recoveryId, { status: 'verified', updatedSeq: event.seq });
      }
    }
    const verifyPending = state.verifyPending;
    if (isError) {
      const reason = data.error && (data.error.reason || data.error.code)
        ? String(data.error.reason || data.error.code)
        : clip(textOf(message.content), 240) || 'tool failed';
      next = Object.assign({}, next, {
        failures: addBounded(next.failures, { seq: event.seq, name, text: clip(reason, 240) }, DEFAULT_CONFIG.maxFailures * 2),
      });
    }
    if (call && !isError && isWriteTool(name) && call.file) {
      next = Object.assign({}, next, {
        changedFiles: addBounded(next.changedFiles, { seq: event.seq, name, text: call.file }, DEFAULT_CONFIG.maxChangedFiles * 2),
      });
    }
    if (call && call.memory && !isError) {
      next = Object.assign({}, next, { memoryRecordedSeq: event.seq });
      const memory = call.memory;
      if (memory.text && memory.kind) {
        next = Object.assign({}, next, {
          llmEntries: addBounded(next.llmEntries, {
            id: 'proj-' + event.seq,
            seq: event.seq,
            kind: memory.kind,
            text: clip(redactSecrets(memory.text), 360),
            source: 'model',
            evidence: clip(redactSecrets(memory.evidence || ''), 260),
            authority: authorityFor(memory.kind),
          }, DEFAULT_CONFIG.maxLlmEntries),
        });
      }
    }
    if (call && call.task && !isError) {
      const action = call.task.action;
      if (action === 'start') {
        const task = {
          id: 'task-' + event.seq,
          goal: clip(redactSecrets(call.task.goal || ''), 400),
          scope: taskList(call.task.scope),
          exclusions: taskList(call.task.exclusions),
          steps: taskList(call.task.steps, 20),
          status: 'proposed',
          sourceSeq: next.lastUserSeq,
          confirmedSeq: 0,
          updatedSeq: event.seq,
        };
        next = Object.assign({}, next, {
          task,
          authorization: { taskId: task.id, status: 'proposed', scope: task.scope, denied: task.exclusions, sourceSeq: task.sourceSeq, confirmedSeq: 0 },
        });
      } else if (action === 'close' && next.task) {
        const task = Object.assign({}, next.task, { status: 'closed', updatedSeq: event.seq });
        next = Object.assign({}, next, {
          task,
          authorization: { taskId: task.id, status: 'denied', scope: task.scope || [], denied: task.exclusions || [], sourceSeq: task.sourceSeq, confirmedSeq: task.confirmedSeq || 0 },
        });
      } else if (action === 'confirm' && next.task && next.task.status === 'proposed' && isTaskConfirmation(next.lastUserText)) {
        const task = Object.assign({}, next.task, { status: 'active', confirmedSeq: next.lastUserSeq, updatedSeq: event.seq });
        next = Object.assign({}, next, {
          task,
          authorization: { taskId: task.id, status: 'active', scope: task.scope || [], denied: task.exclusions || [], sourceSeq: task.sourceSeq, confirmedSeq: task.confirmedSeq },
        });
      }
    }
    if (call && call.handoff && !isError) {
      const action = String(call.handoff.action || '');
      if (action === 'save' && handoffHasNext(call.handoff)) {
        next = Object.assign({}, next, { continuity: handoffEntryFrom(call.handoff, event.seq, next) });
      } else if (action === 'clear') {
        next = Object.assign({}, next, { continuity: null });
      }
    }
    if (call && !isError) {
      const evidence = clip(textOf(message.content), 300) || 'agents_verify result';
      const verifyIds = Array.isArray(call.verifyQuestionIds) && call.verifyQuestionIds.length
        ? call.verifyQuestionIds
        : (call.verifyQuestionId ? [call.verifyQuestionId] : []);
      for (const verifyId of verifyIds) next = resolveReasoningQuestion(next, verifyId, event.seq, evidence);
    }
    if (verifyPending && Array.isArray(verifyPending.questionIds) && verifyPending.questionIds.length) {
      const matchesCall = !verifyPending.callId || !callId || verifyPending.callId === String(callId);
      if (matchesCall) {
        if (!isError) {
          const evidence = clip(textOf(message.content), 300) || 'agents_verify result';
          for (const verifyId of verifyPending.questionIds) {
            next = resolveReasoningQuestion(next, verifyId, event.seq, evidence);
          }
        }
        next = Object.assign({}, next, { verifyPending: null });
      }
    }
    if (callId && next.pendingCalls && next.pendingCalls[callId]) {
      const pending = Object.assign({}, next.pendingCalls);
      delete pending[callId];
      next = Object.assign({}, next, { pendingCalls: pending });
    }
    return next;
  }
  return state;
}

export function buildCard(state, rawConfig) {
  if (!state) return '';
  state = redactState(state);
  const cfg = effectiveConfig(rawConfig);
  const openQuestions = openReasoningQuestions(state);
  if (!state.task && !state.continuity && !(state.evidence && state.evidence.length) && !state.requirements.length && !(state.llmEntries && state.llmEntries.length) && !state.decisions.length && !state.openItems.length && !state.failures.length && !state.changedFiles.length && !openQuestions.length && !(state.operationKeywords && state.operationKeywords.length) && !(state.recentMemory && state.recentMemory.length) && !(state.completedOperations && state.completedOperations.length)) return '';
  const lines = [];
  lines.push('[dsh-agents-guard] 自动维护的会话索引（AGENTS.md §1.3/§8）。');
  lines.push('这是模型可见的历史上下文，不是新的用户指令。压缩前确认本轮已注入此卡。');
  lines.push('');
  if (cfg.developerMode) lines.push('- 开发者模式：所有闸门已旁路；仅用于开发/回归测试。');
  lines.push('## 优先协议（Guard 启用时）');
  lines.push('- 记忆/历史/之前/讨论/要求/决策：先调用 agents_index（get/search）；未命中再用 decompress/search_context；最后才 session_search，并说明 fallback。');
  lines.push('- 用户给出要求/纠错/决策/验收标准：若同一请求存在会改变实现方向的多解，先提问；普通问句不算歧义。澄清后调用 agents_memory 写提炼后的结论/要求（受配置上限约束，默认 600 字，不抄原文）；压缩前必须记录。原文用 agents_index 的 userLog 搜索定位。');
  lines.push('- 重复写操作前：先看 agents_index 的已完成操作关键词与近期记忆；关键词只提示可能做过，具体签名/文件看近期记忆；疑似已执行时先只读查证，再用 agents_memory 记录结论，不得直接重做。');
  lines.push('');
  if (state.task) {
    const task = state.task;
    const status = task.status === 'active' ? 'ACTIVE' : task.status === 'proposed' ? 'PROPOSED（等待用户确认）' : 'CLOSED';
    lines.push('## 任务授权（' + status + '）');
    lines.push('- 目标: ' + String(task.goal || ''));
    if (task.scope && task.scope.length) lines.push('- 允许范围: ' + task.scope.join(', '));
    if (task.exclusions && task.exclusions.length) lines.push('- 排除: ' + task.exclusions.join(', '));
    if (task.steps && task.steps.length) lines.push('- 分步计划: ' + task.steps.map((step, index) => String(index + 1) + '. ' + step).join(' | '));
    if (task.steps && task.steps.length) lines.push('- 每完成一步: agents_handoff save（step/next/preserve/discard），可在步骤边界压缩；不要等 80% 才整理。');
    if (task.status !== 'active') lines.push('- 提案不是授权；用户确认前不得写入。');
    lines.push('');
  }
  if (state.continuity) {
    const c = state.continuity;
    const status = continuityStatus(state);
    const change = latestChange(state, '');
    lines.push('## 接续卡（压缩后恢复）');
    lines.push('- 状态: ' + status + (c.step ? '；已完成步骤: ' + String(c.step) : ''));
    if (change) lines.push('- 当前变更: ' + String(change.id || '') + ' [' + String(change.status || '') + '] ' + String(change.target || '') + (change.invariants && change.invariants.length ? '；不变: ' + change.invariants.join('; ') : ''));
    if (c.next) lines.push('- 下一步: ' + String(c.next));
    if (c.preserve && c.preserve.length) lines.push('- 必须保留: ' + c.preserve.join('; '));
    if (c.discard && c.discard.length) lines.push('- 可丢弃临时材料: ' + c.discard.join('; '));
    if (c.risks && c.risks.length) lines.push('- 不能忘的风险: ' + c.risks.join('; '));
    if (status !== 'ready') lines.push('- 接续已过期或不完整：压缩前调用 agents_handoff save 补齐 step/next/preserve/discard。');
    lines.push('- 压缩后按此卡继续，不重做已完成操作。');
    lines.push('');
  }
  const reqs = state.requirements.slice(-cfg.maxRequirements);
  if (reqs.length) {
    lines.push('## 用户要求/纠错（原文摘要，供 agents_index 定位）');
    for (const item of reqs) lines.push('- [user-stated] ' + (item.correction ? '[纠错] ' : '') + item.text);
    lines.push('');
  }
  const memories = (state.llmEntries || []).slice(-Math.min(cfg.maxLlmEntries, 12));
  if (memories.length) {
    lines.push('## LLM 记录（模型提炼，需回查证据）');
    for (const item of memories) lines.push('- [' + item.kind + (item.authority ? '|' + item.authority : '') + '] ' + item.text + (item.evidence ? ' | 证据: ' + item.evidence : ''));
    lines.push('');
  }
  if (openQuestions.length) {
    lines.push('## 思考疑问闸门（按疑问独立）');
    for (const question of openQuestions) {
      const waiting = question.status === 'waiting' || Number(question.askedSeq) >= Number(question.seq);
      lines.push('- [' + (waiting ? 'WAITING' : 'OPEN') + '] ' + question.id + ': ' + question.text);
    }
    lines.push('- 解除条件: 调用 agents_verify({questionId 或 questionIds, op, path/pattern})；一次成功解除所列全部 ID；未列出的疑问保留。');
    lines.push('');
  }
  const evidence = (state.evidence || []).slice(-6);
  if (evidence.length) {
    lines.push('## 结构化证据');
    for (const item of evidence) lines.push('- [' + item.status + '] ' + item.id + ': ' + item.claim + ' — ' + item.result + '（' + item.source + '/' + item.mechanism + '）');
    lines.push('- 模型只能标记 observed/contradicted；verified 必须由证据链或独立验证支撑。');
    lines.push('');
  }
  const decisions = state.decisions.slice(-cfg.maxDecisions);
  if (decisions.length) {
    lines.push('## 候选决策（启发式，需回查原话）');
    for (const item of decisions) lines.push('- ' + item.text);
    lines.push('');
  }
  const opens = state.openItems.slice(-cfg.maxOpenItems);
  if (opens.length) {
    lines.push('## 未决/开放项（启发式）');
    for (const item of opens) lines.push('- ' + item.text);
    lines.push('');
  }
  const failures = state.failures.slice(-cfg.maxFailures);
  if (failures.length) {
    lines.push('## 最近工具失败');
    for (const item of failures) lines.push('- ' + item.name + ': ' + item.text);
    lines.push('');
  }
  const files = state.changedFiles.slice(-cfg.maxChangedFiles);
  if (files.length) {
    lines.push('## 已改文件');
    for (const item of files) lines.push('- ' + item.text);
    lines.push('');
  }
  const keywords = (state.operationKeywords || []).slice(-12);
  if (keywords.length) {
    lines.push('## 已完成操作关键词（缩略记忆）');
    lines.push('- ' + keywords.map((item) => String(item.keyword || '') + '×' + String(item.count || 1)).join('、'));
    lines.push('- 关键词只提示可能做过；需要复核时看下方近期记忆，并先用只读证据确认。');
    lines.push('');
  }
  const recent = (state.recentMemory || state.recentOperations || state.completedOperations || []).slice(-5);
  if (recent.length) {
    lines.push('## 近期记忆（详细；超出上限自动移除最早）');
    for (const item of recent) {
      const kind = item.kind || 'operation';
      const detail = item.detail || item.name || item.text || '';
      const sig = item.signature ? ' (' + String(item.signature).slice(0, 24) + ')' : '';
      lines.push('- seq ' + String(item.seq) + ' [' + kind + '] ' + String(detail) + sig);
    }
    lines.push('');
  }
  if (state.continuity) {
    const capsule = buildContinuity(state, cfg);
    lines.push('## 接续卡');
    lines.push(capsule.text);
    lines.push('');
  }
  lines.push('## 索引状态');
  lines.push('- lastUserSeq=' + String(state.lastUserSeq) + ' lastTurn=' + String(state.lastTurn) + ' compressions=' + String(state.compressions));
  let out = lines.join('\n').trim();
  while (out.length > cfg.maxCardChars && lines.length > 4) {
    lines.pop();
    out = lines.join('\n').trim();
  }
  if (out.length > cfg.maxCardChars) out = out.slice(0, Math.max(1, cfg.maxCardChars - 1)) + '…';
  return out;
}

export function renderIndexMarkdown(state, sessionId, rawConfig) {
  state = redactState(state);
  const cfg = effectiveConfig(rawConfig);
  const openQuestions = openReasoningQuestions(state);
  const lines = [];
  lines.push(CARD_BEGIN);
  lines.push('# AGENT_CONTEXT_INDEX.md（由 dsh-agents-guard 自动维护）');
  lines.push('');
  lines.push('> 会话: ' + String(sessionId || 'unknown'));
  lines.push('> 更新时间: ' + new Date().toISOString());
  lines.push('> 这是插件生成的只读区块；区块外的手工内容会保留。');
  lines.push('');
  lines.push('## 用户要求/纠错（最近）');
  if (!state.requirements.length) lines.push('- （尚无）');
  for (const item of state.requirements.slice(-cfg.maxRequirements)) lines.push('- [user-stated] ' + (item.correction ? '[纠错] ' : '') + item.text);
  lines.push('');
  lines.push('## LLM 记录（模型写入，需回查证据）');
  if (!state.llmEntries || !state.llmEntries.length) lines.push('- （尚无）');
  for (const item of (state.llmEntries || []).slice(-cfg.maxLlmEntries)) lines.push('- [' + item.kind + '] ' + item.text + (item.evidence ? ' | 证据: ' + item.evidence : ''));
  lines.push('');
  lines.push('## 思考疑问闸门（按疑问独立）');
  if (openQuestions.length) {
    for (const question of openQuestions) {
      const waiting = question.status === 'waiting' || Number(question.askedSeq) >= Number(question.seq);
      lines.push('- [' + (waiting ? 'WAITING' : 'OPEN') + '] ' + question.id + ': ' + question.text);
    }
    lines.push('- 解除条件: 调用 agents_verify（questionId 或 questionIds）；一次成功解除所列全部 ID。');
  } else {
    lines.push('- 未触发');
  }
  lines.push('');
  lines.push('## 候选决策（启发式）');
  if (!state.decisions.length) lines.push('- （尚无）');
  for (const item of state.decisions.slice(-cfg.maxDecisions)) lines.push('- ' + item.text);
  lines.push('');
  lines.push('## 未决/开放项（启发式）');
  if (!state.openItems.length) lines.push('- （尚无）');
  for (const item of state.openItems.slice(-cfg.maxOpenItems)) lines.push('- ' + item.text);
  lines.push('');
  lines.push('## 最近工具失败');
  if (!state.failures.length) lines.push('- （尚无）');
  for (const item of state.failures.slice(-cfg.maxFailures)) lines.push('- ' + item.name + ': ' + item.text);
  lines.push('');
  lines.push('## 已改文件');
  if (!state.changedFiles.length) lines.push('- （尚无）');
  for (const item of state.changedFiles.slice(-cfg.maxChangedFiles)) lines.push('- ' + item.text);
  lines.push('');
  lines.push('## 索引状态');
  lines.push('- lastUserSeq=' + String(state.lastUserSeq));
  lines.push('- lastAssistantSeq=' + String(state.lastAssistantSeq));
  lines.push('- lastTurn=' + String(state.lastTurn));
  lines.push('- compressions=' + String(state.compressions));
  lines.push('- reasoningSeq=' + String(state.reasoningSeq) + ' reasoningAskedSeq=' + String(state.reasoningAskedSeq) + ' reasoningClarifiedSeq=' + String(state.reasoningClarifiedSeq));
  lines.push('- openReasoningQuestions=' + String(openQuestions.length));
  lines.push(CARD_END);
  return lines.join('\n');
}


export function parseIndexMemory(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  const entries = [];
  let inMemory = false;
  for (const line of lines) {
    if (/^##\s+LLM 记录/.test(line)) { inMemory = true; continue; }
    if (inMemory && /^##\s+/.test(line)) break;
    if (!inMemory || !line.startsWith('- [')) continue;
    const match = line.match(/^- \[([^|\]]+)(?:\|([^\]]+))?\]\s+(.*?)(?:\s+\| 证据:\s+(.*))?$/);
    if (!match) continue;
    const kind = match[1].trim();
    const textValue = match[3].trim();
    if (!kind || !textValue) continue;
    entries.push({
      id: 'persisted-' + entries.length,
      kind,
      text: textValue,
      source: 'model',
      evidence: match[4] ? match[4].trim() : '',
      authority: (match[2] || 'model-inferred').trim(),
      persisted: true,
    });
  }
  return entries;
}

export function upsertGeneratedBlock(existing, generated) {
  const current = String(existing == null ? '' : existing);
  const begin = current.indexOf(CARD_BEGIN);
  const end = current.indexOf(CARD_END);
  if (begin >= 0 && end >= begin) {
    return current.slice(0, begin) + generated + current.slice(end + CARD_END.length);
  }
  if (!current.trim()) return generated + '\n';
  return current.replace(/\s+$/, '') + '\n\n' + generated + '\n';
}

export function hashCard(card) {
  const text = String(card || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function shouldForceCompress(input) {
  const cfg = input || {};
  const configured = Number(cfg.compressPressureRatio);
  const threshold = Number.isFinite(configured) && configured > 0 && configured <= 1
    ? configured
    : DEFAULT_CONFIG.compressPressureRatio;
  const pressureTokens = Number(cfg.pressureTokens);
  const contextWindow = Number(cfg.contextWindow);
  if (!Number.isFinite(pressureTokens) || !Number.isFinite(contextWindow) || pressureTokens <= 0 || contextWindow <= 0) {
    return { forced: false, ratio: 0, threshold };
  }
  const ratio = pressureTokens / contextWindow;
  return { forced: ratio >= threshold, ratio, threshold };
}

export function decideCompress(input) {
  const cfg = input || {};
  if (cfg.developerMode) return { allow: true, developerMode: true };
  if (!cfg.denyCompress) return { allow: true };
  const pressure = shouldForceCompress(cfg);
  if (pressure.forced) {
    return { allow: true, forced: true, pressureRatio: pressure.ratio, threshold: pressure.threshold };
  }
  const state = cfg.state;
  if (!state) {
    return { allow: false, reason: 'dsh-agents-guard: session index is unavailable; do not compress until the index is rebuilt. Continue the task and let the plugin refold the session log.' };
  }
  if (!state.lastUserSeq) return { allow: true };
  const mark = cfg.mark;
  if (!mark) {
    if (cfg.legacyCompressWithoutCard) return { allow: true };
    return { allow: false, reason: 'dsh-agents-guard: no index card has been injected in this session. Do not compress active requirements; first call agents_memory to record the latest requirements/decisions/corrections, then wait for the next turn start and compress only after the card is present.' };
  }
  // Card freshness is decided by the user-message sequence, not by turn
  // equality. The mark records event.data.turn (or state.lastTurn) at
  // injection time, while the gate reads turnBoundaryOf(session).lastTurn;
  // the counters can disagree, and the mark only advanced after
  // agent.inject resolved, so a skipped, pending, or rejected injection
  // froze it and rejected every later compress with a "belongs to turn"
  // message the model could not repair inside the turn.
  if (Number(mark.seq) < Number(state.lastUserSeq)) {
    return { allow: false, reason: 'dsh-agents-guard: the index card covers user seq ' + String(mark.seq) + ' but the latest user message is seq ' + String(state.lastUserSeq) + '. Do not compress active requirements; call agents_memory to record the latest requirement/decision/correction now, then wait for the next turn start so the new memory enters the index.' };
  }
  return { allow: true };
}

const RECALL_FALLBACK_TOOLS = new Set([
  'session_search', 'session_event_search', 'session_event_trace', 'session_trace', 'session_event_read', 'search_context',
]);

export function isRecallIntent(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  return /(回忆|记得|还记得|记住|之前|上次|以前|先前|历史|讨论|评审|要求|需求|决定|结论|问题清单|上下文|我们[^。！？\n]{0,60}(?:说|定|讨论)|earlier|previous|last time|recall|remember|historical|requirements?|decisions?|discussion|context)/i.test(value);
}

export function decideRecall(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.recallGate) return { allow: true };
  const state = input && input.state;
  const toolName = String((input && input.toolName) || '');
  if (!state || !state.lastUserText || !isRecallIntent(state.lastUserText)) return { allow: true };
  if (!RECALL_FALLBACK_TOOLS.has(toolName)) return { allow: true };
  if (Number(state.agentsIndexSeq) >= Number(state.lastUserSeq)) return { allow: true };
  return {
    allow: false,
    reason: 'dsh-agents-guard: this is a recall/history request. Call agents_index first (action "get" or "search") before session_search, session_event_search, session_event_trace, session_trace, session_event_read, or search_context. If agents_index is not exposed, load it with deep_ptc_tools or call it with run_code as exactly one `await tools.agents_index({...})`. After agents_index returns, a search fallback is allowed.',
  };
}

export function isRecordIntent(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  return /(必须|不要|禁止|不得|纠正|改为|改成|采用|决定|记住|以后|要求|需求|验收|注意|记录|不完整|缺失|不准确|错了|请记住|别忘了)/.test(value);
}

export function decideRecord(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.recordGate) return { allow: true };
  const state = input && input.state;
  const toolName = String((input && input.toolName) || '');
  if (!state || !state.lastUserText || !isRecordIntent(state.lastUserText)) return { allow: true };
  if (Number(state.memoryRecordedSeq) >= Number(state.lastUserSeq)) return { allow: true };
  if (toolName === 'agents_memory' || toolName === 'agents_index' || toolName === 'agents_verify' || toolName === 'agents_task' || toolName === 'ask_user' || toolName === 'ask_user_question') return { allow: true };
  if (toolName === 'run_code' && codeIsReadOnly(input && input.code)) {
    const code = String(input && input.code ? input.code : '');
    if (/agents_memory/.test(code) && !safeRunCodeCall(code) && !(embeddedToolCall(code) && embeddedToolCall(code).name === 'agents_memory')) {
      return { allow: false, reason: 'dsh-agents-guard: the latest user message contains a requirement/correction/decision. Call agents_memory with exactly one JSON or JavaScript object-literal call, e.g. `await tools.agents_memory({"action":"add","kind":"correction","text":"..."})`. Read-only run_code without agents_memory remains allowed.' };
    }
    return { allow: true };
  }
  if (toolName === 'run_code') return { allow: false, reason: 'dsh-agents-guard: the latest user message contains a requirement/correction/decision. Before a mutating run_code, call agents_memory to record a distilled conclusion, e.g. `await tools.agents_memory({"action":"add","kind":"correction","text":"..."})`. Read-only run_code is allowed without prior recording.' };
  if (!isMutatingToolName(toolName) && toolName !== 'compress') return { allow: true };
  return {
    allow: false,
    reason: 'dsh-agents-guard: the latest user message contains a requirement/correction/decision. Before write/edit/pwsh/compress or a non-read-only run_code, call run_code with exactly one agents_memory call (JSON or JavaScript object literal), e.g. `await tools.agents_memory({"action":"add","kind":"correction","text":"..."})`, to record a distilled conclusion/requirement (within the configured limit, default 600 characters), not a copy of the raw message; locate the original with agents_index search. Read-only tools remain available.',
  };
}

// --- Reasoning risk state (0.6.0) -----------------------------------------
// The risk gate is deliberately independent of the keyword detector. It
// folds a small, auditable state from reasoning events and tool events; the
// model may add one GUARD_STATE line when the guard reports a risk.

export const RISK_KINDS = ['ambiguity', 'loop', 'drift', 'repeat'];

const GUARD_STATE_ENUMS = {
  ambiguity: ['none', 'low', 'blocking'],
  progress: ['new_evidence', 'exclusion', 'decision', 'none'],
  loop: ['none', 'suspected'],
  drift: ['aligned', 'risk'],
};

export function emptyReasoningState(header) {
  return {
    version: 4,
    sessionId: header && header.id ? String(header.id) : '',
    cwd: header && header.cwd ? String(header.cwd) : '',
    lastSeq: 0,
    lastTurn: 0,
    goal: { seq: 0, text: '' },
    constraints: [],
    trail: [],
    loopCount: 0,
    lastEvidenceSeq: 0,
    lastToolSignature: '',
    toolRepeatCount: 0,
    lastCall: null,
    completed: [],
    operationKeywords: [],
    recentMemory: [],
    evidence: [],
    selfReport: null,
    risk: null,
    transitions: [],
  };
}

function stableRisk(state, event, kind, reason) {
  const safeReason = clip(redactSecrets(reason), 500);
  if (state.risk && state.risk.required) {
    return Object.assign({}, state.risk, { lastSeq: event.seq, reason: safeReason });
  }
  return {
    id: 'risk-' + String(event.seq) + '-' + kind,
    seq: event.seq,
    lastSeq: event.seq,
    kind,
    reason: safeReason,
    required: true,
    review: 'pending',
    reviewReason: '',
  };
}

function transition(state, item) {
  const list = (state.transitions || []).concat([item]).slice(-20);
  return Object.assign({}, state, { transitions: list });
}

export function parseGuardState(text) {
  const source = String(text || '');
  let fenced = false;
  let raw = '';
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const marker = line.toUpperCase().indexOf('GUARD_STATE');
    if (marker < 0) continue;
    const start = line.indexOf('{', marker);
    const end = line.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    raw = line.slice(start, end + 1);
  }
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  for (const key of Object.keys(GUARD_STATE_ENUMS)) {
    if (!GUARD_STATE_ENUMS[key].includes(String(data[key]))) return null;
  }
  return {
    ambiguity: String(data.ambiguity),
    progress: String(data.progress),
    loop: String(data.loop),
    drift: String(data.drift),
    next: typeof data.next === 'string' ? clip(data.next, 200) : '',
    raw: clip(raw, 800),
  };
}

export function stripGuardState(text) {
  return String(text || '').replace(/GUARD_STATE\s*\{[^\n]*\}/gi, ' ');
}

function guardJsonLine(source, marker) {
  let fenced = false;
  let raw = '';
  for (const line of String(source || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const at = line.toUpperCase().indexOf(marker);
    if (at < 0) continue;
    const start = line.indexOf('{', at);
    const end = line.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    raw = line.slice(start, end + 1);
  }
  return raw || null;
}

export function parseGuardSummary(text) {
  const raw = guardJsonLine(text, 'GUARD_SUMMARY');
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const list = (value, max) => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => clip(redactSecrets(item.trim()), 300)).slice(0, max)
    : [];
  const summary = {
    goal: typeof data.goal === 'string' ? clip(redactSecrets(data.goal), 500) : '',
    decisions: list(data.decisions, 8),
    uncertainties: list(data.uncertainties, 4),
    next: typeof data.next === 'string' ? clip(redactSecrets(data.next), 300) : '',
    constraints: list(data.constraints, 8),
  };
  if (!summary.goal && !summary.decisions.length && !summary.uncertainties.length && !summary.next && !summary.constraints.length) return null;
  return summary;
}

export function stripGuardSummary(text) {
  return String(text || '').replace(/GUARD_SUMMARY\s*\{[^\n]*\}/gi, ' ');
}

export function extractExplicitQuestions(text) {
  const value = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .trim();
  if (!value) return [];
  const out = [];
  for (const line of value.split(/\n+/)) {
    if (/(isReasoningQuestion|assert\.|expect\(|\btest\()/.test(line)) continue;
    for (const piece of line.split(/(?<=[。！？!?])\s*/)) {
      const candidate = piece.trim();
      if (!candidate || candidate.length > 300) continue;
      if (!isReasoningQuestion(candidate)) continue;
      if (out.includes(candidate)) continue;
      out.push(candidate);
      if (out.length >= 2) return out;
    }
  }
  return out;
}

function normalizeReasoningText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/GUARD_STATE\s*\{[^\n]*\}/gi, ' ')
    .replace(/GUARD_SUMMARY\s*\{[^\n]*\}/gi, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 4000);
}

function reasoningTokens(value) {
  const tokens = new Set();
  for (const word of value.match(/[a-z0-9]+/g) || []) {
    if (word.length > 2) tokens.add(word);
  }
  const cjk = value.replace(/[^\u4e00-\u9fff]/g, '');
  for (let index = 0; index + 1 < cjk.length; index += 1) tokens.add(cjk.slice(index, index + 2));
  return tokens;
}

export function reasoningSimilarity(a, b) {
  const left = normalizeReasoningText(a);
  const right = normalizeReasoningText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = reasoningTokens(left);
  const rightTokens = reasoningTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let both = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) both += 1;
  const union = leftTokens.size + rightTokens.size - both;
  const jaccard = union > 0 ? both / union : 0;
  const containment = both / Math.min(leftTokens.size, rightTokens.size);
  return Math.max(jaccard, containment);
}

function shortHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function toolMutates(name, args) {
  if (name === 'run_code') return !codeIsReadOnly(args && args.code);
  return isMutatingToolName(name) || name === 'compress';
}

function goalConstraints(text) {
  const matches = String(text || '').match(/(只读|不要(?:写|改|修改|提交|推送|安装|删除|动)|先(?:分析|看|读|检查)|暂时不要|别改)/g) || [];
  const seen = new Set();
  const out = [];
  for (const item of matches) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.slice(0, 6);
}

function leafName(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.replace(/[\\/]+$/, '').split(/[\\/]/).pop().slice(0, 80);
}

function operationKeyword(name, args) {
  const tool = String(name || 'tool');
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const file = input.path || input.file_path || input.file || input.filename || input.target;
  if (file) return clip(tool + ':' + leafName(file), 80);
  if (['pwsh', 'terminal', 'bash', 'shell', 'exec'].includes(tool)) {
    const command = String(input.command || input.cmd || '').trim().split(/\s+/)[0];
    return command ? clip(tool + ':' + command, 80) : tool;
  }
  return tool;
}

function operationDetail(name, args) {
  const tool = String(name || 'tool');
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const file = input.path || input.file_path || input.file || input.filename || input.target;
  if (file) return clip(tool + ' ' + String(file), 180);
  if (['pwsh', 'terminal', 'bash', 'shell', 'exec'].includes(tool)) {
    const command = String(input.command || input.cmd || '').trim().split(/\s+/)[0];
    return command ? clip(tool + ' ' + command, 120) : tool;
  }
  return tool;
}

function bumpOperationKeyword(list, keyword, seq) {
  const key = clip(String(keyword || ''), 80);
  if (!key) return list || [];
  const next = (Array.isArray(list) ? list : []).map((item) => Object.assign({}, item));
  const found = next.find((item) => item && item.keyword === key);
  if (found) {
    found.count = (Number(found.count) || 0) + 1;
    found.lastSeq = seq;
  } else {
    next.push({ keyword: key, count: 1, lastSeq: seq });
  }
  return next.slice(-60);
}

function migrateReasoningState(state) {
  if (!state || typeof state !== 'object') return state;
  if (Number(state.version) >= 4) return state;
  const next = Object.assign({}, state, { version: 4 });
  if (next.risk && next.risk.kind === 'ambiguity') next.risk = null;
  return next;
}

export function reduceReasoningEvent(state, event, config) {
  state = migrateReasoningState(state);
  if (!state || !event || typeof event.type !== 'string') return state;
  const cfg = config || {};
  const loopThreshold = Number(cfg.loopThreshold) || 2;
  const repeatThreshold = Number(cfg.toolRepeatThreshold) || 3;
  const data = event.data || {};
  if (event.type === 'user/message') {
    const sourceKind = data.source && data.source.kind;
    if (sourceKind && sourceKind !== 'user') return state;
    const text = clip(redactSecrets(textOf(data.content)), 2000);
    if (!text) return state;
    const next = Object.assign({}, state, {
      lastSeq: event.seq,
      goal: { seq: event.seq, text },
      constraints: goalConstraints(text),
      trail: [],
      loopCount: 0,
      lastToolSignature: '',
      toolRepeatCount: 0,
      selfReport: null,
      risk: null,
    });
    return transition(next, { seq: event.seq, type: 'user-reset', reason: 'new user message' });
  }
  if (event.type === 'turn/start' || event.type === 'turn/end') {
    return Object.assign({}, state, { lastSeq: event.seq, lastTurn: Number(data.turn) || state.lastTurn });
  }
  if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
    const full = reasoningTextOf(data);
    if (!full || !full.trim()) return state;
    const summary = parseGuardSummary(full);
    const report = parseGuardState(full);
    const normalized = normalizeReasoningText(stripGuardSummary(stripGuardState(full)));
    let next = Object.assign({}, state, { lastSeq: event.seq });
    if (report) next.selfReport = Object.assign({ seq: event.seq }, report);
    if (report && report.next) {
      const recentMax = Math.max(3, Math.min(50, Number(cfg.recentMemoryMax) || 12));
      next.recentMemory = (state.recentMemory || []).concat([{
        seq: event.seq,
        kind: 'thought',
        detail: clip(redactSecrets(report.next), 200),
      }]).slice(-recentMax);
    }
    let risk = state.risk;
    let reportClear = false;
    if (report) {
      const risky = report.ambiguity === 'blocking' || report.loop === 'suspected' || report.drift === 'risk';
      reportClear = !risky && report.progress !== 'none';
      if (risky) {
        const kind = report.ambiguity === 'blocking' ? 'ambiguity' : report.drift === 'risk' ? 'drift' : 'loop';
        risk = stableRisk(next, event, kind, 'self-report: ' + (report.next || report.raw));
      } else if (risk && reportClear) {
        risk = null;
      }
    }
    if (event.type === 'assistant/message' && normalized.length >= 20) {
      const repeated = (state.trail || []).some((item) => item && Number(item.seq) > Number(state.lastEvidenceSeq || 0) && reasoningSimilarity(normalized, item.text) >= 0.82);
      const loopCount = repeated ? (Number(state.loopCount) || 0) + 1 : 0;
      next.loopCount = loopCount;
      next.trail = (state.trail || []).concat([{ seq: event.seq, text: normalized.slice(0, 1600), hash: shortHash(normalized) }]).slice(-5);
      if (!risk && !reportClear && loopCount >= loopThreshold) {
        risk = stableRisk(next, event, 'loop', 'repeated reasoning without new evidence (' + loopCount + 'x)');
      }
    }
    if (!risk) {
      const questions = summary ? summary.uncertainties : [];
      if (questions.length) risk = stableRisk(next, event, 'ambiguity', questions[0]);
    }
    next.risk = risk;
    if (risk && (!state.risk || state.risk.id !== risk.id)) {
      next = transition(next, { seq: event.seq, type: 'risk-open', riskId: risk.id, kind: risk.kind, reason: risk.reason });
    }
    if (!risk && state.risk) {
      next = transition(next, { seq: event.seq, type: 'risk-clear', riskId: state.risk.id });
    }
    return next;
  }
  if (event.type === 'tool/call') {
    const name = String(data.name || 'tool');
    const args = parseArgs(data.arguments);
    const signature = name + '|' + shortHash(JSON.stringify(args));
    const mutates = toolMutates(name, args);
    const count = signature === state.lastToolSignature ? (Number(state.toolRepeatCount) || 0) + 1 : 1;
    let next = Object.assign({}, state, { lastSeq: event.seq, lastToolSignature: signature, toolRepeatCount: count, lastCall: { signature, name, mutates, seq: event.seq, keyword: operationKeyword(name, args), detail: operationDetail(name, args) } });
    let risk = state.risk;
    const completed = (state.completed || []).find((item) => item && item.signature === signature);
    if (!risk && completed && mutates) {
      risk = stableRisk(next, event, 'repeat', 'operation already completed at seq ' + String(completed.seq) + ' (' + name + ')');
    }
    if (!risk && count >= repeatThreshold && Number(state.lastEvidenceSeq || 0) <= Number(state.lastSeq || 0)) {
      risk = stableRisk(next, event, 'repeat', 'same tool and arguments repeated (' + count + 'x)');
    }
    if (!risk && toolMutates(name, args) && (state.constraints || []).length) {
      risk = stableRisk(next, event, 'drift', 'mutating tool conflicts with explicit user constraint: ' + state.constraints.join(', '));
    }
    if (risk && (!state.risk || state.risk.id !== risk.id)) {
      next = transition(next, { seq: event.seq, type: 'risk-open', riskId: risk.id, kind: risk.kind, reason: risk.reason });
    }
    next.risk = risk;
    return next;
  }
  if (event.type === 'tool/result') {
    const callId = data.message && data.message.toolCallId;
    const name = toolNameFor(state, callId);
    const text = clip(redactSecrets(textOf(data.message && data.message.content)), 240);
    const ok = !(data.error || (data.message && data.message.isError));
    const evidence = (state.evidence || []).concat([{ seq: event.seq, name, ok, text }]).slice(-6);
    let completed = state.completed || [];
    let operationKeywords = state.operationKeywords || [];
    let recentMemory = state.recentMemory || [];
    const lastCall = state.lastCall;
    const recentMax = Math.max(3, Math.min(50, Number(cfg.recentMemoryMax) || 12));
    if (ok && lastCall && lastCall.mutates) {
      const seen = new Set(completed.map((item) => item && item.signature));
      if (!seen.has(lastCall.signature)) {
        completed = completed.concat([{
          signature: lastCall.signature,
          name: lastCall.name,
          seq: event.seq,
          keyword: lastCall.keyword || lastCall.name,
          detail: lastCall.detail || lastCall.name,
        }]).slice(-20);
      }
      operationKeywords = bumpOperationKeyword(operationKeywords, lastCall.keyword || lastCall.name, event.seq);
      recentMemory = recentMemory.concat([{
        seq: event.seq,
        kind: 'operation',
        keyword: lastCall.keyword || lastCall.name,
        detail: lastCall.detail || lastCall.name,
        signature: lastCall.signature,
      }]).slice(-recentMax);
    }
    return Object.assign({}, state, { lastSeq: event.seq, lastEvidenceSeq: event.seq, toolRepeatCount: 0, lastCall: null, evidence, completed, operationKeywords, recentMemory });
  }
  return state;
}

export function decideRisk(input) {
  const config = effectiveConfig(input.config);
  if (config.developerMode || config.reasoningRiskGate === false) return { allow: true };
  const risk = input.reasoningState && input.reasoningState.risk;
  if (!risk || !risk.required) return { allow: true };
  if (risk.kind === 'ambiguity' && (Number(input.reasoningState.version) < 4 || (input.memoryState && !openReasoningQuestions(input.memoryState).length))) return { allow: true };
  const review = input.review && input.review.riskId === risk.id ? input.review : null;
  if (review && review.status === 'clear') return { allow: true };
  if (review && review.status === 'error' && config.riskReviewFailure !== 'block') return { allow: true };
  const toolName = String(input.toolName || '');
  if (toolName === 'run_code' && (codeIsReadOnly(input.code) || isSafeGateRunCode(input.code))) return { allow: true };
  if ((config.reasoningVerifyTools || []).includes(toolName)) return { allow: true };
  if (['agents_index', 'agents_memory', 'agents_verify', 'agents_task', 'ask_user', 'ask_user_question', 'decompress', 'search_context', 'acp_status'].includes(toolName)) return { allow: true };
  if (!toolMutates(toolName, {})) return { allow: true };
  return { allow: false, reason: riskDenial(risk, review) };
}

export function riskDenial(risk, review) {
  let suffix = '';
  if (review && review.status === 'blocking') suffix = ' Independent semantic review also flagged this risk: ' + String(review.reason || '').slice(0, 240) + '.';
  else if (review && review.status === 'pending') suffix = ' Independent semantic review is still pending.';
  else if (review && review.status === 'error') suffix = ' Independent semantic review was unavailable; do not treat that as a clearance.';
  return 'dsh-agents-guard: risk [' + String(risk.id || '') + '] ' + String(risk.kind || '') + ': ' + String(risk.reason || '').slice(0, 240) + '.'
    + ' Before the next mutating call, end your reasoning with exactly one line:'
    + ' GUARD_STATE {"ambiguity":"none|low|blocking","progress":"new_evidence|exclusion|decision|none","loop":"none|suspected","drift":"aligned|risk","next":"short"}.'
    + ' Do not claim progress you did not make; read-only checks and agents_verify remain allowed.'
    + ' Check agents_index completed operations and recent memory; if the operation already ran, verify it read-only and record the conclusion before retrying.' + suffix;
}

export function buildRiskReviewPrompt(input) {
  const memory = input.memoryState || {};
  const state = input.reasoningState || {};
  const goal = String((state.goal && state.goal.text) || memory.lastUserText || '').slice(0, 1600);
  const constraints = (state.constraints || []).join(', ');
  const trail = (state.trail || []).slice(-2).map((item) => String(item.text || '')).join('\n---\n').slice(0, 3000);
  const evidence = (state.evidence || []).slice(-6).map((item) => item.name + (item.ok ? ' ok' : ' error') + ': ' + String(item.text || '').slice(0, 200)).join('\n');
  const keywordLine = (state.operationKeywords || []).slice(-20).map((item) => item.keyword + '×' + (item.count || 1)).join(', ');
  const recent = (state.recentMemory || state.completed || []).slice(-8).map((item) => 'seq ' + item.seq + ' [' + (item.kind || 'operation') + '] ' + (item.detail || item.name || '') + (item.signature ? ' (' + item.signature + ')' : '')).join('\n');
  const risk = state.risk || {};
  return [
    'You are an independent process auditor for a coding agent. Return ONLY one JSON object, no markdown:',
    '{"ambiguity":"none|low|blocking","loop":"none|suspected","drift":"aligned|risk","progress":"new_evidence|exclusion|decision|none","reason":"<=200 chars"}',
    'Judge whether the current reasoning has an unresolved decision-changing ambiguity, repeats without progress, or drifts from the user goal.',
    'User goal: ' + (goal || '(unknown)'),
    'Explicit constraints: ' + (constraints || '(none)'),
    'Current risk: ' + String(risk.kind || '') + ' / ' + String(risk.reason || '').slice(0, 300),
    'Recent reasoning:', trail || '(none)',
    'Recent tool evidence:', evidence || '(none)',
    'Completed operation keywords (summary memory):', keywordLine || '(none)',
    'Recent operations and thoughts (detailed memory):', recent || '(none)',
  ].join('\n');
}

export function parseRiskReview(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data;
  try { data = JSON.parse(source.slice(start, end + 1)); } catch { return null; }
  for (const key of Object.keys(GUARD_STATE_ENUMS)) {
    if (!GUARD_STATE_ENUMS[key].includes(String(data[key]))) return null;
  }
  return {
    ambiguity: String(data.ambiguity),
    progress: String(data.progress),
    loop: String(data.loop),
    drift: String(data.drift),
    reason: typeof data.reason === 'string' ? clip(redactSecrets(data.reason), 240) : '',
  };
}

export function renderReasoningState(state, sessionId, review) {
  const source = state || {};
  return {
    version: 3,
    sessionId: String(sessionId || source.sessionId || ''),
    updatedAt: new Date().toISOString(),
    goal: source.goal ? { seq: source.goal.seq, text: clip(redactSecrets(source.goal.text), 2000) } : null,
    constraints: (source.constraints || []).map((item) => clip(redactSecrets(item), 200)),
    loopCount: Number(source.loopCount) || 0,
    lastEvidenceSeq: Number(source.lastEvidenceSeq) || 0,
    selfReport: source.selfReport ? Object.assign({}, source.selfReport, { raw: undefined }) : null,
    risk: source.risk ? Object.assign({}, source.risk, { reason: clip(redactSecrets(source.risk.reason), 500) }) : null,
    review: review ? Object.assign({}, review, { reason: clip(redactSecrets(review.reason), 240) }) : null,
    transitions: (source.transitions || []).slice(-20).map((item) => Object.assign({}, item, { reason: clip(redactSecrets(item.reason), 240) })),
    trailFingerprints: (source.trail || []).map((item) => ({ seq: item.seq, hash: item.hash })),
    operationKeywords: (source.operationKeywords || []).map((item) => ({ keyword: item.keyword, count: item.count, lastSeq: item.lastSeq })).slice(-60),
    recentMemory: (source.recentMemory || []).map((item) => ({ seq: item.seq, kind: item.kind, keyword: item.keyword, detail: item.detail, signature: item.signature })).slice(-12),
    completedOperations: (source.recentMemory || source.completed || []).map((item) => ({ seq: item.seq, name: item.name || item.keyword || '', signature: item.signature })).slice(-8),
  };
}

const EVIDENCE_SOURCES = ['file', 'command', 'message', 'observation'];
const EVIDENCE_STATUSES = ['observed', 'contradicted'];

export function evidenceRecordProblem(input) {
  const value = input && typeof input === 'object' ? input : {};
  const claim = String(value.claim || '').trim();
  const source = String(value.source || '').trim();
  const mechanism = String(value.mechanism || '').trim();
  const result = String(value.result || '').trim();
  const status = String(value.status || 'observed').trim();
  if (!claim) return 'claim is required';
  if (claim.length > 500) return 'claim must be at most 500 characters';
  if (!EVIDENCE_SOURCES.includes(source)) return 'source must be one of: ' + EVIDENCE_SOURCES.join(', ');
  if (!mechanism) return 'mechanism is required';
  if (!result) return 'result is required';
  if (!EVIDENCE_STATUSES.includes(status)) return 'status must be observed or contradicted; verified is host-derived, not model-claimed';
  if (String(value.conditions || '').length > 500) return 'conditions must be at most 500 characters';
  if (String(value.positiveControl || '').length > 500) return 'positiveControl must be at most 500 characters';
  if (String(value.note || '').length > 500) return 'note must be at most 500 characters';
  return '';
}

function evidenceEntryFrom(input, seq) {
  const value = input && typeof input === 'object' ? input : {};
  const status = String(value.status || 'observed');
  return {
    id: 'ev-' + String(seq),
    seq: Number(seq) || 0,
    text: clip(redactSecrets(value.claim), 500),
    claim: clip(redactSecrets(value.claim), 500),
    source: String(value.source || 'observation'),
    mechanism: clip(redactSecrets(value.mechanism), 500),
    conditions: clip(redactSecrets(value.conditions || ''), 500),
    result: clip(redactSecrets(value.result), 500),
    status: status === 'contradicted' ? 'contradicted' : 'observed',
    positiveControl: clip(redactSecrets(value.positiveControl || ''), 500),
    note: clip(redactSecrets(value.note || ''), 500),
    authority: 'model-stated',
  };
}

export function decideEvidence(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.evidenceGate) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName !== 'agents_memory') return { allow: true };
  const args = input && input.toolArgs && typeof input.toolArgs === 'object' ? input.toolArgs : {};
  const kind = String(args.kind || '');
  if (kind !== 'verified' && kind !== 'decision') return { allow: true };
  const evidence = String(args.evidence || '').trim();
  const state = input && input.state;
  if (!evidence) {
    return { allow: false, reason: 'dsh-agents-guard: evidenceGate requires evidence for a verified/decision memory. First add an agents_evidence entry and cite its ID (or a concrete file/command), then call agents_memory again.' };
  }
  const ref = evidence.match(/ev-[0-9]+/);
  if (ref && state && Array.isArray(state.evidence) && !state.evidence.some((item) => item.id === ref[0])) {
    return { allow: false, reason: 'dsh-agents-guard: evidence reference ' + ref[0] + ' does not exist in this session. Add it with agents_evidence first.' };
  }
  return { allow: true };
}

function normalizeFsPath(value, cwd) {
  let p = String(value == null ? '' : value).replace(/\\/g, '/').trim();
  if (!p) return '';
  const isAbsolute = /^[A-Za-z]:\//.test(p) || p.startsWith('/');
  if (!isAbsolute) {
    const base = String(cwd == null ? '' : cwd).replace(/\\/g, '/').replace(/\/+$/, '');
    if (base) p = base + '/' + p;
  }
  const driveMatch = p.match(/^[A-Za-z]:/);
  const drive = driveMatch ? driveMatch[0] : '';
  let rest = p.slice(drive.length);
  const rooted = rest.startsWith('/');
  const parts = [];
  for (const segment of rest.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { if (parts.length) parts.pop(); continue; }
    parts.push(segment);
  }
  return drive + (rooted ? '/' : '') + parts.join('/');
}

function pathCovers(target, base, cwd) {
  const a = normalizeFsPath(target, cwd).toLowerCase();
  const b = normalizeFsPath(base, cwd).toLowerCase().replace(/\/+$/, '');
  if (!a || !b) return false;
  return a === b || a.startsWith(b + '/');
}

function latestChange(state, target) {
  const changes = (state && Array.isArray(state.changes) ? state.changes : [])
    .slice()
    .sort((a, b) => Number(a.seq) - Number(b.seq));
  if (!target) {
    const last = changes[changes.length - 1] || null;
    return last && (last.status === 'planned' || last.status === 'applied') ? last : null;
  }
  const cwd = state && state.cwd;
  const matching = changes.filter((item) => pathCovers(target, item.target, cwd));
  const last = matching[matching.length - 1] || null;
  return last && (last.status === 'planned' || last.status === 'applied') ? last : null;
}

export function advanceInjectedMark(previous, turn, seq) {
  const nextTurn = Number(turn) || 0;
  const nextSeq = Number(seq) || 0;
  if (previous && Number(previous.seq) > nextSeq) return null;
  if (previous && Number(previous.seq) === nextSeq && Number(previous.turn) > nextTurn) return null;
  return { turn: nextTurn, seq: nextSeq };
}

export function cardMarkCovers(mark, lastUserSeq) {
  return (Number(mark && mark.seq) || 0) >= (Number(lastUserSeq) || 0);
}

export function continuityStatus(state) {
  const item = state && state.continuity;
  if (!item) return 'missing';
  if (item.status === 'stale' || Number(state.lastUserSeq) > Number(item.lastUserSeq || 0)) return 'stale';
  if (item.status === 'incomplete' || !String(item.next || '').trim()) return 'incomplete';
  return 'ready';
}

export function handoffRecordProblem(input, maxChars) {
  const value = input && typeof input === 'object' ? input : {};
  const next = String(value.next || '').trim();
  if (!next) return 'next step is required: say what resumes after compression';
  if (next.length > 500) return 'next step is too long (max 500 characters)';
  const step = String(value.step || '').trim();
  if (step.length > 120) return 'step label is too long (max 120 characters)';
  const all = [next, step, value.note || ''].concat(taskList(value.preserve, 12), taskList(value.discard, 12), taskList(value.risks, 8));
  const total = all.join(' ');
  if (total.length > (Number(maxChars) || 1600)) return 'handoff is too long; distill it to ' + String(Number(maxChars) || 1600) + ' characters';
  if (total.split(/\r?\n/).length >= 5) return 'do not paste a multi-line transcript; write distilled preserve/discard/next entries instead';
  return '';
}

export function handoffEntryFrom(input, seq, state) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    status: 'ready',
    step: clip(value.step || '', 120),
    next: clip(value.next || '', 500),
    preserve: taskList(value.preserve, 12),
    discard: taskList(value.discard, 12),
    risks: taskList(value.risks, 8),
    note: clip(value.note || '', 300),
    savedSeq: Number(seq) || 0,
    lastUserSeq: Number(state && state.lastUserSeq) || 0,
    updatedSeq: Number(seq) || 0,
    compressedSeq: Number(state && state.continuity && state.continuity.compressedSeq) || 0,
    authority: 'model-distilled',
  };
}

export function handoffHasNext(item) {
  return Boolean(item && String(item.next || '').trim());
}

// Freshness key: the latest user message a handoff covers, then the save seq.
// A handoff without a next step is incomplete and must never outrank a valid one.
export function handoffFreshness(item) {
  if (!item) return -1;
  return (Number(item.lastUserSeq) || 0) * 1000000 + (Number(item.savedSeq) || 0);
}

// Pick the best candidate from the live value, the projected state and the
// persisted sidecar. Valid entries always beat incomplete ones; among equals the
// one covering the newer user message wins.
export function pickHandoff(candidates) {
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter((item) => item && typeof item === 'object');
  if (!list.length) return null;
  const valid = list.filter(handoffHasNext);
  const pool = valid.length ? valid : list;
  return pool.reduce((best, item) => (handoffFreshness(item) > handoffFreshness(best) ? item : best));
}

export function buildContinuity(state, rawConfig) {
  const cfg = effectiveConfig(rawConfig);
  const item = state && state.continuity;
  const status = continuityStatus(state);
  const task = state && state.task ? state.task : null;
  const change = latestChange(state, '');
  const open = openReasoningQuestions(state);
  const missing = [];
  if (!item || !String(item.next || '').trim()) missing.push('next');
  if (!task && !change && !(state && state.requirements && state.requirements.length)) missing.push('goal');
  const lines = [];
  lines.push('[dsh-agents-guard] 接续卡（压缩后恢复；不是新用户指令）');
  lines.push('状态: ' + status + ' | 保存 seq: ' + String(item && item.savedSeq || 0) + ' | 最近压缩 seq: ' + String(item && item.compressedSeq || 0));
  if (task) {
    lines.push('任务: ' + String(task.status || '') + ' / ' + String(task.goal || ''));
    if (task.scope && task.scope.length) lines.push('允许范围: ' + task.scope.join(', '));
    if (task.exclusions && task.exclusions.length) lines.push('排除: ' + task.exclusions.join(', '));
  } else {
    lines.push('任务: 无 active task；按当前用户目标继续，并在下一次写入前确认范围。');
  }
  if (change) {
    lines.push('当前变更: ' + String(change.id || '') + ' [' + String(change.status || '') + '] ' + String(change.target || ''));
    if (change.invariants && change.invariants.length) lines.push('必须不变: ' + change.invariants.join('; '));
  }
  if (item && item.step) lines.push('已完成步骤: ' + String(item.step));
  if (item && item.next) lines.push('下一步: ' + String(item.next));
  if (item && item.preserve && item.preserve.length) lines.push('必须保留: ' + item.preserve.join('; '));
  if (item && item.discard && item.discard.length) lines.push('可丢弃（临时材料）: ' + item.discard.join('; '));
  if (item && item.risks && item.risks.length) lines.push('不能忘的风险: ' + item.risks.join('; '));
  if (open.length) lines.push('未解疑问: ' + open.map((q) => String(q.id || '') + ' ' + String(q.text || '').slice(0, 120)).join(' | '));
  if (state && state.requirements && state.requirements.length) lines.push('最近要求: ' + state.requirements.slice(-3).map((x) => String(x.text || '').slice(0, 120)).join(' | '));
  if (state && state.llmEntries && state.llmEntries.length) lines.push('最近决策: ' + state.llmEntries.slice(-3).map((x) => String(x.text || '').slice(0, 120)).join(' | '));
  if (state && state.changedFiles && state.changedFiles.length) lines.push('已改文件: ' + state.changedFiles.slice(-5).map((x) => String(x.text || '')).join(', '));
  if (missing.length) lines.push('缺失: ' + missing.join(', ') + '；调用 agents_handoff save 补齐。');
  lines.push('恢复协议: 压缩后按本卡继续；不要重做已完成操作；临时材料按 discard 清理，保留 preserve 与不变量。');
  let text = lines.join('\n').trim();
  const max = Number(cfg.continuityMaxChars) || 1600;
  if (text.length > max) text = text.slice(0, Math.max(1, max - 1)) + '…';
  return { status, missing, text, task, change };
}

export function decideContinuity(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.continuityGate) return { allow: true };
  if (String((input && input.toolName) || '') !== 'compress') return { allow: true };
  const state = input && input.state;
  const status = continuityStatus(state);
  if (status === 'ready') return { allow: true };
  const pressure = Number(input && input.pressureRatio);
  const hard = Number.isFinite(pressure) && pressure >= cfg.compressPressureRatio;
  if (hard) return { allow: true, emergency: true };
  const capsule = buildContinuity(state, cfg);
  const item = state && state.continuity;
  const savedAt = Number(item && item.lastUserSeq) || 0;
  const latest = Number(state && state.lastUserSeq) || 0;
  return {
    allow: false,
    reason: 'dsh-agents-guard: continuityGate requires a current agents_handoff before compression (' + status + '; missing: ' + (capsule.missing.join(', ') || 'next') + '; handoff covers user seq ' + savedAt + ', latest user seq ' + latest + '; build ' + GUARD_BUILD + '). Call agents_handoff action=save with step/next/preserve/discard/risks; at or above ' + Math.round(cfg.compressPressureRatio * 100) + '% the host capsule is allowed as an emergency fallback.',
  };
}

export function decideImpact(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.impactGate) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (['agents_change', 'agents_check', 'agents_recovery', 'agents_task', 'agents_evidence', 'agents_index', 'agents_memory', 'agents_verify', 'ask_user', 'ask_user_question'].includes(toolName)) return { allow: true };
  if (toolName === 'run_code' && codeIsReadOnly(input && input.code)) return { allow: true };
  if (!cfg.impactGateTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  const target = taskPathOf(input);
  const change = latestChange(input && input.state, target);
  if (!change) return { allow: false, reason: 'dsh-agents-guard: impactGate requires a planned agents_change with direct/indirect targets and invariants before this mutation. Call agents_change action=plan first; read-only tools remain available.' };
  if (!Array.isArray(change.invariants) || !change.invariants.length) return { allow: false, reason: 'dsh-agents-guard: impactGate requires at least one explicit invariant on the planned change. Do not write 已检查 without naming what must not change.' };
  return { allow: true };
}

export function decideRecovery(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.recoveryGate) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (['agents_change', 'agents_check', 'agents_recovery', 'agents_task', 'agents_evidence', 'agents_index', 'agents_memory', 'agents_verify', 'ask_user', 'ask_user_question'].includes(toolName)) return { allow: true };
  if (toolName === 'run_code' && codeIsReadOnly(input && input.code)) return { allow: true };
  if (!isMutatingToolName(toolName) && !['write', 'edit', 'pwsh', 'plugin_manager'].includes(toolName)) return { allow: true };
  const target = taskPathOf(input);
  const change = latestChange(input && input.state, target);
  if (!change) return { allow: false, reason: 'dsh-agents-guard: recoveryGate requires a planned or applied agents_change covering this target before a baseline can authorize the write. Call agents_change action=plan first.' };
  const recoveryItems = input && input.state && Array.isArray(input.state.recovery) ? input.state.recovery : [];
  const recovery = recoveryItems.filter((item) => item.changeId === change.id).slice(-1)[0];
  if (!recovery || !String(recovery.baseline || '').trim()) return { allow: false, reason: 'dsh-agents-guard: recoveryGate requires a baseline recorded for this specific change (agents_recovery action=baseline with the changeId); a baseline for another change does not cover it. Do not claim a rollback path you did not record.' };
  return { allow: true };
}

export function decideVerification(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.verificationGate) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  const args = input && input.toolArgs && typeof input.toolArgs === 'object' ? input.toolArgs : {};
  if (toolName === 'agents_change' && String(args.action || '') === 'verify') {
    const changeId = String(args.changeId || '');
    const checks = input.state && Array.isArray(input.state.checks) ? input.state.checks : [];
    const passed = checks.some((item) => item.changeId === changeId && item.status === 'pass');
    if (!passed) return { allow: false, reason: 'dsh-agents-guard: verificationGate requires at least one recorded pass for this change before it can be marked verified. Add both the target check and the regression check with agents_check.' };
  }
  return { allow: true };
}

export function auditIndex(counts) {
  const value = counts && typeof counts === 'object' ? counts : {};
  const count = (key) => Number(value[key]) || 0;
  const critical = [];
  const advisory = [];
  if (!count('requirements') && !count('userLog')) critical.push('requirements/userLog');
  // Advisory sections are the ones the documented workflow only creates when
  // the task produces them (a written file, a recorded decision, a check).
  // Requiring them for `pass` deadlocked read-only turns: the audit demanded
  // a changed file that the turn would never write, so every compress was
  // denied with status=incomplete until an unrelated write happened.
  if (!count('task') && !count('llmEntries') && !count('changes')) advisory.push('task/llmEntries/changes');
  if (!count('decisions') && !count('openItems')) advisory.push('decisions/openItems');
  if (!count('changedFiles') && !count('checks')) advisory.push('changedFiles/checks');
  const missing = critical.concat(advisory);
  const status = critical.length ? 'incomplete' : advisory.length ? 'warn' : 'pass';
  const note = status === 'pass'
    ? 'index has the required sections'
    : status === 'warn'
      ? 'index is usable; advisory sections are still empty: ' + advisory.join(', ')
      : 'index is missing required sections: ' + missing.join(', ');
  return { status, critical, advisory, missing, note };
}

export function decideIndexGate(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.indexGate) return { allow: true };
  if (String((input && input.toolName) || '') !== 'compress') return { allow: true };
  const audit = input && input.state && input.state.indexAudit;
  // `warn` means only advisory sections are empty (for example no file has
  // been changed yet in this session). Requiring `pass` there made
  // compression impossible for read-only turns. Only `incomplete` (no
  // requirements and no user log at all) blocks.
  if (!audit || (audit.status !== 'pass' && audit.status !== 'warn')) {
    const status = audit && audit.status ? String(audit.status) : 'missing';
    const missing = audit && Array.isArray(audit.missing) && audit.missing.length ? ' missing: ' + audit.missing.join(', ') + '.' : '';
    return { allow: false, reason: 'dsh-agents-guard: indexGate requires agents_index action=audit status=pass or warn before compression (current: ' + status + ').' + missing + ' Run the audit and record the latest requirement with agents_memory; the pressure exemption is applied before this gate.' };
  }
  return { allow: true };
}

export function changeRecordProblem(input) {
  const target = String(input && input.target || '').trim();
  if (!target) return 'change target is required (the file or object this change touches)';
  if (target.length > 260) return 'change target is too long (max 260 characters)';
  const invariants = taskList(input && input.invariants, 20);
  if (!invariants.length) return 'at least one explicit invariant is required: name what must not change';
  return '';
}

export function changeEntryFrom(input, seq) {
  return {
    id: 'chg-' + seq, seq, text: clip(input.target, 260), target: clip(input.target, 260),
    direct: taskList(input.direct, 20), indirect: taskList(input.indirect, 20),
    invariants: taskList(input.invariants, 20), verification: taskList(input.verification, 20),
    status: 'planned', note: clip(input.note, 500), authority: 'model-proposed',
  };
}

export function checkRecordProblem(input) {
  if (!String(input && input.changeId || '').trim()) return 'changeId is required; a check must be attached to a change';
  if (!String(input && input.assertion || '').trim()) return 'assertion is required; state what was checked';
  if (String(input && input.assertion || '').length > 500) return 'assertion is too long (max 500 characters)';
  return '';
}

export function checkEntryFrom(input, seq) {
  return {
    id: 'chk-' + seq, seq, text: clip(input.assertion, 500), changeId: String(input.changeId || ''), assertion: clip(input.assertion, 500),
    command: clip(input.command, 500), expected: clip(input.expected, 300), actual: clip(input.actual, 300),
    status: 'pending', evidence: clip(input.evidence, 300), authority: 'model-stated',
  };
}

export function recoveryRecordProblem(input) {
  if (!String(input && input.changeId || '').trim()) return 'changeId is required: a recovery baseline must be attached to a change';
  if (!String(input && input.baseline || '').trim()) return 'baseline is required: name the saved copy, commit, or exact restore point';
  if (String(input && input.baseline || '').length > 500) return 'baseline is too long (max 500 characters)';
  return '';
}

export function recoveryEntryFrom(input, seq) {
  return {
    id: 'rec-' + seq, seq, text: clip(input.baseline, 500), changeId: String(input.changeId || ''), baseline: clip(input.baseline, 500),
    rollback: clip(input.rollback, 500), status: 'baseline', note: clip(input.note, 300), authority: 'model-stated',
  };
}

function updateChange(state, changeId, patch) {
  const id = String(changeId || '');
  if (!id || !Array.isArray(state.changes)) return state;
  let found = false;
  const changes = state.changes.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return Object.assign({}, item, patch);
  });
  return found ? Object.assign({}, state, { changes }) : state;
}

function updateCheck(state, checkId, patch) {
  const id = String(checkId || '');
  if (!id || !Array.isArray(state.checks)) return state;
  let found = false;
  const checks = state.checks.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return Object.assign({}, item, patch);
  });
  return found ? Object.assign({}, state, { checks }) : state;
}

function updateRecovery(state, recoveryId, patch) {
  const id = String(recoveryId || '');
  if (!id || !Array.isArray(state.recovery)) return state;
  let found = false;
  const recovery = state.recovery.map((item) => {
    if (item.id !== id) return item;
    found = true;
    return Object.assign({}, item, patch);
  });
  return found ? Object.assign({}, state, { recovery }) : state;
}

function taskList(value, max) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => clip(redactSecrets(item), 300)).filter(Boolean).slice(0, max || 20);
}

export function isTaskConfirmation(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return false;
  if (isTaskDenial(value)) return false;
  return /(确认|批准|授权|同意|可以|继续|按这个|就这个|开始做|开始吧|approved|confirm)/i.test(value);
}

export function isTaskDenial(text) {
  return /(取消|不批准|不确认|不同意|拒绝|别做|先不要|停止|取消任务|deny|reject)/i.test(String(text || ''));
}

function taskPathOf(input) {
  const args = input && input.toolArgs && typeof input.toolArgs === 'object' ? input.toolArgs : {};
  const value = args.file_path || args.path || args.filename || '';
  return String(value || '').replace(/\\/g, '/').trim();
}

export function decideTask(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.taskGate) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (['agents_task', 'agents_index', 'agents_verify', 'agents_memory', 'ask_user', 'ask_user_question'].includes(toolName)) return { allow: true };
  if (toolName === 'run_code' && codeIsReadOnly(input && input.code)) return { allow: true };
  if (!cfg.taskGateTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  const task = input && input.state && input.state.task;
  if (!task || task.status !== 'active') {
    return { allow: false, reason: 'dsh-agents-guard: taskGate is enabled and no active task authorization covers this call. Call agents_task with action=start and ask the user to confirm the scope before mutating; read-only tools remain available.' };
  }
  const target = taskPathOf(input);
  const cwd = input && input.state && input.state.cwd;
  const normalized = normalizeFsPath(target, cwd).toLowerCase();
  const scope = (Array.isArray(task.scope) ? task.scope : []).map((item) => normalizeFsPath(item, cwd).toLowerCase()).filter(Boolean);
  const exclusions = (Array.isArray(task.exclusions) ? task.exclusions : []).map((item) => normalizeFsPath(item, cwd).toLowerCase()).filter(Boolean);
  if (target) {
    const excluded = exclusions.some((item) => pathCovers(normalized, item, cwd));
    if (excluded) return { allow: false, reason: 'dsh-agents-guard: target is excluded by the active task: ' + target };
    if (scope.length && !scope.some((item) => pathCovers(normalized, item, cwd))) {
      return { allow: false, reason: 'dsh-agents-guard: target is outside the active task scope: ' + target };
    }
  }
  return { allow: true };
}

export function decideReasoning(input) {
  const cfg = effectiveConfig(input && input.config);
  if (cfg.developerMode || !cfg.reasoningGate) return { allow: true };
  const state = input && input.state;
  const open = openReasoningQuestions(state);
  if (!open.length) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName === 'ask_user' || toolName === 'ask_user_question' || toolName === 'agents_memory' || toolName === 'agents_index' || toolName === 'agents_verify' || toolName === 'agents_task') return { allow: true };
  if (cfg.reasoningVerifyTools.includes(toolName)) return { allow: true };
  if (toolName === 'run_code') {
    if (codeIsReadOnly(input && input.code)) return { allow: true };
    return { allow: false, reason: reasoningDenial(open) };
  }
  if (!cfg.reasoningTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  return { allow: false, reason: reasoningDenial(open) };
}

function reasoningDenial(open) {
  const first = open[0] || {};
  const ids = open.map((question) => question.id).join(', ');
  return 'dsh-agents-guard: your reasoning contains unresolved question(s) [' + ids + ']: "' + String(first.text || '').slice(0, 180) + '". In PTC, call run_code with exactly one `await tools.agents_verify({"questionId": "' + String(first.id || '') + '", "op": "read_file|list_dir|grep", "path": "..."})` or pass `questionIds` to resolve a whole list in one call; one success resolves every listed ID. If verification is impossible, call run_code with exactly one `await tools.ask_user_question({...})` (official) or `await tools.ask_user({...})` (Deep PTC); if neither ask tool is available, ask in a normal reply; the user reply resolves the asked question. Read-only run_code is allowed, including multiple read calls; only code with write/process/plugin mutations is blocked.';
}
// --- Developer-mode deterministic test harness -----------------------------
// This code is pure: it builds fixtures and calls the same decision functions
// used by the live guard. It never mutates a session projection or the real
// index. The host tool that exposes it rejects calls unless developerMode is on.

function selfTestSummary(text) {
  return 'GUARD_SUMMARY ' + JSON.stringify({ goal: 'self-test', decisions: [], uncertainties: [text], next: 'verify' });
}

function selfTestQuestionState(text) {
  let state = emptyState({ cwd: 'C:/self-test' });
  state = reduceEvent(state, {
    type: 'assistant/message',
    seq: 1,
    data: { message: { content: [{ type: 'reasoning', text: selfTestSummary(text || 'self-test question?') }] } },
  });
  return state;
}

function selfTestUserState(text) {
  return reduceEvent(emptyState({ cwd: 'C:/self-test' }), {
    type: 'user/message',
    seq: 1,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
  });
}

function selfTestToolResult(state, callId, seq, text, isError) {
  return reduceEvent(state, {
    type: 'tool/result',
    seq,
    data: { message: { toolCallId: callId, content: [{ type: 'text', text: text || 'ok' }], isError: Boolean(isError) } },
  });
}

function selfTestCall(state, callId, seq, name, input) {
  return reduceEvent(state, {
    type: 'tool/call',
    seq,
    data: { callId, name, arguments: JSON.stringify(input || {}) },
  });
}

export function runGuardSelfTest() {
  const cases = [];
  const check = (name, fn) => {
    try {
      const detail = fn();
      cases.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
    } catch (error) {
      cases.push({ name, ok: false, detail: String(error && error.message ? error.message : error) });
    }
  };
  const expect = (condition, message) => { if (!condition) throw new Error(message); };

  check('summary-only reasoning becomes a question', () => {
    const state = selfTestQuestionState('self-test ambiguity?');
    expect(state.reasoningText === '', 'raw reasoning must not be stored');
    expect(openReasoningQuestions(state).length === 1, 'one summary uncertainty expected');
    return openReasoningQuestions(state)[0].id;
  });

  check('reasoning gate blocks write and allows read-only work', () => {
    const state = selfTestQuestionState('self-test ambiguity?');
    expect(decideReasoning({ state, toolName: 'write', code: '', config: {} }).allow === false, 'write must be blocked');
    expect(decideReasoning({ state, toolName: 'read', code: '', config: {} }).allow === true, 'read must be allowed');
    expect(decideReasoning({ state, toolName: 'run_code', code: 'await tools.read({}); await tools.read({});', config: {} }).allow === true, 'read-only multi-call must pass');
    expect(decideReasoning({ state, toolName: 'run_code', code: 'await tools.write({});', config: {} }).allow === false, 'mutating run_code must fail');
  });

  check('batch agents_verify resolves every listed question', () => {
    let state = selfTestQuestionState('self-test ambiguity?');
    const ids = openReasoningQuestions(state).map((item) => item.id);
    const code = 'await tools.agents_verify(' + JSON.stringify({ questionIds: ids.concat(ids), op: 'read_file', path: 'package.json' }) + ')';
    state = selfTestCall(state, 'self-test-verify', 2, 'run_code', { code });
    state = selfTestToolResult(state, 'self-test-verify', 3, 'ok', false);
    expect(openReasoningQuestions(state).length === 0, 'all listed IDs must resolve');
  });

  check('developerMode bypasses the gate for deliberate repair', () => {
    const state = selfTestQuestionState('self-test ambiguity?');
    expect(decideReasoning({ state, toolName: 'write', config: { developerMode: true } }).allow === true, 'developer bypass must work');
  });

  check('recall gate requires agents_index first', () => {
    const state = selfTestUserState('回忆一下我们之前讨论的要求');
    expect(decideRecall({ state, toolName: 'session_search', config: {} }).allow === false, 'fallback search must be blocked');
    expect(decideRecall({ state, toolName: 'agents_index', config: {} }).allow === true, 'agents_index must be allowed');
  });

  check('record gate requires a distilled memory result', () => {
    let state = selfTestUserState('必须采用方案 A');
    expect(decideRecord({ state, toolName: 'write', code: '', config: {} }).allow === false, 'write must wait for a record');
    expect(decideRecord({ state, toolName: 'read', code: '', config: {} }).allow === true, 'read must remain available');
    const code = 'await tools.agents_memory(' + JSON.stringify({ action: 'add', kind: 'requirement', text: '采用方案 A' }) + ')';
    state = selfTestCall(state, 'self-test-memory', 2, 'run_code', { code });
    state = selfTestToolResult(state, 'self-test-memory', 3, 'recorded', false);
    expect(decideRecord({ state, toolName: 'write', code: '', config: {} }).allow === true, 'successful record must unlock the write');
  });

  check('task authorization requires a real user confirmation', () => {
    let state = selfTestUserState('请实现任务门控');
    expect(decideTask({ state, toolName: 'write', toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { taskGate: true } }).allow === false, 'no active task must block');
    state = selfTestCall(state, 'self-test-task', 2, 'agents_task', { action: 'start', goal: 'self-test task', scope: ['C:/self-test'] });
    state = selfTestToolResult(state, 'self-test-task', 3, 'ok', false);
    expect(state.task && state.task.status === 'proposed', 'start must only propose');
    expect(decideTask({ state, toolName: 'write', toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { taskGate: true } }).allow === false, 'proposal must not authorize');
    state = reduceEvent(state, { type: 'user/message', seq: 4, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '确认，按这个范围做' }] } });
    expect(state.task && state.task.status === 'active', 'confirmation must activate');
    expect(decideTask({ state, toolName: 'write', toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { taskGate: true } }).allow === true, 'in-scope write must pass');
    expect(decideTask({ state, toolName: 'write', toolArgs: { file_path: 'C:/outside/a.txt' }, config: { taskGate: true } }).allow === false, 'out-of-scope write must fail');
    expect(decideTask({ state, toolName: 'write', toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { taskGate: true, developerMode: true } }).allow === true, 'developer bypass must work');
  });

  check('memory limit rejects raw or oversized text', () => {
    expect(memoryRecordProblem('x'.repeat(601), 600).length > 0, '601 chars must be rejected');
    expect(memoryRecordProblem(' distilled conclusion ', 600) === '', 'distilled text must pass');
  });

  check('risk gate blocks mutation and allows read-only', () => {
    const state = emptyReasoningState({ id: 'self-test-risk' });
    state.risk = { id: 'risk-self-test', seq: 1, kind: 'loop', reason: 'self-test', required: true, review: 'pending' };
    expect(decideRisk({ reasoningState: state, toolName: 'write', config: {} }).allow === false, 'risk must block write');
    expect(decideRisk({ reasoningState: state, toolName: 'read', config: {} }).allow === true, 'risk must allow read');
    expect(decideRisk({ reasoningState: state, toolName: 'write', config: { developerMode: true } }).allow === true, 'developer bypass must work');
  });

  check('stale ambiguity risk with no open question is inert', () => {
    const state = Object.assign({}, emptyReasoningState({ id: 'self-test-stale' }), {
      version: 3,
      risk: { id: 'risk-stale', seq: 1, kind: 'ambiguity', reason: 'old', required: true, review: 'error' },
    });
    expect(decideRisk({ reasoningState: state, memoryState: emptyState({ cwd: 'C:/self-test' }), toolName: 'write', config: {} }).allow === true, 'stale ambiguity must not self-lock');
  });

  check('compress gate and pressure exemption', () => {
    const state = selfTestUserState('test compress');
    state.lastUserSeq = 1;
    expect(decideCompress({ state, mark: { turn: 1, seq: 1 }, currentTurn: 1, denyCompress: true }).allow === true, 'covered card must allow');
    expect(decideCompress({ state, mark: { turn: 0, seq: 1 }, currentTurn: 1, denyCompress: true }).allow === true, 'a stale turn alone must not deny');
    const staleSeq = Object.assign({}, state, { lastUserSeq: 2 });
    expect(decideCompress({ state: staleSeq, mark: { turn: 1, seq: 1 }, currentTurn: 1, denyCompress: true }).allow === false, 'a card older than the latest user message must deny');
    const forced = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 81000, contextWindow: 100000 });
    expect(forced.allow === true && forced.forced === true, 'pressure exemption must force');
  });

  check('impact, recovery, verification and index gates fail closed', () => {
    const base = emptyState({ cwd: 'C:/self-test' });
    expect(decideImpact({ state: base, toolName: 'write', config: { impactGate: true } }).allow === false, 'impactGate without a change must fail');
    const planned = Object.assign({}, base, { changes: [{ id: 'chg-self', target: 'C:/self-test/a.txt', invariants: ['keep format'], status: 'planned' }] });
    expect(decideImpact({ state: planned, toolName: 'write', toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { impactGate: true } }).allow === true, 'planned change with invariant must pass');
    expect(decideRecovery({ state: base, toolName: 'write', config: { recoveryGate: true } }).allow === false, 'recoveryGate without baseline must fail');
    expect(decideVerification({ state: planned, toolName: 'agents_change', toolArgs: { action: 'verify', changeId: 'chg-self' }, config: { verificationGate: true } }).allow === false, 'verificationGate without a pass must fail');
    expect(decideIndexGate({ state: base, toolName: 'compress', config: { indexGate: true } }).allow === false, 'indexGate without audit must fail');
    expect(decideIndexGate({ state: Object.assign({}, base, { indexAudit: { status: 'pass' } }), toolName: 'compress', config: { indexGate: true } }).allow === true, 'passing audit must allow compress');
    expect(decideIndexGate({ state: Object.assign({}, base, { indexAudit: { status: 'warn', missing: ['changedFiles/checks'] } }), toolName: 'compress', config: { indexGate: true } }).allow === true, 'advisory-only gaps must allow compress');
    expect(decideIndexGate({ state: Object.assign({}, base, { indexAudit: { status: 'incomplete', missing: ['requirements/userLog'] } }), toolName: 'compress', config: { indexGate: true } }).allow === false, 'a missing required section must deny');
  });
  check('continuity gate requires a ready handoff below 80%', () => {
    const base = emptyState({ cwd: 'C:/self-test' });
    expect(decideContinuity({ state: base, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow === false, 'missing handoff must deny');
    const seeded = Object.assign({}, base, { lastUserSeq: 1 });
    const entry = handoffEntryFrom({ action: 'save', step: 'self-test step', next: 'self-test next', preserve: ['keep'], discard: ['temp'] }, 2, seeded);
    const ready = Object.assign({}, seeded, { continuity: entry });
    expect(decideContinuity({ state: ready, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow === true, 'ready handoff must allow');
    const stale = Object.assign({}, ready, { lastUserSeq: 3 });
    expect(decideContinuity({ state: stale, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow === false, 'stale handoff must deny');
    expect(decideContinuity({ state: stale, toolName: 'compress', pressureRatio: 0.8, config: { continuityGate: true } }).allow === true, '80% must be the emergency fallback');
    return 'ready/stale/80%';
  });

  check('config normalization repairs a null numeric field', () => {
    expect(normalizeConfig({ maxReasoningQuestions: null }).maxReasoningQuestions === 8, 'null must fall back to 8');
    expect(normalizeConfig({ maxReasoningQuestions: 12 }).maxReasoningQuestions === 12, 'valid value must survive');
  });

  return { ok: cases.every((item) => item.ok), total: cases.length, passed: cases.filter((item) => item.ok).length, cases };
}

export function simulateGuardScenario(input) {
  const scenario = String((input && input.scenario) || '');
  const toolName = String((input && input.toolName) || 'write');
  const code = String((input && input.code) || '');
  const enforce = !(input && input.enforceGates === false);
  const config = { developerMode: !enforce };
  if (scenario === 'reasoning') {
    const state = selfTestQuestionState((input && input.question) || 'self-test ambiguity?');
    return { scenario, toolName, decision: decideReasoning({ state, toolName, code, config }) };
  }
  if (scenario === 'risk') {
    const state = emptyReasoningState({ id: 'self-test-risk' });
    state.risk = { id: 'risk-self-test', seq: 1, kind: 'loop', reason: 'self-test', required: true, review: 'pending' };
    return { scenario, toolName, decision: decideRisk({ reasoningState: state, toolName, config }) };
  }
  if (scenario === 'recall') {
    const state = selfTestUserState('回忆一下我们之前讨论的要求');
    return { scenario, toolName, decision: decideRecall({ state, toolName, config }) };
  }
  if (scenario === 'record') {
    const state = selfTestUserState('必须采用方案 A');
    return { scenario, toolName, decision: decideRecord({ state, toolName, code, config }) };
  }
  if (scenario === 'compress') {
    const state = selfTestUserState('test compress');
    state.lastUserSeq = 1;
    return { scenario, toolName, decision: decideCompress({ state, mark: { turn: 1, seq: 1 }, currentTurn: 1, denyCompress: true, config }) };
  }
  if (scenario === 'task') {
    const state = selfTestUserState('请实现任务门控');
    return { scenario, toolName, decision: decideTask({ state, toolName, toolArgs: { file_path: 'C:/self-test/a.txt' }, config: { taskGate: true } }) };
  }
  if (scenario === 'continuity') {
    const base = emptyState({ cwd: 'C:/self-test' });
    const entry = handoffEntryFrom({ action: 'save', step: 'simulate step', next: 'simulate next', preserve: ['keep'], discard: ['temp'] }, 2, base);
    const state = Object.assign({}, base, { lastUserSeq: 1, continuity: entry });
    return { scenario, toolName, decision: decideContinuity({ state, toolName, pressureRatio: 0.5, config: Object.assign({}, config, { continuityGate: true }) }) };
  }
  if (scenario === 'memory') {
    return { scenario, decision: { allow: memoryRecordProblem(code || 'x', 600) === '', reason: memoryRecordProblem(code || 'x', 600) } };
  }
  throw new Error('scenario must be reasoning, risk, recall, record, task, compress, continuity, or memory');
}
