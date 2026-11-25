/**
 * The Environment port (doc 13 §3) — the core's window onto *where* it is running: the current working
 * directory (for project resolution), the platform (the Windows-vs-POSIX distinction the alias decision
 * conceptually needs), and environment-variable access. Injected so tests pin all of it deterministically.
 *
 * Synchronous and pure as an interface — under `src/core/`, the boundary rule applies, but this declares no
 * dependency on `process` (the real adapter, outside the core, provides it).
 *
 * Note: `platform()` returns the raw `NodeJS.Platform` (`"win32"`/`"linux"`/`"darwin"`/…), which both
 * supports the Windows-vs-POSIX branch and matches `process.platform`'s type. (task-12's
 * `src/util/symlink.ts` keeps its own platform injection for `ensureAlias`; this port is the core's general
 * environment window — unifying the two is deferred to a later task.)
 */
export interface Environment {
  /**
   * The current working directory.
   *
   * @returns The absolute path of the working directory.
   */
  cwd(): string;

  /**
   * The platform the builder is running on.
   *
   * @returns The Node platform identifier (e.g. `"linux"`, `"darwin"`, `"win32"`).
   */
  platform(): NodeJS.Platform;

  /**
   * Read an environment variable.
   *
   * @param name - The variable name.
   * @returns The value, or `undefined` if it is not set.
   */
  getEnv(name: string): string | undefined;
}
