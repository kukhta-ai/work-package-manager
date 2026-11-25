import { appendFileSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** Run one synchronous adapter boundary with both ambient editor selectors genuinely absent. */
function withoutEditorEnvironment<T>(action: () => T): T {
  const editor = process.env.EDITOR;
  const visual = process.env.VISUAL;
  delete process.env.EDITOR;
  delete process.env.VISUAL;
  try {
    return action();
  } finally {
    if (editor === undefined) delete process.env.EDITOR;
    else process.env.EDITOR = editor;
    if (visual === undefined) delete process.env.VISUAL;
    else process.env.VISUAL = visual;
  }
}

/** Read a single task's raw `--plain` detail (for asserting AC/labels the list output doesn't surface). */
function taskDetail(root: string, id: string): string {
  return execaSync("backlog", ["task", id, "--plain"], {
    cwd: root,
    env: { ...process.env, ...isolatedEnv(root) },
    stdout: "pipe",
    stderr: "pipe",
  }).stdout;
}

describeIfBacklog(
  "BacklogCli (the real shell-out adapter, against real Backlog.md in a tmpdir)",
  () => {
    it("binds every native call to its explicit root despite a foreign BACKLOG_CWD", async () => {
      await withTempDir((dir) => {
        const expected = join(dir, "expected");
        const foreign = join(dir, "foreign");
        mkdirSync(expected);
        mkdirSync(foreign);
        const native = new BacklogCli("backlog", isolatedEnv(dir));
        native.init(expected, { taskPrefix: "authoring" });
        native.init(foreign, { taskPrefix: "authoring" });
        const redirected = new BacklogCli("backlog", { ...isolatedEnv(dir), BACKLOG_CWD: foreign });
        const task = redirected.createTask(expected, {
          title: "Explicit root",
          acceptanceCriteria: ["Only expected source changes"],
        });
        expect(redirected.readTask(expected, task.id).title).toBe("Explicit root");
        expect(native.inspectTaskInventory(expected).activeEntries).toEqual([task.id]);
        expect(native.inspectTaskInventory(foreign).activeEntries).toEqual([]);
      });
    });

    it("initializes the exact defaults when EDITOR and VISUAL are absent", async () => {
      await withTempDir((dir) => {
        withoutEditorEnvironment(() => {
          const bl = new BacklogCli("backlog", isolatedEnv(dir));
          bl.init(dir, { taskPrefix: "authoring" });

          expect(bl.inspectTaskInventory(dir)).toEqual({
            configurationMatchesFreshDefaults: true,
            activeEntries: [],
            inactiveEntries: [],
            unexpectedEntries: [],
          });
        });
      });
    });

    it("init + create with AC/deps/labels + list carries the prefixed id and status (AC#1, AC#2)", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });
        expect(bl.inspectRoot(dir)).toEqual({ valid: true, taskPrefix: "authoring" });
        expect(bl.inspectTaskInventory(dir)).toEqual({
          configurationMatchesFreshDefaults: true,
          activeEntries: [],
          inactiveEntries: [],
          unexpectedEntries: [],
        });

        const base = bl.createTask(dir, { title: "Base task" });
        expect(base.id).toBe("authoring-1");
        expect(base.status).toBe("To Do");

        const rich = bl.createTask(dir, {
          title: "Rich task",
          description: "Exact description",
          acceptanceCriteria: ["Does X", "Does Y"],
          definitionOfDone: ["Done X"],
          dependencies: [base.id],
          labels: ["kind:state", "step:foo"],
        });
        expect(rich.id).toBe("authoring-2");
        expect(bl.readTask(dir, rich.id)).toEqual({
          id: "authoring-2",
          title: "Rich task",
          status: "To Do",
          ordinal: 2000,
          description: "Exact description",
          acceptanceCriteria: [
            { text: "Does X", checked: false },
            { text: "Does Y", checked: false },
          ],
          definitionOfDone: [{ text: "Done X", checked: false }],
          dependencies: ["authoring-1"],
          labels: ["kind:state", "step:foo"],
          extraMetadata: [],
          extraSections: [],
        });
        expect(bl.inspectTaskInventory(dir)).toEqual({
          configurationMatchesFreshDefaults: true,
          activeEntries: ["authoring-1", "authoring-2"],
          inactiveEntries: [],
          unexpectedEntries: [],
        });

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

        appendFileSync(join(dir, "backlog", "config.yml"), "unexpected_setting: true\n");
        expect(bl.inspectTaskInventory(dir).configurationMatchesFreshDefaults).toBe(false);
      });
    });

    it("lists every native priority without losing identities, titles or status filters", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });
        const cases = [
          { priority: null, status: "To Do", title: "No priority" },
          { priority: "high", status: "In Progress", title: "High - [LOW] is title text" },
          { priority: "medium", status: "Done", title: "Medium priority" },
          { priority: "low", status: "To Do", title: "Low priority" },
        ] as const;
        const expected = cases.map(({ priority, status, title }) => {
          const task = bl.createTask(dir, { title });
          const args = ["task", "edit", task.id, "--status", status];
          if (priority !== null) args.push("--priority", priority);
          execaSync("backlog", args, {
            cwd: dir,
            env: { ...process.env, ...isolatedEnv(dir) },
          });
          return { ...task, status };
        });

        expect(bl.listTasks(dir).sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
        expect(
          bl.listTasks(dir, { status: "To Do" }).sort((a, b) => a.id.localeCompare(b.id)),
        ).toEqual(expected.filter(({ status }) => status === "To Do"));
      });
    });

    it("treats an option-looking task title as inert text", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });

        const created = bl.createTask(dir, {
          title: "--help",
          acceptanceCriteria: ["--help remains a literal criterion"],
        });

        expect(created).toEqual({ id: "authoring-1", title: "--help", status: "To Do" });
        expect(bl.readTask(dir, created.id)).toMatchObject({
          title: "--help",
          acceptanceCriteria: [{ text: "--help remains a literal criterion", checked: false }],
        });
      });
    });

    it("edits status to Done and filters by status (AC#1)", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "authoring" });
        const t = bl.createTask(dir, { title: "Edit me", acceptanceCriteria: ["A"] });

        bl.editTask(dir, t.id, {
          status: "Done",
          checkAcceptanceCriteria: [1],
          notes: "user-authored note",
          addLabels: ["changed"],
        });
        const done = bl.listTasks(dir, { status: "Done" });
        expect(done).toEqual([{ id: "authoring-1", title: "Edit me", status: "Done" }]);
        expect(bl.readTask(dir, t.id).acceptanceCriteria).toEqual([{ text: "A", checked: true }]);
        expect(bl.readTask(dir, t.id)).toMatchObject({
          labels: ["changed"],
          extraSections: [{ heading: "Implementation Notes", content: "user-authored note" }],
        });
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
        expect(bl.inspectTaskInventory(dir)).toEqual({
          configurationMatchesFreshDefaults: true,
          activeEntries: [keep.id],
          inactiveEntries: [drop.id],
          unexpectedEntries: [],
        });
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

    it("rejects an ambient parent backlog when the exact requested root is uninitialised", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        bl.init(dir, { taskPrefix: "ambient" });
        const nested = join(dir, "nested");
        mkdirSync(nested);

        expect(bl.inspectRoot(nested)).toEqual({
          valid: false,
          reason: "the exact backlog root has no real backlog directory",
        });

        symlinkSync(
          join(dir, "backlog"),
          join(nested, "backlog"),
          process.platform === "win32" ? "junction" : "dir",
        );
        expect(bl.inspectRoot(nested)).toEqual({
          valid: false,
          reason: "the exact backlog root has no real backlog directory",
        });
      });
    });

    it("rejects root-config discovery overrides and aliased task stores", async () => {
      await withTempDir((overrideRoot) => {
        const overrideBacklog = new BacklogCli("backlog", isolatedEnv(overrideRoot));
        overrideBacklog.init(overrideRoot, { taskPrefix: "authoring" });
        writeFileSync(
          join(overrideRoot, "backlog.config.yml"),
          'project_name: "Redirected"\ntask_prefix: "other"\n',
        );
        expect(overrideBacklog.inspectRoot(overrideRoot)).toEqual({
          valid: false,
          reason: "the exact backlog root does not contain only its real backlog directory",
        });
      });

      await withTempDir((aliasRoot) => {
        const aliasBacklog = new BacklogCli("backlog", isolatedEnv(aliasRoot));
        aliasBacklog.init(aliasRoot, { taskPrefix: "authoring" });
        const tasks = join(aliasRoot, "backlog", "tasks");
        const movedTasks = join(aliasRoot, "backlog", "tasks-real");
        renameSync(tasks, movedTasks);
        symlinkSync(movedTasks, tasks, process.platform === "win32" ? "junction" : "dir");
        expect(aliasBacklog.inspectRoot(aliasRoot)).toMatchObject({ valid: false });
        const inspection = aliasBacklog.inspectRoot(aliasRoot);
        expect(inspection.valid ? "" : inspection.reason).toContain("not a real directory");
      });
    });

    it("recognizes and completes only an empty canonical init-directory residue", async () => {
      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        mkdirSync(join(dir, "backlog", "archive", "tasks"), { recursive: true });
        mkdirSync(join(dir, "backlog", "tasks"), { recursive: true });
        expect(bl.inspectEmptyInitialisationResidue(dir)).toBe(true);

        bl.init(dir, { taskPrefix: "authoring" });
        expect(bl.inspectRoot(dir)).toEqual({ valid: true, taskPrefix: "authoring" });
      });

      await withTempDir((dir) => {
        const bl = new BacklogCli("backlog", isolatedEnv(dir));
        mkdirSync(join(dir, "backlog", "tasks"), { recursive: true });
        writeFileSync(join(dir, "backlog", "tasks", "USER.md"), "preserve\n");
        expect(bl.inspectEmptyInitialisationResidue(dir)).toBe(false);
      });
    });
  },
);
