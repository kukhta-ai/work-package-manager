import { describe, expect, it } from "vitest";
import { assertPortableTree } from "../../../src/vnext/adapters/portable-tree.js";

type Entry = Parameters<typeof assertPortableTree>[0][number];
const file = (path: string): Entry => ({ path, kind: "file" });
const directory = (path: string): Entry => ({ path, kind: "directory" });

describe("portable complete tree preflight", () => {
  it("accepts distinct native contexts and shared exact parent directories without changing paths", () => {
    const entries = [
      directory(".agents"),
      directory(".agents/skills"),
      file(".agents/skills/brief/SKILL.md"),
      file(".agents/skills/brief/docs/guide.md"),
      file(".agents/skills/review/SKILL.md"),
      file(".claude/skills/brief/SKILL.md"),
      file("caf\u00e9.md"),
      directory("empty"),
    ];
    const before = structuredClone(entries);
    expect(() => assertPortableTree(entries)).not.toThrow();
    expect(() => assertPortableTree([...entries].reverse())).not.toThrow();
    expect(entries).toEqual(before);
  });

  it.each([
    {
      name: "case aliases of the same file",
      entries: [
        file(".agents/skills/brief/docs/Guide.md"),
        file(".agents/skills/brief/docs/guide.md"),
      ],
    },
    {
      name: "NFC aliases of the same file",
      entries: [
        file(".agents/skills/brief/caf\u00e9.md"),
        file(".agents/skills/brief/cafe\u0301.md"),
      ],
    },
    {
      name: "case aliases of implied directories with distinct descendants",
      entries: [file(".agents/skills/Brief/one.md"), file(".agents/skills/brief/two.md")],
    },
    {
      name: "NFC aliases of implied directories with distinct descendants",
      entries: [file("caf\u00e9/one.md"), file("cafe\u0301/two.md")],
    },
    {
      name: "file and directory aliases",
      entries: [file(".agents/skills/brief/Doc"), file(".agents/skills/brief/doc/chapter.md")],
    },
    { name: "an exact file ancestor", entries: [file("doc"), file("doc/chapter.md")] },
    { name: "duplicate files", entries: [file("AGENTS.md"), file("AGENTS.md")] },
    { name: "an empty directory and file alias", entries: [directory("Doc"), file("doc")] },
    { name: "empty directory aliases", entries: [directory("Doc"), directory("doc")] },
    { name: "an exact directory and file", entries: [directory("doc"), file("doc")] },
  ])("rejects $name regardless of input ordering", ({ entries }) => {
    expect(() => assertPortableTree(entries)).toThrow("portable path collision");
    expect(() => assertPortableTree([...entries].reverse())).toThrow("portable path collision");
  });
});
