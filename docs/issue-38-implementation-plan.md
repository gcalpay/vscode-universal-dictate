# Issue #38 — Implementation Plan

## Current state

- Active repository: `gcalpay/vscode-universal-dictate`.
- Current extension version: `0.1.5`.
- Current implementation milestone: **Milestone 1 — Map the upstream VS Code implementation**.
- Current implementation chunk: **1.1 Prepare the upstream working repository**.
- Last completed implementation/infrastructure work: PR #47 (`Validate automatic handoff title fix`) was formally approved by `gcalpay` and merged to `main` as `608528183a26b299e26eed4564280797cb1a4449` on 2026-08-13.
- The automatic PR handoff is now validated end to end: after a reviewed branch is explicitly approved, a final commit whose subject ends in ` [automation-handoff]` automatically causes `gcalpay-automation` to add its bookkeeping commit, open the PR and request `gcalpay` as reviewer. Manual `workflow_dispatch` remains fallback only.
- The repository-wide Markdown audit and runtime/documentation refresh are complete.
- At the post-PR-#47 verification point there were no open PRs. Before creation of this state-refresh branch, the only remote branches left were `main`, stale `fix/preserve-insertion-target`, and stale `release/0.1.5`.
- This document is being finalized on the docs-only branch `docs/issue-38-post-infrastructure-state`. If that branch/its PR is still open in a fresh session, finish that documentation handoff first. If it has already merged, begin Milestone 1.1 immediately.
- Blockers: none.

### Exact next action for a fresh session

1. Read `AGENTS.md`, this plan, then `docs/issue-38-implementation-log.md` in that order.
2. Verify the actual current `main`, open PRs and remote branches before editing anything.
3. If `docs/issue-38-post-infrastructure-state` or its bot-opened PR is still active, inspect its final diff/checks and finish the normal human review/merge gate. Do not start Milestone 1 in parallel with that state-only PR.
4. If the state-refresh PR is already merged, begin **Milestone 1.1**:
   - verify whether the development fork `gcalpay/vscode` exists and is usable;
   - sync/verify it against the current relevant `microsoft/vscode` upstream base;
   - record the exact upstream base SHA;
   - create a dedicated Issue #38 upstream feature branch;
   - make no broad prototype/API implementation changes yet.
5. The two remaining historical Universal Dictate branches `fix/preserve-insertion-target` and `release/0.1.5` are not inputs to Issue #38 and may be deleted if they still exist.

## Working rules

- Never implement directly on `main`.
- Use one feature branch per coherent PR/workstream, not one branch per tiny chunk and not one giant branch spanning unrelated repositories or long external waits.
- Make coherent commits at reviewable chunk boundaries when practical.
- Perform a lightweight review after each meaningful chunk and a formal milestone review before PR handoff.
- Stop after each milestone and require maintainer approval before proceeding to the next milestone/workstream.
- PR opening and merge are separate gates. Before merge, inspect the actual PR diff and current CI/check status.
- `gcalpay-automation` is a machine account and must be used only through automation, not manual operation.
- After an approved gate, the normal PR handoff is a final commit whose subject ends exactly in ` [automation-handoff]`; manual `workflow_dispatch` is fallback only.
- If a branch changes materially after approval and before handoff, re-review it and obtain fresh maintainer approval before adding another marker.
- Web/connector work writes directly to remote branches; do not describe it as a local `git commit && git push` workflow.
- Keep proposed VS Code API work out of Marketplace releases.
- Use the real Windows VS Code desktop for behavior that cannot be validated in the web/GitHub environment.
- Dictated text must never auto-submit.

## Completed pre-Milestone-1 work

### Milestone 0 — Baseline and wording

- [x] Verify repository state and extension version.
- [x] Clarify product positioning as Windows support with WSL workspaces.
- [x] Add the living Issue #38 implementation plan.
- [x] Review and approve Milestone 0.

### Persistent workflow infrastructure

- [x] Add root `AGENTS.md` with stable repository-wide agent rules.
- [x] Add `docs/issue-38-implementation-log.md` for completed work and durable decisions.
- [x] Add `.github/workflows/automation-open-pr.yml`.
- [x] Keep `gcalpay-automation` automation-only and `gcalpay` responsible for human review, merge and release decisions.
- [x] Keep bot credentials in repository secret `AUTOMATION_BOT_TOKEN` with narrowly scoped `public_repo` access.
- [x] Replace `gh pr` GraphQL PR/reviewer operations with direct REST calls so broader PAT scopes are unnecessary.
- [x] Validate the manual fallback path with workflow run `31654821705` and merged PR #44.

### Automatic handoff and documentation refresh

