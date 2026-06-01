import { execaSync } from "execa";

/**
 * A thin synchronous subprocess wrapper over `execa` (doc 12: "execa wrapper with consistent error
 * reporting"). The core is synchronous, so adapters that shell out use `execaSync` — never the async form —
 * to keep the whole stack uncoloured. This is `util` (outside the core), so importing `execa` here is
 * allowed; the import-boundary rule forbids `execa` only under `src/core/`.
 */

/** The result of a successful {@link runSync} call. */
export interface ShellResult {
  /** The process's standard output. */
  readonly stdout: string;
  /** The process's standard error. */
  readonly stderr: string;
  /** The process exit code (`0` on success). */
  readonly exitCode: number;
}

/** Options for {@link runSync}. */
export interface RunOptions {
  /** The working directory to run the command in (an explicit path the caller controls). */
  readonly cwd?: string;
  /**
   * Environment-variable overrides, merged over the inherited process environment. Used (e.g. by tests) to
   * isolate a subprocess's global state — pointing `HOME`/`XDG_*` at a sandbox so concurrent invocations of
   * a stateful CLI cannot collide.
   */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Run a command synchronously and return its output, throwing a clear error on failure.
 *
 * On a non-zero exit (or a spawn failure), the thrown error names the full command and includes the
 * captured stderr, so callers get an actionable message rather than an opaque execa error.
 *
 * @param file - The executable to run (e.g. `"backlog"`).
 * @param args - The arguments to pass.
 * @param options - Optional run options (notably `cwd`).
 * @returns The command's stdout, stderr, and exit code on success.
 * @throws An `Error` naming the command and its stderr if it fails to run or exits non-zero.
 */
export function runSync(
  file: string,
  args: readonly string[],
  options: RunOptions = {},
): ShellResult {
  try {
    const result = execaSync(file, args, {
      cwd: options.cwd,
      ...(options.env !== undefined ? { env: options.env } : {}),
      // Never throw raw execa errors to callers; we re-wrap below for a consistent message.
      reject: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    // Under `reject: false`, a SPAWN failure (e.g. the executable is not found) is reported as
    // `failed: true` with NO `exitCode` — execa never ran a process. Coercing that to `0` would silently
    // report a missing tool as success, so surface it as the spawn-failure error (the `catch` re-wraps it
    // into the "Command could not be run" message a caller can detect).
    if (result.exitCode === undefined) {
      const command = `${file} ${args.join(" ")}`.trim();
      const detail = result.failed && stderr ? `\n${stderr.trim()}` : "";
      throw new Error(`__SPAWN_FAILURE__: ${command}${detail}`);
    }
    const exitCode = result.exitCode;
    if (exitCode !== 0) {
      const command = `${file} ${args.join(" ")}`.trim();
      throw new Error(
        `Command failed (exit ${exitCode}): ${command}${stderr ? `\n${stderr.trim()}` : ""}`,
      );
    }
    return { stdout, stderr, exitCode };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Command failed (exit")) {
      throw err;
    }
    // Spawn failure (e.g. executable not found). Two paths arrive here: the `__SPAWN_FAILURE__` sentinel from
    // the `reject: false` no-exitCode case above, and a genuinely-thrown execa spawn error. Both become the
    // single "Command could not be run" message callers can detect (so a missing tool is never a false success).
    const command = `${file} ${args.join(" ")}`.trim();
    const sentinel = "__SPAWN_FAILURE__: ";
    const reason =
      err instanceof Error && err.message.startsWith(sentinel)
        ? err.message.slice(sentinel.length + command.length).trim()
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`Command could not be run: ${command}${reason ? `\n${reason}` : ""}`);
  }
}
