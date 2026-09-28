const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { DictationEngine } = require('../dist/core/dictation.js');
const manifest = require('../package.json');

const root = path.resolve(__dirname, '..');
function loadCompiled(name, dependencies) {
  const exports = {};
  const filename = path.join(root, 'dist', `${name}.js`);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports,
    require: (id) => {
      if (!(id in dependencies)) throw new Error(`Unexpected dependency ${id}`);
      return dependencies[id];
    },
    process: { platform: 'win32', arch: 'x64' }
  }, { filename });
  return exports;
}

function signal() {
  const listeners = new Set();
  return {
    event: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    fire: () => { for (const listener of [...listeners]) listener(); },
    count: () => listeners.size
  };
}

function vscodeMock() {
  const calls = { info: [], errors: [], copied: [], pickers: [], status: [], menus: [] };
  const commands = new Map();
  const vscode = {
    commands: {
      registerCommand: (id, callback) => {
        assert.equal(commands.has(id), false, `duplicate command: ${id}`);
        commands.set(id, callback);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand: async (id, ...args) => {
        if (id === 'setContext') return;
        assert.ok(commands.has(id), id);
        return commands.get(id)(...args);
      }
    },
    window: {
      showInformationMessage: async (text) => { calls.info.push(text); },
      showErrorMessage: async (text) => { calls.errors.push(text); },
      createQuickPick: () => {
        const accepted = signal();
        const hidden = signal();
        const picker = {
          items: [], selectedItems: [], visible: false, disposed: false,
          onDidAccept: accepted.event,
          onDidHide: hidden.event,
          show: () => { picker.visible = true; },
          hide: () => { picker.hideRequested = true; },
          // Emit separately to prove dispatch waits for onDidHide, not hide().
          flushHide: () => { picker.visible = false; hidden.fire(); },
          accept: (action) => {
            picker.selectedItems = picker.items.filter((item) => item.action === action);
            accepted.fire();
          },
          dispose: () => { picker.disposed = true; picker.visible = false; },
          listeners: () => accepted.count() + hidden.count()
        };
        calls.pickers.push(picker);
        return picker;
      },
      createStatusBarItem: () => {
        const status = { show: () => {}, dispose: () => {} };
        calls.status.push(status);
        return status;
      },
      showQuickPick: async (items) => { calls.menus.push(items); return undefined; }
    },
    env: { clipboard: { writeText: async (text) => { calls.copied.push(text); } } },
    StatusBarAlignment: { Right: 2 },
    ConfigurationTarget: { Global: 1 },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  };
  return { vscode, calls, commands };
}

function fixture(t) {
  const mock = vscodeMock();
  let text;
  const calls = { insert: 0, copy: 0, clear: 0 };
  const engine = {
    getLastTranscript: () => text,
    insertLastTranscript: async () => { calls.insert++; return text === undefined ? 'empty' : 'completed'; },
    copyLastTranscript: async (write) => {
      calls.copy++;
      if (text === undefined) return 'empty';
      await write(text);
      return 'completed';
    },
    clearLastTranscript: () => { calls.clear++; text = undefined; }
  };
  const { TranscriptRecoveryController } = loadCompiled('transcript-recovery', { vscode: mock.vscode });
  const recovery = new TranscriptRecoveryController(engine);
  t.after(() => {
    recovery.dispose();
    for (const picker of mock.calls.pickers) picker.flushHide();
  });
  return { ...mock, engine, recovery, actions: calls, setText: (value) => { text = value; } };
}

test('registers exactly the three contributed, keyboard-assignable commands', (t) => {
  const h = fixture(t);
  assert.deepEqual([...h.commands.keys()], [
    'universalDictate.insertLastTranscript',
    'universalDictate.copyLastTranscript',
    'universalDictate.clearLastTranscript'
  ]);
  for (const id of h.commands.keys()) {
    assert.ok(manifest.contributes.commands.some((item) => item.command === id));
    assert.ok(manifest.activationEvents.includes(`onCommand:${id}`));
    assert.equal(manifest.contributes.keybindings.some((item) => item.command === id), false);
  }
});

test('Empty/Available status never contains the transcript', async (t) => {
  const h = fixture(t);
  assert.equal(h.recovery.availability, 'Empty');
  h.setText('PRIVATE TRANSCRIPT');
  assert.equal(h.recovery.availability, 'Available');
  const opening = h.recovery.showMenu();
  const picker = h.calls.pickers[0];
  assert.equal(picker.items.length, 3);
  assert.equal(JSON.stringify(picker.items).includes('PRIVATE TRANSCRIPT'), false);
  assert.equal(picker.placeholder.includes('PRIVATE TRANSCRIPT'), false);
  picker.flushHide();
  await opening;
});

test('Insert from menu waits for hide and dispatches once despite double acceptance', async (t) => {
  const h = fixture(t);
  h.setText('saved');
  const opening = h.recovery.showMenu();
  const picker = h.calls.pickers[0];
  picker.accept('insert');
  picker.accept('insert');
  await Promise.resolve();
  assert.equal(h.actions.insert, 0);
  picker.flushHide();
  await opening;
  assert.equal(h.actions.insert, 1);
  assert.equal(picker.disposed, true);
  assert.equal(picker.listeners(), 0);
  assert.deepEqual(h.calls.copied, []);
});

for (const action of ['copy', 'clear']) {
  test(`${action} submenu entry runs its corresponding action`, async (t) => {
    const h = fixture(t);
    h.setText('saved');
    const opening = h.recovery.showMenu();
    const picker = h.calls.pickers[0];
    picker.accept(action);
    picker.flushHide();
    await opening;
    assert.equal(h.actions[action], 1);
    assert.equal(h.actions.insert, 0);
  });
}

test('Escape/focus-loss without a selection performs no action', async (t) => {
  const h = fixture(t);
  const opening = h.recovery.showMenu();
  h.calls.pickers[0].flushHide();
  await opening;
  assert.deepEqual(h.actions, { insert: 0, copy: 0, clear: 0 });
});

test('direct commands do not open a menu; Copy deliberately replaces clipboard', async (t) => {
  const h = fixture(t);
  h.setText('copy me');
  await h.commands.get('universalDictate.copyLastTranscript')();
  assert.deepEqual(h.calls.copied, ['copy me']);
  await h.commands.get('universalDictate.insertLastTranscript')();
  assert.equal(h.actions.insert, 1);
  assert.equal(h.calls.pickers.length, 0);
  await h.commands.get('universalDictate.clearLastTranscript')();
  assert.equal(h.recovery.availability, 'Empty');
  assert.deepEqual(h.calls.copied, ['copy me']);
});

test('empty commands show information without changing clipboard', async (t) => {
  const h = fixture(t);
  await h.commands.get('universalDictate.copyLastTranscript')();
  await h.commands.get('universalDictate.insertLastTranscript')();
  assert.equal(h.calls.info.length, 2);
  assert.ok(h.calls.info.every((item) => item.includes('no last transcript')));
  assert.deepEqual(h.calls.copied, []);
});

test('busy response is surfaced without an automatic retry', async (t) => {
  const h = fixture(t);
  let attempts = 0;
  h.engine.insertLastTranscript = async () => { attempts++; return 'busy'; };
  await h.commands.get('universalDictate.insertLastTranscript')();
  assert.equal(attempts, 1);
  assert.match(h.calls.info[0], /finish or cancel/);
});

for (const action of ['insert', 'copy']) {
  test(`${action} failure keeps recovery available without exposing backend error text`, async (t) => {
    const h = fixture(t);
    h.setText('PRIVATE TRANSCRIPT');
    h.engine[`${action}LastTranscript`] = async () => { throw new Error('PRIVATE TRANSCRIPT'); };
    await h.commands.get(`universalDictate.${action}LastTranscript`)();
    assert.equal(h.recovery.availability, 'Available');
    assert.equal(h.calls.errors.length, 1);
    assert.match(h.calls.errors[0], /still available/);
    assert.equal(h.calls.errors[0].includes('PRIVATE TRANSCRIPT'), false);
  });
}

test('disposing UI prevents an accepted but not yet dispatched action', async (t) => {
  const h = fixture(t);
  h.setText('saved');
  const opening = h.recovery.showMenu();
  const picker = h.calls.pickers[0];
  picker.accept('insert');
  h.recovery.dispose();
  picker.flushHide();
  await opening;
  assert.equal(h.actions.insert, 0);
  assert.equal(h.commands.size, 0);
  await h.recovery.showMenu();
  assert.equal(h.calls.pickers.length, 1);
});

test('a superseded menu cannot dispatch an old accepted action', async (t) => {
  const h = fixture(t);
  h.setText('saved');
  const first = h.recovery.showMenu();
  const previous = h.calls.pickers[0];
  previous.accept('insert');
  const second = h.recovery.showMenu();
  previous.flushHide();
  await first;
  assert.equal(h.actions.insert, 0);
  h.calls.pickers[1].flushHide();
  await second;
});

test('direct insertion shortcut refuses to paste into the open recovery picker', async (t) => {
  const h = fixture(t);
  h.setText('saved');
  const opening = h.recovery.showMenu();
  await h.commands.get('universalDictate.insertLastTranscript')();
  assert.equal(h.actions.insert, 0);
  assert.match(h.calls.info[0], /close the Last transcript menu/);
  h.calls.pickers[0].flushHide();
  await opening;
});

test('actual extension wiring adds fifth gear entry without extra status-bar controls', async () => {
  const h = vscodeMock();
  const { TranscriptRecoveryController } = loadCompiled('transcript-recovery', { vscode: h.vscode });
  let engine;
  class ObservedEngine extends DictationEngine {
    constructor(options) { super(options); engine = this; }
  }
  const dependencies = {
    'node:fs': fs,
    vscode: h.vscode,
    './core/dictation': { DictationEngine: ObservedEngine },
    './transcript-recovery': { TranscriptRecoveryController },
    './core/overlay-size': {
      normalizeOverlaySize: (size) => size,
      OVERLAY_SIZES: ['small', 'medium', 'large']
    },
    './languages': { getWhisperLanguageName: (value) => value, normalizeWhisperLanguage: (value) => value },
    './model': { ensureModel: async () => {} },
    './paste': { pasteIntoFocusedControl: async () => {} },
    './recorder': { RecorderSession: { start: async () => { throw new Error('not recording'); } } },
    './whisper': { warmWhisper: async () => {}, disposeWhisper: () => {} }
  };
  const extension = loadCompiled('extension', dependencies);
  const context = { subscriptions: [] };
  extension.activate(context);
  try {
    assert.equal(h.calls.status.length, 2);
    await h.commands.get('universalDictate.openSettings')();
    assert.equal(h.calls.menus[0].length, 5);
    assert.equal(h.calls.menus[0][4].action, 'lastTranscript');
    assert.equal(h.calls.menus[0][4].description, 'Empty');
    // Verify actual routing, not just source strings or a menu item snapshot.
    h.vscode.window.showQuickPick = async (items) => items[4];
    const createPicker = h.vscode.window.createQuickPick;
    let notifyCreated;
    const created = new Promise((resolve) => { notifyCreated = resolve; });
    h.vscode.window.createQuickPick = () => {
      const picker = createPicker();
      notifyCreated(picker);
      return picker;
    };
    const opening = h.commands.get('universalDictate.openSettings')();
    const picker = await created;
    assert.equal(h.calls.pickers.length, 1);
    picker.flushHide();
    await opening;
    assert.equal(engine.getLastTranscript(), undefined);
    assert.equal(manifest.contributes.configuration.properties['universalDictate.overlaySize'].default, 'medium');
  } finally {
    for (const disposable of context.subscriptions) disposable.dispose();
  }
  assert.equal(h.commands.size, 0);
});
