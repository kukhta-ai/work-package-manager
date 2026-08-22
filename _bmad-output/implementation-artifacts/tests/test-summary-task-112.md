# Test Automation Summary — TASK-112 read-only npm publication assessment

## Generated and Audited Tests

### Deterministic npm assessment

- [x] `test/unit/distribution-preparation/npm-assessment.test.ts` verifies the required npm coordinate,
  candidate version, exact archive name/size/SHA-256/SHA-512/SRI, final dist-tag, repository/provenance
  identity, publication authority, evidence binding, and every unresolved activation fact.
- [x] Absent, exact matching, missing-tag, differently targeted tag, unknown provenance, differing immutable
  bytes, repository/provenance conflicts, and authority/trust disagreement are classified separately.
- [x] Matching immutable state never produces a republish proposal. Missing or different final tags remain a
  compatible manual-authority boundary; every valid result has an empty safe-action list and prohibits
  overwrite, version reuse, republication, unpublish/republication, and automatic tag repair.
- [x] QA added seven boundary cases proving that unavailable provenance remains unverified, authority evidence
  cannot be borrowed from another package coordinate, duplicate version/tag/owner observations are rejected,
  registry integrity must be canonical SHA-512 SRI, and nested registry schemas remain closed.
- [x] The proposed publication coordinate is bound to the package name embedded in the exact accepted archive;
  mismatched publication, activation-policy, registry, or authority coordinates cannot claim readiness.

### Local command and real candidate journey

- [x] `test/unit/distribution-preparation/assess-npm.test.ts` covers invocation exit 2, structured no-write
  assessment exit 0, candidate/file/schema rejection exit 1, independent input-error aggregation, symlink
  refusal, and unchanged inputs.
- [x] `test/integration/distribution-preparation/packed-install.test.ts` clean-packs a source revision, installs
  the real archive after source deletion, prepares the exact inactive candidate, and assesses absent,
  matching, manual-tag-authority, and aggregate immutable-conflict npm observations through the real package
  command.
- [x] Every real outcome preserves the candidate tree, policy and observation bytes, Git tags, representative
  external state, isolated npm configuration, and isolated credential sentinel.

### Structural and package non-leakage

- [x] `test/integration/distribution-preparation/public-surfaces.test.ts` keeps the assessment modules under
  TypeScript and Biome while outside the production build and package ship set. It rejects subprocess,
  HTTP/fetch/registry clients, filesystem-write imports, credential discovery, package/tag/owner/trust
  mutation, publication, and activation capability.
- [x] The package remains private and exposes one explicitly local assessment script. Product help, generated
  authoring deliverables, release workflows, and public acquisition surfaces remain unchanged and inactive.
- [x] The tar/Git/conditional-zip non-leakage regression, explicit `dist` inspection, and npm dry-run ship-set
  inspection prove `distribution-preparation/**` does not enter generated work packages or the public npm
  artifact.

## Acceptance-Criteria Coverage

- **AC 1 — complete required npm view:** pure and real command tests assert coordinate/version, exact archive
  identity and both digests, canonical SRI, final tag, repository/provenance/source identity, authority,
  candidate evidence, and all unresolved policy facts.
- **AC 2 — matching without republication:** exact version/tag/metadata/provenance/trust state is reported only
  as matching, with no missing/conflict/manual-authority entry and no safe write proposal.
- **AC 3 — compatible manual tag boundary:** both absent and differently targeted final tags retain the exact
  immutable version match and produce only later manual-authority work, not an immutable conflict.
- **AC 4 — hard immutable conflicts:** pure and real tests aggregate differing archive integrity, repository,
  required provenance, and coordinate identity against the affected version.
- **AC 5 — unsafe recovery remains unsafe:** every assessed state has `safeActions: []` and the fixed prohibited
  overwrite/reuse/republication/unpublish-and-republish/automatic-tag-repair set.
- **AC 6 — no npm or trust mutation:** command and real-journey snapshots preserve package/tag/owner/credential/
  trusted-publisher observations and all representative local/external state; structural guards prove the
  adapter has no network, credential, or mutation capability.
- TASK-112 acceptance criteria: **6/6 covered**.
- Live registry access, credentials, publication, UI workflows, and semantic locators are deliberately not
  applicable to this caller-supplied/read-only local assessment.

## Verification

- Final npm evaluator/command band: **22/22 passed across 2 files**.
- Final distribution unit band: **111/111 passed across 11 files**.
- Final distribution integration band: **24/24 passed across 4 files** in **212.37 seconds**.
- Final QA-focused distribution total: **135/135 passed across 15 non-overlapping files**.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **231 files checked**.
- `npm run build`: passed; explicit inspection found no assessment or `distribution-preparation` output under
  `dist/`.
