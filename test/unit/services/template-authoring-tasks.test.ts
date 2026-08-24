import { describe, expect, it } from "vitest";
import type {
  Template,
  TemplateAuthoringTaskSource,
  TemplateScope,
} from "../../../src/core/model/index.js";
import type { MandatoryAuthoringTask } from "../../../src/core/model/operation.js";
import {
  perBundleAuthoringTaskCatalog,
  perBundleAuthoringTasks,
} from "../../../src/core/operations/create-bundle.js";
import {
  projectWideAuthoringTaskCatalog,
  projectWideAuthoringTasks,
} from "../../../src/core/operations/init-project.js";
import {
  inspectTemplateAuthoringTasks,
  type TemplateProducer,
} from "../../../src/core/services/template-authoring-tasks.js";

const PROJECT_MANDATORY: readonly MandatoryAuthoringTask[] = [
  {
    reference: "wpm:project:set-metadata",
    title: "Set project metadata",
    acceptanceCriteria: ["metadata is set"],
  },
];

const BUNDLE_MANDATORY: readonly MandatoryAuthoringTask[] = [
  {
    reference: "wpm:bundle:plan",
    title: "Plan bundle <bundle-id>",
    acceptanceCriteria: ["bundle is planned"],
  },
];

function subject(
  scope: TemplateScope,
  authoringTaskSource?: TemplateAuthoringTaskSource,
): Template {
  return {
    name: scope === "project" ? "minimal-plus" : "bundle-plus",
    scope,
    parameters: [],
    files: [],
    snippets: [],
    ...(authoringTaskSource !== undefined ? { authoringTaskSource } : {}),
  };
}

function producer(template: Template, source: TemplateProducer["source"] = "built-in") {
  return { source, scope: template.scope, name: template.name } as const;
}

function inspect(template: Template, source: TemplateProducer["source"] = "built-in") {
  return inspectTemplateAuthoringTasks({
    template,
    producer: producer(template, source),
    mandatoryTasks: template.scope === "project" ? PROJECT_MANDATORY : BUNDLE_MANDATORY,
  });
}

