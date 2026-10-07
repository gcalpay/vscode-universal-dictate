# M5 confirmation protocol (revision 2)

Declared before the new confirmation data are collected. No production change,
model/timeout adjustment, discarded run or weakened inference threshold is involved.
Retain exploratory reports from runs 37686194374, 37686917439 and their repetitions.
These are not retroactively labeled passing.

## Why confirmation is needed

The initial three-per-condition sequential matrix found 0.5-second final-inference
variation even for the no-overlay control, plus a preview timeout on one 48-second
splice/repetition stress clip. A second runner completed all 44 cases, but CQT Off
exceeded the total-latency budget and unchanged Waveform On exceeded a per-run UI
p95 wall-time target. These observations cannot justify either claiming a renderer
regression or declaring all checks passed. Native recording/PCM, transforms and
memory checks were separate from this final-inference variation.

## New measurements

Each of six independent jobs checks one mode (five styles plus no overlay) against
frozen M1 waveform/no-overlay as appropriate, on the same runner and warm final
worker. There are ten adjacent A/B pairs per preview state. Order reverses each
pair (AB, BA); no filtering, best-run selection or early stopping is permitted.
Every failed trial remains in the evidence and fails the confirmation. Runtime,
model, parameters, 12-second PCM and native replay wrapper are unchanged. The
12-second PCM was byte-compared with the retained M1 synthetic fixture and matches.

The long-history checks now use 48 seconds of continuous generated speech rather
than four copies of an abruptly cut 12-second clip. Both frozen M1 and candidate
run this long input for linear and CQT comparisons. This is an additional test,
not grounds to erase the earlier stress timeout or claim it was fixed.

## Gates and measurement interpretation

The primary total-latency allowance remains max(150 ms, 10% of the matched M1
median). It applies to the median of within-pair candidate-minus-M1 differences,
not a difference between three widely separated medians. CPU overhead remains
<=5 one-core percentage points; private commit overhead <=16 MiB; callback mean
overhead <=0.25 ms; maximum per-run callback p95 <=2 ms; zero visual drops.

The UI wall-time gate is explicitly revised: median per-run p95 <=25 ms and median
paired p95 overhead <=5 ms. The original gate used the maximum per-run p95 and
failed on the unchanged waveform. All maxima still remain in the report. This
new gate is a regression/headroom check, not a guarantee that a shared Windows VM
or an actual PC will never have a slow frame. Do not conceal this protocol change.

Mic input is synthetic; WAV writing, preview IPC, analysis, Win32 drawing and
Whisper are real. Insertion is a stub. Report Stop-to-stub rather than claiming
physical mouse-click-to-visible-Codex-text latency. User review requires normal
use of one integrated candidate, not another prescribed dictation exercise.
