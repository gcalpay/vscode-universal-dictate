# Agent guidance

Read [docs/M6_RELEASE.md](docs/M6_RELEASE.md) first for the active release checkpoint,
then [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md).
The M2/M3 documents and PRs #51/#52 are historical evidence, not outstanding
implementation or acceptance instructions.

## Current checkpoint and authorization

M1, M2 and M3 are accepted and merged. M3 merged through PR #52 at
`d1408904409c8636a4ffada6ef342a5d04b6ed3a`. M4 is skipped, M5 is parked and
Issue #38 remains unresolved. M6 is the only active 1.0.0 work on `release/next`
through PR #53.

The user tested the verified 1.0.0 candidate at `02e94d9` and accepted its product
behavior. On 2026-10-01 the user explicitly authorized the final release sequence:
replace the enhanced-overlay screenshot, reconcile active docs, run final checks and
package audit, update/ready PR #53, merge it, tag `v1.0.0`, create the GitHub Release
and publish the exact final verified VSIX to the VS Code Marketplace. No further
routine approval is required for those steps.

The final defaults are Language **English**, overlay size **Medium**, Live preview
**Off**, Overwrite clipboard **Off**, Enhanced overlay visualization and one-second
waveform history. Preserve explicit user settings; do not reset preferences on
upgrade. Keep the Language label and the approved offline language note.

## Final presentation change

Replace `media/enhanced-overlay.webp` with the user's final 564 x 113 crop. Convert
the supplied JPEG to WebP without resizing, cropping, redrawing or changing its
content; prefer a lossless conversion. The other three 1.0 screenshots are accepted:
`status-bar-controls.webp`, `settings-menu.webp` and `live-preview.webp`.
Keep `media/icon.png`; keep the obsolete `universal-dictate-overview.webp` absent.

README.md and CHANGELOG.md are already accepted release text. Do not reintroduce
VSIX-install instructions, internal milestone commentary or obsolete artwork.

## Release gates

- Inspect live refs before writes and preserve unrelated work.
- Do not reopen accepted M3 runtime work merely because docs/assets changed.
- Verify source and packaged defaults resolve to English / Medium / Live preview Off.
  In particular, the runtime fallback for Live preview must remain literal false.
- Run the release CI/Windows package workflow and inspect the produced VSIX. Verify
  version 1.0.0, x64 identity, exact release media, four expected executables and
  absence of source/test/font/model/audio/development material.
- Record the exact final source head, VSIX filename and SHA-256 in PR #53.
- Codacy currently remains `action_required`; prior final-head findings were reviewed
  as false-positive/policy warnings. Do not weaken rules or claim Codacy is green.
- After final package verification, publish those exact VSIX bytes. Do not silently
  rebuild a different artifact for the Marketplace.
- If artifact/source identity, CI/package verification or publication capability is
  genuinely blocked, stop and report the blocker rather than guessing.
- Never request publication credentials in chat. Use an already authorized secure
  publisher path if one is available.

## Product invariants

Local/offline inference after model setup and the Windows UI-host/Remote-WSL
architecture remain. Preview is opt-in, overlay-only and bounded; final transcription
uses the complete recording. Do not insert or copy partial hypotheses. Only the
final transcript is retained, inserted once and optionally copied.

Automatic clipboard Off performs no clipboard access. On copies the final text once
before direct Unicode input; do not restore old clipboard data. Copy Last Transcript
is a separate explicit action backed by memory-only retained text. Keep session,
cancellation and WAV cleanup safeguards. No Enter, automatic submission or automatic
retry of uncertain insertion. Cancellation cannot undo already-submitted input.

The intended input/caret is the latest deliberate selection. Clipboard recovery does
not prove focus preservation. Do not use private Codex internals, global hooks, click
replay or mandatory custom VS Code. Keep historical experiment branches isolated.

Review analyzer findings at their actual source locations; previous false positives
do not automatically classify new findings. Do not disable checks or claim that a
review disposition changes an analyzer's reported status.
