import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { BacklogCli } from "../../../src/adapters/backlog-cli.js";
import { withTempDir } from "../../helpers/tmpdir.js";

/** Whether the real `backlog` CLI is available; the integration suite skips (not fails) if it is not. */
function backlogAvailable(): boolean {
  try {
    execaSync("backlog", ["--version"], { stdout: "pipe", stderr: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const describeIfBacklog = backlogAvailable() ? describe : describe.skip;

/**
 * An environment overlay that points Backlog.md's per-machine global state (HOME / XDG dirs) inside the
 * test's tmpdir, so concurrent `backlog` invocations (across parallel vitest processes) can't collide on a
 * shared global config or cache.
 */
function isolatedEnv(dir: string): Record<string, string> {
  return {
    HOME: dir,
    XDG_CONFIG_HOME: dir,
    XDG_DATA_HOME: dir,
    XDG_STATE_HOME: dir,
    XDG_CACHE_HOME: dir,
  };
}

/** Read a single task's raw `--plain` detail (for asserting AC/labels the list output doesn't surface). */
function taskDetail(root: string, id: string): string {
  return execaSync("backlog", ["task", id, "--plain"], {
    cwd: root,
    env: { ...process.env, ...isolatedEnv(root) },
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

describeIfBacklog(
  "BacklogCli (the real shell-out adapter, against real Backlog.md in a tmpdir)",
  () => {
    it("init + create with AC/deps/labels + list carries the prefixed id and status (AC#1, AC#2)", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });

        const base = bl.createTask(dir, { title: "Base task" });
        expect(base.id).toBe("authoring-1");
        expect(base.status).toBe("To Do");

        const rich = bl.createTask(dir, {
          title: "Rich task",
          acceptanceCriteria: ["Does X", "Does Y"],
          dependencies: [base.id],
          labels: ["kind:state", "step:foo"],
        });
        expect(rich.id).toBe("authoring-2");

        // list returns parsed summaries (not raw text), with prefixed ids + statuses (AC#1).
        const list = bl.listTasks(dir).sort((a, b) => a.id.localeCompare(b.id));
        expect(list).toEqual([
          { id: "authoring-1", title: "Base task", status: "To Do" },
          { id: "authoring-2", title: "Rich task", status: "To Do" },
        ]);

        // AC#2: Backlog.md actually recorded the AC, deps, and labels (read the single-task detail).
        const detail = taskDetail(dir, "authoring-2");
        expect(detail).toContain("Does X");
        expect(detail).toContain("Does Y");
        expect(detail).toContain("kind:state");
        expect(detail).toContain("step:foo");
        // The dependency on authoring-1 is recorded.
        expect(detail.toLowerCase()).toContain("authoring-1");
      });
    });

    it("edits status to Done and filters by status (AC#1)", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });
        const t = bl.createTask(dir, { title: "Edit me", acceptanceCriteria: ["A"] });

        bl.editTask(dir, t.id, { status: "Done", checkAcceptanceCriteria: [1] });
        const done = bl.listTasks(dir, { status: "Done" });
        expect(done).toEqual([{ id: "authoring-1", title: "Edit me", status: "Done" }]);
        // The acceptance criterion is checked in the real file.
        expect(taskDetail(dir, "authoring-1")).toMatch(/\[x\]\s*#1/);
      });
    });

    it("archives a task so it leaves the active board", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });
        const keep = bl.createTask(dir, { title: "Keep" });
        const drop = bl.createTask(dir, { title: "Drop" });

        bl.archiveTask(dir, drop.id);
        const remaining = bl.listTasks(dir);
        expect(remaining).toEqual([{ id: keep.id, title: "Keep", status: "To Do" }]);
      });
    });

    it("uses the explicit cwd, never an ambient backlog (two isolated roots)", async () => {
      await withTempDir((a) => {
        return withTempDir((b) => {
          // Global-state isolation points at `a`; the per-root backlogs at `a` and `b` stay distinct by cwd.
          const bl = new BacklogCli("backlog", isolatedEnv(a));
          bl.init(a, { taskPrefix: "aaa" });
          bl.init(b, { taskPrefix: "bbb" });
          const ta = bl.createTask(a, { title: "in A" });
          const tb = bl.createTask(b, { title: "in B" });
          expect(ta.id).toBe("aaa-1");
          expect(tb.id).toBe("bbb-1");
          // Each root only sees its own task.
          expect(bl.listTasks(a)).toEqual([{ id: "aaa-1", title: "in A", status: "To Do" }]);
          expect(bl.listTasks(b)).toEqual([{ id: "bbb-1", title: "in B", status: "To Do" }]);
        });
      });
    });
  },
);
