# Test Automation Summary — TASK-110 inactive verifiable candidate

## Generated and Audited Tests

### Exact local candidate journey

- [x] `test/integration/distribution-preparation/packed-install.test.ts` produces and inspects a real package
  from a clean copied Git revision, deletes the package source, installs the frozen archive in an isolated
  consumer, and prepares one candidate from that same artifact.
- [x] The journey proves the persisted archive equals both the inspected and installed frozen bytes; all three
  evidence documents and release notes are preserved byte-for-byte and receive inspectable semantic/raw
  digests, while the candidate records package/version, tag, revision, size, SHA-256, and SHA-512.
- [x] The prepared result and persisted record retain Story 1.1's complete unresolved-fact inventory and remain
  explicitly `inactive`, activation-disabled, publication-incapable, and release-ineligible.
- [x] An unchanged rerun returns the original candidate identity without a second candidate; a changed tag is
  rejected without changing the persisted candidate. Repository tags and representative GitHub/npm/trust
  observations remain byte-for-byte unchanged on both paths.

### Deterministic contract, conflict, and non-leakage coverage

- [x] `test/unit/distribution-preparation/candidate.test.ts` covers a coherent binding, aggregate independent
  inconsistencies, canonical identity despite object order and input-location changes, and complete changed
  tag/revision/archive/evidence-digest reporting without artifact-type branches.
- [x] `test/unit/distribution-preparation/prepare-candidate.test.ts` covers exact persistence and reuse, changed
  binding refusal, aggregate quality/install/notes/frozen-artifact findings, and coordinated stored-evidence
  corruption that cannot bypass semantic verification.
- [x] `test/integration/distribution-preparation/public-surfaces.test.ts` now proves the two candidate modules
  cannot invoke subprocess, HTTP/fetch, Git tag/push, GitHub release, npm publish, or npm dist-tag surfaces.
  Existing assertions retain the modules in TypeScript/Biome while excluding them from `dist`, the npm ship
  allowlist, publication automation/credentials, and rendered authoring deliverables.
- [x] The focused real build regression proves tarball and Git layouts—and zip when the host tools exist—do not
  leak `distribution-preparation/**` or builder-only sentinel content.

## Acceptance-Criteria Coverage

- **AC 1 — one exact auditable inactive record:** the real journey asserts the full package/revision/tag/
  archive/digest/evidence/notes binding and exact stored bytes.
- **AC 2 — every discrepancy is reported:** pure and persistence tests aggregate independent artifact,
  revision, package, quality, install, notes, frozen-byte, and stored semantic-evidence failures.
- **AC 3 — unresolved facts stay explicit and inactive:** both command output and persisted record contain the
  complete activation-fact key inventory and closed inactive readiness state.
- **AC 4 — external state is unchanged:** success and conflict paths preserve repository tags and supplied
  GitHub/npm/trust observations; structural tests prove no channel observation or mutation capability exists.
- **AC 5 — unchanged rerun is identical:** unit and real tests require the same identity, package digests, and
  evidence binding and no staging/second-candidate residue.
- **AC 6 — changed binding cannot silently reuse:** changed tag is exercised through the real command, while
  pure tests cover changed archive digests, revision, and arbitrary verification evidence; the prior record is
  preserved and all changed binding dimensions are returned.
- TASK-110 acceptance criteria: **6/6 covered**.
- API endpoints: not applicable; this feature exposes no HTTP/service API.
- UI workflows and semantic locators: not applicable; this is a local maintainer-only Node command.

## Verification

- QA candidate unit band before review: **8/8 passed across 2 files**.
- QA public-surface band: **8/8 passed**.
- Strengthened real clean package -> source deletion -> install -> candidate journey: **1/1 passed**
  (one unrelated prerequisite test skipped) in **73.87 seconds**.
- Tarball/Git/conditional-zip non-leakage regression: **1/1 passed** (24 unrelated tests skipped) in
  **2.85 seconds**.
- Final QA-focused total: **18/18 selected tests passed across 5 files**.
- Earlier dev distribution gates on the same implementation: **61/61 unit** and **21/21 integration** passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **221 files checked**.
- `npm run build`: passed; explicit inspection found no `distribution-preparation` output under `dist/`.
- `git diff --check`: passed.
- Final executable product/test aggregate hash:
  `8cfebc3f911bf8dd4ea4cdfe1b6d8b2018a3bc1e07c756ee1c27c4cb837c8376`.
- Independent review added exact-evidence identity/reuse, complete packed-install semantics, no-overwrite,
  corrupt record/readiness/path/link, extra binding metadata, and malformed UTF-8 regression coverage.
- Final review candidate unit band: **16/16 passed**; all distribution units: **69/69 passed**; public-surface
  integration: **8/8 passed**.
- Exact stable-diff `npm test`: **111/111 files and 1,385/1,385 tests passed** in **478.49 seconds**.
- Reviewed executable product/test aggregate hash:
  `c73ffd42bd752c5ba2bab2dacbe36ea0d1c6751e789413e91d61a9722cce1ac6`.

## Test Quality

- Vitest 4.1.7 and the repository's existing unit/integration projects are used; no dependency, browser/API
  framework, retry layer, hardcoded wait, or artifact-type-specific candidate inspector was added.
- Tests use isolated temporary roots, deterministic byte/digest assertions, behavior-oriented descriptions,
  bounded subprocess execution in the real package journey, and cleanup independent of test order.
- Happy paths exercise the real archive/consumer/candidate boundary. Critical failures stay at the smallest
  deterministic seams while the integration journey proves the composed exact-byte and no-write behavior.

## Deliberate Scope Deferrals

- Read-only GitHub/npm channel assessment and dual-channel convergence remain Stories 1.5–1.7 /
  TASK-111–TASK-113.
- Agent installation/setup activation and cold installed-package-to-authoring handoff remain Epic 2.
- No public identity decision, publication, release, asset upload, dist-tag change, credential/trust mutation,
  remote read/write, product CLI command, or generated work-package capability was introduced.

## Workflow Evidence

- The actual `bmad-qa-generate-e2e-tests` skill was invoked in YOLO mode for TASK-110 against Story 1.4 and
  the implemented inactive-candidate boundary.
- Customization resolved no activation prepend/append steps; the persistent `project-context.md` glob matched
  no files; no workflow override applied; the completion hook resolved empty.
- Existing framework selected: Vitest 4.1.7. API/UI/locator steps were inapplicable; local archives, persisted
  evidence, command output, exact bytes, repository tags, and external-state fixtures are the through-the-edges
  surfaces for this feature.
- QA checklist verdict: **PASS**. Happy path and critical conflict/corruption cases use standard Vitest APIs,
  have clear descriptions, contain no waits or order dependencies, pass in the focused band, and this summary
  records their coverage.
- The actual `bmad-story-automator-review` skill ran in automatic-fix mode. Customization resolved no
  prepend/append, override, matching `project-context.md`, or completion hook. Final verdict: **APPROVE with
  0 open findings**.
