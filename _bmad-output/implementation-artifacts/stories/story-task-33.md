# Story task-33 — Walking skeleton: one vertical slice through every layer

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" → the `init` row (the 12-step definition) + doc 13 §5 (operations
> tier) + §7 (context resolution runs before project-BOUND ops; init is project-CREATING, the BOOTSTRAP) +
> doc 06/07 (the project the minimal template produces), against the task-30 minimal template
> (`templates/project/minimal/`), the task-26 `makeArtefactDeriver` + task-19 `deriveArtefacts` (the single
> source for the front-door + orchestrator), the task-27 composition root `src/cli.ts`, and task-24
> `resolveContext`). This is the FOUNDATION-COMPLETE culmination: one real `wpm init <name>` drives a real
> change on disk through every layer (command surface → operation → file system), observed in a real working
> directory — the checkpoint before the per-command work (tasks 34–84).

## Story
As the foundation of the `wpm` builder, I need ONE real command-line invocation — `wpm init <name>` — to drive
a real change on disk through every layer: the commander command surface, an operation, the FileSystem port
(and, optionally, the BacklogMd port), producing a working project from the minimal template in a REAL working
directory. Passing this is the "foundation complete" demonstration that the hexagon composes end-to-end, before
the per-command leaves (tasks 34–84) are filled in.

## Acceptance criteria (the contract — verbatim from the backlog)
1. A single command-line invocation drives a real change on disk through every layer — from the command
   surface, through context resolution and an operation, down to the file system — observed in a real working
   directory.
2. The exercised slice is the smallest meaningful one (for example, producing a project from the minimal
   template and confirming the files exist), not a complete command.
3. Passing this demonstrates the layers compose end to end, and it is recorded as the 'foundation complete'
   checkpoint before per-command work begins.

