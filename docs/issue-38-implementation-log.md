# Issue #38 — Implementation Log

This document records completed work and durable findings for Issue #38. It is intentionally backward-looking. For remaining work and the current next action, see [`issue-38-implementation-plan.md`](issue-38-implementation-plan.md).

## Baseline

- Repository: `gcalpay/vscode-universal-dictate`
- Issue: #38 — Preserve insertion target when starting dictation from the status bar
- Initial Issue #38 baseline `main`: `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`
- Baseline/current extension version during this work: `0.1.5`
- Product scope: Windows VS Code extension; Remote - WSL is a supported workspace scenario.

## Milestone 0 — Baseline and wording

Status: completed.

Branch: `docs/issue-38-platform-wording`.

Results:

- README/package positioning changed to: `Local, offline dictation across VS Code inputs on Windows, including WSL workspaces.`
- Added the forward-looking Issue #38 implementation plan.
- No source/native/runtime/version/release behavior changed.
- Maintainer reviewed and approved the branch.

Selected commits:

- `dbc2544d784c6d431ab48d9ef21699dcbc3686a2` — documentation wording and initial plan.
- `8382be8d782b7c03d7d2a80aeb5b73d17feae83d` — mark Milestone 0 complete.

## Workflow infrastructure before Milestone 1

### Repository agent guidance and persistent state

Status: completed.

- Added root `AGENTS.md` with stable repository-wide agent rules.
- Added this implementation log as the backward-looking source of truth.
- Kept the detailed forward roadmap in `docs/issue-38-implementation-plan.md`.

Selected commits:

- `369168a82473cc5672b025517c127b83437f0229` — add repository agent guidance.
- `0afdc456ea66af1ddcd26ff6ad50519690b744e0` — add Issue #38 implementation log.
- `6a8b1282b6735cb4a88bc0ca360e4c3abc74956c` — record workflow-infrastructure phase in the plan.

### Automation-account workflow bootstrap

Status: completed.

- Added `.github/workflows/automation-open-pr.yml`.
- `gcalpay-automation` is a machine account and is not manually operated.
- Repository secret: `AUTOMATION_BOT_TOKEN`.
- Credential: classic PAT with `public_repo` only for this public repository.
- Workflow verifies the token identity is exactly `gcalpay-automation`.
- Bot commits use `gcalpay-automation [bot] <315580681+gcalpay-automation@users.noreply.github.com>`.
- Human `gcalpay` retains formal review, approval, merge and release authority.

Bootstrap PR:

- PR #41 — `Bootstrap Issue #38 workflow infrastructure`.
- Merged to `main` as `063e754799b1a80dbc065725a8bd99ef7fb900e0` after CI and Windows packaging passed.

### Manual workflow validation attempt 1

Status: partial success; superseded.

- Workflow run ID `31654172826`.
- Branch: `chore/automation-handoff-validation`.
- Token identity check succeeded.
- Bot bookkeeping commit `977fb34` was pushed.
- PR #42 was created by `gcalpay-automation`.
- `gh pr create` then queried extra GraphQL fields requiring `read:org`, causing the step to fail before reviewer request.
- PR #42 was closed without merge.

Resolution:

- Do not broaden the PAT to satisfy unrelated GitHub CLI GraphQL queries.
- Switched PR creation and reviewer request to direct REST API calls.
- Repair PR #43 merged to `main` as `82a20716ca479763fc33c683c81bf4aec387483c` after CI and Windows packaging passed.

### Manual workflow validation attempt 2

Status: complete success.

- Workflow run ID `31654821705`.
- Branch: `chore/automation-handoff-validation-2`.
- Bot bookkeeping commit: `aba3816c5b6983bd2da8b435c0463d89babd16c6`.
- PR #44 opened by `gcalpay-automation`.
- `gcalpay` was requested as reviewer.
- CI passed.
- `gcalpay` submitted formal `APPROVED` review.
- PR #44 was merged with normal merge commit `92e8250f4015e34f831bf0979e621457aa1735ed` so the original bot-authored commit remained in `main` history.
- GitHub attributes author and committer of `aba3816...` to `gcalpay-automation`.