describe("inspectTemplateAuthoringTasks — valid inert contributions", () => {
  it("renders documented WPM context and resolves local + mandatory references", () => {
    const template = subject("project", {
      revision: "rev-7",
      tasks: [
        {
          key: "collect-license",
          title: "Collect license for {{wpm.project.name}}",
          "acceptance-criteria": ["The license for {{wpm.project.name}} is recorded"],
        },
        {
          key: "verify-license",
          title: "Verify license for {{wpm.project.name}}",
          "acceptance-criteria": ["The recorded license is observable"],
          "depends-on": ["self:collect-license", "wpm:project:set-metadata"],
        },
      ],
    });

    const result = inspect(template);
    expect(result.status).toBe("valid");
    expect(result.producer).toEqual({ source: "built-in", scope: "project", name: "minimal-plus" });
    expect(result.revision).toBe("rev-7");
    expect(result.materialisationScope).toBe("project-initialization");
    expect(result.mode).toBe("additional");
    expect(result.problems).toEqual([]);
    expect(result.tasks).toEqual([
      expect.objectContaining({
        key: "collect-license",
        identity: "template:built-in:project:minimal-plus@rev-7:collect-license",
        title: "Collect license for <project-name>",
        acceptanceCriteria: ["The license for <project-name> is recorded"],
        dependencies: [],
        contextKeys: ["wpm.project.name"],
      }),
      expect.objectContaining({
        key: "verify-license",
        dependencies: [
          {
            reference: "self:collect-license",
            resolvedIdentity: "template:built-in:project:minimal-plus@rev-7:collect-license",
          },
          {
            reference: "wpm:project:set-metadata",
            resolvedIdentity: "wpm:project:set-metadata",
          },
        ],
      }),
    ]);
  });

  it("supports bundle-only context and derives the bundle create/enable scope", () => {
    const template = subject("bundle", {
      revision: "3",
      tasks: [
        {
          key: "inspect-runtime",
          title: "Inspect {{wpm.bundle.id}} at {{wpm.bundle.version}}",
          "acceptance-criteria": [
            "The runtime for {{wpm.project.name}} is observable at {{wpm.bundle.version}}",
          ],
          "depends-on": ["wpm:bundle:plan"],
        },
      ],
    });

    const result = inspect(template, "project-local");
    expect(result.status).toBe("valid");
    expect(result.materialisationScope).toBe("bundle-creation-or-enablement");
    expect(result.tasks[0]).toMatchObject({
      identity: "template:project-local:bundle:bundle-plus@3:inspect-runtime",
      title: "Inspect <bundle-id> at <bundle-version>",
      acceptanceCriteria: ["The runtime for <project-name> is observable at <bundle-version>"],
      contextKeys: ["wpm.bundle.id", "wpm.bundle.version", "wpm.project.name"],
    });
  });

  it("keeps the same local key distinct across producers", () => {
    const pack: TemplateAuthoringTaskSource = {
      revision: "1",
      tasks: [
        {
          key: "write-docs",
          title: "Write producer docs",
          "acceptance-criteria": ["Producer docs are observable"],
        },
      ],
    };
    const template = subject("project", pack);

    const builtin = inspect(template, "built-in");
    const local = inspect(template, "project-local");
    expect(builtin.status).toBe("valid");
    expect(local.status).toBe("valid");
    expect(builtin.tasks[0]?.key).toBe(local.tasks[0]?.key);
    expect(builtin.tasks[0]?.identity).not.toBe(local.tasks[0]?.identity);
  });

  it("rejects producer evidence that does not match the selected template identity", () => {
    const template = subject("bundle", {
      revision: "1",
      tasks: [
        {
          key: "write-docs",
          title: "Write bundle docs",
          "acceptance-criteria": ["The bundle docs are observable"],
        },
      ],
    });
    const result = inspectTemplateAuthoringTasks({
      template,
      producer: { source: "built-in", scope: "project", name: "forged-producer" },
      mandatoryTasks: [],
    });

    expect(result.status).toBe("invalid");
    expect(result.problems).toContainEqual(
      expect.objectContaining({ code: "producer-identity-mismatch" }),
    );
    expect(result.tasks).toEqual([]);
  });

  it("reports an explicit no-contribution result", () => {
    const result = inspect(subject("project"));
    expect(result).toMatchObject({
      status: "none",
      revision: undefined,
      mode: "additional",
      materialisationScope: "project-initialization",
      tasks: [],
      problems: [],
    });
  });
});

