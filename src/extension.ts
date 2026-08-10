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

type VisualizationMode = 'both' | 'overlay' | 'statusBar' | 'off';

const VISUALIZATION_LABELS: Record<VisualizationMode, string> = {
  both: 'Both',
  overlay: 'Large overlay only',
  statusBar: 'Status bar only',
  off: 'Off'
};

function getConfiguredVisualization(): VisualizationMode {
  const value = vscode.workspace
    .getConfiguration('universalDictate')
    .get<string>('visualization', 'both');

  switch (value) {
    case 'overlay':
    case 'statusBar':
    case 'off':
      return value;
    case 'both':
    default:
      return 'both';
  }
}

function showsOverlay(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'overlay';
}

function showsStatusBarWaveform(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'statusBar';
}

class DictationController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly settingsStatusBar: vscode.StatusBarItem;
  private readonly levelHistory = Array<number>(9).fill(0);
  private readonly engine: DictationEngine;
  private activeVisualization: VisualizationMode = 'both';

  constructor(private readonly context: vscode.ExtensionContext) {
    // Use distinct stable IDs so VS Code can track the Dictate and settings
    // entries independently. Keep them at the low-priority end of the primary
    // group so existing workspace items such as Git Graph can remain to their left.
    this.statusBar = vscode.window.createStatusBarItem(
      'universalDictate.dictate',
      vscode.StatusBarAlignment.Left,
      0
    );
    this.statusBar.name = 'Universal Dictate';

    // A slightly lower priority keeps this separate, content-sized gear
    // immediately to the right of the Dictate item.
    this.settingsStatusBar = vscode.window.createStatusBarItem(
      'universalDictate.settings',
      vscode.StatusBarAlignment.Left,
      -1
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
      startRecorder: (onLevel) => {
        this.activeVisualization = getConfiguredVisualization();
        return RecorderSession.start(
          this.context,
          onLevel,
          showsOverlay(this.activeVisualization)
        );
      },
      transcribe: (audioPath) => transcribe(this.context, audioPath),
      insert: (transcript) => pasteIntoFocusedControl(this.context, transcript),
      onStateChanged: (state) => this.renderState(state),
      onLevel: (level) => {
        if (showsStatusBarWaveform(this.activeVisualization)) {
          this.updateRecordingLevel(level);
        }
      },
      onRecordingChanged: async (recording) => {
        await vscode.commands.executeCommand('setContext', 'universalDictate.recording', recording);
      },
      onNoSpeech: () => {
        void vscode.window.showInformationMessage('Universal Dictate: no speech detected.');
      },
      onError: (error) => this.showError(error)
    });

    this.context.subscriptions.push(this.statusBar, this.settingsStatusBar);
  }

  initialize(): void {
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
        if (showsStatusBarWaveform(this.activeVisualization)) {
          this.updateRecordingLevel(0);
        } else {
          this.showStaticRecordingStatus();
        }
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
    const glyphs = '⠀⡀⣀⣄⣤⣦⣶⣷⣿';
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

    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.text = `$(record) ${signal}  Stop (Ctrl+Alt+D)`;
    this.statusBar.tooltip = showsOverlay(this.activeVisualization)
      ? 'Recording locally. Click this status item, use the non-activating ✓ overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or × to cancel.'
      : 'Recording locally. Click this status item or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
    this.statusBar.show();
  }

  private showStaticRecordingStatus(): void {
    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.text = '$(record) Recording · Stop (Ctrl+Alt+D)';
    this.statusBar.tooltip = showsOverlay(this.activeVisualization)
      ? 'Recording locally. Click this status item, use the non-activating ✓ overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or × to cancel.'
      : 'Recording locally. Click this status item or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
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
type SettingsQuickPickItem = vscode.QuickPickItem & {
  action: 'language' | 'visualization';
};
type VisualizationQuickPickItem = vscode.QuickPickItem & { mode: VisualizationMode };

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

async function selectVisualization(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const current = getConfiguredVisualization();
  const modes: Array<{
    mode: VisualizationMode;
    detail: string;
  }> = [
    {
      mode: 'both',
      detail: 'Show the native recording overlay and the animated status-bar waveform.'
    },
    {
      mode: 'overlay',
      detail: 'Show the native recording overlay with static recording feedback in the status bar.'
    },
    {
      mode: 'statusBar',
      detail: 'Show the animated status-bar waveform without the native recording overlay.'
    },
    {
      mode: 'off',
      detail: 'Disable both waveform visualizations; keep static recording feedback in the status bar.'
    }
  ];

  const items: VisualizationQuickPickItem[] = modes.map(({ mode, detail }) => ({
    label: VISUALIZATION_LABELS[mode],
    description: current === mode ? 'Current' : undefined,
    detail,
    mode
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Audio visualization · changes apply from the next dictation session',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selected) {
    return;
  }

  await configuration.update('visualization', selected.mode, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(
    `Universal Dictate audio visualization: ${VISUALIZATION_LABELS[selected.mode]}. Applies from the next dictation session.`
  );
}

async function openSettings(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const currentLanguage = normalizeWhisperLanguage(
    configuration.get<string>('language', 'auto')
  );
  const currentVisualization = getConfiguredVisualization();

  const items: SettingsQuickPickItem[] = [
    {
      label: '$(globe) Language',
      description: getWhisperLanguageName(currentLanguage),
      detail: 'Choose the language used for local Whisper transcription.',
      action: 'language'
    },
    {
      label: '$(pulse) Audio visualization',
      description: VISUALIZATION_LABELS[currentVisualization],
      detail: 'Choose which recording visualizations are shown.',
      action: 'visualization'
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Universal Dictate Settings',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selected) {
    return;
  }

  if (selected.action === 'language') {
    await vscode.commands.executeCommand('universalDictate.selectLanguage');
    return;
  }

  await selectVisualization();
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

  // Render the idle control only after its commands are registered. This avoids
  // the startup state where the settings gear can appear before the Dictate item.
  controller.initialize();
}

export function deactivate(): void {
  // Disposables registered with the extension context are cleaned up by VS Code.
}
