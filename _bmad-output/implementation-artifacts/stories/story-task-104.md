---
baseline_commit: f9ddbdaa309e7c9415fce723b0e096f6f5cd55ff
---

# Story task-104 — Exclude the bundle-template scaffold from built archives

Status: done

> BMAD create-story provenance: `bmad-create-story` was invoked in this persistent worker session. Its
> customization resolved with no activation steps and no completion hook; the only persistent-fact glob
> (`**/project-context.md`) matched no files. The workflow's foundation sprint mirror has no TASK-104 entry,
> so discovery cannot represent this follow-up story and the explicitly supplied TASK-104 contract is used as
> the target. Per the assignment, the foundation `sprint-status.yaml` remains read-only.

## Story

As an author publishing a work-package,
I want the build to ship only installable project content,
so that recipients never see authoring scaffolds or unresolved template files.

## Acceptance Criteria

1. A built archive contains no `bundles/bundle-template/` path and no path whose basename retains the
   builder-only `.tmpl` suffix.
2. The init-generated executor front door never emits a dangling `choose from:` line, regardless of whether
   zero, one, or multiple bundles are enabled.
3. Each detect/setup/verify recipe task rendered from the default bundle scaffold carries the new bundle's
   initial version as its Backlog.md milestone.
4. The authoring-time `wip/bundles/bundle-template/` scaffold remains available and usable for later
   `bundle new` operations.

## Tasks / Subtasks

- [x] Make the pure build ship-set exclude the scaffold and unresolved template paths (AC: 1, 4)
- [x] Reword the executor front-door menu instruction without a dangling list introducer (AC: 2)
- [x] Add `milestone: {{version}}` to all three default recipe task templates (AC: 3)
- [x] Add focused unit, integration, and real-archive coverage for the supported package formats (AC: 1-4)
- [x] Run typecheck, lint, build, focused tests, full suite, and diff hygiene checks

## Dev Notes

### Implementation baseline (before TASK-104)

- `src/core/operations/build.ts::shippableFiles` deliberately special-cases `bundle-template` as shippable.
  That is the defect: the scaffold belongs in `wip/` for authoring but not in the release artifact.
- `templates/project/minimal/snippets/AGENTS.md` currently places `{{bundles}}` after the literal line
  `Present the available bundles for the user to choose from:`. Rendering an empty list leaves a dangling
  line, and rendering a non-empty list still duplicates responsibility already handled by the installer skill.
- The three files under `templates/bundle/default/files/install-backlog/tasks/` include labels and ordinals but
  no `milestone`, contrary to docs 08/10's `-m <version>` recipe convention.
- Dry-run and every package format share `BuildPlan.shippable`; filtering at this pure seam keeps tarball, zip,
  and git layouts aligned and preserves the core/adapter boundary.

### Guardrails and preserved behavior

- Keep the scaffold in the authoring workspace. Only `BuildPlan.shippable` and produced archives exclude it.
- Do not globally reject `.tmpl` because a registered payload template may legitimately use that suffix.
  The contract targets unsubstituted builder-template artifacts; enabled bundle payload content remains
  author-owned and shippable.
- Preserve disabled-bundle pruning, symlink leaf handling, front-door prefix transforms, and all package-format
  parity established by TASK-89/90/95/102/103.
- Keep production logic inside the injected `FileSystem` core operation; no `node:fs`, subprocess, or CLI
  framework imports under `src/core/`.
- Do not mutate Backlog state, `.bmad/sdlc-state.yaml`, `.serena/`, branches, commits, or the foundation sprint
  mirror in this worker assignment.

### Testing requirements

- Pure unit coverage proves `shippableFiles` omits the entire scaffold and unrelated template-source `.tmpl`
  paths while retaining enabled bundle content.
- Init/bundle integration coverage proves the scaffold remains present in `wip/` and rendered recipe tasks
  receive the requested bundle version milestone.
- Executor-front-door coverage exercises zero, one, and multiple bundles and rejects `choose from:` in every
  rendered result.
- Built-CLI E2E coverage inspects real tarball layout; parity coverage includes git and zip when available.

### References

