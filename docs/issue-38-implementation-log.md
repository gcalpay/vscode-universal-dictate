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

Status: workflow definition added; credential/bootstrap validation pending

Changes:

- Added `.github/workflows/automation-open-pr.yml`.
- The workflow is manual (`workflow_dispatch`) and the job runs only when triggered by `gcalpay`.
- It validates branch names and refuses handoff from `main` or from the selected base branch.
- It checks out the selected feature branch using `AUTOMATION_BOT_TOKEN` and verifies via the GitHub API that the token belongs to `gcalpay-automation`.
- It refuses to create a duplicate open PR for the same head/base pair.
- It appends an automated handoff record to this log, commits it as `gcalpay-automation [bot] <bot@alpay.de>`, and pushes that bookkeeping commit to the feature branch.
- It opens the PR using the machine-account token and requests review from `gcalpay`.

Commit:

- `d42fd6369eb15bf93386c0142fc85456db51b5c5` — add automation account PR workflow.

Credential decision:

- `gcalpay-automation` is a collaborator on the personal-account-owned public repository. GitHub currently lists collaborator repositories as a limitation of fine-grained personal access tokens.
- To preserve the `gcalpay-automation` machine-user identity for this public repository, the planned credential is therefore a classic PAT with the `public_repo` scope only, stored as the repository Actions secret `AUTOMATION_BOT_TOKEN`.
- Do not use the broader `repo` scope for this public-only workflow.

Bootstrap constraint:

- A manually dispatched workflow must already exist on the default branch before it can be run from GitHub Actions.
- Therefore this workflow cannot open the PR that introduces itself. The first infrastructure PR requires a one-time bootstrap merge path; after the workflow reaches `main`, future milestone PRs can be opened by `gcalpay-automation` automatically.

Next validation:

- Create the machine-account classic PAT with `public_repo` only.
- Store it as the `AUTOMATION_BOT_TOKEN` Actions secret in `gcalpay/vscode-universal-dictate`.
- Bootstrap and merge the infrastructure PR, then run the workflow on a subsequent feature branch to verify bot-authored bookkeeping, PR authorship, reviewer request, CI triggering, and contributor attribution.

## Durable decisions

- The clean Issue #38 path depends on an upstream VS Code capability; end users must never be required to install a custom VS Code fork.
- A VS Code fork, if used, is only a development/test vehicle for an upstream contribution to `microsoft/vscode`.
- If the required upstream API is declined and no safe public-API alternative exists, treat that as a blocker rather than shipping unsafe focus-tracking workarounds.
- Candidate API shape remains `StatusBarItem.preserveFocus?: boolean`, subject to upstream design review.
- Pointer-induced focus should be prevented before command activation rather than restored afterward.
- Keyboard navigation/Enter/Space behavior must remain unchanged.
- Deliberate user retargeting during recording remains authoritative.
- Proposed VS Code APIs must never be shipped in a Marketplace build.

### Automated PR handoff — 2026-08-13T00:22:12Z

- Automation account: `gcalpay-automation`
- Head: `chore/automation-handoff-validation`
- Base: `main`
- Triggered by maintainer: `gcalpay`
