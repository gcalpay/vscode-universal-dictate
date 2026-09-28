# M2.3 — Lifecycle, recorder shutdown and cooperative cancellation

Updated: 2026-09-28.

## State and authorized scope

Repository: `gcalpay/vscode-universal-dictate`.
Branch: `fix/transcript-recovery`.
Exact baseline: `174883bd0ccf96b27e4727f40cf915d038e11836`.

M2.2 was committed with explicit user approval as
`fix: preserve clipboard state during transcript insertion` and its remote ref
was verified. M2.3 source/tests described here are **prepared but uncommitted**.
No milestone merge, PR, remote workflow dispatch, version bump, dependency
installation, release or user-test VSIX is part of this change set.

M2.4 remains the integrated validation phase. **The user's VSIX test is M2.5,
not an intermediate submilestone gate.** No M3 branch before accepted M2 merge.

## Engine changes

Each operation owns an explicit generation/identity, AbortController, phase,
recorder reference and terminal cleanup. A completion can only update controls,
retain a transcript or initiate insertion while it still owns the current slot
and is neither cancelled nor disposed. Its cleanup cannot clear a newer slot.

New starts and recovery actions are refused rather than queued behind unfinished
work. Cancelling an uninterruptible model preparation/decode does not pretend it
has finished: its slot stays occupied until it settles. A decode already reading
a WAV is allowed to settle before that WAV is removed. This deliberately prevents
overlapping old/new decodes within the same engine; stale event callbacks from
completed recorders are independently rejected by operation identity and phase.

Early native Stop/Cancel is retained in one bounded pending-action slot during
startup. The first action wins; the old repeated 25 ms retry loop is gone. Once
finalization begins, duplicate Stop or late native actions cannot start another
transcription or paste. Explicit Cancel/dispose aborts the owning operation.

Recording-context notifications are serialized and coalesced to the newest
requested value. They do not gate physical recorder Stop/Cancel. A started true
notification is followed by the latest false on shutdown, rather than letting an
old true complete after the final false. A hung notification still cannot block
physical shutdown, though its context update cannot be made to finish forcibly.

UI/diagnostic exceptions cannot bypass physical Stop/Cancel or trap the operation
slot. An exception at the final insertion-state callback still prevents that
insertion while leaving the transcript retained; explicit recovery reports the
error rather than automatically retrying. Disposal clears recovery and suppresses
further UI/error callbacks. Existing recovery commands, menu layout and Medium
overlay default are unchanged.

## Recorder process and WAV ownership

The concrete recorder now waits for Node's child-process **close** event rather
than exit alone before returning a completed WAV or removing a cancelled WAV.
Exit alone does not guarantee that stdio handles have closed.

Stop and Cancel join single terminal promises and never write a second native
terminal command. Cancel after Stop marks the recording for discard, without
trying to transcribe it. stdin/stdout/stderr/readline errors have handlers; an
unexpected recorder exit is reported to the engine once even if its failure
listener is attached after the exit. Late levels/actions are suppressed.

Startup has the existing 10-second readiness limit. Requested shutdown has a
10-second grace period followed by one recorder-termination attempt and a
2-second confirmation limit. These bounds apply to the **microphone recorder**,
not the clipboard helper. Kill errors cannot recurse through the process-error
handler. Timer/abort listeners are cleaned on completion.

If shutdown cannot be confirmed, the failure is reported, the possibly live WAV
is not deleted, and a late-close cleanup hook remains. An OS that refuses to
terminate a process is not reported as successfully cleaned up. A removal failure
is surfaced instead of claiming cleanup succeeded. The extension cannot guarantee
cleanup across forced host termination, OS failure or unrecoverable file locks.

Recording filenames use random UUIDs instead of millisecond timestamps, avoiding
same-timestamp collisions between windows. The wrapper checks cancellation before
and after directory preparation and forwards the signal and failure notifications.
Only paths owned by the current recorder operation are cleaned; no directory-wide
sweep, reset, clean or deletion of unrelated files is used.

## Clipboard host/native cancellation boundary

Dropping a late TypeScript result would not stop an already-started native helper
from eventually pasting after a slow clipboard snapshot. M2.3 therefore extends
the M2.2 helper transaction with cooperative cancellation:

