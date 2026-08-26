import * as vscode from 'vscode';
import { DictationEngine, DictationState } from './core/dictation';
import { getModelPath, ensureModel } from './model';
import {
  NativeStatusButton,
  NativeStatusButtonState,
  NativeStatusButtonTheme
} from './native-status-button';
import { pasteIntoFocusedControl } from './paste';
import { RecorderSession } from './recorder';
import {
  transcribe,
  warmWhisper
} from './whisper';

export type VisualizationMode = 'both' | 'enhancedOverlay' | 'statusBar' | 'off';
export type WaveformTimeSpanSeconds = 1 | 3 | 5 | 10 | 20;

export const VISUALIZATION_LABELS: Record<VisualizationMode, string> = {
  both: 'Both',
  enhancedOverlay: 'Enhanced overlay',
  statusBar: 'Status bar only',
  off: 'Off'
};

export const WAVEFORM_TIME_SPANS: readonly WaveformTimeSpanSeconds[] = [1, 3, 5, 10, 20];

export function getConfiguredVisualization(): VisualizationMode {
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

export function getConfiguredWaveformTimeSpanSeconds(): WaveformTimeSpanSeconds {
  const value = vscode.workspace
    .getConfiguration('universalDictate')
    .get<number>('waveformTimeSpanSeconds', 1);

  return WAVEFORM_TIME_SPANS.includes(value as WaveformTimeSpanSeconds)
    ? (value as WaveformTimeSpanSeconds)
    : 1;
}

export function waveformTimeSpanLabel(seconds: WaveformTimeSpanSeconds): string {
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

function showsOverlay(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'enhancedOverlay';
}

function showsStatusBarWaveform(mode: VisualizationMode): boolean {
  return mode === 'both' || mode === 'statusBar';
}

function nativeStatusButtonTheme(theme: vscode.ColorTheme): NativeStatusButtonTheme {
  switch (theme.kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'high_contrast';
    default:
      return 'dark';
  }
}

export class DictationController implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;
  private readonly settingsStatusBar: vscode.StatusBarItem;
  private readonly levelHistory = Array<number>(9).fill(0);
  private readonly engine: DictationEngine;
  private activeVisualization: VisualizationMode = 'enhancedOverlay';
  private currentState: DictationState = 'idle';
  private nativeStatusButton: NativeStatusButton | undefined;
  private nativeStatusButtonFocusSubscription: vscode.Disposable | undefined;
  private nativeStatusButtonThemeSubscription: vscode.Disposable | undefined;
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    // The literal VS Code status item remains as a progress indicator and as a
    // fallback if the bundled native launcher is unavailable. VS Code does not
    // expose its pointer-down behavior to extensions, so the normal idle action
    // is provided by the non-activating native button instead.
    this.statusBar = vscode.window.createStatusBarItem(
      'universalDictate.dictate',
      vscode.StatusBarAlignment.Right,
      0
    );
    this.statusBar.name = 'Universal Dictate';

    // A slightly lower priority keeps this separate, content-sized gear
    // immediately to the right of the Dictate item when the fallback is shown.
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
        await ensureModel(this.context);
      },
      warm: () => warmWhisper(this.context),
      startRecorder: (onLevel) => {
        this.activeVisualization = getConfiguredVisualization();
        return RecorderSession.start(
          this.context,
          onLevel,
          showsOverlay(this.activeVisualization),
          'enhanced',
          getConfiguredWaveformTimeSpanSeconds()
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
    void this.initializeNativeStatusButton();
  }

  isNativeStatusButtonActive(): boolean {
    return this.nativeStatusButton !== undefined;
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
    this.disposed = true;
    this.nativeStatusButtonFocusSubscription?.dispose();
    this.nativeStatusButtonThemeSubscription?.dispose();
    this.nativeStatusButton?.dispose();
    this.nativeStatusButton = undefined;
    this.engine.dispose();
    this.statusBar.dispose();
    this.settingsStatusBar.dispose();
  }

  private async initializeNativeStatusButton(): Promise<void> {
    if (process.platform !== 'win32') {
      return;
    }

    try {
      const button = await NativeStatusButton.start(this.context, () => {
        void this.toggle();
      });

      if (this.disposed) {
        button.dispose();
        return;
      }

      this.nativeStatusButton = button;
      button.onUnavailable(() => this.handleNativeStatusButtonUnavailable(button));
      this.nativeStatusButtonFocusSubscription = vscode.window.onDidChangeWindowState((state) => {
        button.setFocused(state.focused);
      });
      this.nativeStatusButtonThemeSubscription = vscode.window.onDidChangeActiveColorTheme(
        (theme) => button.setTheme(nativeStatusButtonTheme(theme))
      );

      button.setTheme(nativeStatusButtonTheme(vscode.window.activeColorTheme));
      button.setState(this.getNativeStatusButtonState(this.currentState));
      button.setFocused(vscode.window.state.focused);
      this.renderState(this.currentState);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Universal Dictate native status button unavailable: ${message}`);
      this.renderState(this.currentState);
    }
  }

  private handleNativeStatusButtonUnavailable(button: NativeStatusButton): void {
    if (this.nativeStatusButton !== button) {
      return;
    }

    this.nativeStatusButtonFocusSubscription?.dispose();
    this.nativeStatusButtonThemeSubscription?.dispose();
    this.nativeStatusButtonFocusSubscription = undefined;
    this.nativeStatusButtonThemeSubscription = undefined;
    this.nativeStatusButton.dispose();
    this.nativeStatusButton = undefined;
    this.renderState(this.currentState);
  }

  private getNativeStatusButtonState(state: DictationState): NativeStatusButtonState {
    if (state === 'idle') {
      return 'idle';
    }

    if (state === 'recording' && !showsOverlay(this.activeVisualization)) {
      return 'recording';
    }

    return 'hidden';
  }

  private renderState(state: DictationState): void {
    this.currentState = state;
    this.nativeStatusButton?.setState(this.getNativeStatusButtonState(state));

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
        this.statusBar.command = undefined;
        this.statusBar.text = '$(loading~spin) Universal Dictate: opening microphone';
        this.statusBar.tooltip = 'Universal Dictate is opening the Windows microphone.';
        this.statusBar.show();
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
        this.statusBar.tooltip = 'Universal Dictate is cancelling the current recording.';
        this.statusBar.show();
        return;
      case 'transcribing':
        this.statusBar.command = undefined;
        this.statusBar.text = '$(loading~spin) Universal Dictate: transcribing locally';
        this.statusBar.tooltip = 'Speech recognition is running locally with whisper.cpp.';
        this.statusBar.show();
        return;
      case 'inserting':
        this.statusBar.command = undefined;
        this.statusBar.text = '$(check) Universal Dictate: inserting';
        this.statusBar.tooltip = 'Universal Dictate is inserting the transcript into the focused control.';
        this.statusBar.show();
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

    this.statusBar.command = this.nativeStatusButton ? undefined : 'universalDictate.toggle';
    this.statusBar.text = `$(record) ${signal}  Stop (Ctrl+Alt+D)`;
    if (this.nativeStatusButton) {
      this.statusBar.tooltip = showsOverlay(this.activeVisualization)
        ? 'Recording locally. Use Insert in the non-activating overlay or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.'
        : 'Recording locally. Use the non-activating Stop button or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
    } else {
      this.statusBar.tooltip = showsOverlay(this.activeVisualization)
        ? 'Recording locally. Click this status item, use Insert in the non-activating overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.'
        : 'Recording locally. Click this status item or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
    }
    this.statusBar.show();
  }

  private showStaticRecordingStatus(): void {
    if (this.nativeStatusButton) {
      if (!showsOverlay(this.activeVisualization)) {
        this.statusBar.hide();
        return;
      }

      this.statusBar.command = undefined;
      this.statusBar.text = '$(record) Recording (Ctrl+Alt+D)';
      this.statusBar.tooltip =
        'Recording locally. Use Insert in the non-activating overlay or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.';
      this.statusBar.show();
      return;
    }

    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.text = '$(record) Recording · Stop (Ctrl+Alt+D)';
    this.statusBar.tooltip = showsOverlay(this.activeVisualization)
      ? 'Recording locally. Click this status item, use Insert in the non-activating overlay, or press Ctrl+Alt+D to stop and transcribe. Press Esc or Discard to cancel.'
      : 'Recording locally. Click this status item or press Ctrl+Alt+D to stop and transcribe. Press Esc to cancel.';
    this.statusBar.show();
  }

  private showIdleStatus(): void {
    if (this.nativeStatusButton) {
      this.statusBar.hide();
      return;
    }

    this.statusBar.text = '$(mic) Dictate';
    this.statusBar.tooltip =
      'Universal Dictate fallback: click to start local dictation (Ctrl+Alt+D)';
    this.statusBar.command = 'universalDictate.toggle';
    this.statusBar.show();
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Universal Dictate: ${message}`);
  }
}
