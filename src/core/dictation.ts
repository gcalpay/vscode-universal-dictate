import * as fs from 'node:fs';

export type DictationRecorderAction = 'stop' | 'cancel';
export type TranscriptRecoveryResult = 'completed' | 'empty' | 'busy' | 'disposed';

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
 * remain host-owned. Completed transcripts are retained only in this engine's
 * memory, independently of whether automatic or explicit insertion succeeds.
 */
export class DictationEngine {
  private session: DictationSession | undefined;
  private busy = false;
  private disposed = false;
  private lastTranscript: string | undefined;

  constructor(private readonly options: DictationEngineOptions) {}

  getLastTranscript(): string | undefined {
    return this.lastTranscript;
  }

  clearLastTranscript(): void {
    this.lastTranscript = undefined;
  }

  insertLastTranscript(): Promise<TranscriptRecoveryResult> {
    return this.useLastTranscript((text) => this.options.insert(text), true);
  }

  copyLastTranscript(
    copy: (text: string) => PromiseLike<void>
  ): Promise<TranscriptRecoveryResult> {
    return this.useLastTranscript(copy, false);
  }

  async toggle(): Promise<void> {
    if (this.disposed) {
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
    if (this.disposed || !session || this.busy) {
      return;
    }

    this.busy = true;
    this.session = undefined;
    try {
      await this.notifyRecordingChanged(false);
      this.emitState('cancelling');
      await session.cancel();
    } catch (error) {
      this.reportError(error);
    } finally {
      this.busy = false;
      this.emitState('idle');
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearLastTranscript();
    if (this.session) {
      void this.session.cancel().catch(() => undefined);
      this.session = undefined;
    }
  }

  private async useLastTranscript(
    action: (text: string) => PromiseLike<void>,
    inserting: boolean
  ): Promise<TranscriptRecoveryResult> {
    if (this.disposed) {
      return 'disposed';
    }
    // Do not queue a paste/copy that might run later at an unintended target.
    if (this.busy || this.session) {
      return 'busy';
    }
    const transcript = this.lastTranscript;
    if (transcript === undefined) {
      return 'empty';
    }

    // Use the same lock as normal dictation, including while Copy writes.
    this.busy = true;
    try {
      if (inserting) {
        this.emitState('inserting');
      }
      if (this.disposed) {
        return 'disposed';
      }
      await action(transcript);
      return this.disposed ? 'disposed' : 'completed';
    } finally {
      this.busy = false;
      if (inserting) {
        this.emitState('idle');
      }
    }
  }

  private async startRecording(): Promise<void> {
    this.busy = true;
    this.emitState('preparing');

    try {
      await this.options.prepare();
      if (this.disposed) {
        return;
      }

      // Warm inference in parallel with recording. A warm-up failure is not
      // fatal because transcription retains its one-shot fallback path.
      void this.options.warm().catch(() => undefined);

      this.emitState('opening-microphone');
      const session = await this.options.startRecorder((level) => {
        if (!this.disposed) {
          this.options.onLevel?.(level);
        }
      });
      if (this.disposed) {
        await session.cancel();
        return;
      }
      this.session = session;
      session.onAction((action) => this.handleRecorderAction(session, action));

      await this.notifyRecordingChanged(true);
      this.emitState('recording');
    } catch (error) {
      this.session = undefined;
      await this.notifyRecordingChanged(false);
      this.reportError(error);
      this.emitState('idle');
    } finally {
      this.busy = false;
    }
  }

  private handleRecorderAction(session: DictationSession, action: DictationRecorderAction): void {
    if (this.disposed || this.session !== session) {
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
    if (this.disposed || !session || this.busy) {
      return;
    }

    this.busy = true;
    this.session = undefined;
    let audioPath = session.outputPath;
    try {
      await this.notifyRecordingChanged(false);
      this.emitState('transcribing');
      audioPath = await session.stop();
      if (this.disposed) {
        return;
      }
      const transcript = await this.options.transcribe(audioPath);
      if (this.disposed) {
        return;
      }

      if (transcript.trim().length === 0) {
        this.options.onNoSpeech?.();
        return;
      }

      // Preserve the exact text, including whitespace/newlines, before any
      // insertion callback can fail. Silence never erases the previous value.
      this.lastTranscript = transcript;
      this.emitState('inserting');
      if (!this.disposed) {
        await this.options.insert(transcript);
      }
    } catch (error) {
      this.reportError(error);
    } finally {
      await fs.promises.rm(audioPath, { force: true }).catch(() => undefined);
      this.busy = false;
      this.emitState('idle');
    }
  }

  private emitState(state: DictationState): void {
    if (!this.disposed) {
      this.options.onStateChanged?.(state);
    }
  }

  private reportError(error: unknown): void {
    if (!this.disposed) {
      this.options.onError?.(error);
    }
  }

  private async notifyRecordingChanged(recording: boolean): Promise<void> {
    if (!this.disposed) {
      await this.options.onRecordingChanged?.(recording);
    }
  }
}
