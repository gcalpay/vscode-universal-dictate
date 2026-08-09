import * as path from 'node:path';
import * as vscode from 'vscode';
import { pasteIntoFocusedControl as pasteIntoFocusedControlCore } from './core/paste';

/**
 * VS Code adapter for editor-independent focused-control paste orchestration.
 *
 * VS Code supplies clipboard access and extension-relative helper paths. The
 * standalone app can reuse the core with its own clipboard implementation.
 */
export async function pasteIntoFocusedControl(
  context: vscode.ExtensionContext,
  text: string
): Promise<void> {
  await pasteIntoFocusedControlCore(
    {
      clipboard: vscode.env.clipboard,
      helperPath: getNativePasteHelperPath(context),
      allowPowerShellFallback: context.extensionMode === vscode.ExtensionMode.Development
    },
    text
  );
}

export function getNativePasteHelperPath(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join('resources', 'bin', 'windows-fast-paste.exe'));
}
