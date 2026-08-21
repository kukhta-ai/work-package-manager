---
baseline_commit: 62f2b168627a9c33f717879476f36ac1f4cc3a95
---

# Story task-106 — Restore declared Node 20+ runtime support

Status: done

> BMAD create-story provenance: `bmad-create-story` was invoked in this persistent worker session. Its
> customization resolved with no activation prepend/append steps and no completion hook; the only persistent
> fact glob (`**/project-context.md`) matched no files. TASK-106 is the explicitly supplied read-only Backlog
> contract, so orchestrator-owned Backlog and sprint/state trackers remain untouched.

## Story

As a WPM package consumer,
I want the installed CLI and all of its required production dependencies to support the declared Node 20+
runtime range,
so that the documented installation prerequisite and CI compatibility promise are true at the package boundary.

## Acceptance Criteria

1. Package metadata continues to declare Node >=20 as supported.
2. User-facing runtime-support documentation identifies Node >=20 as supported.
3. No required production dependency in the resolved install excludes Node 20 from its supported engine range.
4. A clean locked dependency installation completes on Node 20 and Node 22 without an unsupported-engine
   diagnostic caused by WPM or a required production dependency.
5. The built `wpm` and `installer` executables start on Node 20 and Node 22 and report the same installed WPM
   version.
6. The compatibility matrix continues to cover Node 20 and Node 22 on Linux, macOS, and Windows.

## Tasks / Subtasks

- [x] Add an executable package-compatibility contract test before changing the dependency graph (AC: 1, 2, 3,
  6)
  - [x] Assert package metadata and README retain the exact Node >=20 support boundary
  - [x] Inspect every required, non-optional production package in the resolved lock and prove its declared
    engine range intersects both the Node 20 and Node 22 release lines
  - [x] Assert the checked-in CI matrix retains Node 20/22 across Ubuntu, macOS, and Windows
  - [x] Capture the expected red failure identifying the currently incompatible resolved dependency
- [x] Restore the resolved production dependency graph's Node 20 compatibility without changing the public
  runtime floor (AC: 1, 2, 3)
  - [x] Use npm to exact-pin the newest compatible Commander 14 release and regenerate the lockfile
  - [x] Confirm the repair changes only the intended direct dependency metadata and Commander lock entry
- [x] Prove both published executable aliases have one version contract (AC: 5)
  - [x] Drive the built `wpm` and `installer` bin names through their real symlink-style package boundary
  - [x] Assert both start successfully and print the version declared by the installed package
- [x] Validate the clean consumer/runtime boundary (AC: 4, 5)
  - [x] Run clean locked installs with engine checks under current Node 20 and Node 22 runtimes
  - [x] Run the built executable-alias/version assertions under both runtime lines
  - [x] Preserve the existing six-cell CI matrix as the cross-platform proof for Linux, macOS, and Windows
- [x] Run focused tests, typecheck, Biome CI, production build, the exact full test suite, and diff hygiene checks

## Dev Notes

### Current state and narrow implementation seam

- `package.json` and README line 39 both promise Node >=20, and `.github/workflows/ci.yml` already defines the
  intended 3 OS x 2 Node matrix (`20`, `22`). Those contracts are correct for this story and must not be raised,
  weakened, or narrowed.
- The resolved direct dependency `commander@15.0.0` is the defect: its official package metadata declares
  `engines.node: >=22.12.0`. The final readiness report therefore makes this maintenance repair a prerequisite
  to credible package/install evidence for the onboarding increment.
- Current official npm metadata shows `commander@14.0.3` is the newest published v14, declares
  `engines.node: >=20`, and has no dependency, peer-dependency, or optional-dependency graph of its own. Exact
  `14.0.3` is the narrow repair and preserves this repository's exact-pin convention. Do not select v13 merely
  to broaden beyond the declared contract, and do not raise WPM's Node floor to retain Commander 15.
- The current resolved, required production closure has no other package whose declared Node engine excludes
  the Node 20 release line. Preserve that property with a lockfile-level test rather than encoding Commander as
  the only package that can ever regress.
- Use `npm install --save-exact commander@14.0.3` so `package.json` and `package-lock.json` remain one package-
  manager-owned resolution. Do not hand-edit either dependency declaration.

### Architecture and scope guardrails

- This is a package/dependency and integration-test correction. No product feature, command behavior,
  distribution activation, generated-project content, or authoring workflow belongs in TASK-106.
- No `src/core/` change is expected. If implementation unexpectedly reaches the core, preserve docs 12/13's
  pure-core boundary: no Node filesystem/OS, Commander, or subprocess imports under `src/core/`.
