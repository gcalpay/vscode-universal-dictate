# Working dictation MVP

This branch wires the already-proven focused-input insertion path to local Windows microphone capture and local whisper.cpp transcription.

Target workflow:

1. Focus a VS Code text input such as the Codex composer.
2. Press `Ctrl+Alt+D` to start recording.
3. Press `Ctrl+Alt+D` again to stop.
4. Transcribe locally with whisper.cpp.
5. Insert the transcript at the focused caret without sending Enter.

The first run downloads the multilingual Whisper `base` model to VS Code's local extension storage. The model is checksum-verified and reused offline afterwards.
