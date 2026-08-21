# Test Automation Summary — TASK-107 inactive distribution contract

## Generated and Audited Tests

### Maintainer executable integration tests

- [x] `test/integration/distribution-preparation/assessment.test.ts` drives the actual unshipped Node entry
  point through local JSON files and subprocess exit/output boundaries.
- [x] QA added an otherwise-complete activation record whose proposed and authorized npm coordinate has only
  package-metadata evidence. The executable exits `1` and reports that coordinate as
  `metadata-is-not-control-evidence` while remaining inactive, disabled, release-ineligible, and incapable of
  publication.
- [x] Existing executable cases cover a wholly missing record, deterministic repeated assessment, a
  synthetically complete but still inactive record, malformed/shape-invalid input, usage errors, and the
  explicit read-only import/capability boundary.
- [x] Independent review added nested-shape rejection for invalid proposals, authorization records, evidence
  objects, evidence kinds, and evidence references so caller JSON cannot escape the closed output contract.

### Contract and repository integration tests

- [x] `test/unit/distribution-preparation/readiness.test.ts` pins the literal eight-fact inventory, labels,
  proposal/authorization/evidence requirements, stable aggregate ordering, independent GitHub/npm authority
  findings, coordinate failure matrix, immutable definitions, unknown-key behavior, determinism, and the
  intentionally inactive complete-input boundary.
- [x] `test/integration/distribution-preparation/public-surfaces.test.ts` audits private package metadata, the
  exact npm file allowlist, absence of publication automation/credentials, all conflicting public documents,
  full static and dynamic CLI help, every packaged authoring-skill document, a rendered authoring front door,
  the generated deliverable, and TypeScript/Biome/build exclusion boundaries. Completion parity prevents a new
  dynamic bundle command from silently escaping the explicit help-path inventory.
- [x] Acquisition-guard canaries prove arbitrary npm-compatible coordinates and GitHub release/tag URLs fail
  closed while source-local setup, the required Backlog.md peer, and the FAQ's `npx skills` comparison remain
  valid.

## Acceptance-Criteria Coverage

- **AC 1 — all unresolved activation facts are reported together:** covered by the literal unit inventory,
  missing/partial/all-unauthorized matrices, independent channel-authority assertions, and the real missing
  record subprocess report.
- **AC 2 — no unresolved coordinate or channel is presented as public:** covered across package metadata,
  release workflow capabilities, README, FAQ, CONTRIBUTING, shipped docs/12, complete CLI help, packaged
  bootstrap skills, and rendered generated guidance.
- **AC 3 — metadata, availability, control, and authorization remain independent:** covered by the unit
  coordinate matrix and QA's real-process metadata-only coordinate scenario.
- TASK-107 acceptance criteria: **3/3 covered**.
- API endpoints: not applicable; WPM exposes no HTTP/service API for this feature.
- UI workflows and semantic locators: not applicable; WPM is a Node CLI and this seam is maintainer-only.

## Verification

- New QA executable-boundary case: passed on first execution; it closes an automation gap rather than exposing
  a product defect.
- Focused Story 1.1 automation: **31/31 passed across 3 files**.
- Maintainer executable integration file: **6/6 passed** in the independent QA gap audit.
- TypeScript: `npm run typecheck` passed.
- Biome CI: **206 files** checked, no fixes required.
- Production build: `npm run build` passed; explicit inspection found no distribution-preparation output in
  `dist/`.
- Exact post-review full regression: **1,325/1,325 passed across 103 files in 410.73 seconds**.
- `git diff --check`: passed.

## Test Quality

- Vitest 4.1.7 and the repository's existing unit/integration project conventions are used.
- Tests have clear behavior-oriented descriptions, use no sleeps or retries, and clean isolated temporary
  directories after each subprocess case.
- The new case exercises a public acceptance boundary rather than duplicating pure-classifier assertions: JSON
  serialization, local file loading, executable invocation, exit status, structured output, and exact failure
  evidence are all observed together.
- Happy boundaries (synthetically complete input) and critical failures (missing, metadata-only, invalid input,
  and bad invocation) are covered. No credentials, registry calls, or remote writes occur.

## Deliberate Scope Deferrals

