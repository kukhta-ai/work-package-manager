# Story cli-version — `project version` / `version bump` / `version set` (tasks 39 + 40 + 41)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" rows 142–144 (the three `project version` rows) + §"Derived
> artefacts stay current automatically" (line 34, "any command that changes a project mutates state then lets
> the lifecycle re-derive the front-door/orchestrator") + doc 08 (project release version is distinct from
> per-bundle versions) + doc 13 §4 (the version-constraint service holds the semver logic). Built on the
> just-merged `project targets` family pattern (the `projectModule` `CommandModule`; `runRead` for the read,
> `runMutation` for the mutations; `withExamples`; `.choices()`/`Option` for the enum; `COMPLETION_SPECS`).
> **This establishes the VERSION pattern** — `bundle <id> version` (a later task) reuses the bump/set operation
> shape and the `bumpSemVer` primitive verbatim.

## Acceptance criteria (verbatim from the backlog)

### TASK-39 — `project version` (a READ)
1. The command prints the value of `manifest.yml` project version to stdout.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
4. Help output is substantive (description, synopsis, an example) and documents the `bump` and `set` subcommands.

### TASK-40 — `project version bump <major|minor|patch>` (a MUTATION)
1. Given a level of `major`, `minor`, or `patch`, the command computes the next semver from the current
   `manifest.yml` project version, writes it back preserving comments, and prints the new version.
2. A missing or invalid level argument fails as a usage error with exit code 2 and changes nothing.
3. The derived `AGENTS.md` and installer skill are re-rendered to reflect any version-dependent content.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
5. Help output is substantive (description, synopsis, the level positional and its values, an example) and the
   level completes from `major`, `minor`, `patch`; on success exits 0.

### TASK-41 — `project version set <explicit>` (a MUTATION)
1. Given an explicit version that is valid semver, the command writes it to `manifest.yml` project version
   preserving comments and prints it.
2. A value that is not valid semver fails as a usage error with exit code 2 and changes nothing.
3. The derived `AGENTS.md` and installer skill are re-rendered.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
5. Help output is substantive (description, synopsis, the version positional, an example); on success exits 0.

## Story

As an installer author, I want to read and advance my project's release version from the CLI — `project version`
to see it, `project version bump <level>` to advance it by a semver level, and `project version set <explicit>`
to pin it — with comment-preserving writes that automatically keep the derived front-door/orchestrator current,
so that bumping a release is one safe, idempotent command and never a hand-edit of `manifest.yml`.

## Tasks / Subtasks

