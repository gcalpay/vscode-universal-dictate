/** Enhanced-overlay style is independent of the visualization display location. */
export const OVERLAY_VISUALIZATIONS = [
  'waveform',
  'logFrequencyPowerSpectrogram',
  'linearFrequencyPowerSpectrogram',
  'constantQPowerSpectrogram',
  'circularSpectrum'
] as const;

export type OverlayVisualization = (typeof OVERLAY_VISUALIZATIONS)[number];
export const DEFAULT_OVERLAY_VISUALIZATION: OverlayVisualization = 'waveform';

export const OVERLAY_VISUALIZATION_LABELS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'Waveform / Oscillogram',
  logFrequencyPowerSpectrogram: 'Log-Frequency Power Spectrogram',
  linearFrequencyPowerSpectrogram: 'Linear-Frequency Power Spectrogram',
  constantQPowerSpectrogram: 'Constant-Q Power Spectrogram',
  circularSpectrum: 'Circular Spectrum'
};

export const OVERLAY_VISUALIZATION_DETAILS: Readonly<Record<OverlayVisualization, string>> = {
  waveform: 'The existing fixed-gain, scrolling speech waveform. Default; no spectral analysis.',
  logFrequencyPowerSpectrogram: 'Scrolling FFT power with logarithmic frequency spacing, emphasizing lower-frequency speech detail.',
  linearFrequencyPowerSpectrogram: 'Scrolling FFT power with equally spaced frequencies from 0 to 8 kHz.',
  constantQPowerSpectrogram: 'Scrolling power from variable-length, logarithmically spaced constant-Q filters. Greater low-frequency resolution, with a longer startup window.',
  circularSpectrum: 'The latest FFT spectrum arranged around a circle. This is a live spectrum, not a pitch-class chromagram; the history duration does not apply.'
};

export function normalizeOverlayVisualization(value: unknown): OverlayVisualization {
  return typeof value === 'string' && OVERLAY_VISUALIZATIONS.includes(value as OverlayVisualization)
    ? (value as OverlayVisualization)
    : DEFAULT_OVERLAY_VISUALIZATION;
}
