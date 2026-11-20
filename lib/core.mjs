// Pure, deterministic session-memory helpers for dsh-agents-guard.
// No host imports: unit tests can exercise this file directly.

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
export function memoryRecordProblem(text) {
  const value = String(text || '').trim();
  if (!value) return 'text is required';
  if (value.length > MEMORY_TEXT_MAX) {
    return 'distill the memory to at most ' + MEMORY_TEXT_MAX + ' characters; do not paste the raw user message (locate the original with agents_index search)';
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

export const DEFAULT_CONFIG = {
  enabled: true,
  denyCompress: true,
  compressPressureRatio: 0.8,
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
  recallGate: true,
  recordGate: true,
  ambiguityGate: true,
  ambiguityAllowRunCodeWithAsk: true,
  ambiguityTools: ['write', 'edit', 'pwsh', 'run_code', 'compress'],
  reasoningGate: true,
  reasoningAllowReadOnlyRunCode: false,
  reasoningTools: ['write', 'edit', 'pwsh', 'compress', 'run_code'],
  reasoningVerifyTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace'],
  maxReasoningQuestions: 8,
};

function toBoolean(value) {
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'false' || text === '0' || text === 'no' || text === 'off' || text === '') return false;
    if (text === 'true' || text === '1' || text === 'yes' || text === 'on') return true;
  }
  return Boolean(value);
}

export function normalizeConfig(input) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, input && typeof input === 'object' ? input : {});
  for (const key of ['enabled', 'denyCompress', 'legacyCompressWithoutCard', 'writeIndex', 'recallGate', 'recordGate', 'ambiguityGate', 'ambiguityAllowRunCodeWithAsk', 'reasoningGate', 'reasoningAllowReadOnlyRunCode']) cfg[key] = toBoolean(cfg[key]);
  // Guard invariants: these two are not user policies and must not be switchable.
  cfg.denyCompress = true;
  cfg.legacyCompressWithoutCard = true;
  if (!Array.isArray(cfg.ambiguityTools)) cfg.ambiguityTools = DEFAULT_CONFIG.ambiguityTools.slice();
  else cfg.ambiguityTools = cfg.ambiguityTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.reasoningTools)) cfg.reasoningTools = DEFAULT_CONFIG.reasoningTools.slice();
  else cfg.reasoningTools = cfg.reasoningTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.reasoningVerifyTools)) cfg.reasoningVerifyTools = DEFAULT_CONFIG.reasoningVerifyTools.slice();
  else cfg.reasoningVerifyTools = cfg.reasoningVerifyTools.map((name) => String(name)).filter(Boolean);
  const pressureRatio = Number(cfg.compressPressureRatio);
  cfg.compressPressureRatio = Number.isFinite(pressureRatio) && pressureRatio > 0 && pressureRatio <= 1
    ? pressureRatio
    : DEFAULT_CONFIG.compressPressureRatio;
  for (const key of ['maxCardChars', 'maxRequirements', 'maxDecisions', 'maxOpenItems', 'maxFailures', 'maxChangedFiles', 'maxLlmEntries', 'maxReasoningQuestions']) {
    const n = Number(cfg[key]);
    cfg[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CONFIG[key];
  }
  if (!cfg.indexFileName || typeof cfg.indexFileName !== 'string') cfg.indexFileName = DEFAULT_CONFIG.indexFileName;
  if (typeof cfg.indexRoot !== 'string') cfg.indexRoot = '';
  return cfg;
}

