const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DictationEngine } = require('../dist/core/dictation.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function harness(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ud-recovery-'));
  const outputPath = path.join(directory, 'test.wav');
  const events = { pasted: [], errors: [], states: [], starts: 0, stops: 0, cancels: 0, noSpeech: 0 };
  let text = 'first transcript';
  let listener;
  const session = {
    outputPath,
    onAction: (value) => { listener = value; },
    stop: async () => { events.stops++; return outputPath; },
    cancel: async () => { events.cancels++; await fs.rm(outputPath, { force: true }); }
  };
  const options = {
    prepare: async () => {},
    warm: async () => {},
    startRecorder: async () => {
      events.starts++;
      await fs.writeFile(outputPath, 'test audio');
      return session;
    },
    transcribe: async () => text,
    insert: async (value) => { events.pasted.push(value); },
    onStateChanged: (state) => events.states.push(state),
    onNoSpeech: () => { events.noSpeech++; },
    onError: (error) => events.errors.push(error),
    ...overrides
  };
  const engine = new DictationEngine(options);
  t.after(async () => {
    engine.dispose();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    engine, options, session, outputPath, events,
    setText: (value) => { text = value; },
    action: (value) => listener(value),
    record: async (value = 'first transcript') => {
      text = value;
      await engine.toggle();
      await engine.toggle();
    }
  };
}

test('new engine has no retained transcript; empty actions have no effects', async (t) => {
  const h = await harness(t);
  let copies = 0;
  assert.equal(h.engine.getLastTranscript(), undefined);
  assert.equal(await h.engine.insertLastTranscript(), 'empty');
  assert.equal(await h.engine.copyLastTranscript(async () => { copies++; }), 'empty');
  assert.equal(copies, 0);
  assert.deepEqual(h.events.pasted, []);
  h.engine.clearLastTranscript();
  assert.equal(h.engine.getLastTranscript(), undefined);
});

test('retains exact text before the automatic insertion callback', async (t) => {
  const h = await harness(t);
  const text = '  First line\r\nZweite Zeile: äöü; 123 °C\n';
  h.options.insert = async (value) => {
    assert.equal(h.engine.getLastTranscript(), text);
    assert.equal(value, text);
  };
  await h.record(text);
  assert.equal(h.engine.getLastTranscript(), text);
  assert.deepEqual(h.events.errors, []);
  await assert.rejects(fs.access(h.outputPath), { code: 'ENOENT' });
});

test('failed automatic paste retains the new transcript without retrying', async (t) => {
  const h = await harness(t);
  await h.record('older');
  let attempts = 0;
  h.options.insert = async () => { attempts++; throw new Error('paste failed'); };
  await h.record('newer');
  assert.equal(h.engine.getLastTranscript(), 'newer');
  assert.equal(attempts, 1);
  assert.equal(h.events.errors.length, 1);
  await assert.rejects(fs.access(h.outputPath), { code: 'ENOENT' });
});

for (const value of ['', '   ', '\t\r\n']) {
  test(`empty/whitespace result ${JSON.stringify(value)} does not erase previous transcript`, async (t) => {
    const h = await harness(t);
    await h.record('keep me');
    await h.record(value);
    assert.equal(h.engine.getLastTranscript(), 'keep me');
    assert.deepEqual(h.events.pasted, ['keep me']);
    assert.equal(h.events.noSpeech, 1);
  });
}

test('later successful transcript replaces the previous one', async (t) => {
  const h = await harness(t);
  await h.record('first');
  await h.record('second');
  assert.equal(h.engine.getLastTranscript(), 'second');
  assert.deepEqual(h.events.pasted, ['first', 'second']);
});

test('failed transcription keeps the previous value', async (t) => {
  const h = await harness(t);
  await h.record('keep me');
  h.options.transcribe = async () => { throw new Error('recognition failed'); };
  await h.record();
  assert.equal(h.engine.getLastTranscript(), 'keep me');
  assert.deepEqual(h.events.pasted, ['keep me']);
  assert.equal(h.events.errors.length, 1);
});

test('cancelled recording keeps the previous value and inserts nothing', async (t) => {
  const h = await harness(t);
  await h.record('keep me');
  await h.engine.toggle();
  await h.engine.cancel();
  assert.equal(h.engine.getLastTranscript(), 'keep me');
  assert.deepEqual(h.events.pasted, ['keep me']);
});

