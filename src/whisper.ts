import * as vscode from 'vscode';
import { WhisperRuntime } from './core/whisper';
import { normalizeWhisperLanguage } from './languages';
import { ensureModel } from './model';

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
  audioPath: string
): Promise<string> {
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const language = normalizeWhisperLanguage(configuration.get<string>('language', 'auto'));
  return await getRuntime(context).transcribe(audioPath, language);
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
