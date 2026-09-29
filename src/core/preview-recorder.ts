import { Buffer } from 'node:buffer';
import { createPreviewAudio, PREVIEW_WINDOW_FRAMES, type PreviewLease } from './preview-audio';
import type { PreviewUpdate } from './preview-coordinator';

export const MAX_PREVIEW_LINE = PREVIEW_WINDOW_FRAMES * 4 + 256;
export function validPreviewSession(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Bounded line framing even for fragmented/malformed stdout. No transcript logs. */
export class RecorderLines {
  private pending = '';
  private dropping = false;
  constructor(private readonly limit: number, private readonly line: (value: string) => void,
    private readonly overflow: () => void) {}
  push(chunk: string): void {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf('\n', start);
      const end = newline < 0 ? chunk.length : newline;
      if (!this.dropping) {
        if (this.pending.length + end - start > this.limit) {
          this.pending = ''; this.dropping = true; this.overflow();
        } else this.pending += chunk.slice(start, end);
      }
      if (newline < 0) break;
      if (!this.dropping) this.line(this.pending.replace(/\r$/, ''));
      this.pending = ''; this.dropping = false; start = newline + 1;
    }
  }
  close(): void { this.pending = ''; this.dropping = false; }
}

type Pending = { id: number; settle: (value?: PreviewLease, error?: Error) => void };

/** One request at a time; PCM is transported in bounded frames, never in files. */
export class RecorderPreviewChannel {
  private pending?: Pending;
  private sequence = 0;
  private stopped = false;
  constructor(readonly sessionId: string, private readonly send: (line: string, fail: (error: Error) => void) => void) {
    if (!validPreviewSession(sessionId)) throw new Error('Invalid preview session.');
  }
  acquire(signal: AbortSignal): Promise<PreviewLease | undefined> {
    if (signal.aborted || this.stopped) return Promise.reject(new Error('Preview stopped.'));
    if (this.pending) return Promise.reject(new Error('Snapshot already pending.'));
    if (this.sequence >= Number.MAX_SAFE_INTEGER) return Promise.reject(new Error('Snapshot sequence exhausted.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => finish(undefined, new Error('Snapshot cancelled.'));
      const finish = (value?: PreviewLease, error?: Error) => {
        if (this.pending?.id !== id) return;
        this.pending = undefined;
        clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(value);
      };
      this.pending = { id, settle: finish };
      timer = setTimeout(() => finish(undefined, new Error('Snapshot timed out.')), 2_000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      try { this.send(`SNAPSHOT ${this.sessionId} ${id}\n`, error => finish(undefined, error)); }
      catch { finish(undefined, new Error('Snapshot request failed.')); }
    });
  }
  line(line: string): boolean {
    if (!line.startsWith('PREVIEW')) return false;
    if (!this.pending || this.stopped) return true;
    const parts = line.split(' ');
    if (parts[1] !== this.sessionId) { this.fail(); return true; }
    const request = Number(parts[2]);
    if (!Number.isSafeInteger(request) || request !== this.pending.id) return true; // Obsolete reply.
    if (parts[0] === 'PREVIEW_EMPTY' && parts.length === 3) { this.pending.settle(); return true; }
    try {
      if (parts.length !== 6 || parts[0] !== 'PREVIEW' || line.length > MAX_PREVIEW_LINE)
        throw new Error('Invalid snapshot frame.');
      const start = Number(parts[3]), end = Number(parts[4]);
      if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(end) || end <= start ||
          end - start > PREVIEW_WINDOW_FRAMES || !/^[0-9a-f]+$/.test(parts[5]) ||
          parts[5].length !== (end - start) * 4) throw new Error('Invalid snapshot bounds.');
      const audio = createPreviewAudio(this.sessionId, end, Buffer.from(parts[5], 'hex'));
      this.pending.settle({ audio, release: async () => {} });
    } catch { this.fail(); }
    return true;
  }
  display(update: PreviewUpdate): void {
    if (this.stopped) return;
    if (update.sessionId !== this.sessionId || !Number.isSafeInteger(update.revision) || update.revision < 1)
      throw new Error('Invalid preview display identity.');
    // Keep complete code points, strip controls, and cap native UI payloads.
    const text = Array.from(update.text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(-1024).join('');
    if (!text) return;
    this.send(`TEXT ${this.sessionId} ${update.revision} ${Buffer.from(text, 'utf8').toString('hex')}\n`, () => this.stop());
  }
  fail(): void { this.pending?.settle(undefined, new Error('Invalid native preview response.')); }
  stop(): void { this.stopped = true; this.pending?.settle(undefined, new Error('Preview stopped.')); }
}
