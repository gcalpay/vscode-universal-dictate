# M6 - 1.0.0 release candidate

Updated: 2026-10-01. Branch: `release/next`.
Baseline: `4088b1dcc7329d72293f2935f8d0a76f8521e389`.
M3 merge: `d1408904409c8636a4ffada6ef342a5d04b6ed3a` (accepted PR #52).

## Scope and authorization

The user approved replacing the settings/status-bar screenshots, adding the supplied
live-preview screenshot, retaining the existing waveform-only overlay, rewriting
the README, adding 1.0.0 notes and building the 1.0.0 VSIX. Publication waits for the
user's test and explicit approval. M4 skipped; M5 parked with Issue #38 open.

The candidate contains English / Medium / Live preview Off defaults, while explicit
saved choices remain untouched. Other defaults remain Enhanced overlay, one-second
waveform span and Overwrite clipboard Off. No additional product feature or popup.

## Assets and text

`overlay.png`, `Settings.png` and `status_bar(1).png` were supplied by the user.
Convert to lossless WebP without changing pixel dimensions/content. Compare decoded
RGBA pixels to the originals. Keep `media/enhanced-overlay.webp` byte-for-byte and
remove `media/universal-dictate-overview.webp`. Keep the existing icon.

The settings screenshot shows preview On and a ten-second waveform as an example;
it must not be relabelled as defaults. README gives the actual defaults. README
includes four screenshots, settings, controls, the approved offline language note,
recovery, privacy, Remote-WSL scope and the known focus limitation. No VSIX installation
section or milestone/development commentary belongs in the Marketplace overview.

CHANGELOG.md records the user-facing changes since published 0.1.5, including the
English-default impact on users with no explicit language setting. Prior history
stays intact. These notes can also be reused for the GitHub Release after approval.

## Validation gate

The candidate is version 1.0.0 but remains unpublished. Run ordinary Linux and
Windows checks, native regression/presentation tests, real inference-adapter tests,
and the package audit. Add package checks for English, all four release screenshots,
changelog and excluded obsolete/development/font files. Existing Medium/preview-Off
checks remain. Record results and exact artifact identity in the release PR; do not
claim successful checks before they run.

Independently inspect downloaded VSIX hashes, manifest/defaults, x64 target, README,
changelog, media and recorded payload hashes. Archive path safety and no embedded
credentials, source tooling, extra model files or fonts remain release requirements.
The worker uses local loopback; model setup is the external network exception.

## User smoke test

Install the supplied 1.0.0 VSIX and reload. Explicit saved preferences remain; a prior
preview On or non-English choice is not reset by this release. Confirm normal
preview-Off dictation, one preview-On recording followed by complete single insertion,
settings and the new README/screenshots/changelog. Report any new failure. The broad
M3 test is already accepted and need not be repeated without cause.

## Publication gate (not performed by preparing this candidate)

After final acceptance and explicit authorization: verify unchanged branch/artifact,
merge the release PR, tag v1.0.0, create GitHub Release notes and publish the exact
accepted win32-x64 VSIX. Keep the previous public version available as a rollback
reference. A changed binary requires a replacement candidate and relevant retest.
Never paste a Marketplace token into chat; use an authorized publisher account or
existing secure release mechanism. Do not close Issue #38 or imply it was fixed.