## How each AC element is satisfied (read first)
- **AC#1 "every layer … observed in a real working directory":** the integration test runs `run(["init",
  "<name>", "--at", <tmpdir>], realDeps, io)` with a REAL `NodeFileSystem` (and a built-binary variant via
  `execFileSync`), then asserts the produced files exist ON REAL DISK. The slice touches: the **command
  surface** (commander `init <name>` leaf, task-27 `CommandModule`), the **operation** (`initProject` in
  `src/core/operations/`), the **services** (task-17 `resolveTemplate`, task-16 `renderTree`, task-19/26
  `deriveArtefacts`/`makeArtefactDeriver`), and the **FileSystem port** (+ optionally **BacklogMd**). Note on
  "context resolution": the AC names it, but init is the BOOTSTRAP — it CREATES context rather than resolving
  an existing project (see below). The command's target-dir resolution (`--at`/cwd via the **Environment
  port**) is init's analogue of context resolution; the test exercises both `--at` and the default-cwd path.
- **AC#2 "smallest meaningful slice, not a complete command":** the operation implements doc-10 init's steps
  **1–4 + 8 only** (resolve template, refuse-if-exists, copy `files/` with substitution, render the derived
  artefacts from snippets) — it produces a working project and confirms its files exist. It deliberately does
  NOT implement the full init (steps 5–7, 9–12: `bundles/` scaffold, scope aliases, authoring-task
  materialisation, `.gitignore`) — those are the COMPLETE `init` command, a later task. The test asserts the
  slice is minimal (e.g. NO `bundles/` directory is produced).
- **AC#3 "foundation complete checkpoint":** recorded in the story Completion Notes + the final report as the
  end of the foundation epic — the hexagon (commands → operation → services → ports → real fs) is proven to
  compose end-to-end before tasks 34–84 fill the command leaves. (The orchestrator records it in the SDLC
  state; this story does not touch `.bmad/`.)

## init is the BOOTSTRAP — NOT `runMutation`/`resolveContext` (doc 13 §5/§7)
doc 13 §7: context resolution "is a service used before any project-**bound** operation." doc 10 (line 17)
classifies `init` as **project-creating**, distinct from project-bound. So `initProject`:
- does NOT call `resolveContext` to find an existing project (there is none — it is creating one);
- does NOT go through the task-25 `runMutation` six-beat lifecycle (which begins ① LOAD an existing Project
  projection). init has no project to load; it builds one from a template.
It is its own small operation: `(targetDir, projectName, ports) → OperationResult`. It still returns the
standard {@link OperationResult} (`summary`/`changedPaths`/`materialisedTaskTitles`) so the command layer
formats it uniformly, and it still raises typed task-23 `DomainError`s (a `ConflictError` if the target
exists). This is exactly doc 13 §5's note that operations compose services + ports and return a result — init
is the one that bootstraps rather than mutates.

## The minimal `init` slice — doc-10 init steps 1–4 + 8 (cite the row)
doc 10's `init` row (steps numbered):
1. **Resolve template** (default builtin `minimal`) → task-17 `resolveTemplate("minimal", "project", {fs,
   builtinTemplatesRoot})`. Not found → `NotFoundError`.
2. **Refuse if target path exists** → if `fs.exists(targetDir)` (and it is non-empty / the manifest exists),
   raise `ConflictError` (doc 10 step 2: "Refuse if target path exists").
3. **Copy template `files/` with `{{placeholder}}` substitution** → `renderTree(template.files, params)` with
   `params = { "project-name": name }`, write each to `join(targetDir, file.path)`. For `minimal` this yields
   `manifest.yml` (name from the positional; `targets:`/`bundles:` empty), `README.md`, `RALPH-LOOP.md`, and
   the orchestrator's `references/journaling.md` (a static reference — see the forward-note resolution). (Step
   4's "instantiate manifest.yml from the snippet" is satisfied here: the minimal template's `manifest.yml.tmpl`
   IS in `files/`, substituted; `targets`/`bundles` are empty as the template ships them.)
4. **Render `AGENTS.md` + `<name>-installer/SKILL.md` from snippets** (doc 10 step 8) → call the task-26
   `makeArtefactDeriver({fs, builtinTemplatesRoot, projectTemplatesRoot: join(targetDir,"templates"),
   projectTemplateName:"minimal"})`, build a minimal `Project` projection (rootPath=targetDir, manifest with
   name + empty targets/bundles, empty bundles map), call the deriver to get `DesiredArtefacts.files`
   (`[frontDoor, orchestrator]`, paths already substituted: `AGENTS.md` and `installer-skills/<name>-installer/
   SKILL.md`), and write each to `join(targetDir, file.path)`. **This is the SINGLE SOURCE for the two derived
   artefacts** (resolving the task-30 forward-note below).
- **Deferred to the full `init` command (tasks 34–84), NOT in this slice:** steps 5 (`bundles/` +
  `bundle-template/`), 6 (`installer-skills/`/`templates/` empty dirs + `.authoring-backlog/` — but SEE the
  decision below), 7 (scope aliases), 9–10 (authoring-task materialisation), 11 (`.gitignore`). State this in
  the operation's docstring and the report.

### DECISION — exercise the BacklogMd port too? (state it)
The brief permits initialising the empty `.authoring-backlog/` Backlog.md root via the **BacklogMd port** to
make the skeleton exercise BOTH ports (a stronger "every layer"). doc 13 §3 confirms init legitimately uses
BacklogMd ("initialise each backlog root with the right task-prefix"). **RECOMMENDATION: include a minimal
`backlog.init(join(targetDir, ".authoring-backlog"), { taskPrefix: "authoring" })`** so the walking skeleton
threads the FileSystem AND BacklogMd ports — that is the most faithful "through every layer" demonstration. BUT:
- the real `BacklogCli` shells out to `backlog`, so the real-fs/real-binary E2E gains a real-backlog dependency
  → ISOLATE it (per-tmpdir HOME/XDG, the task-31 flakiness lesson) and gate it on `backlog` being available
  (skip, don't fail, when absent — mirror `backlog-cli.test.ts`'s `describeIfBacklog`);
- the FileSystem assertions stay the LOAD-BEARING ones (they always run). The BacklogMd step is additive.
- If including it complicates the gate, the operation can take the backlog step behind an explicit flag or the
  command can pass a fake in unit tests + the real adapter in the binary test. PICK the cleanest shape and
  STATE included-vs-deferred. (A clean option: the operation always calls `backlog.init` on the injected port;
  unit tests inject `FakeBacklog`; the real-fs test injects `BacklogCli` and is `describeIfBacklog`-gated +
  HOME/XDG-isolated.)

## RESOLVE the task-30 forward-note (do it HERE — the single-source collapse)
**The hazard (recorded in the SDLC state by task-30):** the front-door `AGENTS.md` and the orchestrator
`SKILL.md` are the two DERIVED artefacts and currently live in BOTH `templates/project/minimal/files/`
(`AGENTS.md.tmpl` + `installer-skills/{{project-name}}-installer/SKILL.md.tmpl`, copied wholesale at init) AND
`snippets/` (re-rendered by the deriver every mutation), byte-identical — a drift hazard a drift-guard test
currently pins. doc 10 init **step 8 renders them from snippets**, so the copies in `files/` are redundant.

**The fix (single source):**
1. **REMOVE** `templates/project/minimal/files/AGENTS.md.tmpl` and
   `templates/project/minimal/files/installer-skills/{{project-name}}-installer/SKILL.md.tmpl`. init now renders
   both from `snippets/` via the deriver (step 4 above) — one source.
2. **KEEP** `templates/project/minimal/files/installer-skills/{{project-name}}-installer/references/
   journaling.md.tmpl` (a STATIC reference under the orchestrator, copied not derived). **VERIFY** it still
   copies: task-17 `readTree` walks `files/` recursively, so the `installer-skills/{{project-name}}-installer/
   references/` subtree still yields `journaling.md` even though its sibling `SKILL.md.tmpl` is gone (the dir is
   no longer "orphaned" — `renderTree` substitutes `{{project-name}}` in the PATH, producing
   `installer-skills/<name>-installer/references/journaling.md`). CONFIRM with the test + a real-fs assertion.
3. **UPDATE `test/unit/templates/minimal-project.test.ts`:**
   - `instantiate()` must NO LONGER expect `AGENTS.md` / the orchestrator `SKILL.md` in the copied `files/` —
     they are now produced by rendering the SNIPPETS. Adjust the AC#1/AC#2 cases to render the front-door +
     orchestrator from `snippets/` (the test already has the "loop closure" case that renders via
     `makeArtefactDeriver` — lean on that, and have the file-existence/content checks for `AGENTS.md` /
     `SKILL.md` use the deriver-rendered output, not `instantiate`'s copied files). The `references/
     journaling.md` IS still copied via `files/`, so keep asserting it lands from `instantiate()`.
   - **REMOVE the drift-guard test** (`"drift-guard — files/ copies of the derived artefacts stay
     byte-identical to their snippets/ source"`, ~lines 223–236) — there is now ONE source, so it is obsolete.
   - Keep the "loop closure" + the snippet-stub (advisor/installer-skill/payload) cases as-is.
