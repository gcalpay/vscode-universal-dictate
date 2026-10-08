# Agent guidance

Current work: [docs/OVERLAY_INTEGRATION.md](docs/OVERLAY_INTEGRATION.md).
Branch: `feat/overlay-visualizations`, based on M1 `d4c52d2d153545a7a8bef6ed1680261e199ef22b`.
Published main remains 1.1.0 `8017f1950bbacb67c37add2c31315e7a6139bcd3`.

## Authorization and delivery

The user authorized continuing M2-M5 internally without installing or reviewing the
M1 candidate first. This supersedes the older M1 manual-acceptance gate in PR #55.
Implement, commit, run automated Windows/numerical/performance checks and inspect
scripted production renders. Deliver one integrated candidate after internal gates,
not a VSIX for each substep. No repeated dictated sentence/screenshots per run.
Do not merge, tag, publish or rewrite Git history in this implementation phase.
Keep PR #55 and its M1 evidence intact; visualization work builds on that source.

## Invariants

Preserve the isolated warm final/preview worker design, pinned model and inference
parameters. Preserve Pause/Resume, full accepted WAV, one final insertion, clipboard
Off as no access, non-activating controls and Issue #38 scope boundary.
Keep the 1.1.2 waveform mapping, immutable buckets/history, native paint,
overlay/preview layout and raw snapshot unchanged; the RC2 Medium-only gain is
explicitly excluded pending root-cause evidence. Do not mask fluctuating raw
microphone input with unvalidated visual gain. Spectral analysis is enhanced-
overlay-only, absent when Waveform/Status-bar-only/Off is effective. No FFT/CQT,
allocation, blocking wait or disk I/O added to the capture callback. Use bounded
buffers and intentional dropped visualization updates rather than dropped audio.
Settings are session snapshots; selecting a style must not enable the overlay.
Preserve explicit preferences and defaults. Keep accumulated latency reporting.

## Evidence

Verify actual source refs before writes and keep dependency branches separate.
Report scripted render/numerical/runner results separately from user-PC behavior.
T3-T4 measures the final adapter call; T6 is helper completion, not target paint.
No audio/transcript diagnostic logging or analyzer-rule suppression. Remove any
temporary source-transfer workflow before the implementation checkpoint is delivered.
