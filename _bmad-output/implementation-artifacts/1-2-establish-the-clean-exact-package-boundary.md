---
baseline_commit: 5d1c08aaa03be0211274936cfa3715a4a962be2f
---

# Story 1.2: Establish the Clean Exact Package Boundary

Status: done

<!-- Note: Validated with the bmad-create-story checklist before finalization. -->

## Story

As a WPM maintainer,
I want a clean checkout to produce an inspectable WPM package,
so that I know exactly what a consumer would receive without relying on local development state.

## Acceptance Criteria

1. **Given** a clean checkout at a specific source revision without ignored build output, caches, or contributor-local state, **when** the distributable package is produced, **then** packaging succeeds without requiring any absent local state.
2. **Given** a package has been produced from a clean checkout, **when** its source binding is inspected, **then** the package is bound to the evaluated revision and its declared ship set.
3. **Given** a produced package, **when** its boundary is inspected, **then** its paths, package identity, version, and executable targets are reported.
4. **Given** a produced package, **when** its declared ship set is inspected, **then** every runtime, executable, template, WPM skill, document, license, and metadata asset required by that revision is present and resolvable.
5. **Given** a later source revision declares another required ship-set asset, **when** that revision is inspected through the same package-boundary contract, **then** omission of that asset is rejected without requiring a special-case inspection rule for its artifact type.
6. **Given** prohibited development, backlog, planning, workspace-authoring, credential, or preparation content is present, or required content is absent, **when** inspection completes, **then** the package is rejected and every detected violation is identified.

## Tasks / Subtasks

- [x] Establish one revision-scoped package-boundary contract (AC: 2, 3, 4, 5, 6)
  - [x] Expand the revision's declared package roots and npm-required root assets into one normalized expected path set after a clean build; do not maintain separate hand-written inventories for skills, templates, docs, or future asset types.
  - [x] Bind the expected set to the exact evaluated Git revision and fail if the requested revision, checkout state, or package inputs do not match that binding.
  - [x] Report deterministic structured evidence: inspection result, source revision, package name and version, declared executable map, expected paths, actual packed paths, and all violations.
  - [x] Reject duplicate, absolute, traversal, escaping-link, missing, unexpected, or otherwise unresolvable package paths through the same generic path contract.
- [x] Make package production independent of ambient build state (AC: 1, 2)
  - [x] Ensure the supported pack path creates a fresh production build from a lockfile-installed clean checkout and never consumes a pre-existing ignored `dist/` tree.
  - [x] Preserve the clean-before-build guarantee so removed source files cannot survive as stale package entries.
  - [x] Keep package preparation local-only: it may build, pack, and inspect local files, but it cannot create commits or tags, publish, mutate remote state, or require credentials.
- [x] Complete and verify the current revision's package assets (AC: 3, 4)
  - [x] Add the license file already required by `docs/12` and consistent with the manifest's existing `MIT` declaration.
  - [x] Verify the packed metadata preserves the current local identity, version, Node requirement, dependency declarations, private guard, and both declared executable aliases.
  - [x] Verify every executable target and package-relative runtime resource root resolves within the packed boundary; invocation after installation remains Story 1.3.
- [x] Reject the complete invalid boundary in one pass (AC: 4, 5, 6)
  - [x] Compare the actual packed set with the generic expected set and aggregate all missing and unexpected paths instead of stopping at the first failure.
  - [x] Apply explicit deny rules for development, backlog, planning, generated workspace-authoring, credential, and distribution-preparation state, including prohibited content nested beneath an otherwise allowed root.
  - [x] Keep violation ordering stable across reruns and identify each offending or missing path with a machine-readable reason.
- [x] Keep preparation tooling outside every shipped product boundary (AC: 6)
  - [x] Extend the existing top-level `distribution-preparation/` seam and its direct test coverage; do not add a product CLI command, product operation, core port, or code under `src/core/`.
  - [x] Prove the inspector and its evidence/fixtures are absent from the WPM npm package and from generated work-package zip, tarball, and Git deliverables.
  - [x] Preserve Story 1.1's inactive public-distribution guard and truthful public surfaces.
- [x] Add focused package-contract and clean-checkout tests (AC: 1-6)
  - [x] Exercise a real pack from a clean revision with dependencies installed from the lockfile and no prior `dist/`, then inspect the package actually produced.
  - [x] Assert exact path parity for the current revision, required license and executable targets, identity/version/bin reporting, and absence of representative prohibited state.
  - [x] Add a generic fixture where a newly declared required asset is omitted; prove the unchanged inspector rejects it without an artifact-specific rule.
  - [x] Add one case with several simultaneous missing, unexpected, prohibited, and invalid-path findings and prove they are all reported in stable order.
  - [x] Prove stale or contributor-local ignored output cannot alter the clean package result.
- [x] Verify scope and quality gates (AC: 1-6)
  - [x] Run focused tests, `npm run typecheck`, `npx biome ci .`, the production build, and the stable-diff full Vitest gate.
  - [x] Exercise the clean package proof on the supported Node 20/22 and operating-system CI matrix without adding a publication workflow or write permission.
  - [x] Confirm Stories 1.3-1.7 remain responsible for packed installation, persisted candidate bytes/digests, channel assessment, and combined release-state classification.

## Dev Notes

### Developer Context

This story proves the npm package for the **WPM builder itself**. It is separate from `wpm build package`, which packages a generated work-package's filtered `wip/` deliverable. Reusing the generated-work-package packager would cross two product boundaries and produce the wrong artifact.

The package contract must be exact without becoming a brittle catalog. The current revision declares package roots through `package.json.files`; npm also includes required root metadata such as `package.json`, README, license, and declared executable targets. Expand that declaration into normalized leaf paths after the clean production build, then compare it with the actual package. A later story that adds another file beneath a declared skill, template, documentation, runtime, or metadata root is thereby covered automatically. If a later revision adds a new ship root, changing the declaration is sufficient; the inspector must not need a new `if artifactType === ...` branch.

“Workspace-authoring content is prohibited” does **not** exclude WPM's package-owned `agent-skills/` or the authoring front-door sources inside `templates/`; those are required assets of this revision. It excludes generated workspace instances and local authoring state such as root `AGENTS.md`/`CLAUDE.md`, `.authoring-backlog/`, managed onboarding state, `builds/`, and other contributor-local surfaces. Likewise, shipped design documents under the declared `docs/` root are product documentation, while `_bmad-output/`, `backlog/`, `.bmad/`, and investigation/planning state are not package content.

Story 1.2 produces and inspects a real local package. Story 1.3 installs that exact package in an isolated consumer prefix and invokes npm-generated shims. Story 1.4 later persists a candidate record with artifact size and digests. Do not pull those downstream responsibilities forward, but leave the successful package path usable as their input.

### Technical Requirements

- Treat the checked-out commit, package declaration, clean production output, and packed archive as one operation/evidence chain. A caller-supplied revision string alone is not proof; verify it against the source being packed and reject dirty or mismatched source input when claiming a clean revision.
- Inspect the package actually produced, not only repository files and not only a pre-build `npm pack --dry-run` preview. The structured npm pack result can be useful evidence, but acceptance requires the real archive boundary to agree with the independently expanded expected set.
- Normalize package paths to portable forward-slash relative paths. Reject absolute paths, `..` traversal, duplicates after normalization, and links or executable targets that escape or do not resolve inside the package.
- Report package identity and version from packed metadata and report the complete packed `bin` map. Every declared target must exist inside the packed set. Do not rename `wpm`, choose a public npm coordinate, remove the legacy `installer` alias, or reinterpret either alias as approved public policy.
- Required runtime content means the compiled `dist/` tree and the package metadata that lets npm resolve declared dependencies and the required Backlog.md peer. `node_modules/` is never part of the package ship set.
- The current package-relative resource relationships are intentional: `dist/cli.js` resolves `../templates` and `../agent-skills`, while `dist/version.js` resolves the package-root `package.json`. Preserve and inspect those relationships; Story 1.3 proves them from an installed package.
- Package production must start without `dist/` and must use the lockfile-installed toolchain. A pre-existing or stale ignored `dist/` must neither be required nor survive the clean build into the archive.
- Keep lifecycle responsibilities acyclic. If `prepack` performs the clean production build, the command that invokes `npm pack` must not itself be called from `prepack` or `prepare`; avoid recursive pack execution and keep Husky's contributor setup separate from package inspection.
- Return all boundary violations together with deterministic ordering. If a maintainer executable is added, retain the repository's `0` success, `2` bad invocation, `1` operational/validation failure convention.
- Make deny rules path/type based and explicit. Product documentation may discuss credentials, planning, or authoring without becoming prohibited content; do not use a broad prose/token regex that rejects legitimate shipped docs or examples.
- Local build/pack output is allowed. Network writes, tags, commits, Git pushes, release objects, npm publication/dist-tags, credentials, OIDC, secrets, protected environments, or mutation-capable release adapters are forbidden.

