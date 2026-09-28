import * as path from 'node:path';
import type * as vscode from 'vscode';
import { pasteIntoFocusedControl as pasteIntoFocusedControlCore } from './core/paste';

/** Clipboard preservation is native; the VS Code adapter only resolves its path. */
export async function pasteIntoFocusedControl(
  context: vscode.ExtensionContext,
  text: string
): Promise<void> {
  await pasteIntoFocusedControlCore({ helperPath: getNativePasteHelperPath(context) }, text);
}

export function getNativePasteHelperPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join('resources', 'bin', 'windows-clipboard-paste.exe'));
}
