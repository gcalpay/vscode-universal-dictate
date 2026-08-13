# Issue #38 — Implementation Plan

## Current state

- Current phase: pre-Milestone-1 infrastructure mini-milestone — automatic PR handoff and repository documentation refresh.
- Current chunk: validate the automatic push-triggered PR handoff and merge this infrastructure branch.
- Status: branch review passed and maintainer approved handoff; the final `[automation-handoff]` marker commit has been created; automatic workflow, PR CI and merge are pending.
- Active repository: `gcalpay/vscode-universal-dictate`.
- Active branch: `chore/automatic-handoff-and-docs-refresh` until this mini-milestone is merged.
- Branch base: `main` at `23ebc2c9c966863ff948c976fc6f81fff8145109` (PR #45 merged).
- Current extension version: `0.1.5`.
- Last completed work: complete branch review, repository-wide Markdown audit, automatic-trigger hardening and explicit maintainer approval.
- Blockers: none.

### Exact next action for a fresh session

1. Read `AGENTS.md`, this plan and `issue-38-implementation-log.md` in that order.
2. Verify current `main`, open PRs and whether `chore/automatic-handoff-and-docs-refresh` still exists or has already merged.
3. If this branch is **not yet merged**: the branch gate is already approved. Verify the marker push ran `Automation PR Handoff`, that the PR was opened by `gcalpay-automation`, that `gcalpay` was requested as reviewer and that repository CI/checks pass. Do not ask for the handoff approval again. The maintainer then formally reviews/approves and merges.
4. If this branch **has already merged**: verify `main` contains the automatic trigger and refreshed documentation, then begin Milestone 1.1 below. Do not repeat the infrastructure work.

## Working rules

- Never implement directly on `main`.
- Use one feature branch per coherent PR/workstream, not one branch per small chunk.
- Create a coherent commit after each completed implementation chunk when the repository is in a reviewable state.
- Perform a lightweight review after each chunk and a formal review/test gate after each milestone.
- Review the complete branch before opening a PR; PR creation and merge are separate explicit gates.
- Stop after each milestone and require maintainer approval before continuing.
- `gcalpay-automation` is a machine account and must be used only through automation, not manual operation.
- After an approved gate, the normal PR handoff is a final commit whose subject ends exactly in ` [automation-handoff]`; manual `workflow_dispatch` is fallback only.
- Keep proposed VS Code API work out of Marketplace releases.
- Use the real Windows VS Code desktop for behavior that cannot be validated in the web/GitHub environment.
- Never auto-submit dictated text.

## Milestone 0 — Baseline and wording

- [x] **0.1 Verify repository state**
  - Confirm `main`, current version, recent commits and open PR state.
  - Confirm the current README and Marketplace-facing description.
  - Make no implementation changes.
- [x] **0.2 Documentation wording**
  - Change the opening positioning to make Windows the supported OS and WSL a workspace scenario.
  - Preferred wording: "Local, offline dictation across VS Code inputs on Windows, including WSL workspaces."
  - Update README and Marketplace-facing package description only.
  - No version bump and no release solely for this wording.
- [x] **Milestone 0 gate**
  - Review the entire documentation branch against `main`.
  - Confirm no unrelated files or implementation changes.
  - Maintainer approved Milestone 0.

## Workflow infrastructure before Milestone 1

- [x] **Repository agent guidance**
  - Add root `AGENTS.md` containing stable repo-wide agent rules.
  - Point Issue #38 work to the living plan and implementation log rather than duplicating milestone detail.
- [x] **Persistent implementation log**
  - Add `docs/issue-38-implementation-log.md` for completed work, commits, reviews, tests, decisions and deviations.
- [x] **Automation-account workflow**
  - Configure `gcalpay-automation` to act only through automation.
  - Use narrowly scoped credentials stored as GitHub secrets; never commit credentials.
  - Automate legitimate machine-account tasks such as final milestone bookkeeping and PR creation.
  - Keep `gcalpay` as the human reviewer/approver/merger.
  - Manual workflow path validated with workflow run #2 (`31654821705`) and PR #44.
- [x] **Workflow-infrastructure gate**
  - Verified bot token identity as `gcalpay-automation`.
  - Verified bot-authored commit and push.
  - Verified bot-opened PR and reviewer request.
  - Verified maintainer `APPROVED` review and normal merge preserving the bot-authored commit.
  - Verified the bot-authored commit is reachable from `main` and attributed to `gcalpay-automation`.

## Automatic handoff and documentation refresh before Milestone 1

- [x] **Add automatic handoff trigger**
  - Keep `workflow_dispatch` as fallback.
  - Add a non-`main` push trigger.
  - Run automatic handoff only for pushes by `gcalpay` whose head commit subject ends in ` [automation-handoff]`.
  - Derive the PR title from the commit subject and target `main`.
  - Keep bot bookkeeping pushes from retriggering handoff through the actor restriction.
- [x] **Update agent/fresh-session guidance**
  - Document the marker workflow, approval gate and fresh-session recovery order in `AGENTS.md`.
- [x] **Audit all tracked Markdown**
  - Recursive inventory after cleanup contains 13 tracked `.md` files.
  - Refresh stale runtime, UI, testing and installation claims.
  - Remove obsolete one-line `docs/PR_NOTE.md` rather than preserving stale pre-release guidance.
  - Leave historical changelog, support, dependency and third-party notices unchanged where they remain factual.
- [x] **Update durable Issue #38 state**
  - Make this plan and the implementation log sufficient to resume without conversation context.
- [x] **Mini-milestone branch gate**
  - Reviewed the complete branch against `main`.
  - Confirmed only the intended workflow/documentation changes are present.
  - Confirmed the workflow cannot automatically hand off `main` or a bot-authored bookkeeping push.
  - Maintainer explicitly approved handoff on 2026-08-13.
- [ ] **Automatic-trigger validation and merge**
  - [x] Create the approved final marker commit.
  - [ ] Verify the push event runs `Automation PR Handoff` successfully without visiting Actions manually.
  - [ ] Verify PR author is `gcalpay-automation` and reviewer request is `gcalpay`.
  - [ ] Verify normal repository CI/checks pass.
  - [ ] Maintainer formally reviews/approves and merges.
  - After merge, Issue #38 proceeds to Milestone 1.1.

## Milestone 1 — Map the upstream VS Code implementation

- [ ] **1.1 Prepare upstream working repository**
  - Work in a fork of `microsoft/vscode`, never directly on Microsoft `main`.
  - The fork is development/test infrastructure only; end users must continue using official VS Code.
  - Create a dedicated Issue #38 feature branch from current upstream-compatible base.
- [ ] **1.2 Trace the complete status-bar path**
  - Trace public `StatusBarItem` API through extension host/RPC, status-bar service and renderer.
  - Identify exact interfaces/files requiring propagation.
  - Identify the browser event that causes pointer focus movement.
  - Make no broad implementation changes yet.
- [ ] **1.3 Architecture checkpoint**
  - Re-evaluate candidate `StatusBarItem.preserveFocus?: boolean` semantics.
  - `undefined`/`false`: current behavior.
  - `true` + pointer activation: command executes without moving keyboard focus into the status item.
  - Keyboard navigation and Enter/Space activation remain unchanged.
  - No after-the-fact focus restoration.
- [ ] **Milestone 1 gate**
  - Confirm the complete propagation path and API semantics before implementing the prototype.

## Milestone 2 — Minimal upstream prototype

- [ ] **2.1 Implement internal pointer behavior**
  - Prevent incidental pointer focus without executing the command on pointer-down.
  - Preserve ordinary click semantics and exactly-once command execution.
  - Leave keyboard behavior unchanged.
- [ ] **2.2 Propagate the candidate API**
  - Carry the property through the proposed/public API boundary, extension host/protocol, service and renderer.
  - Preserve existing behavior by default.
- [ ] **2.3 Add automated tests**
  - Default is false/undefined.
  - Property round-trips through the bridge.
  - Pointer activation preserves previous focus when enabled.
  - Command executes exactly once.
  - Default status items retain current behavior.
  - Keyboard Enter/Space remains functional and accessible.
- [ ] **2.4 Build/check patched VS Code**
  - Run relevant upstream checks available in the chosen environment.
- [ ] **Milestone 2 gate**
  - Review the full prototype branch and automated results before local GUI testing.

## Milestone 3 — Real GUI proof

- [ ] **3.1 Prepare isolated patched VS Code locally**
  - Use a dedicated `D:\\CodexWork\\issue-38\\` environment for source/build/profile/extensions/logs/temp artifacts.
  - Do not install the experimental build into the normal profile before isolated testing passes.
  - Reuse the verified Whisper model rather than downloading another copy.
- [ ] **3.2 Basic focus tests**
  - Editor: status Start and Stop.
  - Codex/agent/chat composer: status Start and Stop.
- [ ] **3.3 Full interaction matrix**
  - status/status, status/keyboard, status/overlay, keyboard/status, keyboard/keyboard, keyboard/overlay.
  - Confirm deliberate retargeting while recording wins.
- [ ] **3.4 Other controls and accessibility**
  - Search, Settings and other editable VS Code controls supported by the existing paste mechanism.
  - Integrated terminal where existing policy permits.
  - Clipboard restored; cancellation inserts nothing; dictated text never auto-submits.
  - No screen-reader prompt, accessibility-setting change, unexpected sound or new background helper.
- [ ] **Milestone 3 gate**
  - The patched VS Code must solve the actual Codex-composer case, not only editor focus.

## Milestone 4 — Prepare upstream contribution

- [ ] **4.1 Clean the prototype**
  - Remove diagnostics, temporary logs and unrelated changes.
- [ ] **4.2 Final API design review**
  - Re-evaluate naming and generality; treat `preserveFocus` as a candidate shape, not a fixed requirement.
  - Check accessibility and backward compatibility.
- [ ] **4.3 Prepare the upstream proposal**
  - Use `microsoft/vscode#145432` as evidence of a generic status-bar focus problem, not as evidence Microsoft already accepted this solution.
  - Explain why an extension cannot reliably restore an arbitrary previously focused control owned by another extension such as the Codex composer.
  - Reference Universal Dictate #38 as a concrete motivating case.
- [ ] **4.4 Submit through the current VS Code API process**
  - Review the complete branch before opening an upstream PR/proposal.
- [ ] **Milestone 4 gate**
  - Upstream proposal submitted with tested implementation evidence.

## Milestone 5 — Upstream iteration

- [ ] Address maintainer feedback in small, reviewable commits.
- [ ] Adapt API design if maintainers request a different shape.
- [ ] Continue proposed-API validation if accepted.
- [ ] If declined, record the decision and leave Universal Dictate #38 blocked/open rather than reviving unsafe focus-tracking hacks.
- [ ] **Milestone 5 gate**
  - Stable API exists before Marketplace integration begins.

## Milestone 6 — Stable Universal Dictate integration

- [ ] **6.1 Update compatibility baseline**
  - Bump `engines.vscode` and matching VS Code types to the first stable version containing the API.
  - Do not add runtime old-version warning/capability-detection machinery merely to keep the old engine range.
- [ ] **6.2 Enable focus preservation**
  - Apply the stable property only to the Dictate/Stop status item, not the settings gear.
- [ ] **6.3 Automated/build checks**
  - Typecheck, compile, package and CI.
- [ ] **6.4 Real regression test**
  - Repeat the Milestone 3 interaction matrix on stable VS Code/public API.
- [ ] **Milestone 6 gate**
  - Universal Dictate #38 acceptance criteria pass using only stable public APIs.

## Milestone 7 — Release

- [ ] Use the next available patch version; do not reserve `0.1.6` if another release occurs first.
- [ ] Version bump/changelog/release metadata on a release branch.
- [ ] Package and inspect the final Windows x64 VSIX.
- [ ] Install and test the exact VSIX intended for publication.
- [ ] Publish manually to the VS Code Marketplace using the established release process.
- [ ] Install/update from the Marketplace and repeat the critical Codex composer test.
- [ ] Close Issue #38 only after the Marketplace artifact itself passes.

## Decisions

- The real VS Code status-bar item remains mandatory; a nearby native replacement is out of scope.
- End users must never be required to install a custom VS Code fork; a fork is only for development/testing of an upstream contribution.
- If the necessary upstream API is declined and no safe public-API alternative exists, treat that as a blocker rather than shipping unsafe focus hacks.
- No UI Automation/MSAA focus tracking, mouse hooks, click replay, accessibility-setting changes, focus-restoration hacks or synthesized Enter.
- Focus preservation should prevent the pointer-induced focus move rather than remember and restore an old target afterward.
- Deliberate focus changes made by the user while recording must remain authoritative.
- WSL is a supported workspace scenario while the extension runtime remains in the local Windows UI extension host.
- Automatic PR handoff must remain approval-gated; a marker commit is never added merely because a branch exists.

## Deviations from the earlier plan

- Removed runtime capability detection and one-time warnings for old VS Code versions. If the API stabilizes, the extension minimum engine version will move to the supporting VS Code release.
- Treat `preserveFocus` as a candidate API shape pending upstream review.
- Separate the documentation-only wording change from implementation and release work.
- Added root `AGENTS.md` and a backward-looking implementation log so future chats/agents can recover state without a separate handoff.
- Added an explicit automation-account workflow phase before starting Milestone 1.
- Kept the bot PAT at `public_repo`; switched PR creation and reviewer requests from `gh pr` GraphQL behavior to direct REST API calls after validation attempt #1.
- Added an automatic approval-gated push-marker path so the maintainer does not normally need to visit Actions manually; retained `workflow_dispatch` as fallback.
- Performed a repository-wide Markdown refresh before Milestone 1 because several early MVP/pre-release documents no longer described the shipped runtime.

## Test record

- Milestone 0: branch review against `main` passed before workflow-infrastructure additions. No implementation behavior changed.
- Workflow validation attempt #1: authentication, bot commit and bot PR creation succeeded, but the GitHub CLI command returned a GraphQL scope error before the reviewer-request step; PR #42 was closed without merge.
- Workflow repair PR #43 passed CI and Windows packaging and was merged.
- Workflow validation attempt #2: run #2 (`31654821705`) completed successfully; bot commit `aba3816c5b6983bd2da8b435c0463d89babd16c6` opened PR #44 as `gcalpay-automation`, requested `gcalpay`, received an `APPROVED` review and was merged with a merge commit.
- Bot commit `aba3816c5b6983bd2da8b435c0463d89babd16c6` is reachable from `main` and GitHub attributes its author and committer to `gcalpay-automation`.
- Automatic push-marker trigger on `chore/automatic-handoff-and-docs-refresh`: branch review passed, maintainer approved, marker commit created; automatic workflow result pending.
- GUI testing for Issue #38 begins after a working upstream prototype exists.
