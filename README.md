# VS Code Universal Dictate

**Local, offline, multilingual dictation for VS Code on Windows. Supports 99 Whisper languages, including Remote - WSL and extension-owned text inputs such as the OpenAI Codex composer.**

Universal Dictate is an open-source VS Code extension for speech-to-text without API keys or cloud transcription. It runs the multilingual OpenAI Whisper `base` model locally through `whisper.cpp`, automatically detects the spoken language by default and can be fixed to any of the model's 99 supported languages.

> **Status:** early working MVP. Focused-input insertion has been validated against the OpenAI Codex composer under Remote - WSL. The current build includes Windows microphone capture, a clickable VS Code status-bar microphone button, a non-activating recording overlay and local Whisper transcription.

## Product goals

- Local speech-to-text with no API key or cloud transcription.
- Multilingual dictation with automatic language detection and explicit selection from 99 Whisper languages.
- Windows 10/11 as the supported desktop platform.
- Works from a Windows VS Code client while the workspace is connected through Remote - WSL.
- Inserts dictated text into the text control that had focus, including extension-owned composers where practical.
- Never submits dictated text automatically.
- Terminal dictation disabled by default.
- No Python, Conda, FFmpeg or WSL-side runtime dependency for end users.
- Live microphone visualization with confirm and cancel controls that do not activate another window or steal the target caret.

## Current controls

Universal Dictate shows an always-visible **$(mic) Dictate** action in the VS Code status bar while idle. Click it to start recording, or use the keyboard shortcut:

```text
Status bar: $(mic) Dictate   Start recording
Ctrl+Alt+D                   Start recording
Ctrl+Alt+D                   Stop, transcribe locally and insert
Esc                          Cancel the current recording
```

While recording, Universal Dictate shows a small native Windows overlay with a centered, mirrored rolling microphone-energy field rather than a conventional ascending volume meter. Recent signal energy flows from left to right as layered traces and filaments, giving the display a waveform/spectral-field appearance while remaining lightweight and responsive.

```text
✓   confirm, transcribe and insert
×   cancel and discard
```

The VS Code status-bar item also becomes a rolling nine-sample signal history during recording instead of a single level character. The native overlay uses the Win32 `WS_EX_NOACTIVATE` behavior so clicking ✓ or × does not intentionally move keyboard focus away from the VS Code editor/composer where the transcript will be inserted.

## Languages

The default is **Auto-detect**. The bundled multilingual Whisper `base` model supports the original **99 Whisper languages**. Recognition quality varies by language and audio conditions.

Language selection is available from the Command Palette:

```text
Universal Dictate: Select Language
```

You can leave language detection automatic or force any one of the 99 supported languages.

On first use Universal Dictate downloads the multilingual Whisper `base` model (about 148 MB), verifies its SHA-256 checksum and stores it in VS Code's local extension storage. After that, dictation works offline.

The extension uses the Windows default microphone, records 16 kHz mono PCM16 WAV through miniaudio and transcribes it locally with a bundled, pinned `whisper.cpp` runtime.

## Recognition stack and attribution

Universal Dictate does not implement the speech-recognition neural network itself.

- **OpenAI Whisper** provides the original Whisper model architecture and model weights. OpenAI releases both the Whisper code and model weights under the MIT License.
- **whisper.cpp** is the independent C/C++ implementation used to run Whisper locally in Universal Dictate. It is maintained by the ggml project and is MIT licensed.
- Universal Dictate uses a converted `ggml-base.bin` representation of OpenAI's multilingual Whisper `base` model for local inference.

The relevant upstream license notices are retained in `third_party/`.

## Implementation

- TypeScript: VS Code integration, commands, state, UI, language selection, model management and transcription orchestration.
- C++20: Universal Dictate's native Windows microphone process, non-activating recording overlay and focused-input paste helper.
- miniaudio: permissively licensed microphone/audio backend.
- OpenAI Whisper: MIT-licensed speech-recognition model and weights.
- whisper.cpp: MIT-licensed local Whisper inference runtime.

Universal Dictate's native Windows helpers are implemented in this repository; they do not depend on source code from another dictation application.

## Privacy

Normal dictation is local. Microphone audio is written to a temporary local WAV file, transcribed locally and deleted after transcription. Audio and transcripts are not sent to a transcription service.

The only network operation required for normal setup is the initial Whisper model download.

## Third-party components

Universal Dictate itself is MIT licensed and uses permissively licensed infrastructure:

- OpenAI Whisper: speech-recognition model and model weights (MIT)
- whisper.cpp: local Whisper inference runtime (MIT)
- miniaudio: Windows microphone capture (MIT-0/public-domain dual license)

See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) and `third_party/` for pinned versions, provenance and license notices.

## License

Universal Dictate is MIT licensed. See [LICENSE](LICENSE).
