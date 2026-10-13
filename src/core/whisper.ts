import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as util from 'node:util';
import { performance } from 'node:perf_hooks';
import { validatePreviewAudio, type PreviewAudio } from './preview-audio';
import { WhisperWorker, type ServerState, type WorkerEvent, type WorkerRole } from './whisper-worker';
import { abortable, buildMultipartBody, normalizeTranscript, request } from './whisper-transport';

const execFile = util.promisify(childProcess.execFile);
export type WhisperInferencePath = 'server' | 'cli';
export interface WhisperRuntimeOptions {
  readonly cliPath: string;
  readonly serverPath: string;
  readonly publicPath: string;
  readonly ensureModel: () => Promise<string>;
  /** Metadata only, for deterministic benchmarks; never includes audio/text. */
  readonly onWorkerEvent?: (event: WorkerEvent) => void;
}

/** Final worker stays warm. Speculative preview never enters its inference queue. */
export class WhisperRuntime {
  private finalWorker: WhisperWorker;
  private previewWorker?: WhisperWorker;
  private previewOperation?: { controller: AbortController; done: Promise<string> };
  private previewDisabled = false;
  private finalizing = false;
  private finalServerDisabled = false;
  private disposed = false;
  private shutdownPromise?: Promise<void>;

  constructor(private readonly options: WhisperRuntimeOptions) {
    this.finalWorker = this.createWorker('final');
  }

  isWarm(): boolean { return this.finalWorker.isWarm(); }

  async warm(): Promise<void> {
    this.assertAvailable();
    if (this.finalServerDisabled) throw new Error('Final server shutdown was not confirmed.');
    await this.getFinalWorker().ready();
  }

  dispose(): void { void this.shutdown(); }

