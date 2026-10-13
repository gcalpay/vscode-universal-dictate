# Status-bar Dictate / Stop control

Universal Dictate places a microphone item in the real VS Code status bar.

- Idle: `$(mic) Dictate` starts recording via `universalDictate.toggle`.
- Recording: `Stop` transcribes locally and inserts once into the focused input.
- During setup, cancellation and transcription, status or progress is displayed.
- `Ctrl+Alt+D` is the keyboard start/stop path.
- With the native overlay enabled, Insert finishes dictation and Discard cancels.

## Focus limitation

The status-bar item belongs to VS Code. A primary click may move keyboard focus
before the extension receives its command. Inputs embedded in other extensions,
including prompt composers, cannot always be restored after that focus change.

The enhanced native overlay is a separate non-activating Windows surface. Its
Insert/Discard controls and the keyboard shortcut avoid some status-bar click
paths, but no general guarantee is made for all third-party text controls.
