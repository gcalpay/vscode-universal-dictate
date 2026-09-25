# Agent guidance

Read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md)
before continuing reliability or overlay work. Its 2026-09-25 reassessment is the
current implementation order, replacing older experimental-branch handoffs.

- The next recommended product task is M3 Small/Medium/Large visualization sizes,
  then M2 transcript/clipboard reliability. M1 focus research is independent and
  is not a prerequisite. Do not restart M0 or repair Code OSS during sizing work.
- Product changes start from the current `main` on a focused feature branch. Keep
  `docs/dictation-reliability-plan` documentation-only. If main lacks these docs,
  carry only the updated plan and this file into the authorized feature branch.
- Keep `fix/preserve-insertion-target` frozen. Do not merge its launcher or the
  `experiment/m1.2-statusbar-focus-probe` diagnostic into product work. Consult
  the pinned historical links in the plan only when relevant.
- Inspect local work and refs first; never reset, stash or overwrite unrelated
  changes. Keep Git writes, installs and build dispatches within session approval.
  A planned milestone does not authorize all subsequent milestones or a release.
- Follow the latest deliberately selected input/caret/selection through
  transcription. No automatic submission. Recovery or a different launcher is
  not evidence that the genuine status-bar Issue #38 is fixed.
- Make small testable changes and run proportionate checks. Update the plan's
  ledger after each implementation chunk, distinguishing specified, implemented,
  built and GUI-validated. Never claim real Windows/Codex results from mocks.
- On completion or explicit retirement, preserve lasting behavior/tests/limits
  in regular project docs/issues; remove the temporary plan and its pointer
  together, without deleting unrelated agent guidance.