- [x] Add a non-`main` push trigger alongside `workflow_dispatch`.
- [x] Run automatic handoff only for pushes by `gcalpay` whose head commit subject ends exactly in ` [automation-handoff]`.
- [x] Derive the PR title from the marker commit subject and target `main`.
- [x] Prevent bot bookkeeping pushes from retriggering handoff through the actor restriction.
- [x] Make the manual fallback PR body multiline-safe.
- [x] Document the approval gate, marker convention and fresh-session recovery order in `AGENTS.md`.
- [x] Recursively audit all tracked Markdown, not only `docs/`.
- [x] Refresh stale runtime, UI, testing and installation statements.
- [x] Remove obsolete `docs/PR_NOTE.md`.
- [x] Review `CHANGELOG.md`, `SUPPORT.md`, `THIRD_PARTY_NOTICES.md` and `docs/DEPENDENCIES.md`; leave them unchanged because their current statements remain factual.
- [x] Automatic validation attempt 1 proved the trigger/PR/reviewer path but exposed literal marker retention in PR #46; close #46 without merge.
- [x] Fix literal marker removal in commit `f7cb200e5ba6b5c9a033b019eb1af80dac3c5e69`.
- [x] Re-review the branch and obtain fresh maintainer approval.
- [x] Automatic validation attempt 2: marker commit `0a79fbaf2d52483d5ff3f29b55c69b5667e266d9` triggered workflow run `31662910677` without manual Actions dispatch.
- [x] Bot bookkeeping commit `c28ff006a895aabdaea9c0760c330fb5cea4d2c9` was authored by `gcalpay-automation`.
- [x] PR #47 opened automatically by `gcalpay-automation` with clean title `Validate automatic handoff title fix` and requested `gcalpay` as reviewer.
- [x] Final PR #47 checks passed.
- [x] `gcalpay` submitted a formal `APPROVED` review.
- [x] PR #47 merged to `main` as `608528183a26b299e26eed4564280797cb1a4449`.
- [x] Post-merge verification confirmed no open PRs and the automatic trigger/documentation refresh on `main`.

## Repository housekeeping

Historical feature/test/release branches are not part of the Issue #38 implementation path. Most were deleted after PR #47 merged.

At the post-merge verification point, only these pre-existing Universal Dictate branches remained:

- `main` — keep.
- `fix/preserve-insertion-target` — stale baseline branch at `f0265bc4398643c3b3a27e6d2ad64183b115b6ba`; no active Issue #38 work should occur there; may be deleted.
- `release/0.1.5` — stale release branch at `f2e8722aceada04aba73ca8d4fa87848373ad6ac`; release contents are already superseded by `main`; may be deleted.

The temporary docs branch `docs/issue-38-post-infrastructure-state` should also be deleted after its state-refresh PR merges.

## Milestone 1 — Map the upstream VS Code implementation

### 1.1 Prepare upstream working repository

- [ ] Verify whether `gcalpay/vscode` exists and is the intended fork of `microsoft/vscode`.
- [ ] Verify/sync the fork against the current relevant upstream base; do not assume an old local/fork state is current.
- [ ] Record the exact upstream base commit SHA in the implementation log.
- [ ] Create a dedicated Issue #38 feature branch in the fork.
- [ ] Treat the fork as development/test infrastructure only. End users must continue using official VS Code.
- [ ] Do not implement the API yet in this chunk.

### 1.2 Trace the complete status-bar path

- [ ] Trace the public `StatusBarItem` API declaration through extension-host implementation/RPC, main-thread/status-bar service, `IStatusbarEntry`-style internal data and the workbench renderer.
- [ ] Identify the exact files/interfaces where a focus-preservation flag would have to propagate.
- [ ] Identify the exact pointer/mouse browser event that moves focus into the status-bar item today.
- [ ] Confirm current click semantics and keyboard Enter/Space activation behavior.
- [ ] Record the path in the implementation log before broad changes.

### 1.3 Architecture checkpoint

Re-evaluate the candidate API shape rather than treating its name as fixed:

- candidate: `StatusBarItem.preserveFocus?: boolean`;
- `undefined`/`false`: current behavior remains unchanged;
- `true` + pointer activation: execute the command without the pointer's normal focus move into the status item;
- keyboard navigation and Enter/Space activation remain unchanged;
- do not restore an old focus target after command execution;
- ordinary click semantics and exactly-once command execution must remain intact.

### Milestone 1 gate

- [ ] Complete the propagation-path map.
- [ ] Confirm the exact browser focus event.
- [ ] Confirm candidate semantics/accessibility constraints.
- [ ] Review Milestone 1 findings with the maintainer and stop for explicit approval before implementing the prototype.

## Milestone 2 — Minimal upstream prototype

### 2.1 Implement internal pointer behavior

- [ ] Prevent incidental pointer focus without executing the command on pointer-down.
- [ ] Preserve ordinary click semantics and exactly-once command execution.
- [ ] Leave keyboard behavior unchanged.

### 2.2 Propagate the candidate API

- [ ] Carry the property through the proposed/public API boundary, extension host/protocol, service and renderer.
- [ ] Preserve existing behavior by default.

### 2.3 Add automated tests

- [ ] Default is false/undefined.
- [ ] Property round-trips through the bridge.
- [ ] Pointer activation preserves previous focus when enabled.
- [ ] Command executes exactly once.
- [ ] Default status items retain current behavior.
- [ ] Keyboard Enter/Space remains functional and accessible.

### 2.4 Build/check patched VS Code

- [ ] Run the relevant upstream checks available in the chosen environment.

