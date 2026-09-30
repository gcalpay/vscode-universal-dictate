import { performance } from 'node:perf_hooks';
import { validatePreviewAudio, type PreviewAudio, type PreviewLease } from './preview-audio';

export type PreviewFailure = 'snapshot' | 'invalid-snapshot' | 'decode' | 'invalid-text' |
  'display' | 'cleanup' | 'timeout';

/** Injectable monotonic clock; callbacks must be scheduled, not invoked inline. */
export interface PreviewClock {
  now(): number;
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

const systemClock: PreviewClock = {
  now: () => performance.now(),
  set: (delayMs, callback) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return timer;
  },
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export interface PreviewUpdate {
  readonly sessionId: string;
  readonly revision: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly text: string;
}

export interface PreviewOptions {
  readonly sessionId: string;
  /** Already normalized by the existing language catalog; copied for this session. */
  readonly language: string;
  readonly acquire: (signal: AbortSignal) => Promise<PreviewLease | undefined>;
  /** Preview-only adapter: no CLI retry, insertion, clipboard copy or final retention. */
  readonly decode: (audio: PreviewAudio, language: string, signal: AbortSignal) => Promise<string>;
  /** Synchronous display handoff. The native UI adapter must also check session/revision. */
  readonly onPreview: (update: PreviewUpdate) => void;
  /** Fixed error category only; never pass transcript text or raw backend output. */
  readonly onFailure: (failure: PreviewFailure) => void;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly clock?: PreviewClock;
}

type ActivePreview = {
  readonly controller: AbortController;
  deadline?: unknown;
  done: Promise<void>;
};

/**
 * One coordinator per recording, with one acquire/decode/release operation at a
 * time. Missed ticks are skipped; every acquisition requests the latest audio.
 * No connection to the extension yet: the native PCM and HTTP adapters follow.
 */
export class PreviewCoordinator {
  private readonly options: Readonly<PreviewOptions>;
  private readonly clock: PreviewClock;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private state: 'idle' | 'running' | 'stopped' | 'failed' = 'idle';
  private origin = 0;
  private timer: unknown;
  private active: ActivePreview | undefined;
  private revision = 0;
  private lastEndFrame = -1;

  constructor(options: PreviewOptions) {
    if (!options.sessionId || options.sessionId.length > 128 ||
        !/^(auto|[a-z]{2,3})$/.test(options.language)) {
      throw new Error('Invalid preview session configuration.');
    }
    this.intervalMs = options.intervalMs ?? 2_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isFinite(this.intervalMs) || this.intervalMs < 1 || this.intervalMs > 60_000 ||
        !Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000) {
      throw new Error('Invalid preview interval or timeout.');
    }
    this.options = Object.freeze({ ...options });
    this.clock = options.clock ?? systemClock;
  }

  start(): void {
    if (this.state !== 'idle') throw new Error('Preview coordinator is single-use.');
    this.origin = this.clock.now();
    this.state = 'running';
    this.schedule();
  }

  /**
   * Invalidate display immediately and abort active adapters. Awaiting this promise
   * waits for host adapter settlement/resource release, NOT proof of native model
   * idleness. Final inference/worker recovery remain the runtime owner's job.
   * An adapter ignoring abort can delay settlement; never fake completion or reuse
   * its snapshot while that adapter still owns it.
   */
  stop(): Promise<void> {
    if (this.state !== 'failed') this.state = 'stopped';
    this.clearScheduled();
    if (this.active) {
      this.clearDeadline(this.active);
      this.active.controller.abort();
      return this.active.done;
    }
    return Promise.resolve();
  }

  private schedule(): void {
    if (this.state !== 'running' || this.active) return;
    const elapsed = Math.max(0, this.clock.now() - this.origin);
    const next = (Math.floor(elapsed / this.intervalMs) + 1) * this.intervalMs;
    this.timer = this.clock.set(next - elapsed, () => {
      this.timer = undefined;
      this.launch();
    });
  }

  private launch(): void {
    if (this.state !== 'running' || this.active) return;
    const operation: ActivePreview = { controller: new AbortController(), done: Promise.resolve() };
    this.active = operation;
    // Schedule the body so reentrant Stop sees the real promise before acquire runs.
    operation.done = Promise.resolve().then(() => this.execute(operation));
    operation.deadline = this.clock.set(this.timeoutMs, () => this.fail('timeout'));
  }

  private current(operation: ActivePreview): boolean {
    return this.state === 'running' && this.active === operation && !operation.controller.signal.aborted;
  }

  private async execute(operation: ActivePreview): Promise<void> {
    let lease: PreviewLease | undefined;
    let stage: PreviewFailure = 'snapshot';
    try {
      if (!this.current(operation)) return;
      lease = await this.options.acquire(operation.controller.signal);
      if (!lease || !this.current(operation)) return;
      stage = 'invalid-snapshot';
      validatePreviewAudio(lease.audio, this.options.sessionId);
      // Unchanged or older audio is never decoded twice.
      if (lease.audio.endFrame <= this.lastEndFrame) return;
      this.lastEndFrame = lease.audio.endFrame;
      stage = 'decode';
      const text = await this.options.decode(lease.audio, this.options.language, operation.controller.signal);
      if (!this.current(operation)) return;
      stage = 'invalid-text';
      if (typeof text !== 'string' || text.length > 16_384) throw new Error('Invalid preview text.');
      if (!text.trim()) return;
      stage = 'display';
      this.options.onPreview(Object.freeze({ sessionId: this.options.sessionId,
        revision: ++this.revision, startFrame: lease.audio.startFrame,
        endFrame: lease.audio.endFrame, text }));
    } catch {
      if (this.current(operation)) this.fail(stage);
    } finally {
      if (lease) {
        try { await lease.release(); }
        catch { this.fail('cleanup', true); }
      }
      this.clearDeadline(operation);
      if (this.active === operation) this.active = undefined;
      this.schedule();
    }
  }

  private fail(failure: PreviewFailure, reportAfterStop = false): void {
    if ((this.state === 'failed' && failure !== 'cleanup') ||
        (this.state !== 'running' && !reportAfterStop)) return;
    this.state = 'failed';
    this.clearScheduled();
    if (this.active) {
      this.clearDeadline(this.active);
      this.active.controller.abort();
    }
    try { this.options.onFailure(failure); } catch { /* Diagnostics cannot revive preview work. */ }
  }

  private clearScheduled(): void {
    if (this.timer !== undefined) this.clock.clear(this.timer);
    this.timer = undefined;
  }

  private clearDeadline(operation: ActivePreview): void {
    if (operation.deadline !== undefined) this.clock.clear(operation.deadline);
    operation.deadline = undefined;
  }
}
