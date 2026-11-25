#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { createIsolatedEnvironment } from "../distribution-preparation/verify-packed-install.js";

/**
 * Qualify a supplied, approved APM executable through the already built WPM CLI.
 * This never installs tooling, rebuilds shared dist or starts an agent.
 * It resolves one exact public remote skill and can inspect native client configuration in isolated homes.
 * @param {string[]} argv
 */
function qualifyApm(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      executable: { type: "string" },
      sha256: { type: "string" },
      "distribution-sha256": { type: "string" },
      output: { type: "string", default: ".quality/apm-qualification.json" },
      "wpm-cli": { type: "string" },
      "codex-bin": { type: "string" },
      "claude-bin": { type: "string" },
      "network-isolator": { type: "string" },
      "remote-source": {
        type: "string",
        default:
          "microsoft/apm-sample-package/.apm/skills/style-checker#45e69a68a7111bbab36a0457915d41b4b93f9acf",
      },
      "keep-on-failure": { type: "boolean", default: false },
    },
    strict: true,
  });
  if (
    !values.executable ||
    !isAbsolute(values.executable) ||
    !values.sha256 ||
    !/^[a-f0-9]{64}$/.test(values.sha256) ||
    !values["distribution-sha256"] ||
    !/^[a-f0-9]{64}$/.test(values["distribution-sha256"])
  )
    throw new Error(
      "Supply --executable /absolute/apm with approved --sha256 and --distribution-sha256 digests",
    );
  const cli = values["wpm-cli"] ?? fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  if (!existsSync(cli))
    throw new Error(
      "Build WPM before native APM qualification; this command never rebuilds shared output",
    );
  if (Boolean(values["codex-bin"]) !== Boolean(values["claude-bin"]))
    throw new Error(
      "Supply both --codex-bin and --claude-bin for native client configuration qualification",
    );
  for (const bin of [values["codex-bin"], values["claude-bin"], values["network-isolator"]])
    if (bin && (!isAbsolute(bin) || !existsSync(bin)))
      throw new Error("Native client executables must be explicit existing absolute paths");
  if (!values["remote-source"] || !/#[a-f0-9]{40}$/.test(values["remote-source"]))
    throw new Error("The remote qualification source must name an exact 40-character commit");
  let root = mkdtempSync(join(tmpdir(), "wpm-apm-qualification-"));
  let passed = false;
  try {
    const source = join(root, "worker-setup/ctx");
    const dependency = join(source, "dep");
    const grandchild = join(dependency, "child");
    const credentialMarker = "wpm-fixture-secret-must-not-enter-release";
    const credentialReference = "$" + "{WPM_FIXTURE_TOKEN}";
    let denyNetwork = false;
    const nativeHome = join(root, "native-home");
    mkdirSync(nativeHome);
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
    mkdirSync(join(grandchild, ".apm/instructions"), { recursive: true });
    writeFileSync(
      join(grandchild, "apm.yml"),
      "name: child\nversion: 1.0.0\ndescription: Transitive local qualification dependency\n",
    );
    writeFileSync(
      join(grandchild, ".apm/instructions/child.instructions.md"),
      "---\napplyTo: '**'\ndescription: Transitive fixture context\n---\n\nRetain the transitive qualification instruction.\n",
    );
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
      stringify({
        name: "fixture",
        version: "1.0.0",
        description: "WPM APM composition qualification",
        targets: ["codex", "claude"],
        dependencies: {
          apm: ["./dep", values["remote-source"]],
          mcp: [
            {
              name: "fixture-stdio",
              registry: false,
              transport: "stdio",
              command: "node",
              args: ["fixture-server.mjs"],
              env: { WPM_FIXTURE_TOKEN: credentialReference },
            },
            {
              name: "fixture-http",
              registry: false,
              transport: "http",
              url: "https://mcp.example.invalid/fixture",
              headers: { Authorization: `Bearer ${credentialReference}` },
            },
          ],
        },
      }),
    );
    writeFileSync(
      join(dependency, "apm.yml"),
      stringify({
        name: "dep",
        version: "1.0.0",
        description: "Local qualification dependency",
        dependencies: { apm: ["./child"] },
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
        execFileSync(
          denyNetwork && values["network-isolator"] ? values["network-isolator"] : process.execPath,
          [
            ...(denyNetwork && values["network-isolator"] ? ["-n", process.execPath] : []),
            cli,
            "vnext",
            "--root",
            root,
            ...args,
          ],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, WPM_FIXTURE_TOKEN: credentialMarker },
            timeout: 180_000,
          },
        ),
      );
    const pin = [
      "--executable",
      values.executable,
      "--sha256",
      values.sha256,
      "--distribution-sha256",
      values["distribution-sha256"],
    ];
    const locked = invoke("worker-setup", "apm", "lock", "ctx", ...pin);
    const nativeLock = readFileSync(join(source, "apm.lock.yaml"));
    invoke("worker-setup", "apm", "lock", "ctx", ...pin, "--check");
    assert.deepEqual(readFileSync(join(source, "apm.lock.yaml")), nativeLock);
    assert(!nativeLock.includes(Buffer.from(credentialMarker)));
    process.stdout.write("APM exact local/transitive/remote resolution passed\n");
    for (const targetPath of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"])
      if (existsSync(join(source, targetPath)))
        throw new Error(`native lock unexpectedly deployed ${targetPath}`);
    const lifecyclePolicy = stringify({
      lifecycle: { "pre-install": [lifecycleAction(userMarker)] },
    });
    const control = join(root, "native-control");
    const controlHome = join(control, "home");
    const controlSource = join(control, "source");
    const controlTarget = join(control, "target");
    mkdirSync(controlHome, { recursive: true });
    mkdirSync(controlTarget);
    mkdirSync(controlSource);
    writeFileSync(
      join(controlSource, "apm.yml"),
      "name: lifecycle-control\nversion: 1.0.0\ndescription: Native lifecycle positive control\ndependencies:\n  apm: [./dep]\n",
    );
    mkdirSync(join(controlSource, "dep/.apm/skills/control"), { recursive: true });
    writeFileSync(
      join(controlSource, "dep/apm.yml"),
      "name: control-dep\nversion: 1.0.0\ndescription: Native control dependency\n",
    );
    writeFileSync(
      join(controlSource, "dep/.apm/skills/control/SKILL.md"),
      "---\nname: control\ndescription: Native control fixture\n---\nInspect fixture context.\n",
    );
    writeFileSync(join(controlHome, "apm.yml"), lifecyclePolicy);
    // Prove this platform really fires the harmless user hook before testing WPM suppression.
    execFileSync(
      values.executable,
      [
        "install",
        "--no-frozen",
        "--only",
        "apm",
        "--target",
        "codex",
        "--root",
        controlTarget,
        "--no-trust-bin",
      ],
      {
        cwd: controlSource,
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
      phases.push(invoke("worker-setup", "apm", "check", "ctx", ...pin, "--target", target));
      if (existsSync(userMarker) || existsSync(dependencyMarker))
        throw new Error("APM lifecycle marker executed through WPM composition");
    }
    const offlineLock = readFileSync(join(source, "apm.lock.yaml"));
    denyNetwork = true;
    phases.push(invoke("worker-setup", "apm", "lock", "ctx", ...pin, "--offline"));
    assert.deepEqual(readFileSync(join(source, "apm.lock.yaml")), offlineLock);
    for (const target of ["codex", "claude-code"]) {
      const nativeTarget = target === "claude-code" ? "claude" : target;
      rmSync(join(root, ".wpm-apm/ctx/targets", nativeTarget), { recursive: true });
      phases.push(
        invoke("worker-setup", "apm", "install", "ctx", ...pin, "--target", target, "--offline"),
      );
      phases.push(
        invoke("worker-setup", "apm", "compile", "ctx", ...pin, "--target", target, "--offline"),
      );
    }
    denyNetwork = false;
    let nativeClientConfigurationQualified = false;
    /** @type {{codex:string;claudeCode:string}|null} */
    let nativeClientVersions = null;
    if (values["codex-bin"] && values["claude-bin"]) {
      const codexHome = join(nativeHome, ".codex");
      const claudeHome = join(nativeHome, ".claude");
      mkdirSync(codexHome, { recursive: true });
      mkdirSync(claudeHome, { recursive: true });
      const codexProject = join(root, ".wpm-apm/ctx/targets/codex");
      const claudeProject = join(root, ".wpm-apm/ctx/targets/claude");
      writeFileSync(
        join(codexHome, "config.toml"),
        `[projects.${JSON.stringify(codexProject)}]\ntrust_level = "trusted"\n`,
      );
      const clientEnv = {
        ...createIsolatedEnvironment({
          home: nativeHome,
          workspace: codexProject,
          cache: join(nativeHome, "cache"),
          prefix: nativeHome,
          userConfig: join(nativeHome, "npmrc"),
          sourceRoot: fileURLToPath(new URL("..", import.meta.url)),
        }),
        CODEX_HOME: codexHome,
        CLAUDE_CONFIG_DIR: claudeHome,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        WPM_FIXTURE_TOKEN: credentialMarker,
      };
      nativeClientVersions = {
        codex: execFileSync(values["codex-bin"], ["--version"], {
          encoding: "utf8",
          timeout: 30000,
          cwd: codexProject,
          env: clientEnv,
        }).trim(),
        claudeCode: execFileSync(values["claude-bin"], ["--version"], {
          encoding: "utf8",
          timeout: 30000,
          cwd: codexProject,
          env: clientEnv,
        }).trim(),
      };
      /** @type {unknown} */
      const codex = JSON.parse(
        execFileSync(values["codex-bin"], ["mcp", "list", "--json"], {
          cwd: codexProject,
          env: clientEnv,
          encoding: "utf8",
          timeout: 30_000,
        }),
      );
      assert(Array.isArray(codex));
      for (const name of ["fixture-stdio", "fixture-http"])
        assert(
          codex.some(
            (/** @type {unknown} */ entry) =>
              entry !== null && typeof entry === "object" && "name" in entry && entry.name === name,
          ),
        );
      const claude = execFileSync(values["claude-bin"], ["mcp", "get", "fixture-http"], {
        cwd: claudeProject,
        env: clientEnv,
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.match(claude, /Pending approval/i);
      nativeClientConfigurationQualified = true;
    }
    invoke("check");
    invoke("lock", ...pin);
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
    const releaseContent = execFileSync("tar", ["-xOf", archive], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    assert(!releaseContent.includes(credentialMarker));
    assert(releaseContent.includes("Retain the transitive qualification instruction"));
    assert(files.some((file) => file.endsWith("targets/codex/.codex/config.toml")));
    assert(files.some((file) => file.endsWith("targets/claude/.mcp.json")));
    assert(files.some((file) => file.includes("style-checker/SKILL.md")));
    const moved = `${root}-moved`;
    renameSync(root, moved);
    root = moved;
    invoke("build");
    assert.equal(
      createHash("sha256")
        .update(readFileSync(join(root, "builds/qualified-apm-0.1.0.tgz")))
        .digest("hex"),
      archiveSha256,
    );
    // A moved workspace must remain usable for future authoring, not only frozen builds.
    phases.push(invoke("worker-setup", "apm", "lock", "ctx", ...pin, "--upgrade"));
    for (const target of ["codex", "claude-code"]) {
      phases.push(invoke("worker-setup", "apm", "install", "ctx", ...pin, "--target", target));
      phases.push(invoke("worker-setup", "apm", "compile", "ctx", ...pin, "--target", target));
      phases.push(invoke("worker-setup", "apm", "check", "ctx", ...pin, "--target", target));
    }
    invoke("lock", ...pin);
    invoke("build");
    assert.equal(
      createHash("sha256")
        .update(readFileSync(join(root, "builds/qualified-apm-0.1.0.tgz")))
        .digest("hex"),
      archiveSha256,
    );
    writeFileSync(
      join(root, "worker-setup/ctx/.apm/instructions/main.instructions.md"),
      "Changed context must invalidate prepared output.\n",
    );
    const stale = spawnSync(process.execPath, [cli, "vnext", "--root", root, "build"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /stale|changed/i);
    assert.equal(
      createHash("sha256")
        .update(readFileSync(join(root, "builds/qualified-apm-0.1.0.tgz")))
        .digest("hex"),
      archiveSha256,
    );
    const receipt = {
      schemaVersion: 1,
      backend: "apm",
      version: "0.39.0",
      executableSha256: values.sha256,
      distributionSha256: values["distribution-sha256"],
      platform: process.platform,
      architecture: process.arch,
      phases,
      archiveSha256,
      files,
      localDependencyQualified: true,
      lifecycleSuppressionQualified: true,
      userLifecyclePositiveControl: true,
      transitiveLifecycleManifestQualified: true,
      remoteDependenciesQualified: true,
      remoteSource: values["remote-source"],
      transitiveLocalDependencyQualified: true,
      offlineReplayQualified: true,
      offlineNetworkDeniedQualified: Boolean(values["network-isolator"]),
      mcpDeclarationsQualified: true,
      secretExclusionQualified: true,
      relocationDeterminismQualified: true,
      relocatedOnlinePreparationQualified: true,
      staleSourceRejectionQualified: true,
      nativeClientConfigurationQualified,
      nativeClientVersions,
      wpmCliSha256: createHash("sha256").update(readFileSync(cli)).digest("hex"),
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
      `${JSON.stringify({ schemaVersion: 1, passed: false, version: "0.39.0", executableSha256: values.sha256, error: error instanceof Error ? error.message : String(error), retainedFixture: values["keep-on-failure"] ? root : null, agentExecution: false }, null, 2)}\n`,
    );
    throw error;
  } finally {
    if (passed || !values["keep-on-failure"]) rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  qualifyApm(process.argv.slice(2));
