const assert = require('node:assert/strict');
const test = require('node:test');
const { DictationEngine } = require('../dist/core/dictation');

class Session {
  constructor(path = 'latency-fixture.wav') { this.outputPath = path; }
  onAction() {}
  onFailure() {}
  async stop() { return this.outputPath; }
  async cancel() {}
}

function harness(onLatencyEvent) {
  const events = [];
  let inserted = false;
  const engine = new DictationEngine({
    prepare: async () => {},
    warm: async () => {},
    startRecorder: async () => new Session(),
    transcribe: async () => 'final transcript',
    insert: async () => { inserted = true; },
    onLatencyEvent: onLatencyEvent ?? (event => events.push(event))
  });
  return { engine, events, get inserted() { return inserted; } };
}

test('successful Stop -> Insert emits T0..T6 once in monotonic order', async () => {
  const h = harness();
  await h.engine.toggle();
  await h.engine.toggle();
  assert.equal(h.inserted, true);
  assert.deepEqual(h.events.map(event => event.stage), ['T0','T1','T2','T3','T4','T5','T6']);
  assert.ok(h.events.every(event => event.operationId === h.events[0].operationId));
  for (let i = 1; i < h.events.length; i++) assert.ok(h.events[i].atMs >= h.events[i - 1].atMs);
  h.engine.dispose();
});

test('latency observer failure cannot block transcription or insertion', async () => {
  const h = harness(() => { throw new Error('diagnostic observer failed'); });
  await h.engine.toggle();
  await h.engine.toggle();
  assert.equal(h.inserted, true);
  h.engine.dispose();
});