test('recorder start and stop failures do not erase previous recovery', async (t) => {
  const h = await harness(t);
  await h.record('keep me');
  const start = h.options.startRecorder;
  h.options.startRecorder = async () => { throw new Error('start failed'); };
  await h.engine.toggle();
  assert.equal(h.engine.getLastTranscript(), 'keep me');
  h.options.startRecorder = start;
  h.session.stop = async () => { throw new Error('stop failed'); };
  await h.record('discard me');
  assert.equal(h.engine.getLastTranscript(), 'keep me');
  assert.equal(h.events.errors.length, 2);
});

test('explicit insert uses the same insertion path and retains the value', async (t) => {
  const h = await harness(t);
  await h.record('recover me');
  assert.equal(await h.engine.insertLastTranscript(), 'completed');
  assert.equal(h.engine.getLastTranscript(), 'recover me');
  assert.deepEqual(h.events.pasted, ['recover me', 'recover me']);
  assert.deepEqual(h.events.states.slice(-2), ['inserting', 'idle']);
});

test('explicit Copy writes only on request and retains the value', async (t) => {
  const h = await harness(t);
  let clipboard = 'previous';
  await h.record('copy me');
  assert.equal(clipboard, 'previous');
  assert.equal(await h.engine.copyLastTranscript(async (text) => { clipboard = text; }), 'completed');
  assert.equal(clipboard, 'copy me');
  assert.equal(h.engine.getLastTranscript(), 'copy me');
  assert.equal(h.events.pasted.length, 1);
});

test('Clear neither pastes nor copies and is idempotent', async (t) => {
  const h = await harness(t);
  await h.record('forget me');
  h.engine.clearLastTranscript();
  h.engine.clearLastTranscript();
  assert.equal(h.engine.getLastTranscript(), undefined);
  assert.equal(await h.engine.insertLastTranscript(), 'empty');
  assert.equal(h.events.pasted.length, 1);
});

for (const operation of ['insert', 'copy']) {
  test(`explicit ${operation} failure retains text and releases the action lock`, async (t) => {
    const h = await harness(t);
    await h.record('keep me');
    const fail = async () => { throw new Error('action failed'); };
    h.options.insert = fail;
    await assert.rejects(
      operation === 'insert' ? h.engine.insertLastTranscript() : h.engine.copyLastTranscript(fail),
      /action failed/
    );
    assert.equal(h.engine.getLastTranscript(), 'keep me');
    assert.equal(await h.engine.copyLastTranscript(async () => {}), 'completed');
  });
}

test('recovery is refused, not queued, during recording', async (t) => {
  const h = await harness(t);
  await h.record('saved');
  await h.engine.toggle();
  assert.equal(await h.engine.insertLastTranscript(), 'busy');
  assert.equal(await h.engine.copyLastTranscript(async () => { assert.fail('copy ran'); }), 'busy');
  await h.engine.cancel();
  assert.deepEqual(h.events.pasted, ['saved']);
});

test('recovery is refused while preparing or transcribing', async (t) => {
  const h = await harness(t);
  await h.record('saved');
  const preparation = deferred();
  h.options.prepare = () => preparation.promise;
  const startup = h.engine.toggle();
  assert.equal(await h.engine.insertLastTranscript(), 'busy');
  preparation.resolve();
  await startup;
  const recognition = deferred();
  h.options.transcribe = () => recognition.promise;
  const stopping = h.engine.toggle();
  assert.equal(await h.engine.copyLastTranscript(async () => { assert.fail('copy ran'); }), 'busy');
  recognition.resolve('new text');
  await stopping;
  assert.deepEqual(h.events.pasted, ['saved', 'new text']);
});

for (const operation of ['insert', 'copy']) {
  test(`in-flight ${operation} blocks another recovery and new dictation`, async (t) => {
    const h = await harness(t);
    await h.record('saved');
    const pending = deferred();
    h.options.insert = () => pending.promise;
    const first = operation === 'insert'
      ? h.engine.insertLastTranscript()
      : h.engine.copyLastTranscript(() => pending.promise);
    assert.equal(await h.engine.insertLastTranscript(), 'busy');
    assert.equal(await h.engine.copyLastTranscript(async () => { assert.fail('copy ran'); }), 'busy');
    await h.engine.toggle();
    assert.equal(h.events.starts, 1);
    pending.resolve();
    assert.equal(await first, 'completed');
  });
}

