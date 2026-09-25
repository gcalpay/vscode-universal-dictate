# Universal Dictate: reliability, overlay sizes, live preview and translation

Updated: 2026-09-25. Repository: `gcalpay/vscode-universal-dictate`.
Temporary implementation roadmap, linked from root `AGENTS.md`.
This revision extends the handoff at `0647906` with live preview and optional
translation. It preserves the settled insertion contract and test IDs.

## 1. Decision and execution order

**Start product implementation with M3: Small/Medium/Large recording overlays.**
Do not make Issue #38 or its experimental builds a prerequisite for this work.

| Work order | Milestone | Dependency / branch |
| --- | --- | --- |
| Already specified | M0: insertion contract and evidence rules | Preserve; do not reopen |
| First | M3: overlay size presets | New `feat/overlay-size-presets` from current main |
| Second | M2: transcript, clipboard and lifecycle reliability | New `fix/transcript-recovery` from updated main |
| Third | M5: optional live transcript preview | New `feat/live-transcript-preview`; build on accepted M3/M2 foundations |
| Optional subsequent feature | M6: translation | New `feat/translate-to-english` only after its scope is accepted |
| Separate research track | M1: genuine status-bar focus preservation | Existing isolated diagnostic; not a product branch dependency |
| At every candidate | M4: validation, review and release | Applies to each accepted feature, not only the last milestone |

Milestone numbers identify existing work, not chronological dependencies. M5 and
M6 are new. English-only output translation could be prioritized before M5 after
an explicit scope/order decision; neither feature requires the other. M5.1's
feasibility investigation can be evaluated independently, but do not concurrently
rewrite the same recorder/engine on several product branches.

The normal delivery cycle is one focused feature branch, targeted implementation,
review and authorized merge into main, then the next branch from that updated main.
A Marketplace release need not accompany every merge. Do not create a single
long-lived branch containing sizes, live decoding, translation and focus research.
Do not merge either experiment just to unblock a feature or obtain these docs.

This revision authorizes no runtime work by itself. Continue within the user's
active Codex request. Do not start builds, install dependencies, change local Git
state, merge, publish or close issues beyond that session's explicit approval.
Once a bounded implementation chunk is authorized, do not seek a new product
choice for every routine edit; report at the agreed milestone boundary.

### Verified repository snapshot

| Item | State read on 2026-09-25 |
| --- | --- |
| Product base | `main` at `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`, declared version 0.1.5 |
| Planning branch before this revision | `docs/dictation-reliability-plan` at `0647906e0da7c075f32be27ee29f81baad769306` |
| Frozen native-launcher branch | `fix/preserve-insertion-target` at `5df91c3561ac31bd20f30d829d323347757469bf` |
| Its PR | #49 is open; the current API reports `draft: false`, unlike older handoffs; no adoption or merge is authorized |
| Separate diagnostic | `experiment/m1.2-statusbar-focus-probe` at `834a1001ef5ef49da36710eb4d2445d600f89f9a` |
| Diagnostic build | Run `34735635848`, code `6bef0311f3f6cee9c94941c5bd1456dfbaf01593`: kit passed, both host jobs failed |
| Product features in this roadmap | Sizes, recovery, live preview and translation have no implementation/acceptance evidence on the inspected main |

Recheck remote refs and the actual local worktree before edits. This snapshot says
nothing about uncommitted local work. Never reset, clean, stash or overwrite it.
Do not resurrect historical automation branches or their obsolete next-step rules.

**Plan transfer:** if main lacks these files, carry only the latest reviewed
`AGENTS.md` and `docs/DICTATION_RELIABILITY_PLAN.md` into the authorized feature
branch. Do not merge or cherry-pick an experimental branch to get documentation.
If a local branch already contains newer progress, reconcile it rather than
replacing its ledger with this snapshot. Keep one current work order and update
it at each handoff. The planning branch remains documentation-only.

## 2. Settled behavior and proposed feature boundaries

### Settled M0 contract