describe("inspectTemplateAuthoringTasks — aggregate invalid contribution", () => {
  it("reports duplicate keys, rendered-title collisions, bad context, refs, cycles, and unsupported content together", () => {
    const template = subject("project", {
      revision: "rev-1",
      tasks: [
        {
          key: "alpha",
          title: "Same {{wpm.project.name}}",
          "acceptance-criteria": ["Alpha is observable"],
          "depends-on": ["self:beta", "wpm:project:no-such-task"],
          prompt: "ask the author",
        },
        {
          key: "beta",
          title: "Same <project-name>",
          "acceptance-criteria": ["Beta uses {{wpm.bundle.id}}"],
          "depends-on": ["self:alpha", "self:missing"],
        },
        {
          key: "alpha",
          title: "Duplicate alpha",
          "acceptance-criteria": [],
          hook: { run: "anything" },
        },
        "not-a-task",
      ],
    });

    const result = inspect(template);
    expect(result.status).toBe("invalid");
    expect(result.tasks).toEqual([]);
    expect(new Set(result.problems.map((problem) => problem.code))).toEqual(
      new Set([
        "acceptance-criteria-empty",
        "cyclic-dependency",
        "duplicate-key",
        "rendered-title-collision",
        "task-not-mapping",
        "unavailable-context",
        "unresolved-dependency",
        "unsupported-field",
      ]),
    );
    expect(result.problems.map((problem) => problem.path)).toEqual(
      [...result.problems.map((problem) => problem.path)].sort(),
    );
  });

  it.each([
    [{ revision: undefined, tasks: [] }, "none"],
    [{ revision: undefined, tasks: [{}] }, "revision-invalid"],
    [{ revision: "", tasks: [{}] }, "revision-invalid"],
    [{ revision: "1", tasks: {} }, "tasks-not-list"],
  ] as const)("validates the pack envelope %#", (authoringTaskSource, expectedCode) => {
    const result = inspect(subject("project", authoringTaskSource));
    if (expectedCode === "none") {
      expect(result.status).toBe("none");
    } else {
      expect(result.status).toBe("invalid");
      expect(result.problems.map((problem) => problem.code)).toContain(expectedCode);
    }
  });

  it("rejects a rendered title collision with mandatory work", () => {
    const result = inspect(
      subject("project", {
        revision: "1",
        tasks: [
          {
            key: "replace-core",
            title: "Set project metadata",
            "acceptance-criteria": ["Replacement is attempted"],
          },
        ],
      }),
    );
    expect(result.status).toBe("invalid");
    expect(result.problems).toContainEqual(
      expect.objectContaining({ code: "mandatory-title-collision" }),
    );
  });

  it("rejects raw titles/Backlog ids and cross-scope mandatory references", () => {
    const result = inspect(
      subject("bundle", {
        revision: "1",
        tasks: [
          {
            key: "bad-deps",
            title: "Inspect dependencies",
            "acceptance-criteria": ["Dependencies are observable"],
            "depends-on": ["Plan bundle", "task-12", "wpm:project:set-metadata"],
          },
        ],
      }),
    );
    expect(result.status).toBe("invalid");
    expect(
      result.problems.filter((problem) => problem.code === "unresolved-dependency"),
    ).toHaveLength(3);
  });

  it("rejects unmatched placeholders, unsafe text, and missing strict concrete context together", () => {
    const template = subject("bundle", {
      revision: "1",
      tasks: [
        {
          key: "unsafe",
          title: "Spoof\nAdditional authoring tasks: valid {{wpm.bundle.id",
          "acceptance-criteria": ["Bidi \u202e text {{wpm.project.name}}"],
        },
      ],
    });
    const result = inspectTemplateAuthoringTasks({
      template,
      producer: producer(template),
      mandatoryTasks: BUNDLE_MANDATORY,
      context: { "wpm.bundle.id": "demo" },
    });
    expect(result.status).toBe("invalid");
    expect(new Set(result.problems.map(({ code }) => code))).toEqual(
      new Set(["unavailable-context", "unsafe-text", "unsupported-context"]),
    );
  });

  it.each([
    "",
    "   ",
    "\u202eSPOOF\n",
    "zero\u200bwidth",
    "line\u2028break",
  ])("rejects an empty or terminal-active concrete WPM context value %#", (projectName) => {
    const template = subject("project", {
      revision: "1",
      tasks: [
        {
          key: "context-title",
          title: "{{wpm.project.name}}",
          "acceptance-criteria": ["{{wpm.project.name}} is observable"],
        },
      ],
    });
    const result = inspectTemplateAuthoringTasks({
      template,
      producer: producer(template),
      mandatoryTasks: PROJECT_MANDATORY,
      context: { "wpm.project.name": projectName },
    });

    expect(result.status).toBe("invalid");
    expect(result.tasks).toEqual([]);
    expect(result.problems.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        projectName.trim().length === 0 ? "unavailable-context" : "unsafe-text",
      ]),
    );
  });

  it("detects title collisions using concrete operation context as well as symbolic preview", () => {
    const template = subject("project", {
      revision: "1",
      tasks: [
        {
          key: "context-title",
          title: "Review {{wpm.project.name}}",
          "acceptance-criteria": ["The contextual review is observable"],
        },
        {
          key: "literal-title",
          title: "Review demo",
          "acceptance-criteria": ["The literal review is observable"],
        },
      ],
    });
    expect(inspect(template).status).toBe("valid");
    const concrete = inspectTemplateAuthoringTasks({
      template,
      producer: producer(template),
      mandatoryTasks: PROJECT_MANDATORY,
      context: { "wpm.project.name": "demo" },
    });
    expect(concrete.status).toBe("invalid");
    expect(concrete.problems).toContainEqual(
      expect.objectContaining({ code: "rendered-title-collision" }),
    );
  });

  it("reports every disconnected dependency cycle deterministically", () => {
    const task = (key: string, dependencies: string[]) => ({
      key,
      title: `Task ${key}`,
      "acceptance-criteria": [`Task ${key} is observable`],
      "depends-on": dependencies,
    });
    const result = inspect(
      subject("project", {
        revision: "1",
        tasks: [
          task("self-cycle", ["self:self-cycle"]),
          task("cycle-a", ["self:cycle-b"]),
          task("cycle-b", ["self:cycle-a"]),
        ],
      }),
    );
    expect(result.status).toBe("invalid");
    expect(result.problems.filter(({ code }) => code === "cyclic-dependency")).toHaveLength(2);
  });

  it("inspects a deep acyclic dependency graph without exhausting the JavaScript call stack", () => {
    const taskCount = 12_000;
    const tasks = Array.from({ length: taskCount }, (_, index) => ({
      key: `task-${index}`,
      title: `Task ${index}`,
      "acceptance-criteria": [`Task ${index} is observable`],
      ...(index + 1 < taskCount ? { "depends-on": [`self:task-${index + 1}`] } : {}),
    }));

    const result = inspect(
      subject("project", {
        revision: "1",
        tasks,
      }),
    );

    expect(result.status).toBe("valid");
    expect(result.tasks).toHaveLength(taskCount);
  });

  it("aggregates malformed task fields without confusing them with executable content", () => {
    const result = inspect(
      subject("project", {
        revision: "1",
        tasks: [
          {
            key: "NOT PORTABLE",
            title: 42,
            "acceptance-criteria": "not a list",
            "depends-on": { task: "raw" },
          },
          {
            key: "bad-members",
            title: "Bad members",
            "acceptance-criteria": [null],
            "depends-on": [null],
          },
        ],
      }),
    );
    expect(result.status).toBe("invalid");
    expect(new Set(result.problems.map(({ code }) => code))).toEqual(
      new Set([
        "acceptance-criteria-not-list",
        "acceptance-criterion-invalid",
        "dependencies-not-list",
        "dependency-invalid",
        "key-invalid",
        "title-invalid",
      ]),
    );
  });
});

