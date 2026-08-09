# Third-party notices

Universal Dictate itself is MIT licensed. The extension uses the following permissively licensed components, model assets and source lineage.

## OpenAI Whisper

OpenAI Whisper provides the speech-recognition model architecture and trained model weights used by Universal Dictate.

- Project: `openai/whisper`
- Role: original Whisper automatic speech-recognition model and weights
- Model family used: multilingual Whisper `base`
- Local model representation: `ggml-base.bin`
- License: MIT
- License notice retained at: `third_party/OpenAI-Whisper-LICENSE.txt`

Universal Dictate does not claim authorship of the Whisper neural-network architecture or trained weights.

## whisper.cpp

Universal Dictate uses whisper.cpp to run Whisper inference locally on Windows without requiring Python or PyTorch for end users.

- Project: `ggml-org/whisper.cpp`
- Pinned release: `v1.9.1`
- Role: local C/C++ Whisper inference runtime
- License: MIT
- License notice retained at: `third_party/whisper.cpp-LICENSE.txt`

The Windows runtime archive is downloaded during the release build and verified against a pinned SHA-256 checksum before it is bundled in the VSIX.

## miniaudio

Universal Dictate uses miniaudio for Windows microphone capture and WAV encoding.

- Project: `mackron/miniaudio`
- Pinned version: `0.11.25`
- Role: WASAPI microphone capture and PCM WAV encoding
- License selection: MIT No Attribution (MIT-0)
- License notice retained at: `third_party/miniaudio-LICENSE.txt`

The miniaudio header is fetched at build time and compiled into Universal Dictate's native C++ recorder.

## OpenWhispr

The focused-input Windows paste helper has historical source lineage from OpenWhispr's MIT-licensed `resources/windows-fast-paste.c`.

- Project: `OpenWhispr/openwhispr`
- Upstream revision used by the early Universal Dictate adaptation: `1866ecf6641b9fa4851f19c7838cb18f3662def7`
- Historical role: Win32 `SendInput` fast-paste logic, including temporary modifier release/restore around the paste shortcut
- Current implementation: `native/windows-fast-paste.cpp`, substantially rewritten in C++20 and reduced to Universal Dictate's Ctrl+V-only focused-input use case
- License: MIT
- License notice retained at: `third_party/OpenWhispr-LICENSE.txt`

OpenWhispr is not a runtime dependency and its application source is not bundled with Universal Dictate. The license notice is retained conservatively because the current helper evolved from the earlier attributed implementation.

## Universal Dictate native code

Universal Dictate's microphone process integration and non-activating recording overlay are maintained in this repository. The focused-input paste helper is also maintained here, with the OpenWhispr lineage described above.

## Dependency policy

Every redistributed third-party binary, library, model asset or retained source lineage must have its source, version or revision and license documented before release.
