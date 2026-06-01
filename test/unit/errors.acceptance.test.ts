import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ConstraintError,
  DomainError,
  type ExitCode,
  exitCodeFor,
  isDomainError,
  NotFoundError,
  UsageError,
  ValidationError,
} from "../../src/core/errors.js";

/**
 * Acceptance test for the typed error model: the raise -> catch -> exit-code flow the CLI top-level handler
 * (task-27) will run. A (simulated) operation raises a typed {@link DomainError} for a domain failure; the
 * boundary catches it and {@link exitCodeFor} maps it to the documented exit status — proving the contract
 * end-to-end and that exit codes come from ONE place. Pure (no I/O — the core only raises).
 */

/** Stand-in for the CLI boundary: run an operation, returning the exit code (0 on success). */
function runOperation(operation: () => void): ExitCode {
  try {
    operation();
    return 0; // success path — the caller decides 0; exitCodeFor is never invoked here.
  } catch (error) {
    return exitCodeFor(error);
  }
}

describe("error model — acceptance (raise -> catch -> exit code, the CLI boundary flow)", () => {
  it("a domain failure raised by an operation maps to its documented exit code (AC#1/#3)", () => {
    // Simulated operations, each raising the typed error its domain failure would.
    const createBundleDuplicate = () => {
      throw new ConflictError('bundle "web-handoff" already exists', { id: "web-handoff" });
    };
    const initFromMissingTemplate = () => {
      throw new NotFoundError('template "nope" not found', { id: "nope" });
    };
    const badArgument = () => {
      throw new UsageError("--version expects a value");
    };
    const unsatisfiableRequires = () => {
      throw new ConstraintError('bundle "web-handoff" requires "core"@^0.3.0 but "core" is 0.4.0');
    };
    const schemaFailure = () => {
      throw new ValidationError('"project.version" is not a valid semantic version', {
        field: "project.version",
      });
    };

    // The boundary catches each and maps via the single source of truth.
    expect(runOperation(createBundleDuplicate)).toBe(1); // conflict
    expect(runOperation(initFromMissingTemplate)).toBe(1); // not-found
    expect(runOperation(badArgument)).toBe(2); // usage
    expect(runOperation(unsatisfiableRequires)).toBe(1); // constraint
    expect(runOperation(schemaFailure)).toBe(1); // validation
  });

  it("the caught value is the right typed DomainError, with category + detail intact", () => {
    try {
      throw new ConflictError("dup", { id: "core" });
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      expect(error).toBeInstanceOf(ConflictError);
      if (isDomainError(error)) {
        expect(error.category).toBe("conflict");
        expect(error.detail).toEqual({ id: "core" });
      }
    }
  });

  it("an UNEXPECTED (non-domain) failure falls into the everything-else bucket -> exit 1 (AC#2)", () => {
    // E.g. a render unresolved-placeholder bug surfaces as a plain Error, not a DomainError.
    const renderBug = () => {
      throw new Error(
        'render: unresolved placeholder "{{missing}}" in content of "manifest.yml.tmpl"',
      );
    };
    let caught: unknown;
    try {
      renderBug();
    } catch (e) {
      caught = e;
    }
    expect(isDomainError(caught)).toBe(false);
    expect(runOperation(renderBug)).toBe(1);
  });

  it("the success path is exit 0, decided by the caller (exitCodeFor is only called on error)", () => {
    const successfulOperation = () => {
      /* did its work, returns normally */
    };
    expect(runOperation(successfulOperation)).toBe(0);
  });

  it("the whole table holds via exitCodeFor: 0 success / 2 usage / 1 everything else", () => {
    // success
    expect(runOperation(() => {})).toBe(0);
    // usage -> 2
    expect(
      runOperation(() => {
        throw new UsageError("bad");
      }),
    ).toBe(2);
    // every other domain category + unexpected -> 1
    for (const make of [
      () => new NotFoundError("x"),
      () => new ConflictError("x"),
      () => new ConstraintError("x"),
      () => new ValidationError("x"),
      () => new Error("plain"),
    ]) {
      expect(
        runOperation(() => {
          throw make();
        }),
      ).toBe(1);
    }
  });
});
