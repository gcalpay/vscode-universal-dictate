# Agent guidance

Read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md)
before reliability, overlay, live-transcript or translation work. The 2026-09-25
expanded roadmap is the current work order, replacing experimental handoffs.

- Recommended product order: M3 sizes, M2 recovery/clipboard/lifecycle, M5 live
  preview, then optional M6 translation. M1 focus research is independent; apply
  M4 validation to each candidate. Keep IDs; do not restart M0.
- Next bounded implementation is M3 only unless the user changes priority.
  Do not fix Code OSS builds or add live decoding during a size-layout change.
- Product branches start from current main. After review and authorized merge,
  branch the next feature from updated main. Keep the planning branch docs-only.
  Carry only this file and the current plan when main lacks them; reconcile any
  newer local progress rather than overwriting its ledger.
- Leave `fix/preserve-insertion-target` frozen. Keep the M1.2 diagnostic on its
  separate experimental branch. Neither belongs in ordinary product packaging.
- Inspect local changes/refs first. Never reset, clean, stash or overwrite unrelated
  work. Keep Git writes, installs and build dispatches within session approval.
  A roadmap is not authorization to implement every milestone, merge or publish.
- Preserve latest deliberate input/caret/selection through final processing and
  never auto-submit. Preview v1 is provisional text in the overlay, not repeated
  pastes into the target. Recovery and alternatives do not prove #38 fixed.
- Translation is optional: confirm output-language/backend scope before M6.
  Built-in Whisper translation to English is not arbitrary-language translation.
  Do not add a cloud dependency or change recording defaults silently.
- Make bounded testable changes. Record source/build evidence separately from real
  Windows/Codex observations. Update the plan after each implementation chunk;
  do not convert unrun acceptance cases into passes from mocks or compilation.
- After completion or explicit retirement, preserve durable behavior/tests/limits
  in regular docs/issues and remove the temporary plan and pointer together.
  Preserve unrelated agent guidance and unresolved evidence.
