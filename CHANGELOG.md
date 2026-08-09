# Changelog

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
