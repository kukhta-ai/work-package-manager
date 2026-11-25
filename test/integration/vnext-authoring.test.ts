import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { BacklogCli } from "../../src/adapters/backlog-cli.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { withTempDir } from "../helpers/tmpdir.js";

const native = resolve("node_modules/backlog.md/cli.js");
const edit = (root: string, id: string, ...args: string[]) =>
  execaSync(process.execPath, [native, "task", "edit", id, ...args], {
    cwd: join(root, ".wpm-source"),
  });
const add = { prerequisites: [], acceptanceCriteria: ["Result exists"], dryRun: false };
describe("native single-package authoring", () => {
  it("authors an editable draft, finalizes without completing work, and invalidates readiness after native edits", async () =>
    withTempDir((root) => {
      const workspace = new VnextWorkspace(root);
      workspace.init("drafts");
      workspace.addOperation("brief", "Brief", { ...add, acceptanceCriteria: [], draft: true });
      expect(workspace.viewOperation("brief")).toMatchObject({
        source: "draft",
        readiness: "blocked",
      });
      expect(workspace.check()).toMatchObject({ valid: true, releaseReady: false });
      expect(() => workspace.finalizeOperation("brief")).toThrow("missing instructions");
      expect(() => workspace.build()).toThrow("draft");
      edit(
        root,
        "operation-1",
        "--description",
        "Produce a readable brief",
        "--ac",
        "Brief is readable",
      );
      expect(workspace.viewOperation("brief")).toMatchObject({
        source: "draft",
        readiness: "draft",
        problems: [],
      });
      workspace.finalizeOperation("brief", true);
      expect(workspace.viewOperation("brief").source).toBe("draft");
      workspace.finalizeOperation("brief");
      expect(workspace.finalizeOperation("brief")).toMatchObject({
        changed: false,
        recipientWorkCompleted: false,
      });
      expect(workspace.viewOperation("brief")).toMatchObject({
        readiness: "ready",
        task: { status: "To Do", acceptanceCriteria: [{ checked: false }] },
      });
      workspace.build();
      edit(root, "operation-1", "--description", "");
      expect(workspace.viewOperation("brief").readiness).toBe("blocked");
      expect(() => workspace.build()).toThrow("requires instructions");
    }));
  it("maintains groups, setup inheritance and version with no hidden work", async () =>
    withTempDir((root) => {
      const w = new VnextWorkspace(root);
      w.init("groups");
      w.createSetup();
      w.createSetup("review");
      w.addOperation("brief", "Brief", add);
      w.addOperation("review", "Review", { ...add, prerequisites: ["brief"] });
      w.setGroup("review", ["review"], [], false);
      w.setGroup("all", [], [], false);
      expect(w.viewGroup("review")).toMatchObject({
        selection: ["review"],
        externalPrerequisites: ["brief"],
      });
      w.changeGroupMembers("all", [], ["review"], "add");
      expect(() => w.deleteGroups(["review"])).toThrow("references");
      expect(() => w.deleteOperations(["brief", "review"])).toThrow("references");
      expect(w.view().work).toHaveLength(2);
      w.changeGroupMembers("all", [], ["review"], "remove");
      w.deleteGroups(["all", "review"]);
      expect(() => w.deleteOperations(["brief"])).toThrow("native task");
      w.setOperationSetup("review", null);
      expect(w.viewOperation("review").setup).toBeNull();
      w.setOperationSetup("review", "review");
      expect(w.viewOperation("review").setup).toBe("review");
      w.setOperationSetup("review", undefined);
      expect(w.viewOperation("review").setup).toBe("default");
      expect(() => w.setOperationSetup("review", "absent")).toThrow();
      w.lock();
      const before = readFileSync(join(root, "package.yml"), "utf8");
      w.version("minor", undefined, true);
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(before);
      expect(w.version("minor")).toMatchObject({ version: "0.2.0" });
      expect(() => w.build()).toThrow("stale");
      w.version("prerelease", "beta");
      expect(w.version()).toMatchObject({ version: "0.2.1-beta.0" });
      expect(() => w.version(undefined, "beta")).toThrow();
    }));
  it("resumes interrupted native archival, preserves text and refuses competing mutations", async () =>
    withTempDir((root) => {
      class Interrupted extends BacklogCli {
        stopped = false;
        override archiveTask(authoring: string, id: string) {
          super.archiveTask(authoring, id);
          if (!this.stopped) {
            this.stopped = true;
            throw new Error("interrupted after archive");
          }
        }
      }
      const backlog = new Interrupted();
      const w = new VnextWorkspace(root, backlog);
      w.init("retire");
      w.addOperation("brief", "Brief", add);
      w.addOperation("review", "Review", { ...add, prerequisites: ["brief"] });
      edit(root, "operation-1", "--description", "Preserve this authored text");
      writeFileSync(
        join(root, "package.yml"),
        readFileSync(join(root, "package.yml"), "utf8").replaceAll(
          "task: operation-",
          "task: OPERATION-",
        ),
      );
      expect(() => w.deleteOperations(["brief", "review"])).toThrow("interrupted after archive");
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(true);
      expect(() => w.createSetup()).toThrow("interrupted retirement");
      expect(() => w.build()).toThrow("interrupted retirement");
      expect(() => w.deleteOperations(["review"])).toThrow("another interrupted");
      w.deleteOperations(["review", "brief"]);
      expect(w.view().work).toEqual([]);
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(false);
      const inventory = backlog.inspectTaskInventory(join(root, ".wpm-source"));
      expect(inventory.inactiveEntries).toEqual(["operation-1", "operation-2"]);
      expect(
        readFileSync(
          join(root, ".wpm-source/backlog/archive/tasks/operation-1 - Brief.md"),
          "utf8",
        ),
      ).toContain("Preserve this authored text");
    }));
  it("preserves external source edits after interrupted archival", async () =>
    withTempDir((root) => {
      class Interrupted extends BacklogCli {
        override archiveTask(authoring: string, id: string) {
          super.archiveTask(authoring, id);
          throw new Error("interrupted");
        }
      }
      const w = new VnextWorkspace(root, new Interrupted());
      w.init("conflict");
      w.addOperation("brief", "Brief", add);
      expect(() => w.deleteOperations(["brief"])).toThrow("interrupted");
      writeFileSync(
        join(root, "package.yml"),
        `${readFileSync(join(root, "package.yml"), "utf8")}# external edit\n`,
      );
      expect(() => w.deleteOperations(["brief"])).toThrow("conflicts with authored source");
    }));
  it.each([
    "duplicate",
    "missing",
    "null",
    "extra",
  ])("rejects %s records in an interrupted retirement journal", async (scenario) =>
    withTempDir((root) => {
      class Interrupted extends BacklogCli {
        override archiveTask() {
          throw new Error("interrupted");
        }
      }
      const b = new Interrupted();
      const w = new VnextWorkspace(root, b);
      w.init("journal");
      w.addOperation("brief", "Brief", add);
      w.addOperation("review", "Review", add);
      expect(() => w.deleteOperations(["brief", "review"])).toThrow("interrupted");
      const path = join(root, ".wpm-pending-retirement.json");
      const pending: { tasks: unknown[] } = JSON.parse(readFileSync(path, "utf8")) as {
        tasks: unknown[];
      };
      if (scenario === "duplicate") pending.tasks[1] = pending.tasks[0];
      if (scenario === "missing") pending.tasks.pop();
      if (scenario === "null") pending.tasks[0] = null;
      if (scenario === "extra") pending.tasks.push(pending.tasks[0]);
      writeFileSync(path, JSON.stringify(pending));
      const source = readFileSync(join(root, "package.yml"), "utf8");
      expect(() => w.deleteOperations(["brief", "review"])).toThrow(
        "invalid retirement task inventory",
      );
      expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(source);
      expect(b.listTasks(join(root, ".wpm-source"))).toHaveLength(2);
    }));
  it("rechecks new external native prerequisites before resuming retirement", async () =>
    withTempDir((root) => {
      class Interrupted extends BacklogCli {
        override archiveTask() {
          throw new Error("interrupted");
        }
      }
      const w = new VnextWorkspace(root, new Interrupted());
      w.init("new-dependency");
      w.addOperation("brief", "Brief", add);
      w.addOperation("review", "Review", add);
      expect(() => w.deleteOperations(["brief"])).toThrow("interrupted");
      edit(root, "operation-2", "--dep", "operation-1");
      expect(() => w.deleteOperations(["brief"])).toThrow("references selected operation");
      expect(w.view().work).toHaveLength(2);
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(true);
    }));
  it("rejects competing historical source before overwriting an archive", async () =>
    withTempDir((root) => {
      const w = new VnextWorkspace(root);
      w.init("archive-collision");
      w.addOperation("brief", "Brief", add);
      copyFileSync(
        join(root, ".wpm-source/backlog/tasks/operation-1 - Brief.md"),
        join(root, ".wpm-source/backlog/archive/tasks/operation-1 - Brief.md"),
      );
      expect(() => w.deleteOperations(["brief"])).toThrow("ambiguous");
      expect(w.view().work).toHaveLength(1);
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(false);
    }));
  it("preserves true native drafts by blocking retirement until reconciled", async () =>
    withTempDir((root) => {
      const w = new VnextWorkspace(root);
      w.init("native-draft");
      w.addOperation("brief", "Brief", add);
      execaSync(
        process.execPath,
        [native, "task", "create", "--draft", "--dep", "operation-1", "--", "Later"],
        { cwd: join(root, ".wpm-source") },
      );
      expect(() => w.deleteOperations(["brief"])).toThrow(
        "native drafts require explicit reconciliation",
      );
      expect(w.view().work).toHaveLength(1);
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(false);
    }));
  it("keeps surviving operation comments through real retirement and refuses dangling source aliases before effects", async () =>
    withTempDir((root) => {
      const b = new BacklogCli();
      const w = new VnextWorkspace(root, b);
      w.init("comments");
      w.addOperation("first", "First", add);
      w.addOperation("second", "Second", add);
      const manifest = join(root, "package.yml");
      writeFileSync(
        manifest,
        stringify(w.view())
          .replace("operation: first", "operation: first # FIRST")
          .replace("operation: second", "operation: second # SECOND"),
      );
      w.deleteOperations(["first"]);
      expect(readFileSync(manifest, "utf8")).toContain("operation: second # SECOND");
      expect(readFileSync(manifest, "utf8")).not.toContain("FIRST");
      w.addOperation("third", "Third", add);
      w.createSetup("second");
      writeFileSync(
        manifest,
        readFileSync(manifest, "utf8")
          .replace("operation: second", "operation: &setup second")
          .replace("workerSetup:", "workerSetup:\n  default: *setup"),
      );
      const before = readFileSync(manifest, "utf8");
      expect(() => w.deleteOperations(["second"])).toThrow("alias");
      expect(readFileSync(manifest, "utf8")).toBe(before);
      expect(b.inspectTaskInventory(join(root, ".wpm-source")).activeEntries).toEqual([
        "operation-2",
        "operation-3",
      ]);
      expect(existsSync(join(root, ".wpm-pending-retirement.json"))).toBe(false);
    }));
  it("preflights coupled setup aliases before materializing owned source", async () =>
    withTempDir((root) => {
      const w = new VnextWorkspace(root);
      w.init("setup-alias");
      w.createSetup("first");
      w.addOperation("brief", "Brief", { ...add, setup: "first" });
      const source = w.view();
      const { work, ...rest } = source;
      const text = stringify({
        ...rest,
        workerSetup: { ...source.workerSetup, default: "first" },
        work,
      })
        .replace("default: first", "default: &profile first")
        .replace("setup: first", "setup: *profile");
      const manifest = join(root, "package.yml");
      writeFileSync(manifest, text);
      expect(() => w.createSetup()).toThrow("authored YAML aliases conflict");
      expect(readFileSync(manifest, "utf8")).toBe(text);
      expect(existsSync(join(root, "worker-setup/default"))).toBe(false);
      expect(existsSync(join(root, ".wpm-pending-setup.json"))).toBe(false);
    }));
});
