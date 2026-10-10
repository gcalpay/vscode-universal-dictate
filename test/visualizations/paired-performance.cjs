/* M5 confirmation: adjacent counterbalanced pairs. The initial three-sample
 * matrix is retained as exploratory evidence, including every failed run.
 * Production code/settings are unchanged. No microphone or application input.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pcmFrom, wav, stats, runCase } = require('./performance.cjs');
const { WhisperRuntime } = require('../../dist/core/whisper');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const STYLES = ['off', 'waveform', 'logFrequencyPowerSpectrogram', 'circularSpectrum'];
const PAIRS = 10;

function pairedSummary(runs, preview) {
  const short = runs.filter(r => r.seconds === 12 && r.preview === preview);
  const differences = [];
  for (let repeat = 0; repeat < PAIRS; repeat++) {
    const before = short.find(r => r.policy === 'm1' && r.repeat === repeat);
    const after = short.find(r => r.policy === 'candidate' && r.repeat === repeat);
    assert.ok(before && after, 'incomplete pair; no dropping or imputing failed observations');
    differences.push({
      totalMs: after.stopToStubMs - before.stopToStubMs,
      recorderMs: after.recorderMs - before.recorderMs,
      finalMs: after.finalAdapterMs - before.finalAdapterMs,
      cpuPoints: after.native.recorderCpuOneCorePercent - before.native.recorderCpuOneCorePercent,
      privateBytes: after.native.privateCommitBytes - before.native.privateCommitBytes,
      callbackMeanMs: after.native.callback.meanMs - before.native.callback.meanMs,
      uiP95Ms: after.native.uiTick.p95Ms - before.native.uiTick.p95Ms
    });
  }
  const baseline = short.filter(r => r.policy === 'm1');
  const candidate = short.filter(r => r.policy === 'candidate');
  return { preview, pairs: PAIRS, differences,
    paired: Object.fromEntries(Object.keys(differences[0]).map(key => [key, stats(differences.map(r => r[key]))])),
    baselineTotalMs: stats(baseline.map(r => r.stopToStubMs)),
    candidateTotalMs: stats(candidate.map(r => r.stopToStubMs)),
    candidateCpuPoints: stats(candidate.map(r => r.native.recorderCpuOneCorePercent)),
    candidatePrivateBytes: stats(candidate.map(r => r.native.privateCommitBytes)),
    callbackP95Ms: stats(candidate.map(r => r.native.callback.p95Ms)),
    uiP95Ms: stats(candidate.map(r => r.native.uiTick.p95Ms)),
    baselineUiP95Ms: stats(baseline.map(r => r.native.uiTick.p95Ms)),
    visualDroppedFrames: candidate.reduce((sum, r) => sum + r.native.visualDroppedFrames, 0)
  };
}
function pairedGates(summary) {
  const gate = (name, actual, maximum) => ({ preview: summary.preview, name, actual, maximum, pass: actual <= maximum });
  return [
    gate('median paired Stop-to-stub overhead ms', summary.paired.totalMs.median, Math.max(150, .10 * summary.baselineTotalMs.median)),
    gate('median paired callback mean overhead ms', summary.paired.callbackMeanMs.median, .25),
    gate('callback p95 maximum ms', summary.callbackP95Ms.max, 2),
    gate('median per-run UI tick p95 ms', summary.uiP95Ms.median, 25),
    gate('median paired UI tick p95 overhead ms', summary.paired.uiP95Ms.median, 5),
    gate('median paired recorder CPU percentage-point overhead', summary.paired.cpuPoints.median, 5),
    gate('median paired private commit overhead bytes', summary.paired.privateBytes.median, 16 * 1024 * 1024),
    gate('visual drops', summary.visualDroppedFrames, 0)
  ];
}
async function main() {
  const [baseline, candidate, server, model, sourceFixture, output] = process.argv.slice(2);
  const style = process.env.M5_STYLE;
  assert.ok(baseline && candidate && server && model && sourceFixture && output);
  assert.ok(STYLES.includes(style)); assert.equal(process.platform, 'win32');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-m5-paired-'));
  const fixture = path.join(root, 'fixture.wav'), longFixture = path.join(root, 'long.wav');
  const pcm = pcmFrom(sourceFixture); assert.ok(pcm.length >= 48 * 32000);
  fs.writeFileSync(fixture, wav(pcm.subarray(0, 12 * 32000)));
  // Unlike the exploratory stress clip, this has no artificial twelve-second splice.
  fs.writeFileSync(longFixture, wav(pcm.subarray(0, 48 * 32000)));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.copyFileSync(fixture, path.join(path.dirname(path.resolve(output)), 'synthetic-12s.wav'));
  fs.copyFileSync(longFixture, path.join(path.dirname(path.resolve(output)), 'synthetic-48s.wav'));
  const result = { kind: 'M5 adjacent paired confirmation; real native capture/paint/IPC, real Whisper, insertion stub',
    protocol: 2, scope: 'three-mode RC4; unchanged budgets; 142 observations and 56 aggregate gates across four jobs', style, pairsPerCondition: PAIRS, sourceSha: process.env.GITHUB_SHA ?? null,
    m1Sha: 'd4c52d2d153545a7a8bef6ed1680261e199ef22b', cpu: os.cpus()[0]?.model,
    logicalProcessors: os.cpus().length, node: process.version, fixtureSha256: hash(fs.readFileSync(fixture)),
    modelSha256: hash(fs.readFileSync(model)), runs: [], summary: [], gates: [], failures: [] };
  const workerEvents = [], runtime = new WhisperRuntime({ serverPath: path.resolve(server),
    cliPath: path.join(path.dirname(path.resolve(server)), 'whisper-cli.exe'), publicPath: root,
    ensureModel: async () => path.resolve(model), onWorkerEvent: event => workerEvents.push(event) });
  const paths = { baseline, candidate, fixture, longFixture };
  async function record(config) {
    try {
      const row = await runCase(runtime, workerEvents, config, paths, root, result.runs.length + result.failures.length);
      if (config.policy === 'candidate' && !['off', 'waveform'].includes(config.style))
        assert.ok(row.native.analyzerStorageBytes > 0, 'selected DSP was not exercised');
      result.runs.push(row);
      console.log(JSON.stringify({ style, policy: config.policy, preview: config.preview, repeat: config.repeat,
        seconds: row.seconds, totalMs: row.stopToStubMs }));
    } catch (error) {
      result.failures.push({ config, error: error.message, native: error.native, stages: error.stages });
      console.log(JSON.stringify({ failed: config, error: error.message }));
    }
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
  }
  try {
    await runtime.warm(); assert.ok((await runtime.transcribe(fixture, 'en')).trim());
    const reference = style === 'off' ? 'off' : 'waveform';
    for (const preview of style === 'off' ? [false] : [false, true]) {
      for (let repeat = 0; repeat < PAIRS; repeat++) {
        const order = repeat % 2 ? ['candidate', 'm1'] : ['m1', 'candidate'];
        for (const policy of order)
          await record({ policy, style: policy === 'm1' ? reference : style, preview, repeat });
      }
    }
    if (['logFrequencyPowerSpectrogram'].includes(style)) {
      for (const policy of ['m1', 'candidate'])
        await record({ policy, style: policy === 'm1' ? reference : style, preview: true, repeat: 0, seconds: 48 });
    }
    assert.deepEqual(result.failures, [], 'failed runs remain in evidence and fail the gate');
    for (const preview of style === 'off' ? [false] : [false, true]) result.summary.push(pairedSummary(result.runs, preview));
    result.gates = result.summary.flatMap(pairedGates);
    assert.ok(result.gates.every(g => g.pass), 'paired regression budget failed');
    result.status = 'completed';
  } catch (error) { result.status = 'failed'; result.error = error.message; throw error; }
  finally {
    await runtime.shutdown(); fs.writeFileSync(output, JSON.stringify(result, null, 2));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: result.status, style, measurements: result.runs.length, gates: result.gates }));
}
module.exports = { pairedSummary, pairedGates, PAIRS };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
