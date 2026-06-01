# Story cli-targets — `project targets add` / `list` / `remove` (tasks 42 + 43 + 44)

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 §"Per-command actions" rows 145–147 (the three `project targets` rows) + §"Derived
> artefacts stay current automatically" (line 34) + doc 11 the per-bundle "Verify `<id>`'s install-backlog
> works on `<agent>`" authoring task, on the Group-A `templateModule` `CommandModule` pattern + the task-25
> lifecycle `runMutation`/`runRead`). **This is the LIST-MANAGEMENT EXEMPLAR:** the add/list/remove shape recurs
> across 8 families (24 tasks: targets, project installer-skills, bundle requires/files/templates/scripts/
> skills/installer-skills) — so the operation shape, the WARNING CHANNEL, and the alias ASYMMETRY established
> here are the reusable pattern the 7 repeat families follow.

## Acceptance criteria (verbatim from the backlog)
### TASK-42 — `project targets add <agent>` (a MUTATION)
1. When the agent is not already a target, it is appended to `manifest.yml` targets and its scope-alias is
   created from the built-in agent-to-alias map.
2. When the agent name is unknown to the built-in map, the command warns and skips the alias so the author can
   configure it manually, while still recording the target.
3. The derived `AGENTS.md` and installer skill are re-rendered with the new agent list, and a per-bundle
   authoring task to verify the install-backlog works on the agent is materialised for each bundle, idempotent
   by title.
4. Adding an agent already present is reported as a no-op conflict rather than duplicating it.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or `-C`.
6. Help output is substantive (description, synopsis, the agent positional, an example) and the agent positional
   completes from the built-in well-known agent list; on success exits 0.
### TASK-43 — `project targets list` (a READ)
1. Prints the entries of `manifest.yml` targets.
2. Reads and reports only, no change on disk, exits 0 on success.
3. Run outside any project it exits non-zero naming `manifest.yml` and suggesting `init`/`-C`.
4. Help output is substantive (description, synopsis, an example).
### TASK-44 — `project targets remove <agent>` (a MUTATION)
1. When the agent is a current target, it is removed from `manifest.yml` targets and its scope-alias is removed,
   warning if the alias did not exist.
2. The derived `AGENTS.md` and installer skill are re-rendered without the agent.
3. Removing the last remaining target prints a warning.
4. Removing an agent that is not a target fails with a typed not-found error and a non-zero exit.
5. Run outside any project it exits non-zero naming `manifest.yml` and suggesting `init`/`-C`.
6. Help output is substantive (description, synopsis, the agent positional, an example) and the agent positional
   completes from current `manifest.yml` targets; on success exits 0.

## doc-10 contract (cite the rows)
> `project targets add <agent>` → "1. Validate `<agent>` is not already in `manifest.yml.targets` 2. Append to
> `manifest.yml.targets` 3. Create the scope-alias symlink for `<agent>` (… looked up from the CLI's built-in
> map of well-known agents; **warns and skips if `<agent>` is unknown** so the author can configure the alias
> manually) 4. re-render `AGENTS.md` and `<project>-installer/SKILL.md` 5. materialise per-bundle authoring
> tasks 'Verify `<id>`'s install-backlog works on `<agent>`' 6. Print summary".
> `project targets list` → "1. Read and print `manifest.yml.targets`".
> `project targets remove <agent>` → "1. Validate `<agent>` is in `manifest.yml.targets` 2. Remove from
> `manifest.yml.targets` 3. **Remove the scope-alias symlink** for `<agent>` (**warn if it doesn't exist**)
> 4. re-render derived artefacts 5. **Warn if it was the last target** 6. Print summary". [Source: docs/10
> §"Per-command actions", the `project targets` rows.] Auto-rerender: "every command that mutates one of the
> input files re-renders the derivatives as part of its own action." [Source: docs/10 line 34.]

