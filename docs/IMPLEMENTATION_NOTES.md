# Implementation notes

## Current 0.1.5 baseline

- The extension runs in the local Windows VS Code UI extension host, including Remote - WSL workspaces.
- The bundled native recorder captures the Windows default microphone through miniaudio/WASAPI as 16 kHz mono PCM16 WAV.
- The enhanced native overlay is non-activating and supports Insert/Discard plus waveform feedback.
- Visualization modes are Both, Enhanced overlay, Status bar only and Off.
- Enhanced waveform history is configurable for 1, 3, 5, 10 or 20 seconds.
- The official pinned whisper.cpp v1.9.1 x64 runtime is bundled in the VSIX.
- The multilingual Whisper `base` model is downloaded on first use, SHA-256 verified and reused locally.
- Recording warms a local `whisper-server`; final transcription uses that worker when available and falls back to `whisper-cli` if needed.
- The completed transcript is pasted through the clipboard plus the native Win32 `SendInput` helper.
- Temporary WAV files are removed after completion or cancellation.
- Dictation never synthesizes Enter or automatically submits a chat/message.

## Known limitation

The genuine VS Code status-bar Dictate/Stop mouse path can disturb the previously active caret/selection before the extension command runs. This is tracked as Issue #38 and is separate from ASR correctness. The frozen native-launcher experiment and Code OSS focus probe are not shipped product code.

## Active development order

The current roadmap is `docs/DICTATION_RELIABILITY_PLAN.md`:

1. M1 overlay size presets
2. M2 transcript, clipboard and lifecycle reliability
3. M3 live transcript preview
4. M4 optional translation
5. M5 insertion-target preservation
6. M6 integrated validation/release

Each milestone has one branch; all of its submilestones stay on that branch until the user reviews it.
