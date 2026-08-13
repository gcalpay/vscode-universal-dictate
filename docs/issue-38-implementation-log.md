# Issue #38 — Implementation Log

This document records completed work and durable findings for Issue #38. It is intentionally backward-looking. For remaining work and the current next action, see [`issue-38-implementation-plan.md`](issue-38-implementation-plan.md).

## Baseline

- Repository: `gcalpay/vscode-universal-dictate`
- Issue: #38 — Preserve insertion target when starting dictation from the status bar
- Baseline `main`: `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`
- Baseline extension version: `0.1.5`
- Product scope: Windows VS Code extension; Remote - WSL is a supported workspace scenario.

## Milestone 0 — Baseline and wording

### 0.1 Baseline verification

Status: completed

Findings:

- `main` baseline was `f0265bc4398643c3b3a27e6d2ad64183b115b6ba` (`Refine release workflow`).
- Extension version was `0.1.5`.
- No open pull request was active when Milestone 0 began.
- Existing README/package positioning described Windows support and Remote-WSL separately.

### 0.2 Documentation wording

Status: completed

Branch:

- `docs/issue-38-platform-wording`

Changes:

- README opening changed to: `Local, offline dictation across VS Code inputs on Windows, including WSL workspaces.`
- Marketplace-facing `package.json` description changed to the same positioning.
- Added `docs/issue-38-implementation-plan.md` as the forward-looking source of truth for Issue #38.

Commits:

- `dbc2544d784c6d431ab48d9ef21699dcbc3686a2` — documentation wording and initial Issue #38 plan.
- `8382be8d782b7c03d7d2a80aeb5b73d17feae83d` — mark Milestone 0 complete after branch review.

Review result:

- Milestone 0 branch review against `main` passed.
- At the Milestone 0 gate, only `README.md`, `package.json`, and `docs/issue-38-implementation-plan.md` differed from `main`.
- No source, native, CI, version, packaging, or release behavior changed.
- No implementation tests were required.
- Maintainer approved Milestone 0 before further work.

## Workflow infrastructure before Milestone 1

### Repository agent guidance

Status: completed

Changes:

- Added root `AGENTS.md` with stable repository-wide agent rules.
- `AGENTS.md` points Issue #38 work to the living implementation plan and this implementation log rather than duplicating the milestone roadmap.
- It records branch/review gates, Windows UI testing requirements, release constraints, behavioral invariants, and the rule that `gcalpay-automation` is used only through automation.
- Added this backward-looking implementation log so future chats/agents can recover completed work without reconstructing a separate handoff.

Commits:

- `369168a82473cc5672b025517c127b83437f0229` — add repository agent guidance.
- `0afdc456ea66af1ddcd26ff6ad50519690b744e0` — add Issue #38 implementation log.
- `6a8b1282b6735cb4a88bc0ca360e4c3abc74956c` — record the workflow-infrastructure phase in the living plan.

### Automation workflow

Status: completed and validated end to end for the manual fallback path

Changes:

- Added `.github/workflows/automation-open-pr.yml`.
- The initial workflow was manual (`workflow_dispatch`) and restricted to `gcalpay`.
- It validates branch names and refuses handoff from `main` or from the selected base branch.
- It checks out the selected feature branch using `AUTOMATION_BOT_TOKEN` and verifies via the GitHub API that the token belongs to `gcalpay-automation`.
- It refuses to create a duplicate open PR for the same head/base pair.
- It appends an automated handoff record to this log, commits it as `gcalpay-automation [bot] <315580681+gcalpay-automation@users.noreply.github.com>`, and pushes that bookkeeping commit to the feature branch.
- It opens the PR using the machine-account token and requests review from `gcalpay`.
- PR creation and reviewer requests use direct GitHub REST API calls so the classic PAT can remain limited to `public_repo`.

Bootstrap:

- PR #41 (`Bootstrap Issue #38 workflow infrastructure`) was merged to `main` as `063e754799b1a80dbc065725a8bd99ef7fb900e0`.
- CI and Windows packaging passed before merge.

Credential decision:

- `gcalpay-automation` is a collaborator on the personal-account-owned public repository.
- To preserve the machine-user identity for this public repository, the credential is a classic PAT with the `public_repo` scope only, stored as the repository Actions secret `AUTOMATION_BOT_TOKEN`.
- Do not use the broader `repo` scope for this public-only workflow.

