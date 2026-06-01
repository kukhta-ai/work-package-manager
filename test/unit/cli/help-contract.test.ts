import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, run } from "../../../src/cli.js";
import { EXAMPLE_HEADING } from "../../../src/help/examples.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

/**
 * Acceptance test for the `--help` content contract (task-28, doc 10 §"Every command is discoverable"). Driven
 * through the public `run()` / `buildProgram()` APIs in-process (no child process), mirroring
 * `cli.acceptance.test.ts`'s harness. AC#1 narrates an author reading `bundle new --help` and finding it
 * self-sufficient; AC#2 is the COMPLETENESS GUARD that walks every registered command and enforces the contract
 * so the 51 later leaves (tasks 34–84) can't ship empty/boilerplate-only help. Pure + deterministic: in-memory
 * ports + string-collector sinks.
 */

const BUILTIN = "/builtin-templates";

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function io(
  debug = false,
): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug };
}

/** Minimal CliDeps — help rendering needs no project state, but `buildProgram` requires the shape. */
function deps(): CliDeps {
  return {
    fs: new MemoryFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/elsewhere" }),
    builtinTemplatesRoot: BUILTIN,
  };
}

/**
 * Flatten a commander program into every registered command (recursively), excluding commander's auto-added
 * `help` subcommand (which is boilerplate, not an author command). The root program itself is excluded — the
 * contract is about the registered commands/groups, not the `wpm` root (which has its own description + usage).
 */
function allCommands(program: Command): Command[] {
  const out: Command[] = [];
  const walk = (cmd: Command): void => {
    for (const child of cmd.commands) {
      if (child.name() === "help") continue; // commander's built-in help command
      out.push(child);
      walk(child);
    }
  };
  walk(program);
  return out;
}

/** A command's OWN declared options, excluding the auto-added `-h, --help`. */
function ownOptions(cmd: Command): readonly { short?: string; long?: string }[] {
  return cmd.options.filter((o) => o.long !== "--help" && o.short !== "-h");
}

/**
 * Render a command's COMPLETE `--help` text, including any `.addHelpText('after', …)` example block. commander's
 * `.helpInformation()` returns only the built-in formatted help (Usage/description/Arguments/Options); the
 * worked example is emitted via the `afterHelp` event during `.outputHelp()`. So we capture `outputHelp` by
 * temporarily pointing this command's output config at a collector — this is exactly what the user sees on
 * `wpm <cmd> --help`, which is what the contract is about.
 */
function fullHelp(cmd: Command): string {
  let captured = "";
  const collect = (s: string): void => {
    captured += s;
  };
  cmd.configureOutput({ writeOut: collect, writeErr: collect });
  cmd.outputHelp();
  return captured;
}

