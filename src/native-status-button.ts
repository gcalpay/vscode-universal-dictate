import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as vscode from 'vscode';

const STATUS_BUTTON_RELATIVE_PATH = [
  'resources',
  'bin',
  'universal-dictate-status-button.exe'
];
const START_TIMEOUT_MS = 5000;

export type NativeStatusButtonState = 'idle' | 'recording' | 'hidden';
export type NativeStatusButtonTheme = 'dark' | 'light' | 'high_contrast';

export class NativeStatusButton implements vscode.Disposable {
  private readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private stderr = '';
  private readySettled = false;
  private disposed = false;
  private unavailable = false;
  private unavailableListener: (() => void) | undefined;

  private constructor(
    private readonly child: childProcess.ChildProcessWithoutNullStreams,
    private readonly onToggle: () => void
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      this.stderr += chunk;
    });
    child.stdin.on('error', () => {
      this.deliverUnavailable();
    });

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line === 'READY' && !this.readySettled) {
        this.readySettled = true;
        this.readyResolve();
        return;
      }

      if (line === 'ACTION TOGGLE' && !this.disposed) {
        this.onToggle();
      }
    });

    child.on('error', (error) => {
      if (!this.readySettled) {
        this.readySettled = true;
        this.readyReject(error);
      } else {
        this.deliverUnavailable();
      }
    });

    child.on('exit', (code) => {
      lines.close();
      if (!this.readySettled) {
        this.readySettled = true;
        const details = this.stderr.trim();
        this.readyReject(
          new Error(
            `Native status button exited with code ${String(code)}${details ? `: ${details}` : ''}`
          )
        );
        return;
      }

      this.deliverUnavailable();
    });
  }

  static async start(
    context: vscode.ExtensionContext,
    onToggle: () => void
  ): Promise<NativeStatusButton> {
    const helperPath = getNativeStatusButtonPath(context);
    if (!fs.existsSync(helperPath)) {
      throw new Error(`Native status button is missing: ${helperPath}`);
    }

    const child = childProcess.spawn(helperPath, ['--host-pid', String(process.pid)], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const button = new NativeStatusButton(child, onToggle);

    try {
      await button.waitUntilReady();
      return button;
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  onUnavailable(listener: () => void): void {
    this.unavailableListener = listener;
    if (this.unavailable) {
      queueMicrotask(() => this.unavailableListener?.());
    }
  }

  setFocused(focused: boolean): void {
    this.send(`FOCUS ${focused ? '1' : '0'}`);
  }

  setState(state: NativeStatusButtonState): void {
    this.send(`STATE ${state.toUpperCase()}`);
  }

  setTheme(theme: NativeStatusButtonTheme): void {
    this.send(`THEME ${theme.toUpperCase()}`);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (!this.child.stdin.destroyed) {
      this.child.stdin.end('EXIT\n');
    }

    const timer = setTimeout(() => {
      if (this.child.exitCode === null) {
        this.child.kill();
      }
    }, 500);
    timer.unref();
  }

  private send(command: string): void {
    if (this.disposed || this.child.stdin.destroyed || !this.child.stdin.writable) {
      return;
    }

    this.child.stdin.write(`${command}\n`);
  }

  private deliverUnavailable(): void {
    if (this.disposed || this.unavailable) {
      return;
    }

    this.unavailable = true;
    queueMicrotask(() => this.unavailableListener?.());
  }

  private async waitUntilReady(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Native status button did not become ready in time.')),
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

export function getNativeStatusButtonPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...STATUS_BUTTON_RELATIVE_PATH).fsPath;
}
