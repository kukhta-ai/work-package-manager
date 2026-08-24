import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  HandoffVerificationError,
  MutationFailure,
  WorkspaceIntegrationPreflightError,
} from "../../../src/core/errors.js";
import { perBundleAuthoringTasks } from "../../../src/core/operations/create-bundle.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import {
  initProject as executeInitProject,
  type InitProjectDeps,
  type InitProjectInput,
  projectWideAuthoringTasks,
} from "../../../src/core/operations/init-project.js";
import { setupPersonalAuthoring } from "../../../src/core/operations/personal-authoring-setup.js";
import { verifyWorkspaceHandoff } from "../../../src/core/operations/workspace-handoff.js";
import { PERSONAL_AUTHORING_STATE_PATH } from "../../../src/core/services/personal-authoring-setup.js";
import {
  TEMPLATE_TASK_LABEL,
  templateTaskProvenanceLabels,
} from "../../../src/core/services/project-authoring-task-plan.js";
import { parseManifest } from "../../../src/core/services/schema/index.js";
import {
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
} from "../../../src/core/services/workspace-authoring-integration.js";
import {
  parseWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../../src/core/services/workspace-handoff.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit test for the `initProject` operation (task-87) over the IN-MEMORY ports — the pure-core half of the
 * `wpm init` command. It mirrors the REAL `templates/` tree into a `MemoryFileSystem` (so it runs against the
 * genuine authored `minimal` project template + `default` bundle template) and a `FakeBacklog`, then drives
 * `initProject` directly (no commander, no real fs). The real-disk end-to-end is `test/integration/cli.init.test.ts`.
 *
 * Task-87 reshapes `init` to scaffold an **authoring workspace** (docs 06/10/11/12): `targetDir` is the
 * WORKSPACE ROOT (authoring front door + `.authoring-backlog/`), the deliverable skeleton nests under `wip/`,
 * and the empty build-output dir is `builds/`.
 */

const REAL_TEMPLATES = fileURLToPath(new URL("../../../templates", import.meta.url));
const REAL_SKILLS = fileURLToPath(new URL("../../../agent-skills", import.meta.url));
const BUILTIN = "/builtin-templates";
const BUNDLED_SKILLS = "/bundled-skills";
const TARGET = "/proj"; // the WORKSPACE ROOT
const WIP = `${TARGET}/wip`; // the deliverable subdir

/** Mirror the real `templates/` tree into a fresh MemoryFileSystem at {@link BUILTIN}. */
function seedTemplates(fs: MemoryFileSystem = new MemoryFileSystem()): MemoryFileSystem {
  const mirror = (srcDir: string, destDir: string): void => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const src = join(srcDir, entry.name);
      const dest = `${destDir}/${entry.name}`;
      if (entry.isDirectory()) mirror(src, dest);
      else fs.write(dest, readFileSync(src, "utf8"));
    }
  };
  mirror(REAL_TEMPLATES, BUILTIN);
  mirror(REAL_SKILLS, BUNDLED_SKILLS);
  return fs;
}

class InitBoundaryController {
  private armedAt: number | undefined;
  private mutations = 0;

  arm(at: number): void {
    this.armedAt = at;
    this.mutations = 0;
  }

  disarm(): void {
    this.armedAt = undefined;
  }

  count(): number {
    return this.mutations;
  }

  hit(boundary: string): void {
    if (this.armedAt === undefined) return;
    this.mutations += 1;
    if (this.mutations === this.armedAt) {
      this.armedAt = undefined;
      throw new Error(`injected init failure at ${boundary}`);
    }
  }
}

class InitBoundaryFileSystem extends MemoryFileSystem {
  constructor(private readonly controller: InitBoundaryController) {
    super();
  }

  override write(path: string, content: string): void {
    this.controller.hit(`write:${path}`);
    super.write(path, content);
  }

  override makeDirectories(path: string): void {
    this.controller.hit(`mkdir:${path}`);
    super.makeDirectories(path);
  }

  override ensureAlias(target: string, linkPath: string) {
    this.controller.hit(`alias:${linkPath}`);
    return super.ensureAlias(target, linkPath);
  }
}

class FailOnceAtInitPathFileSystem extends MemoryFileSystem {
  private failed = false;

  constructor(private readonly failurePath: string) {
    super();
  }

  override write(path: string, content: string): void {
    if (!this.failed && path === this.failurePath) {
      this.failed = true;
      throw new Error(`injected init failure at ${path}`);
    }
    super.write(path, content);
  }
}

class MutateProjectAfterBundleResolutionFileSystem extends MemoryFileSystem {
  static readonly sentinel = "TASK126-SECOND-PROJECT-READ-MUST-NOT-MIX-SNAPSHOTS";
  private mutated = false;

  override read(path: string): string {
    const content = super.read(path);
    if (!this.mutated && path === `${BUILTIN}/bundle/default/template.yml`) {
      this.mutated = true;
      super.write(
        `${BUILTIN}/project/minimal/snippets/AGENTS.md`,
        `# changed after project LOAD\n${MutateProjectAfterBundleResolutionFileSystem.sentinel}\n`,
      );
    }
    return content;
  }
}

class InitBoundaryBacklog extends FakeBacklog {
  constructor(private readonly controller: InitBoundaryController) {
    super();
  }

  override init(root: string, options: Parameters<FakeBacklog["init"]>[1]): void {
    this.controller.hit(`backlog-init:${root}`);
    super.init(root, options);
  }

  override createTask(root: string, input: Parameters<FakeBacklog["createTask"]>[1]) {
    this.controller.hit(`backlog-task:${input.title}`);
    return super.createTask(root, input);
  }
}

class FailOnceAtTaskTitleBacklog extends FakeBacklog {
  private failed = false;

  constructor(private readonly failureTitle: string) {
    super();
  }

  override createTask(root: string, input: Parameters<FakeBacklog["createTask"]>[1]) {
    if (!this.failed && input.title === this.failureTitle) {
      this.failed = true;
      throw new Error(`injected task-plan failure at ${input.title}`);
    }
    return super.createTask(root, input);
  }
}

class CorruptibleInitBoundaryBacklog extends InitBoundaryBacklog {
  private corruption: "dependencies" | "labels" | undefined;

  corruptTemplateTask(field: "dependencies" | "labels"): void {
    this.corruption = field;
  }

  override readTask(root: string, id: string) {
    const record = super.readTask(root, id);
    if (id !== "authoring-10" || this.corruption === undefined) return record;
    return this.corruption === "dependencies"
      ? { ...record, dependencies: ["authoring-2"] }
      : { ...record, labels: [...record.labels, "user-modified"] };
  }
}

class CorruptAfterFinalTaskBacklog extends FakeBacklog {
  private corruptReads = false;

  override createTask(root: string, input: Parameters<FakeBacklog["createTask"]>[1]) {
    const created = super.createTask(root, input);
    if (input.title === "Verify beta shared work") this.corruptReads = true;
    return created;
  }

  override readTask(root: string, id: string) {
    const record = super.readTask(root, id);
    return this.corruptReads && id === "authoring-9"
      ? { ...record, labels: [...record.labels, "concurrent-change"] }
      : record;
  }
}

class MissingFinalTaskBacklog extends InitBoundaryBacklog {
  private hideFinal = false;
  createCallsAfterHide = 0;

  hideFinalTask(): void {
    this.hideFinal = true;
  }

