import type { Command, Option } from "commander";
import type { Environment, FileSystem } from "../core/ports/index.js";
import type { CompletionContext, CompletionRegistry } from "./sources.js";

/**
 * The completion dispatch (doc 12 §"Tab completion: omelette" — "dispatches dynamic completions back to the CLI
 * via a `__complete` hook … the CLI loads the manifest, prints suggestions"). This is the testable seam the
 * hidden `__complete` command calls: given the words typed so far and the injected deps, it returns the
 * suggestion list. It is PURE over the ports — no `process.exit`, no direct `node:fs`, no subprocess — so it is
 * driven in-process in tests (unlike omelette's own `init()`/`reply()`, which `process.exit`).
 *
 * It derives command/subcommand/flag suggestions from the **commander tree** (so they stay in sync as leaves are
 * added in tasks 34–84) and resolves VALUE positions through the named-source {@link CompletionRegistry}: an
 * option or positional declares its completion by a source NAME (via {@link CompletionSpecs}), and the dispatch
 * looks the name up. Adding a state-dependent completion to a future leaf is "declare a source name" — no change
 * here (task-29 AC#3).
 */

/**
 * Per-command completion declarations: which named source completes each option's value and each positional
 * argument. Keyed within a command by the option's long flag (e.g. `"--template"`) and by positional index.
 */
export interface CompletionSpec {
  /** Option long-flag → source name (e.g. `{ "--template": "template-names" }`). */
  readonly options?: Readonly<Record<string, string>>;
  /** Positional-argument index → source name; `undefined` at an index means "no suggestions" (e.g. a new id). */
  readonly args?: readonly (string | undefined)[];
}

/** The completion declarations for every command that has any, keyed by command path (e.g. `"bundle new"`). */
export type CompletionSpecs = Readonly<Record<string, CompletionSpec>>;

/** The dependencies the dispatch needs beyond the registry + specs: the ports + the built-in templates root. */
export interface CompleteDeps {
  /** The filesystem port. */
  readonly fs: FileSystem;
  /** The environment port. */
  readonly env: Environment;
  /** The built-in templates root. */
  readonly builtinTemplatesRoot: string;
  /** The named-source registry. */
  readonly registry: CompletionRegistry;
  /** The per-command completion declarations. */
  readonly specs: CompletionSpecs;
}

/** Whether an option's flags string declares a value (`--x <v>` / `--x [v]`), as opposed to a boolean flag. */
function optionTakesValue(option: Option): boolean {
  return option.required === true || option.optional === true;
}

/** All flag spellings (short + long) an option exposes, for emitting flag suggestions. */
function optionFlagNames(option: Option): string[] {
  const names: string[] = [];
  if (option.short !== undefined) names.push(option.short);
  if (option.long !== undefined) names.push(option.long);
  return names;
}

/** Find the immediate subcommand of `cmd` named `name` (ignoring commander's auto `help`), or `undefined`. */
function subcommand(cmd: Command, name: string): Command | undefined {
  return cmd.commands.find((c) => c.name() === name && c.name() !== "help");
}

/**
 * The names of a command's user-facing subcommands: excludes commander's auto `help` AND any HIDDEN command
 * (e.g. the `bundle <id>` routing's `* [args...]` catch-all, registered `{ hidden: true }`) so an internal
 * dispatch helper never leaks into the suggestions. `_hidden` is commander's own per-command hidden flag.
 */
function visibleSubcommandNames(cmd: Command): string[] {
  return cmd.commands
    .filter((c) => c.name() !== "help" && (c as unknown as { _hidden?: boolean })._hidden !== true)
    .map((c) => c.name());
}

/**
 * Resolve the deepest command the typed words descend into, plus the operand words consumed under it (the
 * non-option words that are NOT subcommand names — i.e. the positional arguments typed so far).
 *
 * A value-taking GLOBAL option on the program root (`-C <path>` / `--project <path>`) consumes the FOLLOWING
 * word as its value — that value must NOT be mistaken for a positional operand or a subcommand name. (Without
 * this, `wpm -C <dir> bundle <tab>` made `<dir>` an operand under the program, so the descent never reached
 * `bundle` and the bundle id-position completion broke — the completion-vs-dispatch asymmetry on `-C` placement.)
 */
function descend(
  root: Command,
  words: readonly string[],
): { command: Command; operands: string[] } {
  let command = root;
  const operands: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (word.startsWith("-")) {
      // A value-taking option of the PROGRAM root (the globals `-C`/`--project`) swallows its value token.
      const opt = findOption(root, word);
      if (opt !== undefined && optionTakesValue(opt)) {
        i += 1; // skip the value, so it is neither an operand nor a subcommand name
      }
      continue; // options are not part of the command path
    }
    const child = subcommand(command, word);
    if (child !== undefined) {
      command = child;
    } else {
      operands.push(word); // a positional operand under `command`
    }
  }
  return { command, operands };
}

