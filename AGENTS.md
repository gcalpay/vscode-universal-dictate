# Agent guidance

Read [docs/M6_RELEASE.md](docs/M6_RELEASE.md) first for the active release checkpoint,
then [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md).
The M2/M3 documents and PRs #51/#52 are historical evidence, not outstanding
implementation or acceptance instructions.

## Current checkpoint and authorization

M1, M2 and M3 are accepted and merged. M3 merged at
`d1408904409c8636a4ffada6ef342a5d04b6ed3a`. Work continues on `release/next`.
The user authorized the English default, supplied three real screenshots, approved
the README rewrite and requested the resulting 1.0.0 VSIX for testing. Routine
release preparation, its Conventional Commits, package audit and CI are authorized.
Publication and release-branch merge still wait for explicit user approval.

The final defaults are Language **English**, overlay size **Medium**, Live preview
**Off**, Overwrite clipboard **Off**, Enhanced overlay visualization and one-second
waveform history. Preserve explicit user settings; do not reset preferences on
upgrade. Keep the Language label and the approved offline language note.

Use the three supplied screenshots losslessly, retain the existing waveform-only
overlay as a fourth screenshot, and remove the obsolete overview graphic. The
settings image is an example with preview On, not a picture of the default state.
Do not fabricate screenshots, redraw labels or substitute scripted renderer images.

## Release gates

- Work on this release branch; inspect refs before writes and preserve unrelated work.
- M4 translation is skipped. M5 focus preservation is parked; Issue #38 stays open.
- Build the candidate as version **1.0.0** without publishing a tag or release.
- Verify exact package identity, English/Medium/Off defaults, release media, README,
  changelog, native x64 helpers and absence of development material and font files.
- Report automated evidence separately from the user's Windows/VS Code test.
- Retain the tested VSIX bytes and SHA-256. After final approval, publish those bytes
  rather than silently rebuilding or incrementing the version.
- Do not add an update popup, translation toggle, new backend or model.
- Never request publication credentials in chat. Use an authorized publishing path.
- No source changes, installations or settings edits occur on the user's PC here.

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
