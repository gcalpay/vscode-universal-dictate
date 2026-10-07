import * as fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as vscode from 'vscode';
import { DictationEngine, DictationState, type DictationLatencyEvent, type DictationLatencyStage, type DictationSession, type PreviewControl } from './core/dictation';
import { PreviewCoordinator } from './core/preview-coordinator';
import type { WhisperInferencePath } from './core/whisper';
import { TranscriptRecoveryController } from './transcript-recovery';
import { normalizeOverlaySize, OVERLAY_SIZES, type OverlaySize } from './core/overlay-size';
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
  warmWhisper,
  previewWhisper
} from './whisper';

type VisualizationMode = 'both' | 'enhancedOverlay' | 'statusBar' | 'off';
type WaveformTimeSpanSeconds = 1 | 3 | 5 | 10 | 20;

const VISUALIZATION_LABELS: Record<VisualizationMode, string> = {
  both: 'Both',
  enhancedOverlay: 'Enhanced overlay',
  statusBar: 'Status bar only',
  off: 'Off'
};

const OVERLAY_SIZE_LABELS: Record<OverlaySize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large'
};

const WAVEFORM_TIME_SPANS: readonly WaveformTimeSpanSeconds[] = [1, 3, 5, 10, 20];
const LATENCY_STAGES: readonly DictationLatencyStage[] = ['T0','T1','T2','T3','T4','T5','T6'];

function getConfiguredVisualization(): VisualizationMode {
  const value = vscode.workspace
    .getConfiguration('universalDictate')
    .get<string>('visualization', 'enhancedOverlay');

  switch (value) {
    // Compatibility for users who saved the removed legacy overlay mode.
    case 'overlay':
      return 'enhancedOverlay';
    case 'both':
    case 'enhancedOverlay':
    case 'statusBar':
    case 'off':
      return value;
    default:
      return 'enhancedOverlay';
  }
}

function getConfiguredOverlaySize(): OverlaySize {
  return normalizeOverlaySize(
    vscode.workspace.getConfiguration('universalDictate').get<string>('overlaySize', 'medium')
  );
}

function getConfiguredLivePreview(): boolean {
  return vscode.workspace.getConfiguration('universalDictate').get<unknown>('livePreview', false) === true;
}

function getConfiguredOverwriteClipboard(): boolean {
  return vscode.workspace.getConfiguration('universalDictate').get<unknown>('overwriteClipboard', false) === true;
}

function getConfiguredWaveformTimeSpanSeconds(): WaveformTimeSpanSeconds {
  const value = vscode.workspace
    .getConfiguration('universalDictate')
    .get<number>('waveformTimeSpanSeconds', 10);

  return WAVEFORM_TIME_SPANS.includes(value as WaveformTimeSpanSeconds)
    ? (value as WaveformTimeSpanSeconds)
    : 10;
}

