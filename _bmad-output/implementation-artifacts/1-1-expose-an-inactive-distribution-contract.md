---
baseline_commit: 63ee60bcaee007b4c1e160283986e33ffef47a95
---

# Story 1.1: Expose an Inactive Distribution Contract

Status: done

<!-- Note: Validated with the bmad-create-story checklist before finalization. -->

## Story

As a WPM maintainer,
I want distribution readiness to fail closed while activation facts remain unresolved,
so that preparation cannot imply or enable public distribution accidentally.

## Acceptance Criteria

1. **Given** one or more items in the bounded activation-fact inventory are unresolved or lack the required authorization or control evidence, **when** distribution readiness is assessed, **then** the distribution is reported as inactive and every unresolved inventory item is reported together.
2. **Given** distribution is inactive, **when** package metadata, documentation, CLI help, and bootstrap guidance are inspected, **then** none presents an unresolved coordinate or channel as canonical or publicly obtainable.
3. **Given** a proposed package coordinate is unresolved, observed as occupied by incompatible state, or lacks explicit WPM authorization plus read-only evidence of availability or WPM control, **when** release eligibility is assessed, **then** package metadata or registry state alone cannot make it eligible.

## Tasks / Subtasks

- [x] Define the inactive readiness contract and its bounded input inventory (AC: 1, 3)
  - [x] Represent these stable facts without assigning values: public npm coordinate; public executable-name/alias policy; GitHub/npm channel roles and precedence; stable-versus-prerelease mapping; GitHub immutability policy; bounded npm-public/GitHub-pending recovery policy; and authority/trust evidence required by each channel.
  - [x] Distinguish a proposed value from explicit WPM authorization and from read-only availability/control evidence; none substitutes for the others.
  - [x] Produce deterministic inactive results that aggregate every unresolved or unsupported fact in inventory order instead of failing on the first item.
  - [x] Define the complete-input boundary explicitly: a synthetically complete inventory has no unresolved items, but this story still reports distribution inactive and release-ineligible with activation disabled; it does not emit Story 1.7's ready/complete classifications.
- [x] Add an unshipped maintainer-facing readiness assessment (AC: 1, 3)
  - [x] Keep the assessment outside `src/core`, the production CLI build, `package.json.files`, and generated work-package deliverables.
  - [x] Accept supplied/read-only evidence only; expose no credential, publication, tag/release, Git push, trust-setting, or other remote-mutation capability.
  - [x] Stop at inactive readiness. Do not implement an active/publishable state, select a coordinate or channel policy, or reuse `wpm build publish`.
- [x] Make source-controlled public surfaces truthful while distribution is inactive (AC: 2)
  - [x] Preserve `wpm` as the local product/command name and preserve the existing executable aliases; do not convert either into a selected public package identity.
  - [x] Remove or qualify present-tense public-obtainability and tag-release claims in `README.md`, `FAQ.md`, `CONTRIBUTING.md`, and the shipped `docs/12-builder-architecture.md`; preserve npm as a future target and do not claim Story 1.3's packed-install journey already exists.
  - [x] Set the standard `package.json` `private` field to `true` so npm refuses accidental publication, without renaming the package or deciding the eventual coordinate; keep lockfile metadata coherent if the package-manager operation changes it.
  - [x] Audit full CLI help, the packaged authoring skill, and a rendered generated authoring front door; preserve them when already truthful and add regression coverage rather than rewriting them gratuitously. Preserve legitimate `wpm build publish` guidance because that command publishes generated work-package archives, not WPM itself.
  - [x] Treat `docs/00`-`14` as human-owned. Story 1.1's approved AC and NFR15 authorize only the narrow `docs/12` truthfulness correction above; if implementation would alter architecture, goals, or distribution policy beyond qualifying the inactive present state, stop at the repository's user gate.
