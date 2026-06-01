import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AliasResult, DirEntry, FileSystem } from "../core/ports/filesystem.js";
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
    mkdirSync(dir, { recursive: true });
    // Unique temp name in the same directory so the rename stays on one filesystem (and is therefore atomic).
    const tmp = join(dir, `.${randomBytes(8).toString("hex")}.tmp`);
    try {
      writeFileSync(tmp, content, "utf8");
      renameSync(tmp, path);
    } catch (err) {
      // Best-effort cleanup; never let the cleanup mask the original error.
      try {
        unlinkSync(tmp);
      } catch {
        // ignore — the temp may not have been created
      }
      throw err;
    }
  }

  /** @inheritdoc */
  exists(path: string): boolean {
    return existsSync(path);
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