Result: manual `workflow_dispatch` fallback is validated end to end.

### Documentation-state handoff

- Branch `docs/issue-38-workflow-validation` updated the plan/log after manual validation.
- Bot opened PR #45 — `Record validated automation workflow`.
- `gcalpay` formally approved it.
- PR #45 merged to `main` as `23ebc2c9c966863ff948c976fc6f81fff8145109`.

## Automatic handoff and repository documentation refresh

Status: completed and merged.

Branch:

- `chore/automatic-handoff-and-docs-refresh`
- Base: `main` at `23ebc2c9c966863ff948c976fc6f81fff8145109`.

Purpose:

- Remove the need for the maintainer to visit Actions for every normal handoff.
- Keep `workflow_dispatch` only as fallback.
- Refresh repository Markdown so a fresh session can recover the exact shipped runtime, Issue #38 state and next action without relying on conversation history.

### Implementation/documentation commits

- `79fb5087e509b74978d9e5703abe538a2986c7c9` — `Add automatic automation handoff trigger`.
  - Adds push trigger for non-`main` branches.
  - Automatic job requires `github.actor == 'gcalpay'` and a head commit subject ending in ` [automation-handoff]`.
  - PR base is `main`; title derives from the marker commit subject.
  - Bot bookkeeping pushes cannot loop because their actor is `gcalpay-automation`.
- `cc7cfebcdd251c2c01f201b018a60eda113ef637` — `Refresh current product documentation`.
  - Updated README manual-VSIX wording.
  - Replaced stale early-MVP/pre-release descriptions in architecture, implementation notes, MVP, status-bar and testing docs with the current 0.1.5 runtime and Issue #38 limitation.
- `e71774f541e929094cb17ff8e1d725588cf6777b` — `Remove obsolete pull request note`.
  - Deleted stale `docs/PR_NOTE.md`.
- `b9ca3ac74c768446346d78a01db6e3ab0782a649` — `Harden automatic handoff request parsing`.
  - Explicitly distinguishes push from manual dispatch.
  - Makes manual fallback PR-body output multiline-safe.
- `f7cb200e5ba6b5c9a033b019eb1af80dac3c5e69` — `Fix automatic handoff PR title derivation`.
  - Replaced Bash glob-style suffix removal with literal string-length slicing.

### Repository-wide Markdown audit

A recursive repository-tree inventory was used, not only `docs/`.

After deleting `docs/PR_NOTE.md`, the intended tracked Markdown set is 13 files:

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

`CHANGELOG.md`, `SUPPORT.md`, `THIRD_PARTY_NOTICES.md` and `docs/DEPENDENCIES.md` were inspected and left unchanged because their current statements remain factual. The stale runtime/status/testing/install documents were refreshed.

### Automatic-trigger validation attempt 1

Status: trigger path worked; one acceptance defect found.

- Maintainer approved the branch gate.
- Marker commit `2ec5f9f9366f3f197761c03466e0cb5faa13f9db` — `Validate automatic handoff and docs refresh [automation-handoff]`.
- Push automatically started workflow run `31662552028`; no manual Actions dispatch was used.
- Bot appended bookkeeping commit `3df088444a264272213d806f9119a798242de7dd`.
- Bot opened PR #46 and requested `gcalpay` as reviewer.
- Defect: PR title still contained literal `[automation-handoff]`.
- Cause: Bash `${first_line%$marker}` interpreted the brackets as pattern syntax.
- PR #46 closed without merge.
- Title derivation fixed in `f7cb200e...`.

### Automatic-trigger validation attempt 2

Status: complete success.