- Exact packed npm ship-set inspection remains Story 1.2 / TASK-108.
- Packed installation, npm-generated executables, and installed-resource resolution remain Story 1.3 /
  TASK-109.
- Candidate binding, live read-only GitHub/npm assessment, and combined convergence remain Stories 1.4–1.7 /
  TASK-110–TASK-113.

## Workflow Evidence

- `bmad-qa-generate-e2e-tests` was invoked in YOLO mode after `bmad-dev-story` for TASK-107 against the explicit
  Story 1.1 artifact and current implementation.
- Customization resolved with no activation prepend/append steps; the persistent `project-context.md` glob
  matched no files; the resolved completion hook is empty.
- Existing framework selected: Vitest 4.1.7. API/UI generation steps were inapplicable; the real maintainer
  subprocess plus repository/package/bootstrap boundaries are this feature's through-the-edges surfaces.
- Initial QA tracing added the metadata-only subprocess case; independent review cycle 1 subsequently closed
  nested-shape, dynamic-help, and fail-closed acquisition-guard gaps.

## Independent Review Cycle 1

- **Verdict:** APPROVE; TASK-107 acceptance criteria are **3/3 covered** with no unresolved in-scope finding.
- **Findings fixed:** five medium and one low across executable input validation, dynamic-help coverage,
  acquisition canaries, local-bin documentation, File List reconciliation, and a changelog anchor.
- **Final local gate:** focused 31/31; TypeScript passed; Biome checked 206 files; production build passed with
  no preparation output; exact full regression passed 1,325/1,325 across 103 files in 410.73 seconds.
- **Review workflow:** actual `bmad-story-automator-review`, automatic-fix mode; no customization prepend/append,
  matching fact file, or completion hook resolved.

## Review-Continuation Re-absorption

- The actual `bmad-dev-story` workflow was re-invoked in YOLO mode against the explicit Story 1.1 artifact.
  Customization resolved no prepend/append steps, no matching `project-context.md` fact, and no workflow
  override.
- All six cycle-1 fixes were independently audited against AC 1-3 and the unshipped preparation boundary.
  Dynamic help/completion parity, nested JSON validation, arbitrary-coordinate acquisition canaries, exact local
  bin-map documentation, File List reconciliation, and the changelog anchor are correct; no product/test change
  was required.
- Focused Story 1.1 automation passed **31/31 across 3 files**; typecheck, Biome CI across 206 files, production
  build with no preparation output, and `git diff --check` passed.
- SHA-256 remained unchanged for the assessment entry (`df2eac3a…ace4d6`), classifier
  (`fcddf755…56f16`), unit contract (`92fb7ed0…553bf`), assessment integration
  (`1212e0d7…b9ef7`), and public-surface integration (`93800175…0b91d`). The reviewer's exact final
  **1,325/1,325** full regression across 103 files in 410.73 seconds therefore remains applicable.

## Independent Review Cycle 2

- **Verdict:** APPROVE; TASK-107 acceptance criteria remain **3/3 covered** with no unresolved in-scope
  finding.
- **Fresh findings fixed:** one medium AC2 acquisition-guard gap and one low sprint timestamp inconsistency.
  The guard now catches shell-quoted coordinates, package-manager options before verbs, line continuations,
  and later coordinates hidden after the allowed `backlog.md` or bare `npx skills` forms.
- **Prior closure:** all six cycle-1 fixes were re-audited and remain closed: dynamic-help parity, nested JSON
  validation, generic acquisition/GitHub-release detection, exact bin-map documentation, File List
  reconciliation, and the changelog anchor.
- **Final local gate:** focused 31/31; TypeScript passed; Biome checked 206 files; production build passed with
  no preparation output; exact fresh full regression passed **1,325/1,325 across 103 files in 423.44 seconds**.
- **Final executable hashes:** assessment entry `df2eac3a…ace4d6`; classifier `fcddf755…56f16`; unit contract
  `92fb7ed0…553bf`; assessment integration `1212e0d7…b9ef7`; public-surface integration
  `966730f9…040f7`.
- **Review workflow:** actual `bmad-story-automator-review`, automatic-fix mode; no customization
  prepend/append, matching fact file, or completion hook resolved.
- Concurrent process-policy edits in `AGENTS.md` and `docs/SDLC.md` were inspected but left outside TASK-107's
  exact 17-file story inventory.
