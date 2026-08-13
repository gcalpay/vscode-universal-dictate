# Testing

This document describes the current released Universal Dictate regression checks. Issue-specific experimental tests belong in the active Issue #38 plan/log.

## Environment

- Windows 10/11 desktop VS Code
- Universal Dictate installed as a Windows UI extension
- local Windows workspace or optional Remote - WSL workspace
- editor, Search/settings input, Codex/agent/chat composer, or another supported editable target

The critical placement result under Remote - WSL remains `platform=win32`: Universal Dictate runs in the local Windows UI extension host while WSL is only the workspace environment.

## Basic dictation

1. Focus the intended target.
2. Start with `Ctrl+Alt+D`.
3. Speak normally.
4. Stop with `Ctrl+Alt+D`.
5. Wait for local transcription and insertion.
6. Confirm the transcript appears at the intended target and no Enter/submit action occurs.

On first use, allow the multilingual Whisper `base` model download to finish. The download is approximately 148 MB; subsequent normal dictation can work offline.

Repeat the basic test using the Enhanced overlay `Insert` control and, where relevant to the active regression, the status-bar Dictate/Stop item.

## Cancellation

While recording, press `Esc` or choose `Discard` on the Enhanced overlay. The temporary recording should be discarded and no text inserted.

## Clipboard preservation

Copy a recognizable value before dictation. After transcript insertion, paste manually somewhere else and confirm the previous clipboard text was restored.

## Warm worker and fallback

After the first successful dictation, repeat dictation and confirm the local warm worker can be reused. If `whisper-server` cannot start or exits unexpectedly, Universal Dictate should fall back to the one-shot `whisper-cli` path rather than losing the recording solely because the warm worker failed.

## Visualization

For the configured visualization mode, confirm recording feedback appears as expected. When Enhanced waveform time span is changed, the new span should apply from the next dictation session and must not change maximum dictation duration.

## Diagnostics

Run:

```text
Universal Dictate: Show Diagnostics
```

A packaged Windows build should report values equivalent to:

```text
platform=win32
nativePaste=available
recorder=available
whisper=available
```

A Remote - WSL workspace should additionally identify the remote workspace while the runtime platform remains Windows. After first-run model setup, diagnostics should report the model as installed.

## Target/focus classification

If transcription succeeds but the text appears in the wrong control or nowhere, classify it as a target/focus problem rather than an ASR problem.

The current released baseline has a known focus-preservation issue when dictation is started by pointer-clicking the real VS Code status-bar item: the click can move focus away from the previously selected editor or extension-owned input before the command executes. This is tracked as Issue #38.

Until Issue #38 is resolved through a stable public VS Code API, do not treat the status-bar-start path as equivalent to the keyboard-start path. Experimental focus matrices, patched-VS-Code tests and acceptance criteria are maintained in `issue-38-implementation-plan.md`.

## Safety invariants

Every regression pass must preserve these invariants:

- dictated text is never auto-submitted
- cancellation inserts nothing
- previous clipboard contents are restored after insertion
- deliberate user retargeting while recording remains authoritative
- no UI Automation/MSAA focus tracker, mouse hook, click replay or synthesized Enter is introduced as a workaround