export function emptyState(header) {
  return {
    version: 1,
    cwd: header && header.cwd ? String(header.cwd) : '',
    requirements: [],
    decisions: [],
    openItems: [],
    failures: [],
    changedFiles: [],
    pendingCalls: {},
    llmEntries: [],
    ambiguitySeq: 0,
    ambiguityText: '',
    ambiguityAskedSeq: 0,
    clarifiedSeq: 0,
    reasoningSeq: 0,
    reasoningText: '',
    reasoningClarifiedSeq: 0,
    reasoningAskedSeq: 0,
    reasoningQuestions: [],
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
    ambiguityText: redactSecrets(state.ambiguityText),
    reasoningText: redactSecrets(state.reasoningText),
    reasoningQuestions: (state.reasoningQuestions || []).map((item) => Object.assign({}, item, {
      text: redactSecrets(item.text),
      evidence: redactSecrets(item.evidence || ''),
    })),
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

const MUTATION_PATTERN = /(writeFile|appendFile|unlink|rename|copyFile|mkdir|spawn|execFile|child_process|tools\.(write|edit|pwsh|run_code)|fs\.(write|append|rm|unlink|rename|copyFile|mkdir))/i;

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
  'agents_index', 'agents_verify', 'agents_memory', 'ask_user', 'ask_user_question',
];

export function safeRunCodeCall(code) {
  const text = String(code || '').trim();
  const match = text.match(/^await\s+tools\.([A-Za-z0-9_]+)\(\s*(\{[\s\S]*\})\s*\)\s*;?$/);
  if (!match) return null;
  const name = match[1];
  if (!SAFE_RUN_CODE_TOOLS.includes(name)) return null;
  let input;
  try {
    input = JSON.parse(match[2]);
  } catch {
    return null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return { name, input };
}

export function isSafeGateRunCode(code) {
  return Boolean(safeRunCodeCall(code));
}

export function agentsVerifyQuestionId(code) {
  const call = safeRunCodeCall(code);
  if (!call || call.name !== 'agents_verify') return '';
  const input = call.input;
  if (typeof input.questionId !== 'string' || !input.questionId.trim()) return '';
  if (!['read_file', 'list_dir', 'grep'].includes(String(input.op || ''))) return '';
  return input.questionId;
}

export function isAgentsVerifyRunCode(code) {
  return Boolean(agentsVerifyQuestionId(code));
}

export function isAskUserRunCode(code) {
  const call = safeRunCodeCall(code);
  return Boolean(call && (call.name === 'ask_user' || call.name === 'ask_user_question'));
}

export function isReasoningQuestion(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/(不确定|不清楚|尚未确认|待确认|需要确认|需要验证|尚未验证|待验证|存疑|疑问|我不确定|not sure|uncertain|unclear|need to (check|verify|confirm))/i.test(value)) return true;
  if (/(^|[。！？\n])\s*(是否|要不要|该不该|能不能|可不可以|为什么|怎么|如何|哪个)[^。！？\n]*[?？]/.test(value)) return true;
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
  const list = state && Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions : [];
  const open = list.filter((item) => item && !item.resolvedSeq && item.status !== 'resolved');
  if (open.length) return open;
  if (!list.length && state && Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq)) {
    return [{
      id: 'legacy-' + String(state.reasoningSeq),
      seq: Number(state.reasoningSeq) || 0,
      text: String(state.reasoningText || ''),
      status: Number(state.reasoningAskedSeq) >= Number(state.reasoningSeq) ? 'waiting' : 'open',
      askedSeq: Number(state.reasoningAskedSeq) || 0,
      resolvedSeq: 0,
      evidence: '',
      legacy: true,
    }];
  }
  return [];
}

function trimReasoningQuestions(list, max = DEFAULT_CONFIG.maxReasoningQuestions) {
  if (list.length <= max) return list;
  const open = list.filter((item) => !item.resolvedSeq);
  const resolved = list.filter((item) => item.resolvedSeq);
  return resolved.slice(-2).concat(open).slice(-max);
}

