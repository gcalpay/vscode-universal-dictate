# M2 acceptance correction — direct input and optional clipboard overwrite

Updated: 2026-09-29.
Branch: `fix/transcript-recovery`.
Base: `eb2f60369763486eedb6c9d88283ea6446ac8ccf` (PR #51, unmerged).
Status: correction being committed for the user-requested Windows test package.
Windows build, package audit and user acceptance must be recorded separately.
No version bump, release, merge or installation on the user's PC is authorized.

## Current contract (supersedes the historical restoration plan)

The user rejected the `eb2f603` VSIX because normal dictation consistently
returned `snapshot_unsupported`; menu-based Insert also lost the caret.

| Overwrite clipboard | Automatic insertion | Clipboard |
| --- | --- | --- |
| Off (default) | Attempt direct Unicode input into the currently focused input | No reads, writes, inspection, temporary replacement or restoration |
| On | Attempt the same direct input | First copy the exact transcript once, overwriting existing contents; never restore the old clipboard |

When no usable input has focus, Off produces no automatic clipboard backup.
On keeps the copied transcript available for manual paste unless a later copy
replaces it. If optional copying fails, direct input is still attempted and the
failure is reported; never retry uncertain input automatically.

The fifth gear-menu entry toggles Overwrite clipboard directly. The setting is
`universalDictate.overwriteClipboard`, default `false`; only literal `true`
enables copying. Snapshot it before recording preparation so an in-progress
session does not change mode after a settings edit.

Copy Last Transcript remains an explicit Command Palette command and deliberately
replaces the clipboard regardless of the automatic setting. Remove the old
Last transcript submenu and Insert/Clear command contributions. The retained
transcript remains in this window's extension memory, not persisted to disk.

## Implementation

The native helper `windows-text-input.exe` has no clipboard calls. Unicode input
is submitted in bounded batches through SendInput, retaining surrogate pairs.
It waits for physically held modifiers to be released rather than manipulating
their state. HWND-level focus changes, cancellation and new modifier presses
stop remaining input; it does not restore the target or use private DOM APIs.

The protocol is `--unicode-input-v1`, with `UDTI1 <UTF-8 byte count>\n` followed
by the exact bytes. The host keeps stdin open as a lifetime signal; EOF requests
cancellation. Input text never appears in process arguments or logs. Both old
paste executables and the old compiled clipboard protocol are rejected by the
package audit and excluded from the VSIX.

The optional copy preserves the exact transcript. Direct-input preparation maps
control characters such as CR/LF and Tab to spaces, so input cannot synthesize
Enter, Tab or Backspace commands. Ordinary Unicode and combining/surrogate
characters are preserved. There is no clipboard fallback and no automatic retry.

The old clipboard transaction, format whitelist, snapshot/restore implementation
and obsolete tests are removed. Lifecycle, recorder closure and WAV cleanup
protections remain unchanged.

## Validation gates

The prepared patch's earlier sandbox results were 139 Node tests and 84 portable
Unicode assertions. They do not replace a new full-project/Windows run.

The revised workflows execute full-project typechecking, M1 and M2 tests,
native builds, Unicode preparation/batching checks, request/lifetime-pipe tests,
and real Unicode input into a scratch Win32 EDIT with normal text plus unknown
application metadata on the clipboard. The latter runs only with explicit
permission on the disposable GitHub runner, not the user's desktop.

The VSIX audit checks the Off default, Copy-only recovery command, new native
helper, removed legacy components, compiled payload hashes and x64 executables.
Only a newly successful workflow artifact is a candidate for user testing.

## Limits and review

HWND focus is not proof of an editable DOM target or intended caret. Issue #38
remains open. SendInput submission is not proof that Codex consumed the text.
Real user testing of the new transport is required before merge. Cancellation
cannot undo already-submitted input. Copying On deliberately discards the old
clipboard, and no delayed restoration can overwrite a newer copy.

The historical M2.1-M2.4 ledgers and restoration requirements in the roadmap are
superseded wherever they conflict with this document; remaining milestone,
lifecycle, review and release boundaries still apply. Old green checks are not
proof of this replacement. Codacy findings require fresh rule/file triage.

## Primary API references

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo
