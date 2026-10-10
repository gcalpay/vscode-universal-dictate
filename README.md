# VS Code Universal Dictate

**Local, offline dictation for VS Code on Windows, including Remote - WSL. Dictate into editors and agent/chat prompts such as Codex, then review the transcript before sending. 99 Whisper languages.**

**Open source · MIT · [GitHub](https://github.com/gcalpay/vscode-universal-dictate)**

![Universal Dictate status-bar controls](media/status-bar-controls.webp)

*This branch describes the unpublished 1.2.0 integrated review candidate. The settings table below includes all eight current settings.*



Universal Dictate transcribes locally with the multilingual Whisper `base` model through `whisper.cpp`, including automatic punctuation, and sends the completed transcript as Unicode text to the input that owns keyboard focus at insertion time. It works in VS Code editors and agent/chat prompts and can also insert into compatible text fields in other Windows applications while Universal Dictate is running. **It never submits or sends dictated text automatically.**

**Other Windows applications:** Start dictation from Universal Dictate, then focus a compatible text field in another app. The final text is inserted there while VS Code remains running. The overlay controls work there too; keyboard shortcuts are local to VS Code, not system-wide.

Available from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gcalpay.vscode-universal-dictate).

## Settings

Open the settings gear next to **Dictate**, or find **Universal Dictate** in VS Code Settings.

| Setting | What it does | Default |
| --- | --- | --- |
| **Language** | Choose the language you intend to speak, or Auto-detect. All 99 Whisper languages are available. | **English** |
| **Audio visualization** | Choose Enhanced overlay, Both (overlay and status-bar waveform), Status bar only, or Off. | **Enhanced overlay** |
| **Enhanced Overlay Visualization** | Choose Waveform / Oscillogram, Log-Frequency Power Spectrogram or Circular Spectrum. Affects the enhanced overlay only. | **Waveform / Oscillogram** |
| **Colors** | Blue, Green (restrained emerald), Dark (graphite/silver), Amber, or Slate. Colors affect visualizations, not microphone gain or controls. | **Blue** |
| **Overlay size** | Choose Small, Medium or Large. | **Medium** |
| **Overlay history** | Show the latest 1, 3, 5, 10 or 20 seconds of accepted audio in Waveform or a scrolling spectrogram. Circular Spectrum shows the latest frame instead. This does not limit recording length. | **10 seconds** |
| **Overwrite clipboard** | Also copy the final transcript to the clipboard, replacing its previous contents. Automatic insertion still uses direct text input. | **Off** |
| **Live preview** | Show provisional text while speaking. Requires Enhanced overlay or Both. | **Off** |

Change settings before starting a recording. Changes made during a recording apply to the next one. Saved choices take precedence over the defaults. Medium is the default overlay size. With Live preview Off, the overlay is shorter; enabling preview reserves room for readable text without narrowing the waveform.

### Enhanced overlay visualizations (unreleased)

**Audio visualization** controls *where* feedback appears. **Enhanced Overlay Visualization** controls *what the native overlay draws*. The status-bar waveform is independent. Selecting a renderer neither enables a disabled overlay nor changes the current recording; the preference is retained for the next session using Enhanced overlay or Both.

**Waveform / Oscillogram** preserves the working 1.1.2 amplitude mapping and immutable history; its default ink is now blue. It performs no spectral analysis. **Log-Frequency Power Spectrogram** displays FFT power over time with lower frequencies at the bottom. Blue keeps the original spectrogram palette. **Circular Spectrum** displays the latest FFT bands clockwise, low to high, in its own compact square panel. It is a spectrum, not a scrolling spectrogram or musical chromagram.

Small, Medium and Large apply to each layout. Circular panels stay square with preview Off or On; the latter reserves readable text beneath the circle. Rectangular modes retain their waveform/preview viewport, with the unused Pause-button column removed. Controls are Insert and Discard only.

All five palettes use a fixed digital scale, not calibrated loudness or automatic gain. Changing Colors does not recolor an active recording or change audio. Removed Linear/Constant-Q saved preferences fall back to Log-Frequency Power Spectrogram without rewriting preferences. No new model or runtime dependencies are introduced.

### Live preview

When enabled, the overlay shows recent provisional words, which may be revised as recognition continues. It is not a complete transcript history. After Stop, Universal Dictate transcribes the **complete recording** and inserts the final transcript once.

