# Status-bar Dictate / Stop item

Universal Dictate exposes an always-visible microphone action in the VS Code status bar while idle.

- Idle: `$(mic) Dictate` invokes `universalDictate.toggle` and starts local recording.
- Recording: the same item remains clickable and becomes `Stop` (with waveform glyphs in modes that enable the status-bar visualization). Clicking it stops, transcribes and inserts.
- Preparing, cancelling and transcribing: progress/status text is shown and the command is disabled where appropriate.
- `Ctrl+Alt+D` remains the keyboard start/stop path.
- When the enhanced native overlay is enabled, Insert stops/transcribes/inserts and Discard cancels.

## Focus limitation

The status-bar element is owned by VS Code. A primary mouse click can move keyboard focus before Universal Dictate receives its later command. The extension therefore cannot currently claim that clicking the genuine Dictate/Stop item preserves an opaque composer caret/selection.

Issue #38 tracks this exact behavior. The acceptance target is the latest deliberately selected editable input plus its caret/selection through final insertion. Dictate/Stop/Insert controls themselves must not count as deliberate retargeting.

The native recording overlay uses a non-activating Windows surface and is a separate control path. A frozen experimental branch contains a different native Dictate launcher; it is not the shipped status-bar item and cannot be described as the literal Issue #38 fix without an explicit product decision and matching evidence.
