const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter, getEventListeners } = require('node:events');
const test = require('node:test');
const protocol = require('../dist/core/input-protocol.js');
const source = fs.readFileSync(path.join(__dirname, '../dist/core/paste.js'), 'utf8');
const success = () => ({ protocol: 1, code: 'ok', input: 'submitted' });
const none = () => ({ protocol: 1, code: 'no_target', input: 'not_attempted' });

function fixture({ platform = 'win32', spawnThrows = false, onSpawn, writeThrows = false } = {}) {
  const calls = [];
  const exports = {};
  let child;
  const cp = { spawn: (...args) => {
    calls.push(args);
    if (spawnThrows) throw new Error('PRIVATE SPAWN DATA');
    child = new EventEmitter();
    for (const stream of ['stdin', 'stdout', 'stderr']) child[stream] = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.resume = () => {};
    child.stdin.write = (value) => { if (writeThrows) throw new Error('PRIVATE'); child.bytes = value; };
    child.ends = 0;
    child.stdin.end = () => { child.ends++; };
    child.stdin.destroy = () => { child.destroyed = true; };
    child.kill = () => assert.fail('no force termination or retry');
    onSpawn?.();
    return child;
  } };
  vm.runInNewContext(source, {
    exports, Buffer, Error, process: { platform },
    require: (name) => {
      if (name === 'node:child_process') return cp;
      if (name === './input-protocol') return protocol;
      throw new Error(`unexpected dependency ${name}`);
    }
  });
  return {
    calls, get child() { return child; },
    start: (text = 'hello', options = {}) => exports.pasteIntoFocusedControl({ helperPath: 'path with spaces/windows-text-input.exe', ...options }, text),
    finish: (report = success(), exit = 0, signal = null) => {
      child.stdout.emit('data', typeof report === 'string' ? report : JSON.stringify(report));
      child.emit('close', exit, signal);
    }
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('default Off sends exact UTF-8 over the new stdin protocol, never clipboard', async () => {
  const h = fixture();
  const options = {};
  Object.defineProperty(options, 'clipboard', { enumerable: true, get() { return { writeText: () => assert.fail('clipboard accessed') }; } });
  const text = 'Grüße 水 🧪';
  const pending = h.start(text, options);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(Array.from(h.calls[0][1]), ['--unicode-input-v1']);
  assert.equal(h.calls[0][2].shell, false);
  assert.equal(h.calls[0][2].windowsHide, true);
  assert.equal(JSON.stringify(h.calls).includes(text), false);
  const encoded = Buffer.from(text);
  assert.deepEqual(h.child.bytes, Buffer.concat([Buffer.from(`UDTI1 ${encoded.length}\n`), encoded]));
  assert.equal(h.child.ends, 0);
  h.finish(); await pending;
});

for (const old of ['text', { image: Buffer.from([1, 2]) }, { files: ['example'] }, { html: '<b>x</b>', unknownFormat: 'private metadata' }]) {
  test(`Off leaves an existing ${typeof old === 'string' ? 'text' : Object.keys(old)[0]} clipboard completely untouched`, async () => {
    const h = fixture(); let current = old;
    const pending = h.start('new transcript', { overwriteClipboard: false, clipboard: {
      readText: () => assert.fail('read'), writeText: (text) => { current = text; assert.fail('write'); }
    } });
    h.finish(); await pending; assert.equal(current, old);
  });
}
for (const value of [undefined, false, 'true', 'false', 1, null]) {
  test(`only literal true enables overwrite; ${String(value)} stays Off`, async () => {
    const h = fixture();
    const pending = h.start('new', { overwriteClipboard: value, clipboard: { writeText: () => assert.fail('unexpected copy') } });
    h.finish(); await pending;
  });
}

test('On copies exact text BEFORE input and leaves it without restoration', async () => {
  const h = fixture(); let clipboard = 'old'; let writes = 0;
  const pending = h.start('new\r\nexact', { overwriteClipboard: true, clipboard: { writeText: async (text) => {
    assert.equal(h.calls.length, 0); clipboard = text; writes++;
  } } });
  await flush(); h.finish(); await pending;
  assert.equal(clipboard, 'new\r\nexact'); assert.equal(writes, 1);
});
for (const overwriteClipboard of [false, true]) {
  test(`no target with overwrite ${overwriteClipboard}: no retry, optional backup retained`, async () => {
    const h = fixture(); let clipboard = 'old'; let writes = 0;
    const pending = h.start('new', { overwriteClipboard, clipboard: { writeText: async (s) => { clipboard = s; writes++; } } });
    await flush(); h.finish(none()); await pending;
    assert.equal(clipboard, overwriteClipboard ? 'new' : 'old'); assert.equal(writes, +overwriteClipboard);
    assert.equal(h.calls.length, 1);
  });
}
test('On does not restore stale content over a newer user copy', async () => {
  const h = fixture(); let clipboard = 'old'; let writes = 0;
  const pending = h.start('transcript', { overwriteClipboard: true, clipboard: { writeText: async (s) => { clipboard = s; writes++; } } });
  await flush(); clipboard = 'user copied afterward'; h.finish(); await pending;
  assert.equal(clipboard, 'user copied afterward'); assert.equal(writes, 1);
});
test('On retains backup even when helper cannot launch', async () => {
  const h = fixture({ spawnThrows: true }); let clipboard = 'old';
  const pending = h.start('new', { overwriteClipboard: true, clipboard: { writeText: async (s) => { clipboard = s; } } });
  await assert.rejects(pending, /transcript was copied/); assert.equal(clipboard, 'new');
});
test('failed optional clipboard copy does NOT block direct insertion', async () => {
  const h = fixture();
  const pending = h.start('new', { overwriteClipboard: true, clipboard: { writeText: async () => { throw new Error('PRIVATE'); } } });
  const rejection = assert.rejects(pending, /optional clipboard backup failed/);
  await flush(); assert.equal(h.calls.length, 1); h.finish(); await rejection;
});
test('changing mode while clipboard write is pending cannot change that operation', async () => {
  const h = fixture(); let release; let count = 0;
  const options = { overwriteClipboard: true, clipboard: { writeText: () => { count++; return new Promise(r => { release = r; }); } } };
  const pending = h.start('new', options); options.overwriteClipboard = false;
  release(); await flush(); h.finish(); await pending; assert.equal(count, 1);
});

for (const [label, text] of [['empty', ''], ['null', 'a\0b'], ['surrogate', '\ud800'], ['too large', 'x'.repeat(protocol.MAX_TRANSCRIPT_BYTES + 1)]]) {
  test(`invalid ${label} never writes clipboard or starts helper`, async () => {
    const h = fixture();
    await assert.rejects(h.start(text, { overwriteClipboard: true, clipboard: { writeText: () => assert.fail('copy') } }));
    assert.equal(h.calls.length, 0);
  });
}
test('non-Windows refuses without clipboard operations', async () => {
  const h = fixture({ platform: 'linux' }); await assert.rejects(h.start(), /Windows/); assert.equal(h.calls.length, 0);
});
test('pre-abort prevents both clipboard backup and input', async () => {
  const h = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(h.start('new', { signal: controller.signal, overwriteClipboard: true, clipboard: { writeText: () => assert.fail('copy') } }), /cancelled/);
  assert.equal(h.calls.length, 0);
});
test('abort during clipboard write preserves completed copy but starts no input', async () => {
  const h = fixture(); const controller = new AbortController(); let release;
  const pending = h.start('new', { signal: controller.signal, overwriteClipboard: true, clipboard: { writeText: () => new Promise(r => { release = r; }) } });
  const rejected = assert.rejects(pending, /cancelled.*copied/);
  controller.abort(); release(); await rejected; assert.equal(h.calls.length, 0);
});
test('abort closes lifetime pipe once and waits for child close', async () => {
  const h = fixture(); const c = new AbortController(); let settled = false;
  const pending = h.start('new', { signal: c.signal });
  const rejected = assert.rejects(pending, /cancelled/).then(() => { settled = true; });
  c.abort(); c.abort(); assert.equal(h.child.ends, 1); await flush(); assert.equal(settled, false);
  h.finish({ protocol: 1, code: 'cancelled', input: 'not_attempted' }, 1); await rejected;
  assert.equal(getEventListeners(c.signal, 'abort').length, 0);
});
test('abort during spawn sends no transcript frame', async () => {
  const c = new AbortController(); const h = fixture({ onSpawn: () => c.abort() });
  const pending = h.start('new', { signal: c.signal }); const rejected = assert.rejects(pending);
  assert.equal(h.child.bytes, undefined); assert.equal(h.child.ends, 1);
  h.finish({ protocol: 1, code: 'cancelled', input: 'not_attempted' }, 1); await rejected;
});
test('partial submission is never retried', async () => {
  const h = fixture(); const pending = h.start(); const rejected = assert.rejects(pending, /partial/);
  h.finish({ protocol: 1, code: 'input_failed', input: 'partial' }, 1); await rejected; assert.equal(h.calls.length, 1);
});
test('successful close removes abort listeners', async () => {
  const h = fixture(); const c = new AbortController(); const pending = h.start('new', { signal: c.signal });
  h.finish(); await pending; c.abort(); assert.equal(h.child.ends, 0); assert.equal(getEventListeners(c.signal, 'abort').length, 0);
});
for (const channel of ['stdout', 'stderr', 'stdin']) {
  test(`${channel} error is handled, not retried or exposed`, async () => {
    const h = fixture(); const pending = h.start(); const rejected = assert.rejects(pending, e => !e.message.includes('PRIVATE'));
    h.child[channel].emit('error', new Error('PRIVATE')); h.finish(); await rejected; assert.equal(h.calls.length, 1);
  });
}
test('output overflow cooperatively cancels, keeps output bounded and private', async () => {
  const h = fixture(); const pending = h.start(); const rejected = assert.rejects(pending, /reliable result/);
  h.child.stdout.emit('data', 'PRIVATE'.repeat(1000)); assert.equal(h.child.ends, 1); h.finish(); await rejected;
});
test('synchronous stdin write failure cancels without retry', async () => {
  const h = fixture({ writeThrows: true }); const pending = h.start(); const rejected = assert.rejects(pending);
  assert.equal(h.child.ends, 1); h.finish(); await rejected;
});
test('child error waits for close before releasing operation', async () => {
  const h = fixture(); const pending = h.start(); let done = false;
  const rejected = assert.rejects(pending).then(() => { done = true; }); h.child.emit('error', new Error('PRIVATE'));
  await flush(); assert.equal(done, false); h.finish(); await rejected;
});
for (const [label, report, exit] of [
  ['not JSON', 'private data', 0], ['null', 'null', 0], ['array', '[]', 0],
  ['old protocol', { protocol: 2, code: 'ok', paste: 'submitted', clipboard: 'restored' }, 0],
  ['false success', { ...success(), input: 'partial' }, 0], ['exit mismatch', success(), 1],
  ['unknown code', { ...success(), code: 'made_up' }, 0], ['bad exit', success(), null],
  ['no target mismatch', { ...none(), input: 'submitted' }, 0]
]) {
  test(`rejects malformed report: ${label}`, () => {
    assert.throws(() => protocol.parseTextInputReport(typeof report === 'string' ? report : JSON.stringify(report), exit));
  });
}
test('native input production sources contain no clipboard or paste APIs', () => {
  for (const file of ['windows-text-input.cpp', 'text-input-request.h', 'unicode-input.h']) {
    const text = fs.readFileSync(path.join(__dirname, '../native', file), 'utf8');
    assert.doesNotMatch(text, /\b(?:OpenClipboard|EmptyClipboard|GetClipboardData|SetClipboardData|EnumClipboardFormats|GetClipboardSequenceNumber)\s*\(/);
    assert.doesNotMatch(text, /\bVK_RETURN\b|\bVK_TAB\b|key\('V'\)/);
  }
});