  override listTasks(root: string, filter?: Parameters<FakeBacklog["listTasks"]>[1]) {
    const tasks = super.listTasks(root, filter);
    return this.hideFinal ? tasks.slice(0, -1) : tasks;
  }

  override inspectTaskInventory(root: string) {
    const inventory = super.inspectTaskInventory(root);
    return this.hideFinal
      ? { ...inventory, activeEntries: this.listTasks(root).map(({ id }) => id) }
      : inventory;
  }

  override createTask(root: string, input: Parameters<FakeBacklog["createTask"]>[1]) {
    if (this.hideFinal) this.createCallsAfterHide += 1;
    return super.createTask(root, input);
  }
}

class PartialInitialisationBacklog extends FakeBacklog {
  private leftResidue = false;

  constructor(private readonly fs: MemoryFileSystem) {
    super();
  }

  override init(root: string, options: Parameters<FakeBacklog["init"]>[1]): void {
    if (!this.leftResidue) {
      this.leftResidue = true;
      this.fs.makeDirectories(`${root}/backlog/archive/tasks`);
      this.fs.makeDirectories(`${root}/backlog/tasks`);
      throw new Error("injected Backlog config publication failure");
    }
    this.leftResidue = false;
    super.init(root, options);
  }

  override inspectEmptyInitialisationResidue(_root: string): boolean {
    return this.leftResidue;
  }
}

class CorruptiblePartialBacklog extends FakeBacklog {
  private failed = false;
  private corruptReads = false;
  private corruptConfig = false;

  corruptAcceptanceReads(): void {
    this.corruptReads = true;
  }

  corruptConfiguration(): void {
    this.corruptConfig = true;
  }

  override createTask(root: string, input: Parameters<FakeBacklog["createTask"]>[1]) {
    if (!this.failed && input.title === "Confirm target agents") {
      this.failed = true;
      throw new Error("injected task boundary failure");
    }
    return super.createTask(root, input);
  }

  override readTask(root: string, id: string) {
    const record = super.readTask(root, id);
    return this.corruptReads && record.title === "Set project metadata"
      ? {
          ...record,
          acceptanceCriteria: [{ text: "user-modified criterion", checked: false }],
        }
      : record;
  }

  override inspectTaskInventory(root: string) {
    const inventory = super.inspectTaskInventory(root);
    return this.corruptConfig
      ? { ...inventory, configurationMatchesFreshDefaults: false }
      : inventory;
  }
}

function deps(fs: MemoryFileSystem, backlog: FakeBacklog) {
  return {
    fs,
    backlog,
    env: new FakeEnvironment({ env: {} }),
    builtinTemplatesRoot: BUILTIN,
    bundledSkillsRoot: BUNDLED_SKILLS,
    integrationVersion: "0.1.0",
  };
}

function initProject(
  dependencies: InitProjectDeps,
  input: Omit<InitProjectInput, "authoringClientIds"> & {
    readonly authoringClientIds?: readonly string[];
  },
) {
  return executeInitProject(dependencies, {
    authoringClientIds: ["codex"],
    ...input,
  });
}

/** Collect every file path under `dir` in the MemoryFileSystem. */
function filesUnder(fs: MemoryFileSystem, dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of fs.list(d)) {
      const child = `${d}/${entry.name}`;
      if (entry.kind === "directory") walk(child);
      else out.push(child);
    }
  };
  walk(dir);
  return out;
}

