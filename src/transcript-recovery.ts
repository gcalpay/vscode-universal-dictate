import * as vscode from 'vscode';
import type { DictationEngine } from './core/dictation';

/** Optional explicit recovery. No focus-changing Insert/Clear submenu. */
export class TranscriptRecoveryController implements vscode.Disposable {
  private readonly command: vscode.Disposable;
  private disposed = false;

  constructor(private readonly engine: DictationEngine) {
    this.command = vscode.commands.registerCommand('universalDictate.copyLastTranscript', () => this.copy());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.command.dispose();
  }

  private async copy(): Promise<void> {
    if (this.disposed) return;
    try {
      const result = await this.engine.copyLastTranscript((text) => vscode.env.clipboard.writeText(text));
      if (this.disposed || result === 'disposed') return;
      const message = result === 'empty' ? 'No last transcript available.'
        : result === 'busy' ? 'Finish or cancel the current dictation first.'
        : 'Last transcript copied.';
      void vscode.window.showInformationMessage(`Universal Dictate: ${message}`);
    } catch {
      if (!this.disposed) void vscode.window.showErrorMessage('Universal Dictate: could not copy the last transcript.');
    }
  }
}
