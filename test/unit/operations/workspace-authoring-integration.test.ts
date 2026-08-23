import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { MutationFailure, WorkspaceIntegrationPreflightError } from "../../../src/core/errors.js";
import {
  integrateWorkspaceAuthoring,
  type WorkspaceAuthoringIntegrationDeps,
} from "../../../src/core/operations/workspace-authoring-integration.js";
import {
  MANAGED_FRONT_DOOR_END,
  MANAGED_FRONT_DOOR_START,
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
} from "../../../src/core/services/workspace-authoring-integration.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const WORKSPACE = "/authoring/demo";
const DELIVERABLE = `${WORKSPACE}/wip`;
const BACKLOG_ROOT = `${WORKSPACE}/.authoring-backlog`;
const BUNDLED_SKILLS = "/package/agent-skills";
const BUILTIN_TEMPLATES = "/package/templates";

function copyHostTree(fs: MemoryFileSystem, hostRoot: string, memoryRoot: string): void {
  for (const entry of readdirSync(hostRoot, { withFileTypes: true })) {
    const hostPath = join(hostRoot, entry.name);
    const memoryPath = `${memoryRoot}/${entry.name}`;
    if (entry.isDirectory()) {
      fs.makeDirectories(memoryPath);
      copyHostTree(fs, hostPath, memoryPath);
    } else {
      fs.write(memoryPath, readFileSync(hostPath, "utf8"));
    }
  }
}

function legacyFrontDoor(projectName = "demo"): string {
  return readFileSync(
    join(REPO_ROOT, "templates", "project", "minimal", "snippets", "authoring-front-door.md.tmpl"),
    "utf8",
  ).replaceAll("{{project-name}}", projectName);
}

