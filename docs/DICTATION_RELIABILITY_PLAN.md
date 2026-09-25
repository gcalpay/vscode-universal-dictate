# Dictation reliability and overlay sizes: Codex implementation plan

Reassessed: 2026-09-25. Repository: `gcalpay/vscode-universal-dictate`.
Temporary working document, linked from root `AGENTS.md`.

## 1. Start here

**Recommended next implementation: M3, Small/Medium/Large recording overlays.**
Then implement M2 transcript recovery and clipboard/lifecycle reliability. Apply
M4 validation to each release candidate. Keep M1's upstream focus experiment a
separate workstream, not a prerequisite for either product improvement.
Milestone IDs are retained; their numbers do not impose a dependency chain.

This revision replaces the older next-step instruction to repair the Code OSS
build immediately. It does not discard the experiment, weaken Issue #38 or
reopen the user's latest-target choice. M0 is finished as a specification; do
not spend another session rewriting it before implementing a bounded feature.

The previous plan already included sizes and recovery. The reassessment changes
execution order, separates shippable features from platform research and makes
implementation steps explicit. M1.2 built test equipment, not a production fix.
Do not expand that equipment merely because work has already been invested in it.

This task changed documentation only. A handoff is not permission to implement
all milestones, install software, spend on additional build infrastructure,
merge, publish or close issues. Follow the user's active Codex request and stop
at its agreed milestone boundary, not after every small code edit.

### Verified repository state

| Ref / item | Snapshot checked on 2026-09-25 |
| --- | --- |
| Product base `main` | `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`, declared version 0.1.5 |
| Planning branch | `docs/dictation-reliability-plan`; reassessment follows `63b5eb9669d44f48cf5ee81babf8c6fceb99527a` |
| Frozen native-launcher experiment | `fix/preserve-insertion-target` at `5df91c3561ac31bd20f30d829d323347757469bf`, draft PR #49; leave untouched |
| Separate upstream diagnostic branch | `experiment/m1.2-statusbar-focus-probe` at `834a1001ef5ef49da36710eb4d2445d600f89f9a`; leave out of product branches |
| Diagnostic code tested in CI | `6bef0311f3f6cee9c94941c5bd1456dfbaf01593`, run `34735635848` |
| That run's actual final result | Probe kit succeeded; baseline and H1 host jobs failed; no complete host/kit set |
| Real GUI acceptance evidence | All 18 acceptance rows below remain Not run; unit/build results are not GUI results |

Recheck refs and the local working tree before edits. Never reset, clean, stash
or overwrite unrelated user work. Existing historical branches/logs are evidence,
not instructions to resurrect old automation or merge their changes.

**Branch procedure:** product work starts from the then-current `main`, for
example `feat/overlay-size-presets` for M3. Bring only this updated plan and root
`AGENTS.md` into that branch if they are not on main yet. Use the latest reviewed
planning revision, not the stale plan embedded in an experimental branch. Do not
merge/cherry-pick the entire diagnostic or frozen-launcher branch to get the docs.
Keep Git writes and dependency installation within explicit session approval.
Read-only inspection and already-authorized targeted tests need no new product
decision. The planning branch itself remains documentation-only.

The detailed [pre-reassessment plan][history] preserves the original M0 rationale,
M1 investigation, source pins, experiment design and build history. It is an
immutable reference, not the current work order. Its September 13 build checkpoint
is superseded by the September 25 result above.

## 2. Settled requirements and scope

**M0.1: follow the latest deliberately selected target until insertion.** A target
is the editable input plus its caret/selection, not merely an application window.
Changes during recording AND transcription count, including movement or a new
selection within the same input. Stop/Insert does not lock the destination.
Without a deliberate change, preserve the original destination and selection.
Replace the selected range as an ordinary paste would, leaving other text intact.

Dictate/Stop/Insert interactions do not themselves retarget. Do not force focus
back to an older editor after the user deliberately changes destinations. Preserve
supported external Windows inputs and the local Windows UI host in Remote-WSL.
Correct insertion matters more than uninterrupted caret blinking. Never synthesize
Enter or submit/send a message. Cancelling a recording must not insert its text.

