import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { readPackageArchive } from "../../src/vnext/adapters/package-archive.js";
import { PackageWorkspace, parseGraph } from "../../src/vnext/adapters/package-workspace.js";
import { createDeterministicTarball, VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { withTempDir } from "../helpers/tmpdir.js";

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing fixture value");
  return value;
}
const dep = (range = "*") => ({ source: "workspace", range });
function setup(root: string) {
  const ws = new PackageWorkspace(root);
  ws.init();
  return ws;
}
function make(ws: PackageWorkspace, name: string, version = "1.0.0", path = `packages/${name}`) {
  ws.create(name, path);
  const directory = join(ws.directory, path);
  ws.version(directory, version);
  return directory;
}
function declarations(directory: string, value: Record<string, unknown>) {
  const path = join(directory, "package.yml");
  const source = parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeFileSync(path, stringify({ ...source, schemaVersion: 2, ...value }));
}
describe("multi-package graph on real native authoring sources", () => {
  it("never adopts a foreign source after an ambiguous create interruption", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const original: unknown = Reflect.get(VnextWorkspace.prototype, "init");
      if (typeof original !== "function") throw new Error("missing init");
      const spy = vi.spyOn(VnextWorkspace.prototype, "init").mockImplementation(() => {
        throw new Error("interrupted before init");
      });
      try {
        expect(() => ws.create("lib")).toThrow("interrupted before init");
      } finally {
        spy.mockRestore();
      }
      const directory = join(root, "packages/lib");
      new VnextWorkspace(directory).init("lib");
      new VnextWorkspace(directory).addOperation("foreign", "Foreign authored work", {
        prerequisites: [],
        acceptanceCriteria: ["Foreign source remains"],
        dryRun: false,
      });
      expect(() => ws.create("lib")).toThrow("ambiguous interrupted");
      expect(ws.list()).toHaveLength(0);
      expect(existsSync(join(root, ".wpm-pending-package.json"))).toBe(true);
    }));
  it("blocks metadata changes during pending create and rechecks external identity changes", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const old = make(ws, "lib");
      const original: unknown = Reflect.get(VnextWorkspace.prototype, "writeForGraph");
      if (typeof original !== "function") throw new Error("missing write");
      const spy = vi.spyOn(VnextWorkspace.prototype, "writeForGraph").mockImplementation(function (
        this: VnextWorkspace,
        path,
        text,
        expected,
      ) {
        if (path === "workspace.yml") throw new Error("interrupted catalog");
        Reflect.apply(original, this, [path, text, expected]);
      });
      try {
        expect(() => ws.create("lib", "packages/new-lib")).toThrow("interrupted catalog");
      } finally {
        spy.mockRestore();
      }
      expect(() => ws.version(old, "0.1.0")).toThrow("interrupted package creation");
      new VnextWorkspace(old).version("0.1.0");
      expect(() => ws.create("lib", "packages/new-lib")).toThrow("duplicate workspace package");
      expect(existsSync(join(root, ".wpm-pending-package.json"))).toBe(true);
    }));
  it("never writes a test report under a foreign package reservation", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      declarations(app, { dependencies: {} });
      ws.lock(app);
      writeFileSync(join(app, ".wpm-mutation.lock"), "foreign");
      expect(() => ws.test(app)).toThrow("reservation");
      expect(existsSync(join(app, "test-results/vnext-latest.json"))).toBe(false);
    }));

  it("recovers owned package creation and serializes workspace version decisions", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const original: unknown = Reflect.get(VnextWorkspace.prototype, "writeForGraph");
      if (typeof original !== "function") throw new Error("missing write adapter");
      const spy = vi.spyOn(VnextWorkspace.prototype, "writeForGraph").mockImplementation(function (
        this: VnextWorkspace,
        path,
        text,
        expected,
      ) {
        if (path === "workspace.yml") throw new Error("injected catalog failure");
        Reflect.apply(original, this, [path, text, expected]);
      });
      try {
        expect(() => ws.create("lib")).toThrow("injected catalog");
      } finally {
        spy.mockRestore();
      }
      expect(existsSync(join(root, ".wpm-pending-package.json"))).toBe(true);
      for (const name of ["unexpected.txt", "__proto__"]) {
        const path = join(root, "packages/lib", name);
        writeFileSync(path, "unexpected source");
        expect(() => ws.create("lib")).toThrow("inventory changed");
        rmSync(path);
      }
      ws.create("lib");
      expect(existsSync(join(root, ".wpm-pending-package.json"))).toBe(false);
      const first = join(root, "packages/lib");
      ws.version(first, "1.0.0");
      const second = make(ws, "lib", "3.0.0", "packages/lib-three");
      const version: unknown = Reflect.get(VnextWorkspace.prototype, "version");
      if (typeof version !== "function") throw new Error("missing version adapter");
      let once = true;
      const versionSpy = vi.spyOn(VnextWorkspace.prototype, "version").mockImplementation(function (
        this: VnextWorkspace,
        value,
        preid,
        dryRun,
      ) {
        if (this.root === first && once) {
          once = false;
          expect(() => ws.version(second, "2.0.0")).toThrow("reservation");
        }
        const result: unknown = Reflect.apply(version, this, [value, preid, dryRun]);
        return result;
      });
      try {
        ws.version(first, "2.0.0");
      } finally {
        versionSpy.mockRestore();
      }
      expect(
        ws
          .list()
          .map((p) => p.version)
          .sort(),
      ).toEqual(["2.0.0", "3.0.0"]);
    }));

  it("rejects omitted required edges and invalid archived work or private files", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      mkdirSync(join(root, "archives"));
      const contract = {
        schemaVersion: 1,
        name: "lib",
        version: "1.0.0",
        operations: [],
        groups: {},
        workerSetup: { default: null, names: [] },
      };
      const files = [
        { path: "contract.json", bytes: Buffer.from(JSON.stringify(contract)) },
        { path: "AGENTS.md", bytes: Buffer.from("Read contract") },
        { path: "CLAUDE.md", bytes: Buffer.from("@AGENTS.md") },
      ];
      const secret = [...files, { path: "payload/.env", bytes: Buffer.from("synthetic example") }];
      const operations = [
        { id: "a", prerequisites: ["b"], setup: null },
        { id: "b", prerequisites: ["a"], setup: null },
      ];
      const cyclic = files
        .map((f) =>
          f.path === "contract.json"
            ? { ...f, bytes: Buffer.from(JSON.stringify({ ...contract, operations })) }
            : f,
        )
        .concat(
          operations.map((op) => ({ path: `operations/${op.id}.md`, bytes: Buffer.from("Work") })),
        );
      for (const input of [secret, cyclic]) {
        writeFileSync(join(root, "archives/lib.tgz"), createDeterministicTarball(input));
        expect(() =>
          ws.editDependency(
            app,
            "lib",
            { source: "file:../../archives/lib.tgz", range: "*" },
            "optionalDependencies",
          ),
        ).toThrow();
      }
      const id = "a".repeat(64);
      const record = {
        id,
        name: "lib",
        version: "1.0.0",
        digest: "b".repeat(64),
        locator: "lib",
        dependencies: { missing: dep() },
      };
      expect(() =>
        parseGraph({ schemaVersion: 2, root: id, nodes: { [id]: { record, edges: [] } } }),
      ).toThrow("missing declared");
    }));
  it("rejects pending transitive edits and selected metadata drift before changing lock", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      const lib = make(ws, "lib");
      ws.editDependency(app, "lib", dep("^1"), "dependencies");
      const lock = readFileSync(join(app, "wpm.dependencies.lock.json"));
      writeFileSync(join(lib, ".wpm-pending-dependencies.json"), "{}");
      expect(() => ws.build(app)).toThrow("interrupted dependency");
      rmSync(join(lib, ".wpm-pending-dependencies.json"));
      const original = ws.list.bind(ws);
      let once = true;
      const spy = vi.spyOn(ws, "list").mockImplementation(() => {
        const result = original();
        if (once) {
          once = false;
          new VnextWorkspace(lib).version("2.0.0");
        }
        return result;
      });
      try {
        expect(() => ws.lock(app)).toThrow("metadata changed");
      } finally {
        spy.mockRestore();
      }
      expect(readFileSync(join(app, "wpm.dependencies.lock.json"))).toEqual(lock);
    }));

  it("selects versions, builds a cyclic multi-version diamond deterministically and excludes dev", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      const left = make(ws, "left");
      const right = make(ws, "right");
      const one = make(ws, "shared", "1.0.0", "packages/shared-one");
      const two = make(ws, "shared", "2.0.0", "packages/shared-two");
      const tool = make(ws, "tool");
      for (const directory of [app, left, right, one, two, tool]) {
        const author = new VnextWorkspace(directory);
        author.addOperation("same", "Produce a result", {
          prerequisites: [],
          acceptanceCriteria: ["A result exists"],
          dryRun: false,
        });
        author.setGroup("all", ["same"], []);
      }
      declarations(app, {
        dependencies: { left: dep(), right: dep() },
        devDependencies: { tool: dep() },
      });
      declarations(left, { dependencies: { shared: dep("^1") } });
      declarations(right, { dependencies: { shared: dep("^2"), left: dep() } });
      declarations(one, { dependencies: { app: dep() } });
      expect(() => ws.select(root)).toThrow("unambiguous");
      expect(() => ws.select(root, "shared")).toThrow("unambiguous");
      expect(ws.select(root, "shared", "2.0.0")).toBe(two);
      expect(() => ws.version(two, "1.0.0")).toThrow("duplicate");
      ws.lock(app);
      expect(ws.lock(app, true).checked).toBe(true);
      const first = ws.build(app) as { archive: string; instances: number };
      expect(first.instances).toBe(5);
      const bytes = readFileSync(join(app, first.archive));
      expect(ws.build(app)).toMatchObject(first);
      expect(readFileSync(join(app, first.archive))).toEqual(bytes);
      const files = readPackageArchive(bytes);
      const contract = JSON.parse(
        present(files.find((f) => f.path === "contract.json")).bytes.toString(),
      ) as { graph: { nodes: Record<string, { record: { name: string; version: string } }> } };
      expect(
        Object.values(contract.graph.nodes)
          .filter((n) => n.record.name === "shared")
          .map((n) => n.record.version)
          .sort(),
      ).toEqual(["1.0.0", "2.0.0"]);
      expect(files.filter((f) => f.path.endsWith("/operations/same.md"))).toHaveLength(5);
      expect(files.some((f) => f.path.includes("backlog"))).toBe(false);
      expect(Object.values(contract.graph.nodes).some((n) => n.record.name === "tool")).toBe(false);
      ws.version(one, "1.1.0");
      expect(() => ws.build(app)).toThrow("stale");
    }));
  it("keeps optional omissions until upgrade and performs effect-free dependency dry runs", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      const path = join(app, "package.yml");
      const before = readFileSync(path);
      ws.editDependency(app, "extra", dep(), "optionalDependencies", false, true);
      expect(readFileSync(path)).toEqual(before);
      expect(existsSync(join(app, ".wpm-mutation.lock"))).toBe(false);
      expect(existsSync(join(app, "wpm.dependencies.lock.json"))).toBe(false);
      ws.editDependency(app, "extra", dep(), "optionalDependencies");
      const initial = present(ws.readLock(app));
      expect(initial.nodes[initial.root]?.edges[0]?.omitted).toContain("missing");
      make(ws, "extra");
      expect(ws.lock(app, true).graph).toEqual(initial);
      expect(Object.keys(ws.lock(app, false, true).graph.nodes)).toHaveLength(2);
      expect(() => ws.editDependency(app, "missing", dep(), "dependencies")).toThrow("missing");
      expect(existsSync(join(app, ".wpm-pending-dependencies.json"))).toBe(false);
    }));
  it("imports frozen archives and detects changes to their actual bytes", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const lib = make(ws, "lib");
      const common = make(ws, "common");
      const app = make(ws, "app");
      ws.editDependency(lib, "common", dep(), "dependencies");
      const built = ws.build(lib) as { archive: string };
      mkdirSync(join(root, "archives"));
      const archive = join(root, "archives/lib.tgz");
      writeFileSync(archive, readFileSync(join(lib, built.archive)));
      ws.editDependency(
        app,
        "lib",
        { source: "file:../../archives/lib.tgz", range: "^1" },
        "dependencies",
      );
      expect((ws.build(app) as { instances: number }).instances).toBe(3);

      writeFileSync(join(root, "archives/copy.tgz"), readFileSync(archive));
      const wrapper = make(ws, "wrapper");
      ws.editDependency(
        wrapper,
        "lib",
        { source: "file:../../archives/copy.tgz", range: "*" },
        "dependencies",
      );
      ws.editDependency(app, "wrapper", dep(), "dependencies");
      expect((ws.build(app) as { instances: number }).instances).toBe(6);
      ws.version(common, "2.0.0");
      expect(() => ws.lock(app, true)).not.toThrow();
      const files = readPackageArchive(readFileSync(archive));
      const agent = present(files.find((f) => f.path === "AGENTS.md"));
      agent.bytes = Buffer.from("Changed entry point\n");
      writeFileSync(archive, createDeterministicTarball(files));
      expect(() => ws.build(app)).toThrow("stale");
    }));
  it("preserves evidence and resumes interrupted dependency edits", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      make(ws, "lib");
      const original: unknown = Reflect.get(VnextWorkspace.prototype, "writeForGraph");
      if (typeof original !== "function") throw new Error("missing write adapter");
      const spy = vi.spyOn(VnextWorkspace.prototype, "writeForGraph").mockImplementation(function (
        this: VnextWorkspace,
        path,
        text,
        expected,
      ) {
        if (path === "wpm.dependencies.lock.json") throw new Error("injected write failure");
        Reflect.apply(original, this, [path, text, expected]);
      });
      try {
        expect(() => ws.editDependency(app, "lib", dep(), "dependencies")).toThrow("injected");
      } finally {
        spy.mockRestore();
      }
      expect(existsSync(join(app, ".wpm-pending-dependencies.json"))).toBe(true);
      const pendingPath = join(app, ".wpm-pending-dependencies.json");
      const originalPending = readFileSync(pendingPath, "utf8");
      const forged = JSON.parse(originalPending) as { after: string };
      forged.after = stringify({
        ...(parse(forged.after) as Record<string, unknown>),
        version: "9.9.9",
      });
      writeFileSync(pendingPath, JSON.stringify(forged));
      expect(() => ws.editDependency(app, "lib", dep(), "dependencies")).toThrow(
        "source transition differ",
      );
      writeFileSync(pendingPath, originalPending);

      expect(() => new VnextWorkspace(app).version("patch")).toThrow("interrupted dependency");
      expect(() => new VnextWorkspace(app).build()).toThrow("interrupted dependency");
      expect(() => ws.editDependency(app, "other", dep(), "dependencies")).toThrow("identical");
      ws.editDependency(app, "lib", dep(), "dependencies");
      expect(existsSync(join(app, ".wpm-pending-dependencies.json"))).toBe(false);
      expect(() => ws.lock(app, true)).not.toThrow();
    }));
  it("rejects invalid archives and unsafe registrations before effects", async () =>
    withTempDir((root) => {
      const ws = setup(root);
      const app = make(ws, "app");
      const before = readFileSync(join(app, "package.yml"));
      expect(() => ws.add("../outside")).toThrow();
      mkdirSync(join(root, "archives"));
      writeFileSync(join(root, "archives/bad.tgz"), "invalid");
      expect(() =>
        ws.editDependency(
          app,
          "bad",
          { source: "file:../../archives/bad.tgz", range: "*" },
          "optionalDependencies",
        ),
      ).toThrow();
      expect(readFileSync(join(app, "package.yml"))).toEqual(before);
      expect(() =>
        readPackageArchive(
          createDeterministicTarball([
            { path: "payload/a", bytes: Buffer.from("a") },
            { path: "payload/a", bytes: Buffer.from("b") },
          ]),
        ),
      ).toThrow();
    }));
});
