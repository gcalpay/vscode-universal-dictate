import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';

export const WHISPER_MODEL_FILENAME = 'ggml-base.bin';
export const WHISPER_MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
export const WHISPER_MODEL_SHA256 =
  '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';

const MAX_REDIRECTS = 8;

export interface ModelDownloadProgress {
  readonly increment?: number;
  readonly message?: string;
}

export interface EnsureWhisperModelOptions {
  readonly modelPath: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ModelDownloadProgress) => void;
}

export async function isWhisperModelInstalled(modelPath: string): Promise<boolean> {
  return await fileExists(modelPath);
}

/**
 * Ensure the pinned multilingual Whisper base model is available locally.
 *
 * Storage location, cancellation UI and progress presentation are supplied by
 * the host. Download, redirects, checksum verification and atomic finalization
 * stay identical for the VS Code extension and future standalone frontends.
 */
export async function ensureWhisperModel(
  options: EnsureWhisperModelOptions
): Promise<string> {
  if (await isWhisperModelInstalled(options.modelPath)) {
    return options.modelPath;
  }

  await fs.promises.mkdir(path.dirname(options.modelPath), { recursive: true });
  const temporaryPath = `${options.modelPath}.download`;

  await downloadFile(
    WHISPER_MODEL_URL,
    temporaryPath,
    options.onProgress,
    options.signal
  );

  const actualHash = await sha256File(temporaryPath);
  if (actualHash !== WHISPER_MODEL_SHA256) {
    await fs.promises.rm(temporaryPath, { force: true });
    throw new Error(
      `Whisper model checksum mismatch. Expected ${WHISPER_MODEL_SHA256}, got ${actualHash}.`
    );
  }

  await fs.promises.rename(temporaryPath, options.modelPath);
  return options.modelPath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(
  url: string,
  destination: string,
  onProgress: ((progress: ModelDownloadProgress) => void) | undefined,
  signal: AbortSignal | undefined
): Promise<void> {
  await fs.promises.rm(destination, { force: true });

  if (signal?.aborted) {
    throw new Error('Download cancelled.');
  }

  await new Promise<void>((resolve, reject) => {
    let activeRequest: ReturnType<typeof https.get> | undefined;
    let settled = false;

    const cleanupDestination = async () => {
      await fs.promises.rm(destination, { force: true }).catch(() => undefined);
    };

    const finishReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      void cleanupDestination().finally(() => reject(error));
    };

    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    };

    const handleAbort = () => {
      activeRequest?.destroy(new Error('Download cancelled.'));
      if (!activeRequest) {
        finishReject(new Error('Download cancelled.'));
      }
    };

    const request = (currentUrl: string, redirectsRemaining: number) => {
      if (signal?.aborted) {
        finishReject(new Error('Download cancelled.'));
        return;
      }

      activeRequest = https.get(
        currentUrl,
        { headers: { 'User-Agent': 'vscode-universal-dictate' } },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (status >= 300 && status < 400 && location) {
            response.resume();
            if (redirectsRemaining <= 0) {
              finishReject(new Error('Too many redirects while downloading Whisper model.'));
              return;
            }
            request(new URL(location, currentUrl).toString(), redirectsRemaining - 1);
            return;
          }

          if (status !== 200) {
            response.resume();
            finishReject(new Error(`Whisper model download failed with HTTP ${status}.`));
            return;
          }

          const totalBytes = Number(response.headers['content-length'] ?? 0);
          let receivedBytes = 0;
          let reportedPercent = 0;
          const output = fs.createWriteStream(destination, { flags: 'wx' });

          output.on('error', (error) => {
            response.destroy();
            finishReject(error);
          });

          response.on('error', (error) => {
            output.destroy();
            finishReject(error);
          });

          response.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.floor((receivedBytes / totalBytes) * 100);
              const increment = Math.max(0, percent - reportedPercent);
              if (increment > 0) {
                onProgress?.({ increment, message: `${percent}%` });
                reportedPercent = percent;
              }
            } else {
              onProgress?.({ message: `${Math.round(receivedBytes / 1024 / 1024)} MB` });
            }
          });

          response.pipe(output);
          output.on('finish', () => {
            output.close(finishResolve);
          });
        }
      );

      activeRequest.on('error', (error) => {
        if (signal?.aborted) {
          finishReject(new Error('Download cancelled.'));
        } else {
          finishReject(error);
        }
      });
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    request(url, MAX_REDIRECTS);
  });
}
