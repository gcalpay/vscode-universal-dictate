# Dependency strategy

Universal Dictate reuses mature permissively licensed infrastructure while keeping product-specific behavior in this repository.

## Windows text injection

**Source:** OpenWhispr `resources/windows-fast-paste.c`

- License: MIT
- Upstream revision used for the initial adaptation: `1866ecf6641b9fa4851f19c7838cb18f3662def7`
- Local adaptation: `native/windows-fast-paste.c`
- Retained license: `third_party/OpenWhispr-LICENSE.txt`

We reuse only the low-level Win32 `SendInput` strategy, not the OpenWhispr application architecture.

## Microphone capture

**Dependency:** miniaudio

- Upstream: `mackron/miniaudio`
- Pinned version: `0.11.25`
- License choice: MIT No Attribution (MIT-0)
- Retained upstream license text: `third_party/miniaudio-LICENSE.txt`
- Role: capture the Windows default microphone through WASAPI and write 16 kHz mono PCM16 WAV while exposing input levels.

miniaudio is compiled statically into Universal Dictate's Windows recorder helper. End users do not install miniaudio or any audio package separately.

## Speech recognition runtime

**Dependency:** whisper.cpp

- Upstream: `ggml-org/whisper.cpp`
- Pinned release: `v1.9.1`
- Runtime asset: `whisper-bin-x64.zip`
- Runtime SHA-256: `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539`
- License: MIT
- Retained upstream license: `third_party/whisper.cpp-LICENSE.txt`
- Role: fully local Whisper inference on Windows.

The official x64 runtime is downloaded and checksum-verified in GitHub Actions, then bundled inside the Windows VSIX. End users do not need Python, PyTorch, Conda, FFmpeg, CMake or WSL-side packages.

## Speech model

The initial MVP uses the multilingual Whisper `base` model so English and German both work from one model.

- Filename: `ggml-base.bin`
- Source: `ggerganov/whisper.cpp` on Hugging Face
- SHA-256: `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`
- Approximate download size: 148 MB

The model is downloaded once on first use into VS Code's local extension storage and checksum-verified before it is activated. Once installed, normal dictation works with networking disabled.

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
