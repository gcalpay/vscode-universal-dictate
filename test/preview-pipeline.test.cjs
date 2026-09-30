const assert = require('node:assert/strict');
const test = require('node:test');
const { createPreviewAudio, validatePreviewAudio, PREVIEW_WINDOW_FRAMES } = require('../dist/core/preview-audio');
const { PreviewCoordinator } = require('../dist/core/preview-coordinator');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Clock {
  time = 0;
  next = 0;
  tasks = new Map();
  now() { return this.time; }
  set(ms, run) { const id = ++this.next; this.tasks.set(id, { at: this.time + ms, run }); return id; }
  clear(id) { this.tasks.delete(id); }
  advance(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.tasks.delete(next[0]); this.time = next[1].at; next[1].run();
    }
    this.time = end;
  }
}

async function flush() {
  // Let the finite fake adapter promise chain settle; no wall-clock sleeps.
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

function setup(overrides = {}) {
  const clock = new Clock();
  const updates = [], errors = [], acquired = [], decoded = [], released = [];
  let frames = 0;
  const options = {
    sessionId: 'session-a', language: 'auto', clock,
    acquire: async (signal) => {
      frames += 32_000;
      acquired.push({ signal, end: frames, at: clock.now() });
      const audio = createPreviewAudio('session-a', frames, Buffer.alloc(Math.min(frames, PREVIEW_WINDOW_FRAMES) * 2));
      return { audio, release: async () => { released.push(audio.endFrame); } };
    },
    decode: async (audio, language, signal) => { decoded.push({ audio, language, signal }); return 'provisional words'; },
    onPreview: (update) => { updates.push(update); },
    onFailure: (failure) => { errors.push(failure); },
    ...overrides,
  };
  const coordinator = new PreviewCoordinator(options);
  return { coordinator, options, clock, updates, errors, acquired, decoded, released };
}

async function tick(h, ms = 2_000) { h.clock.advance(ms); await flush(); }

test('WAV has finalized mono PCM16 16 kHz sizes and a private copy', () => {
  const backing = Buffer.from([7, 8, 0, 128, 255, 127, 9, 10]);
  const source = backing.subarray(2, 6);
  const audio = createPreviewAudio('id', 100, source);
  assert.deepEqual([audio.startFrame, audio.endFrame], [98, 100]);
  assert.equal(audio.wav.length, 48);
  assert.equal(audio.wav.readUInt32LE(4), 40);
  assert.equal(audio.wav.readUInt32LE(40), 4);
  assert.equal(audio.wav.readUInt32LE(24), 16_000);
  assert.deepEqual([...audio.wav.subarray(44)], [0, 128, 255, 127]);
  source.fill(5);
  assert.deepEqual([...audio.wav.subarray(44)], [0, 128, 255, 127]);
  assert.ok(Object.isFrozen(audio));
  validatePreviewAudio(audio, 'id');
});

test('eight-second memory cap is exact and does not cap total recording position', () => {
  const audio = createPreviewAudio('long-recording', 16_000 * 60 * 60, Buffer.alloc(PREVIEW_WINDOW_FRAMES * 2));
  assert.equal(audio.wav.length, 256_044);
  validatePreviewAudio(audio, 'long-recording');
});

for (const [name, end, length] of [
  ['empty', 10, 0], ['odd bytes', 10, 3], ['oversized', 999999, 256002],
  ['negative end', -1, 2], ['fractional end', 1.5, 2], ['unsafe end', Number.MAX_SAFE_INTEGER + 1, 2],
  ['nonfinite end', Infinity, 2], ['more frames than captured', 1, 4],
]) {
  test(`reject ${name} PCM snapshot`, () => {
    assert.throws(() => createPreviewAudio('a', end, Buffer.alloc(length)));
  });
}

test('reject missing or oversized session identity', () => {
  for (const id of ['', 'x'.repeat(129)]) assert.throws(() => createPreviewAudio(id, 1, Buffer.alloc(2)));
});

test('reject wrong ownership, metadata, missing/extra data and changed canonical header', () => {
  const good = createPreviewAudio('a', 10, Buffer.alloc(20));
  assert.throws(() => validatePreviewAudio(good, 'b'));
  assert.throws(() => validatePreviewAudio({ ...good, startFrame: -1 }, 'a'));
  assert.throws(() => validatePreviewAudio({ ...good, startFrame: 0.5 }, 'a'));
  assert.throws(() => validatePreviewAudio({ ...good, wav: good.wav.subarray(0, 43) }, 'a'));
  assert.throws(() => validatePreviewAudio({ ...good, wav: Buffer.concat([good.wav, Buffer.alloc(2)]) }, 'a'));
  for (const offset of [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40]) {
    const wav = Buffer.from(good.wav); wav[offset] ^= 1;
    assert.throws(() => validatePreviewAudio({ ...good, wav }, 'a'), `offset ${offset}`);
  }
});

test('first preview waits for the interval; construction does not start any work', async () => {
  const h = setup();
  await tick(h, 10_000); assert.equal(h.acquired.length, 0);
  h.coordinator.start();
  await tick(h, 1999); assert.equal(h.acquired.length, 0);
  await tick(h, 1); assert.equal(h.updates.length, 1);
  assert.deepEqual(h.released, [32_000]);
  await h.coordinator.stop(); assert.equal(h.clock.tasks.size, 0);
});

test('session configuration is snapshotted and updates carry session plus monotonic revision', async () => {
  const h = setup(); h.options.language = 'de'; h.options.sessionId = 'wrong';
  h.coordinator.start(); await tick(h); await tick(h);
  assert.deepEqual(h.decoded.map(x => x.language), ['auto', 'auto']);
  assert.deepEqual(h.updates.map(x => [x.sessionId, x.revision]), [['session-a', 1], ['session-a', 2]]);
  assert.ok(Object.isFrozen(h.updates[0])); await h.coordinator.stop();
});

test('slow decode skips missed ticks without queueing old snapshots', async () => {
  const pending = deferred(); const h = setup({ decode: () => pending.promise });
  h.coordinator.start(); await tick(h); await tick(h, 5_000);
  assert.equal(h.acquired.length, 1);
  pending.resolve('words'); await flush();
  await tick(h, 999); assert.equal(h.acquired.length, 1);
  await tick(h, 1); assert.equal(h.acquired.length, 2);
  assert.deepEqual(h.acquired.map(x => x.at), [2000, 8000]); await h.coordinator.stop();
});

test('asynchronous resource cleanup stays in the one-operation slot', async () => {
  const cleanup = deferred(); let calls = 0;
  const h = setup({ acquire: async () => {
    calls++; return { audio: createPreviewAudio('session-a', 10, Buffer.alloc(20)), release: () => cleanup.promise };
  } });
  h.coordinator.start(); await tick(h); await tick(h, 3_000);
  assert.equal(calls, 1);
  const stopped = h.coordinator.stop(); let settled = false;
  stopped.then(() => { settled = true; }); await flush(); assert.equal(settled, false);
  cleanup.resolve(); await stopped; assert.equal(h.clock.tasks.size, 0);
});

test('Stop before the first tick prevents all acquisition and decoding', async () => {
  const h = setup(); h.coordinator.start(); await h.coordinator.stop(); await tick(h, 100_000);
  assert.equal(h.acquired.length, 0); assert.equal(h.updates.length, 0);
});

test('Stop between launch and its microtask prevents acquisition', async () => {
  const h = setup(); h.coordinator.start(); h.clock.advance(2000);
  await h.coordinator.stop(); assert.equal(h.acquired.length, 0);
});

test('Stop aborts an in-flight decode and rejects its late result without fake settlement', async () => {
  const pending = deferred(); let signal;
  const h = setup({ decode: (_audio, _language, s) => { signal = s; return pending.promise; } });
  h.coordinator.start(); await tick(h);
  const stopped = h.coordinator.stop(); assert.equal(signal.aborted, true);
  let settled = false; stopped.then(() => { settled = true; }); await flush();
  assert.equal(settled, false); assert.equal(h.released.length, 0);
  pending.resolve('obsolete'); await stopped;
  assert.equal(h.updates.length, 0); assert.equal(h.released.length, 1);
  await tick(h, 100_000); assert.equal(h.acquired.length, 1);
});

test('late snapshot after Stop is released, never decoded', async () => {
  const pending = deferred(); let released = 0;
  const h = setup({ acquire: () => pending.promise });
  h.coordinator.start(); await tick(h); const stopped = h.coordinator.stop();
  pending.resolve({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)), release: async () => { released++; } });
  await stopped; assert.equal(released, 1); assert.equal(h.decoded.length, 0);
});

