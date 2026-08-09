import * as fs from 'node:fs';

export type DictationRecorderAction = 'stop' | 'cancel';

export interface DictationSession {
  readonly outputPath: string;
  onAction(listener: (action: DictationRecorderAction) => void): void;
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export type DictationState =
  | 'idle'
  | 'preparing'
  | 'opening-microphone'
  | 'recording'
  | 'cancelling'
  | 'transcribing'
  | 'inserting';

export interface DictationEngineOptions {
  readonly prepare: () => Promise<void>;
  readonly warm: () => Promise<void>;
  readonly startRecorder: (onLevel: (level: number) => void) => Promise<DictationSession>;
  readonly transcribe: (audioPath: string) => Promise<string>;
  readonly insert: (transcript: string) => Promise<void>;
  readonly onStateChanged?: (state: DictationState) => void;
  readonly onLevel?: (level: number) => void;
  readonly onRecordingChanged?: (recording: boolean) => PromiseLike<void> | void;
  readonly onNoSpeech?: () => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Host-neutral dictation workflow shared by editor and standalone frontends.
 *
 * UI rendering, command registration, storage paths and transcription settings
 * remain host-owned. This engine owns only the record -> transcribe -> insert
 * lifecycle, including the native overlay stop/cancel race handling.
 */
export class DictationEngine {
  private session: DictationSession | undefined;
  private busy = false;

  constructor(private readonly options: DictationEngineOptions) {}

  async toggle(): Promise<void> {
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
    await this.notifyRecordingChanged(false);
    this.emitState('cancelling');

    try {
      await session.cancel();
    } finally {
      this.busy = false;
      this.emitState('idle');
    }
  }

  dispose(): void {
    if (this.session) {
      void this.session.cancel();
      this.session = undefined;
    }
  }

  private async startRecording(): Promise<void> {
    this.busy = true;
    this.emitState('preparing');

    try {
      await this.options.prepare();

      // Warm inference in parallel with recording. A warm-up failure is not
      // fatal because transcription retains its one-shot fallback path.
      void this.options.warm().catch(() => undefined);

      this.emitState('opening-microphone');
      const session = await this.options.startRecorder((level) => {
        this.options.onLevel?.(level);
      });
      this.session = session;
      session.onAction((action) => this.handleRecorderAction(session, action));

      await this.notifyRecordingChanged(true);
      this.emitState('recording');
    } catch (error) {
      this.session = undefined;
      await this.notifyRecordingChanged(false);
      this.options.onError?.(error);
      this.emitState('idle');
    } finally {
      this.busy = false;
    }
  }

  private handleRecorderAction(session: DictationSession, action: DictationRecorderAction): void {
    if (this.session !== session) {
      return;
    }

    // READY can be followed by an extremely fast overlay click while startup
    // is still finishing. Preserve that action rather than silently dropping it.
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
    await this.notifyRecordingChanged(false);
    this.emitState('transcribing');

    let audioPath = session.outputPath;
    try {
      audioPath = await session.stop();
      const transcript = await this.options.transcribe(audioPath);

      if (!transcript) {
        this.options.onNoSpeech?.();
        return;
      }

      this.emitState('inserting');
      await this.options.insert(transcript);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      await fs.promises.rm(audioPath, { force: true }).catch(() => undefined);
      this.busy = false;
      this.emitState('idle');
    }
  }

  private emitState(state: DictationState): void {
    this.options.onStateChanged?.(state);
  }

  private async notifyRecordingChanged(recording: boolean): Promise<void> {
    await this.options.onRecordingChanged?.(recording);
  }
}