Known loss of the intended destination, with no newer valid deliberately chosen
target, requires recovery rather than guessing. Do not claim universal detection
of opaque input state or that a successful input API call proves text acceptance.
The generic observability limitation remains unresolved; M2 must not pretend to
implement a universal focus/selection tracker.

**M0.2: keep three outcomes distinct.** A genuine status-bar workflow meeting the
contract without corrective clicks is a candidate Issue #38 fix. A different
non-activating launcher is an alternative, even if it looks like a status-bar
item; adopting it requires an explicit decision and should initially be optional.
Retaining text for recovery is a safeguard, not a focus fix. Editor-only success
cannot stand in for Codex success, and a mandatory hotkey-only start is not the
unchanged mouse workflow. Preventing focus loss or reliable restoration may qualify
if actually demonstrated. Do not silently remove a failing control or close #38
with recovery/sizing changes. Keep the issue open until agreed evidence supports
an explicitly authorized closure on a deliverable implementation.

Preserve local/offline transcription after model setup, language selection,
waveform time span, warm-worker/CLI fallback and review-before-send behavior.
Do not introduce a standalone app, cloud ASR, LLM rewriting, arbitrary drag-resize,
new waveform styles, global focus hooks, click replay or injected workbench UI.
An isolated source build is research equipment, never a required user installation.

**Backlog, not this implementation order:** microphone selection, elapsed-time or
signal/clipping feedback, richer latency diagnostics, model-quality presets and
overlay corner/drag positioning. These earlier suggestions were not promises to
implement them all. Do not add them to M3 or M2 without a separate request.

## 3. M3: recording overlay sizes, first product task

This changes the large recording visualization, not PR #49's idle launcher.

| Setting value | Label | Initial layout target at 100% scaling |
| --- | --- | --- |
| `small` | Small | Approximately 380 x 64 logical units |
| `medium` | Medium | Approximately 520 x 88 logical units |
| `large` | Large | Current 740 x 128 presentation as the reference |

The dimensions are starting targets, not an obligation to cram the current layout
into them. Reduce padding and waveform area before readability or usable buttons.
Keep Large as the default/invalid-setting fallback initially. A smaller default
is a later explicit choice after evaluation, not a hidden migration in this task.
The baseline's hardcoded native coordinates are not proof of correct DPI scaling.

### M3.1: configuration and end-to-end propagation

Add `universalDictate.overlaySize` with the three enum values to `package.json`,
VS Code Settings and the existing extension settings menu. Read/validate it at
session start and pass it through the entire adapter chain:

`src/extension.ts` -> `src/recorder.ts` -> `src/core/recorder.ts` -> native recorder.

Introduce a validated native argument such as `--overlay-size`. Preserve existing
callers/defaults and the process protocol. Invalid/missing settings must yield
Large, not fail microphone startup. Changing size applies to the next session.
Retain Both, Enhanced overlay, Status bar only and Off semantics; no native
overlay is created for the latter two just because a size was configured.

### M3.2: one renderer with shared layout metrics

In `native/record-audio.cpp`, calculate each preset's window dimensions, waveform
bounds, labels, fonts and Insert/Discard rectangles together. Drawing and hit
testing must use those same metrics. Do not just change width/height constants,
scale the final bitmap or revive the unrelated legacy compact renderer.
A small pure layout helper/file is acceptable when it makes this testable; an
unrelated UI-framework migration or broad recorder rewrite is not.

Specify the native process/window DPI behavior before creating windows. Apply one
consistent logical-to-device transform and recompute where monitor/DPI changes
require it. Keep the rectangle in the monitor work area, including negative
monitor coordinates, without clipping controls. Preserve all non-activation flags,
mouse behavior and font/graphics resource cleanup. Test the actual implementation
on Windows rather than infer its appearance from arithmetic alone.

Do not change the audio callback, sampling rate, waveform history/time-span
meaning, recording duration or transcription quality. Size is presentation only.

### M3.3: tests, documentation and Windows review

