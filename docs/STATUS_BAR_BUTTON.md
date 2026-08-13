# Status-bar microphone button

Universal Dictate exposes an always-visible `$(mic) Dictate` action and settings gear in VS Code's right-side status-bar utility group.

## Current behavior

- Idle: `$(mic) Dictate` starts local recording.
- Recording: the status item shows recording feedback and is clickable to stop, transcribe and insert.
- Preparing/transcribing/inserting: the status item shows progress while the operation completes.
- The settings gear opens Universal Dictate settings and is separate from the Dictate/Stop command path.

The Enhanced native recording overlay is non-activating and provides `Insert` / `Discard` controls. `Ctrl+Alt+D` also starts/stops dictation and `Esc` cancels recording.

## Issue #38: status-bar focus preservation

The real VS Code status bar is rendered and focused by VS Code, not by Universal Dictate. When the user pointer-clicks `Dictate`, VS Code can move keyboard focus from the previously active editor or extension-owned input into the status-bar interaction before the command executes.

Because Universal Dictate inserts through the currently focused Windows control and cannot use another extension's private UI APIs to re-focus an arbitrary target, that focus movement can cause the eventual paste to miss the intended target.

The desired behavior is:

- pointer activation of Universal Dictate's Dictate/Stop status item executes the command without incidental status-bar focus movement
- normal status items keep existing behavior by default
- keyboard navigation and Enter/Space activation of status-bar items remain accessible and unchanged
- Universal Dictate does not restore an old target after the fact
- deliberate user focus changes while recording still win

The current clean implementation path is an upstream VS Code API/capability. The candidate property is `StatusBarItem.preserveFocus?: boolean`, subject to upstream review. See `issue-38-implementation-plan.md` and `issue-38-implementation-log.md` for the active work and evidence.
