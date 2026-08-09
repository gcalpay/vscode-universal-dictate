# Status-bar microphone button

Universal Dictate exposes an always-visible microphone action in the VS Code status bar while idle.

- Idle: `$(mic) Dictate` starts local recording.
- Recording: the status item becomes a non-clickable live level indicator. Use the native non-activating overlay, `Ctrl+Alt+D`, or `Esc` to finish/cancel.
- Preparing/transcribing: the status item shows progress and remains non-clickable.

The status-bar button is intentionally only a start action. Stop/cancel remain on the native `WS_EX_NOACTIVATE` overlay because that path is designed not to disturb the focused VS Code/Codex input before transcript insertion.

The status-bar click path must be validated against extension-owned inputs such as the OpenAI Codex composer because VS Code owns the status-bar interaction and another extension's internal focus cannot be controlled directly through the public extension API.
