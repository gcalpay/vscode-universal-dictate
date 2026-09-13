# M1.2: isolated status-bar focus probe

**Diagnostic only. Not an Issue #38 fix, Marketplace release or replacement launcher.**
Work branch: `experiment/m1.2-statusbar-focus-probe`, directly based on extension
`main` at `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`. The planning branch and old
`fix/preserve-insertion-target` experiment are not implementation bases.

## What is tested

H1 adds one primary-mouse-down listener to the genuine Universal Dictate status-bar
item in a separately built Code OSS host. It calls `preventDefault()` only for
`gcalpay.vscode-universal-dictate.universalDictate.dictate` and button 0. It does
not intercept the later click, change keyboard handlers, restore focus, inspect
Codex, add an API, hook the mouse or replace the launcher. `host-patch.cjs` checks
the exact upstream commit and original source blob before writing a fresh source
checkout. Baseline receives no source change. The upstream remains pinned to
`8e35945bae3f2b0b3d0276963281180f1ce10cb0` for both variants.

The development extension uses the actual baseline-compiled controller, recorder,
recording overlay and paste helper. A diagnostic bootstrap substitutes only the
transcription adapter and its model-setup/warm-up prerequisites. It returns
`UD_TEST`, not recognized speech. **The microphone and temporary recording remain
real; use silence/synthetic test audio.** No Whisper model is downloaded for this
probe. There is no audio/transcript logging or added network listener.

The baseline and H1 host use the *same* diagnostic extension. Counters record
engine toggle calls and paste requests, not text from editable controls. A helper
return is explicitly logged as NOT an insertion acknowledgement. Observe the real
text and submission state; logs do not establish that Codex accepted a paste.

## Deterministic pending interval

After the real Stop/Insert path finishes recording, the probe starts a hidden
Windows helper. Only while pending, it registers **Ctrl+Alt+Shift+F8**. Wait for
`UD_TEST pending` in the status bar, deliberately select the destination/caret and
press/release that chord. The helper checks physical key release before allowing
`UD_TEST` to reach the existing paste path. It neither activates a window nor
synthesizes any key. This also lets an external text input remain focused.

This is a *test completion signal*, not a proposed product confirmation or new
product hotkey. The pending interval has no automatic completion timer. Readiness
failure, hotkey conflict, malformed protocol, disposal or helper death reject the
operation rather than insert text. The helper exits if its extension-host parent
dies. Closing the diagnostic window aborts a pending trial; do not infer production
transcription cancellation from that diagnostic cleanup.

## Build outputs and isolation

The branch-scoped `M1.2 isolated focus probe` workflow builds:

- `m12-probe-kit`: development extension plus launcher and manifest. It is **not** a
  VSIX. Its bootstrap requires Windows, extension Development mode and an explicit
  environment opt-in. Publishing is deliberately blocked in its staged manifest.
- `m12-code-oss-baseline` and `m12-code-oss-h1`: portable *archives* of separately
  built open-source hosts, not installers. Do not create a `data` folder inside
  either host; the launcher enforces explicit isolated profiles instead.

All three artifacts must come from the same diagnostic commit/run. The launcher
verifies host identity and executable hash. It uses per-variant user-data,
extension and scratch directories under `.sessions` in the extracted kit and sets
a separate `CODEX_HOME`. It does not modify the installed VS Code, share its
extension directory, copy credentials or enable Settings Sync. Do not sign in to
Settings Sync in the test host. Codex sign-in, if needed to access its composer,
occurs separately in this test environment and is not automated.

The original repository's runtime, settings, version and release workflow are
unchanged. Only diagnostic sources/workflow and handoff documents are committed.
A hosted fork of microsoft/vscode is unnecessary for this probe: the immutable
source checkout and scoped source transformation are carried by the workflow.
No upstream PR or change to Microsoft branding/product configuration is made.

## Local Windows procedure (M1.3; not executed by this document)

1. Obtain successful artifacts from one run. Extract the kit and each host into
   separate ordinary directories, preferably outside your system drive. Do not
   install the diagnostic extension into your everyday VS Code.
2. Obtain a current, Windows-compatible **Codex IDE extension** VSIX from its
   publisher/official distribution and check its identity/version. It is not the
   older macOS Work with Apps-only extension. Code OSS lacks a Marketplace catalog;
   do not work around that by spoofing its product configuration. No Codex package
   or private credentials are redistributed with this kit.
3. From the extracted kit, run in PowerShell (replace only the example paths):

   ```powershell
   .\launch.ps1 -HostDirectory D:\ud-probe\baseline -CodexVsix D:\ud-probe\codex-win32-x64.vsix
   ```

   Record the Codex version and use the same VSIX for H1. If the extension or its
   real composer will not load in Code OSS, mark its cases **Blocked** and keep
   that error. Do not replace it with a mock or report success from an editor.
4. Open an untitled scratch editor and the real Codex composer. Start with the
   default Enhanced overlay and exact fixtures from M0.3: `left  right` with its
   caret between the spaces, or `left old right` with `old` selected. Both should
   become `left UD_TEST right`. Prepare the fixture, click the genuine Dictate
   item, finish using overlay Insert, then release the pending test chord **without
   a corrective click**. Record the actual text, not just whether a caret blinks.
5. Repeat using status-bar Stop, and then keyboard start/finish. Baseline failure
   is a useful control, not something to conceal. H1 only helps if it changes the
   observed behavior under otherwise equivalent conditions. Neither build alone
   proves correctness across all paths.
6. Close the baseline test host, run the same launcher with the H1 directory and
   the same Codex VSIX, and repeat. Then do deliberate recording-time and
   pending-transcription-time target/caret/selection changes, normal editor and
   ordinary-input cases. Use the global test completion chord only after the new
   target is active. Check surrounding/non-destination text, one insertion and no
   submission. Do not issue Enter into a composer during insertion tests.
7. Check keyboard focus/Space/Enter activation and right-click behavior separately
   with safe controls/fixtures. Record every failure and the exact build, mode and
   path. This does not run the full M4 matrix or establish a WSL result. Remote-WSL
   support in this source build is not assumed; mark T09 Blocked if unavailable.

Without the real Windows/Codex setup, all relevant GUI acceptance stays **Not run**.
See `docs/DICTATION_RELIABILITY_PLAN.md` in the branch for T01-T13 and reporting.

## Validation and handoff

Implementation: a scoped source transformer, a development-only fixed-text
bootstrap, a non-activating completion helper, a guarded launcher, a branch-only
build workflow and targeted unit tests. This is a probe, not a production patch.

Local validation at preparation: Node unit tests exercise protocol readiness,
release ordering, abnormal exit, cancellation/disposal, conflicts and handler
scope. They are **not** mouse-focus, Win32 hotkey or Codex acceptance tests. The
container has no Windows GUI and cannot resolve GitHub from its shell, so builds
requiring downloads must run through the connected GitHub workflow. Inspect its
actual results before treating the kit/hosts as available.

M1.2 remains **build-validation pending** until all required build artifacts are
verified. M1.3/M1.4 and every GUI acceptance case remain unstarted. If a host build
fails, diagnose that concrete failure; do not claim a ready Windows experiment or
ask the user to install a partial/broken host. Do not reopen M0's latest-target
policy or merge the old launcher. M2 recovery and M3 sizes remain independent.

Sources: pinned VS Code source/agent instructions and its current contributor
build guide (`https://github.com/microsoft/vscode/wiki/How-to-Contribute`), plus
Microsoft's `RegisterHotKey` contract (`https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey`).
