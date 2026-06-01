# Story cli-project-reads — `project show` / `project root` / `project validate` (tasks 37 + 49 + 48)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" rows 140 (`project show [--json]`), 149 (`project root`), 148
> (`project validate`) + §"Project context resolution" (line 195, walk-up-for-manifest.yml honoring `-C`; line
> 204, `project root` "prints just the path for shell composition `cd "$(wpm project root)/…"`"). Built on the
> Group-A template-list/show READ pattern + the targets/version `projectModule` `CommandModule`. **All three are
> READS** (`runRead`, no mutation, no lifecycle ④/⑤). `project validate` backs the EXISTING task-20
> **`validateProject`** service (`src/core/services/validate.ts`, doc 13 §4) — no new validation logic.

## Acceptance criteria (verbatim from the backlog)

### TASK-37 — `project show [--json]` (a READ)
1. The command prints the project name, version, description, resolved root path, target agents, and the enabled
   bundles each with the version read from its `bundle.yml`.
2. With `--json` the same orientation is emitted as machine-readable JSON.
3. The command reads and reports only, with no change on disk, and exits 0 on success.
4. Run outside any project it exits non-zero with one message naming the missing `manifest.yml` and suggesting
   `init` or the `-C` override; a `-C` path is honoured.
5. Help output is substantive (description, synopsis, the `--json` flag, an example).

### TASK-49 — `project root` (a READ)
1. The command resolves the project root by walking up from the working directory for `manifest.yml` and prints
   the path on a single line with no padding, composable in a shell substitution.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
4. Help output is substantive (description, synopsis, an example).

### TASK-48 — `project validate` (a READ; reports, no side effects)
1. The command reports a pass when every bundle requires-constraint resolves against the depended-upon bundle
   declared version, the requires graph has no cycle, `targets` is non-empty, `project.version` is valid semver,
   and every bundle directory except `bundle-template` is listed in the manifest with no orphans.
2. Each distinct problem is reported as a separate human-readable finding naming the offending location, and ALL
   discoverable problems are reported in a single pass rather than only the first.
3. The command has no side effects: it reads and reports, changing nothing.
4. The command exits 0 when the project is coherent and non-zero when any finding is reported.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
6. Help output is substantive (description, synopsis, an example).

## Story

As an agent (or author) orienting in a project, I want `project show` to print the project's identity + enabled
bundles with versions (or `--json` for tooling), `project root` to print just the resolved root path for shell
composition, and `project validate` to report every coherence problem in one pass with a non-zero exit on any
finding — so I can orient, script, and pre-flight a project without hand-reading `manifest.yml`.

## Tasks / Subtasks

