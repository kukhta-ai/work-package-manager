import type { AliasResult, DirEntry, FileSystem } from "../core/ports/filesystem.js";

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
    const p = this.normalize(path);
    return this.files.has(p) || this.directories.has(p);
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
  }

  /**
   * Record an alias and report it as a symlink. The in-memory fake has no real platform, so it always uses
   * the symlink kind (the Windows-copy fallback is the real adapter's concern, exercised via
   * `src/util/symlink.ts`).
   *
   * @inheritdoc
   */
  ensureAlias(target: string, linkPath: string): AliasResult {
    const link = this.normalize(linkPath);
    this.aliases.set(link, this.normalize(target));
    this.recordDir(this.parentOf(link));
    return { kind: "symlink" };
  }

  /**
   * Test-only accessor: the target an alias points at, or `undefined` if no alias exists at `linkPath`.
   *
   * @param linkPath - The alias location to look up.
   * @returns The normalized target path, or `undefined`.
   */
  aliasTarget(linkPath: string): string | undefined {
    return this.aliases.get(this.normalize(linkPath));
  }
}