4. The task-31 `default-bundle.test.ts` and `minimal-project.acceptance.test.ts` may reference the template —
   re-run the full suite to confirm no other test depended on `files/AGENTS.md.tmpl` existing. (The task-26
   `makeArtefactDeriver` reads SNIPPETS, not `files/`, so it is unaffected.)

> NET after this: `templates/project/minimal/files/` = `manifest.yml.tmpl`, `README.md.tmpl`,
> `RALPH-LOOP.md.tmpl`, `installer-skills/{{project-name}}-installer/references/journaling.md.tmpl`. The
> front-door + orchestrator live ONLY in `snippets/`. init copies `files/` AND renders the two snippets — every
> artefact has exactly one source.

## Wire `init` through the REAL composition root (task-27)
Convert the `init` `groupOnly` placeholder in `src/cli.ts` into a real `init <name>` `CommandModule`:
- `.argument("<name>", "the new project's name (kebab-case; becomes the manifest name + the installer-skill
  name)")` — doc 10's positional, WITH a help meaning (task-28).
- `.option("--at <path>", "create the project at <path> (default: the current directory)")` — doc 10's `--at`.
  (Defer `--template`/`--list-templates`/`--param` to the full init — the slice is `minimal`-only; STATE it.)
- A worked example via `withExamples` (task-28 — the completeness guard REQUIRES an example for a command with
  options/args): e.g. `wpm init hermes-handoff --at ./my-installer`.
