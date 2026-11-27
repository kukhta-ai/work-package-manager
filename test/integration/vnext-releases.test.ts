import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hash, readPackageArchive } from "../../src/vnext/adapters/package-archive.js";
import {
  PackageWorkspace,
  validateReleaseFiles,
} from "../../src/vnext/adapters/package-workspace.js";
import {
  createReleaseFiles,
  readReleaseArtifact,
} from "../../src/vnext/adapters/release-artifact.js";
import { ReleaseWorkspace } from "../../src/vnext/adapters/releases.js";
import { createDeterministicTarball, VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

function plain(root: string) {
  const author = join(root, "author");
  const ws = new VnextWorkspace(author, new FakeBacklog());
  ws.init("sample");
  ws.createSetup("context");
  return { author, ws, releases: new ReleaseWorkspace(author) };
}

describe("release content orchestration", () => {
  it.each([
    false,
    true,
  ])("rejects a changed explicitly pinned selection before effects (dryRun %s)", async (dryRun) =>
    withTempDir((root) => {
      new VnextWorkspace(root, new FakeBacklog()).init("sample");
      const original: unknown = Reflect.get(PackageWorkspace.prototype, "select");
      if (typeof original !== "function") throw new Error("missing selection method");
      let first = true;
      const spy = vi.spyOn(PackageWorkspace.prototype, "select").mockImplementation(function (
        this: PackageWorkspace,
        ...args
      ) {
        const directory = Reflect.apply(original, this, args) as string;
        if (first) {
          first = false;
          new VnextWorkspace(directory).version("2.0.0");
        }
        return directory;
      });
      try {
        expect(() =>
          new ReleaseWorkspace(root).build({ name: "sample", packageVersion: "0.1.0", dryRun }),
        ).toThrow();
      } finally {
        spy.mockRestore();
      }
      expect(existsSync(join(root, "builds"))).toBe(false);
      expect(existsSync(join(root, ".wpm-mutation.lock"))).toBe(false);
    }));

  it("builds equal content in all formats, retains legacy bytes, and reads after source removal", async () =>
    withTempDir((root) => {
      const { author, ws, releases } = plain(root);
      const legacy = ws.build() as { archive: string };
      const before = readFileSync(join(author, legacy.archive));
      const ids = [];
      for (const format of ["tgz", "zip", "directory"] as const) {
        const destination = join(root, `saved-${format}`);
        releases.build({ format, out: destination, files: true });
        const artifact = readReleaseArtifact(destination);
        ids.push(artifact.contentDigest);
        expect(releases.verify(destination)).toMatchObject({
          status: "verified",
          publisherTrust: "unverified",
          executionOccurred: false,
        });
      }
      expect(new Set(ids).size).toBe(1);
      expect(readFileSync(join(author, legacy.archive))).toEqual(before);
      rmSync(author, { recursive: true });
      expect(
        new ReleaseWorkspace(root).view("saved-zip", {
          agentSupport: true,
          target: "claude-code",
          opening: "session",
        }),
      ).toMatchObject({
        identity: { name: "sample" },
        agentSupport: [{ contextLoaded: false, authenticated: false, opening: "session" }],
      });
    }));
  it("reports legacy integrity as unrecorded and requires an external exact digest for verification", async () =>
    withTempDir((root) => {
      const { ws, releases, author } = plain(root);
      const legacy = ws.build() as { archive: string };
      const path = join(author, legacy.archive),
        digest = hash(readFileSync(path));
      expect(releases.view(path)).toMatchObject({ integrity: "unrecorded" });
      expect(() => releases.verify(path)).toThrow("unrecorded");
      expect(releases.verify(path, digest)).toMatchObject({
        integrity: "external-digest-verified",
      });
      expect(() => releases.verify(path, "0".repeat(64))).toThrow("digest differs");
    }));
  it("keeps dry runs effect-free and rejects stale integrity, source reservations and overlapping review output", async () =>
    withTempDir((root) => {
      const { ws, releases, author } = plain(root);
      ws.lock();
      const out = join(root, "new", "release.zip");
      releases.build({ format: "zip", out, dryRun: true });
      expect(existsSync(join(root, "new"))).toBe(false);
      expect(existsSync(join(author, ".wpm-mutation.lock"))).toBe(false);
      ws.version("1.0.0");
      expect(() => releases.build({ out })).toThrow("stale");
      expect(existsSync(out)).toBe(false);
      ws.lock();
      writeFileSync(join(author, ".wpm-mutation.lock"), "foreign owner");
      expect(() => releases.build({ out, dryRun: true })).toThrow("writer");
      expect(() => releases.build({ out })).toThrow("reservation");
      rmSync(join(author, ".wpm-mutation.lock"));
      const saved = join(root, "saved");
      releases.build({ format: "directory", out: saved });
      expect(() => releases.review(saved, join(saved, "review"), undefined, false)).toThrow(
        "overlap",
      );
      expect(existsSync(join(saved, "review"))).toBe(false);
    }));
  it("validates operation/setup and private content even when an attacker recomputes the release envelope", async () =>
    withTempDir((root) => {
      const { ws, releases } = plain(root);
      const base = ws.captureForGraph().files;
      const raw = JSON.parse(
        base.find((file) => file.path === "contract.json")?.bytes.toString("utf8") ?? "{}",
      ) as { workerSetup: Record<string, unknown> };
      for (const changed of [
        { ...raw, workerSetup: { ...raw.workerSetup, default: "missing" } },
        { ...raw, workerSetup: { ...raw.workerSetup, names: ["context", "context"] } },
        { ...raw, operations: [{ id: "missing", prerequisites: [], setup: null }] },
        { ...raw, plugin: { command: "evil" } },
      ]) {
        const files = base.map((file) =>
          file.path === "contract.json"
            ? { ...file, bytes: Buffer.from(JSON.stringify(changed)) }
            : file,
        );
        const target = join(root, "bad.tgz");
        writeFileSync(target, createDeterministicTarball(createReleaseFiles(files)));
        expect(() => releases.verify(target)).toThrow();
      }
      const files = [...base, { path: "payload/.env", bytes: Buffer.from("SECRET=private") }];
      const target = join(root, "private.tgz");
      writeFileSync(target, createDeterministicTarball(createReleaseFiles(files)));
      expect(() => releases.view(target)).toThrow();
    }));
  it("builds a runtime graph without dev content and permits the new TGZ as a frozen dependency", async () =>
    withTempDir((root) => {
      const ws = new PackageWorkspace(root);
      ws.init();
      ws.create("app");
      ws.create("lib");
      ws.create("author-tools");
      const app = join(root, "packages/app"),
        lib = join(root, "packages/lib");
      ws.editDependency(
        app,
        "lib",
        { source: "workspace", range: "*" },
        "dependencies",
        false,
        false,
      );
      ws.editDependency(
        app,
        "author-tools",
        { source: "workspace", range: "*" },
        "devDependencies",
        false,
        false,
      );
      const releases = new ReleaseWorkspace(root),
        destination = join(root, "app.tgz");
      releases.build({ name: "app", out: destination });
      const view = releases.view(destination) as { packages: { name: string }[] };
      expect(view.packages.map((p) => p.name).sort()).toEqual(["app", "lib"]);
      expect(
        readPackageArchive(readFileSync(destination)).some(
          (file) => file.path === "release-manifest.json",
        ),
      ).toBe(true);
      ws.create("consumer");
      const consumer = join(root, "packages/consumer");
      ws.editDependency(
        consumer,
        "app",
        { source: "file:../../app.tgz", range: "*" },
        "dependencies",
        false,
        false,
      );
      expect(ws.checkPackage(consumer)).toBeTypeOf("object");
      rmSync(lib, { recursive: true });
      expect(() => releases.build({ name: "app", out: join(root, "changed.tgz") })).toThrow();
    }));
  it("rejects duplicate contract keys even with an internally consistent envelope", () => {
    const files = [
      {
        path: "contract.json",
        bytes: Buffer.from(
          '{"schemaVersion":1,"name":"hidden","name":"visible","version":"1.0.0","operations":[],"groups":{},"workerSetup":{"default":null,"names":[]}}',
        ),
      },
      { path: "AGENTS.md", bytes: Buffer.from("data") },
      { path: "CLAUDE.md", bytes: Buffer.from("data") },
    ];
    expect(() => validateReleaseFiles(files)).toThrow("duplicate");
  });
});
