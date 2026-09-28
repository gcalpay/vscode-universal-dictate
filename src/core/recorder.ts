import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { normalizeOverlaySize, type OverlaySize } from './overlay-size';

const START_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;
const KILL_CONFIRM_TIMEOUT_MS = 2000;
const MAX_STDERR_CHARS = 4096;
const DEFAULT_WAVEFORM_TIME_SPAN_SECONDS = 1;
const MIN_WAVEFORM_TIME_SPAN_SECONDS = 1;
const MAX_WAVEFORM_TIME_SPAN_SECONDS = 20;

export type RecorderAction = 'stop' | 'cancel';
export type RecorderOverlayStyle = 'compact' | 'enhanced';

export interface RecorderStartOptions {
  readonly recorderPath: string;
  readonly signal?: AbortSignal;
  readonly outputPath: string;
  readonly showOverlay?: boolean;
  readonly overlayStyle?: RecorderOverlayStyle;
  readonly waveformTimeSpanSeconds?: number;
  readonly overlaySize?: OverlaySize | string;
}

/**
 * Editor-independent controller for the bundled native microphone recorder.
 *
 * Callers own path selection and storage policy. This class only manages the
 * recorder process protocol, microphone level events, native overlay actions,
 * and the lifetime of the WAV file supplied in `outputPath`.
 */
export function buildRecorderArguments(options: RecorderStartOptions): string[] {
  const args = ['--output', options.outputPath];

  if (options.showOverlay === false) {
    args.push('--no-overlay');
    return args;
  }

  if (options.overlayStyle === 'enhanced') {
    args.push('--enhanced-overlay');

    const configuredSpan = options.waveformTimeSpanSeconds ?? DEFAULT_WAVEFORM_TIME_SPAN_SECONDS;
    const waveformTimeSpanSeconds = Number.isFinite(configuredSpan)
      ? Math.min(
          MAX_WAVEFORM_TIME_SPAN_SECONDS,
          Math.max(MIN_WAVEFORM_TIME_SPAN_SECONDS, configuredSpan)
        )
      : DEFAULT_WAVEFORM_TIME_SPAN_SECONDS;

    args.push('--waveform-timespan-ms', String(Math.round(waveformTimeSpanSeconds * 1000)));
    args.push('--overlay-size', normalizeOverlaySize(options.overlaySize));
  }

  return args;
}

export class CoreRecorderSession {
  private readonly ready: Promise<void>;
  private readonly completion: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private completionResolve!: () => void;
  private readySettled = false;
  private becameReady = false;
  private closed = false;
  private exited = false;
  private killRequested = false;
  private stderr = '';
  private failure: Error | undefined;
  private unexpectedFailure: Error | undefined;
  private failureDelivered = false;
  private failureListener: ((error: Error) => void) | undefined;
  private command: 'STOP' | 'CANCEL' | undefined;
  private discard = false;
  private stopPromise: Promise<string> | undefined;
  private cancelPromise: Promise<void> | undefined;
  private cleanupPromise: Promise<void> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private nativeAction: RecorderAction | undefined;
  private nativeActionDelivered = false;
  private nativeActionListener: ((action: RecorderAction) => void) | undefined;
  private readonly abortListener: () => void;

