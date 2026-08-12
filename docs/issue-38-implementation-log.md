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

Change:

- Added root `AGENTS.md` with stable repository-wide agent rules.
- `AGENTS.md` points Issue #38 work to the living implementation plan and this implementation log rather than duplicating the milestone roadmap.
- It records branch/review gates, Windows UI testing requirements, release constraints, behavioral invariants, and the rule that `gcalpay-automation` is used only through automation.

Commit:

- `369168a82473cc5672b025517c127b83437f0229` — add repository agent guidance.

### Automation workflow

Status: pending

Planned next step:

- Set up a narrowly scoped automated path for `gcalpay-automation` to perform legitimate machine-account work such as milestone bookkeeping and PR creation without manual login/use of the bot identity.
- Do not commit machine-account credentials; store them as appropriate repository secrets or use a GitHub App.

## Durable decisions

- The clean Issue #38 path depends on an upstream VS Code capability; end users must never be required to install a custom VS Code fork.
- A VS Code fork, if used, is only a development/test vehicle for an upstream contribution to `microsoft/vscode`.
- If the required upstream API is declined and no safe public-API alternative exists, treat that as a blocker rather than shipping unsafe focus-tracking workarounds.
- Candidate API shape remains `StatusBarItem.preserveFocus?: boolean`, subject to upstream design review.
- Pointer-induced focus should be prevented before command activation rather than restored afterward.
- Keyboard navigation/Enter/Space behavior must remain unchanged.
- Deliberate user retargeting during recording remains authoritative.
- Proposed VS Code APIs must never be shipped in a Marketplace build.
