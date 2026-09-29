# Agent guidance

Read [docs/M3_2_PREVIEW_PIPELINE.md](docs/M3_2_PREVIEW_PIPELINE.md) first for the
current pipeline preparation and remaining integration gates. Actual M3.1
measurements are in [docs/M3_1_RESULTS.md](docs/M3_1_RESULTS.md); the original
benchmark design is in [docs/M3_1_PREVIEW_FEASIBILITY.md](docs/M3_1_PREVIEW_FEASIBILITY.md).
[docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md) is the
roadmap. The M2 product contract remains in
[docs/M2_CLIPBOARD_MODE_FIX.md](docs/M2_CLIPBOARD_MODE_FIX.md); historical M2
review findings are dispositioned in [docs/M2_CODACY_TRIAGE.md](docs/M2_CODACY_TRIAGE.md)
and PR #51. Do not restart completed M2 acceptance or restore its rejected design.

## Current checkpoint

M1 and M2 are accepted and merged. M3 starts from the M2 merge commit
`479ca6be4cd114372d0eece9db9962e42b3e6ba5` on `feat/live-transcript-preview`.
The user approved M3.1 feasibility work, skipped M4, and parked M5 outside 1.0.0.
Remaining release route: M3 -> M6 integrated validation/release candidate ->
separately approved 1.0.0 publication. Keep the milestone numbers; no M4/M5 branch.

The reported language behavior was explained by selecting a language different
from the speech. Keep the Language label and current behavior; add the approved
README note about local offline translation when languages are mismatched. No
translation toggle or language-correctness milestone is in the current scope.

M3.1's real Windows benchmark completed; the verified artifact supports a bounded
trailing eight-second prototype rather than repeated full-recording prefixes.
Auto remains Auto; it measured slower than explicit English. Do not promise a
two-second end-to-end latency or treat synthetic runner speech as user-machine,
natural-speech or live-overlay evidence.

M3.2 now connects the bounded PCM handoff, framed recorder channel, cancellable
Whisper preview HTTP and recording-engine lifecycle. Live preview has an explicit
On/Off setting in VS Code Settings and the sixth gear entry, defaults Off, and is
snapshotted with Language and visualization before each recording. No hidden
preview decoding for Status bar only / Off. Initial native overlay display is
connected; M3.3 presentation verification and M3.4 user acceptance remain.

The user authorized continuing M3.2 and its normal commits/CI, including the
optional setting. Do not ask for repeated approval of each routine integration
commit. Significant scope changes, M3 merge and release still require approval.
See the pipeline ledger and PR #52 for current test/Windows evidence, not the
older preparation-only status. Do not equate local tests with Windows acceptance.

## Workflow and approval boundaries

- One milestone = one branch; all M3 submilestones stay on this branch.
- Inspect current refs before writing; do not overwrite unrelated changes.
- Continue the authorized M3.2 integration with Conventional Commits and normal
  checks. Dependency/backend changes and significant design deviations still
  require approval. Distinguish prepared, committed, executed and untested work.
- User VSIX testing occurs at M3.4, not each intermediate submilestone. Diagnostic
  runner outputs are not a request to install or retest the M2 extension.
- Merge only after the final M3 candidate is accepted and merge is approved.
  M6 version change, release tag and Marketplace publication need approval.
- Changes in this chat occur in its sandbox or on GitHub, never on the user's PC.
- Keep frozen launcher and Code OSS diagnostic branches isolated.
- Review new analyzer findings from actual evidence; do not disable protections
  or assume prior false-positive dispositions apply to new findings.

## M3 and retained product invariants

- Provisional words appear only in the existing non-activating recording overlay;
  do not repeatedly type hypotheses into any editor or composer.
- Preserve the complete recording independently of bounded preview snapshots.
  One authoritative final transcript is retained and inserted once after Stop.
- Latest-only scheduling; bounded work/memory; session identity rejects stale
  callbacks. Preview failure must not destroy audio or normal final transcription.
- Measure active-preview cancellation/final-priority behavior. Dropping a result
  does not by itself stop a native decode.
- Keep Small/Medium/Large sizes and Medium default. No focus activation or silent
  overlay enlargement. Preview is initially opt-in; no new backend/model/cloud.
- Keep Windows UI-host/Remote-WSL architecture and local inference after setup.
- Automatic clipboard Off performs no reads/writes/inspection/restoration. On
  copies the exact final transcript once before the same direct Unicode input;
  do not restore stale clipboard data. Copy Last Transcript is a separate explicit
  command backed by memory-only retained text. Preserve M2 lifecycle/WAV cleanup.
- Never synthesize Enter or automatically submit/send. No automatic retry of
  uncertain input. Cancellation cannot retract already-submitted events.
- Latest deliberately selected editable target/caret remains the intended target.
  Issue #38 is unresolved: clipboard backup is a recovery workaround, not proof
  of status-bar focus preservation. M5 is parked, not claimed fixed or closed.
- No private Codex internals, global mouse hooks, click replay or required custom
  VS Code build in the released extension.
