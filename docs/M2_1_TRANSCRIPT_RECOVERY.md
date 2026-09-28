# M2.1 — Last Transcript implementation ledger

Updated: 2026-09-28.

## Scope and repository state

Target branch: `fix/transcript-recovery`.
Source baseline: `f8c33927d01fac44f77df80178ede5e6bacefa44`.
M1 merge/base: `481913feb88ad16aca00da744dd2fe72cd90ef98`.

This change implements M2.1 only. It was prepared as an uncommitted patch
against the verified source baseline. Commit/push approval is still required.
No release, Marketplace publication, version bump, milestone merge or new
branch is included. The roadmap remains
[DICTATION_RELIABILITY_PLAN.md](DICTATION_RELIABILITY_PLAN.md).

## Implemented behavior

The dictation engine retains the exact latest successful non-empty final
transcript before attempting insertion. Leading/trailing whitespace and
newlines in non-empty text are preserved. Empty/whitespace-only recognition,
cancellation, recorder failure and transcription failure do not replace the
previous successful transcript. Failed insertion leaves the new transcript
available; there is no automatic paste retry.

Recovery is memory-only and belongs to this engine/VS Code window. It is not
shared across windows, persisted in settings, or written to a transcript log.
Reload/restart/disposal forgets the value. This is not crash-persistent history
or a promise to securely erase JavaScript string allocations.

The existing gear menu gains a fifth entry, **Last transcript**, with an
**Available**/**Empty** description. Its submenu contains **Insert / Copy /
Clear last transcript**. Neither the parent nor submenu displays the text.
There are no new permanent status-bar controls.

The same actions are contributed as commands:

- `universalDictate.insertLastTranscript`
- `universalDictate.copyLastTranscript`
- `universalDictate.clearLastTranscript`

They can be run through the Command Palette or assigned a keyboard shortcut.
No new default shortcut is imposed. Copy explicitly replaces the clipboard;
Clear only forgets recovery memory and does not clear the clipboard or undo
text already inserted. Clearing during an already-started action does not
cancel that action or repopulate recovery when the action finishes.

Insert uses the existing insertion path and retains the saved transcript.
Copy/Insert are refused, not queued, during preparation, recording,
transcription, automatic insertion or another recovery action. Both actions
share the engine's busy guard, including while the clipboard Copy callback
is pending.

The submenu dispatches its action after its own `onDidHide`, not a guessed
sleep. Dismissal without acceptance does nothing. Repeated acceptance and
superseded/disposed menu continuations do not dispatch an extra action. A
recovery shortcut is refused while our own recovery picker remains open.
Closing that picker is **not proof of restoring an opaque composer or caret**.
Issue #38 remains unresolved. Direct keyboard invocation avoids opening the
recovery menu, but actual insertion still needs Windows/Codex validation.

Minimal disposal guards prevent an obsolete transcription from repopulating
cleared recovery memory or starting insertion after disposal. A recorder that
finishes startup after disposal is cancelled. These focused safeguards do not
claim completion of the entire M2.3 lifecycle/session-generation review.

## Clipboard boundary — M2.2 is still pending

`src/core/paste.ts` and `native/windows-fast-paste.cpp` are not changed by this
patch. They still use the baseline text-oriented clipboard restoration path.
Therefore this submilestone is **not a clipboard-safe release** and must not be
presented as preserving images, copied files, HTML, Excel formats or newer
clipboard changes. Do not use this patch alone to validate that requirement.

The approved M2.2 requirement is unchanged: preserve the complete previous
clipboard, restore only our own temporary state, keep newer clipboard changes,
and fail safely before destructive replacement when preservation is not
possible. Complete M2.2 before producing the integrated M2 acceptance VSIX.

## Validation performed

- Verified all modified pre-existing file bytes against GitHub blob SHAs at
  the pinned baseline before editing.
- Strict TypeScript check and compilation of the modified core engine passed,
  using the preinstalled TypeScript 5.8.3 and existing Node type definitions.
- Syntax transpilation of the modified extension and new recovery UI passed.
- **43 tests passed:** 28 core/recovery tests and 15 mocked VS Code/UI tests.
- The integration-style UI test executes the compiled extension activation and
  actual gear-menu routing with mocked VS Code/native dependencies.
- Added `npm run test:m2`; both CI workflows now run the M2 tests after compile.
  Existing M1 test steps are preserved.
- No dependencies were installed and no remote workflow was dispatched.

Not run: full-project `npm run check`/compile with the declared VS Code types,
M1 runtime/layout regression suite, Windows native compilation, VSIX packaging,
actual VS Code/Codex UI behavior, Remote-WSL, or multi-window clipboard tests.
This Linux validation environment does not have the project's VS Code typings
or a Windows GUI. Mock tests are not evidence of actual caret restoration.

## Files and next gate

Runtime: `src/core/dictation.ts`, `src/transcript-recovery.ts`, `src/extension.ts`.
Manifest/tests: `package.json`, `test/transcript-recovery.test.cjs`,
`test/transcript-recovery-ui.test.cjs`.
CI: `.github/workflows/ci.yml`, `.github/workflows/windows-package.yml`.
Guidance: `AGENTS.md`, this ledger.

Proposed commit: `feat: add last transcript recovery`.

Stop for approval before committing/pushing this change. After that, continue
M2.2 on the same branch, then complete the remaining M2.3 and integrated M2
validation. Do not merge M2 or start M3 before the user's M2 acceptance gate.
