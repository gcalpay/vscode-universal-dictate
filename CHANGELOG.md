# Changelog

## 1.2.0

### Integrated review candidate — not published

### Added

- Enhanced Overlay Visualization: Waveform / Oscillogram (default), Log-Frequency
  Power Spectrogram and Circular Spectrum. Selection is independent of display location.
- Bounded visual-only FFT analysis, outside capture.
- Colors: Blue (default), Green, Amber and Violet. The Blue log-spectrogram palette is unchanged.
- Dedicated rounded-square Circular Spectrum overlay, with separate preview and control regions.
- Session visualization metadata in the accumulated latency report.
- **Universal Dictate: Show Latency Report** retains up to 100 completed timing
  records in one in-memory document, with no audio or transcript diagnostics.

### Changed

- Overlay history reuses the existing saved waveform time-span preference for
  waveform and spectrograms; Circular Spectrum shows the latest spectrum instead.
- Final transcription keeps its dedicated warm Whisper worker. Preview uses a
  separate lazy worker with at most two inference threads and bounded, confirmed
  shutdown before final dispatch. Preview Off avoids the second model instance.
- Preserve the 1.1.2 waveform mapping, immutable history, rectangular overlay/preview layout
  and paint geometry; only its colors are themed; retain status bar, Pause/Resume, clipboard Off
  as no automatic access, and one final insertion of the full recording.
- Do not include the experimental RC2 Medium-only gain change. The cause of the
  earlier intermittent nearly flat waveform is unknown; gain was not a verified fix.
- Cache unchanged preview text and increase bounded visual-queue scheduling
  headroom, while retaining existing capture audio and per-update analysis limits.

- Retire Linear and Constant-Q from the selector and native DSP. Saved retired
  choices use Log-Frequency Power Spectrogram without rewriting preferences.

### Validation and release status

- RC4 uses three modes and four palettes. Current performance coverage is four jobs,
  142 observations and 56 aggregate gates, retaining revision-2 pairing and budgets.
  Prior 224-observation/five-mode datasets below remain historical, not current scope.

- Original M5 run `37765259320` and independent post-review run `37778677667`
  each completed 224 observations and passed all 88 revision-2 aggregate gates.
  These are paired Windows-runner results with synthetic audio and stub insertion,
  not measured user-PC latency.
- Preserve the earlier failed comparisons and the explicit UI-aggregation revision.
  The [M5 closeout record](docs/M5_REVIEW_CLOSEOUT.md) individually reviews all eight
  original Codacy additions. Three maintainability additions are absent from the
  new report; five intentional assertions/requirements remain `action_required`.
- Fixed cache probes passed 36,660 exact pixel comparisons across six Windows
  jobs. The earlier mismatch's cause remains unknown and is disclosed as a reviewed
  residual risk for integrated acceptance; no production-cache fix is claimed.
- 1.2.0 remains unpublished. One integrated normal-use acceptance and exact accepted
  source/artifact freeze precede the separately safeguarded M7 history work and
  M8 final build/publication. Issue #38 remains unresolved.

## 1.1.3

### M1 review candidate — not published

- Isolate speculative preview in a separate, on-demand Whisper worker with at most two threads and best-effort below-normal process priority. Final transcription keeps its original warm worker and decoding settings.
- Stop, Cancel and disposal retire the preview worker, including an idle worker. Active preview cancellation waits for native process exit rather than assuming HTTP cancellation proves computation stopped. Pause/Resume retains accepted audio and restarts preview lazily when needed.
- Keep the pinned local model/runtime, existing waveform, six user settings, clipboard policy and final-only insertion.
- Add **Universal Dictate: Show Latency Report** to open the last 100 completed timing records in one document. Diagnostics identify the candidate version and inference policy. No transcript or audio is included.

## 1.1.2

### Internal diagnostic build — not published

- Add M0.2 Stop-to-Insert timing diagnostics for local latency investigation.
- Record whether live-preview Whisper inference is active at Stop, how long it has been active, or how long since the previous preview inference finished.
- No dictation, transcription, insertion, clipboard, Pause/Resume, waveform or release behavior is intentionally changed.

## 1.1.0

### Added

- **Pause / Resume** between Insert and Discard in the enhanced overlay, plus
  **Ctrl+Alt+P** and a Pause/Resume command within VS Code.
- Paused audio is excluded from the WAV, preview buffer and waveform. Resume appends
  to the same recording; Stop/Insert and Discard remain usable while paused.
- Compact symbol controls with green Insert, amber Pause/Resume, red Discard and
  descriptive hover help.

### Changed

- Restore the thin waveform trace and subtle envelopes with immutable display
  samples: existing segments scroll without wobbling or changing shape.

- Waveform history now defaults to **10 seconds**. Explicit saved preferences remain
  unchanged; English, Medium, Live preview Off and Overwrite clipboard Off remain.
- Gave the waveform more height with Live preview enabled, compacted preview spacing,
  and tuned the signed-peak response for moderate headroom with a slightly raised visual-only idle-noise gate; redundant mirrored lower-envelope strokes are omitted.
- Narrowed the controls and removed unused vertical padding. Preview Off uses a
  shorter overlay; Preview On keeps room for complete text lines.
- Clarified dictation into compatible focused text fields in other Windows apps.

### Notes

- The microphone device stays open while paused; paused samples are ignored rather
  than saved or transcribed. Pause does not act as a hardware microphone mute.
- No new model download, global hotkey, native platform support or status-bar focus
  fix is introduced. Issue #38 remains unresolved.

