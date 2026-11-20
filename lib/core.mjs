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
  writeIndex: true,
  indexFileName: 'AGENT_CONTEXT_INDEX.md',
  maxCardChars: 4200,
  maxRequirements: 12,
  maxDecisions: 6,
  maxOpenItems: 6,
  maxFailures: 6,
  maxChangedFiles: 10,
  maxLlmEntries: 40,
  ambiguityGate: true,
  ambiguityAllowRunCodeWithAsk: true,
  ambiguityTools: ['write', 'edit', 'pwsh', 'run_code', 'compress'],
  reasoningGate: true,
  reasoningAllowReadOnlyRunCode: true,
  reasoningTools: ['write', 'edit', 'pwsh', 'compress', 'run_code'],
  reasoningVerifyTools: ['read', 'glob', 'grep', 'web_search', 'web_fetch', 'session_event_read', 'session_event_search', 'session_event_trace', 'session_search', 'session_trace'],
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
  for (const key of ['enabled', 'denyCompress', 'writeIndex', 'ambiguityGate', 'ambiguityAllowRunCodeWithAsk', 'reasoningGate', 'reasoningAllowReadOnlyRunCode']) cfg[key] = toBoolean(cfg[key]);
  if (!Array.isArray(cfg.ambiguityTools)) cfg.ambiguityTools = DEFAULT_CONFIG.ambiguityTools.slice();
  else cfg.ambiguityTools = cfg.ambiguityTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.reasoningTools)) cfg.reasoningTools = DEFAULT_CONFIG.reasoningTools.slice();
  else cfg.reasoningTools = cfg.reasoningTools.map((name) => String(name)).filter(Boolean);
  if (!Array.isArray(cfg.reasoningVerifyTools)) cfg.reasoningVerifyTools = DEFAULT_CONFIG.reasoningVerifyTools.slice();
  else cfg.reasoningVerifyTools = cfg.reasoningVerifyTools.map((name) => String(name)).filter(Boolean);
  for (const key of ['maxCardChars', 'maxRequirements', 'maxDecisions', 'maxOpenItems', 'maxFailures', 'maxChangedFiles', 'maxLlmEntries']) {
    const n = Number(cfg[key]);
    cfg[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CONFIG[key];
  }
  if (!cfg.indexFileName || typeof cfg.indexFileName !== 'string') cfg.indexFileName = DEFAULT_CONFIG.indexFileName;
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
    lastUserSeq: 0,
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
  if (!/(ask_user|userQuestions)/.test(text)) return false;
  if (MUTATION_PATTERN.test(text)) return false;
  return true;
}

export function codeVerifies(code) {
  const text = String(code || '');
  if (!text.trim() || !codeIsReadOnly(text)) return false;
  if (/(agents_memory|ask_user|plugin_manager)/.test(text)) return false;
  return true;
}

