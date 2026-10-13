# Universal Dictate — development guidance

Universal Dictate is a Windows-local VS Code speech-to-text extension. It runs in
the VS Code UI extension host, including when the workspace is in Remote - WSL.
It uses a locally downloaded Whisper base model and native Windows helpers.

## Functional contracts

- Transcribe locally. Never automatically submit dictated text, send speech or
  transcripts to an external service, or log private speech/transcripts.
- Preserve one final transcription of the complete accepted recording and at most
  one automatic insertion into the deliberately focused target. Handle Stop,
  Cancel and disposal without double insertion or stale preview results.
- Automatic Unicode insertion is independent of the clipboard. With **Overwrite
  clipboard Off**, do not read or write the clipboard. Explicit Copy Last
  Transcript and the enabled overwrite setting are separate opt-in operations.
- Preview is optional (Off by default). Final Whisper inference has its own warm
  worker. Preview uses a separately owned worker with bounded resources and must
  not delay final transcription through a shared inference queue.
- The native overlay controls are **Insert** and **Discard**. Do not expose a
  Pause/Resume button, command or shortcut. Keep the low-level audio-admission
  lifecycle coverage without adding a public Pause control.
- Enhanced overlay modes are Waveform / Oscillogram, Log-Frequency Power
  Spectrogram and Circular Spectrum. The circular panel stays square. Respect
  five palettes and independent overlay size, history and live-preview settings.
- Preserve raw recorded PCM, established waveform amplitude/history behavior,
  bounded visualization buffers, status-bar behavior and Windows DPI handling.
  No FFT, allocation or blocking work should enter the microphone callback.
- Retain source and binary attribution for Whisper, whisper.cpp, SDL2, miniaudio
  and the Windows input-helper's OpenWhispr lineage.

## Working practices

Read `README.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`,
`docs/DEPENDENCIES.md` and `THIRD_PARTY_NOTICES.md` as relevant to a change.
Treat the current checked-out source, tests and GitHub workflows as authoritative
for actual commands and defaults.

Before changing native helpers, model/runtime pins, input behavior or clipboard
semantics, assess platform risks and ask for approval where required. Keep
transcripts and microphone audio out of diagnostics. Avoid unnecessary third-party
dependencies, unrelated refactors and changes to user preferences.

Run `npm ci --no-audit --no-fund`, `npm run check` and `npm run compile` for
TypeScript changes. Run the affected Node tests; the full suite is
`node --unhandled-rejections=strict --test test/*.test.cjs test/visualizations/*.test.cjs`.
Native integration and distributable VSIX checks run on Windows through the
GitHub Actions package workflow. A successful TypeScript compile alone is not a
complete Windows packaging or clipboard/input validation.

Present implementation findings and relevant test outcomes. Suggest a Conventional
Commits message plus separate copyable staging and commit commands; do not
commit, merge, tag, publish or install on the user's behalf without approval.
Do not require repetitive manual VSIX installations when automated tests and
production-renderer checks can cover the work.
