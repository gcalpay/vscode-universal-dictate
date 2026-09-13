'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createGate } = require('./probe.cjs');
const patch = require('./host-patch.cjs');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.killed = false; child.kill = () => { child.killed = true; };
  child.line = line => child.stdout.write(line + '\n');
  return child;
}
function setup(extra = {}) {
  const child = fakeChild();
  const events = [];
  let disposed = false;
  const gate = createGate({ helper: 'test.exe', launch: () => child,
    onReady: () => ({ dispose() { disposed = true; } }), log: event => events.push(event), ...extra });
  return { child, gate, events, get statusDisposed() { return disposed; } };
}
test('gate holds until READY, RELEASE and successful close', async () => {
  const s = setup(); let resolved = false;
  const result = s.gate.wait().then(text => { resolved = true; return text; });
  s.child.line('READY');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  s.child.line('RELEASE');
  assert.equal(resolved, false);
  s.child.emit('close', 0);
  assert.equal(await result, 'UD_TEST');
  assert.deepEqual(s.events, ['gate-ready', 'gate-released']);
  assert.equal(s.statusDisposed, true);
});
test('zero exit without RELEASE is not successful transcription', async () => {
  const s = setup(); const result = s.gate.wait();
  s.child.line('READY'); s.child.emit('close', 0);
  await assert.rejects(result, /failed/);
});
test('registration failure never yields fixed text', async () => {
  const s = setup(); const result = s.gate.wait();
  s.child.stderr.write('hotkey conflict'); s.child.emit('close', 4);
  await assert.rejects(result, /hotkey conflict/);
});
test('out of order and duplicate protocol messages fail closed', async () => {
  for (const messages of [['RELEASE'], ['READY', 'READY'], ['READY', 'RELEASE', 'RELEASE']]) {
    const s = setup(); const result = s.gate.wait();
    for (const line of messages) s.child.line(line);
    await assert.rejects(result, /protocol/);
    assert.equal(s.child.killed, true);
  }
});
test('dispose rejects pending operation and prevents a new one', async () => {
  const s = setup(); const result = s.gate.wait(); s.child.line('READY'); s.gate.dispose();
  await assert.rejects(result, /disposed/);
  await assert.rejects(s.gate.wait(), /disposed/);
  assert.equal(s.child.killed, true);
});
test('concurrent transcription is rejected without replacing the first', async () => {
  const s = setup(); const first = s.gate.wait();
  await assert.rejects(s.gate.wait(), /pending/);
  s.child.line('READY'); s.child.line('RELEASE'); s.child.emit('close', 0);
  assert.equal(await first, 'UD_TEST');
});
test('spawn error is propagated, not a transcript', async () => {
  const s = setup(); const result = s.gate.wait(); s.child.emit('error', new Error('spawn failed'));
  await assert.rejects(result, /spawn failed/);
});
test('readiness timeout fails rather than pasting after a timer', async () => {
  const s = setup({ timeoutMs: 5 });
  await assert.rejects(s.gate.wait(), /ready/);
  assert.equal(s.child.killed, true);
});
test('upstream patch adds only the diagnostic listener before the constructor update', () => {
  const original = 'before\n' + patch.ANCHOR + 'after\n';
  const changed = patch.transform(original);
  assert.equal(changed.replace(patch.HANDLER, ''), original);
  assert.throws(() => patch.transform(changed), /patched/);
  assert.throws(() => patch.transform('no anchor'), /anchor/);
  assert.throws(() => patch.transform(patch.ANCHOR + patch.ANCHOR), /anchor/);
});
test('H1 handler cancels only primary mouse-down on the exact genuine item', () => {
  let listener;
  const self = { container: { id: patch.ITEM_ID }, labelContainer: {}, _register() {} };
  const register = (element, type, handler) => { assert.equal(type, 'mousedown'); listener = handler; };
  vm.runInNewContext(`(function () { ${patch.HANDLER} }).call(self)`, {
    self, addDisposableListener: register, EventType: { MOUSE_DOWN: 'mousedown' }
  });
  const observations = [];
  for (const [id, button] of [[patch.ITEM_ID, 0], [patch.ITEM_ID, 1], [patch.ITEM_ID, 2], ['other.item', 0]]) {
    self.container.id = id; let prevented = false;
    listener({ button, preventDefault() { prevented = true; }, stopPropagation() { throw new Error('Unexpected propagation change'); } });
    observations.push(prevented);
  }
  assert.deepEqual(observations, [true, false, false, false]);
});
test('bootstrap declares explicit development-mode guards (static check)', () => {
  // No vscode mock is used to infer GUI behavior; syntax and gate tests above are unit-only.
  const source = require('node:fs').readFileSync(require.resolve('./probe.cjs'), 'utf8');
  assert.match(source, /context\.extensionMode !== vscode\.ExtensionMode\.Development/);
  assert.match(source, /process\.env\.UD_FOCUS_PROBE !== 'M1\.2'/);
});
