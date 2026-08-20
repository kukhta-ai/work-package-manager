# Test Automation Summary — TASK-104 archive hygiene and scaffold correctness

## Generated Tests

### Unit tests

- [x] `test/unit/operations/build.test.ts` — the common ship-set excludes disabled bundles,
  `bundles/bundle-template/**`, and unresolved builder `.tmpl` sources while preserving a real enabled bundle's
  runtime payload template.
- [x] `test/unit/templates/minimal-project.test.ts` — the shipped executor-front-door snippet has no dangling
  `choose from:` line with zero, one, or multiple bundle summaries.
- [x] `test/unit/templates/default-bundle.test.ts` — every rendered detect/setup/verify recipe task records the
  requested initial bundle version as its Backlog.md milestone.

### Integration / E2E tests

- [x] `test/integration/cli.build.e2e.test.ts` — real built-CLI tarball and git packages, plus zip when available,
  exclude the authoring scaffold, disabled/orphan entries, and builder `.tmpl` sources while retaining and
  extracting registered nested runtime `.tmpl` files and symlinks from an enabled bundle; layouts match.
- [x] Existing init and bundle-new integration coverage continues to prove that
  `wip/bundles/bundle-template/` remains present and usable during authoring.

## Coverage

- TASK-104 outcomes: 4/4 story criteria covered.
- New focused cases: 6 total (5 unit cases, including the 3-row bundle-count matrix, and 1 package-format E2E).
- Package formats: tarball and git always exercised; zip exercised when `zip`/`unzip` are installed.
- API endpoints: not applicable (Node CLI project).
- UI workflows / locators: not applicable (no GUI by design).

## Verification

- Reviewer-focused unit run: 41/41 passed across 3 files.
- Reviewer-focused build E2E run: 24/24 passed.
- Reviewer full regression: 1256/1256 passed across 99 files.
- TypeScript typecheck, Biome lint, production build, and `git diff --check`: passed.
- Template inventory probes: exactly three starter recipe templates carry `milestone: {{version}}`; the executor
  snippet contains runtime manifest-summary discovery and no `{{bundles}}` placeholder or `choose from:` line.
- Tests use Vitest's existing project conventions; no sleeps, hardcoded waits, or order dependencies added.

### Review-fix absorption verification

- The persistent worker re-invoked `bmad-dev-story` as a review continuation and inspected all four cycle-1
  fixes against TASK-104, the pure-core/ports boundary, and the common package ship-set semantics.
- Fresh focused unit: 41/41 passed across 3 files; fresh built-CLI build E2E: 24/24 passed.
- Fresh typecheck, Biome lint (199 files), production build, and `git diff --check`: passed.
- No runtime or test behavior changed during absorption, so the reviewer’s exact final full-suite result
  (1,256/1,256 across 99 files) remains the regression evidence and was not redundantly rerun.

### Review cycle 2 verification

- Re-audited the exact absorbed final diff and confirmed all four cycle-1 findings remain closed.
- Fresh focused unit: 41/41; fresh built-CLI build E2E: 24/24.
- Fresh full regression: 1,256/1,256 across 99 files.
- Fresh typecheck, Biome lint (199 files), production build, inventory probes, and `git diff --check`: passed.
- Product implementation/tests required no cycle-2 change; one stale pre-implementation heading in the story
  review record was relabeled for accuracy.

## Review Resolution

- Separate-lane `bmad-story-automator-review` cycle 1: **APPROVE**.
- Findings: 4 total (1 HIGH, 2 MEDIUM, 1 LOW), all auto-fixed; 0 open.
- Separate-lane `bmad-story-automator-review` cycle 2: **APPROVE** — 0 blocking product findings; all cycle-1
  findings remain closed; 1 LOW story-record label corrected.
- Keep the runtime-payload-template exception explicit if archive filtering evolves: payload `.tmpl` files are
  install content, unlike unresolved builder-template sources.

## Workflow Evidence

- `bmad-qa-generate-e2e-tests` invoked after dev-story.
- Customization: no activation prepend/append steps; persistent `project-context.md` glob matched no files;
  `workflow.on_complete` resolved empty.
- `bmad-dev-story` was re-invoked for review-fix absorption with the explicit TASK-104 story path. Its
  customization again resolved no activation prepend/append steps, the persistent project-context glob matched
  no files, and `workflow.on_complete` resolved empty; the existing baseline was preserved and sprint status was
  not mutated.
- `bmad-story-automator-review` invoked by the persistent separate-lane reviewer. Review customization resolved
  to defaults (no `customize.toml`, no activation prepend/append, no completion hook); sprint sync remained
  intentionally read-only because TASK-104 is absent from the foundation mirror and the assignment forbids it.
- `bmad-story-automator-review` re-invoked for cycle 2 after worker absorption. Customization/hooks resolved
  identically, the exact final diff and File List were re-audited, and sprint status remained read-only.