  /** Awaitable for tests/hosts that must prove process release before another run. */
  shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.disposed = true;
      this.shutdownPromise = Promise.all([this.stopPreview(), this.finalWorker.stop()]).then(() => undefined);
    }
    return this.shutdownPromise;
  }

  /** Retire only preview, including an idle/starting worker, and join native exit. */
  async stopPreview(): Promise<void> {
    const operation = this.previewOperation;
    const worker = this.previewWorker;
    operation?.controller.abort();
    const retiring = worker ? this.retirePreview(worker) : Promise.resolve();
    await Promise.all([retiring, operation?.done.catch(() => undefined)]);
  }

  preview(audio: PreviewAudio, language: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    this.assertAvailable();
    validatePreviewAudio(audio, audio.sessionId);
    if (!/^(auto|[a-z]{2,3})$/.test(language)) throw new Error('Invalid preview language.');
    if (this.finalizing) throw new Error('Final transcription has priority.');
    if (this.previewDisabled) throw new Error('Preview disabled after unconfirmed worker shutdown.');
    if (this.previewOperation) throw new Error('Preview is already active.');
    const worker = this.previewWorker ??= this.createWorker('preview');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const operation = { controller, done: Promise.resolve('') };
    this.previewOperation = operation;
    operation.done = Promise.resolve().then(async () => {
      controller.signal.throwIfAborted();
      const server = await abortable(worker.ready(), controller.signal);
      controller.signal.throwIfAborted();
      const boundary = `----UniversalDictate${crypto.randomBytes(16).toString('hex')}`;
      const body = buildMultipartBody(boundary, 'preview.wav', audio.wav, language);
      this.emitRequest('preview', server);
      const response = await request({ host: '127.0.0.1', port: server.port,
        path: `${server.requestPath}/inference`, method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length), Connection: 'close' },
        body, signal: controller.signal, timeoutMs: 10_000, maxResponseBytes: 64 * 1024 });
      controller.signal.throwIfAborted();
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('Local preview inference failed.');
      return normalizeTranscript(response.body);
    }).catch(async error => {
      // HTTP abort is not native-idle proof. Never reuse this process after failure/abort.
      await this.retirePreview(worker);
      throw error;
    }).finally(() => {
      signal.removeEventListener('abort', abort);
      if (this.previewOperation === operation) this.previewOperation = undefined;
    });
    return operation.done;
  }

  async transcribe(audioPath: string, language: string, onPath?: (path: WhisperInferencePath) => void): Promise<string> {
    this.assertAvailable();
    if (this.finalizing) throw new Error('Final transcription is already active.');
    this.finalizing = true; // Prevent preview scheduling across any asynchronous Stop boundary.
    try {
      await this.stopPreview();
      this.assertAvailable();
      if ((await fs.promises.stat(audioPath)).size < 4000) return '';
      try {
        if (this.finalServerDisabled) throw new Error('Final server shutdown was not confirmed.');
        const server = await this.getFinalWorker().ready();
        this.assertAvailable();
        try { onPath?.('server'); } catch { /* Diagnostic observer only. */ }
        return await this.transcribeWithServer(server, audioPath, language);
      } catch (serverError) {
        this.assertAvailable();
        if (!await this.finalWorker.stop()) this.finalServerDisabled = true;
        this.assertAvailable();
        // Preview cleanup failures never trigger this fallback. Only final server failures do.
        try {
          try { onPath?.('cli'); } catch { /* Diagnostic observer only. */ }
          return await this.transcribeWithCli(audioPath, language);
        } catch (cliError) {
          throw new Error(`Warm Whisper worker failed (${errorMessage(serverError)}); fallback transcription also failed (${errorMessage(cliError)}).`);
        }
      }
    } finally {
      this.finalizing = false;
    }
  }

  getWorkerStatus(): { finalPid?: number; previewPid?: number; previewDisabled: boolean } {
    return { finalPid: this.finalWorker.pid, previewPid: this.previewWorker?.pid, previewDisabled: this.previewDisabled };
  }

  private getFinalWorker(): WhisperWorker {
    if (this.finalWorker.retired) this.finalWorker = this.createWorker('final');
    return this.finalWorker;
  }

  private createWorker(role: WorkerRole): WhisperWorker {
    return new WhisperWorker({ ...this.options, role,
      publicPath: role === 'preview' ? path.join(this.options.publicPath, 'preview') : this.options.publicPath,
      threads: role === 'preview' ? Math.min(2, getThreadCount()) : getThreadCount(),
      onEvent: this.options.onWorkerEvent });
  }

  private async retirePreview(worker: WhisperWorker): Promise<void> {
    const exited = await worker.stop();
    if (!exited) this.previewDisabled = true; // Do not accumulate unconfirmed orphan workers.
    if (exited && this.previewWorker === worker) this.previewWorker = undefined;
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error('Whisper runtime was disposed.');
  }

  private emitRequest(role: WorkerRole, server: ServerState): void {
    try { this.options.onWorkerEvent?.({ role, kind: 'request', atMs: performance.now(), pid: server.process.pid }); }
    catch { /* Benchmark observers cannot alter inference. */ }
  }

  private async transcribeWithServer(server: ServerState, audioPath: string, language: string): Promise<string> {
    if (server.process.exitCode !== null || server.process.signalCode != null) throw new Error('Whisper worker exited.');
    const audio = await fs.promises.readFile(audioPath);
    const boundary = `----UniversalDictate${crypto.randomBytes(16).toString('hex')}`;
    const body = buildMultipartBody(boundary, audioPath, audio, language);
    this.emitRequest('final', server);
    const response = await request({ host: '127.0.0.1', port: server.port,
      path: `${server.requestPath}/inference`, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length), Connection: 'keep-alive' },
      body, timeoutMs: 10 * 60 * 1000 });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Whisper worker returned HTTP ${response.statusCode}.`);
    }
    return normalizeTranscript(response.body);
  }

  private async transcribeWithCli(audioPath: string, language: string): Promise<string> {
    if (!fs.existsSync(this.options.cliPath)) throw new Error('Bundled Whisper CLI is missing.');
    const modelPath = await this.options.ensureModel();
    this.assertAvailable();
    const { stdout } = await execFile(this.options.cliPath, [
      '-m', modelPath, '-f', audioPath, '-l', language, '-t', String(getThreadCount()), '-nt', '-np', '-ng'
    ], { windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return normalizeTranscript(stdout);
  }
}

function getThreadCount(): number { return Math.max(1, Math.min(8, os.cpus().length - 2)); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
