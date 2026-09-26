export const OVERLAY_SIZES = ['small', 'medium', 'large'] as const;

export type OverlaySize = (typeof OVERLAY_SIZES)[number];

export const DEFAULT_OVERLAY_SIZE: OverlaySize = 'large';

export function normalizeOverlaySize(value: unknown): OverlaySize {
  return typeof value === 'string' && OVERLAY_SIZES.includes(value as OverlaySize)
    ? (value as OverlaySize)
    : DEFAULT_OVERLAY_SIZE;
}