Preview and final transcription both run locally. In this review candidate, preview uses a separate on-demand worker (up to two threads) so final transcription does not share its inference queue. Stop or Discard retires the preview worker; the final worker stays warm. The extra model instance uses additional memory while preview is active: a controlled Windows benchmark observed about 256 MiB of preview-process working set, which is not a measurement of additional unique physical RAM. Worker startup and the thread cap can delay the first preview. Turning preview Off avoids the second worker; Status bar only and Off visualization do not run invisible previews. See [M1 implementation and measurement limits](docs/M1_FINAL_INFERENCE_PRIORITY.md).

## Controls

| Control | Action |
| --- | --- |
| Status bar: **Dictate** | Start recording |
| Status bar: **Stop** | Stop, transcribe locally and insert |
| **Ctrl+Alt+D** | Start or stop dictation |
| **Esc** | Cancel the current recording, without inserting text |
| Overlay: **Insert** | Stop, transcribe and insert |
| Overlay: **Discard** | Cancel and discard |

The overlay has two controls: **✓ Insert** (green) and **✕ Discard** (red), with descriptive hover labels. It does not take keyboard focus when clicked. Review the inserted text before sending it. Pause/Resume and its keyboard command have been removed: finish with Insert, then start a new recording when ready.

## Languages

English is selected by default. Choose another language or **Auto-detect** from the settings gear or **Universal Dictate: Select Language** in the Command Palette (`Ctrl+Shift+P`). Recognition quality varies by language and audio conditions.

Select the language you intend to speak, or use Auto-detect. The language setting controls recognition; Universal Dictate does not provide a supported translation mode. Selecting a language different from the spoken language can produce unreliable output.

## Clipboard and transcript recovery

Automatic insertion does not require the clipboard. With **Overwrite clipboard Off**, automatic dictation leaves the clipboard untouched. With it **On**, the exact final transcript is also copied before insertion, replacing the previous clipboard contents. There is no later restoration, and a subsequent copy from another application takes precedence.

Use **Universal Dictate: Copy Last Transcript** from the Command Palette to copy the latest successful final transcript again. This explicit command replaces the clipboard regardless of the automatic setting. The retained transcript stays in this window's extension memory only; it is lost when the extension reloads or VS Code restarts.

With no usable focused input, insertion may do nothing. The clipboard option provides a manual-paste backup. Provisional preview text is never inserted or copied. Direct insertion converts line breaks and tabs to spaces to avoid triggering input commands; an explicit or enabled clipboard copy retains the original final text.

## Local processing and privacy

Universal Dictate uses the Windows default microphone. On first use, it downloads the multilingual Whisper `base` model (about 148 MB), verifies the download's SHA-256 checksum and stores it locally. **After model setup, normal dictation and live preview can run offline.** No API key or cloud account is required.

Speech recognition runs on the CPU through the bundled `whisper.cpp` runtime. Its workers communicate over the computer's local loopback interface, not a remote transcription service. Audio and transcripts are not uploaded for recognition. The complete recording is a temporary local WAV file that is cleaned up after processing; preview uses a bounded in-memory audio buffer. Timing diagnostics contain neither audio nor transcript text.

For **Remote - WSL**, the extension runs in the local Windows VS Code host while your workspace stays in WSL. It is not a native Linux extension and does not need a separate WSL-side microphone setup.

## Known insertion-target limitation

Clicking VS Code's status-bar Dictate or Stop control can move focus away from inputs such as the Codex composer, so insertion may miss the intended caret. Use the keyboard shortcut or overlay controls where appropriate, or enable **Overwrite clipboard** to retain a manual-paste backup. [Issue 38](https://github.com/gcalpay/vscode-universal-dictate/issues/38) tracks this limitation; clipboard recovery does not fix focus preservation.

## Attribution

Universal Dictate uses OpenAI Whisper, whisper.cpp and miniaudio, and retains attribution for the historical OpenWhispr input-helper lineage. See [third-party notices](THIRD_PARTY_NOTICES.md) and [dependency details](docs/DEPENDENCIES.md) for licenses and provenance.

## Support and release notes

Report problems or request features through [GitHub Issues](https://github.com/gcalpay/vscode-universal-dictate/issues). See [support information](SUPPORT.md) for useful diagnostic details and the [Changelog](CHANGELOG.md) for version history.

If timing evidence is needed, **Universal Dictate: Show Latency Report** opens the latest 100 completed measurements in one document. Records stay in the current extension-host session and are lost on reload unless that document is saved. Normal use of one integrated candidate is the acceptance workflow; no prescribed sentence, repetition count or per-recording screenshot is required. The [M5 review record](docs/M5_REVIEW_CLOSEOUT.md) separates the completed automated comparisons from analyzer review and user acceptance.

## License

MIT licensed. See [LICENSE](LICENSE).