- Tarball/Git/conditional-zip non-leakage regression: **1/1 passed** with 24 unrelated tests skipped during
  dev-story verification.
- npm dry-run ship set: **421 entries**, with **0** assessment or `distribution-preparation` files leaked during
  dev-story verification.
- `git diff --check`: passed.
- Final executable product/test aggregate hash:
  `c404ca77e71fb620a43f45bce836439dafd2e1b8a4ae728b8d91253718a0bc07`.
- The exact full `npm test` was not run by dev or QA under the proportional fast-feedback policy; it remains
  reserved for the independent reviewer on this stable executable diff.

## Test Quality

- Vitest 4.1.7 and the existing unit/integration projects are used; no dependency, npm SDK, retry layer,
  hardcoded wait, credential, network, or live service fixture was added.
- Pure tests use deterministic closed records and behavior-oriented findings. The real journey uses an
  isolated temporary root, bounded child commands, an exact persisted candidate, byte/metadata snapshots,
  and cleanup independent of test order.
- QA RED was a deliberately strict unsupported-field assertion whose message wording did not match the
  existing fail-closed error. The assertion was corrected to the observable schema rejection; no production
  behavior changed, and the strengthened band then passed.

## Deliberate Scope Deferrals

- GitHub assessment remains Story 1.5 / TASK-111. Combined six-state convergence remains Story 1.7 /
  TASK-113.
- No public identity decision, authorization, registry fetch, credentials, live npm observation, package/
  dist-tag/owner/trusted-publisher write, publication, activation, or product CLI capability was introduced.

## Workflow Evidence

- The actual `bmad-qa-generate-e2e-tests` skill was invoked in YOLO mode for TASK-112 against Story 1.6 and
  the implemented exact-candidate npm assessment boundary.
- Customization resolved the persistent fact `file:{project-root}/**/project-context.md`; it matched no files.
  No activation prepend/append, override, or completion hook applied.
- Existing framework selected: Vitest 4.1.7. API/UI/locator steps were inapplicable; exact candidate trees,
  closed local policy/observation JSON, structured command output, Git tags, isolated npm configuration, and
  external-state snapshots are this feature's through-the-edges surfaces.
- QA checklist verdict: **PASS**. All six acceptance criteria have direct automated evidence; critical
  absent/match/manual-authority/conflict/invalid/no-write paths use standard Vitest APIs, contain no waits or
  order dependencies, and pass in the focused band.
- The actual `bmad-story-automator-review` skill ran in automatic-fix mode. Review resolved two high-severity
  archive/policy binding defects and five medium-severity schema, authority, aggregation, tag, and occupied-
  coordinate defects; final verdict: **APPROVE with 0 open findings**.

## Independent Review Evidence

- The exact accepted archive is now re-read stably and projects its package name, version, repository, size,
  SHA-256, and SHA-512 into the npm assessment boundary. Policy and observation records cannot fabricate an
  immutable repository match or bypass exact accepted-candidate identity.
- Matching immutable-version and final-tag state now requires resolved coordinate, repository, provenance,
  archive integrity, and metadata facts. Explicit unknown repository evidence remains unverified, while absent
  or different immutable metadata is a conflict.
- Wrong-coordinate or mutable trusted-publisher authority evidence remains unverified; exact-coordinate
  occupied/uncontrolled evidence is a hard authority conflict. Semver-like final and observed dist-tags fail
  closed, and independently invalid candidate/file/schema inputs aggregate canonically.
- Reviewer-focused npm evaluator/command band: **32/32 passed**. Complete distribution units: **121/121 passed
  across 11 files**. Complete distribution integration: **24/24 passed across 4 files** in **103.19s**.
- `npm run typecheck`, repository-wide `npm run lint` over **231 files**, `npm run build`, explicit `dist` and
  npm dry-run ship-set inspection, generated-deliverable non-leakage, and `git diff --check`: **passed**.
- The reviewer ran the one exact stable-diff `npm test`: **115/115 files and 1,439/1,439 tests passed** in
  **461.20 seconds**.
- Reviewed executable product/test aggregate hash:
  `095c5bf5ebc5c373023c2e3aa3737aaf9edf6044369ff733d49e27915841dd5a`.
- No matching `project-context.md`, activation prepend/append, workflow override, or completion hook applied.
  Backlog, SDLC state, contributor instructions, branch/commit/merge state, and `.serena` were untouched by
  independent review.
