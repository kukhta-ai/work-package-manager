import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BacklogCli } from "../../src/adapters/backlog-cli.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

const operation = {
  prerequisites: [],
  acceptanceCriteria: ["The brief states the selected problem"],
  dryRun: false,
};

describe("native authoring source confinement", () => {
  it("rejects an external task symlink before native reads or writes and preserves its bytes", async () => {
    await withTempDir((scratch) => {
      const root = join(scratch, "workspace");
      const isolatedHome = join(scratch, "home");
      mkdirSync(isolatedHome);
      const backlog = new BacklogCli(resolve("node_modules/.bin/backlog"), {
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
        XDG_CONFIG_HOME: join(isolatedHome, "config"),
        XDG_CACHE_HOME: join(isolatedHome, "cache"),
      });
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("confined");
      workspace.addOperation("brief", "Write a brief", operation);
      // Ordinary native notes remain valid authored material; this is not a fresh-empty-root check.
      writeFileSync(join(root, ".wpm-source/backlog/docs/notes.md"), "Authored task context\n");
      expect(workspace.check()).toMatchObject({ valid: true, operations: 1 });
      const manifest = readFileSync(join(root, "package.yml"), "utf8");
      const tasks = join(root, ".wpm-source/backlog/tasks");
      const taskName = readdirSync(tasks)[0];
      if (!taskName) throw new Error("native fixture did not create a task");
      const taskPath = join(tasks, taskName);
      const outside = join(scratch, "outside-task.md");
      renameSync(taskPath, outside);
      const original = readFileSync(outside);
      symlinkSync(outside, taskPath);
      const inspections = vi.spyOn(backlog, "inspectRoot");
      const reads = vi.spyOn(backlog, "readTask");
      const lists = vi.spyOn(backlog, "listTasks");
      const creates = vi.spyOn(backlog, "createTask");
      try {
        expect(() => workspace.check()).toThrow("native authoring source");
        expect(() => workspace.build()).toThrow("native authoring source");
        expect(() => workspace.addOperation("review", "Review the brief", operation)).toThrow(
          "native authoring source",
        );
        for (const invocation of [inspections, reads, lists, creates])
          expect(invocation).not.toHaveBeenCalled();
        expect(readFileSync(outside)).toEqual(original);
        expect(readFileSync(join(root, "package.yml"), "utf8")).toBe(manifest);
        expect(lstatSync(taskPath).isSymbolicLink()).toBe(true);
        expect(existsSync(join(root, "builds"))).toBe(false);
        expect(existsSync(join(root, ".wpm-mutation.lock"))).toBe(false);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  it("rejects a native source alias introduced during a task read before emitting an artifact", async () => {
    await withTempDir((scratch) => {
      const root = join(scratch, "workspace");
      const outside = join(scratch, "outside.md");
      writeFileSync(outside, "Outside context must remain untouched\n");
      class ChangingBacklog extends FakeBacklog {
        changeOnRead = false;
        override readTask(authoring: string, id: string) {
          const task = super.readTask(authoring, id);
          if (this.changeOnRead) {
            this.changeOnRead = false;
            symlinkSync(outside, join(authoring, "introduced.md"));
          }
          return task;
        }
      }
      const backlog = new ChangingBacklog();
      const workspace = new VnextWorkspace(root, backlog);
      workspace.init("changing");
      workspace.addOperation("brief", "Write a brief", operation);
      backlog.changeOnRead = true;
      expect(() => workspace.build()).toThrow("native authoring source");
      expect(readFileSync(outside, "utf8")).toBe("Outside context must remain untouched\n");
      expect(existsSync(join(root, "builds"))).toBe(false);
      expect(existsSync(join(root, ".wpm-mutation.lock"))).toBe(false);
    });
  });
});
