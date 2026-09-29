# M2.2 — Clipboard preservation implementation ledger

> **Historical checkpoint — not current instructions.** Archived on 2026-09-29.
> Everything below this notice records the earlier checkpoint, including its
> then-pending gates and test limitations. Read
> [M2_CLIPBOARD_MODE_FIX.md](M2_CLIPBOARD_MODE_FIX.md) for the current contract,
> delivered candidate, user feedback and remaining review/acceptance gates.
>
> The full snapshot/restore transaction, format policy and clipboard-paste helper
> were rejected and removed. Do not reinstate them. Current automatic insertion is
> clipboard-free Unicode input with optional one-time clipboard overwrite.

Historical checkpoint updated: 2026-09-28.

## Status and scope

Branch: `fix/transcript-recovery`.
Baseline: `a21d6825354448c2709613ad7ae693817400a797`
(`feat: add last transcript recovery`, committed after user approval).

The exact approved M2.2 change set was committed as
`174883bd0ccf96b27e4727f40cf915d038e11836`, with message
`fix: preserve clipboard state during transcript insertion`. The remote branch
was advanced without force. No PR, workflow dispatch, merge, version bump or
release accompanied this checkpoint. This is not a Windows-validated or accepted
M2 milestone; M2.4 integrated validation and M2.5 user review remain outstanding.

This ledger describes the M2.2 checkpoint. The subsequent
[M2.3 change set](M2_3_LIFECYCLE.md), committed at
`80fcd399055cae3c74ba390b155235e1386610d8`, adds cooperative cancellation and
upgrades the request/response transport to v2. The v1 framing/EOF description below is historical,
not instructions for running the M2.3 host/helper.

The requirement has not been reduced to text-only preservation: preserve the
entire original clipboard or refuse before replacing it. Never quietly drop
an unsupported format, replace a rich payload with its plain-text alternative,
or overwrite a newer user/application copy when restoring the original.

## Implemented transaction

The native helper now owns the complete snapshot/write/paste/restore sequence.
The TypeScript adapter no longer reads or restores clipboard text.

1. Validate a bounded, length-framed UTF-8 request from stdin. Empty, malformed,
   truncated, oversized and null-containing requests are refused before mutation.
   Transcript text is not placed in command-line arguments, logs or a temporary
   text file. The 4 MiB input limit is a safety bound, not a new recording limit.
2. Acquire a nonblocking named transaction mutex. Overlapping native insertions
   are refused rather than queued to paste into a potentially different target.
3. Open the clipboard exclusively; enumerate and preflight every offered format.
   Materialize independent copies while the original clipboard remains in place.
   Recheck format enumeration and source owner after materialization. Snapshot
   storage is bounded to 256 formats and 256 MiB; failure leaves it unreplaced.
4. Only after a complete acceptable snapshot, publish the temporary transcript
   and Windows clipboard-history/cloud exclusion marker. The sequence number
   is captured under the same clipboard lock as the write.
5. Before dispatch, reopen and check both sequence and owner. If overtaken by
   another copy, do not send Ctrl+V. Otherwise release the clipboard and submit
   Ctrl+V exactly once using the existing input semantics; never send Enter.
6. Following a bounded grace period, reopen the clipboard, check ownership and
   restore within that same locked interval. No check-then-restore gap in a
   separate TypeScript continuation is used.
7. If a newer copy is detected, leave it alone. Identical text with a new
   sequence still counts as a newer clipboard operation.
8. Report the paste and clipboard outcomes separately. Snapshot, write, restore,
   ownership, input and protocol failures retain M2.1 transcript recovery.

Failed SetClipboardData calls during restoration have bounded retries for the
individual format; the clipboard is not cleared repeatedly after a partial
restore. This is **not** an automatic retry of a paste.

## Format handling and strict limits

Global-memory representations include Unicode/ANSI text, DIB/DIBV5 image data,
file lists, and a finite set of known registered serializations such as HTML,
RTF, PNG and BIFF. Bitmaps, palettes and metafiles use their appropriate handle
copy and cleanup operations, including the nested handle in METAFILEPICT.
The existing order of all enumerated representations is retained.

This is **not a universal serializer for arbitrary Windows application state**.
Unknown registered formats, owner-display/private formats, OLE data-object
bookkeeping and virtual-file representations are rejected as a whole, before
replacement. Raw byte-copying a buffer that embeds live pointers would not
preserve the original object. A finite format-name policy is therefore deliberate.

Consequently, some real applications' clipboard payloads may currently prevent
automatic insertion. The old clipboard remains available and the new transcript
remains in Last transcript. Do not present this fallback as transparent support
for every clipboard payload. In particular, synthetic CF_HDROP/BIFF fixtures do
not establish real Explorer/Excel/OLE interoperability. That requires Windows
application tests and may require additional implementation before M2 acceptance.

Copy Last Transcript remains an explicit request to replace the clipboard;
Clear Last Transcript affects only recovery memory. Neither is conflated with
an automatic insertion transaction.

## Protocol and packaging

The helper source remains `native/windows-fast-paste.cpp`, but its output is
now **`resources/bin/windows-clipboard-paste.exe`**. An old helper ignored argv
and only synthesized Ctrl+V; calling it with a new argument could otherwise
paste unrelated clipboard content. The new name, exact protocol argument and
validated structured response prevent that silent version mismatch.

