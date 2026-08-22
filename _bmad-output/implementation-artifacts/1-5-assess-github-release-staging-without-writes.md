---
baseline_commit: f13549ce6be892b8a3ac45bb1bebc87c21478038
---

# Story 1.5: Assess GitHub Release Staging Without Writes

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-111. -->

## Story

As a WPM maintainer,
I want a no-write assessment of the candidate against GitHub policy and observed state,
so that missing prerequisites and conflicts are known before activation is authorized.

## Acceptance Criteria

1. Given an inactive verified candidate and GitHub policy and state supplied by the caller or available through
   permitted read-only observation, when GitHub staging is assessed, then the required tag, draft metadata,
   exact assets, checksums, notes, evidence, and unresolved policy facts are reported.
2. Given observed GitHub state matches the candidate, when assessment completes, then matching tags, drafts,
   releases, and assets are recognized without proposing duplicates.
3. Given a tag targets another commit or a release or asset conflicts with the candidate, when assessment
   completes, then the affected object and hard conflict are identified.
4. Given any assessment outcome, when Git and GitHub state are inspected afterward, then nothing has been
   created, changed, moved, or deleted.

## Tasks / Subtasks

- [x] Define one deterministic GitHub staging assessment (AC: 1-3)
  - [x] Consume one fully revalidated Story 1.4 candidate plus caller-supplied GitHub policy and observation
        documents; reject a corrupt, changed, non-inactive, or differently bound candidate before assessment.
  - [x] Derive one inspectable requirement view from the candidate: proposed tag and source revision, draft
        release metadata, exact package asset name/size/SHA-256/SHA-512, exact notes, candidate/evidence digests,
        and the complete unresolved activation-fact result.
  - [x] Keep observation and requirement order canonical so the same candidate, policy, and snapshot produce
        byte-stable semantic results independent of caller object/array order.
- [x] Recognize absent, compatible, and conflicting GitHub state without duplicate proposals (AC: 1-3)
  - [x] Report only genuinely absent tag/release/asset requirements; recognize a matching draft or already
        published release and matching uploaded assets without proposing another object or upload.
  - [x] Identify every hard conflict for the candidate tag, release metadata/notes, or same-name asset whose
        target revision, identity, size, state, or digest disagrees; distinguish missing proof from observed
        incompatible state and aggregate independent findings.
  - [x] Keep the assessment GitHub-local. Do not classify npm state or the combined six-state convergence owned
        by Stories 1.6 and 1.7.
- [x] Expose one local read-only maintainer command (AC: 1-4)
  - [x] Accept a candidate directory and local policy/observation JSON; emit a structured assessment with a
        machine-distinguishable usage failure and invalid/corrupt-input failure.
  - [x] Reuse the reviewer-hardened persisted-candidate validation/read boundary rather than rebuilding,
        trusting a naked record, or adding a second artifact inspector.
  - [x] Add no credential/token input, authorization flow, network mutation, tag/release/draft/asset writer,
        Git mutation, activation path, npm concern, or product CLI command.
- [x] Add focused RED-to-GREEN automation and proportional gates (AC: 1-4)
  - [x] Unit-test missing, exact matching draft, exact matching published release, partial compatible state,
        tag-target conflict, release conflict, asset size/digest/state conflict, aggregate findings, and stable
        order using representative GitHub REST response-shaped observations.
  - [x] Add a real local candidate-to-assessment journey that snapshots candidate inputs, repository tags, and
        representative GitHub observation files before ready/matching/conflict outcomes and proves every byte,
        entry, and tag remains unchanged.
  - [x] Extend structural/non-leakage guards so assessment code has no subprocess, HTTP/fetch, Octokit/GitHub
        client, credential, GitHub/Git mutation, npm, `dist`, npm ship-set, or generated-deliverable surface.
  - [x] Run focused distribution unit/integration tests, typecheck, Biome, build, explicit `dist`/pack and
        generated zip/tar/Git non-leakage checks. Leave the exact full `npm test` to the independent reviewer.

## Dev Notes

### Scope and Outcome

This story is a rehearsal, not a release operation. It converts one exact persisted inactive candidate and a
declarative GitHub snapshot into an auditable statement of what is missing, already compatible, unverifiable,
or conflicting. It must remain useful while identity, channel-role, release-class, immutability, recovery, and
authority facts are unresolved; those facts stay explicit and activation stays disabled.

