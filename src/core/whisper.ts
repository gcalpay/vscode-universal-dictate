import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as util from 'node:util';

const execFile = util.promisify(childProcess.execFile);
const MIN_AUDIO_BYTES = 4000;
const SERVER_START_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 100;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const STDERR_TAIL_LIMIT = 12 * 1024;

export interface WhisperRuntimeOptions {
  readonly cliPath: string;
  readonly serverPath: string;
  readonly publicPath: string;
  readonly ensureModel: () => Promise<string>;
}

type WhisperServerState = {
  readonly process: childProcess.ChildProcess;
  readonly port: number;
  readonly requestPath: string;
  readonly modelPath: string;
  stderrTail: string;
};

/**
 * Editor-independent whisper.cpp runtime with a persistent local server and
 * one-shot CLI fallback.
 *
 * Hosts provide executable/storage paths and model acquisition. This class
 * owns only inference process lifecycle and the localhost HTTP protocol.
 */
export class WhisperRuntime {
  private warmServer: WhisperServerState | undefined;
  private warmServerStart: Promise<WhisperServerState> | undefined;
  private activeServerProcess: childProcess.ChildProcess | undefined;

  constructor(private readonly options: WhisperRuntimeOptions) {}

  isWarm(): boolean {
    return this.warmServer !== undefined && this.warmServer.process.exitCode === null;
  }

  async warm(): Promise<void> {
    await this.ensureWarmServer();
  }

  dispose(): void {
    this.warmServer = undefined;
    this.warmServerStart = undefined;

    const process = this.activeServerProcess;
    this.activeServerProcess = undefined;
    if (process && process.exitCode === null) {
      process.kill();
    }
  }

  async transcribe(audioPath: string, language: string): Promise<string> {
    const audioStat = await fs.promises.stat(audioPath);
    if (audioStat.size < MIN_AUDIO_BYTES) {
      return '';
    }

    try {
      const server = await this.ensureWarmServer();
      return await this.transcribeWithServer(server, audioPath, language);
    } catch (serverError) {
      // Preserve dictation reliability if the warm worker cannot start or dies.
      // The one-shot CLI is slower because it reloads the model, but it keeps a
      // transient server problem from losing the user's speech.
      this.dispose();

      try {
        return await this.transcribeWithCli(audioPath, language);
      } catch (cliError) {
        const serverMessage = errorMessage(serverError);
        const cliMessage = errorMessage(cliError);
        throw new Error(
          `Warm Whisper worker failed (${serverMessage}); fallback transcription also failed (${cliMessage}).`
        );
      }
    }
  }

  private async ensureWarmServer(): Promise<WhisperServerState> {
    const modelPath = await this.options.ensureModel();

    if (
      this.warmServer &&
      this.warmServer.modelPath === modelPath &&
      this.warmServer.process.exitCode === null
    ) {
      return this.warmServer;
    }

    if (this.warmServerStart) {
      return await this.warmServerStart;
    }

    this.warmServerStart = this.startWhisperServer(modelPath);
    try {
      const server = await this.warmServerStart;
      this.warmServer = server;
      return server;
    } finally {
      this.warmServerStart = undefined;
    }
  }

  private async startWhisperServer(modelPath: string): Promise<WhisperServerState> {
    if (!fs.existsSync(this.options.serverPath)) {
      throw new Error(`Bundled whisper.cpp server is missing: ${this.options.serverPath}`);
    }

    const port = await findFreeLocalPort();
    const requestPath = `/universal-dictate-${crypto.randomUUID()}`;
    await fs.promises.mkdir(this.options.publicPath, { recursive: true });

    const threadCount = getThreadCount();
    const server = childProcess.spawn(
      this.options.serverPath,
      [
        '-m', modelPath,
        '-t', String(threadCount),
        '-nt',
        '-ng',
        '--host', '127.0.0.1',
        '--port', String(port),
        '--request-path', requestPath,
        '--public', this.options.publicPath
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe']
      }
    );

    this.activeServerProcess = server;
    const state: WhisperServerState = {
      process: server,
      port,
      requestPath,
      modelPath,
      stderrTail: ''
    };

    server.stderr?.setEncoding('utf8');
    server.stderr?.on('data', (chunk: string) => {
      state.stderrTail = `${state.stderrTail}${chunk}`.slice(-STDERR_TAIL_LIMIT);
    });

    server.once('exit', () => {
      if (this.activeServerProcess === server) {
        this.activeServerProcess = undefined;
      }
      if (this.warmServer?.process === server) {
        this.warmServer = undefined;
      }
    });

    try {
      await waitUntilHealthy(state);
      return state;
    } catch (error) {
      if (server.exitCode === null) {
        server.kill();
      }
      if (this.activeServerProcess === server) {
        this.activeServerProcess = undefined;
      }
      throw error;
    }
  }

