---
baseline_commit: 95e41c6dfb592ed0233885938aaec7c5130bcb99
---

# Story 1.4: Produce an Inactive Verifiable Candidate

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-110. -->

## Story

As a WPM maintainer,
I want one local inactive candidate to bind the exact package and its verification evidence,
so that later channel assessments can reason about one auditable artifact without rebuilding or publishing it.

## Acceptance Criteria

1. Given an exact package that passed inspection, quality checks, and packed-install verification, when
   candidate preparation completes, then one inactive record binds its package and version, proposed tag,
   source commit, exact artifact, size, digests, verification evidence, and release-note preview.
2. Given any recorded package, revision, artifact, digest, quality, or install evidence is missing or
   inconsistent, when eligibility is assessed, then the candidate is ineligible and every discrepancy is
   reported.
3. Given public identity or channel-policy decisions remain unresolved, when candidate preparation runs, then
   the candidate can still be prepared locally but remains inactive with those facts reported.
4. Given candidate preparation succeeds or fails, when external state is inspected afterward, then no tag,
   release, asset, npm version, dist-tag, or trust setting has changed.
5. Given the exact package bytes, source revision, proposed tag, and verification evidence are unchanged, when
   candidate preparation is repeated, then the candidate retains the same package identity, digests, and
   evidence binding without creating a second candidate identity.
6. Given any package bytes, source revision, proposed tag, or required verification evidence differs from the
   recorded binding, when candidate preparation is repeated, then the prior candidate identity is not silently
   reused and the changed binding is reported before channel assessment.

## Tasks / Subtasks

- [x] Define one small, deterministic candidate-binding contract (AC: 1-3, 5-6)
  - [x] Consume the accepted Story 1.2 inspection report and Story 1.3 packed-install report; accept explicit
        local quality evidence, proposed tag, release-note preview, and candidate output location.
  - [x] Validate all required evidence against the current exact archive and collect every missing or
        inconsistent package, revision, artifact, digest, quality, install, and notes finding before deciding
        whether the candidate can be persisted.
  - [x] Derive a stable candidate identity from canonical binding values and exact evidence digests, excluding
        timestamps, absolute input locations, and other environment-specific values.
- [x] Persist the exact accepted candidate once (AC: 1, 5-6)
  - [x] Store the exact `.tgz` bytes, an inspectable inactive record, and the evidence needed to audit the
        binding; record package/version, proposed tag, source revision, byte size, SHA-256 and SHA-512 digests,
        accepted inspection/quality/install evidence, and the release-note preview.
  - [x] Verify persisted bytes and evidence before reporting success; never replace an existing candidate with
        a different binding or leave a changed binding looking accepted.
  - [x] Return the same identity and binding for an unchanged rerun. On a changed rerun, preserve the prior
        candidate and report all changed binding dimensions without creating a second identity.
- [x] Preserve the inactive, no-write boundary (AC: 3-4)
  - [x] Reuse Story 1.1's closed inactive-readiness inventory so unresolved public identity, policy, authority,
        and trust facts remain explicit without blocking local candidate production.
  - [x] Keep the command maintainer-only under `distribution-preparation/`; add no product CLI command,
        publisher, channel observer/assessment, credential path, remote client, or Git/npm/GitHub mutation.
  - [x] Keep the candidate tooling outside `src/core`, `dist`, the npm package ship set, and generated
        work-package deliverables.
- [x] Add focused RED-to-GREEN automation and proportional gates (AC: 1-6)
  - [x] Unit-test accepted bindings, aggregate missing/inconsistent evidence, stable identity, and changed
        binding reports, including arbitrary evidence names rather than artifact-type-specific branches.
  - [x] Add a real clean package -> packed install -> candidate integration journey that hashes and persists
        one exact archive, repeats unchanged, then proves changed package/tag/revision/evidence cannot reuse it.
  - [x] Assert representative Git/GitHub/npm/trust observation fixtures and the repository tag set remain
        unchanged on success and failure; the implementation must expose no remote mutation capability.
  - [x] Run the focused distribution unit/integration band, typecheck, Biome, build, explicit `dist`/pack and
        generated-deliverable non-leakage checks, plus the real artifact journey. Leave the exact full
        `npm test` to the independent reviewer after the product/test diff is stable.

## Dev Notes

### Scope and Outcome

This story turns Story 1.2's accepted archive and Story 1.3's consumer proof into one durable local candidate.
It does not decide whether the package will be public, whether npm or GitHub is primary, or whether the
proposed tag is authorized. A successfully prepared candidate is locally usable and auditable while its
distribution state remains `inactive`, its activation remains `disabled`, and its release eligibility remains
`ineligible` until later human-authorized facts exist.

