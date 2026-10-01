# M7 - Pause/Resume and overlay controls

Updated: 2026-10-01. Branch: `feat/pause-resume-controls`. Draft PR: #54.
Base: accepted 1.0.0 merge `eda02a512d3feb70989b89a3efc6714d12b833e7`.
Target test package: 1.1.0. Implementation/builds are authorized; merge and publication
require the user's finished-candidate review. Run IDs and exact delivered VSIX hashes
belong in PR #54 so recording evidence does not require rebuilding that artifact.

## Contract

The overlay order is Insert / Pause / Discard; Pause becomes Resume when paused.
Text is the default style. Symbols use a check, pause bars/play triangle and cross,
with descriptive hover help in both styles. Green/amber/red supplement those labels.
Small/Medium/Large window dimensions stay unchanged; the waveform/preview area yields
horizontal room for the extra control. No fonts or new model files are bundled.

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

`universalDictate.overlayButtonStyle`: `text` (default) or `symbols`, also in the gear
menu. `universalDictate.waveformTimeSpanSeconds`: default 10; explicitly saved values
remain unchanged. Style, size, waveform history, language, clipboard and effective
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
4. Windows production renderer: all presets at 100/125/150/200% DPI, both styles and
   recording/paused states; label bounds, tooltips, hit tests and own-window focus.
   Existing multilingual preview shaping/clipping regressions remain.
5. Pinned Whisper/Node synthetic replay: suspend/resume preview, no paused acquisition
   or display, resumed updates and one complete final transcription. No new model.
6. Actual VSIX audit: 1.1.0, win32-x64/UI host, seven settings, four executables only,
   exact compiled/native/media identities; no source/tests/fonts/models/audio shipped.
7. User acceptance: microphone dictation with Pause/Resume, deliberate speech during
   Pause omitted, Stop and Discard while paused, preview Off/On, Text/Symbols and all
   sizes, normal Windows and Remote-WSL, compatible external input and no submission.

Automated results and user acceptance must be recorded separately. No merge or
Marketplace publication is implied by compilation or by a scripted renderer test.

## Waveform correction after the first user review

The user tested the `8778fcd` 1.1.0 VSIX and accepted Pause/Resume and its controls.
The remaining correction is visual: live-preview layout gives the waveform too little
height, a short hypothesis is vertically centered in unused preview space, and the
old signed-peak mapping saturates at just 0.045 full scale. Keep the accepted pause,
clipboard, model and insertion behavior unchanged; no release approval is implied.

Preview-on waveform heights are now 13 / 19 / 36 logical pixels for Small / Medium /
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
