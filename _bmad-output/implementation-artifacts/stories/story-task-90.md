# Story task-90 — Author the deliverable executor front door under a build-stripped prefix

Status: ready-for-dev

> BMAD note (Rule 3 evidence): the BMAD `bmad-create-story` / `bmad-dev-story` / `bmad-qa-generate-e2e-tests`
> skills auto-discover the **foundation epic-1** sprint mirror (`sprint-status.yaml` / `epics.md`) and drive
> their flow from it; task-90 (epic `authoring-workspace`, the `feature/aw-*` line) is **not** in that mirror,
> and the orchestrator forbids mutating the foundation `sprint-status.yaml`. The skills therefore cannot run
> unattended against this story. Per the stated fallback (CLAUDE.md Rule 3: "name the blocker, drive the step
> from the docs as a stated fallback, record it"), this story file is authored directly from the binding
> contract — `backlog task 90 --plain` (6 ACs + DoD) steered from docs 06, 12, 10, 05 — and the implementation
> follows it. `create-story` = fallback (this file); `dev-story` = fallback (the implementation below);
> `qa-generate-e2e-tests` = fallback (the e2e/unit tests below).

## Acceptance criteria (verbatim from the backlog — `backlog task 90 --plain`)

1. The deliverable executor front door is author-owned content the author can edit, stored under a reserved name
   that agent auto-discovery does not load.
2. The build restores the executor front door to its canonical name (AGENTS.md, with the CLAUDE.md alias) at the
   corresponding location in the archive.
3. During authoring, no deliverable front door is auto-discovered under a canonical agent-surface name that
   contradicts the authoring front door, at the project root or in any bundle.
4. The reserved-prefix convention is documented where the author will see it, so an edit to the front door is not
   mistaken for a stray file.
5. A file authored under the reserved prefix appears in the archive only under its canonical stripped name, never
   under both names.
6. Author edits to the prefixed front door appear verbatim in the built archive; the build does not regenerate or
   overwrite the content.

## Contract sources

- **doc 06** §"Authoring workspace vs. shipped artifact" + §"Self-similar surfaces" — `_AGENTS.md` → `AGENTS.md`
  + `CLAUDE.md`/`GEMINI.md` aliases per targets, at the project root AND per bundle (front-door mechanic recurs
  per bundle).
- **doc 12** §"What `wpm build` produces (un-nesting, exclusions, and the front-door prefix-strip)" — the build
  strips the leading underscore and creates build-created per-target aliases for each agent in `manifest.targets`;
  only the front door carries the prefix; the aliases are build-created; content is copied verbatim.
- **doc 05** §"AGENTS.md (and CLAUDE.md / GEMINI.md variants)" — Claude Code reads `CLAUDE.md`; Gemini reads
  `GEMINI.md`; AGENTS.md is the broad open standard the rest (Codex/Hermes/OpenClaw) read natively.
- **doc 10** §`build` — `build package`/`publish` produce the archive from the shippable set.

## Design (pure plan computes the policy; the adapter performs it — doc 13 §1/§3)

1. **Pure plan** (`src/core/operations/build.ts`): `computeFrontDoorTransforms(shippable, targets)` scans the
   shippable set for entries whose basename is exactly `_AGENTS.md` (the project-root `_AGENTS.md` and each
   shipped bundle's `bundles/<id>/_AGENTS.md` — disabled bundles are already pruned from `shippable`), and emits
   `{ from, to: "<dir>/AGENTS.md", aliases: [<per-target front-door filenames>] }`. The per-target filename map
   is the DATA constant `FRONT_DOOR_ALIAS_FILENAMES` (`claude-code → CLAUDE.md`, `gemini → GEMINI.md`); agents
   that read `AGENTS.md` natively get no alias. Added to `BuildPlan.frontDoorTransforms`. `build.ts` stays pure
   (model/services/ports + `node:path` only).
2. **Adapter** (`src/adapters/packager.ts`): when transforms are present, **stage** the shippable set into a
   temp dir (copying files; preserving symlinks via `readlink`+`symlink` so scope-alias links archive identically
   to today), then for each transform write `<dir>/AGENTS.md` from the **original `_AGENTS.md` bytes** (verbatim),
   create each alias as a relative symlink to `AGENTS.md`, and drop the staged `_AGENTS.md`. Archive the staged
   tree (sorted listfile for tarball; same arg-shape for zip). The temp dir is removed in a `finally`. When there
   are no transforms (e.g. the packager unit fixtures), the original direct path runs unchanged.
3. **CLI** (`src/cli.ts`): thread `plan.frontDoorTransforms` into `createArchive` for `package` and `publish`.
4. **Bundle template**: rename `templates/bundle/default/files/AGENTS.md.tmpl` → `_AGENTS.md.tmpl` so `bundle new`
   (and `init`'s materialised `bundles/bundle-template/`) scaffold `bundles/<id>/_AGENTS.md`, never the
   auto-discovered `bundles/<id>/AGENTS.md` (AC#3). `create-bundle.ts` clones the tree generically (no hardcoded
   `AGENTS.md`), so the rename flows through.
5. **Docs (AC#4)**: add the reserved-prefix convention to `agent-skills/installer-builder/references/conventions.md`.

## Per-AC mapping

- **#1** root `_AGENTS.md` (task-87) + per-bundle `_AGENTS.md` (bundle-template rename) — author-owned, reserved
  name never matched by exact-basename auto-discovery.
- **#2** `computeFrontDoorTransforms` + adapter staging restore `AGENTS.md` + `CLAUDE.md` alias at root and per
  bundle.
- **#3** on disk during authoring only `_AGENTS.md` exists (init + bundle new); proven by an on-disk e2e.
- **#4** conventions.md entry.
- **#5** adapter drops the staged `_AGENTS.md`; the archive carries only the canonical name.
- **#6** adapter copies the original `_AGENTS.md` bytes verbatim — no re-render.

## Tests (qa fallback)

- `test/unit/operations/build.test.ts` — `computeFrontDoorTransforms` unit cases (root only; root + bundles;
  per-target alias map; only `_AGENTS.md` matched; `.tmpl` not matched).
- `test/integration/cli.build.e2e.test.ts` — edit `wip/_AGENTS.md` + a bundle's `_AGENTS.md` with sentinels,
  build, assert archive has `AGENTS.md` (root + per bundle) verbatim, `CLAUDE.md` aliases, and NO `_AGENTS.md`.
- on-disk authoring e2e — after `init` + `bundle new`, only `_AGENTS.md` exists (no `AGENTS.md`/`CLAUDE.md` in
  `wip/` or `wip/bundles/<id>/`).
- bundle-template/create-bundle tests updated for `_AGENTS.md.tmpl`.
</content>
</invoke>
