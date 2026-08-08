# Third-party notices

Universal Dictate is MIT licensed. The project intentionally reuses mature permissively licensed components where that reduces risk and duplicated work.

## OpenWhispr

Selected Windows input-injection code is derived from OpenWhispr:

- Project: https://github.com/OpenWhispr/openwhispr
- Upstream file: `resources/windows-fast-paste.c`
- Upstream revision inspected: `1866ecf6641b9fa4851f19c7838cb18f3662def7`
- License: MIT
- Copyright: Copyright (c) 2024 OpenWhispr Team

The corresponding MIT license text is retained in `third_party/OpenWhispr-LICENSE.txt`.

Universal Dictate does not vendor the OpenWhispr application itself. Only narrowly useful implementation pieces may be adapted, with provenance documented here and in the affected source files.

## whisper.cpp

Planned local speech-recognition runtime:

- Project: https://github.com/ggml-org/whisper.cpp
- License: MIT

The release integration will pin an exact whisper.cpp version and verify downloaded runtime/model artifacts with SHA-256 before use. The whisper.cpp source tree is not vendored into this repository unless a later build requirement justifies it.

## Dependency policy

Before release, each distributed third-party source file, binary or model must have its source, version/revision, license and integrity information documented here or in an accompanying notice file.