  private async transcribeWithServer(
    server: WhisperServerState,
    audioPath: string,
    language: string
  ): Promise<string> {
    if (server.process.exitCode !== null) {
      throw new Error(`Whisper worker exited with code ${server.process.exitCode}.`);
    }

    const audio = await fs.promises.readFile(audioPath);
    const boundary = `----UniversalDictate${crypto.randomBytes(16).toString('hex')}`;
    const body = buildMultipartBody(boundary, audioPath, audio, language);

    const response = await request({
      host: '127.0.0.1',
      port: server.port,
      path: `${server.requestPath}/inference`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
        Connection: 'keep-alive'
      },
      body,
      timeoutMs: REQUEST_TIMEOUT_MS
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `Whisper worker returned HTTP ${response.statusCode}: ${response.body.trim().slice(0, 500)}`
      );
    }

    return normalizeTranscript(response.body);
  }

  private async transcribeWithCli(audioPath: string, language: string): Promise<string> {
    if (!fs.existsSync(this.options.cliPath)) {
      throw new Error(`Bundled whisper.cpp runtime is missing: ${this.options.cliPath}`);
    }

    const modelPath = await this.options.ensureModel();
    const threadCount = getThreadCount();

    const { stdout } = await execFile(
      this.options.cliPath,
      [
        '-m', modelPath,
        '-f', audioPath,
        '-l', language,
        '-t', String(threadCount),
        '-nt',
        '-np',
        '-ng'
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024
      }
    );

    return normalizeTranscript(stdout);
  }
}

function buildMultipartBody(
  boundary: string,
  audioPath: string,
  audio: Buffer,
  language: string
): Buffer {
  const chunks: Buffer[] = [];
  const addField = (name: string, value: string) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`,
        'utf8'
      )
    );
  };

  addField('language', language);
  addField('response_format', 'text');
  addField('no_timestamps', 'true');

  const filename = path.basename(audioPath).replace(/["\r\n]/g, '_');
  chunks.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`,
      'utf8'
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  );

  return Buffer.concat(chunks);
}

async function waitUntilHealthy(server: WhisperServerState): Promise<void> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (server.process.exitCode !== null) {
      throw new Error(
        `Whisper worker exited during startup with code ${server.process.exitCode}.${formatStderr(server)}`
      );
    }

    const response = await request({
      host: '127.0.0.1',
      port: server.port,
      path: `${server.requestPath}/health`,
      method: 'GET',
      timeoutMs: 500
    }).catch(() => undefined);

    if (response?.statusCode === 200) {
      return;
    }

    await delay(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(`Whisper worker did not become ready within 30 seconds.${formatStderr(server)}`);
}

async function findFreeLocalPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not allocate a local port for the Whisper worker.'));
        return;
      }

      const port = address.port;
      probe.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(port);
        }
      });
    });
  });
}

type HttpRequestOptions = {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Record<string, string>;
  readonly body?: Buffer;
  readonly timeoutMs: number;
};

type HttpResponse = {
  readonly statusCode: number;
  readonly body: string;
};

async function request(options: HttpRequestOptions): Promise<HttpResponse> {
  return await new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    const finishResolve = (value: HttpResponse) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const finishReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const req = http.request(
      {
        host: options.host,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          finishResolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
        response.on('error', (error) => finishReject(error));
      }
    );

    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error(`Local Whisper request timed out after ${options.timeoutMs} ms.`));
    });
    req.on('error', (error) => finishReject(error));

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function getThreadCount(): number {
  return Math.max(1, Math.min(8, os.cpus().length - 2));
}

function formatStderr(server: WhisperServerState): string {
  const tail = server.stderrTail.trim();
  return tail ? ` ${tail.slice(-1000)}` : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeTranscript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