- [ ] Add `bumpSemVer` to the task-18 version-constraint service (AC: 40#1)
  - [ ] `export function bumpSemVer(current: SemVer, level: "major"|"minor"|"patch"): SemVer` — a thin, pure
        wrapper over `semver.inc(current, level)` (the `semver` lib is already imported here and is core-legal).
        `current` is already a branded `SemVer` (normalized), so `semver.inc` cannot return null for a valid
        level; assert/throw an internal error if it ever does, and brand the result `as SemVer`.
  - [ ] JSDoc it (doc 13 §4 — "the version-constraint service semver logic"). No new imports.
- [ ] Create `src/core/operations/version.ts` — the version operation specs (AC: 39, 40#1/#3, 41#1/#3)
  - [ ] `readVersionSpec(): ReadSpec<void, SemVer>` → `project (project) => project.manifest.meta.version`.
        Pure projection; the command prints it. (Mirrors `listTargetsSpec`.)
  - [ ] `bumpVersionSpec(): OperationSpec<{ level: "major"|"minor"|"patch" }>` — `summary` = the new version
        string; NO `check`; `apply` reads `manifest.yml`, computes `bumpSemVer(project.manifest.meta.version,
        level)`, writes it back via `editYaml(text, (doc) => doc.setIn(["project","version"], next))`, returns
        `{ changedPaths: [manifestPath] }`; NO `materialise` (project version bump does NOT materialise tasks —
        that is bundle version bump, a later task). The harness's ④ RERENDER re-renders the front-door
        automatically (AC 40#3).
  - [ ] `setVersionSpec(): OperationSpec<{ version: SemVer }>` — `summary` = the version; NO `check`; `apply`
        writes the (already-validated) version via the same `editYaml` `setIn`; returns `{ changedPaths }`. NO
        `materialise`. (Validation of `<explicit>` happens at the CLI boundary as a usage error — see below.)
  - [ ] Pure over the FileSystem port: import only `node:path` `join`, the model, `editYaml`, and the lifecycle
        types — never `commander`/`node:fs`. JSDoc each spec (doc 10 rows 142–144).
- [ ] Wire the `version` subcommand tree into `projectModule` in `src/cli.ts` (AC: 39, 40, 41 — all #2/#4/#5)
  - [ ] `const version = group.command("version")` with a `.description()` and an `.action()` that does the READ
        (bare `project version`): `requireProject` → `runRead(fs, {root}, readVersionSpec())` → print the version
        string + newline to stdout. A command WITH subcommands still runs its own `.action()` when invoked with
        no subcommand (commander), so this is the read path (AC 39#1/#2).
  - [ ] `version.command("bump")` `.argument("<level>", …)` — declare the level with `.addOption`? No: it is a
        POSITIONAL. Use `.argument("<level>", "the semver level to advance (major|minor|patch)")` AND constrain
        it via `.choices(["major","minor","patch"])` on the argument so a bad/missing value is a commander USAGE
        error (exit 2) changing nothing (AC 40#2). Reuse the `BUMP_LEVELS` constant from `completion/enums.ts`
        (do NOT hand-duplicate the array). Action: `requireProject` → `runMutation(lifecycleDepsFor(ctx,root),
        {root}, bumpVersionSpec(), {level})` → `formatResult` (so it prints the summary = new version + the
        changed-paths line). Note: commander `Argument.choices` requires constructing `new Argument(...)` (the
        `.argument(name, desc)` string form has no `.choices`); use `.addArgument(new Argument("<level>", desc)
        .choices([...BUMP_LEVELS]))`.
  - [ ] `version.command("set")` `.argument("<version>", "the explicit semver to set")`. Action: `requireProject`
        → validate `<version>` via `parseSemVer`; on failure throw `UsageError(problem.message)` (exit 2,
        changes nothing — AC 41#2; doc 13 §7: a bad CLI arg is usage exit 2, so a bad semver is surfaced as a
        UsageError, NOT a ValidationError). On success `runMutation(..., setVersionSpec(), {version})` →
        `formatResult`. (Validate BEFORE `requireProject`? No — keep order consistent with the family; but note
        a no-project + bad-semver case: the AC matrix only requires each independently. Validate AFTER
        requireProject is fine; the bad-arg exit-2 path is covered by a project being present.)
  - [ ] `withExamples` on each of `version`, `version bump`, `version set` (the completeness guard, task-28,
        requires a worked example on any command with own options/args; `bump`/`set` have positionals, so they
        MUST carry one. `version` (bare) has no own args/options but give it an example documenting bump/set per
        AC 39#4 for substance). Suggested: `wpm project version bump minor` / `wpm project version set 1.0.0` /
        `wpm project version`.
  - [ ] Reuse `formatResult` (already prints `summary` then `changed: N path(s)`); the new version IS the
        summary, so it lands on stdout (AC 40#1/41#1 "prints the new version").
- [ ] Add the completion declarations to `COMPLETION_SPECS` (AC: 40#5)
  - [ ] `"project version bump": { args: ["bump-levels"] }` — reuse the EXISTING `"bump-levels"` fixed-enum
        source (already registered in `defaultRegistry`; `completion/enums.ts` line 32). `set` takes a free
        explicit version → no source (omit, or `args: [undefined]`); `version` (bare read) → no positional.
- [ ] Tests — `test/unit/cli/version-commands.test.ts` (AC-driven, in-process `run()` + in-memory ports)
  - [ ] Mirror `targets-commands.test.ts`'s harness (collector/io/seed/deps; cwd `/elsewhere` + `-C /proj`).
        Seed a `/proj` manifest with `project.version: 1.2.3`, a target, a bundle, `installer-skills/`, an
        `.authoring-backlog` FakeBacklog root, and the minimal project-template snippets so the deriver resolves
        the front-door during ④ RERENDER.
  - [ ] 39: `project version` prints `1.2.3` to stdout, exits 0, manifest byte-unchanged (read-only); outside a
        project → exit 1 naming `manifest.yml`; `--help` substantive + mentions `bump`/`set`.
  - [ ] 40: `bump patch` → `1.2.4`, `bump minor` → `1.3.0`, `bump major` → `2.0.0`; the manifest on disk now
        carries the new version AND a seeded comment survives (task-13 comment preservation); the front-door was
        re-rendered (AGENTS.md exists/updated); a bad level (`bump sideways`) → exit 2 unchanged; a MISSING level
        (`bump`) → exit 2 unchanged; outside a project → exit 1; `<level>` completes from {major,minor,patch}
        via `completeArgv`; `--help` substantive.
  - [ ] 41: `set 2.5.0` → manifest version is `2.5.0`, comment survives, front-door re-rendered, prints `2.5.0`,
        exit 0; an invalid semver (`set not-a-version`) → exit 2 unchanged; a PARTIAL (`set 1.2`) → exit 2
        unchanged (parseSemVer rejects partials); outside a project → exit 1; `--help` substantive.
  - [ ] A unit test for `bumpSemVer` (major/minor/patch from a few bases incl. a 0.x).
  - [ ] (Plus) a real-binary integration case in `test/integration/` is a bonus: `wpm init` then `project
        version bump minor` exits 0 and the manifest shows the bumped version (guards the through-the-binary
        path; reuse `withTempDir` + `FakeBacklog` like `cli.bundle-new.test.ts`).
- [ ] `qa-generate-e2e-tests` pass over the three behaviours (acceptance-level end-to-end through `run()`).

## Dev Notes

### What exists — reuse, do not reinvent
- **The list-management/spine pattern is fully established** by the just-merged `project targets` family in
  `src/cli.ts` `projectModule` (lines ~479–537) and `src/core/operations/targets.ts`. Copy its shape exactly:
  `requireProject(ctx, parent)` for the no-project error; `runRead`/`runMutation`; `lifecycleDepsFor(ctx,root)`
  for the mutation deps; `formatResult` for output; `withExamples` for the example block. [Source: src/cli.ts]
- **Comment-preserving write** is `editYaml(text, (doc) => doc.setIn(["project","version"], next))` — the JSDoc
  on `editYaml` literally uses `setIn(["project","version"], "0.2.0")` as its example. [Source: src/util/yaml.ts#editYaml]
- **Semver parse/validate** is `parseSemVer` (rejects partials like `"1.2"`; returns a branded `SemVer`).
  [Source: src/core/model/version.ts#parseSemVer]. **Bump does NOT exist yet** — add `bumpSemVer` to
  `src/core/services/version-constraint.ts` (task-18, doc 13 §4 is where semver logic lives). `semver.inc` is
  the primitive; `semver` is already imported there and is core-legal (a pure lib). [Source: docs/13 §4]
- **The bump-levels enum + completion source already exist:** `BUMP_LEVELS = ["major","minor","patch"]` and the
  `"bump-levels"` fixed-enum source registered in the default registry. Reference both by name; do not
  duplicate the array. [Source: src/completion/enums.ts; src/completion/registry.ts]
- **The model** exposes the value at `project.manifest.meta.version` (a `SemVer`). [Source: src/core/model/manifest.ts#ProjectMeta]

### Exit-code discipline (doc 13 §7 — load-bearing)
- A **bad CLI argument is usage exit 2** (`UsageError`), NOT exit 1. For `bump`, commander's
  `Argument.choices([...BUMP_LEVELS])` makes a bad value AND a missing required positional a usage error (exit
  2) for free — no hand-rolled check. For `set`, a non-semver `<explicit>` must be surfaced as a `UsageError`
  (exit 2), so call `parseSemVer` at the CLI boundary and throw `UsageError(problem.message)` on `!ok` — do NOT
  use `ValidationError` (that maps to exit 1). [Source: src/core/errors.ts#exitCodeFor; docs/13 §7]
- `requireProject` throws the canonical `NotFoundError` (exit 1) with the `manifest.yml`/`init`/`-C` message —
  this is the no-project AC for all three (39#3, 40#4, 41#4). [Source: src/cli.ts#requireProject / NO_PROJECT_MESSAGE]

### ④ RERENDER is automatic — do NOT arrange it (doc 13 §5/§34)
- `runMutation` re-derives the front-door + orchestrator from the post-apply project automatically. The bump/set
  `apply` only writes `manifest.yml`; the harness handles AC 40#3 / 41#3 ("AGENTS.md + installer skill
  re-rendered"). The operation must NOT call the deriver itself. This is the "derived artefacts stay current
  automatically" guarantee (doc 10 line 34). [Source: src/core/operations/lifecycle.ts#runMutation]
- No `materialise` for project version (explicitly per the task note — that is *bundle* version, later). Returning
  no `materialise` ⇒ the harness materialises nothing; `materialisedTaskTitles` stays empty.

### `version` is a command WITH subcommands AND its own action
- commander runs `version`'s `.action()` when invoked as bare `project version` (no subcommand), and dispatches
  to `bump`/`set` when those are present. So attach the READ action to `version` itself. Its `--help` will list
  `bump`/`set` under "Commands:" automatically (AC 39#4), and commander auto-lists subcommands.
- `Argument.choices` caveat: the `.argument("<name>", "desc")` string form returns the Command (no `.choices`).
  To constrain the positional use `import { Argument } from "commander"` and
  `.addArgument(new Argument("<level>", "desc").choices([...BUMP_LEVELS]))`. The `Option` import is already
  present; add `Argument` to the existing commander import.

### Files
- NEW: `src/core/operations/version.ts` (the three specs), `test/unit/cli/version-commands.test.ts`.
- UPDATE: `src/core/services/version-constraint.ts` (+`bumpSemVer`), `src/cli.ts` (wire `version` tree into
  `projectModule`, add `Argument` import, add `version` entries to `COMPLETION_SPECS`).
- Optional: a `test/integration/` real-binary case.
- Do NOT touch: `docs/`, repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/`, `templates/`, the dev `backlog/`.

### Project Structure Notes
- The version operation lives in `src/core/operations/` (the use-case tier), pure over ports, exactly like
  `targets.ts`. The CLI wiring is the only place commander/effects appear. The core import-boundary rule
  (nothing under `src/core/` imports commander/execa/node:fs) holds: `version.ts` imports only `node:path`, the
  model, `editYaml`, and lifecycle types; `bumpSemVer` adds no import (semver already present).

### Testing standards summary
- In-process `run()` + in-memory `MemoryFileSystem`/`FakeBacklog`/`FakeEnvironment`/`FixedClock`; assert exit
  codes + stdout/stderr + on-disk manifest state. The FakeBacklog must be init'd at `<proj>/.authoring-backlog`
  (the just-merged lifecycle fix materialises there — though version bump/set materialise nothing, ④ RERENDER
  still runs and the harness lists no tasks; init the authoring root anyway for fidelity). Comment-preservation
  is asserted by seeding a `# comment` line in the manifest and checking it survives the bump/set. [Source:
  test/unit/cli/targets-commands.test.ts; src/util/yaml.ts]

### References
- [Source: docs/10 §"Per-command actions" rows 142–144 — `project version` / `version bump <major|minor|patch>` / `version set <explicit>`]
- [Source: docs/10 line 34 — "derived artefacts stay current automatically"]
- [Source: docs/13 §4 — version-constraint service (semver logic)]; [Source: docs/13 §5/§7 — lifecycle + exit codes]
- [Source: docs/08 — project release version vs per-bundle versions]
- [Source: src/cli.ts#projectModule — the targets family pattern]; [Source: src/core/operations/targets.ts]
- [Source: src/util/yaml.ts#editYaml]; [Source: src/core/model/version.ts#parseSemVer]; [Source: src/completion/enums.ts#BUMP_LEVELS]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

### Completion Notes List

### File List