### Validation attempt 1

Status: partial success

Run:

- Workflow run #1 / run ID `31654172826` on 2026-08-13.
- Validation branch: `chore/automation-handoff-validation`.

Passed:

- Request validation.
- Checkout using `AUTOMATION_BOT_TOKEN`.
- Token identity verification confirmed `gcalpay-automation`.
- Duplicate-PR guard.
- Automated bookkeeping commit and push.
- Bot-authored commit `977fb34` (`Record automated PR handoff`) was pushed to the validation branch.
- PR #42 (`Validate automation PR handoff`) was successfully created by `gcalpay-automation`.

Failed:

- After PR creation, `gh pr create` queried additional GraphQL fields requiring `read:org` and returned an error.
- Because the step stopped on that error, the subsequent reviewer-request command did not run.
- PR #42 therefore existed and passed normal CI, but `gcalpay` was not requested as reviewer.

Resolution:

- Do not broaden the bot PAT merely to satisfy extra GitHub CLI GraphQL queries.
- Replace `gh pr create` / `gh pr edit` with direct GitHub REST API calls for PR creation and reviewer request.
- PR #42 was closed without merge.
- Repair branch `fix/automation-pr-rest-api` became PR #43 and was merged to `main` as `82a20716ca479763fc33c683c81bf4aec387483c` after CI and Windows packaging passed.

### Validation attempt 2

Status: complete success

Run:

- Workflow run #2 / run ID `31654821705` on 2026-08-13.
- Validation branch: `chore/automation-handoff-validation-2`.
- Workflow conclusion: success.

Verified:

- Token identity: `gcalpay-automation`.
- Bot-authored commit: `aba3816c5b6983bd2da8b435c0463d89babd16c6` (`Record automated PR handoff`).
- PR #44 (`Validate automation PR handoff after REST fix`) was opened by `gcalpay-automation`.
- `gcalpay` was requested as reviewer.
- CI passed.
- `gcalpay` submitted a formal `APPROVED` review.
- PR #44 was merged with a normal merge commit (`92e8250f4015e34f831bf0979e621457aa1735ed`) rather than squashed so the original bot-authored commit remained in `main` history.
- GitHub attributes both author and committer of `aba3816c5b6983bd2da8b435c0463d89babd16c6` to `gcalpay-automation`.
- The bot-authored commit is an ancestor of `main`.

Result:

- Manual fallback handoff is validated: maintainer triggers workflow → bot records handoff and commits → bot opens PR → maintainer reviews/approves → maintainer merges.

### Documentation-state handoff

- Branch `docs/issue-38-workflow-validation` updated the plan/log after the successful validation.
- The bot added its handoff record and opened PR #45 (`Record validated automation workflow`).
- `gcalpay` submitted a formal `APPROVED` review on 2026-08-13.
- PR #45 was merged to `main` as `23ebc2c9c966863ff948c976fc6f81fff8145109`.

## Automatic handoff and repository documentation refresh

Status: branch review passed and maintainer approved handoff; automatic-trigger validation and merge pending

Branch:

- `chore/automatic-handoff-and-docs-refresh`
- Base: `main` at `23ebc2c9c966863ff948c976fc6f81fff8145109`.

Purpose:

- Remove the need for the maintainer to visit Actions for every normal handoff.
- Make repository Markdown accurately describe the shipped 0.1.5 runtime and active Issue #38 state.
- Make a fresh chat/session able to recover the exact current state and next action from repository files alone.

Completed commits before the Issue #38 state update:

- `79fb5087e509b74978d9e5703abe538a2986c7c9` — `Add automatic automation handoff trigger`.
  - Adds a non-`main` `push` trigger alongside `workflow_dispatch`.
  - Automatic mode runs only when `github.actor == 'gcalpay'` and the head commit subject ends in ` [automation-handoff]`.
  - The PR title is derived from the marker commit subject; the base is `main`.
  - Bot bookkeeping pushes cannot loop because the actor is `gcalpay-automation`, not `gcalpay`.
  - `workflow_dispatch` remains a manual fallback.
  - `AGENTS.md` documents the approval gate, marker convention and fresh-session recovery order.
