/** Enhanced-overlay style is independent of the visualization display location. */
export const OVERLAY_VISUALIZATIONS = [
  'waveform',
  'logFrequencyPowerSpectrogram',
  'circularSpectrum'
] as const;

export type OverlayVisualization = (typeof OVERLAY_VISUALIZATIONS)[number];
export const DEFAULT_OVERLAY_VISUALIZATION: OverlayVisualization = 'waveform';

export const OVERLAY_VISUALIZATION_LABELS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'Waveform / Oscillogram',
  logFrequencyPowerSpectrogram: 'Log-Frequency Power Spectrogram',
  circularSpectrum: 'Circular Spectrum'
};

export const OVERLAY_VISUALIZATION_DETAILS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'The existing fixed-gain, scrolling speech waveform. Default; no spectral analysis.',
  logFrequencyPowerSpectrogram: 'Scrolling FFT power with logarithmic frequency spacing, emphasizing lower-frequency speech detail.',
  circularSpectrum: 'The latest FFT spectrum arranged around a circle. This is a live spectrum, not a pitch-class chromagram; the history duration does not apply.'
};

export function normalizeOverlayVisualization(value: unknown): OverlayVisualization {
  // Preserve an old spectrogram preference without rewriting user/workspace settings.
  if (value === 'linearFrequencyPowerSpectrogram' || value === 'constantQPowerSpectrogram')
    return 'logFrequencyPowerSpectrogram';
  return typeof value === 'string' && OVERLAY_VISUALIZATIONS.includes(value as OverlayVisualization)
    ? (value as OverlayVisualization)
    : DEFAULT_OVERLAY_VISUALIZATION;
}
