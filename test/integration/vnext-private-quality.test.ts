import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { stableJson } from "../../src/vnext/core/model.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

describe("private analyzer state exclusion", () => {
  it.each([
    "payload/.quality/evidence.json",
    "payload/nested/.QUALITY/cache.bin",
  ])("rejects registered private payload %s before check or archive output", async (path) => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("private-payload");
      const privateFile = join(root, path);
      mkdirSync(dirname(privateFile), { recursive: true });
      const contents = "PRIVATE_ANALYZER_STATE\n";
      writeFileSync(privateFile, contents);
      const manifest = stableJson({ ...workspace.view(), files: [path] });
      writeFileSync(join(root, "package.yml"), manifest);

      expect(() => workspace.check()).toThrow("development-only or private source path");
      expect(() => workspace.lock()).toThrow("development-only or private source path");
      expect(() => workspace.build()).toThrow("development-only or private source path");
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(manifest);
      expect(readFileSync(privateFile, "utf8")).toBe(contents);
      expect(existsSync(join(root, "wpm.lock.json"))).toBe(false);
      expect(existsSync(join(root, "builds"))).toBe(false);
    });
  });

  it.each([
    ".quality/worker-context",
    "shared/.QuAlItY/worker-context",
  ])("rejects private setup source %s through registration and authored declarations", async (path) => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("private-setup");
      const worker = join(root, path, "WORKER.md");
      mkdirSync(dirname(worker), { recursive: true });
      const contents = "PRIVATE_ANALYZER_CONTEXT\n";
      writeFileSync(worker, contents);
      const before = readFileSync(join(root, "package.yml"), "utf8");

      expect(() => workspace.addSetup(path, "private", "plain")).toThrow(
        "development-only or private source path",
      );
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(before);
      expect(workspace.view().workerSetup.setups).toEqual({});
      const authored = stableJson({
        ...workspace.view(),
        workerSetup: { setups: { private: { source: path, backend: "plain" } } },
      });
      writeFileSync(join(root, "package.yml"), authored);
      expect(() => workspace.check()).toThrow("development-only or private source path");
      expect(() => workspace.build()).toThrow("development-only or private source path");
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(authored);
      expect(readFileSync(worker, "utf8")).toBe(contents);
      expect(existsSync(join(root, "builds"))).toBe(false);
    });
  });

  it("builds legitimate lookalike names and ordinary dist or coverage payloads", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("public-quality");
      const paths = [
        "payload/quality/evidence.json",
        "payload/.quality-example/evidence.json",
        "payload/.quality.json",
        "payload/dist/public.txt",
        "payload/coverage/example.json",
      ];
      for (const path of paths) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), `PUBLIC_PAYLOAD:${path}\n`);
      }
      const source = ".quality-example/context";
      mkdirSync(join(root, source), { recursive: true });
      writeFileSync(join(root, source, "WORKER.md"), "PUBLIC_WORKER_CONTEXT\n");
      writeFileSync(join(root, "package.yml"), stableJson({ ...workspace.view(), files: paths }));

      expect(workspace.addSetup(source, "public", "plain")).toMatchObject({ source });
      expect(workspace.check()).toMatchObject({ valid: true });
      const built = workspace.build() as { archive: string; files: string[] };
      const archive = gunzipSync(readFileSync(join(root, built.archive)));
      for (const path of paths) {
        expect(built.files).toContain(path);
        expect(archive.includes(Buffer.from(`PUBLIC_PAYLOAD:${path}\n`))).toBe(true);
      }
      expect(archive.includes(Buffer.from("PUBLIC_WORKER_CONTEXT\n"))).toBe(true);
    });
  });
});
