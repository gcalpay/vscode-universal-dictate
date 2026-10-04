/** Nonterminal recorder commands with matching acknowledgements, never optimistic state. */
type PendingPause = {
  readonly id: number;
  readonly paused: boolean;
  readonly done: Promise<void>;
  readonly settle: (error?: Error) => void;
};

export class RecorderPauseChannel {
  private sequence = 0;
  private paused = false;
  private closed = false;
  private pending?: PendingPause;

  constructor(private readonly send: (line: string, fail: (error: Error) => void) => void) {}

  setPaused(paused: boolean): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Recorder controls are closed.'));
    if (this.pending) return this.pending.paused === paused ? this.pending.done
      : Promise.reject(new Error('Pause/Resume is already pending.'));
    if (this.paused === paused) return Promise.resolve();
    if (this.sequence >= 0x7fffffff) return Promise.reject(new Error('Recorder control sequence exhausted.'));
    const id = ++this.sequence;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const done = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Cancellation can reject before a caller's next microtask installs its handler.
    void done.catch(() => undefined);
    const timer = setTimeout(() => settle(new Error('Pause/Resume was not confirmed by the recorder.')), 5_000);
    const settle = (error?: Error) => {
      if (this.pending?.id !== id) return;
      this.pending = undefined;
      clearTimeout(timer);
      if (error) reject(error);
      else { this.paused = paused; resolve(); }
    };
    this.pending = { id, paused, done, settle };
    try { this.send(`${paused ? 'PAUSE' : 'RESUME'} ${id}\n`, settle); }
    catch { settle(new Error('Recorder control write failed.')); }
    return done;
  }

  line(line: string): boolean {
    const match = /^(PAUSED|RESUMED) ([1-9][0-9]{0,9})$/.exec(line);
    if (!match) return false;
    if (!this.closed && this.pending && Number(match[2]) === this.pending.id &&
        (match[1] === 'PAUSED') === this.pending.paused) this.pending.settle();
    return true;
  }

  stop(): void {
    this.closed = true;
    this.pending?.settle(new Error('Recorder stopped during Pause/Resume.'));
  }
}
