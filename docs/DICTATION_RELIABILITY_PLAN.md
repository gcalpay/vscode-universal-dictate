# Dictation reliability and overlay sizing: implementation plan

Last updated: 2026-09-13.

Temporary working plan for `gcalpay/vscode-universal-dictate`. Read this document
when switching chats or tasks, then verify the live repository state. It is an
implementation roadmap, not a claim that planned behavior already works.

## 1. Baseline and branch policy

| Item | Baseline at plan creation |
| --- | --- |
| Release base | `main` at `f0265bc4398643c3b3a27e6d2ad64183b115b6ba` |
| Declared extension version | `0.1.5` |
| Planning branch | `docs/dictation-reliability-plan`, created directly from that `main` commit |
| Open target issue | [Issue #38: Preserve insertion target when starting dictation from the status bar](https://github.com/gcalpay/vscode-universal-dictate/issues/38) |
| Frozen experiment | `fix/preserve-insertion-target` at `5df91c3561ac31bd20f30d829d323347757469bf`, associated with draft [PR #49](https://github.com/gcalpay/vscode-universal-dictate/pull/49) |
| Current recording visualization | Enhanced native overlay, hardcoded width 740 and height 128; no exposed size setting |

Keep the old experiment untouched and unmerged. Do not delete it, reset it or
silently adopt its floating launcher as the new interface. It is reference
material and a candidate for evaluation, not the implementation base.

This planning branch contains documentation only. Subsequent runtime work should
use small, purpose-specific branches from the then-current `main`. To make this
plan discoverable there, first merge the documentation through normal review, or
explicitly carry these documentation files into an authorized work branch. Do not
base runtime work on the frozen experiment merely to obtain a plan.

Recheck branch tips before writes. Neither this document nor a green build
authorizes an automatic merge, release or closure of Issue #38.

### Source map

The following baseline links are immutable. Current code may later differ.

- [Manifest and available settings](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/package.json).
- [Controller, commands and visualization selection](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/extension.ts).
- [Recording overlay dimensions, drawing and hit testing](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/record-audio.cpp).
- [Dictation lifecycle](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/dictation.ts), [clipboard orchestration](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/paste.ts) and [native paste helper](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/windows-fast-paste.cpp).
- [Documented current behavior](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/README.md) and [existing manual test procedure](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/docs/TESTING.md).
- [Frozen native launcher](https://github.com/gcalpay/vscode-universal-dictate/blob/5df91c3561ac31bd20f30d829d323347757469bf/native/status-button.cpp) and [its controller integration](https://github.com/gcalpay/vscode-universal-dictate/blob/5df91c3561ac31bd20f30d829d323347757469bf/src/controller.ts).

## 2. Scope and delivery order

Improve the Windows VS Code extension, including its Remote-WSL workflow:

1. Establish an explicit insertion contract and tests (M0).
2. Prove a credible focus/insertion mechanism before expanding its implementation (M1).
3. Make completed transcripts recoverable when insertion fails (M2).
4. Add Small and Medium visualization layouts while retaining the existing Large option (M3).
5. Validate, document and release only accepted changes (M4).

M1 gates a focus redesign, not M2 or M3. Smaller overlays and transcript recovery
can be delivered independently if a literal status-bar fix needs upstream work.
Do not wait indefinitely on that investigation to improve the usable extension.

Do not expand this plan into a standalone application, cloud transcription,
LLM rewriting, unrelated refactors or additional visualization styles. Preserve
local transcription, existing language and waveform-time-span settings, the
warm-worker/fallback foundations and review-before-send behavior.

## 3. M0: define success in three small steps

**Status: M0.1-M0.3 complete as specifications. No runtime acceptance tests have
been executed as part of M0.** A checked item below means its specification was
written, not that the extension meets it.

### M0.1: record the insertion contract

**Status: complete as a requirements specification; not implemented or
functionally validated.**

- [x] Specify the primary workflow and target semantics.
- [x] Resolve retargeting during transcription: on 2026-09-13 the user selected
  **A: Follow your latest target**.

Primary workflow: place the caret, click the existing status-bar Dictate action,
speak, finish and receive the transcript at the latest deliberately selected
insertion point without another corrective click.

Required behavior:

- A target is an editable input together with its caret position or selected
  range, not merely an application window or the last active editor.
- Follow the latest deliberate target throughout recording and while
  transcription is pending, up to insertion. Pressing Stop or Insert does not
  freeze the destination. Deliberately selecting another supported editable
  input during transcription directs the result there, without another
  confirmation solely because the target changed.
- Moving the caret or changing the selection within the same input also updates
  the intended insertion point. With no deliberate change, preserve the original
  point or selection. Replace the selected range as by an ordinary paste; text
  outside that range is unchanged.
- Clicking Universal Dictate's Dictate, Stop or Insert controls is not
  retargeting. Extension-induced focus loss must not replace the intended
  destination with the status bar, a helper window or an unrelated editor.
- Correct insertion matters more than uninterrupted caret blinking. A temporary
  focus change is acceptable only if the latest intended destination and
  selection are restored reliably without user intervention. Do not force focus
  back to an earlier target after deliberate retargeting.
- Preserve the documented ability to deliberately target supported external
  Windows inputs. Do not silently change the product to VS Code-only insertion.
- Existing keyboard controls remain usable. Never automatically submit or send
  dictated text; cancellation must not insert a transcript.
- If the intended destination is known to have become unavailable and no newer
  valid target was deliberately selected, retain the transcript for explicit
  recovery rather than guess a different destination. Do not claim that every
  opaque composer can be inspected or that a successful input API call proves
  the intended control accepted text.

Examples of the agreed policy:

| User action before insertion | Intended result |
| --- | --- |
| Stop recording in Codex, then deliberately select another supported input while transcription runs | Insert into that newly selected input at its latest caret or selection |
| Move the caret or select a different range within the same composer while transcription runs | Use the updated caret or selection, not the position from Start or Stop |
| Only click Dictate and Insert, without deliberately changing the text destination | Preserve the original input and selection despite any control-induced focus change |

M1 must establish whether a concrete mechanism can honor this policy, including
changes during transcription. Distinguishing deliberate retargeting from
extension-induced focus loss remains a feasibility question. Merely pasting into
whatever control happens to own focus is not proof of following the latest
deliberate target. An inability to distinguish them is a documented limitation,
not permission to freeze the target at Stop or silently substitute a different
policy.

**Exit evidence:** this written contract and the user's explicit selection of A.
M0.1 is complete at the specification level only; functional conformance remains
untested and Issue #38 remains open.

### M0.2: distinguish a fix, an alternative and a safeguard

**Status: complete as decision criteria; no implementation route selected or
functionally validated.** M0.1's choice A remains unchanged.

- [x] Define what qualifies as a literal-status-bar fix versus an alternative
  interaction or a recovery safeguard.
- [x] Define evidence and issue-closure boundaries without choosing a mechanism.
- [x] Identify which later outcomes require a new user decision.

| Outcome | Classification and consequence |
| --- | --- |
| The genuine VS Code-owned status-bar Dictate action and supported finish controls meet M0.1 without corrective clicks | Candidate fix for Issue #38; becomes a validated fix only with the applicable acceptance evidence |
| A separate native launcher achieves the insertion behavior | Alternative interaction; requires explicit adoption and is not a fix for the unchanged literal-status-bar requirement |
| A completed transcript remains available for explicit copy/reinsertion after an insertion failure | Recovery safeguard under M2; useful independently, but does not demonstrate a focus fix |

**A literal fix is defined by behavior, not one chosen technique.** Preventing
focus loss or reliably restoring the latest deliberate input/caret/selection can
both qualify if demonstrated. Uninterrupted caret blinking is not required.
The user's normal workflow must not acquire an extra corrective click, mandatory
hotkey-only start or routine recovery step. An editor-only success while the real
Codex composer fails is a partial result, not a universal fix. A separate control
positioned to look like a status-bar item remains an alternative if it receives
the click instead of the genuine VS Code item.

**All candidate routes keep the M0.1 contract.** Follow the latest deliberately
selected input, caret or selection through transcription until insertion. Do not
freeze at Stop, return to an older target after deliberate retargeting or silently
restrict insertion to VS Code. Dictate/Stop/Insert interactions do not themselves
retarget. Preserve review-before-send, cancellation and existing keyboard
controls. Known loss of the intended destination invokes the recovery requirement,
not a guessed destination. Recovery after such an exceptional loss is distinct
from requiring manual recovery in the ordinary valid-target workflow.

**A floating launcher is not approved by PR #49's existence.** Keep its branch
frozen and use it only as reference/evaluation material. Adoption would require
a later explicit user decision, initially as an optional interaction. Evaluate
placement/occlusion, visibility, accessibility, window ownership and degraded
fallback. If a helper becomes unavailable and a fallback restores focus-stealing
behavior, describe that limitation; do not count the fallback as focus-preserving.
Do not silently hide or replace the existing launcher to obtain a passing result.

**Proof and delivery are separate.** M1 records a concrete mechanism, its exact
control/target scope, dependencies and observations; M0.3 defines the acceptance
cases and M4 validates the integrated result. A build, input-API return value,
mock input or one successful trigger path does not prove real Codex insertion or
all other paths. Record passed, failed and unrun cases separately. An upstream
proposal or diagnostic patch is feasibility work, not a shipped extension fix.
Do not ship a solution requiring a custom VS Code installation or injected UI
modifications. A supported upstream capability can be considered once available;
acceptance and availability must not be promised. Revisit editor-focus workarounds
only when new evidence explains how they address the actual composer/selection.

**Issue-closure rule:** keep #38 open until the agreed literal workflow and
applicable M0.1 acceptance cases pass on an identified, deliverable implementation.
A passing alternative, recovery feature or smaller overlay cannot close it by
itself. Do not weaken criteria, omit a failing required target or use automatic
closure text in an unrelated PR to declare success. Criteria changes, adoption
of a different launcher and merge/release/closure actions need explicit user
authorization; this milestone supplies none of those permissions.

**When to ask again:** no additional product decision is needed for M0.2. Ask
with concrete M1 evidence if only an alternative passes, a required behavior
cannot be supported by the tested mechanism or delivery needs an upstream
capability that is not available. Do not reopen choice A merely because it is
harder to implement. M2 recovery and M3 sizing remain independent improvements
and need not wait indefinitely for that decision.

**Exit evidence:** the classifications, common contract and decision/closure
rules above. M0.2 is complete at the specification level only; no route has been
proved, no launcher adopted and Issue #38 remains open.

### M0.3: define the acceptance matrix and evidence format

**Status: complete as a test specification; all runtime cases are Not run.**
No new product decision or implementation mechanism is selected here.

- [x] Define observable results for the latest-target policy, including changes
  during transcription and caret/selection changes within one input.
- [x] Enumerate supported start/finish paths and separate issue-fix evidence
  from alternative-launcher, recovery and sizing evidence.
- [x] Define reproducible fixtures, execution stages and honest result reporting.

#### Test setup and common pass conditions

Use scratch content only: the real Codex composer, a normal untitled editor and
one named ordinary VS Code input (for example, the Find input). Use a named
non-executing external text input such as an unsaved Notepad document for external
retargeting. Do not test by pasting into a terminal, submitting a chat or saving
private content. Record exact controls and versions rather than claiming that
one tested input represents every third-party composer.

For the deterministic probe, use the exact transcript `UD_TEST`. The caret
fixture is `left  right` with the caret between its two spaces; the selection
fixture is `left old right` with only `old` selected. Both must become
`left UD_TEST right`. Reset fixtures between trials. For retargeting, keep source
and destination distinguishable and check that every non-destination is unchanged.

Exercise the candidate's actual start/finish controls and insertion path; replace
only transcription with fixed text in a later authorized diagnostic probe. The
transcription-time cases need a controlled pending interval: confirm the user
change occurred after Stop and before insertion, rather than relying on an
estimated sleep. Completing that interval must not itself focus another control.
Do not create that probe in M0.3 or add its delay as a production workaround.

A valid-target pass means exactly one insertion at the latest deliberate caret
or selection, unchanged surrounding text and no insertion into an older target.
No corrective click, second confirmation solely for retargeting, automatic send,
submission or automatic retry of uncertain insertion is allowed. Start/Stop/Insert
clicks do not count as retargeting. Observe final text, selection replacement,
other inputs and submission state; caret blinking or an input-API return code
alone is insufficient evidence. A UI pattern that cannot expose a fact must be
reported as unverified, not assumed correct.

#### Acceptance cases

Scope codes: **F** = agreed focus/insertion behavior; **R** = M2 recovery/clipboard;
**S** = M3 sizing; **H** = relevant helper/fallback behavior. Apply **F** cases to
an alternative launcher in separately labelled runs; their success does not
convert that launcher into a literal-status-bar fix. Existing IDs T01-T11 are
retained as families, with subcases where needed. T12-T13 make M2 evidence explicit.

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

T07a/T10 have separate insertion-safety and recovery observations. M1 may evaluate
safety while marking recovery Not run until M2; do not mark the whole row passed.
T11 includes M3 configuration selection, invalid-value handling, next-session
application and regression checks for Status bar only/Off. Exact size dimensions
and the default remain as specified in M3, not decided by this test matrix.

#### Start/finish coverage for T05

The baseline manifest defines the shortcut and visualization modes, and
`src/extension.ts` exposes a clickable status-bar Stop (see the source map).
An overlay Insert pass must not conceal a status-bar Stop failure.

| Visualization mode | Start methods, each tested | Finish methods, paired with each start |
| --- | --- | --- |
| Enhanced overlay (`enhancedOverlay`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Both (`both`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Status bar only (`statusBar`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |
| Off (`off`) | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |

These are 20 baseline start/finish/mode combinations. Record caret and selection
results for each when validating the complete fix. Do not silently remove a
clickable path to avoid a failure. If a proposed interface changes this inventory,
report that as a separate product decision under M0.2 before altering acceptance.
Any native-launcher variant has its own inventory, not a substitute for these runs.

Shortcut trials assume the supported VS Code keyboard context; they are not
claims of a system-wide hotkey or terminal support. For external retargeting
during recording, use the non-activating overlay to finish. For external
retargeting during transcription, finish in VS Code first, then select the
external input. Do not click back into VS Code merely to issue a shortcut and
then describe the external target as still being deliberately selected. Esc is
tested while recording in its supported VS Code context; this does not introduce
cancellation during transcription. Use Discard for external-target cancellation
when the recording overlay is visible.

#### Execution stages and evidence

M1 starts with T01, T02, T03 and T04a-T04e in the default visualization, using
fixed text in the real controls. Start with genuine status-bar Dictate plus
overlay Insert, then check status-bar Stop and the keyboard path separately.
A core failure blocks claiming that route works, not documentation of other
results or independent M2/M3 work. A feasibility pass covers only exercised cases;
it is not release acceptance or permission to ship a diagnostic patch.

M4 runs the applicable families and all T05 baseline combinations for a claimed
literal fix, including local/WSL and relevant window/helper checks. Repeat each
exercised core scenario for at least five consecutive trials on the same candidate
build, record all attempts and preserve failures rather than reporting only the
successful retry. This is a regression check, not a statistical reliability claim.
Then repeat core scenarios with actual recording/transcription. Compare insertion
with the transcript actually produced, so recognition errors and targeting errors
remain separate. M2/M3-only releases run their feature tests and affected regression
paths without claiming the untouched focus defect is fixed.

Record one result per case/variant with: date/tester; branch and commit; artifact
identity (and probe/base distinction); Windows, VS Code and Codex versions;
local/Remote-WSL context; named target control; display scaling/monitors; mode;
start/finish method; initial text/caret/selection; ordered deliberate actions and
phase; supplied/generated transcript; expected and actual text in all affected
inputs; submission/duplicate check; attempt counts; outcome; evidence and limits.
Use synthetic content in logs or captures, not real dictated/private messages.

Allowed outcomes are **Pass**, **Fail**, **Not run**, **Blocked** (missing
prerequisite) and **Not applicable** (specific reason for that feature scope).
Never use Not applicable to hide a failing required target, trigger or missing
implementation. Split variants and mixed-scope observations instead of giving a
blanket pass. A changed candidate needs new evidence for affected cases; results
from another build are references, not automatic passes. Without real Windows/
Codex access, mark those cases Not run or Blocked and identify the missing setup;
compilation, mocks and a written procedure cannot supply their evidence.

**Exit evidence:** this matrix, coverage inventory and evidence procedure.
M0.3 and M0 are complete only as specifications. All 18 case rows remain Not run;
M1-M4 supply runtime evidence later. Choice A and M0.2's closure rules are unchanged.

## 4. M1: establish focus feasibility before committing to a redesign

**Status: not started.**

First recheck the live VS Code API/implementation and any relevant documented
composer integration. Identify a concrete mechanism: prevent focus loss before
it happens, or explicitly identify and address the intended target/selection.
A command that merely opens a sidebar or focuses an editor is not evidence of
selection-preserving insertion into the composer.

Evaluate the frozen native-launcher candidate without changing its branch. Its
existence, successful compilation or use of non-activation flags does not by
itself establish complete product behavior. Check readiness versus actual
visibility/target attachment, window ownership, positioning and degraded fallback.
Use its existing artifact if usable; any new diagnostic code belongs on a fresh,
authorized branch from `main`, not in the frozen branch.

Prefer a minimal deterministic experiment over another broad launcher rewrite.
Assess a supported literal-status-bar route first; an upstream mechanism or an
optional native launcher must be reported with its distinct scope and dependency.
Specify any experimental patch only after identifying the hypothesis it tests.

**Exit:** record one evidence-backed decision: literal workflow passes; only an
alternative passes and needs a product decision; or the tested mechanisms fail
or depend on an unavailable capability. An inconclusive/unrun experiment is not
proof of impossibility. Expand implementation substeps only after this decision.
A passing feasibility probe does not automatically authorize a production change.

## 5. M2: transcript recovery and clipboard reliability

**Status: not started; independent of the M1 outcome.**

Retain the latest completed nonempty transcript before attempting insertion.
Initially keep it in memory only, without a transcript database, content logging
or automatic persistence. Document that extension restart/reload can end recovery.
Expose Copy Last Transcript, Insert Last Transcript and Clear Last Transcript.
Reinsertion needs a keyboard-invokable path that does not first open a focus-
stealing interface; it must use the insertion behavior accepted for the product.

Do not automatically retry an uncertain paste: it may have succeeded, so retrying
could duplicate text. Handle empty/no-speech and cancellation without creating
spurious recoverable transcripts. Never send Enter as part of insertion.

Review clipboard restoration as part of this work. The baseline stores text and
restores it after a fixed delay. Restoration must not overwrite newer clipboard
content copied during the operation. Define ownership-aware behavior and whether
preservation covers only text or native non-text formats; do not promise full
clipboard preservation while retaining only a string. A longer sleep is not
proof of successful insertion or ownership.

**Exit:** focused tests cover retained transcripts, insertion errors, explicit
recovery/clearing, cancellation, no-speech and intervening clipboard changes.
Relevant Windows clipboard and GUI behavior is actually exercised. Claims about
retention, privacy and clipboard formats match the implementation.

## 6. M3: Small, Medium and Large visualization sizes

**Status: not started; explicitly requested and independent of M1.**

The user's current enhanced recording rectangle is too large for everyday use.
Add two smaller layouts and keep the current large presentation available.
This concerns the recording visualization, not PR #49's separate idle launcher.

| Size | Initial layout target at 100% scaling | Intended layout |
| --- | --- | --- |
| Small | Approximately 380 x 64 | Reduced waveform area and padding, with readable Insert/Discard controls |
| Medium | Approximately 520 x 88 | More waveform space without the current large footprint |
| Large | Current 740 x 128 presentation as the reference | Preserve the spacious existing option |

These are starting design targets, not tested or locked pixel dimensions. The
baseline numbers are hardcoded native coordinates; define DPI-aware logical
layout deliberately rather than assuming the current renderer already scales
correctly. Final dimensions must pass actual readability and hit-testing checks.

Use one enhanced waveform implementation with shared calculated layout metrics
for drawing and button hit testing. Do not just shrink every font/button or
revive the legacy compact renderer as an unrelated second visualization style.
Size must remain independent of waveform time span, audio sampling, recording
length and transcription quality.

Expose size in settings and the existing settings menu; a proposed key is
`universalDictate.overlaySize` with `small`, `medium`, `large` values. Apply changes
from the next recording session, consistent with current visualization settings.
Preserve Both, Enhanced overlay, Status bar only and Off semantics. Keep the
existing default until smaller layouts have been evaluated; making Small the
new default is a later explicit choice, not part of this documentation change.

**Exit:** all three layouts pass T11 and preserve Insert/Discard non-activation,
keyboard controls and waveform behavior. Configuration selection/validation and
native argument/layout handling have focused tests. No arbitrary drag-resizing,
positioning redesign or extra waveform styles are required for this milestone.

## 7. M4: integrated validation, release and plan retirement

**Status: not started.**

Integrate only accepted, narrowly scoped changes. Run the repository's actual
check, compile and Windows packaging commands, plus functional tests added for
changed behavior. Record which commands ran and their results. Compilation is
not a GUI test, and a release artifact must be tied to the tested commit.

Execute applicable acceptance cases with the real Windows VS Code/Codex setup.
Update README/settings help, CHANGELOG and durable test/architecture notes to
match shipped behavior and known limitations. Keep issue-fix evidence separate
from recovery and optional-launcher evidence. Do not automatically close #38 or
merge PR #49 as a side effect of an unrelated improvement.

Release approval is separate from planning and implementation. M2/M3 may ship
without a focus fix; clearly retain #38 as unresolved in that case.

Once the work is completed or explicitly retired, transfer enduring tests,
behavior, limitations and any remaining blockers to regular project docs/issues.
Then delete this temporary plan and remove its pointer in `AGENTS.md` in the same
cleanup change. Preserve any unrelated agent guidance. Do not delete the only
record of an unresolved issue or leave a dangling plan link.

## 8. Progress and handoff

| Milestone | Current status | Evidence / remaining work |
| --- | --- | --- |
| M0.1 | Complete: requirements specification | User confirmed A on 2026-09-13; latest deliberate input/caret/selection wins through transcription; no runtime validation |
| M0.2 | Complete: decision criteria | Fix/alternative/safeguard boundaries, evidence and closure rules finalized; no implementation selected or validated |
| M0.3 | Complete: test specification | 18 case rows across 13 families, 20 baseline start/finish/mode combinations and evidence rules; all runtime cases Not run |
| M1 | Not started | No new probe, implementation or live focus result |
| M2 | Not started | No recovery or clipboard changes |
| M3 | Not started | No new size setting or renderer changes |
| M4 | Not started | No integrated acceptance run, merge or release |

Current authorized change: finalize M0.3 on `docs/dictation-reliability-plan`
and update the M0 summary and this handoff. Documentation only; no diagnostic
probe, runtime implementation, new launcher, merge, release or issue closure.
M0.1/M0.2 remain unchanged. M0 is now complete as specifications, not as tested
behavior; M1-M4 remain unstarted.

Completed planning history:

- `50d75cca9d201a96e120850eb33cc016c3fe7dbc`: initial plan and `AGENTS.md` pointer.
- `139509890a5171de65012910c46d14ca924433ad`: M0.1 finalized after the user
  selected A. Keep following the latest deliberate target through transcription.
- `ce68d69bc84a6d9bc49091507f6c04e6360d01de`: M0.2 finalized fix/alternative/
  safeguard classifications and evidence/closure boundaries; no route selected.

Handoff for M0.3 (2026-09-13):

- Planning branch tip reviewed: `ce68d69bc84a6d9bc49091507f6c04e6360d01de`.
  The M0.3 commit follows that tip; resolve its SHA from file/branch history.
- Changed file: `docs/DICTATION_RELIABILITY_PLAN.md`, M0 summary, M0.3 and this
  handoff only. `AGENTS.md` already points here and needs no change.
- Clarifications: no new user decision needed. Choice A remains fixed. Explicit
  recording/transcription and same-input variants close gaps in the original
  matrix; actual Start and Stop paths are covered separately. Recovery/sizing
  results cannot stand in for a literal-status-bar fix.
- Validation scope: documentation diff, matrix/combination consistency, unchanged
  M0.1/M0.2/M1-M4 sections and branch state. No runtime, GUI, build or acceptance
  tests were run; all 18 case rows and their variants remain Not run.
- Remaining uncertainty: M1 must demonstrate a concrete mechanism on real
  Windows VS Code/Codex. No feasibility or platform impossibility is established
  by this document. A future GUI test requires access to that environment.

Next step when asked to continue: read `AGENTS.md` and this plan, verify refs,
then begin M1 with a read-only capability/mechanism assessment and the smallest
fixed-text experiment justified by it. Do not restart M0 or reopen choice A.
Before runtime work, follow section 1 to make the plan available on a fresh
purpose-specific branch from current `main`. Any probe stays within the user's
current authorization; do not touch the frozen branch or silently adopt its
launcher. Ask for Windows testing help only when a concrete artifact/procedure
needs that environment. M2 or M3 can proceed independently if prioritized.

For every continuation update this section with the milestone/substep, branch
and commit, changed files, actual tests/results, unresolved blockers/decisions
and the next concrete action. Keep status factual: specified is not implemented,
implemented is not tested, and tested alternatives are not automatically #38 fixes.
