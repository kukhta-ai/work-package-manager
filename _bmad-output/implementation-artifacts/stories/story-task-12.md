# Story task-12 — Implement the FileSystem port (real + in-memory adapters)

> Lean implementation spec (BMAD create-story output). Doc 13 §3 — the FIRST port + the first
> `src/adapters/` code. The PORT lives under `src/core/ports/` (boundary rule applies — but an interface
> imports nothing effectful, so it's trivially clean); the ADAPTERS live in `src/adapters/` (outside the
> core, so they MAY use `node:fs`/`node:os`/`node:path`/`process`). **The core is SYNCHRONOUS** — all port
> methods + adapters are sync (`node:fs` sync APIs); no Promises/async (cross-cutting decision; task-14 uses
> `execaSync` for the same reason).

## Acceptance criteria (the contract)
1. All file-system access is reached through one replaceable abstraction, so logic can run against an
   in-memory file system in tests.
2. A write either fully succeeds or leaves the previous file intact — no partial/corrupt file is ever
   observed after an interrupted write.
3. Requesting a scope alias yields a working alias on POSIX, and on Windows falls back to a copy with the
   user warned, without the caller knowing which happened (doc 12).
4. Writing into a not-yet-existing directory path succeeds, creating parents as needed.

## Op list (doc 13 §3, verbatim intent) — the `FileSystem` interface
read · write (atomic: temp-write then rename) · exists · make-directories · list · copy-tree · remove ·
ensure-alias. "Nothing more; the core's disk vocabulary is deliberately small." Output is NOT a port: the
adapter RETURNS the alias result/warning, never prints (doc 13 §3).

## File layout
- `src/core/ports/filesystem.ts` — the pure `FileSystem` interface (sync) + supporting types:
  - `DirEntry` = `{ name: string; kind: "file" | "directory" }` (list returns names + kind — what the
    builder needs).
  - `AliasResult` = `{ kind: "symlink" } | { kind: "copy"; warning: string }` (caller never branches on
    platform; the OPERATION surfaces `warning`).
  - methods: `read(path): string`, `write(path, content): void` (atomic + auto-mkdir parents),
    `exists(path): boolean`, `makeDirectories(path): void`, `list(path): DirEntry[]`,
    `copyTree(from, to): void`, `remove(path): void` (recursive+force, no error if absent),
    `ensureAlias(target, linkPath): AliasResult`.
- `src/core/ports/index.ts` — barrel.
- `src/util/symlink.ts` — the symlink-vs-copy STRATEGY (doc 12: "detection logic lives in
  src/util/symlink.ts"). A pure-ish helper: `ensureSymlinkOrCopy(target, linkPath, opts?)` where `opts`
  carries an injectable `platform` (default `process.platform`) and the fs primitives, so BOTH branches are
  unit-testable on Linux: `platform === "win32"` → recursive copy + return `{kind:"copy", warning}`; else
  `symlinkSync` + return `{kind:"symlink"}`. Keep it small; it uses node builtins (it's util, outside core).
- `src/adapters/node-fs.ts` — `NodeFileSystem implements FileSystem` using `node:fs` SYNC APIs:
  - **atomic write (AC#2):** ensure parent dir (`mkdirSync recursive`), write to a UNIQUE temp file in the
    SAME directory (`<name>.<pid>.<rand>.tmp` — rand via `crypto.randomBytes`), then `renameSync(tmp,
    target)` (atomic on same fs). On any failure, best-effort unlink the temp so no `.tmp` residue. A crash
    mid-write leaves the original intact; a partial temp is never seen as the target.
  - `read` = `readFileSync(path, "utf8")`; `exists` = `existsSync`; `makeDirectories` = `mkdirSync(recursive)`;
    `list` = `readdirSync(path, {withFileTypes})` → `DirEntry[]`; `copyTree` = `cpSync(from, to,
    {recursive})` (preserves bytes incl. binary); `remove` = `rmSync(path, {recursive, force})`.
  - `ensureAlias` delegates to `src/util/symlink.ts` (default `process.platform`), returning its
    `AliasResult` — adapter does NOT print.
- `src/adapters/memory-fs.ts` — `MemoryFileSystem implements FileSystem`, a `Map<string, string>`-backed
  fake (PURE — no node:fs). Stores files by normalized absolute-ish path; tracks directories implicitly +
  an explicit dir set (so empty makeDirectories + list work). write is atomic-by-nature (single Map set) and
  auto-creates parents; copyTree copies entries under a prefix; remove deletes a path + its subtree;
  ensureAlias records the alias (target→linkPath) and reports `{kind:"symlink"}`. Faithful + complete (the
  lifecycle tests in task-25/26 reuse it).
- `src/adapters/index.ts` — barrel.
- Path normalization: use `node:path` (pure, allowed even in core) in adapters for join/dirname; memory-fs
  uses a small normalizer (posix-style) so tests are deterministic cross-platform.

## ensureAlias testability (AC#3) — DECISION
Injected `platform` strategy (default `process.platform`), NOT induced-symlink-failure. A unit test calls
`ensureSymlinkOrCopy(target, link, {platform: "win32", ...})` to force the copy branch and asserts the tree
was copied + `{kind:"copy", warning}`; the POSIX branch is covered by the real-adapter integration test
(symlink created + resolves to target) and a `{platform:"linux"}` unit test. Both branches unit-testable on
Linux. (Chose injection over try/catch-fallback: deterministic, and the warning text is asserted exactly.)

## Tests
- `test/unit/adapters/memory-fs.test.ts` (pure): every op — write+read, overwrite, write-creates-parents
  (AC#4), exists, makeDirectories (+empty dir lists), list (names+kind), copyTree, remove (incl. absent =
  no-op), ensureAlias records + reports symlink.
- `test/unit/util/symlink.test.ts` (pure-ish, real tmpdir for the copy/symlink effect): force
  `platform:"win32"` → copy branch (tree copied + `{kind:"copy", warning}`); `platform:"linux"` → symlink
  branch (`{kind:"symlink"}`, link resolves to target). Uses task-6 `withTempDir`.
- `test/integration/adapters/node-fs.test.ts` (real tmpdir via task-6 helper): write+read round-trip;
  **AC#2 atomic** — overwrite fully replaces (no partial); assert NO leftover `*.tmp` in the dir after a
  write; (best-effort) a failed write (e.g. target path is a directory) throws but leaves the original file
  intact + no tmp residue; **AC#4** write-creates-parents; ensureAlias on POSIX → working symlink (readlink/
  realpath → target); copyTree (incl. nested + binary bytes), remove, list, makeDirectories, exists.

## Gate / DoD
- PORT pure (boundary clean — imports nothing effectful; verify biome). Adapters outside core (node builtins
  OK). `tsc --noEmit` clean, `biome check .` clean, `vitest run` green. No new npm deps (node:fs built in).
  JSDoc every interface method + adapter; no dead code.

## Boundaries (do NOT do here)
- No Clock/Environment ports (task-15) — DON'T take a platform from an Environment port (doesn't exist yet);
  the strategy's injectable `platform` defaults to `process.platform` inside the util/adapter. No BacklogMd
  (task-14). No async. Don't edit docs/, AGENTS.md, backlog/, .bmad/, task-5's biome.json, task-10/11.
