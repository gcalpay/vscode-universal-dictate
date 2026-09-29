# Universal Dictate implementation roadmap

Updated: 2026-09-29. Repository: `gcalpay/vscode-universal-dictate`.

This is the current implementation handoff. It replaces the earlier out-of-order milestone numbering. Historical planning and focus-diagnostic evidence remain available through pinned commits/branches, but the active milestone numbers below are chronological. M2 follows the user-approved [direct-input / optional-overwrite correction](M2_CLIPBOARD_MODE_FIX.md); the restoration design and recovery submenu are archived, not active requirements.

## 1. Branch and review policy

**One milestone = one branch. Submilestones do not get separate branches.**

| Milestone | Branch after previous milestone is accepted |
| --- | --- |
| M1 Overlay size presets | `feat/overlay-size-presets` |
| M2 Transcript reliability | `fix/transcript-recovery` |
| M3 Live transcript preview | `feat/live-transcript-preview` |
| M4 Translation | `feat/translate-to-english` |
| M5 Insertion-target preservation | `fix/statusbar-focus-preservation` |
| M6 Integrated validation/release | `release/next` |

Workflow for every milestone:

1. Start the milestone branch from the then-current `main`.
2. Implement all submilestones on that same branch.
3. Run the smallest relevant automated checks, then supply the final milestone Windows VSIX with a short relevant checklist. Intermediate automated builds are not user-test gates.
4. Stop for the user's review.
5. Merge only after the user confirms the milestone behaves correctly.
6. Only after that merge create the next milestone branch from updated `main`.

If a milestone is blocked or rejected, do not merge it just to preserve sequence. Continue fixing the same branch, or close/park it after the user's decision and create the next branch from unchanged `main`.

No milestone plan authorizes a release, version bump, Marketplace publication, issue closure or automatic merge.

The normalized roadmap is now on `main`. M1 was accepted and merged through PR #50, and M2 was created from that updated `main`. Keep the frozen launcher and Code OSS diagnostic branches isolated from ordinary product work.

## 2. Verified baseline

Main/M1 baseline and corrected M2 checkpoint, checked 2026-09-29:

- `main`: `481913feb88ad16aca00da744dd2fe72cd90ef98`, extension 0.1.5.
- M1 PR #50 is merged into `main`; this does not by itself imply a new Marketplace release.
- Windows UI extension host, including Remote - WSL.
- Recorder: native miniaudio/WASAPI, 16 kHz mono PCM16 WAV.
- Enhanced overlay: native non-activating recording panel with waveform, Insert and Discard.
- Enhanced-overlay sizes: Small ~380 x 64, Medium ~520 x 88, Large 740 x 128; Medium is the default/fallback after user review.
- Visualization modes: Both, Enhanced overlay, Status bar only and Off.
- Enhanced waveform history: 1, 3, 5, 10 or 20 seconds.
- ASR: multilingual Whisper `base`, warm local `whisper-server`, one-shot `whisper-cli` fallback.
- On `main` / M1 baseline: clipboard plus native Win32 Ctrl+V helper. This is not the corrected M2 transport.
- Genuine status-bar Dictate and recording Stop are clickable.
- Issue #38 remains unresolved for the genuine status-bar mouse workflow.
- Corrected M2: `fix/transcript-recovery` at `eaf0570f1c817229e36177ccff32f50ce396a43f`; PR #51 is draft and unmerged.
- M2 uses direct Unicode input, optional clipboard overwrite (Off by default), memory-only Copy Last Transcript and lifecycle hardening. Restoration and the Insert/Copy/Clear submenu were removed.
- Both corrected-candidate workflows succeeded; normal dictation has positive feedback and the user confirmed Overwrite clipboard works as intended. Codacy triage and merge approval remain open.
- Live preview and deliberate translation are not implemented. Genuine status-bar target preservation is not established.

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

**Status:** corrected M2.5 candidate at `eaf0570f1c817229e36177ccff32f50ce396a43f` is committed, built and delivered. The user reports normal dictation works and **Overwrite clipboard is working as intended**. PR #51 remains draft and unmerged. Codacy review and explicit merge approval remain open.

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
- Codacy reports 13 findings and `action_required`. Individual details were inaccessible in the 2026-09-29 review; all remain unclassified. Successful builds do not complete this review gate.

### M2.5 — Remaining acceptance and merge gate

Normal dictation and Overwrite clipboard behavior are user-accepted on the corrected candidate. Preserve that evidence and do not request another identical build/test merely because the conversation resumed.