Follow the latest deliberately selected editable input AND its caret/selection
until insertion, including changes during recording and transcription. The same
rule applies through any new final translation step. Stop/Insert does not lock
the destination. Without a deliberate change, preserve the original point/range.
Replace only the selected range, as ordinary paste would.

Dictate/Stop/Insert controls do not count as retargeting. Do not force focus back
to an earlier editor. Preserve supported external Windows inputs and the Windows
UI extension host in Remote-WSL. Correct insertion, not uninterrupted caret
blinking, is the acceptance condition. Never synthesize Enter or submit a message.
Cancellation must not insert text from the cancelled attempt.

Known loss of the intended destination requires explicit recovery rather than a
guessed target. Detecting every opaque input's state is not currently established;
do not promise universal detection or treat input-API success as text acceptance.

A genuine status-bar fix, a separate non-activating launcher and transcript
recovery remain three distinct outcomes. An alternative can be adopted only by
explicit decision; it cannot silently replace the literal workflow. Sizing,
preview or recovery alone does not close #38. Preserve failing/unrun observations.

### Proposed defaults for the additions

These are recommended initial scopes, not claims of existing functionality or
blanket approval to implement all features:

- **Sizes:** Small/Medium/Large; keep current Large default until a later explicit
  decision after visual testing.
- **Live transcript:** opt-in, read-only provisional text in the existing recording
  overlay. Paste one finalized result after Stop. Do NOT type partial hypotheses
  into the target input. Continuous target insertion is a different feature and
  would couple this work to selection, undo, revision and focus reliability.
- **Translation:** optional and off by default. Propose original-language output
  or English output for the first version. Other target languages need a separate
  backend decision. Translation was requested tentatively; confirm scope before M6.

Snapshot configuration at recording start: input-language preference, output task,
overlay size and preview setting remain consistent for that session. Target choice
continues to follow deliberate user actions; configuration snapshots do not freeze
focus. Preserve local/offline operation after required model setup, warm inference,
CLI fallback for final output and current language/waveform-time-span semantics.

No cloud ASR, LLM rewriting, standalone app, mouse hooks, click replay, injected
workbench UI or compulsory custom VS Code installation belongs in these features.
Additional microphone selection, model presets, drag/corner positioning and extra
waveform styles remain backlog. Performance measurement needed for live preview
is in scope; a general telemetry/analytics product is not.

## 3. M3: overlay size presets

**Status: planned; next product task.** Branch: `feat/overlay-size-presets`.

| Setting | Label | Starting layout target at 100% scaling |
| --- | --- | --- |
| `small` | Small | Approximately 380 x 64 logical units |
| `medium` | Medium | Approximately 520 x 88 logical units |
| `large` | Large | Current 740 x 128 presentation as reference |

These are provisional targets, not tested dimensions. Reduce padding and waveform
area before reducing text/button usability. Missing/invalid values retain Large.

### M3.1: settings and adapter propagation

Add `universalDictate.overlaySize` to the manifest, VS Code Settings and existing
extension settings menu. Validate once per session and pass the value through
`src/extension.ts` -> `src/recorder.ts` -> `src/core/recorder.ts` -> native recorder.
Use a validated native argument such as `--overlay-size`; preserve existing callers,
defaults and process messages. Changes take effect next session. Status bar only
and Off must not create an overlay merely because a size has been configured.

Exit: setting selection/defaults and the entire argument chain have targeted tests.

### M3.2: one native renderer and consistent geometry

Calculate window size, waveform bounds, labels and Insert/Discard hit areas from
shared layout metrics in or near `native/record-audio.cpp`. Do not simply change
two constants, shrink a bitmap or revive the unrelated legacy compact renderer.
Small pure layout helpers are acceptable; a UI-framework migration is not.

Define native process/window DPI awareness before creating windows. Apply a
consistent logical-to-device transform, account for relevant monitor/DPI changes
and keep controls inside the work area, including negative monitor coordinates.
Preserve non-activation and graphics/font resource cleanup. Do not change audio
capture, sampling, recording duration, waveform-time-span meaning or ASR quality.

