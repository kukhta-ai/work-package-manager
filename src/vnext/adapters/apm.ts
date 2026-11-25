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
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { execaSync } from "execa";
import { parse } from "yaml";
import { assertPortablePath, assertSlug, assertSourcePath, stableJson } from "../core/model.js";
import { assertPortableTree } from "./portable-tree.js";

/** This adapter qualifies one exact external CLI version; plain packages never instantiate it. */
const APM_VERSION = "0.35.0";
export type ApmTarget = "codex" | "claude";
export interface ApmTool {
  executable: string;
  sha256: string;
}
interface InventoryFile {
  path: string;
  sha256: string;
}
interface PhaseReceipt {
  schemaVersion: 1;
  version: string;
  toolSha256: string;
  sourceSha256: string;
  lockSha256: string;
  target: ApmTarget;
  phase: "installing" | "installed" | "compiled" | "failed";
  files: InventoryFile[];
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
  execaSync(executable, args, { ...options, stdin: "ignore", reject: true });

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

function sourceInventory(source: string): InventoryFile[] {
  // Bind authored companion/local dependency content as well as primitives and downloaded module bytes.
  return inventory(source).filter(
    (file) => file.path !== "apm.lock.yaml" && !file.path.split("/").includes(".git"),
  );
}

function readReceipt(path: string): PhaseReceipt {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
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
    value.lockfile_version !== "1" ||
    !("apm_version" in value) ||
    value.apm_version !== APM_VERSION ||
    !("dependencies" in value) ||
    !Array.isArray(value.dependencies)
  )
    throw new Error("unsupported native APM lock format");
  const result: Record<string, unknown> = { ...value };
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

/** Explicit optional integration. Lock, install and compile are distinct user actions. */
export class ApmBackend {
  private readonly workspace: string;
  private readonly source: string;
  private readonly state: string;
  constructor(
    workspace: string,
    readonly name: string,
    source: string,
    private readonly tool: ApmTool,
    private readonly execute: ApmCommand = run,
  ) {
    assertSlug(name);
    this.workspace = realpathSync.native(regularPath(workspace, workspace, "directory"));
    this.source = regularPath(
      this.workspace,
      join(this.workspace, assertSourcePath(source)),
      "directory",
    );
    this.state = regularPath(this.workspace, join(this.workspace, ".wpm-apm", name), "optional");
  }

  private env(): Record<string, string> {
    return {
      APM_HOME: join(this.state, "home"),
      APM_CACHE_DIR: join(this.state, "cache"),
      APM_TEMP_DIR: join(this.state, "tmp"),
      CI: "1",
      APM_PROGRESS: "quiet",
      // APM 0.35.0's lifecycle firing boundary honors this for org, user and project tiers.
      // --only apm and --no-trust-bin do not suppress those lifecycle scripts.
      APM_NO_SCRIPTS: "1",
    };
  }

  private verifyTool(): void {
    if (!isAbsolute(this.tool.executable) || !/^[a-f0-9]{64}$/.test(this.tool.sha256))
      throw new Error("APM requires an explicit absolute executable and SHA-256 pin");
    const executable = lstatSync(this.tool.executable, { throwIfNoEntry: false });
    if (!executable?.isFile() || executable.isSymbolicLink())
      throw new Error("APM executable is missing or is not a regular file");
    if (sha256(readFileSync(this.tool.executable)) !== this.tool.sha256)
      throw new Error("APM executable digest does not match the approved pin");
    const result = this.execute(this.tool.executable, ["--version"], {
      cwd: this.source,
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
      ...Object.values(this.env()).filter((value) => isAbsolute(value)),
    ]) {
      regularPath(this.workspace, directory, "optional");
      mkdirSync(directory, { recursive: true });
    }
    return this.execute(this.tool.executable, args, {
      cwd: this.source,
      env: this.env(),
      timeout: 120_000,
    });
  }

  /** Resolve a native lock only; never deploy into a target project. */
  lock(): unknown {
    this.command(["lock"]);
    const path = regularPath(this.source, join(this.source, "apm.lock.yaml"), "file");
    return {
      backend: "apm",
      version: APM_VERSION,
      phase: "locked",
      lockSha256: sha256(readFileSync(path)),
      deployed: false,
    };
  }