### Architecture Compliance

- Distribution preparation is the approved top-level unshipped exception. Extend `distribution-preparation/` and its tests; keep it outside `src/core`, `src/`, `tsconfig.build.json`, `dist/`, `package.json.files`, and generated work-package deliverables.
- Do not add a fifth product port or a public `wpm` subcommand. This is maintainer/release preparation, not a product operation in the CLI lifecycle.
- Preserve the pure-core rule: no Commander, Execa, Omelette, filesystem, OS, or subprocess import enters `src/core/**`. This story should require no core change.
- Keep the two ship-set contracts distinct:
  - WPM npm package: package-root metadata plus declared `agent-skills/`, `dist/`, `docs/`, and `templates/`.
  - Generated work-package: the filtered and transformed contents of an authoring workspace's `wip/`.
- `package.json` remains `private: true`; a valid local package boundary is not public release eligibility. Story 1.1's inactive readiness classifier remains authoritative for activation status.

### Current-State and Regression Guardrails

- At baseline `5d1c08a`, `package.json` declares `name: "wpm"`, version `0.1.0`, Node `>=20`, `private: true`, required peer `backlog.md >=1.0.0`, and `{ wpm, installer } -> ./dist/cli.js`.
- The current explicit npm allowlist is `agent-skills`, `dist`, `docs`, and `templates`. Keep the allowlist narrow; the license and standard metadata are npm-required root assets rather than permission to ship arbitrary repository-root files.
- `dist/` is ignored and has zero tracked files. `npm run build` already deletes it before compiling. Do not weaken that clean step.
- A fresh 2026-08-21 diagnostic from the populated working tree reported 420 packed entries: README, seven current `agent-skills` files, 372 ignored `dist` files, 17 docs, 22 template files, and `package.json`. No license was present. Counts and byte sizes are observations, not acceptance constants; exact paths for the evaluated revision are the contract.
- `npm pack` runs `prepack`, `prepare`, then `postpack`. The existing `prepare: husky` is contributor setup, not a production build, and currently does not create `dist/`. Preserve contributor hook behavior while making the clean pack path self-contained.
- TASK-106 restored Commander 14.0.3 and proved required production dependencies support both Node 20 and 22. Do not introduce a Node 22-only API or dependency; use the package manager for any dependency change and retain the lockfile/runtime compatibility test.
- TASK-107 established `distribution-preparation/` as checked JavaScript: `tsconfig.json` typechecks it with `allowJs`/`checkJs`, Biome includes it, and `tsconfig.build.json` excludes it. Reuse that seam and extend the coverage assertions when adding files.
- `test/integration/distribution-preparation/public-surfaces.test.ts` currently pins the exact package allowlist, inactive metadata, absence of publication capability, and the two Story 1.1 preparation files. Update its coverage inventory deliberately rather than bypassing it.
- Preserve all public-surface acquisition guards. A locally valid tarball must not make README, FAQ, CLI help, skills, templates, or docs claim that a public npm/GitHub coordinate is available.

### Library / Framework Requirements

- Continue with Node.js 20+ ESM, npm's package lifecycle, checked JavaScript for unshipped preparation, TypeScript 6.0.3, Vitest 4.1.7, and Biome 2.4.16.
- The local baseline is npm 10.9.4; official npm v10 documentation confirms that `npm pack` runs `prepack`, `prepare`, and `postpack`, that `files` is an inclusion declaration, and that package metadata, README, license, and bin targets receive special inclusion treatment. Keep tests on supported documented behavior rather than parsing human-formatted npm notices.
- No new runtime dependency is required by the story. If a portable archive reader or other development-only package is genuinely needed, add it with npm, verify its Node 20 support, and keep it out of production dependencies and the WPM archive unless consumers require it.
- Do not import an undeclared package merely because npm currently brings it transitively. Archive inspection must use declared, Node-20-compatible tooling and work on Linux, macOS, and Windows without silently assuming a system `tar` executable.
- Use Vitest's existing unit/integration projects. Keep expected-set normalization and comparison directly testable; use subprocess/filesystem integration only for the real clean build and npm package boundary.