The command may consume caller-supplied observations only. A later adapter may obtain the same observation
shape through explicitly permitted read-only requests, but this story does not add that adapter, credentials,
authentication, or network access. It does not create or move a Git tag, create/edit/publish a draft or
release, upload/delete an asset, change repository settings, or claim that GitHub staging occurred.

### Required Reuse and Preserved Behavior

- `distribution-preparation/prepare-candidate.js#validatePersistedCandidate` is the accepted exact-candidate
  verifier. Reuse it, including its ordinary-file/path/link/race, canonical-binding, exact evidence-byte,
  complete readiness, and semantic revalidation checks. If a narrow safe record-loading export is needed,
  refine that module rather than duplicating its security-sensitive reader.
- `distribution-preparation/candidate.js` owns candidate binding and identity. The GitHub evaluator consumes
  its verified output; it does not recalculate a weaker identity or inspect/rebuild the npm archive.
- `distribution-preparation/readiness.js#assessInactiveDistribution` owns the closed activation-fact inventory.
  Evaluate supplied policy facts through it and retain its always-inactive/no-publication result; do not parse
  free-form policy prose or invent resolved decisions.
- Preserve all TASK-110 review corrections: exact evidence bytes participate in identity; packed-install proof
  is complete; destinations cannot be overwritten; corrupt readiness/metadata/path/link/UTF-8 state fails
  closed. Story 1.4 finished APPROVE with 0 open findings and 1,385/1,385 stable-diff tests.

### Assessment Contract

Keep one small, versioned, plain-data boundary. Exact internal names remain refinable, but the observable
contract must carry:

- candidate ID, package/version, proposed tag, source revision, inactive eligibility, and exact candidate
  artifact name/size/SHA-256/SHA-512;
- required release metadata derived from local input: tag name, target revision, release name, notes body and
  digest, draft staging intent, stable/prerelease projection when supplied, and immutability expectation when
  supplied;
- candidate proof: inspection, quality, packed-install semantic and raw digests plus notes digest;
- a canonical list of expected assets. At minimum this contains the one exact candidate `.tgz`; checksums and
  evidence are explicit fields and must not imply independently rebuilt bytes. Optional additional required
  asset declarations, if supported, must use the same generic name/size/digest comparison rather than
  artifact-type branches;
- per-object observation status for the candidate tag, same-tag release/draft, and each expected or colliding
  asset; genuinely missing work only, matching existing objects only, every hard conflict, and every unresolved
  activation fact; and
- explicit `activation: disabled`, `releaseEligibility: ineligible`, and no publication capability on every
  result, including synthetically complete policy input.

Use the candidate's exact notes bytes/digest and artifact SHA-256 for GitHub asset comparison. Keep SHA-512 in
the report for later cross-channel evidence, but do not compare unlike GitHub SHA-256 and npm integrity
representations. Do not treat GitHub-generated source archives as candidate assets.

### Observation and Conflict Semantics

Representative observations should mirror only stable facts exposed by GitHub's read responses, without
copying a full API payload: resolved tag name/target revision; release identity/tag/name/body/draft/prerelease/
immutable state; and asset identity/name/state/size/SHA-256 digest. IDs are evidence locators, not candidate
identity inputs. Normalize unordered releases/assets by stable keys and reject ambiguous duplicates.

- No relevant tag/release/asset: report the exact missing requirement; this is not a conflict.
- Exact tag plus absent release: recognize the tag and report only the missing draft/release requirements.
- Matching draft: recognize it and report only missing expected assets; do not propose another draft.
- Matching published release: recognize compatible completed GitHub state; do not propose a draft, republish,
  rollback, or replacement.
- Same-name tag at another revision: hard conflict naming the tag and both target revisions.
- Same-tag release whose required name, notes digest, release-class projection, or candidate evidence disagrees:
  hard conflict naming the release and affected field. A missing observable digest/proof is `unverified`, not a
  fabricated match.
- Same-name asset with non-uploaded state, wrong size, or wrong SHA-256: hard conflict naming the asset and
  affected field. Missing expected assets remain missing; no upload is performed.
- Aggregate independent conflicts and missing/unverified facts in stable field/object order. Never recommend
  overwrite, deletion, retagging, replacement, or version reuse.

### Read-Only Boundary and Command Contract

Keep new assessment logic under `distribution-preparation/`, outside `src/core`, `dist`, the npm `files`
allowlist, and generated work-package deliverables. A local package script may expose the evaluator if its name
is explicitly assessment-only and contains neither `publish` nor `release`.

- Exit 0 for a valid assessment, including blocked, matching, partial, or conflicting observations; conflicts
  are assessment data, not a command crash.
