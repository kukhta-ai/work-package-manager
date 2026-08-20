# Story task-89 — Package the build as the un-nested deliverable into the build-output directory

> Lean implementation spec (BMAD create-story output, **Rule-3 docs fallback**). Task-89 belongs to the
> **authoring-workspace epic** tracked in Backlog.md, NOT the foundation `sprint-status.yaml` (which mirrors
> epic-1, tasks 1–33). The `bmad-create-story` / `bmad-dev-story` / `bmad-qa-generate-e2e-tests` skills
> auto-discover against that epic-1 mirror, which does not contain task-89, so this story was driven from the
> committed docs (the stated Rule-3 fallback) and written here following the `story-task-87.md` convention.
> The foundation sprint-status is deliberately **not** mutated. Builds on the already-merged tasks **86**
> (build spec) and **88** (workspace resolution; `requireProject` returns `{ deliverableRoot, workspaceRoot }`
> and the deliverable un-nests under `wip/`). This is the **CODE** task that routes the produced archive into
> the workspace's `builds/` output directory. Non-goal: build-time executor-front-door generation / the
> `_AGENTS.md`→`AGENTS.md` strip (**task-90**).

## Acceptance criteria (the contract — from `backlog task 89 --plain`)
1. `build package` writes an archive into the build-output directory, named by the project release name,
   version, and chosen format.
2. The archive root is the un-nested deliverable, with the manifest at the archive root.
3. The authoring backlog, the authoring front door, and the build-output directory are absent from the archive.
4. Disabled bundle directories and builder-time working directories remain excluded from the archive.
5. `build dry-run` previews the would-ship un-nested tree and produces no artifact.
6. `build` run outside a workspace exits non-zero, naming the missing workspace.
7. Re-packaging unchanged project state reproduces an identical archive layout.

## The decided contract (from docs 06/10/12 — do NOT re-decide)
- **Three workspace regions** (task-87): workspace **root** = authoring surface (`AGENTS.md` authoring front
  door, `CLAUDE.md` alias, `.authoring-backlog/`, `builds/`); deliverable **`wip/`**; build-output **`builds/`**.
- **Build-output directory is `<workspace>/builds/`** (doc 12 §"What `wpm build` produces"). The archive is
  written **into** it, **beside** (never inside) the un-nested deliverable `wip/`, so the archive can never
  contain itself nor `builds/` (AC#1/#3).
- **The archive root is the un-nested deliverable** (`<workspace>/wip`): `createArchive`'s `root` is already
  `deliverableRoot` and `files` (`plan.shippable`) are wip-relative, so `manifest.yml` lands at the archive
  root with no `wip/` prefix (AC#2). This is inherited from task-88 — do not regress it.
- **Exclusions are structural** (doc 06): the authoring backlog, the authoring front door, and `builds/` all
  live at the **workspace root, outside `wip/`**, so enumerating `wip/` (the pure `shippableFiles`) excludes
  them naturally (AC#3). Disabled bundle directories + builder-time dirs (`.authoring-backlog`, `.git`,
  `node_modules`, `dist`) are excluded by `shippableFiles` / `NON_SHIPPABLE_TOP_LEVEL` (AC#4).
- **Determinism** (AC#7): `plan.shippable` is already a SORTED enumeration, so re-packaging unchanged state
  reproduces an identical archive LAYOUT (file set/structure; zip embeds timestamps so byte-identity is not
  claimed).
- **Out of scope**: the `_AGENTS.md`→`AGENTS.md` build-time strip + per-bundle front doors are **task-90**.
  For now the archive ships `wip/_AGENTS.md` verbatim.

## Files to change
- `src/cli.ts` — in `build package` and `build publish`, destructure `{ deliverableRoot: root, workspaceRoot }`
  from `requireProject` and set `outDir` to `<workspaceRoot>/builds/` (via a new `buildOutputDir` helper that
  ensures the directory exists through the FileSystem port). Update the stale "written to the cwd…" comment.
- `test/integration/cli.build.e2e.test.ts` — repoint package/publish assertions at `<workspace>/builds/`;
  add AC#2 (manifest at archive root, no `wip/`), AC#3 (no `.authoring-backlog`, no root `AGENTS.md`, no
  `builds/`, no self-containment), AC#6 (outside-workspace), AC#7 (identical layout on re-package).
- **No change** to `src/core/operations/build.ts` — it stays PURE (effects only in the adapter/CLI shell). The
  pure plan already enumerates deterministically and excludes the right paths.

## Implementation plan
1. Add `const BUILD_OUTPUT_DIR = "builds"` + `buildOutputDir(ctx, workspaceRoot)`: `join(workspaceRoot,
   "builds")`, `ctx.deps.fs.makeDirectories(dir)` (init seeds an empty `builds/`, but it may have been
   removed), return the dir.
2. `build package` action: `const { deliverableRoot: root, workspaceRoot } = requireProject(...)`; pass
   `outDir: buildOutputDir(ctx, workspaceRoot)` to `createArchive`. Keep `baseName: ${plan.name}-${plan.version}`
   and `--format` ext.
3. `build publish` action: same destructure + `outDir`; the archive is built into `builds/` then pushed.
4. Update the `build package` comment block from "written to the cwd…" to "written into the workspace's
   `builds/`…".

## Test plan
- AC#1: package with `cwd != workspace` ⇒ archive at `<workspace>/builds/<name>-<version>.<ext>`, NOT the cwd;
  success line prints that path.
- AC#2: tar listing has `manifest.yml` at the root (regex `^(\./)?manifest\.yml$`), no `wip/` prefix.
- AC#3: listing has no `.authoring-backlog`, no top-level `AGENTS.md` (the authoring front door; the shipped
  `_AGENTS.md` is fine), no `builds/`, and never the archive itself.
- AC#4: covered at the pure-plan level by `test/unit/operations/build.test.ts` ("EXCLUDES a DISABLED bundle
  dir …" + the `NON_SHIPPABLE_TOP_LEVEL` cases) — the same `plan.shippable` that becomes the archive content.
  (An orphan/disabled bundle dir present on disk FAILS validation, so it cannot be shown through a produced
  archive — hence the pure test is the proving test; an e2e note documents this.)
- AC#5: dry-run prints the would-ship tree, writes nothing (unchanged from task-82, re-asserted).
- AC#6: `build package` / `build publish` with no `-C` and no workspace marker ⇒ non-zero, message naming the
  workspace.
- AC#7: build twice (tarball), assert identical sorted tar listings.

## DoD
typecheck clean; biome clean; tests added + green; public funcs documented; no dead code; core import-boundary
intact (`build.ts` unchanged, still pure).

Status: ready-for-dev
