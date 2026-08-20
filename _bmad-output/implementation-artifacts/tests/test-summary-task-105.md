# Test Automation Summary — TASK-105 registered payload-skill archive policy

## Generated Tests

### Unit tests

- [x] `test/unit/operations/build.test.ts` — proves the loaded project model's per-bundle `payload.skills`
  registry authorizes only segment-exact conventional and relocated skill roots.
- [x] The registered-directory cases preserve `SKILL.md`, references, assets, nested `.tmpl` content, and nested
  custom roots while rejecting prefix/sibling/ancestor content and cross-bundle registration leaks.
- [x] Negative controls prove unregistered conventional and valid custom skill packages are omitted without
  filtering bundle installer-skills or ordinary files in other payload categories.
- [x] `test/unit/schema/bundle.test.ts` and `test/unit/cli/bundle-skills-commands.test.ts` preserve arbitrary
  basenames such as `custom/two.md` while rejecting payload-only traversal, absolute/backslash/root-level,
  reserved-surface, duplicate, and ancestor-overlap paths before registration.
- [x] Payload names are unique deregistration keys: schema parsing rejects same-name refs at distinct roots,
  preventing a hand-authored manifest from retaining a second authorized package after `remove <name>`.
- [x] Bundle/project installerSkills schema and CLI controls retain arbitrary explicit paths such as
  `custom/helper.md`; TASK-105's stricter package invariant does not apply to those independent registries.
- [x] Missing and invalid registered documents fail build validation and authorize none of the declared package, while
  valid skill-like frontmatter under every protected non-payload surface remains shippable.
- [x] The optional `uninstall-backlog/` reverse-recipe surface remains shippable even with valid skill-like
  frontmatter and cannot be claimed by a payload ref; segment-exact controls keep
  `uninstall-backlog-extra/custom.md` available as a legitimate custom package.
- [x] `test/unit/adapters/packager.test.ts` uses a deterministic fake Info-ZIP that retains prior entries when
  updating an existing archive. Two successive requests to the same output prove production removes the old ZIP
  and the second archive contains only its current `PackageRequest.files`, even when real ZIP is unavailable.
- [x] The same fake writes a partial output and exits non-zero; production returns a typed failure and removes the
  partial canonical archive so failed packaging cannot leave a misleading distributable in `builds/`.

### Integration / E2E tests

- [x] `test/integration/cli.build.e2e.test.ts` — drives the built CLI through init, two enabled bundles,
  conventional and exact `custom/two.md` custom `skills add`, before/after dry-runs,
  tarball/git/conditional-zip packages, real `skills remove`, source-preservation checks, archive extraction,
  symlink verification, and layout parity.
- [x] The scenario rejects unregistered conventional, exact-prefix, custom, cross-bundle, and file-like custom
  symlink-directory packages in both archive phases.
- [x] On hosts with ZIP/unzip, that same scenario rebuilds the identical `.zip` path after real deregistration
  and asserts every formerly registered package path is absent, covering the CI failure through the built CLI.
- [x] `test/integration/operations/build-shippable-symlink.test.ts` continues to prove real alias leaves are not
  traversed after `shippableFiles` began consuming the canonical loaded `Project` model.

## Coverage

- TASK-105 acceptance criteria: 2/2 covered.
- Focused evidence spans build policy, schema, payload CLI, unchanged installerSkills CLI, real symlink behavior,
  and one successive real-CLI archive workflow.
- Archive states: registered and post-deregistration; dry-run and package use the same ship set.
- Package formats: tarball and git exercised with extracted layout parity; real ZIP remains conditional and was
  unavailable in this environment, while fake Info-ZIP provides unconditional successive-output semantics.
- API endpoints: not applicable (Node CLI project).
- UI workflows / semantic locators: not applicable (no GUI by design).

## Verification

- Review-continuation focused unit/schema/CLI: 194/194 passed across 7 files.
- QA-focused integration/E2E: 27/27 passed across 2 files.
- Review-continuation full regression: 1,278/1,278 passed across 99 files.
- Post-cycle-2 dev-story verification: focused unit/schema/CLI 194/194 across 7 files and built E2E/symlink
  integration 27/27 across 2 files; typecheck, Biome lint (200 files), production build, and `git diff --check`
  passed. Because the absorption changed artifacts only, the reviewer's exact-final 1,278/1,278 full regression
  remains the product-diff evidence and was not redundantly rerun.
- TypeScript typecheck, Biome lint (200 files), production build, documentation/inventory probes, and
  `git diff --check`: passed.
- CI-regression verification: fake-ZIP red 1 failed / 10 passed, green packager 11/11; built E2E/symlink 27/27;
  full regression 1,279/1,279 across 99 files; typecheck, Biome lint (200 files), build, and diff-check passed.
