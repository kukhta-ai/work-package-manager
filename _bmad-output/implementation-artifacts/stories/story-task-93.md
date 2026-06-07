# Story task-93 — Migrate the test suite and fixtures to the workspace layout

Status: ready-for-dev

> BMAD note (Rule 3 evidence): the BMAD `bmad-create-story` / `bmad-dev-story` / `bmad-qa-generate-e2e-tests`
> skills auto-discover the **foundation epic-1** sprint mirror (`sprint-status.yaml` / `epics.md`) and drive
> their flow from it; task-93 (epic `authoring-workspace`, the `feature/aw-*` line) is **not** in that mirror,
> and the orchestrator forbids mutating the foundation `sprint-status.yaml`. The skills therefore cannot run
> unattended against this story. Per the stated fallback (CLAUDE.md Rule 3: "name the blocker, drive the step
> from the docs as a stated fallback, record it"), this story is authored directly from the binding contract —
> `backlog task 93 --plain` (5 ACs + DoD) steered from docs 06, 10, 11, 12 and the merged test changes of
> tasks 87–90. `create-story` = fallback (this file); `dev-story` = fallback (the test changes below);
> `qa-generate-e2e-tests` = fallback (the e2e regression/lifecycle tests below).

## Acceptance criteria (verbatim from the backlog — `backlog task 93 --plain`)

1. Fixtures represent authoring workspaces with the deliverable nested under its subdirectory rather than
   deliverables at the project root.
2. Integration tests drive the workspace flow end to end: init creates a workspace, project-bound commands
   resolve the nested deliverable, and build produces an un-nested archive in the build-output directory.
3. A regression test fails if any builder-time region (the authoring backlog, the authoring front door, or the
   build-output directory) appears inside a build artifact.
4. A regression test fails if any deliverable executor front door appears in the authoring tree under its
   canonical auto-discovered name; it must appear only under the reserved prefix.
5. Snapshot expectations reflect the workspace layout and the prefix-stripped executor front door as it appears
   in the archive.

## Context — most migration landed in 87–90

Tasks 87 (init scaffolds a workspace), 88 (`resolveContext` finds `wip/manifest.yml`; `project root` →
`<workspace>/wip`), 89 (build writes the un-nested archive into `<workspace>/builds/`, excludes builder-time
regions), and 90 (author-owned `_AGENTS.md` stripped to `AGENTS.md` in the archive) already migrated the tests
they touched and retired the `flat-project.ts` bridge in favour of `test/helpers/workspace.ts` (`initWorkspace`).
This story is the **comprehensive audit + consolidation**: make the WHOLE suite + ALL fixtures consistently
reflect and GUARD the workspace layout, and fill gaps. Non-goal: any NEW product behavior beyond 87–90.

## Fixture audit (AC#1)

- **Workspace-modelling fixtures (must be real workspaces — already migrated, verified):** `cli.init`,
  `cli.build.e2e`, `cli.bundle-*.e2e`, `cli.bundle-new`, `cli.project-meta.e2e`,
  `cli.project-installer-skills.e2e` all build via `initWorkspace` (deliverable under `wip/`, `.authoring-backlog/`
  + authoring front door at the root, `builds/` at the root). Hand-rolled on-disk projects in
  `cli.project-reads` (`wip/manifest.yml`, resolves via `-C <workspaceRoot>`, asserts `project root` →
  `<dir>/wip`) and `cli.version` (`wip/manifest.yml` + `.authoring-backlog/` at root) are correct workspaces.
  `context.test.ts` exercises the `wip/manifest.yml` marker + nearest-workspace-wins + the "bare manifest is NOT
  a workspace" negative. No residual flat assumption found (grep for `join(<root>,"manifest.yml")` over a
  workspace root, bare root-level `AGENTS.md`, `.authoring-backlog` beside a root manifest → none).
