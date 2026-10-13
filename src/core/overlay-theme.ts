/** Fixed visualization palettes, independent of location, style and microphone gain. */
export const OVERLAY_THEMES = ['blue', 'green', 'dark', 'amber', 'slate'] as const;
export type OverlayTheme = (typeof OVERLAY_THEMES)[number];
export const OVERLAY_THEME_LABELS: Readonly<Record<OverlayTheme, string>> = {
  blue: 'Blue', green: 'Green', dark: 'Dark', amber: 'Amber', slate: 'Slate'
};
export const OVERLAY_THEME_DETAILS: Readonly<Record<OverlayTheme, string>> = {
  blue: 'Blue and cyan. Default; preserves the original log-spectrogram palette.',
  green: 'Restrained emerald green, darker than the former bright-green waveform.',
  dark: 'Neutral graphite and silver, with visible highlights on the dark panel.',
  amber: 'Warm amber and gold.',
  slate: 'Muted steel-blue and cool grey.'
};
export function normalizeOverlayTheme(value: unknown): OverlayTheme {
  return typeof value === 'string' && OVERLAY_THEMES.includes(value as OverlayTheme)
    ? value as OverlayTheme : 'blue';
}
