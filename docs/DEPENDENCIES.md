# Dependency strategy

Universal Dictate keeps product-specific behavior in this repository and uses mature permissively licensed libraries/runtimes only where they provide substantial value.

## Windows text injection

The focused-input paste helper is an original Universal Dictate C++ implementation in `native/windows-fast-paste.cpp`.

- Language: C++20
- External source dependency: none
- Windows API: documented Win32 `SendInput` / keyboard state APIs
- Role: temporarily release shortcut modifiers, synthesize Ctrl+V, then restore modifier state

The helper never sends Enter and does not depend on any other dictation application.

## Microphone capture

**Dependency:** miniaudio

- Upstream: `mackron/miniaudio`
- Pinned version: `0.11.25`
- License choice: MIT No Attribution (MIT-0)
- Retained upstream license text: `third_party/miniaudio-LICENSE.txt`
- Role: capture the Windows default microphone through WASAPI and write 16 kHz mono PCM16 WAV while exposing input levels.

Universal Dictate compiles the pinned miniaudio header through the C++ translation unit `native/miniaudio-impl.cpp`. End users do not install miniaudio or any audio package separately.

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

## Universal Dictate code

The project owns the code that defines the product:

- VS Code extension lifecycle and Remote - WSL behavior
- dictation state machine
- Windows focused-input paste helper
- Windows recorder process and native IPC protocol
- target/focus preservation
- terminal safety policy
- recording UI and input-level visualization
- model management UX
- transcription orchestration
- clipboard preservation and insertion behavior
- diagnostics, testing and Marketplace packaging

## Policy

Do not copy application source code from other projects into this repository. Prefer documented platform APIs for small native functionality and pinned upstream dependencies for substantial external libraries/runtimes. For every redistributed third-party binary or library, record its source, version/revision and license before release.
