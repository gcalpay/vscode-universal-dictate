const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const manifest = require('../package.json');
function load(name, dependencies) {
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist', `${name}.js`), 'utf8'), {
    exports, Error, process: { platform: 'win32', arch: 'x64' },
    require: id => { if (!(id in dependencies)) throw new Error(`unexpected ${id}`); return dependencies[id]; }
  }); return exports;
}
function mock() {
  const calls = { menus: [], copies: [], info: [], errors: [], updates: [], status: [] }; const commands = new Map(); const config = {};
  const vscode = {
    commands: {
      registerCommand: (id, cb) => { assert.ok(!commands.has(id)); commands.set(id, cb); return { dispose: () => commands.delete(id) }; },
      executeCommand: async (id, ...args) => { if (id === 'setContext') return; return commands.get(id)(...args); }
    },
    window: {
      createQuickPick: () => assert.fail('recovery submenu must not exist'),
      showQuickPick: async items => { calls.menus.push(items); return undefined; },
      createStatusBarItem: () => { const item = { show() {}, dispose() {} }; calls.status.push(item); return item; },
      showInformationMessage: async s => { calls.info.push(s); }, showErrorMessage: async s => { calls.errors.push(s); }
    },
    env: { clipboard: { writeText: async s => { calls.copies.push(s); } } },
    workspace: { getConfiguration: () => ({ get: (key, fallback) => key in config ? config[key] : fallback,
      update: async (key, value, target) => { calls.updates.push([key, value, target]); config[key] = value; } }) },
    StatusBarAlignment: { Right: 2 }, ConfigurationTarget: { Global: 1 }
  }; return { vscode, calls, commands, config };
}
function fixture() {
  const h = mock(); let options; let result = 'completed';
  const engine = { copyLastTranscript: async write => { if (result === 'throw') throw new Error('SECRET'); if (result === 'completed') await write('last transcript'); return result; }, dispose() {} };
  const { TranscriptRecoveryController } = load('transcript-recovery', { vscode: h.vscode });
  const recovery = new TranscriptRecoveryController(engine);
  return { ...h, recovery, setResult(v) { result = v; } };
}
function extensionFixture() {
  const h = mock(); let options; const insertions = [];
  const { TranscriptRecoveryController } = load('transcript-recovery', { vscode: h.vscode });
  const extension = load('extension', {
    'node:fs': fs, vscode: h.vscode,
    './core/dictation': { DictationEngine: class { constructor(o) { options = o; } dispose() {} } },
    './transcript-recovery': { TranscriptRecoveryController },
    './core/preview-coordinator': require('../dist/core/preview-coordinator'),
    './core/overlay-size': { normalizeOverlaySize: s => s, OVERLAY_SIZES: ['small', 'medium', 'large'] },
    './languages': { normalizeWhisperLanguage: v => v, getWhisperLanguageName: v => v, WHISPER_LANGUAGES: [] },
    './model': { ensureModel: async () => {} },
    './paste': { pasteIntoFocusedControl: async (...args) => { insertions.push(args); } },
    './recorder': { RecorderSession: { start: async () => ({}) } },
    './whisper': { warmWhisper: async () => {}, disposeWhisper() {}, transcribe: async (...args) => { h.calls.transcription = args; return 'final'; } }
  }); const context = { subscriptions: [] }; extension.activate(context);
  return { ...h, get options() { return options; }, insertions, cleanup() { context.subscriptions.forEach(d => d.dispose()); } };
}

