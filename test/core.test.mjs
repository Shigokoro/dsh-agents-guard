import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCard,
  buildRiskReviewPrompt,
  codeAsksUser,
  codeIsReadOnly,
  codeVerifies,
  safeRunCodeCall,
  embeddedToolCalls,
  embeddedLedgerCalls,
  embeddedHandoffCall,
  GUARD_BUILD,
  pickHandoff,
  handoffHasNext,
  advanceInjectedMark,
  cardMarkCovers,
  decideCompress,
  decideRecall,
  decideRecord,
  decideReasoning,
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
  decideIndexGate,
  changeRecordProblem,
  checkRecordProblem,
  recoveryRecordProblem,
  evidenceRecordProblem,
  isTaskConfirmation,
  isTaskDenial,
  emptyReasoningState,
  parseGuardState,
  parseRiskReview,
  reasoningSimilarity,
  reduceReasoningEvent,
  renderReasoningState,
  shouldForceCompress,
  emptyState,
  hashCard,
  authorityFor,
  isRecallIntent,
  isRecordIntent,
  isReasoningQuestion,
  isAgentsVerifyRunCode,
  isAskUserRunCode,
  isSafeGateRunCode,
  agentsVerifyQuestionId,
  agentsVerifyQuestionIds,
  extractReasoningQuestions,
  openReasoningQuestions,
  resolveReasoningQuestion,
  isMutatingToolName,
  memoryRecordProblem,
  mergeLlmEntries,
  normalizeConfig,
  effectiveConfig,
  redactSecrets,
  reasoningTextOf,
  runGuardSelfTest,
  simulateGuardScenario,
  reduceEvent,
  renderIndexMarkdown,
  upsertGeneratedBlock,
} from '../lib/core.mjs';

function user(seq, text) {
  return { type: 'user/message', seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } };
}

function injectedUser(seq, text) {
  return { type: 'user/message', seq, data: { source: { kind: 'plugin:dsh-agents-guard' }, content: [{ type: 'text', text }] } };
}

function summaryReasoning(uncertainties, prefix = '') {
  return prefix + 'GUARD_SUMMARY ' + JSON.stringify({ goal: 'unit test', uncertainties });
}

let state = emptyState({ cwd: 'C:/work' });
state = reduceEvent(state, { type: 'turn/start', seq: 1, data: { turn: 1 } });
state = reduceEvent(state, user(2, '把索引写在项目根目录，不要覆盖手工内容。'));
assert.equal(state.requirements.length, 1);
assert.equal(state.requirements[0].correction, true);
assert.equal(state.lastUserSeq, 2);

state = reduceEvent(state, injectedUser(3, '[memory card] plugin-generated'));
assert.equal(state.requirements.length, 1, 'plugin-injected messages must not be indexed');

state = reduceEvent(state, {
  type: 'assistant/message',
  seq: 4,
  data: { message: { content: [{ type: 'text', text: '决定采用插件方案，待验证恢复行为。' }] } },
});
assert.equal(state.decisions.length, 1);
assert.equal(state.openItems.length, 1);

state = reduceEvent(state, {
  type: 'tool/call',
  seq: 5,
  data: { callId: 'call-1', name: 'edit', arguments: JSON.stringify({ file_path: 'a.txt' }) },
});
assert.equal(state.pendingCalls['call-1'].name, 'edit');
state = reduceEvent(state, {
  type: 'tool/result',
  seq: 6,
  data: { message: { toolCallId: 'call-1', content: [], isError: false }, error: undefined },
});
assert.equal(state.changedFiles.length, 1);
assert.equal(state.changedFiles[0].text, 'a.txt');
assert.equal(state.pendingCalls['call-1'], undefined);

const card = buildCard(state, {});
assert.match(card, /用户要求/);
assert.match(card, /a\.txt/);
assert.ok(card.length <= 4200);
assert.equal(hashCard(card), hashCard(card));

const allow = decideCompress({ state, mark: { turn: 1, seq: 2 }, currentTurn: 1, denyCompress: true });
assert.equal(allow.allow, true);
// Regression: a stale turn number must not deny on its own. The mark and the
// gate read the turn from different counters, and a pending or rejected
// injection used to freeze the mark at an older turn; the only freshness
// requirement is that the card covers the latest user message.
const staleTurnSameSeq = decideCompress({ state, mark: { turn: 0, seq: 2 }, currentTurn: 3, denyCompress: true });
assert.equal(staleTurnSameSeq.allow, true, 'turn mismatch alone must not deny');
const denySeq = decideCompress({ state, mark: { turn: 1, seq: 1 }, currentTurn: 1, denyCompress: true });
assert.equal(denySeq.allow, false);
assert.match(denySeq.reason, /seq/);
const noMark = decideCompress({ state, mark: undefined, currentTurn: 1, denyCompress: true });
assert.equal(noMark.allow, false);
const legacyNoMark = decideCompress({ state, mark: undefined, currentTurn: 1, denyCompress: true, legacyCompressWithoutCard: true });
assert.equal(legacyNoMark.allow, true);
const disabled = decideCompress({ state, mark: undefined, currentTurn: 1, denyCompress: false });
assert.equal(disabled.allow, true);

const forced = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 81000, contextWindow: 100000 });
assert.equal(forced.allow, true);
assert.equal(forced.forced, true);
assert.ok(Math.abs(forced.pressureRatio - 0.81) < 1e-9);
const exactPressure = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 75000, contextWindow: 100000 });
assert.equal(exactPressure.allow, true);
const belowPressure = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 74999, contextWindow: 100000 });
assert.equal(belowPressure.allow, false);
const customPressure = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 85000, contextWindow: 100000, compressPressureRatio: 0.9 });
assert.equal(customPressure.allow, false);
assert.equal(shouldForceCompress({ pressureTokens: 90000, contextWindow: 0 }).forced, false);
assert.equal(shouldForceCompress({ pressureTokens: 81000, contextWindow: 100000 }).forced, true);

const generated = renderIndexMarkdown(state, 'session-1', {});
assert.match(generated, /dsh-agents-guard:begin/);
assert.match(generated, /session-1/);
const manual = '# 手工索引\n\n保留我写的内容。\n';
const merged = upsertGeneratedBlock(manual, generated);
assert.match(merged, /手工索引/);
assert.match(merged, /dsh-agents-guard:begin/);
const mergedAgain = upsertGeneratedBlock(merged, generated);
assert.equal(mergedAgain, merged, 'second upsert must be idempotent');
const cfg = normalizeConfig({ maxCardChars: 0, denyCompress: 'false', legacyCompressWithoutCard: 'false' });
assert.equal(cfg.maxCardChars, 4200);
assert.equal(cfg.denyCompress, true);
assert.equal(cfg.legacyCompressWithoutCard, true);
assert.equal(normalizeConfig({}).compressPressureRatio, 0.75, 'default compression pressure threshold is 0.75');
assert.equal(normalizeConfig({ compressPressureRatio: 0.75 }).compressPressureRatio, 0.75);
assert.equal(normalizeConfig({ compressPressureRatio: 1.5 }).compressPressureRatio, 0.75, 'an out-of-range ratio falls back to the 0.75 default');
// Group master switches are separate from the child settings they pause. An
// old profile without group fields derives its group state from the children;
// a schema default must not silently enable a group the user never chose.
const derivedWorkflow = normalizeConfig({ taskGate: true, evidenceGate: false });
assert.equal(derivedWorkflow.workflowEnabled, true, 'old mixed workflow config must derive an enabled group');
assert.equal(derivedWorkflow.taskGate, true, 'old child setting must be preserved');
assert.equal(normalizeConfig({ taskGate: false, evidenceGate: false }).workflowEnabled, false, 'all-off old workflow must derive a disabled group');
assert.equal(normalizeConfig({ continuityGate: true, writeContinuity: false }).continuityEnabled, true, 'old mixed continuity must derive an enabled group');
assert.equal(normalizeConfig({ workflowEnabled: false, taskGate: true }, { explicit: {} }).workflowEnabled, true, 'a schema default without an explicit user field must not mask old child settings');
assert.equal(normalizeConfig({ workflowEnabled: false, taskGate: true }, { explicit: { workflowEnabled: false } }).workflowEnabled, false, 'an explicit user group choice must win');
assert.equal(normalizeConfig({ workflowEnabled: false, taskGate: true }, { explicit: { workflowEnabled: true } }).workflowEnabled, true, 'an explicit user on must win even when the value layer says off');
assert.equal(normalizeConfig({ workflowEnabled: true, taskGate: true }, { explicit: { workflowEnabled: null } }).workflowEnabled, false, 'a null explicit group must not silently count as on');
const userChildOverride = effectiveConfig(
  { workflowEnabled: false, taskGate: false, evidenceGate: false, impactGate: false, verificationGate: false, recoveryGate: false },
  { explicit: { taskGate: true } },
);
assert.equal(userChildOverride.taskGate, true, 'a child saved in the settings user layer must override the value/profile layer');
assert.equal(userChildOverride.workflowEnabled, true, 'a user-layer child must also derive its group on when no group field is set');
const groupOff = effectiveConfig({ workflowEnabled: false, taskGate: true, evidenceGate: true, maxEvidence: 7 });
assert.equal(groupOff.taskGate, false, 'effective workflow child must be paused');
assert.equal(groupOff.evidenceGate, false, 'every workflow child must be paused');
assert.equal(groupOff.maxEvidence, 7, 'numeric child settings must survive a paused group');
assert.equal(groupOff.workflowEnabled, false, 'group state remains readable');
const isolatedOff = effectiveConfig({
  workflowEnabled: false, taskGate: true, evidenceGate: true, maxEvidence: 7,
  continuityEnabled: true, continuityGate: true, writeContinuity: true,
  reasoningEnabled: true, reasoningGate: true, reasoningRiskGate: true,
  memoryEnabled: true, recallGate: true, recordGate: true, indexGate: true, writeIndex: true,
});
assert.equal(isolatedOff.taskGate, false, 'workflow off must pause its own child');
assert.equal(isolatedOff.continuityGate, true, 'workflow off must not pause continuity');
assert.equal(isolatedOff.reasoningGate, true, 'workflow off must not pause reasoning');
assert.equal(isolatedOff.recallGate, true, 'workflow off must not pause memory');
assert.equal(isolatedOff.maxEvidence, 7, 'workflow off must keep its numeric setting');
assert.equal(effectiveConfig({ taskGate: true }, { explicit: { workflowEnabled: false } }).taskGate, false, 'an explicit off must win in effective config');
const groupChildren = {
  workflowEnabled: ['taskGate', 'evidenceGate', 'impactGate', 'verificationGate', 'recoveryGate'],
  continuityEnabled: ['continuityGate', 'writeContinuity'],
  reasoningEnabled: ['reasoningGate', 'reasoningRiskGate', 'semanticReview', 'writeReasoningState'],
  memoryEnabled: ['recallGate', 'recordGate', 'indexGate', 'writeIndex'],
};
for (const [group, children] of Object.entries(groupChildren)) {
  const raw = { maxEvidence: 7 };
  for (const list of Object.values(groupChildren)) for (const child of list) raw[child] = true;
  raw[group] = false;
  const eff = effectiveConfig(raw);
  for (const child of children) assert.equal(eff[child], false, group + ' must pause ' + child);
  for (const [other, otherChildren] of Object.entries(groupChildren)) {
    if (other === group) continue;
    for (const child of otherChildren) assert.equal(eff[child], true, group + ' must not pause ' + other + '.' + child);
  }
  assert.equal(eff.maxEvidence, 7, group + ' must not erase numeric settings');
}
const continuousOff = effectiveConfig({ continuityEnabled: false, continuityGate: true, writeContinuity: true, continuityMaxChars: 900 });
assert.equal(continuousOff.continuityGate, false, 'effective continuity gate must be paused');
assert.equal(continuousOff.writeContinuity, false, 'effective continuity write must be paused');
assert.equal(continuousOff.continuityMaxChars, 900, 'continuity numeric setting must survive');
const rawPaused = { continuityEnabled: false, continuityGate: true, writeContinuity: true };
const rawSnapshot = JSON.stringify(rawPaused);
effectiveConfig(rawPaused);
assert.equal(JSON.stringify(rawPaused), rawSnapshot, 'effectiveConfig must not mutate raw child settings');
const memoryOff = effectiveConfig({ memoryEnabled: false, recallGate: true, recordGate: true, indexGate: true, writeIndex: true });
assert.equal(memoryOff.recallGate, false, 'memory child must be paused');
assert.equal(memoryOff.recordGate, false, 'memory child must be paused');
assert.equal(memoryOff.indexGate, false, 'index gate must be paused');
assert.equal(memoryOff.writeIndex, false, 'index writing must be paused');
assert.equal(decideTask({ state: emptyState({ cwd: 'C:/work' }), toolName: 'write', toolArgs: { file_path: 'C:/work/a.txt' }, config: { workflowEnabled: false, taskGate: true } }).allow, true, 'runtime task decision must honor the group switch');
assert.equal(decideRecord({ state: { lastUserText: '必须记录', lastUserSeq: 4, memoryRecordedSeq: 0 }, toolName: 'write', config: { memoryEnabled: false, recordGate: true } }).allow, true, 'runtime record decision must honor the group switch');
assert.equal(decideReasoning({ state: { reasoningQuestions: [{ id: 'q-group', text: 'A 还是 B？', status: 'open' }] }, toolName: 'write', config: { reasoningEnabled: false, reasoningGate: true } }).allow, true, 'runtime reasoning decision must honor the group switch');
assert.equal(decideContinuity({ state: emptyState({ cwd: 'C:/work' }), toolName: 'compress', pressureRatio: 0.2, config: { continuityEnabled: false, continuityGate: true } }).allow, true, 'runtime continuity decision must honor the group switch');

