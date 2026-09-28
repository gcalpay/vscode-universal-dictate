const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const protocol = require('../dist/core/clipboard-protocol.js');

const source = fs.readFileSync(path.join(__dirname, '../dist/core/paste.js'), 'utf8');
const success = (clipboard = 'restored') => ({ protocol: 1, code: 'ok', paste: 'submitted', clipboard });
function failure(code, clipboard = 'unchanged', paste = 'not_attempted') {
  return { protocol: 1, code, clipboard, paste };
}

function fixture({ platform = 'win32', spawnThrows = false, endThrows = false } = {}) {
  const calls = [];
  const exports = {};
  let child;
  const fakeProcess = {
    spawn: (...args) => {
      calls.push(args);
      if (spawnThrows) throw new Error('PRIVATE SPAWN CONTENT');
      child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdout.setEncoding = (encoding) => { child.encoding = encoding; };
      child.stderr.resume = () => { child.stderrDrained = true; };
      child.stdin.end = (bytes) => {
        if (endThrows) throw new Error('PRIVATE INPUT CONTENT');
        child.bytes = bytes;
      };
      child.stdin.destroy = () => { child.inputDestroyed = true; };
      child.kill = () => assert.fail('helper must not be killed mid-restoration');
      return child;
    }
  };
  vm.runInNewContext(source, {
    exports, Buffer, process: { platform },
    require: (id) => {
      if (id === 'node:child_process') return fakeProcess;
      if (id === './clipboard-protocol') return protocol;
      throw new Error(`Unexpected dependency: ${id}`);
    }
  }, { filename: 'paste.js' });
  return {
    calls,
    get child() { return child; },
    start: (text = 'retained text') => exports.pasteIntoFocusedControl({ helperPath: 'path with spaces/helper.exe' }, text),
    finish: (report = success(), exit = 0, signal = null) => {
      child.stdout.emit('data', typeof report === 'string' ? report : JSON.stringify(report));
      child.emit('close', exit, signal);
    }
  };
}

test('protocol permits only positive submission with restored/newer clipboard on success', () => {
  for (const state of ['restored', 'newer']) assert.deepEqual(protocol.parseClipboardReport(JSON.stringify(success(state)), 0), success(state));
  for (const state of ['unchanged', 'unknown', 'partial']) {
    assert.throws(() => protocol.parseClipboardReport(JSON.stringify(success(state)), 0), /valid result/);
  }
});

for (const [label, report, exit] of [
  ['empty', '', 0], ['non-json', 'private text', 0], ['null', 'null', 0],
  ['array', '[]', 0], ['wrong version', { ...success(), protocol: 2 }, 0],
  ['unknown code', { ...success(), code: 'invented' }, 0],
  ['missing state', { protocol: 1, code: 'ok' }, 0],
  ['failure exit with success report', success(), 1],
  ['success exit with failure report', failure('snapshot_failed'), 0],
  ['abnormal exit', success(), 2], ['no exit code', success(), null],
  ['uncertain success', { ...success(), paste: 'uncertain' }, 0]
]) {
  test(`malformed protocol: ${label}`, () => {
    assert.throws(() => protocol.parseClipboardReport(typeof report === 'string' ? report : JSON.stringify(report), exit), /valid result/);
  });
}

test('native transaction receives an exact length-framed UTF-8 transcript via stdin only', async () => {
  const h = fixture();
  const text = '  äöü\r\n150 °C — 水 🔥\n';
  const pending = h.start(text);
  assert.equal(h.calls.length, 1);
  const [exe, args, options] = h.calls[0];
  assert.equal(exe, 'path with spaces/helper.exe');
  assert.deepEqual(Array.from(args), ['--clipboard-transaction-v1']);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(Array.from(options.stdio), ['pipe', 'pipe', 'pipe']);
  assert.equal(JSON.stringify(h.calls).includes(text), false);
  const encoded = Buffer.from(text);
  assert.deepEqual(h.child.bytes, Buffer.concat([Buffer.from(`UDCP1 ${encoded.length}\n`), encoded]));
  assert.equal(h.child.stderrDrained, true);
  h.finish();
  await pending;
});

test('successful report may be delivered in multiple chunks', async () => {
  const h = fixture(); const pending = h.start();
  const data = JSON.stringify(success());
  h.child.stdout.emit('data', data.slice(0, 20));
  h.finish(data.slice(20));
  await pending;
});

test('newer clipboard copy is preserved without a second helper call', async () => {
  const h = fixture(); const pending = h.start();
  h.finish(success('newer'));
  await pending;
  assert.equal(h.calls.length, 1);
});

