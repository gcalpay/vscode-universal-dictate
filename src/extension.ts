import * as childProcess from 'node:child_process';
import * as vscode from 'vscode';

const PROBE_TEXT = '[Universal Dictate probe]';

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'universalDictate.insertProbe',
    async () => {
      if (process.platform !== 'win32') {
        void vscode.window.showErrorMessage(
          'Universal Dictate currently supports Windows only.'
        );
        return;
      }

      if (vscode.window.activeTerminal) {
        // activeTerminal is not equivalent to terminal focus, but the keybinding is
        // already disabled when terminalFocus is true. Keep this conservative for M1.
      }

      try {
        await pasteIntoFocusedControl(PROBE_TEXT);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(
          `Universal Dictate could not insert text: ${message}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // Nothing to clean up yet.
}

async function pasteIntoFocusedControl(text: string): Promise<void> {
  const previousClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(text);

  try {
    await sendPasteKeystroke();
  } finally {
    // SendKeys is synchronous, but give the receiving control a short window to
    // consume clipboard contents before restoring the user's clipboard.
    await delay(120);
    await vscode.env.clipboard.writeText(previousClipboard);
  }
}

function sendPasteKeystroke(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '[System.Windows.Forms.SendKeys]::SendWait("^v")'
    ].join('; ');

    childProcess.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
