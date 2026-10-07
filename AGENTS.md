# Agent guidance

Current work: [docs/M1_FINAL_INFERENCE_PRIORITY.md](docs/M1_FINAL_INFERENCE_PRIORITY.md).
Branch: `perf/stop-insert-latency`; draft PR #55. Main remains published 1.1.0
`8017f1950bbacb67c37add2c31315e7a6139bcd3`. Frozen M0.2 source is
`81c92d0bcd286b8150aeb311c785e34a00bed926`.

The user authorized M1 implementation, Conventional Commits, automated comparison,
Windows validation and one finished test VSIX. Do not merge, tag, publish, rewrite
history or resume `feat/overlay-visualizations` without the relevant review gate.
Do not request more manual diagnostic micro-builds or per-recording screenshots.

Final inference must retain the pinned model/runtime, original decode parameters,
full accepted WAV and one final insertion. Preview must never use the final worker.
Preview Off must not spawn a second process. Confirm owned preview process exit on
retirement; do not treat HTTP abort/kill return as exit proof or kill by process name.
Do not weaken cancellation, Pause/Resume, clipboard, non-activation, waveform or
no-auto-submission invariants. Keep six settings and accepted defaults unchanged.

Record synthetic benchmarks and real user observations separately. T3–T4 is the
whole final adapter call, not isolated native compute; T6 is helper completion,
not proof the target app painted text. No diagnostic audio/transcript logging.
Keep bounded resource/cleanup tests, fallback tests and Windows package audit.
No disabled analyzer rules or falsely claimed passes. Remove temporary transfer
workflows before delivering the candidate. Persist source/run/VSIX identities in
PR #55 and the evidence report, not by rebuilding after adding a hash to source.
