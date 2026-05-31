import { describe, expect, it, vi } from "vitest";
import { ensureSymlinkOrCopy } from "../../../src/util/symlink.js";

describe("ensureSymlinkOrCopy — both branches forced on any OS (AC#3)", () => {
  it("on a POSIX platform, symlinks and reports the symlink kind", () => {
    const symlink = vi.fn();
    const copy = vi.fn();
    const result = ensureSymlinkOrCopy("/target", "/link", { platform: "linux", symlink, copy });
    expect(result).toEqual({ kind: "symlink" });
    expect(symlink).toHaveBeenCalledWith("/target", "/link");
    expect(copy).not.toHaveBeenCalled();
  });

  it("on Windows, falls back to a copy and returns the copy kind + a warning", () => {
    const symlink = vi.fn();
    const copy = vi.fn();
    const result = ensureSymlinkOrCopy("/target", "/link", { platform: "win32", symlink, copy });
    expect(result.kind).toBe("copy");
    if (result.kind === "copy") {
      expect(result.warning.length).toBeGreaterThan(0);
      expect(result.warning).toContain("Windows");
    }
    expect(copy).toHaveBeenCalledWith("/target", "/link");
    expect(symlink).not.toHaveBeenCalled();
  });

  it("the warning names both paths so the operation can surface it usefully", () => {
    const result = ensureSymlinkOrCopy("/installer-skills", "/.claude/skills", {
      platform: "win32",
      copy: vi.fn(),
    });
    expect(result.kind).toBe("copy");
    if (result.kind === "copy") {
      expect(result.warning).toContain("/installer-skills");
      expect(result.warning).toContain("/.claude/skills");
    }
  });
});
