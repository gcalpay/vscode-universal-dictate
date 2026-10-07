# Overlay integration — M2 through M5

Base: M1 `d4c52d2d153545a7a8bef6ed1680261e199ef22b`; branch
`feat/overlay-visualizations`. Published main and draft PR #55 stay unchanged.

## Approved workflow

The user explicitly removed individual M1/M2/M3/M4 manual VSIX gates. Continue
internal implementation and automated validation; deliver one integrated candidate
only after M5, with a possible final release build later. Do not ask for additional
micro-diagnostic installs or prescribed repeated screenshot/reading exercises.

## Scope

Add **Enhanced Overlay Visualization**, independent of existing visualization
location: Waveform / Oscillogram (default), Log-Frequency Power Spectrogram,
Linear-Frequency Power Spectrogram, Constant-Q Power Spectrogram, Circular Spectrum.
Settings are snapshotted before recording; disabled overlays perform no invisible
spectral work. Status-bar rendering and the accepted append-only waveform remain.
A previous unpushed source bundle exists against 1.1.0; integrate it selectively,
not by overwriting M1 inference, accumulated reports or current lifecycle tests.

## Internal checkpoints

- M2: settings, native argument routing and renderer/analysis boundaries on M1.
- M3: linear/log FFT spectrogram numerical and production-renderer validation.
- M4: genuine variable-window Constant-Q and circular-spectrum validation.
- M5: compare all styles against waveform with the retained synthetic fixture;
  inspect CPU/memory/capture/Stop latency and sizes/DPI/preview/Pause behavior.
- Integrated review candidate: M1 plus all five modes after automated gates.
- Only after user acceptance: release freeze, separately controlled history cleanup,
  final build/audit and release authorization.

Do not claim all milestones complete from source inspection. Preserve source/run/
artifact identities and record open gates. Initial state: M2 integration in progress.
