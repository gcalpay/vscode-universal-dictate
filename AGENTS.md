# Agent guidance

Read [docs/M0_STOP_INSERT_LATENCY.md](docs/M0_STOP_INSERT_LATENCY.md) for current work.
Historical milestone ledgers are evidence, not outstanding tasks.

## Current authorization

Main is the accepted 1.1.0 release at
`8017f1950bbacb67c37add2c31315e7a6139bcd3`. Work first on
`perf/stop-insert-latency`.

M0 is measurement only. Preserve recording, preview, transcription, insertion,
clipboard, Pause/Resume, waveform and settings behavior. Measure T0..T6, run the
synthetic Windows baseline and produce a diagnostic VSIX for user-machine timing.

Do not merge, tag, publish, rewrite Git history or resume
`feat/overlay-visualizations` during M0. Do not log transcript text or audio.
