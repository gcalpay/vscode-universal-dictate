import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import { performance } from 'node:perf_hooks';
import { abortable, request } from './whisper-transport';

export type WorkerRole = 'final' | 'preview';
export interface WorkerEvent {
  readonly role: WorkerRole;
  readonly kind: 'spawn' | 'ready' | 'exit' | 'request' | 'stop-timeout';
  readonly atMs: number;
  readonly pid?: number;
}
export interface WorkerOptions {
  readonly serverPath: string;
  readonly publicPath: string;
  readonly ensureModel: () => Promise<string>;
  readonly role: WorkerRole;
  readonly threads: number;
  readonly onEvent?: (event: WorkerEvent) => void;
}
export interface ServerState {
  readonly process: childProcess.ChildProcess;
  readonly port: number;
  readonly requestPath: string;
}

/** Owns one direct child. Retired workers cannot spawn or become ready again. */
export class WhisperWorker {
  private state?: ServerState;
  private starting?: Promise<ServerState>;
  private process?: childProcess.ChildProcess;
  private readonly lifetime = new AbortController();
  private stopping?: Promise<boolean>;

  constructor(private readonly options: WorkerOptions) {}

  get retired(): boolean { return this.lifetime.signal.aborted; }
  isWarm(): boolean { return !this.retired && !!this.state && running(this.state.process); }
  get pid(): number | undefined { return this.process?.pid; }

  ready(): Promise<ServerState> {
    if (this.retired) return Promise.reject(new Error('Whisper worker was retired.'));
    if (this.state && running(this.state.process)) return Promise.resolve(this.state);
    if (!this.starting) {
      const pending = this.start();
      this.starting = pending;
      // Register both handlers so a cancelled caller cannot leave an unhandled rejection.
      void pending.then(() => { if (this.starting === pending) this.starting = undefined; },
        () => { if (this.starting === pending) this.starting = undefined; });
    }
    return this.starting;
  }

  /** Resolve true only after exit (or no process was spawned), not on kill() return. */
  stop(): Promise<boolean> {
    if (this.stopping) return this.stopping;
    this.lifetime.abort();
    this.state = undefined;
    const child = this.process;
    this.stopping = child ? terminateOwnedProcess(child).then(exited => {
      if (exited && this.process === child) this.process = undefined;
      if (!exited) this.emit('stop-timeout', child.pid);
      return exited;
    }) : Promise.resolve(true);
    return this.stopping;
  }

  private async start(): Promise<ServerState> {
    const signal = this.lifetime.signal;
    // Retirement cancels this wait, without cancelling the host's model acquisition.
    const model = await abortable(this.options.ensureModel(), signal);
    signal.throwIfAborted();
    if (!fs.existsSync(this.options.serverPath)) throw new Error('Bundled Whisper server is missing.');
    const port = await findFreeLocalPort();
    await fs.promises.mkdir(this.options.publicPath, { recursive: true });
    signal.throwIfAborted(); // No child may be spawned after Stop during preparation.
    const requestPath = `/universal-dictate-${crypto.randomUUID()}`;
    const child = childProcess.spawn(this.options.serverPath, [
      '-m', model, '-t', String(this.options.threads), '-nt', '-ng',
      '--host', '127.0.0.1', '--port', String(port),
      '--request-path', requestPath,
      '--public', this.options.publicPath
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.process = child;
    const state = { process: child, port, requestPath };
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('exit', () => {
      if (this.process === child) this.process = undefined;
      if (this.state?.process === child) this.state = undefined;
      this.emit('exit', child.pid);
    });
    // Drain bounded runtime diagnostics without logging private recognition output.
    child.stderr?.resume();
    if (this.options.role === 'preview' && child.pid !== undefined) {
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); }
      catch { /* Priority is best effort; worker isolation and thread bounds remain. */ }
    }
    this.emit('spawn', child.pid);
    try {
      const deadline = performance.now() + 30_000;
      while (performance.now() < deadline) {
        signal.throwIfAborted();
        if (failed || !running(child)) throw new Error('Whisper worker failed during startup.');
        const response = await request({ host: '127.0.0.1', port,
          path: `${state.requestPath}/health`, method: 'GET', timeoutMs: 500, signal }).catch(() => undefined);
        signal.throwIfAborted();
        if (response?.statusCode === 200) {
          this.state = state;
          this.emit('ready', child.pid);
          return state;
        }
        await abortable(new Promise<void>(resolve => setTimeout(resolve, 100)), signal);
      }
      throw new Error('Whisper worker did not become ready within 30 seconds.');
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private emit(kind: WorkerEvent['kind'], pid?: number): void {
    try { this.options.onEvent?.({ role: this.options.role, kind, pid, atMs: performance.now() }); }
    catch { /* Observers cannot affect child lifetime. */ }
  }
}

function running(child: childProcess.ChildProcess): boolean {
  return child.exitCode === null && child.signalCode == null;
}

/** Bounded graceful/forced termination of an owned child; never terminate by name. */
export function terminateOwnedProcess(child: childProcess.ChildProcess): Promise<boolean> {
  if (!running(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer); clearTimeout(deadline);
      child.removeListener('exit', exited); child.removeListener('close', closed); child.removeListener('error', error);
      resolve(confirmed);
    };
    const exited = () => finish(true);
    const closed = () => finish(true);
    const error = () => { if (child.pid === undefined) finish(true); };
    child.once('exit', exited); child.once('close', closed); child.on('error', error);
    if (!running(child)) { finish(true); return; }
    const kill = (signal: NodeJS.Signals) => {
      if (!running(child)) { finish(true); return; }
      try { child.kill(signal); } catch { /* Deadline reports unconfirmed teardown. */ }
    };
    // Set timers first: test/OS events can settle synchronously when kill is requested.
    forceTimer = setTimeout(() => kill('SIGKILL'), 150);
    deadline = setTimeout(() => finish(!running(child)), 1_000);
    kill('SIGTERM');
  });
}

async function findFreeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref(); probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(); reject(new Error('Could not allocate a local port.')); return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}
