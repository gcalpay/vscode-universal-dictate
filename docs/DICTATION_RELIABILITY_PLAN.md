# Universal Dictate implementation roadmap

Updated: 2026-10-01. Repository: `gcalpay/vscode-universal-dictate`.

This is the current implementation handoff. It replaces the earlier out-of-order milestone numbering. Historical planning and focus-diagnostic evidence remain available through pinned commits/branches, but the active milestone numbers below are chronological. M2 follows the user-approved [direct-input / optional-overwrite correction](M2_CLIPBOARD_MODE_FIX.md); the restoration design and recovery submenu are archived, not active requirements.

## Active milestone — M7 approved 2026-10-01

M1/M2/M3/M6 are complete in the accepted 1.0.0 merge
`eda02a512d3feb70989b89a3efc6714d12b833e7` (PR #53). The user reports
Marketplace publication. M4 remains skipped and M5 parked; Issue #38 stays open.

Current work: `feat/pause-resume-controls` / PR #54, targeting 1.1.0. Scope is
Pause/Resume, compact symbol-only overlay buttons, efficient vertical layout, ten-second waveform
default and an external-Windows-input README clarification. See
[M7_PAUSE_RESUME.md](M7_PAUSE_RESUME.md) for semantics, validation and review gates.
Implementation/builds are authorized. Merge and publication require user acceptance
of the finished candidate; the earlier M6 authorization does not authorize this.

## 1. Branch and review policy

**One milestone = one branch. Submilestones do not get separate branches.**

| Milestone | Branch after previous milestone is accepted |
| --- | --- |
| M1 Overlay size presets | `feat/overlay-size-presets` |
| M2 Transcript reliability | `fix/transcript-recovery` |
| M3 Live transcript preview | `feat/live-transcript-preview` |
| M4 Translation | Skipped for 1.0.0; no branch |
| M5 Insertion-target preservation | Parked outside 1.0.0; no branch |
| M6 Integrated validation/release | `release/next` (complete) |
| M7 Pause/Resume and controls | `feat/pause-resume-controls` |

Workflow for every milestone:

1. Start the milestone branch from the then-current `main`.
2. Implement all submilestones on that same branch.
3. Run the smallest relevant automated checks, then supply the final milestone Windows VSIX with a short relevant checklist. Intermediate automated builds are not user-test gates.
4. Stop for the user's review.
5. Merge only after the user confirms the milestone behaves correctly.
6. Only after that merge create the next milestone branch from updated `main`.

If a milestone is blocked or rejected, do not merge it just to preserve sequence. Continue fixing the same branch, or close/park it after the user's decision and create the next branch from unchanged `main`.

Milestone planning alone does not authorize publication. M7 must remain unmerged and unpublished until the user reviews and accepts its finished Windows VSIX.

M1, M2 and M3 are accepted and merged through PRs #50, #51 and #52 respectively. M6 is complete; M7 is the current branch/PR. Keep the frozen launcher and Code OSS diagnostic branches isolated from ordinary product work.

## 2. Historical 1.0.0 preparation baseline

The following was recorded before the 1.0.0 merge. Current work is defined above:

- Current `main`: `d1408904409c8636a4ffada6ef342a5d04b6ed3a`, the accepted M3 merge from PR #52.
- M6 release work is on `release/next` / PR #53 at version 1.0.0.
- Windows UI extension host, including Remote - WSL.
- Recorder: native miniaudio/WASAPI, 16 kHz mono PCM16 WAV.
- Enhanced overlay: native non-activating recording panel with waveform, Insert and Discard.
- Overlay sizes: Small ~380 x 64, Medium ~520 x 88, Large 740 x 128; Medium is the default/fallback.
- Visualization modes: Both, Enhanced overlay, Status bar only and Off.
- Enhanced waveform history: 1, 3, 5, 10 or 20 seconds; default 1 second.
- ASR: multilingual Whisper `base`, warm local `whisper-server`, one-shot `whisper-cli` fallback.
- M2 direct Unicode input is current. Automatic clipboard overwrite is optional and Off by default; Off does not access the clipboard. Copy Last Transcript is memory-only recovery.
- M3 live preview is implemented and accepted. It is opt-in and Off by default, uses bounded/coalesced local inference in the enhanced overlay and never inserts provisional text. The complete recording remains authoritative after Stop.
- The 1.0.0 release default Language is English; Auto-detect and all 99 languages remain selectable. Explicit saved user choices are preserved.
- M1 PR #50, M2 PR #51 and M3 PR #52 are complete and merged.
- M4 translation is skipped for 1.0.0. M5 genuine status-bar focus preservation is parked.
- Issue #38 remains unresolved for the genuine status-bar mouse workflow.

Historical branches that must not be merged into ordinary feature work:

- `fix/preserve-insertion-target` at `5df91c3561ac31bd20f30d829d323347757469bf`: alternative native launcher.
- `experiment/m1.2-statusbar-focus-probe` at `834a1001ef5ef49da36710eb4d2445d600f89f9a`: isolated Code OSS diagnostic. Run `34735635848` produced a successful probe kit but failed both host jobs; the H1 job reached packaging and ended with `spawn signtool.exe ENOENT`. That is build evidence, not a focus result.

## 3. Product invariants

These requirements remain settled across every milestone. Target/caret preservation is the M5 product goal, not a capability proven by the current M2 helper:

- The intended target is the latest deliberately selected editable input plus its latest caret/selection until final insertion.
- Deliberate target/caret/selection changes during recording or final processing win.
- Clicking Universal Dictate Dictate/Stop/Insert controls is not deliberate retargeting.
- Without a deliberate change, preserve the user's intended target and selection.
- Intended selection replacement remains the target behavior. M2 direct input is not clipboard-based paste and cannot prove an opaque target's caret/selection.
- Never synthesize Enter, Tab or Backspace or automatically submit/send. Control characters become spaces in direct input; multiline formatting is not guaranteed.
- Cancellation before dispatch prevents insertion; cooperative cancellation stops remaining input but cannot retract events already submitted to Windows.
- Retain a successful non-empty final transcript before insertion so an insertion or optional-copy failure cannot destroy the only recoverable copy.
- Off (default): automatic dictation does not read, write, inspect, temporarily replace or restore the clipboard. On: copy the exact transcript once before attempting the same direct input; never restore old clipboard contents. Later user/application copies win.
- Copy Last Transcript explicitly overwrites the clipboard regardless of the automatic setting. Retained text is separate memory-only state. No automatic retry or deferred reinsertion.
- Preserve supported external Windows text inputs and Remote - WSL.
- If target loss is known and there is no newer deliberate valid target, retain/recover text instead of guessing.
- Local/offline transcription remains the product default after model setup.
- Do not use private Codex DOM/internals, global mouse hooks, click replay or mandatory custom VS Code builds in a released extension.

A recovery feature, different launcher, smaller overlay, preview or translation is not evidence that Issue #38 is fixed.

## 4. M1 — Overlay size presets

**Branch:** `feat/overlay-size-presets`.

**Status:** accepted and merged through PR #50. Merge commit: `481913feb88ad16aca00da744dd2fe72cd90ef98`. The user tested the Windows VSIX and confirmed the three sizes behaved as intended; Medium was then selected as the default/fallback.

Goal: add Small, Medium and Large versions of the current enhanced recording overlay without changing recording/transcription semantics.

Initial logical layout targets:

| Value | Label | Starting target |
| --- | --- | --- |
| `small` | Small | about 380 x 64 |
| `medium` | Medium | about 520 x 88 |
| `large` | Large | current 740 x 128 reference |

These are design targets, not permission to make text/buttons unreadable. The user evaluated the three variants on Windows and selected Medium as the default/fallback.

### M1.1 — Setting and propagation

- Add `universalDictate.overlaySize` with `small`, `medium`, `large`.
- Expose it in VS Code Settings and the existing Universal Dictate settings picker.
- Validate missing/invalid values to `medium`.
- Snapshot the size at recording-session start.
- Pass it through `src/extension.ts` -> `src/recorder.ts` -> `src/core/recorder.ts` -> native recorder, using a validated native argument such as `--overlay-size`.
- Preserve existing callers/defaults, visualization modes and waveform time-span behavior.
- Status bar only / Off must not create a native overlay because a size is configured.

**M1.1 exit:** TypeScript compiles, focused tests prove default/validation and argument propagation, and no native layout has been redesigned beyond what is needed to accept/validate the option.

### M1.2 — Native shared layouts and DPI

- Use one enhanced renderer with shared layout metrics for window bounds, waveform, labels, fonts and Insert/Discard hit rectangles.
- Drawing and mouse hit testing must use the same metrics.
- Do not revive the old compact visualization as a second style and do not scale the finished bitmap blindly.
- Define one logical-to-device DPI transform and recalculate when required by monitor/DPI changes.
- Keep the overlay inside the monitor work area, including negative virtual coordinates.
- Preserve non-activation behavior and native resource cleanup.
- Do not change audio capture, sample rate, waveform history semantics, recording length or Whisper behavior.

### M1.3 — Tests and user review gate

Run targeted configuration/layout/native tests, TypeScript checks, Windows native compilation and VSIX packaging. Manually test Small/Medium/Large at 100%, 125%, 150% and 200% scaling plus mixed-DPI/multi-monitor where available. Verify Insert/Discard hit areas, keyboard controls, Both/Enhanced/Status bar only/Off and Remote - WSL.

Produce a concrete artifact/screenshots for the user. **Stop for review.** Do not create M2 until M1 is approved and merged.

## 5. M2 — Transcript, optional clipboard overwrite and lifecycle reliability

**Branch:** `fix/transcript-recovery`, created from `main` at `481913feb88ad16aca00da744dd2fe72cd90ef98` after the accepted M1 merge.

**Status:** complete, accepted and merged through PR #51 at `479ca6be4cd114372d0eece9db9962e42b3e6ba5`. The user accepted the corrected `eaf0570` runtime and authorized the merge without another VSIX after review found no required runtime change. See [M2_CODACY_TRIAGE.md](M2_CODACY_TRIAGE.md) and the final PR addendum for the completed review.

The original M2.1-M2.4 work remains in history. Its restoration transport and Last transcript submenu were rejected and superseded. The numbered substeps below describe the corrected contract; do not reimplement retired behavior. See [M2_CLIPBOARD_MODE_FIX.md](M2_CLIPBOARD_MODE_FIX.md) for exact artifact identity, evidence, limitations and remaining gates.

### M2.1 — Retain one completed transcript and expose explicit Copy

- Retain the exact latest successful non-empty final transcript in this window's extension memory before insertion.
- Empty/no-speech/cancelled/failed transcription must not replace it; insertion or optional-copy failure must not erase it.
- A later successful non-empty transcript replaces it. Copying unrelated clipboard content does not. Reload/restart clears memory-only recovery; it is not persisted history.
- Keep **Universal Dictate: Copy Last Transcript**, command `universalDictate.copyLastTranscript`, in the Command Palette. This explicit action overwrites the clipboard regardless of the automatic setting.
- The old Last transcript submenu and public Insert/Clear recovery commands are removed. Overlay Insert remains the Stop/transcribe/insert recording control.
- Never automatically retry uncertain insertion or queue old insertion behind newer work.

### M2.2 — Direct Unicode input and optional clipboard overwrite

| Overwrite clipboard | Automatic insertion | Clipboard |
| --- | --- | --- |
| Off (default) | Attempt direct Unicode input | No reads, writes, inspection, temporary replacement or restoration |
| On | Attempt the same direct input | First copy the exact transcript once, overwriting existing contents; never restore the old clipboard |

- The fifth gear entry toggles `universalDictate.overwriteClipboard` directly. Only literal `true` enables automatic copying. Snapshot it before recording preparation; changes apply to the next session.
- No usable focused target means Off creates no automatic clipboard backup. On leaves the copied transcript available unless a later user/application copy replaces it.
- Optional-copy failure is reported but does not prevent the independent direct-input attempt. Do not retry uncertain input.
- `windows-text-input.exe` has no clipboard operations. `--unicode-input-v1` / `UDTI1` replaces the retired protocol; the host keeps stdin open as the operation-lifetime signal.
- Input is bounded and cancellation-aware. Control characters become spaces in direct input; the optional clipboard copy retains the exact final transcript.
- The format whitelist, snapshot/restore transport and legacy paste binaries are removed, not alternative fallback paths.
- User acceptance recorded 2026-09-29: normal dictation works and Overwrite clipboard behaves as intended. Do not request the Off/On clipboard test again unless a later runtime change affects it.

Regression coverage must distinguish Off with text/empty/non-text clipboard data; On copying once; later user/application copies; optional-copy failure with input still attempted; retained recovery after failed insertion; no automatic retry; and session-stable settings. Snapshot/restore tests are not requirements for this replacement transport.

### M2.3 — Lifecycle/session-generation hardening

The implemented operation/session ownership, cancellation and recorder/WAV cleanup protections remain part of corrected M2. Preserve them rather than restarting an engine rewrite.

Regression coverage includes duplicate Stop and early overlay actions; disposal during preparation/recording/transcription; recorder/transcription failure; obsolete callbacks/results; stale controls or insertion; confirmed recorder closure before cleanup; and reported shutdown/cleanup failures. Cancellation cannot undo input already submitted.

The [M2.3 ledger](M2_3_LIFECYCLE.md) records the historical implementation checkpoint. Its clipboard-v2 protocol is superseded; its original test counts are not the corrected transport's results.

### M2.4 — Integration and automated validation

- Preserve M1 regressions, native compilation, full-project checks, recovery/UI/lifecycle tests and revised Unicode/request/lifetime-pipe tests.
- Audit the actual VSIX for Off default, Copy-only recovery, correct native helper/protocol, compiled payload identity and absent legacy/diagnostic components.
- Corrected-source Linux CI `36506468768` and Windows package run `36506468804` succeeded. Delivery evidence records the package audit and payload-hash verification.
- Real input tests used a disposable scratch Win32 EDIT, not a Codex composer. They do not establish intended-target or caret preservation.
- M2 Codacy review is complete. The final-head report contained 12 Added findings: five security false positives, four intentional policy warnings, one nonblocking documentation warning and two deferred style/maintenance suggestions. Codacy itself remained `action_required`; no rule or threshold was weakened. See the triage ledger and final PR addendum.

### M2.5 — Acceptance and merge completed

The user accepted the corrected candidate and authorized merging without another
VSIX when no runtime correction was required. That condition was verified and
PR #51 was merged. Keep the already installed corrected candidate; M3.1 adds no
runtime changes. Historical M2 ledgers record previous checkpoints, not remaining
acceptance work. Any future runtime change needs its own relevant validation.

## 6. M3 — Live transcript preview

**Branch:** `feat/live-transcript-preview`, created from updated main after M2 review/merge.

**Status:** complete, accepted and merged through PR #52 at
`d1408904409c8636a4ffada6ef342a5d04b6ed3a`. The subsections below are the
historical implementation/acceptance record; their remaining-gate language is not
current release work.

Goal: show provisional words in the native recording overlay while the user speaks, while still inserting only one authoritative final transcript after Stop.

**v1 must not repeatedly type partial hypotheses into the target input.** Partial Whisper output can change; continuous target insertion would create selection, undo, focus and correction problems that belong to a different feature.

### M3.1 — Feasibility and latency measurement

**Initial backend measurement reviewed:** [M3.1 results](M3_1_RESULTS.md) record the completed Windows run and bounded eight-second prototype decision. [M3.2 pipeline](M3_2_PREVIEW_PIPELINE.md) records the prepared scheduling core and remaining native/runtime integration. These results do not establish natural-speech accuracy or user-machine/overlay latency.

The current recorder emits level events and writes the final WAV. The current warm server receives complete audio files through HTTP. Do not assume whisper.cpp's console `print_realtime` option creates a streaming HTTP API.

Test the smallest local approach for supplying bounded, valid audio snapshots to the existing warm inference worker. Compare at least:

- growing/current-session snapshot decoding
- explicit bounded preview WAV snapshots from the recorder if needed

Measure visible-text latency, decode duration, CPU/RAM pressure and behavior during longer speech. Pick one approach before broad UI work.

### M3.2 — Preview inference pipeline

**Integrated prototype:** [M3.2 source/test status](M3_2_PREVIEW_PIPELINE.md). Native PCM, cancellable HTTP, engine lifecycle and the opt-in setting are connected. Windows adapter timing, presentation validation and final user acceptance remain explicit gates.

- Only one preview decode may be active per session unless measured concurrency is justified.
- Use latest-only/coalescing scheduling; never build an unbounded queue.
- Tag results with session/generation IDs and discard stale results.
- Snapshot Language and preview configuration at session start so provisional and final output use the same session settings.
- Give final transcription priority; validate active-request cancellation against the pinned worker rather than merely ignoring late text.
- Preview failures must not stop recording or destroy the final recording.
- Preserve the full audio needed for authoritative final transcription.
- Normal final transcription/fallback remains available even if preview is disabled or fails.

### M3.3 — Overlay integration

Presentation implementation and validation gates: [M3_3_PREVIEW_PRESENTATION.md](M3_3_PREVIEW_PRESENTATION.md). Off remains the default.

Add an opt-in live-preview setting initially.

- Show provisional text in the existing enhanced overlay.
- Small may show a short latest-text line; Medium/Large may show more wrapped text.
- Trade waveform space for text rather than automatically enlarging the chosen overlay size.
- Preview updates must not activate the overlay or affect target focus.
- Status bar only / Off retain their existing semantics unless separately approved.

### M3.4 — Finalization and gate

On Stop, stop scheduling preview work, discard stale preview responses, compute/obtain the authoritative final transcript, retain it under M2 rules and insert exactly once.

Test pauses, repetitions, silence, long recording, slow preview, worker failure, rapid start/stop and consecutive sessions. Then stop for user review and explicit M3 merge approval before M6; M4 is skipped and M5 is parked.

## 7. M4 — Optional translation (skipped for 1.0.0)

The user explicitly skipped this milestone. No `feat/translate-to-english` branch,
translation toggle, output-language selector or live translated-caption feature
is part of 1.0.0. Keep existing Language behavior and the approved README note.
Historical design remains in the roadmap at the M2 merge commit.

## 8. M5 — Genuine insertion-target preservation (parked outside 1.0.0)

The user accepted clipboard recovery as the current workaround and chose not to
require this milestone for 1.0.0. Do not create `fix/statusbar-focus-preservation`
or merge frozen experiments as part of the 1.0.0 release.

Issue #38 remains open. Optional clipboard backup does not prevent the genuine
status-bar item from changing focus and does not restore an opaque composer/caret.
Document that limitation in the release; do not advertise universal target
preservation. Reopening M5 requires a separate product decision. Historical
experiments and acceptance matrix remain available at the M2 merge commit.

## 9. M6 — Integrated validation and release (historical, complete)

**Branch:** `release/next`, created from updated main after accepted M3 merge. M4 is skipped and M5 is parked. The candidate behavior is accepted; final presentation/doc reconciliation, exact package verification and the authorized release/publication sequence are the remaining M6 work.

### M6.1 — Integrated regression

Run applicable automated tests and real Windows checks across all merged features. Re-run the complete insertion-target matrix only if M5 claims a literal fix; otherwise keep Issue #38 explicitly unresolved.

### M6.2 — Release package and durable docs

Inspect the actual VSIX contents. Update README, CHANGELOG, settings help, testing/architecture notes and version metadata to describe only behavior that actually shipped. Keep diagnostic-only code and test shortcuts out of the VSIX.

### M6.3 — Final release and publication

The user accepted the candidate behavior and explicitly authorized merge/tag/GitHub
Release/Marketplace publication after the final presentation/doc update passes
verification. Publish only the exact verified final VSIX. Stop if artifact/source
identity, CI/package verification or publication capability is genuinely blocked.

## 10. Acceptance map

Existing focus/recovery IDs from the earlier specification remain useful:

- T01-T10: full focus-preservation claims are parked with M5; M6 validates supported workflows and documents Issue #38 rather than claiming it fixed.
- T11: overlay size/DPI/hit-area regression -> M1/M6.
- T12: memory-only retained final transcript and explicit Copy Last Transcript -> M2/M6.
- T13: automatic Off leaves the clipboard untouched; On copies once without restoration; newer copies win -> M2/M6.

The retired Insert/Clear menu and snapshot/restore cases are historical, not active T12/T13 requirements.

Additions:

| ID | Milestone | Acceptance |
| --- | --- | --- |
| T14 | M3 | Provisional text updates while speaking without any target paste before Stop |
| T15 | M3 | Slow/stale preview results never cross session boundaries or overwrite newer preview |
| T16 | M3 | Preview failure leaves recording and final transcription usable |
| T17 | M3 | Small/Medium/Large remain usable with preview enabled and do not grow outside the chosen preset |
| T18 | M3 | Final Stop inserts one authoritative transcript without duplicated preview fragments |
| T19-T21 | M4 | Skipped with the dedicated translation milestone; not 1.0.0 gates |
| T22 | M3 | Language and preview settings are session-stable; changes affect the next session |

Every manual result records commit/artifact, Windows/VS Code/Codex versions, local/WSL, target, display scaling where relevant, controls used, expected/actual result and Pass/Fail/Blocked/Not run. Never replace real GUI evidence with compilation.

## 11. Current handoff

Continue M7 on `feat/pause-resume-controls` / draft PR #54. Main remains the accepted
1.0.0 merge `eda02a512d3feb70989b89a3efc6714d12b833e7`. The initial M7 snapshot
workflow was temporary development equipment; remove it from the finished candidate.

Follow [M7_PAUSE_RESUME.md](M7_PAUSE_RESUME.md). Record actual CI/native/package
results in PR #54, deliver the exact Windows VSIX, and wait for user review before
merge or publication. Historical M2/M3/M6 ledgers do not authorize further release
operations. No Linux/macOS, model selector, global hotkey or focus fix is in scope.

Historical pre-renumbering plan: `3c0c3bc2fd611a3a76835897edc5af3a674bf2df`.
Archived M2.1-M2.4 ledgers are evidence, not instructions to revive discarded code.
