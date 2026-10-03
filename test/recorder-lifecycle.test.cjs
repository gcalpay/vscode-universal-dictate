const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const readline = require('node:readline');
const test = require('node:test');
const overlay = require('../dist/core/overlay-size');
const source = fs.readFileSync(path.join(__dirname, '../dist/core/recorder.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(settings = {}) {
  const children = [], removals = [], timers = new Map();
  let nextTimer = 0;
  const filesystem = {
    existsSync: () => settings.exists !== false,
    promises: { rm: async (file) => {
      const owner = children.find(child => child.outputPath === file);
      assert.equal(owner?.closed, true, 'WAV deletion before process/stdio close');
      removals.push(file);
      if (settings.removeFails) throw Error('WAV cleanup failed');
    } }
  };
  const processAPI = {
    spawn: (exe, args) => {
      if (settings.spawnThrows) throw Error('spawn failed');
      const child = new EventEmitter();
      child.pid = 42;
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new EventEmitter();
      child.stdin.destroyed = false; child.commands = []; child.kills = 0; child.closed = false;
      child.outputPath = args[args.indexOf('--output') + 1];
      child.controls = [];
      child.stdin.write = (data, callback) => {
        child.controls.push(data);
        callback?.(settings.writeCallbackError ? Error('input callback failure') : undefined);
        return true;
      };
      child.stdin.end = (data, callback) => {
        if (settings.writeThrows) throw Error('input write failed');
        child.commands.push(data);
        callback?.(settings.writeCallbackError ? Error('input callback failure') : undefined);
      };
      child.kill = () => { child.kills++; if (settings.killEmitsError) child.emit('error', Error('kill denied')); return settings.killSucceeds !== false; };
      children.push(child); return child;
    }
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, queueMicrotask, AggregateError,
    setTimeout: (fn, ms) => { const key = ++nextTimer; timers.set(key, { fn, ms }); return key; },
    clearTimeout: key => timers.delete(key),
    require: id => {
      if (id === 'node:child_process') return processAPI;
      if (id === 'node:fs') return filesystem;
      if (id === 'node:readline') return readline;
      if (id === './overlay-size') return overlay;
      if (id === './recorder-pause') return require('../dist/core/recorder-pause');
      if (id === './preview-recorder') return require('../dist/core/preview-recorder');
      throw Error(`Unexpected require ${id}`);
    }
  }, { filename: 'recorder.js' });
  return {
    children, removals, timers,
    start: (signal, onLevel = () => {}) => exports.CoreRecorderSession.start({ recorderPath: 'recorder.exe', outputPath: 'test.wav', signal }, onLevel),
    ready: () => children.at(-1).stdout.write('READY\n'),
    exit: (code = 0, signal = null) => children.at(-1).emit('exit', code, signal),
    close: (code = 0) => {
      const child = children.at(-1); child.closed = true;
      child.stdout.end(); child.stderr.end(); child.emit('close', code, null);
    },
    fire: ms => {
      const entry = [...timers].find(([, task]) => task.ms === ms);
      assert.ok(entry, `no ${ms}ms timer`); timers.delete(entry[0]); entry[1].fn();
    }
  };
}
async function ready(h, signal, onLevel) { const starting = h.start(signal, onLevel); h.ready(); return starting; }

test('missing binary and pre-aborted signal do not spawn a recorder', async () => {
  const missing = harness({ exists: false }); await assert.rejects(missing.start(), /missing/); assert.equal(missing.children.length, 0);
  const h = harness(); const signal = new AbortController(); signal.abort();
  await assert.rejects(h.start(signal.signal), /cancelled/); assert.equal(h.children.length, 0);
});

test('spawn exception is returned without an invented output cleanup', async () => {
  const h = harness({ spawnThrows: true }); await assert.rejects(h.start(), /spawn failed/); assert.deepEqual(h.removals, []);
});

