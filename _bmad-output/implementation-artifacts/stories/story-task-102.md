# Story — TASK-102: Make a bundle's install-backlog resolvable by the Backlog.md CLI

> BMAD provenance (Rule 3): `bmad-create-story` / `bmad-dev-story` could **not** run unattended for this
> task — TASK-102 is a *deferred* product defect, excluded from the epic-1 sprint mirror
> (`_bmad-output/implementation-artifacts/sprint-status.yaml`), and the project's `story-automator-review`
> already falls back to manual on every story (it requires a live sprint session + interactive elicitation;
> see `.bmad/sdlc-state.yaml`). Per the task brief's stated fallback, this story is driven directly from
> `backlog task 102 --plain` + the fix brief. The implementation followed the `dev-story` discipline
> (implement + tests together; type-clean, lint-clean, green; core import-boundary intact).

## Context / root cause

The Backlog.md CLI resolves a project by walking up from cwd for a directory **named `backlog/`**
(containing `config.yml` + `tasks/`). A bundle ships its recipe under **`install-backlog/`**, so
`cd wip/bundles/<id> && backlog task …` reports *"No Backlog.md project found."* There is no Backlog.md
config/flag to rename the folder it looks for (verified). This bites authoring (the documented
`cd wip/bundles/<id> && backlog task create …` recipe step) **and** the executor at install time (the
shipped archive carries `install-backlog/`, not `backlog/`).

## Fix (validated)

Ship a **relative `backlog → install-backlog` symlink in every bundle**, so the CLI resolves the recipe
without any manual workaround, at authoring time and from the extracted archive. Relative target for
archive portability (the link survives extraction to any path).

## Acceptance criteria (from `backlog task 102 --plain`)

1. Running the Backlog.md CLI from within a bundle operates on that bundle's install-backlog **without a
   manual workaround**.
2. Authoring a recipe task (create/edit/label) from within a bundle **persists to that bundle's
   install-backlog tasks**.
3. The authoring docs' worked recipe-authoring commands run **as written**, both at authoring time **and**
   when the executor works the recipe at install time (the shipped archive is also resolvable).

## Implementation plan (the *how*, within doc-13 layering)

- **Create the link (pure core, via the FileSystem port).**
  - `src/core/operations/create-bundle.ts` (`bundle new`) — `apply` creates
    `fs.ensureAlias("install-backlog", <bundle>/backlog)` (relative target). Unconditional per bundle.
  - `src/core/operations/init-project.ts` — same for the always-shipped `bundles/bundle-template/` and for
    every template-pre-included bundle.
- **Build ships the link without double-including install-backlog.**
  - `src/core/operations/build.ts` `shippableFiles` records a per-bundle `bundles/<id>/backlog` directory
    entry as a non-traversed **leaf** (the symlink), exactly as it already does for scope-alias dirs — so
    `install-backlog/**` is enumerated once (real) and `backlog` appears once (the link). `build.ts` stays
    pure; the symlink effect is the FileSystem port/adapter's.
- **Adapters.**
  - `src/util/symlink.ts` — the Windows copy-fallback resolves a *relative* target against the link's
    parent dir (POSIX symlink semantics) so a relative alias copies the right tree (was latent: all prior
    callers passed absolute targets).
  - `src/adapters/memory-fs.ts` — store the raw alias target and resolve a relative target against the
    link's parent in `exists`, so the in-memory fake faithfully models a relative symlink (and `aliasTarget`
    reads like `readlinkSync`).
- **Docs / skill.** Remove the `ln -sfn install-backlog backlog` / `rm backlog` workaround and the
  TASK-102 caveats from the installer-builder skill; add one additive line to `docs/06-project-skeleton.md`.

## Tests (proof)

- Unit: `create-bundle` + `init` create the relative `backlog → install-backlog` alias per bundle (incl.
  `bundles/bundle-template/`).
- Integration (real adapter): `shippableFiles` over a real relative symlink records `backlog` as a leaf and
  `install-backlog/**` exactly once; `NodeFileSystem.ensureAlias` with a relative target yields a relative
  symlink (and the win32 copy fallback resolves it against the link parent).
- E2E (real `wpm` + real `backlog`): after `wpm init` + `wpm bundle new <id>`,
  `cd wip/bundles/<id> && backlog task create …` succeeds with no manual symlink and lands in
  `install-backlog/tasks/` (AC#1/#2); the built archive carries `bundles/<id>/backlog` (symlink) +
  `install-backlog/**` once, and the **extracted** archive resolves `backlog task list` (AC#3).

## Definition of Done

Type-clean, biome-clean (incl. the core import-boundary rule), tests added + green, public funcs documented,
no dead code, `build.ts` pure (symlink effects via the port/adapter).
