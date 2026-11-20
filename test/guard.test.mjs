import assert from 'node:assert/strict';
import { apply } from '../lib/index.mjs';
import { emptyState } from '../lib/core.mjs';

function makeState() {
  const state = emptyState({ cwd: 'C:/work' });
  state.lastUserSeq = 2;
  state.lastTurn = 1;
  state.requirements = [{ seq: 2, turn: 1, text: 'keep this', correction: false, authority: 'user-stated' }];
  return state;
}

function harness({ pressureTokens, contextWindow, state, agent }) {
  let guard;
  const registered = {};
  const handlers = {};
  const session = { id: 's1', header: { cwd: 'C:/work' } };
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name !== 'tokenMeter') return undefined;
      return {
        contextPressure() {
          return { pressureTokens, contextWindow };
        },
      };
    },
    sessionProjections: {
      async register() {
        return { stateOf() { return state; } };
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
  return { ctx, getGuard() { return guard; }, getTools() { return registered; }, getHandlers() { return handlers; }, getSession() { return session; } };
}

const execution = { name: 'compress', agent: { id: 's1' }, arguments: {} };
const strict = { denyCompress: true, compressPressureRatio: 0.8, legacyCompressWithoutCard: false };

let h = harness({ pressureTokens: 80000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'exactly 80% must force compress');

h = harness({ pressureTokens: 81000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'above 80% must force compress');

h = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, strict);
const denied = h.getGuard()(execution);
assert.ok(denied && denied.reason, 'below 80% must keep the normal card denial');

const ambiguous = makeState();
ambiguous.ambiguitySeq = 5;
ambiguous.ambiguityText = '用 A 还是 B？';
ambiguous.clarifiedSeq = 0;
ambiguous.lastUserSeq = 5;
h = harness({ pressureTokens: 90000, contextWindow: 100000, state: ambiguous });
await apply(h.ctx, strict);
assert.equal(h.getGuard()(execution), undefined, 'high pressure must bypass the ambiguity gate for compress');

h = harness({ pressureTokens: 10000, contextWindow: 100000, state: ambiguous });
await apply(h.ctx, strict);
const ambiguityDenied = h.getGuard()(execution);
assert.ok(ambiguityDenied && /ambiguous/.test(ambiguityDenied.reason), 'low pressure must still enforce the ambiguity gate');

h = harness({ pressureTokens: 90000, contextWindow: 0, state: makeState() });
await apply(h.ctx, strict);
const noWindow = h.getGuard()(execution);
assert.ok(noWindow && noWindow.reason, 'a missing context window must not force compress');

h = harness({ pressureTokens: 10000, contextWindow: 100000, state: makeState() });
await apply(h.ctx, { ...strict, legacyCompressWithoutCard: true });
assert.equal(h.getGuard()(execution), undefined, 'legacy no-card fallback must allow a session without a card');

const toolState = makeState();
toolState.cwd = process.cwd();
toolState.reasoningQuestions = [{ id: 'q-test-0', seq: 2, lastSeenSeq: 2, text: '是否存在？', status: 'open', askedSeq: 0, resolvedSeq: 0, evidence: '' }];
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
await assert.rejects(
  registered.agents_verify.execute({ questionId: 'missing-question', op: 'read_file', path: process.cwd() + '/package.json' }, { agent: { id: 's1' } }),
  /not an open reasoning question/,
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

console.log('guard tests passed');