Finish the per-finding Codacy review first. After that, only genuinely unrecorded or correction-affected behavior may need a focused spot check; the currently unrecorded candidates are explicit Copy Last Transcript after an unrelated clipboard copy and Cancel/repeated Stop producing no stale or duplicate later insertion. Existing automated lifecycle coverage should be considered before asking for manual repetition.

Approved runtime fixes require relevant revalidation and one replacement final M2 candidate on this branch. Documentation-only cleanup does not require a new installation.

Do not merge M2 or create the next milestone branch until review and user acceptance are complete and merge is explicitly approved. No version bump, release, publication or issue closure is part of M2 closure.

## 6. M3 — Live transcript preview

**Branch:** `feat/live-transcript-preview`, created from updated main after M2 review/merge.

Goal: show provisional words in the native recording overlay while the user speaks, while still inserting only one authoritative final transcript after Stop.

**v1 must not repeatedly type partial hypotheses into the target input.** Partial Whisper output can change; continuous target insertion would create selection, undo, focus and correction problems that belong to a different feature.

### M3.1 — Feasibility and latency measurement

The current recorder emits level events and writes the final WAV. The current warm server receives complete audio files through HTTP. Do not assume whisper.cpp's console `print_realtime` option creates a streaming HTTP API.

Test the smallest local approach for supplying bounded, valid audio snapshots to the existing warm inference worker. Compare at least:

- growing/current-session snapshot decoding
- explicit bounded preview WAV snapshots from the recorder if needed

Measure visible-text latency, decode duration, CPU/RAM pressure and behavior during longer speech. Pick one approach before broad UI work.

### M3.2 — Preview inference pipeline

- Only one preview decode may be active per session unless measured concurrency is justified.
- Use latest-only/coalescing scheduling; never build an unbounded queue.
- Tag results with session/generation IDs and discard stale results.
- Preview failures must not stop recording or destroy the final recording.
- Preserve the full audio needed for authoritative final transcription.
- Normal final transcription/fallback remains available even if preview is disabled or fails.

### M3.3 — Overlay integration

Add an opt-in live-preview setting initially.

- Show provisional text in the existing enhanced overlay.
- Small may show a short latest-text line; Medium/Large may show more wrapped text.
- Trade waveform space for text rather than automatically enlarging the chosen overlay size.
- Preview updates must not activate the overlay or affect target focus.
- Status bar only / Off retain their existing semantics unless separately approved.

### M3.4 — Finalization and gate

On Stop, stop scheduling preview work, discard stale preview responses, compute/obtain the authoritative final transcript, retain it under M2 rules and insert exactly once.

Test pauses, repetitions, silence, long recording, slow preview, worker failure, rapid start/stop and consecutive sessions. Then stop for user review before merge/M4.

## 7. M4 — Optional translation

**Branch:** `feat/translate-to-english`, only after M3 is accepted and only if the user still wants translation.

The pinned multilingual Whisper model and whisper.cpp support source-language-to-English translation. That is not arbitrary target-language translation.

### M4.1 — Scope decision

Before runtime implementation, confirm the first product scope. Recommended v1:

- Output: Original language
- Output: Translate to English
- Off/original remains default

Other target languages require a separate translation backend/product decision.

### M4.2 — Backend consistency

Pass the selected task through both warm-server and CLI paths. The server accepts a `translate` request field; the CLI exposes `--translate`. Snapshot task/language at session start so a settings change does not alter an in-flight recording.

### M4.3 — Settings and preview semantics

Expose output mode in VS Code Settings and the existing settings picker. Keep input-language selection separate from output task.

Recommended first interaction with M3: live preview remains in recognized/original speech language and only the final result is translated to English. Do not implement live translated captions unless explicitly requested.

### M4.4 — Validation and gate

Test multilingual samples, auto-detect, named languages, numbers, units, proper nouns, negation, warm-server/CLI parity and failure paths. Stop for user review before merge/M5.

## 8. M5 — Genuine insertion-target preservation

**Branch:** `fix/statusbar-focus-preservation`, created from main after M4 review/merge unless the user reprioritizes this milestone earlier.

Goal: make the genuine VS Code-owned status-bar Dictate/Stop mouse workflow preserve the agreed latest target/caret/selection without corrective clicks.

### M5.1 — Refresh capability and old diagnostic

Recheck the current stable VS Code extension API and workbench implementation. Reuse M1-era evidence only where still applicable.

