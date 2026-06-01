import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir, withTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges (integration) test for the tmpdir helper: it touches the real filesystem, so it
 * belongs in `test/integration/`. Doubles as the helper's own coverage (no dead code).
 */
describe("tmpdir helper", () => {
  it("makeTempDir creates a unique, empty, absolute directory; removeTempDir deletes it", () => {
    const a = makeTempDir();
    const b = makeTempDir();
    try {
      expect(isAbsolute(a)).toBe(true);
      expect(existsSync(a)).toBe(true);
      expect(readdirSync(a)).toEqual([]); // freshly created ⇒ empty
      expect(a).not.toBe(b); // unique per call
    } finally {
      removeTempDir(a);
      removeTempDir(b);
    }
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(false);
  });

  it("removeTempDir is safe to call twice / on a missing path (never throws)", () => {
    const dir = makeTempDir();
    removeTempDir(dir);
    expect(() => removeTempDir(dir)).not.toThrow();
  });

  it("withTempDir provides a writable dir and removes it afterwards", async () => {
    let captured = "";
    const result = await withTempDir((dir) => {
      captured = dir;
      writeFileSync(join(dir, "marker.txt"), "hi", "utf8");
      expect(existsSync(join(dir, "marker.txt"))).toBe(true);
      return 42;
    });
    expect(result).toBe(42); // forwards the callback's return value
    expect(existsSync(captured)).toBe(false); // cleaned up even though we wrote into it
  });

  it("withTempDir still cleans up when the callback throws", async () => {
    let captured = "";
    await expect(
      withTempDir((dir) => {
        captured = dir;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(captured)).toBe(false);
  });
});
