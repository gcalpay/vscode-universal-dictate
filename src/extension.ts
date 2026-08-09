import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { DictationEngine, DictationState } from './core/dictation';
import {
  getWhisperLanguageName,
  normalizeWhisperLanguage,
  WHISPER_LANGUAGES
} from './languages';
import { getModelPath, ensureModel } from './model';
import { getNativePasteHelperPath, pasteIntoFocusedControl } from './paste';
import { getRecorderPath, RecorderSession } from './recorder';
import {
  disposeWhisper,
  getWhisperCliPath,
  getWhisperServerPath,
  isWhisperWarm,
  transcribe,
  warmWhisper
} from './whisper';

class DictationController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly settingsStatusBar: vscode.StatusBarItem;
  private readonly levelHistory = Array<number>(9).fill(0);
  private readonly engine: DictationEngine;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Keep dictation in the secondary/right status-bar group, but with enough
    // priority to sit toward the left edge of that group rather than at the
    // extreme right. Higher priority values render farther left in VS Code.
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    this.statusBar.name = 'Universal Dictate';

    // A slightly lower priority places this separate, content-sized gear
    // immediately to the right of the existing Dictate item.
    this.settingsStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      999
    );
    this.settingsStatusBar.name = 'Universal Dictate Settings';
    this.settingsStatusBar.text = '$(gear)';
    this.settingsStatusBar.tooltip = 'Universal Dictate Settings';
    this.settingsStatusBar.command = 'universalDictate.openSettings';
    this.settingsStatusBar.show();

    this.engine = new DictationEngine({
      prepare: async () => {
        await ensureModel(this.context);
      },
      warm: () => warmWhisper(this.context),
      startRecorder: (onLevel) => RecorderSession.start(this.context, onLevel),
      transcribe: (audioPath) => transcribe(this.context, audioPath),
      insert: (transcript) => pasteIntoFocusedControl(this.context, transcript),
      onStateChanged: (state) => this.renderState(state),
      onLevel: (level) => this.updateRecordingLevel(level),
      onRecordingChanged: async (recording) => {
        await vscode.commands.executeCommand('setContext', 'universalDictate.recording', recording);
      },
      onNoSpeech: () => {
        void vscode.window.showInformationMessage('Universal Dictate: no speech detected.');
      },
      onError: (error) => this.showError(error)
    });

    this.context.subscriptions.push(this.statusBar, this.settingsStatusBar);
    this.showIdleStatus();
  }

  async toggle(): Promise<void> {
    if (process.platform !== 'win32') {
      void vscode.window.showErrorMessage(
        `Universal Dictate must run in the Windows UI extension host. Current platform: ${process.platform}.`
      );
      return;
    }

    await this.engine.toggle();
  }

  async cancel(): Promise<void> {
    await this.engine.cancel();
  }

  dispose(): void {
    this.engine.dispose();
    this.statusBar.dispose();
    this.settingsStatusBar.dispose();
  }

  private renderState(state: DictationState): void {
    switch (state) {
      case 'idle':
        this.showIdleStatus();
        return;
      case 'preparing':
        this.levelHistory.fill(0);
        this.statusBar.command = undefined;
        this.statusBar.text = '$(loading~spin) Universal Dictate: preparing local model';
        this.statusBar.tooltip =
          'The first run downloads the local Whisper model. Audio is not uploaded.';
        this.statusBar.show();
        return;
      case 'opening-microphone':
        this.statusBar.text = '$(loading~spin) Universal Dictate: opening microphone';
        return;
      case 'recording':
        this.updateRecordingLevel(0);
        return;
      case 'cancelling':
        this.statusBar.command = undefined;
        this.statusBar.text = '$(circle-slash) Universal Dictate: cancelling';
        return;
      case 'transcribing':
        this.statusBar.command = undefined;
        this.statusBar.text = '$(loading~spin) Universal Dictate: transcribing locally';
        this.statusBar.tooltip = 'Speech recognition is running locally with whisper.cpp.';
        return;
      case 'inserting':
        this.statusBar.text = '$(check) Universal Dictate: inserting';
        return;
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

async function selectLanguage(): Promise<void> {
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

async function openSettings(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const currentLanguage = normalizeWhisperLanguage(
    configuration.get<string>('language', 'auto')
  );

  const selected = await vscode.window.showQuickPick(
    [
      {
        label: '$(globe) Language',
        description: getWhisperLanguageName(currentLanguage),
        detail: 'Choose the language used for local Whisper transcription.'
      }
    ],
    {
      placeHolder: 'Universal Dictate Settings'
    }
  );

  if (!selected) {
    return;
  }

  await vscode.commands.executeCommand('universalDictate.selectLanguage');
}

export function activate(context: vscode.ExtensionContext): void {
  const controller = new DictationController(context);

  const toggle = vscode.commands.registerCommand('universalDictate.toggle', async () => {
    await controller.toggle();
  });

  const cancel = vscode.commands.registerCommand('universalDictate.cancel', async () => {
    await controller.cancel();
  });

  const selectLanguageCommand = vscode.commands.registerCommand(
    'universalDictate.selectLanguage',
    selectLanguage
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    'universalDictate.openSettings',
    openSettings
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
          `whisperCli=${fs.existsSync(getWhisperCliPath(context)) ? 'available' : 'missing'}`,
          `whisperServer=${fs.existsSync(getWhisperServerPath(context)) ? 'available' : 'missing'}`,
          `worker=${isWhisperWarm() ? 'warm' : 'cold'}`,
          `model=${fs.existsSync(getModelPath(context)) ? 'installed' : 'not-installed'}`
        ].join(' | '),
        { modal: true }
      );
    }
  );

  const whisperDisposable: vscode.Disposable = { dispose: disposeWhisper };
  context.subscriptions.push(
    controller,
    toggle,
    cancel,
    selectLanguageCommand,
    openSettingsCommand,
    showDiagnostics,
    whisperDisposable
  );
}

export function deactivate(): void {
  // Disposables registered with the extension context are cleaned up by VS Code.
}