test('duplicate Stop joins the same real pending operation and releases once', async () => {
  const pending = deferred(); const h = setup({ decode: () => pending.promise });
  h.coordinator.start(); await tick(h);
  const a = h.coordinator.stop(), b = h.coordinator.stop(); assert.equal(a, b);
  pending.resolve('obsolete'); await a;
  await h.coordinator.stop(); assert.equal(h.released.length, 1); assert.equal(h.updates.length, 0);
});

test('missing audio is skipped and an unchanged or older end frame is not decoded again', async () => {
  let count = 0, releases = 0;
  const h = setup({ acquire: async () => {
    count++; if (count === 1) return undefined;
    const end = count < 4 ? 10 : 8;
    return { audio: createPreviewAudio('session-a', end, Buffer.alloc(2)), release: async () => { releases++; } };
  } });
  h.coordinator.start(); for (let i = 0; i < 4; i++) await tick(h);
  assert.equal(h.decoded.length, 1); assert.equal(releases, 3); await h.coordinator.stop();
});

test('snapshot errors disable only preview and report a fixed category', async () => {
  const h = setup({ acquire: async () => { throw new Error('private audio path or transcript'); } });
  h.coordinator.start(); await tick(h); await tick(h, 20_000);
  assert.deepEqual(h.errors, ['snapshot']); assert.equal(h.decoded.length, 0); await h.coordinator.stop();
});

