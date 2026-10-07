/* M5: real-time synthetic PCM -> production native capture/paint/preview IPC ->
 * production engine + recorder adapter + coordinator + real Whisper.
 * No microphone or target application: insertion is a no-op, not a paint measurement.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { DictationEngine } = require('../../dist/core/dictation');
const { CoreRecorderSession } = require('../../dist/core/recorder');
const { PreviewCoordinator } = require('../../dist/core/preview-coordinator');
const { RecorderLines, MAX_PREVIEW_LINE } = require('../../dist/core/preview-recorder');
const { createPreviewAudio } = require('../../dist/core/preview-audio');
const { WhisperRuntime } = require('../../dist/core/whisper');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const STYLES = ['waveform', 'logFrequencyPowerSpectrogram', 'linearFrequencyPowerSpectrogram',
  'constantQPowerSpectrogram', 'circularSpectrum'];

function pcmFrom(file) {
  const raw = fs.readFileSync(file);
  assert.equal(raw.subarray(0, 4).toString(), 'RIFF');
  assert.equal(raw.subarray(8, 12).toString(), 'WAVE');
  let pcm, valid = false;
  for (let i = 12; i + 8 <= raw.length;) {
    const size = raw.readUInt32LE(i + 4), end = i + 8 + size;
    assert.ok(end <= raw.length, 'truncated WAV');
    const tag = raw.subarray(i, i + 4).toString();
    if (tag === 'fmt ') valid = size >= 16 && raw.readUInt16LE(i + 8) === 1 &&
      raw.readUInt16LE(i + 10) === 1 && raw.readUInt32LE(i + 12) === 16000 && raw.readUInt16LE(i + 22) === 16;
    if (tag === 'data') pcm = raw.subarray(i + 8, end);
    i = end + size % 2;
  }
  assert.ok(valid && pcm && pcm.length >= 12 * 32000, 'PCM16 mono 16kHz, at least 12 seconds required');
  return pcm;
}
function wav(pcm) {
  const header = Buffer.from(createPreviewAudio('header', 1, Buffer.alloc(2)).wav.subarray(0, 44));
  header.writeUInt32LE(36 + pcm.length, 4); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function stats(values) {
  assert.ok(values.length && values.every(Number.isFinite), 'nonempty finite observations required');
  const v = [...values].sort((a, b) => a - b), middle = Math.floor(v.length / 2);
  return { n: v.length, min: v[0], median: v.length % 2 ? v[middle] : (v[middle - 1] + v[middle]) / 2, max: v.at(-1) };
}
function deltas(events) {
  assert.deepEqual(events.map(e => e.stage), ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  const t = Object.fromEntries(events.map(e => [e.stage, e.atMs]));
  for (let i = 1; i < events.length; i++) assert.ok(events[i].atMs >= events[i - 1].atMs);
  return { recorderMs: t.T1 - t.T0, previewStopResidualMs: t.T2 - t.T1,
    finalAdapterMs: t.T4 - t.T3, insertStubMs: t.T6 - t.T5, stopToStubMs: t.T6 - t.T0 };
}
async function deadline(promise, milliseconds, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
function summarize(runs) {
  const summary = [];
  for (const row of runs) {
    const key = `${row.policy}/${row.style}/${row.preview}/${row.language}/${row.seconds}`;
    if (summary.some(s => s.key === key)) continue;
    const selected = runs.filter(r => `${r.policy}/${r.style}/${r.preview}/${r.language}/${r.seconds}` === key);
    summary.push({ key, policy: row.policy, style: row.style, preview: row.preview, language: row.language,
      seconds: row.seconds, stopToStubMs: stats(selected.map(r => r.stopToStubMs)),
      recorderMs: stats(selected.map(r => r.recorderMs)), finalAdapterMs: stats(selected.map(r => r.finalAdapterMs)),
      recorderCpuOneCorePercent: stats(selected.map(r => r.native.recorderCpuOneCorePercent)),
      privateCommitBytes: stats(selected.map(r => r.native.privateCommitBytes)),
      callbackMeanMs: stats(selected.map(r => r.native.callback.meanMs)),
      callbackP95Ms: stats(selected.map(r => r.native.callback.p95Ms)),
      uiTickP95Ms: stats(selected.map(r => r.native.uiTick.p95Ms)),
      previewPendingAtStopCount: selected.filter(r => r.previewPendingAtStop).length,
      visualDroppedFrames: selected.reduce((sum, r) => sum + r.native.visualDroppedFrames, 0) });
  }
  return summary;
}
function evaluate(summary) {
  const gates = [];
  for (const row of summary.filter(s => s.policy === 'candidate' && s.language === 'en' && s.seconds === 12)) {
    const baseline = summary.find(s => s.policy === 'm1' && s.preview === row.preview &&
      s.style === (row.style === 'off' ? 'off' : 'waveform') && s.language === 'en' && s.seconds === 12);
    assert.ok(baseline, 'matched frozen M1 reference missing');
    const gate = (name, actual, maximum) => gates.push({ key: row.key, name, actual, maximum, pass: actual <= maximum });
    gate('median Stop-to-stub overhead ms', row.stopToStubMs.median - baseline.stopToStubMs.median,
      Math.max(150, baseline.stopToStubMs.median * .10));
    gate('callback mean overhead ms', row.callbackMeanMs.median - baseline.callbackMeanMs.median, .25);
    gate('callback p95 ms', row.callbackP95Ms.max, 2);
    gate('UI tick p95 ms (50 ms cadence)', row.uiTickP95Ms.max, 25);
    gate('recorder CPU one-core percentage-point overhead', row.recorderCpuOneCorePercent.median - baseline.recorderCpuOneCorePercent.median, 5);
    gate('recorder private commit overhead bytes', row.privateCommitBytes.median - baseline.privateCommitBytes.median, 16 * 1024 * 1024);
    gate('visual drops', row.visualDroppedFrames, 0);
  }
  return gates;
}
async function runCase(runtime, workerEvents, config, paths, root, sequence) {
  const { policy, style, preview, language = 'en', seconds = 12 } = config;
  const file = path.join(root, `recording-${sequence}.wav`), metrics = path.join(root, `metrics-${sequence}.json`);
  const replay = path.resolve(policy === 'm1' ? paths.baseline : paths.candidate);
  const fixture = seconds === 12 ? paths.fixture : paths.longFixture;
  const expected = pcmFrom(fixture), failures = [], events = [], previewTimes = [];
  const startEvent = workerEvents.length, finalPid = runtime.getWorkerStatus().finalPid;
  let resolveEnd, rejectEnd, child, coordinator, engine, pending = false, textHash, insertionCount = 0, inferencePath;
  const replayEnded = new Promise((resolve, reject) => { resolveEnd = resolve; rejectEnd = reject; });
  // Install only for this owned fixture process; no production command-line change.
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = function (executable, args, options) {
    if (path.resolve(executable) !== replay) return originalSpawn.call(this, executable, args, options);
    child = originalSpawn.call(this, executable, [...args, '--allow-disposable-desktop', '--fixture', fixture, '--metrics', metrics], options);
    const lines = new RecorderLines(MAX_PREVIEW_LINE, line => { if (line === 'REPLAY_END') resolveEnd(); }, () => rejectEnd(new Error('replay observer overflow')));
    child.stdout.on('data', chunk => lines.push(chunk.toString()));
    child.on('error', rejectEnd);
    child.on('close', code => { if (code !== 0) rejectEnd(new Error(`native replay closed ${code}`)); });
    return child;
  };
  replayEnded.catch(() => undefined);
  try {
    engine = new DictationEngine({ prepare: async () => {}, warm: () => runtime.warm(),
      startRecorder: (onLevel, signal) => CoreRecorderSession.start({ recorderPath: replay, outputPath: file, signal,
        showOverlay: style !== 'off', overlayStyle: 'enhanced', overlaySize: 'medium', waveformTimeSpanSeconds: 20,
        enhancedOverlayVisualization: style === 'off' ? 'waveform' : style,
        previewSessionId: preview ? `m5-${sequence}` : undefined }, onLevel),
      startPreview: preview ? (session, signal) => {
        coordinator = new PreviewCoordinator({ sessionId: session.previewSessionId, language,
          acquire: s => session.acquirePreview(s),
          decode: async (audio, lang, s) => {
            const start = performance.now(); pending = true;
            try { return await runtime.preview(audio, lang, s); }
            finally { pending = false; previewTimes.push(performance.now() - start); }
          }, onPreview: update => { if (!signal.aborted) session.showPreview(update); },
          onFailure: reason => failures.push(`preview-${reason}`) });
        const stop = () => Promise.all([coordinator.stop(), runtime.stopPreview()]).then(() => undefined);
        const abort = () => { void stop().catch(() => {}); };
        signal.addEventListener('abort', abort, { once: true }); coordinator.start();
        return { pause: () => coordinator.pause(), resume: () => coordinator.resume(),
          stop: () => { signal.removeEventListener('abort', abort); return stop(); } };
      } : undefined,
      transcribe: async audioPath => {
        assert.ok(pcmFrom(audioPath).equals(expected), 'visualization modified captured PCM');
        return runtime.transcribe(audioPath, language, value => { inferencePath = value; });
      }, insert: async text => { assert.ok(text.trim()); textHash = hash(text); insertionCount++; },
      onLatencyEvent: event => events.push(event), onError: () => failures.push('engine-failure') });
    await deadline(engine.toggle(), 15000, 'recorder startup');
    await deadline(replayEnded, (seconds + 15) * 1000, 'real-time replay');
    const previewPendingAtStop = pending;
    await deadline(engine.toggle(), 30000, 'finalization');
    assert.deepEqual(failures, []); assert.equal(insertionCount, 1); assert.equal(inferencePath, 'server');
    assert.equal(runtime.getWorkerStatus().finalPid, finalPid, 'final worker evicted');
    assert.equal(runtime.getWorkerStatus().previewPid, undefined, 'preview worker leaked');
    assert.equal(runtime.getWorkerStatus().previewDisabled, false);
    const currentEvents = workerEvents.slice(startEvent);
    if (preview) {
      assert.ok(previewTimes.length >= 2, 'real preview workload absent');
      const exit = currentEvents.filter(e => e.role === 'preview' && e.kind === 'exit').at(-1);
      const request = currentEvents.find(e => e.role === 'final' && e.kind === 'request');
      assert.ok(exit && request && exit.atMs <= request.atMs, 'final dispatch raced preview exit');
    } else assert.ok(!currentEvents.some(e => e.role === 'preview'), 'Off started a preview worker');
    const native = JSON.parse(fs.readFileSync(metrics));
    assert.equal(native.completedReplay, true); assert.equal(native.fixtureFrames * 2, expected.length);
    assert.equal(native.callback.samples, Math.ceil(expected.length / 320));
    assert.equal(native.visualDroppedFrames, 0);
    if (style === 'waveform' || style === 'off') assert.equal(native.analyzerStorageBytes, 0);
    return { ...config, language, seconds, previewPendingAtStop, finalTextSha256: textHash,
      pcmSha256: hash(expected), previewDecodeMs: previewTimes, ...deltas(events), native };
  } finally {
    childProcess.spawn = originalSpawn;
    engine?.dispose();
    await runtime.stopPreview();
    if (child && child.exitCode === null && child.signalCode === null) {
      child.stdin.end('CANCEL\n');
      await deadline(new Promise(resolve => child.once('close', resolve)), 5000, 'fixture cleanup').catch(() => child.kill());
    }
  }
}
async function main() {
  const [baseline, candidate, server, model, sourceFixture, output] = process.argv.slice(2);
  assert.ok(baseline && candidate && server && model && sourceFixture && output, 'six paths required');
  assert.equal(process.platform, 'win32');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-m5-'));
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  const fixture = path.join(root, 'fixture.wav'), longFixture = path.join(root, 'long.wav');
  const shortPcm = pcmFrom(sourceFixture).subarray(0, 12 * 32000);
  fs.writeFileSync(fixture, wav(shortPcm)); fs.writeFileSync(longFixture, wav(Buffer.concat(Array(4).fill(shortPcm))));
  // Store the exact synthetic input used, never a user recording.
  fs.copyFileSync(fixture, path.join(path.dirname(path.resolve(output)), 'synthetic-12s.wav'));
  const result = { kind: 'M5 real-time synthetic capture and actual Win32 rendering with real Whisper; insertion stub',
    sourceSha: process.env.GITHUB_SHA ?? null, m1Sha: 'd4c52d2d153545a7a8bef6ed1680261e199ef22b',
    cpu: os.cpus()[0]?.model, logicalProcessors: os.cpus().length, platform: process.platform, node: process.version,
    fixtureSha256: hash(fs.readFileSync(fixture)), modelSha256: hash(fs.readFileSync(model)),
    runs: [], summary: [], gates: [] };
  const workerEvents = [], runtime = new WhisperRuntime({ serverPath: path.resolve(server),
    cliPath: path.join(path.dirname(path.resolve(server)), 'whisper-cli.exe'), publicPath: root,
    ensureModel: async () => path.resolve(model), onWorkerEvent: event => workerEvents.push(event) });
  try {
    await runtime.warm(); assert.ok((await runtime.transcribe(fixture, 'en')).trim());
    const configurations = [{ policy: 'm1', style: 'off', preview: false }, { policy: 'candidate', style: 'off', preview: false }];
    for (const preview of [false, true]) {
      configurations.push({ policy: 'm1', style: 'waveform', preview });
      for (const style of STYLES) configurations.push({ policy: 'candidate', style, preview });
    }
    for (let repeat = 0; repeat < 3; repeat++) {
      const ordered = repeat % 2 ? [...configurations].reverse() : configurations;
      for (const config of ordered) {
        const row = await runCase(runtime, workerEvents, { ...config, repeat }, { baseline, candidate, fixture, longFixture }, root, result.runs.length);
        result.runs.push(row); fs.writeFileSync(output, JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ policy: row.policy, style: row.style, preview: row.preview, repeat,
          totalMs: row.stopToStubMs, cpu: row.native.recorderCpuOneCorePercent }));
      }
    }
    // Additional longer recordings fill/wrap the longest (20 s) history without
    // inventing an audio backlog. Not mixed into the 12 s latency medians.
    for (const style of ['linearFrequencyPowerSpectrogram', 'constantQPowerSpectrogram']) {
      result.runs.push(await runCase(runtime, workerEvents, { policy: 'candidate', style, preview: true, repeat: 0, seconds: 48 },
        { baseline, candidate, fixture, longFixture }, root, result.runs.length));
    }
    result.summary = summarize(result.runs); result.gates = evaluate(result.summary);
    assert.ok(result.gates.length && result.gates.every(g => g.pass), 'M5 regression budget failed; inspect raw observations');
    result.status = 'completed';
  } catch (error) {
    result.status = 'failed'; result.error = error.message;
    if (result.runs.length) result.summary = summarize(result.runs);
    throw error;
  } finally {
    await runtime.shutdown(); fs.writeFileSync(output, JSON.stringify(result, null, 2));
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: result.status, runs: result.runs.length, gates: result.gates }));
}
module.exports = { pcmFrom, wav, stats, deltas, summarize, evaluate };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
