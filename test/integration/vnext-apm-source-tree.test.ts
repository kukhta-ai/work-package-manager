import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { stageApmSource } from "../../src/vnext/adapters/apm-source-tree.js";
import { withTempDir } from "../helpers/tmpdir.js";

function fixture(root: string) {
  const source = join(root, "authored");
  const state = join(root, "state");
  mkdirSync(source);
  writeFileSync(join(source, "apm.yml"), "name: root\nversion: 1.0.0\n");
  writeFileSync(join(source, "guide.md"), "Authored guide\n");
  return { source, state };
}
function interruptCopy(source: string, state: string): void {
  const nativeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
  const original = nativeFs.writeFileSync;
  const spy = vi
    .spyOn(nativeFs, "writeFileSync")
    .mockImplementation((...args: Parameters<typeof original>) => {
      if (args[0] === join(state, "native-source/guide.md"))
        throw new Error("simulated interrupted copy");
      return original(...args);
    });
  syncBuiltinESMExports();
  try {
    expect(() => stageApmSource(source, state)).toThrow("simulated interrupted copy");
  } finally {
    spy.mockRestore();
    syncBuiltinESMExports();
  }
}

describe("owned APM authored source staging", () => {
  it("anchors nested local references inside a stable copy and preserves the authored bytes", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      mkdirSync(join(source, "dep/child"), { recursive: true });
      mkdirSync(join(source, "shared"));
      const manifest =
        "# Root comment\nname: root\ndependencies:\n  apm:\n    - ./dep\n    - {path: ./shared, alias: common}\n    - owner/remote#revision\n";
      const dependency = "name: dep\ndependencies:\n  apm: [./child, ../shared]\n";
      writeFileSync(join(source, "apm.yml"), manifest);
      writeFileSync(join(source, "dep/apm.yml"), dependency);
      writeFileSync(join(source, "dep/child/apm.yml"), "name: child\n");
      writeFileSync(join(source, "shared/apm.yml"), "name: shared\n");
      const staged = stageApmSource(source, state);
      expect(parse(readFileSync(join(staged, "apm.yml"), "utf8"))).toMatchObject({
        dependencies: {
          apm: [
            join(staged, "dep"),
            { path: join(staged, "shared"), alias: "common" },
            "owner/remote#revision",
          ],
        },
      });
      expect(parse(readFileSync(join(staged, "dep/apm.yml"), "utf8"))).toMatchObject({
        dependencies: { apm: [join(staged, "dep/child"), join(staged, "shared")] },
      });
      expect(readFileSync(join(staged, "apm.yml"), "utf8")).toContain("# Root comment");
      expect(readFileSync(join(source, "apm.yml"), "utf8")).toBe(manifest);
      expect(readFileSync(join(source, "dep/apm.yml"), "utf8")).toBe(dependency);
      expect(stageApmSource(source, state)).toBe(staged);
    });
  });

  it("rebinds staged local references after moving the complete workspace without changing author source", async () => {
    await withTempDir((root) => {
      const initial = join(root, "before");
      const moved = join(root, "after");
      mkdirSync(initial);
      const { source, state } = fixture(initial);
      mkdirSync(join(source, "dep"));
      writeFileSync(join(source, "dep/apm.yml"), "name: dep\n");
      const manifest = "name: root\ndependencies:\n  apm: [./dep]\n";
      writeFileSync(join(source, "apm.yml"), manifest);
      const staged = stageApmSource(source, state);
      writeFileSync(join(staged, "apm.lock.yaml"), "Native lock retained for explicit relock\n");
      renameSync(initial, moved);
      const movedSource = join(moved, "authored");
      const movedState = join(moved, "state");
      const movedStage = stageApmSource(movedSource, movedState);
      expect(movedStage).toBe(join(movedState, "native-source"));
      expect(parse(readFileSync(join(movedStage, "apm.yml"), "utf8"))).toMatchObject({
        dependencies: { apm: [join(movedStage, "dep")] },
      });
      expect(readFileSync(join(movedSource, "apm.yml"), "utf8")).toBe(manifest);
      expect(readFileSync(join(movedStage, "apm.lock.yaml"), "utf8")).toBe(
        "Native lock retained for explicit relock\n",
      );
      expect(stageApmSource(movedSource, movedState)).toBe(movedStage);
    });
  });

  it("keeps authored MCP declarations while excluding them from the native service-free stage", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      const manifest =
        "# Authored root\nname: root\ndependencies:\n  mcp:\n    - name: remote\n      registry: false\n      transport: http\n      url: https://mcp.example.test/api\n";
      writeFileSync(join(source, "apm.yml"), manifest);
      const staged = stageApmSource(source, state);
      expect(parse(readFileSync(join(staged, "apm.yml"), "utf8"))).toEqual({
        name: "root",
        dependencies: {},
      });
      expect(readFileSync(join(staged, "apm.yml"), "utf8")).toContain("# Authored root");
      expect(readFileSync(join(source, "apm.yml"), "utf8")).toBe(manifest);
      expect(stageApmSource(source, state)).toBe(staged);
    });
  });

  it("refreshes only owned author files and preserves native lock, ignore and module bytes", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      const staged = stageApmSource(source, state);
      mkdirSync(join(staged, "apm_modules/remote"), { recursive: true });
      const generated = ["apm.lock.yaml", ".gitignore", "apm_modules/remote/apm.yml"];
      for (const path of generated) writeFileSync(join(staged, path), `Native ${path}\n`);
      rmSync(join(source, "guide.md"));
      mkdirSync(join(source, "new"));
      writeFileSync(join(source, "new/content.md"), "New authored content\n");
      expect(stageApmSource(source, state)).toBe(staged);
      expect(existsSync(join(staged, "guide.md"))).toBe(false);
      expect(readFileSync(join(staged, "new/content.md"), "utf8")).toBe("New authored content\n");
      for (const path of generated)
        expect(readFileSync(join(staged, path), "utf8")).toBe(`Native ${path}\n`);
    });
  });

  it.each([
    "foreign.md",
    "guide.md",
  ])("rejects unrecorded or edited staged author file %s before refresh", async (path) => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      const staged = stageApmSource(source, state);
      writeFileSync(join(staged, path), "Unrecorded authored bytes\n");
      writeFileSync(join(source, "guide.md"), "Changed original\n");
      expect(() => stageApmSource(source, state)).toThrow("staged authored files changed");
      expect(readFileSync(join(staged, path), "utf8")).toBe("Unrecorded authored bytes\n");
    });
  });

  it("recovers an interrupted initial copy using its journal without adopting changed bytes", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      interruptCopy(source, state);
      const staged = join(state, "native-source");
      const manifest = readFileSync(join(staged, "apm.yml"));
      writeFileSync(join(staged, "apm.yml"), "name: foreign\n");
      expect(() => stageApmSource(source, state)).toThrow("foreign or changed authored files");
      writeFileSync(join(staged, "apm.yml"), manifest);
      expect(stageApmSource(source, state)).toBe(staged);
      expect(readFileSync(join(staged, "guide.md"), "utf8")).toBe("Authored guide\n");
      expect(stageApmSource(source, state)).toBe(staged);
    });
  });

  it("preserves an interrupted request when its original input has changed", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      interruptCopy(source, state);
      writeFileSync(join(source, "guide.md"), "New input after interruption\n");
      expect(() => stageApmSource(source, state)).toThrow(
        "authored source changed during an interrupted",
      );
      expect(existsSync(join(state, "native-source/guide.md"))).toBe(false);
    });
  });

  it.each([
    false,
    true,
  ])("rejects %s object-form local dependency escapes before creating state", async (object) => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      mkdirSync(join(root, "outside"));
      writeFileSync(
        join(source, "apm.yml"),
        `name: root\ndependencies:\n  apm:\n    - ${object ? "{path: ../outside}" : "../outside"}\n`,
      );
      expect(() => stageApmSource(source, state)).toThrow("escapes the selected authored root");
      expect(existsSync(state)).toBe(false);
    });
  });

  it("rejects a foreign stage without deleting or adopting it", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      mkdirSync(join(state, "native-source"), { recursive: true });
      writeFileSync(join(state, "native-source/foreign.md"), "Foreign\n");
      expect(() => stageApmSource(source, state)).toThrow("no ownership journal");
      expect(readFileSync(join(state, "native-source/foreign.md"), "utf8")).toBe("Foreign\n");
      expect(existsSync(join(state, "source-stage.json"))).toBe(false);
    });
  });

  it("rejects symlinked authored and native-cache directories without following them", async () => {
    await withTempDir((root) => {
      const { source, state } = fixture(root);
      mkdirSync(join(root, "outside"));
      symlinkSync(join(root, "outside"), join(source, "linked"), "junction");
      expect(() => stageApmSource(source, state)).toThrow("symbolic paths");
      expect(existsSync(state)).toBe(false);
      rmSync(join(source, "linked"));
      const staged = stageApmSource(source, state);
      symlinkSync(join(root, "outside"), join(staged, "apm_modules"), "junction");
      expect(() => stageApmSource(source, state)).toThrow("symbolic paths");
    });
  });
});
