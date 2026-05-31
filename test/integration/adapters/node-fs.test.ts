import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { withTempDir } from "../../helpers/tmpdir.js";

describe("NodeFileSystem (the real FileSystem adapter, against a real tmpdir)", () => {
  it("writes then reads a file round-trip", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "manifest.yml");
      fs.write(p, "name: p\n");
      expect(fs.read(p)).toBe("name: p\n");
    });
  });

  it("write is atomic: overwrite fully replaces, leaving no .tmp residue (AC#2)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "f.txt");
      fs.write(p, "first version - longer content");
      fs.write(p, "second");
      expect(fs.read(p)).toBe("second");
      // No leftover temp files in the directory (the temp is named ".<hex>.tmp").
      const leftovers = readdirSync(dir).filter((n) => n.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    });
  });

  it("a failed write leaves the pre-existing file intact and drops no .tmp residue (AC#2)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "keep.txt");
      fs.write(p, "ORIGINAL");
      // Force the rename to fail by making the target path a directory (renaming a file over a
      // non-empty directory fails). The original file content must survive and no .tmp may remain.
      const asDir = join(dir, "target-is-dir");
      fs.makeDirectories(join(asDir, "child"));
      expect(() => fs.write(asDir, "should fail")).toThrow();
      // Original untouched.
      expect(fs.read(p)).toBe("ORIGINAL");
      // No temp residue in either directory.
      expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    });
  });

  it("write creates missing parent directories (AC#4)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "a", "b", "c", "file.txt");
      fs.write(p, "deep");
      expect(fs.read(p)).toBe("deep");
      expect(existsSync(join(dir, "a", "b", "c"))).toBe(true);
    });
  });

  it("exists / makeDirectories / list work over real entries", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      fs.makeDirectories(join(dir, "sub"));
      fs.write(join(dir, "top.txt"), "t");
      fs.write(join(dir, "sub", "inner.txt"), "i");
      expect(fs.exists(join(dir, "sub"))).toBe(true);
      expect(fs.exists(join(dir, "missing"))).toBe(false);
      const entries = fs.list(dir).sort((a, b) => a.name.localeCompare(b.name));
      expect(entries).toEqual([
        { name: "sub", kind: "directory" },
        { name: "top.txt", kind: "file" },
      ]);
    });
  });

  it("copyTree recursively copies files and nested dirs, preserving bytes", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const src = join(dir, "src");
      fs.write(join(src, "a.txt"), "A");
      fs.write(join(src, "nested", "b.txt"), "B");
      // A binary file written outside the port to assert byte preservation.
      const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      writeFileSync(join(src, "bin.dat"), bytes);

      const dst = join(dir, "dst");
      fs.copyTree(src, dst);
      expect(fs.read(join(dst, "a.txt"))).toBe("A");
      expect(fs.read(join(dst, "nested", "b.txt"))).toBe("B");
      expect(readFileSync(join(dst, "bin.dat")).equals(bytes)).toBe(true);
    });
  });

  it("remove deletes a subtree, and removing an absent path is a no-op", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      fs.write(join(dir, "d", "x.txt"), "x");
      fs.remove(join(dir, "d"));
      expect(existsSync(join(dir, "d"))).toBe(false);
      expect(() => fs.remove(join(dir, "never"))).not.toThrow();
    });
  });

  it("ensureAlias on POSIX creates a working symlink pointing at the target (AC#3)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const target = join(dir, "installer-skills");
      fs.makeDirectories(target);
      fs.write(join(target, "SKILL.md"), "# skill");
      const link = join(dir, ".claude-skills");

      const result = fs.ensureAlias(target, link);
      expect(result.kind).toBe("symlink");
      // It is really a symlink, and it resolves to the target (so reading through it works).
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(realpathSync(link)).toBe(realpathSync(target));
      expect(fs.read(join(link, "SKILL.md"))).toBe("# skill");
    });
  });

  it("ensureAlias falls back to a copy when the platform is forced to win32 (AC#3)", async () => {
    await withTempDir((dir) => {
      // Inject platform win32 so the copy branch runs on this Linux runner.
      const fs = new NodeFileSystem({ platform: "win32" });
      const target = join(dir, "skills");
      fs.makeDirectories(target);
      fs.write(join(target, "SKILL.md"), "# s");
      const link = join(dir, "alias");

      const result = fs.ensureAlias(target, link);
      expect(result.kind).toBe("copy");
      if (result.kind === "copy") {
        expect(result.warning).toContain("Windows");
      }
      // It is a real copy (not a symlink) and the content is present.
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(fs.read(join(link, "SKILL.md"))).toBe("# s");
    });
  });
});
