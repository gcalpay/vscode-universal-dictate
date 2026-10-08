# Dependency strategy and build identity

Universal Dictate maintains product-specific code in this repository and retains
reviewable upstream versions, download checksums and license provenance. The 1.2
visualizers add no external DSP library, inference backend or model download.

## Windows text insertion and retained lineage

The current helper is `native/windows-text-input.cpp`, compiled as
`windows-text-input.exe` using C++20 and documented Win32 `SendInput` APIs. It sends
Unicode input directly, waits for physical shortcut modifiers and rechecks focus/
modifiers between bounded batches. It does not synthesize Ctrl+V or Enter. The
host converts control characters for direct input; explicit/automatic clipboard
copies retain the original final text.

Historical input-helper code evolved from OpenWhispr's MIT-licensed
`resources/windows-fast-paste.c`, upstream revision
`1866ecf6641b9fa4851f19c7838cb18f3662def7`. That earlier path temporarily released/
restored shortcut modifiers for Ctrl+V; it is not the current insertion mechanism.
The retained notice remains `third_party/OpenWhispr-LICENSE.txt`. OpenWhispr is not
a runtime dependency; retain the historical attribution despite the rewritten
Unicode implementation. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Automatic dictation with clipboard Off makes no clipboard access. Clipboard On
copies the final result once before the same direct insertion attempt, with no
later restoration. **Copy Last Transcript** is an explicitly requested copy.

## Microphone capture

| Item | Identity |
| --- | --- |
| Upstream | `mackron/miniaudio` |
| Version | `0.11.25` |
| License selection | MIT No Attribution (MIT-0) |
| Retained notice | `third_party/miniaudio-LICENSE.txt` |
| Integration | Pinned header compiled through `native/miniaudio-impl.cpp` |

miniaudio captures the Windows default microphone through WASAPI and writes
16 kHz mono PCM16 WAV. The header is fetched at build time; end users install no
separate audio dependency. Record the actual fetched header hash in the candidate
build identity. Do not describe a tag-pinned fetch as a predeclared content-hash
verification unless that verification has actually been configured.

## Speech-recognition model

| Item | Identity |
| --- | --- |
| Upstream model and reference code | OpenAI `openai/whisper` |
| Model | Multilingual Whisper `base`, original 99-language vocabulary |
| Local file | `ggml-base.bin`, converted ggml representation for whisper.cpp |
| Distribution | `ggerganov/whisper.cpp` model repository on Hugging Face |
| Model SHA-256 | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| Approximate initial download | 148 MB |
| License / retained notice | MIT / `third_party/OpenAI-Whisper-LICENSE.txt` |

The model downloads on first use into local VS Code extension storage and is
checksum-verified before activation. It is not packaged in the VSIX. After setup,
normal dictation and optional preview can operate offline. Recognition defaults
to **English**, with explicit languages and Auto-detect available. The authoritative
product list is `src/languages.ts`; accuracy varies by language/audio. Selecting a
recognition language is not a supported general translation feature.

## Speech-recognition runtime

| Item | Identity |
| --- | --- |
| Upstream | `ggml-org/whisper.cpp` |
| Pinned release | `v1.9.1` |
| Windows archive | `whisper-bin-x64.zip` |
| Archive SHA-256 | `7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539` |
| License / retained notice | MIT / `third_party/whisper.cpp-LICENSE.txt` |

The Windows archive is fetched and checksum-verified in the build workflow, then
its required CLI/server executables and runtime DLLs are packaged. End users need
no Python, PyTorch, Conda, FFmpeg, CMake or WSL-side inference packages.

Final transcription keeps its dedicated warm `whisper-server` and existing
final-only CLI fallback. Effective live preview lazily creates a separate owned
server capped at two inference threads with best-effort below-normal priority.
Both use the same verified model/runtime; M1 does not change decoding parameters.
Stop retires preview and confirms exit with bounded escalation before final dispatch;
unconfirmed termination disables further preview workers while leaving final
recognition available. Preview Off avoids the second model process. Its roughly
255.6 MiB historical benchmark working set is an explicit cost, not a measurement
of additional unique physical RAM. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Visualization and Windows graphics

The FFT, Constant-Q kernels, bounded queue and raster logic are maintained here in
C++20. GDI+, GDI, Direct2D and DirectWrite are Windows system facilities. No new
font/DSP package ships to users. Test fonts, synthetic speech fixtures and renderer
harnesses are development evidence and must stay out of the VSIX. Keep the
independent uncached text oracle and exact RGB comparison when assessing the
preview raster cache; review status is in [M5_REVIEW_CLOSEOUT.md](M5_REVIEW_CLOSEOUT.md).

## Build tools and reproducibility

At the verified recovery tree `bee76fa…`, `@vscode/vsce` is exactly `3.9.3-5`.
TypeScript, Node typings and VS Code typings use ranges (`^5.7.2`, `^22.10.2`,
`^1.96.0`), and there is no tracked package lock. CI requests Node major 24;
M5 observed Node 24.21.0. The Windows workflow chooses the installed Visual Studio
C++ toolchain on `windows-latest`, so a source/version label alone does not freeze
the full compiler environment. Do not silently upgrade dependencies while claiming
runtime equivalence.

The M6 build-input checkpoint now tracks the generated `package-lock.json` with canonical LF line endings
from Windows run `37778683095`, artifact `11550647643`. Its SHA-256 is
`45cb23ed750ce092a31006597849aaa97aff133772290fc2504ae78d7296f35d` for the original
Windows artifact. The committed LF form has SHA-256
`61d824e3a106a0974534f0fd667685c213cc9226d69f3b08dbea2ae2228a89d5`; parsed dependency content is identical.
That dependency installation succeeded; the later compiler-provenance command
failed before native compilation. The failure is retained and the command is
corrected, rather than represented as a successful package build.

The captured environment used Node `24.21.0`, npm `11.19.0`, TypeScript `5.9.3`,
`@types/node` `22.20.5`, `@types/vscode` `1.140.0` and `@vscode/vsce` `3.9.3-5`.
The lock records the full resolved dependency graph and integrity values. Normal
CI and Windows package builds now use `npm ci`; the existing M5 installer also
consumes the committed lock. No dependency range, runtime pin or model changed.
The consolidated package workflow retains the npm tree/lock, Node/npm/PowerShell
versions, actual compiler executable version/path, fetched miniaudio checksum and
source/tree identity. A successful locked Windows build and final artifact
identity remain required in [M6_INTEGRATED_CANDIDATE.md](M6_INTEGRATED_CANDIDATE.md).

The pre-existing runtime archive also contains SDL2 `2.28.5`. Its DLL version
resource and whisper.cpp's pinned release workflow agree. The matching upstream
zlib license is now retained at `third_party/SDL2-LICENSE.txt`; the DLL itself is
unchanged. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for its source.

The package audit must connect source to the exact compiled JavaScript, native
helpers, runtime DLLs, README/changelog/media and notices in the VSIX. No development
lock, dependencies, fixtures, fonts or model weights belong in that package.
Building a new archive from identical source does not automatically reproduce
identical PE/VSIX bytes: compiler paths, timestamps, tool versions and packaging
metadata can differ. Compare actual payloads and retain the exact source/build/
artifact mapping; an archive hash is not a code-signing claim.

## Policy

Keep all redistributed upstream binaries, libraries, model assets and retained
source lineage traceable to a version/revision, source and license. Preserve MIT,
OpenWhispr acknowledgement and every retained notice. Changes to source dependencies,
toolchains, model/runtime pins or inference settings require an explicit scope and
verification decision; they must not be hidden in a documentation or history-only
checkpoint.