Keep the renderer easy to extend with a text region later, but do not implement
live inference, reserve a large empty transcript panel or change window size
automatically in M3 just because M5 is planned.

Exit: all three layouts render from common metrics and have matching hit areas.

### M3.3: verification and product acceptance

Test defaults, native argument parsing, layout bounds, hit testing and next-session
changes. Run relevant TypeScript/native/package checks. Verify all sizes on real
Windows at 100%, 125%, 150% and 200% scaling and mixed-DPI monitors where available.
Check normal Windows VS Code and Remote-WSL, both overlay modes, no-overlay modes,
Insert/Discard, shortcuts and no new focus regression. Capture synthetic examples.

Update help/README/test notes and apply M4. A full Code OSS build is not required.
Record existing #38 failures as baseline limitations, not as fixed behavior or
new failures caused by sizing. Never mark GUI checks passed from geometry alone.

## 4. M2: recovery, clipboard and lifecycle reliability

**Status: planned, after M3 in the recommended order.**
Branch: `fix/transcript-recovery`; independent of H1.

### M2.1: retain the latest completed result

Save the latest nonempty completed transcript in memory BEFORE insertion. Expose
Copy Last Transcript, Insert Last Transcript and Clear Last Transcript. A later
valid result replaces the saved result; successful insertion does not immediately
erase it because opaque targets cannot reliably acknowledge acceptance.

Empty/no-speech, failed or cancelled attempts do not erase the previous valid
result. Clear removes it; reload/restart ends memory-only recovery. Do not log
contents or add persistent audio/transcript history. Copy is explicit, not an
automatic permanent clipboard replacement.

Reinsert must have a keyboard-invokable path that does not open a focus-stealing
menu first. Serialize it with active dictation/paste; do not silently queue a paste
for an unrelated later target. No automatic retry of an uncertain insertion.
Document existing target limitations honestly; recovery is not a focus fix.

Exit: retention, clearing, no-result behavior and exactly-once manual reinsertion
have unit and targeted Windows evidence.

### M2.2: restore clipboard only when still owned

The baseline saves clipboard text, sends Ctrl+V and restores after 120 ms.
Prevent restoration from overwriting a newer copy, including an identical-text
copy. Comparing only string values or increasing a delay is insufficient. Design
and test the ownership check/restore race using the appropriate native primitives.
Do not hold the clipboard open across the target's paste operation.

Define supported formats before changing native handling. Prefer preserving an
existing payload where feasible, but do not promise arbitrary delayed-rendered,
image, file or rich-text preservation from a saved string. Unsupported content
needs a safe non-destructive fallback or an explicitly accepted limitation before
release. Keeping the transcript for explicit recovery is preferable to silently
clobbering a payload. Keep new native responsibilities small.

Tests include empty/text/Unicode/multiline content, a newer different or identical
copy, clipboard contention, helper/restore failure and representative non-text
formats. API acceptance is not proof that an application consumed the clipboard.

Exit: ownership/format policy is documented and tested; no blind restoration or
automatic duplicate insertion is introduced.

### M2.3: prevent obsolete asynchronous work

Reproduce and test disposal during preparation, recorder startup and pending
transcription; duplicate Stop; recorder errors; late callbacks and cleanup.
The inspected engine clears its session before awaiting transcription, while
`dispose()` only cancels a currently stored session. Late insertion is therefore
a source-visible risk, not a GUI failure already measured.

Invalidate obsolete operations before state updates/insertion; clean temporary
WAVs and workers, including a recorder acquired after disposal. Avoid an unrelated
engine rewrite. This does not add user-facing cancel-during-transcription by itself.
These guards also provide the foundation for rejecting stale preview work in M5.

Exit: stale work cannot insert or revive controls, and error/idle cleanup remains
usable. Apply T12/T13, affected failure cases and M4.

## 5. M5: live transcript preview

