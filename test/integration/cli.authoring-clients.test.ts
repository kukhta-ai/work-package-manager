import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../src/adapters/fake-env.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { type CliDeps, run } from "../../src/cli.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { withTempDir } from "../helpers/tmpdir.js";

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const itIfBuilt = existsSync(builtCli) ? it : it.skip;

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

function snapshot(root: string): Readonly<Record<string, string>> {
  const entries: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const key = relative(root, path).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        entries[`${key}/`] = "directory";
        visit(path);
      } else {
        entries[key] = readFileSync(path).toString("base64");
      }
    }
  };
  visit(root);
  return entries;
}

function deps(home: string, workspace: string): CliDeps {
  return {
    fs: new NodeFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-08-22T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: workspace, env: { HOME: home } }),
    builtinTemplatesRoot: join(workspace, "unused-templates"),
  };
}

describe("authoring-client inspection over real filesystem boundaries", () => {
  it("reports native detection while preserving different manifest targets and every local byte", async () => {
    await withTempDir(async (root) => {
      const home = join(root, "home");
      const workspace = join(root, "workspace");
      mkdirSync(join(home, ".agents"), { recursive: true });
      mkdirSync(join(workspace, "wip"), { recursive: true });
      writeFileSync(
        join(workspace, "wip", "manifest.yml"),
        [
          "project:",
          "  name: distinct-axes",
          "  version: 1.0.0",
          "targets:",
          "  - hermes",
          "  - openclaw",
          "bundles: []",
          "",
        ].join("\n"),
      );
      writeFileSync(join(home, "credential-sentinel"), "unchanged\n");
      const before = snapshot(root);
      const output = io();

      expect(await run(["authoring", "clients", "--json"], deps(home, workspace), output)).toBe(0);

      const result = JSON.parse(output.out.text) as {
        clients: Array<{
          id: string;
          configured: boolean;
          currentDetection: { status: string };
        }>;
      };
      expect(result.clients.map(({ id }) => id)).toEqual(["codex", "claude-code"]);
      expect(result.clients.map(({ currentDetection }) => currentDetection.status)).toEqual([
        "detected",
        "not-detected",
      ]);
      expect(result.clients.every(({ configured }) => configured === false)).toBe(true);
      expect(snapshot(root)).toEqual(before);
    });
  });

  it("keeps deferred and invalid evaluations read-only and machine-distinguishable", async () => {
    await withTempDir(async (root) => {
      const home = join(root, "home");
      const workspace = join(root, "workspace");
      mkdirSync(home, { recursive: true });
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(home, "user-sentinel"), "unchanged\n");
      const before = snapshot(root);

      const deferredOutput = io();
      expect(
        await run(
          ["authoring", "clients", "openclaw", "--json"],
          deps(home, workspace),
          deferredOutput,
        ),
      ).toBe(0);
      expect(JSON.parse(deferredOutput.out.text)).toMatchObject({
        supportStatus: "deferred",
        selectable: false,
        configured: false,
      });

      const invalidOutput = io();
      expect(
        await run(
          ["authoring", "clients", "unknown", "--json"],
          deps(home, workspace),
          invalidOutput,
        ),
      ).toBe(0);
      expect(JSON.parse(invalidOutput.out.text)).toMatchObject({
        supportStatus: "invalid",
        selectable: false,
        configured: false,
      });
      expect(snapshot(root)).toEqual(before);
    });
  });

  itIfBuilt(
    "drives the built CLI through JSON, text, and help without changing HOME or target state",
    async () => {
      await withTempDir(async (root) => {
        const home = join(root, "home");
        const workspace = join(root, "workspace");
        mkdirSync(join(home, ".claude"), { recursive: true });
        mkdirSync(join(workspace, "wip"), { recursive: true });
        writeFileSync(
          join(workspace, "wip", "manifest.yml"),
          [
            "project:",
            "  name: built-distinct-axes",
            "  version: 1.0.0",
            "targets:",
            "  - openclaw",
            "bundles: []",
            "",
          ].join("\n"),
        );
        const before = snapshot(root);
        const env = { ...process.env, HOME: home };

        const jsonOutput = execFileSync(
          process.execPath,
          [builtCli, "authoring", "clients", "--json"],
          { cwd: workspace, encoding: "utf8", env },
        );
        const textOutput = execFileSync(process.execPath, [builtCli, "authoring", "clients"], {
          cwd: workspace,
          encoding: "utf8",
          env,
        });
        const helpOutput = execFileSync(
          process.execPath,
          [builtCli, "authoring", "clients", "--help"],
          { cwd: workspace, encoding: "utf8", env },
        );

        const result = JSON.parse(jsonOutput) as {
          clients: Array<{ id: string; currentDetection: { status: string } }>;
        };
        expect(result.clients.map(({ id }) => id)).toEqual(["codex", "claude-code"]);
        expect(result.clients.map(({ currentDetection }) => currentDetection.status)).toEqual([
          "not-detected",
          "detected",
        ]);
        expect(textOutput).toContain("Codex (codex)");
        expect(textOutput).toContain("Claude Code (claude-code)");
        expect(textOutput.match(/configured:\s+no/g)).toHaveLength(2);
        expect(textOutput).toContain("detection hint:");
        expect(helpOutput).toContain("Codex (codex)");
        expect(helpOutput).toContain("Claude Code (claude-code)");
        expect(helpOutput).toContain("detection is advisory");
        expect(helpOutput).toContain("manifest.yml.targets");
        expect(helpOutput).toContain("Example:");
        expect(snapshot(root)).toEqual(before);
      });
    },
  );
});