- [x] Add focused contract and consistency tests (AC: 1, 2, 3)
  - [x] Cover a wholly missing activation record and prove all bounded facts are reported together in stable order.
  - [x] Cover unresolved, occupied-incompatible, authorization-only, evidence-only, and metadata-only coordinate cases; each remains ineligible.
  - [x] Cover a synthetically complete activation inventory; it reports no unresolved facts but remains inactive, release-ineligible, and incapable of publication in this increment.
  - [x] Cover repeated identical inputs and prove status, ordering, and evidence are stable.
  - [x] Add a cross-surface audit for package metadata, public documentation including shipped `docs/12`, full CLI help, packaged bootstrap skill(s), and rendered generated front-door guidance while inactive.
  - [x] Prove the preparation seam has no remote mutation or credential boundary and is absent from both the WPM npm ship set and generated work-package deliverables.
- [x] Verify scope and quality gates (AC: 1, 2, 3)
  - [x] Ensure any new top-level TypeScript/tooling path is included in typecheck and Biome coverage without entering the production `dist/` build.
  - [x] Run typecheck, Biome, and the relevant unit/integration tests; retain the existing `0`/`2`/`1` public exit-code contract where an executable assessment surface participates in it.
  - [x] Confirm Stories 1.2-1.7 remain responsible for package-boundary proof, packed installation, candidate binding, channel assessment, and combined convergence.

## Dev Notes

### Developer Context

This story establishes the truth boundary that every later distribution-preparation story depends on. It is deliberately useful while all public identity and policy choices are unresolved: maintainers can inspect one complete inactive report, but nothing in the repository may imply that users can already obtain WPM from npm or GitHub.

The current `wpm` package identity is a working repository identity, not an approved npm coordinate. The investigation observed the npm name `wpm` occupied by unrelated software and `work-package-manager` returning E404 on 2026-08-20. Both observations are examples, not durable authorization: occupied incompatible state blocks eligibility, while apparent availability still lacks control and product approval. Do not refresh or hard-code a registry result into eligibility during this story; later channel-assessment stories own supplied or permitted read-only observations.

The complete activation-fact inventory is closed and bounded for this increment:

1. public npm coordinate;
2. public executable-name or alias policy;
3. GitHub/npm channel roles and precedence;
4. stable-versus-prerelease mapping;
5. GitHub immutability policy;
6. acceptance or rejection of the bounded npm-public/GitHub-pending recovery state;
7. authority or trust evidence required by GitHub and npm.

Use stable machine-readable keys and deterministic ordering. If authority/trust is represented per channel, absence for either channel must remain independently visible rather than collapsing into one ambiguous boolean.

### Technical Requirements

- The observable result is inactive whenever any required value, authorization, or control evidence is unresolved. Aggregate all problems; do not short-circuit.
- A coordinate fact counts as resolved only with explicit WPM authorization **and** appropriate read-only evidence of availability or WPM control. A `package.json` name, an E404/available-looking registry response, or one side of that conjunction is insufficient. Resolving that fact is not release eligibility.
- This story implements no positive activation path. A synthetically complete inventory returns an empty unresolved-fact list but still reports `inactive`, release-ineligible, and activation disabled; it cannot return Story 1.7's `ready`/`complete` classifications, publish, mutate remote state, or claim public acquisition is complete.
- Preparation consumes local or caller-supplied/read-only facts. It must not introduce network mutation, credentials, OIDC/secrets, protected environments, `npm publish`, `npm dist-tag`, `gh release`, Git tag/push, or a release workflow.
- Do not reuse `wpm build publish` or `src/adapters/packager.ts`; those publish generated work-package archives and are a different product boundary.
- Prefer existing dependencies and Node facilities. No dependency upgrade or framework migration is required by this policy story.
- Keep error/status output structured enough for deterministic tests. If exposed through a script, retain machine-distinguishable non-success behavior and clear maintainer guidance; do not bury the inventory only in prose.

### Architecture Compliance

