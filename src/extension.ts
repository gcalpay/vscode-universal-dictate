import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
  getWhisperLanguageName,
  normalizeWhisperLanguage,
  WHISPER_LANGUAGES
} from './languages';
import { getModelPath, ensureModel } from './model';
import { getNativePasteHelperPath, pasteIntoFocusedControl } from './paste';
import { getRecorderPath, RecorderAction, RecorderSession } from './recorder';
import { getWhisperCliPath, transcribe } from './whisper';

class DictationController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly levelHistory = Array<number>(9).fill(0);
  private session: RecorderSession | undefined;
  private busy = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Keep dictation out of the workspace/source-control cluster on the left.
    // Right alignment with a low priority places it with secondary utility
    // controls and toward the right edge of the status bar.
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
    this.statusBar.name = 'Universal Dictate';
    this.context.subscriptions.push(this.statusBar);
    this.showIdleStatus();
  }

  async toggle(): Promise<void> {
    if (process.platform !== 'win32') {
      void vscode.window.showErrorMessage(
        `Universal Dictate must run in the Windows UI extension host. Current platform: ${process.platform}.`
      );
      return;
    }

    if (this.session) {
      await this.stopAndTranscribe();
      return;
    }

    if (this.busy) {
      return;
    }

    await this.startRecording();
  }

  async cancel(): Promise<void> {
    const session = this.session;
    if (!session || this.busy) {
      return;
    }

    this.busy = true;
    this.session = undefined;
    await vscode.commands.executeCommand('setContext', 'universalDictate.recording', false);
    this.statusBar.command = undefined;
    this.statusBar.text = '$(circle-slash) Universal Dictate: cancelling';

    try {
      await session.cancel();
    } finally {
      this.busy = false;
      this.showIdleStatus();
    }
  }

  dispose(): void {
    if (this.session) {
      void this.session.cancel();
      this.session = undefined;
    }
    this.statusBar.dispose();
  }

  private async startRecording(): Promise<void> {
    this.busy = true;
    this.levelHistory.fill(0);
    this.statusBar.command = undefined;
    this.statusBar.text = '$(loading~spin) Universal Dictate: preparing local model';
    this.statusBar.tooltip = 'The first run downloads the local Whisper model. Audio is not uploaded.';
    this.statusBar.show();

    try {
      await ensureModel(this.context);
      this.statusBar.text = '$(loading~spin) Universal Dictate: opening microphone';

      const session = await RecorderSession.start(this.context, (level) => {
        this.updateRecordingLevel(level);
      });
      this.session = session;
      session.onAction((action) => this.handleRecorderAction(session, action));

      await vscode.commands.executeCommand('setContext', 'universalDictate.recording', true);
      this.updateRecordingLevel(0);
    } catch (error) {
      this.session = undefined;
      await vscode.commands.executeCommand('setContext', 'universalDictate.recording', false);
      this.showError(error);
      this.showIdleStatus();
    } finally {
      this.busy = false;
    }
  }

  private handleRecorderAction(session: RecorderSession, action: RecorderAction): void {
    if (this.session !== session) {
      return;
    }

    // READY can be followed by an extremely fast overlay click while the
    // controller is still completing startup. Preserve that action rather than
    // acknowledging it and silently dropping it.
    if (this.busy) {
      setTimeout(() => this.handleRecorderAction(session, action), 25);
      return;
    }

    if (action === 'stop') {
      void this.stopAndTranscribe();
    } else {
      void this.cancel();
    }
  }

  private async stopAndTranscribe(): Promise<void> {
    const session = this.session;
    if (!session || this.busy) {
      return;
    }

    this.busy = true;
    this.session = undefined;
    await vscode.commands.executeCommand('setContext', 'universalDictate.recording', false);
    this.statusBar.command = undefined;
    this.statusBar.text = '$(loading~spin) Universal Dictate: transcribing locally';
    this.statusBar.tooltip = 'Speech recognition is running locally with whisper.cpp.';

    let audioPath = session.outputPath;
    try {
      audioPath = await session.stop();
      const transcript = await transcribe(this.context, audioPath);

      if (!transcript) {
        void vscode.window.showInformationMessage('Universal Dictate: no speech detected.');
        return;
      }

      this.statusBar.text = '$(check) Universal Dictate: inserting';
      await pasteIntoFocusedControl(this.context, transcript);
    } catch (error) {
      this.showError(error);
    } finally {
      await fs.promises.rm(audioPath, { force: true }).catch(() => undefined);
      this.busy = false;
      this.showIdleStatus();
    }
  }

  private updateRecordingLevel(level: number): void {
    const glyphs = '▁▂▃▄▅▆▇█';
    const clamped = Math.max(0, Math.min(1, level));
    this.levelHistory.shift();
    this.levelHistory.push(clamped);

    const signal = this.levelHistory
      .map((sample) => {
        const index = Math.max(
          0,
          Math.min(glyphs.length - 1, Math.round(Math.sqrt(sample) * (glyphs.length - 1)))
        );
        return glyphs[index];
      })
      .join('');

    this.statusBar.command = undefined;
    this.statusBar.text = `$(record) ${signal}  Ctrl+Alt+D to stop`;
    this.statusBar.tooltip =
      'Recording locally. The trace is a rolling microphone-energy history. Use the non-activating ✓/× overlay, Ctrl+Alt+D to confirm, or Esc to cancel.';
    this.statusBar.show();
  }

  private showIdleStatus(): void {
    this.statusBar.text = '$(mic) Dictate';
    this.statusBar.tooltip = 'Universal Dictate: click to start local dictation (Ctrl+Alt+D)';
    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.show();
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Universal Dictate: ${message}`);
  }
}

type LanguageQuickPickItem = vscode.QuickPickItem & { code: string };

export function activate(context: vscode.ExtensionContext): void {
  const controller = new DictationController(context);

  const toggle = vscode.commands.registerCommand('universalDictate.toggle', async () => {
    await controller.toggle();
  });

  const cancel = vscode.commands.registerCommand('universalDictate.cancel', async () => {
    await controller.cancel();
  });

  const selectLanguage = vscode.commands.registerCommand(
    'universalDictate.selectLanguage',
    async () => {
      const configuration = vscode.workspace.getConfiguration('universalDictate');
      const current = normalizeWhisperLanguage(configuration.get<string>('language', 'auto'));

      const items: LanguageQuickPickItem[] = [
        {
          label: '$(globe) Auto-detect',
          description: current === 'auto' ? 'Current' : undefined,
          detail: 'Let Whisper identify the spoken language automatically.',
          code: 'auto'
        },
        ...[...WHISPER_LANGUAGES]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(({ code, name }) => ({
            label: name,
            description: `${code}${current === code ? ' · Current' : ''}`,
            code
          }))
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select one of the 99 languages supported by the multilingual Whisper base model',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      await configuration.update('language', selected.code, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(
        `Universal Dictate language: ${getWhisperLanguageName(selected.code)}`
      );
    }
  );

  const showDiagnostics = vscode.commands.registerCommand(
    'universalDictate.showDiagnostics',
    async () => {
      const extension = vscode.extensions.getExtension('gcalpay.vscode-universal-dictate');
      const declaredKinds = extension?.packageJSON?.extensionKind;
      const extensionKind = Array.isArray(declaredKinds)
        ? declaredKinds.join(',')
        : String(declaredKinds ?? 'unspecified');
      const remoteName = vscode.env.remoteName ?? 'none';
      const configuredLanguage = normalizeWhisperLanguage(
        vscode.workspace.getConfiguration('universalDictate').get<string>('language', 'auto')
      );

      await vscode.window.showInformationMessage(
        [
          `platform=${process.platform}`,
          `arch=${process.arch}`,
          `remote=${remoteName}`,
          `extensionKind=${extensionKind}`,
          `language=${configuredLanguage}`,
          `nativePaste=${fs.existsSync(getNativePasteHelperPath(context)) ? 'available' : 'missing'}`,
          `recorder=${fs.existsSync(getRecorderPath(context)) ? 'available' : 'missing'}`,
          `whisper=${fs.existsSync(getWhisperCliPath(context)) ? 'available' : 'missing'}`,
          `model=${fs.existsSync(getModelPath(context)) ? 'installed' : 'not-installed'}`
        ].join(' | '),
        { modal: true }
      );
    }
  );

  context.subscriptions.push(controller, toggle, cancel, selectLanguage, showDiagnostics);
}

export function deactivate(): void {
  // Disposables registered with the extension context are cleaned up by VS Code.
}