/**
 * Compute completion suggestions for a partially-typed command line.
 *
 * `words` is the line split into tokens AFTER the program name (e.g. for `wpm bundle new --template ` it is
 * `["bundle", "new", "--template", ""]`); the LAST element is the partial being completed (may be `""`). The
 * `-C/--project <path>` override, if present anywhere in `words`, is threaded into the source context so
 * state-dependent completions target the right project.
 *
 * Resolution order:
 * 1. If the token before the partial is a value-taking option that declares a source → that source's values.
 * 2. Else if the partial itself starts with `-` → the current command's flags.
 * 3. Else if the current command has subcommands → its subcommand names (+ flags), prefix-filtered.
 * 4. Else (a leaf at a positional) → the declared source for that positional index, or `[]` (e.g. a new id) —
 *    but its flags still complete when the partial starts with `-` (handled by step 2).
 *
 * @param program - The commander program (from `buildProgram`).
 * @param words - The tokens after the program name; the last is the partial.
 * @param deps - The ports + templates root + registry + per-command specs.
 * @returns The suggestion list (possibly empty), prefix-filtered by the partial.
 */
export function completeArgv(
  program: Command,
  words: readonly string[],
  deps: CompleteDeps,
): string[] {
  const partial = words.length > 0 ? (words[words.length - 1] ?? "") : "";
  const prior = words.slice(0, -1);
  const projectOverride = extractProjectOverride(words);

  const { command, operands } = descend(program, prior);
  const path = commandPath(program, command);
  const spec: CompletionSpec | undefined = deps.specs[path];

  const ctx: CompletionContext = {
    fs: deps.fs,
    env: deps.env,
    builtinTemplatesRoot: deps.builtinTemplatesRoot,
    ...(projectOverride !== undefined ? { projectOverride } : {}),
    partial,
  };

  // (1) Completing the VALUE of the option immediately before the partial.
  const prevToken = prior[prior.length - 1];
  if (prevToken?.startsWith("-") === true) {
    const option = findOption(command, prevToken);
    if (option !== undefined && optionTakesValue(option)) {
      const sourceName = spec?.options?.[option.long ?? prevToken];
      return sourceName !== undefined ? deps.registry.resolve(sourceName, ctx) : [];
    }
  }

  // (2) Completing a flag (the partial starts with `-`).
  if (partial.startsWith("-")) {
    return prefixFilterLocal(collectFlags(command), partial);
  }

  // (3) A group/command position: suggest subcommands (+ flags). A command MAY also accept a dynamic positional
  // at this index (e.g. `bundle <id>` — the group has the fixed verbs AND takes an enabled-bundle id); when it
  // declares an `args[index]` source AND has subcommands, UNION the (visible) subcommand names with the source's
  // suggestions so both complete. Hidden commands (the `*` routing catch-all) are excluded.
  const subNames = visibleSubcommandNames(command);
  if (subNames.length > 0) {
    const positionalSource = spec?.args?.[operands.length];
    const positional =
      positionalSource !== undefined ? deps.registry.resolve(positionalSource, ctx) : [];
    return prefixFilterLocal([...subNames, ...positional], partial);
  }

  // (4) A leaf at a positional: resolve the declared source for this positional index, else no suggestions.
  const argIndex = operands.length; // the operand currently being typed
  const argSource = spec?.args?.[argIndex];
  return argSource !== undefined ? deps.registry.resolve(argSource, ctx) : [];
}

/** Local prefix filter (duplicated tiny helper to keep this module free of a sources.ts value import cycle). */
function prefixFilterLocal(values: readonly string[], partial: string): string[] {
  return partial === "" ? [...values] : values.filter((v) => v.startsWith(partial));
}

/** Collect a command's own flag spellings (its options' short+long names). */
function collectFlags(command: Command): string[] {
  const flags: string[] = [];
  for (const option of command.options) {
    flags.push(...optionFlagNames(option));
  }
  return flags;
}

/** Find a command's option by a typed flag token (`--template` / `-t`), or `undefined`. */
function findOption(command: Command, token: string): Option | undefined {
  return command.options.find((o) => o.long === token || o.short === token);
}

/** The space-joined path from `program` down to `command` (excluding the program name), e.g. `"bundle new"`. */
function commandPath(program: Command, command: Command): string {
  const names: string[] = [];
  let current: Command | null = command;
  while (current !== null && current !== program) {
    names.unshift(current.name());
    current = current.parent;
  }
  return names.join(" ");
}

/** Extract the `-C/--project <path>` value from the typed words, if present (so completion targets it). */
function extractProjectOverride(words: readonly string[]): string | undefined {
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === "-C" || words[i] === "--project") {
      return words[i + 1];
    }
  }
  return undefined;
}
