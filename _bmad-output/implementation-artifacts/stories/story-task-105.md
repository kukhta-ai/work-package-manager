---
baseline_commit: 50c46171c8f7d73df1379204959f8a0e9525e423
---

# Story task-105 — Ship only registered payload skills in the built archive

Status: done

> BMAD create-story provenance: `bmad-create-story` was invoked in this persistent worker session. Its
> customization resolved with no activation prepend/append steps and no completion hook; the only persistent
> fact glob (`**/project-context.md`) matched no files. TASK-105 is outside the foundation sprint mirror, so the
> explicitly supplied read-only Backlog contract is the target and sprint status remains untouched.

## Story

As a work-package author,
I want built artifacts to contain only payload skills registered by their bundle,
so that removed, abandoned, or accidentally placed skill content is never delivered to recipients.

## Acceptance Criteria

1. A payload skill that is on disk but not registered in `bundle.yml` does not appear in the built archive.
2. A skill deregistered via `bundle <id> skills remove <name>` remains in the authoring workspace but does not
   appear in the next built archive.

## Tasks / Subtasks

- [x] Make the pure build ship-set use each enabled bundle's `payload.skills` registry as the payload-skill
  authority (AC: 1, 2)
  - [x] Derive segment-exact registered skill-directory roots from valid conventional and custom `SkillRef.path`
  - [x] Preserve each registered root's complete directory package, including references, assets, nested
    runtime `.tmpl` files, and symlink leaves
  - [x] Exclude unregistered conventional skill roots without filtering installer skills or other payload
    categories
- [x] Preserve existing build contracts (AC: 1, 2)
  - [x] Keep disabled-bundle/scaffold/builder-template filtering and front-door transforms intact
  - [x] Keep dry-run and tarball/git/conditional-zip packaging on the same `BuildPlan.shippable` set
  - [x] Keep build enumeration pure over the injected filesystem port and loaded project model
- [x] Add focused unit and real built-CLI E2E coverage (AC: 1, 2)
  - [x] Prove conventional and custom registered skill directories ship completely and exact path boundaries
    reject unregistered prefix/sibling roots across enabled bundles
  - [x] Prove unregistered conventional skills do not ship while installer skills and other payload categories do
  - [x] Build once with a registered skill, run the real remove command, prove its source remains, rebuild, and
    prove the next archive and dry-run omit it with format parity
- [x] Run red/green, focused tests, typecheck, lint, production build, full regression, and diff hygiene checks

## Dev Notes

### Current state and implementation seam

- `src/core/model/bundle.ts` defines `SkillRef { name, path }` and explicitly states that
  `BundleManifest.payload.skills`—not an on-disk scan—is authoritative for what the bundle delivers.
- `src/core/model/project.ts` holds every enabled parsed `BundleManifest`. `computeBuildPlan` already receives
  that `Project`, but `shippableFiles` currently receives only enabled bundle ids and therefore cannot enforce
  payload-skill registration.
- `src/core/operations/build.ts::shippableFiles` is the common pure source of `BuildPlan.shippable` used by both
  dry-run and every package backend. Put domain filtering there; do not duplicate it in `packager.ts`.
- `src/core/operations/skill-refs.ts::removeSkillRefSpec` correctly deregisters a registered skill while leaving
  its source directory on disk. TASK-105 must not change that authoring contract; the next build must simply stop
  selecting the directory.
- Conventional skill refs point to `payload/agent-skills/<name>/SKILL.md`; `--path` stores a bundle-relative
  custom skill-document location with any basename (for example `custom/two.md`). Registration identifies the
  containing directory as the complete package root, not only the registered document leaf.

### Required semantics and guardrails

- Pass/use the loaded `Project` (or a pure policy projection derived from it) when enumerating. Do not parse
  `bundle.yml` inside the walk and do not add adapter I/O.