Keep the implementation narrow: one candidate binding and one maintainer command. GitHub staging, npm
publication assessment, and combined channel classification are Stories 1.5-1.7. Tags, releases, assets,
publication, dist-tags, trust configuration, credentials, and all remote writes are outside this branch.

### Required Reuse

- `distribution-preparation/package-archive.js` reads the real gzip/tar bytes and packed manifest. Use it to
  re-observe the supplied archive rather than trusting paths or shelling out to a platform archive tool.
- `distribution-preparation/packed-install.js#validateInspectedPackageReport` already validates an accepted
  Story 1.2 report against current archive bytes, source binding, identity, executables, size, and generic
  declared paths. Extend or compose that contract; do not create a parallel package inspector.
- `distribution-preparation/verify-packed-install.js` emits accepted revision/package/artifact/install/bin/
  resource/config evidence. Validate the fields that establish acceptance and same-artifact binding; do not
  rerun installation or invent a second consumer harness during candidate preparation.
- `distribution-preparation/readiness.js#assessInactiveDistribution` owns the closed unresolved activation-fact
  inventory and always refuses publication capability. Reuse its result rather than duplicating or deciding
  public policy facts.
- Preserve the TASK-109 review fixes: current artifact/frozen-byte evidence, source-independent consumer paths,
  Node-before-npm preflight, and platform-safe executable behavior remain part of the upstream proof.

### Candidate Binding

The persisted record should be self-describing and relocatable. It needs stable relative references to the
persisted archive/evidence plus the observed values required by the ACs. A practical binding includes:

- candidate identity and prepared/inactive state;
- package name/version, proposed tag, and clean source revision;
- persisted artifact filename, exact byte size, SHA-256, and SHA-512;
- digests and acceptance summaries for the inspection, quality, and packed-install evidence;
- release-note preview plus its digest; and
- Story 1.1's inactive readiness result and complete unresolved-fact list.

The candidate identity is a digest of a canonical, versioned binding—not a random ID or timestamp. Canonical
input must contain package/version, proposed tag, revision, artifact size/digests, required evidence digests,
and notes digest. Sort object keys and any unordered named-check collection deterministically. Do not include
absolute paths, mtimes, creation time, temp directories, or presentation-only fields. Store timestamps only if
they are explicitly outside identity and do not make an unchanged rerun look different.

Hash exact bytes with Node's streaming hash API so package size is not assumed. Record both SHA-256 (matching
GitHub release-asset digest vocabulary) and SHA-512 (usable alongside later npm integrity evidence), while
later channel comparison still hashes the same candidate bytes rather than equating unlike platform strings.

### Verification Evidence

- Inspection evidence must be `accepted`, have no violations, bind one clean source revision, and still match
  the current archive identity, executables, size, declared set, and actual paths.
- Packed-install evidence must be `accepted`, bind the same source revision and package identity, identify the
  same inspected archive and size, report installed status, accepted executables/resources, and unchanged
  coding-agent configuration. If its frozen archive remains available, verify its bytes match the candidate;
  otherwise reject evidence that cannot still establish the exact-artifact relationship.
- Quality evidence is a deliberately small local JSON contract: accepted status, the same source revision,
  and a non-empty named check set whose required checks all passed. Bind its exact bytes. Do not run or parse
  terminal transcripts, and do not weaken acceptance to a bare boolean with no named evidence.
- Release notes are a caller-supplied local preview, not a changelog policy engine. Require non-empty text,
  preserve the exact preview, and bind its bytes/digest. Do not infer channel role or release class from it.

Input decoding and observation failures should be accumulated wherever independent observations can continue.
One malformed report must not hide a missing notes preview or a second package/revision mismatch. Stable
machine-readable finding kinds and affected binding fields will let Stories 1.5-1.7 refuse channel assessment
without parsing prose.

### Persistence and Reruns

Write only after the full input binding is accepted. Stage a complete candidate next to its final destination,
verify its artifact/evidence bytes and record, then install the finished directory without overwriting an
existing destination. Node documents that copy operations are not atomic, so a successful copy alone is not
the commit boundary; same-filesystem final rename plus post-write verification is the safer local shape.

On rerun, inspect the existing record and persisted files first:

- same canonical binding and valid persisted bytes: report reuse of the same candidate identity;
- missing/corrupt prior files: report every inconsistency and preserve what exists;
- different artifact/tag/revision/evidence/notes binding: report each changed field and refuse reuse;
- no valid prior candidate and accepted new binding: create exactly one candidate.