Request: `--clipboard-transaction-v1`, with `UDCP1 <UTF-8 byte count>\n` followed
by exactly that many bytes on stdin and EOF. Response is one JSON object with
protocol version 1, a fixed result code, paste state and clipboard state.
A success means input was submitted and the clipboard was restored or a newer
copy preserved; it is not confirmation that an opaque target inserted text.

There is no legacy binary/PowerShell fallback and no automatic retry. Unknown,
excessive or malformed helper output is bounded and never echoed. The host
never kills a running helper merely for excessive output: it may be restoring
clipboard data. The legacy executable is explicitly excluded from the VSIX.

Both CI workflows include the new Node tests. Linux and Windows CI run the
portable transaction tests; Windows CI additionally compiles the native helper
with user32/gdi32 and runs the Win32 clipboard smoke tests. These workflow changes
are prepared, **not yet executed**.

## Remaining failure and timing boundaries

The native 120 ms post-input grace remains a heuristic, not an acknowledgement
from VS Code, Codex or another application. There is still an interval between
input submission and the target actually reading the clipboard. A concurrent
copy or a slow target can change the insertion outcome even while restoration
ownership checks are correct. Never auto-retry an uncertain paste.

A process crash, forced termination, OS failure or partial SetClipboardData
failure after replacement can prevent full restoration. Error results distinguish
unknown/partial restoration rather than claiming success. The old clipboard
snapshot is memory-only; this implementation is not crash-recoverable storage.

The Windows exclusion marker suppresses the temporary payload in Windows'
clipboard history/cloud mechanism, not every third-party clipboard observer.
Restoring the original data can still be externally observable and can affect
clipboard history. Do not claim the clipboard transaction is invisible.

Materializing delayed-rendered data can call into a source application. Opening
our clipboard lock has bounded retries, but a source's rendering delay is not
fully bounded by that retry limit. Native Windows tests are still needed for
contention, delayed rendering, clipboard managers and helper termination.

M2.3 must review disposal/cancellation at the host/native boundary without killing
an in-progress restoration or allowing an obsolete session to start a new paste.
Issue #38 remains open: this change does not restore an opaque composer/caret,
replay clicks, use private Codex interfaces or fix status-bar focus loss.

## Validation actually performed

- Exact approved M2.1 patch committed as `a21d6825354448c2709613ad7ae693817400a797`.
- Existing paste-source preimages verified against GitHub blob hashes at that
  commit; original M2.1 files preserved for an exact M2.2 diff.
- Strict TypeScript checking/compilation of the changed core succeeded with
  existing TypeScript/Node typings; the VS Code adapter was syntax-transpiled.
- **83 Node tests passed:** 40 clipboard protocol/host tests plus all 43 M2.1
  recovery and mocked VS Code/UI regression tests.
- **34 portable native transaction/policy cases passed**, compiled with both
  g++ and clang++ under C++20, warnings-as-errors. They also passed a g++
  AddressSanitizer/UndefinedBehaviorSanitizer run with leak detection enabled.
- JSON/workflow checks and patch-application verification are included in the
  accompanying validation report. No dependencies were installed.

The portable tests run the same transaction state machine used by the helper,
with a fake operating-system host. They are not evidence that Win32 handle
copying, real clipboard formats or the actual paste target work.

**Not run:** native Windows/MSVC compilation; the ten added real Win32 smoke
cases; full-project compilation against the project's VS Code typings; M1 native
layout/overlay regressions; VSIX packaging; real VS Code/Codex, Remote-WSL,
Explorer/Excel/OLE, mixed-window, clipboard-manager or failure-injection tests.

The Windows smoke executable is restricted to disposable CI/test environments
and requires `--allow-test-clipboard-replacement`: it intentionally replaces
the test station's clipboard. It does not send real paste keystrokes. Do not
ask the user to run it against valuable desktop clipboard contents.

## Next authorized gate

M2.2 is committed at `174883bd0ccf96b27e4727f40cf915d038e11836`.
M2.3 is committed at `80fcd399055cae3c74ba390b155235e1386610d8`.
See [M2_3_LIFECYCLE.md](M2_3_LIFECYCLE.md) and the current
[M2.4 integration ledger](M2_4_INTEGRATION.md). The original M2.2/M2.3 native
clipboard code failed its first real Windows smoke check; corrections are not
yet validated. Only M2.5 supplies the user-test VSIX. M3 must not begin before
M2 is accepted and merged.

## Primary API references

- [Clipboard operations: exclusive access, ownership, delayed rendering and handle lifetimes](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-operations)
- [Clipboard format enumeration and synthesized representations](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumclipboardformats)
- [GetClipboardSequenceNumber](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber)
- [Clipboard formats and Windows history/cloud exclusion controls](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats)
- [SetClipboardData and transferred memory ownership](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setclipboarddata)
- [CopyImage and independent bitmap copies](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-copyimage)
- [OLE clipboard data can depend on a live source object](https://learn.microsoft.com/en-us/windows/win32/api/ole2/nf-ole2-olegetclipboard)
