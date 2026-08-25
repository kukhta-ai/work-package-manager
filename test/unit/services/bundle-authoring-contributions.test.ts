import { describe, expect, it } from "vitest";
import {
  BUNDLE_AUTHORING_CONTRIBUTIONS_PATH,
  type BundleAuthoringContributions,
  canonicalBundleAuthoringTaskSource,
  createEmptyBundleAuthoringContributions,
  parseBundleAuthoringContributions,
  serializeBundleAuthoringContributions,
} from "../../../src/core/services/bundle-authoring-contributions.js";
import { UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES } from "../../../src/core/services/bundle-authoring-task-plan.js";

const PRODUCER = { source: "built-in", scope: "bundle", name: "default" } as const;

function state(): BundleAuthoringContributions {
  return {
    schemaVersion: 1,
    defaultContribution: {
      scaffoldSha256: "a".repeat(64),
      contribution: {
        status: "source",
        producer: PRODUCER,
        source: {
          revision: "r2",
          tasks: [
            {
              key: "configure",
              title: "Configure {{wpm.bundle.id}}",
              "acceptance-criteria": ["{{wpm.bundle.id}} is configured"],
              "depends-on": ["wpm:bundle:plan"],
            },
          ],
        },
      },
    },
    bundles: [
      {
        id: "web",
        contribution: {
          status: "tasks",
          producer: PRODUCER,
          revision: "r2",
          tasks: [
            {
              identity: "template:built-in:bundle:default@r2:configure#bundle:web",
              key: "configure",
              title: "Configure web",
              acceptanceCriteria: ["web is configured"],
              dependencyIdentities: ["wpm:bundle:plan#bundle:web"],
              labels: [
                "wpm:template-task",
                "wpm:template-origin:built-in:bundle:default",
                "wpm:template-revision:r2",
                "wpm:template-key:configure",
                "wpm:bundle:web",
              ],
            },
          ],
        },
      },
      {
        id: "worker",
        contribution: { status: "none", producer: PRODUCER },
      },
    ],
  };
}

function withDefaultTasks(tasks: readonly unknown[]): BundleAuthoringContributions {
  const value = structuredClone(state());
  const selection = value.defaultContribution;
  if (selection === null || selection.contribution.status !== "source") {
    throw new Error("fixture default contribution is not a source");
  }
  return {
    ...value,
    defaultContribution: {
      ...selection,
      contribution: {
        ...selection.contribution,
        source: { ...selection.contribution.source, tasks },
      },
    },
  };
}

function parses(value: unknown): boolean {
  return parseBundleAuthoringContributions(`${JSON.stringify(value, null, 2)}\n`).ok;
}