- Distribution-preparation tooling belongs outside `src/core` and outside the shipped WPM CLI package. The onboarding architecture addendum explicitly makes Epic 1 an unshipped preparation exception; it does not ride the product operation lifecycle or add another port.
- Preserve the product's ports-and-adapters invariant: nothing under `src/core/` imports Commander, Execa, Omelette, or OS/filesystem modules. This story should need no `src/core/**` change.
- Do not create a fifth product port, a publisher adapter, a credential manager, or a remote-state mutation abstraction.
- The repository's CLI remains one command to one operation, but this story does not add a public `wpm` command. A maintainer-only assessment entry point is release tooling, not product surface.
- Output formatting is separate from pure readiness classification. Keep the classifier directly unit-testable; keep any filesystem/process entry point at the unshipped edge.
- `docs/00`-`14` remain authoritative. The current scoped PRD, architecture addendum, and epic extend them without changing the thin-builder/fat-agent or SDLC-agnostic principles.

### Current-State and Regression Guardrails

- `package.json` currently uses `name: "wpm"`, version `0.1.0`, Node `>=20`, and two bins (`wpm` and legacy `installer`) targeting `dist/cli.js`. Preserve the name and bin map as unresolved/local facts; do not decide the eventual public coordinate or alias policy. The current `files` allowlist (`agent-skills`, `dist`, `docs`, `templates`) is the hard npm ship boundary and must exclude new preparation tooling.
- `README.md` currently labels `work-package-manager` as the npm package and gives `npm i -g work-package-manager backlog.md`. Replace the public acquisition claim with explicit inactive/deferred language and truthful contributor/local-development guidance.
- `FAQ.md` correctly says the project is not ready earlier, but later says the npm package is published as `work-package-manager`. Resolve that contradiction without selecting a replacement coordinate.
- `CONTRIBUTING.md` describes a tag-triggered npm release process whose `release.yml` does not exist. Reframe it as deferred, human-authorized activation; do not add actionable publication automation in this story.
- `docs/12-builder-architecture.md` ships in the npm package and still describes npm distribution, tagged publication, a `release.yml`, and a public first-install path in present tense. Narrowly qualify those statements as the future distribution target while the current milestone is inactive; do not redesign the architecture or erase `wpm build publish`'s separate generated-artifact meaning.
- `package.json` has no publication guard today. Add the standard `"private": true` field: npm documents that this makes npm refuse publication, while still allowing the local packing and install evidence owned by later stories.
- Root and command help currently make no npm/GitHub coordinate claim. Preserve that behavior and use the existing help harness to inspect all registered command help.
- `agent-skills/installer-builder/SKILL.md` and `templates/project/minimal/snippets/authoring-front-door.md.tmpl` assume an already-available local `wpm` command but do not claim a public acquisition coordinate. Preserve them and include them in the consistency audit.
- `.github/workflows/ci.yml` truthfully says release/publish belongs to a separate absent workflow. Do not create `release.yml` or add write permissions, secrets, environments, tag triggers, or OIDC.

### Library / Framework Requirements

- Continue with the repository's existing Node.js 20+ ESM TypeScript, Vitest, and Biome toolchain. This story needs no new runtime dependency.
- If the chosen unshipped tooling is TypeScript outside `src/`, update `tsconfig.json` and `biome.json` so it cannot evade the DoD. Keep `tsconfig.build.json` restricted to production `src/**` output.
- Use Vitest's existing unit/integration split. Pure inventory/classification belongs in unit tests; entry-point, filesystem, or subprocess behavior belongs in integration tests.
- No fresh version-sensitive API decision is required. The 2026-08-20 distribution investigation already captures the platform observations needed to define the inactive contract; current remote state is intentionally not an implementation input for Story 1.1.

### File Structure Requirements

Likely **NEW** (exact names are refinable):

