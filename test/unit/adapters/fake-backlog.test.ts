import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";

const ROOT = "/proj/.authoring-backlog";

describe("FakeBacklog (in-memory BacklogMd fake — AC#3)", () => {
  it("init then create assigns a prefixed id and returns a TaskSummary", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    const summary = bl.createTask(ROOT, { title: "First task" });
    expect(summary).toEqual({ id: "authoring-1", title: "First task", status: "To Do" });
  });

  it("assigns monotonic ids per root (authoring-1, authoring-2, ...)", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    expect(bl.createTask(ROOT, { title: "a" }).id).toBe("authoring-1");
    expect(bl.createTask(ROOT, { title: "b" }).id).toBe("authoring-2");
    expect(bl.createTask(ROOT, { title: "c" }).id).toBe("authoring-3");
  });

  it("records acceptance criteria, dependencies, labels, and DoD (faithfulness)", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    const first = bl.createTask(ROOT, { title: "base" });
    const created = bl.createTask(ROOT, {
      title: "rich",
      acceptanceCriteria: ["Does X", "Does Y"],
      definitionOfDone: ["Reviewed"],
      dependencies: [first.id],
      labels: ["kind:state", "step:foo"],
    });
    const detail = bl.taskDetail(ROOT, created.id);
    expect(detail?.acceptanceCriteria.map((a) => a.text)).toEqual(["Does X", "Does Y"]);
    expect(detail?.definitionOfDone.map((d) => d.text)).toEqual(["Reviewed"]);
    expect(detail?.dependencies).toEqual(["authoring-1"]);
    expect(detail?.labels).toEqual(["kind:state", "step:foo"]);
  });

  it("lists tasks and honors a status filter", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    bl.createTask(ROOT, { title: "a" });
    const b = bl.createTask(ROOT, { title: "b" });
    bl.editTask(ROOT, b.id, { status: "Done" });

    expect(
      bl
        .listTasks(ROOT)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["authoring-1", "authoring-2"]);
    expect(bl.listTasks(ROOT, { status: "Done" })).toEqual([
      { id: "authoring-2", title: "b", status: "Done" },
    ]);
    expect(bl.listTasks(ROOT, { status: "To Do" })).toEqual([
      { id: "authoring-1", title: "a", status: "To Do" },
    ]);
  });

  it("edits status, checks AC/DoD, sets/appends notes, and adds/removes labels", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    const t = bl.createTask(ROOT, {
      title: "t",
      acceptanceCriteria: ["A", "B"],
      definitionOfDone: ["D"],
      labels: ["old"],
    });
    bl.editTask(ROOT, t.id, {
      status: "In Progress",
      checkAcceptanceCriteria: [1],
      checkDefinitionOfDone: [1],
      notes: "started",
      appendNotes: "more",
      addLabels: ["new"],
      removeLabels: ["old"],
    });
    const detail = bl.taskDetail(ROOT, t.id);
    expect(detail?.status).toBe("In Progress");
    expect(detail?.acceptanceCriteria[0]?.checked).toBe(true);
    expect(detail?.acceptanceCriteria[1]?.checked).toBe(false);
    expect(detail?.definitionOfDone[0]?.checked).toBe(true);
    expect(detail?.notes).toBe("started\nmore");
    expect(detail?.labels).toEqual(["new"]);
  });

  it("archives a task so it leaves the active list", () => {
    const bl = new FakeBacklog();
    bl.init(ROOT, { taskPrefix: "authoring" });
    const t = bl.createTask(ROOT, { title: "gone" });
    bl.archiveTask(ROOT, t.id);
    expect(bl.listTasks(ROOT)).toEqual([]);
  });

  it("isolates tasks and counters per root", () => {
    const bl = new FakeBacklog();
    bl.init("/a/.authoring-backlog", { taskPrefix: "aaa" });
    bl.init("/b/.authoring-backlog", { taskPrefix: "bbb" });
    expect(bl.createTask("/a/.authoring-backlog", { title: "x" }).id).toBe("aaa-1");
    expect(bl.createTask("/b/.authoring-backlog", { title: "y" }).id).toBe("bbb-1");
  });

  it("throws when operating on an uninitialised root or a missing task", () => {
    const bl = new FakeBacklog();
    expect(() => bl.createTask("/nope", { title: "x" })).toThrow();
    bl.init(ROOT, { taskPrefix: "authoring" });
    expect(() => bl.editTask(ROOT, "authoring-99", { status: "Done" })).toThrow();
  });
});