Do not silently overwrite, suffix a directory, mint a replacement ID, or rebuild the archive. A later caller
must never be able to mistake two candidates for one release attempt.

### Inactivity and External-State Guardrails

Candidate preparation may read local files only. It does not need a subprocess, Git command, registry query,
GitHub client, npm client, network port, credential, token, or trust-setting adapter. The source revision comes
from the clean inspection/install evidence; the proposed tag is inert data, not a request to create a tag.

The no-write proof should cover both structural absence and observable fixtures. Snapshot the repository's tag
set and representative supplied external-state/trust files before success and failure journeys and assert they
remain unchanged. Keep `package.json#private: true`, the absent release workflow/publish script/credentials,
and the public inactive-language guard intact. Do not claim that local preparation inspected real remote state;
Stories 1.5 and 1.6 own supplied/read-only channel observations.

### Error and Command Contract

- A successful new or reused candidate exits 0 and emits structured output naming the stable identity, record,
  persisted artifact, digests, and inactive readiness.
- Invalid command syntax exits 2.
- Missing, malformed, inconsistent, changed, or corrupt evidence exits 1 with a structured rejected result
  containing every observable discrepancy. If a prior candidate exists, leave it unchanged.
- Avoid command names containing `publish` or `release`; those imply capabilities this increment intentionally
  does not have. A package script may expose local candidate preparation explicitly.

### Testing Requirements

- Pure evaluator tests: canonical identity stability across binding-object construction order and input-location
  changes when the exact evidence bytes are unchanged; all required binding dimensions; aggregate missing/
  malformed/mismatched observations; stable finding order; and changed candidate comparisons.
- Persistence tests: exact stored bytes/digests/evidence, unchanged reuse, refusal to overwrite or create a
  second identity, corrupt prior state, safe cleanup of failed staging, and output paths with spaces.
- Real acceptance journey: from a clean copied Git revision, produce one accepted package report, run the real
  fresh packed-install verifier with a persistent output, supply accepted quality evidence and notes, prepare
  the candidate, and verify the stored archive bytes match the inspected and installed frozen copies.
- Scope tests: no channel mutation modules/commands, repository tags or supplied channel/trust fixtures change;
  candidate preparation files remain typechecked/linted but absent from `dist`, the npm ship set, and generated
  zip/tar/Git/conditional-zip deliverables.

### Project Structure Notes

Expected refinement, not a frozen filename mandate:

- Candidate evaluation and local persistence belong under `distribution-preparation/`.
- Focused pure/helper tests belong under `test/unit/distribution-preparation/`.
- The real exact-artifact journey belongs under `test/integration/distribution-preparation/`.
- A convenient package script is allowed if its name and behavior remain plainly local and non-publishing.
- Do not edit the design set, Backlog.md, SDLC state, agent instructions, product core, publication workflow, or
  public acquisition guidance.

### Previous Story Intelligence

- Story 1.3 is `done` after independent review: 5/5 ACs, 0 open findings, 83/83 focused tests, and the exact
  stable full suite at 1,368/1,368. Its final executable product/test hash was
  `6f9ff96d046ffa5f96c10bc5ad34f7d2f2658c90122e916ed3a65fc36e7bf2db`.
- Story 1.3's accepted report deliberately contains no digest or candidate identity. It records
  `artifact.inspectedPath`, `artifact.frozenPath`, and size so this story can establish exact-byte digests.
- Story 1.2 produces a single accepted archive from a clean revision and already detects late revision drift,
  traversal/link/tar corruption, manifest/bin mismatches, missing required paths, and prohibited/local files.
  Candidate preparation consumes that artifact; it never invokes `npm pack`.
- The shared preparation public-surface test maintains an explicit inventory. Add new preparation modules to
  that inventory and keep package scripts free of `publish`/`release` names.

### Git Intelligence

- Baseline: `95e41c6dfb592ed0233885938aaec7c5130bcb99` on
  `feature/authoring-agent-onboarding-task-110`.
- Relevant commits: `960e195` (Story 1.2 package boundary), `79f9800` (Story 1.3 packed install), and reviewer
  merge `eb6399c` followed by task-transition commit `95e41c6`.
- No `docs/00`-`docs/14` file changed since this persistent worker's full preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`. TASK-109's final story/QA/review and reviewer-changed package
  install modules/tests were re-read before creating this story.

### Latest Technical Information

