---
baseline_commit: 4640514d148e463486b60f744f35934aac28ef4c
---

# Story 1.6: Assess npm Publication Without Writes

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-112. -->

## Story

As a WPM maintainer,
I want a no-write assessment of the candidate against npm policy and observed state,
so that identity, authority, provenance, and immutable-version conflicts are known before activation.

## Acceptance Criteria

1. Given an inactive verified candidate and npm policy and state supplied by the caller or available through
   permitted read-only observation, when npm publication is assessed, then the required coordinate, version,
   exact artifact, final dist-tag, provenance, repository identity, authority, and unresolved policy facts are
   reported.
2. Given observed npm state matches the candidate and its approved final tag, when assessment completes, then
   it is recognized without proposing republication.
3. Given an immutable npm version has candidate-matching bytes and metadata but its approved final dist-tag is
   absent or differs, when assessment completes, then the version is reported as compatible state requiring
   later manual dist-tag authority rather than as a hard immutable-version conflict.
4. Given existing registry bytes or immutable metadata for the candidate version differ from the candidate,
   when assessment completes, then the affected version is reported as a hard conflict.
5. Given a compatible version still needs later manual dist-tag authority or an immutable version is
   conflicting, when assessment reports the recovery boundary, then overwrite, version reuse, republication,
   or automatic tag repair is not presented as safe.
6. Given any assessment outcome, when npm and trust state are inspected afterward, then no package, tag,
   ownership, credential, or trusted-publisher state has changed.

## Tasks / Subtasks

- [x] Define one deterministic npm publication assessment (AC: 1-5)
  - [x] Consume one fully revalidated Story 1.4 candidate plus closed caller-supplied policy and observation
        documents; reject corrupt, changed, non-inactive, or differently bound candidates before assessment.
  - [x] Report the proposed public coordinate, candidate version and exact `.tgz` identity, approved final
        dist-tag, required repository/provenance identity, publication authority, and every unresolved
        activation fact without treating proposed policy as authorization.
  - [x] Normalize registry SHA-512 SRI and candidate SHA-512 evidence to one comparable representation; never
        rebuild, download, or substitute an independently produced archive.
- [x] Classify npm-local state without inventing a write plan (AC: 2-5)
  - [x] Recognize an absent version, an exact matching immutable version, and an exact matching final tag;
        matching state must not contain a publication proposal.
  - [x] Treat a matching immutable version with a missing or differently targeted approved tag as compatible
        but incomplete and explicitly bound to later human dist-tag authority.
  - [x] Aggregate hard conflicts for mismatched package/version coordinates, exact artifact integrity, or
        immutable repository/provenance metadata; distinguish missing or unverified authority observations
        from immutable publication conflicts.
  - [x] Expose a fixed unsafe-action guard on every result: no overwrite, version reuse, republication,
        unpublish/republish, or automatic dist-tag repair.
- [x] Reuse the hardened assessment boundaries and expose one local read-only command (AC: 1-6)
  - [x] Share the Story 1.5 exact-candidate projection and stable ordinary-file JSON reader rather than
        copying security-sensitive candidate/path/link/race/schema machinery into a divergent npm variant.
  - [x] Accept a candidate directory and local policy/observation JSON, emit structured JSON, and retain
        machine-distinguishable invocation and invalid-input failures while valid conflicts remain data.
  - [x] Add no registry client, HTTP/fetch, subprocess, token/credential discovery, environment authority,
        package/dist-tag/owner/trust mutation, publication, activation, GitHub assessment, or convergence logic.
- [x] Add focused RED-to-GREEN automation and proportional gates (AC: 1-6)
  - [x] Unit-test unresolved policy, absent state, exact version/tag match, exact version with absent/different
        tag, integrity/repository/provenance conflicts, authority/trust observations, aggregate invalid input,
        canonical ordering, and stable reruns.
  - [x] Add a real prepared-candidate journey that snapshots the candidate, policy, registry/trust observation
        inputs, relevant npm configuration, and local credential surfaces before and after every outcome.
  - [x] Extend structural/non-leakage guards so npm assessment tooling has no write/network/credential surface
        and stays outside `dist`, npm pack, and generated zip/tar/Git deliverables.
  - [x] Run focused distribution unit/integration tests, typecheck, Biome, build, and explicit package/
        deliverable non-leakage checks. Leave the exact full `npm test` to the independent reviewer.

