import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { apply } from '../lib/index.mjs';
import { emptyReasoningState, emptyState } from '../lib/core.mjs';

function makeState() {
  const state = emptyState({ cwd: 'C:/work' });
  state.lastUserSeq = 2;
  state.lastTurn = 1;
  state.requirements = [{ seq: 2, turn: 1, text: 'keep this', correction: false, authority: 'user-stated' }];
  return state;
}

function makeWorkspaceFiles() {
  const absolute = (scope, input) => path.resolve((scope && scope.workspaceRoot) || process.cwd(), input);
  return {
    async stat(scope, input) {
      const target = absolute(scope, input);
      const stat = await fsp.stat(target);
      if (!stat.isFile()) throw new Error('not a regular file: ' + target);
      return { absolutePath: target, version: 'test', bytes: stat.size };
    },
    async readBytes(scope, input, options = {}) {
      const target = absolute(scope, input);
      const range = options.range || { offset: 0, length: 65536 };
      const offset = Number(range.offset) || 0;
      const length = Number(range.length) || 0;
      const handle = await fsp.open(target, 'r');
      try {
        const buffer = Buffer.alloc(length);
        const result = await handle.read(buffer, 0, length, offset);
        return buffer.subarray(0, result.bytesRead);
      } finally {
        await handle.close();
      }
    },
    async list(scope, input) {
      const target = absolute(scope, input);
      const entries = await fsp.readdir(target, { withFileTypes: true });
      return {
        path: target,
        entries: entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        })),
        truncated: false,
      };
    },
  };
}

function harness({ pressureTokens, contextWindow, state, reasoningState, agent, fileService, sessionId = 's1' }) {
  let guard;
  let readBytes = 0;
  const registered = {};
  const handlers = {};
  const session = { id: sessionId, header: { cwd: 'C:/work' } };
  const riskState = reasoningState || emptyReasoningState({ id: sessionId, cwd: 'C:/work' });
  const baseFiles = fileService === undefined ? makeWorkspaceFiles() : fileService;
  const files = baseFiles ? Object.assign({}, baseFiles, {
    async readBytes(scope, target, options) {
      readBytes += 1;
      return baseFiles.readBytes(scope, target, options);
    },
  }) : null;
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'workspaceFiles') return files;
      if (name !== 'tokenMeter') return undefined;
      return {
        contextPressure() {
          return { pressureTokens, contextWindow };
        },
      };
    },
    sessionProjections: {
      async register(options) {
        const source = options && options.key === 'agentsGuardReasoning' ? riskState : state;
        return { stateOf() { return source; } };
      },
    },
    tools: {
      register(tool) { registered[tool.name] = tool; },
      guard(callback) { guard = callback; },
    },
    sessions: { get() { return session; } },
    agents: {
      get() { return agent; },
      turnBoundaryOf() { return { lastTurn: 1 }; },
    },
    systemPrompt: { section() {} },
    on(name, handler) { handlers[name] = handler; },
  };
  return { ctx, getGuard() { return guard; }, getTools() { return registered; }, getHandlers() { return handlers; }, getSession() { return session; }, getReadBytes() { return readBytes; } };
}

const execution = { name: 'compress', agent: { id: 's1' }, arguments: {} };
const strict = { denyCompress: true, compressPressureRatio: 0.8, continuityGate: false };

let h = harness({ pressureTokens: 80000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'exactly 80% must force compress');

h = harness({ pressureTokens: 81000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'above 80% must force compress');

const injectedState = makeState();
h = harness({ pressureTokens: 10000, contextWindow: 100000, state: injectedState, agent: { inject() {} } });
await apply(h.ctx, strict);
const onSessionEvent = h.getHandlers()['session/event'];
onSessionEvent(h.getSession(), { type: 'turn/start', data: { turn: 0 } });
assert.equal(h.getGuard()(execution), undefined, 'a card covering the latest user message must allow compress even when the turn counter differs');
injectedState.lastUserSeq = 3;
const denied = h.getGuard()(execution);
assert.ok(denied && /covers user seq/.test(denied.reason), 'a card older than the latest user message must still be denied below 80%');

const reasoningOpen = makeState();
reasoningOpen.reasoningQuestions = [{ id: 'q-guard-0', seq: 5, lastSeenSeq: 5, text: 'A 是否存在？', source: 'summary', status: 'open', askedSeq: 0, resolvedSeq: 0, evidence: '' }];
reasoningOpen.reasoningSeq = 5;
reasoningOpen.reasoningText = 'A 是否存在？';
reasoningOpen.reasoningClarifiedSeq = 0;
h = harness({ pressureTokens: 90000, contextWindow: 100000, state: reasoningOpen });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'high pressure must bypass the reasoning gate for compress');

h = harness({ pressureTokens: 10000, contextWindow: 100000, state: reasoningOpen });
await apply(h.ctx, strict);
const reasoningDenied = h.getGuard()(execution);
assert.ok(reasoningDenied && /unresolved question/.test(reasoningDenied.reason), 'low pressure must still enforce the reasoning gate');

h = harness({ pressureTokens: 90000, contextWindow: 0, state: reasoningOpen });
await apply(h.ctx, strict);
const noWindow = h.getGuard()(execution);
assert.ok(noWindow && /unresolved question/.test(noWindow.reason), 'a missing context window must not force compress');

h = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'internal no-card fallback must allow a session without a card');

