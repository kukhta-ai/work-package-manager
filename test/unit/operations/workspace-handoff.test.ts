import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  HandoffPreparationPreflightError,
  HandoffVerificationError,
  MutationFailure,
} from "../../../src/core/errors.js";
import { initProject } from "../../../src/core/operations/init-project.js";
import {
  prepareWorkspaceHandoff,
  verifyWorkspaceHandoff,
  type WorkspaceHandoffDeps,
} from "../../../src/core/operations/workspace-handoff.js";
import {
  parseManagedAuthoringState,
  serializeManagedAuthoringState,
  WORKSPACE_INTEGRATION_STATE_PATH,
} from "../../../src/core/services/workspace-authoring-integration.js";
import {
  parseWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../../src/core/services/workspace-handoff.js";
import { toPosix } from "../../../src/util/posix-path.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const WORKSPACE = "/authoring/demo";
const SKILLS = "/package/agent-skills";
const TEMPLATES = "/package/templates";

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

class ReceiptFailOnceFileSystem extends MemoryFileSystem {
  private receiptWrite = 0;
  private failAt: number | undefined;

  armReceiptWrite(at: number): void {
    this.receiptWrite = 0;
    this.failAt = at;
  }

  override write(path: string, content: string): void {
    if (
      toPosix(path) === toPosix(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`) &&
      this.failAt !== undefined
    ) {
      this.receiptWrite += 1;
      if (this.receiptWrite === this.failAt) {
        this.failAt = undefined;
        throw new Error(`injected handoff receipt write ${this.receiptWrite}`);
      }
    }
    super.write(path, content);
  }
}

function makeWorkspace(
  fs: MemoryFileSystem = new MemoryFileSystem(),
  clientIds: readonly ("codex" | "claude-code")[] = ["codex", "claude-code"],
): {
  readonly fs: MemoryFileSystem;
  readonly backlog: FakeBacklog;
  readonly deps: WorkspaceHandoffDeps;
} {
  copyHostTree(fs, join(REPO_ROOT, "agent-skills"), SKILLS);
  copyHostTree(fs, join(REPO_ROOT, "templates"), TEMPLATES);
  const backlog = new FakeBacklog();
  const result = initProject(
    {
      fs,
      backlog,
      env: new FakeEnvironment({ env: {} }),
      builtinTemplatesRoot: TEMPLATES,
      bundledSkillsRoot: SKILLS,
      integrationVersion: "0.1.0",
    },
    {
      targetDir: WORKSPACE,
      name: "demo",
      authoringClientIds: clientIds,
    },
  );
  expect(result.handoffPrepared).toBe(true);
  return { fs, backlog, deps: { fs, backlog, bundledSkillsRoot: SKILLS } };
}

describe("workspace handoff preparation", () => {
  it("fresh init publishes one canonical prepared receipt and exact per-client next actions", () => {
    const harness = makeWorkspace();
    const parsed = parseWorkspaceHandoffReceipt(
      harness.fs.read(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`),
    );

    expect(parsed).toMatchObject({
      ok: true,
      value: {
        status: "prepared",
        workspaceRoot: WORKSPACE,
        configuredClients: ["codex", "claude-code"],
      },
    });
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.value.clients.map(({ verification }) => verification.args.at(-1))).toEqual([
      "codex",
      "claude-code",
    ]);
  });

  it("keeps each single-client handoff selection explicit and independently verifiable", () => {
    for (const [client, invocation] of [
      ["codex", "$wpm-author"],
      ["claude-code", "/wpm-author"],
    ] as const) {
      const harness = makeWorkspace(new MemoryFileSystem(), [client]);
      const parsed = parseWorkspaceHandoffReceipt(
        harness.fs.read(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`),
      );
      expect(parsed).toMatchObject({
        ok: true,
        value: { status: "prepared", configuredClients: [client] },
      });
      expect(
        verifyWorkspaceHandoff(harness.deps, {
          workspaceRoot: WORKSPACE,
          actualWorkingDirectory: WORKSPACE,
          clientId: client,
          integrationVersion: "0.1.0",
        }),
      ).toMatchObject({
        status: "verified",
        selectedClient: client,
        clients: [{ id: client, status: "valid" }],
        nextAction: { invocation },
      });
    }
  });

  it("prepares an integrated workspace idempotently and converges from exact preparing bytes", () => {
    const fs = new ReceiptFailOnceFileSystem();
    const harness = makeWorkspace(fs);
    fs.remove(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
    fs.armReceiptWrite(2);

    expect(() =>
      prepareWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        integrationVersion: "0.1.0",
      }),
    ).toThrow(MutationFailure);
    expect(
      parseWorkspaceHandoffReceipt(fs.read(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)),
    ).toMatchObject({ ok: true, value: { status: "preparing" } });
    let verificationFailure: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "codex",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      verificationFailure = error;
    }
    expect(verificationFailure).toBeInstanceOf(HandoffVerificationError);
    expect(
      (verificationFailure as HandoffVerificationError).blockers.find(
        ({ code }) => code === "handoff-receipt-not-prepared",
      )?.recovery,
    ).toContain("authoring handoff prepare");

    const retried = prepareWorkspaceHandoff(harness.deps, {
      workspaceRoot: WORKSPACE,
      integrationVersion: "0.1.0",
    });
    const unchanged = prepareWorkspaceHandoff(harness.deps, {
      workspaceRoot: WORKSPACE,
      integrationVersion: "0.1.0",
    });
    expect(retried).toMatchObject({ status: "prepared", handoffPrepared: true });
    expect(retried.changedPaths).toEqual([`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`]);
    expect(unchanged.changedPaths).toEqual([]);
  });

  it("rejects a valid-looking prepared receipt whose immutable request identity was changed", () => {
    const harness = makeWorkspace();
    const receiptPath = `${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`;
    const parsed = parseWorkspaceHandoffReceipt(harness.fs.read(receiptPath));
    if (!parsed.ok) throw new Error(parsed.reason);
    const modified = `${JSON.stringify(
      { ...parsed.value, requestKey: `handoff|sha256:${"f".repeat(64)}` },
      null,
      2,
    )}\n`;
    harness.fs.write(receiptPath, modified);

    let caught: unknown;
    try {
      prepareWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffPreparationPreflightError);
    expect((caught as HandoffPreparationPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "handoff-receipt-invalid" })]),
    );
    expect(harness.fs.read(receiptPath)).toBe(modified);
  });

  it("reports both standalone receipt publication boundaries and converges from their exact partials", () => {
    const expected = [
      {
        at: 1,
        completed: [],
        failed: "handoff-receipt:preparing",
        unattempted: ["handoff-receipt:prepared"],
      },
      {
        at: 2,
        completed: ["handoff-receipt:preparing"],
        failed: "handoff-receipt:prepared",
        unattempted: [],
      },
    ] as const;

    for (const boundary of expected) {
      const fs = new ReceiptFailOnceFileSystem();
      const harness = makeWorkspace(fs);
      fs.remove(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);
      fs.armReceiptWrite(boundary.at);

      let caught: unknown;
      try {
        prepareWorkspaceHandoff(harness.deps, {
          workspaceRoot: WORKSPACE,
          integrationVersion: "0.1.0",
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(MutationFailure);
      const failure = caught as MutationFailure;
      expect(failure.failedBeat).toBe("MATERIALISE");
      expect(failure.completed.map(({ id }) => id)).toEqual(boundary.completed);
      expect(failure.failed.id).toBe(boundary.failed);
      expect(failure.unattempted.map(({ id }) => id)).toEqual(boundary.unattempted);
      expect(failure.recovery).toContain("identical handoff preparation request");
      expect(failure.recovery).toContain(
        "no rollback, generic resume, or generic reconciliation is claimed",
      );

      expect(
        prepareWorkspaceHandoff(harness.deps, {
          workspaceRoot: WORKSPACE,
          integrationVersion: "0.1.0",
        }),
      ).toMatchObject({ status: "prepared", handoffPrepared: true });
    }
  });

  it("aggregates predictable managed-state and receipt conflicts before writing", () => {
    const harness = makeWorkspace();
    harness.fs.write(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`, "modified\n");
    harness.fs.write(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`, "user receipt\n");
    const receiptBefore = harness.fs.read(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`);

    let caught: unknown;
    try {
      prepareWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffPreparationPreflightError);
    expect((caught as HandoffPreparationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["managed-state-invalid", "handoff-receipt-invalid"]),
    );
    expect((caught as HandoffPreparationPreflightError).handoffPrepared).toBe(false);
    expect(harness.fs.read(`${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`)).toBe(receiptBefore);
  });

  it("reports an invalid requested version through the typed aggregate without writing", () => {
    const harness = makeWorkspace();
    const receiptPath = `${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`;
    const receiptBefore = harness.fs.read(receiptPath);
    harness.fs.remove(`${WORKSPACE}/wip/manifest.yml`);

    let caught: unknown;
    try {
      prepareWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        integrationVersion: "v0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffPreparationPreflightError);
    expect((caught as HandoffPreparationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "workspace-marker-invalid",
        "managed-state-mismatch",
        "handoff-request-version-invalid",
      ]),
    );
    expect(harness.fs.read(receiptPath)).toBe(receiptBefore);
  });

  it("still reports an invalid requested version when managed state is missing", () => {
    const harness = makeWorkspace();
    const receiptPath = `${WORKSPACE}/${WORKSPACE_HANDOFF_RECEIPT_PATH}`;
    const receiptBefore = harness.fs.read(receiptPath);
    harness.fs.remove(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`);

    let caught: unknown;
    try {
      prepareWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        integrationVersion: "v0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffPreparationPreflightError);
    expect((caught as HandoffPreparationPreflightError).blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["handoff-request-version-invalid", "managed-state-invalid"]),
    );
    expect(harness.fs.read(receiptPath)).toBe(receiptBefore);
  });
});

describe("workspace handoff verification", () => {
  it("verifies the fresh root and preserves a valid peer when another configured client is stale", () => {
    const harness = makeWorkspace();
    const success = verifyWorkspaceHandoff(harness.deps, {
      workspaceRoot: WORKSPACE,
      actualWorkingDirectory: WORKSPACE,
      clientId: "codex",
      integrationVersion: "0.1.0",
    });
    expect(success).toMatchObject({
      status: "verified",
      workspaceRoot: WORKSPACE,
      selectedClient: "codex",
      sharedValid: true,
      clients: [
        { id: "codex", status: "valid" },
        { id: "claude-code", status: "valid" },
      ],
      workEvidence: { resumable: false, dependencyEligible: true },
      nextAction: { skill: "wpm-author", invocation: "$wpm-author" },
      agreement: {
        workingDirectory: { status: "valid", path: WORKSPACE },
        receipt: { status: "valid", path: ".wpm-handoff.json" },
        managedState: { status: "valid", path: ".wpm-authoring.json" },
        authoringBacklog: { status: "valid", path: ".authoring-backlog" },
        clients: [
          {
            id: "codex",
            status: "valid",
            frontDoor: { status: "valid", path: "AGENTS.md" },
            skillFamily: {
              status: "valid",
              names: [
                "wpm-author",
                "wpm-author-bundle",
                "wpm-author-recipe",
                "wpm-author-skill",
                "wpm-review-package",
              ],
            },
          },
          {
            id: "claude-code",
            status: "valid",
            frontDoor: { status: "valid", path: "CLAUDE.md" },
          },
        ],
      },
    });

    harness.fs.write(
      `${WORKSPACE}/.claude/skills/wpm-author/SKILL.md`,
      "changed outside WPM ownership\n",
    );
    let caught: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: `${WORKSPACE}/wip`,
        clientId: "codex",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffVerificationError);
    const failure = caught as HandoffVerificationError;
    expect(failure.blockers.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["working-directory-mismatch", "workspace-skill-mismatch"]),
    );
    expect(failure.clients).toEqual([
      { id: "codex", status: "valid" },
      { id: "claude-code", status: "invalid" },
    ]);
    expect(failure.sharedValid).toBe(false);
  });

  it("accepts evolved core-task status, checks, and notes without claiming or mutating work", () => {
    const harness = makeWorkspace();
    const backlogRoot = `${WORKSPACE}/.authoring-backlog`;
    const first = harness.backlog.listTasks(backlogRoot)[0];
    if (first === undefined) throw new Error("expected a core authoring task");
    harness.backlog.editTask(backlogRoot, first.id, {
      status: "In Progress",
      checkAcceptanceCriteria: [1],
      notes: "durable authoring progress belongs to wpm-author",
    });

    expect(
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "claude-code",
        integrationVersion: "0.1.0",
      }),
    ).toMatchObject({
      status: "verified",
      selectedClient: "claude-code",
      workEvidence: { resumable: true, dependencyEligible: true },
      nextAction: { skill: "wpm-author", invocation: "/wpm-author" },
    });
    expect(harness.backlog.readTask(backlogRoot, first.id)).toMatchObject({
      status: "In Progress",
      acceptanceCriteria: [expect.objectContaining({ checked: true })],
    });
  });

  it("does not label receipt clients valid when managed state is unavailable", () => {
    const harness = makeWorkspace();
    harness.fs.remove(`${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`);
    harness.fs.remove(`${WORKSPACE}/.claude/skills/wpm-author`);
    harness.fs.remove(`${WORKSPACE}/CLAUDE.md`);

    let caught: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "codex",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffVerificationError);
    const failure = caught as HandoffVerificationError;
    expect(failure.category).toBe("validation");
    expect(failure.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "managed-state-invalid" }),
        expect.objectContaining({
          code: "workspace-skill-family-unverifiable",
          client: "claude-code",
        }),
        expect.objectContaining({ code: "workspace-skill-mismatch", client: "claude-code" }),
        expect.objectContaining({ code: "workspace-front-door-mismatch", client: "claude-code" }),
      ]),
    );
    expect(failure.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "handoff-client-not-configured" })]),
    );
    expect(failure.clients).toEqual([
      { id: "codex", status: "invalid" },
      { id: "claude-code", status: "invalid" },
    ]);
  });

  it("reports no resumable or dependency-eligible core work after every core task is done", () => {
    const harness = makeWorkspace();
    const backlogRoot = `${WORKSPACE}/.authoring-backlog`;
    for (const task of harness.backlog.listTasks(backlogRoot)) {
      harness.backlog.editTask(backlogRoot, task.id, { status: "Done" });
    }

    expect(
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "codex",
        integrationVersion: "0.1.0",
      }),
    ).toMatchObject({
      status: "verified",
      workEvidence: { resumable: false, dependencyEligible: false },
      nextAction: { skill: "wpm-author" },
    });
  });

  it("inspects but never trusts client ownership from a canonical foreign managed state", () => {
    const harness = makeWorkspace();
    const statePath = `${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`;
    const parsed = parseManagedAuthoringState(harness.fs.read(statePath));
    if (!parsed.ok || parsed.value.status !== "complete") {
      throw new Error(parsed.ok ? "expected complete state" : parsed.reason);
    }
    harness.fs.write(
      statePath,
      serializeManagedAuthoringState({
        ...parsed.value,
        workspaceRoot: "/foreign/workspace",
        selectedClients: ["claude-code"],
        ownedPaths: parsed.value.ownedPaths.filter(({ client }) => client === "claude-code"),
      }),
    );
    harness.fs.remove(`${WORKSPACE}/.agents/skills/wpm-author`);
    harness.fs.remove(`${WORKSPACE}/AGENTS.md`);

    let caught: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "codex",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffVerificationError);
    const failure = caught as HandoffVerificationError;
    expect(failure.category).toBe("validation");
    expect(failure.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "managed-state-mismatch" }),
        expect.objectContaining({ code: "workspace-skill-mismatch", client: "codex" }),
        expect.objectContaining({ code: "workspace-front-door-mismatch", client: "codex" }),
      ]),
    );
    expect(failure.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "handoff-client-not-configured" })]),
    );
    expect(failure.clients).toEqual([
      { id: "codex", status: "invalid" },
      { id: "claude-code", status: "invalid" },
    ]);
  });

  it("rejects a wrong skill identity even when managed state was changed to match its digest", () => {
    const harness = makeWorkspace();
    const skillPath = `${WORKSPACE}/.agents/skills/wpm-author/SKILL.md`;
    const original = harness.fs.read(skillPath);
    const forged = original.replace(/^name: wpm-author$/m, "name: wpm-author-bundle");
    expect(forged).not.toBe(original);
    harness.fs.write(skillPath, forged);

    const statePath = `${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`;
    const parsed = parseManagedAuthoringState(harness.fs.read(statePath));
    if (!parsed.ok || parsed.value.status !== "complete") {
      throw new Error(parsed.ok ? "expected complete state" : parsed.reason);
    }
    harness.fs.write(
      statePath,
      serializeManagedAuthoringState({
        ...parsed.value,
        ownedPaths: parsed.value.ownedPaths.map((record) =>
          record.kind === "skill" && record.client === "codex" && record.name === "wpm-author"
            ? { ...record, sha256: harness.fs.digestFile(skillPath) }
            : record,
        ),
      }),
    );

    let caught: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "codex",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffVerificationError);
    expect((caught as HandoffVerificationError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "workspace-skill-mismatch", client: "codex" }),
      ]),
    );
  });

  it("falls back to receipt clients after owned-path cardinality invalidates parsed state", () => {
    const harness = makeWorkspace();
    const statePath = `${WORKSPACE}/${WORKSPACE_INTEGRATION_STATE_PATH}`;
    const parsed = parseManagedAuthoringState(harness.fs.read(statePath));
    if (!parsed.ok || parsed.value.status !== "complete") {
      throw new Error(parsed.ok ? "expected complete state" : parsed.reason);
    }
    harness.fs.write(
      statePath,
      serializeManagedAuthoringState({
        ...parsed.value,
        selectedClients: ["codex"],
        ownedPaths: parsed.value.ownedPaths
          .filter(({ client }) => client === "codex")
          .filter(({ kind }) => kind === "skill"),
      }),
    );
    harness.fs.remove(`${WORKSPACE}/.claude/skills/wpm-author`);
    harness.fs.remove(`${WORKSPACE}/CLAUDE.md`);

    let caught: unknown;
    try {
      verifyWorkspaceHandoff(harness.deps, {
        workspaceRoot: WORKSPACE,
        actualWorkingDirectory: WORKSPACE,
        clientId: "claude-code",
        integrationVersion: "0.1.0",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HandoffVerificationError);
    const failure = caught as HandoffVerificationError;
    expect(failure.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "managed-state-owned-paths-mismatch" }),
        expect.objectContaining({ code: "workspace-skill-mismatch", client: "claude-code" }),
        expect.objectContaining({ code: "workspace-front-door-mismatch", client: "claude-code" }),
      ]),
    );
    expect(failure.blockers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "handoff-client-not-configured" })]),
    );
  });
});