Add targeted tests for enum/default handling, adapter/native argument propagation,
layout bounds and matching hit areas. Run existing typecheck/compile and native
build/package checks relevant to the change. Exercise all three sizes with the
real extension in an ordinary Windows VS Code test profile and Remote-WSL; capture
readable examples, verify Insert/Discard and keyboard operation, and run T11.

A full Code OSS source build is not required for M3. Record the existing status-bar
focus defect as a baseline limitation, not a newly solved feature. No regression
is acceptable, but a pre-existing #38 failure is not a reason to withhold sizes.
Do not require the entire focus-research matrix to validate a geometry-only change.

Update settings help, README and relevant test notes with actual behavior. Before
release use M4 below. M3 is not GUI-validated merely because the native build is green.

## 4. M2: recovery and narrowly scoped reliability fixes

M2 does not depend on proving H1. Keep its changes separate from M3.

### M2.1: retain one completed transcript

Save the latest nonempty completed transcript in memory BEFORE attempting paste,
including when paste later throws or silently misses the intended input. Add
Copy Last Transcript, Insert Last Transcript and Clear Last Transcript commands.
Do not automatically copy every result permanently to the clipboard or persist
transcripts/audio in a database. Do not log dictated contents. Document that
extension reload/restart ends memory-only recovery.

Empty/no-speech, cancelled or failed transcription attempts must not create a
new recovery item or erase the previous valid transcript. A later valid transcript
replaces the previous one. Clear explicitly removes the current saved item.
With no saved text, commands should behave predictably and without inserting
placeholder text. Serialize reinsertion with the dictation lifecycle to avoid
overlapping pastes. No automatic retry of uncertain insertion: that can duplicate
text. A keyboard-invokable reinsertion path must not first open a focus-stealing
menu. Document its current target limitations honestly; it is not evidence of a
new generic selection-restoration API. Copy remains an explicit fallback.

### M2.2: clipboard restoration without clobbering a newer copy

The baseline reads/writes clipboard strings, sends Ctrl+V and restores the saved
string after 120 ms. Restore only if the clipboard still belongs to that operation;
never overwrite a newer copy from the user or another application. Evaluate the
check-and-restore race, not only a comparison of text values. A longer timeout or
identical string contents is not proof of ownership or successful insertion.

Record and test the supported format policy before changing native clipboard
handling. Prefer preserving an existing native payload when feasible; do not claim
images, files or rich text are preserved by a string-only implementation. A design
that can destroy unsupported clipboard content needs an explicit safe fallback or
user-approved limitation before release. Do not promise universal format support
without implementing it. Keep any necessary native helper narrowly scoped and
handle clipboard-busy/error cases without losing the saved transcript.

Tests: old plain-text value, empty clipboard, newer copy during the operation,
newer copy with identical text, restore failure and representative non-text content.
Include Unicode and multiline text, cleanup on helper failure and no duplicate paste.

### M2.3: concrete asynchronous lifecycle regressions

Test disposal while preparing/starting the recorder/transcribing, duplicate Stop,
recorder failure and late callbacks. The baseline `DictationEngine.dispose()` only
cancels a present recorder session; a transcription already pending has no such
session. Treat a late insertion after disposal as a source-visible risk to reproduce
and fix, not as a GUI failure already observed. Prevent obsolete operations from
inserting or reviving controls after disposal. Preserve WAV cleanup and usable
idle/error state. Do not turn this into a wholesale engine refactor or add a new
user-facing cancel-during-transcription feature without a separate decision.

Exit: T12/T13 and applicable cancellation/failure cases pass with focused unit and
Windows evidence. Retention, clipboard format and lifecycle claims match what was
tested. Remaining opaque-target limits stay explicit; recovery does not close #38.

## 5. M1: separate focus investigation, not the product release gate

M1.1 identified H1: cancel primary mouse-down defaults on the genuine item inside
VS Code's renderer, leaving click execution and keyboard navigation intact.
No sufficient stable extension-only mechanism was established by that assessment.
This is not proof that every possible integration is impossible. Recheck current
supported APIs when investigation resumes; do not repeat the entire M0 discussion.

