# Dependencies and licenses

The core Windows helpers and visualization code are maintained with the extension.
Build and runtime dependencies are deliberately pinned or controlled by a lockfile.
See [third-party notices](../THIRD_PARTY_NOTICES.md) for attribution and the
retained license texts in `third_party/`.

| Component | Source and role | Version / license |
| --- | --- | --- |
| Whisper `base` multilingual model | `openai/whisper`, 99-language speech recognition | MIT; checksum verified at first download |
| `whisper.cpp` | `ggml-org/whisper.cpp`, local Windows inference | `v1.9.1`, MIT |
| SDL2 | Bundled DLL from the pinned whisper.cpp Windows runtime | `2.28.5`, zlib |
| miniaudio | `mackron/miniaudio`, Windows WASAPI capture and WAV encoding | `0.11.25`, MIT-0 |
| OpenWhispr | Historical Win32 focused-input helper source lineage; not a runtime dependency | MIT, retained attribution |
| Node.js | Build, TypeScript checks and packaging | Node 24 in CI |
| `@vscode/vsce` | VSIX packaging | `3.9.3-5` |

The current Unicode insertion helper is maintained in
`native/windows-text-input.cpp` and uses Windows `SendInput`; it does not insert
text by replacing the user's clipboard. The historical focused-input helper
originated in OpenWhispr and remains credited even though the current C++20
implementation is substantially different.

The multilingual `ggml-base.bin` model is downloaded on first use, verified
against the pinned SHA-256
`60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`,
and cached in local extension storage. The model is not in the VSIX. Once set up,
normal dictation and preview can run offline.

The Windows `whisper.cpp` release archive `whisper-bin-x64.zip` is fetched during
the package build, with SHA-256
`7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539`
checked before its required executables and DLLs are included. SDL2's retained
license corresponds to the packaged `2.28.5` DLL.

The build fetches the pinned miniaudio header and compiles the two native
Windows executables with MSVC C++20. The repository includes `package-lock.json`
for `npm ci`. CI records the resolved dependency tree, tool versions and compiler
identity rather than assuming every build environment is byte-identical.

No external audio transcription API, user API key, WSL-side inference installation
or new third-party DSP library is required. Inference and text-input behavior,
model/runtime pins, dependency updates and redistributed licenses require
explicit compatibility, privacy and packaging checks.