- Exit 2 for invalid invocation syntax.
- Exit 1 for unreadable/malformed policy or observation input, invalid schema, or a candidate that fails exact
  persisted validation. Aggregate independently readable input problems where practical.
- Emit structured JSON only. Never accept a token, infer authority from environment variables, call `git`,
  `gh`, `curl`, `fetch`, Octokit, or an HTTP module, or write an assessment/cache/receipt file.

### Testing Requirements

- Pure tests should cover deterministic requirements and object-order independence; empty/partial/matching
  draft/matching public state; ambiguous duplicates; incompatible tag revision; release name/notes/class/
  evidence conflicts; asset state/size/digest conflicts; missing digest/proof; and aggregate stable findings.
- Command tests should cover usage, malformed local JSON, invalid/corrupt candidate, structured valid output,
  and no output-file creation. Use isolated local fixtures and no live GitHub request.
- The acceptance journey should prepare a real candidate through the existing local chain or reuse a complete
  reviewer-grade fixture, snapshot the candidate tree and observation inputs byte/link-wise plus `git tag
  --list`, run missing/matching/conflicting assessments, and prove all snapshots unchanged.
- Public-surface tests should reject subprocess/network/client/credential/write capability, retain `private:
  true`, and prove the new files stay outside `dist`, `npm pack --dry-run`, and generated tar/Git/conditional-zip
  deliverables.

### Project Structure Notes

- Expected new surfaces: one pure GitHub assessment module, one thin local JSON/CLI adapter, focused unit and
  integration tests, one package script, and brief maintainer documentation. Exact filenames are not frozen.
- Expected update surfaces: the reviewer-hardened candidate reader only if needed for safe reuse; shared
  distribution public-surface inventory; package metadata/docs. Preserve its existing preparation behavior.
- Do not edit `src/core/**`, product CLI commands/help, release workflows, credentials, Backlog.md, SDLC state,
  `AGENTS.md`, `docs/SDLC.md`, `.serena`, or canonical design docs.

### Previous Story Intelligence

- Story 1.4 is done after independent automatic-fix review: 6/6 ACs, 0 open findings, candidate unit 16/16,
  distribution unit 69/69, public surface 8/8, and full suite 1,385/1,385. Stable executable product/test hash:
  `c73ffd42bd752c5ba2bab2dacbe36ea0d1c6751e789413e91d61a9722cce1ac6`.
- Its persisted candidate is relocatable and self-describing. Revalidation reads ordinary candidate-owned files
  safely, confirms exact archive/evidence/notes bytes, reconstructs the canonical binding, and compares the
  complete inactive readiness result.
- Candidate storage paths and observation/API IDs must not affect GitHub assessment semantics. Candidate ID,
  exact bytes/digests, proposed tag, revision, notes, and evidence do.
- Story 1.6 independently assesses npm. Story 1.7 combines both channel reports and owns the named
  blocked/ready/matching/resumable/conflicting/complete convergence classifier.

### Git Intelligence

- Baseline for story creation: `f13549ce6be892b8a3ac45bb1bebc87c21478038` on
  `feature/authoring-agent-onboarding-task-111`.
- Relevant commits: `d999b63` (TASK-110 implementation/review fixes), `fc4ce57` (TASK-110 merge), and `f13549c`
  (epic transition). The previous story baseline was `95e41c6`.
- No `docs/00`–`docs/14` file changed since this persistent worker's complete preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`; no canonical design document required re-reading.

### Latest Technical Information

- GitHub's current Releases REST response exposes `tag_name`, `target_commitish`, `name`, `body`, `draft`,
  `prerelease`, `immutable`, and assets. Asset responses expose `name`, `state`, `size`, and a
  `sha256:<hex>` digest. Accessed 2026-08-22:
  <https://docs.github.com/en/rest/releases/releases?apiVersion=latest> and
  <https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28>.
- GitHub documents immutable releases as locking associated assets and the Git tag after publication and
  generating a release attestation. Assessment may report this supplied/read-only fact; configuring or
  enabling it is deferred. Accessed 2026-08-22:
  <https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases>.
- GitHub's integrity guide verifies uploaded release assets and explicitly excludes generated source ZIP/TAR
  archives from local-asset verification. Accessed 2026-08-22:
  <https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity>.
- Runtime observed during story creation: Node `v22.22.1`, npm `10.9.4`, Vitest `4.1.7`. Preserve Node >=20
  and CI Node 20/22; add no dependency or GitHub SDK.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-15-Assess-GitHub-Release-Staging-Without-Writes]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/addendum.md#Deferred-distribution-activation-inputs]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Finding-8]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#User-Story-Map-Preparation-Now-Activation-Later]