## These are project-BOUND (unlike Group-A's tolerant reads)
All three operate on a resolved project. The CLI action runs `resolveContext({ fs, env }, projectOverride from
parent.opts().project)` and, when no project resolves, raises the EXACT `bundleModule` message:
`NotFoundError("no manifest.yml found in the working directory or any parent — run \`wpm init <project-name>\`
to create a project, or pass \`-C <path>\` to target one elsewhere")` (exit 1) — satisfying each task's
"outside any project" AC (42#5, 43#3, 44#5). Reuse that exact string (factor a shared `requireProject(ctx,
parent)` helper that returns `root` or throws — the 7 repeat families reuse it). On success, the action calls
`runMutation`/`runRead` with `{ root }`.

## THE TWO REUSABLE MECHANISMS (the exemplar's point — get these right)

### 1. The WARNING CHANNEL (decide + make it the pattern)
The ACs need warnings that are NOT errors: 42#2 (unknown agent → alias skipped, target still recorded), 44#1
(alias didn't exist), 44#3 (last target removed). The repeat families warn too (e.g. `files remove` "left on
disk", `requires remove` "still referenced"). **DECISION: thread warnings through the ONE lifecycle harness so
every list-mgmt operation reports them uniformly:**
- **Extend `OperationResult`** (`src/core/model/operation.ts`) with `readonly warnings?: readonly string[]`.
- **Extend `ApplyOutcome`** (`src/core/operations/lifecycle.ts`) with `readonly warnings?: readonly string[]` so
  an operation's `apply` can emit warnings (e.g. remove's "alias didn't exist" / "last target").
- **`runMutation`** folds into `result.warnings`: (a) the operation's `apply` warnings, AND (b) the
  **deriver-derived** unknown-target warnings — after ④, inspect `desired.aliasPlan.unknownTargets` and emit, per
  unknown agent, `agent "<x>" is not a built-in known agent; its scope-alias was skipped — configure it
  manually`. This makes 42#2's warning fall out of the harness automatically (the deriver ALREADY computes
  `unknownTargets`; the harness just surfaces it) — no per-operation code for it.
- **The CLI** prints `result.warnings` to **`io.err`**, each as `warning: <text>\n` (stderr, so a piped stdout
  stays clean; distinct from `error:` which is a failure). State this. The exit code stays 0 on a warned success
  (a warning is not a failure). Extend `formatResult` (or add a `formatWarnings`) in the shell.
- (`runRead` does not need warnings — a read emits none. Keep `ReadOutcome.result.warnings` simply absent/empty.)
> Why the harness, not the CLI: the unknown-target condition is computed in `core` (the deriver), the
> last-target/missing-alias conditions in the operation's `apply` — both are core knowledge. Surfacing them via
> `OperationResult.warnings` keeps the CLI a dumb printer and gives every repeat family the same channel.

### 2. The ALIAS ASYMMETRY (the key list-mgmt lesson)
The harness ④ RERENDER **only ADDS** missing aliases (`planChanges` → `change.aliasesToCreate` → `ensureAlias`);
it **never removes** an orphaned alias (confirmed by reading `lifecycle.ts` `applyRerender` — it diffs and only
writes/creates). So:
- **ADD** gets its alias for FREE from ④ (a known agent → `scopePlan` includes its alias → ④ creates it). The
  add operation's `apply` does NOT touch aliases (42#1 is satisfied by ④).
- **REMOVE** must DELETE the alias itself in its `apply` — the deriver won't. `aliasPathFor(agent)` gives the
  project-relative link path; `fs.exists(join(root, aliasPath))` then `fs.remove(...)`; **warn (not error) if it
  didn't exist** (44#1). This cleanup-the-side-effect-the-deriver-won't is THE pattern every `remove` in the 7
  families reuses (and `files/templates/scripts/skills remove` deregister-but-leave-the-file is the same shape:
  the operation owns the reverse effect ④ doesn't).

## The operations to build (`src/core/operations/`; pure over ports)
Mirror `createBundleSpec`'s `OperationSpec` shape. Put them in `src/core/operations/targets.ts` (one file for
the family: `addTargetSpec`, `removeTargetSpec`, `listTargetsSpec`) OR three files — your call; one file is
tidy for a family.

### `addTargetSpec(): OperationSpec<{ agent: AgentName }>`
- `summary`: `(_p, { agent }) => \`added target ${agent}\``.
- `check(project, { agent })`: if `project.manifest.targets.includes(agent)` → `throw new ConflictError(\`target
  "${agent}" is already present\`)` (42#4 — no-op conflict, exit 1, nothing changed).
- `apply({ fs, root }, _project, { agent })`: `const next = editYaml(fs.read(join(root,"manifest.yml")), doc =>
  doc.addIn(["targets"], agent)); fs.write(manifestPath, next); return { changedPaths: [manifestPath] }`. Does
  NOT touch the alias (④ creates it for a known agent; 42#2's skip+warn for an unknown one falls out of the
  harness's `unknownTargets` folding).
- `materialise(project, { agent })`: `project.manifest.bundles.map(id => ({ title: \`Verify ${id}'s
  install-backlog works on ${agent}\`, acceptanceCriteria: ["install-backlog tasks don't make hard-coded
  other-agent assumptions; the bundle's flow is compatible with " + agent + "'s capabilities"] }))` (doc-11's
  task; title-idempotent via the harness — 42#3).

### `removeTargetSpec(): OperationSpec<{ agent: AgentName }>`
- `summary`: `(_p, { agent }) => \`removed target ${agent}\``.
- `check(project, { agent })`: if `!project.manifest.targets.includes(agent)` → `throw new NotFoundError(\`target
  "${agent}" is not a current target\`)` (44#4, exit 1).
- `apply({ fs, root }, project, { agent })`: (1) find the index: `const idx = project.manifest.targets.indexOf
  (agent)`; `editYaml(read, doc => doc.deleteIn(["targets", idx]))` + write; (2) the alias: `const aliasPath =
  aliasPathFor(agent)`; collect warnings: if `aliasPath !== undefined` and `fs.exists(join(root, aliasPath))` →
  `fs.remove(join(root, aliasPath))`; else push the warning `scope-alias for "${agent}" did not exist — nothing
  to remove`; (3) last-target: if `project.manifest.targets.length === 1` (it WAS the last, pre-removal) → push
  warning `"${agent}" was the last target — the project now targets no agents`; (4) `return { changedPaths:
  [manifestPath, ...(removedAlias ? [aliasPath] : [])], warnings }`.
  - NOTE: `aliasPathFor` returns `undefined` for an UNKNOWN agent — if such an agent was somehow a target (e.g.
    added before, alias skipped), there is no alias to remove; treat as "alias did not exist" (warn). Handle the
    `undefined` cleanly.

### `listTargetsSpec(): ReadSpec<void, readonly AgentName[]>`
- `summary`: `"project targets"`. `project: (project) => project.manifest.targets`. The CLI prints the value.

## CLI wiring (`src/cli.ts`; the shell)
Convert the `project` `groupOnly` placeholder into a real `projectModule: CommandModule` that registers a
`project` group + a `targets` SUBGROUP (`const targets = group.command("targets")`) with `add`/`list`/`remove`
leaves. (Other `project` subcommands — `show`/`meta`/`version`/`installer-skills`/`validate`/`root` — are later
tasks; only `targets` here. Keep the `project` group's description.) Register `projectModule` in
`TOP_LEVEL_MODULES` (replacing `groupOnly("project", …)`).
- Each leaf: `requireProject(ctx, parent)` → `root` (or NotFoundError); build the lifecycle deps the way
  `bundleModule` does (`{ fs, backlog, deriveArtefacts: makeArtefactDeriver({ fs, builtinTemplatesRoot,
  projectTemplatesRoot: join(root, "templates") }) }`); validate the `<agent>` arg via `parseAgentName` (a
  `ValidationError` on a bad name — exit 1); call `runMutation`/`runRead`; `ctx.io.out.write(formatResult(...))`
  + print `result.warnings` to `io.err`.
- `add <agent>` → `.argument("<agent>", "the target agent to start supporting (e.g. claude-code)")` +
  `withExamples([{ command: "wpm project targets add claude-code", note: "start supporting Claude Code" }])`.
- `list` → no args; `runRead(listTargetsSpec)`; format the targets list (one per line, or "no targets yet").
  **task-43 AC#4 explicitly requires "an example" in list's help**, so give `list` a `withExamples` too (the
  task-28 guard would not force it for a no-arg command, but the AC does — so add it).
- `remove <agent>` → `.argument("<agent>", "the target agent to stop supporting")` + `withExamples([{ command:
  "wpm project targets remove hermes", note: "stop supporting Hermes" }])`.
- `parseAgentName` for the arg: a `ValidationError` (exit 1) on a non-kebab name — happens in the action before
  `runMutation`. (An UNKNOWN-but-valid agent like `my-custom-agent` parses fine and is recorded with a warning;
  validation only rejects malformed names.)

### Completion (`COMPLETION_SPECS`; reuse existing task-29 sources)
```ts
"project targets add":    { args: ["target-names"] },           // the well-known agents (for `add`)
"project targets remove": { args: ["installed-target-names"] }, // the project's current targets (for `remove`)
```
`target-names` (the `ALIAS_PATHS` keys) and `installed-target-names` (the manifest's targets) BOTH already exist
(task-29). No `--scope`. Re-run the task-29 completion tests (the tree gains the new leaves).

## Files to change
- **CHANGE** `src/core/model/operation.ts` — add `warnings?: readonly string[]` to `OperationResult`.
- **CHANGE** `src/core/operations/lifecycle.ts` — add `warnings?` to `ApplyOutcome`; `runMutation` folds in the
  operation's `apply.warnings` + the deriver `unknownTargets` warnings into `result.warnings`. (Pure — imports
  nothing effectful; it already imports the deriver types.)
- **ADD** `src/core/operations/targets.ts` — `addTargetSpec` / `removeTargetSpec` / `listTargetsSpec`. Pure over
  ports (imports errors/model/services/ports + `node:path` + `editYaml`/`aliasPathFor` — never `node:fs`/
  `commander`).
- **CHANGE** `src/cli.ts` — `projectModule` (group + `targets` subgroup + 3 leaves + `requireProject` helper +
  `formatWarnings`/extend `formatResult`); add the 2 `COMPLETION_SPECS`; register `projectModule`.
- **ADD** `test/unit/cli/targets-commands.test.ts` — the AC tests (below).
- (No `docs/`/`templates/`/`package.json` change.)

## Tests (AC-driven, in-process via `run()` + `MemoryFileSystem` fixtures; mirror Group A)
Seed a realistic project at `/proj`: a `manifest.yml` with `targets: [claude-code]` + `bundles: [web]`; a
`bundles/web/bundle.yml` (so the project loads + materialise has a bundle); the project's `installer-skills/`
dir EXISTS (so the rerender's root alias is NON-broken — the task-25/27 lesson); the built-in `minimal` project
template snippets mirrored at the builtin root (so `makeArtefactDeriver` resolves the front-door + orchestrator
— copy the seed from `cli.acceptance.test.ts`/`create-bundle.test.ts`). Drive via `run(["project","targets",…,
"-C","/proj"], deps, io)`.
### `project targets add` (task-42)
- **AC#1** known agent: `add codex` → exit 0; `manifest.yml.targets` now includes `codex` (parse it);
  AND the scope alias exists non-broken: `fs.exists("/proj/.agents/skills")` (codex's alias path from
  `ALIAS_PATHS`) is true and `fs.aliasTarget(...)` points at `/proj/installer-skills`.
- **AC#3** rerender + materialise: the front-door `AGENTS.md` was re-rendered (changedPaths includes it / it
  exists); a `Verify web's install-backlog works on codex` authoring task was created (`backlog.taskDetail`/
  `listTasks` — for each bundle). Re-running `add` (after removing? no — use a fresh add of a 2nd agent, or
  assert idempotency by materialising twice → no duplicate; the harness de-dups by title).
- **AC#2** UNKNOWN agent: `add my-custom-agent` (valid kebab, not in `ALIAS_PATHS`) → exit 0; the target IS
  recorded in the manifest; NO alias created for it (`fs.exists` of any alias path for it is false / unchanged);
  AND a WARNING is emitted to `io.err` matching `/warning:.*my-custom-agent.*alias/i` (the unknown-agent skip).
- **AC#4** duplicate: `add claude-code` (already a target) → exit 1, `io.err` matches `/^error: /`, and the
  manifest is UNCHANGED (re-read, byte-identical) — a no-op conflict.
- **AC#5** outside a project: with cwd at a no-manifest dir and no `-C`, `add codex` → exit 1, `io.err` contains
  `manifest.yml` and `init`.
- **AC#6** help + completion: `add --help` → 0, has description/`Usage:`/`<agent>`/`Example:`; and `completeArgv`
  for `project targets add <tab>` → the well-known agents (`claude-code`/`codex`/`hermes`/`openclaw`).
### `project targets list` (task-43)
- **AC#1/#2** read-only: `list -C /proj` → exit 0, output contains `claude-code`; an fs snapshot is unchanged.
- **AC#3** outside a project → exit 1 naming `manifest.yml`.
- **AC#4** help: `list --help` → 0, has description/`Usage:`/`Example:`.
### `project targets remove` (task-44)
- **AC#1** remove + alias delete: seed `targets: [claude-code, codex]` + create codex's alias (`fs.ensureAlias`
  or rely on a prior `add`); `remove codex` → exit 0; manifest no longer has `codex`; the alias
  `/proj/.agents/skills` (codex's path) is GONE (`fs.exists` false). (Careful: claude-code ALSO maps to a
  different path `.claude/skills`, so removing codex's `.agents/skills` doesn't affect claude-code's alias —
  assert claude-code's alias survives.)
- **AC#1 warn-if-missing**: `remove` an agent whose alias does NOT exist (target present, alias never created) →
  exit 0 + a WARNING matching `/warning:.*alias.*did not exist/i`.
- **AC#3** last target: seed `targets: [claude-code]`; `remove claude-code` → exit 0 + a WARNING matching
  `/warning:.*last target/i`.
- **AC#4** non-target: `remove nonesuch` → exit 1, `io.err` matches `/^error: /` (NotFoundError).
- **AC#2** rerender-without-agent: after `remove`, the re-rendered front-door no longer lists the removed agent
  (or: assert the rerender ran — the front-door is in changedPaths). (The minimal front-door snippet may not
  enumerate targets; assert the rerender HAPPENED via changedPaths including `AGENTS.md`, and the manifest is
  the source of truth that no longer has the agent.)
- **AC#5** outside a project → exit 1 naming `manifest.yml`.
- **AC#6** help + completion: `remove --help` → 0 (desc/`Usage:`/`<agent>`/`Example:`); `completeArgv` for
  `project targets remove <tab>` → the CURRENT manifest targets (`[claude-code, codex]` for the seed).
### Cross-cutting
- the task-28 help completeness guard (`help-contract.test.ts`) walks the new `project`/`targets`/`add`/`list`/
  `remove` commands — re-run it (all green; the leaves with args carry examples; `list` carries one too).
- the task-29 completion tests pass (the tree gained the leaves; specs reference existing sources).
- (PLUS, optional) a real-fs/binary `describeIfBuilt` case: `node dist/cli.js project targets add codex --at?`
  — but `add` needs a project; easier to keep this family unit-only + drive via `-C` to a tmpdir project. A
  real-fs integration variant (NodeFileSystem in a tmpdir with a seeded project) is a plus, isolated.

## DoD (the backlog DoD for tasks 42/43/44)
- `tsc --noEmit` clean; `biome check src test` clean **0/0** (run `biome check --write` first). `vitest run`
  green (SINGLE process). `npm ci` clean. **Core import-boundary intact** — the operations + the lifecycle change
  import nothing effectful (the alias removal goes through the FileSystem port; `editYaml`/`aliasPathFor` are
  pure leaves/services). No dead code; the specs + the warning channel + `requireProject` documented. (If a
  binary/integration test is added, `npm run build` first — the task-29/33/Group-A lesson; rebuild `dist/`.)

## Previous-story intelligence (carried forward)
- **Group A (template family)** established the `CommandModule`-per-family + `formatX` shell helper + the test
  harness (`seed`/`collector`/`io`/`run(["…","-C",PROJ])`) — reuse it. **task-33 lesson:** the binary tests need
  a fresh `dist/` (`npm run build` before the final gate if any binary/integration test runs).
- **task-26 `createBundleSpec`** is the `OperationSpec` template (check/apply/materialise + `editYaml` for the
  comment-preserving manifest edit + the materialise plan) — mirror it. **task-25 `runMutation`** does ①④⑤⑥; ④
  creates missing aliases via `ensureAlias` but NEVER removes (the asymmetry). The non-broken-alias lesson: the
  alias TARGET (`installer-skills/`) must exist in the fixture or the rerender alias is broken.
- **task-29** `COMPLETION_SPECS` + the `target-names`/`installed-target-names` sources already exist — reference
  by name. **task-28** `withExamples` + the guard (commands with args MUST carry an example).
- `editYaml(text, doc => …)` is comment-preserving (eemeli/yaml `Document`); `doc.addIn(["targets"], agent)` /
  `doc.deleteIn(["targets", idx])`. `aliasPathFor(agent)` → the link path or `undefined`. `parseAgentName`
  validates the arg. The no-project message is the exact `bundleModule` string. Single-process vitest;
  `MemoryFileSystem` POSIX-normalized + `fs.aliasTarget(linkPath)` test accessor.

## Boundaries (do NOT do here)
- Do NOT implement other `project` subcommands (`show`/`meta`/`version`/`installer-skills`/`validate`/`root`) —
  only `targets add/list/remove`. Do NOT make `list` mutate. Do NOT let `remove` rely on ④ to delete the alias —
  ④ won't; the operation must (the asymmetry). Do NOT print warnings as errors (warnings → `io.err` with a
  `warning:` prefix, exit stays 0; errors → `error:`, non-zero). Do NOT import `node:fs`/`commander` under
  `src/core/**`. Do NOT edit `docs/`, the repo-root `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status),
  `templates/`, or the dev `backlog/`. If doc-10 specifies something this sketch omits, the DOC wins — add it +
  note the divergence.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
