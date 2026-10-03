# Agent guidance

Read [docs/M7_PAUSE_RESUME.md](docs/M7_PAUSE_RESUME.md) for current work.
The M1/M2/M3/M6 ledgers describe historical checkpoints, not outstanding tasks.

## Current authorization

Main is the accepted 1.0.0 release merge `eda02a512d3feb70989b89a3efc6714d12b833e7`
(PR #53). The user reports publishing 1.0.0 to the Marketplace.
Work on `feat/pause-resume-controls` / PR #54, targeting a 1.1.0 test candidate.
The user authorized implementation, corresponding Conventional Commits, tests,
Windows builds and a VSIX for review. **Do not merge, tag or publish this milestone
until the user accepts the finished Windows candidate and authorizes release.**

Scope: Pause/Resume recording; a middle overlay button; compact symbol-only
controls; green Insert, amber Pause/Resume, red Discard; a ten-second waveform
history default; brief README clarification for compatible external Windows inputs.
No native Linux/macOS support, model selection/download, global hotkey, translation
feature or Issue #38 focus workaround is part of this milestone.

## Current visual correction

The user accepted Pause/Resume and the compact layout, but rejected the filled
`43a4ef0` waveform and the wobbling `d955795` replacement. Restore the original
256 append-only signed-peak display buckets and thin-line/envelope drawing.
Select the bucket duration before capture; finalize each value once. Completed
samples may scroll left but must never be regrouped, rescaled or reshaped by later
audio. Do not add paint-time decimation, neighbor smoothing or adaptive gain.
Keep the compact geometry, symbol controls, six settings and ten-second default.
The peak response stays close to 0.1.5 (reference 0.05, exponent 0.62) with only a slightly raised visual idle gate (0.0015);
recorded PCM, recognition and Pause/Resume remain unchanged. The reference screenshot
was NOT necessarily recorded at one second; do not infer its span from old defaults.

Test temporal behavior, not only still images: partial buckets leave the displayed
frame untouched, completed buckets shift old values verbatim, and production strokes
translate without changing shape. Include startup, ring wrap, loud input after quiet,
Pause/Resume and DPI cases. A new verified VSIX is authorized, not merge/publication.

## Invariants and validation

- Inspect live refs before writes; preserve unrelated work and the 1.0.0 release.
- Pause leaves the device open but excludes incoming PCM from WAV, preview and
  waveform storage. Show Paused only after the recorder confirms that admitted
  callbacks have drained. A failed/unconfirmed pause cancels with an error.
- Pause/Resume are nonterminal pipe messages. Stop/Discard/disposal remain usable
  while paused or transitioning. No stale acknowledgement may revive a session.
- Suspend preview scheduling and reject in-flight results across Pause/Resume.
  Preserve the single active inference slot, full accepted audio and final insertion.
- Keep preset widths, DPI alignment and non-activation. Use compact vector symbols
  and descriptive hover labels, not bundled fonts or color alone. Choose the compact
  or preview-enabled height once at startup; Pause/Resume must not resize it.
- Preserve explicit saved preferences. Only an absent waveform setting changes to
  ten seconds. English / Medium / Live preview Off / Overwrite clipboard Off /
  Enhanced overlay remain the other defaults.
- Automatic clipboard Off performs no access; On copies the final transcript once.
  Copy Last Transcript remains explicit and memory-only. No restoration, automatic
  retry, synthetic Enter or automatic message submission.
- Local inference uses the existing pinned Whisper runtime/base model. WSL remains
  a workspace under the Windows UI host, not a newly supported native Linux host.
- Do not use private Codex internals, global hooks, click replay or custom VS Code.
  Keep Issue #38 open and frozen experiment branches isolated.
- Run all existing regressions plus native pause/capture/pipe/renderer tests. Runner
  synthetic PCM and scratch-window input tests are not user microphone/Codex proof.
- Inspect the actual Windows VSIX and record source/run identity, hashes and defaults
  in PR #54. Exclude source/test/tooling/font/model/audio files from the package.
- Existing screenshots are 1.0 references until new user captures are accepted.
  Do not substitute scripted test renders into public docs as real user screenshots.
- Remove the temporary M7 review-snapshot workflow before delivering the candidate.
- Review analyzer findings individually; do not disable rules or claim an evidence
  collector makes Codacy green. Never request publishing credentials in chat.
