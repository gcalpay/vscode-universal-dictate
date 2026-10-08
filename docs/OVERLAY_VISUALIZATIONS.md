# Enhanced overlay visualization implementation

Current workflow: [OVERLAY_INTEGRATION.md](OVERLAY_INTEGRATION.md).
Integrated on M1 `d4c52d2`; do not overwrite inference/report fixes with the earlier
1.1.0-based draft. This spec describes implemented behavior, not a release approval.

## Settings contract

New key: `universalDictate.enhancedOverlayVisualization`.

| Stored value | User-facing label |
| --- | --- |
| `waveform` | Waveform / Oscillogram |
| `logFrequencyPowerSpectrogram` | Log-Frequency Power Spectrogram |
| `linearFrequencyPowerSpectrogram` | Linear-Frequency Power Spectrogram |
| `constantQPowerSpectrogram` | Constant-Q Power Spectrogram |
| `circularSpectrum` | Circular Spectrum |

Default and invalid/missing-value fallback: `waveform`. Metadata and Quick Pick use
the same order and labels. The selection is snapshotted before asynchronous session
preparation and applies from the next recording. Saving a style changes only this
key; a workspace override is reported using the effective value.

`universalDictate.visualization` remains unchanged:

- `enhancedOverlay`: selected native renderer; existing static status-bar feedback.
- `both`: selected native renderer plus the existing animated status bar.
- `statusBar` / `off`: no native overlay and no spectral analyzer. The chosen style
  remains saved; choosing it does not enable the overlay.

Size, language, preview, clipboard and all explicit saved choices stay separate.
The gear label **Overlay history** reuses `waveformTimeSpanSeconds` (1/3/5/10/20,
default 10). It controls Waveform and spectrogram history; circular mode uses only
the latest spectrum. No preference migration or deletion is performed.

## Native architecture and invariants

The host forwards a normalized `--overlay-visualization` argument only with an
enhanced overlay. The native parser independently falls back to Waveform. The
accepted PCM-to-bucket mapping, immutable waveform history and
`drawEnhancedWaveform` paint function remain unchanged. Following the first
1.2.0 normal-use review, Medium alone applies a fixed soft-knee visual gain to
the copied display snapshot: quiet voice peaks use more of its existing vertical
space, including the 22-logical-pixel live-preview waveform. Small/Large,
status-bar display and spectral styles are unaffected. No automatic gain control,
history rescaling, microphone filtering or added capture work is introduced.
A dispatch function chooses the same paint function or the spectral renderer
inside the existing waveform viewport.

The existing admitted capture path still writes the original PCM to the WAV,
preview buffer, waveform history and raw peak meter. Only the optional visualizer
receives an additional bounded copy. `PcmQueue` is single-producer/single-consumer,
32768 frames (2.048 s of scheduling headroom), with acquire/release slot ownership. It performs no allocation, wait,
transform or rendering on the capture callback. One consumer batch is copied out
before analysis, releasing queue slots promptly.

The overlay thread processes at most 8192 samples per existing 50 ms update.
Catch-up work is not enlarged with the queue, and Stop does not drain visual-only
work before final transcription. The queue may drop a complete visual-only callback chunk when full; this
cannot remove WAV/preview samples. Sequence positions reveal drops. Filter context
is reset and missing history columns are blank, rather than faking continuity.
Constructor allocation failure falls back to Waveform. Failed overlay creation
turns off spectral acquisition; lifetime extends beyond capture-device shutdown.

Pause uses the existing acknowledged admission gate. Paused samples never enter
the analyzer. The displayed frame freezes; partial analysis state is retained for
resuming the same accepted-audio timeline. No artificial silence is added. Stop,
Discard, preview scheduling, clipboard, insertion and the recorder pipe protocol
are unchanged.

### Transform definitions

All analysis consumes existing mono signed 16-bit PCM at 16 kHz. The visual-only
copy is normalized by 32768 and has its analysis-window DC mean removed; the WAV
is never normalized, filtered or resampled.

