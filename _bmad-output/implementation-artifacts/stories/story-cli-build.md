# Story cli-build — `build dry-run` / `build package` / `build publish` (tasks 82 + 83 + 84)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 82/83/84, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 lines 181–183 (`build dry-run`/`package`/`publish`), doc 12 §"Distribution and the user's install experience"
> + §"Templates as data" (THE PROJECT *IS* THE PACKAGE — no transform step; npm `i -g` ships the repo tree), doc
> 06 (the project skeleton = the shippable set; `wpm.lock` at root `[OPT]`, present only when vendoring), doc 08
> §"Pinning and integrity for vendored third-party content" (`wpm.lock` frozen-lockfile over the third-party
> artifacts an author vendors into `installer-skills/`), doc 13 §1/§3/§5/§7/§8 (purity / ports / six-beat lifecycle
> / error model / read trace).
>
> **Family R — THE FINALE.** The `build` group is currently a `groupOnly("build", …)` placeholder in
> `TOP_LEVEL_MODULES`. Build `build dry-run` FIRST (the foundation: validate + lock-verify + the shippable file
> enumeration — the pure PLAN), checkpoint, then `package` (the plan + ARCHIVING infra), then `publish` (package +
> PUSH infra). After R = task 84, the CLI epic-2 is COMPLETE → Phase-6 epic gate.

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-82 — `build dry-run` (doc-10 row 181)
1. The command runs `project validate` and fails fast on any validation error.
2. The command verifies `wpm.lock` against the vendored content and fails on hash drift (frozen-lockfile).
3. On success it prints the file tree that would ship, with each vendored artifact locked version and source, and
   produces no artefact.
4. The command exits 0 when validation and the lockfile check pass and non-zero otherwise.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override.
6. Help output is substantive (description, synopsis, an example).

### TASK-83 — `build package [--format zip|tarball|git]` (doc-10 row 182)
1. The command runs `project validate` and verifies `wpm.lock`, failing on validation error or hash drift before
   producing anything.
2. It produces a distributable in the `--format` value of zip, tarball, or git, defaulting to zip, and prints the
   output path.
3. An unsupported `--format` value fails as a usage error with exit code 2.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override.
5. Help output is substantive (description, synopsis, the `--format` flag and its values, an example) and
   `--format` completes from zip, tarball, git; on success exits 0.

### TASK-84 — `build publish <destination>` (doc-10 row 183)
1. The command first builds the package (running validate and the lockfile check) and then pushes the result to
   the given destination.
2. A failure in the build step prevents any push and surfaces as a non-zero exit.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting init or the `-C`
   override.
4. Help output is substantive (description, synopsis, the destination positional, an example); on success exits 0.

## doc-10 contract (cite the rows)

> `build dry-run` (row 181): "1. Run `project validate` (fail-fast on error)<br>2. Verify `wpm.lock` against
> vendored content — hashes must match (frozen-lockfile; fail on drift)<br>3. Print what would ship (file tree),
> with each vendored artifact's locked version + source; produce no artefact<br>4. (Deeper checks … live as
> review-phase tasks in `.authoring-backlog/`; see `11`)". [Source: docs/10 §Per-command actions row 181.]

> `build package [--format zip|tarball|git]` (row 182): "1. Run `project validate`<br>2. Verify `wpm.lock`
> (frozen-lockfile; fail on drift)<br>3. Produce distributable in `--format` (default `zip`); print output path".
> [Source: docs/10 row 182.]

> `build publish <destination>` (row 183): "1. Build package (above)<br>2. Push to `<destination>` (registry URL,
> git remote, etc.)". [Source: docs/10 row 183 — deliberately OPEN ("registry URL, git remote, etc.").]

## ARCHITECTURE COMPLIANCE (doc 13 — the fixed principles) — THE PURE/INFRA SPLIT

The build family is the FIRST family with **genuine real-world side effects** (archiving, pushing). The doc-13
boundary is the load-bearing decision here. Split it cleanly:

- **PURE CORE computes the PLAN** (`src/core/operations/build.ts`, NEW): a `computeBuildPlan` that, given the loaded
  `Project` + fs-port reads the shell threads in, (a) runs `validateProject` (task-20), (b) verifies `wpm.lock`
  against the vendored artifacts via the pure `verifyLockfile` (task-22), and (c) enumerates the SHIPPABLE file
  list. Returns a `BuildPlan` DATA value (`ok` / validation problems / lock-verify result / the shippable file
  tree / the vendored-artifact lock summary). PURE: imports only the model/services/ports + `node:path`; NO
  `node:fs`/`execa`/`commander`/`node:child_process`. The core-boundary lint test (`test/integration/
  core-boundary.test.ts`) covers it. [Source: docs/13 §1; AGENTS.md invariant; biome.json `src/core/**` override.]
- **INFRA performs the EFFECT** (`src/adapters/packager.ts`, NEW — a driven adapter, NOT core): creates the archive
  (tarball/zip/git) and pushes, using `runSync` from `src/util/shell.ts` (the execa wrapper — NO new dependency).
  An adapter under `src/adapters/` MAY import `node:fs`/`node:os`/`runSync` (the boundary rule is `src/core/**`
  only). [Source: docs/13 §3/§6; docs/12 §"Adapter / infrastructure layer".]
