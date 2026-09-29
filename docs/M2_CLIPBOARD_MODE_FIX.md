# M2 acceptance correction — direct input and optional clipboard overwrite

Updated: 2026-09-29.
Branch: `fix/transcript-recovery`.
Milestone base: `481913feb88ad16aca00da744dd2fe72cd90ef98` (accepted M1).
Correction parent: `eb2f60369763486eedb6c9d88283ea6446ac8ccf` (rejected candidate).
Corrected source: `eaf0570f1c817229e36177ccff32f50ce396a43f`.
Status: committed, built and delivered. Normal dictation and Overwrite clipboard behavior are user-accepted.
PR #51 remains draft and unmerged. Codacy triage and explicit merge approval remain open.
No version bump, release, merge or installation on the user's PC is authorized by this document.

## Current contract

The user rejected the `eb2f603` VSIX because ordinary dictation could be blocked by
unsupported clipboard formats and menu-based reinsertion lost the caret. The
snapshot/restore transport and recovery submenu were therefore replaced.

| Overwrite clipboard | Automatic insertion | Clipboard |
| --- | --- | --- |
| Off (default) | Attempt direct Unicode input into the currently focused input | No reads, writes, inspection, temporary replacement or restoration |
| On | Attempt the same direct input | First copy the exact transcript once, overwriting existing contents; never restore the old clipboard |

The user confirmed on 2026-09-29 that **Overwrite clipboard is working as intended**.
Do not request the Off/On clipboard test again unless a later runtime change affects it.

When no usable input has focus, Off produces no automatic clipboard backup. On
keeps the copied transcript available for manual paste unless a later user or
application copy replaces it. If optional copying fails, direct input is still
attempted and the failure is reported. Never retry uncertain input automatically.

The fifth gear-menu entry toggles Overwrite clipboard directly. The setting is
`universalDictate.overwriteClipboard`, default `false`; only literal `true`
enables copying. Snapshot it before recording preparation so an in-progress
session does not change mode after a settings edit.

Copy Last Transcript remains an explicit Command Palette command and deliberately
replaces the clipboard regardless of the automatic setting. The old Last transcript
submenu and Insert/Clear command contributions are removed. Overlay Insert remains
a recording control, not a recovery command.

Retain the latest successful non-empty final transcript before insertion. Empty,
failed or cancelled transcription does not replace the previous value; insertion
or optional-copy failure does not erase retained text. Retention belongs to this
window's extension memory independently of the clipboard and is not persisted.
Copying unrelated content does not erase it; reload/restart clears recovery memory.

## Implementation

The native helper `windows-text-input.exe` contains no clipboard access. Unicode
input is submitted in bounded batches through Win32 SendInput, retaining surrogate
pairs. It waits for physically held modifiers to be released rather than changing
their state. HWND-level focus changes, cancellation and new modifier presses stop
remaining input. It does not restore the target or use private DOM APIs.

The protocol is `--unicode-input-v1`, with `UDTI1 <UTF-8 byte count>\n`
followed by the exact bytes. The host keeps stdin open as a lifetime signal; EOF
requests cancellation. Input text does not appear in process arguments or logs.
Legacy paste executables and the retired clipboard protocol are excluded from the
package.

The optional copy preserves the exact transcript. Direct-input preparation maps
control characters such as CR/LF and Tab to spaces, so input cannot synthesize
Enter, Tab or Backspace commands. Ordinary Unicode and combining/surrogate
characters are preserved. There is no clipboard fallback and no automatic retry.

M2.3 operation/session ownership, cancellation, recorder shutdown and WAV cleanup
protections remain part of the corrected milestone. Historical clipboard-v2
protocol details in the M2.1-M2.4 ledgers are archived evidence, not active behavior.

## Recorded validation and delivered candidate

These are recorded results for the corrected source, not new runtime tests or an
artifact re-audit performed by this documentation cleanup.

| Evidence | Recorded result |
| --- | --- |
| Correction commit | `eaf0570f1c817229e36177ccff32f50ce396a43f` — `fix: replace clipboard restoration with optional overwrite` |
| Linux CI | Run `36506468768`, success |
| Windows package workflow | Run `36506468804`, success |
| Native testing, as recorded at delivery | Unicode preparation/batching, request/lifetime-pipe tests, and actual direct input into a disposable Win32 EDIT with existing clipboard data |
| Package audit, as recorded at delivery | Passed; all 18 recorded payload hashes independently checked in the delivery conversation |
| Earlier sandbox validation | 139 Node tests and 84 portable Unicode assertions; not a real Codex acceptance matrix |
| User feedback | Corrected VSIX installed; normal dictation works; Overwrite clipboard works as intended |
| Merge approval | Not recorded |

