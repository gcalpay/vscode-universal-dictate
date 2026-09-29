const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DictationEngine } = require('../dist/core/dictation');

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  // Filesystem completion is not tied to a fixed number of event-loop turns.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('Expected lifecycle event did not occur');
}
async function fixture(t, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ud-m23-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const events = { states: [], notices: [], errors: [], levels: [], inserts: [], sessions: [], transcribes: [] };
  let serial = 0;
  const options = {
    prepare: async () => {}, warm: async () => {},
    startRecorder: async (onLevel, signal) => {
      const file = path.join(dir, `${++serial}.wav`);
      await fs.writeFile(file, 'sample');
      const session = {
        outputPath: file, onLevel, signal, stops: 0, cancels: 0,
        onAction(callback) { this.action = callback; },
        onFailure(callback) { this.failure = callback; },
        async stop() { this.stops++; return file; },
        async cancel() { this.cancels++; await fs.rm(file, { force: true }); }
      };
      events.sessions.push(session);
      return session;
    },
    transcribe: async file => { events.transcribes.push(file); return 'retained transcript'; },
    insert: async (text, signal) => { events.inserts.push({ text, signal }); },
    onStateChanged: state => events.states.push(state),
    onRecordingChanged: state => events.notices.push(state),
    onLevel: level => events.levels.push(level),
    onError: error => events.errors.push(error),
    ...overrides
  };
  const engine = new DictationEngine(options);
  t.after(() => engine.dispose());
  return { engine, options, events, dir, current: () => events.sessions.at(-1) };
}

test('rejected recording-context notifications cannot prevent physical Stop', async t => {
  const h = await fixture(t, { onRecordingChanged: async () => { throw Error('context unavailable'); } });
  await h.engine.toggle(); const s = h.current(); await h.engine.toggle();
  assert.equal(s.stops, 1); assert.equal(h.events.inserts.length, 1);
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 2);
  await h.engine.cancel();
});

test('rejected notification and throwing cancelling UI do not skip physical Cancel', async t => {
  const h = await fixture(t, { onRecordingChanged: async () => { throw Error('context unavailable'); },
    onStateChanged: state => { if (state === 'cancelling') throw Error('view disposed'); } });
  await h.engine.toggle(); const s = h.current(); await h.engine.cancel();
  assert.equal(s.cancels, 1); assert.equal(s.stops, 0);
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 2); await h.engine.cancel();
});

test('pending true notification is followed by false and never blocks Stop', async t => {
  const notice = deferred(); const notices = [];
  const h = await fixture(t, { onRecordingChanged: state => { notices.push(state); if (state) return notice.promise; } });
  await h.engine.toggle(); await until(() => notices.includes(true));
  await h.engine.toggle(); assert.equal(h.events.inserts.length, 1);
  h.engine.dispose(); notice.resolve(); await until(() => notices.at(-1) === false);
  assert.deepEqual(notices, [true, false]);
});

test('preparing UI failure and error-observer failure cannot trap operation ownership', async t => {
  const h = await fixture(t, { onStateChanged: () => { throw Error('UI failed'); }, onError: () => { throw Error('logger failed'); } });
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 0);
  h.options.onStateChanged = () => {};
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 1); await h.engine.cancel();
});

test('synchronous warm-up exception keeps normal recording available', async t => {
  const h = await fixture(t, { warm: () => { throw Error('warm unavailable'); } });
  await h.engine.toggle(); await h.engine.toggle();
  assert.equal(h.events.inserts.length, 1);
});

test('reentrant disposal from opening state prevents even calling recorder factory', async t => {
  const h = await fixture(t);
  h.options.onStateChanged = state => { if (state === 'opening-microphone') h.engine.dispose(); };
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 0);
});

test('early native actions are coalesced once without a retry timer', async t => {
  const h = await fixture(t); const start = h.options.startRecorder;
  h.options.startRecorder = async (...args) => {
    const s = await start(...args);
    s.onAction = callback => { s.action = callback; callback('stop'); callback('stop'); callback('cancel'); };
    return s;
  };
  await h.engine.toggle(); await until(() => h.events.inserts.length === 1 && h.events.states.at(-1) === 'idle');
  assert.equal(h.current().stops, 1); assert.equal(h.current().cancels, 0);
});

