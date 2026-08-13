# Current dictation workflow

The original MVP is complete and has shipped. The current product flow is:

1. Focus a supported Windows/VS Code text input such as an editor or Codex composer.
2. Start recording with `Ctrl+Alt+D` or the VS Code status-bar `Dictate` item.
3. Speak while Universal Dictate records locally and shows the configured recording visualization.
4. Stop with `Ctrl+Alt+D`, the recording status item, or the Enhanced overlay `Insert` control.
5. Transcribe locally through the warm `whisper-server` worker, with `whisper-cli` as fallback.
6. Paste the transcript into the currently focused target without synthesizing Enter.

`Esc` or the Enhanced overlay `Discard` control cancels the recording and inserts nothing.

The first use downloads the multilingual Whisper `base` model to VS Code's local extension storage. The model is checksum-verified and reused offline afterwards.

## Current limitation

Starting dictation by pointer-clicking the real VS Code status-bar item can move focus away from the previously selected target before the command executes. This can affect editors and opaque extension-owned inputs such as the Codex composer. The keyboard shortcut does not inherently require that status-bar focus transition.

The clean fix is tracked in Issue #38. See `issue-38-implementation-plan.md` for the current next step and `issue-38-implementation-log.md` for completed work.
