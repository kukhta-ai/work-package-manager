import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ConstraintError,
  NotFoundError,
  UsageError,
  ValidationError,
} from "../../../src/core/errors.js";
import { type CliIo, formatError, type OutputSink, runWithExit } from "../../../src/util/exit.js";

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
});
