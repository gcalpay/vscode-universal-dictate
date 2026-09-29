# M2 acceptance correction — direct input and optional clipboard overwrite

Updated: 2026-09-29, after detailed Codacy review and the user's conditional merge approval.
Branch: `fix/transcript-recovery`; PR #51 records the actual merge state.
Milestone base: `481913feb88ad16aca00da744dd2fe72cd90ef98` (accepted M1).
Rejected correction parent: `eb2f60369763486eedb6c9d88283ea6446ac8ccf`.
Accepted runtime source: `eaf0570f1c817229e36177ccff32f50ce396a43f`.

**M2 acceptance is recorded.** The user accepts the current candidate and authorizes merge when no replacement VSIX is necessary. The detailed review found no required runtime correction, so no replacement installation is required. See [M2_CODACY_TRIAGE.md](M2_CODACY_TRIAGE.md) for all fourteen findings, their dispositions, and the exact evidence. Earlier pending-review/acceptance instructions in the roadmap and archived ledgers are superseded by this closeout. No publication, version bump or Issue #38 closure is authorized.

## Current contract

The user rejected the earlier restoration VSIX because unsupported clipboard formats blocked ordinary dictation and menu-based reinsertion lost the caret. The snapshot/restore transport and recovery submenu were replaced.

| Overwrite clipboard | Automatic insertion | Clipboard |
| --- | --- | --- |
| Off (default) | Attempt direct Unicode input into the currently focused input | No reads, writes, inspection, temporary replacement or restoration |
| On | Attempt the same direct input | First copy the exact transcript once, overwriting existing contents; never restore the old clipboard |

The user confirmed that Overwrite clipboard works as intended. Do not request those Off/On checks again unless a later runtime change affects them.

No usable focused input means Off creates no automatic clipboard backup. On leaves the copied transcript available for manual paste unless a later user/application copy replaces it. Optional-copy failure is reported but does not prevent the independent direct-input attempt. Uncertain input is not retried automatically.

The fifth gear-menu entry toggles `universalDictate.overwriteClipboard`, default `false`; only literal `true` enables copying. The mode is captured before recording preparation. Settings edits affect the next session rather than an in-flight recording.

**Universal Dictate: Copy Last Transcript** remains an explicit Command Palette command. It deliberately writes the retained transcript to the clipboard regardless of the automatic setting. The old Last transcript submenu and public Insert/Clear recovery commands are removed. Overlay Insert remains the Stop/transcribe/insert recording control.

Retain the exact latest successful non-empty final transcript before insertion. Empty, failed or cancelled transcription does not replace it; insertion or optional-copy failure does not erase it. This window's recovery state is memory-only and independent of the clipboard. An unrelated clipboard copy does not erase it; reload/restart/disposal clears recovery. No transcript log or persistent history was added.

## Implementation and limits

The native `windows-text-input.exe` helper contains no clipboard operations. It submits bounded Unicode batches, preserving surrogate pairs, and waits for physical modifier release rather than synthesizing modifier changes. HWND-level focus changes, cancellation and new modifier presses stop remaining input. It does not restore a target or use private DOM APIs.

Protocol: `--unicode-input-v1`, with `UDTI1 <UTF-8 byte count>\n` followed by the exact bytes. The host keeps stdin open as the operation-lifetime signal; EOF requests cancellation. Input text is not placed in command arguments or logs. Legacy paste executables and retired clipboard-protocol components are excluded from the package.

Direct-input preparation turns control characters, including CR/LF and Tab, into spaces. No Enter, Tab or Backspace command is synthesized, and messages are not submitted automatically. The optional clipboard copy retains the exact original transcript; direct input is not a guarantee of multiline formatting.

Operation/session ownership, cancellation, recorder shutdown and WAV cleanup protections remain. Failed or unconfirmed cleanup is not described as successful cleanup. Input already submitted to Windows cannot be retracted. HWND identity is not proof of an editable Codex DOM target or the intended caret/selection; SendInput submission is not an application acknowledgement. **Issue #38 remains unresolved.**

M2.1-M2.4 remain archived checkpoint evidence. Their discarded recovery-menu commands, clipboard-v2 protocols, restoration tests and obsolete next-gate statements do not define current behavior. The remaining future milestone scope in the roadmap is unchanged.

## Recorded candidate evidence

| Evidence | Recorded result |
| --- | --- |
| Accepted runtime | `eaf0570f1c817229e36177ccff32f50ce396a43f` |
| Original corrected Linux CI | Run `36506468768`, success |
| Original corrected Windows package | Run `36506468804`, success |
| Documentation-checkpoint Linux CI | Run `36580791482`, success |
| Documentation-checkpoint Windows package | Run `36580791428`, success |
| Native input validation at delivery | Unicode/request/lifetime checks and actual input into a disposable Win32 EDIT, not a Codex composer |
| Package audit at delivery | Passed; all eighteen recorded payload hashes independently checked in the delivery conversation |
| Earlier sandbox validation | 139 Node tests and 84 portable Unicode assertions; not a manual Codex acceptance matrix |
| User feedback | Normal dictation and Overwrite clipboard work as intended |
| Latest user decision | Current candidate accepted; merge authorized when no replacement runtime is necessary |

These are attributed recorded results, not an assertion that every historical test was rerun manually during this review. The final review also inspected existing recovery and lifecycle test coverage. Final-branch workflow outcomes and the actual merge SHA are recorded on PR #51.

Delivered and accepted candidate: `universal-dictate-win32-x64_M2-clipboard-toggle-eaf0570.vsix`.
Version `0.1.5`, target `win32-x64`, Medium overlay default. The delivery renamed the file, not its original CI-built bytes.

- Artifact ID: `11007278287`.
- VSIX size: 8,575,990 bytes.
- VSIX SHA-256: `49225f6d029ccfc49efe926c293b2c06188605552625e4571aaf59bdcaf39788`.
- Outer ZIP SHA-256: `134c6e77624fb4dacfd0933956fa499462d957a7f6f273a7a8a19b2488d3144a`.
- Original CI checkout: `c6dec6b74656afb63d6ab4a9e562da891a3ed5b2`, a synthetic PR merge rather than an actual merge into main.

Do not resend an identical installation solely because documentation changed. The rejected `universal-dictate-win32-x64_M2-eb2f603.vsix` remains superseded.

## Codacy disposition and next action

The complete report is now available and all fourteen added findings have been reviewed. Seven security alerts are false positives in their specific contexts. Five clarity warnings concern intentionally strict agent/product safeguards. The constructor initializer-list suggestion and test function-length warning are genuine but nonblocking style/maintenance observations, deferred without changing runtime. The review found no required runtime correction.

No Codacy rule or quality threshold has been weakened. The tool's automatic result may remain non-green; a human disposition is not a fabricated passing check. The full finding IDs, reported locations, source reasoning, retrieval method and limitations are in [M2_CODACY_TRIAGE.md](M2_CODACY_TRIAGE.md).

Verify final documentation-only scope and successful normal workflows, then perform the user's authorized PR #51 merge using the expected head. Do not ask for another acceptance/merge confirmation absent a material change. After merge, choose the next agreed milestone; diagnosing unintended German-to-English output before M3 remains a proposed sequence adjustment rather than an implemented fix or automatic branch creation.

## Primary API references

- https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-keybdinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getguithreadinfo
