# M6 — integrated 1.2.0 candidate and acceptance

This is the current M6 plan. [M6_RELEASE.md](M6_RELEASE.md) records the historical
1.0.0 release process; its authorization does not authorize a new release.
Current roadmap: M0 baseline → M1 final-inference isolation → M2 settings/routing →
M3 FFT styles → M4 CQT/circular → M5 integrated performance → **M6 acceptance and
freeze** → M7 curated history → M8 final build and publication.

## Current RC4 acceptance scope

Three modes: Waveform, Log-Frequency Power Spectrogram, Circular Spectrum. Four
palettes: Blue (default), Green, Amber, Violet. Circular gets its own rounded-square
geometry; waveform amplitude and rectangular geometry stay at 1.1.2. The earlier
RC2 gain experiment is excluded. Current tests include palette/alias/square controls
and 142 observations / 56 unchanged-budget M5 gates. Freeze only after this revised
candidate's user acceptance. Earlier five-mode gate counts below are historical.

## Historical gate record at source closeout

M0–M4 are implemented. Original M5 run `37765259320` at `410094f` and the independent
post-review run `37778677667` at `980877b` each completed 224 observations with
88 passing aggregate gates. The [M5 review ledger](M5_REVIEW_CLOSEOUT.md) keeps
their identities/results separate and retains all earlier failures.

All eight original Codacy findings have individual source-review dispositions.
The new report contains five deliberate assertions/requirements and remains
`action_required`; the three maintainability additions are absent. The original
cache-mismatch cause remains unknown. Fixed probes completed 36,660 exact pixel
comparisons across six Windows jobs without reproducing it; this is a disclosed,
reviewed residual risk suitable for integrated acceptance, not a production fix.

