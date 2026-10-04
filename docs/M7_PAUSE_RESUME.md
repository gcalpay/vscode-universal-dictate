# M7 - Pause/Resume and overlay controls

Updated: 2026-10-03. Branch: `feat/pause-resume-controls`. Draft PR: #54.
Base: accepted 1.0.0 merge `eda02a512d3feb70989b89a3efc6714d12b833e7`.
Target test package: 1.1.0. Implementation/builds are authorized; merge and publication
require the user's finished-candidate review. Run IDs and exact delivered VSIX hashes
belong in PR #54 so recording evidence does not require rebuilding that artifact.

## Contract

The overlay order is Insert / Pause / Discard; Pause becomes Resume when paused.
Controls are symbols only: a check, pause bars/play triangle and cross, with
descriptive hover help. Green/amber/red supplement those symbols. Preset widths
stay unchanged; narrower buttons return horizontal room to the waveform. Window
height is selected once at recording startup according to the effective preview flag. No fonts or new model files are bundled.

Pause keeps the capture device open to avoid driver reinitialization. The capture
callback uses a nonblocking atomic admission gate. Once Pause closes that gate, the
UI waits for an already admitted callback to leave before emitting a matching PAUSED
acknowledgement. Subsequent samples are neither encoded nor retained for preview or
waveform. The OS microphone-use indicator may therefore remain visible while paused.
Resume reopens that same gate and appends active PCM to the same WAV without inserting
a silence gap. This is a recording pause, not a device-level privacy mute.

The host sends `PAUSE <id>` / `RESUME <id>` on the existing live stdin pipe and accepts
only the matching `PAUSED <id>` / `RESUMED <id>` acknowledgement. One request is active;
duplicates are joined or ignored, not queued. A five-second acknowledgement failure
cancels uncertain capture instead of claiming Pause succeeded. Stop/Discard/disposal
supersede pending controls and never imply Resume. Old acknowledgements cannot revive
ended sessions. Ctrl+Alt+P and the Pause/Resume command work within VS Code; this is
not a global Windows hotkey. Ctrl+Alt+D still finalizes while paused and Esc discards.

Preview stops scheduling as soon as Pause is requested. Active preview work is
aborted and its results cannot be displayed after Resume. The one active adapter
slot must settle before reuse. Resume preserves session IDs, revision numbers and
accepted-frame positions, with no catch-up queue for missed ticks. The overlay keeps
the last displayed provisional text while paused. Final recognition uses all and only
the accepted recording audio, then retains/inserts one final transcript under M2 rules.

## Settings and public documentation

`universalDictate.waveformTimeSpanSeconds`: default 10; explicitly saved values
remain unchanged. The unreleased `overlayButtonStyle` setting and gear entry are
removed; old test-candidate values are ignored, not deleted or rewritten. Six gear
entries remain, including Live preview; the existing menu screenshot has six entries
and is retained. Size, waveform history, language, clipboard and effective
preview configuration are snapshotted before recorder preparation.
English, Medium, Enhanced overlay, preview Off and automatic clipboard Off remain.
README clarifies insertion into compatible focused external Windows applications,
Pause/Resume and the device-open semantics. Existing accepted media remains unchanged
and is labelled as the 1.0 interface until updated user screenshots are accepted.
No cross-platform work, model selection, global hotkey or Issue #38 fix is included.

## Validation checkpoints

1. Full TypeScript checks and all M1/M2/M3/M7 Node tests: argument propagation,
   settings preservation, pause acknowledgement errors/timeouts, duplicate actions,
   Stop/Cancel/disposal while paused or transitioning and stale-session rejection.
2. Portable native gate tests: block new callbacks, drain an admitted callback before
   acknowledgement, reject malformed/stale requests and concurrent repeated toggles.
3. Windows production callback with synthetic PCM: WAV, preview and waveform exclude
   paused sentinel samples. Actual Node-to-native pipe tests cover Resume, paused Stop,
   cancellation and abort. These do not open a microphone.
