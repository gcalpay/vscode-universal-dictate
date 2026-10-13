import * as vscode from 'vscode';
import { WhisperRuntime, type WhisperInferencePath } from './core/whisper';
import { normalizeWhisperLanguage } from './languages';
import { ensureModel } from './model';
import type { PreviewAudio } from './core/preview-audio';

const WHISPER_CLI_RELATIVE_PATH = ['resources', 'whisper', 'whisper-cli.exe'];
const WHISPER_SERVER_RELATIVE_PATH = ['resources', 'whisper', 'whisper-server.exe'];

let runtime: WhisperRuntime | undefined;
let runtimeKey: string | undefined;

export function getWhisperCliPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...WHISPER_CLI_RELATIVE_PATH).fsPath;
}

export function getWhisperServerPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...WHISPER_SERVER_RELATIVE_PATH).fsPath;
}

export function isWhisperWarm(): boolean {
  return runtime?.isWarm() ?? false;
}

/**
 * Start whisper-server in the background so model loading overlaps with the
 * user's recording. The shared runtime keeps the model resident for later
 * dictations in the same extension-host session.
 */
export async function warmWhisper(context: vscode.ExtensionContext): Promise<void> {
  await getRuntime(context).warm();
}

export function disposeWhisper(): void {
  runtime?.dispose();
  runtime = undefined;
  runtimeKey = undefined;
}

export async function transcribe(
  context: vscode.ExtensionContext,
  audioPath: string,
  sessionLanguage?: string,
  onPath?: (path: WhisperInferencePath) => void
): Promise<string> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const language = normalizeWhisperLanguage(sessionLanguage ?? configuration.get<string>('language', 'en'));
  return await getRuntime(context).transcribe(audioPath, language, onPath);
}

/** Does not create a runtime when preview is disabled or no recording has begun. */
export async function stopWhisperPreview(): Promise<void> {
  await runtime?.stopPreview();
}

export async function previewWhisper(context: vscode.ExtensionContext, audio: PreviewAudio,
  language: string, signal: AbortSignal): Promise<string> {
  return await getRuntime(context).preview(audio, language, signal);
}

function getRuntime(context: vscode.ExtensionContext): WhisperRuntime {
  const cliPath = getWhisperCliPath(context);
  const serverPath = getWhisperServerPath(context);
  const publicPath = vscode.Uri.joinPath(context.globalStorageUri, 'whisper-server-public').fsPath;
  const key = `${cliPath}\n${serverPath}\n${publicPath}`;

  if (runtime && runtimeKey === key) {
    return runtime;
  }

  runtime?.dispose();
  runtime = new WhisperRuntime({
    cliPath,
    serverPath,
    publicPath,
    ensureModel: () => ensureModel(context)
  });
  runtimeKey = key;
  return runtime;
}