test('cancel during preparation blocks pending startup and refuses queued restart', async t => {
  const prepare = deferred(); const h = await fixture(t, { prepare: () => prepare.promise });
  const starting = h.engine.toggle(); await h.engine.cancel(); await h.engine.toggle();
  prepare.resolve(); await starting;
  assert.equal(h.events.sessions.length, 0);
  h.options.prepare = async () => {}; await h.engine.toggle(); await h.engine.cancel();
  assert.equal(h.events.sessions.length, 1);
});

test('late session returned after cancel is shut down once before next recording', async t => {
  const ready = deferred(); const h = await fixture(t); const start = h.options.startRecorder;
  h.options.startRecorder = async (...args) => { const s = await start(...args); await ready.promise; return s; };
  const starting = h.engine.toggle(); await until(() => h.events.sessions.length === 1);
  const s = h.current(); await h.engine.cancel(); assert.equal(s.signal.aborted, true);
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 1);
  ready.resolve(); await starting; assert.equal(s.cancels, 1);
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
});

test('cancelled transcription cannot retain/insert and WAV remains until decode settles', async t => {
  const decode = deferred(); const h = await fixture(t);
  await h.engine.toggle(); await h.engine.toggle();
  h.options.transcribe = () => decode.promise;
  await h.engine.toggle(); const s = h.current(); const stopping = h.engine.toggle();
  await until(() => s.stops === 1); await tick();
  await h.engine.cancel(); await h.engine.toggle();
  assert.equal(h.events.sessions.length, 2); assert.ok(await fs.stat(s.outputPath));
  assert.equal(h.engine.getLastTranscript(), 'retained transcript');
  decode.resolve('obsolete text'); await stopping;
  assert.equal(h.events.inserts.length, 1); assert.equal(h.engine.getLastTranscript(), 'retained transcript');
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
});

test('old level, action and failure callbacks cannot alter a subsequent recording', async t => {
  const h = await fixture(t); await h.engine.toggle(); const old = h.current();
  await h.engine.toggle(); await h.engine.toggle(); const current = h.current();
  const states = h.events.states.length;
  old.onLevel(1); old.action('stop'); old.failure(Error('old process failure'));
  await tick();
  assert.equal(h.events.states.length, states); assert.equal(current.stops, 0); assert.deepEqual(h.events.levels, []);
  current.onLevel(0.5); assert.deepEqual(h.events.levels, [0.5]); await h.engine.cancel();
});

test('unexpected recorder failure cancels and cleans up without transcription', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  s.failure(Error('microphone crashed')); s.failure(Error('duplicate notification'));
  await until(() => h.events.states.at(-1) === 'idle');
  assert.equal(s.cancels, 1); assert.equal(h.events.errors.length, 1); assert.equal(h.events.inserts.length, 0);
  assert.equal(h.events.transcribes.length, 0); assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
});

test('failure callback delivered during listener registration is cleaned, never recorded', async t => {
  const h = await fixture(t); const start = h.options.startRecorder;
  h.options.startRecorder = async (...args) => {
    const s = await start(...args); s.onFailure = callback => callback(Error('already failed')); return s;
  };
  await h.engine.toggle(); assert.equal(h.current().cancels, 1);
  assert.equal(h.events.states.includes('recording'), false); assert.equal(h.events.errors.length, 1);
});

test('duplicate Stop/native Stop and cancellation cannot double-finalize', async t => {
  const stop = deferred(); const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  s.stop = async () => { s.stops++; return stop.promise; };
  const stopping = h.engine.toggle();
  s.action('stop'); s.action('cancel'); await h.engine.toggle();
  assert.equal(s.stops, 1); assert.equal(s.cancels, 0);
  stop.resolve(s.outputPath); await stopping; assert.equal(h.events.inserts.length, 1);
});

test('failed Stop explicitly cancels its owned recorder before releasing operation', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  const cleanup = deferred(); s.stop = async () => { throw Error('stop failed'); };
  s.cancel = async () => { s.cancels++; await cleanup.promise; await fs.rm(s.outputPath); };
  const stop = h.engine.toggle(); await until(() => s.cancels === 1);
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 1); assert.ok(await fs.stat(s.outputPath));
  cleanup.resolve(); await stop;
  assert.equal(h.events.inserts.length, 0); assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
});

