import * as vscode from 'vscode';
import {
  ensureWhisperModel,
  isWhisperModelInstalled,
  WHISPER_MODEL_FILENAME
} from './core/model';

export function getModelPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.globalStorageUri, 'models', WHISPER_MODEL_FILENAME).fsPath;
}

/**
 * VS Code adapter for shared Whisper model acquisition and verification.
 *
 * VS Code owns the storage location and progress/cancellation UI. The download
 * and integrity policy itself lives in the editor-independent core.
 */
export async function ensureModel(context: vscode.ExtensionContext): Promise<string> {
  const modelPath = getModelPath(context);
  if (await isWhisperModelInstalled(modelPath)) {
    return modelPath;
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Universal Dictate: downloading local Whisper base model',
      cancellable: true
    },
    async (progress, token) => {
      const cancellation = new AbortController();
      const disposable = token.onCancellationRequested(() => cancellation.abort());

      try {
        return await ensureWhisperModel({
          modelPath,
          signal: cancellation.signal,
          onProgress: (update) => progress.report(update)
        });
      } finally {
        disposable.dispose();
      }
    }
  );
}
