# Internal validation and integrated acceptance

Current scope is the unpublished 1.2.0 Windows integrated candidate. M0 user
measurements and M1–M4 implementations are complete. M5 confirmations and
[source review](M5_REVIEW_CLOSEOUT.md) are complete, with the original cache cause
unknown. Final package validation and [M6 acceptance/freeze](M6_INTEGRATED_CANDIDATE.md)
remain distinct gates. A compile/mock result is not a real Windows interaction
test, and a Windows runner is not the user's microphone/VS Code/WSL environment.

## Delivery contract

Use existing automated tests and production-renderer inspection internally. Save
bounded source/evidence checkpoints. Do not turn each test refinement into a user
VSIX installation or repeat the old sentence/diagnostic/screenshot routine. The
user reviews one integrated candidate through normal dictation. A material defect
may justify one consolidated correction and another candidate.

The former manual matrices in this document belonged to earlier waveform/pause
acceptance. They are historical coverage, not renewed user work. The accepted
waveform, clipboard/Pause behavior and defaults remain protected by regressions.
Historical milestone ledgers retain their original evidence; current roadmap
numbering is in [OVERLAY_INTEGRATION.md](OVERLAY_INTEGRATION.md).

## Internal validation by risk

| Area | Internal evidence / purpose |
| --- | --- |
| Host settings and lifecycle | TypeScript plus Node tests for seven settings, effective workspace values, session snapshots, one operation owner, final-only insertion, recovery, cancellation and Pause/Resume |
| M1 inference ownership | Independent final/preview routing, preserved warm final PID, actual owned-preview exit including startup/idle, bounded escalation, no respawn after disposal, final-only fallback and failure isolation |
| Capture and pause | Original accepted PCM/WAV equality, acknowledgement admission barrier, no paused samples, no duplicate finalization, preview IPC and exact command framing |
| Spectral numerics | Independent DFT comparison, genuine variable CQT windows/tone response, fixed power scale, silence/DC, chunking, immutability, history wrapping, bounded queue overflow/gaps and concurrency |
| Windows rendering | Actual production renderer, all five styles × Small/Medium/Large × 96/120/144/192 DPI × Preview Off/On × active/paused; clipping and aligned controls |
| Accepted waveform | Existing immutable bucket/history, signed-level and translated-pixel motion tests; no waveform retuning for synthetic fixtures |
| Preview raster cache | Frozen uncached oracle, exact RGB and line-metric equality, cache hit/text/DPI invalidation, clipping/moving, reset and GDI-resource cleanup; retain diagnostics for every failure |
| M5 combined performance | Revision-2 adjacent AB/BA comparison with real recorder/render/Whisper, full PCM, no drops and retained failed trials |
| Package/source integrity | Correct win32-x64/UI-host identity, defaults, native/JS/runtime DLL hashes, resolved build identity, notices/media and package exclusions |

A test/doc-only change needs affected test validation and production fingerprint
comparison; it does not automatically require another 224-observation replay.
A production renderer/runtime change requires corresponding Windows and performance
checks. Broaden testing only for an identified remaining risk. Preserve exact
assertions and predeclared budgets; do not suppress rules or filter failed samples.

After dependencies are prepared in a development/CI environment, relevant commands
include `npm run check`, `npm run compile`, `npm run test:latency` and
`npm run test:visualizations`. Read the actual scripts: `test:m1` means historical
overlay-size tests, `test:m2` recovery, `test:m3` preview and `test:m7` pause; these
are not current-roadmap completion claims. Native commands live in
`.github/workflows/ci.yml`, `windows-package.yml` and `m5-overlay-performance.yml`.
`npm run package:vsix` packages prepared payloads; it does not by itself build or
audit native helpers, install the extension or authorize publication.

## Preserved configuration contract

Prefix each stored key with `universalDictate.`:

| Key | Default | Boundary to verify |
| --- | --- | --- |
| `language` | `en` | Keep explicit language/Auto and session stability |
| `visualization` | `enhancedOverlay` | Both/Enhanced overlay/Status bar only/Off remain independent |
| `enhancedOverlayVisualization` | `waveform` | Five exact labels/order; invalid values fall back to Waveform; saving does not enable an overlay |
| `overlaySize` | `medium` | Small/Medium/Large retained, with no forced change |
| `waveformTimeSpanSeconds` | `10` | Existing key; 1/3/5/10/20 second history; no limit on recording length |
| `overwriteClipboard` | `false` | Automatic Off means no clipboard access; explicit Copy Last Transcript remains available |
| `livePreview` | `false` | Effective only when an enhanced overlay is visible; no second worker when Off |

Waveform / Oscillogram, Log-Frequency Power Spectrogram, Linear-Frequency Power
Spectrogram, Constant-Q Power Spectrogram and Circular Spectrum are the exact
ordered styles. Circle is latest-frame only. Status-bar animation is independent.
Selecting a style applies on the next recording, without another reload. Explicit
saved preferences and effective workspace overrides must not be reset for tests.

## Completed M5 evidence and interpretation

Original run `37765259320` at `410094f` and post-review run `37778677667` at
`980877b` each independently completed **224 observations and 88 passing aggregate
gates** under [revision 2](M5_CONFIRMATION_PROTOCOL.md). Use the raw reports and
[M5 closeout ledger](M5_REVIEW_CLOSEOUT.md), not only green job summaries. Keep
their source identities/results separate, with historical failures and the protocol
revision visible.