describe("--help content contract (task-28, doc 10 discoverability)", () => {
  describe("AC#1 — `bundle new --help` is fully self-sufficient", () => {
    it("shows the description, a usage line with <id>, every flag with its effect+default, and a worked example", async () => {
      const i = io();
      expect(await run(["bundle", "new", "--help"], deps(), i)).toBe(0);
      const help = i.out.text;

      // one-line description (doc 10):
      expect(help).toContain("create a bundle directory and enable it in the manifest");

      // synopsis / usage line that names `bundle new` and shows the <id> positional:
      expect(help).toMatch(/Usage:/);
      expect(help).toContain("bundle new");
      expect(help).toContain("<id>");

      // every flag with its effect (+ the --version default rendered by commander):
      expect(help).toContain("--version");
      expect(help).toContain("0.1.0"); // commander renders (default: "0.1.0")
      expect(help).toContain("--disabled");
      expect(help).toContain("--no-advisor");
      // a representative effect string is present (not just the flag name):
      expect(help.toLowerCase()).toContain("initial version");

      // the <id> positional's MEANING (the .argument description — the gap this story fixes):
      expect(help).toMatch(/id\b/);
      expect(help.toLowerCase()).toMatch(/kebab-case|bundle'?s id|new bundle/);

      // a worked example block:
      expect(help).toContain(EXAMPLE_HEADING);
      expect(help).toMatch(/\$ wpm bundle new /);
    });
  });

  describe("AC#2 — the completeness guard: no registered command has empty or boilerplate-only help", () => {
    // The STATED RULE (doc 10's own scoping — "a worked example where the flag set is non-trivial"):
    //   (1) every command MUST have a non-empty description;
    //   (2) every command's help MUST contain a Usage: line;
    //   (3) a command that declares its OWN options OR a positional argument MUST ALSO carry a worked example.
    // Bare groups (no own options/args) need only (1)+(2); a leaf like `bundle new` triggers (3).

    it("every registered command has a non-empty description and a usage line", () => {
      const program = buildProgram(deps(), io());
      const commands = allCommands(program);

      // the walk actually covered the expected set (so the guard can't pass vacuously):
      const names = commands.map((c) => c.name());
      expect(names).toEqual(
        expect.arrayContaining(["init", "template", "project", "build", "bundle", "new"]),
      );
      expect(commands.length).toBeGreaterThanOrEqual(6);

      for (const cmd of commands) {
        const where = cmd.name();
        expect(cmd.description(), `${where} must have a non-empty description`).not.toBe("");
        expect(cmd.helpInformation(), `${where} help must contain a Usage: line`).toMatch(/Usage:/);
      }
    });

    it("every command with its own options OR a positional argument carries a worked example", () => {
      const program = buildProgram(deps(), io());
      for (const cmd of allCommands(program)) {
        const hasOwnOptions = ownOptions(cmd).length > 0;
        const hasArgs = cmd.registeredArguments.length > 0;
        if (hasOwnOptions || hasArgs) {
          expect(
            fullHelp(cmd),
            `${cmd.name()} has a non-trivial flag set and MUST carry a worked example`,
          ).toContain(EXAMPLE_HEADING);
        }
      }
    });

    it("the rule BITES and is SCOPED: `bundle new` (options + <id>) has an example; a bare group (`init`) does not", () => {
      const program = buildProgram(deps(), io());
      const find = (name: string): Command => {
        const c = allCommands(program).find((x) => x.name() === name);
        if (c === undefined) throw new Error(`command ${name} not found`);
        return c;
      };

      // bundle new: has options + a positional → MUST carry an example (rule 3 fires):
      const newCmd = find("new");
      expect(ownOptions(newCmd).length).toBeGreaterThan(0);
      expect(newCmd.registeredArguments.length).toBeGreaterThan(0);
      expect(fullHelp(newCmd)).toContain(EXAMPLE_HEADING);

      // init: a bare group placeholder — no own options, no args → the rule does NOT demand an example:
      const initCmd = find("init");
      expect(ownOptions(initCmd).length).toBe(0);
      expect(initCmd.registeredArguments.length).toBe(0);
      expect(fullHelp(initCmd)).not.toContain(EXAMPLE_HEADING);
    });
  });

  describe("a representative group through leaf — help is non-empty and dispatches", () => {
    it("`bundle --help` names the group description and its `new` subcommand", async () => {
      const i = io();
      expect(await run(["bundle", "--help"], deps(), i)).toBe(0);
      const help = i.out.text;
      expect(help).toMatch(/Usage:/);
      expect(help).toContain("author's primary working unit"); // the group description
      expect(help).toContain("new"); // its registered leaf is listed
    });
  });

  describe("the contract holds through the real display path (run end-to-end)", () => {
    it("the `-h` short alias behaves like `--help` on the leaf (doc 10: `--help`/`-h` is supported)", async () => {
      const long = io();
      const short = io();
      expect(await run(["bundle", "new", "--help"], deps(), long)).toBe(0);
      expect(await run(["bundle", "new", "-h"], deps(), short)).toBe(0);
      // Both render the same self-sufficient help (description + the worked example):
      expect(short.out.text).toContain("create a bundle directory and enable it in the manifest");
      expect(short.out.text).toContain(EXAMPLE_HEADING);
      expect(short.out.text).toBe(long.out.text); // -h is exactly --help
    });

    it("a group renders substantive help and exits 0 via run (`project --help`)", async () => {
      const i = io();
      expect(await run(["project", "--help"], deps(), i)).toBe(0);
      const help = i.out.text;
      expect(help).toMatch(/Usage:/);
      expect(help).toContain("the project as a release unit"); // the group's own description
    });

    it("the root `wpm -h` lists every top-level group and exits 0", async () => {
      const i = io();
      expect(await run(["-h"], deps(), i)).toBe(0);
      const help = i.out.text;
      expect(help).toMatch(/Usage:/);
      for (const group of ["init", "template", "project", "bundle", "build"]) {
        expect(help, `root help must list the ${group} group`).toContain(group);
      }
    });
  });
});