## 1.0.0

### Added

- Optional **Live preview** in the recording overlay, disabled by default. Recent provisional words appear while speaking; Stop transcribes the complete recording and inserts the final transcript once.
- **Small, Medium and Large** overlay sizes, with Medium as the default, plus improved text layout and display-scaling support.
- **Overwrite clipboard**, disabled by default, to keep a manual-paste backup of the final transcript.
- **Copy Last Transcript** in the Command Palette to recover the latest successful final transcript during the current extension session.

### Changed

- Automatic insertion now uses direct Unicode input instead of temporarily replacing the clipboard. With Overwrite clipboard Off, automatic dictation leaves existing clipboard contents untouched.
- **English is now the default language.** Auto-detect and all 99 languages remain selectable. Explicitly saved settings are preserved; users who relied on the previous default without saving a choice will now use English.
- Updated screenshots, settings documentation and the Marketplace overview.

### Fixed

- Improved recording/session cleanup, cancellation, repeated Stop handling and rejection of stale preview results.
- Improved multilingual preview shaping, clipping and recent-line display without enlarging the selected overlay preset.

### Notes

- Local/offline recognition after the initial model download, Windows/Remote - WSL support and no automatic submission remain unchanged.
- Live preview adds CPU work and recognition delay; it is not instantaneous captioning or full transcript history.
- The status-bar focus limitation in Issue #38 remains. Keyboard/overlay controls and clipboard recovery are workarounds, not a focus-preservation fix.

## 0.1.5

Configurable Enhanced waveform time span.

- Add a configurable Enhanced waveform history.
- Add the `universalDictate.waveformTimeSpanSeconds` setting and expose it through the Universal Dictate settings picker.
- Apply waveform time-span changes from the next dictation session.
- Keep the existing Enhanced waveform renderer, recorded audio and status-bar visualization behavior unchanged.

## 0.1.4

Presentation republish from the merged repository state.

- Publish the approved blue/orange Universal Dictate icon and the updated tight Marketplace/README screenshots under a fresh extension version.
- Keep the extension icon path at `media/icon.png`.
- No runtime, recorder, transcription, insertion, Whisper, visualization or settings behavior changes.

## 0.1.3

Presentation asset refresh.

- Replace the extension icon with the approved blue/orange microphone, waveform and transcript design.
- Replace the status-bar, settings-menu and Enhanced-overlay screenshots with tighter privacy-safe crops.
- No runtime behavior changes.

## 0.1.2

Enhanced recording visualization, settings and status-bar polish.

- Add the new default **Enhanced overlay**: a non-activating native Windows recording panel with a sensitive signed PCM waveform, scientific signal styling and compact `Insert` / `Discard` controls.
- Keep captured waveform samples visually stable as they move through the bounded history instead of continuously reshaping older signal segments.
- Add audio-visualization choices for **Both**, **Enhanced overlay**, **Status bar only** and **Off**; remove the legacy large overlay from the user-facing settings while mapping old persisted `overlay` values to Enhanced for compatibility.
- Add the Universal Dictate settings gear and in-app audio-visualization picker alongside the existing 99-language Whisper picker.
- Move the `Dictate` and settings status-bar items into VS Code's right-side utility group while preserving the order `Dictate` → settings.
- Keep the status-bar microphone level display width stable during recording and make the recording item clickable to stop and transcribe.
- Preserve the accepted non-activating overlay behavior, multi-monitor placement including negative virtual-screen coordinates, `Ctrl+Alt+D`, `Esc`, focused insertion and Remote - WSL support.

## 0.1.1

Performance, UI and Marketplace polish.

- Keep a local `whisper-server` worker alive after first use so the Whisper model is loaded once and reused across dictations.
- Start warming the worker as soon as recording begins, overlapping model initialization with the time the user is speaking.
- Fall back automatically to the proven one-shot `whisper-cli` path if the warm worker cannot start or exits unexpectedly.
- Keep the worker bound only to `127.0.0.1` behind a per-session randomized request path; no audio or transcript leaves the machine.
- Place the clickable `Dictate` status-bar action toward the left edge of VS Code's right-side utility group instead of at the extreme right.
- Use the blue-to-orange microphone/waveform Marketplace icon matching the project artwork.
- Make the public GitHub source, issue tracker and manual VSIX release path explicit in the README.
- Add the full Universal Dictate overview/instructions artwork to the README and Marketplace description.

## 0.1.0

First public release candidate.

- Local, offline speech-to-text on Windows using OpenAI Whisper through whisper.cpp.
- Multilingual dictation with automatic detection and explicit selection across 99 Whisper languages.
- Focused-input insertion for normal VS Code controls and extension-owned agent/chat composers such as OpenAI Codex.
- Remote - WSL support by running in the local Windows UI extension host.
- Clickable `Dictate` action in the VS Code status bar plus `Ctrl+Alt+D` keyboard control.
- Non-activating native Windows recording overlay with confirm and cancel controls.
- High-amplitude rolling wave-field microphone visualization.
- Local model download with SHA-256 verification and offline operation after setup.
- Temporary audio is deleted after transcription.
- No API key, Python installation, FFmpeg installation or WSL-side microphone setup required.

### Third-party components

Universal Dictate explicitly credits and retains the relevant license notices for OpenAI Whisper, whisper.cpp, miniaudio and the OpenWhispr source lineage of the focused-input Windows paste helper. See `THIRD_PARTY_NOTICES.md`, `docs/DEPENDENCIES.md` and `third_party/`.
