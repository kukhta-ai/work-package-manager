#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { stringify } from "yaml";

/**
 * Qualify a supplied, approved APM executable through the already built WPM CLI.
 * This does not install tooling, rebuild shared dist, contact a remote dependency or start an agent.
 * @param {string[]} argv
 */
function qualifyApm(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      executable: { type: "string" },
      sha256: { type: "string" },
      output: { type: "string", default: ".quality/apm-qualification.json" },
      "wpm-cli": { type: "string" },
      "keep-on-failure": { type: "boolean", default: false },
    },
    strict: true,
  });
  if (
    !values.executable ||
    !isAbsolute(values.executable) ||
    !values.sha256 ||
    !/^[a-f0-9]{64}$/.test(values.sha256)
  )
    throw new Error("Supply --executable /absolute/apm and its approved --sha256 digest");
  const cli = values["wpm-cli"] ?? fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  if (!existsSync(cli))
    throw new Error(
      "Build WPM before native APM qualification; this command never rebuilds shared output",
    );
  const root = mkdtempSync(join(tmpdir(), "wpm-apm-qualification-"));
  let passed = false;
  try {
    const source = join(root, "worker-setup/ctx");
    const dependency = join(source, "dep");
    const userMarker = join(root, "unexpected-user-lifecycle");
    const dependencyMarker = join(root, "unexpected-dependency-lifecycle");
    /** @param {string} marker */
    const lifecycleAction = (marker) => ({
      type: "command",
      bash: `printf executed > '${marker.replaceAll("'", "'\\''")}'`,
      command: `echo executed > "${marker.replaceAll('"', '""')}"`,
    });
    mkdirSync(join(source, ".apm/instructions"), { recursive: true });
    mkdirSync(join(dependency, ".apm/instructions"), { recursive: true });
    mkdirSync(join(dependency, ".apm/skills/guide"), { recursive: true });
    writeFileSync(
      join(root, "package.yml"),
      stringify({
        schemaVersion: 1,
        name: "qualified-apm",
        version: "0.1.0",
        work: [],
        groups: {},
        workerSetup: { setups: { ctx: { source: "worker-setup/ctx", backend: "apm" } } },
        files: [],
      }),
    );
    writeFileSync(
      join(source, "apm.yml"),
      "name: fixture\nversion: 1.0.0\ndescription: Local WPM composition qualification\ntargets: [codex, claude]\ndependencies:\n  apm:\n    - ./dep\n",
    );
    writeFileSync(
      join(dependency, "apm.yml"),
      stringify({
        name: "dep",
        version: "1.0.0",
        description: "Local qualification dependency",
        lifecycle: { "post-install": [lifecycleAction(dependencyMarker)] },
      }),
    );
    writeFileSync(
      join(source, ".apm/instructions/main.instructions.md"),
      "---\napplyTo: '**'\ndescription: Package context\n---\n\nUse the selected operation and verify its acceptance criteria.\n",
    );
    writeFileSync(
      join(dependency, ".apm/instructions/dep.instructions.md"),
      "---\napplyTo: '**'\ndescription: Dependency context\n---\n\nCheck evidence before reporting an outcome.\n",
    );
    writeFileSync(
      join(dependency, ".apm/skills/guide/SKILL.md"),
      "---\nname: guide\ndescription: Explain the selected work using the package acceptance criteria.\n---\n\nRead the selected operation and ask for any missing input.\n",
    );
    /** @param {string[]} args @returns {unknown} */
    const invoke = (...args) =>
      JSON.parse(
        execFileSync(process.execPath, [cli, "vnext", "--root", root, ...args], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 180_000,
        }),
      );
    const pin = ["--executable", values.executable, "--sha256", values.sha256];
    const locked = invoke("worker-setup", "apm", "lock", "ctx", ...pin);
    for (const targetPath of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"])
      if (existsSync(join(source, targetPath)))
        throw new Error(`native lock unexpectedly deployed ${targetPath}`);
    const lifecyclePolicy = stringify({
      lifecycle: { "pre-install": [lifecycleAction(userMarker)] },
    });
    const control = join(root, "native-control");
    const controlHome = join(control, "home");
    const controlTarget = join(control, "target");
    mkdirSync(controlHome, { recursive: true });
    mkdirSync(controlTarget);
    writeFileSync(join(controlHome, "apm.yml"), lifecyclePolicy);
    writeFileSync(
      join(controlTarget, "apm.lock.yaml"),
      readFileSync(join(source, "apm.lock.yaml")),
    );
    // Prove this platform really fires the harmless user hook before testing WPM suppression.
    execFileSync(
      values.executable,
      ["install", "--only", "apm", "--target", "codex", "--root", controlTarget, "--no-trust-bin"],
      {
        cwd: source,
        env: {
          ...process.env,
          APM_HOME: controlHome,
          APM_CACHE_DIR: join(control, "cache"),
          APM_TEMP_DIR: join(control, "tmp"),
          APM_NO_SCRIPTS: "",
          CI: "1",
          APM_PROGRESS: "quiet",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180_000,
      },
    );
    if (!existsSync(userMarker))
      throw new Error(
        "native lifecycle positive control did not execute; suppression is unqualified",
      );
    rmSync(userMarker);
    rmSync(dependencyMarker, { force: true });
    const managedHome = join(root, ".wpm-apm/ctx/home");
    mkdirSync(managedHome, { recursive: true });
    writeFileSync(join(managedHome, "apm.yml"), lifecyclePolicy);
    /** @type {unknown[]} */
    const phases = [locked];
    for (const target of ["codex", "claude-code"]) {
      phases.push(invoke("worker-setup", "apm", "install", "ctx", ...pin, "--target", target));
      phases.push(invoke("worker-setup", "apm", "install", "ctx", ...pin, "--target", target));
      phases.push(invoke("worker-setup", "apm", "compile", "ctx", ...pin, "--target", target));
      if (existsSync(userMarker) || existsSync(dependencyMarker))
        throw new Error("APM lifecycle marker executed through WPM composition");
    }
    invoke("check");
    invoke("lock");
    const first = invoke("build");
    const second = invoke("build");
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error("repeated WPM build changed its bound artifact");
    const archive = join(root, "builds/qualified-apm-0.1.0.tgz");
    const archiveSha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
    const files = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
    if (
      !files.some((file) => file.includes("targets/codex/")) ||
      !files.some((file) => file.includes("targets/claude/")) ||
      !files.some((file) => file.includes("skills/guide/SKILL.md"))
    )
      throw new Error("qualified native target context or skill is absent from the release");
    if (files.some((file) => /(?:^|\/)(?:wpm-repo-[^/]*|apm_modules|\.wpm-apm)(?:\/|$)/.test(file)))
      throw new Error("authoring or development state entered the release");
    const receipt = {
      schemaVersion: 1,
      backend: "apm",
      version: "0.35.0",
      executableSha256: values.sha256,
      platform: process.platform,
      architecture: process.arch,
      phases,
      archiveSha256,
      files,
      localDependencyQualified: true,
      lifecycleSuppressionQualified: true,
      userLifecyclePositiveControl: true,
      transitiveLifecycleManifestQualified: true,
      remoteDependenciesQualified: false,
      agentExecution: false,
      nativeInstructionsLoaded: false,
    };
    const output = resolve(values.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(
      `${JSON.stringify({ passed: true, output, archiveSha256, localDependencyQualified: true, agentExecution: false })}\n`,
    );
    passed = true;
    return receipt;
  } catch (error) {
    const output = resolve(values.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(
      output,
      `${JSON.stringify({ schemaVersion: 1, passed: false, version: "0.35.0", executableSha256: values.sha256, error: error instanceof Error ? error.message : String(error), retainedFixture: values["keep-on-failure"] ? root : null, agentExecution: false }, null, 2)}\n`,
    );
    throw error;
  } finally {
    if (passed || !values["keep-on-failure"]) rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  qualifyApm(process.argv.slice(2));
