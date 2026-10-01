# Architecture

## Scope

Universal Dictate 1.1 candidate is a Windows-first VS Code extension for local speech-to-text.
It runs in the local Windows **UI extension host**, including when the workspace is
connected through Remote - WSL. It does not depend on Codex, Copilot or another chat
extension's private UI and does not require a WSL-side microphone/runtime install.

## Runtime architecture

```text
VS Code Windows UI host
|
+-- TypeScript extension
|   +-- commands, keybindings, settings and session lifecycle
|   +-- model acquisition + SHA-256 verification
|   +-- warm whisper.cpp worker + CLI fallback
|   +-- bounded live-preview coordinator (optional)
|   +-- final transcript retention / Copy Last Transcript
|   +-- optional clipboard overwrite
|   +-- direct Unicode insertion
|   `-- status-bar/settings integration
|
+-- Native C++20 helpers
|   +-- miniaudio/WASAPI microphone capture
|   +-- 16 kHz mono PCM16 WAV recording
|   +-- bounded in-memory preview PCM snapshots
|   +-- non-activating waveform/preview overlay
|   `-- Win32 direct Unicode SendInput helper
|
`-- Local ASR
    +-- bundled whisper-server for warm inference
    `-- bundled whisper-cli fallback

Remote - WSL
`-- workspace only; recording, inference and native helpers remain on Windows
```

The warm server binds to loopback only and uses a randomized request path. The
multilingual Whisper `base` model is downloaded on first use, checksum-verified and
reused locally. Final transcription falls back to the one-shot CLI if the warm worker
cannot start or fails.

## Recording pause and controls

`recording-pause.h` gates admission to the production capture callback without
blocking that callback or reopening the microphone. PAUSED is acknowledged only
after any admitted callback drains. Paused PCM does not enter WAV/preview/waveform;
Resume appends to the existing accepted-audio timeline without a silence gap.
`recorder-pause.ts` correlates nonterminal commands/acknowledgements on stdin/stdout.
The engine keeps the recording operation alive, so Stop/Cancel/disposal can win
while paused or transitioning. Unconfirmed Pause/Resume cancels with an error.
Preview aborts active results and suspends its scheduler; Resume retains revisions
and the single-operation ownership boundary. The device remains open while paused.

The enhanced overlay shares three DPI-scaled hit rectangles with the renderer:
Insert, Pause/Resume, Discard. Text is the default, with optional GDI+ vector symbols
and descriptive non-activating hover help. Waveform history defaults to ten seconds.

## Dictation and preview lifecycle

```text
Idle
  -> Preparing
  -> Opening microphone
  -> Recording
       `-> optional bounded/coalesced preview inference
  -> Stop preview work
  -> Final transcription of the complete recording
  -> Retain final transcript
  -> Optional clipboard copy
  -> Direct Unicode insertion
  -> Idle

Recording -> Cancelling -> Idle
Failure -> error notification -> Idle
```

Preview is opt-in and **Off by default**. It runs only when an enhanced overlay is
active. At most bounded/coalesced preview work is scheduled, stale session results are
discarded and provisional text is never inserted or copied. The complete recording
remains authoritative and is transcribed once after Stop.

## Insertion boundary

Another extension's composer is treated as an opaque Windows editable target.
Universal Dictate does not reach into another extension's DOM. The completed
transcript is sent directly to the input that owns keyboard focus through
`windows-text-input.exe` using Win32 Unicode input events.

```text
focused Windows editable control
        ^
        |
Win32 Unicode input events
        ^
        |
windows-text-input.exe
        ^
        |
completed final transcript
```

The direct path does **not** use the clipboard. Control characters such as line breaks
and tabs are converted to spaces before direct input so dictation cannot synthesize
Enter, Tab or submission commands. Cancellation can stop remaining input but cannot
retract input events Windows has already accepted.

### Clipboard and recovery

With **Overwrite clipboard Off** (default), automatic dictation does not read or write
the clipboard. With it **On**, the exact final transcript is copied once before the
same direct-input attempt; the old clipboard is not restored. A later user/application
copy wins.

The latest successful non-empty final transcript is retained in extension memory.
**Universal Dictate: Copy Last Transcript** explicitly copies that text regardless of
the automatic clipboard setting. Retention is not persisted across extension reloads
or VS Code restarts.

## Recording overlay

The enhanced recorder surface uses a non-activating Windows overlay. Small, Medium
and Large presets share the same native renderer and DPI-aware layout rules; Medium
is the default. Waveform history is independently configurable for 1, 3, 5, 10 or
20 seconds and does not limit recording duration.

When live preview is enabled, recent provisional text is rendered inside the chosen
overlay size rather than enlarging the window. Insert stops/finalizes the recording;
Discard cancels it. Overlay actions must remain non-activating.

## Known status-bar focus limitation

The genuine VS Code status-bar item is owned by the workbench. A primary mouse click
can move focus before the extension command runs, which can lose the intended
caret/selection in opaque inputs such as the Codex composer. Issue #38 tracks this
limitation. Direct input and clipboard recovery do not constitute a focus-preservation
fix.

Frozen native-launcher and Code OSS focus experiments are development evidence only;
they are not part of the released architecture.

## Remote - WSL

The manifest declares:

```json
"extensionKind": ["ui"]
```

Therefore the extension, microphone capture, model storage, inference and native
helpers run on the Windows side while the project workspace may remain in WSL.

## Release status

M1/M2/M3/M6 are complete in the accepted 1.0.0 merge. M7 Pause/Resume and overlay
controls are the current 1.1.0 candidate on PR #54, pending user acceptance. M4 remains
skipped and M5 focus preservation parked. See M7_PAUSE_RESUME.md for current gates.

## Dependency and privacy invariants

Runtime dependencies remain minimal, pinned and reviewable. End users do not need
Python, Conda, FFmpeg, SoX, CMake or WSL-side packages.

After initial model setup, speech recognition and optional preview run locally. Audio
and transcripts are not sent to a remote transcription service. Temporary final WAV
files are cleaned up after processing; preview audio is bounded in memory. See
`docs/DEPENDENCIES.md` and `THIRD_PARTY_NOTICES.md`.