**Status: newly planned; not implemented.** Branch: `feat/live-transcript-preview`.
Recommended first release: optional preview in the recording overlay, final paste
once after Stop. M3 supplies layouts; M2 supplies retention/lifecycle safeguards.

### M5.1: prove the local preview path and performance

Inspect the actual pinned backend before coding. The current adapter posts a
complete WAV to a warm local server and collects a completed text response; the
native recorder currently emits readiness, level and action messages, not partial
transcripts. Adding a text label or a supposed streaming flag is not sufficient.
The upstream [whisper-stream example][stream] demonstrates repeated microphone
inference, but it is an example with its own capture path, not a ready integration.

Test the smallest candidate using the existing recorder plus bounded audio
snapshots and the existing warm worker. Compare a native streaming worker only
if measurements justify the additional integration. Do not open a second
microphone recorder, add Python/CUDA as a requirement or start a fresh CLI/model
for every preview update. Current inference explicitly disables GPU; benchmark
the actual deployed CPU/model path, not an assumed accelerated configuration.

Measure warm/cold first-use latency, delay from speech to visible partial text,
update cadence, CPU/RAM and finalization delay on identified hardware. A useful
initial goal is updates roughly every 1-2 seconds after warm-up, not a promised
per-word guarantee. Lock a measured supported operating range before production
integration. Slow inference must cause reduced preview refresh or a stated
final-only fallback, not a growing queue or broken recording.

Exit: record the selected mechanism, measurements, bounds and success/failure
criteria. Do not promote an unmeasured preview to the default or ship fake live text.

### M5.2: bounded capture and decoding lifecycle

Keep one microphone/capture owner and preserve the complete recording for final
recognition. Transfer bounded PCM/snapshots from the recorder through a worker;
no ASR, blocking pipe writes or heavy encoding/allocation in the audio callback.
Do not treat an unfinished WAV as a valid independently finalized audio file.
If temporary snapshot WAVs are used, finalize each correctly and delete it.
Waveform history is not the PCM source or the live-recognition window length.

Version/frame new protocol messages and validate lengths, session IDs, sequence
numbers and UTF-8. A transcript containing newlines, quotes or the words STOP/CANCEL
must remain text, never a recorder command. Preserve existing control messages.
Enforce bounds in both producer and consumer; content is not diagnostic logging.

Use at most one active preview decode and one replaceable latest pending snapshot
initially. Drop superseded work, not original audio. Associate results with session
and snapshot IDs; ignore old-session, out-of-order and post-Stop results. On Stop,
stop scheduling preview and give final recognition priority. Closing an HTTP
request does not necessarily cancel backend computation: define bounded wait,
backend cancellation or safe restart behavior explicitly.

Do not let a preview error trigger repeated expensive CLI fallbacks or tear down
a worker used by final recognition without coordination. Degrade preview for the
session while retaining the recording and ordinary final-output path. Cancellation,
disposal and helper errors must drain/clean workers and bounded buffers safely.

Exit: slow/stale/failing preview cannot corrupt audio, cause unbounded backlog or
race another session's final insertion.

### M5.3: non-activating preview UI in all sizes

Proposed setting: `universalDictate.liveTranscript` (boolean, default false),
applied next session. Show read-only provisional original-language text in the
existing enhanced overlay; no per-word edits to Codex, the editor or clipboard.
Hypotheses can revise earlier words. Replace/reconcile preview snapshots rather
than blindly appending every partial. Do not present a stability heuristic as a
probability or guarantee that a word cannot change.

Keep the same selected window footprint. In Small, show a short latest-text line;
Medium/Large can show more wrapped lines. Reallocate waveform/padding space as
needed, keep controls readable and do not auto-enlarge the window. Exact line
counts and text bounds must pass layout tests, not become inflexible promises.
Do not turn preview into an editable field that steals the insertion target.

