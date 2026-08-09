# VS Code Universal Dictate

Open-source VS Code extension for local, offline speech-to-text in any VS Code text input on Windows, including Remote - WSL.

> **Status:** early working MVP. Focused-input insertion has been validated against the OpenAI Codex composer under Remote - WSL. The current build includes Windows microphone capture and local whisper.cpp transcription.

## Product goals

- Local speech-to-text with no API key or cloud transcription.
- Windows 10/11 as the supported desktop platform.
- Works from a Windows VS Code client while the workspace is connected through Remote - WSL.
- Inserts dictated text into the text control that had focus, including extension-owned composers where practical.
- Never submits dictated text automatically.
- Terminal dictation disabled by default.
- No Python, Conda, FFmpeg or WSL-side runtime dependency for end users.
- A simple microphone UI with visible input level, confirm and cancel actions.

## Current MVP controls

```text
Ctrl+Alt+D   Start recording
Ctrl+Alt+D   Stop, transcribe locally and insert
Esc          Cancel the current recording
```

On first use Universal Dictate downloads the multilingual Whisper `base` model (about 148 MB), verifies its SHA-256 checksum and stores it in VS Code's local extension storage. After that, dictation works offline.

The MVP uses the Windows default microphone, records 16 kHz mono PCM16 WAV through miniaudio and transcribes it locally with a bundled, pinned whisper.cpp runtime.

## Privacy

Normal dictation is local. Microphone audio is written to a temporary local WAV file, transcribed locally and deleted after transcription. Audio and transcripts are not sent to a transcription service.

The only network operation required for normal setup is the initial Whisper model download.

## Third-party components

Universal Dictate is MIT licensed and selectively reuses permissively licensed infrastructure:

- OpenWhispr: adapted Win32 `SendInput` paste helper (MIT)
- miniaudio: Windows microphone capture (MIT-0/public-domain dual license)
- whisper.cpp: local speech recognition runtime (MIT)

See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) and `third_party/` for pinned versions and license notices.

## License

MIT. See [LICENSE](LICENSE).