- `cc7cfebcdd251c2c01f201b018a60eda113ef637` — `Refresh current product documentation`.
  - Updates README manual-VSIX wording so it no longer falsely implies the latest Marketplace build must exist as a GitHub Release.
  - Rewrites stale pre-release/MVP descriptions in `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_NOTES.md`, `docs/MVP.md`, `docs/STATUS_BAR_BUTTON.md` and `docs/TESTING.md` to describe the current runtime, Enhanced overlay, warm `whisper-server`, clickable status item and Issue #38 limitation.
- `e71774f541e929094cb17ff8e1d725588cf6777b` — `Remove obsolete pull request note`.
  - Deletes stale one-line `docs/PR_NOTE.md`.
- `b9ca3ac74c768446346d78a01db6e3ab0782a649` — `Harden automatic handoff request parsing`.
  - Makes the job condition explicitly distinguish push events from manual dispatch.
  - Uses multiline-safe `$GITHUB_OUTPUT` syntax for PR bodies so the manual fallback remains robust.

Markdown audit:

- A recursive repository-tree inventory was used, not only the `docs/` directory.
- After removing `docs/PR_NOTE.md`, the branch contains 13 tracked Markdown files:
  - `AGENTS.md`
  - `CHANGELOG.md`
  - `README.md`
  - `SUPPORT.md`
  - `THIRD_PARTY_NOTICES.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DEPENDENCIES.md`
  - `docs/IMPLEMENTATION_NOTES.md`
  - `docs/MVP.md`
  - `docs/STATUS_BAR_BUTTON.md`
  - `docs/TESTING.md`
  - `docs/issue-38-implementation-log.md`
  - `docs/issue-38-implementation-plan.md`
- `CHANGELOG.md`, `SUPPORT.md`, `THIRD_PARTY_NOTICES.md` and `docs/DEPENDENCIES.md` were reviewed and left unchanged because their current claims remain factual.
- `AGENTS.md`, README and the stale runtime/status/testing documents were updated.
- The Issue #38 plan/log are updated on this branch so the branch can be resumed without conversation context.

Branch review and approval:

- Complete branch diff was reviewed against `main`; only the intended workflow/documentation changes and removal of obsolete `docs/PR_NOTE.md` are present.
- No TypeScript runtime, native C++, extension version, Whisper runtime or release behavior changed.
- Non-marker pushes by `gcalpay` produced skipped `Automation PR Handoff` runs as intended.
- The workflow cannot automatically hand off `main` because `main` is excluded from the push trigger.
- Bot bookkeeping pushes cannot retrigger automatic handoff because the job requires `github.actor == 'gcalpay'`.
- The maintainer explicitly approved this mini-milestone handoff on 2026-08-13.
- Next action: create the final approved commit whose subject ends exactly in ` [automation-handoff]`, then verify the workflow opens the PR automatically and requests `gcalpay` as reviewer.

Fresh-session recovery state:

- Read `AGENTS.md` → plan → log.
- Verify `main`, open PRs and whether `chore/automatic-handoff-and-docs-refresh` has merged.
- If not merged, the branch gate is already approved; verify whether the automatic marker commit/PR exists and continue automatic-trigger validation rather than asking for approval again.
- If already merged, begin Issue #38 Milestone 1.1; do not redo this infrastructure cleanup.

## Durable decisions

- The clean Issue #38 path depends on an upstream VS Code capability; end users must never be required to install a custom VS Code fork.
- A VS Code fork, if used, is only a development/test vehicle for an upstream contribution to `microsoft/vscode`.
- If the required upstream API is declined and no safe public-API alternative exists, treat that as a blocker rather than shipping unsafe focus-tracking workarounds.
- Candidate API shape remains `StatusBarItem.preserveFocus?: boolean`, subject to upstream design review.
- Pointer-induced focus should be prevented before command activation rather than restored afterward.
- Keyboard navigation/Enter/Space behavior must remain unchanged.
- Deliberate user retargeting during recording remains authoritative.
- Proposed VS Code APIs must never be shipped in a Marketplace build.
- Automatic handoff is approval-gated. The marker is added only after a reviewed branch receives explicit maintainer approval.

### Automated PR handoff — 2026-08-13T00:55:19Z

- Automation account: `gcalpay-automation`
- Head: `docs/issue-38-workflow-validation`
- Base: `main`
- Triggered by maintainer: `gcalpay`
