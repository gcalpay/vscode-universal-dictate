# Agent guidance

Read [docs/M2_CODACY_TRIAGE.md](docs/M2_CODACY_TRIAGE.md) first for the latest M2 review and user acceptance. It supersedes the earlier pending-review/acceptance statements in the roadmap and ledgers. Read [docs/M2_CLIPBOARD_MODE_FIX.md](docs/M2_CLIPBOARD_MODE_FIX.md) for the current product contract, then [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md) for the remaining milestone sequence. M2.1-M2.4 are archived checkpoints, not instructions to restore retired behavior.

## Current checkpoint

M1 was accepted and merged through PR #50. M2 runtime is the corrected `eaf0570` candidate. The user accepted normal dictation and Overwrite clipboard, then explicitly authorized accepting and merging M2 without another test when no replacement runtime is needed. The detailed Codacy review found no required runtime correction. Check PR #51 for the actual merge state and resulting main commit; do not infer merge from a prepared commit.

The earlier `eb2f603` restoration candidate failed user acceptance and is superseded.

Current M2 behavior:
- Automatic direct Unicode input in both modes; the clipboard is not the insertion transport.
- `universalDictate.overwriteClipboard` defaults Off. Off must perform no clipboard reads, writes, inspection, temporary replacement, or restoration during automatic dictation.
- On additionally copies the exact transcript before attempting input and never restores the old clipboard. No target must not erase the copied backup; subsequent user/application copies win.
- The fifth gear entry toggles Overwrite clipboard directly. The Last transcript submenu and public Insert/Clear recovery commands are removed. Overlay Insert is still a recording control.
- Copy Last Transcript is an explicit Command Palette command backed by separate memory-only retained text. It deliberately writes to the clipboard regardless of the automatic setting.
- Operation/session ownership, cancellation and recorder/WAV cleanup protections remain.

## Review outcome and next action

The complete Codacy API report was retrieved through a read-only, credential-free GitHub runner diagnostic. The diagnostic was removed before merge preparation; the ordinary CI workflow was restored exactly. The report had fourteen added findings and two fixed historical entries. Seven security findings were false positives at their specific source locations; five clarity warnings concerned intentional safeguards; two style/maintenance suggestions were valid but nonblocking and deferred. See the per-finding evidence in the triage document. No analyzer or branch-protection rule was disabled, and a completed human review is not a claim that Codacy itself reports green.

No replacement VSIX is needed for this review: runtime, tests, dependencies, settings and package behavior are unchanged. Preserve the user's acceptance rather than repeating the clipboard tests or requesting another formal merge confirmation. Only a subsequent runtime change invalidates that conditional approval.

After the accepted merge is verified, choose the next agreed milestone. Diagnosing the older unintended German-to-English output before M3 was proposed, not yet adopted as a branch/sequence change. No new milestone implementation, release or version bump is authorized by this closeout.

## Workflow and boundaries

- One milestone uses one product branch; all submilestones stay on it.
- Sequence remains M1 sizes -> M2 reliability -> M3 live preview -> M4 translation -> M5 target preservation -> M6 integrated release, unless the user approves a change.
- Inspect refs and working state before changes. Never reset, clean, stash or overwrite unrelated user work.
- Respect authorization for edits, dependency installation, commits, pushes and CI dispatches. Propose Conventional Commit messages before seeking approval for future work. The current M2 merge has conditional approval as recorded above; publication, issue closure and new milestone work do not.
- Keep `fix/preserve-insertion-target` and `experiment/m1.2-statusbar-focus-probe` isolated as historical experiments.
- Distinguish prepared source, compiled code, packaged artifacts, automated results and actual user/Windows/Codex evidence.
- Evaluate new analyzer findings from actual rule/file evidence; the M2 dispositions do not suppress future defects.

## Product invariants

- The intended target is the latest deliberately selected editable input and caret/selection. Dictate/Stop/Insert controls are not deliberate retargeting.
- Never synthesize Enter or automatically submit/send. Cancellation prevents remaining input; already-submitted input cannot be undone.
- Do not auto-retry uncertain insertion. Do not queue an old insertion behind newer work.
- Preserve local/offline inference after model setup and the Windows UI-host/Remote-WSL architecture.
- No private Codex DOM/internals, global mouse hooks, click replay or mandatory custom VS Code in the released product.
- Issue #38 remains unresolved. Unicode input and clipboard options do not prove focus/caret preservation.
- Future live preview is overlay-only provisional text, not repeated pastes. Translation v1 is source-language-to-English unless the user changes scope.

Update the implementation ledger with actual branch/commit, checks, artifact identity, limitations, user results and the next authorized action. Never change files on the user's computer from this chat; the user installs the supplied VSIX themselves.
