import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * TASK-101 acceptance coverage through the built binary. The static docs drift suite checks every shipped
 * Markdown document; these cases execute the load-bearing commands from the reconciled docs 10/11 session against the
 * real filesystem, template registry, adapters, and Backlog.md materialisation path.
 */

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const describeIfBuilt = existsSync(builtCli) ? describe : describe.skip;

function cli(
  args: readonly string[],
  cwd?: string,
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [builtCli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...(cwd === undefined ? {} : { cwd }),
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      status: failure.status ?? 1,
    };
  }
}

function backlog(workspace: string, args: readonly string[]): string {
  // Execa resolves npm's platform-specific command shim (`backlog.cmd` on Windows) and preserves its captured
  // stdout/stderr in a thrown diagnostic when the command exits non-zero.
  return execaSync("backlog", args, {
    cwd: join(workspace, ".authoring-backlog"),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  }).stdout as string;
}

function wpm(workspace: string, args: readonly string[]) {
  return cli([...args, "-C", workspace]);
}

describeIfBuilt("shipped documentation template examples via dist/cli.js (TASK-101)", () => {
  it("runs the reconciled minimal/core flow and registers launcher.json relative to payload/files", async () => {
    await withTempDir((dir) => {
      const workspace = join(dir, "hermes-handoff");

      const init = cli(["init", "hermes-handoff", "--template", "minimal"], dir);
      expect(init.status).toBe(0);
      expect(init.stdout).toContain("materialised: 8 authoring task(s)");
      expect(wpm(workspace, ["project", "targets", "add", "claude-code"]).status).toBe(0);

      const core = wpm(workspace, ["bundle", "new", "core", "--version", "0.3.0", "--no-advisor"]);
      expect(core.status).toBe(0);
      expect(core.stdout).toContain("materialised: 11 authoring task(s)");
      expect(readFileSync(join(workspace, "wip", "bundles", "core", "bundle.yml"), "utf8")).toMatch(
        /version:\s*0\.3\.0/,
      );
      const authoringTasks = backlog(workspace, ["task", "list", "--plain"]);
      expect(authoringTasks.match(/^\s+AUTHORING-\d+\s+-\s+/gm)).toHaveLength(19);
      expect(authoringTasks).toMatch(/AUTHORING-9\s+-\s+Plan bundle core/);
      expect(authoringTasks).toMatch(/AUTHORING-10\s+-\s+Fill install-backlog for core/);

      expect(wpm(workspace, ["bundle", "new", "web-handoff"]).status).toBe(0);
      expect(
        wpm(workspace, ["bundle", "web-handoff", "requires", "add", "core", "^0.3.0"]).status,
      ).toBe(0);

      const payloadDir = join(workspace, "wip", "bundles", "web-handoff", "payload", "files");
      mkdirSync(payloadDir, { recursive: true });
      writeFileSync(join(payloadDir, "launcher.json"), '{"command":"open"}\n', "utf8");

      expect(
        wpm(workspace, ["bundle", "web-handoff", "files", "add", "launcher.json"]).status,
      ).toBe(0);
      const bundle = readFileSync(
        join(workspace, "wip", "bundles", "web-handoff", "bundle.yml"),
        "utf8",
      );
      expect(bundle).toMatch(/payload:[\s\S]*launcher\.json/);
      expect(bundle).not.toContain("payload/files/launcher.json");
      expect(wpm(workspace, ["project", "validate"]).status).toBe(0);
    });
  });

  it("rejects the formerly documented missing templates without leaving partial scaffolds", async () => {
    await withTempDir((dir) => {
      const unavailableProject = join(dir, "missing-project-template");
      const project = cli([
        "init",
        "should-not-exist",
        "--at",
        unavailableProject,
        "--template",
        "single-bundle",
      ]);
      expect(project.status).toBe(1);
      expect(project.stderr).toContain('project template "single-bundle" not found');
      expect(existsSync(unavailableProject)).toBe(false);

      const workspace = join(dir, "valid-project");
      expect(
        cli(["init", "valid-project", "--at", workspace, "--template", "minimal"]).status,
      ).toBe(0);
      const bundle = wpm(workspace, [
        "bundle",
        "new",
        "should-not-exist",
        "--template",
        "with-payload-skill",
      ]);
      expect(bundle.status).toBe(1);
      expect(bundle.stderr).toContain('bundle template "with-payload-skill" not found');
      expect(existsSync(join(workspace, "wip", "bundles", "should-not-exist"))).toBe(false);
      expect(readFileSync(join(workspace, "wip", "manifest.yml"), "utf8")).not.toContain(
        "should-not-exist",
      );
    });
  });
});
