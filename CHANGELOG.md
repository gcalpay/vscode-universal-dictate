# Changelog

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

Universal Dictate explicitly credits and retains the relevant license notices for OpenAI Whisper, whisper.cpp and miniaudio. See `THIRD_PARTY_NOTICES.md`, `docs/DEPENDENCIES.md` and `third_party/`.
