import { Buffer } from 'node:buffer';

/** Independent preview copies; the authoritative recording is owned elsewhere. */
export const PREVIEW_SAMPLE_RATE = 16_000;
export const PREVIEW_WINDOW_FRAMES = 8 * PREVIEW_SAMPLE_RATE;
const BYTES_PER_FRAME = 2;
const HEADER_BYTES = 44;

export interface PreviewAudio {
  readonly sessionId: string;
  readonly startFrame: number;
  readonly endFrame: number;
  /** A private, finalized PCM16 mono/16 kHz RIFF/WAV copy, never a live WAV file. */
  readonly wav: Buffer;
}

/** The provider releases temporary resources after decode, including on cancellation. */
export interface PreviewLease {
  readonly audio: PreviewAudio;
  readonly release: () => Promise<void>;
}

function checkIdentity(sessionId: string, endFrame: number): void {
  if (!sessionId || sessionId.length > 128 || !Number.isSafeInteger(endFrame) || endFrame < 0) {
    throw new Error('Invalid preview identity or frame range.');
  }
}

/**
 * Build an independently owned copy from a bounded, already-consistent PCM handoff.
 * This does NOT synchronize concurrent access to a native ring; that is the
 * recorder adapter's responsibility. It introduces no file or clipboard access.
 */
export function createPreviewAudio(
  sessionId: string, endFrame: number, pcm: Uint8Array
): PreviewAudio {
  checkIdentity(sessionId, endFrame);
  const frames = pcm.byteLength / BYTES_PER_FRAME;
  if (!Number.isInteger(frames) || frames < 1 || frames > PREVIEW_WINDOW_FRAMES || frames > endFrame) {
    throw new Error('Preview PCM must be frame-aligned and bounded to eight seconds.');
  }
  const wav = Buffer.alloc(HEADER_BYTES + pcm.byteLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // Linear PCM.
  wav.writeUInt16LE(1, 22); // Mono.
  wav.writeUInt32LE(PREVIEW_SAMPLE_RATE, 24);
  wav.writeUInt32LE(PREVIEW_SAMPLE_RATE * BYTES_PER_FRAME, 28);
  wav.writeUInt16LE(BYTES_PER_FRAME, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(pcm.byteLength, 40);
  wav.set(pcm, HEADER_BYTES);
  return Object.freeze({ sessionId, startFrame: endFrame - frames, endFrame, wav });
}

/** Validate the narrow canonical format at the future native adapter boundary. */
export function validatePreviewAudio(audio: PreviewAudio, sessionId: string): void {
  checkIdentity(audio.sessionId, audio.endFrame);
  const frames = audio.endFrame - audio.startFrame;
  const wav = audio.wav;
  if (audio.sessionId !== sessionId || !Number.isSafeInteger(audio.startFrame) ||
      audio.startFrame < 0 || frames < 1 || frames > PREVIEW_WINDOW_FRAMES ||
      !Buffer.isBuffer(wav) || wav.length !== HEADER_BYTES + frames * BYTES_PER_FRAME) {
    throw new Error('Invalid preview ownership, bounds or payload size.');
  }
  if (wav.readUInt32LE(0) !== 0x46464952 || wav.readUInt32LE(4) !== wav.length - 8 ||
      wav.readUInt32LE(8) !== 0x45564157 || wav.readUInt32LE(12) !== 0x20746d66 || wav.readUInt32LE(16) !== 16 ||
      wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 ||
      wav.readUInt32LE(24) !== PREVIEW_SAMPLE_RATE ||
      wav.readUInt32LE(28) !== PREVIEW_SAMPLE_RATE * BYTES_PER_FRAME ||
      wav.readUInt16LE(32) !== BYTES_PER_FRAME || wav.readUInt16LE(34) !== 16 ||
      wav.readUInt32LE(36) !== 0x61746164 || wav.readUInt32LE(40) !== frames * BYTES_PER_FRAME) {
    throw new Error('Invalid preview WAV header.');
  }
}