- **CLI SHELL wires them** (`src/cli.ts`, the `buildModule`): resolves the project (`requireProject`), threads the
  fs reads (validate's `bundles/` dir names + the shippable-tree walk + the `wpm.lock`/vendored reads) into the
  pure plan via `runRead`-style or a direct `computeBuildPlan` call, formats the plan (output is not a port — doc
  13 §3), and for package/publish calls the packager adapter for the effect. `dry-run` calls NO packager. [Source:
  docs/13 §3; docs/12 §"CLI layer … thin".]
- **Error model** (doc 13 §7): a validation failure or lock drift → `ValidationError` (exit 1, AC82#1/#2,
  AC83#1, AC84#2). An unsupported `--format` → `UsageError` (exit 2, AC83#3). The canonical no-project error is the
  shared `NO_PROJECT_MESSAGE` via `requireProject` (`NotFoundError`, exit 1, AC82#5/AC83#4/AC84#3). A missing
  archiving tool (e.g. `zip` absent) → a typed `UsageError`/`ValidationError` with a clear message, NOT an
  unhandled `runSync` crash.

## THE CENTRAL DESIGN DECISIONS (record each in Completion Notes)

### D1 — Where `wpm.lock` lives + what "vendored" means + the FRESH-PROJECT TRIVIAL PASS

- `wpm.lock` lives at the **project root** (`<root>/wpm.lock`), and is **`[OPT]`** — "Present only when the project
  vendors such content." [Source: docs/06 line 25–27.]
- "Vendored" = the **third-party artifacts an author drops into `installer-skills/`** — discipline skills (e.g.
  superpowers' `test-driven-development`), loop-runner plugins (e.g. `snarktank/ralph`) — pinned by `name` +
  `source` (provenance: marketplace id / git URL+ref / release) + `version` + content `hash`. [Source: docs/08
  line 72–74; docs/06 line 35–42; `src/core/services/integrity.ts` `VendoredArtifact {name, source, version,
  files}`.]
- **A freshly-`init`'d project has NO `wpm.lock` AND no vendored content → a TRIVIAL PASS** (nothing to drift). The
  `installer-skills/` of a minimal project contains only the main `<project>-installer` skill (authored, NOT
  vendored) — which is NOT pinned in the lock. So: **when `wpm.lock` is ABSENT, the frozen-lockfile check passes
  vacuously** (there is nothing pinned to verify; AC82#2 "verifies against vendored content" is satisfied — the
  vendored set is empty). Handle this common case cleanly: no lock file → `{ ok: true, … }`, no error.
- **When `wpm.lock` IS present**: parse it (`parseLockfile`), then for each pinned artifact re-read its vendored
  file tree from disk (under `installer-skills/<name>/` at the project root) via the fs port, build the
  `VendoredArtifact[]` (name/source/version from the lock entry, files from disk), and call the pure
  `verifyLockfile(lock, current)`. A non-`ok` result (drift / missing / extra) → fail (AC82#2). **What counts as
  the "current vendored set"**: exactly the artifacts the lock pins (re-read each pinned `name`'s tree). Do NOT try
  to auto-discover *which* `installer-skills/` subdirs are "vendored vs authored" — the lock IS the authoritative
  list of what is pinned; `verifyLockfile`'s `missing` (pinned-but-absent-on-disk) and `drifted` (hash mismatch)
  are the failures; `extra` (on-disk-but-unpinned) is only meaningful if we feed it the full installer-skills set,
  which we deliberately do NOT (an authored `<project>-installer` skill is on disk but unpinned and must not be
  flagged `extra`). So feed `verifyLockfile` the re-read of *each pinned name only* — `extra` will always be empty
  by construction, and `drifted`/`missing` carry the contract. RECORD this precisely.
- The `source` + locked `version` printed per-artifact in dry-run (AC82#3) come straight from the parsed
  `LockEntry` (`{source, version, hash}`).

### D2 — The SHIPPABLE file set (what `dry-run` prints + what `package` archives)

The project skeleton (doc 06) IS the shippable set — doc 12 §"Distribution": "the agent skill is opt-in … No
registry beyond npm" and §"Templates as data": "there's no separate publish step that transforms it." So the
"package" is an archive of the project tree, MINUS the non-shipped working dirs. Enumerate, relative to the project
root, every file UNDER the root, EXCLUDING:

- **`.authoring-backlog/`** — the CLI's hidden authoring Backlog.md root (doc 10 §"The authoring-backlog"; doc 06
  does NOT list it in the shippable skeleton — it is the *builder-time* working store, the analogue of the
  excluded `.bmad`/dev backlog). NEVER ships.
- **`.git/`** — version control. Never ships.
- **`node_modules/`, `dist/`** — defensive (a bundle-project is content, not a built package; these would only
  appear if an author put them there). Exclude them.
- **DISABLED bundle dirs** — a directory under `bundles/` that the manifest does NOT list is **disabled** and "the
  build never includes it" (doc 06 line 153, a HARD RULE). So when enumerating `bundles/<id>/`, INCLUDE only
  `bundles/<id>/` where `<id> ∈ manifest.bundles`, PLUS `bundles/bundle-template/` (the scaffold — doc 10 allows it
  under `bundles/` without a manifest entry; it is project content, and `validateProject` already exempts it).
  Other unlisted bundle dirs are excluded from the ship set. (Note: `validateProject` already FAILS on an orphan
  unlisted dir that is not `bundle-template/` — AC82#1's validate gate catches it first; the ship-set exclusion is
  belt-and-braces and also covers the `--disabled`-created-then-still-present case once validate is satisfied.)

The shippable set therefore INCLUDES (when present): `AGENTS.md`, `CLAUDE.md`, `RALPH-LOOP.md`, `README.md`,
`manifest.yml`, `wpm.lock`, `docs/`, `installer-skills/`, `templates/`, the scope-alias symlinks (`.claude/skills`
etc.), and `bundles/<enabled-id>/` + `bundles/bundle-template/`. **Implement the ship-set enumeration as a SINGLE
pure function** `shippableFiles(fs, root, enabledBundleIds)` (the shell threads the fs walk; OR the pure plan walks
via the fs port — see D5) returning sorted relative paths, and REUSE it for BOTH dry-run's print AND package's
archive content. One source = no divergence between "what dry-run says ships" and "what package actually archives".
RECORD the exclusion list.

> EXCLUSION MECHANICS: walk the root via the fs port (`list` → `DirEntry`), recursing into directories, but PRUNE a
> directory whose root-relative path is `.authoring-backlog`, `.git`, `node_modules`, `dist`, or `bundles/<id>`
> where `<id>` is neither in `manifest.bundles` nor `bundle-template`. Symlinks: `fs.list` returns the alias dir
> entries; a scope-alias (`.claude/skills → installer-skills/`) is a symlink to a dir — the walk would recurse into
> it and duplicate `installer-skills/` content under `.claude/skills/`. DECISION: treat the top-level scope-alias
> link paths (`.claude/skills`, `.agents/skills`, `.openclaw/skills`, …) as LEAF entries in the ship list (record
> the alias path itself, do NOT recurse through it) — the archive then records the alias as a path without
> doubling its target's bytes. (The `NodeFileSystem.list` reports a symlink-to-dir as kind `directory`; detect the
> known scope-alias names, or — simpler + robust — detect that a `bundles`/`installer-skills` target is reached via
> a non-canonical path. SIMPLEST robust rule: do not recurse into any directory entry that is a symlink. Since the
> only symlinks in a generated project are the scope aliases, "don't traverse symlinked dirs" both avoids the
> double-count and records the alias names. Confirm `node-fs` exposes the symlink distinction; if `list` can't tell
> a symlink from a real dir, fall back to pruning the known alias names `.claude`/`.agents`/`.openclaw`/`.cursor`/…
> — but prefer the symlink check. RECORD which mechanism shipped.)

### D3 — ARCHIVING design (the INFRA, `src/adapters/packager.ts`)

`--format` ∈ {`zip`, `tarball`, `git`}, default `zip` (AC83#2). Each archives EXACTLY the D2 shippable set. Design
per format over `runSync` (`src/util/shell.ts`), NO new dependency (execa is already present):

- **`tarball`** → `tar`. `tar` is ubiquitous (present on this CI: `/usr/bin/tar`). Create `<name>-<version>.tgz`
  via `tar -czf <out> -C <root> <relpath…>` — pass the explicit shippable relative paths as args (so excluded dirs
  never enter the tar; do NOT `tar czf . ` and rely on excludes — enumerate). Use `--no-recursion` is NOT needed
  since we pass file paths (not dirs); but passing thousands of file args is fine for a bundle-project's size.
  (Alternative: write a `--files-from` list file to a temp path and `tar -czf <out> -C <root> -T <listfile>` — more
  robust for large sets + avoids ARG_MAX. PREFER `-T <listfile>` with the sorted shippable relpaths.) Output: a
  real `.tgz` at the printed path.
- **`git`** → `git archive`. `git` is ubiquitous (`/usr/bin/git`). `git archive --format=tar.gz -o <out> HEAD`
  produces an archive of the committed tree. NUANCE: `git archive` ships what is COMMITTED at `HEAD` and honours
  `.gitignore`/`export-ignore` — it will NOT include uncommitted files and (because `.authoring-backlog/` is
  `.gitignore`d by `init`) naturally excludes it. This is a legitimate, testable "git-native" packaging. A project
  that is not a git repo, or has no commits, → a clear typed error (caught from `runSync`'s non-zero/ spawn
  failure). RECORD that `git` format = "archive HEAD via git" and its precondition (a git repo with a commit).
- **`zip`** → `zip`. **`zip` MAY BE ABSENT** (it is NOT on this CI — `which zip` fails). Handle a missing tool with
  a clear TYPED error rather than a crash: probe (attempt `runSync("zip", ["-v"])` or catch the spawn failure) and
  raise a `UsageError`/`ValidationError` naming the missing `zip` binary and suggesting `--format tarball`. When
  present: `zip -r -q <out> <relpath…>` run with `cwd: root` (so paths are root-relative inside the zip), again
  fed the explicit shippable paths (a list file is not standard for `zip`; pass args, or `cd root && zip` per
  entry). Since `zip` is the DEFAULT but absent here, the E2E for the happy zip path is CONDITIONAL on `zip` being
  available (skip-if-absent, like the binary tests skip when `dist/` is unbuilt); the always-on E2E uses
  `tarball`. RECORD the tool-availability handling + which formats E2E actually ran.

> Output path: `<projectName>-<version>.<ext>` in the **cwd** (the directory the user ran the command from — the
> shell passes `env.cwd()`), with ext `.tgz` (tarball/git) / `.zip` (zip). Printing an absolute (or cwd-relative)
> path satisfies AC83#2 "prints the output path". Do NOT write into the project root (that would pollute the ship
> set on a re-run); write to cwd, or to a `dist/`-style sibling — PREFER cwd as doc-12's worked flow implies
> running from the project dir. RECORD the chosen output location.

### D4 — PUBLISH design (the INFRA, `src/adapters/packager.ts` push)

doc-10:183 is deliberately OPEN. Implement a **sensible, testable, HEADLESS minimal push** (AC84#1/#2):

1. **Build the package FIRST** (validate + lock-verify + produce the archive) — reuse the package path EXACTLY. A
   failure in any build step (validate, lock, or the archive itself) throws BEFORE the push → no push happens
   (AC84#2: "a failure in the build step prevents any push"). ORDER IS THE CONTRACT.
2. **Then push to `<destination>`.** Support these destination KINDS (detected from the destination string),
   testable without network/credentials:
   - **A local filesystem directory** (the destination is an existing dir, or a `file:` path): copy/move the built
     archive INTO it (`fs.copyTree(archive, join(dest, basename))` or a `runSync("cp", …)` — but PREFER the fs port
     `copyTree` since the archive is a single file). This is the E2E-able happy path (a local-dir destination).
   - **A git remote** (the destination looks like a git URL / remote name): `git push <destination>` via `runSync`
     (cwd = project root). HEADLESS-testable against a LOCAL bare git repo (`git init --bare` in a tmpdir, push to
     its path) — NO real network. (Document that a registry-URL push is the same shell-out it would be; defer the
     actual npm/registry publish as out-of-scope-for-v1, exactly as doc-12 §"What's deliberately not in the
     architecture": "No template registry … A real fetch/publish registry is a v2 conversation.")
   - **DEFER** (record explicitly): real npm-registry/HTTP publish (needs credentials + network) — note it as the
     shell-out it would be (`npm publish`/an HTTP PUT), not implemented in v1.
   RECORD exactly which destination kinds are supported + what is deferred + why.

### D5 — Should the ship-set + lock-read fs walk live in the SHELL or the PURE plan?

Two valid shapes; the repo's established convention (validate/bundle-list) is **the SHELL does the fs walk and
threads the result into a pure read** (`validateProjectSpec` takes the `bundles/` dir names as input;
`listBundlesSpec` takes the kind-counts map). BUT the build plan needs to walk a DEEP, prune-aware tree AND read
arbitrary file content for hashing — threading all of that as pre-computed input is awkward and would push the
walk logic into the shell (un-unit-testable in-memory). DECISION: **the pure `computeBuildPlan` walks via the
injected FileSystem PORT** (the port IS the pure-core's sanctioned disk abstraction — doc 13 §3: "the one
abstraction through which the pure core reaches the file tree"; `applyRerender`/`loadProject` in `lifecycle.ts`
already call `fs.exists`/`fs.read`/`fs.list` from pure core). So `computeBuildPlan(fs, root, { … })` is pure-over-
the-port (in-memory-testable with `MemoryFileSystem`), imports no `node:fs`. This is MORE faithful than threading,
and matches how `lifecycle.ts` already reads through the port from core. The SHELL only loads the project +
manifest (to get `enabledBundleIds`) and passes `fs` + `root` in. RECORD this choice (it is the right call; flag at
review that build's pure op reads via the port directly, like the lifecycle loader, rather than the
shell-threaded-input style of validate — both are legitimate doc-13 §3 patterns; build's deep content walk makes
port-reads-in-core the honest shape).

## THE FileSystem PORT OPS — all present, NO additions

`src/core/ports/filesystem.ts` (verified) already has everything R needs:
- `exists(path)` — the `wpm.lock` / bundle-dir presence probes.
- `read(path)` — read `manifest.yml`, `wpm.lock`, each vendored file (for hashing), each shippable file (the
  packager reads bytes to archive — BUT the packager is INFRA and may use `node:fs` directly, OR receive the
  shippable path list + root and shell out to `tar`/`zip`/`git` which read the files themselves; PREFER the latter
  — the archiving tool reads the files, the adapter just runs it).
- `list(path)` → `DirEntry[]` (name + kind) — the prune-aware ship-set walk + the vendored-tree walk. (Confirm
  whether `DirEntry`/`node-fs` distinguishes a symlink — see D2; if not, prune known alias names.)
- `copyTree(from, to)` — the local-dir publish (copy the built archive into the destination dir).
- `makeDirectories` / `write` — not needed by the pure plan; the packager (infra) writes the archive via the
  archiving tool, not the port.

**No FileSystem port additions.** The hashing reuses `hashArtifactFiles` (reads nothing — takes `VendoredFile[]`
the shell/plan supplies). [Source: `src/core/services/integrity.ts`.]

## PART A — `build dry-run` (task-82) — THE FOUNDATION (build FIRST, checkpoint)

### A1. The pure plan (`src/core/operations/build.ts`, NEW)

```ts
export interface VendoredArtifactSummary { readonly name: string; readonly source: string; readonly version: string; }
export interface BuildPlan {
  readonly ok: boolean;
  readonly validation: ValidationReport;          // task-20 — AC82#1
  readonly lock: VerifyResult & { readonly present: boolean };  // task-22 — AC82#2 (present:false ⇒ trivial pass)
  readonly vendored: readonly VendoredArtifactSummary[];        // for the per-artifact print (AC82#3)
  readonly shippable: readonly string[];          // sorted root-relative paths (AC82#3 / shared with package)
}

/** Compute the build plan (PURE over the FileSystem port — doc 13 §3). No effect; reads only. */
export function computeBuildPlan(fs: FileSystem, root: string, input: { project: Project; enabledBundleIds: readonly string[]; bundleDirNames: readonly string[] }): BuildPlan { … }
```

- (1) `validateProject(project, bundleDirNames)` → `validation` (AC82#1). `ok` requires `validation.ok`.
- (2) lock: if `!fs.exists(join(root, "wpm.lock"))` → `{ present:false, ok:true, drifted:[], missing:[], extra:[] }`
  (trivial pass). Else `parseLockfile(fs.read(...))`, re-read each pinned artifact's tree from
  `installer-skills/<name>/` via the port into `VendoredArtifact[]`, `verifyLockfile(lock, current)` (AC82#2).
- (3) `shippable = shippableFiles(fs, root, enabledBundleIds)` (D2 — sorted, prune-aware).
- (4) `vendored` = the parsed lock entries projected to `{name, source, version}` (empty when no lock).
- `ok = validation.ok && lock.ok`.

### A2. The shell leaf (`buildModule` in `cli.ts`, replacing `groupOnly("build", …)`)

```ts
const dryRun = group.command("dry-run")
  .description("validate + preview what would ship, producing no artefact (doc 10)")
  .action(() => {
    const root = requireProject(ctx, parent);                    // AC82#5
    const plan = loadBuildPlan(ctx, root);                       // loads project+manifest, calls computeBuildPlan
    ctx.io.out.write(formatBuildPlan(plan));                     // prints validation findings / lock status / the ship tree + vendored
    if (!plan.ok) throw new ValidationError("build dry-run failed: " + reason);  // AC82#4 exit 1
  });
withExamples(dryRun, [{ command: "wpm build dry-run", note: "preview the shippable file tree without producing an artefact" }]);
```

- AC82#1 fail-fast: when `!plan.validation.ok`, print the findings (same per-finding lines `project validate`
  uses) and throw `ValidationError` (exit 1). Validation is checked FIRST (the `ok` reason prioritises validation).
- AC82#2: when the lock check fails, print the drift/missing detail and throw (exit 1).
- AC82#3: on success print the ship tree (one relpath per line) + for each vendored artifact `name  version  source`.
  Produce NO artefact (dry-run calls no packager — verify nothing is written).
- AC82#4: exit 0 iff `plan.ok`; non-zero otherwise (the throw → exit 1; usage stays exit 2 for bad invocation).

### A3. CHECKPOINT after dry-run (cold gate the dry-run slice, report, THEN package).

## PART B — `build package [--format zip|tarball|git]` (task-83) — plan + ARCHIVE infra

### B1. The packager adapter (`src/adapters/packager.ts`, NEW — INFRA)

```ts
export type BuildFormat = "zip" | "tarball" | "git";
export interface PackageRequest { readonly root: string; readonly outDir: string; readonly baseName: string; readonly format: BuildFormat; readonly files: readonly string[]; }
/** Produce the archive; returns its path. Uses runSync (tar/git/zip). Throws a clear Error on a missing tool / failure. */
export function createArchive(req: PackageRequest): string { … }
```

- `tarball`: `tar -czf <out> -C <root> -T <listfile>` (write the sorted `files` to a temp list file). `<out> =
  <outDir>/<baseName>.tgz`.
- `git`: `git archive --format=tar.gz -o <out> HEAD` (cwd=root). `<out> = <outDir>/<baseName>.tgz`. (Ignores
  `files` — git ships its committed tree; record this nuance. Precondition: a git repo w/ a commit, else typed
  error.)
- `zip`: probe availability; if absent → throw a typed "zip not found — try --format tarball" error. Else `zip -r
  -q <out> <files…>` (cwd=root). `<out> = <outDir>/<baseName>.zip`.
- The CLI maps the adapter's thrown Error: a "tool not found"/usage-shaped failure → `UsageError`(exit 2) or a
  `ValidationError`(exit 1) — choose `UsageError` for "unsupported environment/tool" so it is distinct from a
  validate failure? NO — AC83#3 reserves exit 2 specifically for an unsupported `--format` VALUE (a bad CLI arg).
  A MISSING TOOL for a VALID format is an environment failure, not a bad arg → map to exit 1 (`ValidationError`) or
  surface as the adapter's Error (exit 1 unexpected). Keep exit 2 ONLY for the unsupported-`--format` case. RECORD.

### B2. The shell leaf

```ts
const pkg = group.command("package")
  .description("produce a distributable archive of the shippable set (doc 10)")
  .addOption(new Option("--format <format>", "the archive format").choices(["zip","tarball","git"]).default("zip"))
  .action((opts: { format: BuildFormat }) => {
    const root = requireProject(ctx, parent);                    // AC83#4
    const plan = loadBuildPlan(ctx, root);
    if (!plan.ok) { ctx.io.out.write(formatBuildPlan(plan)); throw new ValidationError(...); }  // AC83#1 fail BEFORE producing
    const out = createArchive({ root, outDir: ctx.deps.env.cwd(), baseName: `${plan.name}-${plan.version}`, format: opts.format, files: plan.shippable });
    ctx.io.out.write(`packaged → ${out}\n`);                     // AC83#2 prints the output path
  });
withExamples(pkg, [{ command: "wpm build package --format tarball", note: "produce a .tgz of the shippable set" }]);
```

- AC83#1: validate + lock BEFORE `createArchive` — the `if (!plan.ok) throw` guards it; nothing is produced on
  failure.
- AC83#2: default `zip` (the `.default("zip")` + `.choices`); prints the path.
- AC83#3: `.choices([...])` makes an unsupported `--format` value a commander error → exit 2 (the shared handler
  maps commander usage errors to 2). VERIFY this yields exit 2 (it does — `cli.ts` maps `CommanderError` non-help
  → 2). This is the cleanest way to get AC83#3 with no hand-rolled check.
- AC83#5 completion: `"build package": { options: { "--format": "build-formats" } }` in `COMPLETION_SPECS`. Need a
  `build-formats` fixed-enum completion source listing `zip`/`tarball`/`git` — add it to `src/completion/enums.ts`
  (the home of `BUMP_LEVELS`/`CONFIRMATION_LEVELS`) + register it in `src/completion/registry.ts` (the
  fixed-enum source registry). Mirror how `bump-levels`/`shells`/`confirmation-levels` are wired. The `<format>`
  enum is the model's single source — define `BUILD_FORMATS = ["zip","tarball","git"] as const` and use it for BOTH
  `.choices` AND the completion enum (no drift). RECORD where `BUILD_FORMATS` lives.

> NOTE the `plan.name`/`plan.version` — add the project name + version to the `BuildPlan` (read from
> `project.manifest.meta`) so the packager can name the archive without re-reading the manifest.

## PART C — `build publish <destination>` (task-84) — THE LAST TASK — package + PUSH infra

### C1. The shell leaf

```ts
const publish = group.command("publish")
  .description("build the package and push it to a destination (doc 10)")
  .argument("<destination>", "where to push the built package (a local directory, or a git remote)")
  .action((destination: string) => {
    const root = requireProject(ctx, parent);                    // AC84#3
    const plan = loadBuildPlan(ctx, root);
    if (!plan.ok) { ctx.io.out.write(formatBuildPlan(plan)); throw new ValidationError(...); }  // AC84#2 build fails ⇒ no push
    const archive = createArchive({ root, outDir: ctx.deps.env.cwd(), baseName: `${plan.name}-${plan.version}`, format: "zip"|default, files: plan.shippable });  // build FIRST (AC84#1)
    const where = pushArchive({ fs: ctx.deps.fs }, { archive, root, destination });             // THEN push
    ctx.io.out.write(`published ${archive} → ${where}\n`);       // AC84 success ⇒ exit 0
  });
withExamples(publish, [{ command: "wpm build publish ./dist-out", note: "build the package and place it in the ./dist-out directory" }]);
```

- AC84#1: `createArchive` (the full build) runs, THEN `pushArchive`. ORDER guaranteed by sequencing.
- AC84#2: the `if (!plan.ok) throw` (and any `createArchive` throw, e.g. a missing tool) fires BEFORE `pushArchive`
  → no push, exit 1. (TEST: a project that fails validate → publish exits non-zero AND the destination is
  untouched.)
- AC84#3: `requireProject` → no-project NotFound (exit 1).
- AC84#4: help has the `<destination>` positional (via `.argument` with a description) + a worked example.
- `pushArchive` (in `packager.ts`): if `destination` is an existing local dir (or `file:`) → copy the archive in
  (`fs.copyTree`); else treat as a git remote → `git push <destination>` (cwd=root) via runSync. RECORD the
  detection + the deferred registry case.

> `publish`'s archive format: doc-10:183 says "build package (above)" — package defaults to `zip`. But `zip` is
> absent on CI. DECISION: publish uses the SAME default format as package (`zip`), so the headless publish E2E must
> use a destination + a format that works WITHOUT zip → either (a) the publish E2E targets a local-dir destination
> AND the project is git-committed so the build can use a working tool, OR (b) give `publish` an OPTIONAL
> `--format` mirroring package, defaulting to `zip`, so the E2E can pass `--format tarball`. PREFER (b): add
> `--format` to publish too (it is "build package, then push" — exposing package's flag is natural + lets the
> headless E2E avoid zip). KEEP it minimal — same `BUILD_FORMATS` choices/default/completion as package. RECORD
> that publish accepts `--format` (a minimal, doc-consistent extension of "build package (above)").

## TASKS / SUBTASKS

- [ ] **T1 (task-82 / AC82#1-6) — `build dry-run` FIRST.** NEW `src/core/operations/build.ts`: `computeBuildPlan`
  (pure over the port) + `shippableFiles` (prune-aware ship-set walk) + the lock-verify (absent ⇒ trivial pass;
  present ⇒ re-read pinned trees + `verifyLockfile`). `buildModule` in `cli.ts` (replace the `groupOnly`): the
  `dry-run` leaf + `loadBuildPlan` shell glue + `formatBuildPlan` (output not a port). `withExamples`. **CHECKPOINT
  + cold gate the dry-run slice, report.**
- [ ] **T2 (task-83 / AC83#1-5) — `build package`.** NEW `src/adapters/packager.ts` `createArchive`
  (tar/git/zip over `runSync`; missing-`zip` typed error). `BUILD_FORMATS` const (model/enums) for choices +
  completion. `package` leaf (`.choices`+`.default("zip")`); `build-formats` completion source +
  `"build package": { options: { "--format": "build-formats" } }`. Map a tool-failure → exit 1, keep
  unsupported-`--format` → exit 2.
- [ ] **T3 (task-84 / AC84#1-4) — `build publish` — LAST.** `pushArchive` in `packager.ts` (local-dir copy /
  git-remote push; defer registry). `publish` leaf (`<destination>` positional + optional `--format`); build-first-
  then-push ordering; build-failure ⇒ no push (exit 1).
- [ ] **T4 (tests).** In-process unit AC tests (memory ports) for all of 82/83/84 incl. the pure `computeBuildPlan`
  / `shippableFiles` / lock-verify (drift + trivial-pass) in `test/unit/operations/build.test.ts` +
  `test/unit/cli/build-commands.test.ts`. Real-binary E2E in a NEW `test/integration/cli.build.e2e.test.ts` (see
  Testing). RUN ONE vitest at a time.
- [ ] **T5 (DoD).** tsc clean, biome clean (incl core-boundary — `build.ts` imports no node:fs/execa; archiving in
  the adapter/shell), all green; public fns documented; no dead code; help guard green for all three leaves.

## Dev Notes

### Files to CREATE
- `src/core/operations/build.ts` — the PURE plan (`computeBuildPlan`, `shippableFiles`, lock-verify, `BuildPlan`).
- `src/adapters/packager.ts` — the INFRA (`createArchive` tar/git/zip via `runSync`; `pushArchive` local-dir/git).
- `test/unit/operations/build.test.ts` — pure-plan unit tests (validate gate, lock trivial-pass + drift, ship-set
  enumeration with exclusions) over `MemoryFileSystem`.
- `test/unit/cli/build-commands.test.ts` — in-process CLI AC tests (memory ports) for the three leaves.
- `test/integration/cli.build.e2e.test.ts` — real-`dist/cli.js`-vs-real-disk E2E (see below).

### Files to UPDATE (read first — current state / changes / preserve)
- `src/cli.ts` — replace `groupOnly("build", "package the project for distribution (doc 10)")` in
  `TOP_LEVEL_MODULES` with a real `buildModule` (the three leaves + `loadBuildPlan`/`formatBuildPlan` shell glue);
  add `"build package"`/`"build publish"` to `COMPLETION_SPECS`. PRESERVE: `requireProject`, the
  `NO_PROJECT_MESSAGE`, `runRead`/`loadProject` patterns, `formatResult`, every existing module + the
  per-bundle routing. Import `computeBuildPlan` from the new op + `createArchive`/`pushArchive` from the adapter +
  `BUILD_FORMATS`.
- `src/completion/enums.ts` — add `BUILD_FORMATS = ["zip","tarball","git"] as const` (mirror `BUMP_LEVELS`).
- `src/completion/registry.ts` — register the `"build-formats"` fixed-enum source (mirror `"bump-levels"`/
  `"shells"`).
- `src/adapters/index.ts` — export the packager if the adapters barrel is used (check; `cli.ts` may import the
  module directly like it does `backlog-cli`/`node-fs`).

### Current state of the key UPDATE files (analysed)
- `src/cli.ts` `TOP_LEVEL_MODULES` (~3048): `build` is `groupOnly(...)` — a bare group with NO leaves. Replace with
  `buildModule` (a `CommandModule` registering `group = parent.command("build")` + the three `.command()` leaves),
  exactly like `completionModule`/`projectModule`. `requireProject(ctx, parent)` (~204) is the shared no-project
  guard (returns the root or throws `NotFoundError` with `NO_PROJECT_MESSAGE`) — REUSE for all three leaves
  (AC82#5/83#4/84#3). `runRead`/`loadProject` show how core reads the project; `bundleDirectoryNames(fs, root)`
  (~2770) already enumerates `bundles/` dir names for validate — REUSE it to feed `computeBuildPlan` (validate +
  the enabled-vs-disabled ship-set decision). `ctx.deps.env.cwd()` gives the output dir.
- `src/core/services/validate.ts` `validateProject(project, bundleDirNames)` → `ValidationReport` (aggregates all
  problems). REUSE as-is for AC*#1. The `project validate` leaf (~2731) is the formatting model for findings.
- `src/core/services/integrity.ts` — `parseLockfile(text)→Lockfile` (throws on malformed), `verifyLockfile(lock,
  current)→VerifyResult {ok,drifted,missing,extra}`, `VendoredArtifact {name,source,version,files}`, `VendoredFile
  {path,content}`, `hashArtifactFiles`. REUSE: read `wpm.lock` + each pinned artifact's tree, build
  `VendoredArtifact[]` (files from disk), call `verifyLockfile`. Feed ONLY the pinned names (so `extra` is empty by
  construction — an authored installer skill is not flagged). NO new integrity code.
- `src/util/shell.ts` `runSync(file, args, {cwd, env})→{stdout,stderr,exitCode}` (throws a clear Error on non-zero
  / spawn failure). The packager's ONLY subprocess seam. A spawn failure (tool absent) throws "Command could not be
  run: …" — catch it to produce the typed missing-tool error.
- `src/core/operations/lifecycle.ts` `loadProject(fs, root)` (~149) — the manifest+bundle load pattern the shell's
  `loadBuildPlan` mirrors to get the `Project` + `enabledBundleIds` (= `manifest.bundles`). `applyRerender`/
  `loadProject` PROVE pure core reads via `fs.exists/read/list` (the port) — the precedent for D5 (the build plan
  walking via the port).
- `src/core/operations/init-project.ts` — confirms the on-disk shape a build sees: `manifest.yml`, `AGENTS.md`,
  `installer-skills/<project>-installer/`, `templates/`, `bundles/bundle-template/`, `.authoring-backlog/` (+
  `.gitignore` listing it). The ship-set must EXCLUDE `.authoring-backlog/` (init created it; it is builder-time
  state). `installer-skills/` of a fresh project has only the authored installer skill → no `wpm.lock` → trivial
  lock pass.
- `src/core/ports/filesystem.ts` — `read`/`exists`/`list`(`DirEntry{name,kind}`)/`copyTree`/`write`/
  `makeDirectories`/`remove`/`ensureAlias`. The pure plan uses `read`/`exists`/`list`; the publish local-dir copy
  uses `copyTree`. **Check whether `DirEntry`/`node-fs` distinguishes a symlink** (for the D2 don't-recurse-symlink
  rule) — if `list` reports a symlinked dir as `kind:"directory"` with no symlink flag, prune the known scope-alias
  names instead. RECORD.

### Testing standards summary
- vitest two projects (`unit` parallel in-memory; `integration` serial, `fileParallelism:false`,
  `testTimeout:60000`). **RUN ONE vitest at a time** (the integration project shares real `backlog`/`dist` + the
  src/core fixture; concurrent runs collide into false failures). If a stray `core` dump appears in the repo root
  from a crashed subprocess, remove it.
- **In-process unit** (memory ports): pure `computeBuildPlan`/`shippableFiles` over `MemoryFileSystem` — seed a
  `/proj` manifest + a couple of bundles (one enabled, one disabled-and-still-present) + a `wpm.lock` pinning a
  vendored `installer-skills/<name>/` tree; assert (a) trivial pass with no lock, (b) drift detection when a pinned
  file's content changes, (c) the ship set EXCLUDES `.authoring-backlog/`/`.git/`/the disabled bundle dir and
  INCLUDES the enabled bundle + `bundle-template/`. CLI leaves over memory ports (mirror
  `bundle-template-commands.test.ts`): dry-run exit 0 + prints the tree (no file written); a validate-failing
  project → dry-run exit 1; an unsupported `--format` → exit 2.
- **Real-binary E2E** (`cli.build.e2e.test.ts`, `describeIfBuilt` on `dist/cli.js` + `withTempDir`, FakeBacklog or
  real — `init` stands up the project): use `init` (now FULL) to create a fresh project, then:
  - `build dry-run` → exit 0, prints a would-ship tree containing `manifest.yml`/`AGENTS.md`, does NOT print
    `.authoring-backlog`, and NO archive file is created (AC82#3/#4). [trivial lock pass — no `wpm.lock`.]
  - a dry-run that FAILS validation → exit ≠ 0 (AC82#4). [Make it fail: e.g. add a `requires` to a missing bundle,
    or an orphan unlisted bundle dir — `validateProject` then reports a problem. SIMPLEST: create a bundle dir
    under `bundles/` not in the manifest that is NOT `bundle-template/` → orphan finding → validate fails. Or set
    targets empty (minimal already has none → validate flags "no target agents declared"!) — minimal `init`
    declares NO targets, so `project validate` ALREADY fails on a fresh minimal project with "no target agents".
    USE THAT: a fresh minimal project's `build dry-run` FAILS validate (no targets) → exit 1; add a target
    (`project targets add claude-code`) to make validate pass → dry-run exits 0. This is the cleanest pass/fail
    pair + exercises the validate gate honestly. RECORD this — it means the "happy" dry-run E2E must FIRST
    `project targets add claude-code`.]
  - `build package --format tarball` → exit 0, a real `.tgz` exists at the printed path, and untarring it yields
    `manifest.yml` + `AGENTS.md` and NOT `.authoring-backlog/` (AC83#1/#2). [+ `--format zip` ONLY if `zip` is
    available — skip-if-absent.]
  - `build package --format bogus` → exit 2 (AC83#3).
  - `build publish <local-dir>` (`--format tarball`) → exit 0, the archive lands in `<local-dir>` (AC84#1). [Make
    the project validate-clean first via `project targets add`.]
  - a `build publish` whose build FAILS (validate fails — a fresh no-targets project, or a re-broken one) → exit
    ≠ 0 AND `<local-dir>` is empty (no push — AC84#2).
  - `--help` for each leaf → exit 0 with the description/synopsis/example (+ `--format` values for package) — the
    task-28 help guard already enforces this; assert it for the three leaves (AC82#6/83#5/84#4).

### Project structure notes
- `build` is a TOP-LEVEL group (`buildModule` in `TOP_LEVEL_MODULES`), NOT per-bundle. It does not touch
  `PER_BUNDLE_MODULES`.
- Core import-boundary: the ONLY core addition is `src/core/operations/build.ts`, which imports model/services/
  ports + `node:path` — NO `node:fs`/`execa`/`commander`. ALL archiving/pushing/subprocess lives in
  `src/adapters/packager.ts` (infra, MAY use `node:fs`/`runSync`) + the `cli.ts` shell. The
  `test/integration/core-boundary.test.ts` fixture will catch a violating import — keep `build.ts` clean.
- `runSync` is the sanctioned subprocess seam (execa already a dep) — NO new dependency. If a reviewer questions
  passing thousands of file args to `tar`, the `-T <listfile>` form (write a temp list) is the robust answer.

### References
- [Source: docs/10 §Per-command actions rows 181 (`build dry-run`) + 182 (`build package [--format …]`) + 183
  (`build publish <destination>`).]
- [Source: docs/12 §"Distribution and the user's install experience" (npm `i -g` ships the repo; no registry) +
  §"Templates as data" ("no separate publish step that transforms it") + §"What's deliberately not in the
  architecture" ("No template registry … a real fetch/publish registry is a v2 conversation") + §"Layered
  architecture"/§"Adapter / infrastructure layer" (effects at the bottom; CLI thin).]
- [Source: docs/06 lines 12–97 (the project skeleton = the shippable set; `wpm.lock` `[OPT]` at root line 25–27;
  the disabled-dir hard rule line 153 "the build never includes it").]
- [Source: docs/08 §"Pinning and integrity for vendored third-party content" lines 70–76 (`wpm.lock` pins each
  vendored artifact to version + content hash; `wpm build` recomputes + fails on drift = `--frozen-lockfile`; the
  plan-preview lists each vendored artifact with locked version + source).]
- [Source: docs/13 §1 (purity), §3 (ports + "the one abstraction through which the pure core reaches the file
  tree" + output-not-a-port), §5/§8 (lifecycle/read trace), §7 (error model → exit codes).]
- [Source: src/core/services/validate.ts `validateProject`; src/core/services/integrity.ts `parseLockfile`/
  `verifyLockfile`/`VendoredArtifact`/`hashArtifactFiles`; src/util/shell.ts `runSync`; src/cli.ts
  `requireProject`/`bundleDirectoryNames`/`TOP_LEVEL_MODULES`/`COMPLETION_SPECS`; src/core/operations/lifecycle.ts
  `loadProject`/`applyRerender` (pure core reads via the port); src/core/operations/init-project.ts (the on-disk
  shape build sees); src/completion/enums.ts + registry.ts (the fixed-enum source pattern).]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — BMAD build worker #13.

### Completion Notes List
- RECORD: where `wpm.lock` lives (project root, `[OPT]`), what "vendored" means (third-party content in
  `installer-skills/`, pinned name/source/version/hash), and the FRESH-PROJECT TRIVIAL PASS (no lock ⇒ vacuous
  pass; only pinned names are re-read so `extra` is never spuriously flagged).
- RECORD: the SHIPPABLE set + its exclusions (`.authoring-backlog/`, `.git/`, `node_modules/`, `dist/`, disabled
  bundle dirs; `bundle-template/` kept) and that ONE `shippableFiles` feeds BOTH dry-run's print and package's
  archive.
- RECORD: the ARCHIVING design — tool per format (tarball→`tar -T`, git→`git archive HEAD`, zip→`zip` with a typed
  missing-tool error), availability handling (zip absent on CI), and the output location (cwd, `<name>-<version>.
  <ext>`).
- RECORD: the PUBLISH design — destination kinds supported (local dir via fs copy; git remote via `git push`),
  what is deferred (real npm/registry publish — the shell-out it would be) + why; that build runs BEFORE push so a
  build failure prevents any push.
- RECORD: D5 — the pure `computeBuildPlan` reads via the FileSystem PORT directly (like `lifecycle.ts`'s loader),
  not the shell-threaded-input style of `validate`, and why (the deep content walk for hashing + ship-set).
- RECORD: the symlink/scope-alias handling in the ship-set walk (don't-recurse-symlink vs prune-known-alias-names —
  whichever shipped) so aliases aren't double-counted.
- RECORD: `publish` accepts `--format` (a minimal extension of "build package (above)") so the headless E2E avoids
  the absent `zip`; and the missing-tool → exit 1 vs unsupported-`--format` → exit 2 distinction.
- RECORD: which BMAD skills ran (create-story / dev-story / qa-generate-e2e-tests / story-automator-review) — the
  Rule-3 evidence trail.
- RECORD: per-AC evidence (each of 82#1-6, 83#1-5, 84#1-4 → a test or a real-binary command+output).

### File List
(to be filled by dev-story)