### File Structure Requirements

Likely **NEW** (exact names are refinable):

- root `LICENSE`, matching the already-declared MIT license;
- one or more checked JavaScript modules under `distribution-preparation/` for generic ship-set planning, real package preparation/inspection, and structured reporting;
- unit tests under `test/unit/distribution-preparation/` and real-package integration tests under `test/integration/distribution-preparation/`.

Expected **UPDATE**:

- `package.json` for a self-contained local package/inspection entry and pack lifecycle as needed; preserve identity, version, bins, dependency classes, private guard, and narrow files allowlist;
- `test/integration/distribution-preparation/public-surfaces.test.ts` for new preparation files and exact WPM-package exclusion checks;
- `.github/workflows/ci.yml` or an equivalent existing gate path so a clean checkout proves packaging before ambient `dist/` can mask failure;
- `README.md` or `CONTRIBUTING.md` only as needed to document the local maintainer command while retaining explicit inactive-distribution language;
- `CHANGELOG.md` under `[Unreleased]` for the new package-boundary capability;
- `package-lock.json` only through npm and only if a package-manager operation actually changes lock-governed metadata or dependencies.

Expected **INSPECT / USUALLY NO CHANGE**:

- `src/cli.ts`, `src/version.ts`, and `src/core/operations/install-authoring-skill.ts` for package-relative runtime paths;
- `test/integration/cli.bin.test.ts` and `test/integration/package-runtime-support.test.ts` for regression context;
- `distribution-preparation/readiness.js` and `assess-readiness.js`; extend beside them rather than coupling package validity to activation status;
- `src/core/**`, product ports/adapters, generated-work-package packager code, and human-owned `docs/00`-`14`.

Do not edit anything under `backlog/` directly. Story status, criteria, and notes are managed only through the Backlog CLI by the owning workflow.

### Testing Requirements

- **Pure contract:** expected and actual paths normalize deterministically; equal sets pass; missing and unexpected sets fail; duplicates/traversal/absolute/escaping links fail; all issues aggregate in stable order.
- **Generic future asset:** start from a declaration with an additional arbitrary required file, leave that file out of the observed package, and prove the unchanged comparator reports it. The fixture must not teach the comparator a new skill/template/doc-specific category.
- **Clean source:** on a clean checked-out revision after `npm ci`, prove `dist/` is absent before package production, the supported command builds and packs successfully, and the produced package contains no stale or contributor-local ignored sentinel.
- **Real packed boundary:** inspect the actual tarball and assert exact expected/actual path parity, identity/version, both bin mappings, in-boundary bin targets, license, compiled runtime, templates, current WPM skills, docs, and metadata.
- **Aggregate rejection:** inject several prohibited categories plus missing required paths in one fixture and assert every finding once, in stable order; avoid snapshot-only coverage.
- **Non-leakage:** assert source/tests, `node_modules`, `.git`, `.github`, `.bmad`, `_bmad-output`, backlog roots, workspace front doors/state, credentials, `distribution-preparation/`, and its evidence/fixtures do not enter the npm package. Retain generated-work-package non-leakage coverage separately.
- **Source binding:** cover exact revision success plus dirty/mismatched revision failure. The report must never label a package as bound merely because the caller supplied a SHA string.
- **Regression:** keep Story 1.1's private/inactive/no-public-acquisition contract, TASK-106's Node 20/22 dependency contract, production build, CLI help, and current resource-root behavior green.
- Run the focused band while the diff moves, then one full `npm test` on the stable product/test diff. Story 1.3 owns fresh-prefix installation and real npm-generated bin invocation; do not duplicate it here.

### Previous Story Intelligence

- Story 1.1 created the top-level unshipped preparation seam and its direct JavaScript typecheck/Biome coverage. Extend it rather than creating release logic in `src/` or a parallel tooling root.
- The previous story's independent reviews strengthened structured input validation, dynamic CLI-help coverage, generic public-acquisition canaries, exact file-list accounting, and inactive package metadata. Package-boundary work must keep those fixes intact.
- `private: true` is deliberate and compatible with local packing. Do not remove it to make Story 1.2 pass.
- The final Story 1.1 regression was 1,325/1,325 tests across 103 files, with 31 focused distribution-preparation tests. Use that as a regression baseline, not as evidence that clean packaging already works.
- Story 1.1 explicitly deferred exact clean pack inspection to this story, packed installation to Story 1.3, and candidate digests to Story 1.4. Preserve that ownership split.

