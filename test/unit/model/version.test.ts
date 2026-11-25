import { describe, expect, it } from "vitest";
import { parseSemVer, parseVersionRange } from "../../../src/core/model/index.js";

describe("parseSemVer", () => {
  it.each([
    "0.1.0",
    "1.2.3",
    "10.20.30",
    "1.0.0-alpha.1",
    "2.0.0-rc.1+build.5",
  ])("accepts the valid version %j", (raw) => {
    const r = parseSemVer(raw);
    expect(r.ok).toBe(true);
  });

  it.each([
    "",
    "1",
    "1.2",
    "abc",
    "1.2.x",
    "^1.2.3",
    "1.2.3.4",
    "1.2-beta",
  ])("rejects the invalid version %j", (raw) => {
    const r = parseSemVer(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("version");
    }
  });

  it("stores the semver-normalized form (and tolerates a leading 'v', stripping it)", () => {
    // `1.2.3` is already normalized; the round-trip preserves it.
    const r = parseSemVer("1.2.3");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe("1.2.3");
    }
    // semver.valid tolerates a leading `v` and normalizes it away — document that behaviour explicitly.
    const v = parseSemVer("v2.0.0");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value).toBe("2.0.0");
    }
  });
});

describe("parseVersionRange (npm-style — format only; satisfies/resolve is task-18)", () => {
  it.each([
    "^0.3.0",
    "~1.2",
    "~1.2.0",
    ">=2 <3",
    ">=2.0.0 <3.0.0",
    "1.x",
    "*",
    "=1.2.3",
    "1.2.3 - 2.0.0",
  ])("accepts the valid range %j", (raw) => {
    const r = parseVersionRange(raw);
    expect(r.ok).toBe(true);
  });

  it.each([
    "",
    "   ",
    "garbage",
    "^^1",
    ">>1.0",
    "not-a-range",
    "1.2.3.4.5",
  ])("rejects the invalid/empty range %j", (raw) => {
    const r = parseVersionRange(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.field).toBe("requires");
    }
  });

  it("rejects the empty string explicitly (must be an intentional constraint, not '*')", () => {
    const r = parseVersionRange("");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message).toContain("empty");
    }
  });
});
