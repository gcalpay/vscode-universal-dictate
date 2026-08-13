# Universal Dictate — Agent Guidance

This file contains stable repository-wide instructions for coding agents and future ChatGPT/Codex sessions. Keep issue-specific execution detail out of this file; use the linked planning and implementation-log documents instead.

## Project scope

- Universal Dictate is a VS Code Marketplace extension for local/offline dictation on Windows.
- Remote - WSL is a supported workspace scenario; the extension runs in the local Windows UI extension host.
- The product goal is dictation across VS Code editors and extension/input surfaces such as Codex/agent/chat composers.
- Do not start or design a standalone desktop application while the VS Code extension remains the active product.
- Do not claim Linux or macOS desktop support unless it is actually implemented and tested.

## Safety and behavioral invariants

- Dictated text is inserted for review only and must never be submitted or sent automatically.
- Preserve deliberate user retargeting while recording: if the user intentionally focuses another editable target, that later target wins.
- Do not introduce UI Automation/MSAA focus tracking, mouse hooks, click replay, accessibility-setting changes, focus-restoration hacks, or synthesized Enter unless a future issue explicitly reopens and justifies such approaches.
- Avoid unrelated refactors, speculative hardening, new dependencies, or feature work outside the active issue.

## Git and review workflow

- Never implement directly on `main`.
- Use one feature branch per coherent PR/workstream, not one branch per tiny chunk and not one giant branch spanning unrelated repositories or long external waits.
- Make coherent commits at reviewable chunk boundaries when practical.
- Review the branch against its base after each meaningful chunk and perform a formal milestone review before opening a PR.
- Stop after each milestone and require maintainer approval before proceeding to the next milestone/workstream.
- PR creation and merge are separate gates. Do not automatically open or merge a PR merely because implementation finished.
- Before merge, inspect the actual PR diff and CI/check status.
- Web/connector work writes directly to remote branches; do not describe it as a local `commit`/`push` workflow.

## Automatic PR handoff

- `gcalpay-automation` is a machine account and must be used only through automation, not as a manually operated secondary human account.
- Automation credentials must never be committed to the repository. The current repository secret is `AUTOMATION_BOT_TOKEN`; keep its permissions narrowly scoped.
- The maintainer account `gcalpay` remains responsible for human review, formal approval, merge, and release decisions.
- After a milestone/workstream has passed branch review and the maintainer explicitly approves handoff, make the final state/bookkeeping commit on the feature branch with a subject ending exactly in ` [automation-handoff]`.
- That final approved commit must leave the plan/log current before triggering handoff. Example: `Map VS Code status-bar path [automation-handoff]`.
- The push marker triggers `.github/workflows/automation-open-pr.yml`. The workflow acts as `gcalpay-automation`, appends its own handoff record, opens the PR, and requests review from `gcalpay`.
- Do not add the marker before maintainer approval and do not manually open a duplicate PR after using it.
- Manual `workflow_dispatch` remains a fallback only if the automatic marker path cannot be used.
- Bot-authored bookkeeping pushes must not trigger another handoff; the workflow is restricted to pushes by `gcalpay`.

## Persistent state and fresh-session recovery

- Before starting Issue #38 work, read this file, then the implementation plan, then the implementation log.
- At the beginning of a fresh session, verify current `main`, open PRs, and the branch named by the active work before editing anything; repository state can move after documentation was written.
- Before any milestone stop or chat handoff, ensure the plan states the current phase/chunk, last completed work, exact next action, and blockers.
- Record durable results, branches, commits, PRs, CI/tests, decisions, and deviations in the implementation log.
- Prefer state wording that remains useful after a PR merge. Do not leave a fresh-session agent dependent on conversation-only context.

## Testing and release

- Use automated checks after implementation chunks where practical.
- Real Windows VS Code UI/focus behavior must be validated on the maintainer's actual Windows desktop when required; GitHub/web environments cannot substitute for that test.
- Proposed VS Code APIs may be tested only in isolated development environments and must not be shipped in Marketplace builds.
- Do not bump versions or publish a release unless the active plan explicitly reaches a release milestone and the maintainer approves it.

## Active Issue #38 documents

Before doing any work on Issue #38, read both documents in full:

- [`docs/issue-38-implementation-plan.md`](docs/issue-38-implementation-plan.md) — source of truth for remaining milestones, chunks, gates, blockers, and next action.
- [`docs/issue-38-implementation-log.md`](docs/issue-38-implementation-log.md) — source of truth for completed work, branches, commits, reviews, tests, decisions, and deviations.

For Issue #38, update the plan when future work or current state changes materially, and append to the log when a chunk/milestone produces durable results. Do not duplicate the complete Issue #38 roadmap in this file.
