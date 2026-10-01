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

Scope: Pause/Resume recording; a middle overlay button; Text (default) or Symbols
controls; green Insert, amber Pause/Resume, red Discard; a ten-second waveform
history default; brief README clarification for compatible external Windows inputs.
No native Linux/macOS support, model selection/download, global hotkey, translation
feature or Issue #38 focus workaround is part of this milestone.

## Invariants and validation

- Inspect live refs before writes; preserve unrelated work and the 1.0.0 release.
- Pause leaves the device open but excludes incoming PCM from WAV, preview and
  waveform storage. Show Paused only after the recorder confirms that admitted
  callbacks have drained. A failed/unconfirmed pause cancels with an error.
- Pause/Resume are nonterminal pipe messages. Stop/Discard/disposal remain usable
  while paused or transitioning. No stale acknowledgement may revive a session.
- Suspend preview scheduling and reject in-flight results across Pause/Resume.
  Preserve the single active inference slot, full accepted audio and final insertion.
- Keep overlay dimensions/DPI alignment and non-activation. Use vector symbols and
  descriptive hover labels, not bundled fonts or color alone. Default style is Text.
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
