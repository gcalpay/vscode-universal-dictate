import * as fs from 'node:fs';
import type { PreviewLease } from './preview-audio';
import type { PreviewUpdate } from './preview-coordinator';

export type DictationRecorderAction = 'stop' | 'cancel' | 'pause' | 'resume';
export type TranscriptRecoveryResult = 'completed' | 'empty' | 'busy' | 'disposed';

export interface DictationSession {
  readonly outputPath: string;
  readonly previewSessionId?: string;
  acquirePreview?(signal: AbortSignal): Promise<PreviewLease | undefined>;
  showPreview?(update: PreviewUpdate): void;
  onAction(listener: (action: DictationRecorderAction) => void): void;
  onFailure?(listener: (error: Error) => void): void;
  setPaused?(paused: boolean): Promise<void>;
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export type DictationState =
  | 'idle' | 'preparing' | 'opening-microphone' | 'recording'
  | 'pausing' | 'paused' | 'resuming' | 'cancelling' | 'transcribing' | 'inserting';

type Phase = 'preparing' | 'opening-microphone' | 'recording' | 'stopping'
  | 'transcribing' | 'inserting' | 'copying' | 'cancelling' | 'cleaning';
interface Operation {
  readonly id: number;
  readonly abort: AbortController;
  phase: Phase;
  session?: DictationSession;
  pendingAction?: DictationRecorderAction;
  cancellation?: Promise<void>;
  terminal?: Promise<void>;
  paused?: boolean;
  pauseChange?: Promise<void>;
  preview?: PreviewControl;
  previewStopping?: Promise<void>;
}

export interface PreviewControl {
  stop(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): void;
}

export interface DictationEngineOptions {
  readonly prepare: () => Promise<void>;
  readonly warm: () => Promise<void>;
  readonly startRecorder: (onLevel: (level: number) => void, signal: AbortSignal) => Promise<DictationSession>;
  readonly transcribe: (audioPath: string) => Promise<string>;
  readonly startPreview?: (session: DictationSession, signal: AbortSignal) => PreviewControl | undefined;
  readonly insert: (transcript: string, signal: AbortSignal) => Promise<void>;
  readonly onStateChanged?: (state: DictationState) => void;
  readonly onLevel?: (level: number) => void;
  readonly onRecordingChanged?: (recording: boolean) => PromiseLike<void> | void;
  readonly onNoSpeech?: () => void;
  readonly onError?: (error: unknown) => void;
}

/** One operation owns its recorder, pending work and cleanup until it settles. */
export class DictationEngine {
  private operation: Operation | undefined;
  private generation = 0;
  private disposed = false;
  private lastTranscript: string | undefined;
  private recordingNotice = 0;
  private recordingNotifications: Promise<void> = Promise.resolve();

  constructor(private readonly options: DictationEngineOptions) {}

  getLastTranscript(): string | undefined { return this.lastTranscript; }
  clearLastTranscript(): void { this.lastTranscript = undefined; }

  insertLastTranscript(): Promise<TranscriptRecoveryResult> {
    return this.useLastTranscript((text, signal) => this.options.insert(text, signal), true);
  }

  copyLastTranscript(copy: (text: string) => PromiseLike<void>): Promise<TranscriptRecoveryResult> {
    return this.useLastTranscript(copy, false);
  }

  async toggle(): Promise<void> {
    if (this.disposed) return;
    const op = this.operation;
    if (op) {
      if (this.current(op) && op.phase === 'recording') await this.stopAndTranscribe(op);
      return; // No queued restart or recovery paste behind an old operation.
    }
    await this.startRecording(this.begin('preparing'));
  }

  async togglePause(): Promise<void> {
    const op = this.operation;
    if (op) await this.changePause(op, !op.paused);
  }

  private changePause(op: Operation, paused: boolean): Promise<void> {
    if (!this.current(op) || op.phase !== 'recording' || op.pauseChange ||
        !op.session?.setPaused || !!op.paused === paused) return Promise.resolve();
    // Install ownership before invoking callbacks or the native request.
    const change = Promise.resolve().then(async () => {
      if (!this.current(op) || op.phase !== 'recording') return;
      if (paused) {
        try { void op.preview?.pause?.().catch(() => this.reportError(new Error('Live preview pause failed.'))); }
        catch { this.reportError(new Error('Live preview pause failed.')); }
      }
      this.emitSafely(op, paused ? 'pausing' : 'resuming');
      if (!this.current(op) || op.phase !== 'recording') return;
      try {
        await op.session!.setPaused!(paused);
        if (!this.current(op) || op.phase !== 'recording') return;
        op.paused = paused;
        op.pauseChange = undefined; // A queued native Resume after this acknowledgement may proceed.
        if (!paused) {
          try { op.preview?.resume?.(); }
          catch { this.reportError(new Error('Live preview resume failed.')); }
        }
        if (this.current(op) && op.phase === 'recording') this.emitSafely(op, paused ? 'paused' : 'recording');
      } catch (error) {
        if (this.current(op) && op.phase === 'recording') {
          this.reportError(error);
          // An unconfirmed pause must not be presented as paused capture.
          // Cancel rather than leave uncertain capture active or insert unexpectedly.
          if (this.current(op) && op.phase === 'recording') await this.cancel();
        }
      }
    });
    op.pauseChange = change;
    return change.finally(() => { if (op.pauseChange === change) op.pauseChange = undefined; });
  }

