import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { parseJsonConfigFileContent, readConfigFile, sys } from "typescript";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { buildProgram, type CliDeps, run } from "../../../src/cli.js";
import { initProject } from "../../../src/core/operations/init-project.js";
import type { CliIo, OutputSink } from "../../../src/util/exit.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const REAL_TEMPLATES = join(REPO_ROOT, "templates");
const BUILTIN_TEMPLATES = "/builtin-templates";
const WORKSPACE = "/workspace";
const INACTIVE_MARKER = "Public distribution is inactive";

/**
 * The dynamic `bundle <id>` program is built only when `run()` dispatches a non-verb bundle id, so it is not
 * reachable from `buildProgram()`'s static Commander tree. Keep every current dynamic group and leaf explicit
 * here so the public-surface audit exercises the help a maintainer can actually request.
 */
const PER_BUNDLE_HELP_PATHS = [
  [],
  ["show"],
  ["meta"],
  ["version"],
  ["version", "bump"],
  ["version", "set"],
  ["requires"],
  ["requires", "add"],
  ["requires", "list"],
  ["requires", "remove"],
  ["files"],
  ["files", "add"],
  ["files", "list"],
  ["files", "remove"],
  ["templates"],
  ["templates", "add"],
  ["templates", "list"],
  ["templates", "remove"],
  ["scripts"],
  ["scripts", "add"],
  ["scripts", "list"],
  ["scripts", "remove"],
  ["skills"],
  ["skills", "add"],
  ["skills", "list"],
  ["skills", "remove"],
  ["installer-skills"],
  ["installer-skills", "add"],
  ["installer-skills", "list"],
  ["installer-skills", "remove"],
  ["advisor"],
  ["advisor", "add"],
  ["advisor", "remove"],
] as const;

const readProjectFile = (relativePath: string): string =>
  readFileSync(join(REPO_ROOT, relativePath), "utf8");

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

function deps(fs = new MemoryFileSystem()): CliDeps {
  return {
    fs,
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new FakeEnvironment({ cwd: "/elsewhere" }),
    builtinTemplatesRoot: BUILTIN_TEMPLATES,
  };
}

async function completions(words: readonly string[]): Promise<string[]> {
  const streams = io();
  const invocation = ["__complete", ...words, ""];
  expect(await run(invocation, deps(), streams), invocation.join(" ")).toBe(0);
  expect(streams.err.text, invocation.join(" ")).toBe("");
  return streams.out.text.split("\n").filter(Boolean);
}

function mirrorTemplates(
  fs: MemoryFileSystem,
  source = REAL_TEMPLATES,
  target = BUILTIN_TEMPLATES,
): void {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourceChild = join(source, entry.name);
    const targetChild = join(target, entry.name);
    if (entry.isDirectory()) mirrorTemplates(fs, sourceChild, targetChild);
    else fs.write(targetChild, readFileSync(sourceChild, "utf8"));
  }
}

function allCommands(program: Command): Command[] {
  const commands: Command[] = [program];
  const walk = (command: Command): void => {
    for (const child of command.commands) {
      if (child.name() === "help") continue;
      commands.push(child);
      walk(child);
    }
  };
  walk(program);
  return commands;
}

function fullHelp(command: Command): string {
  let output = "";
  const write = (chunk: string): void => {
    output += chunk;
  };
  command.configureOutput({ writeOut: write, writeErr: write });
  command.outputHelp();
  return output;
}

function markdownUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownUnder(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [readFileSync(path, "utf8")] : [];
  });
}

function filesUnder(fs: MemoryFileSystem, directory: string): string[] {
  const paths: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.list(current)) {
      const child = join(current, entry.name);
      if (entry.kind === "directory") walk(child);
      else paths.push(child);
    }
  };
  walk(directory);
  return paths;
}