- one top-level unshipped distribution-preparation directory containing the activation inventory, pure readiness classification, and a small maintainer assessment entry point;
- local fixtures for missing, proposed-but-unauthorized, occupied-incompatible, and control-evidenced coordinate states;
- unit tests for classification and an integration/cross-surface test for observable output, non-mutation, and ship-set exclusion.

Expected **UPDATE**:

- `package.json` (explicit inactive/fail-closed metadata and an optional maintainer assessment script; never a rename), plus `package-lock.json` only if the package-manager change makes it necessary;
- `README.md`, `FAQ.md`, `CONTRIBUTING.md`, and narrowly `docs/12-builder-architecture.md` for truthful inactive-distribution language;
- `tsconfig.json` and `biome.json` if required to cover a new top-level TypeScript path.

Expected **INSPECT / USUALLY NO CHANGE**:

- `src/cli.ts` and the existing help-contract test;
- `.github/workflows/ci.yml`;
- `agent-skills/installer-builder/SKILL.md` and authoring front-door snippets;
- `src/core/**`, product ports/adapters, and `src/adapters/packager.ts`.

Do not create or edit files under `backlog/` directly. Any task note/status operation uses the Backlog CLI.

### Testing Requirements

- Reuse `test/unit/cli/help-contract.test.ts`'s `buildProgram`/collector pattern to render and inspect the complete help tree without network access.
- Reuse the static project-file reading pattern in `test/integration/package-runtime-support.test.ts` for cross-surface checks.
- Follow the cross-artifact drift-test style in `test/unit/docs/template-documentation-drift.test.ts`, extending the audited surface explicitly rather than building a vague repository-wide prose scanner.
- Test the readiness classifier as a closed input matrix. At minimum: no activation record; partial inventory; all values proposed but unauthorized; authorization without control evidence; control evidence without authorization; occupied incompatible coordinate; metadata-only proposal; a synthetically complete inventory that remains inactive with no unresolved facts; and repeated identical input.
- Assert all missing facts are present exactly once and in stable inventory order. Avoid snapshot-only assertions that could hide dropped items; assert the structured result first, then presentation.
- Assert unshipped tooling is absent from `package.json.files` and from generated work-package deliverables. Do not implement Story 1.2's full clean-pack/ship-set harness here.
- Assert no test requires registry credentials or performs a remote write. Network lookup is not necessary for this story.
- Run the normal gate: `npm run typecheck`, `npx biome ci .`, and relevant Vitest projects. Build before any built-binary integration test so it does not silently skip when `dist/` is absent.

### Scope Boundaries

- **Story 1.2 / TASK-108:** clean checkout packaging, exact ship-set inspection, package lifecycle, required license, and generic package-boundary proof.
- **Story 1.3 / TASK-109:** installation of the exact local tarball, both npm-generated executables, installed resource resolution, and prerequisite failures.
- **Story 1.4 / TASK-110:** persisted candidate identity, package bytes, digests, source binding, evidence, and release-note preview.
- **Stories 1.5-1.6 / TASK-111-112:** read-only GitHub and npm state assessments.
- **Story 1.7 / TASK-113:** combined blocked/ready/matching/resumable/conflicting/complete classification.
- **Later human-authorized activation:** permanent identity/policy choices, authority/trust configuration, tags, releases, publication, and public verification.

### Git Intelligence

- The current branch is `feature/authoring-agent-onboarding-task-107`; TASK-107 was already claimed before this story artifact was created.
- Recent work established the Node 20/22 matrix and exact gate discipline. Preserve Node `>=20` compatibility and test against the existing unit/integration split.
- The onboarding planning commit introduced TASK-107-TASK-127 plus the scoped PRD, architecture, investigation, UX, readiness, and sprint artifacts. The current onboarding epic is authoritative; `_bmad-output/planning-artifacts/epics.md` is an intentionally historical foundation projection and must not remap Story 1.1 to TASK-1.
- Existing working-tree changes in `.bmad/sdlc-state.yaml`, `.gitignore`, TASK-107, `.codex/`, `.serena/`, and `_bmad-output/story-automator/` predate this story-file write. Preserve them; do not clean or overwrite unrelated work.

