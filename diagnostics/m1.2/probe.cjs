'use strict';
// Development-only bootstrap for the unchanged, compiled extension.
// Only ASR/model prerequisites are stubbed; recording, controls and paste stay real.
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');

function createGate({ helper, onReady = () => {}, log = () => {}, launch = spawn, timeoutMs = 5000 }) {
  let pending;
  let disposed = false;
  return {
    wait() {
      if (disposed || pending) return Promise.reject(new Error('Gate disposed or already pending.'));
      return new Promise((resolve, reject) => {
        let child;
        try { child = launch(helper, [String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch (error) { reject(error); return; }
        let ready = false, released = false, settled = false, status;
        let stderr = '';
        const lines = readline.createInterface({ input: child.stdout });
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          lines.close();
          status?.dispose();
          pending = undefined;
          if (error) { child.kill(); reject(error); }
          else { log('gate-released'); resolve('UD_TEST'); }
        };
        const timer = setTimeout(() => finish(new Error('Release helper did not become ready.')), timeoutMs);
        pending = { finish };
        child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2048); });
        lines.on('line', line => {
          if (line === 'READY' && !ready) { ready = true; clearTimeout(timer); status = onReady(); log('gate-ready'); }
          else if (line === 'RELEASE' && ready && !released) { released = true; }
          else { finish(new Error('Unexpected release-helper protocol.')); }
        });
        child.on('error', finish);
        // close (not exit) ensures stdout has been drained before checking RELEASE.
        child.on('close', code => {
          if (code === 0 && ready && released) finish();
          else finish(new Error(`Release helper failed (${code}): ${stderr.trim()}`));
        });
      });
    },
    dispose() { disposed = true; pending?.finish(new Error('Diagnostic session disposed.')); }
  };
}

let originalExtension;
function activate(context) {
  const vscode = require('vscode');
  if (process.platform !== 'win32' || context.extensionMode !== vscode.ExtensionMode.Development ||
      process.env.UD_FOCUS_PROBE !== 'M1.2') {
    throw new Error('M1.2 probe requires the isolated Windows development launcher. Not a release extension.');
  }
  const output = vscode.window.createOutputChannel('Universal Dictate M1.2 probe');
  const counts = { toggle: 0, insert: 0 };
  const log = event => output.appendLine(JSON.stringify({ time: new Date().toISOString(), event, ...counts }));
  const gate = createGate({
    helper: path.join(context.extensionPath, 'resources', 'bin', 'm12-release-gate.exe'),
    log,
    onReady: () => vscode.window.setStatusBarMessage('UD_TEST pending: Ctrl+Alt+Shift+F8 to complete')
  });
  const model = require('./model');
  const whisper = require('./whisper');
  const paste = require('./paste');
  const { DictationEngine } = require('./core/dictation');
  const originals = { ensure: model.ensureModel, warm: whisper.warmWhisper, transcribe: whisper.transcribe,
    paste: paste.pasteIntoFocusedControl, toggle: DictationEngine.prototype.toggle };
  if (Object.values(originals).some(value => typeof value !== 'function')) {
    gate.dispose(); output.dispose(); throw new Error('Unexpected compiled extension interface.');
  }
  model.ensureModel = async () => {};
  whisper.warmWhisper = async () => {};
  whisper.transcribe = () => gate.wait();
  paste.pasteIntoFocusedControl = async (...args) => {
    if (args[1] !== 'UD_TEST') throw new Error('Probe refuses non-fixture text.');
    counts.insert++; log('paste-requested');
    await originals.paste(...args); log('paste-helper-returned-NOT-an-insertion-acknowledgement');
  };
  DictationEngine.prototype.toggle = function (...args) {
    counts.toggle++; log('toggle'); return originals.toggle.apply(this, args);
  };
  context.subscriptions.push({ dispose() {
    gate.dispose();
    model.ensureModel = originals.ensure; whisper.warmWhisper = originals.warm;
    whisper.transcribe = originals.transcribe; paste.pasteIntoFocusedControl = originals.paste;
    DictationEngine.prototype.toggle = originals.toggle;
    output.dispose();
  } });
  // Load after installing the diagnostic adapters, so the real controller uses them.
  originalExtension = require('./extension');
  log('probe-active');
  return originalExtension.activate(context);
}
function deactivate() { return originalExtension?.deactivate?.(); }
module.exports = { activate, deactivate, createGate };