const toolState = makeState();
toolState.cwd = process.cwd();
toolState.reasoningQuestions = [{ id: 'q-test-0', seq: 2, lastSeenSeq: 2, text: '是否存在？', source: 'summary', status: 'open', askedSeq: 0, resolvedSeq: 0, evidence: '' }];
h = harness({ pressureTokens: 10000, contextWindow: 100000, state: toolState });
await apply(h.ctx, strict);
const registered = h.getTools();
assert.ok(registered.agents_index, 'agents_index must be registered');
assert.ok(registered.agents_verify, 'agents_verify must be registered');
const indexCard = await registered.agents_index.execute({ format: 'card' }, { agent: { id: 's1' } });
assert.equal(indexCard.ok, true);
assert.match(indexCard.text, /用户要求/);
assert.equal(indexCard.counts.openReasoningQuestions, 1);
const indexMarkdown = await registered.agents_index.execute({ format: 'markdown' }, { agent: { id: 's1' } });
assert.match(indexMarkdown.text, /dsh-agents-guard:begin/);
const searchResult = await registered.agents_index.execute({ action: 'search', query: 'keep' }, { agent: { id: 's1' } });
assert.equal(searchResult.ok, true);
assert.equal(searchResult.matches.length, 1);
const verified = await registered.agents_verify.execute({ questionId: 'q-test-0', op: 'read_file', path: process.cwd() + '/package.json' }, { agent: { id: 's1' } });
assert.equal(verified.ok, true);
assert.match(verified.result.text, /version/);
assert.ok(h.getReadBytes() > 0, 'agents_verify must read through workspaceFiles');
await assert.rejects(
  registered.agents_verify.execute({ questionId: 'missing-question', op: 'read_file', path: process.cwd() + '/package.json' }, { agent: { id: 's1' } }),
  /none of the requested IDs are open reasoning questions/,
);

const memoryNoteState = makeState();
h = harness({ pressureTokens: 10000, contextWindow: 100000, state: memoryNoteState });
await apply(h.ctx, { writeIndex: false });
const memoryNoteTool = h.getTools().agents_memory;
assert.ok(memoryNoteTool, 'agents_memory must be registered');
const memoryNote = await memoryNoteTool.execute({ action: 'add', kind: 'requirement', text: 'distilled conclusion' }, { agent: { id: 's1' } });
assert.match(memoryNote.note, /writeIndex is off|not updated/, 'memory-off note must not claim an index write');
assert.match(memoryNote.note, /will not survive a restart/, 'memory-off note must state that the entry is session-only');

const recoveryState = makeState();
recoveryState.changes = [{ id: 'chg-test', target: 'C:/work', invariants: ['keep'], status: 'planned' }];
h = harness({ pressureTokens: 10000, contextWindow: 100000, state: recoveryState });
await apply(h.ctx, strict);
const recoveryTool = h.getTools().agents_recovery;
assert.ok(recoveryTool, 'agents_recovery must be registered');
await assert.rejects(
  recoveryTool.execute({ action: 'baseline', baseline: 'backup.zip' }, { agent: { id: 's1' } }),
  /changeId/,
);
const recovery = await recoveryTool.execute({ action: 'baseline', changeId: 'chg-test', baseline: 'backup.zip' }, { agent: { id: 's1' } });
assert.equal(recovery.recovery.changeId, 'chg-test', 'baseline must bind the requested change');

const noFsState = makeState();
noFsState.cwd = process.cwd();
noFsState.reasoningQuestions = [{ id: 'q-nofs-0', seq: 2, lastSeenSeq: 2, text: '服务缺失时怎么办？', source: 'summary', status: 'open', askedSeq: 0, resolvedSeq: 0, evidence: '' }];
const noFs = harness({ pressureTokens: 10000, contextWindow: 100000, state: noFsState, fileService: null });
await apply(noFs.ctx, strict);
await assert.rejects(
  noFs.getTools().agents_verify.execute({ questionId: 'q-nofs-0', op: 'read_file', path: process.cwd() + '/package.json' }, { agent: { id: 's1' } }),
  /workspaceFiles|file service/,
);