test('STOP is sent exactly once and waits for close, not just exit', async () => {
  const h = harness(); const session = await ready(h);
  const first = session.stop(); const second = session.stop(); assert.equal(first, second);
  assert.deepEqual(h.children[0].commands, ['STOP\n']);
  let finished = false; first.then(() => { finished = true; });
  h.exit(); await tick(); assert.equal(finished, false); assert.deepEqual(h.removals, []);
  h.close(); assert.equal(await first, 'test.wav'); assert.equal(h.timers.size, 0);
});

test('Cancel is idempotent and does not delete a still-open WAV', async () => {
  const h = harness(); const session = await ready(h); const first = session.cancel(); const second = session.cancel();
  assert.equal(first, second); assert.deepEqual(h.children[0].commands, ['CANCEL\n']);
  h.exit(); await tick(); assert.deepEqual(h.removals, []);
  h.close(); await first; assert.deepEqual(h.removals, ['test.wav']);
});

test('Cancel after Stop discards output without issuing a second terminal command', async () => {
  const h = harness(); const session = await ready(h);
  const stop = session.stop(); const rejected = assert.rejects(stop, /cancelled/); const cancel = session.cancel();
  assert.deepEqual(h.children[0].commands, ['STOP\n']); h.exit(); h.close();
  await rejected; await cancel; assert.deepEqual(h.removals, ['test.wav']);
});

test('ready, level and native-action events cannot resurrect a stopped recorder', async () => {
  const h = harness(); const levels = [], actions = [];
  const session = await ready(h, undefined, level => levels.push(level));
  const child = h.children[0]; session.onAction(action => actions.push(action));
  child.stdout.write('LEVEL 0.5\n'); child.stdout.write('ACTION STOP\n');
  const cancel = session.cancel(); child.stdout.write('LEVEL 0.9\nREADY\nACTION CANCEL\n');
  await tick(); assert.deepEqual(levels, [0.5]); assert.deepEqual(actions, []);
  h.exit(); h.close(); await cancel;
});

test('one pending early native action is delivered to the captured listener', async () => {
  const h = harness(); const starting = h.start(); const child = h.children[0];
  child.stdout.write('READY\nACTION STOP\nACTION CANCEL\n'); const session = await starting;
  const first = [], second = [];
  session.onAction(action => first.push(action)); session.onAction(action => second.push(action));
  await tick(); assert.deepEqual(first, ['stop']); assert.deepEqual(second, []);
  const cancel = session.cancel(); h.exit(); h.close(); await cancel;
});

test('abort during startup closes the recorder and removes output only after close', async () => {
  const h = harness(); const abort = new AbortController(); const pending = h.start(abort.signal);
  const rejected = assert.rejects(pending, /cancelled/); abort.abort();
  assert.deepEqual(h.children[0].commands, ['CANCEL\n']); await tick(); assert.deepEqual(h.removals, []);
  h.exit(); h.close(); await rejected; assert.deepEqual(h.removals, ['test.wav']); assert.equal(h.timers.size, 0);
});

test('abort during recording requests cancellation and suppresses queued actions', async () => {
  const h = harness(); const abort = new AbortController(); const session = await ready(h, abort.signal);
  const actions = []; session.onAction(action => actions.push(action));
  h.children[0].stdout.write('ACTION STOP\n'); abort.abort(); await tick(); assert.deepEqual(actions, []);
  const cancel = session.cancel(); h.exit(); h.close(); await cancel; assert.equal(h.removals.length, 1);
});

test('signal listener is detached after normal close, so later abort cannot delete a decoder WAV', async () => {
  const h = harness(); const abort = new AbortController(); const session = await ready(h, abort.signal);
  const stop = session.stop(); h.exit(); h.close(); await stop;
  abort.abort(); await tick(); assert.deepEqual(h.removals, []); assert.equal(h.children[0].kills, 0);
});

test('unexpected mid-recording exit reports failure once, including a late listener', async () => {
  const h = harness(); const session = await ready(h); const errors = [];
  h.exit(7); session.onFailure(error => errors.push(error)); h.close(7); await tick();
  assert.equal(errors.length, 1); assert.match(errors[0].message, /unexpectedly/);
  await session.cancel(); assert.equal(h.removals.length, 1);
});