describe("initProject — scaffolds an authoring workspace (task-87; docs 06/10/11/12)", () => {
  it("AC#1 — workspace root holds the authoring front door + authoring backlog; deliverable lives under wip/", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The WORKSPACE ROOT keeps only the authoring surface:
    expect(fs.exists(`${TARGET}/AGENTS.md`)).toBe(true); // authoring front door
    expect(fs.exists(`${TARGET}/.authoring-backlog`)).toBe(true); // authoring backlog

    // The DELIVERABLE skeleton nests under wip/ — the copied files/ artefacts:
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(true);
    expect(fs.exists(`${WIP}/README.md`)).toBe(true);
    expect(fs.exists(`${WIP}/RALPH-LOOP.md`)).toBe(true);
    expect(
      fs.exists(`${WIP}/installer-skills/hermes-handoff-installer/references/journaling.md`),
    ).toBe(true);

    // AC#1 — the default bundle template is materialised at wip/bundles/bundle-template/:
    expect(fs.exists(`${WIP}/bundles/bundle-template`)).toBe(true);
    expect(fs.exists(`${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`)).toBe(true);
    // The scaffold keeps its placeholders (a template-of-a-template; bundle new fills them):
    expect(fs.read(`${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`)).toMatch(/\{\{bundle-id\}\}/);

    // AC#1 — the empty registries exist as directories under wip/:
    expect(fs.exists(`${WIP}/installer-skills`)).toBe(true);
    expect(fs.exists(`${WIP}/templates`)).toBe(true);

    // The manifest parses with the substituted name + empty lists (minimal declares neither targets nor bundles):
    const manifest = parseManifest(parseYaml(fs.read(`${WIP}/manifest.yml`)));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.value.meta.name).toBe("hermes-handoff");
      expect(manifest.value.bundles).toEqual([]);
      expect(manifest.value.targets).toEqual([]);
    }

    // The result is observable: summary + changed paths + the materialised project-wide set:
    expect(result.summary).toBe(
      `created authoring workspace hermes-handoff at ${TARGET} (deliverable under wip/)`,
    );
    expect(result.changedPaths).toContain(`${TARGET}/AGENTS.md`);
    expect(result.changedPaths).toContain(`${TARGET}/.authoring-backlog`);
    expect(result.changedPaths).toContain(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
    expect(result.materialisedTaskTitles).toHaveLength(8);
    expect(result).toMatchObject({
      handoffPrepared: true,
      handoff: {
        status: "prepared",
        workspaceRoot: TARGET,
        receiptPath: WORKSPACE_HANDOFF_RECEIPT_PATH,
        configuredClients: ["codex"],
      },
    });
  });

  it("AC#2 — an EMPTY build-output directory (builds/) exists at the workspace root", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    expect(fs.exists(`${TARGET}/builds`)).toBe(true);
    expect(fs.list(`${TARGET}/builds`)).toEqual([]); // empty
  });

  it("TASK-102 — the always-shipped bundle-template scaffold carries a RELATIVE `backlog → install-backlog` alias", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });

    const link = `${WIP}/bundles/bundle-template/backlog`;
    // RELATIVE target (archive-portable), and it resolves to the scaffold's real install-backlog dir, so a
    // `bundle new` clone inherits a working link and the scaffold itself is Backlog.md-CLI-resolvable:
    expect(fs.aliasTarget(link)).toBe("install-backlog");
    expect(fs.exists(link)).toBe(true);
    expect(fs.exists(`${WIP}/bundles/bundle-template/install-backlog`)).toBe(true);
    expect(result.changedPaths).toContain(link);
  });

  it("AC#3 — the workspace .gitignore excludes BOTH the authoring backlog AND builds/", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    expect(fs.exists(`${TARGET}/.gitignore`)).toBe(true);
    const gitignore = fs.read(`${TARGET}/.gitignore`);
    expect(gitignore).toMatch(/^\.authoring-backlog\/$/m);
    expect(gitignore).toMatch(/^builds\/$/m);
    expect(result.changedPaths).toContain(`${TARGET}/.gitignore`);
  });

  it("AC#4 — the authoring front door addresses the AUTHORING agent (author wip/, not install)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const authoring = fs.read(`${TARGET}/AGENTS.md`);
    expect(authoring).toContain("$wpm-author"); // selected Codex-native invocation
    expect(authoring).toContain(".wpm-authoring.json"); // exact managed-state handshake
    expect(authoring).toContain("wip/"); // points at the deliverable subdir
    // It must NOT adopt the executor's stance (that is the wip/_AGENTS.md front door's job):
    expect(authoring.toLowerCase()).not.toContain("executing agent");

    // Only the explicitly selected native client receives a root front door.
    expect(fs.inspectPath(`${TARGET}/CLAUDE.md`).kind).toBe("missing");
  });

  it("installs both explicitly selected native authoring clients during the same fresh plan", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
      authoringClientIds: ["claude-code", "codex"],
    });

    for (const scope of [".agents/skills", ".claude/skills"]) {
      for (const skill of WORKSPACE_SKILL_NAMES) {
        expect(fs.read(`${TARGET}/${scope}/${skill}/SKILL.md`)).toBe(
          fs.read(`${BUNDLED_SKILLS}/${skill}/SKILL.md`),
        );
      }
    }
    expect(fs.inspectPath(`${TARGET}/AGENTS.md`).kind).toBe("file");
    expect(fs.inspectPath(`${TARGET}/CLAUDE.md`).kind).toBe("file");
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "complete",
      selectedClients: ["codex", "claude-code"],
      origin: "created",
    });
  });

  it("AC#8 — wip/ has the rendered installer skill + the executor front door under the reserved prefix", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    // The rendered per-project installer skill (substituted):
    const orchestrator = fs.read(`${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`);
    expect(orchestrator).toContain("hermes-handoff-installer");

    // The executor front door is author-owned, under the reserved build-stripped prefix (NOT the canonical name):
    expect(fs.exists(`${WIP}/_AGENTS.md`)).toBe(true);
    expect(fs.exists(`${WIP}/AGENTS.md`)).toBe(false);
    const executor = fs.read(`${WIP}/_AGENTS.md`);
    expect(executor).toContain("hermes-handoff"); // {{project-name}} substituted
    expect(executor.toLowerCase()).toContain("install"); // it addresses the EXECUTOR
  });

  it("the produced files are fully substituted; only the bundle-template scaffold keeps its placeholders", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    // No file OUTSIDE the bundle-template scaffold has an unresolved {{…}} marker. The scaffold at
    // wip/bundles/bundle-template/ is a template-of-a-template and DELIBERATELY keeps its placeholders.
    const scaffold = `${WIP}/bundles/bundle-template`;
    for (const path of filesUnder(fs, TARGET)) {
      if (path.startsWith(`${scaffold}/`)) continue;
      expect(path, `marker in produced path ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
      expect(fs.read(path), `marker in produced file ${path}`).not.toMatch(/\{\{[^}]*\}\}/);
    }
  });

  it("AC#1 — no scope-aliases are created when the template declares no targets (minimal)", () => {
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });
    // minimal declares `targets: []`, so the alias plan is empty — no .claude/skills etc. under wip/.
    expect(fs.exists(`${WIP}/.claude/skills`)).toBe(false);
    expect(fs.exists(`${WIP}/.agents/skills`)).toBe(false);
    expect(fs.aliasTarget(`${WIP}/.claude/skills`)).toBeUndefined();
  });

  it("AC#7 — the project-wide authoring task set (8) is materialised into the workspace-root .authoring-backlog", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    const titles = backlog.listTasks(`${TARGET}/.authoring-backlog`).map((t) => t.title);
    for (const spec of projectWideAuthoringTasks()) {
      expect(titles).toContain(spec.title);
    }
    expect(titles).toHaveLength(8);
    expect(result.materialisedTaskTitles).toEqual(titles);
    // minimal pre-includes no bundles, so NO per-bundle set is materialised (only the project-wide 8):
    expect(titles).not.toContain("Plan bundle ");
  });

  it("AC#7 — exercises the BacklogMd port: .authoring-backlog has task_prefix=authoring (project-wide tasks → authoring-1..8)", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });

    // The 8 project-wide tasks consumed authoring-1..8; the NEXT created task is authoring-9 (proving the
    // task_prefix is `authoring` and the materialise really ran against this root).
    const created = backlog.createTask(`${TARGET}/.authoring-backlog`, { title: "probe" });
    expect(created.id).toBe("authoring-9");
  });

  it("AC#6 — --param values are available to placeholder substitution (extra params are harmless for minimal)", () => {
    const fs = seedTemplates();
    // minimal's files only reference {{project-name}}; an extra --param must not break the render (it is simply
    // unreferenced), proving the param map threads through renderTree.
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), {
        targetDir: TARGET,
        name: "hermes-handoff",
        params: new Map([["author", "me"]]),
      }),
    ).not.toThrow();
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(true);
  });

  it("rejects a rendered filename that escapes wip toward the managed-state path before mutation", () => {
    const fs = seedTemplates();
    fs.write(`${BUILTIN}/project/minimal/files/{{escape}}.tmpl`, "template escape\n");

    let caught: unknown;
    try {
      initProject(deps(fs, new FakeBacklog()), {
        targetDir: TARGET,
        name: "hermes-handoff",
        params: new Map([["escape", `../${WORKSPACE_INTEGRATION_STATE_PATH}`]]),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "workspace-plan-path-escapes" })]),
    );
    expect(fs.inspectPath(TARGET).kind).toBe("missing");
  });

  it("AC#5 — refuses when the target PATH already exists during aggregate preflight, creating nothing", () => {
    const fs = seedTemplates();
    // Pre-create the target path (not necessarily a project — any existing path triggers the refusal).
    fs.makeDirectories(TARGET);
    fs.write(`${TARGET}/some-existing-file`, "x");
    const backlog = new FakeBacklog();
    expect(() =>
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    // Nothing was scaffolded over the existing path:
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(false);
    expect(fs.exists(`${WIP}`)).toBe(false);
    expect(fs.exists(`${TARGET}/builds`)).toBe(false);
  });

  it("aggregates independent selection, package, Backlog.md, and target blockers before every write", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    backlog.setAvailability({ available: false, reason: "not installed" });
    fs.remove(`${BUNDLED_SKILLS}/wpm-author-skill`);
    fs.makeDirectories(TARGET);
    fs.write(`${TARGET}/user-file`, "preserve me\n");
    const before = filesUnder(fs, TARGET).map((path) => [path, fs.read(path)] as const);

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["openclaw"],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "authoring-client-unsupported",
        "packaged-skill-shape-invalid",
        "backlog-unavailable",
        "workspace-target-exists",
      ]),
    );
    expect((caught as WorkspaceIntegrationPreflightError).handoffPrepared).toBe(false);
    expect(filesUnder(fs, TARGET).map((path) => [path, fs.read(path)] as const)).toEqual(before);
  });

  it("AC#5 — re-running init on an existing workspace refuses and does not change the manifest", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "hermes-handoff" });
    const manifestBefore = fs.read(`${WIP}/manifest.yml`);

    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "other" })).toThrow(
      WorkspaceIntegrationPreflightError,
    );
    expect(fs.read(`${WIP}/manifest.yml`)).toBe(manifestBefore); // unchanged
  });

  it("refuses an exact replay after a fully successful init instead of treating it as a partial retry", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const input = { targetDir: TARGET, name: "hermes-handoff" } as const;
    initProject(deps(fs, backlog), input);
    const manifestBefore = fs.read(`${WIP}/manifest.yml`);
    const receiptBefore = fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), input);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "workspace-target-exists" })]),
    );
    expect(fs.read(`${WIP}/manifest.yml`)).toBe(manifestBefore);
    expect(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
  });

  it("aggregates a missing chosen project template before mutation", () => {
    const fs = new MemoryFileSystem(); // no templates seeded
    expect(() =>
      initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "x" }),
    ).toThrow(WorkspaceIntegrationPreflightError);
  });

  it("aggregates an unresolved explicit --template before mutation", () => {
    const fs = seedTemplates();
    fs.makeDirectories(TARGET);
    fs.write(`${TARGET}/user-file`, "preserve\n");
    let caught: unknown;
    try {
      initProject(deps(fs, new FakeBacklog()), {
        targetDir: TARGET,
        name: "x",
        templateName: "does-not-exist",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["project-template-missing", "workspace-target-exists"]),
    );
    expect(fs.exists(`${WIP}/manifest.yml`)).toBe(false);
    expect(fs.read(`${TARGET}/user-file`)).toBe("preserve\n");
  });

  it("changedPaths lists every produced path (the observability contract the command's formatResult uses)", () => {
    const fs = seedTemplates();
    const result = initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "hermes-handoff",
    });
    const expected = [
      `${WIP}/manifest.yml`,
      `${WIP}/README.md`,
      `${WIP}/RALPH-LOOP.md`,
      `${WIP}/_AGENTS.md`,
      `${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`,
      `${WIP}/installer-skills/hermes-handoff-installer/references/journaling.md`,
      `${WIP}/bundles/bundle-template/_AGENTS.md.tmpl`,
      `${TARGET}/AGENTS.md`,
      `${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`,
      `${TARGET}/builds`,
      `${TARGET}/.authoring-backlog`,
      `${TARGET}/.gitignore`,
    ];
    for (const path of expected) {
      expect(result.changedPaths, `changedPaths must list ${path}`).toContain(path);
    }
    // No path is listed twice (the de-dup guards):
    expect(new Set(result.changedPaths).size).toBe(result.changedPaths.length);
  });

  it("single-source: the executor front door `init` writes is byte-identical to the deriver's output", () => {
    // `init` and every later mutation render the executor front-door + orchestrator from the SAME snippets/
    // source via the deriver. So what `init` writes to wip/_AGENTS.md must equal what the deriver yields for
    // AGENTS.md, and the orchestrator under wip/ must equal the deriver's.
    const fs = seedTemplates();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "hermes-handoff" });

    const deriver = makeArtefactDeriver({
      fs,
      builtinTemplatesRoot: BUILTIN,
      projectTemplatesRoot: `${WIP}/templates`,
      projectTemplateName: "minimal",
    });
    const desired = deriver({
      rootPath: WIP,
      manifest: {
        meta: { name: "hermes-handoff", version: "0.1.0" as never },
        targets: [],
        bundles: [],
        installerSkills: [],
      },
      bundles: new Map(),
    });
    const derivedFrontDoor = desired.files.find((f) => f.path === "AGENTS.md");
    const derivedOrch = desired.files.find((f) => f.path.endsWith("-installer/SKILL.md"));
    expect(derivedFrontDoor).toBeDefined();
    expect(derivedOrch).toBeDefined();
    expect(fs.read(`${WIP}/_AGENTS.md`)).toBe(derivedFrontDoor?.content);
    expect(fs.read(`${WIP}/installer-skills/hermes-handoff-installer/SKILL.md`)).toBe(
      derivedOrch?.content,
    );
  });

  it("TASK-126 — files, task plan, and derived artefacts use one resolved project-template snapshot", () => {
    const fs = seedTemplates(new MutateProjectAfterBundleResolutionFileSystem());
    initProject(deps(fs, new FakeBacklog()), {
      targetDir: TARGET,
      name: "snapshot-demo",
    });

    expect(fs.read(`${BUILTIN}/project/minimal/snippets/AGENTS.md`)).toContain(
      MutateProjectAfterBundleResolutionFileSystem.sentinel,
    );
    expect(fs.read(`${WIP}/_AGENTS.md`)).not.toContain(
      MutateProjectAfterBundleResolutionFileSystem.sentinel,
    );
    expect(fs.read(`${WIP}/_AGENTS.md`)).toContain("snapshot-demo");
  });

  it("reports every fresh-init boundary and the identical authorized request converges after each failure", () => {
    const countController = new InitBoundaryController();
    const countFs = seedTemplates(new InitBoundaryFileSystem(countController));
    const countBacklog = new InitBoundaryBacklog(countController);
    countController.arm(Number.MAX_SAFE_INTEGER);
    initProject(deps(countFs, countBacklog), {
      targetDir: TARGET,
      name: "hermes-handoff",
      authoringClientIds: ["codex", "claude-code"],
    });
    const boundaryCount = countController.count();
    expect(boundaryCount).toBeGreaterThan(25);

    for (let at = 1; at <= boundaryCount; at += 1) {
      const controller = new InitBoundaryController();
      const fs = seedTemplates(new InitBoundaryFileSystem(controller));
      const backlog = new InitBoundaryBacklog(controller);
      controller.arm(at);

      let caught: unknown;
      try {
        initProject(deps(fs, backlog), {
          targetDir: TARGET,
          name: "hermes-handoff",
          authoringClientIds: ["codex", "claude-code"],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught, `boundary ${at}`).toBeInstanceOf(MutationFailure);
      expect((caught as MutationFailure).failed.id.length).toBeGreaterThan(0);
      expect((caught as MutationFailure).recovery).toMatch(/identical init request/i);

      controller.disarm();
      expect(() =>
        initProject(deps(fs, backlog), {
          targetDir: TARGET,
          name: "hermes-handoff",
          authoringClientIds: ["codex", "claude-code"],
        }),
      ).not.toThrow();
      expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
        status: "complete",
        selectedClients: ["codex", "claude-code"],
      });
      expect(backlog.listTasks(`${TARGET}/.authoring-backlog`)).toHaveLength(8);
      for (const scope of [".agents/skills", ".claude/skills"]) {
        for (const skill of WORKSPACE_SKILL_NAMES) {
          expect(fs.inspectPath(`${TARGET}/${scope}/${skill}/SKILL.md`).kind).toBe("file");
        }
      }
    }
  });

  it("fails closed when a completed output changes before final prepared-receipt retry", () => {
    const counter = new InitBoundaryController();
    const countFs = seedTemplates(new InitBoundaryFileSystem(counter));
    const countBacklog = new InitBoundaryBacklog(counter);
    counter.arm(Number.MAX_SAFE_INTEGER);
    initProject(deps(countFs, countBacklog), {
      targetDir: TARGET,
      name: "hermes-handoff",
      authoringClientIds: ["codex"],
    });

    const controller = new InitBoundaryController();
    const fs = seedTemplates(new InitBoundaryFileSystem(controller));
    const backlog = new InitBoundaryBacklog(controller);
    controller.arm(counter.count());
    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    expect((caught as MutationFailure).failed.id).toBe("handoff-receipt:prepared");
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "complete",
    });
    expect(
      parseWorkspaceHandoffReceipt(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)),
    ).toMatchObject({ ok: true, value: { status: "preparing" } });

    let verificationFailure: unknown;
    try {
      verifyWorkspaceHandoff(
        { fs, backlog, bundledSkillsRoot: BUNDLED_SKILLS },
        {
          workspaceRoot: TARGET,
          actualWorkingDirectory: TARGET,
          clientId: "codex",
          integrationVersion: "0.1.0",
        },
      );
    } catch (error) {
      verificationFailure = error;
    }
    expect(verificationFailure).toBeInstanceOf(HandoffVerificationError);
    const receiptBlocker = (verificationFailure as HandoffVerificationError).blockers.find(
      ({ code }) => code === "handoff-receipt-not-prepared",
    );
    expect(receiptBlocker?.recovery).toContain("identical original wpm init request");
    expect(receiptBlocker?.recovery).not.toContain("authoring handoff prepare");

    const changedSkill = `${TARGET}/.agents/skills/wpm-author/SKILL.md`;
    fs.write(changedSkill, "user-modified after reported partial\n");
    const receiptBefore = fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
    controller.disarm();

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    expect(fs.read(changedSkill)).toBe("user-modified after reported partial\n");
    expect(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
  });

  it("fails closed on missing completed output after the preparing receipt was published", () => {
    const counter = new InitBoundaryController();
    const countFs = seedTemplates(new InitBoundaryFileSystem(counter));
    const countBacklog = new InitBoundaryBacklog(counter);
    counter.arm(Number.MAX_SAFE_INTEGER);
    initProject(deps(countFs, countBacklog), {
      targetDir: TARGET,
      name: "hermes-handoff",
      authoringClientIds: ["codex"],
    });

    const controller = new InitBoundaryController();
    const fs = seedTemplates(new InitBoundaryFileSystem(controller));
    const backlog = new InitBoundaryBacklog(controller);
    controller.arm(counter.count() - 1);
    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    expect((caught as MutationFailure).failed.id).toBe("managed-state:complete");
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "applying",
    });
    expect(
      parseWorkspaceHandoffReceipt(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)),
    ).toMatchObject({ ok: true, value: { status: "preparing" } });

    const completedSkill = `${TARGET}/.agents/skills/wpm-author/SKILL.md`;
    fs.remove(completedSkill);
    const receiptBefore = fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
    controller.disarm();

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    expect(fs.inspectPath(completedSkill).kind).toBe("missing");
    expect(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
  });

  it("does not recreate a coherently missing completed task while finalizing the receipt", () => {
    const counter = new InitBoundaryController();
    const countFs = seedTemplates(new InitBoundaryFileSystem(counter));
    const countBacklog = new InitBoundaryBacklog(counter);
    counter.arm(Number.MAX_SAFE_INTEGER);
    initProject(deps(countFs, countBacklog), {
      targetDir: TARGET,
      name: "hermes-handoff",
      authoringClientIds: ["codex"],
    });

    const controller = new InitBoundaryController();
    const fs = seedTemplates(new InitBoundaryFileSystem(controller));
    const backlog = new MissingFinalTaskBacklog(controller);
    controller.arm(counter.count());
    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    expect((caught as MutationFailure).failed.id).toBe("handoff-receipt:prepared");
    backlog.hideFinalTask();
    const receiptBefore = fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
    controller.disarm();

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    expect(backlog.createCallsAfterHide).toBe(0);
    expect(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
  });

  it("retries a Backlog init that left only its canonical empty directory skeleton", () => {
    const fs = seedTemplates();
    const backlog = new PartialInitialisationBacklog(fs);

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    expect((caught as MutationFailure).failed.id).toBe("authoring-backlog:init");
    expect(fs.inspectPath(`${TARGET}/.authoring-backlog/backlog/tasks`).kind).toBe("directory");

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).not.toThrow();
    expect(backlog.listTasks(`${TARGET}/.authoring-backlog`)).toHaveLength(8);
  });

  it("fails closed when unplanned user content appears inside an applying fresh workspace", () => {
    const controller = new InitBoundaryController();
    const fs = seedTemplates(new InitBoundaryFileSystem(controller));
    const backlog = new InitBoundaryBacklog(controller);
    controller.arm(2);
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    controller.disarm();
    fs.write(`${TARGET}/USER.txt`, "preserve me\n");

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-partial-unplanned-path" }),
      ]),
    );
    expect(fs.read(`${TARGET}/USER.txt`)).toBe("preserve me\n");
  });

  it("rejects changed packaged plan bytes before continuing a partial fresh workspace", () => {
    const fs = seedTemplates(new FailOnceAtInitPathFileSystem(`${WIP}/README.md`));
    const backlog = new FakeBacklog();
    const templatePath = `${BUILTIN}/project/minimal/files/README.md.tmpl`;
    const originalTemplate = fs.read(templatePath);
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    const partialManifest = fs.read(`${WIP}/manifest.yml`);
    const applyingState = fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`);

    fs.write(templatePath, "# {{project-name}} from a different package revision\n");

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-partial-request-mismatch" }),
      ]),
    );
    expect(fs.read(`${WIP}/manifest.yml`)).toBe(partialManifest);
    expect(fs.inspectPath(`${WIP}/README.md`).kind).toBe("missing");
    expect(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`)).toBe(applyingState);

    fs.write(templatePath, originalTemplate);
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).not.toThrow();
    expect(fs.read(`${WIP}/README.md`)).toContain("hermes-handoff");
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "complete",
    });
  });

  it("rejects a non-canonical integration version before creating the target", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();

    let caught: unknown;
    try {
      initProject(
        { ...deps(fs, backlog), integrationVersion: "0.1.0\n<!-- wpm:workspace-authoring:end -->" },
        {
          targetDir: TARGET,
          name: "hermes-handoff",
          authoringClientIds: ["codex"],
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "integration-version-invalid" })]),
    );
    expect(fs.inspectPath(TARGET).kind).toBe("missing");
  });

  it("verifies exact planned task criteria before completing a partial fresh workspace", () => {
    const fs = seedTemplates();
    const backlog = new CorruptiblePartialBacklog();
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    backlog.corruptAcceptanceReads();

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-partial-backlog-conflict" }),
      ]),
    );
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "applying",
    });
  });

  it("rejects user-authored labels and notes on a task created before an init failure", () => {
    const fs = seedTemplates();
    const backlog = new CorruptiblePartialBacklog();
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    const authoringRoot = `${TARGET}/.authoring-backlog`;
    const partial = backlog.listTasks(authoringRoot)[0];
    expect(partial).toBeDefined();
    backlog.editTask(authoringRoot, partial?.id ?? "", {
      notes: "user recovery note",
      addLabels: ["user-owned"],
    });

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-partial-backlog-conflict" }),
      ]),
    );
    expect(backlog.taskDetail(authoringRoot, partial?.id ?? "")).toMatchObject({
      labels: ["user-owned"],
      notes: "user recovery note",
    });
  });

  it("rejects an archived partial task without creating a replacement task", () => {
    const fs = seedTemplates();
    const backlog = new CorruptiblePartialBacklog();
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    const authoringRoot = `${TARGET}/.authoring-backlog`;
    const partial = backlog.listTasks(authoringRoot)[0];
    expect(partial).toBeDefined();
    backlog.archiveTask(authoringRoot, partial?.id ?? "");

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    expect(backlog.inspectTaskInventory(authoringRoot)).toEqual({
      configurationMatchesFreshDefaults: true,
      activeEntries: [],
      inactiveEntries: [partial?.id],
      unexpectedEntries: [],
    });
    expect(backlog.taskDetail(authoringRoot, partial?.id ?? "")?.archived).toBe(true);
  });

  it("rejects changed Backlog.md configuration before creating remaining partial tasks", () => {
    const fs = seedTemplates();
    const backlog = new CorruptiblePartialBacklog();
    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(MutationFailure);
    const authoringRoot = `${TARGET}/.authoring-backlog`;
    expect(backlog.listTasks(authoringRoot)).toHaveLength(1);
    backlog.corruptConfiguration();

    expect(() =>
      initProject(deps(fs, backlog), {
        targetDir: TARGET,
        name: "hermes-handoff",
        authoringClientIds: ["codex"],
      }),
    ).toThrow(WorkspaceIntegrationPreflightError);
    expect(backlog.listTasks(authoringRoot)).toHaveLength(1);
  });
});

describe("initProject — honors a template that DECLARES targets / pre-includes bundles (AC#1 +, AC#7 +)", () => {
  /**
   * Turn the seeded built-in `minimal` template into one that DECLARES a target (`claude-code`) and pre-includes
   * a bundle (`core`) in its rendered manifest, plus ships that bundle's `bundle.yml` under the template's
   * `files/bundles/core/`. This exercises the POSITIVE alias case (an alias per declared target, under wip/) and
   * the per-bundle authoring case (the per-bundle set for each pre-included bundle) — which `minimal` cannot,
   * since it declares neither. (No such built-in template ships today; this fixture proves the code path.)
   */
  function seedTemplateWithTargetAndBundle(): MemoryFileSystem {
    const fs = seedTemplates();
    // Overwrite the minimal manifest snippet to declare a target + a pre-included bundle.
    fs.write(
      `${BUILTIN}/project/minimal/files/manifest.yml.tmpl`,
      [
        "project:",
        "  name: {{project-name}}",
        "  version: 0.1.0",
        "targets:",
        "  - claude-code",
        "bundles:",
        "  - core",
        "",
      ].join("\n"),
    );
    // Ship the pre-included bundle's bundle.yml in the template's files/ (so buildProjection can load it). The
    // installer-skills/ dir makes the per-bundle alias target non-broken.
    fs.write(
      `${BUILTIN}/project/minimal/files/bundles/core/bundle.yml`,
      "id: core\nversion: 0.1.0\nsummary: core bundle\nconfirmation: safe\nrequires: {}\n",
    );
    fs.write(`${BUILTIN}/project/minimal/files/bundles/core/installer-skills/.keep`, "");
    return fs;
  }

  function seedTemplateWithCompleteTaskPacks(
    fs: MemoryFileSystem = seedTemplates(),
  ): MemoryFileSystem {
    fs.write(
      `${BUILTIN}/project/minimal/files/manifest.yml.tmpl`,
      [
        "project:",
        "  name: {{project-name}}",
        "  version: 0.1.0",
        "targets: []",
        "bundles:",
        "  - alpha",
        "  - beta",
        "",
      ].join("\n"),
    );
    for (const [id, version] of [
      ["alpha", "1.0.0"],
      ["beta", "2.0.0"],
    ] as const) {
      fs.write(
        `${BUILTIN}/project/minimal/files/bundles/${id}/bundle.yml`,
        `id: ${id}\nversion: ${version}\nsummary: ${id} bundle\nconfirmation: safe\nrequires: {}\n`,
      );
      fs.write(`${BUILTIN}/project/minimal/files/bundles/${id}/installer-skills/.keep`, "");
    }
    fs.write(
      `${BUILTIN}/project/minimal/template.yml`,
      [
        "name: minimal",
        "scope: project",
        'revision: "project-r1"',
        "parameters:",
        "  - name: project-name",
        "authoring-tasks:",
        "  - key: verify-shared-work",
        "    title: Verify shared project work for {{wpm.project.name}}",
        "    acceptance-criteria:",
        "      - The shared project work is observable",
        "    depends-on:",
        "      - self:shared-work",
        "      - wpm:project:set-metadata",
        "  - key: shared-work",
        "    title: Prepare shared project work for {{wpm.project.name}}",
        "    acceptance-criteria:",
        "      - The shared project work is prepared",
        "",
      ].join("\n"),
    );
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      [
        "name: default",
        "scope: bundle",
        'revision: "bundle-r2"',
        "parameters:",
        "  - name: bundle-id",
        "  - name: version",
        "  - name: project-name",
        "authoring-tasks:",
        "  - key: verify-shared-work",
        "    title: Verify {{wpm.bundle.id}} shared work",
        "    acceptance-criteria:",
        "      - The {{wpm.bundle.id}} work at {{wpm.bundle.version}} is observable",
        "    depends-on:",
        "      - self:shared-work",
        "  - key: shared-work",
        "    title: Prepare {{wpm.bundle.id}} shared work",
        "    acceptance-criteria:",
        "      - The {{wpm.bundle.id}} work for {{wpm.project.name}} is prepared",
        "    depends-on:",
        "      - wpm:bundle:plan",
        "",
      ].join("\n"),
    );
    return fs;
  }

  it("AC#1 + — creates one scope-alias per declared target under wip/ (root + per pre-included bundle)", () => {
    const fs = seedTemplateWithTargetAndBundle();
    initProject(deps(fs, new FakeBacklog()), { targetDir: TARGET, name: "demo" });

    // The root scope-alias for claude-code under wip/ (.claude/skills → installer-skills/):
    expect(fs.aliasTarget(`${WIP}/.claude/skills`)).toBe(`${WIP}/installer-skills`);
    // The per-bundle scope-alias (self-similar surface) for the pre-included bundle:
    expect(fs.aliasTarget(`${WIP}/bundles/core/.claude/skills`)).toBe(
      `${WIP}/bundles/core/installer-skills`,
    );
    // TASK-102 — a pre-included bundle also gets its RELATIVE `backlog → install-backlog` recipe alias:
    expect(fs.aliasTarget(`${WIP}/bundles/core/backlog`)).toBe("install-backlog");
  });

  it("AC#7 + — materialises the project-wide set AND the per-bundle set for each pre-included bundle", () => {
    const fs = seedTemplateWithTargetAndBundle();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });

    const titles = backlog.listTasks(`${TARGET}/.authoring-backlog`).map((t) => t.title);
    // The project-wide set (8) is present:
    for (const spec of projectWideAuthoringTasks()) {
      expect(titles).toContain(spec.title);
    }
    // AND the per-bundle set for `core` (12 with the advisor) is present — identities UNCHANGED:
    for (const spec of perBundleAuthoringTasks("core", { advisor: true })) {
      expect(titles).toContain(spec.title);
    }
    // 8 project-wide + 12 per-bundle = 20 materialised (titles are disjoint here):
    expect(result.materialisedTaskTitles).toHaveLength(20);
  });

  it("TASK-126 — materialises project + per-bundle packs with exact provenance and returned-ID dependencies", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FakeBacklog();
    const result = initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    const root = `${TARGET}/.authoring-backlog`;
    const tasks = backlog.listTasks(root);

    expect(result.materialisedTaskTitles).toHaveLength(38);
    expect(tasks).toHaveLength(38);
    expect(tasks.slice(0, 8).map(({ title }) => title)).toEqual(
      projectWideAuthoringTasks().map(({ title }) => title),
    );
    expect(tasks[8]?.title).toBe("Prepare shared project work for demo");
    expect(tasks[9]?.title).toBe("Verify shared project work for demo");
    expect(backlog.readTask(root, "authoring-9")).toMatchObject({
      labels: templateTaskProvenanceLabels({
        producer: { source: "built-in", scope: "project", name: "minimal" },
        revision: "project-r1",
        key: "shared-work",
      }),
      dependencies: [],
    });
    expect(backlog.readTask(root, "authoring-10")).toMatchObject({
      labels: expect.arrayContaining([TEMPLATE_TASK_LABEL, "wpm:template-key:verify-shared-work"]),
      dependencies: ["authoring-9", "authoring-1"],
    });

    expect(tasks[22]?.title).toBe("Prepare alpha shared work");
    expect(tasks[23]?.title).toBe("Verify alpha shared work");
    expect(backlog.readTask(root, "authoring-23")).toMatchObject({
      labels: templateTaskProvenanceLabels({
        producer: { source: "built-in", scope: "bundle", name: "default" },
        revision: "bundle-r2",
        key: "shared-work",
        bundleId: "alpha",
      }),
      dependencies: ["authoring-11"],
    });
    expect(backlog.readTask(root, "authoring-24")).toMatchObject({
      dependencies: ["authoring-23"],
    });
    expect(tasks[36]?.title).toBe("Prepare beta shared work");
    expect(tasks[37]?.title).toBe("Verify beta shared work");
    expect(backlog.readTask(root, "authoring-37")).toMatchObject({
      labels: expect.arrayContaining(["wpm:bundle:beta", "wpm:template-key:shared-work"]),
      dependencies: ["authoring-25"],
    });
    expect(backlog.readTask(root, "authoring-38")).toMatchObject({
      dependencies: ["authoring-37"],
    });
  });

  it("TASK-126 — verifies the complete exact task store before publishing handoff preparation", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new CorruptAfterFinalTaskBacklog();

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    expect(caught).toMatchObject({
      failedBeat: "MATERIALISE",
      failed: { id: "authoring-task-plan:verify" },
      completed: expect.arrayContaining([
        expect.objectContaining({
          id: "authoring-task:template:built-in:bundle:default@bundle-r2:verify-shared-work#bundle:beta",
        }),
      ]),
      unattempted: expect.arrayContaining([
        expect.objectContaining({ id: "handoff-receipt:preparing" }),
      ]),
    });
    expect(fs.inspectPath(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`).kind).toBe("missing");
    expect(JSON.parse(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "applying",
    });
  });

  it.each([
    "Prepare shared project work for demo",
    "Verify shared project work for demo",
    "Prepare alpha shared work",
    "Verify alpha shared work",
    "Prepare beta shared work",
    "Verify beta shared work",
  ])("TASK-126 — every additional task boundary is typed and the identical request converges: %s", (failureTitle) => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FailOnceAtTaskTitleBacklog(failureTitle);
    const input = { targetDir: TARGET, name: "demo" } as const;

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    const failure = caught as MutationFailure;
    expect(failure.failed.id).toContain("authoring-task:");
    expect(failure.failedBeat).toBe("MATERIALISE");
    expect(failure.completed.map(({ id }) => id)).toContain("authoring-backlog:init");
    expect(failure.unattempted.length).toBeGreaterThan(0);
    expect(failure.recovery).toMatch(/identical init request/i);
    expect(failure.recovery).toContain("no rollback or generic resume is claimed");
    expect(failure.recovery).not.toMatch(
      /will roll back|resume from|reconcil|successfully initialized/i,
    );

    expect(() => initProject(deps(fs, backlog), input)).not.toThrow();
    expect(backlog.listTasks(`${TARGET}/.authoring-backlog`)).toHaveLength(38);
    expect(backlog.readTask(`${TARGET}/.authoring-backlog`, "authoring-38")).toMatchObject({
      title: "Verify beta shared work",
      dependencies: ["authoring-37"],
    });
  });

  it.each([
    "dependencies",
    "labels",
  ] as const)("TASK-126 — final receipt retry rejects changed template-task %s without further mutation", (field) => {
    const countController = new InitBoundaryController();
    const countFs = seedTemplateWithCompleteTaskPacks(
      seedTemplates(new InitBoundaryFileSystem(countController)),
    );
    const countBacklog = new InitBoundaryBacklog(countController);
    countController.arm(Number.MAX_SAFE_INTEGER);
    initProject(deps(countFs, countBacklog), { targetDir: TARGET, name: "demo" });

    const controller = new InitBoundaryController();
    const fs = seedTemplateWithCompleteTaskPacks(
      seedTemplates(new InitBoundaryFileSystem(controller)),
    );
    const backlog = new CorruptibleInitBoundaryBacklog(controller);
    controller.arm(countController.count());
    let caught: unknown;
    try {
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MutationFailure);
    expect((caught as MutationFailure).failed.id).toBe("handoff-receipt:prepared");
    backlog.corruptTemplateTask(field);
    controller.disarm();
    const receiptBefore = fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);

    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" })).toThrow(
      WorkspaceIntegrationPreflightError,
    );
    expect(fs.read(`${TARGET}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
    expect(backlog.listTasks(`${TARGET}/.authoring-backlog`)).toHaveLength(38);
  });

  it("TASK-126 — a changed task contribution cannot continue an applying prefix", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FailOnceAtTaskTitleBacklog("Prepare alpha shared work");
    const input = { targetDir: TARGET, name: "demo" } as const;
    expect(() => initProject(deps(fs, backlog), input)).toThrow(MutationFailure);
    const root = `${TARGET}/.authoring-backlog`;
    const existingBefore = backlog.listTasks(root).map(({ id }) => backlog.readTask(root, id));
    const stateBefore = fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`);
    fs.write(
      `${BUILTIN}/project/minimal/template.yml`,
      fs
        .read(`${BUILTIN}/project/minimal/template.yml`)
        .replace('revision: "project-r1"', 'revision: "project-r3"'),
    );

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-partial-request-mismatch" }),
      ]),
    );
    expect(backlog.listTasks(root).map(({ id }) => backlog.readTask(root, id))).toEqual(
      existingBefore,
    );
    expect(fs.read(`${TARGET}/${WORKSPACE_INTEGRATION_STATE_PATH}`)).toBe(stateBefore);
  });

  it("TASK-126 — rejects manifest/path/rendered bundle identity disagreement before any effect", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FakeBacklog();
    fs.write(
      `${BUILTIN}/project/minimal/files/bundles/alpha/bundle.yml`,
      "id: other\nversion: 1.0.0\nsummary: mismatched bundle\nconfirmation: safe\nrequires: {}\n",
    );

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "template-task-bundle-identity-mismatch",
          message: expect.stringContaining("#bundle:alpha"),
        }),
      ]),
    );
    expect(fs.inspectPath(TARGET).kind).toBe("missing");
    expect(backlog.inspectRoot(`${TARGET}/.authoring-backlog`).valid).toBe(false);
  });

  it("TASK-126 — aggregates project/bundle contribution findings with an independent target blocker before writes", () => {
    const fs = seedTemplateWithTargetAndBundle();
    const backlog = new FakeBacklog();
    fs.write(
      `${BUILTIN}/project/minimal/template.yml`,
      [
        "name: minimal",
        "scope: project",
        'revision: "1"',
        "authoring-tasks:",
        "  - key: broken-project",
        "    title: Bad {{wpm.bundle.id}}",
        "    acceptance-criteria: []",
        "    depends-on: [self:missing]",
        "",
      ].join("\n"),
    );
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      [
        "name: default",
        "scope: bundle",
        'revision: "1"',
        "authoring-tasks:",
        "  - key: collide-advisor",
        "    title: Write advisor content for core",
        "    acceptance-criteria:",
        "      - The collision is observable",
        "",
      ].join("\n"),
    );
    fs.remove(`${BUILTIN}/project/minimal/snippets/AGENTS.md`);
    fs.write(`${TARGET}/USER.txt`, "preserve\n");
    const before = filesUnder(fs, TARGET).map((path) => [path, fs.read(path)] as const);

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    const blockers = (caught as WorkspaceIntegrationPreflightError).blockers;
    expect(blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "workspace-target-exists",
        "project-derived-plan-invalid",
        "template-task-acceptance-criteria-empty",
        "template-task-unavailable-context",
        "template-task-unresolved-dependency",
        "template-task-rendered-title-collision",
      ]),
    );
    expect(
      blockers.find(({ code }) => code === "template-task-unavailable-context")?.message,
    ).toContain("template:built-in:project:minimal@1");
    expect(
      blockers.find(({ code }) => code === "template-task-rendered-title-collision")?.message,
    ).toContain("#bundle:core");
    expect(filesUnder(fs, TARGET).map((path) => [path, fs.read(path)] as const)).toEqual(before);
    expect(backlog.inspectRoot(`${TARGET}/.authoring-backlog`).valid).toBe(false);
  });

  it("TASK-126 — still inspects the project contribution when bundle projection is invalid", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FakeBacklog();
    fs.write(
      `${BUILTIN}/project/minimal/template.yml`,
      [
        "name: minimal",
        "scope: project",
        'revision: "invalid-projection-r1"',
        "parameters:",
        "  - name: project-name",
        "authoring-tasks:",
        "  - key: broken-project",
        "    title: Broken project work for {{wpm.project.name}}",
        "    acceptance-criteria: []",
        "    depends-on: [self:missing]",
        "",
      ].join("\n"),
    );
    fs.write(
      `${BUILTIN}/bundle/default/template.yml`,
      [
        "name: default",
        "scope: bundle",
        'revision: "invalid-bundle-r1"',
        "parameters:",
        "  - name: bundle-id",
        "  - name: version",
        "  - name: project-name",
        "authoring-tasks:",
        "  - key: broken-bundle",
        "    title: Broken {{wpm.bundle.id}} work",
        "    acceptance-criteria: []",
        "    depends-on: [self:missing]",
        "",
      ].join("\n"),
    );
    fs.remove(`${BUILTIN}/project/minimal/files/bundles/alpha/bundle.yml`);

    let caught: unknown;
    try {
      initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "project-template-invalid",
        "template-task-bundle-context-invalid",
        "template-task-acceptance-criteria-empty",
        "template-task-unresolved-dependency",
      ]),
    );
    const messages = (caught as WorkspaceIntegrationPreflightError).blockers.map(
      ({ message }) => message,
    );
    expect(messages.some((message) => message.includes("#bundle:alpha"))).toBe(true);
    expect(messages.some((message) => message.includes("#bundle:beta"))).toBe(true);
    expect(fs.inspectPath(TARGET).kind).toBe("missing");
    expect(backlog.inspectRoot(`${TARGET}/.authoring-backlog`).valid).toBe(false);
  });

  it("TASK-126 — completed workspace tasks do not depend on later template-source availability", () => {
    const fs = seedTemplateWithCompleteTaskPacks();
    const backlog = new FakeBacklog();
    initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" });
    const root = `${TARGET}/.authoring-backlog`;
    const before = backlog.listTasks(root).map(({ id }) => backlog.readTask(root, id));

    fs.remove(`${BUILTIN}/project/minimal`);
    fs.remove(`${BUILTIN}/bundle/default`);
    expect(() => initProject(deps(fs, backlog), { targetDir: TARGET, name: "demo" })).toThrow(
      WorkspaceIntegrationPreflightError,
    );
    expect(backlog.listTasks(root).map(({ id }) => backlog.readTask(root, id))).toEqual(before);
  });
});

