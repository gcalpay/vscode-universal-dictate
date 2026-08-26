# Focus-preserving Dictate button

## Public API boundary

A literal VS Code `StatusBarItem` cannot preserve an opaque extension input such as the Codex composer when clicked with the primary mouse button.

VS Code owns the status-bar DOM and performs pointer focus handling before it invokes the command assigned by the extension. The public extension API exposes the status item's content, command and visibility, but no pointer-down handler or non-activating mode. Running another command after the click is too late: the previous editable target has already lost focus, and VS Code does not expose another extension's internal composer so Universal Dictate cannot restore it safely.

For that reason, Universal Dictate does not use focus history, synthetic clicks, UI Automation, mouse hooks, DevTools injection or after-the-fact focus restoration.

## Packaged Windows behavior

The packaged extension uses `universal-dictate-status-button.exe`, a small native Windows launcher separate from the microphone recorder.

- The launcher is a `WS_EX_NOACTIVATE` tool window and returns `MA_NOACTIVATE` from `WM_MOUSEACTIVATE`.
- It appears just above the lower-right edge of the focused VS Code window.
- It captures the foreground VS Code root window only when this extension host's VS Code window reports itself focused.
- It hides when that window loses focus, is minimized, is no longer foreground or Universal Dictate is busy.
- Idle shows **Dictate**. Recording shows **Stop** only when the larger native recording overlay is disabled.
- The literal VS Code status item remains available for non-clickable progress and recording indicators.
- `Ctrl+Alt+D`, `Esc`, **Insert** and **Discard** retain their existing behavior.

The helper communicates with the extension over its private standard input/output pipes. It does not inspect the VS Code DOM or another extension's UI.

## Fallback

If the bundled native launcher is missing or exits, Universal Dictate restores the previous clickable VS Code status-bar action. This keeps dictation usable, but that fallback cannot preserve focus in the Codex composer because it remains subject to the public API boundary above. Diagnostics report both helper availability and whether the native launcher is active.

## Required manual acceptance test

Cloud compilation and unit checks cannot prove focus behavior in the real Windows VS Code/Codex GUI. Before release, install the generated VSIX on Windows and verify all of the following:

1. Focus the real Codex composer, click the native **Dictate** button and confirm that the composer caret remains active.
2. Dictate and stop through every visualization mode; confirm insertion returns to the still-focused target and never submits automatically.
3. Repeat with a normal editor, VS Code input boxes and a second VS Code window.
4. Alt-tab, minimize and switch VS Code windows; confirm only the focused window's launcher is visible.
5. Temporarily remove or terminate the helper and confirm that the status-bar fallback and diagnostics behave as documented.
