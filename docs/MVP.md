# Current product baseline

Universal Dictate 0.1.5 provides a complete local Windows dictation path for VS Code, including Remote - WSL workspaces.

## Normal workflow

1. Choose a VS Code or supported Windows text input.
2. Start dictation with the status-bar Dictate item or `Ctrl+Alt+D`.
3. Record locally with the Windows native recorder.
4. Stop with the status-bar Stop item, `Ctrl+Alt+D` or overlay Insert.
5. Transcribe locally with the warm whisper.cpp worker, with CLI fallback.
6. Paste the completed transcript with Ctrl+V semantics.
7. Review the text; Universal Dictate never presses Enter or submits it.

The first run downloads and verifies the multilingual Whisper `base` model. Normal operation can then remain offline.

## Cancellation

Use `Esc` or overlay Discard while recording. The temporary audio is removed and no transcript is inserted.

## Known limitation

The genuine status-bar mouse path can move focus away from an extension-owned text input before the command is delivered. Issue #38 tracks preserving the intended insertion target. Do not classify a correct transcript appearing in the wrong control as an ASR failure.

## Planned work

See `docs/DICTATION_RELIABILITY_PLAN.md`. Planned sizes, transcript recovery, live preview, translation and focus-preservation work are not part of the shipped 0.1.5 baseline until implemented, tested and merged.