- Commander 14 supports the APIs currently exercised by WPM; prove that through the existing CLI regression
  suite rather than introducing a compatibility wrapper without evidence.
- Treat a required production dependency as a non-root `package-lock.json.packages` entry that is neither
  development-only nor optional. For every such entry with `engines.node`, check semantic range intersection
  with the full Node 20 and Node 22 major lines; do not compare engine strings lexically or pin the proof to one
  patch release.
- AC 4 requires more than static metadata: execute `npm ci` from the regenerated lock under both runtime lines
  with engine compatibility enforced (or equivalently fail on any unsupported-engine diagnostic). Keep this
  evidence in the story/QA record; do not add downloaded runtimes or temporary install trees to the repository.
- AC 5 requires both aliases. `test/integration/cli.bin.test.ts` currently creates only an `installer` symlink
  despite its description naming both aliases. Extend the built-boundary test so CI runs the same assertion in
  every Node/OS matrix cell.

### Red-green-refactor and validation requirements

- RED: first add the resolved-production-engine contract and run it against the current lock. It must fail with
  evidence naming `node_modules/commander` and its incompatible `>=22.12.0` range.
- GREEN: make the package-manager-owned exact dependency change, rerun the focused contract, then run the
  existing Commander-backed CLI unit/integration coverage before considering additional code.
- REFACTOR: keep assertions generic, failure messages diagnostic, and package-boundary helpers local to tests.
  Avoid production code for static repository-contract validation.
- After building, run focused package and bin tests under the active runtime, then run both Node 20 and Node 22
  clean-install/startup probes. Finish with `npm run typecheck`, `npx biome ci .`, `npm run build`, and the exact
  full `npm test` command.

### Source discovery and previous-story intelligence

- Create-story discovery loaded the current PRD, architecture plus onboarding addendum, scoped onboarding epics,
  historical/reconciliation epics, the sharded UX artifacts, the final readiness report, TASK-106, and recent
  git history. The UX artifacts add no interaction behavior to this package-maintenance story.
- TASK-105's built-bin integration pattern is the nearest reusable boundary. Retain its real `dist/cli.js`
  execution and portable temporary-directory cleanup while making the two-alias assertion truthful.
- TASK-107's exact-package story and TASK-114's packed-consumer install story depend on this compatibility
  repair; TASK-106 must establish runtime credibility without prematurely implementing either downstream scope.

### References