const cardState = makeState();
let injections = 0;
h = harness({
  pressureTokens: 10000,
  contextWindow: 100000,
  state: cardState,
  agent: {
    inject() { injections += 1; },
  },
});
await apply(h.ctx, strict);
const handlers = h.getHandlers();
assert.equal(typeof handlers['session/event'], 'function', 'the guard must subscribe to session events');
handlers['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
assert.equal(injections, 1, 'the first turn start must inject the card');
handlers['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
assert.equal(injections, 1, 'an unchanged card in the same compression epoch must not be re-injected');
cardState.compressions = 1;
handlers['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
assert.equal(injections, 2, 'a new compression epoch must re-inject the card even when its text is unchanged');
handlers['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
assert.equal(injections, 2, 'the re-injected card must not be duplicated in the same epoch');

const guardedRisk = emptyReasoningState({ id: 's1', cwd: 'C:/work' });
guardedRisk.risk = { id: 'risk-test-1', seq: 1, kind: 'loop', reason: 'repeated reasoning', required: true, review: 'pending', reviewReason: '' };
h = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState(), reasoningState: guardedRisk });
await apply(h.ctx, strict);
const riskWrite = h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: {} });
assert.ok(riskWrite && /risk \[risk-test-1\]/.test(riskWrite.reason), 'risk must deny mutating tools');
assert.equal(h.getGuard()({ name: 'read', agent: { id: 's1' }, arguments: {} }), undefined, 'risk must not deny reads');
assert.equal(h.getGuard()({ name: 'agents_verify', agent: { id: 's1' }, arguments: {} }), undefined, 'risk must not deny verification');

// A live volatile config reference must take effect without remounting the plugin.
const liveMode = { value: false, get() { return this.value; } };
const liveReasoning = makeState();
liveReasoning.reasoningQuestions = [{ id: 'q-live-0', seq: 2, lastSeenSeq: 2, text: 'A 是否存在？', source: 'summary', status: 'open', askedSeq: 0, resolvedSeq: 0, evidence: '' }];
const liveHarness = harness({ pressureTokens: 10000, contextWindow: 100000, state: liveReasoning });
await apply(liveHarness.ctx, { developerMode: liveMode, reasoningGate: true });
assert.ok(liveHarness.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: {} }));
liveMode.value = true;
liveHarness.getHandlers()['loader/volatile-update']();
assert.equal(liveHarness.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: {} }), undefined, 'a live config update must bypass the gate immediately');
liveMode.value = false;
liveHarness.getHandlers()['loader/volatile-update']();
assert.ok(liveHarness.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: {} }), 'turning developer mode off must restore the gate immediately');


