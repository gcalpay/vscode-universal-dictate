# Dependency strategy

Universal Dictate keeps product-specific behavior in this repository and uses mature permissively licensed libraries/runtimes where they provide substantial value.

## Windows text injection

The focused-input paste helper is maintained as a C++20 implementation in `native/windows-fast-paste.cpp`.

- Language: C++20
- Windows API: documented Win32 `SendInput` / keyboard state APIs
- Role: temporarily release shortcut modifiers, synthesize Ctrl+V, then restore modifier state
- Historical source lineage: OpenWhispr `resources/windows-fast-paste.c`
- Upstream revision used by the early Universal Dictate adaptation: `1866ecf6641b9fa4851f19c7838cb18f3662def7`
- OpenWhispr license: MIT
- Retained upstream license: `third_party/OpenWhispr-LICENSE.txt`

The current helper has been substantially rewritten in C++20 and reduced to Universal Dictate's focused Ctrl+V use case. It does not include OpenWhispr's terminal detection, copy mode or application architecture, but the MIT notice is retained because the implementation evolved from the earlier attributed helper.

The helper never sends Enter.

## Microphone capture

**Dependency:** miniaudio

- Upstream: `mackron/miniaudio`
- Pinned version: `0.11.25`
- License choice: MIT No Attribution (MIT-0)
- Retained upstream license text: `third_party/miniaudio-LICENSE.txt`
- Role: capture the Windows default microphone through WASAPI and write 16 kHz mono PCM16 WAV while exposing input levels.

Universal Dictate compiles the pinned miniaudio header through the C++ translation unit `native/miniaudio-impl.cpp`. End users do not install miniaudio or any audio package separately.

## Speech-recognition model

**Dependency:** OpenAI Whisper

- Upstream: `openai/whisper`
- Model: multilingual Whisper `base`
- Original model weights and reference implementation: OpenAI
- License: MIT
- Retained upstream license: `third_party/OpenAI-Whisper-LICENSE.txt`
- Role: speech-recognition model used by Universal Dictate.

OpenAI states that Whisper's code and model weights are released under the MIT License. The `base` model is multilingual and uses the original 99-language Whisper vocabulary.

Universal Dictate downloads a converted ggml representation of those model weights:

- Filename: `ggml-base.bin`
- Distribution source: `ggerganov/whisper.cpp` model repository on Hugging Face
- Origin: OpenAI Whisper multilingual `base` weights converted to ggml format for whisper.cpp
- SHA-256: `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`
- Approximate download size: 148 MB

The model is downloaded once on first use into VS Code's local extension storage and checksum-verified before it is activated. Once installed, normal dictation works with networking disabled.

## Speech-recognition runtime

**Dependency:** whisper.cpp

- Upstream: `ggml-org/whisper.cpp`
- Pinned release: `v1.9.1`
- Runtime asset: `whisper-bin-x64.zip`
- Runtime SHA-256: `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539`
- License: MIT
- Retained upstream license: `third_party/whisper.cpp-LICENSE.txt`
- Role: fully local C/C++ inference of OpenAI's Whisper model on Windows.

whisper.cpp is a separate implementation of Whisper, not the OpenAI Python reference package. The official x64 whisper.cpp runtime is downloaded and checksum-verified in GitHub Actions, then bundled inside the Windows VSIX. End users do not need Python, PyTorch, Conda, FFmpeg, CMake or WSL-side packages.

## Supported languages

Universal Dictate defaults to Whisper language auto-detection and exposes the 99 language tokens supported by the bundled multilingual `base` model through `Universal Dictate: Select Language`.

The authoritative list used in the extension is maintained in `src/languages.ts` and follows the original 99-language Whisper vocabulary. Recognition accuracy is not uniform across languages.

## Universal Dictate code

The project maintains the code that defines the product:

- VS Code extension lifecycle and Remote - WSL behavior
- dictation state machine
- current Windows focused-input paste helper, with the OpenWhispr lineage documented above
- Windows recorder process and native IPC protocol
- target/focus preservation
- terminal safety policy
- recording UI and input-level visualization
- language-selection UX
- model management UX
- transcription orchestration
- clipboard preservation and insertion behavior
- diagnostics, testing and Marketplace packaging

## Policy

Do not copy application source code from other projects without explicit provenance and license tracking. Prefer documented platform APIs for small native functionality and pinned upstream dependencies for substantial external libraries/runtimes. For every redistributed third-party binary, model, library or retained source lineage, record its source, version/revision and license before release.
