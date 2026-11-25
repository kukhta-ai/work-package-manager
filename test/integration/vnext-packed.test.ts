import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
        "create",
        "brief",
        "Produce a brief",
        "--ac",
        "The brief describes the selected problem",
      );
      expect(command("check")).toMatchObject({ releaseReady: false });
      execaSync(
        process.execPath,
        [
          join(repository, "node_modules/backlog.md/cli.js"),
          "task",
          "edit",
          "operation-1",
          "--description",
          "Produce a brief addressing the selected problem",
        ],
        { cwd: join(sourceRoot, ".wpm-source") },
      );
      expect(command("operation", "view", "brief")).toMatchObject({ source: "draft" });
      command("operation", "finalize", "brief");
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
      expect(command("operation", "list")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "brief",
            operation: "brief",
            task: "operation-1",
            readiness: "ready",
          }),
        ]),
      );
      expect(command("group", "view", "review")).toMatchObject({
        externalPrerequisites: ["brief"],
      });
      command("group", "set", "all");
      command("group", "add", "all", "--group", "review");
      command("group", "remove", "all", "--group", "review");
      command("group", "delete", "all", "--yes");
      command("operation", "set-setup", "review", "--inherit");
      command("operation", "set-setup", "review", "--without-setup");
      expect(command("version", "minor")).toMatchObject({ version: "0.2.0" });
      command("lock");
      const first = command("build");
      expect(command("build")).toEqual(first);
      expect(command("test")).toMatchObject({ passed: true, agentExecution: false });
      const result: unknown = JSON.parse(
        readFileSync(join(sourceRoot, "test-results/vnext-latest.json"), "utf8"),
      );
      expect(result).toMatchObject({ passed: true });
      const archive = join(sourceRoot, "builds/installed-0.2.0.tgz");
      const listing = execaSync("tar", ["-tzf", `./${basename(archive)}`], {
        cwd: dirname(archive),
      }).stdout;
      expect(listing).not.toMatch(/\.agents|wpm-repo-|\.wpm-source|backlog|apm/);
      expect(listing).toContain("worker-setup/default/WORKER.md");
      const suite = join(consumer, "suite");
      const graphCommand = (...args: string[]): unknown => command("--root", suite, ...args);
      graphCommand("workspace", "init");
      for (const name of ["app", "left", "right", "shared"])
        graphCommand("package", "create", name);
      graphCommand("--package", "shared", "package", "version", "1.0.0");
      graphCommand("package", "create", "shared", "--directory", "packages/shared-two");
      graphCommand(
        "--package",
        "shared",
        "--package-version",
        "0.1.0",
        "package",
        "version",
        "2.0.0",
      );
      const dependency = (name: string, spec: string, version?: string): unknown =>
        graphCommand(
          "--package",
          name,
          ...(version ? ["--package-version", version] : []),
          "package",
          "deps",
          "add",
          spec,
          "--manifest-only",
        );
      dependency("app", "left@*");
      dependency("app", "right@*");
      dependency("left", "shared@^1");
      dependency("right", "shared@^2");
      dependency("shared", "app@*", "1.0.0");
      const app = (...args: string[]): unknown => graphCommand("--package", "app", ...args);
      app("lock");
      expect(app("lock", "--check")).toMatchObject({ checked: true });
      expect(app("package", "deps", "list", "--tree")).toHaveProperty("tree");
      expect(app("build")).toMatchObject({ instances: 5 });
      expect(app("test")).toMatchObject({ passed: true, agentExecution: false });
      const graphArchive = readFileSync(join(suite, "packages/app/builds/app-0.1.0.tgz"));
      app("build");
      expect(readFileSync(join(suite, "packages/app/builds/app-0.1.0.tgz"))).toEqual(graphArchive);
    });
  });
});
