import { describe, expect, it } from "vitest";
import type { Template } from "../../../src/core/model/index.js";
import { perBundleAuthoringTaskCatalog } from "../../../src/core/operations/create-bundle.js";
import type { TaskRecord } from "../../../src/core/ports/backlog.js";
import type {
  RecordedBundleAuthoringTask,
  RecordedBundleTaskContribution,
} from "../../../src/core/services/bundle-authoring-contributions.js";
import {
  compileBundleAuthoringTaskPlan,
  compileRecordedBundleAuthoringTaskPlan,
  reconcileBundleAuthoringTaskPlan,
  UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES,
} from "../../../src/core/services/bundle-authoring-task-plan.js";
import { inspectTemplateAuthoringTasks } from "../../../src/core/services/template-authoring-tasks.js";

const PRODUCER = { source: "built-in", scope: "bundle", name: "default" } as const;

function inspection() {
  const template: Template = {
    name: "default",
    scope: "bundle",
    parameters: [],
    files: [],
    snippets: [],
    authoringTaskSource: {
      revision: "r2",
      tasks: [
        {
          key: "verify",
          title: "Verify {{wpm.bundle.id}}",
          "acceptance-criteria": ["{{wpm.bundle.id}} is verified"],
          "depends-on": ["self:configure"],
        },
        {
          key: "configure",
          title: "Configure {{wpm.bundle.id}}",
          "acceptance-criteria": ["{{wpm.bundle.id}} is configured"],
          "depends-on": ["wpm:bundle:plan"],
        },
      ],
    },
  };
  return inspectTemplateAuthoringTasks({
    template,
    producer: PRODUCER,
    mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
    context: {
      "wpm.project.name": "demo",
      "wpm.bundle.id": "web",
      "wpm.bundle.version": "1.2.3",
    },
  });
}

function record(
  id: string,
  title: string,
  acceptanceCriteria: readonly string[],
  labels: readonly string[] = [],
  dependencies: readonly string[] = [],
): TaskRecord {
  return {
    id,
    title,
    status: "Done",
    ordinal: Number(id.replace(/\D/g, "")) * 1000,
    description: null,
    acceptanceCriteria: acceptanceCriteria.map((text, index) => ({
      text,
      checked: index === 0,
    })),
    definitionOfDone: [{ text: "human-added", checked: true }],
    dependencies,
    labels,
    extraMetadata: ["Priority: high"],
    extraSections: [{ heading: "Implementation Notes", content: "keep me" }],
  };
}

function recordedTask(
  key: string,
  dependencyIdentities: readonly string[] = [],
): RecordedBundleAuthoringTask {
  return {
    identity: `template:built-in:bundle:default@r2:${key}#bundle:web`,
    key,
    title: `Recorded ${key}`,
    acceptanceCriteria: [`Recorded ${key} exists`],
    dependencyIdentities,
    labels: [
      "wpm:template-task",
      "wpm:template-origin:built-in:bundle:default",
      "wpm:template-revision:r2",
      `wpm:template-key:${key}`,
      "wpm:bundle:web",
    ],
  };
}

function recordedContribution(
  tasks: readonly RecordedBundleAuthoringTask[],
): RecordedBundleTaskContribution {
  return { status: "tasks", producer: PRODUCER, revision: "r2", tasks };
}

