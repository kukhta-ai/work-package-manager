import { CommanderError } from "commander";
import {
  exitCodeFor,
  HandoffPreparationPreflightError,
  HandoffVerificationError,
  isDomainError,
  isMutationFailure,
  WorkspaceIntegrationPreflightError,
} from "../core/errors.js";

/**
 * The top-level error handler + output/exit-code mapping for the CLI (doc 12 line 144: "error formatting +
 * exit codes"). This is INFRASTRUCTURE, not core: it lives in `src/util/` and may import commander's error
 * type, but it never re-implements the domain mapping — the category→code decision is task-23's
 * {@link exitCodeFor} from `src/core/errors.ts`. Output is not a port (doc 13 §3): the core raises typed
 * errors and returns data; this layer turns an outcome into bytes on a sink and a number for `process.exit`.
 */

/**
 * A minimal output sink: the subset of `NodeJS.WriteStream` (`process.stdout`/`process.stderr`) the CLI needs.
 * Abstracting it to this one method lets tests drive the CLI in-process with a string collector instead of
 * spawning a child process or capturing real streams. This is the shared home for the type (the composition
 * root re-exports it).
 */
export interface OutputSink {
  /** Write a chunk of text to the sink. */
  write(text: string): void;
}

/**
 * The CLI's I/O bundle: where normal output and error output go, plus whether debug detail is enabled.
 * `debug` gates stack traces for unexpected errors (set from the global `--debug` flag or the `WPM_DEBUG`
 * environment variable).
 */
export interface CliIo {
  /** Where normal (stdout-equivalent) output is written. */
  readonly out: OutputSink;
  /** Where error (stderr-equivalent) output is written. */
  readonly err: OutputSink;
  /** Whether to include diagnostic detail (stack traces) for unexpected errors. */
  readonly debug: boolean;
  /**
   * The input stream a destructive command reads its confirmation answer from (the real entry point wires
   * `process.stdin`; tests pass a `Readable.from([...])`). OPTIONAL — a command that never prompts ignores it,
   * and when it is absent an unattended destructive command treats the missing input as a DECLINE (the safe
   * default — never destroy without an explicit yes). Reading stdin lives in the shell, never in the core
   * (doc 13 §3: stdin is not a port; the confirmation DECISION is made here, the pure operation acts only when
   * confirmed).
   */
  readonly in?: NodeJS.ReadableStream;
}

/** An already-structured CLI failure whose JSON bytes and exit code must be preserved by the global shell. */
export class JsonCliFailure extends Error {
  constructor(
    readonly payload: unknown,
    readonly exitCode: number,
  ) {
    super("structured JSON CLI failure");
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "JsonCliFailure";
  }
}

/** The commander error codes that mean "help or version was displayed" — a successful, already-printed exit. */
const HELP_OR_VERSION_CODES = new Set<string>([
  "commander.help",
  "commander.helpDisplayed",
  "commander.version",
]);

/** Make arbitrary text inert in a terminal/shell transcript while preserving readable ordinary prose. */
export function escapeHumanText(value: string): string {
  return [...value]
    .map((character) => {
      if (character === "\n") return "\\n";
      if (character === "\r") return "\\r";
      if (character === "\t") return "\\t";
      const codePoint = character.codePointAt(0) as number;
      return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) || "$`!".includes(character)
        ? `\\u${codePoint.toString(16).padStart(4, "0")}`
        : character;
    })
    .join("");
}

/** Quote one value as JSON data, then neutralize shell metacharacters that JSON leaves literal. */
export function formatHumanValue(value: string): string {
  return escapeHumanText(JSON.stringify(value));
}

/**
 * Format a thrown value into a user-facing message (doc 13 §7). A task-23 `DomainError` yields a clean
 * one-line `error: <message>` with NO stack — the message is the contract. An unexpected error yields the
 * same line PLUS its stack, but only when `debug` is on (so normal runs stay terse and debug runs are
 * diagnosable). Non-`Error` throwables are stringified defensively.
 *
 * @param error - The thrown value.
 * @param debug - Whether to append the stack for an unexpected error.
 * @returns The formatted message, newline-terminated.
 */