4. Windows production renderer: all presets at 100/125/150/200% DPI, preview Off/On and
   recording/paused states; symbol bounds, tooltip labels/rectangles, hit tests and
   own-window focus, plus startup dimensions for both preview configurations.
   Existing multilingual preview shaping/clipping regressions remain.
5. Pinned Whisper/Node synthetic replay: suspend/resume preview, no paused acquisition
   or display, resumed updates and one complete final transcription. No new model.
6. Actual VSIX audit: 1.1.0, win32-x64/UI host, six settings, four executables only,
   exact compiled/native/media identities; no source/tests/fonts/models/audio shipped.
7. User acceptance: microphone dictation with Pause/Resume, deliberate speech during
   Pause omitted, Stop and Discard while paused, preview Off/On, symbol controls and all
   sizes, normal Windows and Remote-WSL, compatible external input and no submission.

Automated results and user acceptance must be recorded separately. No merge or
Marketplace publication is implied by compilation or by a scripted renderer test.

## Current waveform contract: immutable legacy-style display

The later `43a4ef0` range-column view looked filled, and `d955795` morphed as new
audio arrived: its repaint-time reduction moved the grouping boundaries across
previously captured data. Both were rejected. Static screenshot checks alone missed
this temporal regression. Do not attribute the reference screenshot to a one-second
setting; the user explicitly corrected that assumption.

Current capture restores the original architecture: 256 fixed-duration signed-peak
buckets, one completed visual value published once, copied verbatim in chronological
order. The selected duration is snapshotted before the microphone starts. At ten
seconds each bucket contains 625 PCM frames (39.0625 ms); other spans retain the
original nearest-integer sizing of 63/188/313/1250 frames. This restores the original
display density, not a claim of 4 ms visible resolution for a ten-second window.
Every short peak is considered inside its capture bucket; there is no moving-window
reduction and no publication of unfinished buckets. Pause leaves a partial bucket
intact. A 256-slot sequence-tagged ring detects overwritten reads without locks.

The renderer uses the original thin signed trace, subtle inner/outer envelopes,
colors, opacity, widths and anti-aliasing. Round joins and viewport clipping prevent
stroke spikes from exceeding the measured display area. The original fixed peak
mapping is retained with exponent 0.62, reference 0.09 and a visual-only noise
floor of 0.0015. The moderate reference keeps normal speech away from full visual
height while retaining fine structure. Mirrored lower envelope strokes are omitted;
the signed primary trace remains. This is a visual-only fixed gain/paint change,
not RMS normalization, microphone gain adjustment or audio processing. It preserves
quiet/normal/loud separation without reusing the rejected signed-RMS/decimation path.

Regression coverage includes 3,840 append/scroll comparisons across five spans,
startup and multiple wraps, partial buckets, short transients, fixed-scale polarity,
concurrent snapshots and actual callback PCM identity. Windows additionally compares
production-rendered frames before partial audio and after a completed bucket: old
strokes must match after accounting for their horizontal translation. An integer
pixel fixture separates shape changes from ordinary subpixel rasterization during
scrolling; the normal layouts/DPI still receive their existing presentation checks.

The accepted controls/layout and all six defaults stay unchanged. Historical tests
specific to the removed range/RMS renderer are replaced by these contract tests;
recording, input, clipboard, preview, multilingual and non-activation checks remain.
The final waveform still requires microphone/visual user review before screenshots,
merge or publication. Record artifact/run identities in PR #54.

## Waveform correction after the first user review (historical `1dfaf3c` checkpoint)

The user tested the `8778fcd` 1.1.0 VSIX and accepted Pause/Resume and its controls.
The remaining correction is visual: live-preview layout gives the waveform too little
height, a short hypothesis is vertically centered in unused preview space, and the
old signed-peak mapping saturates at just 0.045 full scale. Keep the accepted pause,
clipboard, model and insertion behavior unchanged; no release approval is implied.

At that checkpoint, preview-on waveform heights were 13 / 19 / 36 logical pixels for Small / Medium /
Large (previously 6 / 10 / 12). Text follows after a 2 / 2 / 3 pixel gap, is top-aligned
and shows at most one / two / two complete naturally shaped lines. The windows,
control geometry, font sizes and preview-off layout stay unchanged.