## Dev Notes

### Scope and Outcome

This is a maintainer rehearsal over one persisted inactive candidate and supplied/read-only facts. It reports
what npm would require and what the observations prove; it neither chooses nor claims the public coordinate,
final tag, repository, provenance policy, owners, or trusted publisher. Even a synthetically complete input
must remain inactive and ineligible for publication because authorization and all remote writes are deferred.

Story 1.6 owns npm-local assessment only. Do not repeat Story 1.5 GitHub logic and do not implement Story 1.7's
combined `blocked/ready/matching/resumable/conflicting/complete` classifier.

### Required Reuse and Preserved Behavior

- `distribution-preparation/prepare-candidate.js#loadPersistedCandidate` is the exact persisted-candidate read
  and verification boundary. Preserve ordinary-file/path/link/race checks, exact evidence bytes, canonical
  binding and identity, complete inactive readiness, and changed-candidate refusal.
- Story 1.5's pure guard independently revalidates the exact candidate projection, closed schemas, and complete
  inactive distribution state. Extract or expose only a genuinely channel-neutral helper if needed; npm must
  not import a GitHub-named abstraction or receive a copied weaker validator.
- Story 1.5's command hardened local JSON reads against symlinks, non-ordinary files, path swaps, read races,
  malformed UTF-8, and aggregate independently invalid files. Reuse one channel-neutral implementation.
- Preserve Story 1.5 review corrections: closed policy/observation/fact schemas; invalid candidate digests,
  revisions, paths, or activation facts fail closed; nullable external metadata remains representable conflict
  data; duplicate observations do not silently win; all findings have stable order.

### Assessment Contract

Keep a small versioned plain-data boundary. Exact internal names are refinable, but the result must expose:

- candidate ID, candidate package/version, proposed npm coordinate, exact archive filename/size/SHA-256 and
  SHA-512, final dist-tag, inactive eligibility, and complete unresolved activation facts;
- expected immutable publication metadata: coordinate/version, SHA-512 SRI for the exact candidate bytes,
  repository type/URL (and directory when explicitly applicable), and whether provenance with the expected
  repository/source identity is required;
- authority requirements and observations separately: first-publication/bootstrap authority, existing
  package ownership/maintainer evidence, expected trusted-publisher identity and allowed publication action,
  and any facts not observable from ordinary registry metadata. Missing evidence is unresolved/unverified,
  never inferred from environment variables or a credential;
- canonical matching, missing, unverified, manual-authority, and hard-conflict findings with the affected
  coordinate/version/tag/field and expected versus observed facts; and
- explicit `activation: disabled`, publication ineligibility, an empty safe-write plan, and the invariant that
  overwrite, version reuse, republication, unpublish/republish, and automatic tag repair are unsafe.

The policy may carry proposed values while their corresponding activation authorization facts remain
unresolved. Reporting a proposed value is not claiming it is approved. If the policy or observation shape is
invalid, aggregate independent input issues; do not silently default `latest`, infer a package scope, or infer
authority from the candidate's current private manifest.

### npm Observation and Conflict Semantics

Use a deliberately narrow observation shape rather than accepting arbitrary registry documents. It should
represent only facts needed for this story: package presence/coordinate, the candidate version if present,
that version's name/version, `dist.integrity`, repository identity, provenance identity/presence, the approved
tag target, and caller-supplied ownership/trusted-publisher observations. Absence and explicit unknown are
different. Normalize unordered owner or trust evidence and reject ambiguous duplicates.

- No candidate version: report the missing immutable version and all unresolved policy/authority facts; do
  not output a publish command or claim readiness.
- Matching candidate SHA-512 SRI plus matching immutable repository/provenance facts: recognize the immutable
  version and never propose republishing it.
- The same matching version with the approved tag missing or targeting another version: report compatible
  immutable state plus a `manual-authority` tag boundary. This is not a hard version conflict and is not an
  automatic repair instruction.
- A different SRI, package/version identity, repository identity, or required provenance identity/presence on
  the existing candidate version: hard conflict. npm's immutable name/version means overwrite, version reuse,
  unpublish-and-republish, or republication cannot recover it.