test('a snapshot tagged with another session fails closed and is released', async () => {
  let released = 0;
  const h = setup({ acquire: async () => ({ audio: createPreviewAudio('other', 1, Buffer.alloc(2)),
    release: async () => { released++; } }) });
  h.coordinator.start(); await tick(h);
  assert.deepEqual(h.errors, ['invalid-snapshot']); assert.equal(released, 1);
  assert.equal(h.decoded.length, 0); await h.coordinator.stop();
});

test('decode failure disables preview, releases audio, and does not retry', async () => {
  const h = setup({ decode: async () => { throw new Error('backend transcript'); } });
  h.coordinator.start(); await tick(h); await tick(h, 10_000);
  assert.deepEqual(h.errors, ['decode']); assert.equal(h.acquired.length, 1);
  assert.equal(h.released.length, 1); await h.coordinator.stop();
});

test('empty hypotheses produce no display or retention but subsequent updates remain possible', async () => {
  let count = 0; const h = setup({ decode: async () => ++count === 1 ? ' \n\t ' : 'words' });
  h.coordinator.start(); await tick(h); assert.equal(h.updates.length, 0);
  await tick(h); assert.equal(h.updates[0].revision, 1); await h.coordinator.stop();
});

for (const value of [undefined, 'x'.repeat(16_385)]) {
  test(`reject ${typeof value === 'undefined' ? 'non-string' : 'oversized'} preview response`, async () => {
    const h = setup({ decode: async () => value }); h.coordinator.start(); await tick(h);
    assert.deepEqual(h.errors, ['invalid-text']); assert.equal(h.updates.length, 0);
    assert.equal(h.released.length, 1); await h.coordinator.stop();
  });
}

test('renderer exception disables preview without escaping into final dictation', async () => {
  const h = setup({ onPreview: () => { throw new Error('UI error'); } }); h.coordinator.start(); await tick(h);
  assert.deepEqual(h.errors, ['display']); assert.equal(h.released.length, 1); await h.coordinator.stop();
});

test('cleanup failure is reported rather than claiming resource removal succeeded', async () => {
  const h = setup({ acquire: async () => ({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)),
    release: async () => { throw new Error('locked snapshot'); } }) });
  h.coordinator.start(); await tick(h); assert.deepEqual(h.errors, ['cleanup']); await h.coordinator.stop();
});

test('cleanup failure after Stop remains reportable with no late preview', async () => {
  const cleanup = deferred();
  const h = setup({ acquire: async () => ({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)),
    release: () => cleanup.promise }) });
  h.coordinator.start(); await tick(h); const stopped = h.coordinator.stop();
  cleanup.reject(new Error('locked snapshot')); await stopped;
  assert.deepEqual(h.errors, ['cleanup']); assert.equal(h.clock.tasks.size, 0);
});

test('failure callback exceptions cannot cause unhandled rejection or revive timers', async () => {
  const h = setup({ decode: async () => { throw new Error('decoder'); },
    onFailure: () => { throw new Error('diagnostics'); } });
  h.coordinator.start(); await tick(h); await h.coordinator.stop(); assert.equal(h.clock.tasks.size, 0);
});

