import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import type { AuthoringTaskSpec } from "../../../src/core/model/index.js";
import { materialiseAuthoringTasks } from "../../../src/core/services/materialisation.js";

const ROOT = "/proj/.authoring-backlog";

/** A small authoring-task spec for tests. */
function spec(title: string, ...acceptanceCriteria: string[]): AuthoringTaskSpec {
  return { title, acceptanceCriteria };
}

/** Init a fresh fake backlog root. */
function freshBacklog(): FakeBacklog {
  const bl = new FakeBacklog();
  bl.init(ROOT, { taskPrefix: "authoring" });
  return bl;
}

describe("materialiseAuthoringTasks — creates a task per new title (AC#1)", () => {
  it("creates every spec when none exist yet, carrying title + acceptance criteria", () => {
    const bl = freshBacklog();
    const specs = [
      spec("Plan bundle web-handoff", "The plan covers detect/setup/verify."),
      spec("Fill bundle web-handoff", "All payload files referenced."),
      spec("Write advisor content for web-handoff", "The advisor recommends the bundle by name."),
    ];
    const result = materialiseAuthoringTasks(bl, ROOT, specs);

    expect(result.created).toHaveLength(3);
    expect(result.skipped).toEqual([]);
    // Each created task carries its title (returned in the TaskSummary).
    expect(result.created.map((t) => t.title)).toEqual([
      "Plan bundle web-handoff",
      "Fill bundle web-handoff",
      "Write advisor content for web-handoff",
    ]);
    // The acceptance criteria reached Backlog.md (verified via the fake's detail accessor).
    const planId = result.created[0]?.id as string;
    expect(bl.taskDetail(ROOT, planId)?.acceptanceCriteria.map((a) => a.text)).toEqual([
      "The plan covers detect/setup/verify.",
    ]);
    // The backlog now lists exactly the three tasks.
    expect(bl.listTasks(ROOT)).toHaveLength(3);
  });
});

describe("materialiseAuthoringTasks — idempotent by title (AC#2)", () => {
  it("a second identical run creates nothing and changes nothing", () => {
    const bl = freshBacklog();
    const specs = [spec("Plan bundle core"), spec("Fill bundle core")];

    const first = materialiseAuthoringTasks(bl, ROOT, specs);
    expect(first.created).toHaveLength(2);

    const second = materialiseAuthoringTasks(bl, ROOT, specs);
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual(["Plan bundle core", "Fill bundle core"]);

    // No duplicates: still exactly two tasks.
    expect(bl.listTasks(ROOT)).toHaveLength(2);
    expect(
      bl
        .listTasks(ROOT)
        .map((t) => t.title)
        .sort(),
    ).toEqual(["Fill bundle core", "Plan bundle core"]);
  });

  it("a partial overlap creates only the genuinely-new specs", () => {
    const bl = freshBacklog();
    // Pre-create one of the three titles directly.
    bl.createTask(ROOT, { title: "Plan bundle core" });

    const result = materialiseAuthoringTasks(bl, ROOT, [
      spec("Plan bundle core"), // already exists -> skip
      spec("Fill bundle core"), // new
      spec("Review bundle core"), // new
    ]);
    expect(result.created.map((t) => t.title)).toEqual(["Fill bundle core", "Review bundle core"]);
    expect(result.skipped).toEqual(["Plan bundle core"]);
    expect(bl.listTasks(ROOT)).toHaveLength(3);
  });
});

describe("materialiseAuthoringTasks — edge cases", () => {
  it("materialising an empty spec list creates nothing", () => {
    const bl = freshBacklog();
    bl.createTask(ROOT, { title: "existing" });
    const result = materialiseAuthoringTasks(bl, ROOT, []);
    expect(result).toEqual({ created: [], skipped: [] });
    expect(bl.listTasks(ROOT)).toHaveLength(1);
  });

  it("a duplicate title within the SAME batch is created only once", () => {
    const bl = freshBacklog();
    const result = materialiseAuthoringTasks(bl, ROOT, [
      spec("Same title"),
      spec("Same title"), // duplicate within the batch
    ]);
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual(["Same title"]);
    expect(bl.listTasks(ROOT)).toHaveLength(1);
  });
});
