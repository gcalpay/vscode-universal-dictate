const assert = require('node:assert/strict');
const test = require('node:test');
const {OVERLAY_COLORS, DEFAULT_OVERLAY_COLOR, OVERLAY_COLOR_LABELS, normalizeOverlayColor} = require('../dist/core/overlay-colors');
const {buildRecorderArguments} = require('../dist/core/recorder');
const manifest = require('../package.json');
test('exactly four palettes; Blue is the default without changing other settings', () => {
  const setting=manifest.contributes.configuration.properties['universalDictate.colors'];
  assert.deepEqual(OVERLAY_COLORS,['blue','green','amber','violet']);
  assert.deepEqual(setting.enum,OVERLAY_COLORS);
  assert.deepEqual(setting.enumItemLabels,OVERLAY_COLORS.map(x=>OVERLAY_COLOR_LABELS[x]));
  assert.equal(DEFAULT_OVERLAY_COLOR,'blue');assert.equal(setting.default,'blue');
  assert.match(setting.description,/next recording/);
});
for(const color of OVERLAY_COLORS) {
  test(`${color}: enhanced recorder receives a lossless, independent color selection`, () => {
    const options={recorderPath:'r.exe',outputPath:'a.wav',overlayStyle:'enhanced',overlayColor:color,overlaySize:'small',enhancedOverlayVisualization:'circularSpectrum'};
    const args=buildRecorderArguments(options);
    assert.equal(args[args.indexOf('--overlay-colors')+1],color);
    assert.equal(args[args.indexOf('--overlay-visualization')+1],'circularSpectrum');
    assert.equal(args[args.indexOf('--overlay-size')+1],'small');assert.equal(options.overlayColor,color);
    for(const extra of [{showOverlay:false},{overlayStyle:'compact'}])
      assert.equal(buildRecorderArguments({...options,...extra}).includes('--overlay-colors'),false);
  });
}
test('invalid color values safely use Blue without color/gain migration', () => {
  for(const value of [null,undefined,'','classic','red',true,12,{},['green']]) assert.equal(normalizeOverlayColor(value),'blue');
});