### Project Structure Notes

- The intended new release-preparation seam is top-level and unshipped. This is an explicit exception to the normal product `commands -> operations -> services -> model` path, not a reason to weaken that path.
- `tsconfig.json` currently typechecks only `src/**/*.ts`, `test/**/*.ts`, and `vitest.config.ts`; `biome.json` currently includes `src/**`, `test/**`, and root JSON/TS. A new nested top-level tooling tree needs explicit inclusion.
- `package.json.files` is an allowlist. Keep the new seam outside it and prove the exclusion without expanding Story 1.2's full package contract.
- No architecture conflict was found. Exact TypeScript types and top-level directory names are open realization choices.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-1.1-Expose-an-Inactive-Distribution-Contract]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Epic-1-Verified-WPM-Distribution-Preparation]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/prd.md#Non-functional-requirements]
- [Source: _bmad-output/planning-artifacts/addendum.md#Deferred-distribution-activation-inputs]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Requirements-and-Epic-Mapping]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Architectural-Boundaries]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Confirmed-Findings]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Backlog-safe-implementation-boundaries]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/review-first-run.md#Missing-Climax-and-Failure-Coverage]
- [Source: docs/12-builder-architecture.md#Distribution-and-the-users-install-experience]
- [Source: docs/13-core-architecture.md#Two-principles-the-whole-architecture-rests-on]
- [Source: docs/task-writing-conventions.md#The-principle]
- [Source: npm Docs, package.json `private` field (accessed 2026-08-21): https://docs.npmjs.com/files/package.json/#private]
- [Source: Backlog CLI `backlog task TASK-107 --plain`]

## Dev Agent Record

### Agent Model Used

OpenAI Codex (GPT-5)

### Implementation Plan

- Keep the activation inventory and classifier pure, deterministic, and permanently inactive for this increment.
- Put the local JSON/process edge in an unshipped top-level seam covered by TypeScript and Biome but excluded from `dist`, npm files, and generated deliverables.
- Fail closed in package metadata and qualify only the approved conflicting documentation surfaces.
- Prove the closed inventory, evidence separation, executable boundary, public-surface consistency, and absence of publication capabilities with focused unit/integration tests.

### Debug Log References

- BMAD input discovery: current sprint tracker, the current onboarding epic (with the historical foundation projection examined only to exclude it), PRD/addendum, historical/scoped architecture, nested UX validation, investigation, repository source, and recent Git history.
- No previous-story intelligence applies: Story 1.1 is the first story in the epic.
- No live registry result was used as authority. Fresh official npm documentation was checked only to verify the stable `package.json` `private: true` publication guard; no library/API version decision was introduced.
- `bmad-create-story` activation customization resolved with no prepend/append hooks, no matching project-context fact file, and no workflow override; the skill ran in YOLO mode, and the final `workflow.on_complete` resolver returned empty.
- `bmad-dev-story` ran in YOLO mode on this explicit story path. Activation customization resolved with no prepend/append steps, no matching project-context fact file, and no workflow override.
- RED: the immutable-inventory test failed because individual fact definitions were mutable; freezing the definitions made the unit band green.
- RED: the public-surface audit exposed the missing `private` guard and README's canonical package claim; `npm pkg set private=true --json` plus the approved documentation corrections made those assertions green without changing the lockfile.
- RED: the tooling-coverage assertion and TypeScript run showed the top-level JavaScript seam escaped base checks; explicit `allowJs`/`checkJs` and Biome inclusion restored direct coverage while `tsconfig.build.json` continued to exclude it.
- GREEN: focused readiness/public-surface band 3 files / 29 tests; established help/template/init regression band 5 files / 52 tests; package-runtime band 1 file / 4 tests.
- GREEN: `npm run typecheck`; `npx biome ci .` (206 files); `npm run build`; explicit no-preparation-file check under `dist`; `git diff --check`; exact `npm test` 103 files / 1,323 tests in 412.05s.
- Review continuation: `bmad-dev-story` was re-invoked in YOLO mode on this explicit story after cycle 1. Customization again resolved no prepend/append steps, no matching project-context fact, and no workflow override.
- Re-absorption audit: independently inspected all six automatic fixes against AC 1-3 and the unshipped ports-and-adapters boundary. Dynamic-help completion parity, nested JSON validation, generic acquisition canaries, the exact local bin-map wording, File List reconciliation, and changelog anchor all remain correct; no further product/test change was warranted.
- Executable SHA-256 values remained `df2eac3a…ace4d6` (assessment entry), `fcddf755…56f16` (classifier), `92fb7ed0…553bf` (unit contract), `1212e0d7…b9ef7` (assessment integration), and `93800175…0b91d` (public-surface integration).
- Review-continuation gates: focused 31/31 across 3 files, typecheck, Biome CI across 206 files, production build with no preparation output in `dist`, and `git diff --check` all passed. Because the executable hashes remained unchanged, the reviewer's exact full 1,325/1,325 run across 103 files in 410.73s remains applicable.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story 1.1 mapped to TASK-107 and the current onboarding epic; the historical foundation Epic 1 was explicitly excluded.
- Current false public-coordinate claims, architecture boundaries, reuse points, regression cases, and downstream scope boundaries were identified.
- `bmad-create-story` executed in YOLO mode. Checklist validation found and repaired the shipped-`docs/12` scope gap, complete-input ambiguity, publication-guard ambiguity, and rendered-front-door coverage gap; no critical or major issue remains.
- Implemented an immutable eight-fact contract with separate proposal, authorization, and availability/control evidence, stable aggregate ordering, independent GitHub/npm authority findings, and an intentionally inactive complete-input boundary.
- Added a local-only assessment executable with structured fail-closed output, input-shape diagnostics, the existing 0/2/1 exit semantics, and no network, credential, subprocess, or mutation capability.
- Added the standard npm publication guard while preserving package name, both executable aliases, Node compatibility, and the exact ship allowlist; no dependency or lockfile change was required.
- Qualified only the approved current-state claims in README, FAQ, CONTRIBUTING, and shipped docs/12; retained npm/GitHub as future targets and retained `wpm build publish` for generated archives.
- Cross-surface coverage now audits package metadata, publication automation, full CLI help, every packaged authoring-skill document, rendered authoring guidance, production build exclusion, and generated-deliverable exclusion.
- The read-only audit found no critical functional defect. Scope-relevant safeguards were absorbed; exact archive inspection and packed-install proof remain with Stories 1.2-1.3 as required.
- Story tasks and acceptance criteria are implemented and all local gates pass; status moved to `review` for independent review.
- Independent review cycle 1 fixed all confirmed findings, revalidated all three acceptance criteria, and approved the story with no in-scope follow-up.
- Re-absorbed and independently validated all cycle-1 fixes through the actual `bmad-dev-story` continuation; no source or test adjustment was needed, and the story returned to `review` for cycle 2.
- Independent review cycle 2 closed one medium acquisition-guard gap and one low tracker-coherence issue,
  reran the exact full gate on the final test surface, and approved the story as done.

### File List

- `.github/workflows/ci.yml`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `FAQ.md`
- `README.md`
- `_bmad-output/implementation-artifacts/1-1-expose-an-inactive-distribution-contract.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-107.md`
- `biome.json`
- `distribution-preparation/assess-readiness.js`
- `distribution-preparation/readiness.js`
- `docs/12-builder-architecture.md`
- `package.json`
- `test/integration/distribution-preparation/assessment.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/readiness.test.ts`
- `tsconfig.json`

### Change Log

- 2026-08-21: Implemented the fail-closed inactive distribution contract, truthful public surfaces, and regression coverage; moved Story 1.1 to review.
- 2026-08-21: Independent review cycle 1 fixed five medium and one low finding, completed the exact full gate, and approved Story 1.1 as done.
- 2026-08-21: Re-absorbed all cycle-1 fixes without further implementation changes and returned Story 1.1 to review for cycle 2.
- 2026-08-21: Independent review cycle 2 fixed one medium and one low finding, completed a fresh exact full
  gate on the final diff, and approved Story 1.1 as done.

## Senior Developer Review (AI)

### Outcome

**APPROVE — review cycle 1.** All three acceptance criteria are observably satisfied. No critical, high,
medium, or low in-scope finding remains after automatic fixes.

### Findings and Automatic Fixes

- [x] **MEDIUM — dynamic CLI help escaped the claimed complete audit.** The static Commander tree omits the
  separately-built `bundle <id>` program. The public-surface test now drives every current dynamic group and
  leaf through public `run()`, with completion parity guarding the explicit path inventory.
- [x] **MEDIUM — malformed nested JSON could escape the machine contract.** The maintainer entry point now
  validates proposal, authorization, evidence kind, and evidence reference shapes before classification;
  subprocess tests cover primitive and unsupported nested values.
- [x] **MEDIUM — acquisition detection was tied to known placeholder names.** The cross-surface guard now rejects
  arbitrary package coordinates across common npm-compatible install/executor forms and every GitHub release
  URL form while explicitly allowing local setup, the Backlog.md peer, and the FAQ's `npx skills` comparison.
- [x] **MEDIUM — shipped docs misstated the local executable map.** `docs/12-builder-architecture.md` now records
  both local aliases, `wpm` and `installer`, targeting `./dist/cli.js`, without authorizing a future public alias
  policy.
- [x] **MEDIUM — the story File List omitted its QA artifact.** The File List now includes the TASK-107 test
  summary and the review-touched changelog.
- [x] **LOW — the deferred-release heading left a dead changelog link.** `CHANGELOG.md` now targets the current
  `Release activation is deferred` anchor.

### Acceptance Criteria Validation

- **AC 1 — PASS.** The immutable eight-key inventory aggregates every unresolved fact exactly once in stable
  order; partial, wholly missing, and independently missing channel-authority inputs are covered in pure and
  executable tests.
- **AC 2 — PASS.** Private package metadata, absent publication automation, corrected public documentation,
  static and dynamic CLI help, every packaged authoring-skill document, and rendered front-door guidance are
  audited without selecting or advertising a public coordinate or release channel.
- **AC 3 — PASS.** Proposal, WPM authorization, availability/control evidence, occupied-incompatible state, and
  metadata-only state remain independent; none can make this increment release-eligible.

### Verification Evidence

- Focused Story 1.1 band: **31/31 tests passed across 3 files**.
- `npm run typecheck`: passed.
- `npx biome ci .`: passed, **206 files checked**.
- `npm run build`: passed; explicit inspection found no `distribution-preparation` output under `dist/`.
- Exact fresh `npm test`: **1,325/1,325 tests passed across 103 files in 410.73 seconds**.
- Official npm `package.json` documentation was rechecked on 2026-08-21 and confirms that `private: true`
  refuses publication; no registry observation or remote mutation was used.

### Workflow and Scope Evidence

- The actual `bmad-story-automator-review` workflow was invoked non-interactively with automatic fixes on this
  story. Customization resolution found no prepend/append override, no matching `project-context.md` fact file,
  and no completion hook.
- Review baseline: `63ee60bcaee007b4c1e160283986e33ffef47a95`.
- No dependency, Node-floor, public-distribution, credential, release, tag, or remote-state capability was added.
- `.bmad/sdlc-state.yaml`, Backlog task/status state, `.gitignore`'s pre-existing automator ignore, `.codex/`,
  `.serena/`, and `_bmad-output/story-automator/` were excluded and not mutated by review.

## Senior Developer Review (AI) — Cycle 2

### Outcome

**APPROVE.** All three acceptance criteria remain observably satisfied. The six cycle-1 findings remain
closed, the two fresh cycle-2 findings were automatically fixed, and no unresolved in-scope finding remains.

### Findings and Automatic Fixes

- [x] **MEDIUM — allowed command prefixes could hide a later or differently spelled public coordinate.**
  The AC2 guard now normalizes shell-quoted coordinates and line continuations, recognizes package-manager
  options before the install/executor verb, and rejects additional positional arguments after the narrowly
  allowed `backlog.md` and bare `npx skills` forms. Regression canaries cover every concrete bypass found by
  both independent auditors.
- [x] **LOW — the sprint tracker's duplicated update timestamps disagreed.** The comment and YAML timestamp
  were synchronized while moving Story 1.1 from `review` to `done`.

### Prior-Finding Closure

- [x] Dynamic `bundle <id>` help is audited with completion parity.
- [x] Nested JSON proposal, authorization, evidence-kind, and evidence-reference shapes are validated.
- [x] Arbitrary acquisition coordinates and all GitHub release URL forms remain rejected.
- [x] Shipped docs record the exact local `{ wpm, installer } -> ./dist/cli.js` bin map without selecting a
  public alias policy.
- [x] The story File List includes its QA artifact and exactly matches the 17-file in-scope inventory.
- [x] The changelog's deferred-release link resolves to the current heading.

### Acceptance Criteria Validation

- **AC 1 — PASS.** The immutable eight-key inventory still aggregates every unresolved fact exactly once in
  stable order, and malformed caller data fails closed at the executable boundary.
- **AC 2 — PASS.** Package metadata, automation, public docs, static and dynamic help, packaged skill docs, and
  rendered authoring guidance remain truthful; the strengthened canaries prevent the allowed local/peer
  snippets from masking a second public coordinate.
- **AC 3 — PASS.** Proposal, authorization, availability/control evidence, occupied-incompatible state, and
  metadata-only state remain independent and cannot produce release eligibility.

### Verification Evidence

- Focused Story 1.1 band: **31/31 tests passed across 3 files**.
- `npm run typecheck`: passed.
- `npx biome ci .`: passed, **206 files checked**.
- `npm run build`: passed; explicit inspection found no `distribution-preparation` output under `dist/`.
- Exact fresh final `npm test`: **1,325/1,325 tests passed across 103 files in 423.44 seconds**.
- `git diff --check`, package-lock baseline equality, exact package/bin/private checks, and the 17-file
  story-inventory comparison passed.
- Official npm `package.json` documentation was checked on 2026-08-21 and still states that `private: true`
  makes npm refuse publication.

### Workflow and Scope Evidence

- The actual `bmad-story-automator-review` workflow was re-invoked from scratch in automatic-fix mode on this
  explicit story. Customization resolution found no prepend/append override, no matching
  `project-context.md` fact file, and no completion hook.
- Review baseline: `63ee60bcaee007b4c1e160283986e33ffef47a95`.
- Readiness logic, assessment entry point, package dependencies, lockfile, Node floor, public distribution
  policy, and remote-state capabilities were unchanged in cycle 2. Only the AC2 regression test and the
  story/QA/sprint review records changed.
- `.bmad/sdlc-state.yaml`, Backlog task/status/AC/DoD state, `.gitignore`, `.codex/`, `.serena/`, and
  `_bmad-output/story-automator/` remained excluded and were not mutated by cycle-2 review.
- `AGENTS.md` and `docs/SDLC.md` changed concurrently after the cycle-2 inventory was captured. Their
  process-policy-only diff was inspected, left untouched, and excluded from TASK-107's 17-file story inventory.
