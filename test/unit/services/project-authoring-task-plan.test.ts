import { describe, expect, it } from "vitest";
import type { Template, TemplateScope } from "../../../src/core/model/index.js";
import {
  perBundleAuthoringTaskCatalog,
  perBundleAuthoringTasks,
} from "../../../src/core/operations/create-bundle.js";
import {
  projectWideAuthoringTaskCatalog,
  projectWideAuthoringTasks,
} from "../../../src/core/operations/init-project.js";
import {
  compileProjectAuthoringTaskPlan,
  templateTaskProvenanceLabels,
} from "../../../src/core/services/project-authoring-task-plan.js";
import {
  inspectTemplateAuthoringTasks,
  type TemplateAuthoringTaskInspection,
} from "../../../src/core/services/template-authoring-tasks.js";

function template(
  scope: TemplateScope,
  name: string,
  revision?: string,
  tasks?: readonly unknown[],
): Template {
  return {
    name,
    scope,
    parameters: [],
    files: [],
    snippets: [],
    ...(tasks !== undefined ? { authoringTaskSource: { revision, tasks } } : {}),
  };
}

function projectInspection(
  subject: Template,
  projectName = "demo",
): TemplateAuthoringTaskInspection {
  return inspectTemplateAuthoringTasks({
    template: subject,
    producer: { source: "built-in", scope: "project", name: subject.name },
    mandatoryTasks: projectWideAuthoringTaskCatalog(),
    context: { "wpm.project.name": projectName },
  });
}

function bundleInspection(
  subject: Template,
  bundleId: string,
  bundleVersion = "1.0.0",
): TemplateAuthoringTaskInspection {
  return inspectTemplateAuthoringTasks({
    template: subject,
    producer: { source: "built-in", scope: "bundle", name: subject.name },
    // The documented dependency allowlist is unconditional. Init's advisor-inclusive actual catalog is
    // supplied separately to the complete-plan compiler for full rendered-title collision checks.
    mandatoryTasks: perBundleAuthoringTaskCatalog(bundleId, { advisor: false }),
    context: {
      "wpm.project.name": "demo",
      "wpm.bundle.id": bundleId,
      "wpm.bundle.version": bundleVersion,
    },
  });
}

function compile(
  project: TemplateAuthoringTaskInspection,
  bundles: readonly {
    readonly id: string;
    readonly inspection: TemplateAuthoringTaskInspection;
  }[] = [],
) {
  return compileProjectAuthoringTaskPlan({
    project: {
      inspection: project,
      mandatoryTasks: projectWideAuthoringTaskCatalog(),
    },
    bundles: bundles.map(({ id, inspection }) => ({
      id,
      inspection,
      mandatoryTasks: perBundleAuthoringTaskCatalog(id, { advisor: true }),
    })),
  });
}

