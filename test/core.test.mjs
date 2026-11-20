import assert from 'node:assert/strict';
import {
  buildCard,
  codeAsksUser,
  codeIsReadOnly,
  codeVerifies,
  decideAmbiguity,
  decideCompress,
  decideReasoning,
  emptyState,
  hashCard,
  isAmbiguous,
  isReasoningQuestion,
  normalizeConfig,
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
const disabled = decideCompress({ state, mark: undefined, currentTurn: 1, denyCompress: false });
assert.equal(disabled.allow, true);

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
amb = reduceEvent(amb, {
  type: 'tool/call',
  seq: 3,
  data: { callId: 'ask-1', name: 'run_code', arguments: JSON.stringify({ code: 'await tools.ask_user({})' }) },
});
assert.ok(amb.clarifiedSeq > amb.ambiguitySeq);
assert.equal(decideAmbiguity({ state: amb, toolName: 'write', code: '', config: {} }).allow, true);

let mem = emptyState({ cwd: 'C:/work' });
mem = reduceEvent(mem, {
  type: 'tool/call',
  seq: 10,
  data: {
    callId: 'mem-1',
    name: 'agents_memory',
    arguments: JSON.stringify({ action: 'add', kind: 'decision', text: '采用插件方案', source: 'user', evidence: 'm00829' }),
  },
});
assert.equal(mem.pendingCalls['mem-1'].memory.kind, 'decision');
mem = reduceEvent(mem, {
  type: 'tool/result',
  seq: 11,
  data: { message: { toolCallId: 'mem-1', content: [], isError: false } },
});
assert.equal(mem.llmEntries.length, 1);
assert.match(buildCard(mem, {}), /LLM 记录/);
assert.match(renderIndexMarkdown(mem, 's', {}), /采用插件方案/);

assert.equal(isReasoningQuestion('我不确定这个字段是否存在'), true);
assert.equal(isReasoningQuestion('是否应该用 A？'), true);
assert.equal(isReasoningQuestion('函数返回 3。'), false);
assert.equal(codeIsReadOnly('await tools.read({})'), true);
assert.equal(codeIsReadOnly('await tools.write({})'), false);
assert.equal(codeIsReadOnly(''), false);
assert.equal(codeVerifies('await tools.read({})'), true);
assert.equal(codeVerifies('await tools.agents_memory({})'), false);
assert.equal(codeVerifies('await tools.plugin_manager({})'), false);
assert.equal(isReasoningQuestion('needs similar independent repo scaffolding'), false);
assert.equal(isAmbiguous('【回答 · X】 1. 是否继续？ → A'), false);
assert.match(reasoningTextOf({ message: { content: [{ type: 'reasoning', text: '思考内容' }] } }), /思考内容/);

let reas = emptyState({ cwd: 'C:/work' });
reas = reduceEvent(reas, {
  type: 'assistant/message',
  seq: 30,
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 A 是否存在。' }] } },
});
assert.ok(reas.reasoningSeq > reas.reasoningClarifiedSeq);
assert.equal(decideReasoning({ state: reas, toolName: 'write', code: '', config: {} }).allow, false);
assert.equal(decideReasoning({ state: reas, toolName: 'read', code: '', config: {} }).allow, true);
assert.equal(decideReasoning({ state: reas, toolName: 'run_code', code: 'await tools.read({})', config: {} }).allow, true);
assert.equal(decideReasoning({ state: reas, toolName: 'run_code', code: 'await tools.write({})', config: {} }).allow, false);
assert.equal(decideReasoning({ state: reas, toolName: 'agents_memory', code: '', config: {} }).allow, true);
reas = reduceEvent(reas, {
  type: 'tool/call',
  seq: 31,
  data: {
    callId: 'v1',
    name: 'agents_memory',
    arguments: JSON.stringify({ action: 'add', kind: 'verified', text: 'A exists', evidence: 'read result', source: 'user' }),
  },
});
assert.ok(reas.reasoningSeq > reas.reasoningClarifiedSeq);
reas = reduceEvent(reas, {
  type: 'tool/result',
  seq: 32,
  data: { message: { toolCallId: 'v1', content: [], isError: false } },
});
assert.ok(reas.reasoningClarifiedSeq > reas.reasoningSeq);
assert.equal(decideReasoning({ state: reas, toolName: 'write', code: '', config: {} }).allow, true);
assert.match(buildCard(reas, {}), /思考疑问|LLM 记录/);

let reas2 = emptyState({ cwd: 'C:/work' });
reas2 = reduceEvent(reas2, {
  type: 'assistant/message',
  seq: 40,
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 B 是否存在。' }] } },
});
reas2 = reduceEvent(reas2, {
  type: 'tool/call',
  seq: 41,
  data: { callId: 'v2', name: 'agents_memory', arguments: JSON.stringify({ action: 'add', kind: 'verified', text: 'B', source: 'model' }) },
});
reas2 = reduceEvent(reas2, {
  type: 'tool/result',
  seq: 42,
  data: { message: { toolCallId: 'v2', content: [], isError: false } },
});
assert.equal(reas2.reasoningClarifiedSeq, 0, 'verified without evidence must not clear');
assert.equal(decideReasoning({ state: reas2, toolName: 'write', code: '', config: {} }).allow, false);

let reas3 = emptyState({ cwd: 'C:/work' });
reas3 = reduceEvent(reas3, {
  type: 'assistant/message',
  seq: 50,
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 C 是否存在。' }] } },
});
reas3 = reduceEvent(reas3, {
  type: 'tool/call',
  seq: 51,
  data: { callId: 'verify-1', name: 'run_code', arguments: JSON.stringify({ code: 'await tools.read({})' }) },
});
assert.equal(reas3.pendingCalls['verify-1'].verify, true);
reas3 = reduceEvent(reas3, {
  type: 'tool/result',
  seq: 52,
  data: { message: { toolCallId: 'verify-1', content: [], isError: false } },
});
assert.ok(reas3.reasoningClarifiedSeq > reas3.reasoningSeq);
assert.equal(decideReasoning({ state: reas3, toolName: 'write', code: '', config: {} }).allow, true);

let reas4 = emptyState({ cwd: 'C:/work' });
reas4 = reduceEvent(reas4, {
  type: 'assistant/message',
  seq: 60,
  data: { message: { content: [{ type: 'reasoning', text: '我不确定 D 是否存在。' }] } },
});
reas4 = reduceEvent(reas4, {
  type: 'tool/call',
  seq: 61,
  data: { callId: 'verify-2', name: 'run_code', arguments: JSON.stringify({ code: 'await tools.read({})' }) },
});
reas4 = reduceEvent(reas4, {
  type: 'tool/result',
  seq: 62,
  data: { message: { toolCallId: 'verify-2', content: [], isError: true } },
});
assert.equal(reas4.reasoningClarifiedSeq, 0, 'failed verification must not clear');
assert.equal(decideReasoning({ state: reas4, toolName: 'write', code: '', config: {} }).allow, false);
reas2 = reduceEvent(reas2, { type: 'tool/call', seq: 43, data: { callId: 'ask-2', name: 'ask_user', arguments: '{}' } });
assert.ok(reas2.reasoningClarifiedSeq > reas2.reasoningSeq);

console.log('core tests passed');