test('only Copy Last Transcript remains as a recovery command', () => {
  const h = fixture(); assert.deepEqual([...h.commands.keys()], ['universalDictate.copyLastTranscript']);
  const ids = manifest.contributes.commands.map(c => c.command);
  assert.ok(ids.includes('universalDictate.copyLastTranscript'));
  assert.ok(!ids.includes('universalDictate.insertLastTranscript')); assert.ok(!ids.includes('universalDictate.clearLastTranscript'));
  h.recovery.dispose(); assert.equal(h.commands.size, 0);
});
test('Copy explicitly overwrites even when automatic overwrite setting is Off', async () => {
  const h = fixture(); await h.commands.get('universalDictate.copyLastTranscript')();
  assert.deepEqual(h.calls.copies, ['last transcript']); assert.equal(h.calls.menus.length, 0); h.recovery.dispose();
});
for (const status of ['empty', 'busy', 'disposed', 'throw']) {
  test(`Copy ${status} does not change clipboard`, async () => {
    const h = fixture(); h.setResult(status); await h.commands.get('universalDictate.copyLastTranscript')();
    assert.equal(h.calls.copies.length, 0); assert.ok(!JSON.stringify(h.calls).includes('SECRET')); h.recovery.dispose();
  });
}
test('disposed controller refuses a retained command callback', async () => {
  const h = fixture(); const cb = h.commands.get('universalDictate.copyLastTranscript'); h.recovery.dispose(); await cb(); assert.equal(h.calls.copies.length, 0);
});
test('fifth gear entry is Overwrite clipboard Off, with exactly two status-bar items', async () => {
  const h = extensionFixture(); await h.commands.get('universalDictate.openSettings')();
  assert.equal(h.calls.status.length, 2); assert.equal(h.calls.menus[0].length, 6);
  assert.equal(h.calls.menus[0][4].action, 'overwriteClipboard'); assert.match(h.calls.menus[0][4].description, /Off/);
  assert.ok(!JSON.stringify(h.calls.menus).includes('Last transcript'));
  assert.equal(manifest.contributes.configuration.properties['universalDictate.overwriteClipboard'].default, false);
  assert.equal(manifest.contributes.configuration.properties['universalDictate.overlaySize'].default, 'medium'); h.cleanup();
});
test('one click toggles On then Off in the existing settings, without another menu', async () => {
  const h = extensionFixture(); h.vscode.window.showQuickPick = async items => { h.calls.menus.push(items); return items[4]; };
  await h.commands.get('universalDictate.openSettings')(); assert.equal(h.config.overwriteClipboard, true);
  await h.commands.get('universalDictate.openSettings')(); assert.equal(h.config.overwriteClipboard, false);
  assert.equal(h.calls.menus.length, 2); assert.deepEqual(h.calls.updates, [['overwriteClipboard', true, 1], ['overwriteClipboard', false, 1]]); h.cleanup();
});
test('Escape does not toggle and setting UI does not copy text', async () => {
  const h = extensionFixture(); await h.commands.get('universalDictate.openSettings')();
  assert.equal(h.calls.updates.length, 0); assert.equal(h.calls.copies.length, 0); h.cleanup();
});
for (const mode of [false, true]) {
  test(`automatic insertion snapshots mode ${mode} before preparation`, async () => {
    const h = extensionFixture(); h.config.overwriteClipboard = mode; await h.options.prepare();
    h.config.overwriteClipboard = !mode; await h.options.startRecorder(() => {}, new AbortController().signal);
    await h.options.insert('transcript', new AbortController().signal);
    assert.equal(h.insertions[0][3], mode);
    await h.options.prepare(); await h.options.insert('second', new AbortController().signal); assert.equal(h.insertions[1][3], !mode); h.cleanup();
  });
}
test('invalid stored setting does not enable clipboard writes', async () => {
  const h = extensionFixture(); h.config.overwriteClipboard = 'true'; await h.options.prepare(); await h.options.insert('text');
  assert.equal(h.insertions[0][3], false); h.cleanup();
});
test('toggle uses current setting even when changed while menu is open', async () => {
  const h = extensionFixture(); h.vscode.window.showQuickPick = async items => { h.config.overwriteClipboard = true; return items[4]; };
  await h.commands.get('universalDictate.openSettings')(); assert.equal(h.config.overwriteClipboard, false); h.cleanup();
});
test('adapter chooses new input executable and forwards explicit mode', async () => {
  const received = [];
  const vscode = { Uri: { joinPath: (_uri, ...parts) => ({ fsPath: parts.join('/') }) }, env: { clipboard: { writeText() {} } } };
  const adapter = load('paste', { vscode, './core/paste': { pasteIntoFocusedControl: async (...args) => received.push(args) } });
  const signal = new AbortController().signal; await adapter.pasteIntoFocusedControl({ extensionUri: {} }, 'text', signal, true);
  assert.equal(received[0][0].helperPath, 'resources/bin/windows-text-input.exe'); assert.equal(received[0][0].overwriteClipboard, true); assert.equal(received[0][0].signal, signal);
  await adapter.pasteIntoFocusedControl({ extensionUri: {} }, 'default'); assert.equal(received[1][0].overwriteClipboard, false);
});

test('Live preview is the sixth gear toggle and is false in the manifest and effective default', async () => {
  const h=extensionFixture();await h.commands.get('universalDictate.openSettings')();
  assert.equal(h.calls.menus[0][5].action,'livePreview');assert.match(h.calls.menus[0][5].description,/Off/);
  assert.equal(manifest.contributes.configuration.properties['universalDictate.livePreview'].default,false);
  assert.equal(h.calls.status.length,2);h.cleanup();
});
test('Live preview toggles On and Off without affecting clipboard or adding a submenu', async () => {
  const h=extensionFixture();h.vscode.window.showQuickPick=async items=>{h.calls.menus.push(items);return items[5];};
  await h.commands.get('universalDictate.openSettings')();assert.equal(h.config.livePreview,true);
  await h.commands.get('universalDictate.openSettings')();assert.equal(h.config.livePreview,false);
  assert.deepEqual(h.calls.updates,[['livePreview',true,1],['livePreview',false,1]]);assert.equal(h.calls.copies.length,0);h.cleanup();
});
for (const mode of ['enhancedOverlay','both','statusBar','off']) for (const enabled of [false,true,'true']) {
  test(`preview session snapshots strict toggle ${enabled} and visualization ${mode}`, async () => {
    const h=extensionFixture();h.config.livePreview=enabled;h.config.visualization=mode;h.config.language='de';await h.options.prepare();
    // Changes during recording do not create/stop extra preview work midway.
    h.config.livePreview=!enabled;h.config.language='en';let acquisitions=0;
    const session={previewSessionId:'test',acquirePreview:async()=>{acquisitions++;return undefined;},showPreview:()=>{}};
    const handle=h.options.startPreview(session,new AbortController().signal);
    assert.equal(!!handle,enabled===true && ['enhancedOverlay','both'].includes(mode));
    await handle?.stop();assert.equal(acquisitions,0);h.cleanup();
  });
}

test('Language is snapshotted at recording preparation for final transcription', async () => {
  const h=extensionFixture();h.config.language='de';await h.options.prepare();h.config.language='en';
  await h.options.transcribe('complete.wav');assert.equal(h.calls.transcription[2],'de');h.cleanup();
});


test('English is the manifest and runtime default language', async () => {
  const h=extensionFixture();
  assert.equal(manifest.contributes.configuration.properties['universalDictate.language'].default,'en');
  await h.options.prepare();
  await h.options.transcribe('complete.wav');
  assert.equal(h.calls.transcription[2],'en');
  h.cleanup();
});
