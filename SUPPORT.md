# Support

Use GitHub Issues for bug reports, compatibility problems and feature requests.

When reporting a dictation problem, include:

- Windows version
- VS Code version
- whether the workspace is local Windows or Remote - WSL
- selected Universal Dictate language, or `auto`
- whether the problem occurs when starting from the status-bar `Dictate` action, `Ctrl+Alt+D`, or both
- output from `Universal Dictate: Show Diagnostics`

Do not include private dictated text, microphone recordings, access tokens or other credentials in an issue.

Universal Dictate performs normal transcription locally. The initial Whisper model download is the network operation required for normal setup; after the model is installed, dictation can operate offline.
