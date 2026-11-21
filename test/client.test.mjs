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
assert.match(source, /key: 'workflowEnabled'/, 'settings page must expose the workflow group switch');
assert.match(source, /key: 'continuityEnabled'/, 'settings page must expose the continuity group switch');
assert.match(source, /key: 'reasoningEnabled'/, 'settings page must expose the reasoning group switch');
assert.match(source, /key: 'memoryEnabled'/, 'settings page must expose the memory group switch');
assert.match(source, /workflowEnabled: groupValue\(/, 'readDraft must derive the workflow group state');
assert.match(source, /continuityEnabled: groupValue\(/, 'readDraft must derive the continuity group state');
assert.match(source, /function groupStatus\(/, 'the page must compute the on/off/partial group state');
assert.match(source, /advancedOptions: 'Advanced options'/, 'advanced options must be labelled');
assert.match(source, /require\('react'\)/, 'the client must use the host React binding');
assert.match(source, /h\(GroupCard/, 'the page must render grouped cards');
assert.match(source, /h\(DeveloperCard/, 'developer controls must be separated from feature groups');


// Render the client factory once with a minimal React stand-in. This catches
// broken grouped rendering and verifies the page is not still a flat list.
let clientDefinition;
runClient({ load(definition) { clientDefinition = definition; } }, []);
assert.ok(clientDefinition && typeof clientDefinition.factory === 'function');
const elementChildren = props => {
  const children = props && props.children;
  return Array.isArray(children) ? children : children == null ? [] : [children];
};
const fakeReact = {
  createElement(type, props, ...children) { return { type, props: Object.assign({}, props || {}, { children }) }; },
  useState(value) { return [typeof value === 'function' ? value() : value, () => {}]; },
  useEffect() {},
  useCallback(fn) { return fn; },
  useSyncExternalStore(_subscribe, read) { return read(); },
  useRef(value) { return { current: value }; },
};
const labels = {
  workflowGroup: '任务与变更管理', continuityGroup: '上下文接续', reasoningGroup: '推理过程检查', memoryGroup: '记忆与索引维护',
  groupOn: '开启', groupOff: '关闭', groupPartial: '部分启用', advancedOptions: '高级选项', devTitle: '开发与诊断',
  taskGate: '任务授权闸门', maxEvidence: '证据条数上限', continuityGate: '接续卡门控', reasoningGate: '思考疑问闸门', recallGate: '回忆优先闸门',
};
const t = key => labels[key] || key;
const form = {
  getSnapshot() { return { status: 'ready', writable: true, revision: 1, user: { workflowEnabled: false }, value: { taskGate: true, evidenceGate: true, impactGate: true, verificationGate: true, recoveryGate: true, continuityGate: true, reasoningGate: true, recallGate: true } }; },
  subscribe() { return () => {}; },
  async mutate() { return true; },
};
let section;
const ctx = {
  effect(fn) { fn(); },
  get(name) { return name === 'configForms' ? { get: () => form } : undefined; },
  locale: { register() {}, bind: () => t },
  slots: { inject(_name, fn) { fn(); }, register(definition, component) { if (definition && definition.name === 'settings.section') section = component; return () => {}; } },
};
const mod = clientDefinition.factory(name => { if (name === 'react') return fakeReact; throw new Error('unexpected require: ' + name); });
await mod.apply(ctx);
assert.ok(section, 'settings.section must register a component');
const tree = section({ t });
function walk(node, out) {
  if (node == null) return;
  if (Array.isArray(node)) { for (const item of node) walk(item, out); return; }
  if (typeof node === 'string' || typeof node === 'number') { out.text.push(String(node)); return; }
  if (typeof node.type === 'function') { walk(node.type(Object.assign({}, node.props, { children: undefined })), out); return; }
  out.nodes.push(node);
  for (const child of elementChildren(node.props)) walk(child, out);
}
const rendered = { nodes: [], text: [] };
walk(tree, rendered);
assert.ok(rendered.nodes.filter(node => node.type === 'details').length >= 5, 'each group and developer area must be collapsible');
assert.ok(rendered.text.includes('任务与变更管理'), 'workflow group must render');
assert.ok(rendered.text.includes('上下文接续'), 'continuity group must render');
assert.ok(rendered.text.includes('推理过程检查'), 'reasoning group must render');
assert.ok(rendered.text.includes('记忆与索引维护'), 'memory group must render');
assert.ok(rendered.text.includes('开发与诊断'), 'developer area must render separately');
assert.ok(rendered.text.includes('关闭'), 'an explicitly disabled group must show Off, not a child-derived On');
assert.ok(rendered.text.includes('证据条数上限'), 'advanced numeric fields must remain in the group block');
assert.equal(rendered.nodes.filter(node => node.type === 'details').length, 5, 'four group details plus one developer details');

// An old profile has no group fields in the user layer. Its schema value can
// still contain the new group default (workflowEnabled:false); the page must
// derive the group from the existing child gates, not show a false "Off".
const migrationForm = {
  getSnapshot() { return { status: 'ready', writable: true, revision: 2, user: {}, value: { workflowEnabled: false, taskGate: true, evidenceGate: true, continuityGate: true, reasoningGate: true, recallGate: true } }; },
  subscribe() { return () => {}; },
  async mutate() { return true; },
};
let migrationSection;
const migrationCtx = {
  effect(fn) { fn(); },
  get(name) { return name === 'configForms' ? { get: () => migrationForm } : undefined; },
  locale: { register() {}, bind: () => t },
  slots: { inject(_name, fn) { fn(); }, register(definition, component) { if (definition && definition.name === 'settings.section') migrationSection = component; return () => {}; } },
};
const migrationMod = clientDefinition.factory(name => { if (name === 'react') return fakeReact; throw new Error('unexpected require: ' + name); });
await migrationMod.apply(migrationCtx);
assert.ok(migrationSection, 'the migration settings section must register');
const migrationRendered = { nodes: [], text: [] };
walk(migrationSection({ t }), migrationRendered);
assert.ok(migrationRendered.text.includes('开启'), 'an old profile with active child gates must show the group as on');
assert.ok(!migrationRendered.text.includes('关闭'), 'a missing user group field must not be mistaken for an explicit off');

// A partially enabled group must show Partial from the effective child state,
// not a blanket On merely because the master switch is true.
const partialForm = {
  getSnapshot() { return { status: 'ready', writable: true, revision: 4, user: { workflowEnabled: true }, value: {
    taskGate: true, evidenceGate: true, impactGate: false, verificationGate: false, recoveryGate: false,
    continuityGate: true, writeContinuity: true,
    reasoningGate: true, reasoningRiskGate: true, semanticReview: true, writeReasoningState: true,
    recallGate: true, recordGate: true, indexGate: true, writeIndex: true,
  } }; },
  subscribe() { return () => {}; },
  async mutate() { return true; },
};
let partialSection;
const partialCtx = {
  effect(fn) { fn(); },
  get(name) { return name === 'configForms' ? { get: () => partialForm } : undefined; },
  locale: { register() {}, bind: () => t },
  slots: { inject(_name, fn) { fn(); }, register(definition, component) { if (definition && definition.name === 'settings.section') partialSection = component; return () => {}; } },
};
const partialMod = clientDefinition.factory(name => { if (name === 'react') return fakeReact; throw new Error('unexpected require: ' + name); });
await partialMod.apply(partialCtx);
assert.ok(partialSection, 'the partial settings section must register');
const partialRendered = { nodes: [], text: [] };
walk(partialSection({ t }), partialRendered);
assert.ok(partialRendered.text.includes('部分启用'), 'a partially enabled workflow group must render Partial');
assert.ok(!partialRendered.text.includes('关闭'), 'no group is explicitly disabled in this fixture');

// A completely empty value must use the schema defaults for group state, not
// treat every absent child as an active switch.
const emptyForm = {
  getSnapshot() { return { status: 'ready', writable: true, revision: 3, user: {}, value: {} }; },
  subscribe() { return () => {}; },
  async mutate() { return true; },
};
let emptySection;
const emptyCtx = {
  effect(fn) { fn(); },
  get(name) { return name === 'configForms' ? { get: () => emptyForm } : undefined; },
  locale: { register() {}, bind: () => t },
  slots: { inject(_name, fn) { fn(); }, register(definition, component) { if (definition && definition.name === 'settings.section') emptySection = component; return () => {}; } },
};
const emptyMod = clientDefinition.factory(name => { if (name === 'react') return fakeReact; throw new Error('unexpected require: ' + name); });
await emptyMod.apply(emptyCtx);
assert.ok(emptySection, 'the empty-value settings section must register');
const emptyRendered = { nodes: [], text: [] };
walk(emptySection({ t }), emptyRendered);
assert.ok(emptyRendered.text.includes('关闭'), 'an empty profile must show workflow off from its schema default');
assert.ok(emptyRendered.text.includes('开启'), 'an empty profile must show the default-on groups');

console.log('client tests passed');