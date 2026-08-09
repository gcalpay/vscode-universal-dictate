import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as readline from 'node:readline';

const START_TIMEOUT_MS = 10000;

export type RecorderAction = 'stop' | 'cancel';

export interface RecorderStartOptions {
  readonly recorderPath: string;
  readonly outputPath: string;
}

/**
 * Editor-independent controller for the bundled native microphone recorder.
 *
 * Callers own path selection and storage policy. This class only manages the
 * recorder process protocol, microphone level events, native overlay actions,
 * and the lifetime of the WAV file supplied in `outputPath`.
 */
export class CoreRecorderSession {
  private readonly child: childProcess.ChildProcessWithoutNullStreams;
  private readonly ready: Promise<void>;
  private readonly completion: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private completionResolve!: () => void;
  private completionReject!: (error: Error) => void;
  private stderr = '';
  private stopped = false;
  private readySettled = false;
  private nativeAction: RecorderAction | undefined;
  private nativeActionDelivered = false;
  private nativeActionListener: ((action: RecorderAction) => void) | undefined;

  private constructor(
    child: childProcess.ChildProcessWithoutNullStreams,
    readonly outputPath: string,
    onLevel: (level: number) => void
  ) {
    this.child = child;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.completion = new Promise<void>((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });
    // A recorder can fail while the user is still speaking. Attach a handler
    // immediately so Node does not report an unhandled rejection before stop().
    void this.completion.catch(() => undefined);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderr += chunk;
    });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line === 'READY' && !this.readySettled) {
        this.readySettled = true;
        this.readyResolve();
        return;
      }

      if (line.startsWith('LEVEL ')) {
        const level = Number(line.slice('LEVEL '.length));
        if (Number.isFinite(level)) {
          onLevel(Math.max(0, Math.min(1, level)));
        }
        return;
      }

      if (line === 'ACTION STOP') {
        this.queueNativeAction('stop');
        return;
      }

      if (line === 'ACTION CANCEL') {
        this.queueNativeAction('cancel');
      }
    });

    child.on('error', (error) => {
      if (!this.readySettled) {
        this.readySettled = true;
        this.readyReject(error);
      }
      this.completionReject(error);
    });

    child.on('exit', (code) => {
      lines.close();
      if (code === 0) {
        if (!this.readySettled) {
          this.readySettled = true;
          this.readyReject(new Error('Microphone recorder exited before becoming ready.'));
        }
        this.completionResolve();
        return;
      }

      const details = this.stderr.trim();
      const error = new Error(
        `Microphone recorder exited with code ${String(code)}${details ? `: ${details}` : ''}`
      );
      if (!this.readySettled) {
        this.readySettled = true;
        this.readyReject(error);
      }
      this.completionReject(error);
    });
  }

  static async start(
    options: RecorderStartOptions,
    onLevel: (level: number) => void
  ): Promise<CoreRecorderSession> {
    if (!fs.existsSync(options.recorderPath)) {
      throw new Error(`Native microphone recorder is missing: ${options.recorderPath}`);
    }

    const child = childProcess.spawn(options.recorderPath, ['--output', options.outputPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session = new CoreRecorderSession(child, options.outputPath, onLevel);
    try {
      await session.waitUntilReady();
      return session;
    } catch (error) {
      child.kill();
      await fs.promises.rm(options.outputPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  onAction(listener: (action: RecorderAction) => void): void {
    this.nativeActionListener = listener;
    this.deliverNativeAction();
  }

  async stop(): Promise<string> {
    if (!this.stopped) {
      this.stopped = true;
      if (!this.child.stdin.destroyed) {
        this.child.stdin.write('STOP\n');
      }
    }
    await this.completion;
    return this.outputPath;
  }

  async cancel(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      if (!this.child.stdin.destroyed) {
        this.child.stdin.write('CANCEL\n');
      }
    }
    await this.completion.catch(() => undefined);
    await fs.promises.rm(this.outputPath, { force: true }).catch(() => undefined);
  }

  private queueNativeAction(action: RecorderAction): void {
    if (this.nativeAction) {
      return;
    }
    this.nativeAction = action;
    this.deliverNativeAction();
  }

  private deliverNativeAction(): void {
    if (this.nativeActionDelivered || !this.nativeAction || !this.nativeActionListener) {
      return;
    }

    this.nativeActionDelivered = true;
    const action = this.nativeAction;
    queueMicrotask(() => this.nativeActionListener?.(action));
  }

  private async waitUntilReady(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Microphone recorder did not become ready in time.')),
            START_TIMEOUT_MS
          );
        })
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
