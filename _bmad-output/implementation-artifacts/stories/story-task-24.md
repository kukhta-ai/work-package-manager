# Story task-24 — Implement context resolution

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from doc 13 §7/§5 + doc 10). Phase D services tier. doc 13 §7 context resolution. PURE over the
> Environment + FileSystem PORTS + node:path. Synchronous.

## Story
As every project-bound operation (the §5 "context" the operation receives) and the project-aware `template`
subcommands, I need to locate the project root by walking up from the working directory for `manifest.yml`,
honour a `-C/--project` override, and report an explicit no-project outcome — so a project-bound command can
fail loudly while `template list`/`show` fall back to built-ins (doc 10 "Project context is explicit").

## Acceptance criteria (the contract)
1. From any working directory inside a project, the project root is located by searching upward for its
   manifest (doc 13).
2. An explicit override can point at a project regardless of the working directory.
3. When no project is found, the outcome says so explicitly, so callers that work without one can proceed.

## Developer context (the docs)
- doc 13 §7: "Context resolution (task-24) is a service used before any project-bound operation: walk the
  working directory upward (via the environment and filesystem ports) until a `manifest.yml` is found,
  git-style; honour a `-C/--project` override; and yield either a located project context or an explicit
  *no-project* result (which `template list`/`show` tolerate by falling back to built-ins)."
- doc 13 §5: every operation takes a **context** (the located project root + the environment, from
  `resolveContext`).
- doc 10 "Project context is explicit": every command except `init` and the project-agnostic `template`
  subcommands operates on a project identified by walking up from cwd until `manifest.yml` is found; a global
  `-C, --project <path>` overrides the search; project-bound commands **fail loudly when no project is
  resolved, naming the marker** (and suggesting `init`/`-C`); project-aware works either way.
- task-12 FileSystem port: `exists(path): boolean`. task-15 Environment port: `cwd(): string`.

## Design — `src/core/services/context.ts` (PURE; boundary rule applies)
- `node:path` IS allowed in core (pure string ops): `join`/`dirname`/`resolve`. `node:fs` is NOT — disk
  presence is checked through the FileSystem port (`exists`).
- **The manifest marker**: `const PROJECT_MARKER = "manifest.yml"` (doc 00/06).
- **`ProjectContext` — discriminated result**: `{ found: true; root: string } | { found: false }`. An
  explicit no-project is `{ found: false }` — NOT a throw — so `template list`/`show` can proceed with
  built-ins; a project-bound command maps `{ found: false }` to a `NotFoundError` (task-23) at the COMMAND
  layer (not here). (Optionally include `searchedFrom`/`override` detail — keep minimal; the discriminant is
  what matters.)
- **`ResolveDeps = { fs: FileSystem; env: Environment }`** (the injected ports).
- **`ResolveOptions = { projectOverride?: string }`** (the `-C/--project` value).
- **`resolveContext(deps: ResolveDeps, opts?: ResolveOptions): ProjectContext`**:
  - **Override branch (AC#2)** — when `opts.projectOverride` is given: it OVERRIDES the search and points AT
    the project root. Resolve a relative override against `env.cwd()` (`resolve(env.cwd(), override)`). Check
    `fs.exists(join(<resolved>, PROJECT_MARKER))` at THAT directory ONLY; do NOT walk up. Present →
    `{ found: true, root: <resolved> }`; absent → `{ found: false }` (the command turns that into a loud
    NotFoundError naming the marker, doc 10).
  - **Walk-up branch (AC#1)** — no override: start `dir = env.cwd()`; loop: if `fs.exists(join(dir,
    PROJECT_MARKER))` → `{ found: true, root: dir }`; else `parent = dirname(dir)`; if `parent === dir`
    (filesystem root reached) → `{ found: false }`; else `dir = parent` and repeat. The loop MUST TERMINATE
    (the `parent === dir` check guarantees it at the root — no infinite loop). NEAREST manifest wins (the
    first one found walking up).
- **No-project (AC#3)**: `{ found: false }` is explicit and inspectable; never a throw.
- **PURE**: import only `node:path` + the FileSystem & Environment port TYPES — NO `node:fs`/`commander`/
  `execa`. Boundary clean on `src/core/services/`.
- Export: `resolveContext`, `ProjectContext`, `ResolveDeps`, `ResolveOptions`, (optionally `PROJECT_MARKER`).

## Tests (`test/unit/services/context.test.ts` — pure, MemoryFileSystem + FakeEnvironment)
- AC#1: `manifest.yml` at cwd → `{ found: true, root: cwd }`; `manifest.yml` at an ancestor several levels up
  with cwd deep inside → `{ found: true, root: <ancestor> }`.
- AC#2: `-C` override pointing at a project dir → `{ found: true, root: <override> }` REGARDLESS of cwd
  (set cwd somewhere unrelated); a RELATIVE override resolved against cwd → found at the resolved abs path; an
  override dir WITHOUT a manifest → `{ found: false }` (does NOT walk up from the override).
- AC#3: NO `manifest.yml` anywhere from cwd up to the fs root → `{ found: false }`, and assert the walk
  TERMINATES (the call returns — no hang).
- nearest-manifest-wins: both cwd AND an ancestor have a manifest → root is cwd (the nearer one).
- determinism: same fs+env+opts → same result.

## DoD
- Pure (boundary clean — only `node:path` + the two ports; verify biome on `src/core/services/`). `tsc
  --noEmit` clean, `biome check .` clean, `vitest run` green (SINGLE process), `npm ci` clean (no new deps).
  JSDoc every public type/fn; no dead code.

## Previous-story intelligence (carried forward)
- task-12 `MemoryFileSystem` normalizes paths POSIX-style; `exists` works on `/`-rooted paths — use `/`-rooted
  cwd/override values in tests so `node:path` (POSIX on the Linux host) and the fake fs agree. task-15
  `FakeEnvironment.setCwd` pins cwd. task-17 echo: a service that USES ports imports the port interfaces, not
  the adapters (boundary clean); `node:path` is allowed in core (task-17/19). task-17/20/23 echo: a normal
  "no" outcome is DATA in a discriminated result (here `{found:false}`), not a throw. Run `biome check
  --write` before the gate; vitest SINGLE process (task-18 caveat).

## Boundaries (do NOT do here)
- No `node:fs` (presence via the FS port). No throwing for no-project (that's the command layer's
  NotFoundError, task-23). No loading the Project (that's a later operation — this only LOCATES the root). No
  wiring into operations/commands. No new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl.
  sprint-status), task-5's biome.json, task-10–23.
