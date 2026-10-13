const assert = require('node:assert/strict');
const test = require('node:test');
const { pairedSummary, pairedGates, PAIRS } = require('./paired-performance.cjs');
function rows() {
  const output = [];
  for (let repeat = 0; repeat < PAIRS; repeat++) for (const policy of ['m1', 'candidate']) {
    const extra = policy === 'candidate' ? 30 : 0;
    output.push({ repeat, policy, seconds: 12, preview: true,
      stopToStubMs: 1500 + repeat * 100 + extra, recorderMs: 70, finalAdapterMs: 1430 + repeat * 100 + extra,
      native: { recorderCpuOneCorePercent: 4, privateCommitBytes: 4000000, callback: { meanMs: .02, p95Ms: .1 },
        uiTick: { p95Ms: 3 }, visualDroppedFrames: 0 } });
  }
  return output;
}
test('adjacent pairing retains all observations and removes shared baseline drift', () => {
  const summary = pairedSummary(rows(), true);
  assert.equal(summary.paired.totalMs.median, 30);
  assert.equal(summary.differences.length, PAIRS);
  assert.ok(pairedGates(summary).every(x => x.pass));
  assert.throws(() => pairedSummary(rows().slice(1), true));
});
test('paired total and UI regression gates reject actual added costs without changing limits', () => {
  const input = rows();
  for (const row of input.filter(x => x.policy === 'candidate')) {
    row.stopToStubMs += 300; row.native.uiTick.p95Ms = 11;
  }
  const gates = pairedGates(pairedSummary(input, true));
  assert.equal(gates.find(x => x.name.includes('Stop-to-stub')).pass, false);
  assert.equal(gates.find(x => x.name.includes('UI tick p95 overhead')).pass, false);
});
