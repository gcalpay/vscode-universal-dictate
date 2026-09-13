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

**Status: specification documented in this plan. No runtime acceptance tests have
been executed as part of M0.** A checked item below means its specification was
written, not that the extension meets it.

### M0.1: record the insertion contract

- [x] Specify the primary workflow and target semantics.

Primary workflow: place the caret, click the existing status-bar Dictate action,
speak, finish and receive the transcript at the intended insertion point without
another corrective click.

Required behavior:

- Correct insertion matters more than uninterrupted caret blinking. A temporary
  focus change is acceptable only if the intended destination and selection are
  restored reliably without user intervention.
- A caret between words remains that insertion point. A selected range is
  replaced as by an ordinary paste; text outside the range is unchanged.
- A deliberate selection of another editable target during recording becomes
  the intended destination. Do not force focus back to an earlier editor.
- Preserve the documented ability to deliberately target supported external
  Windows inputs. Do not silently change the product to VS Code-only insertion.
- Existing keyboard controls remain usable. Never automatically submit or send
  dictated text; cancellation must not insert a transcript.
- If a destination is known to have become unavailable, retain the transcript
  for explicit recovery rather than guess a different destination. Do not claim
  that every opaque composer can be inspected or that a successful input API
  call proves the intended control accepted text.

During M1, explicitly evaluate focus changes while transcription is pending.
Any target policy must distinguish deliberate retargeting from extension-induced
focus loss. Inability to distinguish them is a documented limitation, not a
reason to silently change the contract.

**Exit evidence:** this written contract. Functional conformance remains untested.

### M0.2: distinguish a fix, an alternative and a safeguard

- [x] Record the classifications and boundaries for implementation decisions.

| Outcome | Classification |
| --- | --- |
| The literal status-bar workflow meets the insertion contract without corrective clicks | Candidate fix for Issue #38, subject to acceptance tests |
| A separate non-activating native launcher achieves correct insertion | Alternative interaction; not automatically a fix for the unchanged status-bar requirement |
| A transcript can be copied or reinserted after failed insertion | Recovery safeguard; not a focus fix |

The literal status-bar control is the preferred interface. Its replacement is
not approved by the existence of PR #49. Any adoption of a floating launcher must
be explicit, initially optional and assessed for placement, visibility,
accessibility, fallback behavior and multiple-window correctness.

Do not ship a solution requiring a custom VS Code installation or injected
modifications to its interface. An upstream proposal can be investigated, but
upstream acceptance and availability are dependencies, not promised outcomes.
Do not repeat editor-focus workarounds unless new evidence explains how they
address the actual composer and selection.

**Exit evidence:** these classifications. Keep Issue #38 open unless its agreed
criteria pass; explicitly agree any change to those criteria before closure.

### M0.3: define the acceptance matrix and evidence format

- [x] Define tests before implementing another focus redesign.

| ID | Scenario | Required result | Current result |
| --- | --- | --- | --- |
| T01 | Real Codex composer, caret between existing words | Insert exactly there without a corrective click | Not run |
| T02 | Real Codex composer, selected text | Replace only that range | Not run |
| T03 | Normal editor and another supported editable VS Code input | Correct insertion in each | Not run |
| T04 | Deliberate retargeting during recording, including a supported external input | Use the deliberately selected target without forced return | Not run |
| T05 | Mouse start/finish and keyboard start/finish, across supported visualization modes | Same insertion contract; distinguish literal status-bar and alternative-launcher results | Not run |
| T06 | Cancel a recording | No transcript insertion or automatic submission | Not run |
| T07 | Destination closes or becomes unavailable; focus changes during transcription | No guessed target when loss is known; retain recovery and document observable limits | Not run |
| T08 | Two VS Code windows, minimize/restore and switching windows | No wrong-window insertion or competing launcher ownership | Not run |
| T09 | Remote-WSL workspace using the Windows UI host | Same applicable results as local Windows | Not run |
| T10 | Relevant native helper missing or exits | Reachable, accurately described fallback; no silent claim of focus preservation | Not run |
| T11 | Small/Medium/Large overlay at 100%, 125%, 150% and 200% scaling, including multiple monitors | Readable unclipped controls, aligned hit areas, non-activating interaction | Not run |

For each test record the commit/artifact, Windows version, VS Code version, Codex
extension version where relevant, local/Remote-WSL context, display scaling,
trigger/finish method, target, expected/actual result and supporting observations.
Use synthetic text, not private messages. Record failures as well as passes.

For focus feasibility, start with fixed test text rather than audio recognition.
Exercise the candidate's real start/finish interaction and insertion path. Include
a caret case, a selection case and deliberate retargeting; then repeat successful
cases with real recording and transcription. Unit tests or a mock text field do
not substitute for the real Codex composer.

**Exit evidence:** the matrix and evidence format above. M0 specifies acceptance;
M1 and M4 execute the applicable tests.

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
| M0.1 | Specification recorded | Insertion contract in section 3; not functionally validated |
| M0.2 | Specification recorded | Fix/alternative/safeguard classifications in section 3 |
| M0.3 | Specification recorded | Acceptance matrix and evidence format in section 3; every test is Not run |
| M1 | Not started | No new probe, implementation or live focus result |
| M2 | Not started | No recovery or clipboard changes |
| M3 | Not started | No new size setting or renderer changes |
| M4 | Not started | No integrated acceptance run, merge or release |

Current authorized change: create this planning document and its root
`AGENTS.md` pointer on the planning branch. No runtime implementation is authorized
by this plan alone; follow the user's next request.

Next step when asked to continue: read `AGENTS.md` and this plan, verify branch
state, then begin M1 with a concrete mechanism and the smallest deterministic
test plan. Read-only investigation can precede a separately authorized probe.
If the user prioritizes sizing or recovery, M3 or M2 can proceed independently.
Do not restart the discussion from scratch or silently choose a floating launcher.

For every continuation update this section with the milestone/substep, branch
and commit, changed files, actual tests/results, unresolved blockers/decisions
and the next concrete action. Keep status factual: specified is not implemented,
implemented is not tested, and tested alternatives are not automatically #38 fixes.
