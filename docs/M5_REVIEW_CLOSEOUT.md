# M5 review closeout — verified 8 October 2026

**M5 performance and source review are complete. The original cache mismatch is a
reviewed residual risk, not a resolved defect. Final package validation and M6
acceptance remain separate gates.** This record uses saved source and raw reports, not the last
interrupted response or the success of an evidence-collector job.

## Recovered source and original run identity

| Item | Verified identity / outcome |
| --- | --- |
| Feature branch / draft PR | `feat/overlay-visualizations` / [#56](https://github.com/gcalpay/vscode-universal-dictate/pull/56) |
| Original feature head used for M5 | `410094fb898e15170cd985ff1f7c060900b1873c` |
| Original feature Git tree | `bee76fa88913183d6089c1d2ced1c7b0350f505a` |
| Frozen M1 / draft base PR | `d4c52d2d153545a7a8bef6ed1680261e199ef22b` / [#55](https://github.com/gcalpay/vscode-universal-dictate/pull/55) |
| Accepted 1.1.0 main | `8017f1950bbacb67c37add2c31315e7a6139bcd3` |
| [Normal CI](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765265198) | `37765265198`: success |
| [Windows native/render/package](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765265222) | `37765265222`: success |
| [M5 confirmation](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765259320) | `37765259320`: all six jobs successful; completed 2026-10-08 10:55:54 UTC |
| [Analyzer evidence collector](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765265234) | `37765265234`: successful collection, not a clean analyzer result |
| Codacy check at original feature head | `113271718163`: `action_required`, eight added findings |

The Windows package checkout is GitHub's synthetic PR merge commit
`7973e409e7ca828086fba362b699805b42395422`, whose tree equals `bee76fa…`.
This is a CI checkout identity, not a merge of either draft PR. Later documentation
or test-only changes must record their own source identity; do not silently assign
these runs to a newer full tree.

## Review checkpoint and independent confirmation

| Item | Verified identity / outcome |
| --- | --- |
| Review checkpoint | `980877b095cbba7c5bd2b5f85794ef4a87332fd1` |
| Review checkpoint Git tree | `fd00c28c6e0e7f8298b3f4e0a2c44b225e28b483` |
| [Post-review M5 confirmation](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37778677667) | `37778677667`: all six artifacts independently verified; 224 observations, 112 candidate, 88 passing gates |
| Codacy check at review checkpoint | `113316719146`: `action_required`, five added findings, individually justified below |
| Build-input checkpoint | `0956650795519d7275985cc5a65cd126cf458f88` |
| Build-input Git tree | `84794fcf086a1ab4fe9796c885b93aa8ed400680` |

The second M5 run validates the reviewed replay helpers and bounded cache probes.
It has zero failed trials, zero visual drops, exact admitted PCM, matching fixture/
model identities and all complete comparison pairs. It is a separate confirmation
from original run `37765259320`; neither set is relabeled or pooled with the other.
Production sources remain unchanged. Build-input checkpoint `0956650` records the
reviewed resolved npm lock, SDL2 license and compiler-provenance command repair;
see [DEPENDENCIES.md](DEPENDENCIES.md).

The later test-helper type repair is included in the final source batch. Its final
Windows renderer/package results and actual candidate source/tree/VSIX identity are
recorded in [PR #56](https://github.com/gcalpay/vscode-universal-dictate/pull/56)
and the delivered audit/checksum record. These known M5 runs must not be attributed
to an unrecorded final full tree merely because production code is unchanged.

## Revision-2 protocol and completeness

[M5_CONFIRMATION_PROTOCOL.md](M5_CONFIRMATION_PROTOCOL.md) is the active protocol.
Each of six independent Windows jobs uses the same job's runner and warm final
worker for candidate and frozen M1. Five styles are paired against M1 Waveform;
the no-overlay control is paired against M1 no-overlay. Ten adjacent comparison
pairs per effective preview condition alternate AB/BA. No filtering, best-run
selection, missing-pair replacement or early stopping is allowed.

The five styles produce 200 short observations, the no-overlay control adds 20,
and linear/CQT each add one baseline/candidate 48-second continuous-speech pair.
Both separately identified confirmations completed all **224 observations**:
112 candidate and 112 M1, 11 short-run conditions, **88 passing aggregate gates**,
no recorded failed trials, exact accepted PCM/frame/callback counts, completed
replays and zero visual drops. Expected pairs and gates were independently
verified from each run’s six raw reports.

The six artifacts agree on the source, model and short-fixture identities. The
12-second fixture SHA-256 is
`75c1848d04d8efa327c34e6f6505c9cee5c107ac947ee762103fa79cf7fdfb41`.
It matches the retained M1 short fixture. Model/runtime pins are in
[DEPENDENCIES.md](DEPENDENCIES.md). Current M5 uses English; historical M1 tested
English and Auto. Multilingual renderer fixtures do not establish multilingual
recognition accuracy.

## Original confirmation results — run `37765259320`

Positive Stop delta is slower than the matched baseline. Negative deltas are
observed differences, not a claim that visualization speeds up speech recognition.

| Candidate mode | Median paired Stop-to-stub delta, Preview Off | Preview On | Median per-run candidate UI p95, Off / On |
| --- | ---: | ---: | ---: |
| Waveform / Oscillogram | −51.7 ms | −21.7 ms | 2.30 / 3.05 ms |
| Log-Frequency Power Spectrogram | −5.7 ms | −56.0 ms | 2.63 / 3.50 ms |
| Linear-Frequency Power Spectrogram | +62.8 ms | +4.7 ms | 2.64 / 3.23 ms |
| Constant-Q Power Spectrogram | +4.2 ms | −41.5 ms | 2.06 / 2.78 ms |
| Circular Spectrum | −6.8 ms | +9.4 ms | 1.89 / 2.35 ms |
| No-overlay control | −18.3 ms | Not applicable | 0.054 ms |

All eight gates pass in all 11 short conditions: paired Stop median within
max(150 ms, 10% of matched M1 median); paired callback mean overhead ≤0.25 ms;
maximum per-run callback p95 ≤2 ms; median per-run UI p95 ≤25 ms; paired UI-p95
overhead ≤5 ms; paired one-core-normalized native CPU overhead ≤5 percentage
points; paired private commit overhead ≤16 MiB; zero visual drops.

The largest positive paired Stop median is 62.8 ms. The largest observed candidate
per-run callback p95 is 0.1047 ms; the largest per-run UI p95 is 5.2293 ms. Queue
high water reached at most 10,400 frames against the 32,768-frame capacity.
Individual pairs remain variable: log/Preview-On Stop differences span about
−887.7 to +902.7 ms, and no-overlay spans −508.4 to +318.3 ms. These observations
remain included. Passing median gates does not prove absence of latency spikes or
establish the exact cause of every observed difference.

Paired additional recorder private commit is about 1.08–1.19 MiB for log/linear,
1.71–1.73 MiB for CQT and 0.69–0.72 MiB for circular. This is not the separate M1
preview worker's approximately 255.6 MiB measured working set, and neither is a
measurement of additional unique physical RAM. Absolute inference times must not
be compared between independent mode jobs with different allocated CPU models.

Both long pairs completed with exact PCM and no visual drops. Stop-to-stub was
M1 4527.5 / candidate 4563.2 ms for CQT and M1 4872.1 / candidate 4677.0 ms for
linear. These are single pairs, not a total-latency tail distribution. All short
final-transcript hashes matched for this fixture, as did the long fixture hashes;
that is fixture consistency, not broad speech-accuracy validation.

The replay drives the real callback/WAV writer, Win32 message loop/paint, native
preview IPC, production Node adapter/coordinator/engine and pinned Whisper. Audio
is synthetic and final insertion is a no-op. It does not test a physical microphone,
the user's PC or visible text arrival in VS Code/Codex/WSL. UI-sample p95 is not
95th-percentile total dictation latency. T3–T4 is the final adapter call; T6 is
helper completion in real insertion, not target paint acknowledgement.

## Post-review confirmation results — run `37778677667`

These are independently recomputed within-pair Stop-to-stub medians from the
`980877b` checkpoint. The same revision-2 gates and interpretation apply.

| Candidate mode | Preview Off | Preview On |
| --- | ---: | ---: |
| Waveform / Oscillogram | −30.5 ms | −40.1 ms |
| Log-Frequency Power Spectrogram | −1.2 ms | +6.1 ms |
| Linear-Frequency Power Spectrogram | +0.4 ms | −26.7 ms |
| Constant-Q Power Spectrogram | −1.3 ms | +39.7 ms |
| Circular Spectrum | +51.0 ms | −7.0 ms |
| No-overlay control | +18.5 ms | Not applicable |

All 88 aggregate gates pass. The largest positive paired Stop median is 51.0 ms.
Negative values do not establish inference acceleration, and median gates do not
prove that individual recordings have no latency spikes. Keep independent mode-job
hardware differences and synthetic insertion limits as described above. This run
also completed the fixed cache probe matrices reported below; it does not establish
the original pixel failure’s cause.

## Historical failures and protocol change

| Saved checkpoint | Observation and retained disposition |
| --- | --- |
| `37654138593`, `d3f56df…` | Small linear render lost detectable signal pixels; a real raster downsampling issue was corrected using cell pooling. Later renderer checks passed. |
| `37686194374`, `37686917439` and exploratory repetitions | Large final-inference variation also appeared without an overlay; one spliced/repeated 48-second fixture hit a preview timeout. A 44-case run failed CQT-Off latency and unchanged-Waveform-On maximum UI-p95 targets. These remain exploratory failures. |
| `37689421812`, `a7d6044…` | Waveform paired UI-p95 overhead 9.2543 ms exceeded 5 ms; one linear and one CQT trial dropped 8320 / 5120 visual frames. Full PCM was exact. Stream-flush ownership and queue headroom were subsequently refined. |
| `37762121955`, `9def8d87005be589f79187686fdb2ff2ae110673` | All 224 observations completed with exact PCM and no drops, but Preview-On log/linear/circular paired UI-p95 overheads 10.79475 / 5.3728 / 6.29845 ms exceeded 5 ms. Preview raster caching followed. |
| `37764925817`, first cache implementation | One no-overlay-job RGB pixel-oracle failure; no failing bitmap was saved. Separate review below. |
| [Package `37778683095`](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37778683095) | Dependency capture succeeded, then a compiler-provenance command query failed before native compilation. The resolved lock was retained; the command was corrected in build-input checkpoint `0956650`. This remains a failed package attempt. |
| [Package `37779796057`](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37779796057) | C2664 exposed an introduced test-helper signature mismatch: `RECT` versus the actual `OverlayRect`. The one-line test signature was corrected in the final source batch; successful consolidated Windows renderer/package validation is a delivery gate. No production renderer change was made. |

The original protocol used 42 short runs and two long runs. Revision 2 changed the
UI aggregation from maximum per-run p95 to median per-run p95 and added the paired
overhead gate before later confirmation data. It retained raw maxima and the
original failed reports. Continuous long speech is an additional fixture, not
proof that the old spliced-fixture timeout was fixed. See
[M5_STALL_REFINEMENT.md](M5_STALL_REFINEMENT.md) and
[M5_PREVIEW_CACHE.md](M5_PREVIEW_CACHE.md) for the saved refinements.

## Eight Codacy additions — individual review ledger

Line numbers below identify the reported source at `410094f`, not future edited
line numbers. These are eight additions for #56, not the total repository issue
count or the four historical M1 findings reviewed on #55. The new analyzer check
`113316719146` at `980877b` remains `action_required`, with five added findings:
C1–C4 and C8. The three maintainability additions C5–C7 are absent from the new
added-issue set. Its `fixedIssues: 3` refers to historical base AGENTS issues,
not those three cleanup findings; disappearance was checked by issue identity.

| ID | Severity / source at `410094f` | Report | Disposition / verification |
| --- | --- | --- | --- |
| C1 | High — `test/native/spectral-visualizer-test.cpp:209` | `audio == copy` always true | Retained intentional immutability assertion after queue overflow/drain/recovery. Reviewed path copies caller PCM into owned buffers; no caller mutation found. Portable spectral tests pass. |
| C2 | High — `test/native/spectral-visualizer-test.cpp:53` | `powerLevel(1e-8f) == 0` always true | Retained fixed-scale floor assertion: −80 dB maps to quantized zero. No floating tolerance is needed for the expected byte. Portable test passes. |
| C3 | High — `test/native/spectral-visualizer-test.cpp:51` | `powerLevel(0) == 0` always true | Retained silence/nonpositive-input boundary test. Production rejects nonpositive/nonfinite values before logarithms; portable test passes. |
| C4 | High — `test/native/recorder-streams-test.cpp:24` | `sink.flushes != before` always false | Retained no-implicit-flush regression. Tied-stream positive control, unchanged command bytes and explicit-response flush are verified; portable stream suite passes. |
| C5 | Warning — `test/native/spectral-windows-test.cpp:19` | Prefer member initializer list for `dc` | Valid style suggestion addressed in test source; lifetime/error checks retained. This addition is absent in the new analyzer report. Final Windows renderer/package validation remains the delivery gate. |
| C6 | Warning — `test/native/overlay-replay.cpp:73` | `main` is 125 lines, limit 50 | Valid maintainability finding addressed by named input/producer/UI/metrics helpers. Both replay variants ran in successful M5 confirmation `37778677667`; this addition is absent in the new analyzer report. |
| C7 | Warning — `test/native/spectral-windows-test.cpp:126` | `renderCase` is 52 lines, limit 50 | Valid maintainability finding addressed by extracting exact viewport checks; no mask, assertion or layout case removed. This addition is absent in the new analyzer report. Package C2664 exposed the helper’s RECT/OverlayRect signature error; the one-line correction requires the final Windows delivery gate. |
| C8 | Warning — `AGENTS.md:26` | Absolute settings/session policy lacks escape hatch | Retained intentional user-approved invariant: next-recording snapshots and selecting a style must not enable the overlay. An exception would weaken the required behavior. |

No rule suppression, broad tolerance, removed assertion or manufactured success
is authorized. A justified finding may remain visible in Codacy; record that
separately from a tested cleanup or a future clean analyzer result.

The detailed [Codacy review](CODACY_M5_REVIEW.md) records stable issue IDs, source
reasoning, helper-extraction invariants and completed local checks. Five findings
are deliberately retained assertions/requirements; three test-maintainability
findings have source cleanups and are absent from the new added-issue set. The
reviewed replay helpers now have independent Windows M5 evidence; the final
renderer/package build still has its own delivery gate after the test type repair.
The four assertions and the approved invariant deliberately remain in Codacy;
`action_required` is the actual status, not a green analyzer claim.

## Preview-cache pixel mismatch — separate disposition

The first cache run `37764925817` had one exact-RGB mismatch on the no-overlay
runner, while the other five pixel checks passed. The original assertion produced
no failure bitmap. `410094f` added failure coordinates/BMP captures; it did not
change production cache code or relax the assertion. All six later runners passed
the same equality test. Those facts establish neither a root cause nor a fix.

The [cache review](M5_CACHE_REVIEW.md) inspected the first failure log, independent
uncached oracle, invalidation/reset/destruction, paint/readback ordering and UI
resource ownership. No missing cache key, absent EndDraw, obvious use after free
or oracle algorithm change was identified. The original test already flushed GDI
before DIB access; adding a basic flush is therefore not a discovered fix. Its
ignored return value was a diagnostic gap. The cause remains unestablished.

The failed job's `off` label identifies a matrix runner; every job runs the same
standalone graphics test. It is not evidence that product Off mode creates a cache.
The original failure was the first cached-versus-uncached RGB comparison, not a
cache-hit or clipping failure. It lacks the coordinates/images needed to assign
a cause. Do not label it environmental or call diagnostic capture a production fix.

Bounded test-only probes retain exact RGB equality and production/oracle sources.
They check GdiFlush results, capture the exact compared arrays, reverse renderer
order and compare normal/disabled test-thread batching on a fixed schedule.
Each fully successful executable records 10 matrices, 1,220 case pairs, 6,110
exact pixel comparisons and 1,000 reset cycles. Failed matrices remain failures;
only the remaining predeclared matrices execute, and any failure returns nonzero.

**Windows probes passed in all six jobs of `37778677667` at `980877b`.** The
independently checked totals are **60 matrices, 7,320 case pairs, 36,660 exact pixel
comparisons and 6,000 reset cycles**, with no reproduced mismatch. Every job
completed its predetermined ten matrices; no failed case was filtered or retried
until favorable. Production cache and frozen oracle remain unchanged.

**Disposition:** carry the unestablished original cause as a disclosed, reviewed
residual risk into one integrated normal-use candidate, after its required package/
renderer checks. Source/oracle review and the fixed probes provide sufficient
bounded evidence for that review decision. They do not prove the old failure
was environmental, cannot recur or was fixed. A future mismatch must retain
the exact-array diagnostics and receive a concrete investigation; it must not
be hidden by tolerances, omitted cases or a green performance summary.

Preserve exact RGB equality, line metrics, cache-hit/invalidation/moving/clipping
checks, reset recovery and GDI cleanup coverage. If a production change follows,
repeat affected Windows rendering/performance validation before candidate delivery.
For a test-only repair, verify unchanged production fingerprints and record its
limits explicitly.

## Retained original package and renderer evidence

The recovered package artifact `11544347647` from run `37765265222` has ZIP
SHA-256 `326267f2119e0500440a73dc148482edd64c88a2a1544ace4c476609bfea5f4e`.
Its 1.2.0 win32-x64 VSIX is 5,486,817 bytes, SHA-256
`bb7e5eff9a59b813e3b771c072f0b644c58320ea682b32760937f8f7934c9b19`.
The VSIX digest and all 32 audit-listed payload hashes were independently checked.
The five compiled M1 modules (dictation, Whisper runtime, worker, transport,
preview coordinator) match the earlier M1 package.

The production-renderer artifact has 240 BMPs: five styles × three sizes × four
DPIs × preview Off/On × active/paused. This is 120 layout configurations with an
active and paused image for each. These synthetic-fixture renderer outputs are
not screenshots of the user's computer or user acceptance. Compact circular mode
with preview deliberately retains the existing small viewport.

The recovery source was verified against the exact Git tree and saved raw artifact
digests. It is not a backup of the full Git graph. The next review checkpoint and
selected integrated artifact belong in [M6_INTEGRATED_CANDIDATE.md](M6_INTEGRATED_CANDIDATE.md);
existing artifact identity must not be silently relabeled as a newer build.