- [ ] Create `src/core/operations/project-reads.ts` — the three read projections (AC: 37#1/#2, 48#1/#2)
  - [ ] `interface ProjectOrientation` — the pure orientation value: `{ name, version, description?, root,
        targets: string[], bundles: { id, version, summary }[] }`. All strings (versions stringified from the
        branded `SemVer`).
  - [ ] `showProjectSpec(): ReadSpec<void, ProjectOrientation>` — `project (p) => ({...})`: name/version/
        description from `p.manifest.meta`, `root: p.rootPath`, `targets: [...p.manifest.targets]`, and `bundles`
        from `p.bundles` (each enabled bundle's `id`+`version`+`summary` — the Project already loaded every
        `bundle.yml`, so the version is read; AC 37#1). Order bundles by `p.manifest.bundles` (manifest order).
  - [ ] `validateProjectSpec(): ReadSpec<readonly string[], ValidationReport>` — input = the bundle directory
        names; `project (p, dirNames) => validateProject(p, dirNames)`. The bundle dir names are read by the CLI
        (via the fs port) and threaded as the read INPUT, so the projection stays pure and `validateProject`
        (task-20) does the work unchanged. (`project root` needs NO spec — it is `requireProject` + print.)
  - [ ] Pure over no effects (projections only): import the model, `validateProject`, and the lifecycle
        `ReadSpec` type. JSDoc each. NEVER `commander`/`node:fs`.
- [ ] Wire the three leaves into `projectModule` in `src/cli.ts` (AC: all)
  - [ ] **`project show [--json]`**: `.option("--json", …)`; action → `requireProject` → `runRead(fs, {root},
        showProjectSpec())` → if `--json` print `JSON.stringify(orientation, null, 2)` + newline, else print a
        formatted text block (name / version / description / root / targets / bundles each "  <id> <version> —
        <summary>"). Read-only (AC 37#3). `withExamples`.
  - [ ] **`project root`**: action → `const root = requireProject(ctx, parent)` → `ctx.io.out.write(root + "\n")`
        — a SINGLE line, the path only, no decoration, so `$(wpm project root)` composes (AC 49#1; doc 10:204).
        Use `runRead(fs, {root}, { summary, project: (p)=>p.rootPath }, undefined)` for symmetry, OR just print
        `root` directly (it is already resolved + read-only). Prefer the direct print (no manifest re-load needed
        for the path); keep it read-only. `withExamples`.
  - [ ] **`project validate`**: action → `requireProject` → list `<root>/bundles/` via `ctx.deps.fs.list` filtered
        to `kind === "directory"` (guard: if `bundles/` does not exist, names = `[]`) → `runRead(fs, {root},
        validateProjectSpec(), dirNames)` → print findings; **set the exit code from the result**: if
        `report.ok` print a pass line + exit 0; else print each `problem.message` on its own line (the offending
        location is in the message + field) and EXIT 1 (AC 48#4). This is NOT a thrown DomainError — it is a read
        that reports + the CLI decides the code; throw a `NotFoundError`? No — use a dedicated exit path: the
        action returns normally for a pass, and for findings it must cause exit 1. The cleanest: throw a
        `ValidationError` carrying the joined findings (maps to exit 1 via `exitCodeFor`) AFTER printing them to
        stdout — OR print to stderr and let the handler exit 1. DECISION: print findings to STDOUT (they are the
        command's output), then throw a `ValidationError` with a terse summary ("project validation failed: N
        finding(s)") so the existing error handler maps it to exit 1 without a stack (domain error). The
        per-finding lines are already on stdout; the error line is the summary. `withExamples`.
  - [ ] No `COMPLETION_SPECS` entries: `show` has only the `--json` boolean flag (no value), `root`/`validate`
        have no args — nothing to complete.
- [ ] Tests — `test/unit/cli/project-reads-commands.test.ts` (AC-driven, in-process `run()` + in-memory ports)
  - [ ] Mirror `targets-commands.test.ts`'s harness (collector/io/seed/deps; cwd `/elsewhere` + `-C /proj`). Seed
        a `/proj` with name/version/description, two targets, two enabled bundles each with its own `bundle.yml`
        (distinct versions + summaries), `installer-skills/`, the minimal project-template snippets, and an
        `.authoring-backlog` FakeBacklog root (reads don't materialise, but keep fidelity).
  - [ ] **37 show:** prints name, version, description, root path, both targets, and BOTH bundles WITH their
        bundle.yml versions; `--json` parses as valid JSON with the same fields (assert `JSON.parse` then check
        `.bundles[].version`); read-only (manifest byte-unchanged), exit 0; no-project → exit 1 naming
        manifest.yml; `-C` honoured (run from `/elsewhere` with `-C /proj` succeeds); `--help` shows `--json` +
        an example.
  - [ ] **49 root:** prints exactly `/proj\n` (single line, no padding) with `-C /proj`; the printed value equals
        the resolved root and has no leading/trailing decoration (assert `out.text === "/proj\n"`); read-only;
        no-project → exit 1; `--help` substantive.
  - [ ] **48 validate:** a COHERENT project → exit 0 + a pass line, changes nothing. An INCOHERENT project with
        MULTIPLE problems in ONE fixture — an orphan bundle dir (a `bundles/stray/` with no manifest entry) +
        a bad requires-constraint (bundle A requires B@^2 but B is 1.0.0) + empty targets — reports ALL THREE
        findings (assert each distinct message present) and exits 1; the manifest/disk is unchanged (no side
        effects, AC 48#3). no-project → exit 1; `--help` substantive.
  - [ ] (Plus) a real-binary integration case in `test/integration/` is a bonus: `wpm init` then `project show`
        / `project root` / `project validate` on the real minimal project (a freshly-init'd project has empty
        targets, so `validate` will FIND "no target agents declared" → exit 1; assert that finding + exit 1, OR
        add a target first then assert validate passes). Reuse `withTempDir` + `FakeBacklog`.
- [ ] `qa-generate-e2e-tests` pass over the three behaviours (acceptance-level end-to-end through `run()`).

## Dev Notes

### What exists — reuse, do not reinvent
- **`validateProject(project, bundleDirectoryNames)` already exists** (task-20, `src/core/services/validate.ts`)
  and AGGREGATES all problems (no fail-fast) — exactly AC 48#2's "all in one pass". It checks: requires
  constraints resolve, no cycles, targets non-empty, no orphan dirs (except `bundle-template/`). Semver validity
  is guaranteed by the branded model, so it is not re-checked (a project that loaded HAS a valid `project.version`
  — AC 48#1's semver clause holds by construction). Do NOT add validation logic; pass the bundle dir names.
  [Source: src/core/services/validate.ts#validateProject]
- **DIVERGENCE (record in --notes):** doc 10 row 148 step 5 also lists "scope-alias symlinks well-formed (no
  bare `skills/`)", but the task-20 service DELIBERATELY omits that (its JSDoc: "not part of doc 13 §4's list").
  AC 48#1 does NOT list scope-alias either — it enumerates exactly the service's checks. So conform to the
  service this command backs; the scope-alias well-formedness check is a fuller-vision item outside task-20.
  [Source: src/core/services/validate.ts JSDoc; docs/10:148; backlog task-48 AC#1]
- **The read pattern** is `runRead(ctx.deps.fs, { root }, spec, input)` → `{ value }`, exactly as `project
  targets list` / `project version` use it. `requireProject(ctx, parent)` gives the resolved root or throws the
  canonical no-project `NotFoundError` (exit 1, the manifest.yml/init/-C message; honours `-C`). [Source: src/cli.ts]
- **The Project already carries everything `show` needs:** `p.rootPath`, `p.manifest.meta` (name/version/
  description/targets), and `p.bundles` (every enabled bundle's parsed `BundleManifest` with `version`+`summary`).
  No extra reads. [Source: src/core/model/project.ts; src/core/model/bundle.ts]
- **`fs.list(path)` returns `DirEntry[]`** (`{ name, kind }`); filter `kind === "directory"` for the bundle dir
  names. Guard a missing `bundles/` (an init'd project with no bundles has none) → `[]`. [Source: src/core/ports/filesystem.ts]

### Exit-code discipline (doc 13 §7)
- `project show`/`root` on success → exit 0. Outside a project → `requireProject` throws `NotFoundError` → exit 1
  (AC 37#4 / 49#3 / 48#5). [Source: src/core/errors.ts#exitCodeFor]
- `project validate` is the one with a result-driven exit: a coherent project exits 0; ANY finding → exit 1
  (AC 48#4). The findings are the command's OUTPUT (print to stdout), and the exit-1 is achieved by throwing a
  `ValidationError` (category `validation` → exit 1 via `exitCodeFor`) with a terse summary AFTER printing the
  per-finding lines — so the existing error handler sets the code with no stack (it is a clean domain error). Do
  NOT call `process.exit`; the handler owns the code. [Source: src/core/errors.ts; src/util/exit.ts]

### `--json` (AC 37#2)
- `JSON.stringify(orientation, null, 2)` of the SAME `ProjectOrientation` value the text path formats — one
  projection, two renderings (text vs JSON), so they can never disagree. Print to stdout + a trailing newline.

### Files
- NEW: `src/core/operations/project-reads.ts`, `test/unit/cli/project-reads-commands.test.ts`.
- UPDATE: `src/cli.ts` (wire `show`/`root`/`validate` into `projectModule`; import `validateProject` if needed
  — actually import the new specs; add the `ProjectOrientation` formatting helpers in the shell).
- Optional: a `test/integration/cli.project-reads.test.ts` real-binary case.
- Do NOT touch: `docs/`, repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/`, `templates/`, the dev `backlog/`.

### Project Structure Notes
- The read projections live in `src/core/operations/` (pure, over no effects), like `targets.ts`/`version.ts`.
  Output formatting (orientation text/JSON, the root line, the validate findings) lives ONLY in the CLI shell
  (output is not a port — doc 13 §3). The core import-boundary rule holds: `project-reads.ts` imports only the
  model, `validateProject`, and the `ReadSpec` type.
- `project root` is the one leaf that may skip a spec entirely (it is just the resolved path + print); that is
  fine — it is still read-only and project-bound.

### Testing standards summary
- In-process `run()` + `MemoryFileSystem`/`FakeBacklog`/`FakeEnvironment`/`FixedClock`; assert exit codes +
  stdout (orientation/JSON/root/findings) + that the manifest on disk is byte-unchanged (read-only/no-side-
  effects). For `validate`'s multi-finding case, seed ONE incoherent project and assert every distinct finding
  is present AND exit is 1. The `--json` assert uses `JSON.parse`. [Source: test/unit/cli/targets-commands.test.ts;
  test/unit/services/validate.test.ts]

### References
- [Source: docs/10 §"Per-command actions" rows 140 / 148 / 149]
- [Source: docs/10 §"Project context resolution" line 195 (walk-up + `-C`) and line 204 (`project root` composable)]
- [Source: docs/13 §4 — the validate service]; [Source: docs/13 §7 — exit codes]; [Source: docs/13 §8 — the read trace]
- [Source: src/core/services/validate.ts#validateProject]; [Source: src/cli.ts#projectModule / requireProject]
- [Source: src/core/operations/lifecycle.ts#runRead / ReadSpec]; [Source: src/core/model/project.ts; bundle.ts; manifest.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

### Completion Notes List

### File List