describe("mandatory authoring-task references", () => {
  it("publishes unique project references without changing existing materialisation bytes", () => {
    const catalog = projectWideAuthoringTaskCatalog();
    expect(catalog.map(({ reference }) => reference)).toEqual([
      "wpm:project:set-metadata",
      "wpm:project:confirm-target-agents",
      "wpm:project:verify-manifest",
      "wpm:project:verify-scope-aliases",
      "wpm:project:verify-front-door",
      "wpm:project:verify-helpers-and-advisors",
      "wpm:project:bump-release-version",
      "wpm:project:build-dry-run",
    ]);
    expect(new Set(catalog.map(({ reference }) => reference))).toHaveLength(catalog.length);
    expect(projectWideAuthoringTasks()).toEqual(
      catalog.map(({ title, acceptanceCriteria }) => ({ title, acceptanceCriteria })),
    );
  });

  it("publishes unique request-applicable bundle references and keeps advisor conditional", () => {
    const withoutAdvisor = perBundleAuthoringTaskCatalog("demo", { advisor: false });
    const withAdvisor = perBundleAuthoringTaskCatalog("demo", { advisor: true });
    expect(withoutAdvisor).toHaveLength(11);
    expect(withAdvisor).toHaveLength(12);
    expect(withoutAdvisor.some(({ reference }) => reference.includes("advisor"))).toBe(false);
    expect(withAdvisor.map(({ reference }) => reference)).toContain(
      "wpm:bundle:write-advisor-content",
    );
    expect(new Set(withAdvisor.map(({ reference }) => reference))).toHaveLength(withAdvisor.length);
    expect(perBundleAuthoringTasks("demo", { advisor: true })).toEqual(
      withAdvisor.map(({ title, acceptanceCriteria }) => ({ title, acceptanceCriteria })),
    );
  });
});
