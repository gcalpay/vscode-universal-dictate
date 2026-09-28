# Universal Dictate implementation roadmap

Updated: 2026-09-28. Repository: `gcalpay/vscode-universal-dictate`.

This is the current implementation handoff. It replaces the earlier out-of-order milestone numbering. Historical planning and focus-diagnostic evidence remain available through pinned commits/branches, but the active milestone numbers below are chronological.

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
3. Run the smallest relevant automated checks, then produce a concrete Windows artifact/procedure where GUI behavior matters.
4. Stop for the user's review.
5. Merge only after the user confirms the milestone behaves correctly.
6. Only after that merge create the next milestone branch from updated `main`.

If a milestone is blocked or rejected, do not merge it just to preserve sequence. Continue fixing the same branch, or close/park it after the user's decision and create the next branch from unchanged `main`.

No milestone plan authorizes a release, version bump, Marketplace publication, issue closure or automatic merge.

The normalized roadmap is now on `main`. M1 was accepted and merged through PR #50, and M2 was created from that updated `main`. Keep the frozen launcher and Code OSS diagnostic branches isolated from ordinary product work.

## 2. Verified baseline

Snapshot checked 2026-09-28:

- `main`: `481913feb88ad16aca00da744dd2fe72cd90ef98`, extension 0.1.5.
- M1 PR #50 is merged into `main`; this does not by itself imply a new Marketplace release.
- Windows UI extension host, including Remote - WSL.
- Recorder: native miniaudio/WASAPI, 16 kHz mono PCM16 WAV.
- Enhanced overlay: native non-activating recording panel with waveform, Insert and Discard.
- Enhanced-overlay sizes: Small ~380 x 64, Medium ~520 x 88, Large 740 x 128; Medium is the default/fallback after user review.
- Visualization modes: Both, Enhanced overlay, Status bar only and Off.
- Enhanced waveform history: 1, 3, 5, 10 or 20 seconds.
- ASR: multilingual Whisper `base`, warm local `whisper-server`, one-shot `whisper-cli` fallback.
- Insertion baseline: clipboard plus native Win32 Ctrl+V helper.
- Genuine status-bar Dictate and recording Stop are clickable.
- Issue #38 remains unresolved for the genuine status-bar mouse workflow.
- Transcript recovery, full clipboard preservation, live preview and translation are not yet implemented on the M2 branch baseline.

Historical branches that must not be merged into ordinary feature work:

- `fix/preserve-insertion-target` at `5df91c3561ac31bd20f30d829d323347757469bf`: alternative native launcher.
- `experiment/m1.2-statusbar-focus-probe` at `834a1001ef5ef49da36710eb4d2445d600f89f9a`: isolated Code OSS diagnostic. Run `34735635848` produced a successful probe kit but failed both host jobs; the H1 job reached packaging and ended with `spawn signtool.exe ENOENT`. That is build evidence, not a focus result.

## 3. Product invariants

These requirements remain settled across every milestone:

- The intended target is the latest deliberately selected editable input plus its latest caret/selection until final insertion.
- Deliberate target/caret/selection changes during recording or final processing win.
- Clicking Universal Dictate Dictate/Stop/Insert controls is not deliberate retargeting.
- Without a deliberate change, preserve the user's intended target and selection.
- Selected text is replaced with ordinary paste semantics.
- Never synthesize Enter or automatically submit/send.
- Cancellation inserts nothing.
- Retain a successful non-empty final transcript before insertion so an insertion or clipboard failure cannot destroy the only recoverable copy.
- Preserve the complete pre-insertion Windows clipboard when Universal Dictate still owns the temporary clipboard state; if the user or another application changes the clipboard meanwhile, preserve that newer clipboard instead.
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

## 5. M2 — Transcript, clipboard and lifecycle reliability

**Branch:** `fix/transcript-recovery`, created from `main` at `481913feb88ad16aca00da744dd2fe72cd90ef98` after the accepted M1 merge.

**Status:** active planning/implementation milestone. Do not create M3 until M2 is implemented, tested, reviewed and explicitly approved for merge.

### M2.1 — Retain one completed transcript and expose recovery actions

- Save the latest successful non-empty completed transcript in memory **before insertion is attempted**.
- A later successful non-empty transcript replaces the previous retained transcript.
- Empty/no-speech/cancelled/failed transcription does not replace the previous retained transcript.
- Insertion or clipboard failure must not remove the retained transcript.
- Extension reload/restart may clear this memory-only recovery state; document that honestly.
- Add normal VS Code commands:
  - **Universal Dictate: Insert Last Transcript**
  - **Universal Dictate: Copy Last Transcript**
  - **Universal Dictate: Clear Last Transcript**
- Add **Last transcript** as the fifth entry in the existing Universal Dictate gear Quick Pick. Its submenu contains:
  - Insert last transcript
  - Copy last transcript
  - Clear last transcript
