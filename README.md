# VS Code Universal Dictate

**Local, offline, multilingual dictation for VS Code on Windows. Supports 99 Whisper languages, Remote - WSL and focused-input dictation into agent/chat extensions such as the OpenAI Codex composer.**

Universal Dictate is an open-source VS Code extension for speech-to-text without API keys or cloud transcription. It runs the multilingual OpenAI Whisper `base` model locally through `whisper.cpp`, automatically detects the spoken language by default and can be fixed to any of the model's 99 supported languages. Because text is inserted through the focused Windows input control rather than a private extension API, it can also be used with extension-owned agent/chat composers such as OpenAI Codex where normal VS Code text insertion APIs are not available.

> **Version:** 0.1.0 for Windows x64. End-to-end dictation and focused-input insertion have been validated against the OpenAI Codex composer under Remote - WSL on Windows. The extension includes Windows microphone capture, an always-available VS Code status-bar microphone button, a non-activating recording overlay and local Whisper transcription.

## Installation

### VS Code Marketplace

Public releases are distributed as a Windows x64 VS Code extension. In VS Code, open **Extensions** (`Ctrl+Shift+X`), search for **Universal Dictate** and choose **Install**.

### VSIX

A packaged release can also be installed directly:

```text
Ctrl+Shift+P
Extensions: Install from VSIX...
```

Select the `universal-dictate-win32-x64.vsix` file and reload VS Code if prompted.

Do not install a separate copy inside WSL. Universal Dictate declares `extensionKind: ["ui"]` so it runs in the local Windows extension host while a workspace may remain connected through Remote - WSL.

On first dictation, Universal Dictate downloads the multilingual Whisper `base` model (about 148 MB), verifies its SHA-256 checksum and stores it in VS Code's local extension storage. After that, normal dictation can run offline.

## Product goals

- Local speech-to-text with no API key or cloud transcription.
- Multilingual dictation with automatic language detection and explicit selection from 99 Whisper languages.
- Windows 10/11 as the supported desktop platform.
- Works from a Windows VS Code client while the workspace is connected through Remote - WSL.
- Inserts dictated text into the text control that had focus, including extension-owned agent/chat composers such as OpenAI Codex where practical.
- Never submits dictated text automatically.
- Terminal dictation disabled by default.
- No Python, Conda, FFmpeg or WSL-side runtime dependency for end users.
- Live microphone visualization with confirm and cancel controls that do not activate another window or steal the target caret.

## Current controls

Universal Dictate activates after VS Code starts and shows an always-visible **$(mic) Dictate** action in the status bar while idle. Click it to start recording, or use the keyboard shortcut:

```text
Status bar: $(mic) Dictate   Start recording
Ctrl+Alt+D                   Start recording
Ctrl+Alt+D                   Stop, transcribe locally and insert
Esc                          Cancel the current recording
```

While recording, Universal Dictate shows a native Windows overlay with a large, centered, mirrored rolling microphone-energy field. The visualization uses adaptive display normalization so ordinary speech produces substantial vertical motion, then renders a filled central ribbon, layered contour lines and fine vertical filaments rather than a conventional ascending volume meter.

```text
✓   confirm, transcribe and insert
×   cancel and discard
```

The VS Code status-bar item also becomes a rolling signal history during recording. The native overlay uses the Win32 `WS_EX_NOACTIVATE` behavior so clicking ✓ or × does not intentionally move keyboard focus away from the VS Code editor/composer where the transcript will be inserted.

## Languages

The default is **Auto-detect**. The bundled multilingual Whisper `base` model supports the original **99 Whisper languages**. Recognition quality varies by language and audio conditions.

Language selection is available from the Command Palette:

```text
Universal Dictate: Select Language
```

You can leave language detection automatic or force any one of the 99 supported languages.

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
- OpenWhispr: MIT-licensed historical source lineage for the Windows focused-input paste helper. The current helper has been substantially rewritten in C++20 and reduced to Universal Dictate's Ctrl+V-only use case; the upstream MIT notice is retained.

The recorder, overlay and VS Code integration are maintained as Universal Dictate code. Provenance for the focused-input paste helper is documented explicitly in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md).

## Privacy

Normal dictation is local. Microphone audio is written to a temporary local WAV file, transcribed locally and deleted after transcription. Audio and transcripts are not sent to a transcription service.

The only network operation required for normal setup is the initial Whisper model download.

## Support

Use GitHub Issues for bugs, compatibility problems and feature requests. See [`SUPPORT.md`](SUPPORT.md) for the diagnostic information that is useful in a report.

## Third-party components

Universal Dictate itself is MIT licensed and uses permissively licensed infrastructure and source lineage:

- OpenAI Whisper: speech-recognition model and model weights (MIT)
- whisper.cpp: local Whisper inference runtime (MIT)
- miniaudio: Windows microphone capture (MIT-0/public-domain dual license)
- OpenWhispr: historical source lineage for the Win32 focused-input paste helper (MIT)

See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and `third_party/` for pinned versions, provenance and license notices.

## License

Universal Dictate is MIT licensed. See [LICENSE](LICENSE).