**Linear / log spectrograms and circular mode:** periodic Hann window, radix-2
1024-point FFT, 256-frame hop. The fixed window is 64 ms; completed columns occur
every 16 ms, independent of the UI's 50 ms repaint schedule. Linear display has
96 equally spaced bands over 0–8 kHz. Log display has 96 logarithmic bands over
62.5 Hz–8 kHz. Circular display has 48 logarithmic bands in that order clockwise
from the top. Narrow low-frequency display rows share the nearest FFT bin where
necessary; log spacing does not invent additional frequency resolution.

**Constant-Q:** a direct bank of 84 Hann-windowed complex filters, 12 bins/octave,
`f[k] = 62.5 * 2^(k/12)`, `Q = 1/(2^(1/12)-1)`,
`N[k] = ceil(Q * 16000 / f[k])`. The kernels really have different lengths and
share a common frame center to within half a sample. This is not a relabeled log
FFT. The longest window is approximately 269 ms, with approximately 134 ms center
delay plus UI scheduling. It is a causal trailing-window display, not zero-latency
centered analysis. High-frequency filters use shorter analysis windows; all bins
still share the 16 ms output hop.

Power is coherent-window-gain-normalized **squared peak amplitude**, referenced to
full-scale digital input, not a power spectral density, acoustic SPL or calibrated
microphone loudness. A bin-centered sinusoid of peak amplitude A produces A².
Rows pool the maximum bin power where several FFT bins share a display band.
A fixed -80 to 0 dB range maps into 8-bit intensity; there is no automatic gain,
rolling color normalization, neighbor smoothing or old-column recoloring.

Spectrogram storage is bounded at 1250 columns × 96 bands. The selected duration
uses ceil(milliseconds / 16 ms), so 1 second displays 1.008 seconds, for example.
Completed columns are immutable; new active audio appears at the right and lower
frequencies at the bottom. The raster is cached by completed revision and viewport.
When the viewport is smaller than the matrix, disjoint neighboring time/frequency
cells are max-pooled into display pixels so narrow tones/transients are not skipped.
This affects raster resolution only, not stored values or fixed colors. Enlargements
use nearest-neighbor GDI+ scaling and strict clipping preserves viewport bounds.
Circular mode shows the latest frame without simulated decay. Its radial groups
reduce to 12–48 according to available height; it stays inside existing Small,
Medium, Large and preview geometries rather than resizing the overlay.

## Validation boundaries

Portable numerical tests compare FFT output with an independent DFT, CQT windows
and tone responses, power scaling, chunking, silence, pause, queue overflow and
concurrency. Production Windows tests include the actual recorder callback and
renderer for all five styles, three sizes, four DPIs and both preview states.
Synthetic images are test evidence, not approved user screenshots.

CI retains M1 worker/cancellation/preview/clipboard regressions and the source/
package audit. Original M5 `37765259320` and post-review M5 `37778677667` each
completed 224 observations and passed all 88 revision-2 aggregate gates, with
exact admitted PCM and no visual drops. Their source identities remain distinct.
The English synthetic replay uses real recorder/render/Whisper components but
stub insertion; it is not a physical microphone or target-app latency test.

Windows renderer run `37765265222` produced 240 active/paused BMPs for 120 layout
configurations: five styles × three sizes × four DPIs × preview Off/On. These are
production-renderer outputs driven by synthetic fixtures, not user screenshots or
accepted aesthetics. The small circular view in compact preview layouts remains
visible in review evidence and is subject to normal-use acceptance.

All eight original Codacy additions have individual dispositions in the
[review record](M5_REVIEW_CLOSEOUT.md). Three maintainability additions are absent
from the new report; four regression assertions and the approved settings invariant
remain, with actual status `action_required`. The earlier preview-cache RGB cause
is unknown after source review and 36,660 passing exact pixel comparisons on a
fixed six-runner schedule. This is a disclosed residual risk for integrated review,
not a production fix. [M6](M6_INTEGRATED_CANDIDATE.md) requires final consolidated
Windows renderer/package validation and audit before delivery; the exact final
source/artifact record is maintained with PR #56 and the delivered audit. No
micro-step VSIX or repeated user benchmark/screenshot exercise is required.