In Status bar only/Off, leave those visualization semantics unchanged: no transcript
surface and no needless preview decoding. Explain that live preview requires an
overlay; never force one on. No screen-reader announcement per token or focus-
stealing notification loop. Verify Unicode/font fallback and right-to-left samples.

If automatic source-language detection is used, test behavior on short clips and
mixed-language speech; do not continually reinterpret the user's output language.
Configuration changes apply next session. Translation interaction is defined in M6.

Exit: real words update visibly, controls stay non-activating and all three sizes
remain usable with preview on or off.

### M5.4: finalize once, recover and validate

After Stop, finalize the full recording, quiesce obsolete preview jobs and obtain
one authoritative final transcript. Preserve the existing final ASR fallback.
The final result may differ from the preview: retain it under M2, then paste once
at the latest intended target. Never concatenate overlapping partials as the
unverified final result or use the preview as a second paste.

If final recognition fails, do not silently insert a provisional fragment or
replace the previous completed recovery item with it. Any later partial-recovery
feature must be explicit and labelled provisional; it is not part of M5 v1.
Keep complete audio cleanup and microphone shutdown independent of UI repainting.

Test silence/no-speech, pauses, repeated words, technical vocabulary, Unicode,
retargeting while previewing/finalizing, fast Stop/Discard, repeated sessions,
slow/failing workers and at least one multi-minute session. Verify bounded memory
and queue behavior, no duplicated/missing boundary text and exactly one final
paste attempt. Record recognition errors separately from UI/targeting errors.
Run new T14-T16 plus affected existing cases and M4. No #38 closure is implied.

## 6. M6: optional translation

**Status: tentative feature; scope decision before implementation.**
Proposed branch: `feat/translate-to-english`. This need not wait for M5.

### M6.1: agree output scope and verify backend capability

Keep spoken/input language separate from output task. Recommended v1 choices:
**Original language** (default) and **Translate to English**. For example, spoken
German can yield German text or English text. Setting the recognition language
to English is not a translation implementation.

The pinned [whisper.cpp server documentation][server] exposes translation into
English. The [Whisper model documentation][whisper] distinguishes translation-
capable multilingual models from English-only models and turbo. Verify the
bundled model and both actual runtime paths; a flag's existence is not a quality
validation. Arbitrary targets such as English-to-German are not provided by
Whisper's built-in English-translation task.

The user has not chosen translation direction or approved an additional backend.
Confirm English-only v1 before implementing M6. For another target, first define
local model/runtime, supported language pairs, quality, size, licensing and
resource requirements; any cloud/cost/privacy change needs separate approval.
Do not block M3/M2/M5 on that optional decision.

Exit: target languages and backend are explicitly chosen, without an invented
multi-language capability or silent online fallback.

### M6.2: consistent final-output mode and recovery

Proposed setting: `universalDictate.outputMode` with `transcribe` and
`translateEnglish`, default `transcribe`, captured once at session start. Display
the chosen output mode before recording in the existing settings/status/overlay
feedback without adding focus-stealing dialogs during insertion.

Propagate the task explicitly through the VS Code adapter, core Whisper runtime,
server request and CLI fallback. Verify the pinned server's per-request behavior;
send/reset task state deliberately so one translation cannot affect the next
ordinary transcription. Final fallback must keep the same input language and
output task. Test both directions of switching modes without restarting the app.

For v1, live preview remains original-language text, clearly labelled when final
output will be English. Translate the final recording/result after Stop, not every
unstable partial. Do not silently start a second expensive full decode just to
claim that both source and translation are available. Recovery stores the actual
completed output with its mode/language metadata. Keep the source transcript only
if actually produced; provisional preview is not a verified final source record.

Follow the latest target until the single final paste, including while translation
is pending. On translation failure retain the previous valid result and report the
failure; do not silently paste source text under an English-output label. Any
explicit source-output fallback must be separately described to the user.

Exit: settings, both backends, preview labels and recovery agree on what language
will be inserted, with no cross-session task leakage or automatic submission.

### M6.3: quality and regression acceptance

