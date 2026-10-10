# M5 Codacy review and test cleanup

Reviewed: 8 October 2026. Repository: `gcalpay/vscode-universal-dictate`, draft
PR #56, based on draft PR #55 / `perf/stop-insert-latency`.

This record reviews the **eight added findings at `410094fb898e15170cd985ff1f7c060900b1873c`**
and the corresponding source. It does not convert the analyzer check into a
successful check, erase the earlier M1 review, or resolve the separate
[preview-cache investigation](M5_CACHE_REVIEW.md).

**Post-review analyzer result:** on `980877b095cbba7c5bd2b5f85794ef4a87332fd1`,
Codacy check `113316719146` remains **`action_required` with five additions**.
The three test-maintenance additions are no longer reported. The four deliberate
assertions and AGENTS settings requirement remain reported and are individually
justified below; none is suppressed or relabeled as an automatic pass.

## Evidence and scope

- Starting source tree: `bee76fa88913183d6089c1d2ced1c7b0350f505a`, recovered
  from the verified 8 October source/evidence bundle. Live branch identity was
  checked before this continuation's writes.
- [Analyzer evidence run `37765265234`](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765265234),
  artifact `11543713071`, archive SHA-256
  `05c90b36cf8b774019406bb889c4574f68fc7504bbe05235ff8df7c020ce54fa`.
- The archived `identity.json` identifies the exact head and a complete current
  report. `issues.json` has `analyzed: true`, eleven entries, pagination limit 100
  and total 11: **eight `Added` and three `Fixed`**. `metadata.json` has
  `isAnalysing: false`, `newIssues: 8`, and `isUpToStandards: false`.
- The check at the reviewed head was **`action_required`**. The collector's
  successful execution means that it retrieved the findings, not that the
  findings passed a quality gate.
- Cleanup is limited to `test/native/spectral-windows-test.cpp`,
  `test/native/overlay-replay.cpp`, and this review document. These changes do not
  edit production sources, the manifest, dependencies, workflows, assertion
  thresholds, or analyzer configuration. Other M5 closeout documentation belongs
  to the enclosing checkpoint.

Reported line numbers below refer to the original `410094f` source. Issue IDs and
function names remain the stable references after helper extraction.

## Individual dispositions

| # | Codacy issue ID | Tool / rule | Original location | Disposition |
| --- | --- | --- | --- | --- |
| 1 | `488dabce58ea9d8458d9ae67e336bc96` | Cppcheck / `knownConditionTrueFalse`, High | `test/native/spectral-visualizer-test.cpp:209` | **Intentional regression assertion; retained unchanged.** `testQueueAndOverflow` makes a separate PCM copy, exercises queue overflow, draining and recovery, and compares caller PCM afterward. Production `SpectralVisualizer::push` passes a read-only sample pointer to `PcmQueue::push`, which copies sample values into owned slots. The transform consumes owned buffers. Equality is the required result; proving it true for this implementation does not justify removing the future regression guard. No caller-PCM mutation was found in the reviewed path. |
| 2 | `60ddb3b299593987bf575570faa60ecf` | Cppcheck / `knownConditionTrueFalse`, High | `test/native/spectral-visualizer-test.cpp:53` | **Intentional expected-value assertion; retained unchanged.** `powerLevel` maps its fixed digital power reference through `10 * log10(power)`, clamps the −80 to 0 dB interval, and rounds to an 8-bit level. `1e-8f` is the floor input and must produce zero; the same expression checks unity and an above-range input against 255. Floating-point representation does not require a tolerance for this quantized expected byte. This is a fixed-scale boundary test, not redundant production control flow. |
| 3 | `c348591e3237e41ff5e662632f8d85df` | Cppcheck / `knownConditionTrueFalse`, High | `test/native/spectral-visualizer-test.cpp:51` | **Intentional silence/input-boundary assertion; retained unchanged.** Production rejects nonpositive or nonfinite power before taking a logarithm. The expression checks both zero and negative power return zero; the adjacent test also checks NaN. A true comparison is the expected result. No invalid logarithm or silence-color defect is established by this finding. |
| 4 | `84ab1b2118917dcd1fa5a18a36ccca1a` | Cppcheck / `knownConditionTrueFalse`, High | `test/native/recorder-streams-test.cpp:24` | **Intentional flush-ownership assertion; retained unchanged.** The test first ties an input stream to a counted output sink and reads one byte, proving that the positive control flushes. It then calls `configureRecorderCommandInput`, consumes the remaining bytes, and checks the tie is absent, the flush count is unchanged, and the command bytes are exact. A final explicit response flush must increment the count by one and preserve its bytes. `sink.flushes != before` being false is precisely the no-implicit-flush contract. |
| 5 | `1e47aad173e99767f029db3e2563d8f9` | Cppcheck / `useInitializationList`, Warning | `test/native/spectral-windows-test.cpp:19` | **Valid style suggestion; addressed in test source.** Initialize `SpectralCanvas::dc` directly with `CreateCompatibleDC(nullptr)` in declaration order in the constructor initializer list. DIB creation, allocation checks, exceptional cleanup, selected-object restoration, and normal destruction remain unchanged. No material production performance or correctness defect was established. Fresh analyzer confirmation is a separate check. |
| 6 | `3f8e112f49b315944a5df57d9100ea96` | Lizard / `nloc-medium`, Warning | `test/native/overlay-replay.cpp:73`, `main` | **Valid maintainability finding; addressed in test source.** Extract bounded command input, fixture production, UI sampling, resource collection, metrics serialization, and overlay setup into named helpers. Keep initialization and error handling in `main`. Preserve both frozen-M1 and candidate build paths and the original timing/report contract described below. This is a real organization change; the old 125-line function is not dismissed as an analyzer false positive. Fresh Windows and analyzer validation remain necessary. |
| 7 | `778011cad32ff92255aa562e4d584280` | Lizard / `nloc-medium`, Warning | `test/native/spectral-windows-test.cpp:126`, `renderCase` | **Valid maintainability finding; addressed in test source.** Extract `verifyVisualizationViewport` with the existing exact RGB mask, half-open viewport bounds, sentinel/background comparisons and nonempty-signal assertion. Keep all active/repeated/paused render checks, dimensions, filenames and layout loops. `snapshot()` still flushes GDI before reading pixels. No assertion or layout case is removed. Fresh Windows and analyzer validation remain necessary. |
| 8 | `ccac5e3b6e330df362de5ac33b763bda` | Agentlinter / `clarity_escape-hatch-missing`, Warning | `AGENTS.md:26` | **Intentional user requirement; retained unchanged.** Settings are session snapshots, and selecting a visualization style must not enable the overlay. An escape hatch would weaken the requested independent-settings behavior. The lack of an exception is deliberate, not missing executable error handling. |