- Exact argument: `--clipboard-transaction-v2`.
- Request: `UDCP2 <UTF-8 byte count>\n` followed by exactly those bytes.
- The host **keeps stdin open after the frame** while the operation is live.
- Cancellation closes that pipe. Host termination also closes its pipe handles.
- The helper uses unbuffered Win32 reads for the bounded frame and checks the
  pipe before snapshot/write/dispatch boundaries. A disconnected pipe or extra
  trailing data means cancellation. No additional request is accepted.
- Cancellation before replacement leaves the old clipboard untouched. After
  replacement it restores the original only while still owning it, preserving a
  newer copy otherwise. Restoration continues even when the host no longer wants
  to insert. The host waits for process close and never kills this helper.
- Response protocol is version 2 and includes the fixed `cancelled` result code.
  Paste and clipboard outcomes remain separate. Partial/unknown restoration is
  never hidden behind a cancellation success or followed by an automatic retry.

The helper checks again after its existing modifier-release grace immediately
before SendInput. **Cancellation is cooperative, not an atomic Windows undo**:
input already submitted cannot be revoked, and there remains a final check-to-
SendInput race. A source application stuck rendering clipboard data can delay the
next cancellation check. Full M2.2 format/ownership failure limits still apply.
Do not claim guaranteed target insertion, full crash recovery or that Issue #38
has been solved.

The executable remains `windows-clipboard-paste.exe`. The v1 and v2 argument and
response checks reject mismatches rather than silently executing an old protocol.
The native transaction mutex name intentionally remains shared with v1 so two
installed versions cannot run overlapping clipboard transactions.

## Tests and evidence actually obtained

- The reviewed M2.2 patch's 16 postimages produced the expected Git tree before
  its commit. M2.3 edits are based on that exact committed checkpoint.
- Strict TypeScript check/emit passed for all five locally present core modules
  using preinstalled TypeScript 5.8.3 and available Node typings.
- The four VS Code-facing modules were syntax-transpiled; this is **not** full
  project checking against the declared VS Code type package.
- **137 Node tests passed in three consecutive runs** with strict unhandled-
  rejection handling: 28 recovery-core, 15 mocked UI, 48 clipboard host/protocol,
  23 engine lifecycle and 23 recorder/wrapper lifecycle tests.
- **44 portable C++ transaction/policy cases passed** with both g++ and clang++
  under C++20 and warnings-as-errors. The same cases passed AddressSanitizer and
  UndefinedBehaviorSanitizer with leak detection enabled.
- The tests cover pending notifications, reentrant disposal, early/duplicate
  actions, late callbacks, cancelled preparation/decode/paste, shutdown failure,
  cleanup timing, writer-close ordering, broken pipes, UUID paths and cooperative
  cancellation at all pre-paste transaction checkpoints.
- A filesystem test wait initially depended on a fixed number of event-loop
  turns; repeat runs exposed that test-harness assumption. It now waits for the
  same explicit predicate with a bounded wall-clock deadline. Runtime shutdown
  conditions and assertions were not weakened.
- CI and `test:m2` include the new lifecycle tests. Twelve additional Windows
  request/lifetime-pipe cases are wired into the Windows workflow. They exercise
  the helper's actual reader without clipboard writes or SendInput.

**Not run:** native Win32/MSVC helper compilation; the 12 request/lifetime tests;
the existing 10 actual Win32 clipboard smoke tests; full-project VS Code typings;
M1 native/overlay regressions; remote CI; VSIX packaging; real Windows/Codex,
Remote-WSL, Explorer/Excel/OLE, clipboard-manager or multi-window acceptance.

Portable host tests use a fake OS boundary; Node recorder tests use controlled
child-process/stream doubles. They do not prove actual Win32 handle, pipe or
caret behavior. These are explicit M2.4/M2.5 validation requirements, not a claim
that native cancellation or complete clipboard compatibility has shipped.

## Next checkpoint

Proposed commit: `fix: harden dictation lifecycle and cancellation`.
Stop for explicit commit approval. Then proceed with M2.4 integrated validation
on this same branch, followed by the single M2.5 user-test VSIX.

## Primary API references

- Node child-process exit/close and error semantics:
  https://nodejs.org/docs/latest-v22.x/api/child_process.html
- Node AbortController/AbortSignal:
  https://nodejs.org/docs/latest-v22.x/api/globals.html#class-abortsignal
- Win32 PeekNamedPipe (including anonymous-pipe read handles):
  https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe
- Win32 ReadFile:
  https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-readfile