- Completion (task-29): add `"init": { args: [undefined] }` to `COMPLETION_SPECS` (a new project name has no
  suggestions; flags still complete). VERIFY the task-29 completion tests still pass (the tree gained a leaf).
- **Action:** resolve the target dir = `opts.at` (resolved against cwd via the Environment port) ?? cwd; call
  `initProject({ fs, backlog }, { targetDir, name })`; `ctx.io.out.write(formatResult(result))`. init does NOT
  resolve a project (it creates one) — so NO `resolveContext` not-found branch. Reuse the existing
  `formatResult` helper.
- The task-28 help completeness guard will now see `init` with options/args → it MUST carry the example (it
  does). Re-run `help-contract.test.ts`.

## Files to add / change
- **ADD** `src/core/operations/init-project.ts` — the `initProject` operation (the BOOTSTRAP) + its input type.
  Pure over the FileSystem (+ BacklogMd) ports; imports only services/model/ports — never `node:fs`/`commander`/
  `omelette`. Documented; raises typed `DomainError`s.
- **CHANGE** `src/cli.ts` — convert the `init` `groupOnly` into a real `init <name>` `CommandModule` (argument,
  `--at`, `withExamples`, action calling `initProject`); add `"init"` to `COMPLETION_SPECS`.
- **REMOVE** `templates/project/minimal/files/AGENTS.md.tmpl` and `…/files/installer-skills/{{project-name}}-
  installer/SKILL.md.tmpl` (single-source collapse).
- **CHANGE** `test/unit/templates/minimal-project.test.ts` — render front-door/orchestrator from snippets;
  remove the drift-guard test; keep the journaling.md-from-files assertion.
- **ADD** `test/unit/operations/init-project.test.ts` — unit tests for `initProject` over `MemoryFileSystem`
  (+ `FakeBacklog`).
- **ADD** `test/integration/cli.init.test.ts` — the WALKING SKELETON: `run(["init", …, "--at", tmpdir])` with a
  real `NodeFileSystem` in a tmpdir (always-on) + a built-binary `execFileSync` variant (`describeIfBuilt`) +
  (if BacklogMd included) a `describeIfBacklog`-gated, HOME/XDG-isolated `.authoring-backlog` assertion.
- (No `docs/`/repo-root `AGENTS.md`/`package.json` dep change.)

## The init operation — shape to implement (`src/core/operations/init-project.ts`)
```ts
// Pure over the ports; imports services + model + ports only (boundary intact).
import { join } from "node:path"; // pure string joins are permitted in core
import { ConflictError, NotFoundError } from "../errors.js";
import { renderTree } from "../services/render.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { makeArtefactDeriver } from "./derive-artefacts-capability.js";
import type { FileSystem, BacklogMd } from "../ports/index.js";
import type { OperationResult } from "../model/index.js";

export interface InitProjectInput { readonly targetDir: string; readonly name: string; }
export interface InitProjectDeps {
  readonly fs: FileSystem;
  readonly backlog: BacklogMd;       // for the optional .authoring-backlog/ init
  readonly builtinTemplatesRoot: string;
}

export function initProject(deps: InitProjectDeps, input: InitProjectInput): OperationResult {
  // 1. resolve the minimal project template (NotFoundError if missing)
  // 2. refuse if the target already looks like a project (ConflictError) — e.g. fs.exists(targetDir+"/manifest.yml")
  // 3. renderTree(template.files, {project-name: name}) → write each to join(targetDir, file.path)
  // 4. makeArtefactDeriver(...)(minimalProjection) → write desired.files (AGENTS.md + <name>-installer/SKILL.md)
  // (optional) backlog.init(join(targetDir, ".authoring-backlog"), { taskPrefix: "authoring" })
  // → OperationResult { summary: `created project <name> at <targetDir>`, changedPaths, materialisedTaskTitles: [] }
}
```
- **Refuse-if-exists granularity:** check whether `manifest.yml` already exists at the target (a project marker
  — doc 13 §7 `PROJECT_MARKER`), OR the target dir is non-empty — DECIDE (a non-empty-dir check is closer to
  doc 10 "refuse if target path exists"; a manifest check is friendlier). State the choice; the test re-runs
  init on the just-created project and expects `ConflictError`.
