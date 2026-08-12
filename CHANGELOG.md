# Changelog

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