### Git Intelligence

- Current baseline: `5d1c08a` (`chore: advance onboarding epic after task-107`) on `feature/authoring-agent-onboarding-task-108`.
- `8e3f2f9` implemented Story 1.1's inactive contract and established the current preparation/test patterns; merge `7514774` integrated it.
- `bc3e4a6` restored Node 20 support, expanded both-bin coverage, and added the production-dependency/CI-matrix contract; merge `acaac7b` integrated it.
- The current branch includes pre-existing concurrent process/backlog changes in `.bmad/sdlc-state.yaml`, `AGENTS.md`, `docs/SDLC.md`, TASK-108's CLI-managed record, and `.serena/`. They are outside Story 1.2 implementation unless the owning workflow explicitly changes them; do not overwrite or clean them.

### Latest Technical Information

- Official npm v10 `npm pack` documentation states that `--dry-run` only reports what would happen and that `--json` changes output form. Use dry-run for diagnostics only; acceptance inspects a package actually produced.
- Official npm v10 package metadata documentation states that `files` is inclusion-oriented, that a root `.gitignore` can affect packing when `.npmignore` is absent, and that `package.json`, README, license, and bin targets are specially included. The expected-set planner must account for those rules without accepting arbitrary undeclared files.
- Official npm v10 lifecycle documentation states that `npm pack` runs `prepack`, `prepare`, and `postpack`, while `npm ci` also runs `prepare`. Keep the production build in a lifecycle/command position that makes a clean pack self-contained without turning Husky installation into release behavior.
- No version upgrade is part of this story. The research confirms behavior for the installed npm 10 line and does not authorize a dependency or Node-floor change.

### Scope Boundaries

- **Story 1.3 / TASK-109:** install the exact tarball into a fresh prefix, invoke both npm-created executable shims, resolve installed resources, and report prerequisite failures.
- **Story 1.4 / TASK-110:** persist one candidate record binding the exact artifact bytes, size, digests, revision, quality/install evidence, and release-note preview.
- **Stories 1.5-1.7 / TASK-111-113:** read-only GitHub/npm assessment and combined convergence classification.
- **Later Epic 2/3 stories:** add the `wpm-*` skill family and template authoring-task assets. The final cold gate reruns this same generic package inspection against that final revision; Story 1.2 must not pretend those future assets exist now.
- **Later human-authorized activation:** choose the public package coordinate or alias policy, add mutation capability, configure authority/trust, tag, release, publish, or claim public acquisition.

### Project Structure Notes

