import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as util from 'node:util';
import * as vscode from 'vscode';
import { ensureModel } from './model';

const execFile = util.promisify(childProcess.execFile);
const WHISPER_RELATIVE_PATH = ['resources', 'whisper', 'whisper-cli.exe'];

export function getWhisperCliPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...WHISPER_RELATIVE_PATH).fsPath;
}

export async function transcribe(
  context: vscode.ExtensionContext,
  audioPath: string
): Promise<string> {
  const whisperPath = getWhisperCliPath(context);
  if (!fs.existsSync(whisperPath)) {
    throw new Error(`Bundled whisper.cpp runtime is missing: ${whisperPath}`);
  }

  const modelPath = await ensureModel(context);
  const configuration = vscode.workspace.getConfiguration('universalDictate');
  const language = configuration.get<string>('language', 'auto');
  const threadCount = Math.max(1, Math.min(8, os.cpus().length - 2));

  const { stdout, stderr } = await execFile(
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

  const transcript = normalizeTranscript(stdout);
  if (!transcript && stderr.trim()) {
    throw new Error(`whisper.cpp produced no transcript: ${stderr.trim()}`);
  }
  return transcript;
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