describe("compileProjectAuthoringTaskPlan", () => {
  it("preserves the exact mandatory-only order and bytes when neither template contributes tasks", () => {
    const result = compile(projectInspection(template("project", "minimal")), [
      {
        id: "alpha",
        inspection: bundleInspection(template("bundle", "default"), "alpha"),
      },
      {
        id: "beta",
        inspection: bundleInspection(template("bundle", "default"), "beta"),
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.tasks.map(({ title, acceptanceCriteria }) => ({ title, acceptanceCriteria })),
    ).toEqual([
      ...projectWideAuthoringTasks(),
      ...perBundleAuthoringTasks("alpha", { advisor: true }),
      ...perBundleAuthoringTasks("beta", { advisor: true }),
    ]);
    expect(result.tasks.every(({ labels }) => labels.length === 0)).toBe(true);
    expect(
      result.tasks.every(({ dependencyIdentities }) => dependencyIdentities.length === 0),
    ).toBe(true);
  });

  it("stably topologically orders forward project refs and records exact semantic provenance", () => {
    const subject = template("project", "minimal-plus", "rev-7", [
      {
        key: "verify-license",
        title: "Verify license for {{wpm.project.name}}",
        "acceptance-criteria": ["The license is observable"],
        "depends-on": ["self:collect-license", "wpm:project:set-metadata"],
      },
      {
        key: "collect-license",
        title: "Collect license for {{wpm.project.name}}",
        "acceptance-criteria": ["The license is recorded"],
      },
    ]);
    const result = compile(projectInspection(subject));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const additional = result.tasks.slice(projectWideAuthoringTasks().length);
    expect(additional.map(({ title }) => title)).toEqual([
      "Collect license for demo",
      "Verify license for demo",
    ]);
    expect(additional[0]).toMatchObject({
      identity: "template:built-in:project:minimal-plus@rev-7:collect-license",
      dependencyIdentities: [],
      labels: templateTaskProvenanceLabels({
        producer: { source: "built-in", scope: "project", name: "minimal-plus" },
        revision: "rev-7",
        key: "collect-license",
      }),
    });
    expect(additional[1]?.dependencyIdentities).toEqual([
      "template:built-in:project:minimal-plus@rev-7:collect-license",
      "wpm:project:set-metadata",
    ]);
  });

  it("scopes the same bundle producer/key and mandatory refs independently for each concrete bundle", () => {
    const subject = template("bundle", "default", "3", [
      {
        key: "inspect-runtime",
        title: "Inspect {{wpm.bundle.id}} runtime",
        "acceptance-criteria": ["{{wpm.bundle.id}} at {{wpm.bundle.version}} is observable"],
        "depends-on": ["wpm:bundle:plan"],
      },
    ]);
    const result = compile(projectInspection(template("project", "minimal")), [
      { id: "alpha", inspection: bundleInspection(subject, "alpha") },
      { id: "beta", inspection: bundleInspection(subject, "beta", "2.0.0") },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const alpha = result.tasks.find(({ title }) => title === "Inspect alpha runtime");
    const beta = result.tasks.find(({ title }) => title === "Inspect beta runtime");
    expect(alpha).toMatchObject({
      identity: "template:built-in:bundle:default@3:inspect-runtime#bundle:alpha",
      dependencyIdentities: ["wpm:bundle:plan#bundle:alpha"],
      labels: expect.arrayContaining(["wpm:template-key:inspect-runtime", "wpm:bundle:alpha"]),
    });
    expect(beta).toMatchObject({
      identity: "template:built-in:bundle:default@3:inspect-runtime#bundle:beta",
      dependencyIdentities: ["wpm:bundle:plan#bundle:beta"],
      labels: expect.arrayContaining(["wpm:template-key:inspect-runtime", "wpm:bundle:beta"]),
    });
    expect(alpha?.identity).not.toBe(beta?.identity);
  });

  it("keeps equal local keys from project and bundle producers distinct", () => {
    const sharedTask = (title: string) => [
      {
        key: "write-docs",
        title,
        "acceptance-criteria": [`${title} are observable`],
      },
    ];
    const project = template("project", "minimal-plus", "1", sharedTask("Write project docs"));
    const bundle = template("bundle", "default", "1", sharedTask("Write alpha docs"));
    const result = compile(projectInspection(project), [
      { id: "alpha", inspection: bundleInspection(bundle, "alpha") },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const identities = result.tasks
      .filter(({ labels }) => labels.includes("wpm:template-key:write-docs"))
      .map(({ identity }) => identity);
    expect(identities).toEqual([
      "template:built-in:project:minimal-plus@1:write-docs",
      "template:built-in:bundle:default@1:write-docs#bundle:alpha",
    ]);
  });

  it("retains iterative dependency-first ordering for a 12,000-task forward-reference chain", () => {
    const taskCount = 12_000;
    const tasks = Array.from({ length: taskCount }, (_, index) => ({
      key: `deep-${index}`,
      title: `Deep task ${index}`,
      "acceptance-criteria": [`Deep task ${index} is observable`],
      ...(index + 1 < taskCount ? { "depends-on": [`self:deep-${index + 1}`] } : {}),
    }));
    const result = compile(projectInspection(template("project", "deep-plan", "deep-r1", tasks)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const additional = result.tasks.slice(projectWideAuthoringTasks().length);
    expect(additional).toHaveLength(taskCount);
    expect(additional[0]?.identity).toBe(
      `template:built-in:project:deep-plan@deep-r1:deep-${taskCount - 1}`,
    );
    expect(additional.at(-1)?.identity).toBe("template:built-in:project:deep-plan@deep-r1:deep-0");
    expect(
      additional.every(
        (task, index) =>
          index === 0 || task.dependencyIdentities[0] === additional[index - 1]?.identity,
      ),
    ).toBe(true);
  }, 10_000);

  it("aggregates invalid contributions and complete-plan collisions with affected contribution identity", () => {
    const invalidProject = template("project", "broken", "1", [
      {
        key: "bad-context",
        title: "Bad {{wpm.bundle.id}}",
        "acceptance-criteria": ["Bad context is observable"],
        "depends-on": ["self:missing"],
      },
    ]);
    const collidingBundle = template("bundle", "default", "1", [
      {
        key: "advisor-copy",
        title: "Write advisor content for alpha",
        "acceptance-criteria": ["The duplicate title is observable"],
      },
    ]);
    const result = compile(projectInspection(invalidProject), [
      { id: "alpha", inspection: bundleInspection(collidingBundle, "alpha") },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unavailable-context",
          contribution: "template:built-in:project:broken@1",
        }),
        expect.objectContaining({
          code: "unresolved-dependency",
          contribution: "template:built-in:project:broken@1",
        }),
        expect.objectContaining({
          code: "rendered-title-collision",
          contribution: "template:built-in:bundle:default@1#bundle:alpha",
        }),
      ]),
    );
    expect(result.problems).toEqual(
      [...result.problems].sort((left, right) =>
        `${left.contribution}\0${left.path}\0${left.code}`.localeCompare(
          `${right.contribution}\0${right.path}\0${right.code}`,
        ),
      ),
    );
  });
});
