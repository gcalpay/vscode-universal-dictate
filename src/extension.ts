import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const PROBE_TEXT = '[Universal Dictate probe]';
const NATIVE_PASTE_RELATIVE_PATH = ['resources', 'bin', 'windows-fast-paste.exe'];

export function activate(context: vscode.ExtensionContext): void {
  const insertProbe = vscode.commands.registerCommand(
    'universalDictate.insertProbe',
    async () => {
      if (process.platform !== 'win32') {
        void vscode.window.showErrorMessage(
          `Universal Dictate must run in the Windows UI extension host. Current platform: ${process.platform}.`
        );
        return;
      }

      try {
        await pasteIntoFocusedControl(context, PROBE_TEXT);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(
          `Universal Dictate could not insert text: ${message}`
        );
      }
    }
  );

  const showDiagnostics = vscode.commands.registerCommand(
    'universalDictate.showDiagnostics',
    async () => {
      const extension = vscode.extensions.getExtension(
        'gcalpay.vscode-universal-dictate'
      );
      const extensionKind = extension?.extensionKind ?? 'unknown';
      const remoteName = vscode.env.remoteName ?? 'none';
      const nativeHelper = getNativePasteHelperPath(context);

      await vscode.window.showInformationMessage(
        [
          `platform=${process.platform}`,
          `arch=${process.arch}`,
          `remote=${remoteName}`,
          `extensionKind=${String(extensionKind)}`,
          `nativePaste=${fs.existsSync(nativeHelper) ? 'available' : 'fallback'}`
        ].join(' | '),
        { modal: true }
      );
    }
  );

  context.subscriptions.push(insertProbe, showDiagnostics);
}

export function deactivate(): void {
  // Nothing to clean up yet.
}

async function pasteIntoFocusedControl(
  context: vscode.ExtensionContext,
  text: string
): Promise<void> {
  const previousClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(text);

  try {
    await sendPasteKeystroke(context);
  } finally {
    // Let the target consume clipboard contents before restoring the user's text.
    await delay(150);
    await vscode.env.clipboard.writeText(previousClipboard);
  }
}

async function sendPasteKeystroke(context: vscode.ExtensionContext): Promise<void> {
  const nativeHelper = getNativePasteHelperPath(context);

  if (fs.existsSync(nativeHelper)) {
    await execFile(nativeHelper, []);
    return;
  }

  // Development fallback only. Release packages should contain the native helper.
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[System.Windows.Forms.SendKeys]::SendWait("^v")'
  ].join('; ');

  await execFile('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script
  ]);
}

function getNativePasteHelperPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...NATIVE_PASTE_RELATIVE_PATH).fsPath;
}

function execFile(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, { windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
