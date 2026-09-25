# Architecture

## Scope

Universal Dictate is a Windows-first VS Code extension for local speech-to-text. It runs in the local Windows UI extension host, including when the workspace is connected through Remote - WSL. The extension does not depend on Codex, Copilot or another chat extension's private UI.

Current shipped baseline: version 0.1.5 on `main`. Future work is tracked in `docs/DICTATION_RELIABILITY_PLAN.md`; planned behavior is not described here as already shipped.

## Runtime architecture

```text
VS Code Windows UI host
|
+-- TypeScript extension
|   +-- commands, keybindings and settings
|   +-- dictation lifecycle/state machine
|   +-- model acquisition and checksum verification
|   +-- warm whisper.cpp worker + CLI fallback
|   +-- clipboard orchestration
|   `-- status-bar/settings integration
|
+-- Native C++20 helpers
|   +-- miniaudio/WASAPI microphone capture
|   +-- 16 kHz mono PCM16 WAV recording
|   +-- native non-activating recording overlay
|   +-- audio-level/waveform reporting
|   `-- focused Ctrl+V helper via Win32 SendInput
|
`-- Local ASR
    +-- bundled whisper-server for warm inference
    `-- bundled whisper-cli fallback

WSL
`-- workspace only; no microphone/model/runtime installation required
```

The warm server binds to loopback only and uses a randomized request path. Final transcription falls back to the one-shot CLI when the warm worker cannot start or fails.

## Dictation lifecycle

```text
Idle
  -> Preparing
  -> Opening microphone
  -> Recording
  -> Transcribing
  -> Inserting
  -> Idle

Recording -> Cancelling -> Idle
Failure -> error notification -> Idle
```

The extension must never synthesize Enter as part of dictation.

## Insertion boundary

Another extension's composer is treated as an opaque editable control. Universal Dictate therefore uses the Windows clipboard plus a native Ctrl+V helper instead of reaching into another extension's DOM.

```text
focused Windows editable control
        ^
        |
       Ctrl+V
        ^
        |
native SendInput helper
        ^
        |
VS Code clipboard API <- completed transcript
```

This deliberately avoids private Codex APIs, but it also means the eventual destination depends on keyboard focus at insertion time.

## Known status-bar focus limitation

The genuine VS Code status-bar item is owned by the workbench. A primary mouse click can move focus before the extension command runs. That can lose the intended caret/selection in opaque inputs such as the Codex composer. Issue #38 tracks preservation of the latest deliberately selected target.

A separate non-activating Win32 launcher exists only on a frozen experimental branch and is not the shipped architecture. A separate Code OSS diagnostic branch tests an upstream mouse-down hypothesis; it is development equipment, not a runtime dependency.

## Recording overlay

The shipped enhanced overlay is a native `WS_EX_NOACTIVATE` Windows surface with waveform feedback plus Insert/Discard controls. The current large enhanced layout is the reference for the planned Small/Medium/Large size work. Presentation size must not change audio capture, waveform time-span meaning, recording duration or transcription quality.

## Remote - WSL

The manifest declares:

```json
"extensionKind": ["ui"]
```

Therefore recording, model storage, inference and native helpers stay on Windows while the project workspace can remain in WSL.

## Planned boundaries

The active roadmap deliberately separates:

1. overlay size presets
2. transcript/clipboard/lifecycle reliability
3. optional live transcript preview
4. optional translation to English
5. genuine status-bar insertion-target preservation
6. integrated release validation

Each milestone uses one feature branch. Submilestones stay on that branch. The user reviews the milestone before merge; the next milestone branches from the updated `main` only after that review/merge decision.

Live preview v1 is planned as read-only provisional text in the overlay. It must not repeatedly paste partial hypotheses into the target. Translation v1 is planned around whisper.cpp's source-language-to-English capability; arbitrary target-language translation would require a separate backend decision.

## Dependency and privacy invariants

Runtime dependencies should remain minimal, pinned and reviewable. End users should not need Python, Conda, FFmpeg, SoX, CMake or WSL-side packages.

Released builds perform speech recognition locally. Audio and transcripts are not sent to a remote transcription service. See `docs/DEPENDENCIES.md` and `THIRD_PARTY_NOTICES.md`.