describe("bundle authoring task plan", () => {
  it("keeps the durable template dependency references aligned with the unconditional catalog", () => {
    expect(UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES).toEqual(
      perBundleAuthoringTaskCatalog("web", { advisor: false }).map(({ reference }) => reference),
    );
  });

  it("composes mandatory work plus a concrete producer-scoped dependency-first pack", () => {
    const result = compileBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      inspection: inspection(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks.slice(-2).map(({ provenance }) => provenance?.key)).toEqual([
      "configure",
      "verify",
    ]);
    expect(result.tasks.at(-1)?.dependencyIdentities).toEqual([
      "template:built-in:bundle:default@r2:configure#bundle:web",
    ]);
    expect(result.tasks.at(-2)?.dependencyIdentities).toEqual(["wpm:bundle:plan#bundle:web"]);
  });

  it("preserves exact matching human state and plans only missing work", () => {
    const compiled = compileBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      inspection: inspection(),
    });
    if (!compiled.ok) throw new Error("fixture plan invalid");
    const records: TaskRecord[] = compiled.tasks.slice(0, -1).map((task, index) =>
      record(
        `authoring-${index + 1}`,
        task.title,
        task.acceptanceCriteria,
        task.labels.length > 0 ? [...task.labels, "human:keep"] : ["human:keep"],
        task.dependencyIdentities.map((identity) => {
          const dependencyIndex = compiled.tasks.findIndex(
            (candidate) => candidate.identity === identity,
          );
          return `authoring-${dependencyIndex + 1}`;
        }),
      ),
    );
    const result = reconcileBundleAuthoringTaskPlan({ tasks: compiled.tasks, records });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preserved).toHaveLength(compiled.tasks.length - 1);
    expect(result.missing.map(({ task }) => task.provenance?.key)).toEqual(["verify"]);
    expect(records.at(-1)?.status).toBe("Done");
    expect(records.at(-1)?.extraSections[0]?.content).toBe("keep me");
  });

  it("is a no-op when the exact complete plan already exists", () => {
    const compiled = compileBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: [],
      inspection: inspection(),
    });
    // The inspection references wpm:bundle:plan, so an empty mandatory set must fail before reconciliation.
    expect(compiled.ok).toBe(false);
  });

  it("aggregates foreign-title, malformed ownership, definition drift, and dependency drift", () => {
    const compiled = compileBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      inspection: inspection(),
    });
    if (!compiled.ok) throw new Error("fixture plan invalid");
    const configure = compiled.tasks.find(({ provenance }) => provenance?.key === "configure");
    const plan = compiled.tasks[0];
    if (configure === undefined || plan === undefined) throw new Error("fixture plan incomplete");
    const records = [
      record("authoring-1", plan.title, ["foreign definition"]),
      record("authoring-2", "Unrelated", ["x"], ["wpm:template-task"]),
      record("authoring-3", configure.title, configure.acceptanceCriteria, configure.labels, [
        "authoring-999",
      ]),
    ];
    const result = reconcileBundleAuthoringTaskPlan({ tasks: compiled.tasks, records });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "existing-definition-mismatch",
        "malformed-template-ownership",
        "existing-dependency-mismatch",
      ]),
    );
    expect(result.preserved.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["authoring-1", "authoring-3"]),
    );
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("ignores exact WPM ownership from project and other-bundle scopes but rejects unmatched current-bundle ownership", () => {
    const compiled = compileBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      inspection: inspection(),
    });
    if (!compiled.ok) throw new Error("fixture plan invalid");
    const plannedTitle = compiled.tasks.find(({ provenance }) => provenance !== undefined)?.title;
    if (plannedTitle === undefined) throw new Error("fixture contribution missing");
    const unrelated = [
      record(
        "authoring-101",
        "Project-owned unrelated task",
        ["Project-owned"],
        [
          "wpm:template-task",
          "wpm:template-origin:built-in:project:minimal",
          "wpm:template-revision:r1",
          "wpm:template-key:configure",
        ],
      ),
      record(
        "authoring-102",
        "Other-bundle-owned unrelated task",
        ["Other-bundle-owned"],
        [
          "wpm:template-task",
          "wpm:template-origin:built-in:bundle:default",
          "wpm:template-revision:r1",
          "wpm:template-key:configure",
          "wpm:bundle:other",
        ],
      ),
    ];
    const ignored = reconcileBundleAuthoringTaskPlan({ tasks: compiled.tasks, records: unrelated });
    expect(ignored.ok).toBe(true);
    if (ignored.ok) expect(ignored.preserved).toHaveLength(0);

    const foreignTitle = record(
      "authoring-105",
      plannedTitle,
      ["Other-bundle-owned"],
      [
        "wpm:template-task",
        "wpm:template-origin:built-in:bundle:default",
        "wpm:template-revision:r1",
        "wpm:template-key:configure",
        "wpm:bundle:other",
      ],
    );
    const titleCollision = reconcileBundleAuthoringTaskPlan({
      tasks: compiled.tasks,
      records: [foreignTitle],
    });
    expect(titleCollision.ok).toBe(false);
    if (!titleCollision.ok) {
      expect(titleCollision.problems.map(({ code }) => code)).toContain("foreign-title-ownership");
    }

    const currentBundleRecord = record(
      "authoring-103",
      "Unmatched current ownership",
      ["x"],
      [
        "wpm:template-task",
        "wpm:template-origin:built-in:bundle:default",
        "wpm:template-revision:r99",
        "wpm:template-key:unmatched",
        "wpm:bundle:web",
      ],
    );
    const rejected = reconcileBundleAuthoringTaskPlan({
      tasks: compiled.tasks,
      records: [currentBundleRecord],
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.problems.map(({ code }) => code)).toContain("malformed-template-ownership");
    }

    const noncanonicalProducer = record(
      "authoring-104",
      "Noncanonical producer ownership",
      ["x"],
      [
        "wpm:template-task",
        "wpm:template-origin:built-in:bundle:1default",
        "wpm:template-revision:r1",
        "wpm:template-key:configure",
        "wpm:bundle:other",
      ],
    );
    const malformed = reconcileBundleAuthoringTaskPlan({
      tasks: compiled.tasks,
      records: [noncanonicalProducer],
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.problems.map(({ code }) => code)).toContain("malformed-template-ownership");
    }

    const reservedBundleScope = record(
      "authoring-106",
      "Reserved bundle ownership",
      ["x"],
      [
        "wpm:template-task",
        "wpm:template-origin:built-in:bundle:default",
        "wpm:template-revision:r1",
        "wpm:template-key:configure",
        "wpm:bundle:new",
      ],
    );
    const reserved = reconcileBundleAuthoringTaskPlan({
      tasks: compiled.tasks,
      records: [reservedBundleScope],
    });
    expect(reserved.ok).toBe(false);
    if (!reserved.ok) {
      expect(reserved.problems.map(({ code }) => code)).toContain("malformed-template-ownership");
    }
  });

  it("rehydrates recorded forward dependencies in stable dependency-first order and reports cycles", () => {
    const configureIdentity = recordedTask("configure").identity;
    const verify = recordedTask("verify", [configureIdentity]);
    const configure = recordedTask("configure", ["wpm:bundle:plan#bundle:web"]);
    const ordered = compileRecordedBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      contribution: recordedContribution([verify, configure]),
    });
    expect(ordered.ok).toBe(true);
    if (ordered.ok) {
      expect(ordered.tasks.slice(-2).map(({ provenance }) => provenance?.key)).toEqual([
        "configure",
        "verify",
      ]);
    }

    const first = recordedTask("first", [recordedTask("second").identity]);
    const second = recordedTask("second", [first.identity]);
    const cyclic = compileRecordedBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      contribution: recordedContribution([first, second]),
    });
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.problems.map(({ code }) => code)).toContain("cyclic-dependency");
  });

  it("forbids recorded dependencies on the conditional advisor even when that task is present", () => {
    const result = compileRecordedBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: true }),
      contribution: recordedContribution([
        recordedTask("advisor-dependent", ["wpm:bundle:write-advisor-content#bundle:web"]),
      ]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "dependency-unresolved",
            message: expect.stringContaining("not an unconditional bundle mandatory reference"),
          }),
        ]),
      );
    }
  });

  it("orders a 12k recorded forward chain without recursion or quadratic scans", () => {
    const count = 12_000;
    const tasks = Array.from({ length: count }, (_, index) => {
      const key = `task-${String(index).padStart(5, "0")}`;
      const nextKey = `task-${String(index + 1).padStart(5, "0")}`;
      return recordedTask(
        key,
        index + 1 < count
          ? [`template:built-in:bundle:default@r2:${nextKey}#bundle:web`]
          : ["wpm:bundle:plan#bundle:web"],
      );
    });
    const result = compileRecordedBundleAuthoringTaskPlan({
      id: "web",
      mandatoryTasks: perBundleAuthoringTaskCatalog("web", { advisor: false }),
      contribution: recordedContribution(tasks),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const recorded = result.tasks.filter(({ provenance }) => provenance !== undefined);
    expect(recorded).toHaveLength(count);
    expect(recorded[0]?.provenance?.key).toBe("task-11999");
    expect(recorded.at(-1)?.provenance?.key).toBe("task-00000");
  });
});