**The authoritative delivery record is [PR #56](https://github.com/gcalpay/vscode-universal-dictate/pull/56)
and the audit/checksum record supplied with the integrated VSIX.** That record
identifies the actual final source commit/tree, build checkout, final check results
and package bytes after they exist. Source documentation does not invent those
identities or require a post-build edit to describe its own commit. Artifact
creation remains separate from user acceptance, GitHub release and Marketplace
publication.

| Gate | Source-closeout evidence / delivery requirement |
| --- | --- |
| Source and base identities | Original/review/build-input SHAs and trees in the M5 ledger; recheck live refs before writes |
| M5 confirmation | Both recorded runs pass independently; post-review run `37778677667` has 224 observations and 88 passing gates |
| Eight original Codacy findings | Individually reviewed; three cleanup additions absent in check `113316719146`, five deliberate assertions/requirements remain, actual status `action_required` |
| Earlier RGB mismatch | Source/oracle review and 60 fixed matrices complete; 36,660 exact comparisons pass; unknown cause retained as disclosed residual risk |
| Documentation and renderer presentation | Consolidated seven-setting/five-style docs and actual production-renderer examples prepared |
| Reproducible build inputs | Exact resolved lock, compiler-provenance repair and SDL2 license saved in `0956650`; final build records actual tools/source |
| Test-helper correction | Introduced RECT/OverlayRect mismatch corrected in the final source batch; renderer/package execution is required before delivery |
| Integrated VSIX | Deliver only after successful consolidated Windows renderer/package validation and payload audit; exact identity/results belong in PR #56 and the delivered record |
| Normal-use acceptance and freeze | User acceptance has not been received; record it with the accepted source/artifact before M7 |
| M7 history / M8 release | Not started; separate safeguards and authorization required |

## M6.1 — prepare and preserve one coherent checkpoint

README, changelog, architecture/dependencies/testing and active navigation are
reconciled for RC4. There are eight independent settings and three
exact style labels; colors default to Blue.
Keep English / Enhanced overlay / Waveform / Medium / 10 seconds / clipboard Off /
preview Off defaults, explicit preferences, next-recording snapshots, the accepted
waveform, Pause/Resume, local model/runtime and OpenWhispr/third-party attribution.

1.1.2 is an internal diagnostic build and 1.1.3 an unpublished M1 candidate. They
are not additional published releases or required installs. Version 1.2.0 alone
does not identify the candidate when multiple unpublished builds share that version.
The historical GitHub tags/releases and live Marketplace state are separate records.

The prepared examples use actual production-renderer images and identify synthetic
inputs. The current eight-setting table is authoritative; the old six-entry menu
is excluded from active presentation. Small/Medium/Large and preview geometry are
shown honestly. Circular now has its own square layout; waveform amplitude and
rectangular geometry remain unchanged while its palette is selectable. Runtime
changes require fresh native/render/performance checks and package validation.

For test/doc-only changes, verify affected tests and unchanged production
fingerprints. Runtime/render changes require the corresponding Windows and
performance gates. Preserve every failed trial and exact equality assertion.
Record a coherent source/evidence checkpoint after the bounded review batch.

## M6.2 — audit and deliver the integrated candidate

Build the consolidated candidate with its committed dependency lock and corrected
test-helper signature. The original audited VSIX remains a provenance baseline;
it is not relabeled as a build of newer docs/media/source. README, changelog, media
and notices are packaged payloads too. Record the new archive checksum and compare
actual native/JavaScript/runtime payloads with the retained baseline. If production
changes, complete the affected automated gates before delivery.

Package attempts `37778683095` (compiler-provenance command) and `37779796057`
(introduced test-helper type mismatch) remain failed attempts, with their corrections
and exact boundaries in the M5 ledger. A passing M5 run does not override those
package failures. The final consolidated Windows renderer/package run must pass,
and its artifact must be independently audited before the single candidate is
provided. Record the outcome in PR #56 and the delivered audit; do not add another
source commit solely to insert a checksum or change a build-status sentence.

The final delivery record must contain:

- source branch and commit, exact Git tree and actual build checkout identity;
- VSIX filename with version/build identifier, size and SHA-256;
- audit result, resolved tool/dependency versions and native/runtime payload hashes;
- M5 protocol/run identity and any targeted post-review validation;
- individual analyzer disposition, actual analyzer status and cache residual risk;
- direct download of one integrated VSIX containing M1 and the three retained styles.

Keep the Windows UI-host target, required helpers/runtime DLLs, no source/tests/
fonts/models/audio fixtures in the package, model-download behavior, notices and
MIT license. Packaging is not installation, acceptance or publication.

## One normal-use acceptance checkpoint

The user installs once at a convenient time, reloads once and uses normal dictation.
They can choose **Enhanced Overlay Visualization** from the gear or VS Code
Settings and try styles during ordinary use. Changing a style affects the next
recording; it does not require another extension reload or enable a disabled overlay.

Ask whether insertion, controls/Pause, responsiveness and visualization appearance
are acceptable, including the compact circular view. Preserve Issue #38 as the
known genuine status-bar focus limitation. Do not prescribe a benchmark sentence,
repetition count, per-run diagnostic or screenshot series.

If a concrete timing concern needs evidence, use one accumulated **Show Latency
Report** document with the latest 100 completed measurements. It contains no audio/
transcript, survives only the current extension-host session and must be saved
before reload if needed later. Delivery alone does not mean acceptance.

## M6.3 — corrections and exact accepted freeze

Reproduce concrete user defects internally where possible and batch any corrections.
A serious defect can justify another integrated candidate; a test cleanup or routine
checkpoint does not create another manual installation requirement.

After explicit acceptance, record the accepted source commit **and Git tree**, VSIX
SHA-256, native/JavaScript payload hashes, performance identity, analyzer/cache
dispositions and the acceptance record. Prepare required source/document changes
before freezing; later edits are declared revisions, not history-only changes.
Only after that freeze may M7 begin.

## M7 — separate safeguarded history work

The target is roughly 15–25 coherent commits instead of the original 238 main
commits, with truthful chronology and attribution. This is curation of the default
branch, not a promise to erase public copies or control contribution counts.

Before any ref replacement, inventory the full graph, refs/tags/releases, stacked
PRs, protection/rulesets, concurrent work and release-triggering workflows. Create
and verify a complete all-ref Git backup and restoration path. The recovery ZIP's
source/evidence snapshot is not a full-history backup. Preserve both old main and
the accepted old-history feature tip, existing tags/releases and unrelated refs.

Construct curated history on a separate staging branch. Preserve authors/coauthors
and an old-to-new provenance mapping. Handle #55/#56 deliberately so the old stack
is not merged back as ancestry. A closed/unmerged PR must not be called merged.

Require exact Git-tree equality to the accepted freeze, including modes/symlinks,
and applicable validation. Present the exact old/new refs, verified backup and
rollback for explicit approval. Immediately before replacement, recheck the
expected old main SHA and use a narrow expected-old-SHA lease/compare-and-swap.
A failed lease requires investigation, not a broader force push. Reconcile local
clones only after checking for uncommitted/unpushed work.

## M8 — final build and separately authorized release

Build from the actual clean accepted SHA. Verify accepted-tree equality and compare
compiled extension/native/runtime payloads. Identical trees do not guarantee
byte-identical VSIX or PE files: build tools, paths, timestamps and metadata can
change bytes. Investigate differences and retain exact final source/artifact mapping.

A second user installation is optional and justified only by a real runtime/package
risk. Skip redundant acceptance when runtime equivalence is demonstrated and only
approved packaging/repository metadata changed. Unexamined native binary differences
are not proof of equivalence.

Recheck that the target version/tag has not appeared concurrently. After explicit
release authorization, tag exactly the clean verified SHA, attach the audited VSIX
and checksums to the GitHub release, and use the user's preferred Marketplace web
upload workflow. Do not silently increment versions, tag, publish or demand a new
PAT workflow. Verify both publication surfaces and downloadable artifact identity;
keep full-history backups and remove only specifically approved obsolete branches.
