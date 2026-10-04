# M6 - 1.0.0 final release (historical checkpoint)

> Closed out by PR #53 at `eda02a512d3feb70989b89a3efc6714d12b833e7`. The user
> reports Marketplace publication. The material below records the original release
> gate, not instructions to republish. Current work: [M7](M7_PAUSE_RESUME.md).

Updated: 2026-10-01. Branch: `release/next`.
Accepted M3 merge: `d1408904409c8636a4ffada6ef342a5d04b6ed3a` (PR #52).
Release PR: #53.

## Current state and authorization

The previously verified 1.0.0 candidate at `02e94d9` passed Linux CI
`36793699565` and Windows package run `36793699560` (job `110152168797`).
Its VSIX SHA-256 was
`ecbe0db3f28cda44a2b29324bb43448a577b1f41e449b58474b4bcc678e14b4f`.
The user tested that candidate and accepted its product behavior.

The only requested presentation change is replacement of the old waveform-only
enhanced-overlay screenshot with the user's final 564 x 113 crop, plus reconciliation
of stale active internal documentation. On 2026-10-01 the user explicitly authorized
the complete final sequence after that change passes verification: update/ready PR
#53, merge to main, tag `v1.0.0`, create the GitHub Release and publish the exact
verified 1.0.0 VSIX to the VS Code Marketplace.

M4 is skipped. M5 remains parked and Issue #38 remains open. No new product feature,
runtime behavior, backend, model or update popup belongs in this release.

## Final defaults

The release defaults are:

- Language: English
- Overlay size: Medium
- Live preview: Off
- Overwrite clipboard: Off
- Visualization: Enhanced overlay
- Waveform history: 1 second

Explicit saved user choices remain untouched on upgrade. Source fallback and packaged
manifest values must agree with these defaults; Live preview in particular resolves
to false when no setting exists.

## Final assets and public text

The accepted release images are:

- `media/status-bar-controls.webp`
- `media/settings-menu.webp`
- `media/live-preview.webp`
- `media/enhanced-overlay.webp` — replace with the supplied 564 x 113 final crop
- `media/icon.png` — unchanged

Convert the final enhanced-overlay JPEG to WebP without further resizing, cropping or
redrawing; preserve its decoded appearance as faithfully as possible. Keep
`media/universal-dictate-overview.webp` absent.

README.md and CHANGELOG.md are already the accepted public 1.0.0 text. README keeps
the four screenshots, current settings/controls, the offline language note, recovery,
privacy, Remote-WSL scope and the known focus limitation. Do not restore internal
candidate/triage commentary or VSIX-install instructions.

## Final validation gate

A final commit that changes only release assets/docs does not reopen accepted M3
runtime work. Nevertheless, the exact final source must pass the ordinary Linux and
Windows release checks and package audit.

Verify the produced VSIX itself:

- version 1.0.0, publisher `gcalpay`, extension `vscode-universal-dictate`,
  target win32-x64 and UI extension host;
- source and packaged defaults: English / Medium / Live preview Off, plus the other
  settled defaults above;
- all four README screenshots and icon match the final source;
- obsolete overview image is absent;
- package contains only the two native helpers and `whisper-cli.exe` /
  `whisper-server.exe` as executables;
- no source/test/development directories, font files, model files or audio fixtures
  ship;
- compiled JavaScript and native helper identities match the final source/build;
- archive paths and VSIX identity are valid.

Record the exact final source head, workflow/run IDs, VSIX filename, VSIX SHA-256 and
audit evidence in PR #53. Codacy may remain `action_required`; do not disable its
rules or misreport reviewed findings as a green analyzer result.

## Publication rule

Mark PR #53 ready and merge only after the final artifact is verified. Verify main
contains the intended release tree, then tag that merged release as `v1.0.0` and
create concise user-facing GitHub Release notes from CHANGELOG.md.

Publish the **exact same verified VSIX bytes** to the Marketplace through an already
authorized secure publisher path. Do not rebuild after verification merely for
publication and never request a Marketplace token in chat. If the available tools
cannot perform Marketplace publication, complete the verified GitHub release work,
retain the exact artifact identity and report Marketplace publication as the
remaining blocker rather than claiming success.

Do not close Issue #38 or imply that 1.0.0 fixes genuine status-bar focus
preservation.
