import semver from "semver";
import type { Brand } from "./branded.js";
import { fail, ok, type Parsed } from "./result.js";

/**
 * A single, valid semantic version (doc 13 §2; doc 08). Obtainable only via {@link parseSemVer}; the stored
 * value is semver-normalized (e.g. `"1.2.3"`).
 *
 * `semver` is a pure library (no I/O), so it is permitted inside the core — the import-boundary rule
 * (doc 13 §1) forbids only the CLI framework, the subprocess library, and OS/file-system modules.
 */
export type SemVer = Brand<string, "SemVer">;

/**
 * A valid npm-style version range (doc 13 §2; doc 08) — `^0.3.0`, `~1.2`, `>=2 <3`, `1.x`, etc. Obtainable
 * only via {@link parseVersionRange}; the stored value is the semver-normalized range. Here only the range
 * *format* is validated; `satisfies` / dependency `resolve` are task-18.
 */
export type VersionRange = Brand<string, "VersionRange">;

/**
 * Parse a raw string into a {@link SemVer}. Pure and total — returns a {@link Parsed}, never throws.
 *
 * Uses `semver.valid`, which accepts only a complete `MAJOR.MINOR.PATCH` (with optional pre-release/build)
 * and rejects partials like `"1"` or `"1.2"`. The normalized form is stored.
 *
 * @param raw - The candidate version string.
 * @returns The branded {@link SemVer} on success, or a {@link ValidationProblem}.
 */
export function parseSemVer(raw: string): Parsed<SemVer> {
  const normalized = semver.valid(raw);
  if (normalized === null) {
    return fail(`"${raw}" is not a valid semantic version (expected MAJOR.MINOR.PATCH)`, "version");
  }
  return ok(normalized as SemVer);
}

/**
 * Parse a raw string into a {@link VersionRange}. Pure and total.
 *
 * Uses `semver.validRange`, which accepts npm-style range syntax (`^`, `~`, comparator sets, `x`-ranges) and
 * returns the normalized comparator form, or `null` if the syntax is invalid. The normalized form is stored.
 *
 * @param raw - The candidate range string.
 * @returns The branded {@link VersionRange} on success, or a {@link ValidationProblem}.
 */
export function parseVersionRange(raw: string): Parsed<VersionRange> {
  // `validRange` treats the empty string as `*` (any version). Reject it explicitly: a `requires` entry must
  // state an intentional constraint, not silently mean "anything".
  if (raw.trim().length === 0) {
    return fail("version range must not be empty", "requires");
  }
  const normalized = semver.validRange(raw);
  if (normalized === null) {
    return fail(
      `"${raw}" is not a valid npm-style version range (e.g. ^0.3.0, ~1.2, >=2 <3)`,
      "requires",
    );
  }
  return ok(normalized as VersionRange);
}
