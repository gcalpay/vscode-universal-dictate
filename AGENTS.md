# Agent guidance

## Active implementation plan

Before planning, implementing or resuming dictation-reliability or overlay work,
read [docs/DICTATION_RELIABILITY_PLAN.md](docs/DICTATION_RELIABILITY_PLAN.md).
It records the baseline, decisions, milestone status, acceptance tests and next
step so work can continue across chats and tasks.

- Start new implementation work from the current `main`, not the frozen
  `fix/preserve-insertion-target` experiment. Verify refs before changing them.
- Keep changes within the user's current authorization. A planned milestone is
  not authorization to implement, merge or publish it.
- Update the plan's progress and handoff section with each milestone change.
  Distinguish specified, implemented, tested and blocked work. Record actual
  evidence; compilation alone does not establish GUI focus correctness.
- Keep runtime changes separate from this documentation-only planning branch.
- When the plan is completed or explicitly retired, move enduring behavior,
  tests and known limitations into the regular project documentation. Remove
  the temporary plan and its references here together; preserve unrelated
  guidance added to this file in the meantime.
