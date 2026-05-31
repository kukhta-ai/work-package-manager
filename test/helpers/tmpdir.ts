import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Temp-directory helpers for integration tests that run real command sequences against the filesystem
 * (`docs/12` — "real command sequences in a tmpdir"; test-design §6). This is **test** infrastructure, so
 * it uses `node:fs`/`node:os` directly — the core import-boundary rule is scoped to `src/core/**`, not
 * `test/`. Every directory is unique per call and removed on cleanup, so tests never share on-disk state
 * and can run in parallel deterministically.
 */

/** Prefix applied to every generated temp directory name, so they are easy to spot and sweep. */
const DEFAULT_PREFIX = "wpm-test-";

/**
 * Create a fresh, uniquely-named temporary directory inside the OS temp location and return its absolute
 * path. The caller is responsible for removing it (use {@link removeTempDir}, or prefer {@link withTempDir}
 * which cleans up automatically).
 *
 * @param prefix - Optional name prefix for the directory (default `"wpm-test-"`).
 * @returns The absolute path of the newly created directory.
 */
export function makeTempDir(prefix: string = DEFAULT_PREFIX): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Remove a temporary directory and everything in it. Safe to call on a path that no longer exists; it
 * never throws (recursive + force), so it is suitable for `afterEach`/`finally` cleanup.
 *
 * @param dir - The directory path to remove.
 */
export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Run `fn` with a fresh temporary directory, guaranteeing the directory is removed afterwards even if `fn`
 * throws or rejects. Supports both synchronous and asynchronous callbacks and forwards their return value.
 *
 * @typeParam T - The callback's return type.
 * @param fn - Receives the absolute path of the temp directory.
 * @param prefix - Optional name prefix for the directory (default `"wpm-test-"`).
 * @returns Whatever `fn` returns (awaited if it returns a promise).
 *
 * @example
 * await withTempDir(async (dir) => {
 *   // ... run a command sequence rooted at `dir` ...
 * });
 */
export async function withTempDir<T>(
  fn: (dir: string) => T | Promise<T>,
  prefix: string = DEFAULT_PREFIX,
): Promise<T> {
  const dir = makeTempDir(prefix);
  try {
    return await fn(dir);
  } finally {
    removeTempDir(dir);
  }
}