test('timeout aborts cooperative adapters and releases audio once', async () => {
  const h = setup({ timeoutMs: 500, decode: (_audio, _lang, signal) => new Promise((_ok, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  h.coordinator.start(); await tick(h); await tick(h, 500);
  assert.deepEqual(h.errors, ['timeout']); assert.equal(h.updates.length, 0);
  assert.equal(h.released.length, 1); await h.coordinator.stop();
});

test('timeout cannot pretend an adapter ignoring abort has stopped using audio', async () => {
  const pending = deferred(); const h = setup({ timeoutMs: 500, decode: () => pending.promise });
  h.coordinator.start(); await tick(h); await tick(h, 500);
  assert.deepEqual(h.errors, ['timeout']); assert.equal(h.released.length, 0);
  const stopped = h.coordinator.stop(); pending.resolve('obsolete'); await stopped;
  assert.equal(h.updates.length, 0); assert.equal(h.released.length, 1);
});

test('Stop called inside acquire has the actual active promise and prevents decoding', async () => {
  let h, stopped, released = 0;
  h = setup({ acquire: async () => {
    stopped = h.coordinator.stop();
    return { audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)), release: async () => { released++; } };
  } });
  h.coordinator.start(); await tick(h); await stopped;
  assert.equal(h.decoded.length, 0); assert.equal(released, 1);
});

test('Stop called during display completes only after resource release', async () => {
  const cleanup = deferred(); let h, stopped, settled = false;
  h = setup({ acquire: async () => ({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)), release: () => cleanup.promise }),
    onPreview: () => { stopped = h.coordinator.stop(); stopped.then(() => { settled = true; }); } });
  h.coordinator.start(); await tick(h); assert.equal(settled, false);
  cleanup.resolve(); await stopped; assert.equal(settled, true); assert.equal(h.clock.tasks.size, 0);
});

test('old operation cannot display into a new session', async () => {
  const pending = deferred(); const old = setup({ decode: () => pending.promise });
  old.coordinator.start(); await tick(old); const stopped = old.coordinator.stop();
  const fresh = setup(); fresh.coordinator.start(); await tick(fresh);
  pending.resolve('old words'); await stopped;
  assert.equal(old.updates.length, 0); assert.equal(fresh.updates.length, 1); await fresh.coordinator.stop();
});

test('single-use controller cannot be restarted after stop or failure', async () => {
  const h = setup(); h.coordinator.start(); assert.throws(() => h.coordinator.start());
  await h.coordinator.stop(); assert.throws(() => h.coordinator.start());
  const neverStarted = setup(); await neverStarted.coordinator.stop(); assert.throws(() => neverStarted.coordinator.start());
});

test('invalid session options are rejected without scheduling', () => {
  for (const options of [{ language: '' }, { language: 'en\r\nX' }, { sessionId: '' },
    { intervalMs: 0 }, { intervalMs: NaN }, { intervalMs: Infinity }, { timeoutMs: -1 }, { timeoutMs: 60001 }]) {
    assert.throws(() => setup(options));
  }
});

test('canonical WAV tags are checked byte-exactly, not high-bit-masked ASCII', () => {
  const good = createPreviewAudio('a', 10, Buffer.alloc(20));
  for (const offset of [0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 36, 37, 38, 39]) {
    const wav = Buffer.from(good.wav); wav[offset] |= 0x80;
    assert.throws(() => validatePreviewAudio({ ...good, wav }, 'a'), `offset ${offset}`);
  }
});

test('timeout during acquisition releases a late lease without starting inference', async () => {
  const pending = deferred(); let released = 0;
  const h = setup({ timeoutMs: 500, acquire: () => pending.promise });
  h.coordinator.start(); await tick(h); await tick(h, 500);
  assert.deepEqual(h.errors, ['timeout']);
  pending.resolve({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)), release: async () => { released++; } });
  await h.coordinator.stop(); assert.equal(h.decoded.length, 0); assert.equal(released, 1);
});

test('timeout during cleanup cannot schedule new work until resources are released', async () => {
  const cleanup = deferred();
  const h = setup({ timeoutMs: 500, acquire: async () => ({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)),
    release: () => cleanup.promise }) });
  h.coordinator.start(); await tick(h); await tick(h, 500);
  assert.deepEqual(h.errors, ['timeout']);
  cleanup.resolve(); await h.coordinator.stop(); assert.equal(h.clock.tasks.size, 0);
});

test('an independent cleanup failure is reported even after an earlier decoding failure', async () => {
  const h = setup({ acquire: async () => ({ audio: createPreviewAudio('session-a', 1, Buffer.alloc(2)),
    release: async () => { throw new Error('file still locked'); } }),
    decode: async () => { throw new Error('decoder failure'); } });
  h.coordinator.start(); await tick(h); await h.coordinator.stop();
  assert.deepEqual(h.errors, ['decode', 'cleanup']); assert.equal(h.clock.tasks.size, 0);
});