- Normalize only valid bundle-relative `SkillRef.path` values and derive their parent directory. Match a root
  with `path === root` or `path.startsWith(root + "/")`; raw string prefixes are incorrect (`foo` must not
  authorize `foobar`). Keep bundle ids in the boundary so a registration in one enabled bundle never authorizes
  another bundle's sibling path.
- A registered skill is a directory package. Preserve `SKILL.md`, references, scripts/assets, nested files,
  symlink leaves, and `.tmpl` content within that registered root. TASK-104's unresolved builder-template filter
  must therefore recognize registered skill roots as a second runtime-content exception alongside
  `payload/templates/`.
- Under an enabled bundle's conventional `payload/agent-skills/` container, an on-disk direct-child skill root
  ships only when it is the exact registered root or an ancestor needed to reach a nested registered custom root.
  Unregistered prefixes, siblings, empty directories, and symlink roots must not leak.
- A valid custom path may relocate a registered skill directory. Preserve that exact registered root even when
  it is outside the conventional container, but do not treat neighboring content as registered.
- Do not filter root or bundle-level `installer-skills/`; those are install-time agent surfaces with distinct
  scan semantics. Do not make files/templates/scripts registration authoritative as part of this story: other
  payload categories retain their existing build behavior.
- Missing or malformed registry paths must never widen the ship set. Existing schema/validation behavior is
  outside TASK-105 unless a focused correction is necessary to make path containment safe.

### Testing requirements

- Start with red unit assertions against the pure ship-set/build plan. Cover a complete conventional registered
  directory, a valid relocated ref, nested `.tmpl`, internal symlink behavior where the test filesystem permits,
  unregistered exact/prefix/sibling directories, bundle isolation, and non-payload-skill controls.
- Use the built CLI on a real workspace and real archives. Register an author-placed skill through
  `bundle <id> skills add`, build and inspect it, then invoke `bundle <id> skills remove`, assert the source tree
  still exists, build again, and assert the second archive/dry-run omit the full directory.
- Compare tarball and git layouts; exercise zip and extraction when `zip`/`unzip` are available. Assert successive
  archive behavior rather than only testing an isolated final build.
- Preserve TASK-104 coverage for scaffold exclusion and registered runtime payload templates.

### Previous story intelligence

- TASK-104 established kind-independent direct-child bundle pruning and a common ship-set for tarball/git/zip.
  It also taught that suffix-only `.tmpl` rejection is too broad: runtime-owned content needs explicit, narrow
  exceptions. Extend that policy rather than introducing a second enumerator.
- TASK-104's separate review strengthened real archive extraction, symlink handling, negative path assertions,
  and cross-format layout equality. Reuse those test helpers and conventions.

### References

