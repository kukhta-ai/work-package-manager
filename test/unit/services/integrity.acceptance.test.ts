import { describe, expect, it } from "vitest";
import {
  buildLockfile,
  parseLockfile,
  serializeLockfile,
  type VendoredArtifact,
  verifyLockfile,
} from "../../../src/core/services/integrity.js";

/**
 * Acceptance test for the integrity service: the full build -> persist -> verify lifecycle — the
 * `--frozen-lockfile` story end-to-end, the way `wpm build` writes `wpm.lock` and `wpm project validate`
 * reads it back and checks for drift. Pure (no I/O — the operation supplies the vendored files and persists
 * the serialized text via the FileSystem port).
 */

/** A discipline skill vendored from superpowers. */
function superpowers(
  skillContent = "# test-driven-development\nWrite the test first.",
): VendoredArtifact {
  return {
    name: "superpowers",
    source: "obra/superpowers@v2",
    version: "2.0.0",
    files: [
      { path: "SKILL.md", content: skillContent },
      { path: "references/tdd.md", content: "Red, green, refactor." },
    ],
  };
}

/** A Ralph loop runner plugin vendored from snarktank. */
function ralph(): VendoredArtifact {
  return {
    name: "ralph",
    source: "snarktank/ralph@v1.2",
    version: "1.2.0",
    files: [
      { path: "ralph.sh", content: "#!/usr/bin/env bash\nwhile true; do run_next_task; done\n" },
      { path: ".claude-plugin/plugin.json", content: '{ "name": "ralph", "version": "1.2.0" }' },
    ],
  };
}

describe("integrity — acceptance (build -> persist -> verify, the --frozen-lockfile lifecycle)", () => {
  it("pins survive the wpm.lock write/read losslessly — exactly which version, from where (AC#1/#3)", () => {
    const vendored = [superpowers(), ralph()];

    // wpm build: compute pins, then serialize the lockfile (this is what gets written to wpm.lock).
    const built = buildLockfile(vendored);
    const lockText = serializeLockfile(built);

    // A later wpm project validate / wpm build reads wpm.lock back.
    const readBack = parseLockfile(lockText);
    expect(readBack).toEqual(built);

    // The pins are sufficient to determine which version of each artifact was bundled and from where.
    expect(readBack.artifacts.superpowers?.source).toBe("obra/superpowers@v2");
    expect(readBack.artifacts.superpowers?.version).toBe("2.0.0");
    expect(readBack.artifacts.superpowers?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(readBack.artifacts.ralph?.source).toBe("snarktank/ralph@v1.2");
    expect(readBack.artifacts.ralph?.version).toBe("1.2.0");
  });

  it("verification PASSES when the vendored content is unchanged (clean build, AC#2)", () => {
    const vendored = [superpowers(), ralph()];
    const lock = parseLockfile(serializeLockfile(buildLockfile(vendored)));
    // Re-read the same vendored content (the operation re-lists the files via the FS port).
    expect(verifyLockfile(lock, [superpowers(), ralph()])).toEqual({
      ok: true,
      drifted: [],
      missing: [],
      extra: [],
    });
  });

  it("verification FAILS, naming the drifted artifact, when a vendored skill is tampered (AC#2)", () => {
    const lock = parseLockfile(serializeLockfile(buildLockfile([superpowers(), ralph()])));

    // A single byte of superpowers' SKILL.md is changed after the lock was written.
    const tampered = [superpowers("# test-driven-development\nWrite the test first!"), ralph()];
    const result = verifyLockfile(lock, tampered);
    expect(result.ok).toBe(false);
    expect(result.drifted).toEqual(["superpowers"]);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });

  it("verification reports a dropped artifact as missing (AC#2)", () => {
    const lock = parseLockfile(serializeLockfile(buildLockfile([superpowers(), ralph()])));
    const result = verifyLockfile(lock, [superpowers()]); // ralph removed from the project
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["ralph"]);
    expect(result.drifted).toEqual([]);
  });
});