The post-review run also completed 60 predetermined cache matrices across six jobs:
7,320 case pairs, 36,660 exact pixel comparisons and 6,000 reset cycles, without a
reproduced mismatch. Source/oracle review and these probes support a disclosed
residual risk in the integrated candidate; the original cause is still unknown.
All eight original Codacy additions were reviewed. Three cleanup additions are
absent from the new analyzer report; five intentional assertions/requirements
remain and the check is `action_required`.

Package failures `37778683095` and `37779796057` are retained separately. The latter
exposed an introduced test-helper RECT/OverlayRect signature mismatch, corrected
in the final source batch. The consolidated Windows renderer/package gate and
payload audit must pass before delivery; exact final source/checksum/results are
recorded in PR #56 and the delivered audit. M5 success is not package success.

Five style jobs compare Preview Off/On against frozen M1 Waveform; the sixth checks
no overlay against M1 no overlay. Each effective preview condition has ten complete
adjacent AB/BA pairs. Two additional 48-second baseline/candidate comparisons use
continuous generated speech with linear/CQT Preview On. Short input is the retained
12-second M1 fixture. All original accepted PCM, final PID, final result count,
server use, completed replay and preview-exit-before-final conditions are checked.

The producer is synthetic English; callback/WAV writing, Win32 paint/message loop,
Node/native IPC and Whisper inference are real; insertion is stubbed. Report
Stop-to-stub deltas, not physical click-to-visible-Codex-text latency. Allocated
hardware differs between mode jobs, so compare within each job. Native recorder
CPU/private commit excludes the complete system's resource cost. UI-sample p95 is
not a reliable 95th-percentile estimate of total dictation latency from ten pairs.

## Production-renderer inspection

The saved matrix contains 240 BMPs for 120 layouts, with active/paused images for
each. Inspect the actual outputs for clipping, control alignment, blank/saturated
regions, preview lines, size/DPI behavior and mode legibility. Synthetic speech and
tones describe the fixture, not capture from a microphone. Do not call contact
sheets user screenshots, approved aesthetics or recognition-accuracy evidence.

Current README examples use `media/overlay-visualizations.webp` and
`media/overlay-sizes.webp`, composed from production output with clear input
provenance. The old six-entry settings screenshot is not the current seven-setting
menu. The exact settings table supplies current navigation; do not fabricate a
VS Code screenshot or ask the user to produce one merely for this checkpoint.

Compact circular rendering with preview intentionally retains existing dimensions
and is shown honestly. Treat its appearance as a user acceptance question; do not
silently enlarge the overlay or retune the accepted waveform.

## One normal-use user review

After internal gates, deliver one clearly identified integrated VSIX. The user
installs/reloads once at a convenient time, then uses their usual Windows/Remote -
WSL and compatible target workflows. They may choose styles while using normal
dictation; no fixed recording sequence, language matrix or repetition count is
required. Ask whether insertion, controls/Pause, responsiveness and appearance are
acceptable, and address a concrete defect if reported.

The expected behavior remains: full accepted speech is inserted once without
submission; Pause ignores paused audio while retaining the device; Discard inserts
nothing; provisional text is never inserted/copied; automatic clipboard Off leaves
every clipboard format untouched. Issue #38 remains the genuine status-bar mouse
focus limitation. Tests do not prove compatibility with every opaque composer.
User acceptance, not artifact delivery, is the M6 exit gate.

## Diagnostics only when useful

**Universal Dictate: Show Latency Report** opens the last 100 completed timing
records as one document. It contains no audio/transcript and stays in the current
extension-host session; save it before reload if further analysis needs it. T0 is
engine acceptance, T3–T4 the final adapter call, T6 input-helper completion rather
than target paint. Do not request a diagnostic screenshot after each recording.

**Show Diagnostics** is available for a concrete setup/runtime fault (host placement,
helper/runtime availability, model state and effective settings). If context is
missing, request only the relevant build ID, environment/settings and symptom once.
Separate recorder/setup failures, preview failures, final inference, recognition
quality and target-focus errors using evidence; do not assign a cause from a label.

## Integrated/final package audit

Audit the exact VSIX and record source commit/tree, build checkout, size/hash,
resolved toolchain/dependencies and workflow IDs. Verify:

- identity `gcalpay.vscode-universal-dictate`, intended version, win32-x64 and UI host;
- all seven defaults, five style labels/order and accumulated reporting;
- approved icon, current README/changelog and honest renderer assets;
- `windows-text-input.exe`, `universal-dictate-recorder.exe`, `whisper-cli.exe`,
  `whisper-server.exe` and every required runtime DLL against build payloads;
- MIT and all third-party notices/licenses, including retained OpenWhispr lineage;
- no source/tests, development dependencies/lock, fonts, model weights, audio
  fixtures, test executables or obsolete settings/overview image in the package;
- exact mapping of published bytes to their actual source, without relabeling an
  older synthetic-merge build as a newer source build.

The package audit, analyzer disposition, user acceptance, history replacement and
publication are separate gates. After accepted-tree freeze, follow the M7/M8
backup/tree-equality/lease/release safeguards in
[M6_INTEGRATED_CANDIDATE.md](M6_INTEGRATED_CANDIDATE.md).