- Post-review absorption verification: focused packager 11/11 plus typecheck, Biome lint (200 files), production
  build, and diff-check passed. No product/test file changed during absorption, so the reviewer's exact-final
  built E2E/symlink 27/27 and full 1,279/1,279 evidence remains applicable.
- Final post-absorption verification: focused packager 11/11, built E2E/symlink 27/27, typecheck, Biome lint
  (200 files), production build, and fresh full regression 1,279/1,279 across 99 files all passed; the full run
  started at 10:29:14 UTC and completed in 376.72s.
- Tests use Vitest's established patterns, isolated temporary workspaces, no sleeps, and no order dependency.

## Critical Assertions

- Registry authority is isolated by enabled bundle and exact directory segment; `kept` never authorizes
  `kept-extra`, a nested registered root never leaks ancestor/sibling content, and one bundle never authorizes
  the same path in another.
- Registered custom `--path` refs—including arbitrary basenames such as `custom/two.md`—preserve only their
  containing-directory package. Valid custom orphans and symlinked custom package roots are detected through the
  injected filesystem port and omitted.
- Deregistration removes only the `bundle.yml` reference: conventional and custom sources remain on disk, while
  the next dry-run and every archive backend omit their complete directories.
- ZIP creation removes a prior same-name archive before invoking Info-ZIP, preventing its update mode from
  retaining stale entries that are absent from the authoritative current ship set.
- A failed ZIP invocation removes any partial canonical output before propagating its typed error; temporary
  staged sources are still cleaned in the outer `finally` path.
- Bundle installer-skills and ordinary other-category payload content remain shippable even when a document has
  valid skill-like frontmatter; bundle/project installerSkills parsing and CLI behavior remain unchanged.

## Review Workflow Evidence

- `bmad-story-automator-review` invoked for TASK-105 review cycle 1 after the worker's dev/QA handoff.
- Review customization resolved with no activation prepend/append steps, no project-context facts, and no
  completion hook. The review auto-fixed 8 findings (3 HIGH, 4 MEDIUM, 1 LOW) and left 0 open.
- `bmad-dev-story` was re-invoked against the complete story for review continuation after cycle 1. Its
  customization resolved with no activation prepend/append steps, no matching project-context facts, and no
  completion hook; all eight fixes were re-absorbed before the cycle-2 audit and gate.
- `bmad-story-automator-review` was re-invoked for cycle 2 against the entire baseline diff. It confirmed all
  cycle-1 closures and the worker's exact `uninstall-backlog` reservation, then auto-fixed duplicate payload
  deregistration names and stale arbitrary-basename comments/evidence. Cycle 2 closed 2 findings (1 HIGH, 1 LOW)
  with 0 open.
- `bmad-dev-story` then re-absorbed the cycle-2 fixes as an artifact-only continuation. A third
  `bmad-story-automator-review` invocation audited the entire baseline diff, File List, docs, story, and QA
  evidence; it found 0 fresh issues and confirmed all cycle-1/cycle-2 findings remain closed.
- Cycle-3 focused/static/built gates passed at 194/194 and 27/27 with no product/test changes. The unchanged
  exact-final cycle-2 full regression remains the applicable product-diff evidence: 1,278/1,278 across 99 files.
- `bmad-dev-story` was re-invoked after cycle-2 review against the complete story. Customization again resolved
  with no activation prepend/append steps, no matching project-context facts, and no completion hook. The worker
  re-absorbed both cycle-2 fixes, verified all prior safeguards, and made no further product/test change.
- After CI run 32355637349, `bmad-dev-story` was re-invoked for the stale ZIP-entry defect, followed by
  `bmad-qa-generate-e2e-tests` for the regression. Both resolved with no activation prepend/append steps, no
  matching project-context facts, and empty completion hooks.
- `bmad-story-automator-review` was then re-invoked against the full repair diff from `4547434`. It approved the
  exact-set fix and auto-fixed one MEDIUM partial-output cleanup gap; focused packager 11/11, built E2E/symlink
  27/27, and full regression 1,279/1,279 all passed with 0 open findings.
- `bmad-dev-story` was re-invoked after that review against the complete story. Customization resolved with no
  activation prepend/append steps, no matching project-context facts, and an empty completion hook; the worker
  absorbed the cleanup fix without further product/test changes.
- A final `bmad-story-automator-review` invocation audited the complete four-file repair diff from `4547434`
  after absorption, confirmed all findings closed and the File List coherent, and approved with 0 fresh findings.

## Workflow Evidence

- `bmad-qa-generate-e2e-tests` invoked after `bmad-dev-story` for TASK-105.
- Customization resolved with no activation prepend/append steps; the persistent `project-context.md` glob
  matched no files; `workflow.on_complete` resolved empty.
- Existing framework selected: Vitest 4.1.7. API/UI generation steps were inapplicable; built CLI E2E is the
  product's through-the-edges acceptance surface.
