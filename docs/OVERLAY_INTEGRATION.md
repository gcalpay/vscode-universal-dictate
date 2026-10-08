# Overlay integration — current M5 closeout and M6 preparation

Verified continuation baseline: `feat/overlay-visualizations` at
`410094fb898e15170cd985ff1f7c060900b1873c`, tree
`bee76fa88913183d6089c1d2ced1c7b0350f505a`, 8 October 2026.
Draft PR #56 is stacked on draft PR #55 / `perf/stop-insert-latency` at
`d4c52d2d153545a7a8bef6ed1680261e199ef22b`. Accepted 1.1.0 `main` remains
`8017f1950bbacb67c37add2c31315e7a6139bcd3`.

## Current state and navigation

M0/M1 and all five visualization implementations are saved. M5 run
[37765259320](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765259320)
completed successfully: **224 observations and 88 passing aggregate gates**.
Resume review closeout and integrated-candidate preparation; do not restart M0–M4.

| Area | Current record |
| --- | --- |
| Implemented settings, DSP and rendering | [OVERLAY_VISUALIZATIONS.md](OVERLAY_VISUALIZATIONS.md) |
| Current performance protocol | [M5_CONFIRMATION_PROTOCOL.md](M5_CONFIRMATION_PROTOCOL.md), revision 2 |
| Source/run identity, result interpretation and review dispositions | [M5_REVIEW_CLOSEOUT.md](M5_REVIEW_CLOSEOUT.md) |
| One integrated candidate, acceptance/freeze, separate M7/M8 safeguards | [M6_INTEGRATED_CANDIDATE.md](M6_INTEGRATED_CANDIDATE.md) |
| Internal regression and normal-use acceptance procedure | [TESTING.md](TESTING.md) |

Historical documents and npm scripts reuse milestone numbers. In particular,
`M6_RELEASE.md` records the old 1.0.0 release process and `M7_PAUSE_RESUME.md`
records the old pause milestone. They are not current M6/M7 authorization.

## Approved workflow

The user removed individual M1/M2/M3/M4 manual VSIX gates. Continue internal
validation and renderer inspection in bounded, recoverable batches. Preserve a
coherent source/evidence checkpoint after each batch. Deliver one integrated
candidate containing M1 and all five styles after internal review, with normal-use
acceptance. There is no prescribed repeated dictation, per-run diagnostics or
screenshot exercise. Do not require installation of the older 1.1.3 M1 candidate.

Only if timing evidence is needed, use one accumulated **Show Latency Report**
document (latest 100 completed records, lost on reload unless saved). Do not
merge, tag, publish or replace public history before integrated acceptance and the
separate M7/M8 safeguards. Preserve PR #55 and its evidence.

## Implemented scope and preserved behavior

**Enhanced Overlay Visualization** independently selects Waveform / Oscillogram
(default), Log-Frequency Power Spectrogram, Linear-Frequency Power Spectrogram,
Constant-Q Power Spectrogram or Circular Spectrum. All modes are implemented.
Selecting a style does not enable the overlay or change the active recording;
settings are snapshotted before asynchronous preparation for the next recording.

Preserve the isolated M1 final/preview workers, model and inference parameters,
accepted waveform, status-bar behavior, seven independent settings, Pause/Resume,
clipboard policy, non-activating controls and final-only insertion. Waveform,
Status bar only and Off do not perform spectral analysis. Do not replace current
source with an earlier 1.1.0-based visualization bundle. Issue #38 stays outside
this release's scope.

## Completed automated comparison

Revision 2 uses six independent Windows jobs. Each compares its candidate style
against frozen M1 on the same runner and warm final worker, with ten adjacent
AB/BA pairs per effective preview condition. Five styles × two preview states
produce 200 short observations; the no-overlay control adds 20. Linear and CQT
each add a baseline/candidate pair using 48 seconds of continuous generated
speech. Total: 224 observations, 112 per policy, 11 short conditions and 88 gates.

The replay uses real callback/WAV writing, Win32 rendering/message handling,
production Node/native IPC, preview coordination and pinned Whisper inference.
Audio is synthetic English; insertion is a no-op stub. Within-job paired deltas
are the comparison, not absolute times across jobs with different allocated CPUs.
The result is not an actual microphone/VS Code/Codex/WSL latency measurement.

Windows package run
[37765265222](https://github.com/gcalpay/vscode-universal-dictate/actions/runs/37765265222)
also passed native/render/preview/package checks. Its synthetic PR checkout tree
matches the feature tree; this does not mean either PR was merged. See the
closeout record for exact artifact hashes and unresolved review status.

## Historical protocol and failure retention

The original plan was 42 short observations using three repetitions plus two long
runs. It is superseded by revision 2 and must not be used as the current gate.
Its maximum-per-run UI-p95 target failed even on unchanged Waveform. Revision 2
explicitly changed UI aggregation to median per-run p95 ≤25 ms and median paired
p95 overhead ≤5 ms before subsequent confirmation data; it retained raw maxima.

Earlier failed runs, including `37689421812` and `37762121955`, remain failures.
The first cache-validation RGB mismatch at `37764925817` also remains a distinct
review item. Latest green jobs do not establish its cause or clear Codacy.
See the individual records in [M5_REVIEW_CLOSEOUT.md](M5_REVIEW_CLOSEOUT.md).
