# Architecture

## Scope

Universal Dictate is a Windows VS Code extension for local speech-to-text. It supports normal Windows workspaces and Remote - WSL workspaces by running in the local Windows UI extension host.

The project deliberately does not depend on the private UI implementation of OpenAI Codex, GitHub Copilot or any other chat extension. Dictation targets the editable control that owns keyboard focus.

## Core insertion constraint

VS Code extensions cannot safely address another extension's private DOM/UI internals. The insertion path is therefore input-oriented rather than DOM-oriented:

```text
focused Windows/VS Code control
        ^
        |
synthetic Ctrl+V
        ^
        |
Universal Dictate native paste helper
        ^
        |
VS Code clipboard API <- transcript
```

The helper restores the previous clipboard contents and never synthesizes Enter.

This architecture allows the same insertion mechanism to work with editors and opaque extension-owned inputs such as the Codex composer, as long as the intended target still owns focus when insertion occurs.

## Extension placement under Remote - WSL

The extension declares:

```json
"extensionKind": ["ui"]
```

The TypeScript extension therefore runs in the local Windows extension host. WSL remains the workspace environment and does not need microphone, model or transcription dependencies.

## Current components

```text
VS Code (Windows)
|
+-- TypeScript extension
|   +-- commands and keybindings
|   +-- dictation state/lifecycle
|   +-- settings and language selection
|   +-- model download/checksum/storage
|   +-- warm whisper-server orchestration
|   +-- whisper-cli fallback
|   +-- clipboard coordination
|   `-- status-bar integration
|
+-- Universal Dictate native C++20 helpers
|   +-- microphone capture (miniaudio -> WASAPI)
|   +-- 16 kHz mono PCM16 WAV recording
|   +-- audio-level/waveform reporting
|   +-- non-activating Enhanced recording overlay
|   `-- focused-control paste (Win32 SendInput)
|
`-- local ASR runtime
    +-- whisper-server on 127.0.0.1 with randomized request path
    `-- whisper-cli fallback

WSL
`-- workspace only; no Universal Dictate runtime dependency
```

The multilingual Whisper `base` model is downloaded once, checksum-verified and reused locally. The current Windows package is CPU-only.

## Dictation state machine

```text
Idle
  -> Recording
  -> Transcribing
  -> Inserting
  -> Idle

Recording -> Cancelled -> Idle
Any state -> Error -> Idle
```

The extension must never synthesize Enter or otherwise auto-submit dictated text.

## Recording UI and focus

The Enhanced overlay uses a native non-activating Windows window so interacting with `Insert` or `Discard` does not intentionally activate the overlay in place of the current VS Code target.

The real VS Code status-bar `Dictate` item is different: pointer activation is owned by VS Code itself. Clicking that item can move focus away from the previously active editor or extension-owned input before the Universal Dictate command runs. That is the active focus-preservation problem tracked by Universal Dictate Issue #38.

The current clean design direction for Issue #38 is an upstream VS Code capability that allows a status-bar command to execute without the pointer activation moving keyboard focus into the status bar. The candidate API shape is `StatusBarItem.preserveFocus?: boolean`, but the exact API is subject to upstream design review.

Universal Dictate must not solve this with UI Automation/MSAA target tracking, mouse hooks, click replay, after-the-fact focus restoration or synthesized Enter. Deliberate user retargeting while recording must remain authoritative.

See:

- [`issue-38-implementation-plan.md`](issue-38-implementation-plan.md) for the remaining upstream/API milestones.
- [`issue-38-implementation-log.md`](issue-38-implementation-log.md) for completed investigation and workflow history.

## Dependency policy

Runtime dependencies should be minimal, pinned and reviewable. End users should not need Python, Conda, FFmpeg, SoX, CMake or packages inside WSL.

See [`DEPENDENCIES.md`](DEPENDENCIES.md) for the current dependency choices and provenance rules. Third-party binaries and model files must have their license, source, version and checksum documented before release.

## Privacy invariant

Released builds perform speech recognition locally. Audio capture and transcripts are not sent to a remote transcription service. The initial model download is the network operation required for normal setup.
