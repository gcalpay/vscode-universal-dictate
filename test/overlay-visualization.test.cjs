const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../package.json');
const { OVERLAY_VISUALIZATIONS, OVERLAY_VISUALIZATION_LABELS, DEFAULT_OVERLAY_VISUALIZATION,
  normalizeOverlayVisualization } = require('../dist/core/overlay-visualization');
const { buildRecorderArguments } = require('../dist/core/recorder');
const setting = manifest.contributes.configuration.properties['universalDictate.enhancedOverlayVisualization'];

test('five agreed visualization choices have matching metadata and Waveform default', () => {
  assert.deepEqual(OVERLAY_VISUALIZATIONS, ['waveform', 'logFrequencyPowerSpectrogram',
    'linearFrequencyPowerSpectrogram', 'constantQPowerSpectrogram', 'circularSpectrum']);
  assert.deepEqual(setting.enum, OVERLAY_VISUALIZATIONS);
  assert.deepEqual(setting.enumItemLabels, OVERLAY_VISUALIZATIONS.map(mode => OVERLAY_VISUALIZATION_LABELS[mode]));
  assert.deepEqual(setting.enumItemLabels, ['Waveform / Oscillogram', 'Log-Frequency Power Spectrogram',
    'Linear-Frequency Power Spectrogram', 'Constant-Q Power Spectrogram', 'Circular Spectrum']);
  assert.equal(setting.enumDescriptions.length, 5);
  assert.equal(setting.default, DEFAULT_OVERLAY_VISUALIZATION);
  assert.equal(DEFAULT_OVERLAY_VISUALIZATION, 'waveform');
  assert.match(setting.description, /next dictation session/);
  assert.match(setting.description, /status.bar/i);
});

for (const mode of OVERLAY_VISUALIZATIONS) {
  test(`${mode}: preference normalization is lossless and reaches enhanced recorder`, () => {
    assert.equal(normalizeOverlayVisualization(mode), mode);
    const options = { recorderPath: 'r.exe', outputPath: 'a.wav', overlayStyle: 'enhanced',
      waveformTimeSpanSeconds: 20, overlaySize: 'small', enhancedOverlayVisualization: mode };
    const args = buildRecorderArguments(options);
    assert.equal(args[args.indexOf('--overlay-visualization')+1], mode);
    assert.equal(args[args.indexOf('--waveform-timespan-ms')+1], '20000');
    assert.equal(args[args.indexOf('--overlay-size')+1], 'small');
    assert.equal(options.enhancedOverlayVisualization, mode);
  });
  for (const showOverlay of [false, true]) test(`${mode}: ${showOverlay ? 'compact' : 'disabled'} overlay creates no spectral mode`, () => {
    const args = buildRecorderArguments({ recorderPath:'r.exe', outputPath:'a.wav', showOverlay,
      overlayStyle: showOverlay ? 'compact' : 'enhanced', enhancedOverlayVisualization: mode });
    assert.equal(args.includes('--overlay-visualization'), false);
    assert.equal(args.includes('--enhanced-overlay'), false);
    assert.equal(args.includes('--no-overlay'), !showOverlay);
  });
}

test('invalid/missing preference safely falls back rather than enabling another display location', () => {
  for (const value of [undefined, null, '', 'log', 'lowPowerSpectrogram', 'chromagram', 'WAVEFORM', 0, true, {}, ['waveform']]) {
    assert.equal(normalizeOverlayVisualization(value), 'waveform');
    const args = buildRecorderArguments({recorderPath:'r.exe', outputPath:'a.wav', overlayStyle:'enhanced', enhancedOverlayVisualization:value});
    assert.equal(args[args.indexOf('--overlay-visualization')+1], 'waveform');
  }
});

test('display location and all previously saved defaults remain separate', () => {
  const properties = manifest.contributes.configuration.properties;
  assert.deepEqual(properties['universalDictate.visualization'].enum, ['both','enhancedOverlay','statusBar','off']);
  assert.equal(properties['universalDictate.visualization'].default, 'enhancedOverlay');
  assert.equal(properties['universalDictate.waveformTimeSpanSeconds'].default, 10);
  assert.deepEqual(properties['universalDictate.waveformTimeSpanSeconds'].enum, [1,3,5,10,20]);
  assert.equal(properties['universalDictate.livePreview'].default, false);
  assert.equal(properties['universalDictate.overwriteClipboard'].default, false);
  assert.equal(properties['universalDictate.overlaySize'].default, 'medium');
});
