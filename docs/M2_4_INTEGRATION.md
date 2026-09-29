# M2.4 — Integrated automated validation

> **Historical checkpoint — not current instructions.** Archived on 2026-09-29.
> Everything below this notice records the earlier checkpoint, including its
> then-pending gates and test limitations. Read
> [M2_CLIPBOARD_MODE_FIX.md](M2_CLIPBOARD_MODE_FIX.md) for the current contract,
> delivered candidate, user feedback and remaining review/acceptance gates.
>
> The correction described below as uncommitted was subsequently committed at
> `eb2f60369763486eedb6c9d88283ea6446ac8ccf`; its restoration candidate failed user
> acceptance. Replacement `eaf0570f1c817229e36177ccff32f50ce396a43f` passed its two
> workflows. Normal dictation and Overwrite clipboard behavior are now user-accepted.
> The nine Codacy findings below describe an earlier head; the current 13 remain unclassified.

Historical checkpoint updated: 2026-09-28 (GitHub run timestamps are UTC).
Repository: `gcalpay/vscode-universal-dictate`.
Branch: `fix/transcript-recovery`.
Baseline: `80fcd399055cae3c74ba390b155235e1386610d8`.
Draft PR: #51.

## State

The user approved the exact M2.3 commit and requested M2.4 automated integration.
M2.3 is committed as `fix: harden dictation lifecycle and cancellation`, parent
`174883bd0ccf96b27e4727f40cf915d038e11836`, tree
`5db5491126d92051a084c3336a7e243ede41b27a`. All 21 changed-file postimages were
checked against the approved M2.3 patch before the non-forced branch update.

**M2.4 is not complete or green.** The first real native clipboard check failed.
A targeted correction and improved validation are prepared, but uncommitted.
No M2.5 artifact has been produced or supplied. Do not ask the user to test a
VSIX before the automated integration gate is complete.

## Remote checks actually executed

All runs below are for the committed M2.3 head, NOT the uncommitted correction.
The workflows installed the existing declared build dependencies in disposable
GitHub runners; no new project dependency was introduced or installed locally.

| Gate | Actual result |
| --- | --- |
| Linux CI run `36491952606`, job `109162413654` | Completed successfully |
| Full-project TypeScript check and compile, including declared VS Code typings | Passed in Linux and Windows workflows |
| M1 TypeScript and native geometry regressions | Passed |
| M2 Node recovery/UI/clipboard/lifecycle tests | 137 passed in both workflows |
| Portable native clipboard transaction policy | 44 passed on Linux and MSVC |
| Native Windows clipboard helper compilation | Passed |
| Actual Win32 request/lifetime-pipe tests | 12 passed, no keystrokes or clipboard writes |
| Win32 clipboard smoke executable compilation | Passed |
| Win32 clipboard smoke execution | Failed first case: empty clipboard did not restore |
| Remaining nine Win32 clipboard smoke cases | Not reached by that fail-fast executable |
| Native microphone recorder compilation in Windows run | Not reached; was after failing smoke test in the same command chain |
| Whisper fetch, VSIX packaging and upload | Skipped after native test failure |

Windows run: `36491952624`, job `109162413589`, conclusion `failure`.
The failure message is `transaction did not restore` in the first (empty
clipboard) case. The old log does not expose the returned result code or sequence
numbers. It does not establish whether any later clipboard representation works.

Codacy's PR summary also reports **nine new findings**: one critical and two high
Security findings, plus six medium findings (two BestPractice, four Complexity).
Those are the analyzer's ratings, not a confirmed exploit assessment. GitHub
provides no per-line annotations or inline review comments for them. The Codacy
issues page/API was not accessible in this session. Their rule/file details and
triage are still outstanding; no rules or gates were disabled or suppressed.

## Candidate cause and targeted correction

The native publisher originally supplied only Unicode text plus the Windows
history/cloud exclusion marker, then captured `GetClipboardSequenceNumber()`
**before** closing the clipboard. Windows can synthesize standard text/locale
representations during closing. That can advance the sequence even when no
external application copied anything. The next strict check can consequently
classify our own temporary data as a newer clipboard operation and decline both
paste and restoration.

This is a code-level explanation consistent with the observed failure and
primary API behavior tests, **not yet a runtime-confirmed diagnosis of that CI
failure**: the original failure log lacks the discriminating token/result data.

Prepared fix in `native/clipboard-win32.h`:

- Independently allocate Unicode, locale, ANSI and OEM representations before
  `EmptyClipboard`, using explicit locale-associated code pages.
- Publish all four standard representations plus the existing privacy marker
  while the original write lock is held, before capturing the ownership token.
