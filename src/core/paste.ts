import * as childProcess from 'node:child_process';
import { MAX_TRANSCRIPT_BYTES, TEXT_INPUT_ARGUMENT, parseTextInputReport, textInputFailure } from './input-protocol';

export interface FocusedPasteOptions {
  readonly helperPath: string;
  readonly signal?: AbortSignal;
  readonly overwriteClipboard?: boolean;
  readonly clipboard?: { writeText(text: string): PromiseLike<void> };
}

/**
 * Always attempt direct Unicode text input. The optional clipboard copy is a
 * backup, not an insertion transport. Off performs ZERO clipboard operations.
 * On writes once before input, even if no target exists, and never restores.
 */
export async function pasteIntoFocusedControl(options: FocusedPasteOptions, text: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Text insertion requires the Windows UI host.');
  const cancelled = () => options.signal?.aborted === true;
  if (cancelled()) throw new Error('Insertion cancelled.');
  if (!text.length || text.includes('\0') || Buffer.byteLength(text, 'utf8') > MAX_TRANSCRIPT_BYTES ||
      Buffer.from(text, 'utf8').toString('utf8') !== text) {
    throw new Error('Transcript is empty, too large, or contains invalid Unicode.');
  }

  // Capture once: a later settings edit cannot change an in-flight operation.
  const overwriteClipboard = options.overwriteClipboard === true;
  let copied = false;
  let copyFailed = false;
  if (overwriteClipboard) {
    try {
      if (!options.clipboard) throw new Error('No clipboard writer.');
      await options.clipboard.writeText(text);
      copied = true;
    } catch {
      // A failed optional backup must not disable ordinary dictation.
      copyFailed = true;
    }
  }
  if (cancelled()) throw new Error(copied ? 'Insertion cancelled. The transcript was copied to the clipboard.' : 'Insertion cancelled.');
  try {
    await sendUnicodeInput(options, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text insertion failed.';
    const backup = copied ? ' The transcript was copied to the clipboard; no restoration was attempted.'
      : copyFailed ? ' The clipboard backup also failed.' : ' The clipboard was not accessed.';
    throw new Error(message + backup);
  }
  if (copyFailed) throw new Error('Text input was attempted, but the optional clipboard backup failed. Do not insert again without checking the target.');
}

function sendUnicodeInput(options: FocusedPasteOptions, text: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let child: childProcess.ChildProcessWithoutNullStreams;
    try {
      child = childProcess.spawn(options.helperPath, [TEXT_INPUT_ARGUMENT], {
        windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      reject(new Error('Text input helper could not start.'));
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
      // Lifetime-pipe EOF stops pending chunks; submitted input cannot be undone.
      try { child.stdin.end(); } catch { child.stdin.destroy(); }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      outputBytes += Buffer.byteLength(data, 'utf8');
      if (outputBytes > 4096) { invalidOutput = true; cancel(); }
      else output += data;
    });
    child.stdout.on('error', () => { invalidOutput = true; cancel(); });
    child.stderr.on('error', () => { invalidOutput = true; cancel(); });
    child.stderr.resume(); // Never log arbitrary helper output or transcript data.
    child.stdin.on('error', () => {
      if (!options.signal?.aborted) inputFailed = true;
      cancel();
    });
    child.on('error', () => { launchFailed = true; cancel(); });
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      options.signal?.removeEventListener('abort', cancel);
      child.stdin.destroy();
      try {
        if (launchFailed) throw new Error('Text input helper could not start.');
        if (signal || invalidOutput) throw new Error('Text input ended without a reliable result. Check the target before retrying.');
        const report = parseTextInputReport(output, code);
        if (report.code !== 'ok' && report.code !== 'no_target') throw textInputFailure(report);
        if (inputFailed) throw new Error('Text input pipe failed. Check the target before retrying.');
        // No target is an accepted no-op. Never fall back to clipboard or retry.
        resolve();
      } catch (error) { reject(error); }
    });
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) { cancel(); return; }
    try {
      const bytes = Buffer.from(text, 'utf8');
      child.stdin.write(Buffer.concat([Buffer.from(`UDTI1 ${bytes.length}\n`, 'ascii'), bytes]));
    } catch { inputFailed = true; cancel(); }
  });
}
