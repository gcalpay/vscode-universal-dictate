# M1 — Final inference priority

Branch `perf/stop-insert-latency`, PR #55. Candidate version 1.1.3 is for review only.
Baseline: published 1.1.0 with M0.2 diagnostics at
`81c92d0bcd286b8150aeb311c785e34a00bed926`. No visualizers or history rewrite.

## Evidence and scope

The three local Preview-Off totals were 1567.9 / 1637.9 / 1545.7 ms. The first
Preview-On totals were 2423.9 / 1481.1 / 1589.4 ms. Their medians differ by only
21.5 ms. The additional M0.2 samples are transcribed below from user screenshots:

| Host preview request at Stop | Age at Stop | Final adapter T3–T4 | Total T0–T6 |
| --- | ---: | ---: | ---: |
| active | 312.2 ms | 1964.9 ms | 2159.1 ms |
| already settled | 30.9 ms since settlement | 1420.6 ms | 1605.1 ms |
| active | 889.1 ms | 1351.1 ms | 1555.1 ms |

The earlier chat incorrectly called the third request already finished. It was
active. These observations support an intermittent penalty, not a claim that every
active request delays final transcription. Host request activity is not proof of
native compute activity. Preserve these raw values; do not select only slow runs.

T0 is engine acceptance, not the physical mouse event. T1 is recorder Stop promise
settlement. T2 is the host preview join, which overlaps recorder Stop. T3 is final
adapter entry (includes file/model/transport overhead), not native inference start.
T6 is input-helper completion, not target-app visual acknowledgement. Measurements
remain useful for before/after comparisons within those definitions.

## Decision

Pinned whisper.cpp 1.9.1 already aborts cooperatively when a request connection
closes, but holds a model mutex over the request. No acknowledged native-idle or
priority/preemption endpoint is exposed by that server. Retaining the pinned
runtime avoids introducing an unvalidated custom native Whisper build.

Use two independently owned servers: keep the final model warm and reserve it for
final WAV requests; create preview lazily only when preview is effective. Preview
has at most two inference threads and best-effort below-normal OS priority. No
model/download/backend change, hidden language switch or decoding shortcut.

Stop aborts preview transport, retires only the preview process and joins process
exit. A 150 ms graceful-to-force escalation and 1 s confirmation deadline bound
cleanup. A timeout disables additional preview workers for that runtime so failed
cleanup cannot create unlimited orphan processes; final transcription remains
available. Do not call a timeout confirmed exit. Only owned direct children are
terminated. Worker startup checks retirement before spawning and publishing readiness.

Pause invalidates active preview, which retires that worker. Resume restarts lazily
on the existing scheduling grid. Idle preview may remain while paused, but Stop,
Cancel and extension disposal release it even with no request in flight. Preview
Off allocates no worker. Final fallback remains final-only, without duplicating
insertion or replaying preview. No changes to recorder/native input/waveform code.

## Automated review gates

Keep all existing regressions. Add independent-loopback routing, final-warm retention,
active/idle/startup retirement, real child exit, kill escalation/timeout, no respawn
after disposal, preview error isolation, final fallback and priority/thread tests.
The extension must retain multiple timings without copying the clipboard or showing
one modal per run. Show Latency Report opens one in-memory document, capped at 100
completed runs; six settings stay unchanged.

Compare frozen M0 and M1 on the same Windows runner, pinned Whisper/model and exact
synthetic PCM. One runtime is alive at a time. Alternate policy order over three
repetitions for English and Auto. Conditions: preview Off; preview idle; Stop 100 ms
and 800 ms after preview HTTP dispatch. Warm preview before overlap trials so a
candidate is not unfairly measured before its extra worker has started. Preserve
host-pending state, actual dispatch-to-Stop delay and every raw timing.

Verify unchanged final PID, no remaining preview process and actual preview exit
before final HTTP dispatch. Compare final transcript hashes per language, capture
owned-process working sets/peak working sets/CPU counters outside timed sections,
and retain exact fixture hashes and bytes for later visualizer comparisons.
Three samples per cell support descriptive medians/ranges, not p95 or statistical
proof. Synthetic recorder close and insertion cannot measure user-PC input latency.

Review performance before delivering a candidate: Preview-Off and idle medians
should not regress by more than max(100 ms, 10%) on the same runner; controlled
overlap should approach candidate Preview-Off without reloading its final model.
Resource tradeoff: a second loaded model while preview is effective; quantify it
rather than calling it free. No user reinstall at internal iterations. Deliver one
verified candidate after tests, benchmark review and VSIX audit, with one optional
accumulated report during normal use rather than repeated screenshot instructions.

## Primary references

- https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/server/server.cpp
  (model mutex around inference; connection-closed abort callback).
- https://nodejs.org/api/child_process.html (kill return vs exit; owned child events).
- https://nodejs.org/api/os.html#ossetprioritypid-priority (priority is platform dependent).

Actual run IDs, before/after results and candidate hashes belong in PR #55 / the
external evidence report after CI completes. Do not claim pending checks passed.
