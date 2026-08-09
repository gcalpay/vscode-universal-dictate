import * as childProcess from 'node:child_process';

const DEFAULT_CLIPBOARD_RESTORE_DELAY_MS = 120;

export interface ClipboardAdapter {
  readText(): PromiseLike<string>;
  writeText(text: string): PromiseLike<void>;
}

export interface FocusedPasteOptions {
  readonly clipboard: ClipboardAdapter;
  readonly helperPath: string;
  readonly allowPowerShellFallback?: boolean;
  readonly clipboardRestoreDelayMs?: number;
}

/**
 * Paste text into the Windows control that currently owns keyboard focus.
 *
 * Clipboard access is injected by the host so this orchestration can be reused
 * by both the VS Code extension and a standalone Windows frontend. The native
 * helper remains responsible only for synthesizing Ctrl+V.
 */
export async function pasteIntoFocusedControl(
  options: FocusedPasteOptions,
  text: string
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error(`Windows is required; current platform is ${process.platform}`);
  }

  const previousClipboard = await options.clipboard.readText();
  await options.clipboard.writeText(text);

  try {
    await sendPasteKeystroke(options.helperPath, options.allowPowerShellFallback ?? false);
  } finally {
    await delay(options.clipboardRestoreDelayMs ?? DEFAULT_CLIPBOARD_RESTORE_DELAY_MS);
    await options.clipboard.writeText(previousClipboard);
  }
}

export async function sendPasteKeystroke(
  helperPath: string,
  allowPowerShellFallback = false
): Promise<void> {
  try {
    await execFile(helperPath, []);
    return;
  } catch (nativeError) {
    if (!allowPowerShellFallback) {
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