  async cancel(): Promise<void> {
    const op = this.operation;
    if (this.disposed || !op) return;
    const wasRecording = op.phase === 'recording';
    op.abort.abort();
    void this.stopPreview(op);
    this.notifyRecordingChanged(false);
    this.emitSafely(op, 'cancelling');
    if (wasRecording) await this.cancelRecording(op);
    // A pending prepare/decode/copy must settle before its slot can be reused.
    // Do not unlink a WAV while an old transcription is still reading it.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearLastTranscript();
    const op = this.operation;
    if (op) {
      op.abort.abort();
      void this.stopPreview(op);
      if (op.phase === 'recording') void this.cancelRecording(op);
      else if (op.phase === 'stopping') void this.cancelSession(op).catch(() => undefined);
    }
    // Serialized after an already-started true notification, even on disposal.
    this.notifyRecordingChanged(false);
  }

  private begin(phase: Phase): Operation {
    const op: Operation = { id: ++this.generation, abort: new AbortController(), phase };
    this.operation = op;
    return op;
  }

  private owns(op: Operation): boolean { return this.operation === op && op.id === this.generation; }
  private current(op: Operation): boolean { return this.owns(op) && !this.disposed && !op.abort.signal.aborted; }

  private finish(op: Operation, renderIdle = true): void {
    if (!this.owns(op)) return;
    this.operation = undefined;
    if (!this.disposed && renderIdle) {
      try { this.options.onStateChanged?.('idle'); } catch (error) { this.reportError(error); }
    }
  }

  private async useLastTranscript(
    action: (text: string, signal: AbortSignal) => PromiseLike<void>, inserting: boolean
  ): Promise<TranscriptRecoveryResult> {
    if (this.disposed) return 'disposed';
    if (this.operation) return 'busy';
    const transcript = this.lastTranscript;
    if (transcript === undefined) return 'empty';
    const op = this.begin(inserting ? 'inserting' : 'copying');
    try {
      if (inserting) this.emitState(op, 'inserting');
      if (!this.current(op)) return 'disposed';
      await action(transcript, op.abort.signal);
      return this.disposed ? 'disposed' : 'completed';
    } finally {
      this.finish(op, inserting);
    }
  }

  private async startRecording(op: Operation): Promise<void> {
    try {
      this.emitState(op, 'preparing');
      if (!this.current(op)) return;
      await this.options.prepare();
      if (!this.current(op)) return;
      // A synchronous warm-up exception, like a rejection, is non-fatal.
      try { void this.options.warm().catch(() => undefined); } catch { /* CLI fallback remains. */ }
      if (!this.current(op)) return;
      op.phase = 'opening-microphone';
      this.emitState(op, 'opening-microphone');
      if (!this.current(op)) return;
      const session = await this.options.startRecorder((level) => {
        if (this.current(op) && op.phase === 'recording' && !op.paused && !op.pauseChange) {
          try { this.options.onLevel?.(level); } catch (error) { this.reportError(error); }
        }
      }, op.abort.signal);
      op.session = session;
      if (!this.current(op)) return;
      session.onAction((action) => this.handleRecorderAction(op, action));
      session.onFailure?.((error) => this.handleRecorderFailure(op, error));
      if (!this.current(op)) return;
      this.notifyRecordingChanged(true);
      // Initialization completes before the single retained early action runs.
      this.emitState(op, 'recording');
      if (!this.current(op)) return;
      op.phase = 'recording';
      const pending = op.pendingAction;
      op.pendingAction = undefined;
      if (pending !== 'stop' && pending !== 'cancel' && this.current(op)) {
        try { op.preview = this.options.startPreview?.(session, op.abort.signal); }
        catch { this.reportError(new Error('Live preview unavailable; normal dictation remains available.')); }
        if (!this.current(op)) void this.stopPreview(op);
      }
      if (pending) this.handleRecorderAction(op, pending);
    } catch (error) {
      if (this.current(op)) this.reportError(error);
      op.abort.abort();
    } finally {
      if (op.phase === 'opening-microphone' || op.phase === 'preparing') {
        this.notifyRecordingChanged(false);
        if (op.session) await this.cancelSession(op).catch((error) => this.reportError(error));
        this.finish(op);
      }
    }
  }

