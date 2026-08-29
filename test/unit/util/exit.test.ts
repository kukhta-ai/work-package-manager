import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ConstraintError,
  HandoffPreparationPreflightError,
  HandoffVerificationError,
  MutationFailure,
  NotFoundError,
  PersonalAuthoringSetupMutationFailure,
  PersonalAuthoringSetupPreflightError,
  UsageError,
  ValidationError,
} from "../../../src/core/errors.js";
import {
  type CliIo,
  formatError,
  formatHumanValue,
  type OutputSink,
  runWithExit,
  stringifyCliJson,
} from "../../../src/util/exit.js";

/** A string-collecting {@link OutputSink}. */
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

/** Run a body that throws `error` through {@link runWithExit}, returning the exit code + the io. */
async function runThrowing(error: unknown, debug = false) {
  const i = io(debug);
  const code = await runWithExit(i, async () => {
    throw error;
  });
  return { code, io: i };
}

describe("runWithExit — error → exit-code mapping (doc 13 §7)", () => {
  it("returns 0 and writes nothing for a successful body", async () => {
    const i = io();
    const code = await runWithExit(i, async () => {});
    expect(code).toBe(0);
    expect(i.err.text).toBe("");
  });

  it("maps a UsageError (category usage) to exit 2 with a clean message", async () => {
    const { code, io: i } = await runThrowing(new UsageError("bad usage"));
    expect(code).toBe(2);
    expect(i.err.text).toBe("error: bad usage\n");
  });

  it.each([
    ["NotFoundError", new NotFoundError("nope")],
    ["ConflictError", new ConflictError("dup")],
    ["ConstraintError", new ConstraintError("broke")],
    ["ValidationError", new ValidationError("bad")],
  ])("maps %s to exit 1 with a clean (stack-free) message", async (_name, err) => {
    const { code, io: i } = await runThrowing(err);
    expect(code).toBe(1);
    expect(i.err.text).toMatch(/^error: /);
    expect(i.err.text).not.toContain("at "); // no stack frames
  });

  it("maps an unexpected error to exit 1, omitting the stack without debug", async () => {
    const { code, io: i } = await runThrowing(new Error("boom"), false);
    expect(code).toBe(1);
    expect(i.err.text).toBe("error: boom\n");
    expect(i.err.text).not.toContain("at ");
  });

  it("maps an unexpected error to exit 1, INCLUDING the stack with debug", async () => {
    const { code, io: i } = await runThrowing(new Error("boom"), true);
    expect(code).toBe(1);
    expect(i.err.text).toContain("error: boom");
    expect(i.err.text).toContain("boom"); // the stack repeats the message
    expect(i.err.text.length).toBeGreaterThan("error: boom\n".length); // stack appended
  });

  it("keeps a DomainError clean even with debug on (its message is the contract)", async () => {
    const { code, io: i } = await runThrowing(new ConflictError("dup"), true);
    expect(code).toBe(1);
    expect(i.err.text).toBe("error: dup\n");
    expect(i.err.text).not.toContain("at ");
  });

  it("maps a commander help/version display to exit 0 silently", async () => {
    for (const codeName of ["commander.help", "commander.helpDisplayed", "commander.version"]) {
      const { code, io: i } = await runThrowing(new CommanderError(0, codeName, "help"));
      expect(code).toBe(0);
      expect(i.err.text).toBe(""); // commander already printed; handler stays silent
    }
  });

  it("maps a commander usage error (unknown command) to exit 2", async () => {
    const { code } = await runThrowing(
      new CommanderError(1, "commander.unknownCommand", "unknown command"),
    );
    expect(code).toBe(2);
  });
});