- [Source: backlog task TASK-106 --plain]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md#Separate-Existing-Platform-Compatibility-Risk]
- [Source: package.json]
- [Source: package-lock.json]
- [Source: README.md#Prerequisites]
- [Source: .github/workflows/ci.yml]
- [Source: test/integration/cli.bin.test.ts]
- [Source: docs/12-builder-architecture.md]
- [Source: docs/13-core-architecture.md]
- [Source: https://registry.npmjs.org/commander/14.0.3]
- [Source: https://registry.npmjs.org/commander/15.0.0]
- [Source: https://github.com/tj/commander.js/releases/tag/v15.0.0]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex persistent worker

### Implementation Plan

- Establish RED with a repository-level compatibility test over the package manifest, README, complete required
  production lock closure, and CI matrix.
- Restore GREEN through the narrow package-manager-owned Commander 14.0.3 exact pin, then strengthen the real
  built-bin integration boundary to exercise both declared executable aliases.
- Validate with isolated Node 20/22 clean installs and executable probes, then run the repository's exact quality
  gates and full regression suite.

### Debug Log References

- Create-story discovery: PRD 1; architecture 2; scoped/historical epic projections 3; UX shards 5; final
  readiness report, explicit TASK-106 contract, current package/lock/README/CI, adjacent built-bin test, and
  recent git intelligence loaded.
- Create-story customization: no activation prepend/append steps; the persistent `project-context.md` glob
  matched no files; `workflow.on_complete` is empty.
- Primary dependency research: official npm registry metadata and Commander release notes establish Commander
  15's Node >=22.12 requirement and Commander 14.0.3's Node >=20 compatibility; a required-production lock scan
  found Commander 15 to be the sole Node-20-excluding entry.
- Dev-story customization: no activation prepend/append steps; the persistent `project-context.md` glob matched
  no files; `workflow.on_complete` is empty. The explicit story baseline matched HEAD and orchestrator-owned
  Backlog, sprint, state, and automator files remained untouched.
- RED: focused package-runtime integration ran 4 assertions with 1 expected failure; the diagnostic named only
  `node_modules/commander (>=22.12.0)` as excluding the Node 20 release line. Metadata/docs/CI and Node 22 passed.
- GREEN/refactor: `npm install --save-exact commander@14.0.3` changed only the direct manifest/lock declaration
  and Commander lock block. Package-runtime coverage passed 4/4; the independent review then made the
  published-bin assertion read both alias targets from `package.json` and made the CI assertion reject matrix
  exclusions. The final combined package/runtime, built-bin, and Commander smoke gate passed 13/13 across 3
  files.
- Runtime boundary: clean full `npm ci` installs completed under Node 20.20.2 and Node 22.22.1, then each built
  WPM and passed the built-alias suite 3/3. npm 10's Node 20 resolution warnings named only dev tools
  `lint-staged@17.0.7` and `listr2@10.2.1`; the generic resolved-lock assertion proves WPM and every required
  production package admit Node 20. Engine-strict was intentionally not reported as green because npm validates
  omitted dev lock entries too.
- Built aliases: the task-specific package and built-bin tests passed 8/8 under Node 20.20.2 and 8/8 under
  Node 22.22.1. The bin contract is read from the package manifest, and both declared aliases report package
  version `0.1.0`.
- Dev-story final gates: typecheck passed; Biome passed (201 files); production build passed; focused package/
  CLI tests passed 13/13; exact full `npm test` passed 1,294/1,294 across 100 files in 410.79 seconds; diff
  hygiene passed.
- QA workflow: `bmad-qa-generate-e2e-tests` resolved no hooks or project-context facts, selected the existing
  Vitest integration boundary, and passed the task-specific package/built-bin automation 8/8 across 2 files.
  The QA summary records 6/6 AC coverage and the observed dev-only Node20 engine-warning boundary.
- Review workflow: `bmad-story-automator-review` was invoked by the independent reviewer with automatic fixes
  selected. It resolved no activation prepend/append customization, no `project-context.md` facts, and no
  completion hook. Sprint/status synchronization was intentionally not performed because those artifacts are
  orchestrator-owned for this review.
- Review-continuation dev-story: re-invoked `bmad-dev-story` against this explicit story after cycle 1. Its
  customization again resolved no activation prepend/append steps, no matching project-context facts, and an
  empty completion hook. The worker independently audited both automatic fixes: the bin test asserts and drives
  the manifest's exact two-target declaration, while complete-object equality rejects CI matrix exclusions or
  other cell-shaping keys. No further implementation/test change was needed.
- Review-continuation gates: focused package/runtime, built-bin, and Commander smoke tests passed 13/13 across 3
  files; typecheck passed; Biome passed (201 files); production build and `git diff --check` passed. All four
  product/test hashes matched the reviewer's exact-final inputs, so its full 1,294/1,294 regression across 100
  files remains the applicable full-suite evidence and was not redundantly rerun.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Preserved the public Node >=20 metadata, README prerequisite, and Node 20/22 x Linux/macOS/Windows CI matrix.
- Replaced the sole incompatible required production resolution with exact `commander@14.0.3`, whose official
  metadata supports Node >=20 and adds no transitive graph.
- Added generic resolved-production engine regression coverage so a future direct or transitive dependency
  cannot silently exclude Node 20, while retaining Node 22 compatibility evidence.
- Both published executable aliases now run through the built symlink boundary and prove one installed version
  contract in every CI runtime/OS cell.
- All six acceptance criteria are observably satisfied; no source/core or product-feature behavior changed.
- QA automation evidence is recorded in
  `_bmad-output/implementation-artifacts/tests/test-summary-task-106.md`.
- Review continuation re-absorbed the HIGH published-bin and MEDIUM exact-matrix fixes with no additional
  implementation change; both remain closed and the story is ready for final independent review.

### File List

- `_bmad-output/implementation-artifacts/stories/story-task-106.md`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-106.md`
- `package-lock.json`
- `package.json`
- `test/integration/cli.bin.test.ts`
- `test/integration/package-runtime-support.test.ts`

## Senior Developer Review (AI)

### Review Details

- Reviewer: Root (independent story-automator reviewer)
- Date: 2026-08-21
- Outcome: APPROVE
- Baseline: `62f2b168627a9c33f717879476f36ac1f4cc3a95`

### Findings and Automatic Fixes

- HIGH, fixed — the built-bin test created `wpm` and `installer` links against a hard-coded
  `dist/cli.js`, so it could pass while the published `package.json.bin` map was missing, renamed, or pointed
  elsewhere. The test now asserts the exact two-alias manifest contract and resolves each exercised target
  from that declaration.
- MEDIUM, fixed — the CI test asserted the separate OS and Node arrays but could overlook a `matrix.exclude`
  that removed a required cell. It now asserts the complete matrix object, including the absence of exclusions,
  and therefore proves all six declared cells remain present.
- No unresolved HIGH or MEDIUM findings remain. The Node 20 clean-install diagnostics name only dev-only
  `lint-staged@17.0.7` and `listr2@10.2.1`; WPM and the complete required production closure produce no
  unsupported-engine diagnostic.

### Acceptance-Criteria Validation

- AC 1 PASS — `package.json` declares `engines.node: ">=20"`.
- AC 2 PASS — README prerequisites state Node.js >=20.
- AC 3 PASS — the generic lock-closure test checks all 28 required, non-optional production entries; all 25
  entries declaring a Node engine intersect both the Node 20 and Node 22 release lines.
- AC 4 PASS — isolated locked installs completed under Node 20.20.2 and Node 22.22.1; the required production
  trees were valid, and no engine diagnostic implicated WPM or a required production package.
- AC 5 PASS — the manifest declares `wpm` and `installer` against `./dist/cli.js`; the built package-boundary
  suite passed 8/8 under each runtime and both aliases reported version `0.1.0`.
- AC 6 PASS — the parsed workflow matrix is exactly Node 20/22 across Ubuntu, macOS, and Windows, with no
  exclusions.

### Dependency and Package Evidence

- Current official npm registry metadata confirms `commander@14.0.3` declares Node >=20, has no runtime,
  peer, or optional dependency graph, and its registry integrity matches the lockfile. Commander 15.0.0
  declares Node >=22.12.0, so the exact 14.0.3 pin is the narrow compatibility repair.
- `npm pkg get` reports both executable aliases, Node >=20, and exact Commander 14.0.3. The npm pack dry run
  includes both `package.json` and the shebang-bearing `dist/cli.js` package entry.

### Final Verification

- Focused integration: 8/8 across the package-runtime and built-bin files.
- Focused integration plus Commander smoke: 13/13 across 3 files.
- Node 20.20.2 isolated install/build/focused flow: 8/8.
- Node 22.22.1 isolated install/build/focused flow: 8/8; production dependency tree reported zero problems.
- `npm run typecheck`: passed.
- `npx biome ci .`: passed (201 files).
- `npm run build`: passed.
- Exact `npm test`: 1,294/1,294 across 100 files in 410.79 seconds.
- `git diff --check`: passed.

### Final Review Cycle 2

- `bmad-story-automator-review` was re-invoked from scratch against this story with automatic fixes selected.
  The installed review skill has no `customize.toml`; no project-level review override, matching
  `project-context.md` fact, activation prepend/append step, or completion hook exists.
- The exact product/test diff from baseline `62f2b168627a9c33f717879476f36ac1f4cc3a95` remains limited to
  `package.json`, `package-lock.json`, the built-bin test, and the new package-runtime test. Together with this
  story and its QA summary, that inventory matches the six-entry File List one-for-one. Orchestrator-owned
  Backlog, state, sprint, automator, `.codex`, and `.serena` surfaces were excluded and untouched.
- The cycle-1 HIGH fix remains closed: the test asserts the exact `package.json.bin` map and resolves both
  exercised targets from it. The cycle-1 MEDIUM fix remains closed: exact matrix-object equality rejects
  exclusions, inclusions, or any other cell-shaping key.
- Current official npm registry metadata again confirms Commander 14.0.3 is the newest v14, declares Node >=20,
  has no runtime/peer/optional dependency graph, and matches the lockfile integrity. The complete required
  production scan remains 28 entries, 25 with Node engines, and zero Node 20/22 release-line exclusions.
- Fresh cycle-2 gates passed: focused 13/13 across 3 files; typecheck; Biome CI across 201 files; production
  build; exact `npm test` 1,294/1,294 across 100 files in 411.31 seconds; package-lock consistency; product/test
  hash stability; inventory, whitespace, and `git diff --check` hygiene.
- New findings: none. Final outcome: APPROVE.

## Change Log

- 2026-08-21: Created implementation-ready TASK-106 story through the BMAD create-story workflow.
- 2026-08-21: Restored Node 20 production compatibility, added package/runtime and two-bin regression evidence,
  and moved the story to review through the BMAD dev-story workflow.
- 2026-08-21: Independent story-automator review fixed the published-bin and six-cell-matrix test gaps, validated
  all six acceptance criteria, and approved the story.
- 2026-08-21: Re-absorbed both cycle-1 review fixes through `bmad-dev-story`, reran focused/static/build gates,
  and returned the unchanged implementation to review.
- 2026-08-21: Final independent review cycle 2 reproduced every required gate, confirmed both prior fixes remain
  closed with no new findings, and approved the story as done.