// Runtime task state must update before the next tool call inside the same program.
{
  const state = makeState();
  state.task = { id: 'task-live-1', goal: 'test', scope: ['C:/work'], exclusions: [], status: 'active', sourceSeq: 2, confirmedSeq: 2 };
  h = harness({ pressureTokens: 10000, contextWindow: 100000, state });
  await apply(h.ctx, { taskGate: true });
  const tools = h.getTools();
  assert.equal(h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/x.txt' } }), undefined, 'active task should allow an in-scope write');
  const closed = await tools.agents_task.execute({ action: 'close' }, { agent: { id: 's1' } });
  assert.equal(closed.task.status, 'closed');
  const denied = h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/x.txt' } });
  assert.ok(denied && /taskGate/.test(denied.reason), 'close must take effect before the next tool call, not after the program ends');
  h.getHandlers()['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
  const stillDenied = h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/x.txt' } });
  assert.ok(stillDenied && /taskGate/.test(stillDenied.reason), 'a stale active projection must not revive a closed live task');
}

// Starting and confirming a new scope in one program must replace the old scope immediately.
{
  const state = makeState();
  state.lastUserText = '确认执行';
  h = harness({ pressureTokens: 10000, contextWindow: 100000, state });
  await apply(h.ctx, { taskGate: true });
  const tools = h.getTools();
  const started = await tools.agents_task.execute({ action: 'start', goal: 'new scope', scope: ['C:/work/new'] }, { agent: { id: 's1' } });
  assert.ok(started.task.id, 'start must return a stable task id');
  const startedStatus = await tools.agents_task.execute({ action: 'status' }, { agent: { id: 's1' } });
  assert.equal(startedStatus.authorization.taskId, started.task.id, 'status must expose the proposed task id');
  const confirmed = await tools.agents_task.execute({ action: 'confirm' }, { agent: { id: 's1' } });
  assert.equal(confirmed.task.status, 'active');
  assert.ok(confirmed.task.id, 'confirm must preserve the task id');
  const activeStatus = await tools.agents_task.execute({ action: 'status' }, { agent: { id: 's1' } });
  assert.equal(activeStatus.authorization.taskId, confirmed.task.id, 'status must expose the active task id');
  assert.ok(activeStatus.authorization.taskId, 'status authorization must never contain an undefined task id');
  assert.equal(h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/new/x.txt' } }), undefined, 'the new scope must be active immediately');
  assert.ok(h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/old/x.txt' } }), 'the old scope must not survive the update');
  state.task = { id: 'task-stale-projection', goal: 'stale projection', scope: ['C:/work/new'], exclusions: [], status: 'proposed', sourceSeq: 2, confirmedSeq: 0, updatedSeq: 0 };
  h.getHandlers()['session/event'](h.getSession(), { type: 'turn/start', data: { turn: 1 } });
  assert.equal(h.getGuard()({ name: 'write', agent: { id: 's1' }, arguments: { file_path: 'C:/work/new/x.txt' } }), undefined, 'a stale proposed projection must not clear the live active task');
}

// Continuity: threshold reminder, handoff tool, and step plan.
{
  const state = makeState();
  const notices = [];
  h = harness({
    pressureTokens: 80000,
    contextWindow: 100000,
    state,
    agent: { inject(payload) { notices.push(payload && payload.content && payload.content[0] && payload.content[0].text || ''); } },
  });
  await apply(h.ctx, { continuityGate: true, writeContinuity: false });
  const eventHandler = h.getHandlers()['session/event'];
  eventHandler(h.getSession(), { type: 'assistant/message', data: { turn: 1 } });
  assert.ok(notices.some((text) => /context pressure/.test(text) && /agents_handoff/.test(text)), '80% pressure must inject the continuity protocol');
  const count = notices.length;
  eventHandler(h.getSession(), { type: 'assistant/message', data: { turn: 1 } });
  assert.equal(notices.length, count, 'the same turn must not be spammed');
  const tools = h.getTools();
  assert.ok(tools.agents_handoff, 'agents_handoff must be registered');
  const saved = await tools.agents_handoff.execute({ action: 'save', step: 'S1 complete', next: 'S2 verify', preserve: ['scope'], discard: ['logs'] }, { agent: { id: 's1' } });
  assert.equal(saved.ok, true);
  assert.equal(saved.continuity.status, 'ready');
  const handoffStatus = await tools.agents_handoff.execute({ action: 'status' }, { agent: { id: 's1' } });
  assert.equal(handoffStatus.status, 'ready');
  const cleared = await tools.agents_handoff.execute({ action: 'clear' }, { agent: { id: 's1' } });
  assert.equal(cleared.ok, true);
  assert.equal((await tools.agents_handoff.execute({ action: 'status' }, { agent: { id: 's1' } })).status, 'missing');
  const plan = await tools.agents_task.execute({ action: 'start', goal: 'ship', scope: ['C:/work'], steps: ['S1', 'S2', 'S3'] }, { agent: { id: 's1' } });
  assert.ok(plan.task.id, 'a step plan must have a stable task id');
  assert.deepEqual(plan.task.steps, ['S1', 'S2', 'S3']);
  const planStatus = await tools.agents_task.execute({ action: 'status' }, { agent: { id: 's1' } });
  assert.ok(planStatus.authorization.taskId, 'the step plan status must have a task id');
  assert.deepEqual(planStatus.task.steps, ['S1', 'S2', 'S3'], 'the step plan must survive in the live status');
}

// A7: the on-disk index must feed the card of a restarted process.
{
  const fsSync = await import('node:fs');
  const os = await import('node:os');
  const home = fsSync.mkdtempSync(path.join(os.tmpdir(), 'guard-memory-'));
  const previousHome = process.env.DSH_HOME;
  try {
    process.env.DSH_HOME = home;
    const writerId = 's-memory-write';
    const writer = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState(), sessionId: writerId });
    await apply(writer.ctx, { writeIndex: true });
    const note = await writer.getTools().agents_memory.execute({ action: 'add', kind: 'requirement', text: 'durable memory sentinel' }, { agent: { id: writerId } });
    assert.equal(note.ok, true, 'a successful index write must report ok');
    assert.equal(note.persisted, true, 'ok must mean the entry reached the disk');
    const written = path.join(home, 'agent-context', writerId, 'AGENT_CONTEXT_INDEX.md');
    assert.ok(fsSync.existsSync(written), 'agents_memory must write the index before reporting success');
    const onDisk = fsSync.readFileSync(written, 'utf8');
    assert.match(onDisk, /durable memory sentinel/);
    assert.match(onDisk, /## LLM 记录/, 'the written index must carry the LLM memory section');

    // Simulate a fresh process: the only copy of the memory is that file.
    const readerId = 's-memory-read';
    const readerDir = path.join(home, 'agent-context', readerId);
    fsSync.mkdirSync(readerDir, { recursive: true });
    fsSync.copyFileSync(written, path.join(readerDir, 'AGENT_CONTEXT_INDEX.md'));
    const cards = [];
    const reader = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState(), sessionId: readerId, agent: { inject(payload) { cards.push(payload && payload.content && payload.content[0] && payload.content[0].text || ''); } } });
    await apply(reader.ctx, { writeIndex: true });
    reader.getHandlers()['session/event'](reader.getSession(), { type: 'turn/start', data: { turn: 1 } });
    assert.ok(cards.some((text) => text.includes('durable memory sentinel')), 'the first turn of a restarted process must reload the on-disk memory');

    // A failed write must not report success, and must not claim durability.
    // A directory where the index file belongs makes readFile/writeFile fail
    // with EISDIR, which is the retryable (non-ENOENT) failure path.
    const failingId = 's-memory-fail';
    fsSync.mkdirSync(path.join(home, 'agent-context', failingId, 'AGENT_CONTEXT_INDEX.md'), { recursive: true });
    const failing = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState(), sessionId: failingId });
    await apply(failing.ctx, { writeIndex: true });
    const failed = await failing.getTools().agents_memory.execute({ action: 'add', kind: 'decision', text: 'cannot be written' }, { agent: { id: failingId } });
    assert.equal(failed.ok, false, 'a failed index write must not report ok');
    assert.equal(failed.persisted, false, 'a failed write must not claim durability');
    assert.ok(failed.error, 'a failed write must surface the error');
    assert.match(failed.note, /not durable|write failed/, 'the note must not claim the entry survives a restart');

    // A failed read must stay retryable: the next turn picks the memory up.
    const retryId = 's-memory-retry';
    const retryFile = path.join(home, 'agent-context', retryId, 'AGENT_CONTEXT_INDEX.md');
    fsSync.mkdirSync(retryFile, { recursive: true });
    const retryCards = [];
    const retry = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState(), sessionId: retryId, agent: { inject(payload) { retryCards.push(payload && payload.content && payload.content[0] && payload.content[0].text || ''); } } });
    await apply(retry.ctx, { writeIndex: true });
    retry.getHandlers()['session/event'](retry.getSession(), { type: 'turn/start', data: { turn: 1 } });
    assert.ok(retryCards.length > 0, 'the card must still be injected when the index read fails');
    assert.ok(!retryCards.some((text) => text.includes('durable memory sentinel')), 'a failed read cannot show memory it never read');
    fsSync.rmSync(retryFile, { recursive: true, force: true });
    fsSync.copyFileSync(written, retryFile);
    retry.getHandlers()['session/event'](retry.getSession(), { type: 'turn/start', data: { turn: 2 } });
    assert.ok(retryCards.some((text) => text.includes('durable memory sentinel')), 'a failed read must be retried and reach the next card');
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    fsSync.rmSync(home, { recursive: true, force: true });
  }
}

// A8: with no live task cache the gate must read the authoritative projection.
{
  const projected = makeState();
  projected.task = { id: 'task-projected', goal: 'projected scope', scope: ['C:/work/projected'], exclusions: [], status: 'proposed', sourceSeq: 2, confirmedSeq: 0, updatedSeq: 0 };
  const h8 = harness({ pressureTokens: 10000, contextWindow: 100000, state: projected, sessionId: 's-task-a8' });
  await apply(h8.ctx, { taskGate: true });
  const gateFor = (file) => h8.getGuard()({ name: 'write', agent: { id: 's-task-a8' }, arguments: { file_path: file } });
  assert.ok(gateFor('C:/work/projected/x.txt'), 'a proposed task is not authorization');
  projected.task.status = 'active';
  assert.equal(gateFor('C:/work/projected/x.txt'), undefined, 'an active projected task must authorize its own scope without a live cache');
  assert.ok(gateFor('C:/work/other/x.txt'), 'the projected scope must still be enforced');
  projected.task.status = 'closed';
  assert.ok(gateFor('C:/work/projected/x.txt'), 'a closed projected task must not authorize writes');
}
console.log('guard tests passed');