test('automatic insertion shares the recovery lock', async (t) => {
  const h = await harness(t);
  const entered = deferred();
  const pending = deferred();
  h.options.insert = () => { entered.resolve(); return pending.promise; };
  await h.engine.toggle();
  const stopping = h.engine.toggle();
  await entered.promise;
  assert.equal(h.engine.getLastTranscript(), 'first transcript');
  assert.equal(await h.engine.insertLastTranscript(), 'busy');
  assert.equal(await h.engine.copyLastTranscript(async () => { assert.fail('copy ran'); }), 'busy');
  pending.resolve();
  await stopping;
});

test('Clear during an already-started action is not undone when it finishes', async (t) => {
  const h = await harness(t);
  await h.record('saved');
  const pending = deferred();
  const copying = h.engine.copyLastTranscript(() => pending.promise);
  h.engine.clearLastTranscript();
  pending.resolve();
  assert.equal(await copying, 'completed');
  assert.equal(h.engine.getLastTranscript(), undefined);
});

test('dispose clears recovery and prevents subsequent actions or recording', async (t) => {
  const h = await harness(t);
  await h.record('saved');
  h.engine.dispose();
  h.engine.dispose();
  assert.equal(h.engine.getLastTranscript(), undefined);
  assert.equal(await h.engine.insertLastTranscript(), 'disposed');
  assert.equal(await h.engine.copyLastTranscript(async () => { assert.fail('copy ran'); }), 'disposed');
  await h.engine.toggle();
  assert.equal(h.events.starts, 1);
});

test('late transcription after dispose does not repopulate recovery or paste', async (t) => {
  const h = await harness(t);
  await h.record('saved');
  const entered = deferred();
  const pending = deferred();
  h.options.transcribe = () => { entered.resolve(); return pending.promise; };
  await h.engine.toggle();
  const stopping = h.engine.toggle();
  await entered.promise;
  h.engine.dispose();
  const states = h.events.states.length;
  pending.resolve('must not appear');
  await stopping;
  assert.equal(h.engine.getLastTranscript(), undefined);
  assert.deepEqual(h.events.pasted, ['saved']);
  assert.equal(h.events.states.length, states);
  await assert.rejects(fs.access(h.outputPath), { code: 'ENOENT' });
});

test('dispose while preparation is pending does not open the recorder', async (t) => {
  const h = await harness(t);
  const pending = deferred();
  h.options.prepare = () => pending.promise;
  const startup = h.engine.toggle();
  h.engine.dispose();
  pending.resolve();
  await startup;
  assert.equal(h.events.starts, 0);
});

test('dispose while recorder startup is pending cancels the returned session', async (t) => {
  const h = await harness(t);
  const entered = deferred();
  const pending = deferred();
  h.options.startRecorder = () => { entered.resolve(); return pending.promise; };
  const startup = h.engine.toggle();
  await entered.promise;
  h.engine.dispose();
  pending.resolve(h.session);
  await startup;
  assert.equal(h.events.cancels, 1);
  assert.equal(h.engine.getLastTranscript(), undefined);
});

test('new engine/window does not inherit another engine transcript', async (t) => {
  const first = await harness(t);
  const second = await harness(t);
  await first.record('only in first');
  assert.equal(second.engine.getLastTranscript(), undefined);
});

test('duplicate Stop while transcription is pending inserts once', async (t) => {
  const h = await harness(t);
  const pending = deferred();
  h.options.transcribe = () => pending.promise;
  await h.engine.toggle();
  const stopping = h.engine.toggle();
  await h.engine.toggle();
  pending.resolve('once');
  await stopping;
  assert.deepEqual(h.events.pasted, ['once']);
  assert.equal(h.events.stops, 1);
});

test('an insertion-state callback error cannot erase the transcript or trap the lock', async (t) => {
  const h = await harness(t);
  h.options.onStateChanged = (state) => { if (state === 'inserting') throw new Error('UI failed'); };
  await h.record('saved before state callback');
  assert.equal(h.engine.getLastTranscript(), 'saved before state callback');
  await assert.rejects(h.engine.insertLastTranscript(), /UI failed/);
  assert.equal(await h.engine.copyLastTranscript(async () => {}), 'completed');
});