- Node.js crypto documentation, accessed 2026-08-21: streaming `crypto.createHash()` is recommended for data
  that may be large, and SHA-256/SHA-512 are supported digest names: <https://nodejs.org/api/crypto.html>.
- Node.js filesystem documentation, accessed 2026-08-21: `copyFile`/`copyFileSync` make no atomicity guarantee;
  exclusive copy and same-filesystem rename semantics should inform safe local persistence:
  <https://nodejs.org/api/fs.html>.
- Execution environment observed during story creation: Node `v22.22.1`, npm `10.9.4`. Preserve the declared
  Node >=20 and CI Node 20/22 support contract; add no dependency for hashing or canonical JSON.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-14-Produce-an-Inactive-Verifiable-Candidate]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/addendum.md#Deferred-distribution-activation-inputs]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#User-Story-Map-Preparation-Now-Activation-Later]
- [Source: _bmad-output/implementation-artifacts/1-2-establish-the-clean-exact-package-boundary.md]
- [Source: _bmad-output/implementation-artifacts/1-3-deliver-a-fresh-local-packed-install-journey.md]
- [Source: _bmad-output/implementation-artifacts/tests/test-summary-task-109.md]
- [Source: distribution-preparation/readiness.js]
- [Source: distribution-preparation/package-archive.js]
- [Source: distribution-preparation/packed-install.js]
- [Source: distribution-preparation/verify-packed-install.js]

## Dev Agent Record

### Agent Model Used

GPT-5.6 (Codex persistent worker)

### Debug Log References

- 2026-08-21: literal `bmad-create-story` activation in YOLO mode; customization resolved with no prepend,
  append, override, matching `project-context.md`, or completion hook.
