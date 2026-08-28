import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveGlobalInstallLayout,
  resolveInstalledExecutableInvocation,
} from "../../../distribution-preparation/packed-install.js";
import { resolveNpmInvocation } from "../../../distribution-preparation/prepare-package.js";
import { ACTIVATION_FACT_KEYS } from "../../../distribution-preparation/readiness.js";
import { createIsolatedEnvironment } from "../../../distribution-preparation/verify-packed-install.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const tempRoots: string[] = [];
const NPM_REPOSITORY = {
  type: "git",
  url: "https://github.com/example/work-package-manager.git",
  directory: null,
};
const WORKSPACE_SKILL_NAMES = [
  "wpm-author",
  "wpm-author-bundle",
  "wpm-author-recipe",
  "wpm-author-skill",
  "wpm-review-package",
] as const;
const PERSONAL_BOOTSTRAP_SKILL_NAME = "wpm-create-package";
const BACKLOG_PEER_PACKAGE = "backlog.md@1.45.2";
const TEST_NPM_TIMEOUT_MS = 660_000;
const COMPLETE_JOURNEY_TIMEOUT_MS = 720_000;

function temporaryRoot(prefix: string): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  tempRoots.push(root);
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initializeGit(source: string): void {
  git(source, "init", "--initial-branch=main");
  git(source, "config", "user.name", "WPM packed-install test");
  git(source, "config", "user.email", "packed-install@example.invalid");
  git(source, "config", "core.autocrlf", "false");
  git(source, "add", "--force", "--all");
  git(source, "commit", "--message", "clean packed-install fixture");
}

function copyCurrentSource(destination: string): void {
  mkdirSync(destination, { recursive: true });
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (path) =>
        path !== "" &&
        path !== ".serena" &&
        !path.startsWith(".serena/") &&
        existsSync(join(REPO_ROOT, path)),
    );

  for (const relativePath of files) {
    const sourcePath = join(REPO_ROOT, relativePath);
    const destinationPath = join(destination, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(sourcePath), destinationPath);
    else copyFileSync(sourcePath, destinationPath);
  }
}

function npm(cwd: string, ...args: string[]): ReturnType<typeof spawnSync> {
  const invocation = resolveNpmInvocation();
  return spawnSync(invocation.executable, [...invocation.argumentPrefix, ...args], {
    cwd,
    encoding: "utf8",
    timeout: TEST_NPM_TIMEOUT_MS,
  });
}

/** Provision the mapped external peer into one disposable consumer prefix and observe its real shim. */
function provisionBacklogPeer(cwd: string, prefix: string, env: NodeJS.ProcessEnv) {
  const npmInvocation = resolveNpmInvocation();
  const installation = spawnSync(
    npmInvocation.executable,
    [
      ...npmInvocation.argumentPrefix,
      "install",
      "--global",
      "--prefix",
      prefix,
      "--no-audit",
      "--no-fund",
      BACKLOG_PEER_PACKAGE,
    ],
    { cwd, encoding: "utf8", timeout: TEST_NPM_TIMEOUT_MS, env },
  );
  const layout = resolveGlobalInstallLayout(prefix, "backlog.md");
  const invocation = resolveInstalledExecutableInvocation(
    process.platform,
    join(layout.executableRoot, "backlog"),
    ["--version"],
  );
  const version = spawnSync(invocation.executable, invocation.args, {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    env,
  });
  return {
    installation,
    version,
    packageRoot: layout.packageRoot,
    shimPath: invocation.shimPath,
  };
}