test('unrequested zero exit is still an unexpected recording failure', async () => {
  const h = harness(); const session = await ready(h); const errors = [];
  session.onFailure(error => errors.push(error)); h.exit(0); h.close(0); await tick();
  assert.equal(errors.length, 1); await assert.rejects(session.stop(), /unexpected/); await session.cancel();
});

test('startup exit before READY rejects and closes resources before cleanup', async () => {
  const h = harness(); const pending = h.start(); const rejected = assert.rejects(pending, /unexpected|before becoming ready/);
  h.exit(1); await tick(); assert.deepEqual(h.removals, []);
  h.close(1); await rejected; assert.deepEqual(h.removals, ['test.wav']);
});

test('startup timeout cancels, then waits for close instead of unlinking immediately', async () => {
  const h = harness(); const pending = h.start(); const rejected = assert.rejects(pending, /ready in time/);
  h.fire(10000); await tick(); assert.deepEqual(h.children[0].commands, ['CANCEL\n']); assert.deepEqual(h.removals, []);
  h.exit(); h.close(); await rejected; assert.equal(h.removals.length, 1); assert.equal(h.timers.size, 0);
});

test('a stuck recorder receives a bounded shutdown attempt, never a clipboard-helper kill', async () => {
  const h = harness(); const session = await ready(h); const stop = session.stop(); const rejected = assert.rejects(stop, /stop in time/);
  h.fire(10000); assert.equal(h.children[0].kills, 1); assert.deepEqual(h.removals, []);
  h.exit(null, 'SIGTERM'); h.close(null); await rejected; await session.cancel(); assert.equal(h.removals.length, 1);
});

test('unconfirmed shutdown leaves output intact and installs late-close cleanup', async () => {
  const h = harness({ killSucceeds: false }); const session = await ready(h); const cancel = session.cancel();
  const rejected = assert.rejects(cancel, /shutdown was not confirmed/);
  h.fire(10000); h.fire(12000); await rejected; assert.deepEqual(h.removals, []); assert.equal(h.timers.size, 0);
  h.exit(1); h.close(1); await tick(); assert.deepEqual(h.removals, ['test.wav']);
});

for (const mode of ['writeThrows', 'writeCallbackError']) {
  test(`${mode} triggers safe recorder shutdown and rejects Stop`, async () => {
    const h = harness({ [mode]: true }); const session = await ready(h);
    const stop = session.stop(); const rejected = assert.rejects(stop, /input.*fail/);
    assert.equal(h.children[0].kills, 1); h.exit(1); h.close(1); await rejected; await session.cancel();
  });
}

test('stdin EPIPE is handled and cleanup waits for close', async () => {
  const h = harness(); const session = await ready(h); const errors = [];
  session.onFailure(error => errors.push(error)); h.children[0].stdin.emit('error', Error('EPIPE'));
  await tick(); assert.equal(errors.length, 1); assert.equal(h.children[0].kills, 1);
  const cancel = session.cancel(); h.exit(1); h.close(1); await cancel;
  h.children[0].stdin.emit('error', Error('late EPIPE')); // Handled even after close.
});

test('stderr capture is bounded for an unexpected recorder exit', async () => {
  const h = harness(); const session = await ready(h); const errors = [];
  session.onFailure(error => errors.push(error)); h.children[0].stderr.write('x'.repeat(50000)); h.exit(1); h.close(1);
  await tick(); assert.ok(errors[0].message.length < 4400); await session.cancel();
});

test('failed removal is not silently reported as successful cancellation', async () => {
  const h = harness({ removeFails: true }); const session = await ready(h); const cancel = session.cancel();
  const rejected = assert.rejects(cancel, /cleanup failed/); h.exit(); h.close(); await rejected;
  assert.equal(h.removals.length, 1);
});

