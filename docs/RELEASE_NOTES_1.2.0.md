# Universal Dictate 1.2.0

Universal Dictate provides local, offline multilingual speech-to-text for VS Code
on Windows, including Remote - WSL. Dictate into editors and compatible focused
text inputs; the extension does not submit messages automatically.

## New in 1.2.0

- Three enhanced-overlay visualizations: **Waveform / Oscillogram**,
  **Log-Frequency Power Spectrogram** and **Circular Spectrum**.
- Five optional palettes: **Blue**, **Green**, **Dark**, **Amber** and **Slate**.
- Square circular view with Small, Medium and Large layout support; optional
  live transcript preview remains available.
- Separate on-demand preview inference worker and a local timing report.
- Live Preview recovers after one transient timeout; a second consecutive timeout
  stops preview without replacing the complete final transcription.
- Native overlay now has **Insert** and **Discard** controls only.

## Behavior changes

The earlier **Pause/Resume** control and keyboard shortcut are no longer exposed.
Previously saved Linear-Frequency or Constant-Q visualization preferences
use the supported Log-Frequency Power Spectrogram mode. Existing saved language,
clipboard and overlay-size preferences remain respected.

## Privacy and compatibility

The first run downloads and verifies the local Whisper base model; normal
dictation works offline afterward. Transcripts and recordings are not uploaded
for recognition. Clipboard access is optional and Off by default. The extension
is Windows-only, with Remote - WSL supported through the local VS Code UI host.

Known limitation: Clicking VS Code's native status-bar item may move focus
away from some chat inputs. Use **Ctrl+Alt+D** or the non-activating overlay
controls when insertion-target focus matters.

See [README](../README.md), [Changelog](../CHANGELOG.md) and
[third-party notices](../THIRD_PARTY_NOTICES.md).

MIT licensed. No new inference model or runtime dependencies are introduced.

## Circular Spectrum

The square display has tighter spacing and longer rays for moderate signal levels.
This is a fixed visual response, not microphone gain or automatic normalization.
Waveform and Log-Frequency Power Spectrogram behavior remains unchanged.