  /** Materialize primitives into one WPM-owned target project from the explicit native lock. */
  install(target: ApmTarget): unknown {
    if (target !== "codex" && target !== "claude") throw new Error("unsupported APM target");
    this.verifyTool();
    this.validateSource();
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
      if (stableJson(inventory(destination)) !== stableJson(previous.files))
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
        ...(frozen ? ["--frozen"] : []),
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
        stableJson({ ...prepared, phase: "failed", files: inventory(destination) }),
      );
      throw new Error(
        `APM install failed; owned partial target is preserved for explicit retry: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /** Compile instruction context only, into the already installed owned project. */
  compile(target: ApmTarget): unknown {
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
    this.command(["compile", "--target", target, "--root", destination, "--no-links"]);
    const receipt = this.receipt(target, "compiled", destination);
    if (
      receipt.sourceSha256 !== previous.sourceSha256 ||
      receipt.lockSha256 !== previous.lockSha256
    )
      throw new Error("APM source or lock changed during compilation");
    const outputs = releaseFiles(destination, receipt.files);
    if (!outputs.length)
      throw new Error("APM compile produced no supported native context or skills");
    writeFileSync(receiptPath, stableJson(receipt));
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
      sourceSha256: sha256(stableJson(sourceInventory(this.source))),
      lockSha256: sha256(
        readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")),
      ),
      target,
      phase,
      files: inventory(destination),
    };
  }
  private assertFresh(receipt: PhaseReceipt, target: ApmTarget, destination: string): void {
    if (
      receipt.target !== target ||
      receipt.version !== APM_VERSION ||
      receipt.toolSha256 !== this.tool.sha256 ||
      receipt.sourceSha256 !== sha256(stableJson(sourceInventory(this.source))) ||
      receipt.lockSha256 !==
        sha256(
          readFileSync(regularPath(this.source, join(this.source, "apm.lock.yaml"), "file")),
        ) ||
      stableJson(receipt.files) !== stableJson(inventory(destination))
    )
      throw new Error("APM composition is stale or changed; repeat explicit install and compile");
  }
}

interface PreparedFile {
  path: string;
  bytes: Buffer;
}
function releaseFiles(directory: string, expected: readonly InventoryFile[]): PreparedFile[] {
  const files = inventory(directory);
  if (stableJson(files) !== stableJson(expected))
    throw new Error("APM generated inventory changed during capture");
  const accepted = files.filter(
    (file) =>
      file.path === "AGENTS.md" ||
      file.path === "CLAUDE.md" ||
      /^(\.agents\/(skills|rules)|\.claude\/(skills|rules))\//.test(file.path),
  );
  for (const file of files) {
    if (
      !accepted.includes(file) &&
      !["apm.lock.yaml", ".gitignore"].includes(file.path) &&
      !file.path.startsWith("apm_modules/") &&
      !file.path.startsWith(".apm/") &&
      !file.path.startsWith(".apm-local/")
    )
      throw new Error(`unsupported generated APM target artifact: ${file.path}`);
  }
  for (const file of accepted) {
    if (file.path.split("/").some((part) => part.toLowerCase().startsWith("wpm-repo-")))
      throw new Error("repository developer skill cannot enter an APM recipient artifact");
    const segments = file.path.split("/");
    if (segments[0] === ".agents" || segments[0] === ".claude") segments.shift();
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

/** Read only receipt-bound native outputs; building never implicitly calls APM or launches an agent. */
export function preparedApmSetup(workspace: string, name: string, source: string): PreparedFile[] {
  assertSlug(name);
  const root = realpathSync.native(regularPath(workspace, workspace, "directory"));
  const sourceRoot = regularPath(root, join(root, assertSourcePath(source)), "directory");
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
    const receipt = readReceipt(receiptPath);
    const directory = regularPath(root, join(state, "targets", target), "directory");
    if (
      receipt.phase !== "compiled" ||
      receipt.target !== target ||
      receipt.sourceSha256 !== sha256(stableJson(sourceInventory(sourceRoot))) ||
      receipt.lockSha256 !==
        sha256(readFileSync(regularPath(sourceRoot, join(sourceRoot, "apm.lock.yaml"), "file"))) ||
      stableJson(receipt.files) !== stableJson(inventory(directory))
    )
      throw new Error(
        `APM setup ${name}/${target} is stale or changed; repeat explicit install and compile`,
      );
    const files = releaseFiles(directory, receipt.files);
    if (!files.length) throw new Error("APM composed target is empty");
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