- [Source: _bmad-output/implementation-artifacts/1-4-produce-an-inactive-verifiable-candidate.md]
- [Source: _bmad-output/implementation-artifacts/tests/test-summary-task-110.md]
- [Source: distribution-preparation/candidate.js]
- [Source: distribution-preparation/prepare-candidate.js]
- [Source: distribution-preparation/readiness.js]

## Dev Agent Record

### Agent Model Used

GPT-5.6 (Codex persistent worker)

### Debug Log References

- 2026-08-22: literal `bmad-create-story` activated in YOLO mode; customization resolved no prepend/append,
  matching `project-context.md`, override, or completion hook.
- 2026-08-22: retained complete preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`; canonical docs/00–14 remained unchanged through baseline
  `f13549ce6be892b8a3ac45bb1bebc87c21478038`.
- 2026-08-22: literal `bmad-dev-story` activated in YOLO mode; customization resolved no prepend/append,
  matching `project-context.md`, override, or completion hook. The exact full `npm test` remains reserved for
  the independent reviewer under the current proportional fast-feedback policy.
- 2026-08-22: literal `bmad-qa-generate-e2e-tests` activated in YOLO mode; customization resolved no
  prepend/append, matching `project-context.md`, override, or completion hook. QA selected the real corrupt-
  candidate/no-write seam and the synthetically complete-yet-inactive policy boundary.

### Implementation Plan

- Keep GitHub assessment deterministic and effect-free: normalize one exact inactive candidate, declarative
  policy, and caller-supplied observation into canonical requirements, matches, missing proof, and conflicts.
- Reuse Story 1.4's hardened persisted-candidate reader through one narrow exported loader and expose only a
  local JSON-reading command with distinct usage and invalid-input exits.
- Prove compatibility, conflict aggregation, no duplicate proposals, and no writes through pure tests, the
  real clean-package/install/candidate journey, and structural/generated-artifact non-leakage gates.

### Completion Notes List

- Ultimate context engine analysis completed: story grounded in TASK-111, Story 1.5/FR43, TASK-110's reviewed
  exact-candidate boundary, current official GitHub read response fields, and strict no-write deferrals.
- Added a canonical GitHub-only assessment report carrying candidate/package/tag/revision identity, exact
  draft metadata, notes and evidence digests, SHA-256/SHA-512 asset requirements, unresolved activation facts,
  and stable match/missing/unverified/conflict collections.
- Matching draft and published release state is recognized without duplicate proposals. Same-name tag,
  release, and asset ambiguity plus target, metadata, notes, immutability, class, digest, size, and upload-state
  conflicts are distinguished from absent or unverified state and aggregated deterministically.
- The local `package:assess-github` command reads and revalidates one persisted candidate plus local policy and
  observation JSON. It exposes no token, authority, network, subprocess, Git, GitHub mutation, npm, activation,
  or product-CLI surface.
- RED evidence: evaluator unit test failed on the absent `github-assessment.js`; command unit test failed on the
  absent `assess-github.js`; the real packed-install journey failed with status 1 because npm reported missing
  script `package:assess-github`. GREEN evidence: new unit band 13/13, complete distribution units 82/82,
  combined distribution integration 23/23, and the real clean journey 2/2.
- Final dev gates passed: typecheck; repository-wide Biome over 225 files; production build; public-surface
  guard 9/9; generated tar/Git/conditional-zip non-leak 1/1; no assessment code under `dist`; npm dry-run ship
  set 421 entries with zero assessment/distribution-preparation leaks; and `git diff --check`. Executable
  product/test aggregate hash: `807a502a73bda2ea730b9b9f015de4aa802a484e6bafaec7f127f3184a104536`.
- The exact full `npm test` was deliberately not run in dev under the parent task and proportional-review
  policy; the independent reviewer owns that single stable-diff gate. Dev-story checklist verdict: PASS.
- QA strengthened the real command boundary so a changed persisted candidate is rejected by the production
  hardened loader while the corrupt tree, policy/observation, tags, and external state remain unchanged. It
  also pins that fully supplied activation facts cannot enable publication. Final QA evidence: distribution
  unit 83/83; distribution integration 23/23; generated non-leakage 1/1; typecheck, Biome (225 files), build,
  explicit `dist`/npm-pack exclusion, and diff hygiene passed. Final executable product/test aggregate hash:
  `77a49de3609f6bc63efa80a346f78587b67a6da5a2078f1d698a673ed06bde00`. QA checklist verdict: PASS.
- Independent automatic-fix review closed exact-candidate, closed-schema, malformed-observation, nullable
  release metadata, stable-input-read, and deterministic-duplicate gaps. Final review evidence passed 89/89
  distribution units, 23/23 distribution integrations, and the stable full suite at 1,406/1,406 with 0 open
  findings. Reviewed executable product/test hash:
  `135b2193be4b27b7b75be75e6e28960f4a93eac56bc55e6f81fa7443e6856c19`.

### File List

- `_bmad-output/implementation-artifacts/1-5-assess-github-release-staging-without-writes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-111.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `distribution-preparation/assess-github.js`
- `distribution-preparation/github-assessment.js`
- `distribution-preparation/prepare-candidate.js`
- `package.json`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/assess-github.test.ts`
- `test/unit/distribution-preparation/github-assessment.test.ts`

### Change Log

- 2026-08-22: Created Story 1.5 implementation context through literal `bmad-create-story` in YOLO mode.
- 2026-08-22: Implemented and verified deterministic read-only GitHub staging requirements, compatible-state
  recognition, aggregate hard conflicts, exact-candidate reuse, local command semantics, and no-write/
  non-leakage evidence through literal `bmad-dev-story` in YOLO mode.
- 2026-08-22: QA strengthened invalid-candidate/no-write and complete-policy/inactive coverage through literal
  `bmad-qa-generate-e2e-tests`; all focused acceptance, static, build, and non-leakage gates passed.
- 2026-08-22: Independent automatic-fix review resolved seven findings, completed the full adversarial audit,
  and approved the story after the exact stable-diff suite passed 1,406/1,406.

## Senior Developer Review (AI)

### Outcome

**APPROVE — 4/4 acceptance criteria satisfied, 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode against TASK-111, this story,
its QA evidence, the complete in-scope diff, TASK-108–TASK-110 regressions, and the unchanged design set.

### Findings Resolved

- **HIGH:** the exported pure evaluator accepted a candidate whose SHA-256 identity did not match its binding,
  whose inactive readiness inventory was incomplete, or whose evidence status was not accepted. It now checks
  the exact binding identity, complete canonical inactive result, accepted proof, and canonical candidate paths.
- **MEDIUM:** policy, activation-fact, release, tag, and asset typos or unknown fields were silently ignored.
  The versioned input projections are now closed and fail as invalid evidence instead of changing readiness or
  match semantics invisibly.
- **MEDIUM:** malformed asset digests, unresolved/malformed revisions, and traversal-style candidate asset
  names could be presented as ordinary conflicts or requirements. They now fail schema/exact-candidate
  validation, while a different valid SHA-256 or revision remains hard conflict data.
- **MEDIUM:** legitimate nullable/empty GitHub release name/body observations were rejected or coerced
  inconsistently. They now remain valid observed metadata and produce exact name/notes conflicts.
- **MEDIUM:** independently invalid policy and observation schemas collapsed to the first generic error. The
  command now aggregates one stable structured finding per independently invalid input.
- **MEDIUM:** caller policy/observation paths followed symbolic links and had no replacement/read-race guard.
  The adapter now reads a stable ordinary file descriptor, rejects links/non-files/path swaps, and remains
  read-only.
- **LOW:** when several locator identities were duplicated, the invalid-input detail depended on array order.
  Duplicate locator selection is now canonical; candidate tag/release/same-name asset ambiguity remains valid,
  deterministic conflict data.

### Verification

- GitHub evaluator/command review band: **20/20 passed**; all distribution units: **89/89 passed**.
- Complete distribution integration band: **23/23 passed across 4 files** in **100.66s**.
- `npm run typecheck`, repository-wide `npm run lint` (**225 files**), `npm run build`, and
  `git diff --check`: **passed**.
- Explicit `dist` inspection and npm dry-run ship set (**421 entries**) found **0** assessment or
  `distribution-preparation` leaks; generated-deliverable regression stayed green in the integration band.
- One exact stable-diff `npm test`: **113/113 files, 1,406/1,406 tests passed** in **568.29s**.
- Stable executable product/test hash:
  `135b2193be4b27b7b75be75e6e28960f4a93eac56bc55e6f81fa7443e6856c19`.

### Workflow Customization

No activation prepend/append, workflow override, matching `project-context.md`, or completion hook applied.
Backlog, SDLC state, contributor instructions, branch, commits, merge state, and excluded `.serena` content
were not changed by review.