- Branch was re-reviewed after the title fix and the maintainer explicitly approved the retest.
- Marker commit: `0a79fbaf2d52483d5ff3f29b55c69b5667e266d9` — `Validate automatic handoff title fix [automation-handoff]`.
- Push automatically started workflow run `31662910677`.
- Workflow conclusion: success.
- No manual Actions dispatch was used.
- Bot bookkeeping commit: `c28ff006a895aabdaea9c0760c330fb5cea4d2c9` (`Record automated PR handoff`).
- PR #47 opened automatically by `gcalpay-automation`.
- Generated PR title was clean: `Validate automatic handoff title fix`.
- `gcalpay` was requested as reviewer.
- Typecheck and Windows package checks passed on the final PR head.
- Bot bookkeeping pushes produced skipped handoff jobs, confirming the actor guard prevents recursion.
- `gcalpay` submitted a formal `APPROVED` review on 2026-08-13.
- PR #47 merged to `main` on 2026-08-13 as `608528183a26b299e26eed4564280797cb1a4449`.

Result:

- Normal future handoff requires no manual visit to Actions: reviewed branch → explicit maintainer approval → final marker commit → bot bookkeeping/PR/reviewer request → human review/merge.
- `workflow_dispatch` remains available only as fallback.

## Post-PR-#47 repository verification

Status: completed before the final state-refresh branch was created.

Verified:

- `main` = `608528183a26b299e26eed4564280797cb1a4449` (`Merge pull request #47 ...`).
- No open pull requests.
- PR #47 is merged and its author is `gcalpay-automation`.
- Formal `APPROVED` review by `gcalpay` is recorded.
- The automatic handoff workflow and refreshed documentation are on `main`.
- The recursive tree still contains the intended 13 Markdown files and no obsolete `docs/PR_NOTE.md`.

Remote branch cleanup state before creating `docs/issue-38-post-infrastructure-state`:

- `main` — keep.
- `fix/preserve-insertion-target` — stale baseline branch at `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`; may be deleted.
- `release/0.1.5` — stale release branch at `f2e8722aceada04aba73ca8d4fa87848373ad6ac`; may be deleted.

All other previously listed merged/test/release branches had already been deleted by the maintainer.

## Final post-infrastructure state refresh

Branch: `docs/issue-38-post-infrastructure-state`.

Purpose:

- Correct the two durable Issue #38 state files after PR #47 merged so a fresh session does not see the pre-merge PR #47 gate as current work.
- Set the next implementation work unambiguously to **Milestone 1.1 — Prepare the upstream working repository**.
- Preserve the three-file recovery order: `AGENTS.md` → plan → log.

This branch is documentation/state only. No extension runtime, native code, version, packaging or release behavior is changed.

## Durable Issue #38 decisions

- The clean fix depends on an upstream VS Code capability; end users must never need a custom VS Code fork.
- A `gcalpay/vscode` fork is development/test infrastructure only for an upstream contribution to `microsoft/vscode`.
- Candidate API shape remains `StatusBarItem.preserveFocus?: boolean`, subject to upstream design review.
- Pointer-induced focus movement should be prevented before command activation, not restored afterward.
- Keyboard navigation and Enter/Space behavior must remain unchanged.
- Deliberate user retargeting while recording remains authoritative.
- No UI Automation/MSAA focus tracking, mouse hooks, click replay, accessibility-setting changes, focus-restoration hacks or synthesized Enter.
- Proposed VS Code APIs must never ship in Marketplace builds.
- If upstream declines the required capability and no safe stable public alternative exists, leave Issue #38 blocked/open rather than reviving unsafe hacks.

## Fresh-session recovery

- Read `AGENTS.md` → implementation plan → this log.
- Verify current `main`, open PRs and branches before editing anything.
- If `docs/issue-38-post-infrastructure-state` or its bot-opened PR is still active, finish that documentation-only review/merge gate first.
- If that state-refresh PR is already merged, begin Milestone 1.1 immediately. Do not repeat the automation setup, Markdown audit or PR #47 validation.
- The old Universal Dictate branches `fix/preserve-insertion-target` and `release/0.1.5`, if still present, are cleanup only and are not the active Issue #38 implementation branch.
