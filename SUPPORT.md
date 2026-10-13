# Support

Use [GitHub Issues](https://github.com/gcalpay/vscode-universal-dictate/issues)
for bug reports, compatibility questions and feature requests.

For actionable reports, include the Windows and VS Code versions, Universal
Dictate version, local Windows or Remote - WSL workspace, recognition language,
audio-visualization mode, whether Live preview is enabled, and how recording was
started and finished (status bar, keyboard shortcut, Insert or Discard). State
whether the transcript was wrong or correct text appeared in the wrong place.

If relevant, include output from **Universal Dictate: Show Diagnostics** or
**Universal Dictate: Show Latency Report** (timings only).
A correct transcript inserted into the wrong control is often a focus/target
problem rather than a recognition error. Clicking VS Code's real status-bar item
can move focus before dictation finishes; keyboard and native overlay controls
are available alternatives.

Never include private dictated text, microphone recordings, passwords, access
tokens or other credentials in an issue. Reproduce with synthetic text where
possible.

Recognition runs locally. Initial setup downloads the Whisper model; after it is
cached, normal dictation can operate offline.