function expectNoPublicAcquisitionClaim(surface: string): void {
  const normalizedSurface = surface
    .replace(/\\\r?\n[ \t]*/g, " ")
    .replace(/(["'])([^\s"'`]+)\1/g, "$2");
  const packageSpec = String.raw`((?:@[\w.-]+\/)?[\w.<>{}-][^\s)\]}\x60'",;]*)`;
  const leadingOptions = String.raw`(?:[ \t]+--?[\w-]+(?:=[^\s]+)?)*`;
  const installCommands = new RegExp(
    String.raw`\b(?:npm|pnpm|yarn|bun)${leadingOptions}[ \t]+(?:i|install|add|global(?:[ \t]+add)?)\b${leadingOptions}[ \t]+${packageSpec}`,
    "gi",
  );
  const executorCommands = new RegExp(
    String.raw`\b(?:npx|bunx|npm${leadingOptions}[ \t]+exec|pnpm${leadingOptions}[ \t]+dlx|yarn${leadingOptions}[ \t]+dlx)${leadingOptions}[ \t]+${packageSpec}`,
    "gi",
  );
  const isAllowedLocalOrPeer = (specifier: string): boolean =>
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("file:") ||
    specifier === "backlog.md" ||
    specifier.startsWith("backlog.md@");
  const hasAdditionalPositionalArgument = (match: RegExpMatchArray): boolean => {
    const commandEnd = (match.index ?? 0) + match[0].length;
    const commandTail = normalizedSurface.slice(commandEnd).match(/^[^\r\n`#;|&)]+/)?.[0] ?? "";
    return commandTail
      .trim()
      .split(/\s+/)
      .some((token) => token.length > 0 && !token.startsWith("-"));
  };

  const publicInstallClaims = [...normalizedSurface.matchAll(installCommands)]
    .filter(
      (match) => !isAllowedLocalOrPeer(match[1] ?? "") || hasAdditionalPositionalArgument(match),
    )
    .map(([command]) => command);
  const publicExecutorClaims = [...normalizedSurface.matchAll(executorCommands)]
    .filter(
      (match) =>
        !(
          match[1] === "skills" &&
          /^npx\b/i.test(match[0]) &&
          !hasAdditionalPositionalArgument(match)
        ),
    )
    .map(([command]) => command);

  expect(publicInstallClaims).toEqual([]);
  expect(publicExecutorClaims).toEqual([]);
  expect(surface).not.toMatch(
    /https?:\/\/github\.com\/[^\s)\]}\x60]+\/releases(?:\/[^\s)\]}\x60]+)?/i,
  );
  expect(surface).not.toMatch(/\bgh\s+release\s+download\b/i);
  expect(surface).not.toContain("npm package is published as `work-package-manager`");
  expect(surface).not.toContain("**npm package:** `work-package-manager`");
}

describe("inactive distribution public-surface contract", () => {
  it("fails the acquisition guard closed for an arbitrary package coordinate or GitHub release URL", () => {
    for (const claim of [
      "npm i -g @acme/wpm-cli",
      "pnpm add work-package-tool",
      "yarn global add @acme/wpm-cli",
      "npx @acme/wpm-cli init demo",
      "npm install '@acme/wpm-cli'",
      "npx '@acme/wpm-cli' init demo",
      "npm --silent install @acme/wpm-cli",
      "pnpm --global add @acme/wpm-cli",
      "npm install \\\n  @acme/wpm-cli",
      "npm i -g backlog.md @acme/wpm-cli",
      "npx skills add @acme/wpm-cli",
      "https://github.com/acme/wpm/releases",
      "https://github.com/acme/wpm/releases/tag/v0.1.0",
    ]) {
      expect(() => expectNoPublicAcquisitionClaim(claim), claim).toThrow();
    }

    expect(() =>
      expectNoPublicAcquisitionClaim("npm install\nnpm i -g backlog.md\nnpx skills"),
    ).not.toThrow();
  });

  it("keeps unshipped preparation code inside typecheck and Biome but outside the production build", () => {
    const typecheckPath = join(REPO_ROOT, "tsconfig.json");
    const typecheckConfig = readConfigFile(typecheckPath, sys.readFile);
    expect(typecheckConfig.error).toBeUndefined();
    const typecheck = parseJsonConfigFileContent(
      typecheckConfig.config,
      sys,
      REPO_ROOT,
      undefined,
      typecheckPath,
    );

    const buildPath = join(REPO_ROOT, "tsconfig.build.json");
    const buildConfig = readConfigFile(buildPath, sys.readFile);
    expect(buildConfig.error).toBeUndefined();
    const build = parseJsonConfigFileContent(
      buildConfig.config,
      sys,
      REPO_ROOT,
      undefined,
      buildPath,
    );

    for (const file of ["readiness.js", "assess-readiness.js"]) {
      const path = join(REPO_ROOT, "distribution-preparation", file);
      expect(typecheck.fileNames).toContain(path);
      expect(build.fileNames).not.toContain(path);
    }

    const biome = JSON.parse(readProjectFile("biome.json")) as {
      readonly files: { readonly includes: readonly string[] };
    };
    expect(biome.files.includes).toContain("distribution-preparation/**");
  });

  it("keeps local identity and executables intact while package metadata blocks npm publication", () => {
    const manifest = JSON.parse(readProjectFile("package.json")) as {
      readonly name: string;
      readonly private?: boolean;
      readonly bin: Readonly<Record<string, string>>;
      readonly files: readonly string[];
      readonly publishConfig?: unknown;
      readonly scripts: Readonly<Record<string, string>>;
    };

    expect(manifest.name).toBe("wpm");
    expect(manifest.bin).toEqual({ wpm: "./dist/cli.js", installer: "./dist/cli.js" });
    expect(manifest.private).toBe(true);
    expect(manifest.files).toEqual(["agent-skills", "dist", "docs", "templates"]);
    expect(manifest.publishConfig).toBeUndefined();
    expect(Object.keys(manifest.scripts)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/publish|release/i)]),
    );
  });

  it("keeps publication automation and release credentials absent", () => {
    const workflowsDirectory = join(REPO_ROOT, ".github", "workflows");
    expect(existsSync(join(workflowsDirectory, "release.yml"))).toBe(false);

    const workflows = readdirSync(workflowsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
      .map((entry) => readFileSync(join(workflowsDirectory, entry.name), "utf8"))
      .join("\n");

    expect(workflows).not.toMatch(/^\s*tags\s*:/m);
    expect(workflows).not.toMatch(/^\s*(?:contents|packages|id-token)\s*:\s*write\s*$/m);
    expect(workflows).not.toMatch(/^\s*(?:environment|secrets?)\s*:/m);
    expect(workflows).not.toMatch(/^\s*run\s*:\s*(?:npm\s+(?:publish|dist-tag)|gh\s+release)\b/im);
  });

  it("makes every currently conflicting public document explicitly inactive", () => {
    const docs = ["README.md", "FAQ.md", "CONTRIBUTING.md", "docs/12-builder-architecture.md"];

    for (const path of docs) {
      const text = readProjectFile(path);
      expect(text, path).toContain(INACTIVE_MARKER);
      expectNoPublicAcquisitionClaim(text);
    }

    expect(readProjectFile("docs/12-builder-architecture.md")).not.toContain(
      "npm run release             # CI handles via tag push",
    );
    expect(readProjectFile("CONTRIBUTING.md")).not.toContain(
      "CI publishes: the tag triggers the release workflow",
    );
  });

  it("keeps complete static and dynamic CLI help and every packaged authoring-skill document free of public acquisition claims", async () => {
    const topLevelPaths = PER_BUNDLE_HELP_PATHS.filter((path) => path.length === 1).map(
      ([command]) => command,
    );
    expect(await completions(["bundle", "audit-id"])).toEqual(topLevelPaths);
    for (const command of topLevelPaths) {
      const children = PER_BUNDLE_HELP_PATHS.filter(
        (path) => path.length === 2 && path[0] === command,
      ).map((path) => path[1]);
      expect(await completions(["bundle", "audit-id", command]), command).toEqual(children);
    }

    const program = buildProgram(deps(), io());
    const staticHelp = allCommands(program).map(fullHelp).join("\n");
    const dynamicHelp: string[] = [];
    for (const path of PER_BUNDLE_HELP_PATHS) {
      const streams = io();
      const invocation = ["bundle", "audit-id", ...path, "--help"];
      expect(await run(invocation, deps(), streams), invocation.join(" ")).toBe(0);
      expect(streams.err.text, invocation.join(" ")).toBe("");
      dynamicHelp.push(streams.out.text);
    }

    const help = `${staticHelp}\n${dynamicHelp.join("\n")}`;
    expectNoPublicAcquisitionClaim(help);
    expect(help).toContain("wpm build publish");

    const packagedSkillDocs = markdownUnder(join(REPO_ROOT, "agent-skills"));
    expect(packagedSkillDocs.length).toBeGreaterThan(0);
    for (const skillDoc of packagedSkillDocs) expectNoPublicAcquisitionClaim(skillDoc);
  });

  it("audits the rendered authoring front door and proves preparation tooling never enters a deliverable", () => {
    const fs = new MemoryFileSystem();
    mirrorTemplates(fs);
    initProject(deps(fs), { targetDir: WORKSPACE, name: "truthful-demo" });

    const renderedFrontDoor = fs.read(join(WORKSPACE, "AGENTS.md"));
    expect(renderedFrontDoor).toContain("truthful-demo");
    expectNoPublicAcquisitionClaim(renderedFrontDoor);

    const deliverableFiles = filesUnder(fs, join(WORKSPACE, "wip"));
    expect(deliverableFiles.length).toBeGreaterThan(0);
    expect(deliverableFiles.some((path) => path.includes("distribution-preparation"))).toBe(false);
    for (const path of deliverableFiles) {
      expect(fs.read(path), path).not.toContain("assess-readiness.js");
    }
  });
});
