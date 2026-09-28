# Agent guidance

Read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md) before reliability, overlay, live-preview, translation or focus-preservation work.

## Milestone workflow

- One milestone uses exactly one product branch. All of that milestone's submilestones stay on the same branch.
- Current sequence: M1 overlay sizes -> M2 transcript reliability -> M3 live preview -> M4 translation -> M5 insertion-target preservation -> M6 integrated validation/release.
- At the end of each milestone, stop for the user's review. Do not create the next milestone branch until the user has checked the result and decided whether the current branch should merge.
- After an approved merge, create the next milestone branch from the updated `main`. If a milestone is rejected or blocked, keep/revise that same branch or close it only after the user's decision; do not silently merge it.
- No merge, Marketplace publication, release, issue closure or version bump without explicit approval.

## Current task

**M1 is accepted and merged. M2 transcript/clipboard/lifecycle reliability is now active on `fix/transcript-recovery`.**

M1 PR #50 merged into `main` at `481913feb88ad16aca00da744dd2fe72cd90ef98`. Small/Medium/Large enhanced-overlay sizes are merged, and Medium is the default/fallback selected after the user's Windows review.

M2 must stay on `fix/transcript-recovery`. Its scope is:
- retain the latest successful non-empty final transcript in memory before insertion is attempted;
- expose Last transcript as the fifth Universal Dictate gear-menu entry, with Insert / Copy / Clear actions, and expose those actions as normal VS Code commands;
- preserve the user's complete pre-insertion Windows clipboard contents across normal dictation insertion;
- if the user or another application changes the clipboard while insertion is in progress, preserve that newer clipboard instead of restoring stale content;
- harden stale-session/disposal/lifecycle behavior without an unrelated engine rewrite.

M2.1 is committed at `a21d6825354448c2709613ad7ae693817400a797`. Read [docs/M2_1_TRANSCRIPT_RECOVERY.md](docs/M2_1_TRANSCRIPT_RECOVERY.md) for its ledger. M2.2 clipboard source and tests are prepared but uncommitted; read [docs/M2_2_CLIPBOARD_PRESERVATION.md](docs/M2_2_CLIPBOARD_PRESERVATION.md) for its supported-format/refusal policy, protocol, test evidence and Windows-validation gaps. Unknown formats must remain untouched rather than silently reduced to text. M2.3 lifecycle work, M2.4 integration and M2.5 Windows/user acceptance remain outstanding. Do not produce an acceptance VSIX after an individual submilestone.

Do not create M3 until M2 has passed automated/Windows review and the user explicitly approves the M2 merge.

## Repository boundaries

- Keep `fix/preserve-insertion-target` frozen as historical alternative-launcher evidence.
- Keep `experiment/m1.2-statusbar-focus-probe` isolated as historical/upstream diagnostic evidence. Do not merge either branch into M1-M4 product work.
- Inspect the local working tree and refs before edits. Never reset, clean, stash or overwrite unrelated user work.
- Keep dependency installation, Git commits/pushes and build dispatches within the user's active authorization.
- Planned behavior is not shipped behavior. Distinguish specified, implemented, compiled, packaged and real-Windows/real-Codex validated states.

## Product invariants

- Follow the latest deliberately selected editable input plus caret/selection through final insertion.
- Dictate/Stop/Insert controls do not themselves count as retargeting.
- Never synthesize Enter or automatically submit.
- Retain a successful non-empty final transcript before insertion so insertion/clipboard failure cannot destroy the only recoverable copy.
- Treat clipboard preservation as a product invariant: restore the complete pre-insertion Windows clipboard when Universal Dictate still owns the temporary clipboard state; if a newer clipboard change occurs, preserve the newer content instead.
- Preserve local/offline inference after model setup and the Windows UI-host/Remote-WSL architecture.
- Live preview v1 is overlay-only provisional text, not repeated target pastes.
- Translation v1, if approved, uses the local Whisper source-language-to-English capability; arbitrary target languages require a separate backend decision.
- Recovery, a native alternative launcher, overlay sizes, live preview or translation do not by themselves prove Issue #38 fixed.

Update the roadmap ledger at each milestone handoff with branch/commit, files changed, checks actually run, user-visible/manual evidence, blockers and the next authorized action.