assert.equal(codeIsReadOnly('await tools.read({"file_path":"a"})'), true);
assert.equal(codeIsReadOnly('const a = await tools.read({"file_path":"a"}); const b = await tools.read({"file_path":"b"});'), true, 'multiple read calls are still read-only');
assert.equal(codeIsReadOnly('await tools.read({}); await tools.write({})'), false);
assert.equal(codeIsReadOnly('await tools.read({}); await tools.edit({})'), false);
assert.equal(codeIsReadOnly('await tools.read({}); await tools.plugin_manager({})'), false);
assert.equal(codeAsksUser('await tools.ask_user({})'), true);
assert.equal(codeAsksUser('await tools.ask_user_question({})'), true);
assert.equal(codeAsksUser('await tools.ask_user({}); await tools.write({})'), false);

// A user question is not an ambiguity gate. Only unresolved reasoning questions gate writes.
let questions = emptyState({ cwd: 'C:/work' });
questions = reduceEvent(questions, { type: 'turn/start', seq: 1, data: { turn: 1 } });
questions = reduceEvent(questions, user(2, '用 A 还是 B？'));
assert.equal(questions.ambiguitySeq, undefined);
assert.equal(questions.lastUserSeq, 2);
assert.equal(questions.requirements[0].authority, 'user-stated');
assert.equal(decideReasoning({ state: questions, toolName: 'write', code: '', config: {} }).allow, true, 'a user question alone must not block writes');
assert.equal(decideReasoning({ state: questions, toolName: 'read', code: '', config: {} }).allow, true);

const readOnlyCode = 'const a = await tools.read({"file_path":"a"}); const b = await tools.read({"file_path":"b"});';
let gate = emptyState({ cwd: 'C:/work' });
gate = reduceEvent(gate, {
  type: 'assistant/message',
  seq: 3,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定 A 是否存在。']) }] } },
});
assert.equal(decideReasoning({ state: gate, toolName: 'run_code', code: readOnlyCode, config: {} }).allow, true, 'multi-statement read-only run_code must pass the reasoning gate');
assert.equal(decideReasoning({ state: gate, toolName: 'run_code', code: 'await tools.read({}); await tools.write({})', config: {} }).allow, false, 'mutating run_code must stay blocked');
assert.equal(decideReasoning({ state: gate, toolName: 'read', code: '', config: {} }).allow, true, 'direct reads are allowed while reasoning is unresolved');

