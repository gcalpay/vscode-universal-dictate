# Manual and release test procedure

This document describes the current shipped baseline. The detailed future acceptance matrix and milestone-specific gates live in `docs/DICTATION_RELIABILITY_PLAN.md`.

Do not turn a compile result or mocked control into a Windows/Codex pass. Use synthetic text in captures and issue reports.

## Environment record

For every manual run record:

- Windows version
- VS Code version
- Universal Dictate branch/commit or VSIX identity
- local Windows vs Remote - WSL workspace
- target control
- visualization mode
- waveform time span
- start and finish controls
- display scaling/monitor arrangement when testing the native overlay

## Basic dictation

1. Focus an editable target.
2. Start with `Ctrl+Alt+D`.
3. On first use, allow the model download/checksum verification to finish.
4. Speak synthetic test text.
5. Stop with `Ctrl+Alt+D`.
6. Confirm the produced transcript is pasted once at the current target and no Enter/submission occurs.
7. Repeat with the enhanced overlay Insert button.
8. Separately exercise the genuine status-bar Dictate and Stop mouse paths and record focus/placement results; do not assume they preserve the previous target.

Subsequent dictation should work without network access after the model exists.

## Selection semantics

Use:

```text
left old right
```

Select only `old`. A correct paste of `UD_TEST` produces:

```text
left UD_TEST right
```

Text outside the selection must remain unchanged.

## Cancellation

While recording:

- press `Esc`, and separately
- use overlay Discard when the overlay is enabled.

No transcript should be inserted or submitted.

## Visualization regression

Exercise Both, Enhanced overlay, Status bar only and Off. For the enhanced overlay, verify waveform spans 1, 3, 5, 10 and 20 seconds do not alter recording length or final transcription behavior.

When M1 size presets are implemented, test Small/Medium/Large at 100%, 125%, 150% and 200% scaling plus a mixed-DPI/multi-monitor setup. Drawing and Insert/Discard hit areas must remain aligned and the overlay must stay non-activating.

## Clipboard baseline

Copy recognizable plain text before dictation. After insertion, paste manually elsewhere and verify the prior clipboard text was restored.

The current baseline uses delayed string restoration and does not yet establish ownership-aware preservation of every native clipboard format. M2 explicitly tests and improves this; do not overstate current guarantees.

## Diagnostics

Run:

```text
Universal Dictate: Show Diagnostics
```

A packaged Windows build should report the expected Windows UI-host placement and availability of the native paste helper, recorder and whisper runtime. After setup, the model should report installed.

## Failure classification

### Recorder fails to open

Check Windows microphone privacy settings, especially permission for desktop applications.

### Recording works but transcription fails

Check diagnostics, retain the exact error and distinguish warm-server failure from CLI fallback failure.

### Transcript is wrong

Treat as ASR/language/audio quality until evidence indicates otherwise.

### Transcript is correct but appears in the wrong control

Treat as target-preservation/focus behavior. Record whether Start and Stop used the status bar, keyboard or native overlay. Issue #38 specifically concerns the genuine status-bar mouse workflow.

### Transcript appears and is not submitted

That confirms only the exercised path. It does not prove all start/finish combinations or opaque composers.
