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

test('1.1.2 waveform geometry is unchanged; only colors are theme-driven', () => {
  const paint = between(source,'void drawEnhancedWaveform(', 'void drawEnhancedVisualization(');
  const themed = `    const auto palette = universal_dictate::colors::waveform(g_overlay.colorTheme);
    const Gdiplus::Color axisColor(palette.axis);
    const Gdiplus::Color envelopeOuterColor(palette.outer);
    const Gdiplus::Color envelopeInnerColor(palette.inner);
    const Gdiplus::Color mainWaveColor(palette.trace);`;
  const original = `    const Gdiplus::Color axisColor(115, 41, 82, 58);
    const Gdiplus::Color envelopeOuterColor(130, 36, 118, 72);
    const Gdiplus::Color envelopeInnerColor(85, 45, 145, 88);
    const Gdiplus::Color mainWaveColor(245, 66, 205, 118);`;
  assert.ok(paint.includes(themed));
  assert.equal(sha(paint.replace(themed,original)), '4347aff27bbc33442db2d862f848b2b63f7d6dcb5cd249cb7bc2555b0881f9e3');
  assert.match(between(source,'void drawEnhancedVisualization(', 'void drawEnhancedOverlay('), /if \(!g_overlay\.visualizer\)[\s\S]*drawEnhancedWaveform\(dc\)/);
});

// Pin the waveform's critical source files to the known working 1.1.2 code.
// Changes to visualization internals must not silently retune the amplitude,
// history, button geometry or preview layout of the accepted waveform.
test('1.2 waveform mapping, history and layouts exactly match working 1.1.2', () => {
  const gitBlob = content => createHash('sha1')
    .update(`blob ${Buffer.byteLength(content, 'utf8')}\0`).update(content).digest('hex');
  const baseline = {
    'native/waveform-level.h': '582fd26544c387f35fa52b74fec1e8cb9215f2bf',
    'native/waveform-history.h': '5489ddceeb3dfcf65fb37f9f00ea58158a939784',
    'native/overlay-layout.h': '3fd73531fc6f42340706ee9086536644b29cf6af',
    'native/preview-layout.h': 'c3e42fb4a9871691c6027f7376238b071b5b4fb7',
  };
  for (const [file, sha] of Object.entries(baseline)) {
    assert.equal(gitBlob(read(file)), sha, `${file} differs from known working 1.1.2`);
  }
  const snapshot = between(source, 'void snapshotEnhancedSignal(', 'void updateOverlayLevel(');
  assert.match(snapshot, /if \(state\.enhancedHistory\.snapshot\(next\)\) g_overlay\.enhancedSignalHistory = next;/);
  assert.doesNotMatch(snapshot, /mediumWaveformDisplayLevel|std::log|std::pow|overlaySize/);
  const capture = between(source, 'void captureCallback(', 'class CaptureDevice');
  assert.match(capture, /enhancedBucket\.push\(samples\[i\]/);
  assert.match(capture, /enhancedHistory\.publish\(\*level\)/);
  const device = between(source, 'class CaptureDevice', 'struct OverlayState');
  assert.match(device, /ma_device_init\(nullptr, &config, &device_\)/);
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