export function formatError(error: unknown, debug: boolean): string {
  if (error instanceof HandoffPreparationPreflightError) {
    const lines = [`error: ${error.message}`, "blockers:"];
    for (const blocker of error.blockers) {
      lines.push(
        `  - [${blocker.code}] ${blocker.surface}${blocker.client !== undefined ? ` (${escapeHumanText(blocker.client)})` : ""}: ${escapeHumanText(blocker.message)}`,
        `    recovery: ${escapeHumanText(blocker.recovery)}`,
      );
    }
    lines.push("handoff prepared: no");
    return `${lines.join("\n")}\n`;
  }
  if (error instanceof HandoffVerificationError) {
    const lines = [`error: ${error.message}`, "blockers:"];
    for (const blocker of error.blockers) {
      lines.push(
        `  - [${blocker.code}] ${blocker.surface}${blocker.client !== undefined ? ` (${escapeHumanText(blocker.client)})` : ""}: ${escapeHumanText(blocker.message)}`,
        `    recovery: ${escapeHumanText(blocker.recovery)}`,
      );
    }
    lines.push(
      `shared surfaces: ${error.sharedValid ? "valid" : "invalid"}`,
      ...error.clients.map(({ id, status }) => `${id}: ${status}`),
      "verification: failed",
    );
    return `${lines.join("\n")}\n`;
  }
  if (error instanceof WorkspaceIntegrationPreflightError) {
    const lines = [`error: ${error.message}`, "blockers:"];
    for (const blocker of error.blockers) {
      lines.push(
        `  - [${blocker.code}] ${blocker.surface}: ${escapeHumanText(blocker.message)}`,
        `    recovery: ${escapeHumanText(blocker.recovery)}`,
      );
    }
    lines.push("handoff prepared: no");
    return `${lines.join("\n")}\n`;
  }
  if (isMutationFailure(error)) {
    const lines = [
      `error: ${error.message}`,
      `failed beat: ${error.failedBeat}`,
      "completed:",
      ...(error.completed.length > 0
        ? error.completed.map(
            ({ id, path }) =>
              `  - ${id}${path !== undefined ? ` (${formatHumanValue(path)})` : ""}`,
          )
        : ["  - (none)"]),
      `failed: ${error.failed.id}${error.failed.path !== undefined ? ` (${formatHumanValue(error.failed.path)})` : ""}`,
      "unattempted:",
      ...(error.unattempted.length > 0
        ? error.unattempted.map(
            ({ id, path }) =>
              `  - ${id}${path !== undefined ? ` (${formatHumanValue(path)})` : ""}`,
          )
        : ["  - (none)"]),
      `recovery: ${escapeHumanText(error.recovery)}`,
    ];
    if (debug && error.underlyingCause instanceof Error) {
      lines.push(escapeHumanText(error.underlyingCause.stack ?? error.underlyingCause.message));
    }
    if (error.operation === "workspace handoff preparation") {
      lines.push("handoff prepared: no");
    }
    return `${lines.join("\n")}\n`;
  }
  if (isDomainError(error)) {
    return `error: ${error.message}\n`;
  }
  if (error instanceof Error) {
    const base = `error: ${error.message}\n`;
    if (debug && error.stack !== undefined) {
      return `${base}${error.stack}\n`;
    }
    return base;
  }
  return `error: ${String(error)}\n`;
}

/**
 * Run the CLI body and turn any outcome into a process exit code (doc 13 §7), writing a readable message for
 * every failure. The single place exit codes are decided.
 *
 * Exit-code table:
 * | Outcome | Exit |
 * |---|---|
 * | success | 0 |
 * | commander help / version display | 0 (commander already printed; stay silent) |
 * | commander usage error (unknown command/option, missing argument) | 2 (commander already wrote the message) |
 * | a task-23 `UsageError` (category `usage`) | 2 |
 * | `NotFoundError` / `ConflictError` / `ConstraintError` / `ValidationError` | 1 |
 * | an unexpected error (plain `Error` / non-domain) | 1 (+ stack iff `io.debug`) |
 *
 * Commander's own errors arrive here because the program is configured with `.exitOverride()` (so commander
 * throws a {@link CommanderError} instead of calling `process.exit`); commander has already written its help
 * or usage text via the configured output, so this handler does not re-write it.
 *
 * @param io - The output sinks + debug flag.
 * @param body - The CLI work (parse + dispatch), which may throw.
 * @returns The process exit code.
 */
export async function runWithExit(io: CliIo, body: () => Promise<void>): Promise<number> {
  try {
    await body();
    return 0;
  } catch (error) {
    if (error instanceof JsonCliFailure) {
      io.err.write(`${JSON.stringify(error.payload)}\n`);
      return error.exitCode;
    }
    if (error instanceof CommanderError) {
      // Commander already wrote help/version/usage text via the configured output; do not duplicate it.
      if (HELP_OR_VERSION_CODES.has(error.code)) {
        // A help/version display is a success from the user's perspective → exit 0. (Commander's own
        // `exitCode` is 1 for the no-command-given help, so we normalize to 0 per the doc-13 §7 table.)
        return 0;
      }
      return 2; // a usage error (unknown command/option, missing argument)
    }
    if (isDomainError(error)) {
      io.err.write(formatError(error, io.debug));
      return exitCodeFor(error); // usage→2, else→1
    }
    if (isMutationFailure(error)) {
      io.err.write(formatError(error, io.debug));
      return 1;
    }
    // An unexpected failure → general error, with detail only in debug mode.
    io.err.write(formatError(error, io.debug));
    return 1;
  }
}