### Milestone 2 gate

- [ ] Review the full prototype branch and automated results before local GUI testing.

## Milestone 3 — Real GUI proof

### 3.1 Prepare isolated patched VS Code locally

- [ ] Use dedicated `D:\CodexWork\issue-38\` paths for source/build/profile/extensions/logs/temp artifacts.
- [ ] Do not install the experimental build into the normal profile before isolated testing passes.
- [ ] Reuse the verified Whisper model rather than downloading another copy.

### 3.2 Basic focus tests

- [ ] Editor: status Start and Stop.
- [ ] Codex/agent/chat composer: status Start and Stop.

### 3.3 Full interaction matrix

- [ ] status/status.
- [ ] status/keyboard.
- [ ] status/overlay.
- [ ] keyboard/status.
- [ ] keyboard/keyboard.
- [ ] keyboard/overlay.
- [ ] Confirm deliberate retargeting while recording wins.

### 3.4 Other controls and accessibility

- [ ] Search, Settings and other editable VS Code controls supported by the existing paste mechanism.
- [ ] Integrated terminal where existing policy permits.
- [ ] Clipboard restored.
- [ ] Cancellation inserts nothing.
- [ ] Dictated text never auto-submits.
- [ ] No screen-reader prompt, accessibility-setting change, unexpected sound or new background helper.

### Milestone 3 gate

- [ ] The patched VS Code must solve the actual Codex-composer case, not only editor focus.

## Milestone 4 — Prepare upstream contribution

### 4.1 Clean the prototype

- [ ] Remove diagnostics, temporary logs and unrelated changes.

### 4.2 Final API design review

- [ ] Re-evaluate naming and generality; `preserveFocus` remains a candidate, not a fixed requirement.
- [ ] Check accessibility and backward compatibility.

### 4.3 Prepare the upstream proposal

- [ ] Use `microsoft/vscode#145432` only as evidence that generic status-bar focus behavior has been discussed, not as evidence Microsoft already accepted this solution.
- [ ] Explain why an extension cannot reliably restore an arbitrary previously focused control owned by another extension such as the Codex composer.
- [ ] Reference Universal Dictate #38 as a concrete motivating case.

### 4.4 Submit through the current VS Code API process

- [ ] Verify the current official contribution/proposed-API process at submission time.
- [ ] Review the complete upstream branch before opening the proposal/PR.

### Milestone 4 gate

- [ ] Upstream proposal submitted with tested implementation evidence.

## Milestone 5 — Upstream iteration

- [ ] Address maintainer feedback in small, reviewable commits.
- [ ] Adapt the API design if maintainers request a different shape.
- [ ] Continue proposed-API validation if accepted.
- [ ] If declined, record the decision and leave Universal Dictate #38 blocked/open rather than reviving unsafe focus-tracking hacks.

### Milestone 5 gate

- [ ] Stable API exists before Marketplace integration begins.

## Milestone 6 — Stable Universal Dictate integration

### 6.1 Update compatibility baseline

- [ ] Bump `engines.vscode` and matching VS Code types to the first stable version containing the API.
- [ ] Do not add runtime old-version warning/capability-detection machinery merely to keep the old engine range.

### 6.2 Enable focus preservation

- [ ] Apply the stable property only to the Dictate/Stop status item, not the settings gear.

### 6.3 Automated/build checks

- [ ] Typecheck, compile, package and CI.

### 6.4 Real regression test

- [ ] Repeat the Milestone 3 interaction matrix on stable VS Code/public API.

### Milestone 6 gate

- [ ] Universal Dictate #38 acceptance criteria pass using only stable public APIs.

## Milestone 7 — Release

- [ ] Use the next available patch version; do not reserve `0.1.6` if another release occurs first.
- [ ] Version bump/changelog/release metadata on a release branch.
- [ ] Package and inspect the final Windows x64 VSIX.
- [ ] Install and test the exact VSIX intended for publication.
- [ ] Publish manually to the VS Code Marketplace using the established release process.
- [ ] Install/update from the Marketplace and repeat the critical Codex-composer test.
- [ ] Close Issue #38 only after the Marketplace artifact itself passes.

## Durable decisions

- The real VS Code status-bar item remains mandatory; a nearby native replacement is out of scope.
- End users must never be required to install a custom VS Code fork; a fork is only for development/testing of an upstream contribution.
- If the necessary upstream API is declined and no safe public-API alternative exists, treat that as a blocker rather than shipping unsafe focus hacks.
- No UI Automation/MSAA focus tracking, mouse hooks, click replay, accessibility-setting changes, focus-restoration hacks or synthesized Enter.
- Focus preservation should prevent the pointer-induced focus move rather than remember and restore an old target afterward.
- Deliberate focus changes made by the user while recording must remain authoritative.
- WSL is a supported workspace scenario while the extension runtime remains in the local Windows UI extension host.
- `preserveFocus` remains a candidate API shape pending upstream review, not a fixed requirement.
- Proposed VS Code APIs must never be shipped in Marketplace builds.
- Automatic PR handoff remains approval-gated; the marker is added only after a reviewed branch receives explicit maintainer approval.
