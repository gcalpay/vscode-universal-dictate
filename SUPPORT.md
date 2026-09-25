# Support

Use GitHub Issues for bug reports, compatibility problems and feature requests.

When reporting a dictation problem, include:

- Windows version
- VS Code version
- Universal Dictate version
- whether the workspace is local Windows or Remote - WSL
- selected Universal Dictate language, or `auto`
- visualization mode and enhanced waveform time span
- the exact start method: status-bar Dictate or `Ctrl+Alt+D`
- the exact finish method: status-bar Stop, `Ctrl+Alt+D`, overlay Insert, `Esc` or overlay Discard
- target type: editor, Codex/chat composer, another VS Code input or external Windows text field
- whether the transcript itself was correct but appeared in the wrong place
- output from `Universal Dictate: Show Diagnostics`

A correct transcript appearing in the wrong control is an insertion-target/focus problem, not an ASR problem. Mouse clicks on the genuine VS Code status-bar Dictate/Stop item have a known target-preservation limitation tracked in Issue #38; report the exact control path rather than describing that as a recognition error.

Do not include private dictated text, microphone recordings, access tokens or other credentials in an issue. Use synthetic text when a reproduction needs exact content.

Universal Dictate performs normal transcription locally. The initial Whisper model download is the network operation required for normal setup; after the model is installed, dictation can operate offline.
