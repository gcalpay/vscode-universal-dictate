# VS Code Universal Dictate

Open-source, fully local speech-to-text for VS Code on Windows, including Remote - WSL.

> **Status:** early prototype. The first milestone is validating reliable text insertion into extension-owned inputs such as the OpenAI Codex composer while VS Code is connected to WSL.

## Product goals

- Local speech-to-text with no API key or cloud transcription.
- Windows 10/11 as the supported desktop platform.
- Works from a Windows VS Code client while the workspace is connected through Remote - WSL.
- Inserts dictated text into the text control that had focus, including extension-owned composers where practical.
- Never submits dictated text automatically.
- Terminal dictation disabled by default.
- No Python, Conda, FFmpeg or WSL-side runtime dependency for end users.
- A simple microphone UI with visible input level, confirm and cancel actions.

## Development order

1. **M1 - Focused-input injection:** prove that a Windows-local VS Code extension can insert probe text into the Codex composer under Remote - WSL.
2. **M2 - Native Windows helper:** replace the temporary injection probe with native Win32 input handling and establish microphone capture.
3. **M3 - Local ASR:** integrate `whisper.cpp` and model management.
4. **M4 - Dictation UX:** microphone control, input-level visualization, confirm/cancel and safe focus restoration.
5. **M5 - Hardening:** terminal safeguards, automated tests, packaging and Marketplace preparation.

## M1 test

The current prototype contributes **Universal Dictate: Insert Probe Text** with the default shortcut:

```text
Ctrl+Alt+D
```

Place the caret in the Codex composer and press the shortcut. A successful M1 test inserts:

```text
[Universal Dictate probe]
```

without submitting the prompt.

## Privacy direction

The intended released extension performs transcription locally. Microphone audio must not be uploaded to a transcription service.

## License

MIT. See [LICENSE](LICENSE).
