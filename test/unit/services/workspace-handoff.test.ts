import { describe, expect, it } from "vitest";
import {
  createWorkspaceHandoffReceipt,
  parseWorkspaceHandoffReceipt,
  serializeWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../../src/core/services/workspace-handoff.js";

const ROOT = "/authoring/demo";

describe("workspace handoff receipt", () => {
  it("derives one canonical dual-client prepared receipt from the frozen native catalog", () => {
    const receipt = createWorkspaceHandoffReceipt({
      status: "prepared",
      workspaceRoot: ROOT,
      integrationVersion: "0.1.0",
      configuredClients: ["claude-code", "codex"],
    });

    expect(WORKSPACE_HANDOFF_RECEIPT_PATH).toBe(".wpm-handoff.json");
    expect(receipt).toEqual({
      schemaVersion: 1,
      status: "prepared",
      workspaceRoot: ROOT,
      integrationVersion: "0.1.0",
      managedStatePath: ".wpm-authoring.json",
      authoringBacklogPath: ".authoring-backlog",
      configuredClients: ["codex", "claude-code"],
      clients: [
        {
          id: "codex",
          launch: { command: "codex", workingDirectory: ROOT },
          workspaceSkillsDirectory: ".agents/skills",
          frontDoor: "AGENTS.md",
          reload: {
            kind: "automatic-with-restart-fallback",
            guidance:
              "changes are detected automatically; restart Codex in the workspace if the skill is absent",
          },
          firstSkill: { name: "wpm-author", invocation: "$wpm-author" },
          verification: {
            command: "wpm",
            args: ["-C", ROOT, "authoring", "handoff", "verify", "--client", "codex"],
            workingDirectory: ROOT,
          },
        },
        {
          id: "claude-code",
          launch: { command: "claude", workingDirectory: ROOT },
          workspaceSkillsDirectory: ".claude/skills",
          frontDoor: "CLAUDE.md",
          reload: {
            kind: "live-watch-with-new-directory-restart",
            guidance:
              "changes are watched live; restart Claude Code if the top-level skill directory was created after session start",
          },
          firstSkill: { name: "wpm-author", invocation: "/wpm-author" },
          verification: {
            command: "wpm",
            args: ["-C", ROOT, "authoring", "handoff", "verify", "--client", "claude-code"],
            workingDirectory: ROOT,
          },
        },
      ],
    });
    expect(receipt).not.toHaveProperty("timestamp");
    expect(JSON.stringify(receipt)).not.toMatch(/"(?:spawned|authenticated|accepted)"/i);

    const text = serializeWorkspaceHandoffReceipt(receipt);
    expect(parseWorkspaceHandoffReceipt(text)).toEqual({ ok: true, value: receipt });
  });

  it("keeps preparing evidence exact while preserving the same actionable client facts", () => {
    const preparing = createWorkspaceHandoffReceipt({
      status: "preparing",
      workspaceRoot: ROOT,
      integrationVersion: "0.1.0",
      configuredClients: ["codex"],
      requestKey: `handoff|sha256:${"b".repeat(64)}`,
    });

    expect(preparing.status).toBe("preparing");
    expect(preparing.clients).toHaveLength(1);
    expect(parseWorkspaceHandoffReceipt(serializeWorkspaceHandoffReceipt(preparing))).toEqual({
      ok: true,
      value: preparing,
    });
  });

  it("rejects noncanonical bytes, unknown fields, client drift, and incoherent roots or versions", () => {
    const valid = createWorkspaceHandoffReceipt({
      status: "prepared",
      workspaceRoot: ROOT,
      integrationVersion: "0.1.0",
      configuredClients: ["codex", "claude-code"],
    });
    const cases = [
      JSON.stringify(valid),
      `${JSON.stringify({ ...valid, unexpected: true }, null, 2)}\n`,
      `${JSON.stringify({ ...valid, configuredClients: ["claude-code", "codex"] }, null, 2)}\n`,
      `${JSON.stringify({ ...valid, integrationVersion: "v0.1.0" }, null, 2)}\n`,
      `${JSON.stringify({ ...valid, workspaceRoot: "relative/demo" }, null, 2)}\n`,
      `${JSON.stringify({ ...valid, clients: [{ ...valid.clients[0], frontDoor: "CLAUDE.md" }, valid.clients[1]] }, null, 2)}\n`,
      `${JSON.stringify({ ...valid, requestKey: "generic-resume" }, null, 2)}\n`,
    ];

    for (const text of cases) {
      expect(parseWorkspaceHandoffReceipt(text)).toMatchObject({ ok: false });
    }
  });

  it("rejects redundant separators instead of accepting multiple texts for one root identity", () => {
    for (const workspaceRoot of ["/authoring//demo", "//authoring/demo", "C://authoring/demo"]) {
      expect(() =>
        createWorkspaceHandoffReceipt({
          status: "prepared",
          workspaceRoot,
          integrationVersion: "0.1.0",
          configuredClients: ["codex"],
        }),
      ).toThrow("canonical portable absolute text");
    }
  });
});
