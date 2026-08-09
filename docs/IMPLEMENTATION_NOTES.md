# Implementation notes

The working MVP intentionally keeps the runtime simple:

- the VS Code extension runs in the local Windows UI extension host
- the bundled recorder helper captures the Windows default microphone through miniaudio/WASAPI
- recording is 16 kHz mono PCM16 WAV
- the official whisper.cpp v1.9.1 x64 runtime is bundled in the VSIX
- the multilingual Whisper base model is downloaded once on first use and checksum-verified
- transcription runs with whisper-cli locally on CPU
- the transcript is inserted through the already-validated clipboard + Win32 SendInput path
- temporary WAV files are deleted after transcription or cancellation

The MVP deliberately does not implement a focus-stealing webview or native overlay. The recording indicator is a VS Code status-bar item so the Codex composer can retain keyboard focus while dictation runs.
