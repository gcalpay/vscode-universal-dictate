import * as vscode from 'vscode';
import type { DictationEngine } from './core/dictation';

type RecoveryAction = 'insert' | 'copy' | 'clear';
type RecoveryQuickPickItem = vscode.QuickPickItem & { action: RecoveryAction };

const RECOVERY_ITEMS: readonly RecoveryQuickPickItem[] = [
  {
    label: 'Insert last transcript',
    detail: 'Insert once. A direct keyboard shortcut avoids reopening this menu.',
    action: 'insert'
  },
  {
    label: 'Copy last transcript',
    detail: 'Replace the clipboard with the last transcript.',
    action: 'copy'
  },
  {
    label: 'Clear last transcript',
    detail: 'Forget the saved transcript without changing the clipboard.',
    action: 'clear'
  }
];

/** Recovery UI; no transcript text is persisted or placed in menu labels. */
export class TranscriptRecoveryController implements vscode.Disposable {
  private readonly commands: vscode.Disposable[];
  private picker: vscode.QuickPick<RecoveryQuickPickItem> | undefined;
  private disposed = false;
  private menuGeneration = 0;

  constructor(private readonly engine: DictationEngine) {
    this.commands = RECOVERY_ITEMS.map(({ action }) =>
      vscode.commands.registerCommand(`universalDictate.${action}LastTranscript`, () =>
        this.runAction(action)
      )
    );
  }

  get availability(): 'Available' | 'Empty' {
    return this.engine.getLastTranscript() === undefined ? 'Empty' : 'Available';
  }

  async showMenu(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const generation = ++this.menuGeneration;
    this.picker?.hide();
    const picker = vscode.window.createQuickPick<RecoveryQuickPickItem>();
    this.picker = picker;
    picker.title = 'Universal Dictate: Last transcript';
    picker.placeholder = `${this.availability} · kept in memory until reload/restart`;
    picker.items = RECOVERY_ITEMS;
    picker.matchOnDetail = true;

    const action = await new Promise<RecoveryAction | undefined>((resolve) => {
      let selected: RecoveryAction | undefined;
      const accept = picker.onDidAccept(() => {
        // Repeated acceptance while hide is pending must not trigger two pastes.
        if (selected !== undefined) {
          return;
        }
        selected = picker.selectedItems[0]?.action;
        picker.hide();
      });
      const hide = picker.onDidHide(() => {
        accept.dispose();
        hide.dispose();
        if (this.picker === picker) {
          this.picker = undefined;
        }
        picker.dispose();
        resolve(selected);
      });
      picker.show();
    });

    // Wait for our own picker to close, not an arbitrary timeout. This does
    // not claim to restore an opaque composer/caret (Issue #38 remains open).
    if (action !== undefined && !this.disposed && generation === this.menuGeneration) {
      await this.runAction(action);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.picker?.hide();
    for (const command of this.commands) {
      command.dispose();
    }
  }

  private async runAction(action: RecoveryAction): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.picker !== undefined && action !== 'clear') {
      void vscode.window.showInformationMessage(
        'Universal Dictate: close the Last transcript menu before using a recovery shortcut.'
      );
      return;
    }
    if (action === 'clear') {
      this.engine.clearLastTranscript();
      void vscode.window.showInformationMessage('Universal Dictate: last transcript cleared.');
      return;
    }

    try {
      const result = action === 'insert'
        ? await this.engine.insertLastTranscript()
        : await this.engine.copyLastTranscript((text) => vscode.env.clipboard.writeText(text));
      if (this.disposed || result === 'disposed') {
        return;
      }
      if (result === 'empty') {
        void vscode.window.showInformationMessage('Universal Dictate: no last transcript available.');
      } else if (result === 'busy') {
        void vscode.window.showInformationMessage(
          'Universal Dictate: finish or cancel the current dictation/recovery action first.'
        );
      } else if (action === 'copy') {
        void vscode.window.showInformationMessage('Universal Dictate: last transcript copied.');
      }
    } catch {
      if (!this.disposed) {
        // Do not echo arbitrary backend errors here: they may contain text.
        const recovery = this.availability === 'Available'
          ? ' The last transcript is still available.'
          : '';
        void vscode.window.showErrorMessage(
          `Universal Dictate: could not ${action} the last transcript.${recovery}`
        );
      }
    }
  }
}