- Show the parent entry as Available/Empty rather than exposing the transcript text in the menu.
- Insert Last Transcript must remain directly keyboard-invokable through the Command Palette/keybinding system so recovery does not require opening a focus-changing menu.
- Insert does not clear the retained transcript.
- Copy deliberately writes the retained transcript to the clipboard because that command explicitly asks for a copy.
- Clear changes only the retained in-memory recovery state.
- Do not automatically retry an uncertain paste; duplicate insertion is worse than explicit recovery.

### M2.2 — Preserve the user's complete clipboard and respect newer ownership

The baseline uses VS Code's text clipboard API, writes the transcript, synthesizes Ctrl+V, waits a fixed delay and blindly restores the saved text. That is insufficient because it can destroy non-text clipboard data and overwrite a newer user/application copy.

Product requirement:

> Dictation insertion must not leave the user's clipboard changed as a normal side effect. Preserve the complete pre-insertion Windows clipboard, not only text. Restore it only while Universal Dictate still owns the temporary clipboard state. If the user or another application changes the clipboard meanwhile, preserve that newer clipboard instead.

Implementation direction:

- Move preservation/ownership logic to the native Windows side as needed; `vscode.env.clipboard.readText()` alone cannot preserve images, files, HTML/rich text, Excel-style data or other registered clipboard formats.
- Snapshot the complete pre-insertion clipboard sufficiently to restore its formats/data.
- Temporarily place the final transcript on the clipboard for ordinary Ctrl+V paste semantics.
- Track Windows clipboard change/sequence state so ownership is explicit rather than inferred from string equality or a timeout.
- After paste, restore the pre-insertion clipboard only if the clipboard still corresponds to Universal Dictate's temporary write.
- If a newer clipboard change occurred, do not restore stale content over it.
- Treat identical newer text as a newer clipboard change as well; content comparison alone is not sufficient.
- If complete preservation of a clipboard format fails, fail safely and report the limitation/error rather than silently claiming preservation.
- Keep Last Transcript recovery available even if paste or clipboard restoration fails.

Test at least:

- previous clipboard contains plain text;
- previous clipboard is empty;
- previous clipboard contains an image;
- previous clipboard contains copied files;
- previous clipboard contains HTML/rich text or another multi-format payload;
- user/app copies newer text during insertion;
- user/app copies newer non-text content during insertion;
- newer clipboard content is text identical to the transcript;
- native paste failure;
- clipboard snapshot failure;
- clipboard restore failure;
- clipboard ownership/sequence query failure.

### M2.3 — Lifecycle/session-generation hardening

The current engine primarily relies on one `session` reference plus a `busy` boolean. Add the minimum explicit operation/session identity needed to reject stale asynchronous work.

Test/fix:

- duplicate Stop;
- duplicate native-overlay Stop;
- disposal while preparing;
- disposal while recording;
- disposal while transcribing;
- recorder start/stop failure;
- transcription failure;
- late callbacks from an obsolete recorder session;
- an old transcription completing after a newer session exists;
- stale operations must never insert;
- stale operations must never resurrect obsolete UI/control state;
- temporary WAV cleanup on all relevant paths.

Avoid an unnecessary engine rewrite.

### M2.4 — VS Code integration and automated validation

- Update `package.json` command contributions/activation wiring as needed.
- Extend the existing settings gear Quick Pick with Last transcript; do not add permanent status-bar buttons.
- Add focused recovery, clipboard-ownership and lifecycle tests instead of overloading the M1 overlay-size tests.
- Preserve M1 tests as regressions.
- Run TypeScript checks/compile, focused unit tests, Windows native compilation, Windows packaging and VSIX content inspection.

### M2.5 — User review gate

Produce a concrete Windows VSIX and stop for review. Manual checks should include:

- normal dictation/insertion still works;
- the original clipboard is restored after normal insertion;
- images/files/rich clipboard content survive normal insertion;
- a newer clipboard change made during insertion survives;
- failed/misdirected insertion still leaves Last Transcript available;
- Insert / Copy / Clear Last Transcript;
- Command Palette access to the recovery commands;
- Remote - WSL;
- Small/Medium/Large overlay regression.

Do not merge M2 or create M3 until the user explicitly approves the tested result.

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
- T12-T13: transcript recovery and clipboard behavior -> M2/M6.

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

M2 is now the active milestone.

- M2 branch: `fix/transcript-recovery`
- branch base: `481913feb88ad16aca00da744dd2fe72cd90ef98`
- first implementation target: retain Last Transcript before insertion, expose Insert/Copy/Clear recovery actions, then implement complete clipboard preservation/ownership protection and lifecycle hardening
- no M2 runtime implementation has been accepted yet
- no M3 branch may be created until M2 passes its user gate and is merged

The clipboard requirement is now explicit: preserve whatever the user had on the Windows clipboard before normal dictation insertion, across formats, and restore it only if no newer clipboard change has occurred.

Historical detailed plan before renumbering: commit `3c0c3bc2fd611a3a76835897edc5af3a674bf2df`.