- Keep exact Unicode as the authoritative representation. Legacy alternatives
  can lose unrepresentable characters just as Windows' implicit conversions can;
  conversion is not substituted for the Unicode transcript.
- A locale/code-page/allocation failure leaves the clipboard unreplaced; a
  partial publication follows the existing locked rollback path.
- Keep sequence AND owner comparisons intact. Do not adopt a token obtained
  after releasing the clipboard or treat same-owner changes as automatically safe.

The fix is not compiled/executed on Windows yet. It may reveal further failures
once the remaining native cases execute. Full arbitrary OLE/source-object
serialization and the known focus/caret limitation remain outside these claims.

## Prepared automated validation improvements

### Native regressions and diagnostic output

`test/native/clipboard-windows-test.cpp` retains all ten existing assertions and
adds an eleventh real Win32 regression: the temporary text's token must remain
stable across CloseClipboard/reopen in the absence of an external copy. A wrapper
observes the real NativeHost and reports fixed result labels/numeric sequence
checks only. It does not log clipboard data or substitute a fake implementation.
Availability queries do not force materialization before token capture; doing so
could conceal the original missing-format bug.

Each smoke case reports its own result. Independent cases continue after a
failure to expose the rest of the matrix, but any failure keeps the executable
and CI red. The explicit disposable-desktop/clipboard-replacement flag remains.
No actual paste keystrokes are sent by these smoke tests.

A 45th portable policy regression checks that a sequence change immediately
after close is NOT adopted even when the owner is unchanged. This protects the
newer-copy safeguard rather than weakening it to hide the Windows failure.

### Windows pipeline

Compile the clipboard helper, microphone recorder and all native test executables
before executing smoke cases. Give native geometry, policy, request and clipboard
tests separate named gates and bounded test timeouts. After successful native
compilation, independent tests may still run if another test fails, but the job
retains every failure. Package and upload use the normal success condition and
cannot run after a failed gate. No `continue-on-error` is used.

### Package audit

`test/inspect-vsix.ps1` is a build-time audit, not an installation or acceptance
test. It uses the existing PowerShell/.NET runtime and no added dependency.
After successful packaging, it checks:

- expected manifest identity, source version/entrypoint/VS Code range, UI host,
  Medium default and the three recovery commands;
- absence of source/test/docs/dependency folders, legacy paste helper, debug
  files, test executables and duplicate/unsafe archive paths;
- packaged JavaScript matches the compiled modules, and the host protocol is v2;
- packaged native helpers match the just-built executable hashes and are x64;
- both pinned Whisper executable payloads are present and x64;
- archive/payload SHA-256 hashes and CI checkout/run identifiers in a JSON audit.

The audit is placed before upload and its JSON report is uploaded with the VSIX.
Neither the new PowerShell script nor an actual VSIX audit has run yet. Source
review is not equivalent to execution; the first audit run may require fixes.

## Local checks on the prepared correction

- 137 existing Node tests passed again with strict unhandled-rejection handling.
- 45 portable native policy cases passed with GCC and Clang, warnings-as-errors.
- The same 45 cases passed AddressSanitizer/UndefinedBehaviorSanitizer.
- Workflow structure and package-gating assertions passed; patch application and
  per-file postimage hashes are verified in the accompanying validation report.

These do not compile the new Win32 publication code or execute the new PowerShell
package audit. Those checks require the next approved commit and a fresh Windows
run. No local dependencies, user clipboard operations or user VSIX tests were used.

## Next gate

Review/approve `fix: stabilize clipboard publication and strengthen M2 validation`,
then rerun the full PR workflows, investigate all native failures, and obtain the
Codacy rule/file details for triage. M2.4 is complete only when its integrated
results and artifact audit are actually established, not merely wired into CI.
Then M2.5 supplies the user-test VSIX. No merge, release, version bump, issue
closure or M3 branch is authorized.

## Primary references and evidence

- PR: https://github.com/gcalpay/vscode-universal-dictate/pull/51
- Linux run: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/36491952606
- Windows run: https://github.com/gcalpay/vscode-universal-dictate/actions/runs/36491952624
- Codacy report: https://github.com/gcalpay/vscode-universal-dictate/pull/51#issuecomment-5879830064
- Clipboard formats/locale: https://learn.microsoft.com/en-us/windows/win32/dataxchg/standard-clipboard-formats
- Sequence API: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber
- Encoding API: https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-widechartomultibyte
- Native API behavior tests (consulted as evidence, no code copied): https://github.com/wine-mirror/wine/blob/master/dlls/user32/tests/clipboard.c