- [Source: docs/06-project-skeleton.md#Hard-rules]
- [Source: docs/08-versioning-and-migrations.md#Task-tagging-system]
- [Source: docs/10-authoring-cli.md#Per-command-actions]
- [Source: docs/12-builder-architecture.md#What-wpm-build-produces]
- [Source: docs/13-core-architecture.md#Services-core-services--the-pure-logic-tier]
- [Source: backlog task 104 --plain]

## Dev Agent Record

### Agent Model Used

GPT-5.4 Codex persistent worker

### Debug Log References

- Create-story workflow customization: no prepend/append steps; no `on_complete`; no project-context facts.
- Discovery: PRD 1 file, architecture 1 file, epics 1 file, UX 0 files; TASK-104 is outside the foundation mirror.
- Dev-story workflow customization: no prepend/append steps; no `on_complete`; no project-context facts.
- Dev-story review-continuation customization: re-resolved with no prepend/append steps, an unmatched
  `**/project-context.md` persistent-fact glob, and an empty `on_complete` hook; the explicit story path and
  existing baseline were preserved, and the foundation sprint mirror remained read-only.
- Red phase: 5 expected failures (3 front-door bundle-count cases, 1 ship-set case, 1 milestone case).
- Focused unit: 40 passed; focused integration/E2E: 42 passed.
- Final gates: typecheck 0; Biome 0 (199 files); build 0; full Vitest 1255 passed in 99 files;
  `git diff --check` 0.
- Review-fix absorption: audited all 4 cycle-1 auto-fixes against the pure-core/ports boundary and archive
  semantics; no further runtime or test edits were required. Fresh focused unit 41/41 and built E2E 24/24,
  typecheck, Biome (199 files), production build, and `git diff --check` all passed. The separate reviewer’s
  final full regression remains 1,256/1,256 across 99 files and was not redundantly rerun after artifact-only
  reconciliation.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- The shared `BuildPlan.shippable` policy now excludes `bundles/bundle-template/**` and unresolved builder
  `.tmpl` sources for tarball, zip, and git packages while retaining enabled bundles' runtime payload templates.
- The default executor front door derives the bundle menu at install time and no longer renders a bundle list
  or dangling `choose from:` line.
- All three default detect/setup/verify recipe tasks render the requested initial bundle version as `milestone`.
- The authoring scaffold remains present under `wip/bundles/bundle-template/` and continues to feed `bundle new`.
- QA workflow verified 40 focused unit tests and 24 build E2E tests; summary:
  `_bmad-output/implementation-artifacts/tests/test-summary-task-104.md`.
- The dev-story review-continuation pass absorbed the approved cycle-1 fixes: kind-independent direct-child
  bundle pruning, real-archive runtime-template preservation and negative/parity coverage, canonical ship-set
  documentation, and strengthened front-door/milestone assertions. The architecture and semantics required no
  further correction, and the story is returned to `review`.

### File List

- `_bmad-output/implementation-artifacts/stories/story-task-104.md` (new)
- `_bmad-output/implementation-artifacts/tests/test-summary-task-104.md` (new)
- `docs/06-project-skeleton.md`
- `docs/10-authoring-cli.md`
- `docs/12-builder-architecture.md`
- `src/core/operations/build.ts`
- `templates/project/minimal/snippets/AGENTS.md`
- `templates/bundle/default/files/install-backlog/tasks/{{bundle-id}}-1 - Detect whether the capability is already present.md.tmpl`
- `templates/bundle/default/files/install-backlog/tasks/{{bundle-id}}-2 - Set up the capability.md.tmpl`
- `templates/bundle/default/files/install-backlog/tasks/{{bundle-id}}-3 - Verify the capability and confirm the receipt.md.tmpl`
- `test/unit/operations/build.test.ts`
- `test/unit/templates/minimal-project.test.ts`
- `test/unit/templates/default-bundle.test.ts`
- `test/integration/cli.build.e2e.test.ts`

## Senior Developer Review (AI)

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — review cycle 1

### Workflow Evidence

- Invoked `bmad-story-automator-review` against this story and its `baseline_commit` diff.
- Review workflow customization resolved to defaults: no `customize.toml`, no activation prepend/append steps,
  and no `workflow.on_complete` hook. Team/user config files contain comments only.
- The foundation sprint mirror has no TASK-104 entry and was kept read-only as required by the assignment.

### Findings and Auto-fixes

- **HIGH — fixed:** direct children of `bundles/` were pruned only when the filesystem entry reported
  `kind: directory`. The real adapter reports symlinks as file-like leaves, allowing an orphan or scaffold
  symlink to bypass the manifest boundary. Pruning now applies to every direct child regardless of entry kind,
  with unit and extracted-archive regression coverage.
- **MEDIUM — fixed:** the initial archive test rejected every `.tmpl` path, contradicting the explicit runtime
  payload exception, and did not prove nested or symlink content survived a real package. The E2E now registers
  nested runtime `.tmpl` files (regular and symlink), extracts tarball/git/conditional-zip artifacts, verifies
  content and symlink targets, rejects scaffold/orphan/unresolved builder sources, and compares layouts.
- **MEDIUM — fixed:** docs 06/10/12 still described packaging as unchanged all-of-`wip` shipping. They now define
  the filtered release ship set consistently, including the enabled runtime-template exception and
  authoring-scaffold preservation.
- **LOW — fixed:** focused assertions were negative-only for the front door, used one plain milestone version,
  and did not compare the exceptional archive layouts. Tests now positively require runtime manifest-summary
  discovery, exercise plain and prerelease/build semvers across all three starter tasks, and enforce
  cross-format layout parity.

### Acceptance and Gate Evidence

- AC 1: PASS — no `bundles/bundle-template/**`, disabled/orphan entries, or unresolved builder `.tmpl` sources
  occur in the common ship set or extracted archives; registered nested runtime payload templates remain.
- AC 2: PASS — zero/one/multiple rendering has no `{{bundles}}` or dangling `choose from:` and directs the
  executor to discover summaries from enabled runtime manifests without exposing internal ids.
- AC 3: PASS — detect/setup/verify all render the exact arbitrary `--version`, including
  `10.20.30-beta.2+build.7`, as their milestone.
- AC 4: PASS — packaging leaves `wip/bundles/bundle-template/` intact and a subsequent
  `bundle new later --version 7.8.9` succeeds.
- Focused unit: 41/41; focused built E2E: 24/24; full regression: 1,256/1,256 across 99 files.
- Typecheck: PASS; Biome lint: PASS (199 files); production build: PASS; template inventory probes: PASS;
  `git diff --check`: PASS.

### Outcome

**APPROVE** — 4 findings (1 HIGH, 2 MEDIUM, 1 LOW), all auto-fixed; 0 open findings.

## Senior Developer Review (AI) — Cycle 2

### Reviewer

GPT-5.4 Codex persistent separate-lane reviewer — review cycle 2

### Workflow and Diff Audit

- Re-invoked `bmad-story-automator-review` against this story and the exact final diff after worker absorption.
- Review customization again resolved to defaults: no `customize.toml`, no activation prepend/append steps,
  and no `workflow.on_complete` hook. The foundation sprint mirror remained read-only by assignment.
- The story File List matches all in-scope product changes plus the story/QA artifacts. The pre-existing backlog,
  SDLC-state, and `.serena` changes remain orchestration-owned and outside this review.
- Corrected one LOW review-record issue: this story's pre-change analysis was still headed "Current
  implementation" after the implementation landed. It is now explicitly labeled as the pre-TASK-104 baseline.

### Cycle-1 Closure and Acceptance Evidence

- The cycle-1 HIGH manifest-boundary fix remains closed: pruning applies to every direct child of `bundles/`
  regardless of directory/file-like entry kind, so scaffold and orphan symlinks cannot bypass it.
- Both cycle-1 MEDIUM fixes remain closed: extracted real archives preserve registered nested runtime `.tmpl`
  files and symlinks while rejecting builder sources, and docs 06/10/12 consistently describe that release
  ship set without changing product goals, vocabulary, front-door transforms, or authoring behavior.
- The cycle-1 LOW coverage fix remains closed: the real init-generated front door is checked with zero, one,
  and multiple enabled bundles; both plain and prerelease/build versions are checked across all three tasks;
  tarball/git/conditional-zip layouts are compared exactly.
- AC 1-4 and every checked task remain fully implemented. No core import-boundary exception or new dependency
  was introduced.

### Fresh Gate Evidence

- Focused unit: 41/41; focused built E2E: 24/24; full regression: 1,256/1,256 across 99 files.
- Typecheck: PASS; Biome lint: PASS (199 files); production build: PASS; template inventory probes: PASS;
  `git diff --check`: PASS.

### Outcome

**APPROVE** — cycle-1 findings remain closed; cycle 2 found 0 blocking product findings and corrected 1 LOW
story-record label. No worker code re-absorption is required.

## Change Log

- 2026-08-19: Excluded authoring scaffolds/unresolved builder templates from all build formats, corrected the
  executor front-door menu protocol, added default recipe milestones, and added unit/integration/archive tests.
- 2026-08-19: Review cycle 1 auto-fixed manifest-boundary symlink leakage, runtime-template archive coverage,
  canonical documentation drift, and assertion-strength gaps; the dev-story continuation absorbed the fixes,
  reran the proportional gates, and returned the story to review.
- 2026-08-19: Review cycle 2 re-audited the absorbed final diff, confirmed all cycle-1 findings remain closed,
  reran every requested gate, corrected a stale story-record heading, and approved the story as done.