describe("projectWideAuthoringTasks (doc 11 §3 — Materialised by `wpm init`)", () => {
  it("returns the 8 project-wide task titles, each with at least one acceptance criterion", () => {
    const tasks = projectWideAuthoringTasks();
    expect(tasks).toHaveLength(8);
    const titles = tasks.map((t) => t.title);
    expect(titles).toEqual([
      "Set project metadata",
      "Confirm target agents",
      "Verify manifest coherence",
      "Verify scope-alias symlinks",
      "Verify AGENTS.md and main installer skill are current",
      "Verify helpers and advisors registered",
      "Bump project release version",
      "Build dry-run",
    ]);
    for (const t of tasks) {
      expect(t.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });
});

describe("initProject retained personal authoring defaults", () => {
  it("uses canonical retained defaults only when the workspace selection is absent", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const home = "/home/author";
    fs.makeDirectories(home);
    const env = new FakeEnvironment({ env: { HOME: home } });
    setupPersonalAuthoring(
      { fs, env },
      {
        bundledSkillsRoot: BUNDLED_SKILLS,
        clientIds: ["codex", "claude-code"],
        setupVersion: "0.1.0",
      },
    );

    const result = executeInitProject(
      { ...deps(fs, backlog), env },
      { targetDir: TARGET, name: "defaults-demo" },
    );

    expect(result.authoringIntegration.selectedClients).toEqual(["codex", "claude-code"]);
    expect(result.handoff.configuredClients).toEqual(["codex", "claude-code"]);
  });

  it("an explicit workspace selection bypasses and replaces malformed retained state", () => {
    const fs = seedTemplates();
    const backlog = new FakeBacklog();
    const home = "/home/author";
    fs.write(`${home}/${PERSONAL_AUTHORING_STATE_PATH}`, "user-modified state\n");
    const env = new FakeEnvironment({ env: { HOME: home } });

    const result = executeInitProject(
      { ...deps(fs, backlog), env },
      {
        targetDir: TARGET,
        name: "explicit-demo",
        authoringClientIds: ["claude-code"],
      },
    );

    expect(result.authoringIntegration.selectedClients).toEqual(["claude-code"]);
    expect(fs.read(`${home}/${PERSONAL_AUTHORING_STATE_PATH}`)).toBe("user-modified state\n");
  });

  it("malformed retained state blocks an omitted selection before target creation", () => {
    const fs = seedTemplates();
    const home = "/home/author";
    fs.write(`${home}/${PERSONAL_AUTHORING_STATE_PATH}`, "user-modified state\n");
    const env = new FakeEnvironment({ env: { HOME: home } });

    let error: unknown;
    try {
      executeInitProject(
        { ...deps(fs, new FakeBacklog()), env },
        { targetDir: TARGET, name: "blocked-defaults" },
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((error as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "personal-state-invalid" })]),
    );
    expect(fs.inspectPath(TARGET).kind).toBe("missing");
  });
});