function makeLegacyHarness(fs = new MemoryFileSystem()): {
  fs: MemoryFileSystem;
  backlog: FakeBacklog;
  deps: WorkspaceAuthoringIntegrationDeps;
} {
  copyHostTree(fs, join(REPO_ROOT, "agent-skills"), BUNDLED_SKILLS);
  copyHostTree(fs, join(REPO_ROOT, "templates"), BUILTIN_TEMPLATES);
  fs.write(
    `${DELIVERABLE}/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      "  - hermes",
      "bundles: []",
      "",
    ].join("\n"),
  );
  fs.makeDirectories(`${WORKSPACE}/builds`);
  fs.write(`${WORKSPACE}/AGENTS.md`, legacyFrontDoor());
  fs.ensureAlias(`${WORKSPACE}/AGENTS.md`, `${WORKSPACE}/CLAUDE.md`);
  fs.makeDirectories(BACKLOG_ROOT);
  const backlog = new FakeBacklog();
  backlog.init(BACKLOG_ROOT, { taskPrefix: "authoring" });
  backlog.createTask(BACKLOG_ROOT, {
    title: "Preserve existing authoring history",
    acceptanceCriteria: ["history remains intact"],
  });
  return {
    fs,
    backlog,
    deps: {
      fs,
      backlog,
      bundledSkillsRoot: BUNDLED_SKILLS,
      builtinTemplatesRoot: BUILTIN_TEMPLATES,
    },
  };
}

function snapshot(fs: MemoryFileSystem, root = WORKSPACE): Record<string, string> {
  const values: Record<string, string> = {};
  const visit = (path: string): void => {
    const inspected = fs.inspectPath(path);
    values[path] = inspected.kind === "symbolic-link" ? `link:${inspected.target}` : inspected.kind;
    if (inspected.kind === "file") {
      values[path] = `file:${fs.read(path)}`;
    }
    if (inspected.kind === "directory") {
      for (const entry of fs.list(path).sort((a, b) => a.name.localeCompare(b.name))) {
        visit(`${path}/${entry.name}`);
      }
    }
  };
  visit(root);
  return values;
}

function request(clientIds: readonly string[], integrationVersion = "0.1.0") {
  return {
    workspaceRoot: WORKSPACE,
    clientIds,
    integrationVersion,
  };
}

describe("workspace authoring integration", () => {
  it("rejects empty and unsupported selections with stable blocker codes before every write", () => {
    for (const [clientIds, code] of [
      [[], "authoring-clients-empty"],
      [["openclaw"], "authoring-client-unsupported"],
    ] as const) {
      const harness = makeLegacyHarness();
      const before = snapshot(harness.fs);

      let caught: unknown;
      try {
        integrateWorkspaceAuthoring(harness.deps, request(clientIds));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
      expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
        expect.arrayContaining([expect.objectContaining({ code })]),
      );
      expect((caught as WorkspaceIntegrationPreflightError).handoffPrepared).toBe(false);
      expect(snapshot(harness.fs)).toEqual(before);
    }
  });

  it("rejects non-canonical integration versions before marker rendering or workspace writes", () => {
    for (const integrationVersion of ["v0.1.0", "0.1", `0.1.0\n${MANAGED_FRONT_DOOR_END}`]) {
      const harness = makeLegacyHarness();
      const before = snapshot(harness.fs);

      let caught: unknown;
      try {
        integrateWorkspaceAuthoring(harness.deps, request(["codex"], integrationVersion));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
      expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "integration-version-invalid" })]),
      );
      expect(snapshot(harness.fs)).toEqual(before);
    }
  });

  it("adopts an exact legacy workspace for Codex only without touching targets or backlog history", () => {
    const harness = makeLegacyHarness();
    const manifestBefore = harness.fs.read(`${DELIVERABLE}/manifest.yml`);
    const tasksBefore = harness.backlog.listTasks(BACKLOG_ROOT);

    const result = integrateWorkspaceAuthoring(harness.deps, request(["codex"]));

    expect(result).toMatchObject({
      selectedClients: ["codex"],
      integrationVersion: "0.1.0",
      origin: "legacy-adopted",
      statePath: WORKSPACE_INTEGRATION_STATE_PATH,
      handoffPrepared: false,
    });
    for (const skill of WORKSPACE_SKILL_NAMES) {
      const installed = `${WORKSPACE}/.agents/skills/${skill}/SKILL.md`;
      expect(harness.fs.read(installed)).toBe(
        harness.fs.read(`${BUNDLED_SKILLS}/${skill}/SKILL.md`),
      );
      expect(harness.fs.exists(`${WORKSPACE}/.claude/skills/${skill}`)).toBe(false);
    }
    expect(harness.fs.read(`${WORKSPACE}/AGENTS.md`)).toContain(MANAGED_FRONT_DOOR_START);
    expect(harness.fs.read(`${WORKSPACE}/AGENTS.md`)).toContain("$wpm-author");
    expect(harness.fs.read(`${WORKSPACE}/AGENTS.md`)).toContain(WORKSPACE_INTEGRATION_STATE_PATH);
    expect(harness.fs.exists(`${WORKSPACE}/CLAUDE.md`)).toBe(false);
    expect(harness.fs.read(`${DELIVERABLE}/manifest.yml`)).toBe(manifestBefore);
    expect(harness.backlog.listTasks(BACKLOG_ROOT)).toEqual(tasksBefore);

    const state = JSON.parse(
      harness.fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`),
    ) as Record<string, unknown>;
    expect(state).toMatchObject({
      schemaVersion: 1,
      status: "complete",
      workspaceRoot: WORKSPACE,
      integrationVersion: "0.1.0",
      selectedClients: ["codex"],
      origin: "legacy-adopted",
      reconciliation: { strategy: "exact-owned-content" },
    });
    expect(state).not.toHaveProperty("handoff");
    expect(JSON.stringify(state)).not.toContain(`${DELIVERABLE}/`);
  });

  it("installs both native families and keeps package-owned skill names untouched", () => {
    const harness = makeLegacyHarness();
    harness.fs.write(`${DELIVERABLE}/installer-skills/demo-installer/SKILL.md`, "package skill\n");
    harness.fs.write(`${DELIVERABLE}/bundles/demo-advisor/SKILL.md`, "advisor\n");
    const packageBytes = snapshot(harness.fs, DELIVERABLE);

    integrateWorkspaceAuthoring(harness.deps, request(["claude-code", "codex"]));

    for (const [scope, frontDoor, invocation] of [
      [".agents/skills", "AGENTS.md", "$wpm-author"],
      [".claude/skills", "CLAUDE.md", "/wpm-author"],
    ] as const) {
      for (const skill of WORKSPACE_SKILL_NAMES) {
        expect(harness.fs.exists(`${WORKSPACE}/${scope}/${skill}/SKILL.md`)).toBe(true);
      }
      const text = harness.fs.read(`${WORKSPACE}/${frontDoor}`);
      expect(text).toContain(invocation);
      expect(text.match(new RegExp(MANAGED_FRONT_DOOR_START, "g"))).toHaveLength(1);
      expect(text.match(new RegExp(MANAGED_FRONT_DOOR_END, "g"))).toHaveLength(1);
    }
    const state = JSON.parse(
      harness.fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`),
    ) as { selectedClients: string[] };
    expect(state.selectedClients).toEqual(["codex", "claude-code"]);
    expect(snapshot(harness.fs, DELIVERABLE)).toEqual(packageBytes);
  });

  it("reapplies unchanged integration as a no-op and preserves surrounding user front-door bytes", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    const managed = harness.fs.read(`${WORKSPACE}/AGENTS.md`);
    harness.fs.write(`${WORKSPACE}/AGENTS.md`, `USER-PREFIX\n${managed}USER-SUFFIX\n`);

    const first = integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    const afterFirst = snapshot(harness.fs);
    const second = integrateWorkspaceAuthoring(harness.deps, request(["codex"]));

    expect(first.changedPaths).toEqual([]);
    expect(second.changedPaths).toEqual([]);
    expect(snapshot(harness.fs)).toEqual(afterFirst);
    expect(harness.fs.read(`${WORKSPACE}/AGENTS.md`)).toBe(`USER-PREFIX\n${managed}USER-SUFFIX\n`);
  });

  it("adds a newly selected front-door block alongside user content and never duplicates it", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    harness.fs.write(`${WORKSPACE}/CLAUDE.md`, "# User Claude rules\n\nKeep this exact.\n");

    integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));

    const claude = harness.fs.read(`${WORKSPACE}/CLAUDE.md`);
    expect(claude.startsWith("# User Claude rules\n\nKeep this exact.\n")).toBe(true);
    expect(claude.match(new RegExp(MANAGED_FRONT_DOOR_START, "g"))).toHaveLength(1);
    expect(claude).toContain("/wpm-author");
  });

  it("restores exact pre-existing front-door bytes after add then deselect", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    for (const original of ["USER-WITHOUT-NEWLINE", "USER-WITH-NEWLINE\n"]) {
      harness.fs.write(`${WORKSPACE}/CLAUDE.md`, original);
      integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
      expect(harness.fs.read(`${WORKSPACE}/CLAUDE.md`)).toBe(original);
    }
  });

  it("updates only proven WPM-owned stale skill and block bytes to a coherent new version", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"], "0.1.0"));
    const sourcePath = `${BUNDLED_SKILLS}/wpm-author/SKILL.md`;
    harness.fs.write(sourcePath, `${harness.fs.read(sourcePath)}\nNEW-WPM-VERSION\n`);

    integrateWorkspaceAuthoring(harness.deps, request(["codex"], "0.2.0"));

    expect(harness.fs.read(`${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`)).toContain(
      "NEW-WPM-VERSION",
    );
    expect(harness.fs.read(`${WORKSPACE}/AGENTS.md`)).toContain("0.2.0");
    const state = JSON.parse(
      harness.fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`),
    ) as { integrationVersion: string; ownedPaths: Array<{ version: string }> };
    expect(state.integrationVersion).toBe("0.2.0");
    expect(state.ownedPaths.every(({ version }) => version === "0.2.0")).toBe(true);
  });

  it("aggregates user-modified and ambiguous ownership conflicts before changing any path", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    harness.fs.write(
      `${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`,
      "user changed owned bytes\n",
    );
    harness.fs.write(
      `${WORKSPACE}/AGENTS.md`,
      `${MANAGED_FRONT_DOOR_START}\nbroken without an end marker\n`,
    );
    const before = snapshot(harness.fs);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"], "0.2.0"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["owned-skill-modified", "front-door-markers-ambiguous"]),
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("rejects desired-vNext bytes that do not match the recorded prior ownership proof", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"], "0.1.0"));
    const sourcePath = `${BUNDLED_SKILLS}/wpm-author/SKILL.md`;
    const desired = `${harness.fs.read(sourcePath)}\nNEW-WPM-VERSION\n`;
    harness.fs.write(sourcePath, desired);
    harness.fs.write(`${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`, desired);
    harness.fs.write(
      `${WORKSPACE}/AGENTS.md`,
      harness.fs.read(`${WORKSPACE}/AGENTS.md`).replaceAll("0.1.0", "0.2.0"),
    );
    const before = snapshot(harness.fs);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"], "0.2.0"));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["owned-skill-modified", "owned-front-door-modified"]),
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("rejects a modified legacy lookalike before adoption and preserves every byte", () => {
    const harness = makeLegacyHarness();
    harness.fs.write(`${WORKSPACE}/AGENTS.md`, `${legacyFrontDoor()}USER CHANGE\n`);
    const before = snapshot(harness.fs);

    expect(() => integrateWorkspaceAuthoring(harness.deps, request(["claude-code"]))).toThrow(
      WorkspaceIntegrationPreflightError,
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("rejects even byte-matching package content at an unowned legacy destination", () => {
    const harness = makeLegacyHarness();
    harness.fs.write(
      `${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`,
      harness.fs.read(`${BUNDLED_SKILLS}/wpm-author/SKILL.md`),
    );
    const before = snapshot(harness.fs);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "skill-destination-unowned" })]),
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("strictly rejects unknown managed-state fields without mutating owned content", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    const statePath = `${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`;
    const state = JSON.parse(harness.fs.read(statePath)) as Record<string, unknown>;
    harness.fs.write(
      statePath,
      `${JSON.stringify({ ...state, guessedSubsystem: true }, null, 2)}\n`,
    );
    const before = snapshot(harness.fs);

    expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
      WorkspaceIntegrationPreflightError,
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("does not recreate missing content claimed by a complete ownership record", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    harness.fs.remove(`${WORKSPACE}/.agents/skills/wpm-author`);
    harness.fs.remove(`${WORKSPACE}/AGENTS.md`);
    const before = snapshot(harness.fs);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["owned-skill-missing", "owned-front-door-missing"]),
    );
    expect(snapshot(harness.fs)).toEqual(before);
  });

  it("blocks aliases that could expose integration to an unselected client", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    harness.fs.makeDirectories("/outside");
    harness.fs.ensureAlias("/outside", `${WORKSPACE}/.claude`);
    harness.fs.ensureAlias(`${WORKSPACE}/AGENTS.md`, `${WORKSPACE}/CLAUDE.md`);
    const stateBefore = harness.fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "unselected-skill-ancestor-ambiguous",
        "unselected-front-door-ambiguous",
      ]),
    );
    expect(harness.fs.inspectPath(`${WORKSPACE}/.claude`).kind).toBe("symbolic-link");
    expect(harness.fs.inspectPath(`${WORKSPACE}/CLAUDE.md`).kind).toBe("symbolic-link");
    expect(harness.fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`)).toBe(stateBefore);
  });

  it("retires only proven deselected integration and preserves front-door user bytes", () => {
    const harness = makeLegacyHarness();
    integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    const managed = harness.fs.read(`${WORKSPACE}/CLAUDE.md`);
    harness.fs.write(`${WORKSPACE}/CLAUDE.md`, `USER-BEFORE\n${managed}USER-AFTER\n`);

    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    const retired = harness.fs.read(`${WORKSPACE}/CLAUDE.md`);
    expect(retired).toBe("USER-BEFORE\nUSER-AFTER\n");
    expect(retired).not.toContain(MANAGED_FRONT_DOOR_START);
    for (const skill of WORKSPACE_SKILL_NAMES) {
      expect(harness.fs.inspectPath(`${WORKSPACE}/.claude/skills/${skill}`).kind).toBe("missing");
      expect(harness.fs.exists(`${WORKSPACE}/.agents/skills/${skill}/SKILL.md`)).toBe(true);
    }
    expect(integrateWorkspaceAuthoring(harness.deps, request(["codex"])).changedPaths).toEqual([]);
  });
});

class FailOnceFileSystem extends MemoryFileSystem {
  private armedAt: number | undefined;
  private mutationCount = 0;

  arm(at: number): void {
    this.armedAt = at;
    this.mutationCount = 0;
  }

  disarm(): void {
    this.armedAt = undefined;
  }

  count(): number {
    return this.mutationCount;
  }

  private failIfArmed(path: string): void {
    if (this.armedAt === undefined) return;
    this.mutationCount += 1;
    if (this.mutationCount === this.armedAt) {
      this.armedAt = undefined;
      throw new Error(`injected mutation failure at ${path}`);
    }
  }

  override write(path: string, content: string): void {
    this.failIfArmed(path);
    super.write(path, content);
  }

  override remove(path: string): void {
    this.failIfArmed(path);
    super.remove(path);
  }
}

class ParentLeakingFileSystem extends MemoryFileSystem {
  private failPath: string | undefined;

  arm(path: string): void {
    this.failPath = path;
  }

  override write(path: string, content: string): void {
    if (path === this.failPath) {
      this.failPath = undefined;
      super.makeDirectories(dirname(path));
      throw new Error(`injected write failure after parent creation at ${path}`);
    }
    super.write(path, content);
  }
}

class PartialRetirementFileSystem extends MemoryFileSystem {
  private partialPath: string | undefined;

  arm(path: string): void {
    this.partialPath = path;
  }

  override remove(path: string): void {
    if (path === this.partialPath) {
      this.partialPath = undefined;
      super.remove(`${path}/SKILL.md`);
      throw new Error(`injected recursive removal failure after leaf deletion at ${path}`);
    }
    super.remove(path);
  }
}

describe("workspace integration partial-write evidence", () => {
  it("reports completed/failed/unattempted boundaries and identical retry converges", () => {
    const fs = new FailOnceFileSystem();
    const harness = makeLegacyHarness(fs);
    fs.arm(3);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MutationFailure);
    const failure = caught as MutationFailure;
    expect(failure.completed.length).toBeGreaterThan(0);
    expect(failure.failed.id).toMatch(/skill|front-door|state/);
    expect(failure.unattempted.length).toBeGreaterThan(0);
    expect(failure.recovery).toMatch(/same|identical.*request/i);
    const applying = JSON.parse(fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`)) as {
      status: string;
    };
    expect(applying.status).toBe("applying");

    fs.disarm();
    const result = integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    expect(result.selectedClients).toEqual(["codex", "claude-code"]);
    expect(JSON.parse(fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject({
      status: "complete",
    });
    for (const scope of [".agents/skills", ".claude/skills"]) {
      for (const skill of WORKSPACE_SKILL_NAMES) {
        expect(fs.exists(`${WORKSPACE}/${scope}/${skill}/SKILL.md`)).toBe(true);
      }
    }
    expect(
      fs.read(`${WORKSPACE}/AGENTS.md`).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
    ).toHaveLength(1);
    expect(
      fs.read(`${WORKSPACE}/CLAUDE.md`).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
    ).toHaveLength(1);
  });

  it("converges after a failure at every ordered write/remove boundary", () => {
    const counterFs = new FailOnceFileSystem();
    const counterHarness = makeLegacyHarness(counterFs);
    counterFs.arm(Number.MAX_SAFE_INTEGER);
    integrateWorkspaceAuthoring(counterHarness.deps, request(["codex", "claude-code"]));
    const boundaryCount = counterFs.count();
    expect(boundaryCount).toBeGreaterThan(10);

    for (let at = 1; at <= boundaryCount; at += 1) {
      const fs = new FailOnceFileSystem();
      const harness = makeLegacyHarness(fs);
      fs.arm(at);
      expect(
        () => integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"])),
        `boundary ${at}`,
      ).toThrow(MutationFailure);
      fs.disarm();
      expect(
        integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"])),
        `retry after boundary ${at}`,
      ).toMatchObject({ selectedClients: ["codex", "claude-code"] });
      expect(JSON.parse(fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject(
        { status: "complete" },
      );
      expect(
        fs.read(`${WORKSPACE}/AGENTS.md`).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
      ).toHaveLength(1);
      expect(
        fs.read(`${WORKSPACE}/CLAUDE.md`).match(new RegExp(MANAGED_FRONT_DOOR_START, "g")),
      ).toHaveLength(1);
    }
  });

  it("converges after a real adapter-style write failure leaves an empty skill directory", () => {
    const fs = new ParentLeakingFileSystem();
    const harness = makeLegacyHarness(fs);
    const destination = `${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`;
    fs.arm(destination);

    expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
      MutationFailure,
    );
    expect(fs.inspectPath(dirname(destination)).kind).toBe("directory");
    expect(fs.list(dirname(destination))).toEqual([]);

    expect(integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toMatchObject({
      selectedClients: ["codex"],
    });
    expect(fs.inspectPath(destination).kind).toBe("file");
  });

  it("finishes a retirement whose recursive removal left only the empty owned directory", () => {
    const fs = new PartialRetirementFileSystem();
    const harness = makeLegacyHarness(fs);
    integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    const destination = `${WORKSPACE}/.claude/skills/wpm-author`;
    fs.arm(destination);

    expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
      MutationFailure,
    );
    expect(fs.inspectPath(destination).kind).toBe("directory");
    expect(fs.list(destination)).toEqual([]);

    expect(integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toMatchObject({
      selectedClients: ["codex"],
    });
    expect(fs.inspectPath(destination).kind).toBe("missing");
  });

  it("never retires a legacy path replaced by user content between a partial write and retry", () => {
    const fs = new FailOnceFileSystem();
    const harness = makeLegacyHarness(fs);
    fs.arm(2);
    expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
      MutationFailure,
    );
    fs.disarm();
    fs.remove(`${WORKSPACE}/CLAUDE.md`);
    fs.write(`${WORKSPACE}/CLAUDE.md`, "user replacement\n");

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "partial-front-door-conflict" })]),
    );
    expect(fs.read(`${WORKSPACE}/CLAUDE.md`)).toBe("user replacement\n");
  });

  it("converges at every legacy single-client retirement boundary", () => {
    const counterFs = new FailOnceFileSystem();
    const counterHarness = makeLegacyHarness(counterFs);
    counterFs.arm(Number.MAX_SAFE_INTEGER);
    integrateWorkspaceAuthoring(counterHarness.deps, request(["codex"]));
    const boundaryCount = counterFs.count();
    expect(boundaryCount).toBeGreaterThan(5);

    for (let at = 1; at <= boundaryCount; at += 1) {
      const fs = new FailOnceFileSystem();
      const harness = makeLegacyHarness(fs);
      fs.arm(at);
      expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
        MutationFailure,
      );
      fs.disarm();
      expect(integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toMatchObject({
        selectedClients: ["codex"],
      });
      expect(fs.inspectPath(`${WORKSPACE}/CLAUDE.md`).kind).toBe("missing");
    }
  });

  it("converges at every Claude-only legacy boundary with canonical retry state", () => {
    const counterFs = new FailOnceFileSystem();
    const counterHarness = makeLegacyHarness(counterFs);
    counterFs.arm(Number.MAX_SAFE_INTEGER);
    integrateWorkspaceAuthoring(counterHarness.deps, request(["claude-code"]));
    const boundaryCount = counterFs.count();
    expect(boundaryCount).toBeGreaterThan(5);

    for (let at = 1; at <= boundaryCount; at += 1) {
      const fs = new FailOnceFileSystem();
      const harness = makeLegacyHarness(fs);
      fs.arm(at);
      expect(() => integrateWorkspaceAuthoring(harness.deps, request(["claude-code"]))).toThrow(
        MutationFailure,
      );
      fs.disarm();
      expect(integrateWorkspaceAuthoring(harness.deps, request(["claude-code"]))).toMatchObject({
        selectedClients: ["claude-code"],
      });
      expect(fs.inspectPath(`${WORKSPACE}/AGENTS.md`).kind).toBe("missing");
      expect(fs.inspectPath(`${WORKSPACE}/CLAUDE.md`).kind).toBe("file");
      expect(JSON.parse(fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`))).toMatchObject(
        { status: "complete", selectedClients: ["claude-code"] },
      );
    }
  });

  it("never recreates an added-client front door after its user preimage is deleted mid-apply", () => {
    const fs = new FailOnceFileSystem();
    const harness = makeLegacyHarness(fs);
    integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    fs.write(`${WORKSPACE}/CLAUDE.md`, "USER CLAUDE INSTRUCTIONS\n");
    fs.arm(2);
    expect(() =>
      integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"])),
    ).toThrow(MutationFailure);
    fs.disarm();
    const applyingState = fs.read(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`);
    expect(applyingState).not.toContain("USER CLAUDE INSTRUCTIONS");
    expect(applyingState).toMatch(/"sha256": "sha256:[a-f0-9]{64}"/);
    fs.remove(`${WORKSPACE}/CLAUDE.md`);

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "partial-front-door-conflict" })]),
    );
    expect(fs.inspectPath(`${WORKSPACE}/CLAUDE.md`).kind).toBe("missing");
  });

  it("never adopts different marker-free user bytes after a retired block was removed mid-apply", () => {
    const fs = new FailOnceFileSystem();
    const harness = makeLegacyHarness(fs);
    integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
    const managed = fs.read(`${WORKSPACE}/CLAUDE.md`);
    fs.write(`${WORKSPACE}/CLAUDE.md`, `USER-BEFORE\n${managed}USER-AFTER\n`);
    fs.arm(8);

    let failure: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(MutationFailure);
    expect((failure as MutationFailure).failed.id).toBe("managed-state:complete");
    expect(fs.read(`${WORKSPACE}/CLAUDE.md`)).toBe("USER-BEFORE\nUSER-AFTER\n");
    fs.disarm();
    fs.write(`${WORKSPACE}/CLAUDE.md`, "DIFFERENT USER BYTES\n");

    let caught: unknown;
    try {
      integrateWorkspaceAuthoring(harness.deps, request(["codex"]));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WorkspaceIntegrationPreflightError);
    expect((caught as WorkspaceIntegrationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "partial-front-door-conflict" })]),
    );
    expect(fs.read(`${WORKSPACE}/CLAUDE.md`)).toBe("DIFFERENT USER BYTES\n");
  });

  it("converges at every managed deselection boundary while preserving user front-door bytes", () => {
    const countFs = new FailOnceFileSystem();
    const countHarness = makeLegacyHarness(countFs);
    integrateWorkspaceAuthoring(countHarness.deps, request(["codex", "claude-code"]));
    const managed = countFs.read(`${WORKSPACE}/CLAUDE.md`);
    countFs.write(`${WORKSPACE}/CLAUDE.md`, `USER-BEFORE\n${managed}USER-AFTER\n`);
    countFs.arm(Number.MAX_SAFE_INTEGER);
    integrateWorkspaceAuthoring(countHarness.deps, request(["codex"]));
    const boundaryCount = countFs.count();
    expect(boundaryCount).toBeGreaterThan(5);

    for (let at = 1; at <= boundaryCount; at += 1) {
      const fs = new FailOnceFileSystem();
      const harness = makeLegacyHarness(fs);
      integrateWorkspaceAuthoring(harness.deps, request(["codex", "claude-code"]));
      const current = fs.read(`${WORKSPACE}/CLAUDE.md`);
      fs.write(`${WORKSPACE}/CLAUDE.md`, `USER-BEFORE\n${current}USER-AFTER\n`);
      fs.arm(at);
      expect(() => integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toThrow(
        MutationFailure,
      );
      fs.disarm();
      expect(integrateWorkspaceAuthoring(harness.deps, request(["codex"]))).toMatchObject({
        selectedClients: ["codex"],
      });
      expect(fs.read(`${WORKSPACE}/CLAUDE.md`)).toBe("USER-BEFORE\nUSER-AFTER\n");
      for (const skill of WORKSPACE_SKILL_NAMES) {
        expect(fs.inspectPath(`${WORKSPACE}/.claude/skills/${skill}`).kind).toBe("missing");
      }
    }
  });
});
