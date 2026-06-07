# Story task-87 — Scaffold the authoring workspace on wpm init

> Lean implementation spec (BMAD create-story output, **Rule-3 docs fallback**). Task-87 belongs to the
> **authoring-workspace epic** tracked in Backlog.md, NOT the foundation `sprint-status.yaml` (which mirrors
> epic-1, tasks 1–33). create-story auto-discovery targets that epic-1 mirror, which does not contain
> task-87, so this story was driven from the committed docs (the stated Rule-3 fallback) and written here
> following the `story-task-86.md` convention. The foundation sprint-status is deliberately **not** mutated.
> Companion to the already-merged design tasks **85** (introduced the workspace model) and **86** (specified
> the CLI + build behaviour). This is the **CODE** task that makes `wpm init` produce that workspace.

## Acceptance criteria (the contract — from `backlog task 87 --plain`)
1. After init of a new project, the **workspace root** holds an **authoring front door** and the **authoring
   backlog** (a Backlog.md root with `task_prefix=authoring`), and the deliverable skeleton (manifest,
   bundles tree, default bundle template, installer-skills, templates) lives under the deliverable
   subdirectory `wip/`.
2. An **empty build-output directory** (`builds/`) exists after init.
3. The workspace `.gitignore` excludes **both** the authoring backlog **and** the build-output directory.
4. The authoring front door **addresses the authoring agent**, orienting it toward *authoring* the
   deliverable rather than *installing* it.
5. init **refuses** when the target path already exists and creates nothing.
6. `--list-templates` prints the available templates and exits without creating anything; `--param k=v`
   still feeds placeholder substitution.
7. The project-wide authoring tasks, and a per-bundle set for each template-preincluded bundle, are
   materialised into the **workspace-root** authoring backlog with their identities **unchanged**.
8. The deliverable subdirectory contains the rendered per-project **installer skill** and the **executor
   front door** scaffolded under the **reserved build-stripped prefix** (`wip/_AGENTS.md`), author-editable
   and **not** under its canonical auto-discovered name (`wip/AGENTS.md` must NOT exist).

## The decided contract (from docs 06/10/11/12 — do NOT re-decide)
- **Three workspace regions** (06 §"Authoring workspace vs. shipped artifact", 12 §"generated authoring
  workspace"): workspace **root** = authoring surface; deliverable subdir **`wip/`** (the deliverable root
  is exactly `<workspace>/wip`, NO deliverable-id subdir); build-output **`builds/`**.
- **Workspace root** holds: authoring front door `AGENTS.md` (+ `CLAUDE.md` symlink alias), `.gitignore`
  (ignores `.authoring-backlog/` and `builds/`), `.authoring-backlog/` (task_prefix=authoring), `wip/`,
  empty `builds/`.
- **`wip/`** holds everything the old root-init wrote: `manifest.yml`, `bundles/` (+ `bundles/bundle-template/`),
  `installer-skills/` (+ rendered `<name>-installer/SKILL.md`), `templates/`, scope-alias symlinks, AND the
  executor front door under the reserved prefix `wip/_AGENTS.md` (10 step 7; 12 §"reserved-prefix transform").
- **Executor front door is author-owned, NOT auto-regenerated** (10 §"Derived artefacts stay current… except").
  At init it is written **once** under `_AGENTS.md`. Only the installer `SKILL.md` + scope aliases stay
  auto-derived. Per-bundle `_AGENTS.md` + the build-time strip are **TASK-90** (out of scope); AC#8 is
  project-level only. `minimal` pre-includes no bundles, so no per-bundle front door arises here.
- **Authoring front door content source** (04 stance; 10/12 "content comes from template, not invented):
  add a NEW builder-provided **snippet** to the minimal project template, rendered with `project-name`. It
  must NOT collide with the executor front-door snippet's selection predicate (which matches `AGENTS.md` /
  `/AGENTS.md` / `.tmpl`), so it is named distinctly (`authoring-front-door.md.tmpl`). The core stays pure:
  init selects the snippet from the resolved template and renders it via the existing `renderSnippet`
  service — no prose authored in core.

## Files to change
- `src/core/operations/init-project.ts` — relocate the deliverable under `wip/`; create `builds/`; write the
  authoring front door + `CLAUDE.md` alias at the root from the new snippet; write the executor front door to
  `wip/_AGENTS.md` (relocated from the deriver's `AGENTS.md`); extend `.gitignore` to both regions.
- `templates/project/minimal/snippets/authoring-front-door.md.tmpl` — NEW authoring-stance front door snippet.
- `src/cli.ts` — summary wording only (init module already passes `targetDir` as the workspace root).
- Tests: `test/unit/operations/init-project.test.ts`, `test/integration/cli.init.test.ts` — update to the new
  workspace layout + add coverage for AC#2/#3/#4/#8.

## Implementation plan
1. In `initProject`, compute `wip = join(targetDir, "wip")`. Render template `files/` under `wip` (step 3/4).
   Materialise the default bundle template at `wip/bundles/bundle-template/` (step 5). Create empty
   `wip/installer-skills/` + `wip/templates/` (step 6).
2. `buildProjection(fs, wip)` and the deriver's `projectTemplatesRoot = join(wip, "templates")` so the
   projection reads `wip/manifest.yml` and the aliases land under `wip/`.
3. From `desired.files`: write the orchestrator under `wip/`; write the executor front door (the file whose
   rendered path is `AGENTS.md`) to `wip/_AGENTS.md`. Create scope aliases under `wip/`.
4. `.authoring-backlog/` stays at `targetDir`; materialise project-wide + per-preincluded-bundle tasks there
   (identities unchanged — AC#7).
5. Create empty `builds/` at `targetDir` (AC#2).
6. Write `.gitignore` at `targetDir` with both `.authoring-backlog/` and `builds/` (AC#3), idempotently.
7. Render the authoring front-door snippet with `{project-name}` → `targetDir/AGENTS.md`; `ensureAlias` →
   `targetDir/CLAUDE.md` (AC#1/#4).
8. Update summary wording (e.g. "created authoring workspace … (deliverable under wip/)").

## Test plan
- AC#1: workspace root has `AGENTS.md` + `.authoring-backlog/`; `wip/manifest.yml`, `wip/bundles/bundle-template/`,
  `wip/installer-skills/`, `wip/templates/` exist.
- AC#2: `builds/` exists and is empty.
- AC#3: `.gitignore` matches both `^\.authoring-backlog/$` and `^builds/$`.
- AC#4: root `AGENTS.md` addresses the authoring agent (mentions authoring/`wip/`/authoring-backlog; does NOT
  reframe as "install this project").
- AC#5: existing target path → ConflictError, nothing created.
- AC#6: `--list-templates` creates nothing; `--param` threads through.
- AC#7: project-wide set (8) materialised into the root `.authoring-backlog`; per-bundle set for each
  preincluded bundle (fixture); titles unchanged.
- AC#8: `wip/_AGENTS.md` present (substituted), `wip/AGENTS.md` absent, `wip/installer-skills/<name>-installer/SKILL.md`
  present.
- single-source: `wip/_AGENTS.md` content == deriver's `AGENTS.md` output.

## DoD
typecheck clean; biome clean; tests added + green; public funcs documented; no dead code; core import-boundary intact.

Status: ready-for-dev
