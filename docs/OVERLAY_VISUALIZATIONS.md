# Enhanced overlay visualizations — three-mode RC4

Current workflow: [OVERLAY_INTEGRATION.md](OVERLAY_INTEGRATION.md).
Built on RC3 `953a8e7` / M1 `d4c52d2`. User-approved design refinement;
not release approval or an accepted-source freeze.

## Settings and compatibility

`universalDictate.enhancedOverlayVisualization` has exactly three visible values:
`waveform` (Waveform / Oscillogram; default), `logFrequencyPowerSpectrogram`
(Log-Frequency Power Spectrogram) and `circularSpectrum` (Circular Spectrum).
Missing/unknown values use Waveform. Retired `linearFrequencyPowerSpectrogram`
and `constantQPowerSpectrogram` values resolve to Log in both host and native
parsers, without rewriting saved settings. Their implementations are removed.

`universalDictate.colors` adds Blue (default), Green, Amber and Violet. These are
fixed palettes, not automatic gain or a free color picker. Blue preserves every
one of the original 256 spectrogram ARGB entries. The waveform defaults to cool
blue; Green reproduces its original colors. Alpha, line widths, amplitude,
bucket/history data and completed-sample stability remain unchanged. Palette is
snapshotted before model preparation and is immutable for each native session /
spectral analyzer, so no previous session's cached palette can leak into a new one.

Eight independent settings: language, visualization location, enhanced style,
colors, size, history, overwrite clipboard and live preview. Style/colors do not
enable the overlay, alter the status bar, change audio, or erase other preferences.
All changes apply from the next recording; workspace overrides are reported.
Status bar only / Off allocate no native overlay or analyzer. Waveform performs
no FFT. `waveformTimeSpanSeconds` retains its key/default (10 seconds) and choices
1/3/5/10/20; it applies to Waveform/Log, not latest-frame Circular Spectrum.

## Layout and controls

Waveform and Log retain the original 1.1.2 Small/Medium/Large rectangles and preview
regions, including the original waveform amplitude response. Only waveform colors
change. Circular uses `native/circular-layout.h`: a rounded-square card, small
recording indicator/header, large centered square spectrum viewport, then optional
one/two/two complete preview lines and a separate row of Insert / Pause / Discard.
Sizes are 192/240/296 logical pixels per side without preview; 226/288/350 with
preview. The outer width always equals height. Geometry scales once for DPI.
A preview recording chooses its larger card at startup; changing/pause text does
not resize it. Non-activating window, hit-testing, acknowledgements, tooltips,
Pause/Resume and single-insertion behavior are reused, not replaced.

## Signal path and rendering

The recorded mono PCM16 at 16 kHz, waveform buckets/history and raw peak meter
are unchanged. Spectral modes copy admitted samples into the existing bounded
32768-frame SPSC visual queue. No FFT, allocation, new disk I/O or waits occur on
the capture callback. One overlay tick processes at most 8192 samples at the
existing 50 ms cadence. Stop does not drain visual analysis. Overflow drops only
visual copies, resets transform context and blanks missing history; it never
drops accepted WAV or preview samples. Pause excludes audio and freezes visuals.

Both spectral modes use the original 1024-point periodic-Hann FFT / 256-frame hop,
window DC removal, coherent-gain-normalized squared peak amplitude, and fixed
-80 to 0 dB intensity. Log retains 96 logarithmic bands from 62.5 Hz to 8 kHz.
Circular retains 48 logarithmic bands, clockwise from the top; its larger viewport
uses readable rounded radial strokes. It is an instantaneous spectrum, not a
chromagram or scrolling spectrogram. There is no fake decay or idle movement.

Log history is bounded at 1250 columns x 96 bands. Max pooling preserves narrow
features when reducing the image; nearest-neighbor enlargement invents no new
frequency resolution. Completed levels remain immutable. Color cache belongs to
one immutable theme/analyzer and is keyed by completed revision and viewport.
The preview-text cache and its independent frozen oracle are unchanged.

## Verification and remaining gates

Source guards pin all four 1.1.2 waveform/layout header blobs and verify that the
paint function differs only by palette declarations. Portable tests retain FFT
versus independent DFT, scaling, chunking, silence, history, queue, pause, overflow
and concurrency checks; retired DSP tests are replaced by compatibility checks.
The added design tests cover the original Blue palette fingerprint, all palette
luminance/alpha bounds, theme-independent spectral data and square/text/button
geometry at 100/125/150/200% DPI.

Production renderer matrix: three modes x four themes x three sizes x four DPIs
x preview Off/On = 288 cases, each active/paused = 576 BMPs. Existing presentation
checks remain; square-card real own-window clicks, non-activation, tooltip and
multilingual text-clipping checks are added. These are synthetic test images,
not user-PC acceptance.

M5 covers the remaining three modes plus Off: ten AB/BA pairs per preview
condition, one additional 48-second Log pair for history wrap: 142 observations,
56 aggregate gates. Revision-2 per-condition pair counts, budgets, fixture/model
pins and no-filter/no-retry policy are unchanged. The old 224/88 datasets describe
five-mode candidates only and remain separately retained.

Six previously reviewed analyzer additions and the unknown original preview-cache
RGB mismatch are not declared fixed. Current-head analyzer results and successful
native/package/performance identities belong in PR #56 and the delivered evidence.
No merge, tag, history rewrite or publication before explicit acceptance and the
separate M7/M8 safeguards.
