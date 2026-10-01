# Implementation notes

## Current 1.1 candidate (PR #54, not yet accepted)

- The extension runs in the local Windows VS Code UI extension host, including
  Remote - WSL workspaces.
- The bundled native recorder captures the Windows default microphone through
  miniaudio/WASAPI as 16 kHz mono PCM16 WAV.
- The enhanced native overlay is non-activating and supports Insert/Discard,
  waveform feedback and Small/Medium/Large layouts; Medium is the default.
- Visualization modes are Both, Enhanced overlay, Status bar only and Off.
- Enhanced waveform history is configurable for 1, 3, 5, 10 or 20 seconds; the
  default is 10 seconds; explicit stored values are preserved.
- English is the default language. Auto-detect and all 99 Whisper languages remain
  selectable. Existing explicit user settings are not reset on upgrade.
- The official pinned whisper.cpp v1.9.1 x64 runtime is bundled in the VSIX.
- The multilingual Whisper `base` model is downloaded on first use, SHA-256
  verified and reused locally.
- Recording warms a loopback-only `whisper-server`; final transcription uses that
  worker when available and falls back to `whisper-cli` if needed.
- Live preview is implemented and defaults Off. When enabled with an enhanced
  overlay, bounded/coalesced preview snapshots are decoded locally; stale results
  are rejected and provisional text is never inserted or copied.
- Stop always uses the complete recording for one authoritative final transcript.
- Final insertion uses direct Win32 Unicode input rather than clipboard paste.
  Control characters are converted to spaces and dictation never synthesizes Enter.
- **Overwrite clipboard** defaults Off. Off performs no automatic clipboard access;
  On copies the exact final transcript once before the same direct-input attempt and
  does not restore prior clipboard contents.
- The latest successful non-empty final transcript is retained in memory for
  **Copy Last Transcript**. Reload/restart clears that retained text.
- Session-generation, cancellation, duplicate-Stop and WAV/native cleanup safeguards
  are part of the current runtime.
- Temporary final WAV files are removed after completion or cancellation.

## M7 additions

Pause/Resume gates captured PCM, not the device. The matching PAUSED acknowledgement
waits for an admitted callback to drain; paused samples are excluded from WAV,
preview and waveform. Resume appends accepted audio to the same file. Stop/Discard
stay usable while paused or transitioning; acknowledgement errors cancel uncertain
capture. Preview scheduling suspends and stale results cannot reappear after Resume.

The middle overlay button is Pause/Resume. Text (default) or Symbols is snapshotted
per recording; native vectors avoid extra fonts. Green/amber/red controls also have
text or shape distinctions and hover help. Ctrl+Alt+P is VS Code-local, not global.

## Known limitation

The genuine VS Code status-bar Dictate/Stop mouse path can disturb the previously
active caret/selection before the extension command runs. Issue #38 remains open.
Keyboard/overlay controls and optional clipboard backup are workarounds, not proof of
focus preservation.

The frozen native-launcher experiment and Code OSS focus probe are not shipped code.

## Milestone status

- M1 — overlay size presets: complete and merged (PR #50).
- M2 — direct input, optional clipboard overwrite, transcript recovery and lifecycle:
  complete and merged (PR #51).
- M3 — live transcript preview: complete and merged (PR #52).
- M4 — translation milestone: skipped for 1.0.0.
- M5 — genuine insertion-target preservation: parked outside 1.0.0.
- M6 — 1.0.0 release: merged through PR #53; user reports Marketplace publication.
- M7 — Pause/Resume and controls: current on `feat/pause-resume-controls` / PR #54.
  Build a test VSIX for user acceptance; do not merge or publish yet.

Historical M2/M3 ledgers remain evidence of their checkpoints; they are not future
implementation instructions.