- Missing/contradictory owner, bootstrap, credential-policy, or trusted-publisher observations remain
  unresolved authority facts unless they prove an occupied/uncontrolled coordinate. They do not alter already
  published bytes and must not be mislabeled as an artifact match.
- Aggregate independent findings canonically. A valid hard-conflict assessment is still a successful command
  evaluation, not malformed input.

### Read-Only Boundary and Command Contract

Keep all new code in `distribution-preparation/`, outside `src/core`, `dist`, the npm `files` allowlist, and
generated work-package deliverables. A local script may expose assessment but must not imply publication.

- Exit 0 for every valid assessment, including unresolved, missing, matching, manual-authority, and conflict.
- Exit 2 for invalid invocation syntax.
- Exit 1 for unreadable/malformed/non-ordinary input, invalid schema, or failed exact-candidate verification.
- Emit structured JSON only and write no assessment receipt/cache. Do not accept secrets/tokens, inspect npm
  login state, read `.npmrc` as authority, invoke npm/HTTP, or add a registry/publisher/mutation port.

### Testing Requirements

- Pure tests cover field/order stability; policy-vs-authorization separation; candidate/corrupt-input guards;
  missing package/version; exact matching version and tag; matching version with missing/wrong tag;
  SHA-512 SRI normalization; repository/provenance conflicts; owner/trust unknowns; aggregate findings; and all
  prohibited-action invariants.
- Command tests cover usage, malformed and non-ordinary local JSON, invalid/corrupt candidate, structured
  valid findings, no output-file creation, and no secret/environment authority discovery.
- The acceptance journey starts from a real Story 1.4 candidate, snapshots candidate and observation trees
  byte/link-wise plus selected npm configuration and intentionally isolated credential-file paths, runs
  missing/matching/manual-authority/conflict assessments, and proves every snapshot unchanged.
- Public-surface tests reject subprocess, HTTP/fetch/registry clients, credential readers, mutation commands,
  and publication workflows; retain `private: true`; and prove assessment files do not enter `dist`, `npm pack
  --dry-run`, or generated tar/Git/conditional-zip outputs.

### Previous Story Intelligence

- Story 1.5 completed independent review APPROVE with 4/4 ACs and 0 open findings. Its final stable-diff gates
  were 89/89 distribution units, 23/23 integration tests, and 1,406/1,406 full-suite tests.
- Its review hardened both pure and adapter entry points: exact candidate identity/binding/readiness/evidence
  validation, closed nested schemas, aggregated independent invalid inputs, safe ordinary-file reads, nullable
  observation conflict data, duplicate rejection, and canonical results.
- Story 1.4 established the only artifact identity this story may use. Storage paths and local observation IDs
  do not change candidate identity; exact archive bytes and candidate binding do.

### Git and Runtime Intelligence

- Story baseline: `4640514d148e463486b60f744f35934aac28ef4c` on
  `feature/authoring-agent-onboarding-task-112`.
- Relevant history: `872174c` (TASK-111 implementation/review fixes), `ada7f97` (TASK-111 merge), `d999b63`
  (TASK-110 candidate implementation/review fixes), and `fc4ce57` (TASK-110 merge).
- No `docs/00`-`docs/14` file changed since this persistent worker's complete preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`.
- Runtime observed during story creation: Node `v22.22.1`, npm `10.9.4`, Vitest `4.1.7`. Preserve the package's
  Node `>=20` and CI Node 20/22 contract; add no dependency or registry SDK.

### Current npm Facts (accessed 2026-08-22)

- npm states that a published name/version can never be reused, even after unpublish, and publication records
  SHA-512 integrity for the tarball. The publish-time `tag` is attached to that version:
  <https://docs.npmjs.com/cli/v11/commands/npm-publish/>.
- npm registry metadata exposes `dist-tags`, version metadata, `dist.integrity`, and repository information;
  maintainer data is explicitly informational rather than authoritative:
  <https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md>.
- `npm dist-tag` is a separate authenticated mutation; publication sets `latest` unless an explicit tag is
  supplied, and tag changes can require interactive second-factor authority:
  <https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/>.
- Trusted publishing is an OIDC relationship with a specific workflow. It requires npm 11.5.1+ and Node
  22.14+, applies to publish operations rather than general npm commands, and package trust configuration is
  separate mutable state: <https://docs.npmjs.com/trusted-publishers/>.
