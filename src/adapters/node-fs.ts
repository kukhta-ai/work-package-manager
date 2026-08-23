import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  AliasResult,
  DirEntry,
  FileSystem,
  PathInspection,
} from "../core/ports/filesystem.js";
import { ensureSymlinkOrCopy, type SymlinkStrategyOptions } from "../util/symlink.js";

/**
 * The real {@link FileSystem} adapter, backed by `node:fs` synchronous APIs (the core is synchronous —
 * doc 13 §0). It lives under `src/adapters/`, outside the pure core, so using `node:fs`/`node:path`/
 * `node:crypto` here is correct — the import-boundary rule forbids those only under `src/core/`.
 *
 * The composition root (`cli.ts`, task-27) constructs one of these; tests use {@link MemoryFileSystem}
 * instead.
 */
export class NodeFileSystem implements FileSystem {
  /**
   * @param aliasOptions - Optional injected symlink/copy strategy (platform + primitives), forwarded to
   *   {@link ensureSymlinkOrCopy}. Defaults to the real environment; tests inject `platform: "win32"` to
   *   exercise the copy fallback.
   */
  constructor(private readonly aliasOptions: SymlinkStrategyOptions = {}) {}

  /** @inheritdoc */
  read(path: string): string {
    return readFileSync(path, "utf8");
  }

  /**
   * Write `content` to `path` atomically (doc 13 §3): create the parent directory, write to a unique temp
   * file in the **same** directory, then `renameSync` it over the target (rename is atomic within one
   * filesystem). If anything fails before the rename, the temp file is unlinked so no `.tmp` residue is left
   * and the pre-existing target is untouched.
   *
   * @inheritdoc
   */
  write(path: string, content: string): void {
    const dir = dirname(path);
    const newlyCreatedCandidates: string[] = [];
    let current = dir;
    while (!existsSync(current)) {
      newlyCreatedCandidates.push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    let tmp: string | undefined;
    try {
      mkdirSync(dir, { recursive: true });
      // Unique temp name in the same directory so the rename stays on one filesystem (and is therefore atomic).
      tmp = join(dir, `.${randomBytes(8).toString("hex")}.tmp`);
      writeFileSync(tmp, content, "utf8");
      renameSync(tmp, path);
    } catch (err) {
      // Best-effort cleanup; never let cleanup mask the original error. Removing only empty directories that
      // were absent before this call makes a failed first bootstrap write retryable without deleting raced-in
      // user content.
      if (tmp !== undefined) {
        try {
          unlinkSync(tmp);
        } catch {
          // ignore — the temp may not have been created or may already have been renamed
        }
      }
      for (const created of newlyCreatedCandidates) {
        try {
          rmdirSync(created);
        } catch {
          // ignore — absent/non-empty directories are either already clean or contain content we must preserve
        }
      }
      throw err;
    }
  }

  /** @inheritdoc */
  exists(path: string): boolean {
    return existsSync(path);
  }

  /** @inheritdoc */
  inspectPath(path: string): PathInspection {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        return { kind: "symbolic-link", target: readlinkSync(path) };
      }
      if (stat.isDirectory()) {
        return { kind: "directory" };
      }
      return stat.isFile() ? { kind: "file" } : { kind: "other" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing" };
      }
      throw error;
    }
  }

  /** @inheritdoc */
  digestFile(path: string): string {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  /** @inheritdoc */
  readWithDigest(path: string): { content: string; sha256: string } {
    const bytes = readFileSync(path);
    return {
      content: bytes.toString("utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  /** @inheritdoc */
  canonicalPath(path: string): string {
    return realpathSync.native(path);
  }

  /** @inheritdoc */
  makeDirectories(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  /** @inheritdoc */
  list(path: string): DirEntry[] {
    return readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
    }));
  }

  /** @inheritdoc */
  copyTree(from: string, to: string): void {
    cpSync(from, to, { recursive: true });
  }

  /** @inheritdoc */
  remove(path: string): void {
    rmSync(path, { recursive: true, force: true });
  }

  /** @inheritdoc */
  ensureAlias(target: string, linkPath: string): AliasResult {
    return ensureSymlinkOrCopy(target, linkPath, this.aliasOptions);
  }
}
