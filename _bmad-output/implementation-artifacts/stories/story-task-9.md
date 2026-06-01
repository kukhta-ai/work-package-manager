# Story task-9 — Configure the builder's own dogfood backlog and agent front door

> Lean implementation spec (BMAD create-story output). **Verify-then-ratify-then-document** — the backlog
> and DoD already exist from the Step-0 bootstrap; the real deliverable is making them discoverable via a
> new `CONTRIBUTING.md` section. Grounded in `docs/12` §"Dogfooding: the builder uses Backlog.md too". No
> code change; no edits under `backlog/` or to `AGENTS.md`/`CLAUDE.md`.

## Acceptance criteria (the contract)
1. The builder's own development work is tracked in a Backlog.md backlog inside the repository (doc 12).
2. Every task in that backlog is gated by a shared, project-level Definition of Done.

## Verification (read-only via the `backlog` CLI — already satisfied)
- **AC#1** — `backlog task list --plain` shows the in-repo `backlog/` root tracking all **33** foundation
  stories (tasks 1–8 Done, task-9 In Progress, 10–33 To Do). ✓ Satisfied; do NOT rebuild.
- **AC#2** — `backlog config get definitionOfDone` returns the 3 project-level DoD items, and
  `backlog task 1 --plain` shows them as that task's Definition of Done (ticked, since Done). The 3 items
  (quote verbatim in the doc):
  1. `Typechecks clean (tsc --noEmit) and Biome clean (biome ci)`
  2. `Tests added and green (vitest): unit for pure logic, integration where it touches ports`
  3. `Public functions documented; no dead code; the core import-boundary rule is not violated`
  ✓ Satisfied; do NOT hand-edit `backlog/config.yml`.

## Deliverable
Append `## Tracking work — the dogfood backlog` to `CONTRIBUTING.md` after the task-4
`## Versioning & releases` section (ends ~line 263; don't reflow earlier sections). Same header style/tone
as existing sections; cross-link where natural. Content (citing doc 12 §Dogfooding):
- **Dogfooding:** all dev work is tracked as tasks in the in-repo `backlog/` root (AC#1); it's the same
  Backlog.md the builder shells out to — using the tool on itself surfaces real UX and documents project
  history as durable task records (doc 12 §Dogfooding).
- **CLI-only operation:** never hand-edit files under `backlog/` (task files / `config.yml` / sequences /
  indexes are CLI-managed; hand-editing corrupts the index). List the everyday commands
  (`backlog task list --plain`, `backlog task <id> --plain`, `backlog sequence list`,
  `backlog task edit <id> -s "In Progress"`, `--check-ac <n>` / `--check-dod <n>`, `-s "Done"`). Mirrors
  AGENTS.md's hard rule.
- **Status lifecycle + DoD gate (AC#2):** To Do → In Progress → Done; a task is gated by the shared,
  project-level DoD — quote the 3 items, note they're configured once in `backlog/config.yml`
  (`definitionOfDone`) so EVERY task carries them, and that Done requires AC **and** DoD observably
  satisfied + ticked.
- **Front-door pointer:** the agent front door for working on the builder is `AGENTS.md` (+ its `CLAUDE.md`
  symlink) — the BMAD-based SDLC — and this section is the quick reference it relies on. (Reference only;
  do NOT edit AGENTS.md/CLAUDE.md — human-owned.)

## Gate / DoD (doc task)
- No code change → `tsc --noEmit` / `biome check .` / `vitest run` stay green (confirm; pre-commit hook
  also runs). No brittle markdown tests. Prose consistent with existing CONTRIBUTING sections.

## Boundaries (do NOT do here)
- No edits under `backlog/` (a hook forbids it; verify read-only only). No edits to `AGENTS.md`/`CLAUDE.md`,
  `docs/`, `.bmad/`. No code. Don't reflow the task-2/3/4 sections.
