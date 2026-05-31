import { cpSync, symlinkSync } from "node:fs";
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
}

/** Default recursive copy used for the Windows fallback (preserves bytes, including binary content). */
function defaultCopy(from: string, to: string): void {
  cpSync(from, to, { recursive: true });
}

/** Default symlink primitive. */
function defaultSymlink(target: string, linkPath: string): void {
  symlinkSync(target, linkPath);
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
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const copy = options.copy ?? defaultCopy;
    copy(target, linkPath);
    return {
      kind: "copy",
      warning: `Copied "${target}" to "${linkPath}" instead of symlinking (symlinks need elevation on Windows). Re-run to refresh the copy after the source changes.`,
    };
  }
  const symlink = options.symlink ?? defaultSymlink;
  symlink(target, linkPath);
  return { kind: "symlink" };
}