M1.2's diagnostic exists on the isolated experiment branch. **It has not met its
build/artifact completion gate.** On reinspection, [run 34735635848][run] has failed
baseline/H1 hosts and a successful kit. The [H1 job][h1-job] got through dependency
installation, bundling and package creation, then ended with
`Error: spawn signtool.exe ENOENT`. The signing utility was not found by that
process; this does not prove it is absent from the image. The baseline job is also
failed, but its terminal log was not independently diagnosed in this reassessment.
Earlier CRLF-source and VS2022-detection problems had already been corrected.

No complete matching three-artifact set exists for that run. These are build
failures, not observed focus failures. There is no new real Codex acceptance result.
Retain the source-pinned experiment and its [procedure][probe], but do not rerun or
repair it during M3/M2 simply because the old handoff said to do so.

When the user resumes this workstream:

- **M1.2:** diagnose the precise build prerequisite, including executable search
  paths, without skipping checks or spoofing product/toolchain identity. Establish
  an operable baseline and real Codex compatibility before more infrastructure.
  Reuse a suitable isolated checkout where available. Keep baseline/H1 provenance
  and the same probe version; compare matched builds, not unrelated versions.
- **M1.3:** run the smallest decisive real-Windows cases, including caret/selection,
  literal Start versus Stop, latest-target changes and keyboard behavior. Fixed
  `UD_TEST` first, real recording second. A build, mocked control or synthetic
  dispatch alone cannot prove native pointer/composer behavior.
- **M1.4:** choose a delivery direction from observations. An upstream patch/API
  proposal requires supported availability before it becomes a shipped literal fix.
  Never require ordinary users to run our Code OSS build. An optional native
  launcher remains a separate product decision; PR #49 stays frozen.

A specific API/compatibility/build blocker is a valid recorded outcome, not an
excuse to replace requirements silently. Do not claim that a stronger model can
supply an unavailable platform capability or substitute for Windows evidence.

## 6. M0.3 acceptance reference (retained IDs, no fabricated passes)

The following 18 rows are retained from the detailed plan. F = focus/insertion,
R = recovery/clipboard, S = sizing and H = helper/fallback. Run variants separately;
a successful alternative launcher is never labelled a genuine-status-bar result.

| ID | Scope | Scenario / action | Required observation | Current result |
| --- | --- | --- | --- | --- |
| T01 | F | Real Codex composer, caret fixture; no deliberate target change | Exact caret-fixture result without refocusing the composer | Not run |
| T02 | F | Real Codex composer, selection fixture; no deliberate target change | Replace only `old`, not append or replace the entire input | Not run |
| T03 | F | Repeat caret and selection fixtures in a normal editor and a named ordinary VS Code input | Correct result in each control; report them separately | Not run |
| T04a | F | Select a different editable input while recording, including a supported external input | Insert only into the newly selected destination at its latest caret/selection | Not run |
| T04b | F | Stop, then select a different editable input during the controlled transcription interval; include an external input | Follow the new target, not the target at Start or Stop; no extra confirmation | Not run |
| T04c | F | Move the caret within the same input; separate recording-time and transcription-time trials | Insert at the updated caret; the original position remains unchanged | Not run |
| T04d | F | Change the selected range within the same input; separate recording-time and transcription-time trials | Replace only the latest selection; text outside that range remains unchanged | Not run |
| T04e | F | Deliberately switch A to B during recording, then back to A at a new caret/selection during transcription | Latest A position wins; neither B nor A's earlier position receives text | Not run |
| T05 | F | Execute the supported start/finish combinations below with caret and selection fixtures | Each combination meets the same contract; start and stop clicks evaluated independently | Not run |
| T06 | F | Cancel while recording, separately through Esc and visible overlay Discard where available | No insertion or submission, including after returning to idle; M2 must not create a transcript for the cancelled attempt | Not run |
| T07a | F + R | Close/remove the intended editable target before insertion, with no new deliberately selected valid target | No guessed destination when loss is known; record observability limits; retain the completed transcript once M2 is implemented | Not run |
| T07b | F | Close the earlier target, then deliberately select another valid input before insertion | Follow the new valid target rather than reverting to the closed target or holding solely because the older one closed | Not run |
| T08 | F; H if applicable | Two VS Code windows: deliberately retarget to the other window's input; also repeat normal insertion after minimize/restore | Correct target per M0.1; no stale-window insertion; any launcher has correct visibility/ownership | Not run |
| T09 | F | Repeat the core cases in Windows VS Code with a Remote-WSL workspace | Same applicable results through the Windows UI host; distinguish local and WSL runs | Not run |
| T10 | H + R as applicable | Relevant helper missing at startup or exits during use; test these separately | Reachable, accurately described controls/fallback; failures do not masquerade as successful insertion; completed text remains recoverable once M2 exists | Not run |
| T11 | S + F regression | Small, Medium and Large at 100%, 125%, 150% and 200% scaling, including mixed-DPI monitors | Readable unclipped content, correctly aligned button hit areas, non-activating Insert/Discard, unchanged waveform time span and recording semantics | Not run |
| T12 | R | Retain a completed transcript, provoke insertion failure/uncertainty, then explicitly Copy, Reinsert and Clear; include no-speech, cancellation and reload cases | Recovery uses the accepted insertion policy, no automatic duplicate retry, no spurious new transcript for empty/cancelled attempts; memory-only lifetime and clearing match the documented behavior | Not run |
| T13 | R | Paste with an existing clipboard value, then repeat with a newer copy during the operation and with non-text clipboard content | Restore only under the agreed ownership/format policy; do not overwrite a newer copy or claim non-text preservation without evidence | Not run |

