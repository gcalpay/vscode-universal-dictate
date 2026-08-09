import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import * as vscode from 'vscode';

const RECORDER_RELATIVE_PATH = ['resources', 'bin', 'universal-dictate-recorder.exe'];
const START_TIMEOUT_MS = 10000;

export class RecorderSession {
  private readonly child: childProcess.ChildProcessWithoutNullStreams;
  private readonly completion: Promise<void>;
  private completionResolve!: () => void;
  private completionReject!: (error: Error) => void;
  private stderr = '';
  private stopped = false;

  private constructor(
    child: childProcess.ChildProcessWithoutNullStreams,
    readonly outputPath: string,
    onLevel: (level: number) => void
  ) {
    this.child = child;
    this.completion = new Promise<void>((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderr += chunk;
    });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line.startsWith('LEVEL ')) {
        const level = Number(line.slice('LEVEL '.length));
        if (Number.isFinite(level)) {
          onLevel(Math.max(0, Math.min(1, level)));
        }
      }
    });

    child.on('error', (error) => {
      this.completionReject(error);
    });

    child.on('exit', (code) => {
      lines.close();
      if (code === 0) {
        this.completionResolve();
      } else {
        const details = this.stderr.trim();
        this.completionReject(
          new Error(`Microphone recorder exited with code ${String(code)}${details ? `: ${details}` : ''}`)
        );
      }
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
    await session.waitUntilReady();
    return session;
  }

  async stop(): Promise<string> {
    if (!this.stopped) {
      this.stopped = true;
      this.child.stdin.write('STOP\n');
    }
    await this.completion;
    return this.outputPath;
  }

  async cancel(): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      this.child.stdin.write('CANCEL\n');
    }
    await this.completion.catch(() => undefined);
    await fs.promises.rm(this.outputPath, { force: true }).catch(() => undefined);
  }

  private async waitUntilReady(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Microphone recorder did not become ready in time.'));
      }, START_TIMEOUT_MS);

      const lines = readline.createInterface({ input: this.child.stdout });
      const finish = () => {
        clearTimeout(timer);
        lines.close();
      };

      lines.on('line', (line) => {
        if (line === 'READY') {
          finish();
          resolve();
        }
      });

      this.child.once('exit', (code) => {
        finish();
        const details = this.stderr.trim();
        reject(
          new Error(`Microphone recorder exited before ready (code ${String(code)})${details ? `: ${details}` : ''}`)
        );
      });

      this.child.once('error', (error) => {
        finish();
        reject(error);
      });
    });
  }
}

export function getRecorderPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...RECORDER_RELATIVE_PATH).fsPath;
}
