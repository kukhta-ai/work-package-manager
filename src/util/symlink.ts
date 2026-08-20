import { cpSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { AliasResult } from "../core/ports/filesystem.js";

/**
 * Symlink-vs-copy strategy for scope aliases (doc 12: "the detection logic lives in src/util/symlink.ts";
 * doc 13 §3). On POSIX a scope alias is a real symlink; on Windows, where symlinks require admin/developer
 * mode, we fall back to a recursive copy and warn that updates need a re-copy step.
 *
 * The platform and the two fs primitives are injectable so **both** branches are unit-testable on any OS:
 * a test forces `platform: "win32"` to exercise the copy branch without being on Windows. In production all
 * default to the real environment. This is `util` (outside the core), so using `node:fs` here is allowed.
 */

/** Options for {@link ensureSymlinkOrCopy}; all default to the real environment. */
export interface SymlinkStrategyOptions {
  /** The platform to decide on; defaults to `process.platform`. Inject `"win32"` to force the copy branch. */
  readonly platform?: NodeJS.Platform;
  /** The symlink primitive; defaults to `node:fs` `symlinkSync`. */
  readonly symlink?: (target: string, linkPath: string) => void;
  /** The recursive-copy primitive; defaults to `node:fs` `cpSync` (recursive). */
  readonly copy?: (from: string, to: string) => void;
  /** The make-directories primitive (`mkdir -p`), used for the link's parent; defaults to `node:fs`. */
  readonly makeDirectories?: (path: string) => void;
}

/** Default recursive copy used for the Windows fallback (preserves bytes, including binary content). */
function defaultCopy(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

/** Default symlink primitive. */
function defaultSymlink(target: string, linkPath: string): void {
  symlinkSync(target, linkPath);
}

/** Default `mkdir -p` primitive. */
function defaultMakeDirectories(path: string): void {
  mkdirSync(path, { recursive: true });
}

/**
 * Create a scope alias at `linkPath` pointing at `target`, choosing the mechanism by platform and reporting
 * which was used. Never prints — it returns the {@link AliasResult} (the warning included on the copy path)
 * so the calling operation can surface it.
 *
 * @param target - The real path the alias should reference.
 * @param linkPath - Where the alias is created.
 * @param options - Optional injected platform / fs primitives (default to the real environment).
 * @returns `{ kind: "symlink" }` on POSIX, or `{ kind: "copy", warning }` on Windows.
 */
export function ensureSymlinkOrCopy(
  target: string,
  linkPath: string,
  options: SymlinkStrategyOptions = {},
): AliasResult {
  // The link's parent directory must exist before either mechanism can create the alias there. The real
  // `fs.symlink`/`fs.cp` do NOT create missing parents (unlike the in-memory fake, which records the link's
  // parent), so an alias like `.claude/skills` fails with ENOENT when `.claude/` is absent. Create it first
  // so the real adapter matches the fake and reality (the alias dir is part of what the operation lays down).
  const makeDirectories = options.makeDirectories ?? defaultMakeDirectories;
  makeDirectories(dirname(linkPath));

  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const copy = options.copy ?? defaultCopy;
    // A RELATIVE target (e.g. the per-bundle `backlog → install-backlog` link, TASK-102) is resolved against
    // the link's PARENT directory — POSIX symlink semantics — so the copy duplicates the SAME tree the
    // symlink would have pointed at, not a cwd-relative path. Absolute targets (the scope aliases) are copied
    // verbatim, so this is a no-op for every pre-existing caller.
    const copyFrom = isAbsolute(target) ? target : resolve(dirname(linkPath), target);
    copy(copyFrom, linkPath);
    return {
      kind: "copy",
      warning: `Copied "${target}" to "${linkPath}" instead of symlinking (symlinks need elevation on Windows). Re-run to refresh the copy after the source changes.`,
    };
  }
  const symlink = options.symlink ?? defaultSymlink;
  symlink(target, linkPath);
  return { kind: "symlink" };
}
