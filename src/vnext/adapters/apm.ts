import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { execaSync } from "execa";
import { parse } from "yaml";
import { apmReference } from "../core/apm-source.js";
import { assertPortablePath, assertSlug, assertSourcePath, stableJson } from "../core/model.js";
import { projectMcp } from "../core/worker-context.js";
import { stageApmSource } from "./apm-source-tree.js";
import { assertPortableTree } from "./portable-tree.js";

/** This adapter qualifies one exact external CLI version; plain packages never instantiate it. */
const APM_VERSION = "0.39.0";
export type ApmTarget = "codex" | "claude";
export interface ApmTool {
  executable: string;
  sha256: string;
  authEnv?: string[];
  distributionSha256?: string | undefined;
}
interface InventoryFile {
  path: string;
  sha256: string;
}
interface PhaseReceipt {
  schemaVersion: 1;
  version: string;
  toolSha256: string;
  toolDistributionSha256?: string;
  sourceSha256: string;
  lockSha256: string;
  target: ApmTarget;
  phase: "installing" | "installed" | "compiled" | "failed";
  files: InventoryFile[];
  directories?: string[];
  support?: ReturnType<typeof projectMcp>;
  closureSha256?: string;
}
interface ApmCommandResult {
  stdout: string;
  stderr: string;
}
type ApmCommand = (
  executable: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; timeout: number },
) => ApmCommandResult;
const run: ApmCommand = (executable, args, options) =>
  execaSync(executable, args, { ...options, extendEnv: false, stdin: "ignore", reject: true });

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function regularPath(root: string, path: string, kind: "file" | "directory" | "optional"): string {
  const boundary = resolve(root);
  const absolute = resolve(path);
  const difference = relative(boundary, absolute);
  if (
    isAbsolute(difference) ||
    difference === ".." ||
    difference.startsWith("../") ||
    difference.startsWith("..\\")
  )
    throw new Error("APM path escaped its owned boundary");
  let current = boundary;
  for (const part of ["", ...difference.split(/[\\/]/).filter(Boolean)]) {
    if (part) current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error(`APM symbolic path is forbidden: ${current}`);
    if (stat && current !== absolute && !stat.isDirectory())
      throw new Error(`APM parent is not a directory: ${current}`);
  }
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (kind !== "optional" && (!stat || (kind === "file" ? !stat.isFile() : !stat.isDirectory())))
    throw new Error(`missing APM ${kind}: ${absolute}`);
  return absolute;
}

function inventory(directory: string): InventoryFile[] {
  const files: InventoryFile[] = [];
  const entries: { path: string; kind: "file" | "directory" }[] = [];
  const walk = (path: string): void => {
    regularPath(directory, path, "directory");
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const absolute = join(path, entry.name);
      const name = relative(directory, absolute).split("\\").join("/");
      assertPortablePath(name);
      if (entry.isSymbolicLink()) throw new Error(`APM generated symlink is forbidden: ${name}`);
      if (entry.isDirectory()) {
        entries.push({ path: name, kind: "directory" });
        walk(absolute);
      } else {
        regularPath(directory, absolute, "file");
        entries.push({ path: name, kind: "file" });
        files.push({ path: name, sha256: sha256(readFileSync(absolute)) });
      }
    }
  };
  if (existsSync(directory)) walk(directory);
  assertPortableTree(entries);
  return files;
}

function targetDirectories(root: string): string[] {
  const result: string[] = [];
  const walk = (directory: string): void => {
    regularPath(root, directory, "directory");
    for (const entry of readdirSync(directory, { withFileTypes: true }))
      if (entry.isDirectory()) {
        const path = join(directory, entry.name);
        result.push(relative(root, path).split("\\").join("/"));
        walk(path);
      }
  };
  if (existsSync(root)) walk(root);
  return result.sort();
}

function validateTargetDirectories(
  files: readonly InventoryFile[],
  directories: readonly string[],
): void {
  const expected = new Set<string>();
  for (const path of [...directories, ...files.map((file) => file.path)]) {
    const parts = assertPortablePath(path).split("/");
    for (let length = 1; length < parts.length; length++)
      expected.add(parts.slice(0, length).join("/"));
  }
  for (const path of directories) {
    expected.add(path);
    if (
      ![".agents", ".claude", ".codex", "apm_modules", ".apm", ".apm-local"].includes(path) &&
      nativeEntryKind(`${path}/__entry__`) === "forbidden"
    )
      throw new Error("unsupported generated APM target artifact directory");
  }
  if (stableJson(directories) !== stableJson([...expected].sort()))
    throw new Error("APM directory inventory is not complete and canonical");
}

function sanitizedNativeCause(value: unknown, secrets: readonly string[], depth = 0): Error {
  const redact = (text: string): string =>
    secrets.reduce((result, secret) => result.replaceAll(secret, "[redacted]"), text);
  const result = new Error(redact(value instanceof Error ? value.message : String(value)));
  if (value instanceof Error) {
    result.name = redact(value.name);
    if (value.stack) result.stack = redact(value.stack);
    if (value.cause !== undefined && depth < 8)
      result.cause = sanitizedNativeCause(value.cause, secrets, depth + 1);
  }
  return result;
}

function sourceInventory(source: string): InventoryFile[] {
  // Bind authored companion/local dependency content as well as primitives and downloaded module bytes.
  return inventory(source).filter(
    (file) => file.path !== "apm.lock.yaml" && !file.path.split("/").includes(".git"),
  );
}

function readReceipt(path: string): PhaseReceipt {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    value !== null &&
    typeof value === "object" &&
    "version" in value &&
    value.version === "0.35.0"
  )
    throw new Error(
      "APM 0.35.0 receipt requires explicit migration: preserve old state, reference the same authored source under a new setup name, then lock/install/compile with APM 0.39.0 and update work associations",
    );
  if (
    value === null ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("version" in value) ||
    value.version !== APM_VERSION ||
    !("target" in value) ||
    (value.target !== "codex" && value.target !== "claude") ||
    !("phase" in value) ||
    !["installing", "installed", "compiled", "failed"].includes(String(value.phase)) ||
    !("sourceSha256" in value) ||
    typeof value.sourceSha256 !== "string" ||
    !("lockSha256" in value) ||
    typeof value.lockSha256 !== "string" ||
    !("toolSha256" in value) ||
    typeof value.toolSha256 !== "string" ||
    !("files" in value) ||
    !Array.isArray(value.files)
  )
    throw new Error("invalid APM composition receipt");
  const entries: { path: string; kind: "file" }[] = [];
  for (const file of value.files as unknown[]) {
    if (
      file === null ||
      typeof file !== "object" ||
      !("path" in file) ||
      typeof file.path !== "string" ||
      !("sha256" in file) ||
      typeof file.sha256 !== "string"
    )
      throw new Error("invalid APM composition inventory");
    entries.push({ path: file.path, kind: "file" });
  }
  assertPortableTree(entries);
  return value as PhaseReceipt;
}