test('unknown recorder shutdown is not permission to delete its still-live output', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  s.stop = async () => { throw Error('stop failed'); }; s.cancel = async () => { throw Error('close not confirmed'); };
  await h.engine.toggle(); assert.ok(await fs.stat(s.outputPath)); assert.equal(h.events.inserts.length, 0);
  assert.equal(h.events.errors.length, 2);
});

test('disposal during physical Stop joins cancellation and never starts decode', async t => {
  const stopping = deferred(); const cancellation = deferred(); const h = await fixture(t);
  await h.engine.toggle(); const s = h.current();
  s.stop = () => stopping.promise; s.cancel = async () => { s.cancels++; await cancellation.promise; };
  const task = h.engine.toggle(); h.engine.dispose(); h.engine.dispose();
  assert.equal(s.signal.aborted, true); assert.equal(s.cancels, 1);
  stopping.resolve(s.outputPath); await tick(); assert.ok(await fs.stat(s.outputPath));
  cancellation.resolve(); await task; assert.equal(h.events.transcribes.length, 0);
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null);
});

test('aborted native paste remains owned until restoration reports completion', async t => {
  const restoring = deferred(); const h = await fixture(t);
  h.options.insert = async (text, signal) => { h.events.inserts.push({ text, signal }); await restoring.promise; };
  await h.engine.toggle(); const stopping = h.engine.toggle(); await until(() => h.events.inserts.length === 1);
  await h.engine.cancel(); assert.equal(h.events.inserts[0].signal.aborted, true);
  assert.equal(await h.engine.copyLastTranscript(async () => {}), 'busy');
  await h.engine.toggle(); assert.equal(h.events.sessions.length, 1);
  restoring.resolve(); await stopping;
  assert.equal(h.engine.getLastTranscript(), 'retained transcript');
});

test('explicit recovery paste receives the same cancellation signal contract', async t => {
  const h = await fixture(t); await h.engine.toggle(); await h.engine.toggle();
  const restoring = deferred(); let signal;
  h.options.insert = async (_, token) => { signal = token; await restoring.promise; };
  const pending = h.engine.insertLastTranscript(); h.engine.dispose();
  assert.equal(signal.aborted, true); restoring.resolve(); assert.equal(await pending, 'disposed');
  assert.equal(h.engine.getLastTranscript(), undefined);
});

test('failed transcription removes both returned WAV and initial owned path, not unrelated files', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  const returned = path.join(h.dir, 'returned.wav'), unrelated = path.join(h.dir, 'leave.wav');
  await fs.writeFile(returned, 'returned'); await fs.writeFile(unrelated, 'unrelated');
  s.stop = async () => returned; h.options.transcribe = async () => { throw Error('decode failed'); };
  await h.engine.toggle();
  assert.equal(await fs.stat(s.outputPath).catch(() => null), null); assert.equal(await fs.stat(returned).catch(() => null), null);
  assert.equal(await fs.readFile(unrelated, 'utf8'), 'unrelated');
});

test('throwing Stop/transcribing UI cannot prevent sending the Stop command', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  h.options.onStateChanged = state => { if (state === 'transcribing') throw Error('UI failed'); };
  await h.engine.toggle(); assert.equal(s.stops, 1); assert.equal(h.events.inserts.length, 1);
});

test('disposal from final inserting notification prevents native helper startup', async t => {
  const h = await fixture(t); h.options.onStateChanged = state => { if (state === 'inserting') h.engine.dispose(); };
  await h.engine.toggle(); await h.engine.toggle(); assert.equal(h.events.inserts.length, 0);
  assert.equal(h.engine.getLastTranscript(), undefined);
});

test('a failed cleanup is reported without losing transcript or trapping the lock', async t => {
  const h = await fixture(t); await h.engine.toggle(); const s = h.current();
  const bad = path.join(h.dir, 'not-a-file'); await fs.mkdir(bad); s.stop = async () => bad;
  await h.engine.toggle(); assert.equal(h.engine.getLastTranscript(), 'retained transcript');
  assert.equal(h.events.errors.length, 1); assert.equal(await h.engine.copyLastTranscript(async () => {}), 'completed');
});
