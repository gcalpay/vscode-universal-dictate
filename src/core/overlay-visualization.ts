/** Enhanced-overlay style is independent of the visualization display location. */
export const OVERLAY_VISUALIZATIONS = [
  'waveform', 'logFrequencyPowerSpectrogram', 'circularSpectrum'
] as const;
export type OverlayVisualization = (typeof OVERLAY_VISUALIZATIONS)[number];
export const DEFAULT_OVERLAY_VISUALIZATION: OverlayVisualization = 'waveform';
export const OVERLAY_VISUALIZATION_LABELS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'Waveform / Oscillogram',
  logFrequencyPowerSpectrogram: 'Log-Frequency Power Spectrogram',
  circularSpectrum: 'Circular Spectrum'
};
export const OVERLAY_VISUALIZATION_DETAILS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'The original fixed-gain scrolling waveform. No spectral analysis.',
  logFrequencyPowerSpectrogram: 'Scrolling FFT power with logarithmic frequency spacing, emphasizing speech detail.',
  circularSpectrum: 'The latest FFT spectrum in a dedicated rounded-square overlay. Not a scrolling spectrogram; Overlay history does not apply.'
};
export function normalizeOverlayVisualization(value: unknown): OverlayVisualization {
  // Retired unpublished RC selections resolve to the remaining spectrogram.
  // Do not rewrite the saved setting or enable an otherwise disabled overlay.
  if (value === 'linearFrequencyPowerSpectrogram' || value === 'constantQPowerSpectrogram')
    return 'logFrequencyPowerSpectrogram';
  return typeof value === 'string' && OVERLAY_VISUALIZATIONS.includes(value as OverlayVisualization)
    ? value as OverlayVisualization : DEFAULT_OVERLAY_VISUALIZATION;
}
