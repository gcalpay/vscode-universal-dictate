import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import * as vscode from 'vscode';

const RECORDER_RELATIVE_PATH = ['resources', 'bin', 'universal-dictate-recorder.exe'];
const START_TIMEOUT_MS = 10000;

export type RecorderAction = 'stop' | 'cancel';

export class RecorderSession {
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
    context: vscode.ExtensionContext,
    onLevel: (level: number) => void
  ): Promise<RecorderSession> {
    const recorderPath = getRecorderPath(context);
    if (!fs.existsSync(recorderPath)) {
      throw new Error(`Native microphone recorder is missing: ${recorderPath}`);
    }

    const recordingsDir = vscode.Uri.joinPath(context.globalStorageUri, 'recordings').fsPath;
    await fs.promises.mkdir(recordingsDir, { recursive: true });
    const outputPath = path.join(recordingsDir, `dictation-${Date.now()}.wav`);

    const child = childProcess.spawn(recorderPath, ['--output', outputPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session = new RecorderSession(child, outputPath, onLevel);
    try {
      await session.waitUntilReady();
      return session;
    } catch (error) {
      child.kill();
      await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
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

export function getRecorderPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...RECORDER_RELATIVE_PATH).fsPath;
}
