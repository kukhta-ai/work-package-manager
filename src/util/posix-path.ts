/**
 * POSIX path normalization for **logical / portable** paths (doc 06/07/08: `bundle.yml` / `manifest.yml` /
 * `wpm.lock` store paths, user-facing messages quote them, the build ship-list enumerates them, and `build
 * package`/`publish` print where the artefact landed). Those paths are PORTABLE ARTEFACTS and their textual
 * form must be POSIX (`/`) regardless of the author's OS — a project authored on Windows must yield the same
 * `bundle.yml` and the same printed paths as one authored on Linux/macOS, so a generated bundle is byte-stable
 * and its stored/compared paths never carry a `\`.
 *
 * The rule (doc 13's pure-core / ports-and-adapters boundary applies equally to path KINDS):
 *
 * - **Logical paths** — stored in yml, shown in messages, returned/printed, or compared as strings — are built
 *   with `node:path`'s `posix.join` (or `/`-templates) and, when a value ORIGINATES from an OS-native
 *   `path.join`/`dirname`/`relative` or a filesystem listing, normalized here at the seam where it becomes
 *   logical.
 * - **Real fs-I/O paths** — handed to the FileSystem port or to `runSync` for `tar`/`git`/`zip` — stay
 *   OS-native `join(root, …)` (correct for the real adapter; Windows' fs and these tools also accept `/`).
 *
 * Pure string work (no `node:fs`/`node:os`), so this is safe to import from `src/core/**` as well as the
 * adapters and the CLI shell — it carries none of the effects the core-boundary lint rule forbids.
 */

/**
 * Convert a path to its POSIX (`/`-separated) form by replacing every backslash with a forward slash. A no-op
 * on a path that is already POSIX (so it never changes behaviour on Linux/macOS, where `path.sep` is `/`); on
 * Windows it turns a native `a\b\c` into the portable `a/b/c`. Idempotent.
 *
 * Used at the boundaries where a path becomes LOGICAL: stored in `bundle.yml`/`manifest.yml`/`wpm.lock`,
 * printed in a user-facing message, returned to be printed (the package/publish output path), or compared as a
 * string in a test/assertion. It does NOT resolve `.`/`..` or change absoluteness — it only fixes the
 * separator, which is the sole cross-platform divergence for an already-built path.
 *
 * @param path - A path that may contain OS-native separators.
 * @returns The same path with `\` replaced by `/`.
 */
export function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}
