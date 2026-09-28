import * as childProcess from 'node:child_process';
import {
  CLIPBOARD_HELPER_ARGUMENT, MAX_TRANSCRIPT_BYTES,
  clipboardFailure, parseClipboardReport
} from './clipboard-protocol';

export interface FocusedPasteOptions {
  readonly helperPath: string;
  readonly signal?: AbortSignal;
}

/**
 * The native helper owns the COMPLETE snapshot -> write -> paste -> restore
 * transaction. The host never reduces clipboard data to a text-only backup.
 * Transcript bytes go over stdin, never shell arguments or a temporary file.
 */
export async function pasteIntoFocusedControl(options: FocusedPasteOptions, text: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Universal Dictate clipboard insertion requires the Windows UI host.');
  }
  if (options.signal?.aborted) throw new Error('Insertion cancelled before clipboard access.');
  if (text.length === 0 || text.includes('\0') || Buffer.byteLength(text, 'utf8') > MAX_TRANSCRIPT_BYTES) {
    throw new Error('Transcript is empty, too large, or contains an unsupported null character. Clipboard was not changed.');
  }
  // Replacing unpaired UTF-16 surrogates while encoding would silently change
  // the retained transcript. Refuse instead; ordinary Unicode is unchanged.
  if (Buffer.from(text, 'utf8').toString('utf8') !== text) {
    throw new Error('Transcript contains invalid Unicode. Clipboard was not changed.');
  }
  await new Promise<void>((resolve, reject) => {
    let child: childProcess.ChildProcessWithoutNullStreams;
    try {
      child = childProcess.spawn(options.helperPath, [CLIPBOARD_HELPER_ARGUMENT], {
        windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      reject(new Error('Clipboard helper could not start. Last transcript remains available.'));
      return;
    }
    let output = '';
    let outputBytes = 0;
    let invalidOutput = false;
    let inputFailed = false;
    let launchFailed = false;
    let inputEnded = false;
    const cancel = () => {
      if (inputEnded) return;
      inputEnded = true;
      // EOF is a cooperative cancellation request, NOT process termination.
      // The helper still owns restoring any clipboard it has already replaced.
      try { child.stdin.end(); } catch { child.stdin.destroy(); }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      outputBytes += Buffer.byteLength(data, 'utf8');
      if (outputBytes > 4096) invalidOutput = true;
      else output += data;
      // Do not kill a running helper: it may still be restoring the clipboard.
    });
    child.stdout.on('error', () => { invalidOutput = true; });
    child.stderr.on('error', () => { invalidOutput = true; });
    child.stderr.resume(); // Drain, but never echo arbitrary/sensitive output.
    child.stdin.on('error', () => { if (!options.signal?.aborted) inputFailed = true; });
    child.on('error', () => { launchFailed = true; });
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      options.signal?.removeEventListener('abort', cancel);
      child.stdin.destroy();
      try {
        if (launchFailed) throw new Error('Clipboard helper could not start. Last transcript remains available.');
        if (signal || invalidOutput) throw new Error('Clipboard helper ended without a reliable result. Check clipboard and target before retrying; Last transcript remains available.');
        const report = parseClipboardReport(output, code);
        if (report.code !== 'ok') throw clipboardFailure(report);
        if (inputFailed) throw new Error('Clipboard helper input failed. Check the target before reinserting; Last transcript remains available.');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    // Keep stdin open after the frame. The helper checks that the originating
    // operation is still alive at each pre-paste boundary. Closing it requests
    // cancellation, including when the extension host itself terminates.
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) { cancel(); return; }
    // One process and one attempt. No legacy helper or PowerShell fallback.
    try {
      const bytes = Buffer.from(text, 'utf8');
      const header = Buffer.from(`UDCP2 ${bytes.length}\n`, 'ascii');
      child.stdin.write(Buffer.concat([header, bytes]));
    } catch {
      inputFailed = true;
      child.stdin.destroy();
    }
  });
}
