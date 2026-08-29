import { describe, expect, it, vi } from "vitest";
import { ensureSymlinkOrCopy } from "../../../src/util/symlink.js";

describe("ensureSymlinkOrCopy — both branches forced on any OS (AC#3)", () => {
  it("on a POSIX platform, symlinks and reports the symlink kind", () => {
    const symlink = vi.fn();
    const copy = vi.fn();
    const makeDirectories = vi.fn();
    const result = ensureSymlinkOrCopy("/target", "/dir/link", {
      platform: "linux",
      symlink,
      copy,
      makeDirectories,
    });
    expect(result).toEqual({ kind: "symlink" });
    expect(symlink).toHaveBeenCalledWith("/target", "/dir/link");
    expect(copy).not.toHaveBeenCalled();
  });

  it("on Windows, falls back to a copy and returns the copy kind + a warning", () => {
    const symlink = vi.fn();
    const copy = vi.fn();
    const rename = vi.fn();
    const result = ensureSymlinkOrCopy("/target", "/dir/link", {
      platform: "win32",
      symlink,
      copy,
      rename,
      makeDirectories: vi.fn(),
      temporaryPath: (path) => `${path}.tmp`,
    });
    expect(result.kind).toBe("copy");
    if (result.kind === "copy") {
      expect(result.warning.length).toBeGreaterThan(0);
      expect(result.warning).toContain("Windows");
    }
    expect(copy).toHaveBeenCalledWith("/target", "/dir/link.tmp");
    expect(rename).toHaveBeenCalledWith("/dir/link.tmp", "/dir/link");
    expect(symlink).not.toHaveBeenCalled();
  });

  it("creates the link's PARENT directory before creating the alias (fake↔real parity)", () => {
    // The real fs.symlink/fs.cp do not create missing parents; the operation lays the alias dir down, so
    // `ensureSymlinkOrCopy` must `mkdir -p` the link's parent first (else ENOENT for e.g. `.claude/skills`).
    const calls: string[] = [];
    const makeDirectories = vi.fn(() => calls.push("mkdir"));
    const symlink = vi.fn(() => calls.push("symlink"));
    ensureSymlinkOrCopy("/proj/installer-skills", "/proj/.claude/skills", {
      platform: "linux",
      symlink,
      makeDirectories,
    });
    expect(makeDirectories).toHaveBeenCalledWith("/proj/.claude"); // the link's parent
    expect(calls).toEqual(["mkdir", "symlink"]); // parent created BEFORE the link
  });

  it("the warning names both paths so the operation can surface it usefully", () => {
    const result = ensureSymlinkOrCopy("/installer-skills", "/.claude/skills", {
      platform: "win32",
      copy: vi.fn(),
      rename: vi.fn(),
      temporaryPath: (path) => `${path}.tmp`,
      // Mock the mkdir primitive: this test only inspects the warning string, and the default
      // `defaultMakeDirectories` would `mkdirSync(dirname("/.claude/skills"))` = real `mkdir /.claude`
      // at the filesystem root — which succeeds as root but fails (EACCES/ENOENT) for a non-root CI user.
      makeDirectories: vi.fn(),
    });
    expect(result.kind).toBe("copy");
    if (result.kind === "copy") {
      expect(result.warning).toContain("/installer-skills");
      expect(result.warning).toContain("/.claude/skills");
    }
  });

  it("removes a partial unpublished Windows copy and never publishes its destination", () => {
    const rename = vi.fn();
    const remove = vi.fn();
    expect(() =>
      ensureSymlinkOrCopy("/target", "/dir/link", {
        platform: "win32",
        copy: vi.fn(() => {
          throw new Error("partial copy failure");
        }),
        rename,
        remove,
        makeDirectories: vi.fn(),
        temporaryPath: (path) => `${path}.tmp`,
      }),
    ).toThrow("partial copy failure");
    expect(remove).toHaveBeenCalledWith("/dir/link.tmp");
    expect(rename).not.toHaveBeenCalled();
  });
});