function waveformTimeSpanLabel(seconds: WaveformTimeSpanSeconds): string {
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

function showsOverlay(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'enhancedOverlay';
}

function showsStatusBarWaveform(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'statusBar';
}

class DictationController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly settingsStatusBar: vscode.StatusBarItem;
  private readonly levelHistory = Array<number>(9).fill(0);
  private readonly engine: DictationEngine;
  private readonly latencyOutput: vscode.OutputChannel;
  readonly recovery: TranscriptRecoveryController;
  private activeVisualization: VisualizationMode = 'enhancedOverlay';
  private activeOverwriteClipboard = false;
  private activeLivePreview = false;
  private activeLanguage = 'en';
  private activeOverlaySize: OverlaySize = 'medium';
  private activeWaveformSpan: WaveformTimeSpanSeconds = 10;
  private latencyTrace: { operationId: number; stages: Partial<Record<DictationLatencyStage, number>>; preview: boolean; language: string; warm: boolean; previewActiveAtStop: boolean; previewActiveForMs?: number; sincePreviewFinishedMs?: number; path?: WhisperInferencePath } | undefined;
  private previewInferenceStartedAt: number | undefined;
  private previewInferenceFinishedAt: number | undefined;
  private lastLatencySummary = 'not measured';

  constructor(private readonly context: vscode.ExtensionContext) {
    // Use distinct stable IDs so VS Code can track the Dictate and settings
    // entries independently. Keep them at the low-priority end of the right
    // group so their relative order stays stable without relying on neighbors.
    this.statusBar = vscode.window.createStatusBarItem(
      'universalDictate.dictate',
      vscode.StatusBarAlignment.Right,
      0
    );
    this.statusBar.name = 'Universal Dictate';
    this.latencyOutput = vscode.window.createOutputChannel('Universal Dictate Latency');

    // A slightly lower priority keeps this separate, content-sized gear
    // immediately to the right of the Dictate item.
    this.settingsStatusBar = vscode.window.createStatusBarItem(
      'universalDictate.settings',
      vscode.StatusBarAlignment.Right,
      -1
    );
    this.settingsStatusBar.name = 'Universal Dictate Settings';
    this.settingsStatusBar.text = '$(gear)';
    this.settingsStatusBar.tooltip = 'Universal Dictate Settings';
    this.settingsStatusBar.command = 'universalDictate.openSettings';
    this.settingsStatusBar.show();

    this.engine = new DictationEngine({
      prepare: async () => {
        this.activeOverwriteClipboard = getConfiguredOverwriteClipboard();
        this.activeVisualization = getConfiguredVisualization();
        this.activeLivePreview = getConfiguredLivePreview() && showsOverlay(this.activeVisualization);
        this.activeLanguage = normalizeWhisperLanguage(vscode.workspace.getConfiguration('universalDictate').get<string>('language', 'en'));
        this.activeOverlaySize = getConfiguredOverlaySize();
        this.activeWaveformSpan = getConfiguredWaveformTimeSpanSeconds();
        this.previewInferenceStartedAt = undefined;
        this.previewInferenceFinishedAt = undefined;
        await ensureModel(this.context);
      },
      warm: () => warmWhisper(this.context),
      startRecorder: (onLevel, signal) => {
        return RecorderSession.start(
          this.context,
          onLevel,
          showsOverlay(this.activeVisualization),
          'enhanced',
          this.activeWaveformSpan,
          this.activeOverlaySize,
          signal,
          this.activeLivePreview
        );
      },
      transcribe: (audioPath) => transcribe(this.context, audioPath, this.activeLanguage, path => { if (this.latencyTrace) this.latencyTrace.path = path; }),
      startPreview: (session, signal) => this.startPreview(session, signal),
      insert: (transcript, signal) => pasteIntoFocusedControl(this.context, transcript, signal, this.activeOverwriteClipboard),
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
      onError: (error) => this.showError(error),
      onLatencyEvent: event => this.recordLatency(event)
    });

    this.recovery = new TranscriptRecoveryController(this.engine);
    this.context.subscriptions.push(this.statusBar, this.settingsStatusBar);
  }

  private startPreview(session: DictationSession, signal: AbortSignal): PreviewControl | undefined {
    if (!this.activeLivePreview || !session.previewSessionId || !session.acquirePreview || !session.showPreview) return undefined;
    const coordinator = new PreviewCoordinator({ sessionId: session.previewSessionId,
      language: this.activeLanguage,
      acquire: previewSignal => session.acquirePreview!(previewSignal),
      decode: async (audio, language, previewSignal) => {
        const startedAt = performance.now();
        this.previewInferenceStartedAt = startedAt;
        try {
          return await previewWhisper(this.context, audio, language, previewSignal);
        } finally {
          if (this.previewInferenceStartedAt === startedAt) this.previewInferenceStartedAt = undefined;
          this.previewInferenceFinishedAt = performance.now();
        }
      },
      onPreview: update => { if (!signal.aborted) session.showPreview!(update); },
      onFailure: () => { if (!signal.aborted) void vscode.window.showInformationMessage('Universal Dictate: live preview stopped. Final dictation remains available.'); }
    });
    const abort = () => { void coordinator.stop(); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); return undefined; }
    coordinator.start();
    return {
      pause: () => coordinator.pause(),
      resume: () => coordinator.resume(),
      stop: () => { signal.removeEventListener('abort', abort); return coordinator.stop(); }
    };
  }

  initialize(): void {
    this.showIdleStatus();
  }

  getLastLatencySummary(): string { return this.lastLatencySummary; }

  async toggle(): Promise<void> {
    if (process.platform !== 'win32') {
      void vscode.window.showErrorMessage(
        `Universal Dictate must run in the Windows UI extension host. Current platform: ${process.platform}.`
      );
      return;
    }

    await this.engine.toggle();
  }

  async togglePause(): Promise<void> { await this.engine.togglePause(); }

  async cancel(): Promise<void> {
    await this.engine.cancel();
  }

  dispose(): void {
    this.recovery.dispose();
    this.engine.dispose();
    this.statusBar.dispose();
    this.settingsStatusBar.dispose();
    this.latencyOutput.dispose();
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
      case 'pausing':
      case 'resuming':
      case 'paused':
        this.statusBar.command = 'universalDictate.toggle';
        this.statusBar.text = state === 'paused' ? '$(debug-pause) Paused · Stop (Ctrl+Alt+D)'
          : `$(loading~spin) ${state === 'pausing' ? 'Pausing' : 'Resuming'} · Stop (Ctrl+Alt+D)`;
        this.statusBar.tooltip = 'Paused audio is not saved or transcribed; the microphone device stays open. Ctrl+Alt+P to pause/resume, Ctrl+Alt+D to finish, Esc to discard.';
        this.statusBar.show();
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
        this.statusBar.command = undefined;
        this.statusBar.text = '$(check) Universal Dictate: inserting';
        return;
    }
  }

  private recordLatency(event: DictationLatencyEvent): void {
    if (event.stage === 'T0') {
      const activeStartedAt = this.previewInferenceStartedAt;
      const finishedAt = this.previewInferenceFinishedAt;
      this.latencyTrace = {
        operationId: event.operationId,
        stages: {},
        preview: this.activeLivePreview,
        language: this.activeLanguage,
        warm: isWhisperWarm(),
        previewActiveAtStop: activeStartedAt !== undefined,
        previewActiveForMs: activeStartedAt === undefined ? undefined : Math.max(0, event.atMs - activeStartedAt),
        sincePreviewFinishedMs: activeStartedAt !== undefined || finishedAt === undefined ? undefined : Math.max(0, event.atMs - finishedAt)
      };
    }
    const trace = this.latencyTrace;
    if (!trace || trace.operationId !== event.operationId) return;
    trace.stages[event.stage] = event.atMs;
    if (event.stage !== 'T6') return;
    const elapsed = (a: DictationLatencyStage, b: DictationLatencyStage) => {
      const x = trace.stages[a], y = trace.stages[b];
      return x === undefined || y === undefined ? 'n/a' : `${Math.max(0, y - x).toFixed(1)}ms`;
    };
    const last = LATENCY_STAGES.filter(stage => trace.stages[stage] !== undefined).at(-1) ?? 'T0';
    const summary = [
      `preview=${trace.preview ? 'on' : 'off'}`,
      `language=${trace.language}`,
      `workerAtStop=${trace.warm ? 'warm' : 'cold'}`,
      `path=${trace.path ?? 'unknown'}`,
      `previewActiveAtStop=${trace.previewActiveAtStop ? 'yes' : 'no'}`,
      `previewActiveFor=${trace.previewActiveForMs === undefined ? 'n/a' : `${trace.previewActiveForMs.toFixed(1)}ms`}`,
      `sincePreviewFinished=${trace.sincePreviewFinishedMs === undefined ? 'n/a' : `${trace.sincePreviewFinishedMs.toFixed(1)}ms`}`,
      `T0-T1=${elapsed('T0','T1')}`,
      `T1-T2=${elapsed('T1','T2')}`,
      `T2-T3=${elapsed('T2','T3')}`,
      `T3-T4=${elapsed('T3','T4')}`,
      `T4-T5=${elapsed('T4','T5')}`,
      `T5-T6=${elapsed('T5','T6')}`,
      `T0-${last}=${elapsed('T0', last)}`
    ].join(' | ');
    this.lastLatencySummary = summary;
    this.latencyOutput.appendLine(`[${new Date().toISOString()}] ${summary}`);
    this.latencyTrace = undefined;
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
      ? 'Recording locally. Click this status item, use Insert in the non-activating overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.'
      : 'Recording locally. Click this status item or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
    this.statusBar.show();
  }

  private showStaticRecordingStatus(): void {
    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.text = '$(record) Recording · Stop (Ctrl+Alt+D)';
    this.statusBar.tooltip = showsOverlay(this.activeVisualization)
      ? 'Recording locally. Click this status item, use Insert in the non-activating overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.'
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
  action: 'language' | 'visualization' | 'overlaySize' | 'waveformTimeSpan' | 'overwriteClipboard' | 'livePreview';
};
type VisualizationQuickPickItem = vscode.QuickPickItem & { mode: VisualizationMode };
type OverlaySizeQuickPickItem = vscode.QuickPickItem & { size: OverlaySize };
type WaveformTimeSpanQuickPickItem = vscode.QuickPickItem & {
  seconds: WaveformTimeSpanSeconds;
};