The four High findings identify conditions that should be true or false in a
correct regression test. Their severity label alone is not evidence of a runtime
defect. Retaining them is an explicit source-review disposition; no issue is
silently marked fixed or ignored in Codacy, and no analyzer rule is suppressed.

## Replay extraction contract

The replay shell is test-only, but changing it can affect later measurement
evidence. The cleanup preserves these details for both compile-time variants:

- The fixture decode, output path, overlay size/span, and `memoryBefore` sample
  retain their original order. The pre-capture vector reservations are unchanged.
- The command reader retains its 8,448-character bound, overflow-line discard,
  CRLF handling, STOP/CANCEL behavior, pause forwarding, preview forwarding and
  end-of-input cancellation. Candidate input remains untied; the frozen-M1
  build retains its original stream configuration.
- The producer still feeds 160-frame blocks at the original 16 kHz schedule,
  uses the same acquire/release atomics and records callback duration followed
  by producer lateness. It never opens a microphone.
- Each UI tick still measures message pumping, pause acknowledgement/preview
  IPC, visualization update, explicit level output, and total tick duration in
  that order. Sleeps remain outside the UI tick duration. The 180-second guard,
  READY notification and one REPLAY_END notification are unchanged.
- Thread joining precedes wall/CPU/resource collection. Active memory and GDI
  counts are read while the overlay is alive; the after-close GDI count follows
  `destroyOverlay()` and encoder close. Candidate drop/storage/high-water values
  still come from the same visualizer; the frozen-M1 values remain zero.
- All JSON field names, their order, distributions and numerical formulas are
  retained. STOPPED/CANCELLED handling, output-file removal on cancellation,
  report-write failure handling, and the completed-replay return status remain.

This preserves the measurement definitions. It does not claim that separately
compiled harness binaries or subsequently measured timings will be byte-identical
to the prior run. The original 224-observation report remains evidence for the
original source/harness checkpoint; no historical measurements are rewritten.

## Local verification and remaining checks

Completed during this cleanup in the Linux review environment:

- Built and ran the unchanged spectral suite with C++20, `-O2`,
  `-Wall -Wextra -Werror -pedantic -pthread`; it passed, including the retained
  PCM and power-scale assertions.
- Built and ran the unchanged recorder-stream suite with C++20, `-O2`,
  `-Wall -Wextra -Werror -pedantic`; it passed its tied-stream positive control,
  no-implicit-flush check, exact command bytes and explicit-response flush check.
- Ran both existing performance-contract test files with Node's test runner:
  five tests passed, including paired-observation completeness and deliberate
  regression rejection. These are aggregator tests, not a new Windows replay.
- Compared the two edited test files with the verified bundle: each file retains
  the full multiset of original string literals, including assertion messages and
  protocol/JSON strings. Reviewed the extracted statements and ordering directly;
  literal equality alone is not a proof of semantic equivalence.
- The refactored `main` occupies 36 physical lines and `renderCase` 45. The new
  helpers are individually below 50 physical lines. These conservative source
  counts establish that the organization addresses the reported length concern;
  they are not a fresh Lizard/Codacy result.

The environment did not provide a Windows compiler/runtime, Cppcheck or Lizard.
Therefore the edited Windows harnesses have **not** been represented here as
compiled, executed, or analyzer-cleared. Required enclosing-checkpoint checks are
Windows compilation of the renderer test and both replay variants, the existing
renderer/callback checks, appropriate internal replay verification, and a fresh
analyzer report. Keep this distinction explicit when recording those later runs.

The current-head collector run
[37778683136](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37778683136),
artifact `11551142499`, produced a complete analyzed report for `980877b`.
Its five `Added` entries are exactly issues 1–4 and 8 in the table. Issues 5–7
are absent after the cleanup. The report also contains three `Fixed` entries
for older base-branch AGENTS findings; that separate counter must not be
attributed to these three cleanup additions.

Both replay variants compiled and ran in all six jobs of M5 run `37778677667`;
all 224 observations and 88 gates passed. The renderer-test extraction separately
exposed a C2664 type error in Windows package run `37779796057`: the helper used
Win32 `RECT` while the actual layout returns `universal_dictate::OverlayRect`.
The helper signature is corrected to that existing layout type, preserving the
comparison body. Keep the failed run; final Windows compilation and renderer
execution are required before delivery and recorded with the delivered audit.

Five deliberate source constraints/assertions remain documented and reported.
The analyzer is not green, and a successful evidence-collector job is not an
analyzer pass. No rule, severity or regression assertion was weakened.