  private handleRecorderAction(op: Operation, action: DictationRecorderAction): void {
    if (!this.current(op)) return;
    if (op.phase === 'opening-microphone') {
      // Terminal controls supersede an early pause; never queue repeated actions.
      if (op.pendingAction !== 'stop' && op.pendingAction !== 'cancel') op.pendingAction = action;
      return;
    }
    if (op.phase !== 'recording') return;
    if (action === 'stop') void this.stopAndTranscribe(op);
    else if (action === 'cancel') void this.cancel();
    else void this.changePause(op, action === 'pause');
  }

  private handleRecorderFailure(op: Operation, error: Error): void {
    if (!this.current(op) || !['opening-microphone', 'recording'].includes(op.phase)) return;
    this.reportError(error);
    op.abort.abort();
    void this.stopPreview(op);
    this.notifyRecordingChanged(false);
    if (op.phase === 'recording') void this.cancelRecording(op);
  }

  private stopPreview(op: Operation): Promise<void> {
    if (!op.preview) return Promise.resolve();
    if (!op.previewStopping) {
      // stop() invalidates immediately; physical recorder shutdown is not delayed.
      try { op.previewStopping = op.preview.stop().catch(() => {
        this.reportError(new Error('Live preview shutdown failed.'));
      }); }
      catch { op.previewStopping = Promise.resolve(); this.reportError(new Error('Live preview shutdown failed.')); }
    }
    return op.previewStopping;
  }

  private cancelSession(op: Operation): Promise<void> {
    if (!op.cancellation) {
      // Invoke synchronously within a protected promise: observer errors cannot
      // stop physical shutdown, and every caller joins the same cleanup.
      op.cancellation = (async () => { await op.session?.cancel(); })();
    }
    return op.cancellation;
  }

  private cancelRecording(op: Operation): Promise<void> {
    if (op.terminal) return op.terminal;
    op.phase = 'cancelling';
    this.notifyRecordingChanged(false);
    op.terminal = (async () => {
      try { await this.cancelSession(op); }
      catch (error) { this.reportError(error); }
      finally { await this.stopPreview(op); this.finish(op); }
    })();
    return op.terminal;
  }

  private stopAndTranscribe(op: Operation): Promise<void> {
    if (op.terminal) return op.terminal;
    if (!this.current(op) || !op.session || op.phase !== 'recording') return Promise.resolve();
    op.phase = 'stopping';
    void this.stopPreview(op);
    this.notifyRecordingChanged(false);
    op.terminal = this.finalizeRecording(op, op.session);
    return op.terminal;
  }

  private async finalizeRecording(op: Operation, session: DictationSession): Promise<void> {
    let audioPath = session.outputPath;
    let writerClosed = false;
    try {
      // Invoke physical Stop before anything that could throw in the UI.
      const stopping = session.stop();
      this.emitSafely(op, 'transcribing');
      audioPath = await stopping;
      writerClosed = true;
      if (!this.current(op)) return;
      await this.stopPreview(op);
      if (!this.current(op)) return;
      op.phase = 'transcribing';
      const transcript = await this.options.transcribe(audioPath);
      if (!this.current(op)) return;
      if (transcript.trim().length === 0) {
        this.options.onNoSpeech?.();
        return;
      }
      this.lastTranscript = transcript;
      op.phase = 'inserting';
      this.emitState(op, 'inserting');
      if (this.current(op)) await this.options.insert(transcript, op.abort.signal);
    } catch (error) {
      if (this.current(op)) this.reportError(error);
    } finally {
      op.phase = 'cleaning';
      await this.stopPreview(op);
      if (!writerClosed) {
        try { await this.cancelSession(op); writerClosed = true; }
        catch (error) { this.reportError(error); }
      } else if (op.cancellation) {
        await op.cancellation.catch((error) => this.reportError(error));
      }
      // A failed/unknown shutdown is NOT permission to unlink a live writer's
      // output. The concrete recorder retains its own late-close cleanup hook.
      if (writerClosed) {
        for (const ownedPath of new Set([session.outputPath, audioPath])) {
          try { await fs.promises.rm(ownedPath, { force: true }); }
          catch (error) { this.reportError(error); }
        }
      }
      this.finish(op);
    }
  }

  private emitState(op: Operation, state: DictationState): void {
    if (this.current(op)) this.options.onStateChanged?.(state);
  }

  private emitSafely(op: Operation, state: DictationState): void {
    if (this.disposed || !this.owns(op)) return;
    try { this.options.onStateChanged?.(state); } catch (error) { this.reportError(error); }
  }

  private reportError(error: unknown): void {
    if (!this.disposed) {
      try { this.options.onError?.(error); } catch { /* Diagnostics must not break cleanup. */ }
    }
  }

  private notifyRecordingChanged(recording: boolean): void {
    const revision = ++this.recordingNotice;
    this.recordingNotifications = this.recordingNotifications.then(async () => {
      if (revision !== this.recordingNotice || (recording && this.disposed)) return;
      try { await this.options.onRecordingChanged?.(recording); }
      catch (error) { this.reportError(error); }
    });
  }
}