- [Source: backlog task 105 --plain]
- [Source: docs/06-project-skeleton.md#Three-skill-states]
- [Source: docs/10-authoring-cli.md#Per-command-actions]
- [Source: docs/12-builder-architecture.md#What-wpm-build-produces]
- [Source: docs/13-core-architecture.md#Services-core-services--the-pure-logic-tier]
- [Source: src/core/model/bundle.ts]
- [Source: src/core/model/project.ts]
- [Source: src/core/operations/build.ts]
- [Source: src/core/operations/skill-refs.ts]
- [Source: _bmad-output/implementation-artifacts/stories/story-task-104.md]

## Dev Agent Record

### Agent Model Used

GPT-5.4 Codex persistent worker

### Debug Log References

- Create-story discovery: PRD 1, architecture 1, epics 1, UX 0; TASK-104 previous-story and recent git
  intelligence loaded.
- Create-story code audit: model, schema, skill add/remove, build plan, packager, and current unit/E2E seams
  inspected; no new dependency or web research required.
- Dev-story customization: no prepend/append steps; no project-context facts; `on_complete` empty. Explicit
  TASK-105 story selected, baseline captured, and absent sprint-mirror entry left untouched.
- Red phase: the focused build unit file produced 2 expected TASK-105 failures—unregistered skill roots leaked
  and a registered skill's `.tmpl` asset was suppressed.
- Green/refactor: focused build unit 20/20; built build-command plus real symlink integration 27/27. Nested
  registered roots reject unrelated ancestor/sibling content, and custom symlink packages are recognized through
  the injected filesystem port.
- Dev-story final gates: typecheck passed; Biome passed (199 files); production build passed; full Vitest
  1,259/1,259 across 99 files; `git diff --check` passed.
- QA workflow: focused unit 20/20 and integration/E2E 27/27; task-specific automation summary created.
- Review-continuation dev-story: invoked `bmad-dev-story` against this story after cycle 1; customization
  resolved with no activation prepend/append steps, the persistent `project-context.md` glob matched no files,
  and `workflow.on_complete` was empty.
- Cycle-2 independent red/green audit: docs 06's optional `uninstall-backlog/` recipe was the one named bundle
  surface missing from the reserved payload-package roots. New schema, CLI, build, and real-archive controls
  first failed in all three affected unit layers (3 failed / 107 passed), then passed 110/110 after adding the
  segment-exact protection; `uninstall-backlog-extra/custom.md` remains a valid custom payload-skill path.
- Cycle-2 gates: focused unit/schema/CLI 194/194 across 7 files; built E2E/symlink integration 27/27 across 2
  files; typecheck passed; Biome passed (200 files); production build passed; full Vitest 1,278/1,278 across 99
  files; `git diff --check` passed.
- Post-cycle-2 review continuation: re-invoked `bmad-dev-story` against the complete story. Customization resolved
  with no activation prepend/append steps, the persistent `project-context.md` glob matched no files, and
  `workflow.on_complete` was empty.
- Cycle-3 absorption audit: confirmed payload-only duplicate-name rejection makes the deregistration key unique,
  arbitrary-basename public comments consistently describe skill documents/source packages, and the combined
  missing/invalid-frontmatter case rejects both declared packages without widening the ship set. All earlier
  arbitrary-basename, symlink, unsafe-path, overlap, reserved-surface, uninstall-recipe, and installerSkills
  fixes remain coherent; the File List remains complete and no product/test change was needed.
- Cycle-3 gates: focused unit/schema/CLI 194/194 across 7 files; built E2E/symlink integration 27/27 across 2
  files; typecheck passed; Biome passed (200 files); production build passed; `git diff --check` passed. The
  reviewer's unchanged exact-final full regression remains 1,278/1,278 across 99 files.
- CI regression continuation: GitHub run 32355637349 exposed that Info-ZIP incrementally updates an existing
  `<name>.zip`; after deregistration, dry-run and the new ship plan were correct but stale entries survived in
  the reused archive on macOS Node 20/22 and Ubuntu Node 22. Re-invoked `bmad-dev-story`; customization again
  resolved with no activation prepend/append steps, no project-context facts, and an empty completion hook.
- ZIP red/green: a deterministic fake Info-ZIP first reproduced the stale update (1 failed / 10 passed), then
  passed 11/11 after the adapter began removing the prior output before archive creation. The removal occurs
  only after the ZIP tool is available and the archive source is prepared, and aligns ZIP with tar/git overwrite
  behavior.
- QA regression workflow: re-invoked `bmad-qa-generate-e2e-tests`; customization resolved with no activation
  prepend/append steps, no project-context facts, and an empty completion hook. The fake-ZIP unit runs without a
  local ZIP installation, while the existing real successive-archive E2E exercises the same output path and
  verifies stale registered entries disappear whenever ZIP/unzip are present.
- CI-fix gates: focused packager 11/11; built E2E/symlink integration 27/27; typecheck passed; Biome passed (200
  files); production build passed; full Vitest 1,279/1,279 across 99 files; `git diff --check` passed.
- Post-CI review absorption: re-invoked `bmad-dev-story` against the complete story after the approved repair
  review. Customization resolved with no activation prepend/append steps, no matching project-context facts, and
  an empty completion hook.
- Partial-output audit: confirmed the ZIP subprocess's typed error is preserved, its partial canonical output is
  removed before rethrow, and staged-source cleanup still runs in the outer `finally`. The strengthened fake
  Info-ZIP writes a partial archive, exits 9, and proves both domain-error classification and canonical-output
  absence. No further product/test correction was needed.
- Post-review gates: focused packager 11/11; typecheck passed; Biome passed (200 files); production build passed;
  `git diff --check` passed. The reviewer's exact-final built E2E/symlink 27/27 and full 1,279/1,279 across 99
  files remain applicable because this absorption changed artifacts only.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- `BuildPlan.shippable` now projects exact registered skill-directory roots from the loaded `Project`; no YAML is
  parsed inside enumeration and package adapters remain policy-free.
- Complete conventional and relocated registered skill packages ship, including references, assets, nested
  `.tmpl` content, and symlink leaves. Segment-exact checks prevent prefix, ancestor, sibling, and cross-bundle
  authorization leaks.
- Unregistered conventional/custom skill packages—including file-like custom symlink directories—are excluded,
  while bundle installer-skills and ordinary files in other payload categories retain their prior semantics.
- Real CLI E2E builds registered archives, runs `skills remove` for conventional and custom refs, proves both
  source trees remain, and verifies dry-run plus successive tar/git/conditional-zip archives omit them.
- Review preserved the existing arbitrary-basename surface (`custom/two.md`) and defined its containing directory
  as the package boundary. Payload-only portable-path, reserved-surface, and non-overlap validation makes that
  boundary deterministic without changing bundle/project installerSkills parsing or CLI behavior.
- Missing or invalid registered documents now fail build validation and authorize no package content. Valid
  skill-like frontmatter under installer skills, installer scripts, files, templates, docs, recipes, and agent
  aliases retains the independent shipping semantics of those surfaces.
- Review cycle 2 re-absorbed all eight cycle-1 fixes and independently closed the optional uninstall-recipe
  gap: `uninstall-backlog/` is protected as an exact reserved subtree, while similarly named custom packages
  remain eligible. No other named independent bundle subtree in docs 06 required an additional reservation.
- The post-cycle-2 continuation absorbed both reviewer findings: hand-authored payload registries now require a
  unique `name` deregistration key without changing installerSkills, and missing plus invalid-frontmatter source
  packages have explicit negative authorization evidence. No additional implementation correction was needed.
- ZIP packaging now always creates a fresh exact representation of `PackageRequest.files`; Info-ZIP can no
  longer retain a deregistered payload package from an earlier archive with the same output name. A deterministic
  fake-tool regression covers update semantics on every Linux/macOS test host, and the real conditional ZIP E2E
  retains cross-format successive-build coverage.
- The post-CI review continuation absorbed the partial-output fix: failed ZIP creation now leaves no canonical
  artifact that could be mistaken for success, while preserving the typed failure and temporary-stage cleanup.
- QA automation validated both acceptance criteria and recorded coverage in
  `_bmad-output/implementation-artifacts/tests/test-summary-task-105.md`.

### File List

- `_bmad-output/implementation-artifacts/stories/story-task-105.md` (new)
- `_bmad-output/implementation-artifacts/tests/test-summary-task-105.md` (new)
- `docs/06-project-skeleton.md`
- `docs/10-authoring-cli.md`
- `docs/12-builder-architecture.md`
- `src/adapters/packager.ts`
- `src/cli.ts`
- `src/core/model/bundle.ts`
- `src/core/operations/build.ts`
- `src/core/operations/skill-refs.ts`
- `src/core/services/schema/bundle.ts`
- `src/core/services/skill-ref-path.ts` (new)
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/operations/build-shippable-symlink.test.ts`
- `test/unit/adapters/packager.test.ts`
- `test/unit/cli/bundle-installer-skills-commands.test.ts`
- `test/unit/cli/bundle-skills-commands.test.ts`
- `test/unit/cli/project-installer-skills-commands.test.ts`
- `test/unit/operations/build.test.ts`
- `test/unit/schema/bundle.test.ts`

## Senior Developer Review (AI)

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — review cycle 1

### Workflow Evidence

- Invoked `bmad-story-automator-review` against this story and its `baseline_commit` diff.
- Review customization resolved to defaults: no `customize.toml`, no activation prepend/append steps, no
  persistent project-context facts, and no `workflow.on_complete` hook. The foundation sprint mirror and all
  orchestration-owned backlog/state files remained untouched by this review.

### Findings and Auto-fixes

- **HIGH — fixed:** custom registration was narrowed to paths ending in `SKILL.md`, although the established
  schema and CLI support arbitrary document basenames such as `custom/two.md`. The containing directory of any
  valid registered document is now the complete authorized package; real CLI E2E covers the exact example.
- **HIGH — fixed:** unregistered custom packages were detected only by a `SKILL.md` leaf, allowing
  arbitrary-basename regular and symlink packages to ship after deregistration. Detection now uses the same
  valid-frontmatter contract for any direct package document and handles file-like directory symlink leaves.
- **HIGH — fixed:** payload refs accepted traversal, absolute, backslash, root-level, empty/dot-segment paths,
  and the CLI probed them before containment validation. A shared pure payload path policy now rejects unsafe
  paths before filesystem access in schema, CLI, and direct-operation paths.
- **MEDIUM — fixed:** equal/ancestor package roots made per-skill deregistration ambiguous. Payload registry
  parsing and attach reject duplicate or overlapping roots with segment-exact comparisons.
- **MEDIUM — fixed:** a payload skill package could overlap a surface with independent semantics, so removing it
  would either drop unrelated files/templates/docs/recipes/installer skills or leave the skill shippable.
  Payload-only validation now rejects reserved overlaps; valid skill-like controls prove every protected surface
  remains shippable.
- **MEDIUM — fixed:** missing or invalid registered documents could silently authorize neighboring package
  content. They now fail build validation and their declared roots authorize nothing.
- **MEDIUM — fixed:** the first review patch applied the stricter path invariant through shared parsing/CLI paths
  to installerSkills, broadening TASK-105 beyond payload delivery. The constraint is now scoped exclusively to
  `payload.skills`; existing bundle/project installerSkills arbitrary-path round trips remain supported and are
  explicitly tested with `custom/helper.md`.
- **LOW — fixed:** initial docs and tests did not state/prove arbitrary basenames, payload-only path/overlap
  failures, missing refs, protected valid-frontmatter controls, real custom symlink packages, or exact
  add→build→remove→rebuild format parity. Docs 06/10/12 and focused/real-archive coverage now do.

### Acceptance and Gate Evidence

- AC 1: PASS — conventional, arbitrary-basename, prefix/sibling, nested, cross-bundle, regular custom, and
  symlink custom orphan packages are omitted unless their exact package root has a valid registry document.
  Complete registered packages preserve references, assets, nested runtime `.tmpl`, and symlink leaves.
- AC 2: PASS — built-CLI E2E runs `skills add moved --path custom/two.md`, packages it, runs the real
  `skills remove moved`, proves `custom/two.md` remains on disk, and proves the next dry-run and tar/git archives
  (plus zip when tools are available) omit the whole `custom/` package. Conventional and symlink registrations
  follow the same successive-build contract.
- Focused unit/schema/CLI: 190/190 across 7 files; focused built E2E/symlink integration: 27/27 across 2 files;
  full regression: 1,274/1,274 across 99 files.
- Typecheck: PASS; Biome lint: PASS (200 files); production build: PASS; documentation/inventory probes: PASS;
  `git diff --check`: PASS. Zip/unzip were unavailable, so the conditional zip branch was correctly skipped.

### Outcome

**APPROVE** — 8 findings (3 HIGH, 4 MEDIUM, 1 LOW), all auto-fixed; 0 open findings.

## Senior Developer Review (AI) — Cycle 2

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — review cycle 2

### Workflow and Full-Diff Audit

- Re-invoked `bmad-story-automator-review` against this story and the complete diff from baseline
  `50c46171c8f7d73df1379204959f8a0e9525e423`; the review was not limited to the worker's latest edits.
- Customization again resolved to defaults: English/intermediate output, no `customize.toml`, no activation
  prepend/append steps, no project-context facts, and no completion hook. Sprint/backlog/state/branch files
  remained orchestration-owned and untouched.
- All eight cycle-1 fixes remain closed: arbitrary basenames; regular and directory-symlink orphan pruning;
  pre-probe containment safety; segment-exact root overlap checks; protected non-payload surfaces; missing and
  invalid source rejection; installerSkills independence; and real successive-archive evidence.
- The worker's new blocker fix is correct in every required layer: `uninstall-backlog/**` is a reserved
  non-payload recipe in schema, CLI, and build filtering, while segment-exact matching keeps
  `uninstall-backlog-extra/custom.md` valid. Real archives retain valid skill-like frontmatter in the optional
  uninstall recipe.

### Fresh Findings and Auto-fixes

- **HIGH — fixed:** hand-authored `payload.skills` YAML accepted duplicate `name` values at different package
  roots. Because name is the deregistration key and remove deletes only the first match, `remove <name>` could
  leave another same-name package authorized in the next archive. Payload-only schema parsing now rejects
  duplicate names; operation-created registries were already set-like. InstallerSkills parsing remains unchanged.
- **LOW — fixed:** public schema/operation comments still described relocatable paths and deregistered sources as
  `SKILL.md` even though arbitrary basenames are supported, and focused build evidence covered a missing source
  but not the equivalent invalid-frontmatter branch. Comments now describe skill documents/source packages, and
  one focused case proves both missing and invalid declared packages fail validation and ship nothing.

### Acceptance and Gate Evidence

- AC 1: PASS — exact registered package roots alone ship across conventional/custom/nested/symlink cases;
  disabled/orphan/prefix/sibling/cross-bundle packages remain absent, while every protected independent surface
  (including `uninstall-backlog`) remains intact.
- AC 2: PASS — the real `custom/two.md` add→build→remove→source-remains→rebuild workflow still omits the whole
  deregistered package from dry-run and tar/git/conditional-zip archives. Unique payload names make the
  deregistration key deterministic for hand-authored manifests too.
- Focused unit/schema/CLI: 194/194 across 7 files; focused built E2E/symlink integration: 27/27 across 2 files;
  full regression: 1,278/1,278 across 99 files.
- Typecheck: PASS; Biome lint: PASS (200 files); production build: PASS; documentation/inventory probes: PASS;
  `git diff --check`: PASS. Zip/unzip remain unavailable, so the conditional zip branch was correctly skipped.

### Outcome

**APPROVE** — cycle-1 findings remain closed; cycle 2 found and auto-fixed 2 findings (1 HIGH, 1 LOW), with 0
open findings.

## Senior Developer Review (AI) — Cycle 3

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — review cycle 3

### Workflow and Final Absorption Audit

- Re-invoked `bmad-story-automator-review` against the complete diff from baseline
  `50c46171c8f7d73df1379204959f8a0e9525e423`, including the worker's post-cycle-2 story/QA absorption.
- Customization again resolved to defaults: English/intermediate output, no `customize.toml`, no activation
  prepend/append steps, no project-context facts, and no completion hook. Sprint/backlog/state/branch files
  remained orchestration-owned and untouched.
- The worker's absorption was artifact-only. Product and test files required no change; the story File List
  exactly matches the complete in-scope baseline diff plus this story and its QA summary.
- All cycle-1 and cycle-2 fixes remain closed: unique payload deregistration names; arbitrary document basenames;
  pre-probe safe paths; segment-exact reserved/non-overlap policy (including `uninstall-backlog/**` while
  `uninstall-backlog-extra/custom.md` stays valid); registered and unregistered directory symlinks; missing and
  invalid refs; every protected non-payload surface; and unchanged bundle/project installerSkills behavior.
- Docs 06/10/12, code comments, story claims, and QA evidence consistently describe the final contract without
  scope drift. AC 1 and AC 2 remain fully proven by the real successive-archive workflow.

### Fresh Gate Evidence

- Focused unit/schema/CLI: 194/194 across 7 files; focused built E2E/symlink integration: 27/27 across 2 files.
- Typecheck: PASS; Biome lint: PASS (200 files); production build: PASS; documentation/inventory probes: PASS;
  `git diff --check`: PASS.
- No product/test file changed after the exact-final cycle-2 full regression, so its product-diff evidence is
  cited without redundant execution: 1,278/1,278 across 99 files (started 09:21:10 UTC, duration 382.90s).

### Outcome

**APPROVE** — 0 fresh findings; all prior findings remain closed and no worker code re-absorption is required.

## Senior Developer Review (AI) — CI ZIP Repair

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — post-CI repair review

### Workflow and Full-Diff Audit

- Re-invoked `bmad-story-automator-review` and audited the complete repair diff from baseline
  `4547434117562bb79a9dfe0e670f66934a8034e4`, not only the latest test edit.
- Customization resolved to defaults: English/intermediate output, no `customize.toml`, no activation
  prepend/append steps, no project-context facts, and no completion hook. Sprint/backlog/state/branch files
  remained orchestration-owned and untouched.
- Confirmed GitHub run 32355637349's failure mode: the pure ship plan was exact, but Info-ZIP update semantics
  retained deregistered entries when the same output path was reused. Removing the old ZIP before invoking the
  tool makes every successful archive an exact representation of the current `PackageRequest.files` on
  Linux/macOS and uses only cross-platform Node filesystem operations.
- The deterministic fake Info-ZIP faithfully models retained-entry update behavior without relying on local ZIP
  installation, while the real conditional built-CLI scenario reuses the same archive path after deregistration.
  Prior TASK-105 path, symlink, protected-surface, registry, and installerSkills guarantees remain unchanged.

### Finding and Auto-fix

- **MEDIUM — fixed:** if ZIP wrote a partial canonical output and then exited non-zero, the adapter propagated a
  typed error but left that truncated file in `builds/`, where it could be mistaken for a successful archive.
  The ZIP failure path now removes the partial output before rethrowing. The same fake-tool test forces a partial
  write plus exit 9 and proves a domain error is returned with no canonical archive left behind.

### Acceptance and Gate Evidence

- AC 1/2: PASS — successive same-path ZIP creation cannot retain entries absent from the authoritative current
  ship set; real deregistration still leaves source content in the authoring workspace while all archive formats
  omit it on the next successful build.
- Focused packager: 11/11; focused built E2E/symlink integration: 27/27 across 2 files; full regression:
  1,279/1,279 across 99 files (started 10:16:51 UTC, duration 376.90s).
- Typecheck: PASS; Biome lint: PASS (200 files); production build: PASS; diff/inventory checks: PASS.

### Outcome

**APPROVE** — 1 MEDIUM finding auto-fixed; 0 open findings.

## Senior Developer Review (AI) — Final Post-Absorption

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — final post-absorption review

### Workflow and Exact-Diff Audit

- Re-invoked `bmad-story-automator-review` and audited the complete current repair diff from
  `4547434117562bb79a9dfe0e670f66934a8034e4` after worker absorption.
- Customization resolved to defaults: English/intermediate output, no `customize.toml`, no activation
  prepend/append steps, no project-context facts, and no completion hook. Sprint/backlog/state/branch and
  investigation artifacts remained orchestration-owned and untouched.
- The current repair diff contains exactly four documented files: this story, its QA summary,
  `src/adapters/packager.ts`, and `test/unit/adapters/packager.test.ts`. All four appear in the story File List;
  there are no staged or undocumented repair files.
- Product and test behavior remains unchanged from the approved repair: ZIP removes a prior same-name output
  only after tool/source preparation, removes any partial canonical output on archiver failure, preserves the
  typed failure, and always cleans a staged source in the outer `finally`. The deterministic fake Info-ZIP still
  proves both stale-entry replacement and partial-output cleanup, while the real built-CLI scenario retains
  successive same-path archive coverage.
- All TASK-105 findings remain closed. AC 1/2 remain proven: the authoritative current ship set alone reaches
  successful archives, and deregistration leaves source content in place while omitting its package from the
  next dry-run and archive.

### Fresh Gate Evidence

- Focused packager: 11/11; focused built E2E/symlink integration: 27/27 across 2 files.
- Typecheck: PASS; Biome lint: PASS (200 files); production build: PASS.
- Fresh full regression: 1,279/1,279 across 99 files (started 10:29:14 UTC, duration 376.72s).
- File List/inventory reconciliation and `git diff --check`: PASS.

### Outcome

**APPROVE** — 0 fresh findings; every prior finding remains closed and no product/test re-absorption is required.

## Change Log

- 2026-08-20: Created TASK-105 story context from the authoritative task, project model, build architecture,
  prior archive-hygiene story, and current implementation seams.
- 2026-08-20: Made `payload.skills` authoritative for the common build ship-set, preserved complete registered
  packages, excluded conventional/custom orphans after deregistration, reconciled release docs, and added
  focused plus real successive-archive coverage.
- 2026-08-20: Review cycle 1 preserved arbitrary-basename registrations, added payload-only containment and
  package-boundary validation, closed regular/symlink/missing-source leakage and non-payload regressions,
  strengthened real successive-archive evidence, and approved the story as done.
- 2026-08-20: Re-invoked dev-story for review continuation, absorbed all cycle-1 fixes, added segment-exact
  protection and controls for the optional `uninstall-backlog/` recipe, reran the complete gate, and returned
  the story to review for cycle 2.
- 2026-08-20: Review cycle 2 re-audited the complete baseline diff, confirmed cycle-1 closure and exact uninstall
  recipe protection, rejected duplicate payload deregistration names, corrected arbitrary-basename commentary,
  strengthened invalid-source evidence, reran every gate, and approved the story as done.
- 2026-08-20: Re-invoked dev-story after cycle-2 review, re-absorbed both reviewer fixes and all prior safeguards,
  reconciled story/QA evidence and the complete File List, reran focused and built acceptance gates, and returned
  the story to review.
- 2026-08-20: Review cycle 3 re-audited the full baseline diff and artifact-only absorption, confirmed all prior
  findings remain closed, reran focused/static/built gates, cited the unchanged exact-final full regression, and
  approved the story as done.
- 2026-08-20: Re-invoked dev-story and QA for CI run 32355637349, made ZIP packaging replace rather than update
  an existing archive, added a tool-independent stale-entry regression, reran the full gate, and returned the
  story to review.
- 2026-08-20: Post-CI review approved the exact-set ZIP repair, added cleanup for partial output on tool failure,
  strengthened the deterministic fake-tool regression, reran the complete local gate, and marked the story done.
- 2026-08-20: Re-invoked dev-story after the post-CI review, absorbed its partial-output cleanup and regression,
  reran focused/static/build gates, reconciled story/QA evidence, and returned the story to review.
- 2026-08-20: Final post-absorption review re-audited the exact four-file repair diff, confirmed the ZIP exact-set
  and partial-output fixes unchanged, reran focused/built/static/full gates, and approved the story as done.
