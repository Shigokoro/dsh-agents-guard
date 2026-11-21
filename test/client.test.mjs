import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function runClient(loader, warnings) {
  const window = { __ModuleLoader__: loader };
  const context = vm.createContext({ window, console: { warn: (...args) => warnings.push(args.join(' ')) } });
  vm.runInContext(source, context, { filename: 'client.js' });
}

// A client bundle can be executed twice by the host. The second duplicate must
// be ignored instead of crashing the renderer; unrelated failures must escape.
const warnings = [];
let calls = 0;
const loader = {
  load() {
    calls += 1;
    if (calls > 1) throw new Error('client-modules: duplicate factory registration for "@local/dsh-agents-guard" (bundle executed twice without invalidate?)');
  },
};
runClient(loader, warnings);
runClient(loader, warnings);
assert.equal(calls, 2);
assert.equal(warnings.length, 1);
assert.match(warnings[0], /duplicate client registration ignored/);

let threw = false;
try {
  runClient({ load() { throw new Error('boom'); } }, []);
} catch (error) {
  threw = true;
  assert.match(String(error && error.message), /boom/);
}
assert.equal(threw, true, 'unrelated loader failures must not be swallowed');

assert.match(source, /const questions = Number\(source\.maxReasoningQuestions\)/, 'readDraft must initialize maxReasoningQuestions');
assert.match(source, /maxReasoningQuestions: Number\.isFinite\(questions\)/, 'readDraft must default maxReasoningQuestions');
assert.match(source, /Number\.isFinite\(questions\) && questions >= 1 && questions <= 64/, 'validDraft must validate maxReasoningQuestions');
assert.match(source, /taskGate: source\.taskGate === true/, 'readDraft must include taskGate');
assert.match(source, /key: 'taskGate'/, 'the settings page must expose taskGate');
assert.match(source, /continuityGate: source\.continuityGate !== false/, 'readDraft must include continuityGate');
assert.match(source, /key: 'continuityGate'/, 'the settings page must expose continuityGate');
assert.match(source, /continuityMaxChars: Number\.isFinite\(continuityMax\)/, 'readDraft must include continuityMaxChars');
assert.match(source, /continuityMax >= 300 && continuityMax <= 4000/, 'validDraft must validate continuityMaxChars');
assert.match(source, /writeContinuity: source\.writeContinuity !== false/, 'readDraft must include writeContinuity');

console.log('client tests passed');