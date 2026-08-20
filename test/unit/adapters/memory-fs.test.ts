import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";

describe("MemoryFileSystem (the in-memory FileSystem fake — AC#1)", () => {
  it("writes then reads a file back", () => {
    const fs = new MemoryFileSystem();
    fs.write("/proj/manifest.yml", "name: p\n");
    expect(fs.read("/proj/manifest.yml")).toBe("name: p\n");
  });

  it("overwrites an existing file with the full new content", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a.txt", "old");
    fs.write("/a.txt", "new content");
    expect(fs.read("/a.txt")).toBe("new content");
  });

  it("write creates missing parent directories (AC#4)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/deep/nested/dir/file.txt", "hi");
    expect(fs.read("/deep/nested/dir/file.txt")).toBe("hi");
    expect(fs.exists("/deep")).toBe(true);
    expect(fs.exists("/deep/nested/dir")).toBe(true);
  });

  it("read of a missing file throws", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.read("/missing")).toThrow();
  });

  it("exists distinguishes present files/dirs from absent paths", () => {
    const fs = new MemoryFileSystem();
    fs.write("/x/y.txt", "1");
    fs.makeDirectories("/empty");
    expect(fs.exists("/x/y.txt")).toBe(true);
    expect(fs.exists("/x")).toBe(true);
    expect(fs.exists("/empty")).toBe(true);
    expect(fs.exists("/nope")).toBe(false);
  });

  it("makeDirectories creates an (empty) directory that lists as empty", () => {
    const fs = new MemoryFileSystem();
    fs.makeDirectories("/d/e/f");
    expect(fs.exists("/d/e/f")).toBe(true);
    expect(fs.list("/d/e/f")).toEqual([]);
  });

  it("list returns immediate entries with file/directory kind", () => {
    const fs = new MemoryFileSystem();
    fs.write("/root/a.txt", "a");
    fs.write("/root/sub/b.txt", "b");
    fs.makeDirectories("/root/emptydir");
    const entries = fs.list("/root").sort((x, y) => x.name.localeCompare(y.name));
    expect(entries).toEqual([
      { name: "a.txt", kind: "file" },
      { name: "emptydir", kind: "directory" },
      { name: "sub", kind: "directory" },
    ]);
  });

  it("list of a missing directory throws", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.list("/nope")).toThrow();
  });

  it("list of a path that is a FILE throws ENOTDIR, not ENOENT (parity with node)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a/file.txt", "x");
    // The real adapter's readdirSync throws ENOTDIR for a file; the fake must distinguish "is a file"
    // from "doesn't exist" so a downstream operation test can't pass against the fake but fail for real.
    expect(() => fs.list("/a/file.txt")).toThrow(/ENOTDIR/);
    expect(() => fs.list("/a/file.txt")).not.toThrow(/ENOENT/);
  });

  it("copyTree copies a directory subtree (files + nested dirs)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/src/a.txt", "A");
    fs.write("/src/nested/b.txt", "B");
    fs.copyTree("/src", "/dst");
    expect(fs.read("/dst/a.txt")).toBe("A");
    expect(fs.read("/dst/nested/b.txt")).toBe("B");
    // The original is untouched.
    expect(fs.read("/src/a.txt")).toBe("A");
  });

  it("copyTree copies a single file", () => {
    const fs = new MemoryFileSystem();
    fs.write("/one.txt", "ONE");
    fs.copyTree("/one.txt", "/copy.txt");
    expect(fs.read("/copy.txt")).toBe("ONE");
  });

  it("remove deletes a file", () => {
    const fs = new MemoryFileSystem();
    fs.write("/gone.txt", "x");
    fs.remove("/gone.txt");
    expect(fs.exists("/gone.txt")).toBe(false);
  });

  it("remove deletes a directory subtree", () => {
    const fs = new MemoryFileSystem();
    fs.write("/dir/a.txt", "a");
    fs.write("/dir/sub/b.txt", "b");
    fs.remove("/dir");
    expect(fs.exists("/dir")).toBe(false);
    expect(fs.exists("/dir/a.txt")).toBe(false);
    expect(fs.exists("/dir/sub/b.txt")).toBe(false);
  });

  it("remove of an absent path is a no-op (force semantics)", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.remove("/never-existed")).not.toThrow();
  });

  it("ensureAlias records the alias and reports the symlink kind", () => {
    const fs = new MemoryFileSystem();
    const result = fs.ensureAlias("/installer-skills", "/.claude/skills");
    expect(result.kind).toBe("symlink");
    expect(fs.aliasTarget("/.claude/skills")).toBe("/installer-skills");
  });

  it("exists follows an alias to its target: broken link is false, then true once the target exists", () => {
    // Parity with the real adapter's `existsSync`, which follows the symlink: a dangling link is `false`,
    // and the same link reads as present once its target is created. (Guards task-19/task-25 idempotency,
    // whose re-derivation probes `exists(linkPath)`.)
    const fs = new MemoryFileSystem();
    fs.ensureAlias("/installer-skills", "/.claude/skills"); // target does NOT exist yet
    expect(fs.exists("/.claude/skills")).toBe(false); // broken link → false (ELOOP-free)

    fs.makeDirectories("/installer-skills"); // now the target exists
    expect(fs.exists("/.claude/skills")).toBe(true); // link resolves → true
  });

  it("exists resolves a chain of aliases and does not hang on a cycle", () => {
    const fs = new MemoryFileSystem();
    // A chain a → b → real dir resolves to true.
    fs.makeDirectories("/real");
    fs.ensureAlias("/real", "/b");
    fs.ensureAlias("/b", "/a");
    expect(fs.exists("/a")).toBe(true);

    // A cycle x → y → x terminates and yields false (mirrors existsSync's ELOOP → false).
    const cyc = new MemoryFileSystem();
    cyc.ensureAlias("/y", "/x");
    cyc.ensureAlias("/x", "/y");
    expect(cyc.exists("/x")).toBe(false);
  });

  it("a RELATIVE alias reads back relative (readlink parity) and resolves against the link's parent dir (TASK-102)", () => {
    const fs = new MemoryFileSystem();
    // Model the per-bundle `backlog → install-backlog` link: relative target, created beside install-backlog.
    fs.write("/bundles/web/install-backlog/config.yml", "task_prefix: web\n");
    fs.ensureAlias("install-backlog", "/bundles/web/backlog");

    // The stored target is the RAW relative string (what `readlinkSync` would return) — never absolutized:
    expect(fs.aliasTarget("/bundles/web/backlog")).toBe("install-backlog");
    // …yet `exists` resolves it against the LINK's parent (POSIX symlink semantics), so it points at the real
    // install-backlog dir — not `/install-backlog`:
    expect(fs.exists("/bundles/web/backlog")).toBe(true);
    expect(fs.exists("/install-backlog")).toBe(false);

    // A relative link whose target is absent resolves to false (dangling), like a real symlink:
    fs.ensureAlias("install-backlog", "/bundles/empty/backlog");
    expect(fs.exists("/bundles/empty/backlog")).toBe(false);
  });

  it("normalizes paths (trailing slash, '.', '..') consistently", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a/b/../c.txt", "v");
    expect(fs.read("/a/c.txt")).toBe("v");
    expect(fs.exists("/a/c.txt/")).toBe(true);
  });
});

describe("MemoryFileSystem alias observations", () => {
  it("records an absolute Win32 target as POSIX and resolves it in the fake namespace", () => {
    const fs = new MemoryFileSystem();
    fs.write("C:\\work\\proj\\installer-skills\\demo\\SKILL.md", "# demo\n");

    fs.ensureAlias("C:\\work\\proj\\installer-skills", "C:\\work\\proj\\.claude\\skills");

    expect(fs.aliasTarget("C:\\work\\proj\\.claude\\skills")).toBe("C:/work/proj/installer-skills");
    expect(fs.exists("C:\\work\\proj\\.claude\\skills")).toBe(true);
  });

  it("preserves relative alias targets byte-for-byte", () => {
    const fs = new MemoryFileSystem();
    fs.ensureAlias("install-backlog", "/proj/bundles/web/backlog");
    fs.ensureAlias("nested\\relative-target", "/proj/other-alias");

    expect(fs.aliasTarget("/proj/bundles/web/backlog")).toBe("install-backlog");
    expect(fs.aliasTarget("/proj/other-alias")).toBe("nested\\relative-target");
  });
});