- Provenance requires a matching public repository identity; trusted publishing on supported public CI/public
  packages generates it automatically. Existing provenance is publication evidence, not something this
  assessment creates: <https://docs.npmjs.com/generating-provenance-statements/>.

### Project Structure Notes

- Expected new surfaces: one pure npm assessment module, one thin local JSON command, focused unit/integration
  tests, one assessment-only package script, and concise maintainer documentation. Names are not frozen.
- Expected shared refinement: one channel-neutral exact-candidate projection and one channel-neutral stable
  JSON-file reader, with GitHub behavior preserved by its existing tests. Do not create a generic release
  orchestration framework; share only the two hardened seams both assessments actually need.
- Do not edit `src/core/**`, product CLI commands/help, release workflows, credentials, Backlog.md, SDLC state,
  `AGENTS.md`, `docs/SDLC.md`, `.serena`, or canonical design docs.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-16-Assess-npm-Publication-Without-Writes]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/addendum.md#Deferred-distribution-activation-inputs]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Finding-15-npm-must-receive-its-final-dist-tag-during-publication]
- [Source: _bmad-output/implementation-artifacts/1-4-produce-an-inactive-verifiable-candidate.md]
- [Source: _bmad-output/implementation-artifacts/1-5-assess-github-release-staging-without-writes.md]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Debug Log References

- Literal `bmad-create-story` run in YOLO mode; project customization resolved with persistent fact
  `file:{project-root}/**/project-context.md`, no prepend/append/on-complete hooks.
- Literal `bmad-dev-story` run in YOLO mode; project customization resolved with the same persistent fact and
  no prepend/append/on-complete hooks.
- Literal `bmad-qa-generate-e2e-tests` run in YOLO mode; project customization resolved with the same
  persistent fact, no matching context file, and no prepend/append/on-complete hooks.

### Completion Notes List

- Create-story checklist verdict: PASS. Six TASK-112 criteria are preserved verbatim; implementation guidance
  reuses reviewer-hardened candidate/file boundaries, separates immutable conflicts from manual tag authority,
  and excludes publication, credentials, activation, GitHub duplication, and dual-channel convergence.
- RED: the initial pure test failed with one missing `npm-assessment.js` suite; the command test then failed
  with one missing `assess-npm.js` suite. Targeted authority-coordinate binding and activation-policy
  consistency assertions also failed before their respective logic landed.
- GREEN: the pure evaluator binds the proposed coordinate to the name embedded in the exact accepted archive,
  compares canonical candidate SHA-512 with registry SRI, reports exact immutable metadata/provenance conflicts,
  and keeps missing/wrong final tags as compatible manual-authority state with no safe write action.
- The local command reuses the exact persisted-candidate loader and shared stable ordinary-file JSON reader;
  invalid candidate/policy/observation inputs aggregate as exit 1 while valid conflicts remain exit-0 data.
- Refactored GitHub assessment to use the same channel-neutral exact-candidate and activation-schema projection;
  existing GitHub focused coverage remained green.
- Real clean-pack/install/candidate automation exercised absent, matching, manual-tag-authority, and conflicting
  npm observations. Candidate, policy, registry/trust input, Git tags, external state, isolated npm config, and
  credential sentinels remained byte-identical on every outcome.
- Dev-story gates: distribution unit 104/104; distribution integration 24/24; focused tar/Git/conditional-zip
  non-leakage 1/1; typecheck PASS; Biome PASS; build PASS; `npm pack --dry-run` reported 421 shipped entries and
  no distribution-preparation file. The exact full `npm test` remains reserved for independent review.
