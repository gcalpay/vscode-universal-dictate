import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as util from 'node:util';
import * as vscode from 'vscode';
import { normalizeWhisperLanguage } from './languages';
import { ensureModel } from './model';

const execFile = util.promisify(childProcess.execFile);
const WHISPER_CLI_RELATIVE_PATH = ['resources', 'whisper', 'whisper-cli.exe'];
const WHISPER_SERVER_RELATIVE_PATH = ['resources', 'whisper', 'whisper-server.exe'];
const MIN_AUDIO_BYTES = 4000;
const SERVER_START_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 100;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const STDERR_TAIL_LIMIT = 12 * 1024;

type WhisperServerState = {
  readonly process: childProcess.ChildProcess;
  readonly port: number;
  readonly requestPath: string;
  readonly modelPath: string;
  stderrTail: string;
};

let warmServer: WhisperServerState | undefined;
let warmServerStart: Promise<WhisperServerState> | undefined;
let activeServerProcess: childProcess.ChildProcess | undefined;

export function getWhisperCliPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...WHISPER_CLI_RELATIVE_PATH).fsPath;
}

export function getWhisperServerPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...WHISPER_SERVER_RELATIVE_PATH).fsPath;
}

export function isWhisperWarm(): boolean {
  return warmServer !== undefined && warmServer.process.exitCode === null;
}

/**
 * Start whisper-server in the background so model loading overlaps with the
 * user's recording. The server remains bound to localhost for the lifetime of
 * the extension host and reuses the same loaded model for later dictations.
 */
export async function warmWhisper(context: vscode.ExtensionContext): Promise<void> {
  await ensureWarmServer(context);
}

export function disposeWhisper(): void {
  warmServer = undefined;
  warmServerStart = undefined;

  const process = activeServerProcess;
  activeServerProcess = undefined;
  if (process && process.exitCode === null) {
    process.kill();
  }
}

export async function transcribe(
  context: vscode.ExtensionContext,
  audioPath: string
): Promise<string> {
  const audioStat = await fs.promises.stat(audioPath);
  if (audioStat.size < MIN_AUDIO_BYTES) {
    return '';
  }

  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const language = normalizeWhisperLanguage(configuration.get<string>('language', 'auto'));

  try {
    const server = await ensureWarmServer(context);
    return await transcribeWithServer(server, audioPath, language);
  } catch (serverError) {
    // Preserve dictation reliability if the warm worker cannot start or dies.
    // The one-shot CLI is slower because it reloads the model, but it is a
    // proven fallback and keeps a transient server problem from losing speech.
    disposeWhisper();

    try {
      return await transcribeWithCli(context, audioPath, language);
    } catch (cliError) {
      const serverMessage = errorMessage(serverError);
      const cliMessage = errorMessage(cliError);
      throw new Error(
        `Warm Whisper worker failed (${serverMessage}); fallback transcription also failed (${cliMessage}).`
      );
    }
  }
}

async function ensureWarmServer(context: vscode.ExtensionContext): Promise<WhisperServerState> {
  const modelPath = await ensureModel(context);

  if (
    warmServer &&
    warmServer.modelPath === modelPath &&
    warmServer.process.exitCode === null
  ) {
    return warmServer;
  }

  if (warmServerStart) {
    return await warmServerStart;
  }

  warmServerStart = startWhisperServer(context, modelPath);
  try {
    const server = await warmServerStart;
    warmServer = server;
    return server;
  } finally {
    warmServerStart = undefined;
  }
}

async function startWhisperServer(
  context: vscode.ExtensionContext,
  modelPath: string
): Promise<WhisperServerState> {
  const serverPath = getWhisperServerPath(context);
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Bundled whisper.cpp server is missing: ${serverPath}`);
  }

  const port = await findFreeLocalPort();
  const requestPath = `/universal-dictate-${crypto.randomUUID()}`;
  const publicPath = vscode.Uri.joinPath(context.globalStorageUri, 'whisper-server-public').fsPath;
  await fs.promises.mkdir(publicPath, { recursive: true });

  const threadCount = getThreadCount();
  const server = childProcess.spawn(
    serverPath,
    [
      '-m', modelPath,
      '-t', String(threadCount),
      '-nt',
      '-ng',
      '--host', '127.0.0.1',
      '--port', String(port),
      '--request-path', requestPath,
      '--public', publicPath
    ],
    {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );

  activeServerProcess = server;
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
    if (activeServerProcess === server) {
      activeServerProcess = undefined;
    }
    if (warmServer?.process === server) {
      warmServer = undefined;
    }
  });

  try {
    await waitUntilHealthy(state);
    return state;
  } catch (error) {
    if (server.exitCode === null) {
      server.kill();
    }
    if (activeServerProcess === server) {
      activeServerProcess = undefined;
    }
    throw error;
  }
}

async function transcribeWithServer(
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

async function transcribeWithCli(
  context: vscode.ExtensionContext,
  audioPath: string,
  language: string
): Promise<string> {
  const whisperPath = getWhisperCliPath(context);
  if (!fs.existsSync(whisperPath)) {
    throw new Error(`Bundled whisper.cpp runtime is missing: ${whisperPath}`);
  }

  const modelPath = await ensureModel(context);
  const threadCount = getThreadCount();

  const { stdout } = await execFile(
    whisperPath,
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
