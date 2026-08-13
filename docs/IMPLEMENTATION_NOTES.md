# Implementation notes

The current released runtime is intentionally local and Windows-focused:

- the VS Code extension runs in the local Windows UI extension host, including while the workspace is Remote - WSL
- the bundled recorder helper captures the Windows default microphone through miniaudio/WASAPI
- recording is 16 kHz mono PCM16 WAV
- the native Enhanced overlay is non-activating and provides `Insert` / `Discard` controls plus the PCM waveform
- the Enhanced waveform history span is configurable without changing recording length
- the official whisper.cpp v1.9.1 x64 runtime is bundled in the VSIX
- the multilingual Whisper `base` model is downloaded once on first use and checksum-verified
- a local `whisper-server` worker is warmed when recording begins and reused to reduce later transcription latency
- the worker is bound to `127.0.0.1` behind a randomized per-session request path
- if the warm worker cannot start or exits unexpectedly, transcription falls back to the one-shot `whisper-cli` path
- the transcript is inserted through the clipboard + native Win32 `SendInput` paste path
- previous clipboard contents are restored after insertion
- temporary WAV files are deleted after transcription or cancellation
- dictated text is never auto-submitted

## Focus behavior

Universal Dictate intentionally avoids coupling to another extension's private UI. The insertion helper pastes into the control that owns focus when insertion occurs.

The Enhanced native overlay is designed not to activate itself. The VS Code status-bar item is owned by VS Code, however, and a pointer click can move focus away from the previously active editor or extension-owned composer before Universal Dictate starts recording. This is tracked as Issue #38.

The planned clean fix is upstream VS Code focus-preserving status-bar activation, not target tracking or focus restoration hacks. See `issue-38-implementation-plan.md` and `issue-38-implementation-log.md` for the active work.
