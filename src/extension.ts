import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { getNativePasteHelperPath, pasteIntoFocusedControl } from './paste';

const PROBE_TEXT = '[Universal Dictate probe]';

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