Test original/English output, manual/auto source language, server/CLI paths, mode
switches, errors, empty/no-speech audio and preview on/off. Use synthetic bilingual
samples containing numbers, units, names, negation and technical terms. Assess
meaning, omissions and numerical fidelity; do not require one exact phrasing for
all valid translations or infer semantic quality from flag/HTTP tests.

Document translation limits of the actual bundled model. Do not download a larger
model, add an LLM postprocessor or change defaults silently to hide poor quality.
Run T17/T18, affected recovery/finalization checks and M4. Broader target languages
and live translated captions remain separate follow-on work.

## 7. M1: focus preservation as a separate evidence-driven track

The last source assessment identified H1: cancel primary mouse-down defaults on
the genuine item inside VS Code's renderer while keeping click/keyboard handling.
No sufficient supported extension-only route was established then. Recheck current
public capabilities when resuming, not on every sizing/preview implementation step.

| Sub-milestone | Current state | Next bounded action |
| --- | --- | --- |
| M1.1: capability assessment | Recorded in [prior plan][history] | Reuse the evidence; update only changed capability assumptions |
| M1.2: smallest isolated diagnostic | Implemented, host-build gate failed | Diagnose build prerequisite and establish a runnable baseline plus real Codex compatibility |
| M1.3: core Windows comparison | Not run | Compare matched baseline/H1 with real caret/selection and independent Start/Stop paths |
| M1.4: delivery decision | Not reached | Record passing scope, failures and upstream availability; ask only when an alternative requires a product choice |

[Run 34735635848][run] still reports successful kit and failed baseline/H1 hosts.
The prior [H1 log][h1-job] ended with `Error: spawn signtool.exe ENOENT` after
bundling/packaging; it did not establish a focus failure. Executable lookup is the
observed issue, not proof the tool was absent from the runner. The baseline job's
terminal cause was not independently diagnosed in the prior reassessment.
No complete verified host/kit set or real Codex result is available in this record.

Do not keep rerunning a full VS Code build without a diagnosed correction. When
resumed, retain source pins/provenance, verify real Codex can run, and do the
smallest decisive tests before expanding infrastructure or adding a public API.
The diagnostic's special release chord is test equipment, not a product workflow.

A successful source-build test still needs a supported delivery route; users must
not maintain a patched VS Code. If an upstream capability is unavailable, record
that specific blocker and continue independent product work. Keep both existing
experiments isolated. PR #49 currently contains `Closes #38`; do not merge it or
reuse that closure text without satisfying the agreed criteria and explicit
approval. Its current non-draft state does not override the user's freeze.

## 8. M4: repeatable validation, review and release

### M4.1: proportionate tests for the actual change

Run normal typecheck/compile/native checks and feature-specific tests. Verify
Windows behavior in a separate normal VS Code test profile and Remote-WSL where
applicable. M3 does not need a Code OSS source build or the full focus research
matrix. A pre-existing #38 failure must be reported, not hidden or attributed to
a new feature without evidence. New regressions block acceptance.

### M4.2: artifact and documentation review

Build/inspect the real win32-x64 VSIX and bind results to a commit/artifact.
Exclude diagnostics, source patches, test-only shortcuts and probe bootstraps.
Verify settings defaults, worker/native dependencies, clean startup, repeated
sessions, failures and preview/translation combinations actually included.
Update README, settings help, CHANGELOG and durable test notes. Never log private
transcripts merely to demonstrate coverage. Treat audio/text as data, not commands.

### M4.3: merge, release and handoff

After review and explicit approval, merge the focused branch; branch the next
feature from updated main. Publish only with separate release approval. A release
can contain sizes alone, then recovery, then preview and optional translation;
none needs to wait for upstream focus work. Do not claim #38 fixed by those releases.

Update the ledger at each implementation boundary. Retire the temporary plan only
when its selected work is completed or explicitly retired, preserving enduring
behavior/tests/blockers first. Delete the plan and AGENTS pointer together without
removing unrelated guidance or the only record of an unresolved issue.

