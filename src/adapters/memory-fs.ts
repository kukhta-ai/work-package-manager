import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import type {
  AliasResult,
  DirEntry,
  FileSystem,
  PathInspection,
} from "../core/ports/filesystem.js";
import { toPosix } from "../util/posix-path.js";

/**
 * An in-memory {@link FileSystem} (doc 13 §1) — the fake that lets the pure core's logic run entirely in
 * memory in tests (AC#1). Pure: it uses no `node:fs`, only `Map`/`Set`, so it is deterministic and needs no
 * tmpdir. The lifecycle/operation tests (tasks 25/26) reuse it, so it is a faithful, complete implementation
 * of every operation.
 *
 * Paths are normalized to a POSIX-style absolute form (leading `/`, no `.`/`..` segments, no trailing slash)
 * so behaviour is identical regardless of the host OS. Files live in a `Map<path, content>`; directories are
 * tracked in a `Set<path>` (every ancestor of a written file is recorded, and empty directories are
 * representable via {@link makeDirectories}).
 */
export class MemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>(["/"]);
  /** Recorded aliases (linkPath → target), so tests can assert what was aliased. */
  private readonly aliases = new Map<string, string>();

  /** Recognize both supported absolute-path dialects without depending on the test runner's host platform. */
  private isAbsolute(path: string): boolean {
    return posix.isAbsolute(path) || win32.isAbsolute(path);
  }

  /**
   * Normalize a path to a POSIX-style absolute path: forward slashes, a leading `/`, `.`/`..` resolved, and
   * no trailing slash (except the root). Relative inputs are treated as rooted at `/`.
   */
  private normalize(path: string): string {
    const segments: string[] = [];
    for (const raw of path.replace(/\\/g, "/").split("/")) {
      if (raw === "" || raw === ".") continue;
      if (raw === "..") {
        segments.pop();
        continue;
      }
      segments.push(raw);
    }
    return `/${segments.join("/")}`;
  }

  /** The normalized parent directory of a normalized path (`/` for top-level entries). */
  private parentOf(normalized: string): string {
    const idx = normalized.lastIndexOf("/");
    return idx <= 0 ? "/" : normalized.slice(0, idx);
  }

  /** Record `dir` and all of its ancestors as existing directories. */
  private recordDir(dir: string): void {
    let current = dir;
    while (true) {
      this.directories.add(current);
      if (current === "/") break;
      current = this.parentOf(current);
    }
  }

  /** @inheritdoc */
  read(path: string): string {
    const p = this.normalize(path);
    const content = this.files.get(p);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file, read '${p}'`);
    }
    return content;
  }

  /**
   * Write atomically by nature — a single `Map` set is indivisible, so a partial file is impossible — and
   * create parent directories as needed (AC#2, AC#4).
   *
   * @inheritdoc
   */
  write(path: string, content: string): void {
    const p = this.normalize(path);
    if (this.directories.has(p)) {
      throw new Error(`EISDIR: illegal operation on a directory, write '${p}'`);
    }
    this.recordDir(this.parentOf(p));
    this.files.set(p, content);
  }

  /** @inheritdoc */
  exists(path: string): boolean {
    return this.existsResolved(this.normalize(path), new Set<string>());
  }

  /** @inheritdoc */
  inspectPath(path: string): PathInspection {
    const p = this.normalize(path);
    const target = this.aliases.get(p);
    if (target !== undefined) {
      return { kind: "symbolic-link", target };
    }
    if (this.files.has(p)) {
      return { kind: "file" };
    }
    if (this.directories.has(p)) {
      return { kind: "directory" };
    }
    return { kind: "missing" };
  }

  /** @inheritdoc */
  digestFile(path: string): string {
    return createHash("sha256").update(this.read(path), "utf8").digest("hex");
  }

  /** @inheritdoc */
  readWithDigest(path: string): { content: string; sha256: string } {
    const content = this.read(path);
    return {
      content,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    };
  }

  /** @inheritdoc */
  canonicalPath(path: string): string {
    const normalized = this.normalize(path);
    const inspection = this.inspectPath(normalized);
    if (inspection.kind === "missing") {
      throw new Error(`ENOENT: no such path, realpath '${normalized}'`);
    }
    if (inspection.kind === "symbolic-link") {
      return this.resolveAliasTarget(normalized, inspection.target);
    }
    return normalized;
  }

  /**
   * Faithful existence check that **follows aliases the way `existsSync` follows a symlink** (the real
   * adapter's behaviour). A direct file or directory at `p` exists. Otherwise, if `p` is a recorded alias
   * link, its existence is that of its *target* — so a **broken** alias (target absent) is `false`, exactly as
   * `existsSync` returns `false` for a dangling symlink. Alias chains are followed transitively; a cycle is
   * bounded by a visited-set and reported as `false`, mirroring `existsSync`'s `ELOOP → false` (so the fake
   * can never loop forever). This parity matters because a derivation's idempotency (task-19 `planChanges` /
   * task-25 lifecycle) probes `exists(linkPath)`: a non-broken alias must read as present so it is not
   * "re-created" on a redundant re-run.
   */
  private existsResolved(p: string, visited: Set<string>): boolean {
    if (this.files.has(p) || this.directories.has(p)) return true;
    const target = this.aliases.get(p);
    if (target === undefined) return false;
    if (visited.has(p)) return false; // alias cycle → ELOOP-equivalent
    visited.add(p);
    return this.existsResolved(this.resolveAliasTarget(p, target), visited);
  }

  /**
   * Resolve an alias's stored (raw) target to an absolute path the way a real symlink resolves: an absolute
   * target is taken as-is; a **relative** target is resolved against the link's PARENT directory (POSIX
   * symlink semantics), not the cwd. This is what lets the fake faithfully model a *relative* alias such as
   * the per-bundle `backlog → install-backlog` link (TASK-102): the raw `install-backlog` is preserved for
   * inspection (see {@link aliasTarget}) yet still resolves under the bundle dir for {@link exists}.
   */
  private resolveAliasTarget(link: string, rawTarget: string): string {
    const t = toPosix(rawTarget);
    return this.isAbsolute(rawTarget)
      ? this.normalize(t)
      : this.normalize(`${this.parentOf(link)}/${t}`);
  }

  /** @inheritdoc */
  makeDirectories(path: string): void {
    this.recordDir(this.normalize(path));
  }

  /** @inheritdoc */
  list(path: string): DirEntry[] {
    const dir = this.normalize(path);
    // Match node's distinction: listing a path that is a file is ENOTDIR (not "doesn't exist").
    if (this.files.has(dir)) {
      throw new Error(`ENOTDIR: not a directory, list '${dir}'`);
    }
    if (!this.directories.has(dir)) {
      throw new Error(`ENOENT: no such directory, list '${dir}'`);
    }
    const prefix = dir === "/" ? "/" : `${dir}/`;
    const names = new Map<string, "file" | "directory">();
    const collect = (fullPath: string, kind: "file" | "directory") => {
      if (!fullPath.startsWith(prefix) || fullPath === dir) return;
      const rest = fullPath.slice(prefix.length);
      const name = rest.split("/")[0];
      if (name === undefined || name === "") return;
      // A name that has deeper segments is a directory; mark directories as such, never downgrade.
      const childKind: "file" | "directory" = rest.includes("/") ? "directory" : kind;
      if (childKind === "directory" || !names.has(name)) {
        names.set(name, childKind);
      }
    };
    for (const filePath of this.files.keys()) collect(filePath, "file");
    for (const dirPath of this.directories) collect(dirPath, "directory");
    // Match NodeFileSystem.list: a symbolic link is a non-directory entry at this surface. Callers that need
    // its concrete no-follow kind use inspectPath on the child after listing it.
    for (const aliasPath of this.aliases.keys()) collect(aliasPath, "file");
    return [...names].map(([name, kind]) => ({ name, kind }));
  }

  /** @inheritdoc */
  copyTree(from: string, to: string): void {
    const src = this.normalize(from);
    const dst = this.normalize(to);
    if (this.files.has(src)) {
      // Copying a single file.
      this.write(dst, this.files.get(src) as string);
      return;
    }
    if (!this.directories.has(src)) {
      throw new Error(`ENOENT: no such file or directory, copyTree '${src}'`);
    }
    this.recordDir(dst);
    const srcPrefix = src === "/" ? "/" : `${src}/`;
    // Copy every directory and file living under the source prefix, re-rooted at the destination.
    for (const dirPath of [...this.directories]) {
      if (dirPath.startsWith(srcPrefix)) {
        this.recordDir(`${dst}/${dirPath.slice(srcPrefix.length)}`);
      }
    }
    for (const [filePath, content] of [...this.files]) {
      if (filePath.startsWith(srcPrefix)) {
        this.files.set(`${dst}/${filePath.slice(srcPrefix.length)}`, content);
        this.recordDir(this.parentOf(`${dst}/${filePath.slice(srcPrefix.length)}`));
      }
    }
  }

  /** @inheritdoc */
  remove(path: string): void {
    const p = this.normalize(path);
    // Remove the path itself and everything beneath it; absent path is a no-op (force semantics).
    this.files.delete(p);
    const prefix = `${p}/`;
    for (const filePath of [...this.files.keys()]) {
      if (filePath.startsWith(prefix)) this.files.delete(filePath);
    }
    for (const dirPath of [...this.directories]) {
      if (dirPath === p || dirPath.startsWith(prefix)) {
        if (dirPath !== "/") this.directories.delete(dirPath);
      }
    }
    // Also drop any alias whose LINK path is `p` or sits beneath it — faithful to the real adapter, where
    // `remove` unlinks a symlink (so a later `exists` of the link path returns false). Without this an
    // alias entry would survive `remove`, masking the deletion a scope-alias teardown (e.g. `targets remove`)
    // depends on.
    for (const linkPath of [...this.aliases.keys()]) {
      if (linkPath === p || linkPath.startsWith(prefix)) {
        this.aliases.delete(linkPath);
      }
    }
  }

  /**
   * Record an alias and report it as a symlink. The in-memory fake has no real platform, so it always uses
   * the symlink kind (the Windows-copy fallback is the real adapter's concern, exercised via
   * `src/util/symlink.ts`). A relative target is stored **verbatim** (raw), exactly as a real symlink keeps it;
   * an absolute target is normalized to this fake's POSIX observation dialect. Thus the portable
   * `backlog → install-backlog` link (TASK-102) stays byte-for-byte relative, while a Win32 absolute target is
   * exposed with `/` separators. Resolution for {@link exists} happens in {@link resolveAliasTarget}.
   *
   * @inheritdoc
   */
  ensureAlias(target: string, linkPath: string): AliasResult {
    const link = this.normalize(linkPath);
    // This fake exposes a POSIX namespace. Normalize an OS-native ABSOLUTE target only at the observation
    // boundary where it is recorded, while preserving a relative symlink target byte-for-byte (archive
    // portability relies on values such as `install-backlog` remaining exactly relative).
    this.aliases.set(link, this.isAbsolute(target) ? toPosix(target) : target);
    this.recordDir(this.parentOf(link));
    return { kind: "symlink" };
  }

  /**
   * Test-only accessor: the observed target an alias points at, or `undefined` if no alias exists at
   * `linkPath`. An absolute target reads back in POSIX form; a relative target reads back verbatim (so a test
   * can assert a link is RELATIVE, e.g. `backlog → install-backlog`).
   *
   * @param linkPath - The alias location to look up.
   * @returns The observed target path the link stores, or `undefined`.
   */
  aliasTarget(linkPath: string): string | undefined {
    return this.aliases.get(this.normalize(linkPath));
  }
}
