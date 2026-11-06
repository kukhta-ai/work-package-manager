import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import type { CreateTaskInput } from "../../src/core/ports/backlog.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { stableJson } from "../../src/vnext/core/model.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

const op = { prerequisites: [], acceptanceCriteria: ["A readable brief exists"], dryRun: false };

describe("vNext workspace effects", () => {
  it("reserves native mutations across workspace instances before creating any duplicate task", async () => {
    await withTempDir((root) => {
      class ConcurrentBacklog extends FakeBacklog {
        override createTask(authoring: string, input: CreateTaskInput) {
          expect(() => new VnextWorkspace(root, this).addOperation("brief", "Brief", op)).toThrow(
            "reservation unavailable",
          );
          return super.createTask(authoring, input);
        }
      }
      const backlog = new ConcurrentBacklog();
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("concurrent");
      workspace.addOperation("brief", "Brief", op);
      expect(backlog.listTasks(join(root, ".wpm-source"))).toHaveLength(1);
      expect(existsSync(join(root, ".wpm-mutation.lock"))).toBe(false);
      writeFileSync(join(root, ".wpm-mutation.lock"), "foreign stale reservation");
      expect(() => workspace.createSetup()).toThrow("reservation unavailable");
      expect(readFileSync(join(root, ".wpm-mutation.lock"), "utf8")).toBe(
        "foreign stale reservation",
      );
    });
  });
  it("blocks cycles and unregistered native prerequisite tasks before building", async () => {
    await withTempDir((root) => {
      class DependencyBacklog extends FakeBacklog {
        injected: string[] | null = null;
        override readTask(authoring: string, id: string) {
          const task = super.readTask(authoring, id);
          return id === "operation-1" && this.injected
            ? { ...task, dependencies: this.injected }
            : task;
        }
      }
      const backlog = new DependencyBacklog();
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("dependencies");
      workspace.addOperation("brief", "Brief", op);
      workspace.addOperation("review", "Review", { ...op, prerequisites: ["brief"] });
      backlog.injected = ["operation-2"];
      expect(() => workspace.build()).toThrow("cyclic operation prerequisite");
      backlog.injected = ["operation-999"];
      expect(() => workspace.build()).toThrow("unregistered operation prerequisite");
      expect(existsSync(join(root, "builds"))).toBe(false);
    });
  });

  it("recovers native task association after concurrent source edits without duplicate tasks", async () => {
    await withTempDir((root) => {
      class InterruptedBacklog extends FakeBacklog {
        interfere = true;
        override createTask(authoring: string, input: CreateTaskInput) {
          const task = super.createTask(authoring, input);
          if (this.interfere) {
            this.interfere = false;
            const path = join(root, "package.yml");
            writeFileSync(path, `${readFileSync(path, "utf8")}\n# Concurrent authored comment\n`);
          }
          return task;
        }
      }
      const backlog = new InterruptedBacklog();
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("recover");
      expect(() => workspace.addOperation("brief", "Brief", op)).toThrow("preimage changed");
      expect(backlog.listTasks(join(root, ".wpm-source"))).toHaveLength(1);
      expect(workspace.view().work).toEqual([]);
      workspace.addOperation("brief", "Brief", op);
      expect(backlog.listTasks(join(root, ".wpm-source"))).toHaveLength(1);
      expect(workspace.view().work).toEqual([{ operation: "brief", task: "operation-1" }]);
      expect(readFileSync(join(root, "package.yml"), "utf8")).toContain(
        "Concurrent authored comment",
      );
    });
  });
  it("recovers its own interrupted setup without adopting a pre-existing authored source", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("recover-setup");
      const original = NodeFileSystem.prototype.writeConfined.bind(new NodeFileSystem());
      let interfere = true;
      const spy = vi.spyOn(NodeFileSystem.prototype, "writeConfined").mockImplementation(function (
        this: NodeFileSystem,
        confinement,
        path,
        content,
        expected,
        quarantine,
      ) {
        if (interfere && path === join(root, "package.yml")) {
          interfere = false;
          writeFileSync(path, `${readFileSync(path, "utf8")}\n# Concurrent setup comment\n`);
        }
        return original(confinement, path, content, expected, quarantine);
      });
      try {
        expect(() => workspace.createSetup()).toThrow("preimage changed");
      } finally {
        spy.mockRestore();
      }
      expect(existsSync(join(root, ".wpm-pending-setup.json"))).toBe(true);
      workspace.createSetup();
      expect(workspace.view().workerSetup.default).toBe("default");
      expect(existsSync(join(root, ".wpm-pending-setup.json"))).toBe(false);
      expect(readFileSync(join(root, "package.yml"), "utf8")).toContain("Concurrent setup comment");
      expect(() => workspace.createSetup()).toThrow("already exists");
    });
  });
  it("resumes a native init that completed before its caller observed failure", async () => {
    await withTempDir((root) => {
      class InterruptedInit extends FakeBacklog {
        interfere = true;
        override init(authoring: string, options: Parameters<FakeBacklog["init"]>[1]) {
          super.init(authoring, options);
          if (this.interfere) {
            this.interfere = false;
            throw new Error("interrupted after native init");
          }
        }
      }
      const workspace = new VnextWorkspace(root, new InterruptedInit());
      expect(() => workspace.init("recover-init")).toThrow("interrupted after native init");
      expect(existsSync(join(root, ".wpm-pending-init.json"))).toBe(true);
      expect(workspace.init("recover-init")).toMatchObject({ name: "recover-init" });
      expect(existsSync(join(root, ".wpm-pending-init.json"))).toBe(false);
    });
  });

  it("authors native operations, keeps groups separate, locks and builds reproducible recipient content", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("brief");
      workspace.createSetup();
      workspace.addOperation("brief", "Produce the brief", op);
      workspace.addOperation("review", "Review the brief", {
        ...op,
        prerequisites: ["brief"],
        setup: null,
      });
      workspace.setGroup("review-only", ["review"], []);
      expect(workspace.view().groups["review-only"]?.operations).toEqual(["review"]);
      expect(workspace.check()).toMatchObject({ valid: true, operations: 2 });
      workspace.lock();
      const first = workspace.build();
      const firstBytes = readFileSync(join(root, "builds/brief-0.1.0.tgz"));
      expect(workspace.build()).toEqual(first);
      expect(readFileSync(join(root, "builds/brief-0.1.0.tgz")).equals(firstBytes)).toBe(true);
      expect(firstBytes[9]).toBe(255);
      const listing = execFileSync("tar", ["-tzf", join(root, "builds/brief-0.1.0.tgz")], {
        encoding: "utf8",
      });
      expect(listing).toContain("operations/brief.md");
      expect(listing).not.toMatch(/backlog|\.wpm-source|\.agents|wpm-repo/);
      const contract = JSON.parse(
        execFileSync("tar", ["-xOzf", join(root, "builds/brief-0.1.0.tgz"), "contract.json"], {
          encoding: "utf8",
        }),
      ) as { operations: { id: string; prerequisites: string[]; setup: string | null }[] };
      expect(contract.operations).toEqual([
        { id: "brief", prerequisites: [], setup: "default" },
        { id: "review", prerequisites: ["brief"], setup: null },
      ]);
      expect(workspace.test()).toMatchObject({ passed: true, agentExecution: false });
      expect(
        JSON.parse(readFileSync(join(root, "test-results/vnext-latest.json"), "utf8")) as unknown,
      ).toMatchObject({ passed: true });
      writeFileSync(join(root, "worker-setup/default/WORKER.md"), "changed");
      expect(() => workspace.build()).toThrow("lock is stale");
    });
  });
  it("dry runs have no task, file, archive or report effects", async () => {
    await withTempDir((root) => {
      const backlog = new FakeBacklog();
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("dry", true);
      expect(existsSync(join(root, "package.yml"))).toBe(false);
      workspace.init("dry");
      const before = readFileSync(join(root, "package.yml"), "utf8");
      workspace.createSetup(undefined, true);
      workspace.addOperation("draft", "Draft", { ...op, dryRun: true });
      workspace.lock(true);
      workspace.build(true);
      workspace.test(true);
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(before);
      expect(backlog.listTasks(join(root, ".wpm-source"))).toEqual([]);
      for (const relative of ["worker-setup", "wpm.lock.json", "builds", "test-results"])
        expect(existsSync(join(root, relative))).toBe(false);
    });
  });
  it("blocks a complete removal batch before mutation and preserves source after unused removal", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("removal");
      workspace.createSetup();
      workspace.createSetup("spare");
      workspace.addOperation("brief", "Brief", op);
      const before = readFileSync(join(root, "package.yml"), "utf8");
      expect(() => workspace.removeSetups(["spare", "default"])).toThrow("referenced");
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(before);
      workspace.removeSetups(["spare"]);
      expect(workspace.view().workerSetup.setups.spare).toBeUndefined();
      expect(existsSync(join(root, "worker-setup/spare/WORKER.md"))).toBe(true);
      expect(() => workspace.createSetup("spare")).toThrow("source already exists");
    });
  });
  it("does not choose lone named definitions as default and never guesses remote sources", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("named");
      expect(workspace.viewSetup()).toMatchObject({ setup: null });
      workspace.createSetup("research");
      expect(() => workspace.viewSetup()).toThrow("select a name");
      expect(() => workspace.addSetup("https://example.com/context", "remote", "plain")).toThrow(
        "unsafe",
      );
      expect(workspace.addSetup("worker-setup/research", "research", "plain")).toMatchObject({
        unchanged: true,
      });
    });
  });
  it("rejects symbolic payload sources and unqualified APM builds without changing output", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("confined");
      mkdirSync(join(root, "payload"));
      writeFileSync(join(root, "secret.txt"), "private");
      symlinkSync(join(root, "secret.txt"), join(root, "payload/alias.txt"));
      const source = workspace.view();
      source.files = ["payload/alias.txt"];
      writeFileSync(join(root, "package.yml"), stableJson(source));
      expect(() => workspace.build()).toThrow("symbolic source");
      expect(existsSync(join(root, "builds"))).toBe(false);
      source.files = [];
      writeFileSync(join(root, "package.yml"), stableJson(source));
      mkdirSync(join(root, "shared"));
      writeFileSync(join(root, "shared/apm.yml"), "name: optional\n");
      workspace.addSetup("shared", "optional", "apm");
      expect(() => workspace.build()).toThrow("needs explicit pinned");
      expect(existsSync(join(root, "builds"))).toBe(false);
      mkdirSync(join(root, "unknown"));
      expect(() => workspace.addSetup("unknown", "unknown", undefined)).toThrow(
        "unresolved setup source format",
      );
      expect(workspace.addSetup("./shared", "detected", undefined)).toMatchObject({
        backend: "apm",
        source: "shared",
      });
    });
  });
  it("records failed static rehearsals and never treats them as executed agent behavior", async () => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("failure");
      const source = workspace.view();
      source.files = ["payload/missing.txt"];
      writeFileSync(join(root, "package.yml"), stableJson(source));
      expect(() => workspace.test()).toThrow("missing file");
      expect(
        JSON.parse(readFileSync(join(root, "test-results/vnext-latest.json"), "utf8")) as unknown,
      ).toMatchObject({ passed: false, agentExecution: false });
    });
  });
});
