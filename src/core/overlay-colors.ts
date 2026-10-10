/** Fixed visualization palettes; display location and audio gain are independent. */
export const OVERLAY_COLORS = ['blue', 'green', 'amber', 'violet'] as const;
export type OverlayColor = (typeof OVERLAY_COLORS)[number];
export const DEFAULT_OVERLAY_COLOR: OverlayColor = 'blue';
export const OVERLAY_COLOR_LABELS: Readonly<Record<OverlayColor, string>> = {
  blue: 'Blue', green: 'Green', amber: 'Amber', violet: 'Violet'
};
export const OVERLAY_COLOR_DETAILS: Readonly<Record<OverlayColor, string>> = {
  blue: 'Cool blue waveform and the original blue/teal spectrogram palette. Default.',
  green: 'Dark forest-green shadows with fresh green highlights.',
  amber: 'Warm copper shadows and soft golden highlights.',
  violet: 'Deep violet shadows and light lavender highlights.'
};
export function normalizeOverlayColor(value: unknown): OverlayColor {
  return typeof value === 'string' && OVERLAY_COLORS.includes(value as OverlayColor)
    ? value as OverlayColor : DEFAULT_OVERLAY_COLOR;
}