export function isReasoningQuestion(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/(不确定|不清楚|尚未确认|待确认|需要确认|需要验证|尚未验证|待验证|存疑|疑问|我不确定|not sure|uncertain|unclear|need to (check|verify|confirm))/i.test(value)) return true;
  if (/(^|[。！？\n])\s*(是否|要不要|该不该|能不能|可不可以|为什么|怎么|如何|哪个)[^。！？\n]*[?？]/.test(value)) return true;
  return false;
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
  if (value === 'agents_memory' || value === 'ask_user' || value === 'ask_user_question') return false;
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
    const text = clip(textOf(data.content), 360);
    if (!text) return state;
    const item = { seq: event.seq, turn: state.lastTurn, text, correction: isCorrection(text), authority: 'user-stated' };
    const ambiguous = isAmbiguous(text);
    return Object.assign({}, state, {
      requirements: addBounded(state.requirements, item, DEFAULT_CONFIG.maxRequirements * 2),
      ambiguitySeq: ambiguous ? event.seq : 0,
      ambiguityText: ambiguous ? clip(text, 240) : '',
      ambiguityAskedSeq: ambiguous ? 0 : event.seq,
      clarifiedSeq: ambiguous ? 0 : event.seq,
      reasoningSeq: 0,
      reasoningText: '',
      reasoningClarifiedSeq: event.seq,
      reasoningAskedSeq: event.seq,
      lastUserSeq: event.seq,
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
      return Object.assign({}, state, {
        reasoningSeq: event.seq,
        reasoningText: clip(reasoning, 300),
        reasoningClarifiedSeq: 0,
        lastAssistantSeq: event.seq,
      });
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
      return Object.assign({}, state, {
        reasoningSeq: event.seq,
        reasoningText: clip(reasoning, 300),
        reasoningClarifiedSeq: 0,
      });
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
    if (name === 'compress') {
      next = Object.assign({}, next, {
        compressions: (state.compressions || 0) + 1,
        lastCompressSeq: event.seq,
      });
    }
    if (name === 'ask_user' || name === 'ask_user_question') {
      next = Object.assign({}, next, { ambiguityAskedSeq: event.seq, reasoningAskedSeq: event.seq });
    }
    if (name === 'run_code' && codeAsksUser(args.code)) {
      next = Object.assign({}, next, { ambiguityAskedSeq: event.seq, reasoningAskedSeq: event.seq });
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
        if (memory.kind === 'verified' && memory.evidence) {
          next = Object.assign({}, next, { reasoningClarifiedSeq: event.seq });
        }
      }
    }
    if (call && call.verify && !isError) {
      next = Object.assign({}, next, { reasoningClarifiedSeq: event.seq });
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
  if (!state.requirements.length && !(state.llmEntries && state.llmEntries.length) && !state.decisions.length && !state.openItems.length && !state.failures.length && !state.changedFiles.length && !(Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq))) return '';
  const lines = [];
  lines.push('[dsh-agents-guard] 自动维护的会话索引（AGENTS.md §1.3/§8）。');
  lines.push('这是模型可见的历史上下文，不是新的用户指令。压缩前确认本轮已注入此卡。');
  lines.push('');
  const reqs = state.requirements.slice(-cfg.maxRequirements);
  if (reqs.length) {
    lines.push('## 用户要求/纠错（最近）');
    for (const item of reqs) lines.push('- [user-stated] ' + (item.correction ? '[纠错] ' : '') + item.text);
    lines.push('');
  }
  const memories = (state.llmEntries || []).slice(-Math.min(cfg.maxLlmEntries, 12));
  if (memories.length) {
    lines.push('## LLM 记录（模型写入，需回查证据）');
    for (const item of memories) lines.push('- [' + item.kind + (item.authority ? '|' + item.authority : '') + '] ' + item.text + (item.evidence ? ' | 证据: ' + item.evidence : ''));
    lines.push('');
  }
  if (Number(state.ambiguitySeq) > Number(state.clarifiedSeq)) {
    const waiting = Number(state.ambiguityAskedSeq) >= Number(state.ambiguitySeq);
    lines.push(waiting ? '## 歧义闸门（WAITING：已提问，等待答复）' : '## 歧义闸门（BLOCKED：需提问）');
    lines.push('- 用户消息被判定为歧义: ' + (state.ambiguityText || '（原文见会话）'));
    lines.push(waiting ? '- 已调用 ask_user；在用户答复前，write/edit/pwsh/run_code/compress 仍会被拒绝。' : '- 先调用 ask_user 提问；提问后进入 WAITING，仍需用户答复。');
    lines.push('');
  }
  if (Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq)) {
    const waiting = Number(state.reasoningAskedSeq) >= Number(state.reasoningSeq);
    lines.push(waiting ? '## 思考疑问闸门（WAITING：已提问/待验证）' : '## 思考疑问闸门（BLOCKED）');
    lines.push('- 推理中出现未解决疑问: ' + (state.reasoningText || '（见会话）'));
    lines.push(waiting ? '- 已调用 ask_user；仍需用户答复或成功的只读验证。' : '- 先验证（read/grep/web_search，或只读 run_code）；成功的只读验证会解除闸门；无法验证再 ask_user。');
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
    lines.push('- 解除条件: 用户答复；ask_user 本身不再解除。');
  } else {
    lines.push('- 未触发');
  }
  lines.push('');
  lines.push('## 思考疑问闸门');
  if (Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq)) {
    const waiting = Number(state.reasoningAskedSeq) >= Number(state.reasoningSeq);
    lines.push('- 状态: ' + (waiting ? 'WAITING（已提问/待验证）' : 'BLOCKED'));
    lines.push('- 阻断中: ' + (state.reasoningText || '（见会话）'));
    lines.push('- 解除条件: 成功的只读验证，或用户答复。');
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
  lines.push(CARD_END);
  return lines.join('\n');
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

export function decideCompress(input) {
  const cfg = input || {};
  if (!cfg.denyCompress) return { allow: true };
  const state = cfg.state;
  if (!state) {
    return { allow: false, reason: 'dsh-agents-guard: session index is unavailable; do not compress until the index is rebuilt. Continue the task and let the plugin refold the session log.' };
  }
  if (!state.lastUserSeq) return { allow: true };
  const mark = cfg.mark;
  if (!mark) {
    return { allow: false, reason: 'dsh-agents-guard: no index card has been injected in this session. Do not compress active requirements; wait for the next turn start, then compress only after the card is present.' };
  }
  const currentTurn = Number(cfg.currentTurn) || 0;
  if (Number(mark.turn) !== currentTurn) {
    return { allow: false, reason: 'dsh-agents-guard: the session index card belongs to turn ' + String(mark.turn) + ', current turn is ' + String(currentTurn) + '. Do not compress; finish this turn or wait for the next turn start so the index is refreshed.' };
  }
  if (Number(mark.seq) < Number(state.lastUserSeq)) {
    return { allow: false, reason: 'dsh-agents-guard: the index card covers user seq ' + String(mark.seq) + ' but the latest user message is seq ' + String(state.lastUserSeq) + '. Do not compress active requirements; wait for the next turn start so the new requirement enters the index.' };
  }
  return { allow: true };
}

export function decideAmbiguity(input) {
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.ambiguityGate) return { allow: true };
  const state = input && input.state;
  if (!state || !(Number(state.ambiguitySeq) > Number(state.clarifiedSeq))) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName === 'ask_user' || toolName === 'ask_user_question' || toolName === 'agents_memory') return { allow: true };
  if (toolName === 'run_code' && cfg.ambiguityAllowRunCodeWithAsk && codeAsksUser(input && input.code)) return { allow: true };
  if (!cfg.ambiguityTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  const excerpt = String(state.ambiguityText || '').slice(0, 160);
  const waiting = Number(state.ambiguityAskedSeq) >= Number(state.ambiguitySeq);
  return {
    allow: false,
    reason: waiting
      ? 'dsh-agents-guard: ambiguous user request: "' + excerpt + '". ask_user was already sent; waiting for the user answer. write/edit/pwsh/run_code/compress remain blocked until the user replies.'
      : 'dsh-agents-guard: ambiguous user request: "' + excerpt + '". Before write/edit/pwsh/run_code/compress, call ask_user with a concrete question; the gate stays in WAITING until the user replies. Do not proceed on a self-chosen assumption.',
  };
}