test('VS Code wrapper generates distinct UUID WAV paths and forwards cancellation/failures', async () => {
  const wrapper = fs.readFileSync(path.join(__dirname, '../dist/recorder.js'), 'utf8');
  const calls = [], exports = {}; let sequence = 0, notified = false;
  vm.runInNewContext(wrapper, {
    exports,
    require: id => {
      if (id === 'node:fs') return { existsSync: () => true, promises: { mkdir: async () => {} } };
      if (id === 'node:path') return path;
      if (id === 'node:crypto') return { randomUUID: () => `uuid-${++sequence}` };
      if (id === 'vscode') return { Uri: { joinPath: (uri, ...parts) => ({ fsPath: path.join(uri.fsPath, ...parts) }) } };
      if (id === './core/recorder') return { CoreRecorderSession: { start: async (...args) => {
        calls.push(args); return { outputPath: args[0].outputPath, onFailure: callback => callback(Error('failure')) };
      } } };
      throw Error(`Unexpected wrapper dependency ${id}`);
    }
  });
  const context = { extensionUri: { fsPath: '/extension' }, globalStorageUri: { fsPath: '/storage' } };
  const abort = new AbortController();
  const first = await exports.RecorderSession.start(context, () => {}, true, 'enhanced', 1, 'medium', abort.signal);
  const second = await exports.RecorderSession.start(context, () => {});
  assert.notEqual(first.outputPath, second.outputPath); assert.match(first.outputPath, /uuid-1.wav$/);
  assert.equal(calls[0][0].signal, abort.signal);
  first.onFailure(() => { notified = true; }); assert.equal(notified, true);
  abort.abort(); await assert.rejects(exports.RecorderSession.start(context, () => {}, true, 'enhanced', 1, 'medium', abort.signal));
  assert.equal(calls.length, 2);
});

test('kill failure cannot recurse through the child error handler', async () => {
  const h = harness({ killEmitsError: true }); const session = await ready(h);
  const cancel = session.cancel(); const rejected = assert.rejects(cancel, /shutdown was not confirmed/);
  h.fire(10000); assert.equal(h.children[0].kills, 1); h.fire(12000); await rejected;
  h.exit(1); h.close(1); await tick(); assert.equal(h.removals.length, 1);
});

test('Pause/Resume uses nonterminal writes, with matching acknowledgements before Stop', async () => {
  const h=harness();const opening=h.start();const c=h.children[0];c.stdout.write('READY\n');const s=await opening;
  const pause=s.setPaused(true); assert.deepEqual(c.controls,['PAUSE 1\n']); assert.deepEqual(c.commands,[]);
  c.stdout.write('PAUSED 1\n');await pause;
  const resume=s.setPaused(false);c.stdout.write('RESUMED 2\n');await resume;
  assert.deepEqual(c.controls,['PAUSE 1\n','RESUME 2\n']);
  const stopping=s.stop();h.close();await stopping;assert.deepEqual(c.commands,['STOP\n']);
});

test('Stop rejects pending Pause and drops late native controls', async () => {
  const h=harness();const opening=h.start();const c=h.children[0];c.stdout.write('READY\n');const s=await opening;
  const actions=[];s.onAction(action=>actions.push(action));const pause=s.setPaused(true);const stopped=s.stop();
  c.stdout.write('PAUSED 1\nACTION RESUME\n');h.close();await stopped;await assert.rejects(pause,/stopped/);await tick();
  assert.deepEqual(actions,[]);
});

test('native pause and resume actions do not consume the one terminal-action slot', async () => {
  const h=harness();const opening=h.start();const c=h.children[0];c.stdout.write('READY\nACTION PAUSE\n');const s=await opening;
  const actions=[];s.onAction(a=>actions.push(a));await tick();
  c.stdout.write('ACTION RESUME\n');await tick();c.stdout.write('ACTION PAUSE\n');await tick();c.stdout.write('ACTION STOP\n');await tick();
  assert.deepEqual(actions,['pause','resume','pause','stop']);
  const stopping=s.stop();h.close();await stopping;
});
