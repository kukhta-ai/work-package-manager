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
    const exitCode = result.exitCode ?? 0;
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
    // Spawn failure (e.g. executable not found) — surface the command and the underlying message.
    const command = `${file} ${args.join(" ")}`.trim();
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Command could not be run: ${command}\n${reason}`);
  }
}
