# VS Code Universal Dictate

**Local, offline dictation for VS Code on Windows. Dictate into editors and agent/chat prompts such as Codex, then review the transcript before sending. 99 Whisper languages. Remote-WSL.**

**Open source · MIT · [GitHub](https://github.com/gcalpay/vscode-universal-dictate)**

![Universal Dictate status-bar controls](media/status-bar-controls.webp)

![Universal Dictate enhanced recording overlay](media/enhanced-overlay.webp)

![Universal Dictate settings menu](media/settings-menu.webp)

Universal Dictate transcribes locally with the multilingual Whisper `base` model through `whisper.cpp`, including automatic punctuation, and sends the completed transcript as Unicode text to the Windows input that owns keyboard focus at insertion time. It works in VS Code editors and agent/chat prompts and can also insert into compatible text fields in other Windows applications while Universal Dictate is running. **It never submits or sends dictated text automatically.**

## Installation

### VS Code Marketplace

In VS Code, open **Extensions** (`Ctrl+Shift+X`), search for **Universal Dictate** and choose **Install**.

### VSIX

For manual/offline installation, download the latest Windows x64 `.vsix` from [GitHub Releases](https://github.com/gcalpay/vscode-universal-dictate/releases/latest), then install it directly:

```text
Ctrl+Shift+P
Extensions: Install from VSIX...
```

Do not install a separate copy inside WSL. Universal Dictate declares `extensionKind: ["ui"]` so it runs in the local Windows extension host while a workspace may remain connected through Remote - WSL.

On first dictation, Universal Dictate downloads the multilingual Whisper `base` model (about 148 MB), verifies its SHA-256 checksum and stores it in VS Code's local extension storage. After that, normal dictation can run offline.

For lower post-recording latency, Universal Dictate starts a local `whisper-server` worker when recording begins and keeps the model loaded for later dictations. Model initialization overlaps with the time you are speaking. The worker listens only on `127.0.0.1` behind a randomized per-session request path. If it cannot start or exits unexpectedly, Universal Dictate automatically falls back to the one-shot `whisper-cli` path. The current Windows build remains CPU-only.

## Current controls

Universal Dictate shows an always-visible **Dictate** action and settings gear in VS Code's right-side status-bar utility group.

```text
Status bar: Dictate             Start recording
Status bar: Stop                Stop, transcribe locally and insert
Ctrl+Alt+D                      Start or stop dictation
Esc                             Cancel the current recording
Overlay: Insert                 Stop, transcribe and insert
Overlay: Discard                Cancel and discard
```

The default **Enhanced overlay** is a native Windows, non-activating recording panel with a sensitive signed PCM signal display. Captured waveform samples stay visually stable as they move through the bounded history.

The audio-visualization choices are:

- **Enhanced overlay** — default; native PCM waveform overlay plus static recording feedback in the status bar.
- **Both** — Enhanced overlay plus the animated status-bar signal history.
- **Status bar only** — animated status-bar signal without the native overlay.
- **Off** — no waveform visualization; static recording feedback remains available.

The Enhanced waveform time span is configurable, so you can choose how much recent audio is visible across the waveform. This only changes the visualization and does **not** limit dictation length.

Visualization and waveform time-span changes apply from the next dictation session. Existing persisted legacy `overlay` settings are treated as Enhanced overlay for compatibility.

## Clipboard behavior

The fifth settings-gear entry is **Overwrite clipboard**, default **Off**.
Click it to toggle; a change applies to the next dictation session.

| Setting | Automatic insertion | Clipboard |
| --- | --- | --- |
| **Off (default)** | Send text directly to the currently focused input | Not read, written, temporarily replaced, or restored |
| **On** | Still send text directly | Also copy the exact transcript before the insertion attempt, replacing existing clipboard contents; never restore old contents |

No clipboard-format check can block normal dictation. The old snapshot/restore
transaction has been removed. With no usable focused input, automatic insertion
can do nothing. Off creates no clipboard backup; On leaves the copied transcript
available for manual paste, unless a later user/application copy replaces it.
If the optional copy itself fails, direct input is still attempted and a warning
is reported. There is no automatic retry of uncertain or partial insertion.

**Universal Dictate: Copy Last Transcript** remains an optional Command Palette
command. It deliberately overwrites the clipboard regardless of the automatic
clipboard setting. The transcript is stored only in this window's extension
memory until replaced by a successful transcription or lost on reload/restart.
The old Last transcript submenu and the Insert/Clear commands are removed.

Direct input does not synthesize Enter or submit messages. Whisper normalizes
whitespace; as a further safeguard, the native input helper maps control
characters such as line breaks and tabs to spaces. The optional clipboard copy
retains the exact original transcript. Input-event submission is not confirmation
that an opaque extension composer received it. The corrected M2 candidate has
positive normal-dictation feedback, and the user confirmed **Overwrite clipboard**
is working as intended. Static-analysis review and formal merge approval remain
open. See the [M2 checkpoint](docs/M2_CLIPBOARD_MODE_FIX.md) for exact evidence
and remaining gates. This is not a new Marketplace release.

## Known insertion-target limitation

The genuine VS Code status-bar `Dictate` / `Stop` item can move keyboard focus before Universal Dictate receives its command. This matters for opaque extension-owned inputs such as the Codex composer: after a mouse click on the status item, the eventual direct-input attempt can target the wrong control or no longer have the intended caret/selection. [Issue #38](https://github.com/gcalpay/vscode-universal-dictate/issues/38) tracks this separately from transcription quality, overlay sizing and recovery work.

Keyboard controls and the native recording overlay remain available, but they do not turn the unresolved mouse/status-bar path into a solved focus-preservation feature. Universal Dictate never auto-submits text.

## Languages

The default is **Auto-detect**. The bundled multilingual Whisper `base` model supports the original **99 Whisper languages**. Recognition quality varies by language and audio conditions.

Language selection is available from the settings gear or from the Command Palette:

```text
Universal Dictate: Select Language
```

**Note:** Select the language you intend to speak, or use Auto-detect. If you select a different language from the one being spoken, Whisper can translate the speech into the selected language. This translation is performed entirely offline by the local multilingual Whisper model; no audio or text is sent to an online translation service.

The extension uses the Windows default microphone, records 16 kHz mono PCM16 WAV through miniaudio and transcribes it locally with a bundled, pinned `whisper.cpp` runtime.

## Privacy

Normal dictation is local. Microphone audio is written to a temporary local WAV file, sent only to the bundled `whisper.cpp` worker over the local loopback interface, transcribed locally and deleted after transcription. Audio and transcripts are not sent to a remote transcription service.

The only network operation required for normal setup is the initial Whisper model download.

## Implementation and attribution

- TypeScript: VS Code integration, commands, state, settings, model management and transcription orchestration.
- C++20: native Windows microphone process, non-activating recording overlay and clipboard-free Unicode input helper.
- OpenAI Whisper: MIT-licensed speech-recognition model and model weights.
- whisper.cpp: MIT-licensed local Whisper inference runtime.
- miniaudio: permissively licensed microphone/audio backend.
- OpenWhispr: MIT-licensed historical source lineage for the focused-input Windows paste helper; the historical clipboard-paste helper was retired; its attribution is retained for that source history.

See [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and `third_party/` for pinned versions, provenance and license notices.

## Support

Use [GitHub Issues](https://github.com/gcalpay/vscode-universal-dictate/issues) for bugs, compatibility problems and feature requests. See [`SUPPORT.md`](SUPPORT.md) for useful diagnostic information.

## License

Universal Dictate is MIT licensed. See [LICENSE](LICENSE).
