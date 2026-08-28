import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { BundleAuthoringPreflightError, MutationFailure } from "../../../src/core/errors.js";
import {
  bundleScaffoldSha256,
  createBundleWithAuthoring,
  enableBundleWithAuthoring,
} from "../../../src/core/operations/bundle-authoring.js";
import {
  BUNDLE_AUTHORING_CONTRIBUTIONS_PATH,
  type BundleAuthoringContributions,
  parseBundleAuthoringContributions,
  serializeBundleAuthoringContributions,
} from "../../../src/core/services/bundle-authoring-contributions.js";
import { toPosix } from "../../../src/util/posix-path.js";

const WORKSPACE = "/workspace";
const ROOT = `${WORKSPACE}/wip`;
const AUTHORING = `${WORKSPACE}/.authoring-backlog`;
const BUILTIN = "/package/templates";

function isPortableAbsolute(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path);
}

class AlternateAbsoluteAliasObservationFileSystem extends MemoryFileSystem {
  override inspectPath(...args: Parameters<MemoryFileSystem["inspectPath"]>) {
    const inspected = super.inspectPath(...args);
    if (inspected.kind !== "symbolic-link" || !isPortableAbsolute(inspected.target)) {
      return inspected;
    }
    return {
      kind: "symbolic-link" as const,
      target:
        process.platform === "win32"
          ? inspected.target.replaceAll("\\", "/")
          : inspected.target.replaceAll("/", "\\"),
    };
  }
}

class DifferentAbsoluteAliasObservationFileSystem extends MemoryFileSystem {
  override inspectPath(...args: Parameters<MemoryFileSystem["inspectPath"]>) {
    const inspected = super.inspectPath(...args);
    if (inspected.kind !== "symbolic-link" || !isPortableAbsolute(inspected.target)) {
      return inspected;
    }
    return { kind: "symbolic-link" as const, target: `${inspected.target}-different` };
  }
}

class AlternateRelativeAliasObservationFileSystem extends MemoryFileSystem {
  override inspectPath(...args: Parameters<MemoryFileSystem["inspectPath"]>) {
    const inspected = super.inspectPath(...args);
    if (inspected.kind !== "symbolic-link" || isPortableAbsolute(inspected.target)) {
      return inspected;
    }
    return { kind: "symbolic-link" as const, target: inspected.target.replaceAll("-", "\\") };
  }
}

class RecordingFileSystem extends MemoryFileSystem {
  readonly mutationCalls: string[] = [];
  private recording = false;

  startRecording(): void {
    this.mutationCalls.length = 0;
    this.recording = true;
  }

  private record(name: string): void {
    if (this.recording) this.mutationCalls.push(name);
  }

  override write(...args: Parameters<MemoryFileSystem["write"]>): void {
    this.record("write");
    super.write(...args);
  }

  override writeConfined(...args: Parameters<MemoryFileSystem["writeConfined"]>): void {
    this.record("writeConfined");
    super.writeConfined(...args);
  }

  override makeDirectories(...args: Parameters<MemoryFileSystem["makeDirectories"]>): void {
    this.record("makeDirectories");
    super.makeDirectories(...args);
  }

  override copyTree(...args: Parameters<MemoryFileSystem["copyTree"]>): void {
    this.record("copyTree");
    super.copyTree(...args);
  }

  override remove(...args: Parameters<MemoryFileSystem["remove"]>): void {
    this.record("remove");
    super.remove(...args);
  }

  override removeConfined(...args: Parameters<MemoryFileSystem["removeConfined"]>): void {
    this.record("removeConfined");
    super.removeConfined(...args);
  }

  override removeFileConfined(...args: Parameters<MemoryFileSystem["removeFileConfined"]>): void {
    this.record("removeFileConfined");
    super.removeFileConfined(...args);
  }

  override ensureAlias(...args: Parameters<MemoryFileSystem["ensureAlias"]>) {
    this.record("ensureAlias");
    return super.ensureAlias(...args);
  }
}

class RecordingBacklog extends FakeBacklog {
  readonly mutationCalls: string[] = [];
  private recording = false;

  startRecording(): void {
    this.mutationCalls.length = 0;
    this.recording = true;
  }

  private record(name: string): void {
    if (this.recording) this.mutationCalls.push(name);
  }

  override init(...args: Parameters<FakeBacklog["init"]>): void {
    this.record("init");
    super.init(...args);
  }

  override createTask(...args: Parameters<FakeBacklog["createTask"]>) {
    this.record("createTask");
    return super.createTask(...args);
  }

  override editTask(...args: Parameters<FakeBacklog["editTask"]>): void {
    this.record("editTask");
    super.editTask(...args);
  }

  override archiveTask(...args: Parameters<FakeBacklog["archiveTask"]>): void {
    this.record("archiveTask");
    super.archiveTask(...args);
  }
}

