# Architecture

## Scope

Universal Dictate is a Windows-first VS Code extension for local speech-to-text. The primary compatibility target is the Windows desktop VS Code client with a workspace connected through Remote - WSL.

The project deliberately does not depend on the OpenAI Codex extension, GitHub Copilot or any other chat extension. Dictation should target the control that already owns keyboard focus.

## Core constraint

VS Code extensions cannot safely depend on another extension's private UI implementation. The Codex composer must therefore be treated as an opaque text control.

The insertion mechanism is consequently input-oriented rather than DOM-oriented:

```text
focused VS Code control
        ^
        |
synthetic paste keystroke
        ^
        |
local Windows helper
        ^
        |
VS Code clipboard API <- transcript
```

This avoids coupling Universal Dictate to Codex internals.

## Extension placement under Remote - WSL

The extension declares:

```json
"extensionKind": ["ui"]
```

The TypeScript extension therefore belongs in the local extension host on the Windows client. WSL remains the workspace environment and should require no microphone, model or transcription dependencies.

## Planned components

```text
VS Code (Windows)
|
+-- TypeScript extension
|   +-- commands and keybindings
|   +-- lifecycle/state machine
|   +-- settings
|   +-- model management
|   +-- clipboard coordination
|   `-- UI integration
|
+-- native Windows helper
|   +-- microphone capture (miniaudio -> WASAPI)
|   +-- WAV/PCM recording
|   +-- audio-level reporting
|   +-- non-activating dictation overlay, if required
|   `-- focused-control text injection (Win32 SendInput)
|
`-- local ASR runtime
    `-- whisper.cpp

WSL
`-- workspace only; no Universal Dictate runtime dependency
```

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

The extension must never synthesize Enter as part of dictation.

## Milestones

### M1: Focused-input injection

Goal: prove the architecture against the OpenAI Codex composer under Remote - WSL before investing in speech recognition.

Acceptance criteria:

- Extension runs in a Windows desktop VS Code window connected to WSL.
- User places caret in Codex composer.
- User presses the Universal Dictate probe shortcut.
- Probe text appears at that caret.
- No Enter/submit action occurs.
- Existing clipboard content is restored.

The packaged M1 build uses the native OpenWhispr-derived Win32 `SendInput` helper. PowerShell `SendKeys` remains a development-only fallback when the helper has not been built yet.

### M2: Native Windows recording boundary

Use miniaudio, statically compiled into a small Windows helper, for capture through WASAPI. Define a narrow line-oriented IPC protocol between the helper and extension for recording lifecycle and audio-level events.

Acceptance criteria:

- No shell/PowerShell dependency in packaged builds.
- No FFmpeg/SoX/Python/SDL dependency.
- Microphone capture runs on Windows while workspace remains in WSL.
- Recording can be stopped or cancelled deterministically.
- Helper emits usable input-level data for the recording UI.
- Helper failures are isolated and surfaced cleanly.

### M3: Local ASR

Integrate whisper.cpp as a pinned, auditable dependency.

Acceptance criteria:

- Multilingual Whisper model supported (English and German minimum).
- Model downloaded once and stored locally with checksum validation.
- Dictation works with networking disabled after setup.
- No API key or cloud transcription path exists.

### M4: Dictation UX

Add the product workflow:

```text
focused caret -> start dictation -> visible mic/input level -> confirm -> transcribe -> insert
                                                `-> cancel -> discard
```

The UI must not cause the target control to lose insertion context. A non-activating native overlay is preferred if VS Code-native surfaces cannot meet this constraint.

### M5: Safety and release

- Terminal dictation disabled by default.
- Never auto-submit.
- Restore clipboard after insertion.
- Verify behavior in editor, Search, Source Control input, Codex composer and Remote - WSL.
- Package Windows x64 VSIX.
- Prepare Marketplace metadata and privacy documentation.

## Dependency policy

Runtime dependencies should be minimal, pinned and reviewable. End users should not need to install Python, Conda, FFmpeg, SoX, CMake or packages inside WSL.

See `docs/DEPENDENCIES.md` for the current dependency choices and provenance rules.

Third-party binaries and model files must have their license, source, version and checksum documented before release.

## Privacy invariant

Released builds must perform speech recognition locally. Audio capture and transcripts are not sent to a remote transcription service.