describe("bundle authoring contribution state", () => {
  it("uses one authoring-only workspace-root path and canonical newline-terminated bytes", () => {
    expect(BUNDLE_AUTHORING_CONTRIBUTIONS_PATH).toBe(".wpm-bundle-authoring.json");
    const text = serializeBundleAuthoringContributions(state());
    expect(text.endsWith("\n")).toBe(true);
    expect(parseBundleAuthoringContributions(text)).toEqual({ ok: true, value: state() });
  });

  it("constructs an empty legacy-compatible record without inventing a default", () => {
    const value = createEmptyBundleAuthoringContributions();
    expect(value).toEqual({ schemaVersion: 1, defaultContribution: null, bundles: [] });
    expect(parseBundleAuthoringContributions(serializeBundleAuthoringContributions(value))).toEqual(
      {
        ok: true,
        value,
      },
    );
  });

  it("rejects the default scaffold namespace as a concrete bundle contribution", () => {
    expect(
      parses({
        schemaVersion: 1,
        defaultContribution: null,
        bundles: [
          {
            id: "bundle-template",
            contribution: { status: "none", producer: PRODUCER },
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects noncanonical bytes, unknown fields, duplicate/out-of-order bundles, and task identity drift", () => {
    const canonical = state();
    const cases: unknown[] = [
      { ...canonical, extra: true },
      {
        ...canonical,
        defaultContribution:
          canonical.defaultContribution === null
            ? null
            : {
                ...canonical.defaultContribution,
                contribution: {
                  ...canonical.defaultContribution.contribution,
                  producer: { ...PRODUCER, name: "1default" },
                },
              },
      },
      {
        ...canonical,
        bundles: [{ id: "new", contribution: { status: "none", producer: PRODUCER } }],
      },
      { ...canonical, bundles: [...canonical.bundles, canonical.bundles[0]] },
      { ...canonical, bundles: [...canonical.bundles].reverse() },
      {
        ...canonical,
        bundles: canonical.bundles.map((bundle) =>
          bundle.id === "web"
            ? {
                ...bundle,
                contribution: {
                  ...bundle.contribution,
                  tasks:
                    bundle.contribution.status === "tasks"
                      ? bundle.contribution.tasks.map((task) => ({
                          ...task,
                          identity: task.identity.replace("#bundle:web", "#bundle:other"),
                        }))
                      : [],
                },
              }
            : bundle,
        ),
      },
    ];
    for (const value of cases) {
      const text = `${JSON.stringify(value, null, 2)}\n`;
      expect(parseBundleAuthoringContributions(text).ok).toBe(false);
    }
    expect(parseBundleAuthoringContributions(JSON.stringify(canonical)).ok).toBe(false);
  });

  it("rejects a rendered title reserved by two concrete bundle records", () => {
    const canonical = state();
    const web = canonical.bundles.find(({ id }) => id === "web");
    if (web?.contribution.status !== "tasks") throw new Error("fixture task contribution missing");
    const duplicateTitle = {
      id: "worker",
      contribution: {
        ...web.contribution,
        tasks: web.contribution.tasks.map((task) => ({
          ...task,
          identity: task.identity.replace("#bundle:web", "#bundle:worker"),
          dependencyIdentities: task.dependencyIdentities.map((identity) =>
            identity.replace("#bundle:web", "#bundle:worker"),
          ),
          labels: task.labels.map((label) =>
            label === "wpm:bundle:web" ? "wpm:bundle:worker" : label,
          ),
        })),
      },
    };
    expect(parses({ ...canonical, bundles: [web, duplicateTitle] })).toBe(false);
  });

  it("rejects a default source task whose otherwise-valid fields are not in producer-image order", () => {
    const reordered = withDefaultTasks([
      {
        title: "Configure {{wpm.bundle.id}}",
        key: "configure",
        "depends-on": ["wpm:bundle:plan"],
        "acceptance-criteria": ["{{wpm.bundle.id}} is configured"],
      },
    ]);
    expect(parses(reordered)).toBe(false);
  });

  it("builds canonical durable source bytes from valid reordered template data", () => {
    const source = canonicalBundleAuthoringTaskSource({
      revision: "r2",
      tasks: [
        {
          title: "Configure {{wpm.bundle.id}}",
          key: "configure",
          "depends-on": ["wpm:bundle:plan"],
          "acceptance-criteria": ["{{wpm.bundle.id}} is configured"],
        },
      ],
    });
    expect(source).toEqual({
      revision: "r2",
      tasks: [
        {
          key: "configure",
          title: "Configure {{wpm.bundle.id}}",
          "acceptance-criteria": ["{{wpm.bundle.id}} is configured"],
          "depends-on": ["wpm:bundle:plan"],
        },
      ],
    });
    const canonical = state();
    if (canonical.defaultContribution?.contribution.status !== "source" || source === undefined) {
      throw new Error("fixture default contribution is not a source");
    }
    const built = {
      ...canonical,
      defaultContribution: {
        ...canonical.defaultContribution,
        contribution: { ...canonical.defaultContribution.contribution, source },
      },
    };
    expect(parseBundleAuthoringContributions(serializeBundleAuthoringContributions(built))).toEqual(
      { ok: true, value: built },
    );
  });

  it("rejects executable/native-path-shaped source data and a non-producer-image label set", () => {
    const canonical = state();
    const unsafeSource = structuredClone(canonical);
    if (unsafeSource.defaultContribution?.contribution.status === "source") {
      (unsafeSource.defaultContribution.contribution.source as { tasks: unknown }).tasks = [
        { key: "run", title: "Run", command: "rm -rf /" },
      ];
    }
    expect(parseBundleAuthoringContributions(`${JSON.stringify(unsafeSource, null, 2)}\n`).ok).toBe(
      false,
    );

    const badLabels = structuredClone(canonical);
    const bundle = badLabels.bundles[0];
    if (bundle?.contribution.status === "tasks") {
      (bundle.contribution.tasks[0]?.labels as string[]).push("wpm:template-key:other");
    }
    expect(parseBundleAuthoringContributions(`${JSON.stringify(badLabels, null, 2)}\n`).ok).toBe(
      false,
    );
  });

  it("re-inspects a stored default source with symbolic bundle context and unconditional references", () => {
    const valid = withDefaultTasks([
      {
        key: "configure",
        title: "Configure {{wpm.bundle.id}} for {{wpm.project.name}}",
        "acceptance-criteria": ["Version {{wpm.bundle.version}} is configured"],
        "depends-on": [...UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES],
      },
    ]);
    expect(parses(valid)).toBe(true);

    const invalidSources = [
      withDefaultTasks([
        {
          key: "unsafe",
          title: "Unsafe\u001btitle",
          "acceptance-criteria": ["An outcome exists"],
        },
      ]),
      withDefaultTasks([
        {
          key: "unsupported-context",
          title: "Use {{wpm.bundle.path}}",
          "acceptance-criteria": ["An outcome exists"],
        },
      ]),
      withDefaultTasks([
        {
          key: "invalid-dependency",
          title: "Invalid dependency",
          "acceptance-criteria": ["An outcome exists"],
          "depends-on": [" self:missing"],
        },
      ]),
      withDefaultTasks([
        {
          key: "unresolved-dependency",
          title: "Unresolved dependency",
          "acceptance-criteria": ["An outcome exists"],
          "depends-on": ["self:missing"],
        },
      ]),
      withDefaultTasks([
        {
          key: "advisor-dependent",
          title: "Advisor dependent",
          "acceptance-criteria": ["An outcome exists"],
          "depends-on": ["wpm:bundle:write-advisor-content"],
        },
      ]),
      withDefaultTasks([
        {
          key: "first",
          title: "First",
          "acceptance-criteria": ["First exists"],
          "depends-on": ["self:second"],
        },
        {
          key: "second",
          title: "Second",
          "acceptance-criteria": ["Second exists"],
          "depends-on": ["self:first"],
        },
      ]),
    ];
    for (const value of invalidSources) expect(parses(value)).toBe(false);
  });
});