The historical H1 hypothesis was to prevent primary mouse-down default focus movement inside VS Code while leaving click/keyboard behavior intact. Its isolated build never reached real Codex testing; the last recorded H1 host failed at packaging with `spawn signtool.exe ENOENT`.

Diagnose the exact current blocker before adding more infrastructure. Do not merge the old native-launcher or diagnostic branches into this product branch.

### M5.2 — Matched experimental hosts

If H1 remains technically plausible, produce matched baseline/H1 development hosts and a matching fixed-text probe. Do not require users to install a custom VS Code as the final product solution.

### M5.3 — Real Windows/Codex acceptance

Using `UD_TEST`, separately test:

- Codex caret insertion
- Codex selection replacement
- normal editor and another VS Code input
- status-bar Start vs status-bar Stop
- keyboard/overlay paths
- deliberate retarget during recording
- deliberate retarget while final processing is pending
- same-input caret/selection changes
- local vs Remote - WSL
- two windows/minimize/restore where relevant

A compile, synthetic DOM event or mocked input is not evidence.

### M5.4 — Delivery decision and gate

Only merge a product change that has a supported delivery path. If the only successful route requires a custom VS Code or an unavailable upstream API, leave Issue #38 open and record the blocker instead of weakening requirements. A separate native launcher still requires an explicit product decision.

Stop for user review before any merge and before M6.

## 9. M6 — Integrated validation and release

**Branch:** `release/next`, created from the accepted main state after M5 (or from unchanged main if M5 is explicitly parked).

### M6.1 — Integrated regression

Run applicable automated tests and real Windows checks across all merged features. Re-run the complete insertion-target matrix only if M5 claims a literal fix; otherwise keep Issue #38 explicitly unresolved.

### M6.2 — Release package and durable docs

Inspect the actual VSIX contents. Update README, CHANGELOG, settings help, testing/architecture notes and version metadata to describe only behavior that actually shipped. Keep diagnostic-only code and test shortcuts out of the VSIX.

### M6.3 — Final user gate and publication

Provide the tested artifact and exact evidence to the user. Merge/publish/tag/close issues only after explicit approval.

## 10. Acceptance map

Existing focus/recovery IDs from the earlier specification remain useful:

- T01-T10: focus/target/helper behavior -> primarily M5/M6.
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
| T19 | M4 | Original vs Translate-to-English produces the selected final mode on warm-server and CLI fallback |
| T20 | M4 | Translation preserves critical numbers, units and negation in representative manual samples; observed limitations documented |
| T21 | M4 | Settings changes affect the next session, not an in-flight session; preview/final language behavior matches the chosen policy |

Every manual result records commit/artifact, Windows/VS Code/Codex versions, local/WSL, target, display scaling where relevant, controls used, expected/actual result and Pass/Fail/Blocked/Not run. Never replace real GUI evidence with compilation.

## 11. Current handoff

M1 is complete and accepted.

- M1 branch: `feat/overlay-size-presets`
- PR #50 merged into `main`
- M1 merge commit: `481913feb88ad16aca00da744dd2fe72cd90ef98`
- user Windows review: Small/Medium/Large behaved as intended
- selected product default/fallback: Medium
- Issue #38 remains unresolved and was not claimed fixed by M1

M2 is at its corrected final-candidate review gate.

- M2 branch: `fix/transcript-recovery`.
- Milestone base: `481913feb88ad16aca00da744dd2fe72cd90ef98`.
- Corrected source: `eaf0570f1c817229e36177ccff32f50ce396a43f`; PR #51 is draft and unmerged.
- Normal dictation and Overwrite clipboard behavior are user-accepted.
- Codacy triage is blocked on individual details of 13 findings, not resolved or dismissed.
- Next action: obtain those details, triage actual findings, finish only justified targeted M2.5 checks, then seek explicit merge approval.
- Current contract and delivered-artifact identity: [M2_CLIPBOARD_MODE_FIX.md](M2_CLIPBOARD_MODE_FIX.md).
- Unintended German-to-English output remains a separate unresolved bug. An earlier language-correctness milestone was proposed, not approved; do not silently change the sequence or expand M2.
- No new milestone branch, version bump or publication is authorized here.

Historical detailed plan before renumbering: commit `3c0c3bc2fd611a3a76835897edc5af3a674bf2df`. M2.1-M2.4 ledgers are archived checkpoint evidence, not instructions to restore discarded code.
