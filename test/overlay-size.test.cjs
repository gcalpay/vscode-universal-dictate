const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_OVERLAY_SIZE,
  normalizeOverlaySize
} = require('../dist/core/overlay-size.js');
const { buildRecorderArguments } = require('../dist/core/recorder.js');

test('overlay size normalization keeps supported values', () => {
  assert.equal(normalizeOverlaySize('small'), 'small');
  assert.equal(normalizeOverlaySize('medium'), 'medium');
  assert.equal(normalizeOverlaySize('large'), 'large');
});

test('overlay size normalization falls back to medium', () => {
  assert.equal(DEFAULT_OVERLAY_SIZE, 'medium');
  assert.equal(normalizeOverlaySize(undefined), 'medium');
  assert.equal(normalizeOverlaySize('unexpected'), 'medium');
  assert.equal(normalizeOverlaySize(1), 'medium');
});

test('enhanced recorder arguments propagate overlay size', () => {
  assert.deepEqual(
    buildRecorderArguments({
      recorderPath: 'recorder.exe',
      outputPath: 'sample.wav',
      showOverlay: true,
      overlayStyle: 'enhanced',
      waveformTimeSpanSeconds: 3,
      overlaySize: 'small'
    }),
    [
      '--output',
      'sample.wav',
      '--enhanced-overlay',
      '--waveform-timespan-ms',
      '3000',
      '--overlay-size',
      'small', '--button-style', 'text'
    ]
  );
});

test('enhanced recorder arguments validate invalid size and span', () => {
  assert.deepEqual(
    buildRecorderArguments({
      recorderPath: 'recorder.exe',
      outputPath: 'sample.wav',
      showOverlay: true,
      overlayStyle: 'enhanced',
      waveformTimeSpanSeconds: Number.POSITIVE_INFINITY,
      overlaySize: 'invalid'
    }),
    [
      '--output',
      'sample.wav',
      '--enhanced-overlay',
      '--waveform-timespan-ms',
      '10000',
      '--overlay-size',
      'medium', '--button-style', 'text'
    ]
  );
});

test('disabled native overlay does not receive enhanced layout arguments', () => {
  assert.deepEqual(
    buildRecorderArguments({
      recorderPath: 'recorder.exe',
      outputPath: 'sample.wav',
      showOverlay: false,
      overlayStyle: 'enhanced',
      waveformTimeSpanSeconds: 20,
      overlaySize: 'medium'
    }),
    ['--output', 'sample.wav', '--no-overlay']
  );
});