Visualization uses per-bucket PCM RMS on a fixed -60 to -6 dBFS display range. Peak
polarity only supplies the center-trace direction. There is no adaptive gain,
normalization, time-dependent reshaping or change to recorded/transcribed samples.
This measures relative digital input level, not calibrated acoustic loudness; OS or
microphone gain processing remains outside the extension's control. Ten-second
history and all saved settings are unchanged.

Additional regressions cover monotonic level mapping, silence, equal peaks with
different energy, signed extrema, five history spans, quiet-after-loud stability,
production-callback WAV identity/pause exclusion, visible level separation in the
production renderer, compact preview spacing and one-line top alignment at all four
DPI scales. Scripted images are evidence, not replacement public screenshots.

## Compact controls after the second user review

The user requested slimmer symbol buttons, less unused top/bottom space and no text
mode. Recording, pause acknowledgement, PCM/RMS, preview inference and insertion
semantics are unchanged. Preview allocation changes only presentation dimensions.

| Size | Width | Height, preview Off / On | Button width / height | Preview waveform height |
| --- | --- | --- | --- | --- |
| Small | 380 | 48 / 64 | 28 / 24 | 16 |
| Medium (default) | 520 | 72 / 88 | 32 / 28 | 22 |
| Large | 740 | 112 / 120 | 36 / 30 | 42 |

All dimensions are logical pixels at 96 DPI. With preview Off, outer height is 16 px
less than `1dfaf3c`; waveform insets are 3 px and the full-scale half-amplitude is
still 20 / 32 / 52 px. Button heights and six-pixel gaps remain. Medium's waveform
width increases from 204 to 280 px (preview Off) and 280 to 356 px (preview On).
Preview text has one/two/two complete lines and a two-pixel waveform gap. No fonts,
new models, gain control, global hotkeys or platform support are introduced.

Both startup paths and DPI changes must agree with drawing, hit testing and tooltip
rectangles. Tests explicitly cover the retired setting without mutating saved values.
Keep the actual six-entry menu image. Do not delete Live preview to match an older
five-entry screenshot or present scripted overlay renders as user captures.

## Fine temporal detail after compact-layout acceptance (historical, rejected)

The user accepted the compact controls/layout at `1eab79d`, but rejected the coarse
polygonal waveform in subsequent captures. Capture previously summarized ten seconds
into 256 signed RMS buckets (~39 ms each). The default remains ten seconds; detail
acquisition is now fixed at 64 PCM frames / 4 ms, independent of history span. The
1 / 3 / 5 / 10 / 20-second choices use 250 / 750 / 1,250 / 2,500 / 5,000 ranges.

Each visual range uses the same fixed -60 to -6 dBFS RMS height and both measured
positive/negative peak proportions. A strongest sample no longer assigns its sign
to a whole energy bucket. A sequence-tagged lock-free ring retains at most twenty
seconds (5,000 atomic slots; 40 kB slot storage) without storing additional audio.
Pause admits no frames and leaves a partial range/history intact.

The renderer preserves extrema when several 4 ms ranges occupy one physical pixel,
and paints independent thin filaments plus an anti-aliased outline instead of
connecting arbitrary signs. It does not interpolate invented detail, normalize to
recent loudness or filter the recorded PCM. Ten seconds cannot have the same visible
horizontal resolution as one second in the same number of pixels; the improvement
preserves brief events and removes coarse signed-energy zigzags within that limit.

Additional tests cover exact temporal counts at all spans, isolated 4 ms events,
positive/negative ranges, pixel aggregation without skipped transients, ring wrap,
concurrent snapshots, partial Pause/Resume, unchanged production-callback audio,
all compact/preview layouts and measured synthetic-PCM renderer/clipping fixtures.
All prior lifecycle, clipboard, input and preview tests remain applicable. New user
waveform review and public replacement screenshots remain pending; run and artifact
identities belong in PR #54 rather than a post-build source change.
