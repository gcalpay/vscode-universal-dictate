# Agent guidance

Read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md) before reliability, overlay, live-preview, translation or focus-preservation work.

## Milestone workflow

- One milestone uses exactly one product branch. All of that milestone's submilestones stay on the same branch.
- Current sequence: M1 overlay sizes -> M2 transcript reliability -> M3 live preview -> M4 translation -> M5 insertion-target preservation -> M6 integrated validation/release.
- At the end of each milestone, stop for the user's review. Do not create the next milestone branch until the user has checked the result and decided whether the current branch should merge.
- After an approved merge, create the next milestone branch from the updated `main`. If a milestone is rejected or blocked, keep/revise that same branch or close it only after the user's decision; do not silently merge it.
- No merge, Marketplace publication, release, issue closure or version bump without explicit approval.

## Current task

**M1.1 is implemented on `feat/overlay-size-presets` at `a32a2ebcc9d9a666e5e11c36c56427f9fc2fbe57`.** The setting, picker, TypeScript propagation, native argument parsing and focused tests are present. Full TypeScript/native/Windows execution has not yet been run in this handoff. Do not start M1.2 unless the user asks to continue; M1.2 and M1.3 stay on this same branch.

Do not start M2 while M1 is awaiting review.

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
- Preserve local/offline inference after model setup and the Windows UI-host/Remote-WSL architecture.
- Live preview v1 is overlay-only provisional text, not repeated target pastes.
- Translation v1, if approved, uses the local Whisper source-language-to-English capability; arbitrary target languages require a separate backend decision.
- Recovery, a native alternative launcher, overlay sizes, live preview or translation do not by themselves prove Issue #38 fixed.

Update the roadmap ledger at each milestone handoff with branch/commit, files changed, checks actually run, user-visible/manual evidence, blockers and the next authorized action.