- **The minimal `Project` projection** for the deriver: `{ rootPath: targetDir, manifest: { meta: { name,
  version: <the template's 0.1.0 — or a SemVer brand cast as the test fixtures do>}, targets: [], bundles: [] },
  bundles: new Map() }`. (The deriver only reads `meta.name` + `bundles` for the menu, so an empty projection
  renders the front-door with the name + an empty bundle menu.)
- **`changedPaths`** = every path written (the rendered `files/` + the two derived artefacts) — so the result
  is observable and the command can report a count.

## Tests — the WALKING SKELETON (AC#1: a REAL working directory)
### `test/integration/cli.init.test.ts` (the load-bearing E2E)
Run the slice end-to-end against a REAL `NodeFileSystem` in a real tmpdir, through `run()` (the real CLI path).
Mirror `cli.bin.test.ts`'s tmpdir + `describeIfBuilt` idioms; use `withTempDir` for isolation.
- **AC#1 — real-disk E2E via `run()`:**
  - `withTempDir(async (dir) => { const code = await run(["init", "hermes-handoff", "--at", dir], realDeps(),
    io()); expect(code).toBe(0); … })` where `realDeps()` uses `new NodeFileSystem()` + the real
    `builtinTemplatesRoot` (`fileURLToPath(new URL("../../templates", import.meta.url))` from the test, or the
    composition root's value) + (if included) `new BacklogCli()`.
  - Assert ON REAL DISK (via `node:fs` `existsSync`/`readFileSync` — tests may use `node:fs`):
    `<dir>/<name>/manifest.yml` exists + parses (`parseManifest(parseYaml(...))`), `meta.name === "hermes-
    handoff"`, `bundles == []`, `targets == []`. **NOTE the project root**: decide whether `init <name>`
    creates `<dir>/<name>/` (name as a subdir) or initialises `<dir>` itself — doc 10 `init <name> [--at
    <path>]` + step 3 "copy into `<path>`/cwd" suggests `--at` IS the project root and `<name>` is the project
    NAME (not a subdir). So with `--at dir`, the project root is `dir` and `manifest.yml` is at `dir/
    manifest.yml`. CONFIRM this reading against doc 10 (the `init` row: "copy template files/ into `<path>`/
    cwd") and implement consistently; the test asserts at the chosen root.
  - `AGENTS.md` exists, contains the substituted name (`hermes-handoff`), the doc-07 recognition line
    ("install"/recognition), and NO `{{…}}`. (Rendered from the SNIPPET via the deriver.)
  - `installer-skills/hermes-handoff-installer/SKILL.md` (orchestrator) exists + names the project; `installer-
    skills/hermes-handoff-installer/references/journaling.md` exists (copied from `files/`).
  - `README.md`, `RALPH-LOOP.md` exist. Scan EVERY produced file for `/\{\{[^}]*\}\}/` → none.
- **AC#1 — through the built binary (the fullest real path), `describeIfBuilt`:** `execFileSync(process.exec
  Path, [binLink, "init", "hermes-handoff", "--at", dir])` (symlink to `dist/cli.js` like `cli.bin.test.ts`),
  then assert the same files exist on disk. This is the truest "single command-line invocation … real working
  directory."
- **AC#2 — smallest slice:** assert the produced project does NOT contain `bundles/` (the full init's step 5)
  and (if BacklogMd NOT included) no `.authoring-backlog/` — proving it is the minimal slice, not the complete
  command.
- **idempotency/refusal:** re-running `init` on the just-created target → exit 1 (`ConflictError`), and the
  manifest is unchanged (re-read it, assert byte-identical).
- **(if BacklogMd included) `describeIfBacklog` + HOME/XDG-isolated:** assert `.authoring-backlog/` is a valid
  Backlog.md root (`backlog task list --plain` runs there, task_prefix=authoring) — mirror `backlog-cli.test.ts`.
### `test/unit/operations/init-project.test.ts` (the operation over the in-memory FS)
- `initProject` over `MemoryFileSystem` (+ `FakeBacklog`) produces the manifest + derived artefacts + copied
  files; `changedPaths` lists them; the summary is observable. Refuse-if-exists → `ConflictError`. Template
  missing → `NotFoundError`. The front-door/orchestrator content is substituted (no `{{…}}`).
### `test/unit/templates/minimal-project.test.ts` (UPDATE — the single-source collapse)
- Render the front-door + orchestrator from `snippets/` (not the removed `files/` copies); keep the journaling.md
  -from-`files/` assertion; REMOVE the drift-guard test. Keep AC#3 (stub snippets) + the loop-closure case.

## DoD (the backlog DoD for task-33)
- `tsc --noEmit` clean; `biome check src test` clean with **0 errors / 0 warnings** (run `biome check --write
  src test` FIRST). `vitest run` green (SINGLE process). `npm ci` clean. **`npm run build` then re-run** so the
  built-binary integration tests run against fresh `dist/` (the task-29 S1 lesson — the binary tests skip
  without a build). **Core import-boundary intact** — `initProject` is a core operation that imports only
  services/model/ports (+ `node:path` string joins), never `node:fs`/`commander`/`omelette`; the CLI wiring is
  the shell. No dead code; `initProject` + its input/deps documented.

## Previous-story intelligence (carried forward)
- **task-30** built the minimal template + its test + RECORDED this forward-note (collapse the front-door/
  orchestrator to snippets-only). This story RESOLVES it.
- **task-26** `makeArtefactDeriver` reads the template's `snippets/` (front-door = path `AGENTS.md`(.tmpl);
  orchestrator = `installer-skills/…-installer/SKILL.md`) and renders them — the SINGLE SOURCE init reuses.
- **task-27** the composition root + `CommandModule`/`buildProgram`/`groupOnly`/`formatResult`; `run`/
  `runWithExit` map errors → exit codes; output via `io` sinks. Wire `init` the SAME way.
- **task-28** `withExamples` + the completeness guard (a command with options/args MUST carry an example) —
  `init` triggers it. **task-29** completion (`COMPLETION_SPECS`; a new project name → no source) + the binary
  tests need a fresh `dist/` (S1 lesson: `npm run build` before the final gate or the binary tests skip).
- **task-31** real-`backlog`/real-fs tests must be ISOLATED (per-tmpdir HOME/XDG) + skip-not-fail when `backlog`
  is absent. Single-process vitest (task-18). `MemoryFileSystem` is POSIX-normalized; the FileSystem port has
  NO `append`; tests may use `node:fs` directly.

## Boundaries (do NOT do here)
- Do NOT implement the FULL init (steps 5–7, 9–12) — only the minimal slice (1–4, 8, + optional backlog init).
  Do NOT add `--template`/`--list-templates`/`--param` (minimal-only slice). Do NOT change any other operation,
  the exit table, or `configureOutput`. Do NOT import `node:fs`/`commander`/`omelette` under `src/core/**`. Do
  NOT edit `docs/`, the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status), or the dev
  `backlog/`. Do NOT touch task-10–32 source beyond the `init` wiring + the template single-source collapse +
  the minimal-project test update. If doc 10/13 specify something this sketch omits, the DOC wins — add it +
  note the divergence. This is the foundation's FINAL task — be thorough and leave the hexagon demonstrably
  composing end-to-end.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
