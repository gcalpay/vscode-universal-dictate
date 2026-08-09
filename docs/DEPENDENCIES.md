# Dependency strategy

Universal Dictate should reuse mature permissively licensed infrastructure while keeping product-specific behavior in this repository.

## Windows text injection

**Source:** OpenWhispr `resources/windows-fast-paste.c`

- License: MIT
- Upstream revision used for the initial adaptation: `1866ecf6641b9fa4851f19c7838cb18f3662def7`
- Local adaptation: `native/windows-fast-paste.c`
- Retained license: `third_party/OpenWhispr-LICENSE.txt`

We reuse only the low-level Win32 `SendInput` strategy, not the OpenWhispr application architecture.

## Microphone capture

**Planned dependency:** miniaudio

- Upstream: `mackron/miniaudio`
- Initial target version: `0.11.25`
- License choice: MIT No Attribution (MIT-0)
- Role: capture the Windows default microphone through WASAPI, resample to the format expected by the ASR pipeline, write WAV/PCM data and expose input levels.

miniaudio is intended to be compiled statically into Universal Dictate's Windows helper. End users should not install miniaudio or any audio package separately.

## Speech recognition

**Planned dependency:** whisper.cpp

- Upstream: `ggml-org/whisper.cpp`
- License: MIT
- Role: fully local Whisper inference on Windows.

The runtime will be pinned to a reviewed upstream release or commit. Release builds should contain the required Windows runtime binaries; users should not need Python, PyTorch, Conda, FFmpeg, CMake or WSL-side packages.

Whisper model files are downloaded separately on first use and stored in VS Code's local extension storage. Downloads must be checksum-verified. Once a model is installed, normal dictation must work with networking disabled.

## What remains ours

Universal Dictate owns the parts that define the product:

- VS Code extension lifecycle and Remote - WSL behavior
- dictation state machine
- target/focus preservation
- terminal safety policy
- recording UI and input-level visualization
- model management UX
- transcription orchestration
- clipboard preservation and insertion behavior
- diagnostics, testing and Marketplace packaging

## Policy

Do not copy whole third-party repositories into this repository. Prefer a pinned build dependency or a narrowly adapted source file. For every redistributed third-party source or binary, record its source, version/revision and license before release.
