const assert = require('node:assert/strict');
const test = require('node:test');
const { stats, deltas, evaluate } = require('./performance.cjs');

test('summary uses medians without changing observations or estimating tail percentiles from three runs', () => {
  const input = [12, 4, 8];
  assert.deepEqual(stats(input), { n: 3, min: 4, median: 8, max: 12 });
  assert.deepEqual(input, [12, 4, 8]);
  assert.equal(stats([1, 4]).median, 2.5);
  assert.throws(() => stats([])); assert.throws(() => stats([NaN]));
});
test('timing stages reject missing, duplicated or nonmonotonic observations', () => {
  const events = Array.from({ length: 7 }, (_, i) => ({ stage: `T${i}`, atMs: i * 10 }));
  assert.equal(deltas(events).stopToStubMs, 60);
  assert.throws(() => deltas(events.slice(1)));
  assert.throws(() => deltas([...events, events[6]]));
  assert.throws(() => deltas(events.map((e, i) => i === 3 ? { ...e, atMs: 0 } : e)));
});
test('performance budgets fail closed and compare with the matching frozen M1 display condition', () => {
  const common = { preview: false, language: 'en', seconds: 12,
    stopToStubMs: stats([1400]), callbackMeanMs: stats([.03]), callbackP95Ms: stats([.2]),
    uiTickP95Ms: stats([3]), recorderCpuOneCorePercent: stats([2]), privateCommitBytes: stats([10000000]), visualDroppedFrames: 0 };
  const baseline = { ...common, policy: 'm1', style: 'waveform' };
  const candidate = { ...common, policy: 'candidate', style: 'logFrequencyPowerSpectrogram', key: 'log' };
  assert.ok(evaluate([baseline, candidate]).every(g => g.pass));
  assert.throws(() => evaluate([candidate]));
  for (const change of [{ stopToStubMs: stats([1600]) }, { callbackMeanMs: stats([.4]) },
    { callbackP95Ms: stats([3]) }, { uiTickP95Ms: stats([26]) },
    { recorderCpuOneCorePercent: stats([8]) }, { privateCommitBytes: stats([30000000]) }, { visualDroppedFrames: 1 }]) {
    assert.ok(evaluate([baseline, { ...candidate, ...change }]).some(g => !g.pass));
  }
});