for (const code of ['busy', 'clipboard_busy', 'snapshot_unsupported', 'snapshot_failed', 'invalid_request', 'internal_error']) {
  test(`${code} is surfaced without retry or fallback`, async () => {
    const h = fixture(); const pending = h.start('PRIVATE TRANSCRIPT');
    const rejected = assert.rejects(pending, (error) => {
      assert.match(error.message, /Insertion skipped/);
      assert.match(error.message, /not replaced/);
      assert.match(error.message, /Last transcript remains available/);
      assert.equal(error.message.includes('PRIVATE'), false);
      return true;
    });
    h.finish(failure(code), 1);
    await rejected;
    assert.equal(h.calls.length, 1);
  });
}

test('partial restore is not represented as successful clipboard protection', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /Do not assume the old clipboard was fully restored/);
  h.finish(failure('restore_failed', 'partial', 'submitted'), 1);
  await rejected;
});

test('unknown ownership never claims restored clipboard', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /restoration could not be confirmed/);
  h.finish(failure('ownership_unknown', 'unknown', 'submitted'), 1);
  await rejected;
});

test('partially submitted input requires manual target check, never automatic retry', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /check the target before reinserting/);
  h.finish(failure('paste_failed', 'restored', 'uncertain'), 1);
  await rejected;
  assert.equal(h.calls.length, 1);
});

test('newer clipboard during failed paste remains distinct from old-restored result', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /newer clipboard content was left in place/);
  h.finish(failure('paste_failed', 'newer', 'uncertain'), 1);
  await rejected;
});

test('synchronous launch failure does not invoke legacy helper or PowerShell', async () => {
  const h = fixture({ spawnThrows: true });
  await assert.rejects(h.start(), (error) => {
    assert.match(error.message, /could not start/);
    assert.equal(error.message.includes('PRIVATE'), false);
    return true;
  });
  assert.equal(h.calls.length, 1);
});

test('asynchronous launch failure is sanitized and has no fallback', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /could not start/);
  h.child.emit('error', new Error('PRIVATE PATH'));
  h.child.emit('close', -2, null);
  await rejected;
  assert.equal(h.calls.length, 1);
});

for (const stream of ['stdout', 'stderr']) {
  test(`${stream} errors are handled without killing a helper during restoration`, async () => {
    const h = fixture(); const pending = h.start();
    const rejected = assert.rejects(pending, /without a reliable result/);
    h.child[stream].emit('error', new Error('PRIVATE STREAM DATA'));
    h.finish();
    await rejected;
  });
}

test('excess output is bounded, never logged and never causes a mid-restore kill', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /without a reliable result/);
  h.child.stdout.emit('data', 'PRIVATE DATA'.repeat(1000));
  h.finish();
  await rejected;
  assert.equal(h.calls.length, 1);
});

test('signal/crash reports unknown completion rather than retrying', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /Check clipboard and target/);
  h.finish('', null, 'SIGTERM');
  await rejected;
});

test('input pipe error prevents an optimistic success report', async () => {
  const h = fixture(); const pending = h.start();
  const rejected = assert.rejects(pending, /input failed/);
  h.child.stdin.emit('error', new Error('PRIVATE PIPE DATA'));
  h.finish();
  await rejected;
});

test('synchronous pipe error closes input but does not terminate restoration', async () => {
  const h = fixture({ endThrows: true }); const pending = h.start();
  const rejected = assert.rejects(pending, /input failed/);
  assert.equal(h.child.inputDestroyed, true);
  h.finish();
  await rejected;
});

for (const [label, value] of [
  ['empty', ''], ['null character', 'hello\0world'], ['unpaired surrogate', '\ud800'],
  ['oversized text', 'x'.repeat(protocol.MAX_TRANSCRIPT_BYTES + 1)]
]) {
  test(`invalid transcript ${label} never opens helper or clipboard`, async () => {
    const h = fixture();
    await assert.rejects(h.start(value), /Clipboard was not changed/);
    assert.equal(h.calls.length, 0);
  });
}

test('non-Windows host never tries to access a clipboard helper', async () => {
  const h = fixture({ platform: 'linux' });
  await assert.rejects(h.start(), /Windows UI host/);
  assert.equal(h.calls.length, 0);
});

test('adapter selects only the new protocol-specific executable', async () => {
  const exports = {}; const calls = [];
  const adapter = fs.readFileSync(path.join(__dirname, '../dist/paste.js'), 'utf8');
  vm.runInNewContext(adapter, {
    exports,
    require: (id) => {
      if (id === 'node:path') return path;
      if (id === './core/paste') return { pasteIntoFocusedControl: async (...args) => calls.push(args) };
      throw new Error(`Unexpected runtime dependency ${id}`);
    }
  });
  const context = { asAbsolutePath: (p) => p };
  await exports.pasteIntoFocusedControl(context, 'retained');
  assert.equal(calls[0][0].helperPath, path.join('resources', 'bin', 'windows-clipboard-paste.exe'));
  assert.deepEqual(Object.keys(calls[0][0]), ['helperPath']);
  assert.equal(calls[0][1], 'retained');
});