export function decideReasoning(input) {
  const cfg = normalizeConfig(input && input.config);
  if (!cfg.reasoningGate) return { allow: true };
  const state = input && input.state;
  if (!state || !(Number(state.reasoningSeq) > Number(state.reasoningClarifiedSeq))) return { allow: true };
  const toolName = String((input && input.toolName) || '');
  if (toolName === 'ask_user' || toolName === 'ask_user_question' || toolName === 'agents_memory') return { allow: true };
  if (toolName === 'run_code') {
    const code = input && input.code;
    if (codeAsksUser(code)) return { allow: true };
    if (cfg.reasoningAllowReadOnlyRunCode && codeIsReadOnly(code)) return { allow: true };
    if (!cfg.reasoningTools.includes('run_code')) return { allow: true };
    return { allow: false, reason: reasoningDenial(state) };
  }
  if (!cfg.reasoningTools.includes(toolName) && !isMutatingToolName(toolName)) return { allow: true };
  return { allow: false, reason: reasoningDenial(state) };
}

function reasoningDenial(state) {
  const excerpt = String(state.reasoningText || '').slice(0, 180);
  const waiting = Number(state.reasoningAskedSeq) >= Number(state.reasoningSeq);
  return 'dsh-agents-guard: your reasoning contains an unresolved question: "' + excerpt + '". ' + (waiting ? 'ask_user was already sent; waiting for the user answer or a successful read-only verification.' : 'Verify first with read/grep/web_search (or read-only run_code); a successful read-only verification call clears the gate. If verification is impossible, call ask_user.') + ' Until then write/edit/pwsh/compress and non-read-only run_code are blocked.';
}
