# Manual and release test procedure

This document describes the current 1.0 Windows release behavior. Milestone-specific
historical evidence remains in `docs/DICTATION_RELIABILITY_PLAN.md` and its linked
ledgers. A compile result or mocked control is not a substitute for a real Windows
interaction test.

## Environment record

For every manual run record:

- Windows version and VS Code version
- branch/commit or exact VSIX identity
- local Windows vs Remote - WSL workspace
- target control
- Language, visualization, overlay size, waveform span, clipboard mode and preview
- start/finish controls
- display scaling/monitor arrangement when testing the native overlay

## Defaults and upgrade behavior

For a clean configuration, verify:

- Language: English
- Visualization: Enhanced overlay
- Overlay size: Medium
- Waveform time span: 1 second
- Overwrite clipboard: Off
- Live preview: Off

A user with an explicit saved value must retain it after upgrade. Do not reset an
existing non-English language, preview choice or other saved preference merely to
demonstrate the new default.

## Basic dictation

1. Focus an editable target.
2. Start with `Ctrl+Alt+D`.
3. On first use, allow the model download/checksum verification to finish.
4. Speak synthetic test text.
5. Stop with `Ctrl+Alt+D`.
6. Confirm the final transcript is inserted exactly once and no Enter/submission
   occurs.
7. Repeat with the enhanced overlay **Insert** button.
8. Separately exercise the genuine status-bar Dictate/Stop mouse paths and record
   focus/placement results; do not assume they preserve the previous target.

After the model exists, normal dictation should work without network access.

## Cancellation and duplicate controls

While recording, test `Esc` and overlay **Discard** independently. No transcript
should be inserted, copied automatically or submitted.

Exercise repeated/near-simultaneous Stop/Insert actions. Only one finalization path
may win; stale callbacks/results must not produce duplicate insertion.

## Visualization, size and DPI regression

Exercise Both, Enhanced overlay, Status bar only and Off. Verify waveform spans
1, 3, 5, 10 and 20 seconds do not change recording length or final transcription.

Test Small/Medium/Large at 100%, 125%, 150% and 200% scaling and, when available,
mixed-DPI/multi-monitor placement. Drawing and Insert/Discard hit areas must remain
aligned and the overlay must stay non-activating.

## Clipboard and transcript recovery

With **Overwrite clipboard Off**, automatic dictation must leave existing clipboard
content untouched. With it **On**, the exact final transcript is copied once before
the same direct-input attempt and old clipboard contents are not restored. A later
manual/application copy must win.

After a successful non-empty dictation, **Universal Dictate: Copy Last Transcript**
must explicitly copy the retained final transcript even when automatic overwrite is
Off. Empty/cancelled/failed dictation must not erase the latest successful retained
transcript. Reload/restart clears this memory-only state.

## Live preview

With the default **Off**, no provisional text or preview decoding should occur.

Turn Live preview **On** with Enhanced overlay or Both and verify:

1. provisional words can appear and revise without being inserted;
2. Stop transcribes the complete recording and inserts one final transcript;
3. preview failure leaves recording/final transcription available;
4. Language/preview settings are snapshotted per session;
5. Small/Medium/Large remain within their chosen bounds;
6. Status bar only / Off do not run invisible preview work.

## Diagnostics

Run:

```text
Universal Dictate: Show Diagnostics
```

A packaged Windows build should report the Windows UI-host placement, direct-input
helper, recorder and whisper runtime. After setup, the model should report installed.
Diagnostics should reflect the effective preview and clipboard settings.

## Release package audit

For the exact final VSIX verify:

- version/publisher/extension identity and win32-x64 target;
- English / Medium / Live preview Off packaged defaults;
- all four release screenshots and icon match source;
- obsolete overview image is absent;
- only `windows-text-input.exe`, `universal-dictate-recorder.exe`,
  `whisper-cli.exe` and `whisper-server.exe` are executables;
- no source/test/development directories, font files, model files or audio fixtures
  are packaged;
- compiled JavaScript and native helper hashes match the verified build.

## Failure classification

Recorder failures are microphone/privacy problems until evidence shows otherwise.
Transcription failures should distinguish warm-server from CLI fallback. Preview
failure is separate from final transcription. Wrong text is an ASR/language/audio
issue until evidence shows otherwise. Correct text in the wrong control is a
target-preservation/focus issue; Issue #38 concerns the genuine status-bar mouse path.