describe("formatError", () => {
  it("formats a DomainError as a clean one-liner with no stack", () => {
    expect(formatError(new ValidationError("bad id"), true)).toBe("error: bad id\n");
  });

  it("formats an unexpected error without a stack when debug is off", () => {
    expect(formatError(new Error("oops"), false)).toBe("error: oops\n");
  });

  it("appends the stack for an unexpected error when debug is on", () => {
    const formatted = formatError(new Error("oops"), true);
    expect(formatted.startsWith("error: oops\n")).toBe(true);
    expect(formatted.length).toBeGreaterThan("error: oops\n".length);
  });

  it("stringifies a non-Error throwable", () => {
    expect(formatError("plain string", false)).toBe("error: plain string\n");
  });

  it("renders handoff blockers and ordered partial progress without a prepared claim", () => {
    const blocker = {
      code: "workspace-marker-invalid",
      surface: "target" as const,
      message: "marker missing",
      recovery: "restore the marker",
    };
    expect(formatError(new HandoffPreparationPreflightError([blocker]), false)).toContain(
      "[workspace-marker-invalid] target: marker missing",
    );
    expect(formatError(new HandoffPreparationPreflightError([blocker]), false)).toContain(
      "handoff prepared: no",
    );

    const verification = formatError(
      new HandoffVerificationError({
        blockers: [blocker],
        selectedClient: "codex",
        clients: [
          { id: "codex", status: "valid" },
          { id: "claude-code", status: "invalid" },
        ],
        sharedValid: false,
      }),
      false,
    );
    expect(verification).toContain("shared surfaces: invalid");
    expect(verification).toContain("codex: valid");
    expect(verification).toContain("claude-code: invalid");

    const partial = formatError(
      new MutationFailure({
        operation: "workspace handoff preparation",
        failedBeat: "MATERIALISE",
        completed: [{ id: "handoff-receipt:preparing", description: "preparing" }],
        failed: { id: "handoff-receipt:prepared", description: "prepared" },
        unattempted: [],
        recovery: "repeat the identical handoff preparation request",
        cause: new Error("disk full"),
      }),
      false,
    );
    expect(partial).toContain("completed:\n  - handoff-receipt:preparing");
    expect(partial).toContain("failed: handoff-receipt:prepared");
    expect(partial).toContain("unattempted:\n  - (none)");
    expect(partial).toContain("handoff prepared: no");
    expect(partial).not.toContain("disk full");
  });

  it("renders handoff path evidence as inert text without terminal controls or shell substitutions", () => {
    const dangerous = "/tmp/wrong-\n-\u001b-$(touch injected)-`whoami`";
    const rendered = formatError(
      new HandoffVerificationError({
        blockers: [
          {
            code: "working-directory-mismatch",
            surface: "working-directory",
            message: `current directory ${dangerous} does not equal the recorded root`,
            recovery: `change directory to ${dangerous}`,
          },
        ],
        selectedClient: "codex",
        clients: [{ id: "codex", status: "valid" }],
        sharedValid: false,
      }),
      false,
    );

    expect(rendered).toContain("wrong-\\n-\\u001b-\\u0024(touch injected)");
    expect(rendered).toContain("\\u0060whoami\\u0060");
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("$(touch injected)");
    expect(rendered).not.toContain("`whoami`");
  });

  it("escapes Unicode format controls in human and JSON terminal bytes without changing JSON data", () => {
    const dangerous = "/tmp/safe-\u202egnp.exe-\u2066isolated\u2069";
    const human = formatHumanValue(dangerous);
    const json = stringifyCliJson({ path: dangerous });

    expect(human).toContain("\\u202e");
    expect(human).toContain("\\u2066");
    expect(human).not.toContain("\u202e");
    expect(json).not.toContain("\u202e");
    expect(JSON.parse(json)).toEqual({ path: dangerous });
  });

  it("renders aggregate personal setup blockers and typed client progress", () => {
    const preflight = formatError(
      new PersonalAuthoringSetupPreflightError([
        {
          code: "personal-destination-ambiguous",
          surface: "ownership",
          client: "codex",
          path: "/home/author/.agents/skills/wpm-create-package",
          message: "user bytes occupy the destination",
          recovery: "move the user-owned path aside",
        },
      ]),
      false,
    );
    expect(preflight).toContain("[personal-destination-ambiguous] ownership (codex)");
    expect(preflight).toContain('"/home/author/.agents/skills/wpm-create-package"');
    expect(preflight).toContain("personal setup applied: no");

    const partial = formatError(
      new PersonalAuthoringSetupMutationFailure({
        completedClients: [
          {
            id: "codex",
            destination: "/home/author/.agents/skills/wpm-create-package",
            outcome: "unchanged",
          },
        ],
        failedClient: {
          id: "claude-code",
          destination: "/home/author/.claude/skills/wpm-create-package",
          outcome: "installed",
        },
        unattemptedClients: [],
        completed: [
          {
            id: "personal-client:codex",
            description: "leave Codex unchanged",
          },
        ],
        failed: {
          id: "personal-client:claude-code",
          description: "install Claude bootstrap",
        },
        unattempted: [],
        recovery: "repeat the identical request",
        cause: new Error("disk full"),
      }),
      false,
    );
    expect(partial).toContain("codex");
    expect(partial).toContain("unchanged");
    expect(partial).toContain("claude-code");
    expect(partial).toContain("install Claude bootstrap");
    expect(partial).toContain("personal setup applied: no");
    expect(partial).not.toContain("disk full");
  });
});
