# Third-party notices

Universal Dictate itself is MIT licensed. The extension uses the following permissively licensed components and model assets.

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

## Universal Dictate native code

The Windows focused-input paste helper, microphone process integration and non-activating recording overlay are Universal Dictate implementations maintained in this repository. They are not redistributed source code from another dictation application.

## Dependency policy

Every redistributed third-party binary, library or model asset must have its source, version or revision, license and integrity information documented before release. Application source from unrelated dictation products is not vendored into Universal Dictate.
