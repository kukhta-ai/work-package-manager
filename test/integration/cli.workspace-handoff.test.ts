import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import {
  parseWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../src/core/services/workspace-handoff.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { withTempDir } from "../helpers/tmpdir.js";

const TEMPLATES = fileURLToPath(new URL("../../templates", import.meta.url));
const SKILLS = fileURLToPath(new URL("../../agent-skills", import.meta.url));

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}

function io(): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug: false };
}

function deps(cwd: string, fs = new NodeFileSystem(), backlog = new FakeBacklog()): CliDeps {
  return {
    fs,
    backlog,
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd }),
    builtinTemplatesRoot: TEMPLATES,
    bundledSkillsRoot: SKILLS,
  };
}

class FailPreparedReceiptOnceFileSystem extends NodeFileSystem {
  private armed = false;

  arm(): void {
    this.armed = true;
  }

  override write(path: string, content: string): void {
    if (
      this.armed &&
      path.endsWith(WORKSPACE_HANDOFF_RECEIPT_PATH) &&
      JSON.parse(content).status === "prepared"
    ) {
      this.armed = false;
      throw new Error("injected prepared receipt publication failure");
    }
    super.write(path, content);
  }
}

describe("workspace handoff through source CLI and real filesystem", () => {
  it("renders ordered receipt-publication progress as JSON and the identical request converges", async () => {
    await withTempDir(async (parent) => {
      const workspace = join(parent, "partial");
      const fs = new FailPreparedReceiptOnceFileSystem();
      const shared = deps(parent, fs);
      expect(
        await run(
          ["init", "partial", "--at", workspace, "--authoring-client", "codex"],
          shared,
          io(),
        ),
      ).toBe(0);
      fs.remove(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH));
      fs.arm();

      const failed = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "prepare", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          failed,
        ),
      ).toBe(1);
      expect(failed.out.text).toBe("");
      expect(JSON.parse(failed.err.text)).toMatchObject({
        status: "failed",
        operation: "workspace-handoff-preparation",
        handoffPrepared: false,
        failedBeat: "MATERIALISE",
        completed: [{ id: "handoff-receipt:preparing" }],
        failed: { id: "handoff-receipt:prepared" },
        unattempted: [],
        recovery: expect.stringContaining("identical handoff preparation request"),
      });
      expect(
        parseWorkspaceHandoffReceipt(fs.read(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH))),
      ).toMatchObject({ ok: true, value: { status: "preparing" } });

      const retried = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "prepare", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          retried,
        ),
      ).toBe(0);
      expect(JSON.parse(retried.out.text)).toMatchObject({
        status: "prepared",
        handoffPrepared: true,
        changedPaths: [join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH)],
      });
    });
  });

  it("publishes and verifies each explicit single-client selection as structured data", async () => {
    await withTempDir(async (parent) => {
      for (const [client, nativeScope, invocation] of [
        ["codex", ".agents/skills", "$wpm-author"],
        ["claude-code", ".claude/skills", "/wpm-author"],
      ] as const) {
        const workspace = join(parent, client);
        const shared = deps(parent);
        expect(
          await run(
            ["init", client, "--at", workspace, "--authoring-client", client],
            shared,
            io(),
          ),
        ).toBe(0);
        expect(
          shared.fs.inspectPath(join(workspace, nativeScope, "wpm-author", "SKILL.md")).kind,
        ).toBe("file");
        const parsed = parseWorkspaceHandoffReceipt(
          shared.fs.read(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH)),
        );
        expect(parsed).toMatchObject({
          ok: true,
          value: { status: "prepared", configuredClients: [client] },
        });

        const verified = io();
        expect(
          await run(
            ["-C", workspace, "authoring", "handoff", "verify", "--client", client, "--json"],
            { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
            verified,
          ),
        ).toBe(0);
        expect(JSON.parse(verified.out.text)).toMatchObject({
          status: "verified",
          selectedClient: client,
          clients: [{ id: client, status: "valid" }],
          agreement: {
            workingDirectory: { status: "valid", path: workspace },
            receipt: { status: "valid", path: ".wpm-handoff.json" },
            managedState: { status: "valid", path: ".wpm-authoring.json" },
            authoringBacklog: { status: "valid", path: ".authoring-backlog" },
            clients: [
              {
                id: client,
                frontDoor: { status: "valid" },
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
            ],
          },
          workEvidence: { resumable: false, dependencyEligible: true },
          nextAction: { skill: "wpm-author", invocation },
        });
      }
    });
  });

  it("init publishes prepared dual-client next actions and a fresh root verifies read-only", async () => {
    await withTempDir(async (parent) => {
      const workspace = join(parent, "demo");
      const shared = deps(parent);
      const created = io();

      expect(
        await run(
          [
            "init",
            "demo",
            "--at",
            workspace,
            "--authoring-client",
            "codex",
            "--authoring-client",
            "claude-code",
          ],
          shared,
          created,
        ),
      ).toBe(0);
      expect(created.out.text).toContain("handoff: prepared");
      expect(created.out.text).toContain(`workspace root: ${JSON.stringify(workspace)}`);
      expect(created.out.text).toContain("wpm authoring handoff verify --client codex");
      expect(created.out.text).toContain("then invoke: $wpm-author");
      expect(created.out.text).toContain("then invoke: /wpm-author");
      expect(created.out.text).toContain("not spawned or authenticated");
      expect(created.out.text).toContain("acceptance is not claimed");

      const receipt = parseWorkspaceHandoffReceipt(
        shared.fs.read(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH)),
      );
      expect(receipt).toMatchObject({
        ok: true,
        value: { status: "prepared", configuredClients: ["codex", "claude-code"] },
      });

      const verified = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "verify", "--client", "codex"],
          { ...shared, env: new FakeEnvironment({ cwd: parent }) },
          verified,
        ),
      ).toBe(0);
      expect(verified.out.text).toContain("verified fresh-agent handoff");
      expect(verified.out.text).toContain("working directory: valid");
      expect(verified.out.text).toContain("receipt: valid (.wpm-handoff.json)");
      expect(verified.out.text).toContain("managed state: valid (.wpm-authoring.json)");
      expect(verified.out.text).toContain("authoring backlog: valid (.authoring-backlog)");
      expect(verified.out.text).toContain("codex front door: valid (AGENTS.md)");
      expect(verified.out.text).toContain("codex five-skill family: valid");
      expect(verified.out.text).toContain("codex: valid");
      expect(verified.out.text).toContain("claude-code: valid");
      expect(verified.out.text).toContain(
        "durable core work: resumable=no; dependency-eligible=yes",
      );
      expect(verified.out.text).toContain("next action: invoke $wpm-author");
    });
  });

  it("reports wrong cwd and stale Claude while preserving valid Codex, then prepares idempotently", async () => {
    await withTempDir(async (parent) => {
      const workspace = join(parent, "demo");
      const shared = deps(parent);
      expect(
        await run(
          [
            "init",
            "demo",
            "--at",
            workspace,
            "--authoring-client",
            "codex",
            "--authoring-client",
            "claude-code",
          ],
          shared,
          io(),
        ),
      ).toBe(0);
      const manifestPath = join(workspace, "wip", "manifest.yml");
      const manifestText = shared.fs.read(manifestPath);
      shared.fs.write(join(workspace, ".claude", "skills", "wpm-author", "SKILL.md"), "stale\n");
      const failed = io();
      expect(
        await run(
          ["authoring", "handoff", "verify", "--client", "codex"],
          { ...shared, env: new FakeEnvironment({ cwd: join(workspace, "wip") }) },
          failed,
        ),
      ).toBe(1);
      expect(failed.err.text).toContain("[working-directory-mismatch]");
      expect(failed.err.text).toContain("[workspace-skill-mismatch]");
      expect(failed.err.text).toContain("codex: valid");
      expect(failed.err.text).toContain("claude-code: invalid");

      const structuredFailure = io();
      expect(
        await run(
          ["authoring", "handoff", "verify", "--client", "codex", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: join(workspace, "wip") }) },
          structuredFailure,
        ),
      ).toBe(1);
      expect(structuredFailure.out.text).toBe("");
      expect(JSON.parse(structuredFailure.err.text)).toMatchObject({
        status: "failed",
        operation: "workspace-handoff-verification",
        handoffPrepared: false,
        selectedClient: "codex",
        sharedValid: false,
        clients: [
          { id: "codex", status: "valid" },
          { id: "claude-code", status: "invalid" },
        ],
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code: "working-directory-mismatch",
            recovery: expect.stringContaining("change the process working directory"),
          }),
          expect.objectContaining({ code: "workspace-skill-mismatch", client: "claude-code" }),
        ]),
      });
      const cwdRecovery = JSON.parse(structuredFailure.err.text).blockers.find(
        (blocker: { code: string; recovery: string }) =>
          blocker.code === "working-directory-mismatch",
      )?.recovery;
      expect(cwdRecovery).not.toContain("invoke WPM with -C");
      const claudeRecovery = JSON.parse(structuredFailure.err.text).blockers.find(
        (blocker: { code: string; client?: string; recovery: string }) =>
          blocker.code === "workspace-skill-mismatch" && blocker.client === "claude-code",
      )?.recovery;
      expect(claudeRecovery).toContain("--client codex --client claude-code");
      expect(claudeRecovery).toContain("preserve unexpected bytes");
      expect(claudeRecovery).toContain("restore the recorded WPM-owned skill bytes");

      shared.fs.remove(manifestPath);
      const missingMarker = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "verify", "--client", "codex", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: join(workspace, "wip") }) },
          missingMarker,
        ),
      ).toBe(1);
      expect(JSON.parse(missingMarker.err.text)).toMatchObject({
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: "workspace-marker-invalid" }),
        ]),
      });
      expect(JSON.parse(missingMarker.err.text).blockers).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "working-directory-mismatch" })]),
      );

      shared.fs.write(manifestPath, manifestText);
      shared.fs.write(
        join(workspace, ".claude", "skills", "wpm-author", "SKILL.md"),
        shared.fs.read(join(SKILLS, "wpm-author", "SKILL.md")),
      );
      expect(
        await run(
          [
            "-C",
            workspace,
            "authoring",
            "integrate",
            "--client",
            "codex",
            "--client",
            "claude-code",
          ],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          io(),
        ),
      ).toBe(0);
      const recovered = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "verify", "--client", "codex"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          recovered,
        ),
      ).toBe(0);
      expect(recovered.out.text).toContain("codex: valid");
      expect(recovered.out.text).toContain("claude-code: valid");
      expect(shared.fs.read(join(workspace, ".agents", "skills", "wpm-author", "SKILL.md"))).toBe(
        shared.fs.read(join(SKILLS, "wpm-author", "SKILL.md")),
      );
      shared.fs.remove(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH));
      for (const expectedChanged of ["changed: 1 path(s)", "changed: 0 path(s)"]) {
        const prepared = io();
        expect(
          await run(
            ["-C", workspace, "authoring", "handoff", "prepare"],
            { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
            prepared,
          ),
        ).toBe(0);
        expect(prepared.out.text).toContain("handoff: prepared");
        expect(prepared.out.text).toContain(expectedChanged);
      }

      shared.fs.write(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH), "user-owned receipt\n");
      const conflicted = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "prepare", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          conflicted,
        ),
      ).toBe(1);
      expect(conflicted.out.text).toBe("");
      expect(JSON.parse(conflicted.err.text)).toMatchObject({
        status: "failed",
        operation: "workspace-handoff-preparation",
        handoffPrepared: false,
        blockers: expect.arrayContaining([
          expect.objectContaining({
            code: "handoff-receipt-invalid",
            recovery: expect.any(String),
          }),
        ]),
      });
      expect(shared.fs.read(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH))).toBe(
        "user-owned receipt\n",
      );
    });
  });

  it("returns usage failure for an unsupported receiving client and exposes native completion/help", async () => {
    await withTempDir(async (parent) => {
      const workspace = join(parent, "demo");
      const shared = deps(parent);
      await run(["init", "demo", "--at", workspace, "--authoring-client", "codex"], shared, io());
      const failed = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "verify", "--client", "openclaw", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          failed,
        ),
      ).toBe(2);
      expect(JSON.parse(failed.err.text)).toMatchObject({
        status: "failed",
        selectedClient: "openclaw",
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: "handoff-client-unsupported" }),
        ]),
      });

      shared.fs.remove(join(workspace, ".wpm-authoring.json"));
      const missingState = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "verify", "--client", "codex", "--json"],
          { ...shared, env: new FakeEnvironment({ cwd: workspace }) },
          missingState,
        ),
      ).toBe(1);
      const missingStateResult = JSON.parse(missingState.err.text) as {
        blockers: Array<{ code: string }>;
        clients: Array<{ id: string; status: string }>;
      };
      expect(missingStateResult.blockers).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "managed-state-invalid" })]),
      );
      expect(missingStateResult.blockers).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "handoff-client-not-configured" }),
        ]),
      );
      expect(missingStateResult.clients).toEqual([{ id: "codex", status: "invalid" }]);

      const help = io();
      expect(await run(["authoring", "handoff", "verify", "--help"], shared, help)).toBe(0);
      expect(help.out.text).toContain("--client <id>");
    });
  });

  it("renders metacharacter workspace roots as inert data rather than a copyable shell command", async () => {
    await withTempDir(async (parent) => {
      const workspace = join(parent, "literal-$(touch injected)-`whoami`");
      const shared = deps(parent);
      const initialized = io();
      expect(
        await run(
          ["init", "literal", "--at", workspace, "--authoring-client", "codex"],
          shared,
          initialized,
        ),
      ).toBe(0);
      expect(initialized.out.text).toContain("literal-\\u0024(touch injected)");
      expect(initialized.out.text).toContain("\\u0060whoami\\u0060");
      expect(initialized.out.text).not.toContain("$(touch injected)");
      expect(initialized.out.text).not.toContain("`whoami`");
      shared.fs.remove(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH));

      const prepared = io();
      expect(
        await run(
          ["-C", workspace, "authoring", "handoff", "prepare"],
          { ...shared, env: new FakeEnvironment({ cwd: parent }) },
          prepared,
        ),
      ).toBe(0);
      expect(prepared.out.text).toContain("handoff: prepared");
      expect(prepared.out.text).toContain("literal-\\u0024(touch injected)");
      expect(prepared.out.text).toContain("\\u0060whoami\\u0060");
      expect(prepared.out.text).not.toContain("$(touch injected)");
      expect(prepared.out.text).not.toContain("`whoami`");
      expect(prepared.out.text).toContain(
        "verify: wpm authoring handoff verify --client codex from the recorded root",
      );

      const wrongCwd = join(workspace, "wrong-$(touch wrong)-`id`");
      const failed = io();
      expect(
        await run(
          ["authoring", "handoff", "verify", "--client", "codex"],
          { ...shared, env: new FakeEnvironment({ cwd: wrongCwd }) },
          failed,
        ),
      ).toBe(1);
      expect(failed.err.text).toContain("[working-directory-mismatch]");
      expect(failed.err.text).toContain("wrong-\\u0024(touch wrong)");
      expect(failed.err.text).not.toContain("$(touch wrong)");
      expect(failed.err.text).not.toContain("`id`");
    });
  });
});
