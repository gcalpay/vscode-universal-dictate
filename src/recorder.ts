import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  CoreRecorderSession,
  RecorderAction,
  RecorderOverlayStyle
} from './core/recorder';

const RECORDER_RELATIVE_PATH = ['resources', 'bin', 'universal-dictate-recorder.exe'];

export { RecorderAction, RecorderOverlayStyle } from './core/recorder';

/**
 * VS Code adapter for the editor-independent recorder session.
 *
 * Keep the existing extension-facing API stable while path and storage policy
 * remain owned by the VS Code host. Standalone callers can use CoreRecorderSession
 * directly with their own recorder and output paths.
 */
export class RecorderSession {
  private constructor(private readonly core: CoreRecorderSession) {}

  get outputPath(): string {
    return this.core.outputPath;
  }

  static async start(
    context: vscode.ExtensionContext,
    onLevel: (level: number) => void,
    showOverlay = true,
    overlayStyle: RecorderOverlayStyle = 'compact',
    waveformTimeSpanSeconds = 1
  ): Promise<RecorderSession> {
    const recorderPath = getRecorderPath(context);
    if (!fs.existsSync(recorderPath)) {
      throw new Error(`Native microphone recorder is missing: ${recorderPath}`);
    }

    const recordingsDir = vscode.Uri.joinPath(context.globalStorageUri, 'recordings').fsPath;
    await fs.promises.mkdir(recordingsDir, { recursive: true });
    const outputPath = path.join(recordingsDir, `dictation-${Date.now()}.wav`);

    const core = await CoreRecorderSession.start(
      { recorderPath, outputPath, showOverlay, overlayStyle, waveformTimeSpanSeconds },
      onLevel
    );
    return new RecorderSession(core);
  }

  onAction(listener: (action: RecorderAction) => void): void {
    this.core.onAction(listener);
  }

  async stop(): Promise<string> {
    return await this.core.stop();
  }

  async cancel(): Promise<void> {
    await this.core.cancel();
  }
}

export function getRecorderPath(context: vscode.ExtensionContext): string {
  return vscode.Uri.joinPath(context.extensionUri, ...RECORDER_RELATIVE_PATH).fsPath;
}