- The top-level `distribution-preparation/` exception is already explicit in the scoped architecture. Keeping package inspection there aligns with NFR17 and avoids contaminating the product's ports-and-adapters model.
- `tsconfig.json` and `biome.json` already cover every JavaScript file recursively under that directory; `tsconfig.build.json` emits only `src/**/*.ts`. Extend the existing coverage tests so a future path change cannot silently ship the tooling.
- The package's runtime roots are siblings of `dist/`, not repository-relative developer paths. Exact boundary inspection should preserve this layout and let Story 1.3 prove it after installation.
- No architecture conflict was found. Exact module names, report filename, and whether the expected-set declaration is represented as code or data remain implementation choices; the observable generic contract above is fixed.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-1.2-Establish-the-Clean-Exact-Package-Boundary]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Epic-1-Verified-WPM-Distribution-Preparation]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/prd.md#Cross-cutting-non-functional-requirements]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Architectural-Boundaries]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md#Separate-Existing-Platform-Compatibility-Risk]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Finding-6-The-observed-npm-boundary-is-real-but-not-clean-release-safe]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Finding-18-The-clean-package-chain-breaks-before-npm-pack]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Finding-19-Installed-layout-production-paths-are-already-coherent-the-archive-boundary-is-unproven]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Backlog-safe-implementation-boundaries]
- [Source: _bmad-output/implementation-artifacts/1-1-expose-an-inactive-distribution-contract.md#Current-State-and-Regression-Guardrails]
- [Source: docs/12-builder-architecture.md#What-the-installer-builder-is]
- [Source: docs/12-builder-architecture.md#The-directory-scaffold]
- [Source: docs/13-core-architecture.md#Two-principles-the-whole-architecture-rests-on]
- [Source: docs/task-writing-conventions.md#The-principle]
- [Source: package.json]
- [Source: src/cli.ts#makeRealDeps]
- [Source: src/version.ts]
- [Source: test/integration/distribution-preparation/public-surfaces.test.ts]
- [Source: test/integration/package-runtime-support.test.ts]
- [Source: npm Docs, `npm pack` (v10, accessed 2026-08-21): https://docs.npmjs.com/cli/v10/commands/npm-pack/]
- [Source: npm Docs, `package.json` files/license/bin behavior (v10, accessed 2026-08-21): https://docs.npmjs.com/cli/v10/configuring-npm/package-json/#files]
- [Source: npm Docs, lifecycle operation order (v10, accessed 2026-08-21): https://docs.npmjs.com/cli/v10/using-npm/scripts/#life-cycle-operation-order]
- [Source: Backlog CLI `backlog task TASK-108 --plain`]

## Dev Agent Record

### Agent Model Used

OpenAI Codex (GPT-5)

### Implementation Plan

- Expand the built revision's literal npm `files` roots and npm-required root metadata into one normalized leaf set, then compare it with entries parsed directly from the produced archive.
- Keep source binding and effects in an unshipped maintainer command: verify the requested and checked-out commits, reject dirty inputs, clear ambient build output, run the existing production build through `prepack`, and inspect one local `.tgz`.
- Keep validation generic and deterministic: compare complete package metadata and expected/actual sets, validate paths/links/bins, aggregate explicit prohibited categories, and avoid skill/template/document-specific inspectors.
- Prove the contract with pure unit fixtures, a lockfile-installed clean Git copy and real pack, public-surface/non-leakage regressions, and the existing build/runtime seams.

### Debug Log References

- BMAD input discovery: live sprint tracker; current onboarding epic; scoped PRD/addendum; historical and scoped architecture; UX validation set; final implementation-readiness report; all three onboarding/distribution investigations; Story 1.1, TASK-107 QA/backlog evidence; current source/package boundary; and recent Git history.
- Current package diagnostic: `npm pack --dry-run --json --ignore-scripts` from the populated working tree reported 420 entries and exposed that all 372 `dist/` entries came from ignored local output while no license existed.
- Fresh official npm v10 documentation was checked for pack output mode, package file-selection rules, and lifecycle ordering; no version or dependency change was selected.
- `bmad-create-story` ran in YOLO mode for explicit Epic 1 Story 1.2 / TASK-108. Customization resolved no prepend/append steps, no matching `project-context.md` fact file, and no workflow override.
- `bmad-dev-story` ran in YOLO mode for this story. Customization resolved no prepend/append steps, no matching `project-context.md` fact file, no workflow override, and an empty `on_complete` hook.
- RED evidence: the first boundary test failed on the missing module; declared-root expansion then failed 2/6 with `collectDeclaredShipSet is not a function`; archive inspection failed on the missing module; later focused RED cases exposed nested-category misclassification and a Windows-style escaping-link gap.
- GREEN evidence: package-boundary unit tests 7/7; direct gzip/tar archive tests 3/3; source-binding and real clean-package integration tests 4/4; the combined distribution-preparation band 45/45 across six files.
- Focused regression evidence: built package-runtime and CLI-bin tests 8/8; generated tarball/Git/conditional-zip non-leakage test 1/1; static `dist/` preparation-tool exclusion and `git diff --check` passed.
- Quality evidence: `npm run typecheck`, `npx biome ci .`, and `npm run build` passed. Per the owning workflow's fast-feedback instruction, the expensive full `npm test` stable-diff gate was deliberately not run here and is assigned to the independent reviewer; the Node 20/22 × OS proof is wired into CI and awaits that later CI run.
- `bmad-qa-generate-e2e-tests` ran in YOLO mode for TASK-108. Customization resolved no prepend/append steps, no matching `project-context.md` fact file, and no workflow override; the completion hook resolved empty.
- QA traced all six acceptance criteria, added a clean real-package rejection journey for process-level aggregate prohibited/missing evidence, and passed 46/46 distribution tests, 1/1 generated-format non-leakage test, and 8/8 runtime/bin regressions.
- Independent `bmad-story-automator-review` cycle 1 automatically fixed eight verified package-boundary,
  archive-integrity, clean-binding, deterministic-reporting, and Windows-execution findings. The final focused
  band passed 59/59 distribution tests, 8/8 runtime/bin regressions, and 1/1 generated-format non-leakage test;
  the exact stable-diff full gate passed 1,353/1,353 tests across 107 files.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story 1.2 is mapped to TASK-108 and the scoped onboarding Epic 1; the historical foundation epic was excluded from story selection.
- The clean-build break, absent license, generic expected-set requirement, package/runtime resource relationships, non-leakage boundary, prior-story safeguards, and downstream ownership split are captured.
- Checklist validation closed lifecycle-recursion, undeclared/transitive archive-tool, and deny-rule false-positive risks; no critical or major issue remains. Source-binding strictness, future-asset genericity, nested prohibited content, aggregate diagnostics, actual-archive inspection, and Story 1.3/1.4 scope separation are explicit.
- Implemented a generic revision-scoped expected/actual package contract with complete metadata comparison, stable aggregate violations, portable path/link/bin checks, and explicit path-role denies that retain required template front-door sources.
- Added a dependency-free Node 20-compatible gzip/tar reader and a local-only `package:inspect` command that verifies Git binding, removes stale ignored output, clean-builds through `prepack`, packs real bytes, and emits inspectable JSON evidence.
- Added the required MIT license, documented the inactive local preparation path, and placed the clean package proof before ambient build provisioning in every existing Node 20/22 and OS CI matrix cell without publication permissions or remote-write behavior.
- Verified a clean copied revision installed by `npm ci --ignore-scripts`, with no prior `dist/` and an injected ignored stale sentinel, produces an accepted exact archive containing the required runtime, skills, templates, docs, metadata, license, and both executable aliases.
- Preserved pure core and downstream ownership: no product command/operation/port or `src/core/**` change; packed installation remains Story 1.3, persisted candidate bytes/digests Story 1.4, and channel/convergence assessment Stories 1.5-1.7.
- QA automation now proves the real maintainer process can successfully create an archive yet reject the complete invalid boundary with structured evidence; TASK-108 coverage is 6/6 ACs with no additional product behavior or dependency.

### File List

- `.github/workflows/ci.yml`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `README.md`
- `_bmad-output/implementation-artifacts/1-2-establish-the-clean-exact-package-boundary.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-108.md`
- `distribution-preparation/package-archive.js`
- `distribution-preparation/package-boundary.js`
- `distribution-preparation/prepare-package.js`
- `package.json`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/package-archive.test.ts`
- `test/unit/distribution-preparation/package-boundary.test.ts`
- `test/unit/distribution-preparation/prepare-package.test.ts`

### Change Log

- 2026-08-21: Implemented TASK-108's clean, exact, revision-bound local WPM npm package preparation and inspection contract with focused clean-pack, aggregate-rejection, and non-leakage evidence.
- 2026-08-21: Added QA acceptance coverage for real-archive aggregate rejection and recorded the 6/6 AC trace in the TASK-108 test summary.
- 2026-08-21: Independent review cycle 1 fixed five high and three medium findings, completed the exact full
  gate on stable product/test bytes, and approved Story 1.2 as done.

## Senior Developer Review (AI)

### Outcome

**APPROVE — review cycle 1.** All six acceptance criteria are observably satisfied. No critical, high,
medium, or low in-scope finding remains after automatic fixes.

### Findings and Automatic Fixes

- [x] **HIGH — traversal aliases could normalize into trusted package paths.** Package-path normalization now
  rejects embedded `..` segments and Windows drive-relative forms before normalization; portable alias
  regressions cover slash and backslash inputs.
- [x] **HIGH — broken and cyclic links were accepted as resolvable package content.** Boundary evaluation now
  resolves symbolic- and hard-link chains against actual entries and implicit package directories, rejecting
  absent targets, cycles, directory hard links, and targets outside the package.
- [x] **HIGH — tar hard links were interpreted as relative symbolic links.** The archive reader now preserves
  type-1 hard links and converts their archive-root target separately from type-2 directory-relative symbolic
  links; direct gzip/tar and boundary tests cover both semantics.
- [x] **HIGH — the Windows matrix attempted to execute `npm.cmd` without a shell.** Package preparation and its
  clean-copy integration now execute npm's JavaScript entry through the current Node runtime, with a
  fail-closed Windows fallback and no command-string interpolation.
- [x] **HIGH — ignored contributor input and a late HEAD change could escape the claimed revision binding.**
  Preparation rejects ignored local state after cleaning (apart from the lockfile-installed dependency tree
  and Husky's generated support files), proves the refusal through a real Git/npm process, then rechecks both
  checkout cleanliness and the exact HEAD after archive evaluation.
- [x] **MEDIUM — malformed executable declarations were silently dropped.** Invalid `bin` container shapes,
  command names, and non-string/empty targets now produce stable `invalid-bin-target` evidence instead of an
  accepted empty executable map.
- [x] **MEDIUM — malformed tar evidence could be inspected without structural integrity checks.** Header
  checksums, two-block termination, zero-only trailing padding, dangling extended headers, supported entry
  types, and block alignment are now validated before boundary evidence is accepted.
- [x] **MEDIUM — evidence ordering depended on host locale.** Violation, metadata, and executable ordering now
  uses portable code-point comparison rather than `localeCompare`; a mixed-case regression pins the result.

### Acceptance Criteria Validation

- **AC 1 — PASS.** A lockfile-installed clean copied revision starts without `dist/`, removes an injected stale
  ignored build, rejects unrelated ignored contributor input, and produces the package without ambient state;
  shell-free npm resolution covers the supported Windows path.
- **AC 2 — PASS.** Requested and checked-out revisions must resolve to the same commit, the checkout must remain
  clean, HEAD is revalidated after archive evaluation, and expected/actual paths bind the result to the
  revision's declared ship set.
- **AC 3 — PASS.** Accepted and rejected reports expose sorted expected/actual paths, packed name, version, the
  complete valid executable map, source-binding evidence, artifact path/size, and all violations.
- **AC 4 — PASS.** Current runtime, executable, template, WPM-skill, document, license, and metadata leaves are
  present exactly; executable targets and all packed link chains must resolve inside the archive.
- **AC 5 — PASS.** Literal-root expansion discovers arbitrary nested leaves, and the unchanged evaluator
  rejects an omitted future expected asset without a skill/template/document-specific branch.
- **AC 6 — PASS.** Development, backlog, planning, workspace-authoring, credential, and preparation paths plus
  invalid, duplicate, escaping, unresolvable, missing, unexpected, metadata, and executable violations are
  rejected together in stable order. TASK-107's inactive public-surface and no-write contract remains green.

### Verification Evidence

- Focused distribution-preparation band: **59/59 tests passed across 7 files**.
- Built runtime and executable-alias regressions: **8/8 tests passed across 2 files**.
- Generated tarball/Git/conditional-zip non-leakage: **1/1 test passed**.
- `npm run typecheck`: passed.
- `npx biome ci .`: passed, **213 files checked**.
- `npm run build`: passed; explicit inspection found no `distribution-preparation` output under `dist/`.
- `git diff --check`: passed.
- Exact stable-diff `npm test`: **1,353/1,353 tests passed across 107 files in 396.28 seconds**.
- Stable product/test hash before and after the full gate:
  `45bbf491e7b3bbf7f253eb8c7a65e86c5b34af2ce41a71467855aa5e4f8e7301`.

### Workflow and Scope Evidence

- The actual `bmad-story-automator-review` skill was invoked non-interactively in automatic-fix mode for
  TASK-108. The review skill exposes no project customization file or completion hook, and no matching
  `project-context.md` fact file or review override was present.
- Review baseline: `5d1c08aaa03be0211274936cfa3715a4a962be2f`.
- The persistent reviewer completed the required full sequential preload of `docs/00` through `docs/14`,
  `FOUNDATION.md`, task-writing conventions, sprint/backlog sequence state, and TASK-108 at that same baseline
  before invoking the review skill.
- Official Node 20 child-process documentation was rechecked on 2026-08-21; it confirms Windows `.cmd` files
  require a shell, so the implemented `node <npm-cli.js>` path avoids that unsupported and injection-prone
  execution seam: https://nodejs.org/download/release/v20.19.2/docs/api/child_process.html#spawning-bat-and-cmd-files-on-windows
- No dependency, Node-floor, product CLI/core/port, public-distribution, credential, release, tag, publish, or
  remote-state capability was added. Packed installation remains Story 1.3 and candidate persistence remains
  Story 1.4.
- Backlog/task state, `.bmad/sdlc-state.yaml`, `AGENTS.md`, `docs/SDLC.md`, `.serena/`, branch, commits, and
  merges were excluded and not mutated by review.
