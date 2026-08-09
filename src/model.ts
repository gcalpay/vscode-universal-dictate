import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import * as vscode from 'vscode';

const MODEL_FILENAME = 'ggml-base.bin';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const MAX_REDIRECTS = 8;

export function getModelPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.globalStorageUri, 'models', MODEL_FILENAME).fsPath;
}

export async function ensureModel(context: vscode.ExtensionContext): Promise<string> {
  const modelPath = getModelPath(context);

  if (await fileExists(modelPath)) {
    return modelPath;
  }

  await fs.promises.mkdir(path.dirname(modelPath), { recursive: true });
  const temporaryPath = `${modelPath}.download`;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Universal Dictate: downloading local Whisper base model',
      cancellable: true
    },
    async (progress, token) => {
      await downloadFile(MODEL_URL, temporaryPath, progress, token);
      const actualHash = await sha256File(temporaryPath);
      if (actualHash !== MODEL_SHA256) {
        await fs.promises.rm(temporaryPath, { force: true });
        throw new Error(
          `Whisper model checksum mismatch. Expected ${MODEL_SHA256}, got ${actualHash}.`
        );
      }
      await fs.promises.rename(temporaryPath, modelPath);
    }
  );

  return modelPath;
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
  progress: vscode.Progress<{ increment?: number; message?: string }>,
  token: vscode.CancellationToken
): Promise<void> {
  await fs.promises.rm(destination, { force: true });

  await new Promise<void>((resolve, reject) => {
    let activeRequest: ReturnType<typeof https.get> | undefined;
    let cancelled = false;

    const cancellation = token.onCancellationRequested(() => {
      cancelled = true;
      activeRequest?.destroy(new Error('Download cancelled.'));
    });

    const fail = async (error: unknown) => {
      cancellation.dispose();
      await fs.promises.rm(destination, { force: true }).catch(() => undefined);
      reject(error);
    };

    const request = (currentUrl: string, redirectsRemaining: number) => {
      if (cancelled) {
        void fail(new Error('Download cancelled.'));
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
              void fail(new Error('Too many redirects while downloading Whisper model.'));
              return;
            }
            request(new URL(location, currentUrl).toString(), redirectsRemaining - 1);
            return;
          }

          if (status !== 200) {
            response.resume();
            void fail(new Error(`Whisper model download failed with HTTP ${status}.`));
            return;
          }

          const totalBytes = Number(response.headers['content-length'] ?? 0);
          let receivedBytes = 0;
          let reportedPercent = 0;
          const output = fs.createWriteStream(destination, { flags: 'wx' });

          output.on('error', (error) => {
            response.destroy();
            void fail(error);
          });

          response.on('error', (error) => {
            output.destroy();
            void fail(error);
          });

          response.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = Math.floor((receivedBytes / totalBytes) * 100);
              const increment = Math.max(0, percent - reportedPercent);
              if (increment > 0) {
                progress.report({ increment, message: `${percent}%` });
                reportedPercent = percent;
              }
            } else {
              progress.report({ message: `${Math.round(receivedBytes / 1024 / 1024)} MB` });
            }
          });

          response.pipe(output);
          output.on('finish', () => {
            output.close(() => {
              cancellation.dispose();
              resolve();
            });
          });
        }
      );

      activeRequest.on('error', (error) => {
        if (!cancelled) {
          void fail(error);
        } else {
          void fail(new Error('Download cancelled.'));
        }
      });
    };

    request(url, MAX_REDIRECTS);
  });
}