let recording = emptyState({ cwd: 'C:/work' });
recording = reduceEvent(recording, { type: 'turn/start', seq: 4, data: { turn: 2 } });
recording = reduceEvent(recording, user(5, '必须记住：先记录再压缩'));
assert.equal(decideRecord({ state: recording, toolName: 'run_code', code: readOnlyCode, config: {} }).allow, true, 'read-only run_code must not be blocked by the record gate');
assert.equal(decideRecord({ state: recording, toolName: 'read', code: '', config: {} }).allow, true);
assert.equal(decideRecord({ state: recording, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false, 'mutating run_code must still require a memory record');

// Recall-first and record-first gates: Guard's own functions must be used before fallback search or mutation.
assert.equal(isRecallIntent('当前已经完成我和龙娘讨论中的所有问题修复了吗？'), true);
assert.equal(isRecallIntent('把文件改成 A'), false);
assert.equal(isRecordIntent('必须记住：先记录再压缩'), true);
assert.equal(isRecordIntent('只读检查一下'), false);
let pr = emptyState({ cwd: 'C:/work' });
pr = reduceEvent(pr, { type: 'turn/start', seq: 1, data: { turn: 1 } });
pr = reduceEvent(pr, user(10, '必须记住：先记录再压缩'));
assert.equal(decideRecall({ state: pr, toolName: 'session_search', config: {} }).allow, false);
assert.equal(decideRecord({ state: pr, toolName: 'write', code: '', config: {} }).allow, false);
assert.match(decideRecord({ state: pr, toolName: 'write', code: '', config: {} }).reason, /agents_memory/);
assert.equal(decideRecord({ state: pr, toolName: 'read', code: '', config: {} }).allow, true);
assert.equal(decideRecord({ state: pr, toolName: 'agents_memory', code: '', config: {} }).allow, true);
assert.equal(decideRecord({ state: pr, toolName: 'run_code', code: 'await tools.agents_memory({"action":"add","kind":"requirement","text":"x"})', config: {} }).allow, true, 'one JSON memory call must be allowed while recording is due');
assert.equal(decideRecord({ state: pr, toolName: 'run_code', code: 'await tools.agents_memory({action:"add",kind:"requirement",text:"x"})', config: {} }).allow, true, 'a single JavaScript object-literal memory call is safe');
assert.match(buildCard(pr, {}), /优先协议/);
assert.match(buildCard(pr, {}), /提炼/);
assert.equal(memoryRecordProblem('提炼后的结论'), '');
assert.match(memoryRecordProblem('x'.repeat(601)), /distill/);
assert.equal(memoryRecordProblem('x'.repeat(601), 700), '');
assert.match(memoryRecordProblem('x'.repeat(701), 700), /700/);
assert.match(memoryRecordProblem('a\nb\nc\nd\ne'), /distill/);
assert.equal(normalizeConfig({ memoryTextMax: 50 }).memoryTextMax, 600);
assert.equal(normalizeConfig({ memoryTextMax: 700 }).memoryTextMax, 700);
pr = reduceEvent(pr, { type: 'tool/call', seq: 11, data: { callId: 'idx-1', name: 'agents_index', arguments: '{}' } });
assert.equal(decideRecall({ state: pr, toolName: 'session_search', config: {} }).allow, true);

// A read-only multi-statement run_code with one embedded agents_index must also satisfy recall-first.
let embeddedRecall = emptyState({ cwd: 'C:/work' });
embeddedRecall = reduceEvent(embeddedRecall, { type: 'turn/start', seq: 20, data: { turn: 2 } });
embeddedRecall = reduceEvent(embeddedRecall, user(21, '回忆一下之前的评审结论'));
assert.equal(decideRecall({ state: embeddedRecall, toolName: 'session_search', config: {} }).allow, false);
const embeddedIndexCode = 'const result = await tools.agents_index({"action":"get","format":"card"}); return result;';
embeddedRecall = reduceEvent(embeddedRecall, { type: 'tool/call', seq: 22, data: { callId: 'idx-embedded', name: 'run_code', arguments: JSON.stringify({ code: embeddedIndexCode }) } });
assert.equal(decideRecall({ state: embeddedRecall, toolName: 'session_search', config: {} }).allow, true, 'one embedded read-only agents_index must satisfy recall-first');
const mutatingRecallCode = 'await tools.agents_index({"action":"get"}); await tools.write({"file_path":"x","content":"y"});';
let mutatingRecall = emptyState({ cwd: 'C:/work' });
mutatingRecall = reduceEvent(mutatingRecall, { type: 'turn/start', seq: 30, data: { turn: 3 } });
mutatingRecall = reduceEvent(mutatingRecall, user(31, '回忆一下之前的评审结论'));
mutatingRecall = reduceEvent(mutatingRecall, { type: 'tool/call', seq: 32, data: { callId: 'idx-mutating', name: 'run_code', arguments: JSON.stringify({ code: mutatingRecallCode }) } });
assert.equal(decideRecall({ state: mutatingRecall, toolName: 'session_search', config: {} }).allow, false, 'a mutating agents_index program must not satisfy recall-first');
pr = reduceEvent(pr, { type: 'tool/call', seq: 12, data: { callId: 'mem-1', name: 'agents_memory', arguments: JSON.stringify({ kind: 'requirement', text: 'x' }) } });
assert.equal(decideRecord({ state: pr, toolName: 'write', code: '', config: {} }).allow, false, 'a pending memory call is not a successful record');
pr = reduceEvent(pr, { type: 'tool/result', seq: 13, data: { message: { toolCallId: 'mem-1', content: [{ type: 'text', text: 'ok' }], isError: false } } });
assert.equal(decideRecord({ state: pr, toolName: 'write', code: '', config: {} }).allow, true, 'a successful memory result clears the record gate');
let failedMem = emptyState({ cwd: 'C:/work' });
failedMem = reduceEvent(failedMem, { type: 'turn/start', seq: 20, data: { turn: 2 } });
failedMem = reduceEvent(failedMem, user(21, '必须记录：先记录再压缩'));
failedMem = reduceEvent(failedMem, { type: 'tool/call', seq: 22, data: { callId: 'mem-fail', name: 'agents_memory', arguments: JSON.stringify({ kind: 'requirement', text: 'x' }) } });
failedMem = reduceEvent(failedMem, { type: 'tool/result', seq: 23, data: { error: { reason: 'validation failed' }, message: { toolCallId: 'mem-fail', content: [{ type: 'text', text: 'rejected' }], isError: true } } });
assert.equal(decideRecord({ state: failedMem, toolName: 'write', code: '', config: {} }).allow, false, 'a failed memory result must not clear the record gate');

let mem = emptyState({ cwd: 'C:/work' });
mem = reduceEvent(mem, {
  type: 'tool/call',
  seq: 10,
  data: {
    callId: 'mem-1',
    name: 'agents_memory',
    arguments: JSON.stringify({ action: 'add', kind: 'decision', text: '采用插件方案', evidence: 'm00829' }),
  },
});
assert.equal(mem.pendingCalls['mem-1'].memory.kind, 'decision');
assert.equal(mem.pendingCalls['mem-1'].memory.authority, undefined, 'tool args must not carry model authority');
mem = reduceEvent(mem, {
  type: 'tool/result',
  seq: 11,
  data: { message: { toolCallId: 'mem-1', content: [], isError: false } },
});
assert.equal(mem.llmEntries.length, 1);
assert.equal(mem.llmEntries[0].source, 'model');
assert.equal(mem.llmEntries[0].authority, 'model-inferred');
assert.match(buildCard(mem, {}), /LLM 记录/);
assert.match(buildCard(mem, {}), /decision\|model-inferred/);
assert.match(renderIndexMarkdown(mem, 's', {}), /采用插件方案/);

assert.equal(authorityFor('decision'), 'model-inferred');
assert.equal(authorityFor('verified'), 'model-inferred');
assert.equal(authorityFor('assumption'), 'assumption');
assert.equal(isMutatingToolName('apply_patch'), true);
assert.equal(isMutatingToolName('terminal'), true);
assert.equal(isMutatingToolName('mcp__github__push_files'), true);
assert.equal(isMutatingToolName('read'), false);
assert.equal(isMutatingToolName('agents_memory'), false);
const dupe = { kind: 'decision', text: 'x', evidence: 'e' };
assert.equal(mergeLlmEntries([dupe], [dupe]).length, 1);
assert.equal(isReasoningQuestion('我不确定这个字段是否存在'), true);
assert.equal(isReasoningQuestion('是否应该用 A？'), true);
assert.equal(isReasoningQuestion('函数返回 3。'), false);
assert.equal(redactSecrets('github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'), '[REDACTED_GITHUB_PAT]');
assert.equal(redactSecrets('Bearer abcdefghijklmnopqrstuvwxyz123456'), 'Bearer [REDACTED]');
assert.equal(codeIsReadOnly('await tools.read({})'), true);
assert.equal(codeIsReadOnly('await tools.write({})'), false);
assert.equal(codeIsReadOnly(''), false);
assert.equal(codeVerifies('await tools.read({})'), true);
assert.equal(codeVerifies('await tools.agents_memory({})'), false);
assert.equal(codeVerifies('await tools.plugin_manager({})'), false);
assert.equal(isReasoningQuestion('needs similar independent repo scaffolding'), false);
assert.match(reasoningTextOf({ message: { content: [{ type: 'reasoning', text: '思考内容' }] } }), /思考内容/);

// Per-question reasoning gate: each question gets an ID and only agents_verify resolves it.
let reas = emptyState({ cwd: 'C:/work' });
reas = reduceEvent(reas, {
  type: 'assistant/message',
  seq: 30,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定 A 是否存在。']) }] } },
});
assert.equal(openReasoningQuestions(reas).length, 1);
const qA = openReasoningQuestions(reas)[0];
assert.match(qA.id, /^q-30-/);
assert.equal(qA.status, 'open');
assert.equal(decideReasoning({ state: reas, toolName: 'write', code: '', config: {} }).allow, false);
assert.equal(decideReasoning({ state: reas, toolName: 'read', code: '', config: {} }).allow, true);
assert.equal(decideReasoning({ state: reas, toolName: 'agents_index', code: '', config: {} }).allow, true);
assert.equal(decideReasoning({ state: reas, toolName: 'agents_verify', code: '', config: {} }).allow, true);
assert.equal(decideReasoning({ state: reas, toolName: 'run_code', code: 'await tools.read({})', config: {} }).allow, true, 'a safe single read call is allowed');
assert.equal(decideReasoning({ state: reas, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false, 'a mutating single call stays blocked');
assert.match(buildCard(reas, {}), new RegExp(qA.id));

reas = reduceEvent(reas, {
  type: 'tool/call',
  seq: 31,
  data: { callId: 'mem-verified', name: 'agents_memory', arguments: JSON.stringify({ action: 'add', kind: 'verified', text: 'A exists', evidence: 'read result' }) },
});
reas = reduceEvent(reas, {
  type: 'tool/result',
  seq: 32,
  data: { message: { toolCallId: 'mem-verified', content: [], isError: false } },
});
assert.equal(openReasoningQuestions(reas).length, 1, 'agents_memory verified must not clear the reasoning gate');
assert.equal(decideReasoning({ state: reas, toolName: 'write', code: '', config: {} }).allow, false);

reas = reduceEvent(reas, {
  type: 'tool/call',
  seq: 33,
  data: { callId: 'verify-a', name: 'agents_verify', arguments: JSON.stringify({ questionId: qA.id, op: 'grep', path: 'C:/work', pattern: 'A' }) },
});
assert.equal(reas.pendingCalls['verify-a'].verifyQuestionId, qA.id);
reas = reduceEvent(reas, {
  type: 'tool/result',
  seq: 34,
  data: { message: { toolCallId: 'verify-a', content: [{ type: 'text', text: 'found A' }], isError: false } },
});
assert.equal(openReasoningQuestions(reas).length, 0);
assert.equal(decideReasoning({ state: reas, toolName: 'write', code: '', config: {} }).allow, true);
assert.equal(reas.reasoningQuestions[0].evidence, 'found A');
assert.match(buildCard(reas, {}), /LLM 记录/);

// Multiple questions: one successful verification must not clear the other.
let multi = emptyState({ cwd: 'C:/work' });
multi = reduceEvent(multi, {
  type: 'assistant/message',
  seq: 40,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定 A 是否存在。', '是否应该用 B？']) }] } },
});
assert.equal(openReasoningQuestions(multi).length, 2);
const [q1, q2] = openReasoningQuestions(multi);
assert.notEqual(q1.id, q2.id);
multi = reduceEvent(multi, {
  type: 'tool/call',
  seq: 41,
  data: { callId: 'verify-m1', name: 'agents_verify', arguments: JSON.stringify({ questionId: q1.id, op: 'read_file', path: 'a.txt' }) },
});
multi = reduceEvent(multi, {
  type: 'tool/result',
  seq: 42,
  data: { message: { toolCallId: 'verify-m1', content: [{ type: 'text', text: 'A exists' }], isError: false } },
});
assert.equal(openReasoningQuestions(multi).length, 1);
assert.equal(openReasoningQuestions(multi)[0].id, q2.id);
assert.equal(decideReasoning({ state: multi, toolName: 'write', code: '', config: {} }).allow, false);
assert.match(buildCard(multi, {}), new RegExp(q2.id));
multi = reduceEvent(multi, {
  type: 'tool/call',
  seq: 43,
  data: { callId: 'verify-m2', name: 'agents_verify', arguments: JSON.stringify({ questionId: q2.id, op: 'list_dir', path: 'C:/work' }) },
});
multi = reduceEvent(multi, {
  type: 'tool/result',
  seq: 44,
  data: { message: { toolCallId: 'verify-m2', content: [{ type: 'text', text: 'B exists' }], isError: false } },
});
assert.equal(openReasoningQuestions(multi).length, 0);
assert.equal(decideReasoning({ state: multi, toolName: 'write', code: '', config: {} }).allow, true);

// Failed verification keeps the question open.
let failed = emptyState({ cwd: 'C:/work' });
failed = reduceEvent(failed, {
  type: 'assistant/message',
  seq: 50,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定 C 是否存在。']) }] } },
});
const qC = openReasoningQuestions(failed)[0];
failed = reduceEvent(failed, {
  type: 'tool/call',
  seq: 51,
  data: { callId: 'verify-fail', name: 'agents_verify', arguments: JSON.stringify({ questionId: qC.id, op: 'read_file', path: 'missing.txt' }) },
});
failed = reduceEvent(failed, {
  type: 'tool/result',
  seq: 52,
  data: { message: { toolCallId: 'verify-fail', content: [{ type: 'text', text: 'not found' }], isError: true } },
});
assert.equal(openReasoningQuestions(failed).length, 1);
assert.equal(decideReasoning({ state: failed, toolName: 'write', code: '', config: {} }).allow, false);

// ask_user marks only the latest open question WAITING; the user reply resolves only that one.
let waiting = emptyState({ cwd: 'C:/work' });
waiting = reduceEvent(waiting, {
  type: 'assistant/message',
  seq: 60,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定 D 是否存在。', '是否应该用 E？']) }] } },
});
const waitingIds = openReasoningQuestions(waiting).map((item) => item.id);
assert.equal(waitingIds.length, 2);
const [qD, qE] = openReasoningQuestions(waiting);
waiting = reduceEvent(waiting, { type: 'tool/call', seq: 61, data: { callId: 'ask-3', name: 'ask_user', arguments: '{}' } });
assert.equal(openReasoningQuestions(waiting).find((item) => item.id === qE.id).status, 'waiting');
waiting = reduceEvent(waiting, user(62, '【回答】先用 D'));
assert.equal(openReasoningQuestions(waiting).length, 1, 'a user reply resolves only the question that was asked');
assert.equal(openReasoningQuestions(waiting)[0].id, qD.id);
assert.equal(decideReasoning({ state: waiting, toolName: 'write', code: '', config: {} }).allow, false);
waiting = reduceEvent(waiting, {
  type: 'tool/call',
  seq: 63,
  data: { callId: 'verify-d', name: 'agents_verify', arguments: JSON.stringify({ questionId: qD.id, op: 'grep', path: 'C:/work', pattern: 'D' }) },
});
waiting = reduceEvent(waiting, {
  type: 'tool/result',
  seq: 64,
  data: { message: { toolCallId: 'verify-d', content: [{ type: 'text', text: 'D exists' }], isError: false } },
});
assert.equal(openReasoningQuestions(waiting).length, 0);
assert.equal(decideReasoning({ state: waiting, toolName: 'write', code: '', config: {} }).allow, true);

// Version-1 sessions must stop resurrecting raw reasoning questions.
let legacy = emptyState({ cwd: 'C:/work' });
legacy.version = 1;
legacy.reasoningSeq = 70;
legacy.reasoningText = '我不确定 legacy 是否存在。';
legacy.reasoningClarifiedSeq = 0;
legacy.reasoningAskedSeq = 0;
assert.equal(openReasoningQuestions(legacy).length, 0);
legacy = reduceEvent(legacy, user(71, '继续'));
assert.equal(legacy.version, 4);
assert.equal(legacy.reasoningSeq, 0);
assert.equal(legacy.reasoningText, '');
assert.equal(openReasoningQuestions(legacy).length, 0);
assert.equal(decideReasoning({ state: legacy, toolName: 'write', code: '', config: {} }).allow, true);

assert.equal(extractReasoningQuestions('我不确定 A。是否用 B？').length, 2);

// Strict run_code gateways: only one exact agents_verify or ask_user call is allowed.
const verifyCode = 'await tools.agents_verify({"questionId":"q-1","op":"read_file","path":"a.txt"})';
const askCode = 'await tools.ask_user({"questions":[{"prompt":"继续吗？"}]})';
assert.equal(isAgentsVerifyRunCode(verifyCode), true);
assert.equal(isAgentsVerifyRunCode(verifyCode + '; await tools.write({})'), false);
assert.equal(isAgentsVerifyRunCode('await tools.agents_verify({"questionId":"q-1","op":"write","path":"a.txt"})'), false);
assert.equal(isAskUserRunCode(askCode), true);
assert.equal(isAskUserRunCode(askCode + '; await tools.write({})'), false);

let gateway = emptyState({ cwd: 'C:/work' });
gateway = reduceEvent(gateway, {
  type: 'assistant/message',
  seq: 80,
  data: { message: { content: [{ type: 'reasoning', text: summaryReasoning(['我不确定这个字段是否存在。']) }] } },
});
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: verifyCode, config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: askCode, config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: 'await tools.read({})', config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false);
assert.equal(isSafeGateRunCode('await tools.read({"file_path":"a.txt"})'), true);
assert.equal(isSafeGateRunCode('return await tools.agents_task({"action":"start","goal":"x"})'), true, 'PTC return-prefixed calls must be recognized');
assert.equal(isSafeGateRunCode('await tools.read({"file_path":"a.txt"}); await tools.write({})'), false);
assert.equal(isSafeGateRunCode('await tools.write({"file_path":"a.txt","content":"x"})'), false);
gateway = reduceEvent(gateway, {
  type: 'tool/call',
  seq: 81,
  data: { callId: 'ask-gate', name: 'run_code', arguments: JSON.stringify({ code: askCode }) },
});
assert.equal(openReasoningQuestions(gateway)[0].status, 'waiting');
gateway = reduceEvent(gateway, user(82, '【回答】继续'));
assert.equal(openReasoningQuestions(gateway).length, 0);
assert.equal(decideReasoning({ state: gateway, toolName: 'write', code: '', config: {} }).allow, true);


let outer = emptyState({ cwd: "C:/work" });
outer = reduceEvent(outer, {
  type: "assistant/message",
  seq: 90,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 E 是否存在。"]) }] } },
});
const outerQ = openReasoningQuestions(outer)[0];
const outerCode = "await tools.agents_verify(" + JSON.stringify({ questionId: outerQ.id, op: "read_file", path: "a.txt" }) + ")";
assert.equal(agentsVerifyQuestionId(outerCode), outerQ.id);
outer = reduceEvent(outer, {
  type: "tool/call",
  seq: 91,
  data: { callId: "outer-verify", name: "run_code", arguments: JSON.stringify({ code: outerCode }) },
});
assert.equal(outer.pendingCalls["outer-verify"].verifyQuestionId, outerQ.id, "outer run_code must carry the question id");
outer = reduceEvent(outer, {
  type: "tool/result",
  seq: 92,
  data: { message: { toolCallId: "outer-verify", content: [{ type: "text", text: "E exists" }], isError: false } },
});
assert.equal(openReasoningQuestions(outer).length, 0, "outer result must resolve the question");

assert.equal(isSafeGateRunCode("await tools.agents_index({\"format\":\"card\"})"), true);
assert.equal(isSafeGateRunCode("await tools.agents_memory({\"action\":\"add\",\"kind\":\"open\",\"text\":\"x\"})"), true);

let persisted = emptyState({ cwd: "C:/work" });
persisted = reduceEvent(persisted, {
  type: "assistant/message",
  seq: 100,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 F 是否存在。"]) }] } },
});
const roundTrip = JSON.parse(JSON.stringify(persisted));
assert.equal(openReasoningQuestions(roundTrip).length, 1, "question state must survive JSON persistence");
assert.equal(decideReasoning({ state: roundTrip, toolName: "write", code: "", config: {} }).allow, false);
const roundTripQuestion = openReasoningQuestions(roundTrip)[0];
const resolvedRoundTrip = resolveReasoningQuestion(roundTrip, roundTripQuestion.id, 101, "checked after restart");
assert.equal(openReasoningQuestions(resolvedRoundTrip).length, 0);
const resolvedWithRisk = Object.assign({}, roundTrip, { risk: { id: "risk-ambiguity", seq: 99, kind: "ambiguity", reason: "old ambiguity", required: true, review: "error" } });
const clearedRisk = resolveReasoningQuestion(resolvedWithRisk, roundTripQuestion.id, 101, "checked");
assert.equal(clearedRisk.risk, null, "resolving the last ambiguity question must clear its stale risk");

const memoryCode = 'await tools.agents_memory(' + JSON.stringify({ action: 'add', kind: 'verified', text: 'persisted memory', evidence: 'unit' }) + ')';
let memoryState = emptyState({ cwd: 'C:/work' });
memoryState = reduceEvent(memoryState, {
  type: 'tool/call',
  seq: 120,
  data: { callId: 'mem-1', name: 'run_code', arguments: JSON.stringify({ code: memoryCode }) },
});
assert.equal(memoryState.pendingCalls['mem-1'].memory.kind, 'verified', 'outer run_code must capture inner agents_memory arguments');
memoryState = reduceEvent(memoryState, {
  type: 'tool/result',
  seq: 121,
  data: { message: { toolCallId: 'mem-1', content: [{ type: 'text', text: 'ok' }], isError: false } },
});
assert.equal(memoryState.llmEntries.length, 1, 'successful inner memory must enter the projection');
assert.equal(memoryState.llmEntries[0].text, 'persisted memory');
const memoryAfterRestart = JSON.parse(JSON.stringify(memoryState));
assert.equal(memoryAfterRestart.llmEntries.length, 1, 'memory must survive JSON persistence across a reload');

// Developer mode must bypass every gate while keeping read-only behavior testable.
assert.equal(normalizeConfig({ developerMode: "true" }).developerMode, true);
assert.equal(normalizeConfig({ developerMode: "false" }).developerMode, false);
assert.equal(decideReasoning({ state: gate, toolName: "write", code: "", config: { developerMode: true } }).allow, true, "developer mode bypasses the reasoning gate");
assert.equal(decideRecord({ state: recording, toolName: "write", code: "", config: { developerMode: true } }).allow, true, "developer mode bypasses the record gate");
let recallState = emptyState({ cwd: "C:/work" });
recallState = reduceEvent(recallState, user(130, "回忆一下之前的决定"));
assert.equal(decideRecall({ state: recallState, toolName: "session_search", config: { developerMode: true } }).allow, true, "developer mode bypasses the recall gate");
assert.equal(decideCompress({ state, mark: undefined, currentTurn: 1, denyCompress: true, developerMode: true }).allow, true, "developer mode bypasses compression denial");
assert.match(buildCard(gate, { developerMode: true }), /开发者模式/);

// The reasoning detector must not turn planning prose into an open question.
assert.equal(isReasoningQuestion("用户的意思是A，还是B？"), true);
assert.equal(isReasoningQuestion("Now client. Need edit dictionaries."), false);
assert.equal(isReasoningQuestion("Need update lines 46, 160, 161."), false);
let staleQuestions = emptyState({ cwd: "C:/work" });
staleQuestions.reasoningQuestions = [{ id: "q-old", seq: 1, lastSeenSeq: 1, text: "Now client. Need edit dictionaries.", status: "open", askedSeq: 0, resolvedSeq: 0, evidence: "" }];
assert.equal(openReasoningQuestions(staleQuestions).length, 0, "legacy planning prose must not block writes");

// Batch verification: one read can resolve a whole question list.
let batchState = emptyState({ cwd: "C:/work" });
batchState = reduceEvent(batchState, {
  type: "assistant/message",
  seq: 140,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 A 是否存在。", "是否应该用 B？"]) }] } },
});
const batchIds = openReasoningQuestions(batchState).map((item) => item.id);
assert.equal(batchIds.length, 2);
const batchCode = "await tools.agents_verify(" + JSON.stringify({ op: "list_dir", path: "C:/work", questionIds: batchIds }) + ")";
assert.deepEqual(agentsVerifyQuestionIds(batchCode), batchIds);
assert.equal(agentsVerifyQuestionId(batchCode), batchIds[0]);
batchState = reduceEvent(batchState, {
  type: "tool/call",
  seq: 141,
  data: { callId: "batch-verify", name: "run_code", arguments: JSON.stringify({ code: batchCode }) },
});
assert.deepEqual(batchState.pendingCalls["batch-verify"].verifyQuestionIds, batchIds, "outer run_code must carry every question id");
batchState = reduceEvent(batchState, {
  type: "tool/result",
  seq: 142,
  data: { message: { toolCallId: "batch-verify", content: [{ type: "text", text: "batch verified" }], isError: false } },
});
assert.equal(openReasoningQuestions(batchState).length, 0, "one batch verification must clear every listed question");
assert.equal(isReasoningQuestion("A 是否存在？"), true);
assert.equal(isReasoningQuestion("```ts\nawait tools.agents_verify({\"questionId\":\"q-1\"});\n```"), false, "code snippets must not create a reasoning gate");

// Reasoning risk state: deterministic loop detection, self-report, and JSON export.
let riskState = emptyReasoningState({ id: 'risk-session', cwd: 'C:/work' });
riskState = reduceReasoningEvent(riskState, user(300, '只读，先分析，不要写。'));
const loopText = '检查 A 和 B 的配置差异，目前只有间接证据。';
for (const seq of [301, 302, 303]) {
  riskState = reduceReasoningEvent(riskState, {
    type: 'assistant/message',
    seq,
    data: { message: { content: [{ type: 'reasoning', text: loopText }] } },
  });
}
assert.ok(riskState.risk, 'repeated reasoning without new evidence must open a risk');
assert.equal(riskState.risk.kind, 'loop');
assert.equal(decideRisk({ reasoningState: riskState, toolName: 'write', code: '', config: {} }).allow, false);
assert.equal(decideRisk({ reasoningState: riskState, toolName: 'read', code: '', config: {} }).allow, true);
const staleAmbiguity = Object.assign({}, emptyReasoningState({ id: 'stale' }), { version: 3, risk: { id: 'risk-stale', seq: 1, kind: 'ambiguity', reason: 'old', required: true, review: 'error' } });
assert.equal(decideRisk({ reasoningState: staleAmbiguity, memoryState: emptyState({ cwd: 'C:/work' }), toolName: 'write', code: '', config: {} }).allow, true, 'an ambiguity risk with no open question must not block writes');
assert.match(decideRisk({ reasoningState: riskState, toolName: 'write', code: '', config: {} }).reason, /GUARD_STATE/);
const report = 'GUARD_STATE {"ambiguity":"none","progress":"new_evidence","loop":"none","drift":"aligned","next":"checked both branches"}';
riskState = reduceReasoningEvent(riskState, {
  type: 'assistant/message',
  seq: 304,
  data: { message: { content: [{ type: 'reasoning', text: report }] } },
});
assert.equal(riskState.risk, null, 'a truthful self-report with new evidence must clear the risk');
assert.equal(decideRisk({ reasoningState: riskState, toolName: 'write', code: '', config: {} }).allow, true);
assert.equal(parseGuardState(report).progress, 'new_evidence');
assert.equal(parseGuardState('```\n' + report + '\n```'), null, 'fenced examples must not be parsed as a report');
const review = parseRiskReview('```json\n{"ambiguity":"none","loop":"none","drift":"aligned","progress":"new_evidence","reason":"ok"}\n```');
assert.equal(review.progress, 'new_evidence');
assert.match(buildRiskReviewPrompt({ reasoningState: riskState, memoryState: { lastUserText: '只读' }, config: {} }), /Return ONLY/);
assert.equal(JSON.stringify(renderReasoningState(riskState, 'risk-session')).includes(loopText), false, 'the persisted state must not contain raw reasoning');
assert.equal(reasoningSimilarity(loopText, loopText), 1);

// A successful write recorded in state must make an identical retry visible.
let opState = emptyReasoningState({ id: 'op-session', cwd: 'C:/work' });
opState = reduceReasoningEvent(opState, user(400, '修改 a.txt。'));
const editArgs = { file_path: 'a.txt', old_string: 'a', new_string: 'b' };
opState = reduceReasoningEvent(opState, { type: 'tool/call', seq: 401, data: { callId: 'op-1', name: 'edit', arguments: JSON.stringify(editArgs) } });
opState = reduceReasoningEvent(opState, { type: 'tool/result', seq: 402, data: { message: { toolCallId: 'op-1', content: [{ type: 'text', text: 'ok' }], isError: false } } });
assert.equal(opState.completed.length, 1, 'a successful write must be remembered');
opState = reduceReasoningEvent(opState, { type: 'tool/call', seq: 403, data: { callId: 'op-2', name: 'edit', arguments: JSON.stringify(editArgs) } });
assert.ok(opState.risk, 'an identical completed write must raise a repeat risk');
assert.equal(opState.risk.kind, 'repeat');
assert.match(opState.risk.reason, /already completed at seq 402/);

const completedCard = emptyState({ cwd: 'C:/work' });
completedCard.completedOperations = [{ seq: 500, name: 'edit', signature: 'edit|abc123' }];
assert.match(buildCard(completedCard, {}), /已完成操作/);
const reviewGate = emptyReasoningState({ id: 'review-session', cwd: 'C:/work' });
reviewGate.risk = { id: 'risk-review-1', seq: 1, kind: 'loop', reason: 'repeat', required: true, review: 'pending' };
assert.equal(decideRisk({ reasoningState: reviewGate, toolName: 'write', code: '', config: {}, review: { riskId: 'risk-review-1', status: 'clear' } }).allow, true);
assert.equal(decideRisk({ reasoningState: reviewGate, toolName: 'write', code: '', config: {}, review: { riskId: 'risk-review-1', status: 'blocking', reason: 'still blocked' } }).allow, false);

// A question after the first 600 characters must still be seen.
let longReasoning = emptyState({ cwd: "C:/work" });
const longText = summaryReasoning(["我不确定 LONG-FIELD 是否存在。"], "背景材料。".repeat(180) + "\n");
longReasoning = reduceEvent(longReasoning, {
  type: "assistant/message",
  seq: 800,
  data: { message: { content: [{ type: "reasoning", text: longText }] } },
});
const longQuestions = openReasoningQuestions(longReasoning);
assert.equal(longQuestions.length, 1, "the whole reasoning must be scanned, not just the first 600 characters");
assert.match(longQuestions[0].text, /LONG-FIELD/);
assert.equal(longReasoning.reasoningText, "", "raw reasoning must not be stored");
assert.equal(longReasoning.reasoningSummary.uncertainties[0], "我不确定 LONG-FIELD 是否存在。", "only the summary, never raw reasoning, is retained");

// GUARD_SUMMARY is the only source of distilled uncertainties; raw reasoning stays out of the index.
let summarized = emptyState({ cwd: "C:/work" });
const summaryLine = 'GUARD_SUMMARY ' + JSON.stringify({ goal: "finish guard", decisions: ["keep read-only fallback"], uncertainties: ["数据库版本待确认", "A 还是 B？"], next: "ask user", constraints: ["no push"] });
summarized = reduceEvent(summarized, {
  type: "assistant/message",
  seq: 820,
  data: { message: { content: [{ type: "reasoning", text: "**分析**\n".repeat(60) + "\n" + summaryLine }] } },
});
const summaryQuestions = openReasoningQuestions(summarized);
assert.equal(summaryQuestions.length, 2);
assert.equal(summaryQuestions[0].source, "summary");
assert.equal(summaryQuestions[0].text, "数据库版本待确认");
assert.equal(summarized.reasoningText, "");
assert.equal(summarized.reasoningSummary.goal, "finish guard");
assert.match(buildCard(summarized, {}), /数据库版本待确认/);

// A resolved question must not reopen when the model repeats the same sentence.
let resolvedQuestion = emptyState({ cwd: "C:/work" });
resolvedQuestion = reduceEvent(resolvedQuestion, {
  type: "assistant/message",
  seq: 810,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 REOPEN-FIELD 是否存在。"]) }] } },
});
const firstQuestion = openReasoningQuestions(resolvedQuestion)[0];
assert.ok(firstQuestion);
resolvedQuestion = reduceEvent(resolvedQuestion, {
  type: "tool/call",
  seq: 811,
  data: { callId: "resolve-1", name: "agents_verify", arguments: JSON.stringify({ questionId: firstQuestion.id, op: "list_dir", path: "C:/work" }) },
});
resolvedQuestion = reduceEvent(resolvedQuestion, {
  type: "tool/result",
  seq: 812,
  data: { message: { toolCallId: "resolve-1", content: [{ type: "text", text: "ok" }], isError: false } },
});
assert.equal(openReasoningQuestions(resolvedQuestion).length, 0);
assert.ok(resolvedQuestion.resolvedReasoningTexts.includes("我不确定 REOPEN-FIELD 是否存在。"));
resolvedQuestion = reduceEvent(resolvedQuestion, {
  type: "assistant/message",
  seq: 813,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 REOPEN-FIELD 是否存在。"]) }] } },
});
assert.equal(openReasoningQuestions(resolvedQuestion).length, 0, "a resolved question must not reopen on an identical repeat");
assert.equal(decideReasoning({ state: resolvedQuestion, toolName: "write", code: "", config: {} }).allow, true);

// A pending verification without an outer callId must resolve as well.
let noCallId = emptyState({ cwd: "C:/work" });
noCallId = reduceEvent(noCallId, {
  type: "assistant/message",
  seq: 820,
  data: { message: { content: [{ type: "reasoning", text: summaryReasoning(["我不确定 NOCALLID-FIELD 是否存在。"]) }] } },
});
const noCallIdQuestion = openReasoningQuestions(noCallId)[0];
noCallId = reduceEvent(noCallId, {
  type: "tool/call",
  seq: 821,
  data: { name: "agents_verify", arguments: JSON.stringify({ questionId: noCallIdQuestion.id, op: "list_dir", path: "C:/work" }) },
});
noCallId = reduceEvent(noCallId, {
  type: "tool/result",
  seq: 822,
  data: { message: { toolCallId: "no-callid-result", content: [{ type: "text", text: "ok" }], isError: false } },
});
assert.equal(openReasoningQuestions(noCallId).length, 0, "a successful verification without a callId must clear the question");

const selfTest = runGuardSelfTest();
assert.equal(selfTest.ok, true, "developer self-test failed: " + JSON.stringify(selfTest.cases.filter(item => !item.ok)));
assert.ok(selfTest.total >= 10, "developer self-test must cover the main gates");
assert.equal(selfTest.passed, selfTest.total);

const simulatedWrite = simulateGuardScenario({ scenario: "reasoning", toolName: "write" });
assert.equal(simulatedWrite.decision.allow, false, "simulated write must be blocked by an open reasoning question");
const simulatedRead = simulateGuardScenario({ scenario: "reasoning", toolName: "read" });
assert.equal(simulatedRead.decision.allow, true, "simulated read must remain allowed");
const simulatedBypass = simulateGuardScenario({ scenario: "reasoning", toolName: "write", enforceGates: false });
assert.equal(simulatedBypass.decision.allow, true, "simulated developer bypass must allow the write");

const legacyState = { version: 3, requirements: [{ seq: 1, text: "legacy requirement" }], llmEntries: [{ id: "m1", kind: "decision", text: "legacy memory" }], lastUserSeq: 1 };
const migratedState = reduceEvent(legacyState, { type: "turn/start", seq: 2, data: { turn: 1 } });
assert.equal(migratedState.version, 4, "legacy state must migrate to v4");
assert.equal(migratedState.requirements.length, 1, "migration must preserve requirements");
assert.equal(migratedState.llmEntries.length, 1, "migration must preserve model memory");
assert.deepEqual(migratedState.evidence, [], "migration must add an empty evidence list");
assert.deepEqual(migratedState.changes, [], "migration must add an empty change list");
assert.equal(migratedState.task, null, "migration must not invent a task");


// Task gate: proposal is not authorization; user confirmation activates it.
let taskState = emptyState({ cwd: 'C:/work' });
taskState = reduceEvent(taskState, user(900, '请实现任务门控'));
assert.equal(decideTask({ state: taskState, toolName: 'write', toolArgs: { file_path: 'C:/work/a.txt' }, config: { taskGate: true } }).allow, false, 'write without an active task must be blocked');
assert.equal(decideTask({ state: taskState, toolName: 'read', config: { taskGate: true } }).allow, true, 'read-only must remain allowed');
taskState = reduceEvent(taskState, {
  type: 'tool/call',
  seq: 901,
  data: { name: 'agents_task', arguments: JSON.stringify({ action: 'start', goal: 'task', scope: ['C:/work'], exclusions: ['C:/work/private'] }) },
});
taskState = reduceEvent(taskState, { type: 'tool/result', seq: 902, data: { message: { toolCallId: 'call-901', isError: false, content: [] } } });
assert.equal(taskState.task.status, 'proposed', 'start must only propose');
assert.equal(decideTask({ state: taskState, toolName: 'write', toolArgs: { file_path: 'C:/work/a.txt' }, config: { taskGate: true } }).allow, false, 'proposal must not authorize');
taskState = reduceEvent(taskState, user(903, '确认，按这个范围做'));
assert.equal(taskState.task.status, 'active', 'user confirmation must activate the proposed task');
assert.equal(decideTask({ state: taskState, toolName: 'write', toolArgs: { file_path: 'C:/work/a.txt' }, config: { taskGate: true } }).allow, true, 'write inside scope must be allowed');
assert.equal(decideTask({ state: taskState, toolName: 'write', toolArgs: { file_path: 'C:/other/a.txt' }, config: { taskGate: true } }).allow, false, 'write outside scope must be blocked');
assert.equal(decideTask({ state: taskState, toolName: 'edit', toolArgs: { file_path: 'C:/work/private/a.txt' }, config: { taskGate: true } }).allow, false, 'excluded path must be blocked');
assert.equal(decideTask({ state: taskState, toolName: 'write', config: { taskGate: true, developerMode: true } }).allow, true, 'developer mode must bypass taskGate');
assert.equal(isTaskConfirmation('继续'), true);
assert.equal(isTaskDenial('取消，不做了'), true);

// Structured evidence: host assigns IDs; model cannot claim verified.
assert.equal(evidenceRecordProblem({ claim: 'A', source: 'file', mechanism: 'read', result: 'yes' }), '');
assert.match(evidenceRecordProblem({ claim: 'A', source: 'file', mechanism: 'read', result: 'yes', status: 'verified' }), /verified/);
let evidenceState = emptyState({ cwd: 'C:/work' });
evidenceState = reduceEvent(evidenceState, { type: 'tool/call', seq: 910, data: { callId: 'ev-1', name: 'agents_evidence', arguments: JSON.stringify({ action: 'add', claim: 'A exists', source: 'file', mechanism: 'read', result: 'found' }) } });
evidenceState = reduceEvent(evidenceState, { type: 'tool/result', seq: 911, data: { message: { toolCallId: 'ev-1', isError: false, content: [] } } });
assert.equal(evidenceState.evidence.length, 1, 'successful evidence must be projected');
assert.match(evidenceState.evidence[0].id, /^ev-/);
assert.equal(decideEvidence({ state: evidenceState, toolName: 'agents_memory', toolArgs: { kind: 'verified', text: 'x' }, config: { evidenceGate: true } }).allow, false, 'verified memory without evidence must be blocked');
assert.equal(decideEvidence({ state: evidenceState, toolName: 'agents_memory', toolArgs: { kind: 'verified', text: 'x', evidence: evidenceState.evidence[0].id }, config: { evidenceGate: true } }).allow, true, 'existing evidence reference must pass');
assert.equal(decideEvidence({ state: evidenceState, toolName: 'agents_memory', toolArgs: { kind: 'verified', text: 'x', evidence: 'ev-999' }, config: { evidenceGate: true } }).allow, false, 'unknown evidence reference must fail');
assert.match(buildCard(evidenceState, {}), /结构化证据/, 'card must show the evidence ledger');
let cappedEvidence = emptyState({ cwd: 'C:/work' });
for (let i = 1; i <= 3; i += 1) {
  cappedEvidence = reduceEvent(cappedEvidence, { type: 'tool/call', seq: 920 + i * 2, data: { callId: 'cap-' + i, name: 'agents_evidence', arguments: JSON.stringify({ action: 'add', claim: 'claim ' + i, source: 'file', mechanism: 'read', result: 'found' }) } }, { maxEvidence: 2 });
  cappedEvidence = reduceEvent(cappedEvidence, { type: 'tool/result', seq: 921 + i * 2, data: { message: { toolCallId: 'cap-' + i, isError: false, content: [] } } }, { maxEvidence: 2 });
}
assert.equal(cappedEvidence.evidence.length, 2, 'maxEvidence must cap projected evidence');

// --- phase 3-6 gates -------------------------------------------------------
{
  const base = emptyState({ cwd: 'G:/proj' });
  const impact = decideImpact({ state: base, toolName: 'write', toolArgs: { file_path: 'a.txt' }, config: { impactGate: true, developerMode: false } });
  assert.equal(impact.allow, false, 'impactGate must reject a write without a planned change');
  assert.match(impact.reason, /agents_change/);
  const planned = Object.assign({}, base, { changes: [{ id: 'chg-1', target: 'a.txt', invariants: ['keep format'], status: 'planned' }] });
  assert.equal(decideImpact({ state: planned, toolName: 'write', toolArgs: { file_path: 'a.txt' }, config: { impactGate: true } }).allow, true);
  assert.equal(decideImpact({ state: planned, toolName: 'write', toolArgs: { file_path: 'b.txt' }, config: { impactGate: true } }).allow, false);
  const noInvariant = Object.assign({}, base, { changes: [{ id: 'chg-2', target: 'a.txt', invariants: [], status: 'planned' }] });
  assert.equal(decideImpact({ state: noInvariant, toolName: 'write', toolArgs: { file_path: 'a.txt' }, config: { impactGate: true } }).allow, false);
  assert.equal(decideImpact({ state: base, toolName: 'read', toolArgs: { file_path: 'a.txt' }, config: { impactGate: true } }).allow, true);
  assert.equal(decideImpact({ state: base, toolName: 'run_code', code: 'return await tools.read({file_path:"a"})', config: { impactGate: true } }).allow, true);
  const rec = decideRecovery({ state: base, toolName: 'write', config: { recoveryGate: true } });
  assert.equal(rec.allow, false, 'recoveryGate must require a baseline');
  const withBaseline = Object.assign({}, base, { changes: [{ id: 'chg-1', target: 'a.txt', invariants: ['keep'], status: 'planned' }], recovery: [{ id: 'rec-1', changeId: 'chg-1', baseline: 'backup.zip', status: 'baseline' }] });
  assert.equal(decideRecovery({ state: withBaseline, toolName: 'write', config: { recoveryGate: true } }).allow, true);
  const ver = decideVerification({ state: planned, toolName: 'agents_change', toolArgs: { action: 'verify', changeId: 'chg-1' }, config: { verificationGate: true } });
  assert.equal(ver.allow, false, 'verificationGate must require a passing check');
  const checked = Object.assign({}, planned, { checks: [{ id: 'chk-1', changeId: 'chg-1', status: 'pass' }] });
  assert.equal(decideVerification({ state: checked, toolName: 'agents_change', toolArgs: { action: 'verify', changeId: 'chg-1' }, config: { verificationGate: true } }).allow, true);
  assert.equal(decideIndexGate({ state: base, toolName: 'compress', config: { indexGate: true } }).allow, false);
  const audited = Object.assign({}, base, { indexAudit: { status: 'pass' } });
  assert.equal(decideIndexGate({ state: audited, toolName: 'compress', config: { indexGate: true } }).allow, true);
  // Advisory-only gaps must not block compression: a read-only turn never
  // writes a file, and requiring changedFiles/checks made compress impossible.
  const warned = Object.assign({}, base, { indexAudit: { status: 'warn', missing: ['changedFiles/checks'] } });
  assert.equal(decideIndexGate({ state: warned, toolName: 'compress', config: { indexGate: true } }).allow, true);
  const incomplete = Object.assign({}, base, { indexAudit: { status: 'incomplete', missing: ['requirements/userLog'] } });
  const incompleteGate = decideIndexGate({ state: incomplete, toolName: 'compress', config: { indexGate: true } });
  assert.equal(incompleteGate.allow, false);
  assert.match(incompleteGate.reason, /requirements\/userLog/);
  assert.equal(decideIndexGate({ state: base, toolName: 'read', config: { indexGate: true } }).allow, true);
  assert.equal(auditIndex({ requirements: 1 }).status, 'warn');
  assert.deepEqual(auditIndex({ requirements: 1 }).advisory, ['task/llmEntries/changes', 'decisions/openItems', 'changedFiles/checks']);
  assert.equal(auditIndex({ lastUserSeq: 3 }).status, 'incomplete');
  assert.deepEqual(auditIndex({ lastUserSeq: 3 }).critical, ['requirements/userLog']);
  assert.equal(auditIndex({ requirements: 1, llmEntries: 2, changedFiles: 1, decisions: 1 }).status, 'pass');
  assert.match(changeRecordProblem({ target: 'a', invariants: [] }), /invariant/);
  assert.equal(changeRecordProblem({ target: 'a', invariants: ['keep'] }), '');
  assert.match(checkRecordProblem({ assertion: 'a' }), /changeId/);
  assert.match(recoveryRecordProblem({}), /changeId/);
  assert.match(recoveryRecordProblem({ baseline: 'backup.zip' }), /changeId/);
  assert.match(recoveryRecordProblem({ changeId: 'chg-1' }), /baseline/);
  assert.equal(recoveryRecordProblem({ changeId: 'chg-1', baseline: 'backup.zip' }), '');
}

// Ledger projection: addBounded requires text; changes/checks/recovery must persist.
{
  let ledger = emptyState({ cwd: 'G:/proj' });
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 980, data: { callId: 'chg-call', name: 'agents_change', arguments: JSON.stringify({ action: 'plan', target: 'a.txt', invariants: ['keep format'] }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 981, data: { message: { toolCallId: 'chg-call', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(ledger.changes.length, 1, 'planned change must be projected');
  assert.match(ledger.changes[0].id, /^chg-/);
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 982, data: { callId: 'chk-call', name: 'agents_check', arguments: JSON.stringify({ action: 'add', changeId: ledger.changes[0].id, assertion: 'readback' }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 983, data: { message: { toolCallId: 'chk-call', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(ledger.checks.length, 1, 'check must be projected');
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 984, data: { callId: 'rec-call', name: 'agents_recovery', arguments: JSON.stringify({ action: 'baseline', changeId: ledger.changes[0].id, baseline: 'backup.zip' }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 985, data: { message: { toolCallId: 'rec-call', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(ledger.recovery.length, 1, 'recovery baseline must be projected');
  assert.equal(ledger.recovery[0].changeId, ledger.changes[0].id, 'recovery baseline must retain its change binding');
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 986, data: { callId: 'audit-call', name: 'agents_index', arguments: JSON.stringify({ action: 'audit' }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 987, data: { message: { toolCallId: 'audit-call', isError: false, content: [{ type: 'text', text: JSON.stringify({ audit: { status: 'pass' } }) }] } } });
  assert.equal(ledger.indexAudit.status, 'pass', 'index audit must be projected');
}

// Multi-call run_code: every ledger call must be projected, not only the first.
{
  const code = [
    'const a = await tools.agents_change({ action: "plan", target: "multi-a.txt", invariants: ["keep a"] });',
    'const b = await tools.agents_change({ action: "plan", target: "multi-b.txt", invariants: ["keep b"] });',
    'return { a, b };',
  ].join('\n');
  const calls = embeddedToolCalls(code);
  assert.equal(calls.length, 2, 'both ledger calls must be parsed');
  assert.equal(isSafeGateRunCode(code), true, 'multi-call read-only script must pass the safe gate');
  let ledger = emptyState({ cwd: 'G:/proj' });
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 990, data: { callId: 'multi-call', name: 'run_code', arguments: JSON.stringify({ code }) } });
  assert.equal(ledger.pendingCalls['multi-call'].calls.length, 2, 'both calls must be recorded');
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 991, data: { message: { toolCallId: 'multi-call', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(ledger.changes.length, 2, 'both plans must reach the projected ledger');
  assert.deepEqual(ledger.changes.map((item) => item.target).sort(), ['multi-a.txt', 'multi-b.txt']);
  assert.equal(new Set(ledger.changes.map((item) => item.id)).size, 2, 'multi-call ids must be unique');

  const checkCode = [
    'const c = await tools.agents_check({ action: "add", changeId: "chg-existing", assertion: "multi check" });',
    'const r = await tools.agents_recovery({ action: "baseline", changeId: "chg-existing", baseline: "multi.zip" });',
    'return { c, r };',
  ].join('\n');
  let checked = Object.assign({}, ledger, { changes: [{ id: 'chg-existing', target: 'multi-a.txt', invariants: ['keep'], status: 'planned' }] });
  checked = reduceEvent(checked, { type: 'tool/call', seq: 992, data: { callId: 'multi-ledger', name: 'run_code', arguments: JSON.stringify({ code: checkCode }) } });
  checked = reduceEvent(checked, { type: 'tool/result', seq: 993, data: { message: { toolCallId: 'multi-ledger', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(checked.checks.length, 1, 'multi-call check must project');
  assert.equal(checked.recovery.length, 1, 'multi-call recovery baseline must project');
}

// Multi-call handoff: a batched agents_handoff save must reach continuity.
{
  const code = [
    'const h = await tools.agents_handoff({ action: "save", step: "multi", next: "resume" });',
    'const a = await tools.agents_index({ action: "audit" });',
    'return { h, a };',
  ].join('\n');
  const entries = embeddedLedgerCalls(code);
  assert.equal(entries.length, 1, 'only the handoff call is a ledger entry');
  assert.equal(entries[0].handoff.action, 'save', 'handoff entry must be kept');
  let ledger = emptyState({ cwd: 'G:/proj' });
  ledger.lastUserSeq = 42;
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 995, data: { callId: 'multi-handoff', name: 'run_code', arguments: JSON.stringify({ code }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 996, data: { message: { toolCallId: 'multi-handoff', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(continuityStatus(ledger), 'ready', 'multi-call handoff must yield a ready capsule');
  assert.equal(ledger.continuity.next, 'resume');
}


// A batched run_code that mixes agents_index with agents_handoff must still project the save,
// because embeddedToolCalls refuses the whole program once a non-ledger tool is present.
{
  const code = [
    'const a = await tools.agents_index({ action: "status" });',
    'const h = await tools.agents_handoff({ action: "save", step: "mixed", next: "resume" });',
    'return { a, h };',
  ].join('\n');
  const direct = embeddedHandoffCall(code);
  assert.ok(direct && direct.action === 'save' && direct.next === 'resume', 'a handoff call must be recovered from a mixed program');
  let mixed = emptyState({ cwd: 'G:/proj' });
  mixed.lastUserSeq = 7;
  mixed = reduceEvent(mixed, { type: 'tool/call', seq: 30, data: { callId: 'mixed', name: 'run_code', arguments: JSON.stringify({ code }) } });
  mixed = reduceEvent(mixed, { type: 'tool/result', seq: 31, data: { message: { toolCallId: 'mixed', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(continuityStatus(mixed), 'ready', 'a mixed program must still deliver its handoff to the gate');
  assert.equal(mixed.continuity.next, 'resume');
}

// A save without a next step must never replace an existing valid handoff.
{
  let guard = emptyState({ cwd: 'G:/proj' });
  guard = reduceEvent(guard, { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: 'go' }] } });
  guard = reduceEvent(guard, { type: 'tool/call', seq: 2, data: { callId: 'ok-save', name: 'agents_handoff', arguments: JSON.stringify({ action: 'save', step: 'S1', next: 'S2' }) } });
  guard = reduceEvent(guard, { type: 'tool/result', seq: 3, data: { message: { toolCallId: 'ok-save', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(guard.continuity.next, 'S2');
  const savedSeq = guard.continuity.savedSeq;
  const incompleteCode = [
    'const h = await tools.agents_handoff({ action: "save", step: "partial" });',
    'const a = await tools.agents_index({ action: "status" });',
    'return { h, a };',
  ].join('\n');
  guard = reduceEvent(guard, { type: 'tool/call', seq: 4, data: { callId: 'bad-save', name: 'run_code', arguments: JSON.stringify({ code: incompleteCode }) } });
  guard = reduceEvent(guard, { type: 'tool/result', seq: 5, data: { message: { toolCallId: 'bad-save', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.equal(guard.continuity.next, 'S2', 'an incomplete save must not erase the valid handoff');
  assert.equal(guard.continuity.savedSeq, savedSeq, 'an incomplete save must not change the saved sequence');
}

// pickHandoff: valid entries beat incomplete ones, and the newest covered user message wins.
{
  const older = { next: 'a', lastUserSeq: 5, savedSeq: 10 };
  const newer = { next: 'b', lastUserSeq: 6, savedSeq: 11 };
  const incomplete = { step: 'x', lastUserSeq: 9, savedSeq: 12 };
  assert.equal(pickHandoff([older, newer]).next, 'b');
  assert.equal(pickHandoff([older, newer, incomplete]).next, 'b', 'a valid entry must beat a newer incomplete entry');
  assert.equal(pickHandoff([incomplete]).next, undefined, 'an incomplete entry is returned only when nothing valid exists');
  assert.equal(pickHandoff([null, undefined]), null);
  assert.equal(handoffHasNext({ next: '   ' }), false);
  assert.equal(handoffHasNext({ next: 'S2' }), true);
}

const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
assert.equal(GUARD_BUILD, packageVersion, 'GUARD_BUILD must match package.json so a live status can prove which build is running');

// Card marks advance by user seq even when the turn value lags.
{
  assert.deepEqual(advanceInjectedMark({ turn: 9, seq: 740 }, 0, 1405), { turn: 0, seq: 1405 }, 'newer seq must advance');
  assert.equal(advanceInjectedMark({ turn: 5, seq: 10 }, 6, 9), null, 'lower seq must not regress');
  assert.equal(cardMarkCovers({ turn: 9, seq: 1405 }, 1405), true);
  assert.equal(cardMarkCovers({ turn: 9, seq: 740 }, 1405), false);
}

// Damaged projection arrays must be repaired instead of throwing.
{
  const damaged = Object.assign({}, emptyState({ cwd: 'G:/proj' }), {
    changes: null,
    checks: 'not-an-array',
    recovery: { bad: true },
  });
  const input = { type: 'tool/call', seq: 994, data: { callId: 'repair-call', name: 'agents_change', arguments: JSON.stringify({ action: 'plan', target: 'repair.txt', invariants: ['keep'] }) } };
  const repaired = reduceEvent(damaged, input);
  assert.ok(Array.isArray(repaired.changes), 'changes must be repaired to an array');
  assert.ok(Array.isArray(repaired.checks), 'checks must be repaired to an array');
  assert.ok(Array.isArray(repaired.recovery), 'recovery must be repaired to an array');
}

// Recovery baseline must match the current change, not just be the newest baseline.
{
  const base = emptyState({ cwd: 'G:/proj' });
  const planned = Object.assign({}, base, { changes: [{ id: 'chg-1', target: 'a.txt', invariants: ['keep'], status: 'planned' }] });
  const wrong = Object.assign({}, planned, { recovery: [{ id: 'rec-1', changeId: 'chg-other', baseline: 'old.zip', status: 'baseline' }] });
  assert.equal(decideRecovery({ state: wrong, toolName: 'write', toolArgs: { file_path: 'a.txt' }, config: { recoveryGate: true } }).allow, false, 'a baseline from another change must not authorize this one');
  const right = Object.assign({}, planned, { recovery: [{ id: 'rec-2', changeId: 'chg-1', baseline: 'new.zip', status: 'baseline' }] });
  assert.equal(decideRecovery({ state: right, toolName: 'write', toolArgs: { file_path: 'a.txt' }, config: { recoveryGate: true } }).allow, true);
}

// Path and lifecycle hardening: relative/absolute paths, .., parent coverage, and verified changes.
{
  const base = emptyState({ cwd: 'C:/work' });
  const active = Object.assign({}, base, { task: { id: 'task-1', goal: 'g', scope: ['C:/work'], exclusions: ['C:/work/private'], status: 'active', sourceSeq: 1, confirmedSeq: 1 } });
  assert.equal(decideTask({ state: active, toolName: 'write', toolArgs: { file_path: 'sub/a.txt' }, config: { taskGate: true } }).allow, true, 'relative write is resolved against cwd and allowed');
  assert.equal(decideTask({ state: active, toolName: 'write', toolArgs: { file_path: 'C:/work/private/a.txt' }, config: { taskGate: true } }).allow, false, 'relative exclusion is resolved too');
  assert.equal(decideTask({ state: active, toolName: 'write', toolArgs: { file_path: 'C:/outside/a.txt' }, config: { taskGate: true } }).allow, false, 'outside scope must be rejected');
  assert.equal(decideTask({ state: active, toolName: 'write', toolArgs: { file_path: 'C:/work/sub/../a.txt' }, config: { taskGate: true } }).allow, true, 'dot-dot is normalized');
  const planned = Object.assign({}, base, { changes: [{ seq: 1, id: 'chg-dir', target: 'C:/work/lib', invariants: ['keep'], status: 'planned' }], recovery: [{ changeId: 'chg-dir', baseline: 'zip' }] });
  assert.equal(decideImpact({ state: planned, toolName: 'write', toolArgs: { file_path: 'lib/a.txt' }, config: { impactGate: true } }).allow, true, 'a parent-directory change covers a child write');
  assert.equal(decideRecovery({ state: planned, toolName: 'write', toolArgs: { file_path: 'lib/a.txt' }, config: { recoveryGate: true } }).allow, true);
  assert.equal(decideImpact({ state: planned, toolName: 'write', toolArgs: { file_path: 'other/a.txt' }, config: { impactGate: true } }).allow, false, 'an unrelated target must not use the parent change');
  const verifiedLatest = Object.assign({}, base, { changes: [
    { seq: 1, id: 'chg-old', target: 'C:/work/lib/a.txt', invariants: ['old'], status: 'planned' },
    { seq: 2, id: 'chg-new', target: 'C:/work/lib', invariants: ['new'], status: 'verified' },
  ], recovery: [{ changeId: 'chg-old', baseline: 'zip' }] });
  assert.equal(decideImpact({ state: verifiedLatest, toolName: 'write', toolArgs: { file_path: 'C:/work/lib/a.txt' }, config: { impactGate: true } }).allow, false, 'a verified latest change must not fall back to an older planned change');
  assert.equal(decideRecovery({ state: verifiedLatest, toolName: 'write', toolArgs: { file_path: 'C:/work/lib/a.txt' }, config: { recoveryGate: true } }).allow, false, 'a verified latest change must not reuse an old baseline');
}

// Continuity handoff: host capsule, stale binding, and the 80% fallback.
{
  const base = emptyState({ cwd: 'G:/work' });
  assert.match(handoffRecordProblem({ next: '' }), /next step/);
  assert.match(handoffRecordProblem({ next: 'next', preserve: Array.from({ length: 12 }, () => 'x'.repeat(300)) }, 1600), /too long/);
  const seed = Object.assign({}, base, { lastUserSeq: 10 });
  const entry = handoffEntryFrom({ step: 'S1 complete', next: 'S2 verify', preserve: ['task scope'], discard: ['raw logs'], risks: ['no rollback'] }, 10, seed);
  assert.equal(entry.authority, 'model-distilled');
  const state = Object.assign({}, base, {
    lastUserSeq: 10,
    task: { id: 'task-1', goal: 'ship', scope: ['G:/work'], exclusions: [], steps: ['S1', 'S2'], status: 'active', sourceSeq: 1, confirmedSeq: 1 },
    changes: [{ seq: 1, id: 'chg-1', target: 'G:/work/lib', invariants: ['keep tests'], status: 'planned' }],
    recovery: [{ changeId: 'chg-1', baseline: 'zip' }],
    requirements: [{ seq: 1, text: 'ship it' }],
    continuity: entry,
  });
  assert.equal(continuityStatus(state), 'ready');
  const capsule = buildContinuity(state, { continuityMaxChars: 1600 });
  assert.match(capsule.text, /下一步: S2 verify/);
  assert.match(capsule.text, /必须保留: task scope/);
  assert.match(capsule.text, /可丢弃/);
  assert.equal(capsule.missing.length, 0);
  const card = buildCard(state, { continuityMaxChars: 1600 });
  assert.match(card, /分步计划/);
  assert.match(card, /接续卡/);
  assert.equal(decideContinuity({ state: base, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow, false);
assert.equal(decideContinuity({ state: base, toolName: 'write', pressureRatio: 0.5, config: { continuityGate: true } }).allow, true, 'continuity must only gate compression; without a compression plugin writes stay unaffected');
assert.equal(decideIndexGate({ state: base, toolName: 'write', config: { indexGate: true } }).allow, true, 'indexGate must not affect non-compression tools');
  assert.equal(decideContinuity({ state, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow, true);
  const stale = Object.assign({}, state, { lastUserSeq: 11, continuity: Object.assign({}, entry, { status: 'stale' }) });
  assert.equal(continuityStatus(stale), 'stale');
  assert.equal(decideContinuity({ state: stale, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: true } }).allow, false);
  assert.equal(decideContinuity({ state: stale, toolName: 'compress', pressureRatio: 0.74, config: { continuityGate: true } }).allow, false, 'below 75% the stale handoff still blocks');
  assert.equal(decideContinuity({ state: stale, toolName: 'compress', pressureRatio: 0.75, config: { continuityGate: true } }).allow, true, '75% is the emergency fallback');
  assert.equal(decideContinuity({ state: base, toolName: 'compress', pressureRatio: 0.5, config: { continuityGate: false } }).allow, true);
  let ledger = emptyState({ cwd: 'G:/work' });
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 1, data: { callId: 'h1', name: 'agents_handoff', arguments: JSON.stringify({ action: 'save', step: 'S1', next: 'S2' }) } });
  ledger = reduceEvent(ledger, { type: 'tool/result', seq: 2, data: { message: { toolCallId: 'h1', isError: false, content: [{ type: 'text', text: '{"ok":true}' }] } } });
  assert.ok(ledger.continuity && ledger.continuity.next === 'S2', 'handoff save must project');
  ledger = reduceEvent(ledger, { type: 'user/message', seq: 3, data: { content: [{ type: 'text', text: 'new requirement' }] } });
  assert.equal(continuityStatus(ledger), 'stale', 'a new user message must stale the handoff');
  ledger = reduceEvent(ledger, { type: 'tool/call', seq: 4, data: { callId: 'c1', name: 'compress', arguments: '{}' } });
  assert.equal(ledger.continuity.compressedSeq, 4, 'compression sequence must be recorded');
}
const handoffCall = safeRunCodeCall('return await tools.agents_handoff({action:"save",step:"S1",next:"S2"});');
assert.equal(handoffCall && handoffCall.name, "agents_handoff", "a single agents_handoff call must be recognized inside run_code");

console.log("core tests passed");
