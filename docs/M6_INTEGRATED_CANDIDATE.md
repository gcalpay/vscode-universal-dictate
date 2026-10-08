# M6 — integrated 1.2.0 candidate and acceptance

This is the current M6 plan. [M6_RELEASE.md](M6_RELEASE.md) records the historical
1.0.0 release process; its authorization does not authorize a new release.
Current roadmap: M0 baseline → M1 final-inference isolation → M2 settings/routing →
M3 FFT styles → M4 CQT/circular → M5 integrated performance → **M6 acceptance and
freeze** → M7 curated history → M8 final build and publication.

## Current gate status

M0–M4 are implemented and M5 confirmation `37765259320` completed 224 observations
with 88 passing aggregate gates. The [M5 review ledger](M5_REVIEW_CLOSEOUT.md)
retains earlier failures and the eight Codacy/cache-mismatch dispositions.
A packaged 1.2.0 artifact already exists, but artifact creation is not integrated
acceptance, a GitHub release or Marketplace publication.

| Gate | Status / required evidence |
| --- | --- |
| Starting source, base and main | Verified at the SHAs in the M5 ledger; recheck before remote writes |
| M5 confirmation and existing Windows package audit | Complete on `410094f` / tree `bee76fa…` |
| Eight Codacy additions | Source review complete: five intentional assertions/requirements retained, three test-maintainability cleanups; fresh Windows/analyzer checks pending; recorded analyzer status `action_required` |
| Earlier unreproduced RGB mismatch | Source/oracle/failure-log review complete; cause unknown; bounded Windows probes and final residual-risk disposition pending |
| Current docs, defaults and honest renderer presentation | Consolidated closeout prepared; package validation pending |
| Integrated artifact selection / final checksum | Pending consolidated source/package audit; do not invent a new build identity |
| User normal-use acceptance | Not yet received |
| Accepted source/artifact freeze | Not yet established |
| M7 history and M8 release | Not started; separate safeguards and authorization required |

## M6.1 — prepare and preserve one coherent checkpoint

Reconcile README, changelog, settings, architecture/dependencies/testing and active
navigation. There are seven independent settings and five exact style labels.
Keep English / Enhanced overlay / Waveform / Medium / 10 seconds / clipboard Off /
preview Off defaults, explicit preferences, next-recording snapshots, the accepted
waveform, Pause/Resume, local model/runtime and OpenWhispr/third-party attribution.

1.1.2 is an internal diagnostic build and 1.1.3 an unpublished M1 candidate. They
are not additional published releases or required installs. Version 1.2.0 alone
does not identify the candidate when multiple unpublished builds share that version.
The historical GitHub tags/releases and live Marketplace state are separate records.

Use actual production-renderer images and identify synthetic inputs. The current
seven-setting table is authoritative; do not present the old six-entry menu as the
current UI or fabricate a VS Code screenshot. Show Small/Medium/Large and preview
geometry honestly, including compact circular mode. No waveform retuning or silent
overlay resizing is part of this documentation work.

For test/doc-only changes, verify affected tests and unchanged production
fingerprints. Runtime/render changes require the corresponding Windows and
performance gates. Preserve every failed trial and exact equality assertion.
Record a coherent source/evidence checkpoint after the bounded review batch.

## M6.2 — audit and deliver the integrated candidate

Reuse the existing audited runtime only when the reviewed source/package mapping
remains appropriate. README, changelog and media are packaged payloads too: a
metadata-only repack must have a new checksum and explicitly retained native/
JavaScript payload identity. Do not label the old synthetic-merge build as compiled
from a new source commit. If production changes, build from the consolidated source
and complete the affected automated gates internally before delivery.

The final delivery record must contain:

- source branch and commit, exact Git tree and actual build checkout identity;
- VSIX filename with version/build identifier, size and SHA-256;
- audit result, resolved tool/dependency versions and native/runtime payload hashes;
- M5 protocol/run identity and any targeted post-review validation;
- individual analyzer disposition, actual analyzer status and cache residual risk;
- direct download of one integrated VSIX containing M1 and all five styles.

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