## 9. Acceptance reference

The original 18 rows and IDs below are preserved verbatim. F = focus/insertion,
R = recovery/clipboard, S = sizing and H = helper/fallback. New preview (P) and
translation (X) cases follow. Every runtime row remains Not run.

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

### New feature acceptance cases

| ID | Scope | Scenario / action | Required observation | Current result |
| --- | --- | --- | --- | --- |
| T14 | P + S | Preview on/off in each size and visualization mode; Unicode, RTL and changing hypotheses | Bounded readable provisional text; no forced overlay, focus change, partial target edit or clipboard write | Not run |
| T15 | P + R | Slow/out-of-order previews, worker death, Stop/Discard/dispose and next-session restart | No stale update, unbounded queue or lost recording; authoritative final result retained and at most one paste attempt; no partial promoted to final | Not run |
| T16 | P | Warm/cold latency, technical phrases, pauses, silence and multi-minute recording on identified hardware | Report actual text delay, CPU/RAM, finalization time and bounded backlog; recognize quality limits rather than promise instant words | Not run |
| T17 | X + R | Source/original versus English output; source auto/manual, server/CLI, mode changes and failure | Correct task on both paths, no mode leakage or silent source-language fallback; recovery metadata and output agree | Not run |
| T18 | P + X + S + F regression | Released combinations of size, preview, output task and mouse/keyboard finish; retarget during final processing | Preview/final language labels agree, no surprise resize and one final output at intended target where supported; known #38 limits explicit | Not run |

### Coverage and evidence rules

T07a/T10 split safety from recovery. Do not mark an entire mixed-scope row passed
when one part is unimplemented. T11 includes setting/default validation and
next-session/no-overlay behavior. M5 requires T14-T16 and affected T01-T13; M6
requires T17/T18 and affected finalization/recovery cases. Run T18 for feature
combinations actually shipped; it must not make optional M6 a dependency for M5.

The original genuine start/finish inventory remains:

| Visualization | Start methods, each tested | Finish methods paired with each start |
| --- | --- | --- |
| Enhanced overlay | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Both | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D; overlay Insert |
| Status bar only | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |
| Off | Genuine status-bar Dictate; Ctrl+Alt+D | Status-bar Stop; Ctrl+Alt+D |

These are 20 baseline combinations, with caret/selection variants for a claimed
literal fix. Overlay Insert success cannot conceal status-bar Stop failure. An
alternative launcher has a separately labelled inventory; do not remove controls
to hide failing paths. Test unchanged keyboard navigation/activation separately.

Fixed-text fixtures: `UD_TEST`; caret between the two spaces in `left  right`,
or only `old` selected in `left old right`. Expected result: `left UD_TEST right`.
Reset between trials and check every non-destination remains unchanged. Use real
Codex, an untitled editor, a named ordinary input and an unsaved external text
document. Never submit a chat or paste into a terminal for these tests.

Observe a controlled pending interval for retargeting, not an assumed sleep.
Its completion trigger must not steal focus. For external retargeting during
recording, finish with the non-activating overlay. During transcription, stop in
VS Code first and then choose the external input. Do not describe the VS Code
shortcut as global. Esc is a recording-context test, not a new cancel-processing
feature. No corrective click or automatic retry may be hidden in a passing run.

A claimed #38 fix requires applicable F cases and all relevant T05 paths, real
Windows/Codex plus local/WSL contexts. Repeat exercised core cases for at least
five trials on the same build and retain failures; this is not a statistical
reliability guarantee. Follow fixed-text tests with actual transcription.
For live preview and translation, use synthetic audio and separately assess
recognition/translation quality versus insertion and UI behavior.

Record date/tester, branch/commit/artifact, Windows/VS Code/Codex/backend versions,
CPU/GPU and DPI where relevant, local/WSL context, named inputs, settings, initial
text/selection, ordered actions, expected/actual result, timing/resource metrics,
trial counts and evidence/limits. No real private transcript content in public logs.
Allowed outcomes: Pass, Fail, Not run, Blocked (prerequisite) and Not applicable
(reason tied to feature scope). Never use Not applicable for a failing required
case, or compilation/mocks/Linux-only checks as Windows GUI evidence.