function directorySnapshot(
  root: string,
  excludedTopLevel: readonly string[] = [],
): Array<readonly [string, string]> {
  const snapshot: Array<readonly [string, string]> = [];
  const walk = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (prefix === "" && excludedTopLevel.includes(entry.name)) continue;
      const path = join(directory, entry.name);
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const stat = lstatSync(path, { bigint: true });
      const metadata = `${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
      if (entry.isDirectory()) {
        snapshot.push([`${relativePath}/`, `directory:${metadata}`]);
        walk(path, relativePath);
      } else if (entry.isSymbolicLink()) {
        snapshot.push([relativePath, `symlink:${metadata}:${readlinkSync(path)}`]);
      } else {
        const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
        snapshot.push([relativePath, `file:${metadata}:sha256:${digest}`]);
      }
    }
  };
  walk(root);
  return snapshot;
}

function archiveLayout(archive: string): string[] {
  if (archive.endsWith(".zip")) {
    return execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((entry) => entry !== "" && !entry.endsWith("/"))
      .sort();
  }
  return execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((entry) => entry.replace(/^\.\//, ""))
    .filter((entry) => entry !== "" && !entry.endsWith("/"))
    .sort();
}

function allRegularFileBytes(root: string): string {
  const chunks: Buffer[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) chunks.push(readFileSync(path));
    }
  };
  walk(root);
  return Buffer.concat(chunks).toString("utf8");
}

function commandAvailable(command: string, env: NodeJS.ProcessEnv): boolean {
  const probe = spawnSync(command, ["-v"], { encoding: "utf8", env, timeout: 10_000 });
  return probe.status === 0 && probe.error === undefined;
}

function namedDirectoryPaths(root: string, expectedName: string): string[] {
  const matches: string[] = [];
  const walk = (directory: string, prefix = ""): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )) {
      if (!entry.isDirectory()) continue;
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.name === expectedName) matches.push(relativePath);
      else walk(join(directory, entry.name), relativePath);
    }
  };
  walk(root);
  return matches;
}

type FixtureClient = "codex" | "claude-code";

function fixtureClientContract(client: FixtureClient): {
  scope: ".agents" | ".claude";
  prefix: "$" | "/";
} {
  return client === "codex" ? { scope: ".agents", prefix: "$" } : { scope: ".claude", prefix: "/" };
}

function discoverFixtureSkills(root: string, client: FixtureClient): string[] {
  const { scope } = fixtureClientContract(client);
  const skillsRoot = join(root, scope, "skills");
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillRoot = join(skillsRoot, entry.name);
      expect(readdirSync(skillRoot), `${client}: one-file ${entry.name}`).toEqual(["SKILL.md"]);
      const text = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
      const metadata = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);
      expect(metadata, `${client}: strict metadata for ${entry.name}`).not.toBeNull();
      expect(metadata?.[1], `${client}: directory/frontmatter ${entry.name}`).toBe(entry.name);
      return entry.name;
    })
    .sort();
}

function invokeFixtureSkill(root: string, client: FixtureClient, invocation: string): string {
  const { prefix, scope } = fixtureClientContract(client);
  expect(invocation.startsWith(prefix), `${client}: native invocation prefix`).toBe(true);
  const name = invocation.slice(prefix.length);
  expect(name).toMatch(/^wpm-[a-z-]+$/);
  expect(discoverFixtureSkills(root, client)).toContain(name);
  return readFileSync(join(root, scope, "skills", name, "SKILL.md"), "utf8");
}

function taskIdsFromPlainOutput(output: string): string[] {
  return [...output.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9-]*-\d+)\s+-/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function taskIdForTitle(output: string, title: string): string {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const id = new RegExp(`^\\s{2}([A-Za-z][A-Za-z0-9-]*-\\d+)\\s+-\\s+${escapedTitle}$`, "m").exec(
    output,
  )?.[1];
  if (id === undefined) throw new Error(`Backlog task not found: ${title}`);
  return id;
}

function taskStatusFromRecord(record: string): "To Do" | "In Progress" | "Done" {
  const status = /^Status:\s+.*?\b(To Do|In Progress|Done)\b/m.exec(record)?.[1];
  if (status === "To Do" || status === "In Progress" || status === "Done") return status;
  throw new Error("Backlog task record exposed no supported status");
}

function dependencyIdsFromTaskRecord(record: string): string[] {
  const dependencies = /^Dependencies:\s*(.+)$/m.exec(record)?.[1];
  return dependencies === undefined
    ? []
    : dependencies
        .split(",")
        .map((dependency) => dependency.trim())
        .filter((dependency) => dependency !== "");
}

function classifyCoreTask(record: string): { level: "project"; specialist: null } {
  if (/manifest\.yml\.project|wpm project meta/i.test(record)) {
    return { level: "project", specialist: null };
  }
  throw new Error("selected core task did not match the bounded project-level classification");
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("fresh local packed-install and inactive-candidate journey", () => {
  it("rejects bad invocation and a missing inspected report actionably", () => {
    const badInvocation = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--bad",
    );
    expect(badInvocation.status).toBe(2);
    expect(badInvocation.stderr).toMatch(/^usage:/i);

    const missing = npm(
      REPO_ROOT,
      "run",
      "--silent",
      "package:verify-install",
      "--",
      "--report",
      join(temporaryRoot("wpm-packed-install-missing-"), "missing.json"),
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/package inspection report.*npm run package:inspect/is);
  });

  it("exposes the mapped Backlog peer only from an isolated consumer prefix", () => {
    const root = temporaryRoot("wpm-packed-backlog-peer-");
    const consumer = join(root, "consumer");
    const home = join(consumer, "home");
    const workspace = join(consumer, "workspace");
    const cache = join(consumer, "npm-cache");
    const prefix = join(consumer, "prefix");
    for (const directory of [consumer, home, workspace, cache, prefix]) {
      mkdirSync(directory, { recursive: true });
    }
    const env = createIsolatedEnvironment(
      {
        home,
        workspace,
        cache,
        prefix,
        userConfig: join(consumer, "npmrc"),
        sourceRoot: REPO_ROOT,
      },
      process.env,
    );

    const provisioned = provisionBacklogPeer(consumer, prefix, env);
    expect(provisioned.installation.error).toBeUndefined();
    expect(
      provisioned.installation.status,
      String(provisioned.installation.stderr || provisioned.installation.stdout),
    ).toBe(0);
    expect({ status: provisioned.version.status, stderr: provisioned.version.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    expect(String(provisioned.version.stdout).trim()).toBe("1.45.2");
    expect(realpathSync(provisioned.packageRoot).startsWith(`${resolve(prefix)}${sep}`)).toBe(true);
    expect(resolve(provisioned.shimPath).startsWith(`${resolve(prefix)}${sep}`)).toBe(true);
    expect(resolve(provisioned.packageRoot).startsWith(`${resolve(REPO_ROOT)}${sep}`)).toBe(false);
    expect(resolve(provisioned.shimPath).startsWith(`${resolve(REPO_ROOT)}${sep}`)).toBe(false);
    expect(
      JSON.parse(readFileSync(join(provisioned.packageRoot, "package.json"), "utf8")),
    ).toMatchObject({ name: "backlog.md", version: "1.45.2" });

    const wpmManifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(wpmManifest.peerDependencies).toEqual({ "backlog.md": ">=1.0.0" });
    expect(wpmManifest.peerDependenciesMeta?.["backlog.md"]).toEqual({ optional: false });
    expect(wpmManifest.dependencies ?? {}).not.toHaveProperty("backlog.md");
    expect(wpmManifest.devDependencies ?? {}).not.toHaveProperty("backlog.md");
  });

  it(
    "installs the exact inspected archive without its source checkout and preserves agent config",
    () => {
      const root = temporaryRoot("wpm-packed-install-journey-");
      const source = join(root, "source");
      const artifacts = join(root, "artifacts");
      const reportPath = join(root, "inspection-report.json");
      const consumer = join(root, "consumer");
      copyCurrentSource(source);
      const sourcePackagePath = join(source, "package.json");
      const sourcePackage = JSON.parse(readFileSync(sourcePackagePath, "utf8")) as Record<
        string,
        unknown
      >;
      sourcePackage.repository = NPM_REPOSITORY;
      writeFileSync(sourcePackagePath, `${JSON.stringify(sourcePackage, undefined, 2)}\n`);

      // TASK-126 source-free fixture: pack a second project descriptor whose complete init plan includes one
      // project contribution and one concrete pre-included-bundle contribution. The source checkout is deleted
      // before this template is selected below, so the installed archive is the only possible definition source.
      const packedTaskTemplate = join(source, "templates", "project", "task126-plan");
      cpSync(join(source, "templates", "project", "minimal"), packedTaskTemplate, {
        recursive: true,
      });
      writeFileSync(
        join(packedTaskTemplate, "template.yml"),
        [
          "name: task126-plan",
          "scope: project",
          'revision: "packed-project-r1"',
          "parameters:",
          "  - name: project-name",
          "authoring-tasks:",
          "  - key: inspect-packed-source",
          "    title: Inspect packed source for {{wpm.project.name}}",
          "    acceptance-criteria:",
          "      - The packed project contribution is observable",
          "    depends-on:",
          "      - wpm:project:set-metadata",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(packedTaskTemplate, "files", "manifest.yml.tmpl"),
        [
          "project:",
          "  name: {{project-name}}",
          "  version: 0.1.0",
          "targets: []",
          "bundles:",
          "  - core",
          "",
        ].join("\n"),
      );
      mkdirSync(join(packedTaskTemplate, "files", "bundles", "core"), { recursive: true });
      writeFileSync(
        join(packedTaskTemplate, "files", "bundles", "core", "bundle.yml"),
        "id: core\nversion: 1.2.3\nsummary: core bundle\nconfirmation: safe\nrequires: {}\n",
      );
      const packedBundleTemplate = join(source, "templates", "bundle", "default", "template.yml");
      writeFileSync(
        packedBundleTemplate,
        `${readFileSync(packedBundleTemplate, "utf8").trimEnd()}\nrevision: "packed-bundle-r2"\nauthoring-tasks:\n  - key: inspect-packed-runtime\n    title: Inspect {{wpm.bundle.id}} packed runtime\n    acceptance-criteria:\n      - The {{wpm.bundle.id}} {{wpm.bundle.version}} packed runtime is observable\n    depends-on:\n      - wpm:bundle:plan\n`,
      );
      initializeGit(source);

      const dependencies = npm(source, "ci", "--ignore-scripts", "--no-audit", "--no-fund");
      expect({ status: dependencies.status, stderr: dependencies.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const preparation = npm(
        source,
        "run",
        "--silent",
        "package:inspect",
        "--",
        "--revision",
        "HEAD",
        "--output",
        artifacts,
      );
      expect({ status: preparation.status, stderr: preparation.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const inspection = JSON.parse(String(preparation.stdout)) as {
        status: string;
        sourceRevision: string;
        artifact: { path: string; size: number };
        package: { name: string; version: string; executableTargets: Record<string, string> };
        expectedPaths: string[];
      };
      writeFileSync(reportPath, String(preparation.stdout));
      expect(inspection.status).toBe("accepted");
      expect(existsSync(inspection.artifact.path)).toBe(true);

      const missingArtifactReport = join(root, "missing-artifact-report.json");
      writeFileSync(
        missingArtifactReport,
        JSON.stringify({
          ...inspection,
          artifact: { ...inspection.artifact, path: join(root, "missing-package.tgz") },
        }),
      );
      const missingArtifact = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:verify-install",
        "--",
        "--report",
        missingArtifactReport,
      );
      expect(missingArtifact.status).toBe(1);
      expect(missingArtifact.stderr).toMatch(
        /inspected package artifact.*rerun.*package:inspect/is,
      );

      rmSync(source, { recursive: true, force: true });
      expect(existsSync(source)).toBe(false);

      const verification = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:verify-install",
        "--",
        "--report",
        reportPath,
        "--output",
        consumer,
      );
      expect({ status: verification.status, stderr: verification.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const result = JSON.parse(String(verification.stdout)) as {
        status: string;
        sourceRevision: string;
        package: { name: string; version: string; executableTargets: Record<string, string> };
        artifact: { inspectedPath: string; frozenPath: string; size: number };
        environment: {
          root: string;
          packageRoot: string;
          workspace: string;
          prefix: string;
          npmCache: string;
        };
        installation: { status: string };
        executables: Array<{ name: string; version: string; shimPath: string }>;
        resources: {
          status: string;
          resolvedPaths: string[];
          missingPaths: string[];
          probe: { status: string; command: string; output: string };
        };
        configuration: {
          status: string;
          surfaces: Array<{ path: string; unchanged: boolean }>;
          roots: Array<{ path: string; unchanged: boolean }>;
        };
      };

      expect(result).toMatchObject({
        status: "accepted",
        sourceRevision: inspection.sourceRevision,
        package: inspection.package,
        artifact: {
          inspectedPath: resolve(inspection.artifact.path),
          size: inspection.artifact.size,
        },
        installation: { status: "installed" },
        resources: { status: "accepted", missingPaths: [], probe: { status: "accepted" } },
        configuration: { status: "unchanged" },
      });
      expect(result.artifact.frozenPath).not.toBe(result.artifact.inspectedPath);
      expect(readFileSync(result.artifact.frozenPath)).toEqual(
        readFileSync(result.artifact.inspectedPath),
      );
      expect(result.environment.root).toBe(resolve(consumer));
      expect(result.environment.packageRoot).toBe(realpathSync(result.environment.packageRoot));
      expect(result.environment.packageRoot.startsWith(resolve(consumer))).toBe(true);
      expect(result.environment.packageRoot.startsWith(resolve(source))).toBe(false);
      expect(result.executables).toHaveLength(
        Object.keys(inspection.package.executableTargets).length,
      );
      expect(result.executables.map(({ name }) => name).sort()).toEqual(
        Object.keys(inspection.package.executableTargets).sort(),
      );
      expect(
        result.executables.every(({ version }) => version === inspection.package.version),
      ).toBe(true);
      expect(result.executables.every(({ shimPath }) => existsSync(shimPath))).toBe(true);
      expect(result.resources.resolvedPaths).toEqual(inspection.expectedPaths);
      expect(result.resources.probe.command).toMatch(/template show minimal --scope project/);
      expect(result.resources.probe.output).toMatch(/minimal/i);
      expect(result.configuration.surfaces.length).toBeGreaterThanOrEqual(6);
      expect(result.configuration.surfaces.every(({ unchanged }) => unchanged)).toBe(true);
      expect(result.configuration.roots).toEqual([
        { path: join(consumer, "home"), unchanged: true },
        { path: join(consumer, "workspace"), unchanged: true },
      ]);

      const packagedPersonalSkill = join(
        result.environment.packageRoot,
        "agent-skills",
        PERSONAL_BOOTSTRAP_SKILL_NAME,
        "SKILL.md",
      );
      const packagedPersonalSkillText = readFileSync(packagedPersonalSkill, "utf8");
      expect(packagedPersonalSkillText).toContain("name: wpm-create-package");
      expect(packagedPersonalSkillText).toContain(
        "## Establish readiness before any write or mutation",
      );
      expect(readdirSync(dirname(packagedPersonalSkill))).toEqual(["SKILL.md"]);
      expect(result.resources.resolvedPaths).toContain("agent-skills/wpm-create-package/SKILL.md");

      const skillFamilyCells = [
        {
          name: "wpm-create-package",
          invocations: { codex: "$wpm-create-package", "claude-code": "/wpm-create-package" },
          triggerContract: /create|start|bootstrap/i,
          nonTriggerContract: /do not use.*continue|do not use.*edit/i,
        },
        {
          name: "wpm-author",
          invocations: { codex: "$wpm-author", "claude-code": "/wpm-author" },
          triggerContract: /continue|resume|choose the next/i,
          nonTriggerContract: /do not use to execute/i,
        },
        {
          name: "wpm-author-bundle",
          invocations: { codex: "$wpm-author-bundle", "claude-code": "/wpm-author-bundle" },
          triggerContract: /plan or change one WPM bundle/i,
          nonTriggerContract: /do not use it to author install recipes/i,
        },
        {
          name: "wpm-author-recipe",
          invocations: { codex: "$wpm-author-recipe", "claude-code": "/wpm-author-recipe" },
          triggerContract: /install-backlog recipe/i,
          nonTriggerContract: /leave bundle planning/i,
        },
        {
          name: "wpm-author-skill",
          invocations: { codex: "$wpm-author-skill", "claude-code": "/wpm-author-skill" },
          triggerContract: /agent capability|front door/i,
          nonTriggerContract: /managed workspace setup to wpm-author/i,
        },
        {
          name: "wpm-review-package",
          invocations: { codex: "$wpm-review-package", "claude-code": "/wpm-review-package" },
          triggerContract: /review.*work package.*handoff readiness/i,
          nonTriggerContract: /does not fix content.*does not authorize publication/i,
        },
      ] as const;
      const nativeSkillCells = join(consumer, "isolated-native-skill-cells");
      for (const cell of skillFamilyCells) {
        const packagedSkillPath = join(
          result.environment.packageRoot,
          "agent-skills",
          cell.name,
          "SKILL.md",
        );
        const packagedBytes = readFileSync(packagedSkillPath, "utf8");
        const metadata = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(packagedBytes);
        expect(metadata, `${cell.name}: strict frontmatter identity`).not.toBeNull();
        expect(metadata?.[1], `${cell.name}: packaged directory/frontmatter agreement`).toBe(
          cell.name,
        );
        expect(metadata?.[2], `${cell.name}: focused trigger contract`).toMatch(
          cell.triggerContract,
        );
        expect(metadata?.[2], `${cell.name}: adjacent non-trigger contract`).toMatch(
          cell.nonTriggerContract,
        );
        expect(packagedBytes, `${cell.name}: source-free instruction bytes`).not.toMatch(
          /\/workspace\/|\/home\/agent\/|file:\/\/|\]\((?:\.\.?\/|references\/|scripts\/|assets\/)/,
        );
        for (const forbiddenRoot of [source, REPO_ROOT]) {
          expect(packagedBytes, `${cell.name}: no checkout path ${forbiddenRoot}`).not.toContain(
            forbiddenRoot,
          );
          expect(packagedBytes).not.toContain(forbiddenRoot.split(sep).join("/"));
        }
        expect(readdirSync(dirname(packagedSkillPath))).toEqual(["SKILL.md"]);

        for (const client of ["codex", "claude-code"] as const) {
          const { scope } = fixtureClientContract(client);
          const clientRoot = join(nativeSkillCells, cell.name, client);
          const nativeSkillRoot = join(clientRoot, scope, "skills", cell.name);
          mkdirSync(nativeSkillRoot, { recursive: true });
          copyFileSync(packagedSkillPath, join(nativeSkillRoot, "SKILL.md"));
          expect(discoverFixtureSkills(clientRoot, client)).toEqual([cell.name]);
          expect(invokeFixtureSkill(clientRoot, client, cell.invocations[client])).toBe(
            packagedBytes,
          );
        }
      }
      expect(skillFamilyCells.map(({ name }) => name)).toEqual([
        PERSONAL_BOOTSTRAP_SKILL_NAME,
        ...WORKSPACE_SKILL_NAMES,
      ]);

      expect(readFileSync(join(consumer, "home", ".agents", "config.toml"), "utf8")).toBe(
        'model = "preserve-codex-personal"\n',
      );
      expect(readFileSync(join(consumer, "home", ".claude", "settings.json"), "utf8")).toContain(
        "preserve-claude-personal",
      );
      expect(readFileSync(join(consumer, "workspace", "AGENTS.md"), "utf8")).toContain(
        "preserve-codex-workspace",
      );
      expect(readFileSync(join(consumer, "workspace", "CLAUDE.md"), "utf8")).toContain(
        "preserve-claude-workspace",
      );

      const installedWpm = result.executables.find(({ name }) => name === "wpm");
      expect(installedWpm).toBeDefined();
      if (installedWpm === undefined) throw new Error("accepted packed install did not expose wpm");
      const installedWpmManifest = JSON.parse(
        readFileSync(join(result.environment.packageRoot, "package.json"), "utf8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      };
      expect(installedWpmManifest.peerDependencies).toEqual({ "backlog.md": ">=1.0.0" });
      expect(installedWpmManifest.peerDependenciesMeta?.["backlog.md"]).toEqual({
        optional: false,
      });
      expect(installedWpmManifest.dependencies ?? {}).not.toHaveProperty("backlog.md");
      expect(installedWpmManifest.devDependencies ?? {}).not.toHaveProperty("backlog.md");
      const installedHome = join(consumer, "home");
      const isolatedInstalledEnv = createIsolatedEnvironment(
        {
          home: installedHome,
          workspace: consumer,
          cache: result.environment.npmCache,
          prefix: result.environment.prefix,
          userConfig: join(consumer, "npmrc"),
          sourceRoot: REPO_ROOT,
        },
        process.env,
      );
      const pathKey = "PATH";
      const installedEnv = {
        ...isolatedInstalledEnv,
        [pathKey]: [
          dirname(installedWpm.shimPath),
          ...(isolatedInstalledEnv.PATH ?? "").split(delimiter).filter((entry) => entry !== ""),
        ]
          .filter((entry) => entry !== "")
          .join(delimiter),
      };
      const installedBacklog = provisionBacklogPeer(
        consumer,
        result.environment.prefix,
        installedEnv,
      );
      expect(installedBacklog.installation.error).toBeUndefined();
      expect(
        installedBacklog.installation.status,
        String(installedBacklog.installation.stderr || installedBacklog.installation.stdout),
      ).toBe(0);
      expect({
        status: installedBacklog.version.status,
        stderr: installedBacklog.version.stderr,
      }).toEqual({ status: 0, stderr: "" });
      expect(String(installedBacklog.version.stdout).trim()).toBe("1.45.2");
      expect(
        realpathSync(installedBacklog.packageRoot).startsWith(
          `${resolve(result.environment.prefix)}${sep}`,
        ),
      ).toBe(true);
      expect(
        resolve(installedBacklog.shimPath).startsWith(
          `${resolve(result.environment.prefix)}${sep}`,
        ),
      ).toBe(true);
      expect(resolve(installedBacklog.shimPath).startsWith(`${resolve(REPO_ROOT)}${sep}`)).toBe(
        false,
      );
      const runInstalledWpm = (
        args: readonly string[],
        cwd: string,
        home = installedHome,
      ): ReturnType<typeof spawnSync> => {
        const invocation = resolveInstalledExecutableInvocation(
          process.platform,
          installedWpm.shimPath,
          args,
        );
        return spawnSync(invocation.executable, invocation.args, {
          cwd,
          encoding: "utf8",
          timeout: 180_000,
          env: { ...installedEnv, HOME: home, USERPROFILE: home, PWD: cwd },
        });
      };

      const packedPlanHome = join(consumer, "home-task126-packed-plan");
      const packedPlanWorkspace = join(consumer, "workspace-task126-packed-plan");
      mkdirSync(packedPlanHome, { recursive: true });
      const packedPlanInit = runInstalledWpm(
        [
          "init",
          "task126-packed-plan",
          "--at",
          packedPlanWorkspace,
          "--template",
          "task126-plan",
          "--authoring-client",
          "codex",
        ],
        consumer,
        packedPlanHome,
      );
      expect({ status: packedPlanInit.status, stderr: packedPlanInit.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(packedPlanInit.stdout)).toMatch(/materialised: 22 authoring task/);
      const packedPlanTaskRoot = join(
        packedPlanWorkspace,
        ".authoring-backlog",
        "backlog",
        "tasks",
      );
      expect(readdirSync(packedPlanTaskRoot).filter((entry) => entry.endsWith(".md"))).toHaveLength(
        22,
      );
      const packedPlanTaskBytes = allRegularFileBytes(packedPlanTaskRoot);
      expect(packedPlanTaskBytes).toContain("Inspect packed source for task126-packed-plan");
      expect(packedPlanTaskBytes).toContain("wpm:template-origin:built-in:project:task126-plan");
      expect(packedPlanTaskBytes).toContain("wpm:template-revision:packed-project-r1");
      expect(packedPlanTaskBytes).toContain("wpm:template-key:inspect-packed-source");
      expect(packedPlanTaskBytes).toContain("Inspect core packed runtime");
      expect(packedPlanTaskBytes).toContain("wpm:template-origin:built-in:bundle:default");
      expect(packedPlanTaskBytes).toContain("wpm:template-revision:packed-bundle-r2");
      expect(packedPlanTaskBytes).toContain("wpm:bundle:core");
      expect(packedPlanTaskBytes).toMatch(/dependencies:\s*\n\s*- AUTHORING-1\b/);
      expect(packedPlanTaskBytes).toMatch(/dependencies:\s*\n\s*- AUTHORING-10\b/);

      const packedBundleHome = join(consumer, "home-task127-packed-bundle");
      const packedBundleWorkspace = join(consumer, "workspace-task127-packed-bundle");
      mkdirSync(packedBundleHome, { recursive: true });
      const packedBundleInit = runInstalledWpm(
        [
          "init",
          "task127-packed-bundle",
          "--at",
          packedBundleWorkspace,
          "--template",
          "minimal",
          "--authoring-client",
          "codex",
        ],
        consumer,
        packedBundleHome,
      );
      expect({ status: packedBundleInit.status, stderr: packedBundleInit.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(packedBundleInit.stdout)).toContain("materialised: 8 authoring task(s)");

      const packedBundleBacklogRoot = join(packedBundleWorkspace, ".authoring-backlog");
      const packedBundleBacklogExecutable = installedBacklog.shimPath;
      const runPackedBundleBacklog = (args: readonly string[]): ReturnType<typeof spawnSync> => {
        const invocation =
          process.platform === "win32" && packedBundleBacklogExecutable.endsWith(".exe")
            ? { executable: packedBundleBacklogExecutable, args: [...args] }
            : resolveInstalledExecutableInvocation(
                process.platform,
                packedBundleBacklogExecutable,
                args,
              );
        return spawnSync(invocation.executable, invocation.args, {
          cwd: packedBundleBacklogRoot,
          encoding: "utf8",
          timeout: 60_000,
          env: {
            ...installedEnv,
            HOME: packedBundleHome,
            USERPROFILE: packedBundleHome,
            PWD: packedBundleBacklogRoot,
          },
        });
      };

      const packedBundleInitialList = runPackedBundleBacklog(["task", "list", "--plain"]);
      expect({
        status: packedBundleInitialList.status,
        stderr: packedBundleInitialList.stderr,
      }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(taskIdsFromPlainOutput(String(packedBundleInitialList.stdout))).toHaveLength(8);
      expect(existsSync(source)).toBe(false);

      const createRecordedBundle = runInstalledWpm(
        ["-C", packedBundleWorkspace, "bundle", "new", "source-free", "--disabled", "--no-advisor"],
        packedBundleWorkspace,
        packedBundleHome,
      );
      expect({ status: createRecordedBundle.status, stderr: createRecordedBundle.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(createRecordedBundle.stdout)).toContain("materialised: 12 authoring task(s)");

      const createdTaskList = runPackedBundleBacklog(["task", "list", "--plain"]);
      expect({ status: createdTaskList.status, stderr: createdTaskList.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const createdTaskListText = String(createdTaskList.stdout);
      expect(taskIdsFromPlainOutput(createdTaskListText)).toHaveLength(20);
      const planSourceFreeId = taskIdForTitle(createdTaskListText, "Plan bundle source-free");
      const packedContributionTitle = "Inspect source-free packed runtime";
      const packedContributionId = taskIdForTitle(createdTaskListText, packedContributionTitle);
      const packedContributionRecord = runPackedBundleBacklog([
        "task",
        packedContributionId,
        "--plain",
      ]);
      expect({
        status: packedContributionRecord.status,
        stderr: packedContributionRecord.stderr,
      }).toEqual({ status: 0, stderr: "" });
      const packedContributionRecordText = String(packedContributionRecord.stdout);
      expect(dependencyIdsFromTaskRecord(packedContributionRecordText)).toEqual([planSourceFreeId]);
      expect(packedContributionRecordText).toContain("wpm:template-origin:built-in:bundle:default");
      expect(packedContributionRecordText).toContain("wpm:template-revision:packed-bundle-r2");
      expect(packedContributionRecordText).toContain("wpm:template-key:inspect-packed-runtime");
      expect(packedContributionRecordText).toContain("wpm:bundle:source-free");

      const bundleContributionRecordPath = join(
        packedBundleWorkspace,
        ".wpm-bundle-authoring.json",
      );
      const bundleContributionRecord = JSON.parse(
        readFileSync(bundleContributionRecordPath, "utf8"),
      ) as {
        defaultContribution: {
          contribution: {
            status: string;
            producer: { source: string; scope: string; name: string };
            source: { revision: string };
          };
        };
        bundles: Array<{
          id: string;
          contribution: {
            status: string;
            producer: { source: string; scope: string; name: string };
            revision?: string;
            tasks?: Array<{
              key: string;
              title: string;
              dependencyIdentities: string[];
              labels: string[];
            }>;
          };
        }>;
      };
      expect(bundleContributionRecord.defaultContribution.contribution).toMatchObject({
        status: "source",
        producer: { source: "built-in", scope: "bundle", name: "default" },
        source: { revision: "packed-bundle-r2" },
      });
      const sourceFreeContribution = bundleContributionRecord.bundles.find(
        ({ id }) => id === "source-free",
      )?.contribution;
      expect(sourceFreeContribution).toMatchObject({
        status: "tasks",
        producer: { source: "built-in", scope: "bundle", name: "default" },
        revision: "packed-bundle-r2",
        tasks: [
          {
            key: "inspect-packed-runtime",
            title: packedContributionTitle,
            dependencyIdentities: ["wpm:bundle:plan#bundle:source-free"],
            labels: [
              "wpm:template-task",
              "wpm:template-origin:built-in:bundle:default",
              "wpm:template-revision:packed-bundle-r2",
              "wpm:template-key:inspect-packed-runtime",
              "wpm:bundle:source-free",
            ],
          },
        ],
      });

      const claimPackedContribution = runPackedBundleBacklog([
        "task",
        "edit",
        packedContributionId,
        "-s",
        "In Progress",
        "--check-ac",
        "1",
        "--notes",
        "preserve packed source-free author progress",
      ]);
      expect({
        status: claimPackedContribution.status,
        stderr: claimPackedContribution.stderr,
      }).toEqual({ status: 0, stderr: "" });
      const beforeEnableTaskList = String(
        runPackedBundleBacklog(["task", "list", "--plain"]).stdout,
      );
      const beforeEnableContribution = String(
        runPackedBundleBacklog(["task", packedContributionId, "--plain"]).stdout,
      );
      const beforeEnableState = readFileSync(bundleContributionRecordPath, "utf8");
      expect(taskStatusFromRecord(beforeEnableContribution)).toBe("In Progress");
      expect(beforeEnableContribution).toContain("preserve packed source-free author progress");

      rmSync(join(packedBundleWorkspace, "wip", "bundles", "bundle-template"), {
        recursive: true,
        force: true,
      });
      const installedDefaultBundleTemplate = join(
        result.environment.packageRoot,
        "templates",
        "bundle",
        "default",
      );
      const unavailableDefaultBundleTemplate = join(
        result.environment.packageRoot,
        "templates",
        "bundle",
        "default-unavailable-task127",
      );
      renameSync(installedDefaultBundleTemplate, unavailableDefaultBundleTemplate);
      let enableRecordedBundle: ReturnType<typeof spawnSync>;
      try {
        enableRecordedBundle = runInstalledWpm(
          ["-C", packedBundleWorkspace, "bundle", "enable", "source-free", "--no-advisor"],
          packedBundleWorkspace,
          packedBundleHome,
        );
      } finally {
        renameSync(unavailableDefaultBundleTemplate, installedDefaultBundleTemplate);
      }
      expect({ status: enableRecordedBundle.status, stderr: enableRecordedBundle.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(enableRecordedBundle.stdout)).toContain("enabled bundle source-free");
      expect(String(enableRecordedBundle.stdout)).not.toContain("materialised:");
      expect(String(runPackedBundleBacklog(["task", "list", "--plain"]).stdout)).toBe(
        beforeEnableTaskList,
      );
      expect(String(runPackedBundleBacklog(["task", packedContributionId, "--plain"]).stdout)).toBe(
        beforeEnableContribution,
      );
      expect(readFileSync(bundleContributionRecordPath, "utf8")).toBe(beforeEnableState);
      expect(readFileSync(join(packedBundleWorkspace, "wip", "manifest.yml"), "utf8")).toMatch(
        /^bundles:\s*\[\s*source-free\s*\]$/m,
      );

      for (const cell of [
        {
          name: "codex-only",
          selectedClients: ["codex"],
          selectedScope: ".agents",
          unselectedScope: ".claude",
          nextAction: "$wpm-create-package",
        },
        {
          name: "claude-only",
          selectedClients: ["claude-code"],
          selectedScope: ".claude",
          unselectedScope: ".agents",
          nextAction: "/wpm-create-package",
        },
      ] as const) {
        const home = join(consumer, `home-${cell.name}`);
        const workspace = join(consumer, `workspace-${cell.name}`);
        mkdirSync(join(home, ".agents"), { recursive: true });
        mkdirSync(join(home, ".claude"), { recursive: true });
        mkdirSync(workspace, { recursive: true });
        writeFileSync(join(home, ".agents", "config.toml"), `preserve-${cell.name}-codex\n`);
        writeFileSync(
          join(home, ".claude", "settings.json"),
          `${JSON.stringify({ preserve: `${cell.name}-claude` })}\n`,
        );
        const unselectedBefore = directorySnapshot(join(home, cell.unselectedScope));
        const workspaceBefore = directorySnapshot(workspace);
        const setup = runInstalledWpm(
          [
            "authoring",
            "setup",
            ...cell.selectedClients.flatMap((client) => ["--client", client]),
            "--json",
          ],
          workspace,
          home,
        );
        expect({ cell: cell.name, status: setup.status, stderr: setup.stderr }).toEqual({
          cell: cell.name,
          status: 0,
          stderr: "",
        });
        const setupResult = JSON.parse(String(setup.stdout)) as {
          selectedClients: string[];
          clients: Array<{ id: string; nextAction: string }>;
        };
        expect(setupResult.selectedClients).toEqual(cell.selectedClients);
        expect(setupResult.clients).toEqual([
          expect.objectContaining({ id: cell.selectedClients[0], nextAction: cell.nextAction }),
        ]);
        for (const forbiddenRoot of [source, REPO_ROOT]) {
          expect(String(setup.stdout)).not.toContain(forbiddenRoot);
          expect(String(setup.stdout)).not.toContain(forbiddenRoot.split(sep).join("/"));
        }
        expect(
          readFileSync(
            join(home, cell.selectedScope, "skills", PERSONAL_BOOTSTRAP_SKILL_NAME, "SKILL.md"),
            "utf8",
          ),
        ).toBe(packagedPersonalSkillText);
        expect(readdirSync(join(home, cell.selectedScope, "skills"))).toEqual([
          PERSONAL_BOOTSTRAP_SKILL_NAME,
        ]);
        expect(
          existsSync(
            join(home, cell.unselectedScope, "skills", PERSONAL_BOOTSTRAP_SKILL_NAME, "SKILL.md"),
          ),
        ).toBe(false);
        expect(directorySnapshot(join(home, cell.unselectedScope))).toEqual(unselectedBefore);
        expect(readFileSync(join(home, ".agents", "config.toml"), "utf8")).toBe(
          `preserve-${cell.name}-codex\n`,
        );
        expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe(
          `${JSON.stringify({ preserve: `${cell.name}-claude` })}\n`,
        );
        expect(directorySnapshot(workspace)).toEqual(workspaceBefore);
        expect(
          JSON.parse(readFileSync(join(home, ".wpm", "authoring-setup.json"), "utf8")),
        ).toMatchObject({ status: "complete", defaults: cell.selectedClients });
      }
      const setupInvocation = resolveInstalledExecutableInvocation(
        process.platform,
        installedWpm.shimPath,
        ["authoring", "setup", "--client", "codex", "--client", "claude-code", "--json"],
      );
      const bothSetupWorkspace = join(consumer, "workspace-both-clients");
      mkdirSync(bothSetupWorkspace, { recursive: true });
      const bothSetupWorkspaceBefore = directorySnapshot(bothSetupWorkspace);
      const installedSetup = spawnSync(setupInvocation.executable, setupInvocation.args, {
        cwd: bothSetupWorkspace,
        encoding: "utf8",
        timeout: 180_000,
        env: { ...installedEnv, PWD: bothSetupWorkspace },
      });
      expect({ status: installedSetup.status, stderr: installedSetup.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(JSON.parse(String(installedSetup.stdout))).toMatchObject({
        status: "complete",
        selectedClients: ["codex", "claude-code"],
        setupApplied: true,
        clients: [
          { id: "codex", outcome: "installed", nextAction: "$wpm-create-package" },
          { id: "claude-code", outcome: "installed", nextAction: "/wpm-create-package" },
        ],
      });
      for (const forbiddenRoot of [source, REPO_ROOT]) {
        expect(String(installedSetup.stdout)).not.toContain(forbiddenRoot);
        expect(String(installedSetup.stdout)).not.toContain(forbiddenRoot.split(sep).join("/"));
      }
      for (const personalScope of [".agents", ".claude"]) {
        const personalSkill = join(
          installedHome,
          personalScope,
          "skills",
          PERSONAL_BOOTSTRAP_SKILL_NAME,
          "SKILL.md",
        );
        expect(readFileSync(personalSkill, "utf8")).toBe(packagedPersonalSkillText);
        expect(readdirSync(dirname(personalSkill))).toEqual(["SKILL.md"]);
        expect(readdirSync(dirname(dirname(personalSkill)))).toEqual([
          PERSONAL_BOOTSTRAP_SKILL_NAME,
        ]);
        expect(existsSync(join(dirname(dirname(personalSkill)), "installer-builder"))).toBe(false);
      }
      expect(directorySnapshot(bothSetupWorkspace)).toEqual(bothSetupWorkspaceBefore);
      expect(existsSync(join(installedHome, ".wpm", "authoring-setup.json"))).toBe(true);

      const repeatedSetup = spawnSync(setupInvocation.executable, setupInvocation.args, {
        cwd: consumer,
        encoding: "utf8",
        timeout: 180_000,
        env: installedEnv,
      });
      expect(repeatedSetup.status).toBe(0);
      expect(
        (
          JSON.parse(String(repeatedSetup.stdout)) as { clients: Array<{ outcome: string }> }
        ).clients.map(({ outcome }) => outcome),
      ).toEqual(["unchanged", "unchanged"]);

      const personalStatePath = join(installedHome, ".wpm", "authoring-setup.json");
      const personalState = JSON.parse(readFileSync(personalStatePath, "utf8")) as {
        setupVersion: string;
        managed: Array<{ client: string; version: string; sha256: string }>;
      };
      const olderBytes = "OLDER WPM-OWNED PERSONAL BOOTSTRAP\n";
      const codexPersonalSkill = join(
        installedHome,
        ".agents",
        "skills",
        PERSONAL_BOOTSTRAP_SKILL_NAME,
        "SKILL.md",
      );
      writeFileSync(codexPersonalSkill, olderBytes);
      personalState.setupVersion = "0.0.9";
      for (const record of personalState.managed) record.version = "0.0.9";
      const codexRecord = personalState.managed.find(({ client }) => client === "codex");
      expect(codexRecord).toBeDefined();
      if (codexRecord === undefined) throw new Error("personal state omitted Codex ownership");
      codexRecord.sha256 = createHash("sha256").update(olderBytes).digest("hex");
      writeFileSync(personalStatePath, `${JSON.stringify(personalState, undefined, 2)}\n`);
      const updatedSetup = spawnSync(setupInvocation.executable, setupInvocation.args, {
        cwd: consumer,
        encoding: "utf8",
        timeout: 180_000,
        env: installedEnv,
      });
      expect(updatedSetup.status).toBe(0);
      expect(
        (
          JSON.parse(String(updatedSetup.stdout)) as { clients: Array<{ outcome: string }> }
        ).clients.map(({ outcome }) => outcome),
      ).toEqual(["updated", "unchanged"]);
      expect(readFileSync(codexPersonalSkill, "utf8")).toBe(packagedPersonalSkillText);

      const assertWorkspaceSelection = (
        workspace: string,
        selectedClients: readonly ("codex" | "claude-code")[],
        origin: "created" | "legacy-adopted" = "created",
      ): void => {
        const state = JSON.parse(readFileSync(join(workspace, ".wpm-authoring.json"), "utf8")) as {
          status: string;
          selectedClients: string[];
          origin: string;
        };
        const receipt = JSON.parse(readFileSync(join(workspace, ".wpm-handoff.json"), "utf8")) as {
          status: string;
          configuredClients: string[];
          authoringBacklogPath: string;
          clients: Array<{
            id: string;
            firstSkill: { name: string; invocation: string };
          }>;
        };
        expect(state).toMatchObject({ status: "complete", selectedClients, origin });
        expect(receipt).toMatchObject({
          status: "prepared",
          configuredClients: selectedClients,
          authoringBacklogPath: ".authoring-backlog",
        });
        expect(receipt.clients.map(({ id, firstSkill }) => ({ id, firstSkill }))).toEqual(
          selectedClients.map((client) => ({
            id: client,
            firstSkill: {
              name: "wpm-author",
              invocation: client === "codex" ? "$wpm-author" : "/wpm-author",
            },
          })),
        );
        expect(namedDirectoryPaths(workspace, ".authoring-backlog")).toEqual([
          ".authoring-backlog",
        ]);
        for (const client of ["codex", "claude-code"] as const) {
          const selected = selectedClients.includes(client);
          const nativeScope = client === "codex" ? ".agents" : ".claude";
          const frontDoor = client === "codex" ? "AGENTS.md" : "CLAUDE.md";
          const invocation = client === "codex" ? "$wpm-author" : "/wpm-author";
          for (const skillName of WORKSPACE_SKILL_NAMES) {
            const path = join(workspace, nativeScope, "skills", skillName, "SKILL.md");
            expect(existsSync(path), `${workspace}: ${client}/${skillName}`).toBe(selected);
            if (selected) {
              expect(readFileSync(path, "utf8")).toBe(
                readFileSync(
                  join(result.environment.packageRoot, "agent-skills", skillName, "SKILL.md"),
                  "utf8",
                ),
              );
            }
          }
          if (selected) {
            expect(readdirSync(join(workspace, nativeScope, "skills")).sort()).toEqual(
              [...WORKSPACE_SKILL_NAMES].sort(),
            );
          } else {
            expect(existsSync(join(workspace, nativeScope)), `${workspace}: ${nativeScope}`).toBe(
              false,
            );
          }
          expect(existsSync(join(workspace, frontDoor)), `${workspace}: ${frontDoor}`).toBe(
            selected,
          );
          if (selected) {
            const frontDoorText = readFileSync(join(workspace, frontDoor), "utf8");
            expect(frontDoorText.match(/(?:\$|\/)wpm-[a-z-]+/g)).toEqual([invocation]);
          }
        }
      };

      const retainedCodexWorkspace = join(consumer, "created-retained-codex");
      const retainedCodexInit = runInstalledWpm(
        ["init", "created-retained-codex", "--at", retainedCodexWorkspace],
        consumer,
        join(consumer, "home-codex-only"),
      );
      expect({ status: retainedCodexInit.status, stderr: retainedCodexInit.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      assertWorkspaceSelection(retainedCodexWorkspace, ["codex"]);

      const explicitCodexWorkspace = join(consumer, "created-explicit-codex");
      const explicitCodexInit = runInstalledWpm(
        [
          "init",
          "created-explicit-codex",
          "--at",
          explicitCodexWorkspace,
          "--authoring-client",
          "codex",
        ],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: explicitCodexInit.status, stderr: explicitCodexInit.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      assertWorkspaceSelection(explicitCodexWorkspace, ["codex"]);
      const addOppositeTarget = runInstalledWpm(
        ["project", "targets", "add", "claude-code", "-C", explicitCodexWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: addOppositeTarget.status, stderr: addOppositeTarget.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const oppositeTargets = readFileSync(
        join(explicitCodexWorkspace, "wip", "manifest.yml"),
        "utf8",
      );
      expect(oppositeTargets).toMatch(/targets:\s*\[\s*claude-code\s*\]/);
      const reappliedCodex = runInstalledWpm(
        ["authoring", "integrate", "--client", "codex", "-C", explicitCodexWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: reappliedCodex.status, stderr: reappliedCodex.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const repreparedCodex = runInstalledWpm(
        ["authoring", "handoff", "prepare", "--json", "-C", explicitCodexWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: repreparedCodex.status, stderr: repreparedCodex.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(readFileSync(join(explicitCodexWorkspace, "wip", "manifest.yml"), "utf8")).toBe(
        oppositeTargets,
      );
      assertWorkspaceSelection(explicitCodexWorkspace, ["codex"]);

      const installedWorkspace = join(consumer, "accepted-authoring-workspace");
      const portableInstalledWorkspace = installedWorkspace.split(sep).join("/");
      const portableInstalledHome = installedHome.split(sep).join("/");
      const installedInvocation = resolveInstalledExecutableInvocation(
        process.platform,
        installedWpm.shimPath,
        ["init", "accepted-authoring-workspace", "--at", installedWorkspace],
      );
      const installedInit = spawnSync(installedInvocation.executable, installedInvocation.args, {
        cwd: consumer,
        encoding: "utf8",
        timeout: 180_000,
        env: installedEnv,
      });
      expect({ status: installedInit.status, stderr: installedInit.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(installedInit.stdout)).toContain("not spawned or authenticated");
      expect(String(installedInit.stdout)).toContain("acceptance is not claimed");
      const installedManifest = readFileSync(
        join(installedWorkspace, "wip", "manifest.yml"),
        "utf8",
      );
      expect(installedManifest).toMatch(/^targets:\s*\[\]\s*$/m);
      const installedState = JSON.parse(
        readFileSync(join(installedWorkspace, ".wpm-authoring.json"), "utf8"),
      ) as {
        status: string;
        integrationVersion: string;
        selectedClients: string[];
        origin: string;
      };
      expect(installedState).toMatchObject({
        status: "complete",
        integrationVersion: inspection.package.version,
        selectedClients: ["codex", "claude-code"],
        origin: "created",
      });
      const installedReceipt = JSON.parse(
        readFileSync(join(installedWorkspace, ".wpm-handoff.json"), "utf8"),
      ) as {
        status: string;
        workspaceRoot: string;
        integrationVersion: string;
        configuredClients: string[];
        clients: Array<{
          id: string;
          frontDoor: string;
          firstSkill: { name: string; invocation: string };
          verification: { command: string; args: string[]; workingDirectory: string };
        }>;
      };
      expect(installedReceipt).toMatchObject({
        status: "prepared",
        workspaceRoot: portableInstalledWorkspace,
        integrationVersion: inspection.package.version,
        configuredClients: ["codex", "claude-code"],
        clients: [
          {
            id: "codex",
            frontDoor: "AGENTS.md",
            firstSkill: { name: "wpm-author", invocation: "$wpm-author" },
          },
          {
            id: "claude-code",
            frontDoor: "CLAUDE.md",
            firstSkill: { name: "wpm-author", invocation: "/wpm-author" },
          },
        ],
      });
      const humanVerificationOutputs: string[] = [];
      for (const client of installedReceipt.clients) {
        expect(client.verification).toEqual({
          command: "wpm",
          args: [
            "-C",
            portableInstalledWorkspace,
            "authoring",
            "handoff",
            "verify",
            "--client",
            client.id,
          ],
          workingDirectory: portableInstalledWorkspace,
        });
        const verificationInvocation = resolveInstalledExecutableInvocation(
          process.platform,
          installedWpm.shimPath,
          client.verification.args,
        );
        const receivingVerification = spawnSync(
          verificationInvocation.executable,
          verificationInvocation.args,
          {
            cwd: installedWorkspace,
            encoding: "utf8",
            timeout: 180_000,
            env: installedEnv,
          },
        );
        expect(
          {
            client: client.id,
            status: receivingVerification.status,
            stderr: receivingVerification.stderr,
          },
          client.id,
        ).toEqual({ client: client.id, status: 0, stderr: "" });
        expect(receivingVerification.stdout).toContain("verified fresh-agent handoff");
        expect(receivingVerification.stdout).toContain(`${client.id}: valid`);
        expect(receivingVerification.stdout).toContain(
          "agent process: not spawned or authenticated; receiving-agent acceptance is not claimed",
        );
        humanVerificationOutputs.push(String(receivingVerification.stdout));
      }
      const freshVerification = runInstalledWpm(
        ["-C", installedWorkspace, "authoring", "handoff", "verify", "--client", "codex", "--json"],
        installedWorkspace,
      );
      expect({ status: freshVerification.status, stderr: freshVerification.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const freshVerificationResult = JSON.parse(String(freshVerification.stdout)) as {
        status: string;
        workspaceRoot: string;
        sharedValid: boolean;
        agreement: {
          workingDirectory: { status: string; path: string };
          receipt: { status: string };
          managedState: { status: string };
          authoringBacklog: { status: string };
          clients: Array<{
            id: string;
            status: string;
            frontDoor: { status: string };
            skillFamily: { status: string; names: string[] };
          }>;
        };
        workEvidence: { resumable: boolean; dependencyEligible: boolean };
      };
      expect(freshVerificationResult).toMatchObject({
        status: "verified",
        workspaceRoot: portableInstalledWorkspace,
        sharedValid: true,
        agreement: {
          workingDirectory: { status: "valid", path: portableInstalledWorkspace },
          receipt: { status: "valid" },
          managedState: { status: "valid" },
          authoringBacklog: { status: "valid" },
          clients: [
            {
              id: "codex",
              status: "valid",
              frontDoor: { status: "valid" },
              skillFamily: { status: "valid", names: WORKSPACE_SKILL_NAMES },
            },
            {
              id: "claude-code",
              status: "valid",
              frontDoor: { status: "valid" },
              skillFamily: { status: "valid", names: WORKSPACE_SKILL_NAMES },
            },
          ],
        },
        workEvidence: { resumable: false, dependencyEligible: true },
      });
      for (const boundaryEvidence of [
        String(installedInit.stdout),
        ...humanVerificationOutputs,
        JSON.stringify(installedReceipt),
        String(freshVerification.stdout),
      ]) {
        expect(boundaryEvidence).not.toMatch(
          /\bWPM\b.{0,80}\b(?:owns?|creates?|persists?)\b.{0,40}\b(?:agent process|authentication|session|acceptance)\b/i,
        );
      }

      const backlogRoot = join(installedWorkspace, ".authoring-backlog");
      const backlogExecutable = installedBacklog.shimPath;
      expect(resolve(backlogExecutable).startsWith(`${resolve(REPO_ROOT)}${sep}`)).toBe(false);
      const runInstalledBacklog = (args: readonly string[]): ReturnType<typeof spawnSync> => {
        const invocation =
          process.platform === "win32" && backlogExecutable.endsWith(".exe")
            ? { executable: backlogExecutable, args: [...args] }
            : resolveInstalledExecutableInvocation(process.platform, backlogExecutable, args);
        return spawnSync(invocation.executable, invocation.args, {
          cwd: backlogRoot,
          encoding: "utf8",
          timeout: 60_000,
          env: { ...installedEnv, PWD: backlogRoot },
        });
      };
      const backlogVersion = runInstalledBacklog(["--version"]);
      expect({ status: backlogVersion.status, stderr: backlogVersion.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const initialTaskList = runInstalledBacklog(["task", "list", "--plain"]);
      const initialSequence = runInstalledBacklog(["sequence", "list", "--plain"]);
      expect({ status: initialTaskList.status, stderr: initialTaskList.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect({ status: initialSequence.status, stderr: initialSequence.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(initialTaskList.stdout)).not.toMatch(/\bIn Progress\b/);
      const initialTaskIds = taskIdsFromPlainOutput(String(initialTaskList.stdout));
      const initialSequenceIds = taskIdsFromPlainOutput(String(initialSequence.stdout));
      expect(initialTaskIds.length).toBeGreaterThan(0);
      expect([...initialSequenceIds].sort()).toEqual([...initialTaskIds].sort());
      const initialTaskRecords = new Map<string, string>();
      for (const taskId of initialTaskIds) {
        const task = runInstalledBacklog(["task", taskId, "--plain"]);
        expect({ taskId, status: task.status, stderr: task.stderr }).toEqual({
          taskId,
          status: 0,
          stderr: "",
        });
        initialTaskRecords.set(taskId, String(task.stdout));
      }

      const selectedTask = initialSequenceIds[0];
      expect(selectedTask).toBeDefined();
      if (selectedTask === undefined) throw new Error("fresh sequence exposed no eligible task");
      expect(String(initialTaskList.stdout)).toContain(selectedTask);
      const initialTaskRecord = initialTaskRecords.get(selectedTask);
      if (initialTaskRecord === undefined)
        throw new Error("selected task was absent from full read");
      expect(taskStatusFromRecord(initialTaskRecord)).toBe("To Do");
      expect(classifyCoreTask(initialTaskRecord)).toEqual({ level: "project", specialist: null });
      const selectedDependencies = dependencyIdsFromTaskRecord(initialTaskRecord);
      for (const dependency of selectedDependencies) {
        const dependencyRecord = initialTaskRecords.get(dependency);
        expect(
          dependencyRecord,
          `${selectedTask}: dependency ${dependency} was fully read`,
        ).toBeDefined();
        if (dependencyRecord !== undefined)
          expect(taskStatusFromRecord(dependencyRecord)).toBe("Done");
      }

      const freshTaskList = runInstalledBacklog(["task", "list", "--plain"]);
      const freshSequence = runInstalledBacklog(["sequence", "list", "--plain"]);
      expect(String(freshTaskList.stdout)).toBe(String(initialTaskList.stdout));
      expect(String(freshSequence.stdout)).toBe(String(initialSequence.stdout));
      for (const taskId of initialTaskIds) {
        const freshTask = runInstalledBacklog(["task", taskId, "--plain"]);
        expect({ taskId, status: freshTask.status, stderr: freshTask.stderr }).toEqual({
          taskId,
          status: 0,
          stderr: "",
        });
        expect(String(freshTask.stdout), `${taskId}: freshness barrier`).toBe(
          initialTaskRecords.get(taskId),
        );
      }

      const claim = runInstalledBacklog(["task", "edit", selectedTask, "-s", "In Progress"]);
      expect({ status: claim.status, stderr: claim.stderr }).toEqual({ status: 0, stderr: "" });
      const claimedTaskList = runInstalledBacklog(["task", "list", "--plain"]);
      const claimedSequence = runInstalledBacklog(["sequence", "list", "--plain"]);
      expect({ status: claimedTaskList.status, stderr: claimedTaskList.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect({ status: claimedSequence.status, stderr: claimedSequence.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const claimedRecords = new Map<string, string>();
      for (const taskId of initialTaskIds) {
        const claimedTask = runInstalledBacklog(["task", taskId, "--plain"]);
        expect({ taskId, status: claimedTask.status, stderr: claimedTask.stderr }).toEqual({
          taskId,
          status: 0,
          stderr: "",
        });
        claimedRecords.set(taskId, String(claimedTask.stdout));
      }
      expect(
        [...claimedRecords]
          .filter(([, record]) => taskStatusFromRecord(record) === "In Progress")
          .map(([taskId]) => taskId),
      ).toEqual([selectedTask]);
      for (const taskId of initialTaskIds.filter((taskId) => taskId !== selectedTask)) {
        expect(claimedRecords.get(taskId), `${taskId}: unaffected by exact claim`).toBe(
          initialTaskRecords.get(taskId),
        );
      }
      expect(taskIdsFromPlainOutput(String(claimedTaskList.stdout))).toContain(selectedTask);
      expect(String(claimedSequence.stdout)).toBe(String(initialSequence.stdout));
      const resumeVerification = runInstalledWpm(
        ["-C", installedWorkspace, "authoring", "handoff", "verify", "--client", "codex", "--json"],
        installedWorkspace,
      );
      expect({ status: resumeVerification.status, stderr: resumeVerification.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(JSON.parse(String(resumeVerification.stdout))).toMatchObject({
        status: "verified",
        workEvidence: { resumable: true },
      });
      expect(String(runInstalledBacklog(["task", selectedTask, "--plain"]).stdout)).toBe(
        claimedRecords.get(selectedTask),
      );
      for (const nativeScope of [".agents", ".claude"]) {
        for (const skillName of WORKSPACE_SKILL_NAMES) {
          expect(
            readFileSync(
              join(installedWorkspace, nativeScope, "skills", skillName, "SKILL.md"),
              "utf8",
            ),
          ).toBe(
            readFileSync(
              join(result.environment.packageRoot, "agent-skills", skillName, "SKILL.md"),
              "utf8",
            ),
          );
        }
        expect(
          existsSync(
            join(
              installedWorkspace,
              nativeScope,
              "skills",
              PERSONAL_BOOTSTRAP_SKILL_NAME,
              "SKILL.md",
            ),
          ),
        ).toBe(false);
      }
      const installedAgents = readFileSync(join(installedWorkspace, "AGENTS.md"), "utf8");
      const installedClaude = readFileSync(join(installedWorkspace, "CLAUDE.md"), "utf8");
      expect(installedAgents).toContain("<!-- wpm:workspace-authoring:start -->");
      expect(installedAgents).toContain("$wpm-author");
      expect(installedClaude).toContain("<!-- wpm:workspace-authoring:start -->");
      expect(installedClaude).toContain("/wpm-author");
      expect(existsSync(source)).toBe(false);

      const buildTarget = runInstalledWpm(
        ["project", "targets", "add", "claude-code", "-C", installedWorkspace],
        consumer,
      );
      expect({ status: buildTarget.status, stderr: buildTarget.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const retainedBuildEvidence = join(installedWorkspace, "builds", "preexisting-evidence.txt");
      writeFileSync(retainedBuildEvidence, "TASK124-PREEXISTING-BUILD-MUST-STAY-UNCHANGED\n");
      const deliverableBeforeBuild = directorySnapshot(join(installedWorkspace, "wip"));
      const workspaceBeforeBuild = directorySnapshot(installedWorkspace, ["builds"]);
      const projectArchive = join(
        installedWorkspace,
        "builds",
        "accepted-authoring-workspace-0.1.0.tgz",
      );
      const assertColdJourneyArchive = (archive: string, extracted: string): string[] => {
        const layout = archiveLayout(archive);
        expect(layout).toEqual(expect.arrayContaining(["manifest.yml", "AGENTS.md", "CLAUDE.md"]));
        const declaredClaudeScopes = [".claude/skills"];
        expect(layout).toEqual(expect.arrayContaining(declaredClaudeScopes));
        for (const forbidden of [
          ".wpm-authoring.json",
          ".wpm-handoff.json",
          ".wpm/authoring-setup.json",
        ]) {
          expect(layout, forbidden).not.toContain(forbidden);
        }
        expect(
          layout.some((path) => {
            const inAgentsScope =
              /^\.agents(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.agents(?:\/|$)/.test(path);
            const inClaudeScope =
              /^\.claude(?:\/|$)/.test(path) || /^bundles\/[^/]+\/\.claude(?:\/|$)/.test(path);
            const isDeclaredClaudeSkillPath = declaredClaudeScopes.some(
              (scope) => path === scope || path.startsWith(`${scope}/`),
            );
            return (
              inAgentsScope ||
              (inClaudeScope && !isDeclaredClaudeSkillPath) ||
              path.startsWith(".authoring-backlog/") ||
              path.startsWith(".wpm/") ||
              path.startsWith("builds/")
            );
          }),
        ).toBe(false);
        for (const { name } of skillFamilyCells) {
          expect(
            layout.some((path) => path.includes(name)),
            name,
          ).toBe(false);
        }
        const bytes = allRegularFileBytes(extracted);
        expect(bytes).not.toContain("<!-- wpm:workspace-authoring:start -->");
        expect(bytes).not.toContain(portableInstalledWorkspace);
        expect(bytes).not.toContain(portableInstalledHome);
        expect(bytes).not.toContain('"authoringBacklogPath": ".authoring-backlog"');
        expect(bytes).not.toContain("TASK124-PREEXISTING-BUILD-MUST-STAY-UNCHANGED");
        for (const { name } of skillFamilyCells) expect(bytes).not.toContain(`name: ${name}`);
        return layout;
      };

      const tarBuild = runInstalledWpm(
        ["build", "package", "--format", "tarball", "-C", installedWorkspace],
        consumer,
      );
      expect({ status: tarBuild.status, stderr: tarBuild.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const tarExtracted = join(consumer, "cold-journey-tar-extracted");
      mkdirSync(tarExtracted, { recursive: true });
      execFileSync("tar", ["-xzf", projectArchive, "-C", tarExtracted]);
      const tarLayout = assertColdJourneyArchive(projectArchive, tarExtracted);
      expect(lstatSync(join(tarExtracted, "CLAUDE.md")).isSymbolicLink()).toBe(true);

      rmSync(projectArchive);
      const gitBuild = runInstalledWpm(
        ["build", "package", "--format", "git", "-C", installedWorkspace],
        consumer,
      );
      expect({ status: gitBuild.status, stderr: gitBuild.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const gitExtracted = join(consumer, "cold-journey-git-extracted");
      mkdirSync(gitExtracted, { recursive: true });
      execFileSync("tar", ["-xzf", projectArchive, "-C", gitExtracted]);
      expect(assertColdJourneyArchive(projectArchive, gitExtracted)).toEqual(tarLayout);
      expect(lstatSync(join(gitExtracted, "CLAUDE.md")).isSymbolicLink()).toBe(true);

      if (commandAvailable("zip", installedEnv) && commandAvailable("unzip", installedEnv)) {
        const zipBuild = runInstalledWpm(
          ["build", "package", "--format", "zip", "-C", installedWorkspace],
          consumer,
        );
        expect({ status: zipBuild.status, stderr: zipBuild.stderr }).toEqual({
          status: 0,
          stderr: "",
        });
        const zipArchive = join(
          installedWorkspace,
          "builds",
          "accepted-authoring-workspace-0.1.0.zip",
        );
        const zipExtracted = join(consumer, "cold-journey-zip-extracted");
        mkdirSync(zipExtracted, { recursive: true });
        execFileSync("unzip", ["-q", zipArchive, "-d", zipExtracted]);
        expect(assertColdJourneyArchive(zipArchive, zipExtracted)).toEqual(tarLayout);
      }
      expect(directorySnapshot(join(installedWorkspace, "wip"))).toEqual(deliverableBeforeBuild);
      expect(directorySnapshot(installedWorkspace, ["builds"])).toEqual(workspaceBeforeBuild);
      expect(readFileSync(retainedBuildEvidence, "utf8")).toBe(
        "TASK124-PREEXISTING-BUILD-MUST-STAY-UNCHANGED\n",
      );

      const adoptedWorkspace = join(consumer, "strict-legacy-adoption");
      const seedLegacy = runInstalledWpm(
        ["init", "strict-legacy-adoption", "--at", adoptedWorkspace, "--authoring-client", "codex"],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: seedLegacy.status, stderr: seedLegacy.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const seedTarget = runInstalledWpm(
        ["project", "targets", "add", "codex", "-C", adoptedWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: seedTarget.status, stderr: seedTarget.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      rmSync(join(adoptedWorkspace, ".wpm-authoring.json"), { force: true });
      rmSync(join(adoptedWorkspace, ".wpm-handoff.json"), { force: true });
      rmSync(join(adoptedWorkspace, ".agents"), { recursive: true, force: true });
      rmSync(join(adoptedWorkspace, ".claude"), { recursive: true, force: true });
      rmSync(join(adoptedWorkspace, "AGENTS.md"), { force: true });
      rmSync(join(adoptedWorkspace, "CLAUDE.md"), { force: true });
      const legacyFrontDoor = readFileSync(
        join(
          result.environment.packageRoot,
          "templates",
          "project",
          "minimal",
          "snippets",
          "authoring-front-door.md.tmpl",
        ),
        "utf8",
      ).replaceAll("{{project-name}}", "strict-legacy-adoption");
      writeFileSync(join(adoptedWorkspace, "AGENTS.md"), legacyFrontDoor);
      writeFileSync(join(adoptedWorkspace, "CLAUDE.md"), legacyFrontDoor);
      const adoptedManifestBefore = readFileSync(
        join(adoptedWorkspace, "wip", "manifest.yml"),
        "utf8",
      );
      const adoptedBacklogBefore = directorySnapshot(join(adoptedWorkspace, ".authoring-backlog"));
      const adoptIntegration = runInstalledWpm(
        ["authoring", "integrate", "--client", "claude-code", "-C", adoptedWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: adoptIntegration.status, stderr: adoptIntegration.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(String(adoptIntegration.stdout)).toContain("handoff prepared: no");
      const prepareAdoption = runInstalledWpm(
        ["authoring", "handoff", "prepare", "--json", "-C", adoptedWorkspace],
        consumer,
        join(consumer, "home-claude-only"),
      );
      expect({ status: prepareAdoption.status, stderr: prepareAdoption.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(JSON.parse(String(prepareAdoption.stdout))).toMatchObject({
        status: "prepared",
        configuredClients: ["claude-code"],
        handoffPrepared: true,
      });
      assertWorkspaceSelection(adoptedWorkspace, ["claude-code"], "legacy-adopted");
      expect(readFileSync(join(adoptedWorkspace, "wip", "manifest.yml"), "utf8")).toBe(
        adoptedManifestBefore,
      );
      expect(directorySnapshot(join(adoptedWorkspace, ".authoring-backlog"))).toEqual(
        adoptedBacklogBefore,
      );

      const installReportPath = join(root, "packed-install-report.json");
      const qualityPath = join(root, "quality-report.json");
      const notesPath = join(root, "release-notes.md");
      const candidateOutput = join(root, "candidate output");
      const externalStatePath = join(root, "external-state.json");
      const npmConfigPath = join(root, "isolated.npmrc");
      const npmCredentialPath = join(root, "isolated-npm-credentials.json");
      writeFileSync(installReportPath, String(verification.stdout));
      writeFileSync(
        qualityPath,
        `${JSON.stringify({
          status: "accepted",
          sourceRevision: inspection.sourceRevision,
          checks: [
            { name: "build", status: "passed" },
            { name: "lint", status: "passed" },
            { name: "package-boundary", status: "passed" },
            { name: "packed-install", status: "passed" },
            { name: "tests", status: "passed" },
            { name: "typecheck", status: "passed" },
          ],
        })}\n`,
      );
      writeFileSync(notesPath, "## Inactive candidate\n\n- Exact local package verification.\n");
      writeFileSync(
        externalStatePath,
        `${JSON.stringify({
          github: { tag: null, release: null, assets: [] },
          npm: { version: null, distTags: {} },
          trust: { github: "unconfigured", npm: "unconfigured" },
        })}\n`,
      );
      writeFileSync(npmConfigPath, "registry=https://registry.invalid.example/\n");
      writeFileSync(
        npmCredentialPath,
        `${JSON.stringify({ token: "sentinel-not-for-assessment" })}\n`,
      );
      const tagsBefore = git(REPO_ROOT, "tag", "--list");
      const externalStateBefore = readFileSync(externalStatePath);
      const npmConfigBefore = readFileSync(npmConfigPath);
      const npmCredentialBefore = readFileSync(npmCredentialPath);

      const candidateArgs = [
        "--inspection",
        reportPath,
        "--install",
        installReportPath,
        "--quality",
        qualityPath,
        "--tag",
        "v0.1.0",
        "--notes",
        notesPath,
        "--output",
        candidateOutput,
      ];
      const candidate = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:prepare-candidate",
        "--",
        ...candidateArgs,
      );
      expect({ status: candidate.status, stderr: candidate.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      const prepared = JSON.parse(String(candidate.stdout)) as {
        status: string;
        outcome: string;
        candidateId: string;
        distribution: {
          status: string;
          activation: string;
          releaseEligibility: string;
          publicationCapable: boolean;
          unresolvedFacts: Array<{ key: string }>;
        };
        binding: {
          sourceRevision: string;
          package: { name: string; version: string };
          proposedTag: string;
          artifact: {
            path: string;
            size: number;
            digests: { sha256: string; sha512: string };
          };
        };
      };
      expect(prepared).toMatchObject({
        status: "prepared",
        outcome: "created",
        distribution: {
          status: "inactive",
          activation: "disabled",
          releaseEligibility: "ineligible",
          publicationCapable: false,
        },
        binding: {
          sourceRevision: inspection.sourceRevision,
          package: { name: inspection.package.name, version: inspection.package.version },
          proposedTag: "v0.1.0",
          artifact: { size: inspection.artifact.size },
        },
      });
      expect(prepared.distribution.unresolvedFacts.map(({ key }) => key)).toEqual(
        ACTIVATION_FACT_KEYS,
      );
      expect(prepared.binding.artifact.digests.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(prepared.binding.artifact.digests.sha512).toMatch(/^sha512:[a-f0-9]{128}$/);
      expect(readFileSync(join(candidateOutput, prepared.binding.artifact.path))).toEqual(
        readFileSync(inspection.artifact.path),
      );
      expect(readFileSync(join(candidateOutput, prepared.binding.artifact.path))).toEqual(
        readFileSync(result.artifact.frozenPath),
      );
      const candidateRecord = JSON.parse(
        readFileSync(join(candidateOutput, "candidate.json"), "utf8"),
      ) as {
        candidateId: string;
        distribution: { unresolvedFacts: Array<{ key: string }> };
        binding: {
          sourceRevision: string;
          proposedTag: string;
          package: { name: string; version: string };
          artifact: {
            filename: string;
            size: number;
            digests: { sha256: string; sha512: string };
          };
          evidence: Record<
            string,
            { path: string; status: string; digest: string; rawDigest: string }
          >;
          releaseNotes: { path: string; preview: string; digest: string };
        };
      };
      expect(candidateRecord.candidateId).toBe(prepared.candidateId);
      expect(candidateRecord.distribution.unresolvedFacts.map(({ key }) => key)).toEqual(
        ACTIVATION_FACT_KEYS,
      );
      for (const [name, sourcePath] of [
        ["inspection", reportPath],
        ["quality", qualityPath],
        ["packedInstall", installReportPath],
      ] as const) {
        const evidence = candidateRecord.binding.evidence[name];
        if (evidence === undefined) throw new Error(`missing persisted ${name} evidence`);
        expect(evidence).toMatchObject({ status: "accepted" });
        expect(evidence.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(evidence.rawDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(readFileSync(join(candidateOutput, evidence.path))).toEqual(
          readFileSync(sourcePath),
        );
      }
      expect(
        readFileSync(join(candidateOutput, candidateRecord.binding.releaseNotes.path)),
      ).toEqual(readFileSync(notesPath));
      expect(candidateRecord.binding.releaseNotes.preview).toBe(readFileSync(notesPath, "utf8"));
      expect(candidateRecord.binding.releaseNotes.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

      const repeated = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:prepare-candidate",
        "--",
        ...candidateArgs,
      );
      expect({ status: repeated.status, stderr: repeated.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(JSON.parse(String(repeated.stdout))).toMatchObject({
        status: "prepared",
        outcome: "reused",
        candidateId: prepared.candidateId,
      });

      const changed = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:prepare-candidate",
        "--",
        ...candidateArgs.map((value) => (value === "v0.1.0" ? "v0.1.1" : value)),
      );
      expect(changed.status).toBe(1);
      expect(JSON.parse(String(changed.stdout))).toMatchObject({
        status: "rejected",
        releaseEligibility: "ineligible",
        findings: [expect.objectContaining({ kind: "changed", field: "proposedTag" })],
      });

      const githubPolicyPath = join(root, "github-policy.json");
      const githubObservationPath = join(root, "github-observation.json");
      writeFileSync(
        githubPolicyPath,
        `${JSON.stringify({
          schemaVersion: 1,
          release: { prerelease: false, requireImmutable: true },
        })}\n`,
      );
      writeFileSync(
        githubObservationPath,
        `${JSON.stringify({ schemaVersion: 1, tags: [], releases: [] })}\n`,
      );
      const assessGithub = () => {
        const candidateBefore = directorySnapshot(candidateOutput);
        const policyBefore = readFileSync(githubPolicyPath);
        const observationBefore = readFileSync(githubObservationPath);
        const assessment = npm(
          REPO_ROOT,
          "run",
          "--silent",
          "package:assess-github",
          "--",
          "--candidate",
          candidateOutput,
          "--policy",
          githubPolicyPath,
          "--observation",
          githubObservationPath,
        );
        expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
          status: 0,
          stderr: "",
        });
        expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
        expect(readFileSync(githubPolicyPath)).toEqual(policyBefore);
        expect(readFileSync(githubObservationPath)).toEqual(observationBefore);
        expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
        expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
        return JSON.parse(String(assessment.stdout)) as {
          status: string;
          assessment: {
            activation: string;
            releaseEligibility: string;
            publicationCapable: boolean;
            unresolvedPolicyFacts: Array<{ key: string }>;
            matches: Array<{ object: string; state: string }>;
            missing: Array<{ object: string }>;
            conflicts: Array<{ object: string; field: string }>;
          };
        };
      };

      const absentAssessment = assessGithub();
      expect(absentAssessment).toMatchObject({
        status: "assessed",
        assessment: {
          activation: "disabled",
          releaseEligibility: "ineligible",
          publicationCapable: false,
        },
      });
      expect(absentAssessment.assessment.unresolvedPolicyFacts.map(({ key }) => key)).toEqual(
        ACTIVATION_FACT_KEYS,
      );
      expect(absentAssessment.assessment.missing.map(({ object }) => object)).toEqual([
        "tag",
        "release",
        "asset",
      ]);

      const matchingObservation = {
        schemaVersion: 1,
        tags: [
          {
            name: candidateRecord.binding.proposedTag,
            targetRevision: candidateRecord.binding.sourceRevision,
          },
        ],
        releases: [
          {
            id: 21,
            tagName: candidateRecord.binding.proposedTag,
            name: candidateRecord.binding.proposedTag,
            body: candidateRecord.binding.releaseNotes.preview,
            draft: true,
            prerelease: false,
            immutable: false,
            assets: [
              {
                id: 31,
                name: candidateRecord.binding.artifact.filename,
                state: "uploaded",
                size: candidateRecord.binding.artifact.size,
                digest: candidateRecord.binding.artifact.digests.sha256,
              },
            ],
          },
        ],
      };
      writeFileSync(githubObservationPath, `${JSON.stringify(matchingObservation)}\n`);
      const matchingAssessment = assessGithub();
      expect(
        matchingAssessment.assessment.matches.map(({ object, state }) => `${object}:${state}`),
      ).toEqual(["tag:matching", "release:matching-draft", "asset:matching"]);
      expect(matchingAssessment.assessment.missing).toEqual([]);
      expect(matchingAssessment.assessment.conflicts).toEqual([]);

      const conflictingObservation = structuredClone(matchingObservation);
      const conflictingTag = conflictingObservation.tags[0];
      const conflictingRelease = conflictingObservation.releases[0];
      const conflictingAsset = conflictingRelease?.assets[0];
      if (
        conflictingTag === undefined ||
        conflictingRelease === undefined ||
        conflictingAsset === undefined
      ) {
        throw new Error("matching GitHub observation fixture is incomplete");
      }
      conflictingTag.targetRevision = "f".repeat(40);
      conflictingRelease.name = "another release";
      conflictingRelease.body = "different release notes";
      conflictingAsset.digest = `sha256:${"0".repeat(64)}`;
      writeFileSync(githubObservationPath, `${JSON.stringify(conflictingObservation)}\n`);
      const conflictingAssessment = assessGithub();
      expect(
        conflictingAssessment.assessment.conflicts.map(({ object, field }) => `${object}.${field}`),
      ).toEqual(["tag.targetRevision", "release.bodyDigest", "release.name", "asset.digest"]);

      const repository = NPM_REPOSITORY;
      const trustedPublisher = {
        provider: "github-actions",
        repository: "example/work-package-manager",
        workflow: "release.yml",
        environment: null,
        allowedAction: "publish",
      };
      const npmPolicyPath = join(root, "npm-policy.json");
      const npmObservationPath = join(root, "npm-observation.json");
      writeFileSync(
        npmPolicyPath,
        `${JSON.stringify({
          schemaVersion: 1,
          publication: {
            coordinate: candidateRecord.binding.package.name,
            finalDistTag: "latest",
            repository,
            provenance: { required: true },
            authority: {
              bootstrap: { required: true },
              trustedPublisher,
            },
          },
        })}\n`,
      );
      writeFileSync(
        npmObservationPath,
        `${JSON.stringify({
          schemaVersion: 1,
          package: null,
          authority: {
            coordinate: candidateRecord.binding.package.name,
            coordinateControl: "unknown",
            bootstrap: "unknown",
            credentials: "not-observed",
            trustedPublisher: null,
          },
        })}\n`,
      );
      const assessNpm = () => {
        const candidateBefore = directorySnapshot(candidateOutput);
        const policyBefore = readFileSync(npmPolicyPath);
        const observationBefore = readFileSync(npmObservationPath);
        const assessment = npm(
          REPO_ROOT,
          "run",
          "--silent",
          "package:assess-npm",
          "--",
          "--candidate",
          candidateOutput,
          "--policy",
          npmPolicyPath,
          "--observation",
          npmObservationPath,
        );
        expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
          status: 0,
          stderr: "",
        });
        expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
        expect(readFileSync(npmPolicyPath)).toEqual(policyBefore);
        expect(readFileSync(npmObservationPath)).toEqual(observationBefore);
        expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
        expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
        expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
        expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
        return JSON.parse(String(assessment.stdout)) as {
          status: string;
          assessment: {
            activation: string;
            publicationCapable: boolean;
            matches: Array<{ object: string; state: string }>;
            missing: Array<{ object: string }>;
            manualAuthority: Array<{ object: string; expected: string; observed: string | null }>;
            conflicts: Array<{ object: string; field: string }>;
            safeActions: string[];
            prohibitedActions: string[];
          };
        };
      };

      const absentNpmAssessment = assessNpm();
      expect(absentNpmAssessment).toMatchObject({
        status: "assessed",
        assessment: {
          activation: "disabled",
          publicationCapable: false,
          safeActions: [],
        },
      });
      expect(absentNpmAssessment.assessment.missing.map(({ object }) => object)).toEqual([
        "version",
        "tag",
      ]);

      const candidateSha512 = candidateRecord.binding.artifact.digests.sha512;
      const candidateIntegrity = `sha512-${Buffer.from(
        candidateSha512.slice("sha512:".length),
        "hex",
      ).toString("base64")}`;
      const matchingNpmObservation = {
        schemaVersion: 1,
        package: {
          coordinate: candidateRecord.binding.package.name,
          versions: [
            {
              version: candidateRecord.binding.package.version,
              integrity: candidateIntegrity,
              repository,
              provenance: {
                status: "present",
                repository,
                sourceRevision: candidateRecord.binding.sourceRevision,
              },
            },
          ],
          distTags: [{ name: "latest", targetVersion: candidateRecord.binding.package.version }],
          owners: ["maintainer"],
        },
        authority: {
          coordinate: candidateRecord.binding.package.name,
          coordinateControl: "controlled",
          bootstrap: "available",
          credentials: "not-observed",
          trustedPublisher,
        },
      };
      writeFileSync(npmObservationPath, `${JSON.stringify(matchingNpmObservation)}\n`);
      const matchingNpmAssessment = assessNpm();
      expect(
        matchingNpmAssessment.assessment.matches.map(({ object, state }) => `${object}:${state}`),
      ).toEqual([
        "version:matching",
        "tag:matching",
        "authority:matching",
        "authority:matching",
        "authority:matching",
      ]);
      expect(matchingNpmAssessment.assessment.manualAuthority).toEqual([]);
      expect(matchingNpmAssessment.assessment.conflicts).toEqual([]);

      const manualTagObservation = structuredClone(matchingNpmObservation);
      manualTagObservation.package.distTags = [];
      writeFileSync(npmObservationPath, `${JSON.stringify(manualTagObservation)}\n`);
      const manualTagAssessment = assessNpm();
      expect(manualTagAssessment.assessment.conflicts).toEqual([]);
      expect(manualTagAssessment.assessment.manualAuthority).toEqual([
        expect.objectContaining({
          object: "tag",
          expected: candidateRecord.binding.package.version,
          observed: null,
        }),
      ]);
      expect(manualTagAssessment.assessment.safeActions).toEqual([]);

      const conflictingNpmObservation = structuredClone(matchingNpmObservation);
      const conflictingVersion = conflictingNpmObservation.package.versions[0];
      if (conflictingVersion === undefined) throw new Error("matching npm version is missing");
      conflictingVersion.integrity = `sha512-${Buffer.alloc(64, 0xff).toString("base64")}`;
      conflictingVersion.repository = {
        ...repository,
        url: "https://github.com/other/project.git",
      };
      conflictingVersion.provenance = { status: "absent" } as never;
      writeFileSync(npmObservationPath, `${JSON.stringify(conflictingNpmObservation)}\n`);
      const conflictingNpmAssessment = assessNpm();
      expect(
        conflictingNpmAssessment.assessment.conflicts.map(
          ({ object, field }) => `${object}.${field}`,
        ),
      ).toEqual(["version.integrity", "version.provenance", "version.repository"]);
      expect(conflictingNpmAssessment.assessment.safeActions).toEqual([]);
      expect(conflictingNpmAssessment.assessment.prohibitedActions).toEqual(
        expect.arrayContaining([
          "automatic-dist-tag-repair",
          "overwrite",
          "republication",
          "unpublish-and-republish",
          "version-reuse",
        ]),
      );

      const activation = {
        facts: Object.fromEntries(
          ACTIVATION_FACT_KEYS.map((key) => [
            key,
            {
              ...(key === "public-npm-coordinate"
                ? { proposedValue: candidateRecord.binding.package.name }
                : key.endsWith("evidence")
                  ? {}
                  : { proposedValue: `decision:${key}` }),
              authorization: { decision: "authorized", reference: `authorization:${key}` },
              ...(key === "public-npm-coordinate" || key.endsWith("evidence")
                ? { evidence: { kind: "controlled", reference: `evidence:${key}` } }
                : {}),
            },
          ]),
        ),
      };
      writeFileSync(
        githubPolicyPath,
        `${JSON.stringify({
          schemaVersion: 1,
          activation,
          release: { prerelease: false, requireImmutable: true },
        })}\n`,
      );
      writeFileSync(
        npmPolicyPath,
        `${JSON.stringify({
          schemaVersion: 1,
          activation,
          publication: {
            coordinate: candidateRecord.binding.package.name,
            finalDistTag: "latest",
            repository,
            provenance: { required: true },
            authority: { bootstrap: { required: true }, trustedPublisher },
          },
        })}\n`,
      );

      writeFileSync(
        githubObservationPath,
        `${JSON.stringify({ schemaVersion: 1, tags: [], releases: [] })}\n`,
      );
      const readyGithubAssessment = assessGithub();
      writeFileSync(
        npmObservationPath,
        `${JSON.stringify({
          schemaVersion: 1,
          package: null,
          authority: matchingNpmObservation.authority,
        })}\n`,
      );
      const readyNpmAssessment = assessNpm();
      writeFileSync(githubObservationPath, `${JSON.stringify(matchingObservation)}\n`);
      const completeGithubAssessment = assessGithub();
      writeFileSync(npmObservationPath, `${JSON.stringify(matchingNpmObservation)}\n`);
      const completeNpmAssessment = assessNpm();
      writeFileSync(npmObservationPath, `${JSON.stringify(manualTagObservation)}\n`);
      const manualNpmAssessment = assessNpm();
      writeFileSync(githubObservationPath, `${JSON.stringify(conflictingObservation)}\n`);
      const conflictingGithubAssessmentWithActivation = assessGithub();
      writeFileSync(npmObservationPath, `${JSON.stringify(conflictingNpmObservation)}\n`);
      const conflictingNpmAssessmentWithActivation = assessNpm();

      const convergencePolicyPath = join(root, "convergence-policy.json");
      const githubAssessmentPath = join(root, "github-assessment.json");
      const npmAssessmentPath = join(root, "npm-assessment.json");
      const classifyConvergence = (
        githubAssessment: unknown,
        npmAssessment: unknown,
        requiredBoundaries: readonly string[],
      ) => {
        writeFileSync(
          convergencePolicyPath,
          `${JSON.stringify({ schemaVersion: 1, activation, requiredBoundaries })}\n`,
        );
        writeFileSync(githubAssessmentPath, `${JSON.stringify(githubAssessment)}\n`);
        writeFileSync(npmAssessmentPath, `${JSON.stringify(npmAssessment)}\n`);
        const candidateBefore = directorySnapshot(candidateOutput);
        const policyBefore = readFileSync(convergencePolicyPath);
        const githubBefore = readFileSync(githubAssessmentPath);
        const npmBefore = readFileSync(npmAssessmentPath);
        const githubObservationBefore = readFileSync(githubObservationPath);
        const npmObservationBefore = readFileSync(npmObservationPath);
        const assessment = npm(
          REPO_ROOT,
          "run",
          "--silent",
          "package:classify-convergence",
          "--",
          "--candidate",
          candidateOutput,
          "--policy",
          convergencePolicyPath,
          "--github-assessment",
          githubAssessmentPath,
          "--npm-assessment",
          npmAssessmentPath,
        );
        expect({ status: assessment.status, stderr: assessment.stderr }).toEqual({
          status: 0,
          stderr: "",
        });
        expect(directorySnapshot(candidateOutput)).toEqual(candidateBefore);
        expect(readFileSync(convergencePolicyPath)).toEqual(policyBefore);
        expect(readFileSync(githubAssessmentPath)).toEqual(githubBefore);
        expect(readFileSync(npmAssessmentPath)).toEqual(npmBefore);
        expect(readFileSync(githubObservationPath)).toEqual(githubObservationBefore);
        expect(readFileSync(npmObservationPath)).toEqual(npmObservationBefore);
        expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
        expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
        expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
        expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
        return JSON.parse(String(assessment.stdout)) as {
          status: string;
          result: {
            classification: string;
            requiredBoundaries: string[];
            completedBoundaries: string[];
            outstandingBoundaries: string[];
            conflicts: unknown[];
            blockers: unknown[];
            recovery: { safeActions: string[]; prohibitedActions: string[] };
          };
        };
      };
      const allBoundaries = [
        "github.tag",
        "github.release",
        "github.asset",
        "npm.version",
        "npm.final-dist-tag",
      ];

      const ready = classifyConvergence(readyGithubAssessment, readyNpmAssessment, allBoundaries);
      expect(ready).toMatchObject({
        status: "classified",
        result: { classification: "ready", completedBoundaries: [], conflicts: [], blockers: [] },
      });

      const resumable = classifyConvergence(
        completeGithubAssessment,
        readyNpmAssessment,
        allBoundaries,
      );
      expect(resumable.result).toMatchObject({
        classification: "resumable",
        completedBoundaries: ["github.tag", "github.release", "github.asset"],
        outstandingBoundaries: ["npm.version", "npm.final-dist-tag"],
        conflicts: [],
        blockers: [],
      });

      const complete = classifyConvergence(
        completeGithubAssessment,
        completeNpmAssessment,
        allBoundaries,
      );
      expect(complete.result).toMatchObject({
        classification: "complete",
        completedBoundaries: allBoundaries,
        outstandingBoundaries: [],
        conflicts: [],
        blockers: [],
      });

      const matching = classifyConvergence(readyGithubAssessment, manualNpmAssessment, [
        "npm.final-dist-tag",
      ]);
      expect(matching.result).toMatchObject({
        classification: "matching",
        completedBoundaries: [],
        outstandingBoundaries: ["npm.final-dist-tag"],
        conflicts: [],
        blockers: [],
      });

      const blocked = classifyConvergence(readyGithubAssessment, readyNpmAssessment, []);
      expect(blocked.result).toMatchObject({
        classification: "blocked",
        requiredBoundaries: [],
        conflicts: [],
        blockers: [expect.objectContaining({ kind: "missing-policy" })],
      });

      const conflicting = classifyConvergence(
        conflictingGithubAssessmentWithActivation,
        conflictingNpmAssessmentWithActivation,
        allBoundaries,
      );
      expect(conflicting.result.classification).toBe("conflicting");
      expect(conflicting.result.conflicts.length).toBeGreaterThanOrEqual(7);
      expect(conflicting.result.recovery.safeActions).toEqual([]);
      expect(conflicting.result.recovery.prohibitedActions).toEqual(
        expect.arrayContaining([
          "overwrite",
          "republication",
          "retagging",
          "rollback",
          "version-reuse",
        ]),
      );

      const corruptCandidateOutput = join(root, "corrupt candidate");
      cpSync(candidateOutput, corruptCandidateOutput, {
        recursive: true,
        preserveTimestamps: true,
      });
      const corruptRecordPath = join(corruptCandidateOutput, "candidate.json");
      const corruptRecord = JSON.parse(readFileSync(corruptRecordPath, "utf8")) as {
        binding: { proposedTag: string };
      };
      corruptRecord.binding.proposedTag = "v0.1.1";
      writeFileSync(corruptRecordPath, `${JSON.stringify(corruptRecord, undefined, 2)}\n`);
      const corruptCandidateBefore = directorySnapshot(corruptCandidateOutput);
      const policyBeforeCorruptAssessment = readFileSync(githubPolicyPath);
      const observationBeforeCorruptAssessment = readFileSync(githubObservationPath);
      const corruptAssessment = npm(
        REPO_ROOT,
        "run",
        "--silent",
        "package:assess-github",
        "--",
        "--candidate",
        corruptCandidateOutput,
        "--policy",
        githubPolicyPath,
        "--observation",
        githubObservationPath,
      );
      expect({ status: corruptAssessment.status, stderr: corruptAssessment.stderr }).toEqual({
        status: 1,
        stderr: "",
      });
      expect(JSON.parse(String(corruptAssessment.stdout))).toMatchObject({
        status: "rejected",
        releaseEligibility: "ineligible",
        findings: expect.arrayContaining([
          expect.objectContaining({ field: "candidate.candidateId" }),
        ]),
      });
      expect(directorySnapshot(corruptCandidateOutput)).toEqual(corruptCandidateBefore);
      expect(readFileSync(githubPolicyPath)).toEqual(policyBeforeCorruptAssessment);
      expect(readFileSync(githubObservationPath)).toEqual(observationBeforeCorruptAssessment);
      expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
      expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
      expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
      expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);

      expect(git(REPO_ROOT, "tag", "--list")).toBe(tagsBefore);
      expect(readFileSync(externalStatePath)).toEqual(externalStateBefore);
      expect(readFileSync(npmConfigPath)).toEqual(npmConfigBefore);
      expect(readFileSync(npmCredentialPath)).toEqual(npmCredentialBefore);
    },
    COMPLETE_JOURNEY_TIMEOUT_MS,
  );
});
