# Architecture

Universal Dictate runs in the local Windows **VS Code UI extension host**, even
when the open workspace is Remote - WSL. Recording, inference, overlay and text
insertion operate on Windows. No Python or microphone service runs in WSL.

## Components

| Component | Responsibility |
| --- | --- |
| TypeScript extension | Commands, eight settings, recording sessions, model setup, worker ownership, clipboard consent, transcript recovery and insertion coordination |
| Native C++ recorder | WASAPI/miniaudio capture, 16 kHz mono PCM16 WAV, bounded preview audio and visualization snapshots |
| Native overlay | Non-activating Insert/Discard controls, audio visualization, optional provisional text and DPI-aware layout |
| Final recognition worker | Warm local Whisper server for complete recorded audio, with a final-only CLI fallback |
| Preview recognition worker | Separate, lazily started local server, bounded to two inference threads and retired on Stop/Discard/disposal |
| Native text-input helper | Focus-checked Win32 Unicode `SendInput`, without implicit clipboard replacement |

The multilingual Whisper `base` model is checksum-verified at first download and
reused offline. Inference uses the pinned `whisper.cpp` runtime over local loopback.
No dictated audio is submitted to a remote transcription service. Recording WAV
files are temporary and removed after processing.

## Session and insertion boundaries

The active recording has one owner. Only admitted PCM is written to the final WAV;
preview and visualizers cannot alter it. Stop retires preview, transcribes the
complete recording with the final worker, and attempts one direct Unicode insertion.
Cancel/Discard releases the session without insertion. The native recorder still
has internal audio-admission and cancellation machinery used by lifecycle tests;
there is no public Pause/Resume control.

Preview text is provisional, does not become the authoritative transcript, and is
never inserted or copied. The preview worker is not created when preview is Off or
when no enhanced overlay is effective. If termination of the preview worker cannot
be confirmed, further previews are disabled rather than accumulating workers.
The final worker remains available.

The extension cannot intercept the mouse-down event owned by VS Code's genuine
status-bar element. Clicking it may move focus from an opaque prompt composer.
Keyboard shortcuts and the native non-activating overlay provide alternative
paths, but neither establishes universal focused-input compatibility.

## Configurable presentation

The eight `universalDictate.*` settings are independent, with changes applied at
the next recording:

| Setting | Default | Purpose |
| --- | --- | --- |
| `language` | `en` | Recognition language or Auto-detect |
| `visualization` | `enhancedOverlay` | Enhanced overlay, Both, Status bar only or Off |
| `enhancedOverlayVisualization` | `waveform` | Waveform / Oscillogram, Log-Frequency Power Spectrogram or Circular Spectrum |
| `overlayColorTheme` | `blue` | Blue, Green, Dark, Amber or Slate |
| `overlaySize` | `medium` | Small, Medium or Large |
| `waveformTimeSpanSeconds` | `10` | 1, 3, 5, 10 or 20 seconds; not a recording-duration limit |
| `overwriteClipboard` | `false` | Opt-in final transcript copy |
| `livePreview` | `false` | Opt-in local provisional text |

Waveform uses the established raw amplitude mapping and immutable scrolling
history. The log-frequency mode uses FFT-derived power over time. Circular
Spectrum shows current FFT bands in a square panel rather than scrolling history.
Selecting a renderer does not enable an overlay or change input gain. Legacy saved
visualizer preferences map to the supported log-frequency mode without resetting
the stored preference.

The optional visual analysis receives bounded copies of accepted PCM. Its queue
has a 32,768-frame capacity, and a paint update processes at most 8192 frames.
When overloaded, visual-only data may be dropped; recorded WAV and preview PCM
must remain unchanged. No FFT, heap allocation, blocking wait or extra disk I/O
belongs in the capture callback. Drawing uses Windows GDI/GDI+ and DirectWrite.

## Privacy and diagnostics

With clipboard overwrite Off, automatic dictation never accesses the clipboard.
Copy Last Transcript is an explicit user command. The latest successful final
transcript is held in the extension-host session only. Timing diagnostics retain
up to 100 completed records without storing audio or transcript text. Helper
completion timing is not a measurement of the target control's rendered paint.

See [Testing](TESTING.md), [Dependencies](DEPENDENCIES.md) and
[Third-party notices](../THIRD_PARTY_NOTICES.md).
