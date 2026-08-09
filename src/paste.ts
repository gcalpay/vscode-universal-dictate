import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';

const CLIPBOARD_RESTORE_DELAY_MS = 120;

/**
 * Insert text into the control that currently owns keyboard focus.
 *
 * The VS Code API cannot write into arbitrary extension-owned controls such as
 * the Codex composer. We therefore stage the transcript on the Windows
 * clipboard and ask a small native helper to synthesize Ctrl+V. The original
 * clipboard contents are restored afterwards.
 */
export async function pasteIntoFocusedControl(
  context: vscode.ExtensionContext,
  text: string
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error(`Windows is required; current platform is ${process.platform}`);
  }

  const previousClipboard = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(text);

  try {
    await sendPasteKeystroke(context);
  } finally {
    await delay(CLIPBOARD_RESTORE_DELAY_MS);
    await vscode.env.clipboard.writeText(previousClipboard);
  }
}

export function getNativePasteHelperPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join('resources', 'bin', 'windows-fast-paste.exe'));
}

async function sendPasteKeystroke(context: vscode.ExtensionContext): Promise<void> {
  const helperPath = getNativePasteHelperPath(context);

  try {
    await execFile(helperPath, []);
    return;
  } catch (nativeError) {
    // Source checkouts may not have the CI-built helper yet. Keep this fallback
    // during development only; release VSIX packages are expected to contain
    // windows-fast-paste.exe.
    if (context.extensionMode !== vscode.ExtensionMode.Development) {
      throw nativeError;
    }
  }

  await sendPasteWithPowerShell();
}

function sendPasteWithPowerShell(): Promise<void> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[System.Windows.Forms.SendKeys]::SendWait("^v")'
  ].join('; ');

  return execFile('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script
  ]);
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
