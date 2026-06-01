import type { Command } from "commander";

/**
 * The `--help` worked-example convention (doc 10 §"Every command is discoverable" → "a worked usage example
 * where the flag set is non-trivial"; doc 12 §directory scaffold `src/help/examples.ts` — "per-command worked
 * examples"). This is the IMPURE SHELL (it imports `commander`), the sanctioned place for that effect — the
 * import-boundary rule is scoped to `src/core/**`, which this file is not (doc 13 §1/§6). It exists so the
 * single piece of help the framework does NOT auto-produce — a worked example — is attached the same way by
 * every command, including the 51 leaves tasks 34–84 add: a leaf with a non-trivial flag set just calls
 * {@link withExamples} and it complies with the contract (and the task-28 completeness guard).
 *
 * commander already renders the rest of doc 10's contract: the one-line `.description()`, the auto `Usage:`
 * synopsis line, each `.option()`'s effect text and `(default: …)`, and each `.argument('<name>', meaning)`'s
 * description. So this module adds only the example block, via commander's native `.addHelpText('after', …)`.
 */

/** A worked invocation shown in a command's `--help` (doc 10: "a worked usage example"). */
export interface HelpExample {
  /**
   * The example command line WITHOUT the leading `$ ` prompt — e.g.
   * `wpm bundle new web-handoff --version 0.2.0`.
   */
  readonly command: string;
  /** An optional one-line note describing what the example does. */
  readonly note?: string;
}

/**
 * The heading the example block opens with for a single example. It is a stable, asserted marker: the task-28
 * completeness guard recognises "this command carries a worked example" by the presence of this string in the
 * command's **fully-rendered help** (what `outputHelp()` prints, including the `.addHelpText('after', …)`
 * block) — NOT `helpInformation()`, which does NOT include `addHelpText` content. A guard checking
 * `helpInformation()` for this heading would be a false guard. Kept as an exported constant so the test and the
 * renderer agree on one token.
 */
export const EXAMPLE_HEADING = "Example:";

/** The heading used when more than one example is attached. */
const EXAMPLES_HEADING = "Examples:";

/**
 * Render the example block text (the lines appended after the built-in help). Exposed for unit testing the
 * formatting in isolation; {@link withExamples} is the normal entry point.
 *
 * @param examples - The worked examples to render (must be non-empty).
 * @returns The block text, leading with a blank line then the heading and one `$ …` line per example.
 */
export function renderExamples(examples: readonly HelpExample[]): string {
  const heading = examples.length === 1 ? EXAMPLE_HEADING : EXAMPLES_HEADING;
  const lines = [`\n${heading}`];
  for (const example of examples) {
    lines.push(`  $ ${example.command}`);
    if (example.note !== undefined) {
      lines.push(`      ${example.note}`);
    }
  }
  return lines.join("\n");
}

/**
 * Attach one or more worked examples to a command's `--help`, rendered after the built-in help via commander's
 * `.addHelpText('after', …)`. This is the reusable convention every command with a non-trivial flag set uses to
 * satisfy doc 10's "worked usage example" requirement (and the task-28 completeness guard).
 *
 * @param command - The commander command to attach the example(s) to.
 * @param examples - The worked example(s); a no-op when empty (a command with a trivial flag set needs none).
 * @returns The same `command`, for chaining.
 */
export function withExamples(command: Command, examples: readonly HelpExample[]): Command {
  if (examples.length === 0) {
    return command;
  }
  command.addHelpText("after", renderExamples(examples));
  return command;
}
