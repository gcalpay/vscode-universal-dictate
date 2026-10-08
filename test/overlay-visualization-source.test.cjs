// Source guards complement numerical/behavioral tests. Do not substitute them for Windows CI.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n');
const sha = text => createHash('sha256').update(text).digest('hex');
const source = read('native/record-audio.cpp');
const between = (text, begin, end) => text.slice(text.indexOf(begin),text.indexOf(end));

test('accepted 1.1.0 waveform paint function remains byte-identical after renderer dispatch', () => {
  assert.equal(sha(between(source,'void drawEnhancedWaveform(', 'void drawEnhancedVisualization(')),
    '4347aff27bbc33442db2d862f848b2b63f7d6dcb5cd249cb7bc2555b0881f9e3');
  assert.match(between(source,'void drawEnhancedVisualization(', 'void drawEnhancedOverlay('), /if \(!g_overlay\.visualizer\)[\s\S]*drawEnhancedWaveform\(dc\)/);
});

test('Medium gain is display-only, outside the accepted capture/paint functions', () => {
  const snapshot = between(source, 'void snapshotEnhancedSignal(', 'void updateOverlayLevel(');
  assert.match(snapshot, /overlaySize == OverlaySize::Medium/);
  assert.match(snapshot, /mediumWaveformDisplayLevel\(point\)/);
  assert.match(snapshot, /enhancedHistory\.snapshot\(next\)/);
  assert.doesNotMatch(between(source, 'void captureCallback(', 'class CaptureDevice'), /mediumWaveformDisplayLevel/);
});

test('capture callback only enqueues admitted PCM; transforms are not on the audio callback', () => {
  const callback = between(source, 'void captureCallback(', 'class CaptureDevice');
  assert.ok(callback.indexOf('if (!lease) return;') < callback.indexOf('state->visualizer->push'));
  assert.match(callback, /state->visualizer->push\(static_cast<const std::int16_t\*>\(input\), frameCount\)/);
  assert.doesNotMatch(callback, /\.update\(|->update\(|transform\(|analyze\(|make_unique|lock_guard|sleep_for/);
  assert.match(callback, /ma_encoder_write_pcm_frames\(state->encoder->get\(\), input, frameCount, nullptr\)/);
});

test('disabled/default overlays allocate no analyzer; failed overlay stops spectral acquisition', () => {
  assert.match(source, /if \(overlayEnabled && enhancedOverlay && visualization != universal_dictate::visualization::Mode::Waveform\)/);
  assert.match(source, /if \(!overlayAvailable && visualizer\) visualizer->disable\(\)/);
  assert.match(source, /overlayAvailable && !captureState\.gate\.isBlocked\(\)/);
  const create = between(source, 'bool createOverlay(', 'void destroyOverlay(');
  assert.match(create, /g_overlay\.visualizer = enhanced \? visualizer : nullptr/);
  assert.match(between(source,'void destroyOverlay(', 'void pumpOverlayMessages('), /g_overlay\.visualizer = nullptr/);
});

test('TypeScript and native identifiers are compatible, with no fake chromagram or low-power alias', () => {
  const {OVERLAY_VISUALIZATIONS} = require('../dist/core/overlay-visualization');
  const native = read('native/overlay-visualization.h');
  for (const value of OVERLAY_VISUALIZATIONS.filter(mode=>mode!=='waveform')) assert.ok(native.includes(`"${value}"`));
  assert.match(native, /return Mode::Waveform/);
  assert.doesNotMatch(native, /chromagram|lowPowerSpectrogram/);
});