function addReasoningQuestions(state, event, reasoning) {
  const candidates = extractReasoningQuestions(reasoning);
  if (!candidates.length) return state;
  const list = (Array.isArray(state.reasoningQuestions) ? state.reasoningQuestions : []).map((item) => Object.assign({}, item));
  for (let index = 0; index < candidates.length; index++) {
    const text = clip(candidates[index], 300);
    const existing = list.find((item) => !item.resolvedSeq && item.text === text);
    if (existing) {
      existing.seq = event.seq;
      existing.lastSeenSeq = event.seq;
      continue;
    }
    list.push({
      id: 'q-' + String(event.seq) + '-' + String(index),
      seq: event.seq,
      lastSeenSeq: event.seq,
      text,
      status: 'open',
      askedSeq: 0,
      resolvedSeq: 0,
      evidence: '',
    });
  }
  return Object.assign({}, state, {
    reasoningQuestions: trimReasoningQuestions(list),
    reasoningSeq: event.seq,
    reasoningText: clip(reasoning, 300),
    lastAssistantSeq: event.seq,
  });
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
  const nextList = list.map((item) => {
    if (item.id !== id || item.resolvedSeq) return item;
    found = true;
    return Object.assign({}, item, {
      status: 'resolved',
      resolvedSeq: seq,
      evidence: clip(redactSecrets(evidence || ''), 260),
    });
  });
  if (found) {
    return Object.assign({}, state, {
      reasoningQuestions: nextList,
      reasoningClarifiedSeq: Math.max(Number(state.reasoningClarifiedSeq) || 0, seq),
    });
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
    const open = nextList.filter((item) => !item.resolvedSeq);
    const latest = open.length ? open[open.length - 1] : null;
    return Object.assign({}, state, {
      reasoningQuestions: nextList,
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

export function isAmbiguous(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/^【回答/.test(value) || /→/.test(value)) return false;
  const diagnostic = /(看见|看到|见不到|没看到|是否(?:卡死|存在|显示|生效|正常|可用|成功|失败|有问题|问题|错误)|是不是(?:卡死|存在|显示|生效|正常|可用|成功|失败|有问题|问题|错误)|为什么|怎么|如何|怎么回事|什么原因|状态|情况)/;
  const rhetorical = /(怎么|为什么|为何|难道)[^。！？\n]*(还是|又|还|不|没)[^。！？\n]*[?？]/;
  const choice = /(还是|或者|随便|你决定|看着办|都行|你定|二选一|哪个好|选哪个|怎么办)/;
  if (rhetorical.test(value)) return false;
  if (diagnostic.test(value) && !choice.test(value)) return false;
  if (/(随便|你决定|你看着办|看着办|都行|你定|按你想法)/.test(value)) return true;
  if (/(还是|或者)[\s\S]*[?？]/.test(value)) return true;
  if (/(要不要|是否|能不能|可不可以|行不行)[\s\S]*[?？]/.test(value)) return true;
  if (/(二选一|哪个好|选哪个|怎么办)/.test(value)) return true;
  return false;
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
  return /(^|[_:-])(write|edit|patch|delete|create|remove|move|rename|terminal|bash|shell|exec(ute)?|run|command|push|upload|merge|close|comment|update)([_:-]|$)/i.test(value);
}

function toolNameFor(state, toolCallId) {
  const call = toolCallId && state.pendingCalls ? state.pendingCalls[toolCallId] : undefined;
  return call && call.name ? call.name : 'tool';
}

export function reduceEvent(state, event) {
  if (!state || !event || typeof event.type !== 'string') return state;
  const data = event.data || {};
  if (event.type === 'user/message') {
    const sourceKind = data.source && data.source.kind;
    if (sourceKind && sourceKind !== 'user') return state;
    const fullText = textOf(data.content);
    const text = clip(fullText, 360);
    if (!text) return state;
    const item = { seq: event.seq, turn: state.lastTurn, text, correction: isCorrection(text), authority: 'user-stated' };
    const ambiguous = isAmbiguous(text);
    const answered = resolveWaitingReasoning(state, event.seq);
    return Object.assign({}, answered, {
      requirements: addBounded(answered.requirements, item, DEFAULT_CONFIG.maxRequirements * 2),
      userLog: addBounded(answered.userLog || [], { seq: event.seq, text: clip(fullText, 4000) }, 500),
      ambiguitySeq: ambiguous ? event.seq : 0,
      ambiguityText: ambiguous ? clip(text, 240) : '',
      ambiguityAskedSeq: ambiguous ? 0 : event.seq,
      clarifiedSeq: ambiguous ? 0 : event.seq,
      reasoningClarifiedSeq: event.seq,
      reasoningAskedSeq: 0,
      lastUserSeq: event.seq,
      lastUserText: clip(fullText, 4000),
      lastUserTurn: state.lastTurn,
    });
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
    const reasoning = clip(reasoningTextOf(data), 600);
    if (reasoning && isReasoningQuestion(reasoning)) {
      return addReasoningQuestions(state, event, reasoning);
    }
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
    const reasoning = clip(reasoningTextOf(data), 600);
    if (reasoning && isReasoningQuestion(reasoning)) {
      return addReasoningQuestions(state, event, reasoning);
    }
    return state;
  }
  if (event.type === 'tool/call') {
    const name = String(data.name || 'tool');
    const args = parseArgs(data.arguments);
    const pending = Object.assign({}, state.pendingCalls || {});
    if (data.callId) {
      const file = args.file_path || args.path || args.filename;
      const record = { name, file: typeof file === 'string' ? clip(file, 260) : '' };
      record.verify = DEFAULT_CONFIG.reasoningVerifyTools.includes(name) || (name === 'run_code' && codeVerifies(args.code));
      if (name === 'agents_verify' && args.questionId) record.verifyQuestionId = String(args.questionId);
      if (name === 'run_code') {
        const verifyId = agentsVerifyQuestionId(args.code);
        if (verifyId) record.verifyQuestionId = verifyId;
        const safe = safeRunCodeCall(args.code);
        if (safe && safe.name === 'agents_memory') {
          record.memory = {
            kind: String(safe.input.kind || ''),
            text: clip(safe.input.text, 500),
            evidence: clip(safe.input.evidence, 260),
          };
        }
      }
      if (name === 'agents_memory') {
        record.memory = {
          kind: String(args.kind || ''),
          text: clip(args.text, 500),
          evidence: clip(args.evidence, 260),
        };
      }
      pending[data.callId] = record;
    }
    const keys = Object.keys(pending);
    while (keys.length > 30) {
      const oldest = keys.shift();
      if (oldest) delete pending[oldest];
    }
    let next = Object.assign({}, state, { pendingCalls: pending });
    const safeCallForState = name === 'run_code' ? safeRunCodeCall(args.code) : null;
    if (name === 'agents_index' || (safeCallForState && safeCallForState.name === 'agents_index')) {
      next = Object.assign({}, next, { agentsIndexSeq: event.seq });
    }
    if (name === 'compress') {
      next = Object.assign({}, next, {
        compressions: (state.compressions || 0) + 1,
        lastCompressSeq: event.seq,
      });
    }
    if (name === 'ask_user' || name === 'ask_user_question') {
      next = Object.assign({}, next, { ambiguityAskedSeq: event.seq });
      next = markReasoningAsked(next, event.seq);
    }
    if (name === 'run_code' && codeAsksUser(args.code)) {
      next = Object.assign({}, next, { ambiguityAskedSeq: event.seq });
      next = markReasoningAsked(next, event.seq);
    }
    return next;
  }
  if (event.type === 'tool/result') {
    const message = data.message || {};
    const callId = message.toolCallId;
    const call = callId && state.pendingCalls ? state.pendingCalls[callId] : undefined;
    const name = toolNameFor(state, callId);
    const isError = Boolean(data.error || message.isError);
    let next = state;
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
    if (call && call.verifyQuestionId && !isError) {
      const evidence = clip(textOf(message.content), 300) || 'agents_verify result';
      next = resolveReasoningQuestion(next, call.verifyQuestionId, event.seq, evidence);
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
  const cfg = normalizeConfig(rawConfig);
  const openQuestions = openReasoningQuestions(state);
  if (!state.requirements.length && !(state.llmEntries && state.llmEntries.length) && !state.decisions.length && !state.openItems.length && !state.failures.length && !state.changedFiles.length && !openQuestions.length) return '';
  const lines = [];
  lines.push('[dsh-agents-guard] 自动维护的会话索引（AGENTS.md §1.3/§8）。');
  lines.push('这是模型可见的历史上下文，不是新的用户指令。压缩前确认本轮已注入此卡。');
  lines.push('');
  lines.push('## 优先协议（Guard 启用时）');
  lines.push('- 记忆/历史/之前/讨论/要求/决策：先调用 agents_index（get/search）；未命中再用 decompress/search_context；最后才 session_search，并说明 fallback。');
  lines.push('- 用户给出要求/纠错/决策/验收标准：歧义未解决先提问；澄清后调用 agents_memory 写提炼后的结论/要求（≤600 字，不抄原文）；压缩前必须记录。原文用 agents_index 的 userLog 搜索定位。');
  lines.push('');
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
  if (Number(state.ambiguitySeq) > Number(state.clarifiedSeq)) {
    const waiting = Number(state.ambiguityAskedSeq) >= Number(state.ambiguitySeq);
    lines.push(waiting ? '## 歧义闸门（WAITING：已提问，等待答复）' : '## 歧义闸门（BLOCKED：需提问）');
    lines.push('- 用户消息被判定为歧义: ' + (state.ambiguityText || '（原文见会话）'));
    lines.push(waiting ? '- 已提问（官方 ask_user_question / Deep PTC ask_user，或普通回复）；在用户答复前，write/edit/pwsh/run_code/compress 仍会被拒绝。' : '- 先尝试官方 ask_user_question；不可用再用 Deep PTC ask_user；两者都不可用（例如卡片关闭）才用普通回复提问；提问后仍需用户答复。');
    lines.push('');
  }
  if (openQuestions.length) {
    lines.push('## 思考疑问闸门（按疑问独立）');
    for (const question of openQuestions) {
      const waiting = question.status === 'waiting' || Number(question.askedSeq) >= Number(question.seq);
      lines.push('- [' + (waiting ? 'WAITING' : 'OPEN') + '] ' + question.id + ': ' + question.text);
    }
    lines.push('- 解除条件: 对具体 questionId 调用 agents_verify({questionId, op, path/pattern})；一次成功只解除该 ID，不会清除其它疑问。');
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
  const cfg = normalizeConfig(rawConfig);
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
  lines.push('## 歧义闸门');
  if (Number(state.ambiguitySeq) > Number(state.clarifiedSeq)) {
    const waiting = Number(state.ambiguityAskedSeq) >= Number(state.ambiguitySeq);
    lines.push('- 状态: ' + (waiting ? 'WAITING（已提问，等待用户答复）' : 'BLOCKED（需提问）'));
    lines.push('- 阻断中: ' + (state.ambiguityText || '（原文见会话）'));
    lines.push('- 解除条件: 用户答复；官方 ask_user_question / Deep PTC ask_user 本身不再解除。');
  } else {
    lines.push('- 未触发');
  }
  lines.push('');
  lines.push('## 思考疑问闸门（按疑问独立）');
  if (openQuestions.length) {
    for (const question of openQuestions) {
      const waiting = question.status === 'waiting' || Number(question.askedSeq) >= Number(question.seq);
      lines.push('- [' + (waiting ? 'WAITING' : 'OPEN') + '] ' + question.id + ': ' + question.text);
    }
    lines.push('- 解除条件: 对具体 questionId 调用 agents_verify；一次成功只解除该 ID。');
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
  lines.push('- ambiguitySeq=' + String(state.ambiguitySeq) + ' ambiguityAskedSeq=' + String(state.ambiguityAskedSeq) + ' clarifiedSeq=' + String(state.clarifiedSeq));
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
  const currentTurn = Number(cfg.currentTurn) || 0;
  if (Number(mark.turn) !== currentTurn) {
    return { allow: false, reason: 'dsh-agents-guard: the session index card belongs to turn ' + String(mark.turn) + ', current turn is ' + String(currentTurn) + '. Do not compress; call agents_memory to record the latest requirements/decisions, then finish this turn or wait for the next turn start so the index is refreshed.' };
  }
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
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.recallGate) return { allow: true };
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
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.recordGate) return { allow: true };
  const state = input && input.state;
  const toolName = String((input && input.toolName) || '');
  if (!state || !state.lastUserText || !isRecordIntent(state.lastUserText)) return { allow: true };
  if (Number(state.ambiguitySeq) > Number(state.clarifiedSeq)) {
    return { allow: false, reason: 'dsh-agents-guard: resolve the ambiguity before recording or mutating. Ask the user first; after the reply, record the clarified requirement with agents_memory, then continue.' };
  }
  if (Number(state.memoryRecordedSeq) >= Number(state.lastUserSeq)) return { allow: true };
  if (toolName === 'agents_memory' || toolName === 'agents_index' || toolName === 'agents_verify' || toolName === 'ask_user' || toolName === 'ask_user_question') return { allow: true };
  if (toolName === 'run_code' && isSafeGateRunCode(input && input.code)) return { allow: true };
  if (toolName === 'run_code') return { allow: false, reason: 'dsh-agents-guard: the latest user message contains a requirement/correction/decision. Before a non-read-only run_code, call agents_memory to record a distilled conclusion. Run_code accepts exactly one safe call with a JSON object, e.g. `await tools.agents_memory({"action":"add","kind":"correction","text":"..."})`; JavaScript object literals with unquoted keys are not accepted. Exactly one safe read-only call is still allowed.' };
  if (!isMutatingToolName(toolName) && toolName !== 'compress') return { allow: true };
  return {
    allow: false,
    reason: 'dsh-agents-guard: the latest user message contains a requirement/correction/decision. Before write/edit/pwsh/compress or a non-read-only run_code, call agents_memory({action:"add", kind:"requirement|correction|decision|verified|open", text, evidence}) to record a distilled conclusion/requirement (<=600 characters), not a copy of the raw message; locate the original with agents_index search. Read-only tools remain available. This keeps the session index complete instead of relying on truncated heuristics.',
  };
}

export function decideAmbiguity(input) {
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.ambiguityGate) return { allow: true };
  const state = input && input.state;
  if (!state || !(Number(state.ambiguitySeq) > Number(state.clarifiedSeq))) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName === 'ask_user' || toolName === 'ask_user_question' || toolName === 'agents_index' || toolName === 'agents_verify') return { allow: true };
  if (toolName === 'agents_memory' || (toolName === 'run_code' && safeRunCodeCall(input && input.code)?.name === 'agents_memory')) {
    return { allow: false, reason: 'dsh-agents-guard: the user request is still ambiguous. Resolve the ambiguity first (ask the user), then record the clarified requirement/decision with agents_memory as a distilled conclusion/requirement, not the raw text. Do not record an unconfirmed guess.' };
  }
  if (toolName === 'run_code' && isSafeGateRunCode(input && input.code)) return { allow: true };
  if (toolName === 'run_code' && cfg.ambiguityAllowRunCodeWithAsk && codeAsksUser(input && input.code)) return { allow: true };
  if (!cfg.ambiguityTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  const excerpt = String(state.ambiguityText || '').slice(0, 160);
  const waiting = Number(state.ambiguityAskedSeq) >= Number(state.ambiguitySeq);
  return {
    allow: false,
    reason: waiting
      ? 'dsh-agents-guard: ambiguous user request: "' + excerpt + '". A question was already asked; waiting for the user answer. write/edit/pwsh/run_code/compress remain blocked until the user replies.'
      : 'dsh-agents-guard: ambiguous user request: "' + excerpt + '". Before write/edit/pwsh/run_code/compress, ask a concrete question via the official ask_user_question first, then Deep PTC ask_user, and finally a normal reply if neither ask tool is available (for example Deep PTC cards are off); the gate stays blocked until the user replies. Do not proceed on a self-chosen assumption.',
  };
}

export function decideReasoning(input) {
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.reasoningGate) return { allow: true };
  const state = input && input.state;
  const open = openReasoningQuestions(state);
  if (!open.length) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName === 'ask_user' || toolName === 'ask_user_question' || toolName === 'agents_memory' || toolName === 'agents_index' || toolName === 'agents_verify') return { allow: true };
  if (cfg.reasoningVerifyTools.includes(toolName)) return { allow: true };
  if (toolName === 'run_code') {
    if (isSafeGateRunCode(input && input.code)) return { allow: true };
    return { allow: false, reason: reasoningDenial(open) };
  }
  if (!cfg.reasoningTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  return { allow: false, reason: reasoningDenial(open) };
}

function reasoningDenial(open) {
  const first = open[0] || {};
  const ids = open.map((question) => question.id).join(', ');
  return 'dsh-agents-guard: your reasoning contains unresolved question(s) [' + ids + ']: "' + String(first.text || '').slice(0, 180) + '". In PTC, call run_code with exactly one `await tools.agents_verify({questionId: "' + String(first.id || '') + '", op: "read_file|list_dir|grep", path: "...", pattern: "..."})` to verify; one success resolves only that ID. If verification is impossible, call run_code with exactly one `await tools.ask_user_question({...})` (official) or `await tools.ask_user({...})` (Deep PTC); if neither ask tool is available, ask in a normal reply; the user reply resolves the asked question. Only exactly one trusted safe run_code call with JSON arguments is allowed (read, glob, grep, web_search, web_fetch, session read tools, agents_index, agents_verify, agents_memory, ask_user, ask_user_question); arbitrary code and mutating calls are blocked.';
}