  private constructor(
    private readonly child: childProcess.ChildProcessWithoutNullStreams,
    readonly outputPath: string,
    onLevel: (level: number) => void,
    private readonly signal?: AbortSignal
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.completion = new Promise<void>((resolve) => { this.completionResolve = resolve; });
    void this.ready.catch(() => undefined);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-MAX_STDERR_CHARS);
    });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line: string) => {
      if (this.closed || this.exited || this.command || this.failure) return;
      if (line === 'READY' && !this.readySettled) {
        this.readySettled = true;
        this.becameReady = true;
        this.readyResolve();
      } else if (line.startsWith('LEVEL ') && this.becameReady) {
        const level = Number(line.slice(6));
        if (Number.isFinite(level)) onLevel(Math.max(0, Math.min(1, level)));
      } else if (line === 'ACTION STOP') {
        this.queueNativeAction('stop');
      } else if (line === 'ACTION CANCEL') {
        this.queueNativeAction('cancel');
      }
    });
    // Pipe errors are observed even after cancellation so a broken stdin cannot
    // become an unhandled EventEmitter error on the extension host.
    child.stdin.on('error', (error: Error) => this.pipeFailure(error));
    child.stdout.on('error', (error: Error) => this.pipeFailure(error));
    child.stderr.on('error', (error: Error) => this.pipeFailure(error));
    lines.on('error', (error: Error) => this.pipeFailure(error));
    child.on('error', (error: Error) => {
      this.fail(error);
      this.killRecorder();
    });
    child.on('exit', (code: number | null, terminationSignal: NodeJS.Signals | null) => {
      this.exited = true;
      if (code !== 0 || terminationSignal || !this.command) {
        this.fail(new Error(`Microphone recorder exited unexpectedly (${String(code)}${terminationSignal ? `, ${terminationSignal}` : ''})${this.stderr.trim() ? `: ${this.stderr.trim()}` : ''}`));
      }
      // Do NOT resolve completion here. stdio/OS handles can still be open.
    });
    child.on('close', (code: number | null) => {
      this.closed = true;
      this.signal?.removeEventListener('abort', this.abortListener);
      lines.close();
      if (!this.readySettled) this.rejectReady(new Error('Microphone recorder exited before becoming ready.'));
      if (code !== 0 || !this.command) this.fail(new Error(`Microphone recorder closed unexpectedly (${String(code)}).`));
      this.completionResolve();
      if (this.discard) void this.removeOutput().catch(() => undefined);
    });
    this.abortListener = () => {
      this.rejectReady(new Error('Microphone recording was cancelled.'));
      void this.cancel().catch(() => undefined);
    };
    if (signal?.aborted) this.abortListener();
    else signal?.addEventListener('abort', this.abortListener, { once: true });
  }

  static async start(options: RecorderStartOptions, onLevel: (level: number) => void): Promise<CoreRecorderSession> {
    if (options.signal?.aborted) throw new Error('Microphone recording was cancelled.');
    if (!fs.existsSync(options.recorderPath)) throw new Error(`Native microphone recorder is missing: ${options.recorderPath}`);
    const child = childProcess.spawn(options.recorderPath, buildRecorderArguments(options), {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    const session = new CoreRecorderSession(child, options.outputPath, onLevel, options.signal);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        session.ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Microphone recorder did not become ready in time.')), START_TIMEOUT_MS);
        })
      ]);
      if (options.signal?.aborted) throw new Error('Microphone recording was cancelled.');
      if (session.failure) throw session.failure;
      return session;
    } catch (error) {
      // cancel() confirms close before removing output. If close cannot be
      // confirmed, its late-close hook remains and the failure is reported.
      try { await session.cancel(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Recorder startup failed and shutdown/cleanup could not be confirmed.'); }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  onAction(listener: (action: RecorderAction) => void): void {
    this.nativeActionListener = listener;
    this.deliverNativeAction();
  }

  onFailure(listener: (error: Error) => void): void {
    this.failureListener = listener;
    this.deliverFailure();
  }

  stop(): Promise<string> {
    if (!this.stopPromise) {
      this.stopPromise = (async () => {
        this.request('STOP');
        await this.waitForClose();
        if (this.discard) throw new Error('Microphone recording was cancelled.');
        if (this.failure) throw this.failure;
        return this.outputPath;
      })();
    }
    return this.stopPromise;
  }

  cancel(): Promise<void> {
    this.discard = true;
    this.rejectReady(new Error('Microphone recording was cancelled.'));
    if (!this.cancelPromise) {
      this.cancelPromise = (async () => {
        this.request('CANCEL');
        await this.waitForClose();
        await this.removeOutput();
      })();
    }
    return this.cancelPromise;
  }

  private request(command: 'STOP' | 'CANCEL'): void {
    if (this.command || this.closed) return;
    this.command = command; // First terminal command wins; no repeated writes.
    if (this.exited) return;
    if (this.child.stdin.destroyed) {
      this.pipeFailure(new Error('Microphone recorder input is closed.'));
      return;
    }
    try {
      this.child.stdin.end(`${command}\n`, (error?: Error | null) => {
        if (error) this.pipeFailure(error);
      });
    } catch (error) {
      this.pipeFailure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private waitForClose(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = (async () => {
        if (this.closed) return;
        let killTimer: NodeJS.Timeout | undefined;
        let deadline: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            this.completion,
            new Promise<never>((_, reject) => {
              killTimer = setTimeout(() => {
                this.fail(new Error('Microphone recorder did not stop in time.'));
                this.killRecorder();
              }, STOP_TIMEOUT_MS);
              deadline = setTimeout(() => reject(new Error('Microphone recorder shutdown was not confirmed; output cleanup is deferred until close.')),
                STOP_TIMEOUT_MS + KILL_CONFIRM_TIMEOUT_MS);
            })
          ]);
        } finally {
          if (killTimer) clearTimeout(killTimer);
          if (deadline) clearTimeout(deadline);
        }
      })();
    }
    return this.shutdownPromise;
  }

  private removeOutput(): Promise<void> {
    if (!this.closed) return Promise.reject(new Error('Cannot delete a live recorder output.'));
    this.cleanupPromise ??= fs.promises.rm(this.outputPath, { force: true });
    return this.cleanupPromise;
  }

  private pipeFailure(error: Error): void {
    if (this.closed) return;
    this.fail(error);
    this.killRecorder();
  }

  private killRecorder(): void {
    if (this.closed || this.exited || this.killRequested) return;
    this.killRequested = true;
    try { this.child.kill(); } catch { /* waitForClose reports an unconfirmed stop. */ }
  }

  private rejectReady(error: Error): void {
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyReject(error);
    }
  }

  private fail(error: Error): void {
    this.failure ??= error;
    this.rejectReady(error);
    if (!this.command) {
      this.unexpectedFailure ??= error;
      this.deliverFailure();
    }
  }

  private deliverFailure(): void {
    const listener = this.failureListener;
    const error = this.unexpectedFailure;
    if (!listener || !error || this.failureDelivered) return;
    this.failureDelivered = true;
    queueMicrotask(() => listener(error));
  }

  private queueNativeAction(action: RecorderAction): void {
    if (this.nativeAction || this.command || this.failure) return;
    this.nativeAction = action;
    this.deliverNativeAction();
  }

  private deliverNativeAction(): void {
    const listener = this.nativeActionListener;
    const action = this.nativeAction;
    if (this.nativeActionDelivered || !action || !listener) return;
    this.nativeActionDelivered = true;
    queueMicrotask(() => {
      if (!this.closed && !this.exited && !this.command && !this.failure && !this.signal?.aborted) listener(action);
    });
  }
}
