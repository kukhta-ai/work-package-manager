import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

const repository = fileURLToPath(new URL("../../", import.meta.url));

describe("installed vNext recipient journey", () => {
  it("authors, checks, builds and rehearses plain packages from a fresh npm installation without APM", async () => {
    await withTempDir((temporary) => {
      expect(
        existsSync(join(repository, "dist/cli.js")),
        "build must run before installed-consumer qualification",
      ).toBe(true);
      const packed = execaSync(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
        { cwd: repository },
      ).stdout;
      const manifests: unknown = JSON.parse(packed);
      if (!Array.isArray(manifests) || manifests.length !== 1)
        throw new Error("npm pack did not report exactly one artifact");
      const metadata: unknown = manifests[0];
      if (
        typeof metadata !== "object" ||
        metadata === null ||
        !("filename" in metadata) ||
        typeof metadata.filename !== "string"
      )
        throw new Error("npm pack omitted its artifact filename");
      const tarball = join(temporary, metadata.filename);
      const consumer = join(temporary, "consumer");
      mkdirSync(consumer);
      writeFileSync(
        join(consumer, "package.json"),
        JSON.stringify({ name: "wpm-vnext-consumer", private: true }),
      );
      execaSync(
        "npm",
        ["install", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund", tarball],
        { cwd: consumer },
      );
      const installed = join(consumer, "node_modules/wpm");
      expect(existsSync(join(installed, ".agents/skills/wpm-repo-dev/SKILL.md"))).toBe(false);
      const sourceRoot = join(consumer, "source");
      const isolatedHome = join(consumer, "home");
      mkdirSync(isolatedHome);
      const command = (...args: string[]): unknown =>
        JSON.parse(
          execaSync(
            process.execPath,
            [join(installed, "dist/cli.js"), "vnext", "--root", sourceRoot, ...args],
            {
              cwd: consumer,
              env: {
                HOME: isolatedHome,
                USERPROFILE: isolatedHome,
                XDG_CONFIG_HOME: join(isolatedHome, "config"),
                XDG_CACHE_HOME: join(isolatedHome, "cache"),
              },
            },
          ).stdout,
        ) as unknown;
      command("init", "installed");
      command("worker-setup", "create");
      command(
        "operation",
        "add",
        "brief",
        "Produce a brief",
        "--ac",
        "The brief describes the selected problem",
      );
      command(
        "operation",
        "add",
        "review",
        "Review the brief",
        "--prerequisite",
        "brief",
        "--ac",
        "Every brief claim is checked",
        "--without-setup",
      );
      command("group", "set", "review", "--operation", "review");
      expect(command("check")).toMatchObject({
        valid: true,
        operations: 2,
        agentSupport: { loaded: false },
      });
      command("lock");
      const first = command("build");
      expect(command("build")).toEqual(first);
      expect(command("test")).toMatchObject({ passed: true, agentExecution: false });
      const result: unknown = JSON.parse(
        readFileSync(join(sourceRoot, "test-results/vnext-latest.json"), "utf8"),
      );
      expect(result).toMatchObject({ passed: true });
      const archive = join(sourceRoot, "builds/installed-0.1.0.tgz");
      const listing = execaSync("tar", ["-tzf", archive]).stdout;
      expect(listing).not.toMatch(/\.agents|wpm-repo-|\.wpm-source|backlog|apm/);
      expect(listing).toContain("worker-setup/default/WORKER.md");
    });
  });
});