- Dev-story checklist verdict: PASS (26/26 under the repository's proportional-gate policy); story and sprint
  are ready for QA automation and independent review.
- QA strengthened the closed npm observation boundary with unavailable-provenance, cross-coordinate authority,
  duplicate identity, canonical SRI, and unsupported nested-field cases. The final npm evaluator/command band
  passed 22/22, distribution units passed 111/111, and the real distribution integration band passed 24/24.
- QA gates: typecheck PASS; Biome PASS over 231 files; build and explicit `dist` inspection PASS; diff hygiene
  PASS. Product/test hash is `c404ca77e71fb620a43f45bce836439dafd2e1b8a4ae728b8d91253718a0bc07`.
  The exact full `npm test` remains reserved for independent review.
- QA checklist verdict: PASS. All six criteria have deterministic pure/command/real-journey evidence, and the
  story and sprint remain at review for the independent reviewer.

### Change Log

- 2026-08-22: Added deterministic, inactive npm publication assessment and local no-write command; shared the
  reviewer-hardened candidate/input boundaries with GitHub; added focused unit, real candidate-journey, and
  structural/non-leakage evidence.
- 2026-08-22: QA strengthened ambiguity, provenance, and authority-coordinate coverage and recorded 6/6 AC
  traceability in the TASK-112 automation summary.
- 2026-08-22: Independent automatic-fix review resolved seven findings, completed the full adversarial audit,
  and approved the story after the exact stable-diff suite passed 1,439/1,439.

### File List

- `_bmad-output/implementation-artifacts/1-6-assess-npm-publication-without-writes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-112.md`
- `distribution-preparation/assess-github.js`
- `distribution-preparation/assess-npm.js`
- `distribution-preparation/assessment-contract.js`
- `distribution-preparation/assessment-files.js`
- `distribution-preparation/github-assessment.js`
- `distribution-preparation/npm-assessment.js`
- `distribution-preparation/prepare-candidate.js`
- `package.json`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/assess-npm.test.ts`
- `test/unit/distribution-preparation/npm-assessment.test.ts`

## Senior Developer Review (AI)

### Outcome

**APPROVE — 6/6 acceptance criteria satisfied, 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode against TASK-112, this story,
its QA evidence, the complete in-scope diff, TASK-108–TASK-111 regressions, and the unchanged design set.

### Findings Resolved

- **HIGH:** the exact accepted candidate did not carry the repository metadata embedded in its archive into
  npm assessment, so a policy and observation could fabricate a matching immutable repository. The hardened
  candidate loader now projects name, version, repository, size, SHA-256, and SHA-512 from a second stable read
  of the exact archive, and npm assessment binds policy and observed metadata to that projection.
- **HIGH:** unresolved required repository or provenance policy facts could still allow the immutable version
  and final tag to be reported as matching. A version now matches only when coordinate, repository, provenance,
  archive integrity, and immutable metadata are resolved and exact; otherwise the missing facts stay explicit.
- **MEDIUM:** authority evidence for another coordinate and mutable trusted-publisher disagreement were treated
  as hard immutable conflicts. They now remain unverified authority evidence unless the exact proposed
  coordinate is proved occupied and uncontrolled.
- **MEDIUM:** candidate/file failure returned before independently readable policy and observation schemas were
  validated. The command now aggregates all independent invalid-input findings canonically while preserving
  unreadable-file and valid-conflict semantics.
- **MEDIUM:** repository observation could not distinguish explicit unknown state from absence. The closed
  observation schema now supports an explicit unknown sentinel, which stays unverified; absence remains a
  concrete immutable-metadata mismatch.
- **MEDIUM:** semver-like final or observed dist-tags were accepted even though npm rejects tags parsed as
  semantic-version ranges. Both policy and observation boundaries now reject those invalid tag names.
- **MEDIUM:** an exact-coordinate `occupied-incompatible` observation remained merely unresolved. It now
  reports the occupied authority boundary as a hard conflict while preserving the no-write recovery guard.

### Verification

- npm evaluator/command review band: **32/32 passed**; all distribution units: **121/121 passed across 11
  files**.
- Complete distribution integration band: **24/24 passed across 4 files** in **103.19s**.
- `npm run typecheck`, repository-wide `npm run lint` (**231 files**), `npm run build`, and
  `git diff --check`: **passed**.
- Explicit `dist` inspection and npm dry-run ship set (**421 entries**) found **0** assessment or
  `distribution-preparation` leaks; generated-deliverable regressions remained green.
- One exact stable-diff `npm test`: **115/115 files, 1,439/1,439 tests passed** in **461.20s**.
- Stable executable product/test hash:
  `095c5bf5ebc5c373023c2e3aa3737aaf9edf6044369ff733d49e27915841dd5a`.

### Workflow Customization

No activation prepend/append, workflow override, matching `project-context.md`, or completion hook applied.
Backlog, SDLC state, contributor instructions, branch, commits, merge state, and excluded `.serena` content
were not changed by review.
