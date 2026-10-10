# Enhanced overlay visualizations — RC4

Current contract and acceptance: [RC4_SCOPE.md](RC4_SCOPE.md). Historical five-mode validation remains in the M5 review records; it does not describe the RC4 UI.

## Three modes

`waveform` (default), `logFrequencyPowerSpectrogram`, `circularSpectrum`. Removed Linear/Constant-Q values resolve to Log without a settings write. Invalid unrelated values resolve to Waveform. This does not enable an overlay or affect the current recording.

Waveform uses unchanged 1.1.2 signed-peak mapping and immutable buckets; only its colors change. Log and Circular use mono PCM16 at 16 kHz, a 1024-point periodic Hann FFT, 256-sample hop and fixed -80..0 dB power. Log has 96 bands across 62.5 Hz..8 kHz; Circular shows 48 latest-frame logarithmic bands. No CQT bank remains. Original queue/headroom/work limits, pixel max pooling and admitted WAV/preview audio are retained.

## Colors and layouts

`universalDictate.overlayColorTheme`: Blue, Green, Dark, Amber, Slate; default Blue. Blue log colors match the original palette exactly. Colors only affect visualization ink, not microphone gain, panel/text backgrounds or semantic control colors. Raster caches include theme identity. Settings apply from the next recording.

Waveform/Log retain the rectangular visual viewport, with one obsolete button column removed. Circular uses a dedicated square panel with readable preview below the circle and two non-activating controls beneath it. Small/Medium/Large and preview geometry are documented and tested in RC4_SCOPE. History duration applies to Waveform/Log, not the latest-frame Circular display.

Pause button, command and shortcut are removed. Insert completes/transcribes/inserts once; Discard cancels. Clipboard, worker/model parameters and attribution are unchanged.
