import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { provisionFreshPython } from "../../scripts/python-environment.mjs";

describe("owned Python environment boundary", () => {
  it("rejects a symlink environment before touching outside bytes or invoking tools", () => {
    const boundary = mkdtempSync(join(tmpdir(), "wpm-python-boundary-"));
    const outside = mkdtempSync(join(tmpdir(), "wpm-python-outside-"));
    try {
      writeFileSync(join(outside, "preserve.txt"), "personal fixture state");
      const destination = join(boundary, "python");
      symlinkSync(outside, destination, process.platform === "win32" ? "junction" : "dir");
      let invoked = false;
      expect(() =>
        provisionFreshPython({
          boundary,
          destination,
          lockfile: join(boundary, "lock"),
          pythonVersion: "3.13.13",
          env: {},
          run: () => {
            invoked = true;
            return "";
          },
        }),
      ).toThrow(/ordinary directory/);
      expect(invoked).toBe(false);
      expect(readFileSync(join(outside, "preserve.txt"), "utf8")).toBe("personal fixture state");
    } finally {
      rmSync(boundary, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
