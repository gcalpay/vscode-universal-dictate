# Testing and verification

Universal Dictate includes TypeScript, Node, portable native C++ and Windows-only
integration checks. Linux tests do not substitute for real Win32 focus, recorder,
clipboard, native overlay or Windows packaging behavior.

## Development commands

From a checkout with Node.js 24:

	npm ci --no-audit --no-fund
	npm run check
	npm run compile
	node --unhandled-rejections=strict --test test/*.test.cjs test/visualizations/*.test.cjs

Targeted scripts in `package.json` provide additional suites for overlay sizing,
transcript recovery, preview, latency and visualizations. The native C++ tests and
Windows VSIX build are defined in `.github/workflows/ci.yml` and
`.github/workflows/windows-package.yml`.

## Product regressions

- **Capture and lifecycle:** accepted PCM/WAV continuity, bounded buffers,
  cancellation/disposal, no duplicate finalization and recorder IPC ownership.
- **Inference:** independent warm final and optional preview processes; no stale
  hypotheses, final-only CLI fallback and no automatic preview worker when Off.
- **Input and clipboard:** Unicode into focused Windows controls, modifiers,
  explicit clipboard actions and no clipboard access with automatic overwrite Off.
- **Presentation:** waveform sample history and amplitude, three enhanced-overlay
  modes, five palettes, all size/DPI combinations, square circular geometry and
  native non-activating Insert/Discard hit targets.
- **Packaging:** locked dependency installation, compiler identity, pinned
  Whisper and SDL2 binaries, retained licenses and precise included VSIX payloads.

The internal audio-admission regression tests may use Pause-related identifiers;
they do not imply that the public extension exposes Pause/Resume.

The source build script `npm run package:vsix` expects compiled native helpers
and runtime files to be present. It does not independently fetch, compile and
audit the complete Windows release payload. Use the Windows package workflow to
validate a distributable artifact.

Before a release, compare the packaged JavaScript/native/runtime contents and
README/license/notice assets against the approved source. Compiler timestamps and
packager metadata can change binary archive hashes without changing code; record
such differences rather than claiming byte-for-byte identity without evidence.
Avoid tests that capture private speech. Synthetic fixtures and disposable Win32
test controls are used for reproducibility.

## Continuous checks

CI runs the complete Node suite, portable native regressions and spectral cost
checks on pull requests and changes to main. The Windows package workflow builds
the actual source commit and exercises native input/clipboard behavior, recording
admission, preview/cache rendering, and the real local Whisper preview adapter.
Both workflows can also be started manually. Their tokens are read-only and action
revisions are pinned; publication is never performed by these checks.

A green run confirms the configured checks, not error-free software or identical
latency on every computer. Preserve failed observations and assess shared-runner
noise separately from regressions. Do not weaken a threshold merely to obtain a
passing run. Package reports distinguish the actual checked-out commit from the
workflow event commit.