async function selectLanguage(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const current = normalizeWhisperLanguage(configuration.get<string>('language', 'en'));

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

async function selectOverlaySize(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const current = getConfiguredOverlaySize();
  const items: OverlaySizeQuickPickItem[] = OVERLAY_SIZES.map((size) => ({
    label: OVERLAY_SIZE_LABELS[size],
    description: current === size ? 'Current' : undefined,
    detail:
      size === 'large'
        ? 'Use the current large enhanced recording overlay.'
        : `Use the ${size} enhanced recording overlay.`,
    size
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Overlay size · enhanced overlay only · changes apply from next dictation',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!selected) {
    return;
  }

  await configuration.update('overlaySize', selected.size, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(
    `Universal Dictate overlay size: ${OVERLAY_SIZE_LABELS[selected.size]}. Applies from the next dictation session.`
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
    configuration.get<string>('language', 'en')
  );
  const currentVisualization = getConfiguredVisualization();
  const currentOverlaySize = getConfiguredOverlaySize();
  const currentWaveformTimeSpan = getConfiguredWaveformTimeSpanSeconds();
  const overwriteClipboard = getConfiguredOverwriteClipboard();

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
      label: '$(screen-full) Overlay size',
      description: OVERLAY_SIZE_LABELS[currentOverlaySize],
      detail: 'Choose Small, Medium or Large for the enhanced native recording overlay.',
      action: 'overlaySize'
    },
    {
      label: '$(graph-line) Waveform time span',
      description: waveformTimeSpanLabel(currentWaveformTimeSpan),
      detail: 'Choose how much recent audio is visible across the enhanced native waveform.',
      action: 'waveformTimeSpan'
    },
    {
      label: '$(clippy) Overwrite clipboard',
      description: overwriteClipboard ? 'On' : 'Off (default)',
      detail: 'Always insert automatically. On also copies the transcript to the clipboard; Off never accesses it. Click to toggle for the next dictation.',
      action: 'overwriteClipboard'
    },
    {
      label: '$(comment-discussion) Live preview',
      description: getConfiguredLivePreview() ? (showsOverlay(currentVisualization) ? 'On' : 'On (overlay required)') : 'Off (default)',
      detail: 'Show provisional text while recording in the enhanced overlay. Off performs no preview decoding. Click to toggle for the next recording.',
      action: 'livePreview'
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

  if (selected.action === 'overlaySize') {
    await selectOverlaySize();
    return;
  }

  if (selected.action === 'livePreview') {
    const next = !getConfiguredLivePreview();
    await configuration.update('livePreview', next, vscode.ConfigurationTarget.Global);
    // Report effective value, since a workspace override can supersede User settings.
    const effective = getConfiguredLivePreview();
    void vscode.window.showInformationMessage(
      `Universal Dictate: live preview ${effective ? 'On' : 'Off'}. Applies from the next recording.${effective !== next ? ' A workspace setting overrides the user setting.' : ''}`
    );
    return;
  }


  if (selected.action === 'overwriteClipboard') {
    // Toggle the latest setting, not a stale value from when the picker opened.
    const next = !getConfiguredOverwriteClipboard();
    await configuration.update('overwriteClipboard', next, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
      `Universal Dictate: overwrite clipboard ${next ? 'On' : 'Off'}. Applies from the next dictation.`
    );
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

  const pauseResume = vscode.commands.registerCommand('universalDictate.pauseResume', async () => {
    await controller.togglePause();
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
        vscode.workspace.getConfiguration('universalDictate').get<string>('language', 'en')
      );

      await vscode.window.showInformationMessage(
        [
          `platform=${process.platform}`,
          `arch=${process.arch}`,
          `remote=${remoteName}`,
          `extensionKind=${extensionKind}`,
          `language=${configuredLanguage}`,
          `overlaySize=${getConfiguredOverlaySize()}`,
          `waveformSeconds=${getConfiguredWaveformTimeSpanSeconds()}`,
          `livePreview=${getConfiguredLivePreview()}`,
          `previewEffective=${getConfiguredLivePreview() && showsOverlay(getConfiguredVisualization())}`,
          `overwriteClipboard=${getConfiguredOverwriteClipboard()}`,
          'insertion=unicode-input-v1',
          `nativePaste=${fs.existsSync(getNativePasteHelperPath(context)) ? 'available' : 'missing'}`,
          `recorder=${fs.existsSync(getRecorderPath(context)) ? 'available' : 'missing'}`,
          `whisperCli=${fs.existsSync(getWhisperCliPath(context)) ? 'available' : 'missing'}`,
          `whisperServer=${fs.existsSync(getWhisperServerPath(context)) ? 'available' : 'missing'}`,
          `worker=${isWhisperWarm() ? 'warm' : 'cold'}`,
          `model=${fs.existsSync(getModelPath(context)) ? 'installed' : 'not-installed'}`,
          `lastLatency=${controller.getLastLatencySummary()}`
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
    pauseResume,
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