The scratch Win32 EDIT tests are not VS Code/Codex caret tests. Superseded
restoration test counts and the rejected package do not validate this transport.

Delivered candidate: `universal-dictate-win32-x64_M2-clipboard-toggle-eaf0570.vsix`.
Version: `0.1.5`; platform: `win32-x64`; Medium overlay default. The filename
was changed, not the original CI-built bytes.

- Artifact ID: `11007278287`.
- VSIX size: 8,575,990 bytes.
- VSIX SHA-256: `49225f6d029ccfc49efe926c293b2c06188605552625e4571aaf59bdcaf39788`.
- Outer ZIP SHA-256: `134c6e77624fb4dacfd0933956fa499462d957a7f6f273a7a8a19b2488d3144a`.
- CI checkout: `c6dec6b74656afb63d6ab4a9e562da891a3ed5b2`, a synthetic PR merge,
  not an actual merge into `main`.

Do not rebuild or resend this candidate solely because the conversation resumed.
Do not redistribute `universal-dictate-win32-x64_M2-eb2f603.vsix`; that earlier
restoration candidate failed user acceptance.

## Codacy review — individual issue details still required

Rechecked on 2026-09-29 against corrected head `eaf0570f1c817229e36177ccff32f50ce396a43f`.
Codacy check `109209423099` is `action_required`, with 13 new findings and
zero GitHub check annotations. Its output and PR comment contain aggregate counts,
not individual rules, files, lines or code context.

| Codacy category | Codacy severity | Findings | Disposition |
| --- | --- | ---: | --- |
| Security | Critical | 5 | Unclassified: individual details unavailable |
| Security | High | 1 | Unclassified: individual details unavailable |
| BestPractice | Medium | 5 | Unclassified: individual details unavailable |
| Performance | Medium | 1 | Unclassified: individual details unavailable |
| Complexity | Medium | 1 | Unclassified: individual details unavailable |

These are the analyzer's ratings, not confirmed vulnerabilities. None has been
established as a false positive. The nine-finding count in the archived M2.4
ledger belongs to an earlier head and must not be reused for this candidate.

The report page and accessible API paths returned no usable individual details in
this review. This access limitation is not evidence that the findings are harmless
or fixed. Obtain an issue-detail export or expanded screenshots for PR #51 at the
reviewed head, including each tool/rule, message, file, line and relevant code.
Then record an evidence-backed disposition for every actual finding. Do not weaken
quality gates or label findings as false positives without that evidence.

## Remaining M2.5 gate

Normal dictation and Overwrite clipboard behavior are already user-accepted. Do
not ask for those checks again unless a later runtime correction affects them.

Complete Codacy triage before deciding whether another candidate is needed. If no
runtime correction follows, only genuinely unrecorded behavior may warrant a short
spot check. Current candidates are:

- Copy Last Transcript still works after an unrelated clipboard copy.
- Cancel / repeated Stop causes no stale or duplicate later insertion.

Existing automated lifecycle coverage should be considered before requesting
manual repetition. A runtime correction requires relevant automated validation
and one replacement final M2 candidate; documentation-only edits do not require
another installation.

Formal M2 acceptance and explicit merge approval remain separate. Do not create
the next milestone branch, bump the version, publish, close Issue #38 or claim
genuine status-bar target preservation as part of M2. The older unintended
German-to-English output remains a separate unresolved bug.

## Limits and review

HWND focus is not proof of an editable DOM target or intended caret. Issue #38
remains open. SendInput submission is not proof that Codex consumed the text.
Cancellation cannot undo already-submitted input. Copying On deliberately
discards the old clipboard; there is no delayed restoration that can overwrite a
newer copy.

The active roadmap follows this contract. M2.1-M2.4 remain archived checkpoint
ledgers; their old commands, clipboard protocols, test counts and next-gate
instructions are historical, not current implementation tasks. Lifecycle, review
and release boundaries still apply.

## Primary API references

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo
