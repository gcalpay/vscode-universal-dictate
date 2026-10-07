# M0 — Stop-to-Insert latency baseline

Branch: `perf/stop-insert-latency`. Base: accepted 1.1.0 source
`8017f1950bbacb67c37add2c31315e7a6139bcd3`.

M0 measures the existing path before any latency fix or spectral visualization work.

## Timing stages

- T0 — Stop/Insert accepted by the dictation engine.
- T1 — recorder Stop settled and final WAV writer is closed.
- T2 — host preview operation settled.
- T3 — final Whisper inference is dispatched.
- T4 — final Whisper inference returned.
- T5 — final text insertion starts.
- T6 — final text insertion completed.

The observer is diagnostic-only. It records no transcript text and no audio. The
extension reports effective Live preview, language, warm/cold worker state at Stop
and persistent-server versus CLI fallback.

The Windows workflow runs a synthetic 12-second baseline through the production
DictationEngine and WhisperRuntime for explicit English and Auto, with preview Off
and On. This does not substitute for user-machine measurements.

For the user-machine baseline, install the M0 VSIX, dictate several comparable
10–15 second samples, and inspect the `Universal Dictate Latency` Output channel.
Do not implement a latency fix until the M0 stage timings identify the dominant cost.

## M0.2 preview-contention correlation

The diagnostic build additionally records whether preview Whisper inference is active at T0, how long that request has been active, or how long ago the previous preview inference finished. This is measurement-only and is intended to distinguish ordinary final-inference variance from Stop events that overlap speculative preview computation.
