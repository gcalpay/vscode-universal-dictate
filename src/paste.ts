import * as vscode from 'vscode';
import { pasteIntoFocusedControl as coreInsert } from './core/paste';

/** Native input never uses the clipboard; the optional copy is explicit. */
export async function pasteIntoFocusedControl(
  context: vscode.ExtensionContext,
  text: string,
  signal?: AbortSignal,
  overwriteClipboard = false
): Promise<void> {
  await coreInsert({
    helperPath: getNativePasteHelperPath(context),
    signal,
    overwriteClipboard,
    clipboard: vscode.env.clipboard
  }, text);
}

export function getNativePasteHelperPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, 'resources', 'bin', 'windows-text-input.exe').fsPath;
}