- 2026-08-21: full source preload revision retained at
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`; no canonical design documents changed through baseline
  `95e41c6dfb592ed0233885938aaec7c5130bcb99`.
- 2026-08-21: create-story checklist completed in YOLO mode; all critical categories passed after explicit
  reuse, exact-evidence, aggregate-finding, deterministic-rerun, safe-persistence, inactivity, and non-leakage
  guardrails were included.
- 2026-08-22: literal `bmad-dev-story` activation in YOLO mode; customization resolved no prepend/append,
  override, matching `project-context.md`, or completion hook. The current direct-specialist fast-feedback
  policy reserved the one exact full `npm test` for the independent reviewer.
- 2026-08-22: RED evaluator test failed because `candidate.js` was absent; GREEN reached 4/4. RED persistence
  test failed because `prepare-candidate.js` was absent; GREEN reached 7/7, then 8/8 after persisted semantic-
  evidence recomputation closed a coordinated raw-digest corruption gap.
- 2026-08-22: real clean-copy -> pack/inspect -> source deletion -> packed install -> candidate RED reached the
  missing `package:prepare-candidate` script. GREEN passed the full journey, unchanged reuse, changed-tag
  refusal, exact-byte equality, inactive readiness, and Git/external-state no-write snapshots.
- 2026-08-22: literal `bmad-qa-generate-e2e-tests` activation in YOLO mode; customization resolved no
  prepend/append steps, override, matching `project-context.md`, or completion hook. QA strengthened exact
  persisted evidence/notes and unresolved-fact assertions plus structural channel-mutation non-leakage.

### Implementation Plan

- Keep candidate evaluation deterministic and local: normalize the required inspection, quality, install, and
  notes evidence; aggregate independent findings; derive identity from canonical binding facts and exact
  evidence-byte digests.
- Persist one verified directory through adjacent staging and no-overwrite rename; validate stored artifact,
  evidence, notes, identity, and inactive readiness on creation and every reuse.
- Expose one maintainer-only package script and retain structural/runtime non-leakage and no-write evidence.

### Completion Notes List

- Story context created from TASK-110, Epic 1 Story 1.4, FR42, NFR16-NFR17, final readiness evidence, the dual-
  channel investigation, and final Stories 1.2/1.3 implementation and review intelligence.
- The story deliberately leaves candidate schema filenames and internal function shapes refinable while fixing
  the observable binding, reuse/conflict, aggregate-finding, and no-write contracts.
- Added one stable SHA-256 candidate identity over package/version, proposed tag, clean source revision, exact
  archive SHA-256/SHA-512, semantic and exact evidence-byte digests, and release-note digest/preview. Record
  storage paths and timestamps do not perturb identity.
- Candidate creation stages and verifies exact files before a no-overwrite rename. Reuse revalidates persisted
  archive and semantic evidence; changed or corrupt bindings return every observed finding and preserve the
  original directory.
- The command embeds Story 1.1's complete inactive/unresolved-fact result and imports no subprocess, network,
  registry, GitHub, credential, trust, or mutation surface. Real tests preserve repository tags and supplied
  GitHub/npm/trust snapshots on success and failure.
- Final dev focused evidence: 61/61 distribution unit tests; 21/21 package/assessment/install/candidate/public-
  surface integration tests; 1/1 real generated tar/Git/conditional-zip non-leakage test; typecheck, full Biome
  lint (221 files), build, explicit `dist` exclusion, and `git diff --check` passed. Product/test hash:
  `64054371ab330aed263d8fae9d353c0796fdad59f9b60297989ffde29f5e83ed`.
- The exact full `npm test` was not run in dev per the parent task and proportional-review policy; it remains the
  independent reviewer's stable-diff gate.
- Final QA evidence: 18/18 selected tests across candidate unit, public-surface, real clean-package candidate,
  and tarball/Git/conditional-zip non-leakage bands; typecheck, Biome (221 files), build, explicit `dist`
  exclusion, and `git diff --check` passed. Final executable product/test hash:
  `8cfebc3f911bf8dd4ea4cdfe1b6d8b2018a3bc1e07c756ee1c27c4cb837c8376`.

### File List

- `_bmad-output/implementation-artifacts/1-4-produce-an-inactive-verifiable-candidate.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-110.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `distribution-preparation/candidate.js`
- `distribution-preparation/prepare-candidate.js`
- `package.json`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/candidate.test.ts`
- `test/unit/distribution-preparation/prepare-candidate.test.ts`

### Change Log

- 2026-08-22: Implemented and verified deterministic inactive candidate binding, exact local persistence,
  aggregate inconsistency reporting, unchanged reuse/changed-binding refusal, and no-write/non-leakage evidence.
- 2026-08-22: QA strengthened exact-evidence, unresolved-fact, structural no-mutation, and generated-artifact
  non-leakage coverage; all focused QA and proportional static/build gates passed.
- 2026-08-22: Independent automatic-fix review closed exact-evidence identity, packed-install completeness,
  no-overwrite, corrupt-state/path/link, and malformed-text gaps; the stable full suite passed 1,385/1,385.

## Senior Developer Review (AI)

### Outcome

**APPROVE — 6/6 acceptance criteria satisfied, 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode against TASK-110, this story,
its QA evidence, the complete in-scope diff, Stories 1.2/1.3 regressions, and the unchanged design set.

### Findings Resolved

- **HIGH:** exact evidence-byte digests were stored but excluded from identity/reuse comparison, allowing a
  byte-changed report with the same semantic summary to reuse the prior candidate.
- **HIGH:** the POSIX directory rename could replace an empty destination created after the existence check.
  Persistence now claims the destination exclusively, moves `candidate.json` last, verifies the installed
  result, and rolls back owned entries without deleting concurrent unknown content.
- **HIGH:** incomplete inactive-fact inventories and coordinated record corruption could be reused. Record,
  schema, complete readiness, canonical binding metadata, exact files, and identity are now revalidated.
- **HIGH:** packed-install evidence could omit a declared executable, report a wrong target/version, omit
  resolved resources/probe/config observations, or omit artifact/npm/shim facts while remaining accepted.
- **HIGH:** traversal aliases and candidate-owned symlinks could redirect persisted evidence reads. Candidate
  paths are now canonical portable relative paths, ordinary files only, with symlink/hard-link and read-race
  guards.
- **MEDIUM:** malformed evidence/notes bytes were decoded with replacement characters; exact UTF-8 is now
  required and reported structurally.

### Verification

- Candidate unit review band: **16/16 passed**; all distribution units: **69/69 passed**.
- Public-surface/non-capability integration: **8/8 passed**.
- `npm run typecheck`, repository-wide `npm run lint` (**221 files**), `npm run build`, and
  `git diff --check`: **passed**.
- npm dry-run ship set: **421 entries**, with **0** candidate/distribution-preparation files leaked.
- One exact stable-diff `npm test`: **111/111 files, 1,385/1,385 tests passed** in **478.49s**.
- Stable executable product/test hash:
  `c73ffd42bd752c5ba2bab2dacbe36ea0d1c6751e789413e91d61a9722cce1ac6`.

### Workflow Customization

No activation prepend/append, workflow override, matching `project-context.md`, or completion hook applied.
Backlog, SDLC state, contributor instructions, branch, commits, and merge state were not changed by review.
