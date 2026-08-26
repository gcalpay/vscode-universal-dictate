import * as fs from 'node:fs';
import * as vscode from 'vscode';
import {
  DictationController,
  getConfiguredVisualization,
  getConfiguredWaveformTimeSpanSeconds,
  VISUALIZATION_LABELS,
  VisualizationMode,
  waveformTimeSpanLabel,
  WAVEFORM_TIME_SPANS,
  WaveformTimeSpanSeconds
} from './controller';
import {
  getWhisperLanguageName,
  normalizeWhisperLanguage,
  WHISPER_LANGUAGES
} from './languages';
import { getModelPath } from './model';
import { getNativeStatusButtonPath } from './native-status-button';
import { getNativePasteHelperPath } from './paste';
import { getRecorderPath } from './recorder';
import {
  disposeWhisper,
  getWhisperCliPath,
  getWhisperServerPath,
  isWhisperWarm
} from './whisper';

type LanguageQuickPickItem = vscode.QuickPickItem & { code: string };
type SettingsQuickPickItem = vscode.QuickPickItem & {
  action: 'language' | 'visualization' | 'waveformTimeSpan';
};
type VisualizationQuickPickItem = vscode.QuickPickItem & { mode: VisualizationMode };
type WaveformTimeSpanQuickPickItem = vscode.QuickPickItem & {
  seconds: WaveformTimeSpanSeconds;
};

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
      detail: 'Show the enhanced native recording overlay and the animated status-bar waveform.'
    },
    {
      mode: 'enhancedOverlay',
      detail: 'Show the enhanced native overlay with static recording feedback in the status bar.'
    },
    {
      mode: 'statusBar',
      detail: 'Show the animated status-bar waveform without the native recording overlay.'
    },
    {
      mode: 'off',
      detail: 'Disable both waveform visualizations; use the native Stop control while recording.'
    }
  ];

  const items: VisualizationQuickPickItem[] = modes.map(({ mode, detail }) => ({
    label: VISUALIZATION_LABELS[mode],
    description: current === mode ? 'Current' : undefined,
    detail,
    mode
  }));

  const selected = await vscode.window.showQuickPick<VisualizationQuickPickItem>(items, {
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

async function selectWaveformTimeSpan(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const current = getConfiguredWaveformTimeSpanSeconds();
  const items: WaveformTimeSpanQuickPickItem[] = WAVEFORM_TIME_SPANS.map((seconds) => ({
    label: waveformTimeSpanLabel(seconds),
    description: current === seconds ? 'Current' : undefined,
    detail: 'Amount of recent audio visible across the enhanced native waveform.',
    seconds
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Waveform time span · enhanced overlay only · changes apply from next dictation',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selected) {
    return;
  }

  await configuration.update(
    'waveformTimeSpanSeconds',
    selected.seconds,
    vscode.ConfigurationTarget.Global
  );
  void vscode.window.showInformationMessage(
    `Universal Dictate waveform time span: ${waveformTimeSpanLabel(selected.seconds)}. Applies from the next dictation session.`
  );
}

async function openSettings(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const currentLanguage = normalizeWhisperLanguage(
    configuration.get<string>('language', 'auto')
  );
  const currentVisualization = getConfiguredVisualization();
  const currentWaveformTimeSpan = getConfiguredWaveformTimeSpanSeconds();

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
    },
    {
      label: '$(graph-line) Waveform time span',
      description: waveformTimeSpanLabel(currentWaveformTimeSpan),
      detail: 'Choose how much recent audio is visible across the enhanced native waveform.',
      action: 'waveformTimeSpan'
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

  if (selected.action === 'visualization') {
    await selectVisualization();
    return;
  }

  await selectWaveformTimeSpan();
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
          `nativeButtonHelper=${fs.existsSync(getNativeStatusButtonPath(context)) ? 'available' : 'missing'}`,
          `nativeButton=${controller.isNativeStatusButtonActive() ? 'active' : 'fallback'}`,
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

  // Render the fallback first, then replace it with the non-activating native
  // launcher after its process reports READY.
  controller.initialize();
}

export function deactivate(): void {
  // Disposables registered with the extension context are cleaned up by VS Code.
}