- **Correctly deliverable-root unit fixtures (left as-is, per the task's JUDGMENT clause):** the **packager**
  unit (`test/unit/adapters/packager.test.ts`) takes a deliverable `root` + an explicit `files` list and
  archives only those — it is the `wip/` content viewed in isolation; its in-root `.authoring-backlog/` exists
  only to prove the packager ships ONLY listed files. The **materialisation** integration
  (`test/integration/services/materialisation.test.ts`) hands the backlog port a root directly — that root IS the
  `.authoring-backlog/` viewed in isolation. The pure **build** / **render** / **template-resolver** /
  **create-bundle** / **init-project** operation+service units operate on injected trees/roots and never model a
  whole on-disk workspace. Forcing a `wip/` wrapper on these would be wrong.

## Implementation (test changes only — `test/`)

All changes are in `test/integration/cli.build.e2e.test.ts` plus the await-masking fix across three e2e files.

- **AC#3 (consolidated robust leak guard).** New `AC93#3` test plants a UNIQUE sentinel in EACH of the three
  builder-time regions — `.authoring-backlog/`, the workspace-root authoring front door (`AGENTS.md`/`CLAUDE.md`),
  and `builds/` — then builds and asserts none leak into the archive **by path AND by content** (extract +
  concatenate every file's bytes via a new `concatAllFiles` helper). This closes the gap where the authoring
  front door region was only structurally excluded and never content-asserted (the archive legitimately ships an
  `AGENTS.md` that is the DELIVERABLE executor front door, so a filename check alone cannot guard it).
- **AC#4 (tree-walk guard).** New `AC93#4` test inits + adds two bundles, then walks the WHOLE deliverable
  (`wip/`) and asserts NO file basename is a canonical auto-discovered front door (`AGENTS.md`/`CLAUDE.md`/
  `GEMINI.md`) anywhere — root or any bundle — while `_AGENTS.md` IS present at the root and per bundle. Stronger
  than enumerating fixed paths (catches any future leak location).
- **AC#2 (cohesive lifecycle).** New `FULL workspace lifecycle E2E` drives init → `project root` (resolves
  `<ws>/wip`) → `bundle new` → `project meta` + `targets add` → `project show` (reads the edit back) →
  `build package`, asserting the workspace layout at every step and the un-nested archive (manifest at root, no
  `wip/` prefix, `AGENTS.md` stripped) in `<workspace>/builds/`.
- **AC#1 / AC#5.** Confirmed by the audit + the existing structural assertions (init asserts the full workspace
  tree; build asserts the archive's stripped `AGENTS.md` + un-nested root). No `.snap` files exist — the
  "snapshot" expectations are inline tree/structure assertions, which already reflect the workspace + stripped
  front door.

## Carry-forward — await-masking verification (from the task-88 review)

Empirically PROVEN a genuine masking pattern with a throwaway probe: a SYNC `it(..., () => { withTempDir(cb) })`
(non-awaited, floating promise) reports the test as **passed** even when an assertion inside the sync callback
fails (the failure surfaces only as an unhandled rejection; exit code is 1 but per-test attribution is lost and
the test is mislabeled green). Found 56 such floating sites across `cli.bundle-id.e2e` (43), `cli.init` (3), and
`cli.project-installer-skills.e2e` (10). Fixed each by converting the sync `it` callback to `async` and awaiting
its `withTempDir` (the established correct pattern), changing no test logic. The 115+ already-awaited
`await withTempDir((dir) => {sync})` sites and the legitimate `await expect(withTempDir(...)).rejects` site
(`tmpdir.test.ts`) were left untouched.

## DoD

- Typecheck clean (`tsc --noEmit`), Biome clean (`biome check`).
- Tests added (3 new e2e regression/lifecycle tests) + 56 floating tests repaired; coverage strengthened, none
  removed.
- Public test helper (`concatAllFiles`) documented; no dead code; core import-boundary untouched (test/ exempt).
- Verified via FULL COLD `npm run build && npm test` (real-binary e2e active).
