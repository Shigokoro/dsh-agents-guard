import assert from 'node:assert/strict';
import {
  buildCard,
  codeAsksUser,
  codeIsReadOnly,
  codeVerifies,
  decideAmbiguity,
  decideCompress,
  decideReasoning,
  shouldForceCompress,
  emptyState,
  hashCard,
  authorityFor,
  isAmbiguous,
  isReasoningQuestion,
  isAgentsVerifyRunCode,
  isAskUserRunCode,
  isSafeGateRunCode,
  agentsVerifyQuestionId,
  extractReasoningQuestions,
  openReasoningQuestions,
  resolveReasoningQuestion,
  isMutatingToolName,
  mergeLlmEntries,
  normalizeConfig,
  redactSecrets,
  reasoningTextOf,
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
const denyTurn = decideCompress({ state, mark: { turn: 0, seq: 2 }, currentTurn: 1, denyCompress: true });
assert.equal(denyTurn.allow, false);
assert.match(denyTurn.reason, /turn/);
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
const exactPressure = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 80000, contextWindow: 100000 });
assert.equal(exactPressure.allow, true);
const belowPressure = decideCompress({ state: undefined, mark: undefined, currentTurn: 1, denyCompress: true, pressureTokens: 79999, contextWindow: 100000 });
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
const cfg = normalizeConfig({ maxCardChars: 0, denyCompress: 'false' });
assert.equal(cfg.maxCardChars, 4200);
assert.equal(cfg.denyCompress, false);
assert.equal(normalizeConfig({ compressPressureRatio: 0.75 }).compressPressureRatio, 0.75);
assert.equal(normalizeConfig({ compressPressureRatio: 1.5 }).compressPressureRatio, 0.8);

assert.equal(isAmbiguous('用 A 还是 B？'), true);
assert.equal(isAmbiguous('随便你决定'), true);
assert.equal(isAmbiguous('能不能加测试？'), true);
assert.equal(isAmbiguous('把文件改成 A'), false);
assert.equal(isAmbiguous('记录一下这个决定'), false);
assert.equal(codeAsksUser('await tools.ask_user({})'), true);
assert.equal(codeAsksUser('await tools.ask_user({}); await tools.write({})'), false);

let amb = emptyState({ cwd: 'C:/work' });
amb = reduceEvent(amb, { type: 'turn/start', seq: 1, data: { turn: 1 } });
amb = reduceEvent(amb, user(2, '用 A 还是 B？'));
assert.ok(amb.ambiguitySeq > amb.clarifiedSeq);
assert.equal(decideAmbiguity({ state: amb, toolName: 'write', code: '', config: {} }).allow, false);
assert.equal(decideAmbiguity({ state: amb, toolName: 'ask_user', code: '', config: {} }).allow, true);
assert.equal(decideAmbiguity({ state: amb, toolName: 'run_code', code: 'await tools.ask_user({})', config: {} }).allow, true);
assert.equal(decideAmbiguity({ state: amb, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false);
assert.equal(decideAmbiguity({ state: amb, toolName: 'apply_patch', code: '', config: {} }).allow, false);
assert.equal(decideAmbiguity({ state: amb, toolName: 'terminal', code: '', config: {} }).allow, false);
assert.equal(decideAmbiguity({ state: amb, toolName: 'read', code: '', config: {} }).allow, true);
assert.equal(amb.requirements[0].authority, 'user-stated');
amb = reduceEvent(amb, {
  type: 'tool/call',
  seq: 3,
  data: { callId: 'ask-1', name: 'run_code', arguments: JSON.stringify({ code: 'await tools.ask_user({})' }) },
});
assert.ok(amb.ambiguityAskedSeq >= amb.ambiguitySeq);
assert.equal(amb.clarifiedSeq, 0, 'ask_user must not clear ambiguity before an answer');
assert.equal(decideAmbiguity({ state: amb, toolName: 'write', code: '', config: {} }).allow, false, 'writing must remain blocked in WAITING');
assert.match(buildCard(amb, {}), /WAITING/);
amb = reduceEvent(amb, user(4, '【回答】A'));
assert.ok(amb.clarifiedSeq > amb.ambiguitySeq);
assert.equal(decideAmbiguity({ state: amb, toolName: 'write', code: '', config: {} }).allow, true);

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
assert.equal(isAmbiguous('【回答 · X】 1. 是否继续？ → A'), false);
assert.match(reasoningTextOf({ message: { content: [{ type: 'reasoning', text: '思考内容' }] } }), /思考内容/);

// Per-question reasoning gate: each question gets an ID and only agents_verify resolves it.
let reas = emptyState({ cwd: 'C:/work' });
reas = reduceEvent(reas, {
  type: 'assistant/message',
  seq: 30,
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 A 是否存在。' }] } },
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
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 A 是否存在。\n是否应该用 B？' }] } },
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
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 C 是否存在。' }] } },
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
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 D 是否存在。是否应该用 E？' }] } },
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

// Legacy sessions without reasoningQuestions still work with one synthetic ID.
let legacy = emptyState({ cwd: 'C:/work' });
legacy.reasoningSeq = 70;
legacy.reasoningText = '我不确定 legacy 是否存在。';
legacy.reasoningClarifiedSeq = 0;
legacy.reasoningAskedSeq = 0;
const legacyQuestion = openReasoningQuestions(legacy)[0];
assert.equal(legacyQuestion.id, 'legacy-70');
assert.equal(decideReasoning({ state: legacy, toolName: 'write', code: '', config: {} }).allow, false);
legacy = resolveReasoningQuestion(legacy, legacyQuestion.id, 71, 'legacy checked');
assert.equal(openReasoningQuestions(legacy).length, 0);
assert.equal(decideReasoning({ state: legacy, toolName: 'write', code: '', config: {} }).allow, true);

assert.equal(extractReasoningQuestions('我不确定 A。是否用 B？').length, 2);
assert.equal(decideAmbiguity({ state: amb, toolName: 'agents_verify', code: '', config: {} }).allow, true);

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
  data: { message: { content: [{ type: 'reasoning', text: '我不确定这个字段是否存在。' }] } },
});
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: verifyCode, config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: askCode, config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: 'await tools.read({})', config: {} }).allow, true);
assert.equal(decideReasoning({ state: gateway, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false);
assert.equal(isSafeGateRunCode('await tools.read({"file_path":"a.txt"})'), true);
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
  data: { message: { content: [{ type: "reasoning", text: "我不确定 E 是否存在。" }] } },
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
  data: { message: { content: [{ type: "reasoning", text: "我不确定 F 是否存在。" }] } },
});
const roundTrip = JSON.parse(JSON.stringify(persisted));
assert.equal(openReasoningQuestions(roundTrip).length, 1, "question state must survive JSON persistence");
assert.equal(decideReasoning({ state: roundTrip, toolName: "write", code: "", config: {} }).allow, false);
const roundTripQuestion = openReasoningQuestions(roundTrip)[0];
const resolvedRoundTrip = resolveReasoningQuestion(roundTrip, roundTripQuestion.id, 101, "checked after restart");
assert.equal(openReasoningQuestions(resolvedRoundTrip).length, 0);

console.log("core tests passed");
