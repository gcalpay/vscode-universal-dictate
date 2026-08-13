# Issue #38 — Implementation Plan

## Current state

- Current phase: pre-Milestone-1 infrastructure mini-milestone — automatic PR handoff and repository documentation refresh.
- Current chunk: final human review and merge of PR #47.
- Status: automatic push-trigger handoff is validated end to end; PR #47 is open, bot-authored, has a clean generated title, requests `gcalpay` as reviewer, and repository CI is green apart from any rerun caused by final documentation-only state corrections.
- Active repository: `gcalpay/vscode-universal-dictate`.
- Active branch: `chore/automatic-handoff-and-docs-refresh` until PR #47 is merged.
- Active PR: #47 — `Validate automatic handoff title fix`.
- Branch base: `main` at `23ebc2c9c966863ff948c976fc6f81fff8145109` (PR #45 merged).
- Current extension version: `0.1.5`.
- Last completed work: second automatic-trigger validation succeeded through workflow run `31662910677`; the bot added bookkeeping commit `c28ff006a895aabdaea9c0760c330fb5cea4d2c9`, opened PR #47, requested `gcalpay`, and both `typecheck` and Windows `package` checks passed on that validated head.
- Exact next action: after final documentation-only CI is green, `gcalpay` reviews the final PR #47 diff, submits a formal GitHub approval, and merges it. After merge, verify `main` and begin Milestone 1.1.
- Blockers: none.

### Exact next action for a fresh session

1. Read `AGENTS.md`, this plan and `issue-38-implementation-log.md` in that order.
2. Verify current `main`, PR #47, and branch `chore/automatic-handoff-and-docs-refresh` before editing anything.
3. If PR #47 is still open: inspect its current diff and latest checks. The automatic-trigger implementation has already passed its branch gate and automatic validation; do not create another marker commit. `gcalpay` should formally approve and merge once the final diff/checks are clean.
4. If PR #47 is already merged: verify `main` contains the automatic push-marker trigger and refreshed documentation, then begin Milestone 1.1 below. Do not repeat the infrastructure work.
5. Old merged/test/release branches listed under **Repository housekeeping** may be deleted; they are not inputs to Milestone 1.

## Working rules

- Never implement directly on `main`.
- Use one feature branch per coherent PR/workstream, not one branch per small chunk.
- Create a coherent commit after each completed implementation chunk when the repository is in a reviewable state.
- Perform a lightweight review after each chunk and a formal milestone review/test gate before PR handoff.
- Review the complete branch before opening a PR; PR creation and merge are separate explicit gates.
- Stop after each milestone and require maintainer approval before proceeding to the next milestone/workstream.
- `gcalpay-automation` is a machine account and must be used only through automation, not manual operation.
- After an approved gate, the normal PR handoff is a final commit whose subject ends exactly in ` [automation-handoff]`; manual `workflow_dispatch` is fallback only.
- If the branch changes materially after approval and before handoff, re-review it and obtain fresh maintainer approval before adding another marker.
- Once the bot PR is open, final state/log corrections may be made on that same branch; the maintainer's formal PR review covers the final diff.
- Keep proposed VS Code API work out of Marketplace releases.
- Use the real Windows VS Code desktop for behavior that cannot be validated in the web/GitHub environment.
- Never auto-submit dictated text.

## Workflow infrastructure before Milestone 1

### Milestone 0 — Baseline and wording

- [x] Verify repository state and extension version.
- [x] Clarify product positioning as Windows support with WSL workspaces.
- [x] Add the living Issue #38 implementation plan.
- [x] Review and approve Milestone 0.

### Persistent workflow infrastructure

- [x] Add root `AGENTS.md` with stable repository-wide agent rules.
- [x] Add `docs/issue-38-implementation-log.md` for completed work and durable decisions.
- [x] Add `.github/workflows/automation-open-pr.yml`.
- [x] Keep `gcalpay-automation` automation-only and `gcalpay` responsible for human review/merge/release decisions.
- [x] Keep bot credentials in repository secret `AUTOMATION_BOT_TOKEN` with narrowly scoped `public_repo` access.
- [x] Replace `gh pr` GraphQL behavior with direct REST PR/reviewer calls so broader PAT scopes are unnecessary.
- [x] Validate the manual fallback path with workflow run `31654821705` and PR #44.

### Automatic handoff and documentation refresh

- [x] Add a non-`main` push trigger alongside `workflow_dispatch`.
- [x] Run automatic handoff only for pushes by `gcalpay` whose head commit subject ends exactly in ` [automation-handoff]`.
- [x] Derive the PR title from the marker commit subject and target `main`.
- [x] Prevent bot bookkeeping pushes from retriggering handoff through the actor restriction.
- [x] Make manual fallback PR-body output multiline-safe.
- [x] Document the approval gate, marker convention and fresh-session recovery order in `AGENTS.md`.
- [x] Recursively audit all tracked Markdown and refresh stale runtime/UI/testing/install statements.
- [x] Remove obsolete `docs/PR_NOTE.md`.
- [x] Review `CHANGELOG.md`, `SUPPORT.md`, `THIRD_PARTY_NOTICES.md` and `docs/DEPENDENCIES.md`; leave them unchanged because their current statements remain factual.
- [x] Branch gate reviewed and approved by the maintainer.
- [x] Automatic validation attempt 1: workflow run `31662552028` automatically opened PR #46 as `gcalpay-automation` and requested `gcalpay`.
- [x] Close PR #46 without merge after discovering its title incorrectly retained `[automation-handoff]`.
- [x] Fix literal marker removal in commit `f7cb200e5ba6b5c9a033b019eb1af80dac3c5e69`.
- [x] Re-review branch and obtain fresh maintainer approval for attempt 2.
- [x] Automatic validation attempt 2: marker commit `0a79fbaf2d52483d5ff3f29b55c69b5667e266d9` triggered workflow run `31662910677` automatically.
- [x] Workflow run `31662910677` completed successfully without manual Actions dispatch.
- [x] Bot bookkeeping commit `c28ff006a895aabdaea9c0760c330fb5cea4d2c9` was authored by `gcalpay-automation`.
- [x] PR #47 was opened by `gcalpay-automation` with clean title `Validate automatic handoff title fix` and requested reviewer `gcalpay`.
- [x] PR #47 `typecheck` passed on the validated automatic-handoff head.
- [x] PR #47 Windows `package` passed on the validated automatic-handoff head.
- [ ] Final documentation-only head checks complete successfully.
- [ ] `gcalpay` formally reviews/approves PR #47 and merges it.
- [ ] Verify the merged `main` state, then start Milestone 1.1.

## Repository housekeeping

The authoritative remote inventory contains 11 branches. The following historical branches are no longer needed for active work and may be deleted:

- `chore/automation-handoff-validation` — failed/superseded validation for closed PR #42.
- `chore/automation-handoff-validation-2` — successful validation branch for merged PR #44.
- `docs/issue-38-platform-wording` — merged PR #41.
- `docs/issue-38-workflow-validation` — merged PR #45.
- `feat/visualization-timespan` — merged PR #39; the feature is already in `main`/0.1.5.
- `fix/automation-pr-rest-api` — merged PR #43; superseded by `main`.
- `fix/preserve-insertion-target` — old baseline branch with no commits ahead of current `main`; do not confuse it with the active upstream Issue #38 plan.
- `release/0.1.4` — fully behind `main`, no unique commits ahead.
- `release/0.1.5` — fully behind `main`, no unique commits ahead.

Keep:

- `main`.
- `chore/automatic-handoff-and-docs-refresh` only until PR #47 is merged; it may be deleted after merge.

## Milestone 1 — Map the upstream VS Code implementation

- [ ] **1.1 Prepare upstream working repository**
  - Work in a fork of `microsoft/vscode`, never directly on Microsoft `main`.
  - The fork is development/test infrastructure only; end users must continue using official VS Code.
  - Create a dedicated Issue #38 feature branch from a current upstream-compatible base.
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
