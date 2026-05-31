#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";

/**
 * A minimal output sink: the subset of `NodeJS.WriteStream` (`process.stdout`/`process.stderr`)
 * that {@link run} needs. Abstracting it to this one method lets tests drive the CLI in-process
 * with a string collector instead of spawning a child process or capturing real streams.
 */
export interface OutputSink {
  write(text: string): void;
}

/** The one-line usage shown for `--help`/`-h` and for a bare invocation. */
const USAGE = "usage: installer [--version|-V] [--help|-h]";

/**
 * Exit codes used by the CLI. Kept aligned with doc 13 §7's contract from the very first story so
 * the convention is consistent as it grows: 0 = success, 2 = usage error. (The full typed
 * domain-error model and its mapping are task-23; this is only the bootstrap subset.)
 */
const EXIT = {
  ok: 0,
  usage: 2,
} as const;

/**
 * Parse the CLI arguments and produce output + an exit code, without touching the process.
 *
 * This is the entire behaviour of the bootstrap CLI: it answers `--version`/`-V` and
 * `--help`/`-h` (and a bare invocation), and rejects anything else as a usage error. It is kept
 * as a pure function over an injected {@link OutputSink} so the smoke test can assert it
 * in-process. The real command surface (commander, the full command tree, the top-level error
 * handler) replaces this in task-27; until then `cli.ts` is the thin entry point doc 13 §6
 * describes, with no dependency on any CLI framework.
 *
 * @param argv - The CLI arguments, excluding `node` and the script path (i.e. `process.argv.slice(2)`).
 * @param out - Where normal output is written.
 * @param err - Where error/usage output is written (defaults to {@link out}).
 * @returns The process exit code (0 on success, 2 on a usage error).
 */
export function run(argv: readonly string[], out: OutputSink, err: OutputSink = out): number {
  if (argv.length === 0) {
    out.write(`${USAGE}\n`);
    return EXIT.ok;
  }

  const first = argv[0];

  if (first === "--version" || first === "-V") {
    out.write(`${VERSION}\n`);
    return EXIT.ok;
  }

  if (first === "--help" || first === "-h") {
    out.write(`${USAGE}\n`);
    return EXIT.ok;
  }

  err.write(`installer: unknown argument '${first}'\n${USAGE}\n`);
  return EXIT.usage;
}

/**
 * Whether this module is being executed directly as the program entry point (as opposed to being
 * imported, e.g. by a test).
 *
 * The naive `import.meta.url === \`file://${process.argv[1]}\`` check breaks for the CLI's primary
 * use case: when invoked through a `bin` symlink (`installer`/`wpm` on `PATH`), `process.argv[1]`
 * is the symlink path while `import.meta.url` is the resolved real path, so they never match and
 * the program silently does nothing. Comparing the *realpath* of both sides fixes that. Using
 * `node:fs`/`node:url` here is fine — `cli.ts` is the driving adapter / composition root (doc 13
 * §6), explicitly outside the pure core that the import-boundary rule guards.
 */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

/**
 * Process entry point: run the CLI against the real argv and streams, then exit with the resulting
 * code. Gated on {@link isMainModule} so importing this module from a test does not trigger the
 * side effect. This impure tail is the only part of `cli.ts` that touches the process.
 */
if (isMainModule()) {
  process.exit(run(process.argv.slice(2), process.stdout, process.stderr));
}