/** Compare all resolution evidence while excluding only native deployment-ledger metadata. */
function resolvedGraph(text: string): string {
  const value: unknown = parse(text);
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("lockfile_version" in value) ||
    !("apm_version" in value) ||
    value.apm_version !== APM_VERSION ||
    !("dependencies" in value) ||
    !Array.isArray(value.dependencies) ||
    (String(value.lockfile_version) !== "4" &&
      !(String(value.lockfile_version) === "1" && value.dependencies.length === 0))
  )
    throw new Error(
      "unsupported native APM lock format; explicitly lock and prepare with APM 0.39.0",
    );
  const result: Record<string, unknown> = { ...value };
  // APM 0.39 emits format 1 for an empty graph; root deployment hashes may raise it to 4.
  // Compare those empty graphs equally while receipts still bind the exact native lock bytes.
  if (value.dependencies.length === 0) result.lockfile_version = "4";
  // Native target deployment drops manifest_targets; the authored manifest and receipt bind target support separately.
  delete result.manifest_targets;
  delete result.deployments;
  delete result.local_deployed_files;
  delete result.local_deployed_file_hashes;
  result.dependencies = value.dependencies
    .map((dependency: unknown) => {
      if (dependency === null || typeof dependency !== "object" || Array.isArray(dependency))
        throw new Error("invalid native APM dependency pin");
      const pin: Record<string, unknown> = { ...dependency };
      delete pin.deployed_files;
      delete pin.deployed_file_hashes;
      return pin;
    })
    .sort((a, b) => {
      const left = stableJson(a);
      const right = stableJson(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return stableJson(result);
}

/** Inspect bytes only; observing a digest does not grant execution authority. */
export function inspectApmDistribution(tool: ApmTool): {
  entrySha256: string;
  distributionSha256: string;
  multiFile: boolean;
} {
  const stat = lstatSync(tool.executable);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("APM executable must be a regular file");
  const entry = sha256(readFileSync(tool.executable));
  const companion = join(tool.executable, "..", "_internal");
  const companions = existsSync(companion) ? inventory(companion) : [];
  return {
    entrySha256: entry,
    distributionSha256: sha256(stableJson({ entry, companions })),
    multiFile: existsSync(companion),
  };
}

function closureDigest(state: string): string {
  const modules = regularPath(state, join(state, "native-source", "apm_modules"), "optional");
  return sha256(
    stableJson(
      existsSync(modules)
        ? inventory(modules).filter((file) => !file.path.split("/").includes(".git"))
        : [],
    ),
  );
}

function closureMatches(
  state: string,
  expected: string | undefined,
  requirePresent = false,
): boolean {
  const modules = regularPath(state, join(state, "native-source", "apm_modules"), "optional");
  if (!existsSync(modules) && !requirePresent) return expected !== undefined;
  return expected === closureDigest(state);
}

/** Explicit optional integration. Lock, install and compile are distinct user actions. */
export class ApmBackend {
  private readonly workspace: string;
  private readonly source: string;
  private readonly state: string;
  private readonly reference: string | undefined;
  private nativeSource: string | undefined;
  constructor(
    workspace: string,
    readonly name: string,
    source: string,
    private readonly tool: ApmTool,
    private readonly execute: ApmCommand = run,
  ) {
    assertSlug(name);
    this.workspace = realpathSync.native(regularPath(workspace, workspace, "directory"));
    this.state = regularPath(this.workspace, join(this.workspace, ".wpm-apm", name), "optional");
    this.reference = apmReference(source);
    this.source = this.reference
      ? regularPath(this.workspace, join(this.state, "source"), "optional")
      : regularPath(this.workspace, join(this.workspace, assertSourcePath(source)), "directory");
  }

  private distributionDigest(): string {
    return inspectApmDistribution(this.tool).distributionSha256;
  }

  private initializeSource(): void {
    if (!this.reference) return;
    const text = `name: wpm-${this.name}\nversion: 1.0.0\ndependencies:\n  apm:\n    - ${JSON.stringify(this.reference)}\n`;
    const path = regularPath(this.workspace, join(this.source, "apm.yml"), "optional");
    if (existsSync(path)) {
      if (readFileSync(path, "utf8") !== text)
        throw new Error("remote APM wrapper changed; preserved for inspection");
    } else {
      if (existsSync(this.source))
        throw new Error("foreign remote APM source directory; preserved");
      mkdirSync(this.source, { recursive: true });
      writeFileSync(path, text, { flag: "wx" });
    }
  }

  private env(): Record<string, string> {
    const inherited: Record<string, string> = {};
    for (const key of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TMPDIR",
      "TEMP",
      "TMP",
      "HTTPS_PROXY",
      "HTTP_PROXY",
      "NO_PROXY",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
    ])
      if (process.env[key]) inherited[key] = process.env[key];
    for (const key of this.tool.authEnv ?? []) {
      if (!/^(GH_TOKEN|GITHUB_TOKEN|GIT_ASKPASS|SSH_AUTH_SOCK|GIT_SSH_COMMAND)$/.test(key))
        throw new Error(`unsupported explicit APM authentication variable: ${key}`);
      if (!process.env[key]) throw new Error(`missing APM authentication variable: ${key}`);
      inherited[key] = process.env[key];
    }
    return {
      ...inherited,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: join(this.state, "home"),
      USERPROFILE: join(this.state, "home"),
      TMPDIR: join(this.state, "tmp"),
      TEMP: join(this.state, "tmp"),
      TMP: join(this.state, "tmp"),
      XDG_CONFIG_HOME: join(this.state, "home", "config"),
      XDG_CACHE_HOME: join(this.state, "home", "cache"),
      APPDATA: join(this.state, "home", "appdata"),
      LOCALAPPDATA: join(this.state, "home", "localappdata"),
      APM_HOME: join(this.state, "home"),
      APM_CACHE_DIR: join(this.state, "cache"),
      APM_TEMP_DIR: join(this.state, "tmp"),
      CI: "1",
      APM_PROGRESS: "quiet",
      // APM 0.39.0's lifecycle firing boundary honors this for org, user and project tiers.
      // --only apm and --no-trust-bin do not suppress those lifecycle scripts.
      APM_NO_SCRIPTS: "1",
    };
  }

  private verifyToolBytes(): void {
    if (!isAbsolute(this.tool.executable) || !/^[a-f0-9]{64}$/.test(this.tool.sha256))
      throw new Error("APM requires an explicit absolute executable and SHA-256 pin");
    const executable = lstatSync(this.tool.executable, { throwIfNoEntry: false });
    if (!executable?.isFile() || executable.isSymbolicLink())
      throw new Error("APM executable is missing or is not a regular file");
    if (sha256(readFileSync(this.tool.executable)) !== this.tool.sha256)
      throw new Error("APM executable digest does not match the approved pin");
    const distribution = inspectApmDistribution(this.tool);
    if (
      (distribution.multiFile || this.tool.distributionSha256 !== undefined) &&
      this.tool.distributionSha256 !== distribution.distributionSha256
    )
      throw new Error("APM distribution digest is missing or differs from the approved pin");
  }

  private verifyTool(): void {
    this.verifyToolBytes();
    for (const key of [
      "HOME",
      "APM_HOME",
      "APM_CACHE_DIR",
      "APM_TEMP_DIR",
      "XDG_CONFIG_HOME",
      "XDG_CACHE_HOME",
      "APPDATA",
      "LOCALAPPDATA",
    ] as const) {
      const path = this.env()[key];
      if (path) {
        regularPath(this.workspace, path, "optional");
        mkdirSync(path, { recursive: true });
      }
    }
    const result = this.execute(this.tool.executable, ["--version"], {
      cwd: this.workspace,
      env: this.env(),
      timeout: 30_000,
    });
    if (
      !new RegExp(`(?:^|\\s)${APM_VERSION.replaceAll(".", "\\.")}(?:$|\\s)`).test(
        result.stdout.trim(),
      )
    )
      throw new Error(`APM ${APM_VERSION} is required; executable reported another version`);
  }

  private validateSource(): void {
    const manifest: unknown = parse(
      readFileSync(regularPath(this.source, join(this.source, "apm.yml"), "file"), "utf8"),
    );
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest))
      throw new Error("APM manifest must be a mapping");
    const configuration = manifest as Record<string, unknown>;

    for (const field of ["scripts", "lifecycle"] as const) {
      if (
        field in configuration &&
        configuration[field] !== null &&
        stableJson(configuration[field]) !== stableJson({})
      )
        throw new Error("APM lifecycle scripts are outside the qualified WPM composition contract");
    }
    projectMcp(manifest, "codex");
    projectMcp(manifest, "claude");
    sourceInventory(this.source);
    const primitives = regularPath(this.source, join(this.source, ".apm"), "optional");
    if (existsSync(primitives)) {
      for (const entry of readdirSync(primitives))
        if (entry !== "instructions" && entry !== "skills")
          throw new Error(
            `unqualified APM primitive: ${entry}; only instructions and skills are supported`,
          );
      for (const file of inventory(primitives)) assertSourcePath(file.path);
    }
  }

  private command(args: string[]): ApmCommandResult {
    this.verifyTool();
    this.validateSource();
    for (const directory of [
      this.state,
      ...(
        [
          "APM_HOME",
          "APM_CACHE_DIR",
          "APM_TEMP_DIR",
          "HOME",
          "XDG_CONFIG_HOME",
          "XDG_CACHE_HOME",
          "APPDATA",
          "LOCALAPPDATA",
        ] as const
      )
        .map((key) => this.env()[key])
        .filter((value): value is string => value !== undefined),
    ]) {
      regularPath(this.workspace, directory, "optional");
      mkdirSync(directory, { recursive: true });
    }
    let result: ApmCommandResult;
    try {
      result = this.execute(this.tool.executable, args, {
        cwd: this.nativeSource ?? this.source,
        env: this.env(),
        timeout: 120_000,
      });
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      for (const key of this.tool.authEnv ?? [])
        if (process.env[key]) message = message.replaceAll(process.env[key] ?? "", "[redacted]");
      const diagnostics = {
        cause: sanitizedNativeCause(
          error,
          (this.tool.authEnv ?? []).flatMap((key) =>
            process.env[key] ? [process.env[key] ?? ""] : [],
          ),
        ),
      };
      throw new Error(message, diagnostics);
    }
    if (
      this.tool.distributionSha256 !== undefined &&
      this.distributionDigest() !== this.tool.distributionSha256
    )
      throw new Error("APM distribution changed during execution");
    return result;
  }

  private rejectCredentials(text: string): void {
    for (const name of this.tool.authEnv ?? [])
      if (process.env[name] && text.includes(process.env[name] ?? ""))
        throw new Error("APM result contains authentication material; refusing capture");
    if (/https?:\/\/[^\s/]+:[^\s/]+@/.test(text))
      throw new Error("credential-bearing URL in APM output");
  }

  private validateClosure(): unknown {
    const root = this.nativeSource ?? this.source;
    const manifests = [join(this.source, "apm.yml")];
    const nativeLock = parse(readFileSync(join(this.source, "apm.lock.yaml"), "utf8")) as {
      dependencies: {
        repo_url: string;
        local_path?: string;
        virtual_path?: string;
        package_type?: string;
      }[];
    };
    for (const dependency of nativeLock.dependencies) {
      let selected: string;
      if (dependency.local_path !== undefined) {
        const nativePath = regularPath(root, resolve(root, dependency.local_path), "directory");
        selected = regularPath(
          this.source,
          join(this.source, relative(root, nativePath)),
          "directory",
        );
      } else {
        selected = regularPath(
          root,
          join(
            root,
            "apm_modules",
            assertPortablePath(dependency.repo_url),
            ...(dependency.virtual_path ? [assertPortablePath(dependency.virtual_path)] : []),
          ),
          "optional",
        );
        if (!existsSync(selected)) continue; // Native install materializes pinned remote bytes; validate again before accepting its receipt.
      }
      const manifest = join(selected, "apm.yml");
      if (existsSync(manifest)) manifests.push(manifest);
      else if (
        dependency.package_type !== "claude_skill" ||
        !existsSync(join(selected, "SKILL.md"))
      )
        throw new Error("unsupported APM selected package type or missing manifest");
    }
    const mcp = new Map<string, unknown>();
    for (const path of manifests) {
      const manifest = parse(readFileSync(path, "utf8")) as {
        dependencies?: { mcp?: unknown[]; lsp?: unknown };
      };
      const primitives = join(path, "..", ".apm");
      if (existsSync(primitives))
        for (const name of readdirSync(
          regularPath(
            path.startsWith(`${this.source}/`) || path.startsWith(`${this.source}\\`)
              ? this.source
              : root,
            primitives,
            "directory",
          ),
        ))
          if (!["instructions", "skills"].includes(name))
            throw new Error(`unsupported APM closure primitive: ${name}`);
      // Lifecycle metadata is never executed; root declarations are rejected separately.
      projectMcp(
        { dependencies: { lsp: manifest.dependencies?.lsp, mcp: manifest.dependencies?.mcp } },
        "codex",
      );
      projectMcp(
        { dependencies: { lsp: manifest.dependencies?.lsp, mcp: manifest.dependencies?.mcp } },
        "claude",
      );
      for (const entry of manifest.dependencies?.mcp ?? []) {
        const declaration = entry as { name: string };
        const previous = mcp.get(declaration.name.toLowerCase());
        if (previous && stableJson(previous) !== stableJson(entry))
          throw new Error(`conflicting APM closure MCP name: ${declaration.name}`);
        mcp.set(declaration.name.toLowerCase(), entry);
      }
    }
    return {
      dependencies: {
        mcp: [...mcp.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([, entry]) => entry),
      },
    };
  }

  private resolution(): {
    sourceSha256: string;
    lockSha256: string;
    version: string;
    toolSha256: string;
    closureSha256?: string;
  } {
    const value = JSON.parse(
      readFileSync(
        regularPath(this.workspace, join(this.state, "resolution.json"), "file"),
        "utf8",
      ),
    ) as {
      sourceSha256: string;
      lockSha256: string;
      version: string;
      toolSha256: string;
      closureSha256?: string;
    };
    if (
      value.version !== APM_VERSION ||
      value.toolSha256 !== this.tool.sha256 ||
      value.sourceSha256 !== sha256(stableJson(sourceInventory(this.source))) ||
      value.lockSha256 !==
        sha256(readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")))
    )
      throw new Error("APM dependency lock is stale; run explicit lock/upgrade");
    if (value.closureSha256 !== undefined && !closureMatches(this.state, value.closureSha256))
      throw new Error("APM dependency closure changed; run explicit lock/upgrade");
    return value;
  }

  /** Resolve intentionally, preserve matching pins, or check without invoking a transport. */
  lock(options: { check?: boolean; upgrade?: boolean; offline?: boolean } = {}): unknown {
    if (options.check && options.upgrade) throw new Error("--check conflicts with --upgrade");
    const receiptPath = regularPath(
      this.workspace,
      join(this.state, "resolution.json"),
      "optional",
    );
    if (options.check || options.offline) {
      this.verifyToolBytes();
      this.resolution();
      return {
        backend: "apm",
        version: APM_VERSION,
        phase: "locked",
        checked: true,
        offline: options.offline ?? false,
        deployed: false,
      };
    }
    if (!options.upgrade && existsSync(receiptPath)) {
      try {
        this.resolution();
        return {
          backend: "apm",
          version: APM_VERSION,
          phase: "locked",
          preserved: true,
          deployed: false,
        };
      } catch {
        /* Explicit lock reconciles changed source. */
      }
    }
    this.verifyTool();
    this.initializeSource();
    this.validateSource();
    const sourceBefore = sha256(stableJson(sourceInventory(this.source)));
    const authoredLockPath = regularPath(
      this.source,
      join(this.source, "apm.lock.yaml"),
      "optional",
    );
    const lockBefore = existsSync(authoredLockPath) ? readFileSync(authoredLockPath) : undefined;
    this.nativeSource = stageApmSource(this.source, this.state);
    this.command(["lock", ...(options.upgrade ? ["--update"] : [])]);
    const nativeLock = readFileSync(
      regularPath(this.nativeSource, join(this.nativeSource, "apm.lock.yaml"), "file"),
    );
    this.rejectCredentials(nativeLock.toString("utf8"));
    resolvedGraph(nativeLock.toString("utf8"));
    const lockCurrent = existsSync(authoredLockPath) ? readFileSync(authoredLockPath) : undefined;
    if (
      sourceBefore !== sha256(stableJson(sourceInventory(this.source))) ||
      (lockBefore === undefined
        ? lockCurrent !== undefined
        : lockCurrent === undefined || !lockBefore.equals(lockCurrent))
    )
      throw new Error(
        "APM authored source or lock changed during resolution; prior evidence preserved",
      );
    writeFileSync(
      regularPath(this.source, join(this.source, "apm.lock.yaml"), "optional"),
      nativeLock,
    );
    const path = regularPath(this.source, join(this.source, "apm.lock.yaml"), "file");
    resolvedGraph(readFileSync(path, "utf8"));
    const evidence = {
      version: APM_VERSION,
      toolSha256: this.tool.sha256,
      sourceSha256: sha256(stableJson(sourceInventory(this.source))),
      lockSha256: sha256(readFileSync(path)),
    };
    mkdirSync(this.state, { recursive: true });
    writeFileSync(receiptPath, stableJson(evidence));
    return {
      backend: "apm",
      version: APM_VERSION,
      phase: "locked",
      lockSha256: evidence.lockSha256,
      deployed: false,
    };
  }

  private cachePath(target: ApmTarget): string {
    const identity = {
      version: APM_VERSION,
      tool: this.tool.sha256,
      distribution: this.distributionDigest(),
      target,
      source: sha256(stableJson(sourceInventory(this.source))),
      lock: sha256(
        readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")),
      ),
    };
    return regularPath(
      this.workspace,
      join(this.state, "prepared-cache", `${sha256(stableJson(identity))}.json`),
      "optional",
    );
  }

  private replay(target: ApmTarget): unknown {
    this.verifyToolBytes();
    const resolution = this.resolution();
    const path = this.cachePath(target);
    if (!existsSync(path))
      throw new Error("APM offline cache miss; prepare this exact target online first");
    const cacheBytes = readFileSync(path, "utf8");
    const index = JSON.parse(
      readFileSync(
        regularPath(this.workspace, join(this.state, "cache-index.json"), "file"),
        "utf8",
      ),
    ) as Record<string, string>;
    if (index[sha256(path.split(/[\\/]/).pop() ?? "")] !== sha256(cacheBytes))
      throw new Error("APM offline cache digest mismatch");
    const cached = JSON.parse(cacheBytes) as {
      receipt: PhaseReceipt;
      files: { path: string; bytes: string }[];
    };
    const destination = regularPath(
      this.workspace,
      join(this.state, "targets", target),
      "optional",
    );
    const receiptPath = regularPath(this.workspace, join(this.state, `${target}.json`), "optional");
    assertPortableTree(cached.files.map((file) => ({ path: file.path, kind: "file" as const })));
    for (const file of cached.files) {
      if (nativeEntryKind(file.path) === "forbidden")
        throw new Error("unsupported generated APM target artifact in cache");
      const bytes = Buffer.from(file.bytes, "base64");
      if (
        !cached.receipt.files.some(
          (entry) => entry.path === file.path && entry.sha256 === sha256(bytes),
        )
      )
        throw new Error("APM offline cache integrity mismatch");
    }
    if (cached.files.length !== cached.receipt.files.length)
      throw new Error("incomplete APM offline cache");
    if (
      cached.receipt.closureSha256 !== resolution.closureSha256 ||
      cached.receipt.phase !== "compiled" ||
      !closureMatches(this.state, cached.receipt.closureSha256) ||
      cached.receipt.target !== target ||
      cached.receipt.version !== APM_VERSION ||
      cached.receipt.toolSha256 !== this.tool.sha256 ||
      cached.receipt.toolDistributionSha256 !== this.distributionDigest() ||
      cached.receipt.sourceSha256 !== sha256(stableJson(sourceInventory(this.source))) ||
      cached.receipt.lockSha256 !== sha256(readFileSync(join(this.source, "apm.lock.yaml")))
    )
      throw new Error("APM offline cache binding mismatch");
    const pendingPath = regularPath(
      this.workspace,
      join(this.state, `${target}-replay.json`),
      "optional",
    );
    validateApmMcpFiles(
      cached.files.map((file) => ({ path: file.path, bytes: Buffer.from(file.bytes, "base64") })),
      target,
    );
    const after = cached.receipt.files;
    const afterDirectories = cached.receipt.directories;
    if (
      !Array.isArray(afterDirectories) ||
      afterDirectories.some((path) => typeof path !== "string")
    )
      throw new Error("invalid offline directory inventory");
    validateTargetDirectories(after, afterDirectories);
    assertPortableTree([
      ...afterDirectories.map((path) => ({ path, kind: "directory" as const })),
      ...after.map((file) => ({ path: file.path, kind: "file" as const })),
    ]);
    if (existsSync(pendingPath)) {
      const pending = JSON.parse(readFileSync(pendingPath, "utf8")) as {
        target: string;
        cacheSha256: string;
        before: InventoryFile[];
        beforeDirectories: string[];
        after: InventoryFile[];
      };
      if (
        pending.target !== target ||
        pending.cacheSha256 !== sha256(cacheBytes) ||
        stableJson(pending.after) !== stableJson(after) ||
        !Array.isArray(pending.before)
      )
        throw new Error("offline replay request differs from pending operation");
      assertPortableTree(
        pending.before.map((file) => ({ path: file.path, kind: "file" as const })),
      );
      for (const path of targetDirectories(destination))
        if (![...(pending.beforeDirectories ?? []), ...afterDirectories].includes(path))
          throw new Error("offline replay has foreign partial directories");
      for (const actual of inventory(destination))
        if (
          ![...pending.before, ...after].some(
            (expected) => expected.path === actual.path && expected.sha256 === actual.sha256,
          )
        )
          throw new Error("offline replay has foreign or changed partial files");
    } else {
      if (existsSync(destination)) {
        if (!existsSync(receiptPath)) throw new Error("offline target has no ownership receipt");
        this.assertFresh(readReceipt(receiptPath), target, destination);
      }
      writeFileSync(
        pendingPath,
        stableJson({
          target,
          cacheSha256: sha256(cacheBytes),
          before: inventory(destination),
          beforeDirectories: targetDirectories(destination),
          after,
        }),
        { flag: "wx" },
      );
    }
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    mkdirSync(destination, { recursive: true });
    for (const directory of afterDirectories)
      mkdirSync(regularPath(destination, join(destination, directory), "optional"), {
        recursive: true,
      });
    for (const file of cached.files) {
      const absolute = regularPath(destination, join(destination, file.path), "optional");
      mkdirSync(join(absolute, ".."), { recursive: true });
      writeFileSync(absolute, Buffer.from(file.bytes, "base64"), { flag: "wx" });
    }
    writeFileSync(receiptPath, stableJson(cached.receipt));
    this.assertFresh(readReceipt(receiptPath), target, destination);
    rmSync(pendingPath);
    return {
      backend: "apm",
      phase: "compiled",
      target,
      offline: true,
      cacheReplayed: true,
      agentLaunched: false,
    };
  }

  /** Check exact prepared bytes without executing APM or connecting to services. */
  check(target: ApmTarget): unknown {
    this.verifyToolBytes();
    if (
      existsSync(regularPath(this.workspace, join(this.state, `${target}-replay.json`), "optional"))
    )
      throw new Error("resume interrupted offline replay first");
    const receipt = readReceipt(
      regularPath(this.workspace, join(this.state, `${target}.json`), "file"),
    );
    if (receipt.phase !== "compiled") throw new Error("APM target needs compile");
    this.assertFresh(
      receipt,
      target,
      regularPath(this.workspace, join(this.state, "targets", target), "directory"),
    );
    return {
      checked: true,
      target,
      phase: receipt.phase,
      agentLaunched: false,
      servicesConnected: false,
    };
  }

  /** Materialize primitives into one WPM-owned target project from the explicit native lock. */
  install(target: ApmTarget, offline = false): unknown {
    if (offline) return this.replay(target);
    if (target !== "codex" && target !== "claude") throw new Error("unsupported APM target");
    this.verifyTool();
    this.validateSource();
    for (const previousTarget of ["codex", "claude"] as const) {
      const path = regularPath(
        this.workspace,
        join(this.state, `${previousTarget}.json`),
        "optional",
      );
      if (existsSync(path)) {
        const previous = readReceipt(path);
        if (
          previous.phase === "compiled" &&
          previous.lockSha256 === sha256(readFileSync(join(this.source, "apm.lock.yaml"))) &&
          !closureMatches(this.state, previous.closureSha256)
        )
          throw new Error("APM dependency closure changed; run explicit lock/upgrade");
      }
    }
    this.resolution();
    this.nativeSource = stageApmSource(this.source, this.state);
    const expectedLock = readFileSync(join(this.source, "apm.lock.yaml"));
    writeFileSync(
      regularPath(this.nativeSource, join(this.nativeSource, "apm.lock.yaml"), "optional"),
      expectedLock,
    );
    this.validateClosure();
    const lockPath = regularPath(this.source, join(this.source, "apm.lock.yaml"), "file");
    const lock = readFileSync(lockPath, "utf8");
    const graph = resolvedGraph(lock);
    const sourceBefore = sha256(stableJson(sourceInventory(this.source)));
    const destination = regularPath(
      this.workspace,
      join(this.state, "targets", target),
      "optional",
    );
    const receiptPath = regularPath(this.workspace, join(this.state, `${target}.json`), "optional");
    let previous: PhaseReceipt | undefined;
    if (existsSync(destination)) {
      if (!existsSync(receiptPath))
        throw new Error("APM target directory has no ownership receipt; preserve and inspect it");
      previous = readReceipt(receiptPath);
      if (
        stableJson(targetDirectories(destination)) !== stableJson(previous.directories) ||
        stableJson(inventory(destination)) !== stableJson(previous.files)
      )
        throw new Error("APM target has authored or unrecorded changes; refusing overwrite");
    }
    const frozen =
      previous !== undefined &&
      previous.phase !== "failed" &&
      previous.phase !== "installing" &&
      previous.lockSha256 === sha256(lock);
    mkdirSync(destination, { recursive: true });
    if (!frozen)
      writeFileSync(
        regularPath(this.workspace, join(destination, "apm.lock.yaml"), "optional"),
        lock,
      );
    const prepared = this.receipt(target, "installing", destination);
    writeFileSync(receiptPath, stableJson(prepared));
    try {
      // A native lock intentionally has no deployment ledger. Bootstrap it with ordinary install;
      // subsequent identical installs replay its real recorded deployment through --frozen.
      this.command([
        "install",
        ...(frozen ? ["--frozen"] : ["--no-frozen"]),
        "--only",
        "apm",
        "--target",
        target,
        "--root",
        destination,
        "--no-trust-bin",
      ]);
      if (
        sourceBefore !== sha256(stableJson(sourceInventory(this.source))) ||
        sha256(lock) !== sha256(readFileSync(lockPath))
      )
        throw new Error("APM source changed during installation");
      if (
        resolvedGraph(
          readFileSync(
            regularPath(destination, join(destination, "apm.lock.yaml"), "file"),
            "utf8",
          ),
        ) !== graph
      )
        throw new Error(
          "APM installation changed the resolved dependency pins; refresh the native lock explicitly",
        );
      this.validateClosure();
      const resolutionPath = regularPath(
        this.workspace,
        join(this.state, "resolution.json"),
        "file",
      );
      const resolution = JSON.parse(readFileSync(resolutionPath, "utf8")) as Record<
        string,
        unknown
      >;
      if (
        resolution.closureSha256 !== undefined &&
        resolution.closureSha256 !== closureDigest(this.state)
      )
        throw new Error("APM install changed the verified dependency closure");
      writeFileSync(
        resolutionPath,
        stableJson({ ...resolution, closureSha256: closureDigest(this.state) }),
      );
      const receipt = this.receipt(target, "installed", destination);
      writeFileSync(receiptPath, stableJson(receipt));
      return {
        backend: "apm",
        version: APM_VERSION,
        phase: "installed",
        target,
        frozenReplay: frozen,
        servicesConfigured: false,
        agentLaunched: false,
      };
    } catch (error) {
      writeFileSync(
        receiptPath,
        stableJson({
          ...prepared,
          phase: "failed",
          files: inventory(destination),
          directories: targetDirectories(destination),
        }),
      );
      throw new Error(
        `APM install failed; owned partial target is preserved for explicit retry: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /** Compile instruction context only, into the already installed owned project. */
  compile(target: ApmTarget, offline = false): unknown {
    if (offline) return this.check(target);
    if (target !== "codex" && target !== "claude") throw new Error("unsupported APM target");
    const destination = regularPath(
      this.workspace,
      join(this.state, "targets", target),
      "directory",
    );
    const receiptPath = regularPath(this.workspace, join(this.state, `${target}.json`), "file");
    const previous = readReceipt(receiptPath);
    if (previous.phase !== "installed" && previous.phase !== "compiled")
      throw new Error("APM install did not finish; repeat explicit install before compile");
    this.assertFresh(previous, target, destination);
    if (!closureMatches(this.state, previous.closureSha256, true))
      throw new Error("APM dependency closure is missing or changed; run install first");
    this.nativeSource = stageApmSource(this.source, this.state);
    try {
      this.command(["compile", "--target", target, "--root", destination, "--no-links"]);
      const mcpManifest = this.validateClosure();
      const projection = projectMcp(mcpManifest, target);
      const projectedMcp = projection.files.length
        ? [{ path: "MCP.json", contents: stableJson(mcpManifest) }, ...projection.files]
        : [];
      const managedMcpPaths = ["MCP.json", target === "codex" ? ".codex/config.toml" : ".mcp.json"];
      // Preflight every replacement/removal before changing either file. An installed receipt
      // still owns the previous projection, including partial effects from an explicit retry.
      for (const name of managedMcpPaths) {
        const path = regularPath(destination, join(destination, name), "optional");
        if (!existsSync(path)) continue;
        regularPath(destination, path, "file");
        const owned = previous.files.find((entry) => entry.path === name);
        if (!owned || owned.sha256 !== sha256(readFileSync(path)))
          throw new Error(`APM output conflicts with WPM MCP owner: ${name}`);
      }
      for (const name of managedMcpPaths) {
        const path = regularPath(destination, join(destination, name), "optional");
        if (!projectedMcp.some((file) => file.path === name) && existsSync(path)) rmSync(path);
      }
      for (const file of projectedMcp) {
        const path = regularPath(destination, join(destination, file.path), "optional");
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, file.contents, { flag: existsSync(path) ? "w" : "wx" });
      }
      const receipt = { ...this.receipt(target, "compiled", destination), support: projection };
      if (
        receipt.sourceSha256 !== previous.sourceSha256 ||
        receipt.lockSha256 !== previous.lockSha256
      )
        throw new Error("APM source or lock changed during compilation");
      validateTargetDirectories(receipt.files, receipt.directories ?? []);
      const outputs = releaseFiles(destination, receipt.files);
      validateApmMcpFiles(outputs, target);
      for (const file of outputs) this.rejectCredentials(file.bytes.toString("utf8"));
      if (!outputs.length)
        throw new Error("APM compile produced no supported native context or skills");
      writeFileSync(receiptPath, stableJson(receipt));
      writeFileSync(
        regularPath(this.workspace, join(this.state, `${target}-support.json`), "optional"),
        stableJson(projection),
      );
      const cache = this.cachePath(target);
      mkdirSync(join(cache, ".."), { recursive: true });
      const cacheBytes = stableJson({
        receipt,
        files: receipt.files.map((file) => ({
          path: file.path,
          bytes: readFileSync(
            regularPath(destination, join(destination, file.path), "file"),
          ).toString("base64"),
        })),
      });
      writeFileSync(cache, cacheBytes);
      const indexPath = regularPath(
        this.workspace,
        join(this.state, "cache-index.json"),
        "optional",
      );
      const index = existsSync(indexPath)
        ? (JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, string>)
        : {};
      index[sha256(cache.split(/[\\/]/).pop() ?? "")] = sha256(cacheBytes);
      writeFileSync(indexPath, stableJson(index));
      return {
        backend: "apm",
        version: APM_VERSION,
        phase: "compiled",
        target,
        sourceSha256: receipt.sourceSha256,
        lockSha256: receipt.lockSha256,
        generatedSha256: sha256(stableJson(receipt.files)),
        files: outputs.map((file) => file.path),
        agentLaunched: false,
      };
    } catch (error) {
      writeFileSync(
        receiptPath,
        stableJson({
          ...previous,
          phase: "failed",
          files: inventory(destination),
          directories: targetDirectories(destination),
        }),
      );
      throw error;
    }
  }

  private receipt(
    target: ApmTarget,
    phase: PhaseReceipt["phase"],
    destination: string,
  ): PhaseReceipt {
    return {
      schemaVersion: 1,
      version: APM_VERSION,
      toolSha256: this.tool.sha256,
      toolDistributionSha256: this.distributionDigest(),
      closureSha256: closureDigest(this.state),
      sourceSha256: sha256(stableJson(sourceInventory(this.source))),
      lockSha256: sha256(
        readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")),
      ),
      target,
      phase,
      files: inventory(destination),
      directories: targetDirectories(destination),
    };
  }
  private assertFresh(receipt: PhaseReceipt, target: ApmTarget, destination: string): void {
    if (
      receipt.target !== target ||
      receipt.version !== APM_VERSION ||
      !closureMatches(this.state, receipt.closureSha256) ||
      receipt.toolSha256 !== this.tool.sha256 ||
      receipt.toolDistributionSha256 !== this.distributionDigest() ||
      receipt.sourceSha256 !== sha256(stableJson(sourceInventory(this.source))) ||
      receipt.lockSha256 !==
        sha256(
          readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")),
        ) ||
      stableJson(receipt.directories) !== stableJson(targetDirectories(destination)) ||
      stableJson(receipt.files) !== stableJson(inventory(destination))
    )
      throw new Error("APM composition is stale or changed; repeat explicit install and compile");
  }
}

function nativeEntryKind(path: string): "release" | "state" | "forbidden" {
  if (path.split("/").some((part) => part.toLowerCase().startsWith("wpm-repo-")))
    return "forbidden";
  if (
    ["AGENTS.md", "CLAUDE.md", ".mcp.json", ".codex/config.toml", "MCP.json"].includes(path) ||
    /^(\.agents\/(skills|rules)|\.claude\/(skills|rules))\//.test(path)
  )
    return "release";
  if (
    ["apm.lock.yaml", ".gitignore"].includes(path) ||
    ["apm_modules/", ".apm/", ".apm-local/"].some((prefix) => path.startsWith(prefix))
  )
    return "state";
  return "forbidden";
}

interface PreparedFile {
  path: string;
  bytes: Buffer;
}
/** Verify metadata-bound native MCP configuration without invoking a client. */
export function validateApmMcpFiles(
  files: readonly { path: string; bytes: Buffer }[],
  target: ApmTarget,
): void {
  const metadata = files.find((file) => file.path === "MCP.json");
  const configs = files.filter((file) => [".mcp.json", ".codex/config.toml"].includes(file.path));
  if (!metadata) {
    if (configs.length)
      throw new Error("native MCP configuration lacks canonical declaration metadata");
    return;
  }
  const manifest: unknown = JSON.parse(metadata.bytes.toString("utf8"));
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    !("dependencies" in manifest) ||
    manifest.dependencies === null ||
    typeof manifest.dependencies !== "object" ||
    Array.isArray(manifest.dependencies) ||
    !("mcp" in manifest.dependencies) ||
    !Array.isArray(manifest.dependencies.mcp)
  )
    throw new Error("invalid canonical MCP metadata");
  const canonical = { dependencies: { mcp: manifest.dependencies.mcp } };
  if (!metadata.bytes.equals(Buffer.from(stableJson(canonical))))
    throw new Error("MCP metadata must contain only canonical declaration bytes");
  projectMcp(manifest, "codex");
  projectMcp(manifest, "claude");
  const projection = projectMcp(manifest, target);
  if (configs.length !== projection.files.length)
    throw new Error("native MCP configuration inventory differs");
  for (const expected of projection.files)
    if (
      !configs.some(
        (file) => file.path === expected.path && file.bytes.equals(Buffer.from(expected.contents)),
      )
    )
      throw new Error("native MCP configuration differs from safe projection");
}

function releaseFiles(directory: string, expected: readonly InventoryFile[]): PreparedFile[] {
  const files = inventory(directory);
  if (stableJson(files) !== stableJson(expected))
    throw new Error("APM generated inventory changed during capture");
  const accepted = files.filter((file) => nativeEntryKind(file.path) === "release");
  for (const file of files)
    if (nativeEntryKind(file.path) === "forbidden")
      throw new Error(`unsupported generated APM target artifact: ${file.path}`);
  for (const file of accepted) {
    if (file.path.split("/").some((part) => part.toLowerCase().startsWith("wpm-repo-")))
      throw new Error("repository developer skill cannot enter an APM recipient artifact");
    const segments = file.path.split("/");
    if (segments[0] === ".agents" || segments[0] === ".claude") segments.shift();
    if (![".mcp.json", ".codex/config.toml"].includes(file.path))
      assertSourcePath(segments.join("/"));
  }
  const captured = accepted.map((file) => {
    const path = regularPath(directory, join(directory, file.path), "file");
    const before = lstatSync(path, { bigint: true });
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = fstatSync(descriptor, { bigint: true });
      if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino)
        throw new Error("APM generated file identity changed during capture");
      const bytes = readFileSync(descriptor);
      regularPath(directory, path, "file");
      const after = lstatSync(path, { bigint: true });
      if (after.dev !== opened.dev || after.ino !== opened.ino || sha256(bytes) !== file.sha256)
        throw new Error("APM generated file bytes changed during capture");
      return { path: file.path, bytes };
    } finally {
      closeSync(descriptor);
    }
  });
  if (stableJson(inventory(directory)) !== stableJson(expected))
    throw new Error("APM generated inventory changed during capture");
  return captured;
}

function capturePreparedTarget(
  root: string,
  state: string,
  sourceRoot: string,
  target: ApmTarget,
): PreparedFile[] {
  if (existsSync(regularPath(root, join(state, `${target}-replay.json`), "optional")))
    throw new Error("resume interrupted offline replay before capture");
  const receipt = readReceipt(regularPath(root, join(state, `${target}.json`), "file"));
  const directory = regularPath(root, join(state, "targets", target), "directory");
  if (
    receipt.phase !== "compiled" ||
    receipt.target !== target ||
    !closureMatches(state, receipt.closureSha256) ||
    receipt.sourceSha256 !== sha256(stableJson(sourceInventory(sourceRoot))) ||
    receipt.lockSha256 !==
      sha256(readFileSync(regularPath(sourceRoot, join(sourceRoot, "apm.lock.yaml"), "file"))) ||
    stableJson(receipt.directories) !== stableJson(targetDirectories(directory)) ||
    stableJson(receipt.files) !== stableJson(inventory(directory))
  )
    throw new Error(`APM setup ${target} is stale or changed; repeat explicit install and compile`);
  const files = releaseFiles(directory, receipt.files);
  validateApmMcpFiles(files, target);
  if (!files.length) throw new Error("APM composed target is empty");
  return files;
}

/** Inspect only a selected, fresh target; never infer one target from another. */
export function preparedApmSupport(
  workspace: string,
  name: string,
  source: string,
  target: ApmTarget,
): ReturnType<typeof projectMcp> {
  assertSlug(name);
  const state = regularPath(workspace, join(workspace, ".wpm-apm", name), "directory");
  const sourceRoot = regularPath(
    workspace,
    apmReference(source) ? join(state, "source") : join(workspace, assertSourcePath(source)),
    "directory",
  );
  const files = capturePreparedTarget(workspace, state, sourceRoot, target);
  const metadata = files.find((file) => file.path === "MCP.json");
  return projectMcp(metadata ? JSON.parse(metadata.bytes.toString("utf8")) : {}, target);
}

/** Read only receipt-bound native outputs; building never implicitly calls APM or launches an agent. */
export function preparedApmSetup(workspace: string, name: string, source: string): PreparedFile[] {
  assertSlug(name);
  const root = realpathSync.native(regularPath(workspace, workspace, "directory"));
  const sourceRoot = regularPath(
    root,
    apmReference(source)
      ? join(root, ".wpm-apm", name, "source")
      : join(root, assertSourcePath(source)),
    "directory",
  );
  const state = regularPath(root, join(root, ".wpm-apm", name), "optional");
  if (!existsSync(state))
    throw new Error(
      `APM setup ${name} needs explicit pinned lock, install and compile before building`,
    );
  const prepared: PreparedFile[] = [];
  const targets: ApmTarget[] = [];
  for (const target of ["codex", "claude"] as const) {
    const receiptPath = regularPath(root, join(state, `${target}.json`), "optional");
    if (!existsSync(receiptPath)) continue;
    const files = capturePreparedTarget(root, state, sourceRoot, target);
    targets.push(target);
    prepared.push(...files.map((file) => ({ ...file, path: `targets/${target}/${file.path}` })));
  }
  if (!targets.length)
    throw new Error(
      `APM setup ${name} needs explicit pinned lock, install and compile before building`,
    );
  const worker = join(sourceRoot, "WORKER.md");
  const authored = existsSync(worker)
    ? readFileSync(regularPath(sourceRoot, worker, "file"), "utf8")
    : "";
  prepared.push({
    path: "WORKER.md",
    bytes: Buffer.from(
      `${authored}\n# Composed worker setup: ${name}\n\nUse your existing agent. Prepared native target projects: ${targets.join(", ")}. For the selected target, inspect targets/<target>/ and its root context or native rules/skills. Opening the prepared project or loading context is an explicit host action; building this package has not loaded instructions, authenticated a connection or launched an agent. Apply this setup only to operations that select it.\n`,
    ),
  });
  assertPortableTree(prepared.map(({ path }) => ({ path, kind: "file" })));
  return prepared;
}
