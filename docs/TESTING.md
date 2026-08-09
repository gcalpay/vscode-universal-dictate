# MVP test procedure

The focused-input insertion milestone has already passed against the OpenAI Codex composer in a Windows VS Code window connected through Remote - WSL. The current test validates the complete local dictation path.

## Environment

- Windows 10/11 desktop VS Code
- Universal Dictate installed from the Windows VSIX
- Optional Remote - WSL workspace
- OpenAI Codex composer or another VS Code text input focused

## First-run dictation test

1. Focus the target text input.
2. Press `Ctrl+Alt+D`.
3. Allow the initial multilingual Whisper base model download to complete.
4. Wait until the status bar shows recording activity.
5. Speak normally.
6. Press `Ctrl+Alt+D` again.
7. Wait for local transcription.
8. Confirm that the spoken text is inserted at the target caret and that no Enter key is synthesized.

The first model download is approximately 148 MB. Subsequent dictation should not require networking.

## Cancellation

While recording, press `Esc`. The temporary recording should be discarded and no text inserted.

## Diagnostics

Run:

```text
Universal Dictate: Show Diagnostics
```

A packaged Windows build should report values equivalent to:

```text
platform=win32
remote=wsl
nativePaste=available
recorder=available
whisper=available
```

After first-run model setup it should also report:

```text
model=installed
```

The critical placement result remains `platform=win32` even while the VS Code workspace is connected to WSL.

## Clipboard preservation

Copy a recognizable value before dictation. After the transcript is inserted, paste manually somewhere else and confirm that the previous clipboard text was restored.

## Failure classifications

### Recorder fails to open

Check Windows microphone privacy settings, especially permission for desktop applications to access the microphone.

### Recording works but transcription fails

Run diagnostics and verify `whisper=available` and `model=installed`. Preserve the exact error notification for debugging.

### Transcript is correct but appears in the wrong control

Focus was lost during the recording/transcription lifecycle. This is a target-preservation problem, not an ASR problem.

### Transcript appears in Codex and is not submitted

The end-to-end MVP passes.