## 10. Live handoff ledger and next session

| Work | Status | Next action |
| --- | --- | --- |
| M0 | Complete as specifications | Preserve latest-target and evidence contract |
| M3.1-M3.3 | Planned; no implementation recorded | Next Codex task: overlay sizes from main |
| M2.1-M2.3 | Planned | Recovery/clipboard/lifecycle after sizing |
| M5.1-M5.4 | Newly planned | Measured live-preview feasibility before streaming integration |
| M6.1-M6.3 | Tentative | Confirm translation direction and backend scope before implementation |
| M1.1 | Assessment recorded | Reuse evidence on research resumption |
| M1.2 | Diagnostic exists; build gate failed; independent track | Resume only when explicitly prioritized |
| M1.3-M1.4 | Not run / not reached | Actual Windows/Codex comparison and delivery decision |
| M4.1-M4.3 | Not started for product changes | Apply per accepted product candidate |

This update changes the plan and AGENTS guidance only. No runtime, feature branch,
merge, release, issue closure or build dispatch occurs as part of planning. The
original 18 test rows and the five new rows all remain Not run. The target language
for optional translation and exact live-preview latency/layout are still future
scope/measurement decisions, not reasons to repeat M0 or defer the size work.

**Next bounded implementation:** inspect the local checkout and live refs; obtain
any needed Git/install approval; create `feat/overlay-size-presets` from current
main with these two docs; implement M3.1-M3.3 only, test and report. Do not repair
the Code OSS build or begin live decoding/translation in that task. Preview and
translation have their own later branches; this roadmap is not an instruction to
build all features in one agent run.

At each handoff append milestone/substep, branch/commit, changed files, actual
checks, blocked decisions and one concrete next action. Keep planned, implemented,
built and GUI-validated states distinct. The original experiments stay untouched.

## Sources and preserved history

[history]: https://github.com/gcalpay/vscode-universal-dictate/blob/834a1001ef5ef49da36710eb4d2445d600f89f9a/docs/DICTATION_RELIABILITY_PLAN.md
[run]: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/34735635848
[h1-job]: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/34735635848/job/103666447977
[stream]: https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/stream/README.md
[server]: https://github.com/ggml-org/whisper.cpp/blob/v1.9.1/examples/server/README.md
[whisper]: https://github.com/openai/whisper/blob/main/README.md#command-line-usage

The [earlier product-first handoff](https://github.com/gcalpay/vscode-universal-dictate/blob/0647906e0da7c075f32be27ee29f81baad769306/docs/DICTATION_RELIABILITY_PLAN.md)
and [M1 diagnostic procedure](https://github.com/gcalpay/vscode-universal-dictate/blob/834a1001ef5ef49da36710eb4d2445d600f89f9a/diagnostics/m1.2/README.md)
are historical references, not conflicting current work orders.

Baseline source map, pinned to inspected main:

- [Manifest/settings](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/package.json) and [controller](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/extension.ts).
- [Recorder adapter](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/recorder.ts), [core recorder](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/recorder.ts) and [native recorder/overlay](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/record-audio.cpp).
- [Whisper adapter](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/whisper.ts) and [warm server / CLI runtime](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/whisper.ts).
- [Dictation engine](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/dictation.ts), [clipboard orchestration](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/src/core/paste.ts) and [native paste](https://github.com/gcalpay/vscode-universal-dictate/blob/f0265bc4398643c3b3a27e6d2ad64183b115b6ba/native/windows-fast-paste.cpp).
- [Issue #38](https://github.com/gcalpay/vscode-universal-dictate/issues/38) and [PR #49](https://github.com/gcalpay/vscode-universal-dictate/pull/49). Neither is resolved/adopted by this plan.