function seed(
  fs: MemoryFileSystem = new MemoryFileSystem(),
  backlog: FakeBacklog = new FakeBacklog(),
): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
} {
  fs.write(
    `${ROOT}/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets: []\nbundles: []\n",
  );
  fs.makeDirectories(`${ROOT}/installer-skills`);
  fs.makeDirectories(AUTHORING);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n",
  );
  fs.write(
    `${BUILTIN}/bundle/default/template.yml`,
    [
      "name: default",
      "scope: bundle",
      'revision: "r2"',
      "authoring-tasks:",
      "  - key: configure",
      '    title: "Configure {{wpm.bundle.id}}"',
      "    acceptance-criteria:",
      '      - "{{wpm.bundle.id}} is configured"',
      "    depends-on:",
      "      - wpm:bundle:plan",
      "  - key: verify",
      '    title: "Verify {{wpm.bundle.id}}"',
      "    acceptance-criteria:",
      '      - "{{wpm.bundle.id}} is verified"',
      "    depends-on:",
      "      - self:configure",
      "",
    ].join("\n"),
  );
  fs.write(
    `${BUILTIN}/bundle/default/files/install-backlog/config.yml`,
    "task_prefix: {{bundle-id}}\n",
  );
  fs.write(`${BUILTIN}/bundle/default/files/installer-skills/.keep`, "");
  return { fs, backlog };
}

describe("bundle authoring planned operations", () => {
  it("accepts a separator-dialect-equivalent absolute alias observation", () => {
    const fs = new AlternateAbsoluteAliasObservationFileSystem();
    const backlog = new FakeBacklog();
    seed(fs, backlog);
    fs.write(
      `${ROOT}/manifest.yml`,
      "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles: []\n",
    );

    expect(() =>
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", disabled: true, advisor: false, templateName: "default" },
      ),
    ).not.toThrow();
    expect(() =>
      enableBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      ),
    ).not.toThrow();
  });

  it("rejects a different absolute alias observation", () => {
    const fs = new DifferentAbsoluteAliasObservationFileSystem();
    const backlog = new FakeBacklog();
    seed(fs, backlog);
    fs.write(
      `${ROOT}/manifest.yml`,
      "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles: []\n",
    );

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("derived-alias:.claude/skills");
    }
  });

  it("keeps relative alias observations byte-exact instead of normalizing separators", () => {
    const fs = new AlternateRelativeAliasObservationFileSystem();
    const backlog = new FakeBacklog();
    seed(fs, backlog);

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-backlog-alias");
    }
  });

  it("rejects the build-reserved bundle-template id before occupying the default scaffold boundary", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "bundle-template", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("bundle-id-reserved-scaffold");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/bundle-template`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("rejects enabling a legacy bundle from the build-reserved default scaffold boundary", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(
      `${ROOT}/bundles/bundle-template/bundle.yml`,
      "id: bundle-template\nversion: 0.1.0\nsummary: reserved\nconfirmation: safe\nrequires: {}\n",
    );
    fs.write(
      `${ROOT}/bundles/bundle-template/install-backlog/config.yml`,
      "task_prefix: reserved\n",
    );
    fs.makeDirectories(`${ROOT}/bundles/bundle-template/installer-skills`);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      enableBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "bundle-template", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("bundle-id-reserved-scaffold");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${ROOT}/bundles/bundle-template/bundle.yml`)).toContain("id: bundle-template");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("uses one normalized bundle version for the descriptor, scaffold, and recorded task context", () => {
    const { fs, backlog } = seed();
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      [
        "name: default",
        "scope: bundle",
        'revision: "r-version"',
        "authoring-tasks:",
        "  - key: configure-version",
        '    title: "Configure {{wpm.bundle.id}} at {{wpm.bundle.version}}"',
        "    acceptance-criteria:",
        '      - "{{wpm.bundle.id}} uses {{wpm.bundle.version}}"',
        "",
      ].join("\n"),
    );
    fs.write(`${BUILTIN}/bundle/default/files/VERSION.txt`, "{{version}}\n");

    createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", version: "v1.2.3", advisor: false, templateName: "default" },
    );

    expect(fs.read(`${ROOT}/bundles/web/bundle.yml`)).toContain("version: 1.2.3");
    expect(fs.read(`${ROOT}/bundles/web/VERSION.txt`)).toBe("1.2.3\n");
    const task = backlog
      .listTasks(AUTHORING)
      .find(({ title }) => title === "Configure web at 1.2.3");
    expect(task).toBeDefined();
    if (task !== undefined) {
      expect(
        backlog.readTask(AUTHORING, task.id).acceptanceCriteria.map(({ text }) => text),
      ).toEqual(["web uses 1.2.3"]);
    }
  });

  it("uses live author-edited default scaffold bytes and refreshes their binding with the recorded task contribution", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(
      `${ROOT}/bundles/bundle-template/install-backlog/config.yml`,
      "task_prefix: {{bundle-id}}\n",
    );
    fs.write(`${ROOT}/bundles/bundle-template/installer-skills/.keep`, "");
    fs.write(
      `${ROOT}/bundles/bundle-template/payload/files/MARKER-{{bundle-id}}.txt`,
      "live default for {{bundle-id}}\n",
    );
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: {
        scaffoldSha256: "0".repeat(64),
        contribution: {
          status: "source",
          producer: { source: "project-local", scope: "bundle", name: "bundle-template" },
          source: {
            revision: "recorded-r1",
            tasks: [
              {
                key: "recorded-only",
                title: "Use recorded contribution for {{wpm.bundle.id}}",
                "acceptance-criteria": [
                  "{{wpm.bundle.id}} uses only its durable recorded contribution",
                ],
                "depends-on": ["wpm:bundle:plan"],
              },
            ],
          },
        },
      },
      bundles: [],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", advisor: false },
    );

    expect(fs.read(`${ROOT}/bundles/web/payload/files/MARKER-web.txt`)).toBe(
      "live default for web\n",
    );
    const parsed = parseBundleAuthoringContributions(fs.read(recordPath));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.defaultContribution?.scaffoldSha256).toBe(
        bundleScaffoldSha256([
          { path: "install-backlog/config.yml", content: "task_prefix: {{bundle-id}}\n" },
          { path: "installer-skills/.keep", content: "" },
          {
            path: "payload/files/MARKER-{{bundle-id}}.txt",
            content: "live default for {{bundle-id}}\n",
          },
        ]),
      );
      expect(parsed.value.defaultContribution?.contribution).toEqual(
        recorded.defaultContribution?.contribution,
      );
      expect(parsed.value.bundles).toMatchObject([
        {
          id: "web",
          contribution: {
            status: "tasks",
            producer: { source: "project-local", scope: "bundle", name: "bundle-template" },
            revision: "recorded-r1",
            tasks: [{ key: "recorded-only", title: "Use recorded contribution for web" }],
          },
        },
      ]);
    }
    const titles = backlog.listTasks(AUTHORING).map(({ title }) => title);
    expect(titles).toContain("Use recorded contribution for web");
    expect(titles).not.toContain("Configure web");
    expect(titles).not.toContain("Verify web");
    const recordedTask = backlog
      .listTasks(AUTHORING)
      .find(({ title }) => title === "Use recorded contribution for web");
    expect(backlog.readTask(AUTHORING, recordedTask?.id ?? "").labels).toEqual(
      expect.arrayContaining([
        "wpm:template-origin:project-local:bundle:bundle-template",
        "wpm:template-revision:recorded-r1",
        "wpm:template-key:recorded-only",
        "wpm:bundle:web",
      ]),
    );
  });

  it("aggregates a denied Backlog create-lock capability before any planned missing-task effect", () => {
    class DeniedBacklogCreateLockFileSystem extends RecordingFileSystem {
      override inspectMutationCapability(
        path: Parameters<MemoryFileSystem["inspectMutationCapability"]>[0],
      ) {
        if (toPosix(path) === toPosix(`${AUTHORING}/backlog/.locks/create`)) {
          return { capable: false as const, reason: "injected create-lock denial" };
        }
        return super.inspectMutationCapability(path);
      }
    }

    const fs = new DeniedBacklogCreateLockFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "bundle-mutation-unavailable",
            surface: "backlog",
            path: `${AUTHORING}/backlog/.locks/create`,
          }),
        ]),
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(fs.inspectPath(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`).kind).toBe(
      "missing",
    );
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("aggregates missing-task inactive ambiguity and capability denial with an active definition mismatch", () => {
    class DeniedBacklogCreateLockFileSystem extends RecordingFileSystem {
      override inspectMutationCapability(
        path: Parameters<MemoryFileSystem["inspectMutationCapability"]>[0],
      ) {
        if (toPosix(path) === toPosix(`${AUTHORING}/backlog/.locks/create`)) {
          return { capable: false as const, reason: "injected create-lock denial" };
        }
        return super.inspectMutationCapability(path);
      }
    }

    const fs = new DeniedBacklogCreateLockFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    backlog.createTask(AUTHORING, {
      title: "Plan bundle web",
      acceptanceCriteria: ["drifted active definition"],
    });
    const inactive = backlog.createTask(AUTHORING, {
      title: "Archived possible owner",
      acceptanceCriteria: ["inactive evidence remains ambiguous"],
    });
    backlog.archiveTask(AUTHORING, inactive.id);
    const activeBefore = backlog.taskDetail(AUTHORING, "authoring-1");
    const inactiveBefore = backlog.taskDetail(AUTHORING, inactive.id);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "existing-definition-mismatch" }),
          expect.objectContaining({ code: "inactive-task-ownership-ambiguous" }),
          expect.objectContaining({
            code: "bundle-mutation-unavailable",
            path: `${AUTHORING}/backlog/.locks/create`,
          }),
        ]),
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.taskDetail(AUTHORING, "authoring-1")).toEqual(activeBefore);
    expect(backlog.taskDetail(AUTHORING, inactive.id)).toEqual(inactiveBefore);
  });

  it("rejects a drifted managed Backlog configuration before any bundle or task effect", () => {
    class DriftedConfigurationBacklog extends RecordingBacklog {
      override inspectTaskInventory(...args: Parameters<RecordingBacklog["inspectTaskInventory"]>) {
        return {
          ...super.inspectTaskInventory(...args),
          configurationMatchesFreshDefaults: false,
        };
      }
    }

    const fs = new RecordingFileSystem();
    const backlog = new DriftedConfigurationBacklog();
    seed(fs, backlog);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("backlog-configuration-mismatch");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("rejects duplicate active Backlog IDs before any bundle or task effect", () => {
    class DuplicateActiveIdBacklog extends RecordingBacklog {
      override listTasks(...args: Parameters<RecordingBacklog["listTasks"]>) {
        const listed = super.listTasks(...args);
        return listed.length === 0 ? listed : [...listed, listed[0] as (typeof listed)[number]];
      }

      override inspectTaskInventory(...args: Parameters<RecordingBacklog["inspectTaskInventory"]>) {
        const inventory = super.inspectTaskInventory(...args);
        return {
          ...inventory,
          activeEntries:
            inventory.activeEntries.length === 0
              ? inventory.activeEntries
              : [...inventory.activeEntries, inventory.activeEntries[0] as string],
        };
      }
    }

    const fs = new RecordingFileSystem();
    const backlog = new DuplicateActiveIdBacklog();
    seed(fs, backlog);
    backlog.createTask(AUTHORING, {
      title: "Unrelated authoring work",
      acceptanceCriteria: ["The unrelated work remains unchanged"],
    });
    const taskBefore = backlog.taskDetail(AUTHORING, "authoring-1");
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain(
        "backlog-active-inventory-ambiguous",
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.taskDetail(AUTHORING, "authoring-1")).toEqual(taskBefore);
  });

  it("rejects unique task summaries that collapse to one full-record identity before any effect", () => {
    class CollapsedReadIdentityBacklog extends RecordingBacklog {
      override readTask(...args: Parameters<RecordingBacklog["readTask"]>) {
        const record = super.readTask(...args);
        if (record.id !== "authoring-2") return record;
        return { ...record, id: "authoring-1" };
      }
    }

    const fs = new RecordingFileSystem();
    const backlog = new CollapsedReadIdentityBacklog();
    seed(fs, backlog);
    backlog.createTask(AUTHORING, {
      title: "First unrelated task",
      acceptanceCriteria: ["First remains unchanged"],
    });
    backlog.createTask(AUTHORING, {
      title: "Second unrelated task",
      acceptanceCriteria: ["Second remains unchanged"],
    });
    const firstBefore = backlog.taskDetail(AUTHORING, "authoring-1");
    const secondBefore = backlog.taskDetail(AUTHORING, "authoring-2");
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain(
        "backlog-active-inventory-ambiguous",
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.taskDetail(AUTHORING, "authoring-1")).toEqual(firstBefore);
    expect(backlog.taskDetail(AUTHORING, "authoring-2")).toEqual(secondBefore);
  });

  it("aggregates an ambiguous implicit scaffold with its readable default-source title conflict", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(`${ROOT}/bundles/bundle-template`, "not a directory\n");
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: {
        scaffoldSha256: "0".repeat(64),
        contribution: {
          status: "source",
          producer: { source: "project-local", scope: "bundle", name: "bundle-template" },
          source: {
            revision: "r-conflict",
            tasks: [
              {
                key: "duplicate-plan",
                title: "Plan bundle {{wpm.bundle.id}}",
                "acceptance-criteria": ["{{wpm.bundle.id}} has a duplicate plan"],
              },
            ],
          },
        },
      },
      bundles: [],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    const recordBefore = fs.read(recordPath);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "bundle-template-destination-ambiguous",
          "mandatory-title-collision",
        ]),
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(fs.read(`${ROOT}/bundles/bundle-template`)).toBe("not a directory\n");
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("rejects a new rendered task title already reserved by another recorded bundle", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: null,
      bundles: [
        {
          id: "api",
          contribution: {
            status: "tasks",
            producer: { source: "built-in", scope: "bundle", name: "default" },
            revision: "r2",
            tasks: [
              {
                identity: "template:built-in:bundle:default@r2:configure#bundle:api",
                key: "configure",
                title: "Configure web",
                acceptanceCriteria: ["The recorded API contribution reserves this title"],
                dependencyIdentities: [],
                labels: [
                  "wpm:template-task",
                  "wpm:template-origin:built-in:bundle:default",
                  "wpm:template-revision:r2",
                  "wpm:template-key:configure",
                  "wpm:bundle:api",
                ],
              },
            ],
          },
        },
      ],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    const recordBefore = fs.read(recordPath);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "recorded-bundle-title-conflict",
            surface: "authoring-task-plan",
            path: "Configure web",
          }),
        ]),
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("rejects a new mandatory title already reserved by another recorded bundle", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: null,
      bundles: [
        {
          id: "api",
          contribution: {
            status: "tasks",
            producer: { source: "built-in", scope: "bundle", name: "default" },
            revision: "r2",
            tasks: [
              {
                identity: "template:built-in:bundle:default@r2:configure#bundle:api",
                key: "configure",
                title: "Plan bundle web",
                acceptanceCriteria: ["The recorded API contribution reserves this title"],
                dependencyIdentities: [],
                labels: [
                  "wpm:template-task",
                  "wpm:template-origin:built-in:bundle:default",
                  "wpm:template-revision:r2",
                  "wpm:template-key:configure",
                  "wpm:bundle:api",
                ],
              },
            ],
          },
        },
      ],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    const recordBefore = fs.read(recordPath);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("recorded-bundle-title-conflict");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("rejects a new template title reserved by another bundle's unconditional mandatory plan", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      [
        "name: default",
        "scope: bundle",
        'revision: "r-conflict"',
        "authoring-tasks:",
        "  - key: collide-with-api",
        '    title: "Plan bundle api"',
        "    acceptance-criteria:",
        "      - The title remains globally unambiguous",
        "",
      ].join("\n"),
    );
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: null,
      bundles: [
        {
          id: "api",
          contribution: {
            status: "none",
            producer: { source: "built-in", scope: "bundle", name: "default" },
          },
        },
      ],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    const recordBefore = fs.read(recordPath);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("recorded-bundle-title-conflict");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("creates a disabled bundle with complete mandatory + template work and a concrete root record", () => {
    const { fs, backlog } = seed();
    const result = createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", version: "1.2.3", disabled: true, advisor: false, templateName: "default" },
    );
    expect(fs.exists(`${ROOT}/bundles/web/bundle.yml`)).toBe(true);
    expect(fs.read(`${ROOT}/manifest.yml`)).toContain("bundles: []");
    expect(fs.exists(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`)).toBe(true);
    expect(fs.exists(`${ROOT}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`)).toBe(false);
    const tasks = backlog.listTasks(AUTHORING);
    expect(tasks.map(({ title }) => title)).toEqual(
      expect.arrayContaining(["Plan bundle web", "Configure web", "Verify web"]),
    );
    const configure = tasks.find(({ title }) => title === "Configure web");
    const verify = tasks.find(({ title }) => title === "Verify web");
    expect(backlog.readTask(AUTHORING, configure?.id ?? "").labels).toContain(
      "wpm:template-key:configure",
    );
    expect(backlog.readTask(AUTHORING, verify?.id ?? "").dependencies).toEqual([configure?.id]);
    expect(result.materialisedTaskTitles).toContain("Configure web");
  });

  it("enables from the concrete record after source removal and preserves matching human state", () => {
    const { fs, backlog } = seed();
    createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", disabled: true, advisor: false, templateName: "default" },
    );
    const configure = backlog.listTasks(AUTHORING).find(({ title }) => title === "Configure web");
    if (configure === undefined) throw new Error("fixture task missing");
    backlog.editTask(AUTHORING, configure.id, {
      status: "In Progress",
      checkAcceptanceCriteria: [1],
      notes: "human progress",
      addLabels: ["human:keep"],
    });
    fs.remove(`${BUILTIN}/bundle/default`);
    const beforeCount = backlog.listTasks(AUTHORING).length;
    const result = enableBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", advisor: false },
    );
    expect(backlog.listTasks(AUTHORING)).toHaveLength(beforeCount);
    expect(backlog.readTask(AUTHORING, configure.id)).toMatchObject({
      status: "In Progress",
      labels: expect.arrayContaining(["human:keep", "wpm:template-key:configure"]),
      extraSections: [{ heading: "Implementation Notes", content: "human progress" }],
    });
    expect(result.materialisedTaskTitles).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toContain("web");
  });

  it("rejects enable when another recorded bundle reserves a missing mandatory title", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(
      `${ROOT}/bundles/web/bundle.yml`,
      "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
    );
    fs.write(`${ROOT}/bundles/web/install-backlog/config.yml`, "task_prefix: web\n");
    fs.makeDirectories(`${ROOT}/bundles/web/installer-skills`);
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: null,
      bundles: [
        {
          id: "api",
          contribution: {
            status: "tasks",
            producer: { source: "built-in", scope: "bundle", name: "default" },
            revision: "r2",
            tasks: [
              {
                identity: "template:built-in:bundle:default@r2:configure#bundle:api",
                key: "configure",
                title: "Plan bundle web",
                acceptanceCriteria: ["The recorded API contribution reserves this title"],
                dependencyIdentities: [],
                labels: [
                  "wpm:template-task",
                  "wpm:template-origin:built-in:bundle:default",
                  "wpm:template-revision:r2",
                  "wpm:template-key:configure",
                  "wpm:bundle:api",
                ],
              },
            ],
          },
        },
        {
          id: "web",
          contribution: {
            status: "none",
            producer: { source: "built-in", scope: "bundle", name: "default" },
          },
        },
      ],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    fs.write(recordPath, serializeBundleAuthoringContributions(recorded));
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    const recordBefore = fs.read(recordPath);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      enableBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("recorded-bundle-title-conflict");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("aggregates destination, record, and Backlog blockers without mutation", () => {
    const { fs, backlog } = seed();
    fs.write(`${ROOT}/bundles/web/USER.txt`, "owned");
    fs.write(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`, "{}\n");
    backlog.setAvailability({ available: false, reason: "missing executable" });
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    expect(() =>
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      ),
    ).toThrow(BundleAuthoringPreflightError);
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BundleAuthoringPreflightError);
      if (error instanceof BundleAuthoringPreflightError) {
        expect(error.blockers.map(({ code }) => code)).toEqual(
          expect.arrayContaining([
            "bundle-destination-occupied",
            "contribution-record-invalid",
            "backlog-unavailable",
          ]),
        );
      }
    }
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${ROOT}/bundles/web/USER.txt`)).toBe("owned");
  });

  it("aggregates an invalid enabled descriptor with an independent recorded-task blocker", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", disabled: true, advisor: false, templateName: "default" },
    );
    const manifestPath = `${ROOT}/manifest.yml`;
    fs.write(manifestPath, fs.read(manifestPath).replace("bundles: []", "bundles:\n  - api"));
    fs.write(
      `${ROOT}/bundles/api/bundle.yml`,
      "id: other\nversion: 0.1.0\nsummary: other bundle\nconfirmation: safe\nrequires: {}\n",
    );
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    const parsed = parseBundleAuthoringContributions(fs.read(recordPath));
    if (!parsed.ok) throw new Error(parsed.reason);
    const invalidState: BundleAuthoringContributions = {
      ...parsed.value,
      bundles: parsed.value.bundles.map((entry) => ({
        ...entry,
        contribution:
          entry.id === "web" && entry.contribution.status === "tasks"
            ? {
                ...entry.contribution,
                tasks: entry.contribution.tasks.map((task, index) =>
                  index === 0
                    ? {
                        ...task,
                        dependencyIdentities: [
                          "template:built-in:bundle:default@r2:missing#bundle:web",
                        ],
                      }
                    : task,
                ),
              }
            : entry.contribution,
      })),
    };
    fs.write(recordPath, serializeBundleAuthoringContributions(invalidState));
    const manifestBefore = fs.read(manifestPath);
    const recordBefore = fs.read(recordPath);
    const taskIdsBefore = backlog.listTasks(AUTHORING).map(({ id }) => id);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      enableBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toEqual(
        expect.arrayContaining(["enabled-bundle-snapshot-invalid", "dependency-unresolved"]),
      );
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(manifestPath)).toBe(manifestBefore);
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(backlog.listTasks(AUTHORING).map(({ id }) => id)).toEqual(taskIdsBefore);
  });

  it("rejects a Backlog race at the first frozen precondition before bundle-owned effects", () => {
    class RaceBeforeFirstEffectBacklog extends FakeBacklog {
      private listCalls = 0;

      override listTasks(...args: Parameters<FakeBacklog["listTasks"]>) {
        this.listCalls += 1;
        if (this.listCalls === 2) {
          super.createTask(args[0], { title: "External concurrent task" });
        }
        return super.listTasks(...args);
      }
    }

    const backlog = new RaceBeforeFirstEffectBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-create-preconditions");
      expect(caught.completed).toEqual([]);
      expect(caught.unattempted[0]?.id).toBe("bundle-file:bundle.yml");
    }
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(fs.inspectPath(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`).kind).toBe(
      "missing",
    );
    expect(backlog.listTasks(AUTHORING).map(({ title }) => title)).toEqual([
      "External concurrent task",
    ]);
  });

  it("rejects hidden Backlog metadata drift at the full-record first-effect rebound", () => {
    class HiddenRaceBeforeFirstEffectBacklog extends FakeBacklog {
      target = "";
      private listCalls = 0;

      override listTasks(...args: Parameters<FakeBacklog["listTasks"]>) {
        this.listCalls += 1;
        if (this.listCalls === 2) {
          super.editTask(args[0], this.target, { notes: "Concurrent user note" });
        }
        return super.listTasks(...args);
      }
    }

    const backlog = new HiddenRaceBeforeFirstEffectBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    const existing = backlog.createTask(AUTHORING, {
      title: "Unrelated authoring task",
      acceptanceCriteria: ["Unrelated outcome remains true"],
    });
    backlog.target = existing.id;
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-create-preconditions");
      expect(caught.completed).toEqual([]);
    }
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`).kind).toBe("missing");
    expect(fs.inspectPath(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`).kind).toBe(
      "missing",
    );
    expect(backlog.readTask(AUTHORING, existing.id).extraSections).toEqual([
      { heading: "Implementation Notes", content: "Concurrent user note" },
    ]);
  });

  it("rejects duplicate substituted task summaries at an between-effect Backlog guard", () => {
    class DuplicateSummaryRaceBacklog extends FakeBacklog {
      private listCalls = 0;

      override listTasks(...args: Parameters<FakeBacklog["listTasks"]>) {
        this.listCalls += 1;
        const listed = super.listTasks(...args);
        return this.listCalls === 3 && listed.length >= 2
          ? [listed[0] as (typeof listed)[number], listed[0] as (typeof listed)[number]]
          : listed;
      }
    }

    const backlog = new DuplicateSummaryRaceBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    backlog.createTask(AUTHORING, { title: "Unrelated task A" });
    backlog.createTask(AUTHORING, { title: "Unrelated task B" });

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("authoring-task-plan-precondition");
      expect(caught.completed.some(({ id }) => id === "bundle-contribution-record")).toBe(true);
    }
    expect(backlog.listTasks(AUTHORING).map(({ title }) => title)).toEqual([
      "Unrelated task A",
      "Unrelated task B",
    ]);
  });

  it("rejects a created task whose full-record identity differs from its returned Backlog ID", () => {
    class CollapsedCreatedIdentityBacklog extends FakeBacklog {
      private createdId: string | undefined;
      private substituted = false;

      override createTask(...args: Parameters<FakeBacklog["createTask"]>) {
        const created = super.createTask(...args);
        this.createdId = created.id;
        return created;
      }

      override readTask(...args: Parameters<FakeBacklog["readTask"]>) {
        const record = super.readTask(...args);
        if (!this.substituted && args[1] === this.createdId) {
          this.substituted = true;
          return { ...record, id: "authoring-collapsed" };
        }
        return record;
      }
    }

    const backlog = new CollapsedCreatedIdentityBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toMatch(/^authoring-task:/u);
      expect(caught.completed.some(({ id }) => id.startsWith("authoring-task:"))).toBe(false);
    }
    expect(backlog.listTasks(AUTHORING)).toHaveLength(1);
  });

  it("rejects a create result that reuses a frozen existing Backlog ID without replacing its preimage", () => {
    class ReusedCreatedIdentityBacklog extends FakeBacklog {
      existingId = "";
      armed = false;

      override createTask(...args: Parameters<FakeBacklog["createTask"]>) {
        if (this.armed) {
          const existing = super.readTask(args[0], this.existingId);
          return { id: existing.id, title: args[1].title, status: "To Do" as const };
        }
        return super.createTask(...args);
      }
    }

    const backlog = new ReusedCreatedIdentityBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    const existing = backlog.createTask(AUTHORING, {
      title: "Unrelated authoring task",
      acceptanceCriteria: ["Unrelated outcome remains true"],
    });
    const existingBefore = backlog.readTask(AUTHORING, existing.id);
    backlog.existingId = existing.id;
    backlog.armed = true;

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toMatch(/^authoring-task:/u);
      expect(caught.completed.some(({ id }) => id.startsWith("authoring-task:"))).toBe(false);
    }
    expect(backlog.readTask(AUTHORING, existing.id)).toEqual(existingBefore);
    expect(backlog.listTasks(AUTHORING)).toHaveLength(1);
  });

  it("rechecks full Backlog records after filesystem postconditions and before reporting success", () => {
    const backlog = new FakeBacklog();
    let existingId = "";
    class FinalWindowRaceFileSystem extends MemoryFileSystem {
      armed = false;
      private injected = false;

      override read(path: string): string {
        const content = super.read(path);
        if (
          this.armed &&
          !this.injected &&
          toPosix(path) === toPosix(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`) &&
          backlog.listTasks(AUTHORING).length > 1
        ) {
          this.injected = true;
          backlog.editTask(AUTHORING, existingId, { notes: "Concurrent final-window note" });
        }
        return content;
      }
    }

    const fs = new FinalWindowRaceFileSystem();
    seed(fs, backlog);
    existingId = backlog.createTask(AUTHORING, { title: "Unrelated authoring task" }).id;
    fs.armed = true;

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-create-postcondition");
      expect(caught.unattempted).toEqual([]);
    }
    expect(backlog.readTask(AUTHORING, existingId).extraSections).toEqual([
      { heading: "Implementation Notes", content: "Concurrent final-window note" },
    ]);
  });

  it("does not publish a refreshed default binding after the live scaffold changes during apply", () => {
    class ScaffoldRaceFileSystem extends MemoryFileSystem {
      armed = false;
      private injected = false;

      override write(path: string, content: string): void {
        super.write(path, content);
        if (
          this.armed &&
          !this.injected &&
          toPosix(path) === toPosix(`${ROOT}/bundles/web/bundle.yml`)
        ) {
          this.injected = true;
          super.write(
            `${ROOT}/bundles/bundle-template/payload/files/MARKER-{{bundle-id}}.txt`,
            "raced default for {{bundle-id}}\n",
          );
        }
      }
    }

    const fs = new ScaffoldRaceFileSystem();
    const backlog = new FakeBacklog();
    seed(fs, backlog);
    const scaffoldFiles = [
      { path: "install-backlog/config.yml", content: "task_prefix: {{bundle-id}}\n" },
      { path: "installer-skills/.keep", content: "" },
      {
        path: "payload/files/MARKER-{{bundle-id}}.txt",
        content: "initial default for {{bundle-id}}\n",
      },
    ];
    for (const file of scaffoldFiles) {
      fs.write(`${ROOT}/bundles/bundle-template/${file.path}`, file.content);
    }
    const recorded: BundleAuthoringContributions = {
      schemaVersion: 1,
      defaultContribution: {
        scaffoldSha256: bundleScaffoldSha256(scaffoldFiles),
        contribution: {
          status: "none",
          producer: { source: "project-local", scope: "bundle", name: "bundle-template" },
        },
      },
      bundles: [],
    };
    const recordPath = `${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`;
    const recordBefore = serializeBundleAuthoringContributions(recorded);
    fs.write(recordPath, recordBefore);
    fs.armed = true;

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-contribution-record");
    }
    expect(fs.read(recordPath)).toBe(recordBefore);
    expect(fs.read(`${ROOT}/bundles/bundle-template/payload/files/MARKER-{{bundle-id}}.txt`)).toBe(
      "raced default for {{bundle-id}}\n",
    );
  });

  it("keeps full-record verification linear while binding prewrite and final Backlog truth", () => {
    class ReadCountingBacklog extends FakeBacklog {
      readCalls = 0;

      override readTask(...args: Parameters<FakeBacklog["readTask"]>) {
        this.readCalls += 1;
        return super.readTask(...args);
      }
    }

    const backlog = new ReadCountingBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    for (let index = 0; index < 8; index += 1) {
      backlog.createTask(AUTHORING, {
        title: `Unrelated authoring task ${index + 1}`,
        acceptanceCriteria: [`Unrelated outcome ${index + 1}`],
      });
    }
    const before = backlog.listTasks(AUTHORING).length;

    createBundleWithAuthoring(
      { fs, backlog, builtinTemplatesRoot: BUILTIN },
      { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
      { id: "web", advisor: false, templateName: "default" },
    );

    const after = backlog.listTasks(AUTHORING).length;
    const created = after - before;
    // Full records are loaded at preflight, rebound before the first effect, read back once when created, and
    // verified once at final success. Lightweight summary/inventory guards bind the intervening effects.
    expect(backlog.readCalls).toBeLessThanOrEqual(before * 2 + created + after);
  });

  it("reports a typed partial instead of success when hidden task metadata changes between task effects", () => {
    class HiddenMetadataRaceBacklog extends FakeBacklog {
      target = "";
      armed = false;
      private injected = false;

      override createTask(...args: Parameters<FakeBacklog["createTask"]>) {
        const created = super.createTask(...args);
        if (this.armed && !this.injected) {
          this.injected = true;
          super.editTask(args[0], this.target, { notes: "Concurrent user note" });
        }
        return created;
      }
    }

    const backlog = new HiddenMetadataRaceBacklog();
    const { fs } = seed(new MemoryFileSystem(), backlog);
    const existing = backlog.createTask(AUTHORING, {
      title: "Unrelated authoring task",
      acceptanceCriteria: ["Unrelated outcome remains true"],
    });
    backlog.target = existing.id;
    backlog.armed = true;

    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.failed.id).toBe("bundle-create-postcondition");
      expect(caught.completed.some(({ id }) => id.startsWith("authoring-task:"))).toBe(true);
    }
    expect(backlog.readTask(AUTHORING, existing.id).extraSections).toEqual([
      { heading: "Implementation Notes", content: "Concurrent user note" },
    ]);
  });

  it("rejects a symlinked disabled-bundle directory before manifest, record, or Backlog mutation", () => {
    const fs = new RecordingFileSystem();
    const backlog = new RecordingBacklog();
    seed(fs, backlog);
    fs.write(
      "/outside/web/bundle.yml",
      "id: web\nversion: 0.1.0\nsummary: web bundle\nconfirmation: safe\nrequires: {}\n",
    );
    fs.ensureAlias("/outside/web", `${ROOT}/bundles/web`);
    const manifestBefore = fs.read(`${ROOT}/manifest.yml`);
    fs.startRecording();
    backlog.startRecording();

    let caught: unknown;
    try {
      enableBundleWithAuthoring(
        { fs, backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BundleAuthoringPreflightError);
    if (caught instanceof BundleAuthoringPreflightError) {
      expect(caught.blockers.map(({ code }) => code)).toContain("bundle-path-ancestor-ambiguous");
    }
    expect(fs.mutationCalls).toEqual([]);
    expect(backlog.mutationCalls).toEqual([]);
    expect(fs.read(`${ROOT}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.inspectPath(`${ROOT}/bundles/web`)).toEqual({
      kind: "symbolic-link",
      target: "/outside/web",
    });
    expect(fs.inspectPath(`${WORKSPACE}/${BUNDLE_AUTHORING_CONTRIBUTIONS_PATH}`).kind).toBe(
      "missing",
    );
    expect(backlog.listTasks(AUTHORING)).toEqual([]);
  });

  it("reports ordered typed progress when an unforeseen write fails", () => {
    class FailManifestFileSystem extends MemoryFileSystem {
      override write(path: string, content: string): void {
        if (toPosix(path) === toPosix(`${ROOT}/manifest.yml`) && content.includes("web")) {
          throw new Error("injected manifest failure");
        }
        super.write(path, content);
      }
    }
    const fs = new FailManifestFileSystem();
    const seeded = seed(fs);
    let caught: unknown;
    try {
      createBundleWithAuthoring(
        { fs, backlog: seeded.backlog, builtinTemplatesRoot: BUILTIN },
        { deliverableRoot: ROOT, workspaceRoot: WORKSPACE },
        { id: "web", advisor: false, templateName: "default" },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    if (caught instanceof MutationFailure) {
      expect(caught.completed.map(({ id }) => id)).toEqual([
        "bundle-create-preconditions",
        "bundle-file:bundle.yml",
        "bundle-file:install-backlog/config.yml",
        "bundle-file:installer-skills/.keep",
        "bundle-backlog-alias",
        "bundle-contribution-record",
      ]);
      expect(caught.failed.id).toBe("bundle-manifest-enable");
      expect(caught.unattempted[0]?.id).toMatch(/^derived-file:/u);
      expect(caught.unattempted.at(-1)?.id).toBe("bundle-create-postcondition");
      expect(caught.recovery).not.toMatch(/rollback|generic resume|reconcil/i);
    }
  });
});