T07a/T10 have separate safety and recovery observations. Do not give mixed-scope
rows a blanket pass when part is unimplemented. T11 also covers configuration
selection, invalid values, next-session changes and no-overlay modes.

### Genuine start/finish inventory for T05

| Visualization mode | Start methods, each tested | Finish methods, paired with each start |
| --- | --- | --- |
| Enhanced overlay (`enhancedOverlay`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Both (`both`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Status bar only (`statusBar`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |
| Off (`off`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |

These are 20 baseline start/finish/mode combinations, each with caret and selection
variants when claiming the full literal fix. A passing overlay Insert path cannot
hide a status-bar Stop failure. An alternative has its own separately labelled
inventory. Do not silently remove a control to eliminate a failing case.

**Fixtures:** fixed transcript `UD_TEST`; caret fixture `left  right` with the caret
between the two spaces; selection fixture `left old right` with only `old` selected.
Both should become `left UD_TEST right`. Reset between trials, distinguish source
and destination inputs, and check that other inputs remain unchanged. Use the
real Codex composer, an untitled editor, a named ordinary input such as Find and
an unsaved external text document. Never use a terminal or submit a chat for testing.

Retargeting during transcription needs an observed pending interval, not an assumed
sleep. Completion must not steal focus. The existing diagnostic's special release
chord is test equipment, not a product confirmation requirement. For an external
target while recording, finish with the non-activating overlay; for an external
target during transcription, stop in VS Code first, then select that external
input. Do not pretend the VS Code shortcut is global. Test Esc in its supported
recording context; no new transcription-cancellation feature is implied.

A valid-target pass means exactly one insertion at the intended latest caret or
selection, unchanged surrounding/non-destination text, no corrective click, no
extra confirmation solely for retargeting, no submission and no automatic retry.
Actual text matters; blinking or input-API success alone is not sufficient.

**Proportional validation:** M3 runs its configuration/native-layout tests, T11 and
relevant ordinary recording/control regressions. M2 runs T12/T13 and affected
lifecycle/cancellation/target cases. A claimed #38 fix requires all applicable F
cases and T05 paths, local/WSL and relevant window/helper variants. Repeat exercised
core focus cases for at least five consecutive trials on one build and preserve
all failures; this is a regression check, not a statistical reliability guarantee.
Follow fixed-text evidence with real transcription, comparing insertion with the
actual generated transcript rather than confusing ASR and insertion errors.

For each result record date/tester, commit/artifact, Windows/VS Code/Codex versions,
local/WSL context, named control, DPI/monitors, mode/start/finish path, initial
text/selection, ordered deliberate actions and phase, generated/supplied text,
expected/actual output, duplicates/submission check, trials and evidence/limits.
Use synthetic content, never private transcripts. Outcomes: Pass, Fail, Not run,
Blocked (specific prerequisite) or Not applicable (reason tied to feature scope).
Never mark a required failing/unimplemented case Not applicable. Without Windows
or real Codex access, mark the relevant cases Blocked/Not run and provide the
smallest manual procedure. Do not report Linux/static tests as Windows GUI passes.

## 7. M4: release validation and retirement

Use the production branch's normal typecheck/compile/native/package checks and
its new targeted tests. Inspect the actual VSIX contents and tie manual evidence
to the tested commit. Keep diagnostics, source patches, test-only shortcuts and
probe bootstraps out of product packaging. Do not copy the experimental workflow
into the release merely to make CI look more comprehensive.

Update durable README/settings help, CHANGELOG and testing notes for the behavior
actually shipped. A size/recovery release may retain the known #38 limitation;
it must not advertise a solved focus problem. Versioning, commit/push, merge,
publishing and issue closure follow the user's explicit approvals.

After each completed implementation chunk, update the ledger below with changed
files, actual tests and next action. Once work is complete or explicitly retired,
move lasting behavior/tests/limitations into the regular docs or issue record,
then remove this temporary plan and its AGENTS pointer together. Preserve unrelated
agent guidance and never delete the only record of an unresolved issue.

## 8. Live handoff ledger

| Milestone | Status at this reassessment | Next action |
| --- | --- | --- |
| M0.1-M0.3 | Complete as specifications | Preserve latest-target policy and acceptance criteria; no replanning gate |
| M3.1-M3.3 | Not started | Recommended next Codex task: overlay sizes, on a product branch from main |
| M2.1-M2.3 | Not started | Recovery, clipboard policy/implementation and scoped lifecycle tests after sizing |
| M1.1 | Assessment recorded | Reference the source-backed hypothesis; recheck APIs only when resuming |
| M1.2 | Diagnostic implemented; host build gate failed; separate workstream paused in this order | Resume only when focus investigation is prioritized; missing signtool lookup is the observed H1 blocker |
| M1.3-M1.4 | Not started | No real Windows/Codex focus outcome or production route selected |
| M4 | Not started | Run per product release candidate, not only after upstream work finishes |

Reassessment changed this document and root `AGENTS.md` only. Main, the original
frozen branch and the diagnostic branch are untouched; no new build was triggered.
Source snapshot and prior-plan hashes were checked, not functionality. All 18
runtime rows remain Not run. The next agent must inspect the actual local worktree;
this document does not certify that the user's machine has a clean checkout or
all Windows build/test prerequisites.

For continuation append a concise entry with milestone/substep, branch/commit,
files, tests actually run, blockers and next action. Keep one current next task;
do not maintain contradictory instructions in several handoff documents.

### Sources and preserved history

[history]: https://github.com/gcalpay/vscode-universal-dictate/blob/834a1001ef5ef49da36710eb4d2445d600f89f9a/docs/DICTATION_RELIABILITY_PLAN.md
[probe]: https://github.com/gcalpay/vscode-universal-dictate/blob/834a1001ef5ef49da36710eb4d2445d600f89f9a/diagnostics/m1.2/README.md
[run]: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/34735635848
[h1-job]: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/34735635848/job/103666447977

Baseline source map, pinned to the inspected `main`:

- [Manifest/settings](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/package.json) and [controller/settings menu](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/extension.ts).
- [VS Code recorder adapter](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/recorder.ts), [core recorder](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/recorder.ts) and [native overlay](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/record-audio.cpp).
- [Dictation lifecycle](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/dictation.ts), [clipboard orchestration](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/paste.ts) and [native paste helper](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/windows-fast-paste.cpp).
- [Issue #38](https://github.com/gcalpay/vscode-universal-dictate/issues/38) and [frozen PR #49](https://github.com/gcalpay/vscode-universal-dictate/pull/49). Neither is closed or adopted by this handoff.
