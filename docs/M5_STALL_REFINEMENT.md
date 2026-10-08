# M5 stall refinement

The interrupted run was recovered at a7d6044. Windows packaging/render validation
passed in run 37689428777; the six-job M5 confirmation 37689421812 did not pass.
All its reports are retained, not relabeled as successes. The paired waveform UI
p95-overhead gate failed (9.2543 ms > 5 ms). One linear and one CQT trial dropped
8320 and 5120 visualization samples respectively. These are visual-only losses;
the harness byte-checked the complete captured PCM before the drop assertion.

## Production changes for the next confirmation

- Detach the recorder command input stream from implicit stdout flushing, before
  starting threads. The command reader previously used cin.get() with the default
  stdout tie. Each extraction can flush the other thread's output. Keep existing
  explicit protocol flushes and C/C++ stdio synchronization, with exact-byte and
  flush-ownership regression tests. This is a measured candidate optimization,
  not yet a claim that every prior UI wall-time spike has been explained.
- Increase spectral scheduling headroom from 8192 to 32768 frames (0.512 to 2.048 s).
  Keep analysis capped at 8192 samples per update, under 2 MiB analyzer storage,
  no extra capture-thread allocation/wait, no visual drain at Stop, and bounded
  visual-only dropping beyond the limit. Test a deterministic 1.5-second drain
  stall, exact recovered history, overflow gaps and the existing concurrency path.

## Measurement, unchanged acceptance thresholds

Retain the revision-2 ten adjacent AB/BA pairs per preview condition and all its
latency, UI, CPU, memory and zero-drop gates. Do not relax thresholds or rerun
until a favorable sample appears. Add native paint/preview-IPC/analysis/level-output
stage distributions and queue high water for attribution. Preserve full native
metrics even for failed trials. Compare the unchanged frozen M1 recorder and
candidate using the same instrumented shell; only the candidate uses the new
production input initialization. Final worker/model/parameters remain unchanged.

The next automated confirmation must be reviewed before a candidate is delivered.
No additional manual benchmark or intermediate VSIX is requested.

Primary C++ stream reference: Microsoft Learn, basic_istream::sentry (calls the
tied stream's flush before formatted/unformatted extraction) and basic_ios::tie.
