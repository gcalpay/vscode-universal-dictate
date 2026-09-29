# Agent guidance

Read [docs/M2_CLIPBOARD_MODE_FIX.md](docs/M2_CLIPBOARD_MODE_FIX.md) first for the current user-approved M2 correction. It supersedes clipboard restoration and recovery-menu requirements in the historical roadmap and M2.1-M2.4 ledgers. Read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md) for the remaining milestone sequence and focus-preservation constraints.

## Current task

M1 was accepted and merged through PR #50 at `481913feb88ad16aca00da744dd2fe72cd90ef98`. Medium remains the overlay default. M2 is active on `fix/transcript-recovery`; PR #51 is draft and unmerged.

The M2.5 candidate at `eb2f60369763486eedb6c9d88283ea6446ac8ccf` failed user acceptance: normal dictation was blocked by unsupported clipboard formats, and menu-based reinsertion lost the caret. Do not redistribute that rejected VSIX as the correction.

The user replaced full clipboard restoration with:
- Automatic direct Unicode text input in both modes, with no clipboard-based insertion transport.
- `universalDictate.overwriteClipboard` defaults Off. Off must perform no clipboard reads, writes, inspection, temporary replacement, or restoration.
- On additionally copies the exact transcript before attempting input and never restores the old clipboard. No target must not erase the copied backup; subsequent user/application copies win.
- The fifth gear entry toggles Overwrite clipboard directly. Remove the Last transcript submenu and Insert/Clear command contributions.
- Keep Copy Last Transcript as an explicit Command Palette command. Retained transcript state remains memory-only and distinct from the clipboard.
- Preserve operation/session ownership, cancellation and recorder/WAV cleanup improvements.

Next gate: build and run both PR workflows, including real direct-input checks on a disposable Windows runner and the revised package audit, then deliver only the corrected test VSIX to the user. Test results for the removed restoration transport do not validate this replacement. Do not merge or create M3 until the new candidate passes user acceptance and outstanding review gates.

## Workflow and boundaries

- One milestone uses one product branch; all submilestones stay on it.
- Sequence: M1 sizes -> M2 reliability -> M3 live preview -> M4 translation -> M5 target preservation -> M6 integrated release.
- Inspect refs and working state before changes. Never reset, clean, stash or overwrite unrelated user work.
- Respect authorization for dependency installation, commits, pushes and CI dispatches. No merge, release, version bump, Marketplace publication or issue closure without explicit approval.
- Keep `fix/preserve-insertion-target` and `experiment/m1.2-statusbar-focus-probe` isolated as historical experiments.
- Distinguish prepared source, compiled code, packaged artifacts, automated results and actual user/Windows/Codex evidence.
- Do not dismiss Codacy findings without inspecting their rule/file evidence. Previously reported findings are not automatically resolved by a new implementation.

## Product invariants

- The intended target is the latest deliberately selected editable input and caret/selection. Dictate/Stop/Insert controls are not deliberate retargeting.
- Never synthesize Enter or automatically submit/send. Cancellation prevents remaining input; already-submitted input cannot be undone.
- Do not auto-retry uncertain insertion. Do not queue an old insertion behind newer work.
- Preserve local/offline inference after model setup and the Windows UI-host/Remote-WSL architecture.
- No private Codex DOM/internals, global mouse hooks, click replay or mandatory custom VS Code in the released product.
- Issue #38 remains unresolved. Unicode input and clipboard options do not prove focus/caret preservation.
- Future live preview is overlay-only provisional text, not repeated pastes. Translation v1 is local source-language-to-English only unless the user changes scope.

Update the implementation ledger with actual branch/commit, checks, artifact identity, limitations, user results and the next authorized action. Never change files on the user's computer from this chat; the user installs the supplied VSIX themselves.
