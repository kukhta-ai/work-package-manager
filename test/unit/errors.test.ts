import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ConstraintError,
  DomainError,
  type ErrorCategory,
  type ExitCode,
  exitCodeFor,
  isDomainError,
  NotFoundError,
  UsageError,
  ValidationError,
} from "../../src/core/errors.js";

/** The five subclasses paired with their expected category and exit code. */
const CASES: {
  make: (m: string, d?: { field?: string; id?: string }) => DomainError;
  category: ErrorCategory;
  exit: ExitCode;
  name: string;
}[] = [
  { make: (m, d) => new UsageError(m, d), category: "usage", exit: 2, name: "UsageError" },
  {
    make: (m, d) => new NotFoundError(m, d),
    category: "not-found",
    exit: 1,
    name: "NotFoundError",
  },
  { make: (m, d) => new ConflictError(m, d), category: "conflict", exit: 1, name: "ConflictError" },
  {
    make: (m, d) => new ConstraintError(m, d),
    category: "constraint",
    exit: 1,
    name: "ConstraintError",
  },
  {
    make: (m, d) => new ValidationError(m, d),
    category: "validation",
    exit: 1,
    name: "ValidationError",
  },
];

describe("DomainError subclasses — distinct, throwable categories (AC#1)", () => {
  it.each(CASES)("$name is a throwable DomainError carrying its category + message", ({
    make,
    category,
    name,
  }) => {
    const error = make(`${name} happened`);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.category).toBe(category);
    expect(error.message).toBe(`${name} happened`);
    expect(error.name).toBe(name);
    // It is genuinely throwable and catchable as a DomainError.
    expect(() => {
      throw error;
    }).toThrow(DomainError);
  });

  it("carries optional structured detail (field / id)", () => {
    const byField = new ValidationError("bad version", { field: "project.version" });
    expect(byField.detail).toEqual({ field: "project.version" });
    const byId = new ConflictError("already enabled", { id: "web-handoff" });
    expect(byId.detail).toEqual({ id: "web-handoff" });
    // No detail when none is given.
    expect(new NotFoundError("missing").detail).toBeUndefined();
  });

  it("the five categories are all distinct", () => {
    const categories = CASES.map((c) => c.make("x").category);
    expect(new Set(categories).size).toBe(5);
    expect(categories).toEqual(["usage", "not-found", "conflict", "constraint", "validation"]);
  });
});

describe("isDomainError — distinguishes domain vs plain errors", () => {
  it.each(CASES)("returns true for $name", ({ make }) => {
    expect(isDomainError(make("x"))).toBe(true);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a TypeError", new TypeError("nope")],
    ["a string", "not an error"],
    ["undefined", undefined],
    ["null", null],
    ["a plain object", { category: "usage", message: "fake" }],
  ])("returns false for %s", (_label, value) => {
    expect(isDomainError(value)).toBe(false);
  });
});

describe("exitCodeFor — the single exit-code mapping (AC#3)", () => {
  it.each(CASES)("$name maps to exit $exit", ({ make, exit }) => {
    expect(exitCodeFor(make("x"))).toBe(exit);
  });

  it("usage -> 2; not-found/conflict/constraint/validation -> 1", () => {
    expect(exitCodeFor(new UsageError("u"))).toBe(2);
    expect(exitCodeFor(new NotFoundError("n"))).toBe(1);
    expect(exitCodeFor(new ConflictError("c"))).toBe(1);
    expect(exitCodeFor(new ConstraintError("k"))).toBe(1);
    expect(exitCodeFor(new ValidationError("v"))).toBe(1);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a string", "oops"],
    ["undefined", undefined],
    ["a plain object", {}],
  ])("an unexpected / non-domain value (%s) maps to exit 1", (_label, value) => {
    expect(exitCodeFor(value)).toBe(1);
  });
});

describe("the core RAISES, never exits/prints (AC#2)", () => {
  it("src/core/errors.ts performs no I/O (no process / console / fs / cli imports)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/core/errors.ts", import.meta.url)),
      "utf8",
    );
    for (const forbidden of [
      "process.",
      "process.exit",
      "console.",
      'from "node:fs"',
      'from "node:os"',
      'from "node:child_process"',
      'from "commander"',
      'from "execa"',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
