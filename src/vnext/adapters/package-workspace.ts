import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, win32 } from "node:path";
import { execaSync } from "execa";
import { valid } from "semver";
import { parse, parseDocument, stringify } from "yaml";
import { editAuthoringSourceText, nextVersion } from "../core/authoring.js";
import {
  type DependencyDeclaration,
  type DependencyKind,
  dependencyKinds,
  matchesPackageVersion,
  type PackageCandidate,
  type PackageCatalog,
  type PackageGraph,
  type PackageRecord,
  resolvePackageGraph,
  runtimeGraph,
  validateDependencies,
} from "../core/dependencies.js";
import {
  assertPortablePath,
  assertSlug,
  assertSourcePath,
  emptyPackage,
  type PackageSource,
  parsePackage,
  stableJson,
} from "../core/model.js";
import { validateApmMcpFiles } from "./apm.js";
import {
  assertArchiveSizes,
  contentDigest,
  hash,
  type PackageFile,
  readPackageArchive,
} from "./package-archive.js";
import { validateReleaseEnvelope } from "./release-artifact.js";
import { createDeterministicTarball, VnextWorkspace } from "./workspace.js";

interface WorkspaceDeclaration {
  schemaVersion: 1;
  packages: string[];
}
interface Bundle {
  schemaVersion: 2;
  graph: PackageGraph;
  packages: Record<string, { inventory: { path: string; sha256: string }[] }>;
}
interface PendingEdit {
  schemaVersion: 1;
  request: string;
  before: string;
  after: string;
  lockBefore: string | null;
  lockAfter: string | null;
}
const graphLock = "wpm.dependencies.lock.json";
const pendingPath = ".wpm-pending-dependencies.json";
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Archive source locators are portable references inside the workspace, never host paths. */
function assertArchiveReference(source: string): void {
  const path = source.slice(5);
  if (win32.parse(path).root || path.includes("\\"))
    throw new Error("archive sources require portable relative paths");
}
function packageInventory(directory: string): Record<string, string> {
  const io = new VnextWorkspace(directory);
  const result = new Map<string, string>();
  const visit = (prefix: string): void => {
    for (const name of readdirSync(prefix ? io.pathForGraph(prefix) : directory)) {
      const path = prefix ? `${prefix}/${name}` : name;
      const absolute = io.pathForGraph(path);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        result.set(path, "directory");
        visit(path);
      } else if (stat.isFile()) result.set(path, hash(io.readForGraph(path)));
      else throw new Error("invalid created source inventory");
    }
  };
  visit("");
  return Object.fromEntries(result);
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing package graph entry");
  return value;
}
function json(text: string): unknown {
  const value: unknown = JSON.parse(text);
  if (parseDocument(text, { uniqueKeys: true }).errors.length)
    throw new Error("duplicate contract JSON fields");
  return value;
}

/** Workspace discovery never guesses a package among several registered versions. */
export class PackageWorkspace {
  readonly directory: string;
  private readonly io: VnextWorkspace;
  /** Discover the nearest explicit workspace, falling back to standalone package context. */
  constructor(root: string) {
    let current = resolve(root);
    while (!existsSync(join(current, "workspace.yml")) && dirname(current) !== current)
      current = dirname(current);
    this.directory = existsSync(join(current, "workspace.yml")) ? current : resolve(root);
    this.io = new VnextWorkspace(this.directory);
  }
  /** Create an empty registration catalog without configuring any agent. */
  init(dryRun = false) {
    if (existsSync(join(this.directory, "workspace.yml")))
      throw new Error("workspace already exists");
    const source: WorkspaceDeclaration = { schemaVersion: 1, packages: [] };
    if (!dryRun) {
      mkdirSync(this.directory, { recursive: true });
      this.io.reserveForGraph(() => this.io.writeForGraph("workspace.yml", stringify(source)));
    }
    return { source, dryRun };
  }
  private declaration(): { source: WorkspaceDeclaration; text: string } {
    const text = this.io.readForGraph("workspace.yml").toString("utf8");
    const value: unknown = parse(text);
    if (
      !object(value) ||
      Object.keys(value).some((k) => !["schemaVersion", "packages"].includes(k)) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.packages) ||
      value.packages.some((p) => typeof p !== "string") ||
      new Set(value.packages).size !== value.packages.length
    )
      throw new Error("invalid workspace.yml");
    const source = value as unknown as WorkspaceDeclaration;
    for (const path of source.packages) this.local(path);
    return { source, text };
  }
  private local(path: string): string {
    if (path === ".") return this.directory;
    assertPortablePath(path);
    return this.io.pathForGraph(path);
  }
  private source(directory: string): PackageSource {
    return parsePackage(
      parse(new VnextWorkspace(directory).readForGraph("package.yml").toString("utf8")),
    );
  }
  /** Read validated local package identities in stable locator order. */
  list(): PackageCandidate[] {
    const entries = this.declaration().source.packages.map((locator) => {
      const source = this.source(this.local(locator));
      return { locator, name: source.name, version: source.version };
    });
    const identities = new Set<string>();
    for (const entry of entries) {
      const key = `${entry.name}@${entry.version}`;
      if (identities.has(key)) throw new Error(`duplicate workspace package: ${key}`);
      identities.add(key);
    }
    return entries.sort((a, b) => (a.locator < b.locator ? -1 : a.locator > b.locator ? 1 : 0));
  }
  /** Register existing confined source; preserve its native tasks and bytes. */
  add(path: string, dryRun = false) {
    const action = () => {
      if (existsSync(this.io.pathForGraph(".wpm-pending-package.json")))
        throw new Error("resume interrupted package creation first");
      const directory = resolve(this.directory, path);
      const locator = relative(this.directory, directory).split("\\").join("/") || ".";
      this.local(locator);
      const incoming = this.source(directory);
      const declaration = this.declaration();
      const entries = this.list();
      if (
        entries.some(
          (e) =>
            e.locator !== locator && e.name === incoming.name && e.version === incoming.version,
        )
      )
        throw new Error("duplicate package name and version");
      const source = {
        ...declaration.source,
        packages: [...new Set([...declaration.source.packages, locator])].sort(),
      };
      if (!dryRun) this.io.writeForGraph("workspace.yml", stringify(source), declaration.text);
      return { locator, name: incoming.name, version: incoming.version, dryRun };
    };
    return dryRun ? action() : this.io.reserveForGraph(action);
  }
  /** Create owned source and register it, retaining exact inventory evidence for recovery. */
  create(name: string, path = `packages/${name}`, dryRun = false) {
    assertSlug(name);
    const directory = this.local(path);
    const pending = ".wpm-pending-package.json";
    const action = () => {
      const declaration = this.declaration();
      if (
        this.list().some(
          (entry) => entry.locator !== path && entry.name === name && entry.version === "0.1.0",
        )
      )
        throw new Error("duplicate workspace package during creation replay");
      const old = existsSync(this.io.pathForGraph(pending))
        ? this.io.readForGraph(pending).toString("utf8")
        : undefined;
      let before = declaration.text;
      let after: string;
      let inventory: Record<string, string> | null = null;
      if (old) {
        const plan: unknown = json(old);
        if (
          !object(plan) ||
          Object.keys(plan).sort().join(",") !==
            ["schemaVersion", "name", "path", "before", "after", "inventory"].sort().join(",") ||
          plan.schemaVersion !== 1 ||
          plan.name !== name ||
          plan.path !== path ||
          typeof plan.before !== "string" ||
          typeof plan.after !== "string"
        )
          throw new Error("retry identical valid package creation request");
        before = plan.before;
        after = plan.after;
        if (
          plan.inventory !== null &&
          (!object(plan.inventory) ||
            Object.values(plan.inventory).some((entry) => typeof entry !== "string"))
        )
          throw new Error("invalid created source inventory");
        inventory = plan.inventory as Record<string, string> | null;
        const expected: unknown = parse(before);
        if (
          !object(expected) ||
          !Array.isArray(expected.packages) ||
          expected.packages.some((entry: unknown) => typeof entry !== "string") ||
          stableJson(parse(after)) !==
            stableJson({ ...expected, packages: [...(expected.packages as string[]), path].sort() })
        )
          throw new Error("invalid package creation transition");
        if (declaration.text !== before && declaration.text !== after)
          throw new Error("workspace changed during package creation");
      } else {
        if (existsSync(directory))
          throw new Error(
            "package destination already exists; use workspace add for existing source",
          );
        if (this.list().some((entry) => entry.name === name && entry.version === "0.1.0"))
          throw new Error("duplicate package name and version");
        after = stringify({
          ...declaration.source,
          packages: [...declaration.source.packages, path].sort(),
        });
      }
      if (!dryRun) {
        let contents =
          old ?? stableJson({ schemaVersion: 1, name, path, before, after, inventory });
        if (!old) this.io.writeForGraph(pending, contents);
        if (inventory === null) {
          if (old && existsSync(directory))
            throw new Error(
              "ambiguous interrupted package creation; preserve source for inspection",
            );
          new VnextWorkspace(directory).init(name);
          inventory = packageInventory(directory);
          const updated = stableJson({ schemaVersion: 1, name, path, before, after, inventory });
          this.io.writeForGraph(pending, updated, contents);
          contents = updated;
        } else if (
          !existsSync(directory) ||
          stableJson(packageInventory(directory)) !== stableJson(inventory)
        )
          throw new Error("created package source inventory changed");
        if (stableJson(this.source(directory)) !== stableJson(emptyPackage(name)))
          throw new Error("created package source was changed; preserved for inspection");
        this.io.writeForGraph("workspace.yml", after, declaration.text);
        this.io.removeForGraph(pending, contents);
      }
      return { name, source: path, dryRun };
    };
    return dryRun ? action() : this.io.reserveForGraph(action);
  }

  /** Resolve one explicit or unambiguous package identity to its local source root. */
  select(root: string, name?: string, version?: string): string {
    if (!existsSync(join(this.directory, "workspace.yml"))) {
      const source = this.source(resolve(root));
      if ((name && source.name !== name) || (version && source.version !== version))
        throw new Error("selected package does not match source");
      return resolve(root);
    }
    let candidates = this.list().filter(
      (c) => (!name || c.name === name) && (!version || c.version === version),
    );
    if (!name) {
      const exact = candidates.filter((c) => this.local(c.locator) === resolve(root));
      if (exact.length === 1) candidates = exact;
    }
    if (candidates.length !== 1)
      throw new Error("select an unambiguous --package and --package-version");
    return this.local(required(candidates[0]).locator);
  }
  /** Inspect the registration catalog without effects. */
  view() {
    return { schemaVersion: 1, packages: this.list() };
  }
  /** Check all registered identities and the current graph locks required by version2 source. */
  check() {
    const packages = this.list();
    for (const entry of packages) {
      const directory = this.local(entry.locator);
      if (this.source(directory).schemaVersion === 2) this.lock(directory, true);
    }
    return { valid: true, packages };
  }
  checkPackage(directory: string) {
    const own = new VnextWorkspace(directory).check();
    if (this.source(directory).schemaVersion === 2) this.lock(directory, true);
    return own;
  }
  /** Capture local or frozen package instances and resolve a finite exact dependency graph. */
  graph(
    directory: string,
    previous?: PackageGraph,
    upgrade = false,
    replacement?: PackageSource,
    authorizedRoot = false,
  ) {
    const checks: (() => void)[] = [];
    const workspaceBefore = existsSync(join(this.directory, "workspace.yml"))
      ? this.io.readForGraph("workspace.yml").toString("utf8")
      : undefined;
    const captured = new Map<string, PackageFile[]>();
    const records = new Map<string, PackageRecord>();
    const frozen = new Map<string, PackageGraph>();
    const workspace = existsSync(join(this.directory, "workspace.yml"))
      ? this.list()
      : [
          {
            locator: relative(this.directory, directory).split("\\").join("/") || ".",
            name: this.source(directory).name,
            version: this.source(directory).version,
          },
        ];
    const candidate = workspace.find((c) => this.local(c.locator) === directory);
    if (!candidate) throw new Error("package is not registered in workspace");
    const sourceKey = (c: PackageCandidate) => c.locator;
    const load = (c: PackageCandidate): PackageRecord => {
      const existing = records.get(sourceKey(c));
      if (existing) return existing;
      if (c.locator.startsWith("file:")) throw new Error("archive was not captured");
      const local = this.local(c.locator);
      const capture = new VnextWorkspace(local).captureForGraph(
        local === directory && replacement !== undefined,
        local === directory && authorizedRoot,
      );
      checks.push(() => {
        const current = new VnextWorkspace(local).captureForGraph(
          local === directory && replacement !== undefined,
          local === directory && authorizedRoot,
        );
        if (
          stableJson(current.source) !== stableJson(capture.source) ||
          contentDigest(current.files) !== contentDigest(capture.files)
        )
          throw new Error("package source changed during graph capture");
      });
      const source = local === directory && replacement ? replacement : capture.source;
      const files = capture.files;
      const digest = hash(stableJson({ source, files: contentDigest(files) }));
      const record: PackageRecord = {
        locator: c.locator,
        name: source.name,
        version: source.version,
        digest,
        id: hash(
          stableJson({ locator: c.locator, name: source.name, version: source.version, digest }),
        ),
      };
      for (const kind of dependencyKinds) if (source[kind]) record[kind] = source[kind];
      captured.set(record.id, files);
      records.set(sourceKey(c), record);
      return record;
    };
    const archive = (parent: PackageCandidate, reference: string): PackageCandidate | undefined => {
      assertArchiveReference(reference);
      const base = parent.locator.startsWith("file:")
        ? dirname(this.local(parent.locator.slice(5)))
        : this.local(parent.locator);
      const absolute = resolve(base, reference.slice(5));
      const path = relative(this.directory, absolute).split("\\").join("/");
      this.local(path);
      if (!existsSync(absolute)) return undefined;
      const bytes = this.io.readForGraph(path);
      checks.push(() => {
        if (hash(this.io.readForGraph(path)) !== hash(bytes))
          throw new Error("archive changed during graph capture");
      });
      const files = validateReleaseEnvelope(readPackageArchive(bytes)).files;
      const contractFile = files.find((f) => f.path === "contract.json");
      if (!contractFile) throw new Error("archive has no contract");
      const contract: unknown = json(contractFile.bytes.toString("utf8"));
      const locator = `file:${path}`;
      if (!object(contract)) throw new Error("invalid archive contract");
      if (contract.schemaVersion === 2) {
        const bundle = validateBundle(contract, files);
        const original = bundle.graph;
        const archiveDigest = hash(bytes);
        const ids = Object.fromEntries(
          Object.keys(original.nodes).map((id) => [
            id,
            hash(stableJson({ archiveDigest, id, locator })),
          ]),
        );
        const graph: PackageGraph = {
          schemaVersion: 2,
          root: required(ids[original.root]),
          nodes: {},
        };
        for (const [id, node] of Object.entries(original.nodes)) {
          const mapped = required(ids[id]);
          const prefix = `packages/${id.slice(0, 16)}/`;
          captured.set(
            mapped,
            files
              .filter((f) => f.path.startsWith(prefix))
              .map((f) => ({ path: f.path.slice(prefix.length), bytes: f.bytes })),
          );
          graph.nodes[mapped] = {
            record: {
              ...node.record,
              id: mapped,
              digest: hash(stableJson({ archiveDigest, digest: node.record.digest })),
              locator: id === original.root ? locator : `${locator}#${id}`,
            },
            edges: node.edges.map((e) =>
              e.target ? { ...e, target: required(ids[e.target]) } : e,
            ),
          };
        }
        const root = required(graph.nodes[graph.root]).record;
        const selected = { locator, name: root.name, version: root.version };
        records.set(locator, root);
        frozen.set(locator, graph);
        return selected;
      }
      validateLeaf(contract, files);
      const name = contract.name as string;
      const version = contract.version as string;
      const digest = hash(bytes);
      const record: PackageRecord = {
        locator,
        name,
        version,
        digest,
        id: hash(stableJson({ locator, name, version, digest })),
      };
      records.set(locator, record);
      captured.set(record.id, files);
      return { locator, name, version };
    };
    const catalog: PackageCatalog = {
      workspace,
      archive,
      load,
      frozen: (c) => frozen.get(c.locator),
    };
    const graph = parseGraph(resolvePackageGraph(candidate, catalog, previous, upgrade));
    for (const check of checks) check();
    if (
      workspaceBefore !== undefined &&
      this.io.readForGraph("workspace.yml").toString("utf8") !== workspaceBefore
    )
      throw new Error("workspace changed during graph capture");
    return { graph, captured };
  }
  /** Read and validate an existing graph lock without resolving or modifying it. */
  readLock(directory: string): PackageGraph | undefined {
    const io = new VnextWorkspace(directory);
    if (!existsSync(io.pathForGraph(graphLock))) return undefined;
    return parseGraph(json(io.readForGraph(graphLock).toString("utf8")));
  }
  /** Check or intentionally reconcile exact decisions; upgrade is an explicit opt-in. */
  lock(directory: string, check = false, upgrade = false, dryRun = false) {
    const io = new VnextWorkspace(directory);
    if (existsSync(io.pathForGraph(pendingPath)))
      throw new Error("resume interrupted dependency edit first");
    const lockBefore = existsSync(io.pathForGraph(graphLock))
      ? io.readForGraph(graphLock).toString("utf8")
      : undefined;
    const previous = lockBefore ? parseGraph(json(lockBefore)) : undefined;
    const result = this.graph(directory, previous, upgrade).graph;
    if (check && (!previous || stableJson(previous) !== stableJson(result)))
      throw new Error("dependency lock is missing or stale");
    if (!check && !dryRun)
      io.reserveForGraph(() => io.writeForGraph(graphLock, stableJson(result), lockBefore));
    return { graph: result, checked: check, dryRun };
  }
  /** Read or change one package version while serializing workspace identity decisions. */
  version(directory: string, value?: string, preid?: string, dryRun = false) {
    const action = () => {
      if (value && existsSync(this.io.pathForGraph(".wpm-pending-package.json")))
        throw new Error("resume interrupted package creation first");
      const source = this.source(directory);
      if (value && existsSync(new VnextWorkspace(directory).pathForGraph(pendingPath)))
        throw new Error("resume interrupted dependency edit first");
      if (value && existsSync(join(this.directory, "workspace.yml"))) {
        const next = nextVersion(source.version, value, preid);
        if (
          this.list().some(
            (c) =>
              this.local(c.locator) !== directory && c.name === source.name && c.version === next,
          )
        )
          throw new Error("duplicate workspace package version");
      }
      return (directory === this.directory ? this.io : new VnextWorkspace(directory)).version(
        value,
        preid,
        dryRun,
      );
    };
    return value && !dryRun && existsSync(join(this.directory, "workspace.yml"))
      ? this.io.reserveForGraph(action)
      : action();
  }

  /** Inspect declarations, locked instances and optional finite tree expansion. */
  dependencies(directory: string, tree = false) {
    const source = this.source(directory);
    const graph = this.readLock(directory);
    return {
      declarations: Object.fromEntries(dependencyKinds.map((kind) => [kind, source[kind] ?? {}])),
      graph: graph ?? null,
      tree: tree && graph ? graphTree(graph) : null,
    };
  }
  /** Reconcile a declaration and graph lock using a request-bound recoverable journal. */
  editDependency(
    directory: string,
    name: string,
    declaration: DependencyDeclaration | undefined,
    kind: DependencyKind,
    manifestOnly = false,
    dryRun = false,
  ) {
    assertSlug(name);
    if (declaration?.source.startsWith("file:")) assertArchiveReference(declaration.source);
    const io = new VnextWorkspace(directory);
    const request = stableJson({ name, declaration: declaration ?? null, kind, manifestOnly });
    const action = () => {
      let plan: PendingEdit;
      const previousPending = existsSync(io.pathForGraph(pendingPath))
        ? io.readForGraph(pendingPath).toString("utf8")
        : undefined;
      if (previousPending) {
        plan = parsePending(json(previousPending));
        if (plan.request !== request) throw new Error("retry the identical dependency request");
      } else {
        const before = io.readForGraph("package.yml").toString("utf8");
        const source = parsePackage(parse(before));
        const after: PackageSource = { ...source, schemaVersion: 2 };
        for (const key of dependencyKinds) {
          const entries = { ...source[key] };
          delete entries[name];
          after[key] = entries;
        }
        if (declaration) after[kind] = { ...after[kind], [name]: declaration };
        parsePackage(after);
        const lockBefore = existsSync(io.pathForGraph(graphLock))
          ? io.readForGraph(graphLock).toString("utf8")
          : null;
        const lockAfter = manifestOnly
          ? lockBefore
          : stableJson(
              this.graph(
                directory,
                lockBefore ? parseGraph(json(lockBefore)) : undefined,
                false,
                after,
              ).graph,
            );
        plan = {
          schemaVersion: 1,
          request,
          before,
          after: editAuthoringSourceText(before, source, after),
          lockBefore,
          lockAfter,
        };
      }
      const current = io.readForGraph("package.yml").toString("utf8");
      const currentLock = existsSync(io.pathForGraph(graphLock))
        ? io.readForGraph(graphLock).toString("utf8")
        : null;
      if (
        ![plan.before, plan.after].includes(current) ||
        ![plan.lockBefore, plan.lockAfter].includes(currentLock)
      )
        throw new Error("dependency transaction preimage changed");
      // Re-capture dependencies before every replay; a journal never authorizes stale bytes.
      if (
        !manifestOnly &&
        stableJson(
          this.graph(
            directory,
            plan.lockAfter ? parseGraph(json(plan.lockAfter)) : undefined,
            false,
            parsePackage(parse(plan.after)),
          ).graph,
        ) !== plan.lockAfter
      )
        throw new Error("dependency sources changed during interrupted request");
      if (!dryRun) {
        if (!previousPending) io.writeForGraph(pendingPath, stableJson(plan));
        io.writeForGraph("package.yml", plan.after, current);
        if (plan.lockAfter !== null)
          io.writeForGraph(graphLock, plan.lockAfter, currentLock ?? undefined);
        io.removeForGraph(pendingPath, previousPending ?? stableJson(plan));
      }
      return { name, kind, manifestOnly, dryRun };
    };
    return dryRun ? action() : io.reserveForGraph(action);
  }
  private prepareGraph(directory: string, authorizedRoot = false) {
    const io = new VnextWorkspace(directory);
    const source = this.source(directory);

    if (existsSync(io.pathForGraph(pendingPath)))
      throw new Error("resume interrupted dependency edit first");
    const locked = this.readLock(directory);
    if (!locked) throw new Error("run wpm vnext lock for dependency source");
    const { graph, captured } = this.graph(directory, locked, false, undefined, authorizedRoot);
    if (stableJson(locked) !== stableJson(graph))
      throw new Error("dependency lock is stale; run lock intentionally");
    const runtime = runtimeGraph(graph);
    const packages: Bundle["packages"] = {};
    const files: PackageFile[] = [];
    const prefixes = new Set<string>();
    for (const id of Object.keys(runtime.nodes).sort()) {
      const prefix = `packages/${id.slice(0, 16)}/`;
      if (prefixes.has(prefix)) throw new Error("package namespace collision");
      prefixes.add(prefix);
      const own = captured.get(id);
      if (!own) throw new Error(`missing captured instance: ${id}`);
      packages[id] = { inventory: own.map((f) => ({ path: f.path, sha256: hash(f.bytes) })) };
      for (const file of own) files.push({ path: prefix + file.path, bytes: file.bytes });
    }
    const bundle: Bundle = { schemaVersion: 2, graph: runtime, packages };
    files.push(
      { path: "contract.json", bytes: Buffer.from(stableJson(bundle)) },
      {
        path: "AGENTS.md",
        bytes: Buffer.from(
          "# Work package graph\n\nRead contract.json. Select a package instance and its operation/group with the user. Each packages/<instance-prefix>/contract.json describes that instance. Load only its selected worker setup and instructions. Package dependency edges include content; they do not imply execution order. Follow operation prerequisites and verify acceptance criteria. Keep mutable work outside this archive. WPM and Backlog are not required.\n",
        ),
      },
      { path: "CLAUDE.md", bytes: Buffer.from("@AGENTS.md\n") },
    );
    assertArchiveSizes(files.map((file) => file.bytes.length));
    const bytes = createDeterministicTarball(
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    );
    const path = `builds/${source.name}-${source.version}.tgz`;
    return { source, files, bytes, path, graph, instances: Object.keys(runtime.nodes).length };
  }
  /** Capture immutable release content without changing existing build serialization. */
  captureRelease(
    directory: string,
    authorizedReservation = false,
  ): { source: PackageSource; files: PackageFile[] } {
    if (this.source(directory).schemaVersion === 1) {
      const captured = new VnextWorkspace(directory).captureForRelease(authorizedReservation);
      return { source: captured.source, files: captured.files };
    }
    const captured = this.prepareGraph(directory, authorizedReservation);
    return { source: captured.source, files: captured.files };
  }

  /** Build the locked runtime closure once per namespaced instance without dev-only content. */
  build(directory: string, dryRun = false) {
    const io = new VnextWorkspace(directory);
    if (this.source(directory).schemaVersion === 1) return io.build(dryRun);
    const result = this.prepareGraph(directory);
    if (!dryRun)
      io.reserveForGraph(() => {
        // Revalidate the graph under the root reservation before committing captured bytes.
        const fresh = this.graph(directory, this.readLock(directory), false, undefined, true).graph;
        if (
          stableJson(fresh) !== stableJson(result.graph) ||
          stableJson(fresh) !== stableJson(this.readLock(directory))
        )
          throw new Error("source changed before build");
        mkdirSync(dirname(io.pathForGraph(result.path)), { recursive: true });
        const target = io.pathForGraph(result.path);
        const temporary = `${target}.graph.tmp`;
        writeFileSync(temporary, result.bytes, { flag: "wx" });
        try {
          renameSync(temporary, target);
        } finally {
          rmSync(temporary, { force: true });
        }
      });
    return {
      archive: result.path,
      sha256: hash(result.bytes),
      instances: result.instances,
      dryRun,
    };
  }
  /** Rehearse graph extraction under an owned reservation and retain byte-bound results. */
  test(directory: string, dryRun = false) {
    const io = new VnextWorkspace(directory);
    if (existsSync(io.pathForGraph(pendingPath)))
      throw new Error("resume interrupted dependency edit first");
    if (this.source(directory).schemaVersion === 1) return io.test(dryRun);
    if (dryRun) {
      this.prepareGraph(directory);
      return {
        dryRun: true,
        agentExecution: false,
        effects: ["temporary graph extraction", "test-results/vnext-latest.json"],
      };
    }
    const action = () => {
      const temporary = mkdtempSync(join(tmpdir(), "wpm-graph-rehearsal-"));
      let outcome: {
        passed: boolean;
        kind: string;
        agentExecution: boolean;
        error?: string;
        archiveSha256?: string;
      } = { passed: false, kind: "static-recipient-artifact-rehearsal", agentExecution: false };
      try {
        const result = this.prepareGraph(directory, true);
        writeFileSync(join(temporary, "package.tgz"), result.bytes);
        mkdirSync(join(temporary, "recipient"));
        execaSync("tar", ["-xzf", "../package.tgz"], { cwd: join(temporary, "recipient") });
        for (const file of result.files)
          if (!readFileSync(join(temporary, "recipient", file.path)).equals(file.bytes))
            throw new Error("extracted graph content mismatch");
        outcome = { ...outcome, passed: true, archiveSha256: hash(result.bytes) };
        return outcome;
      } catch (error) {
        outcome = { ...outcome, error: error instanceof Error ? error.message : String(error) };
        throw error;
      } finally {
        rmSync(temporary, { recursive: true, force: true });
        const path = "test-results/vnext-latest.json";
        io.writeForGraph(
          path,
          stableJson(outcome),
          existsSync(io.pathForGraph(path)) ? io.readForGraph(path).toString("utf8") : undefined,
        );
      }
    };
    return io.reserveForGraph(action);
  }
}

function graphTree(graph: PackageGraph) {
  const expanded = new Set<string>();
  const visit = (id: string): unknown => {
    const node = graph.nodes[id];
    if (!node) throw new Error("dangling graph edge");
    if (expanded.has(id)) return { id, reference: true };
    expanded.add(id);
    return {
      id,
      name: node.record.name,
      version: node.record.version,
      dependencies: node.edges.map((e) => ({ ...e, node: e.target ? visit(e.target) : null })),
    };
  };
  return visit(graph.root);
}
function parsePending(value: unknown): PendingEdit {
  if (
    !object(value) ||
    stableJson(Object.keys(value).sort()) !==
      stableJson(
        ["schemaVersion", "request", "before", "after", "lockBefore", "lockAfter"].sort(),
      ) ||
    value.schemaVersion !== 1 ||
    ["request", "before", "after"].some((k) => typeof value[k] !== "string") ||
    ["lockBefore", "lockAfter"].some((k) => value[k] !== null && typeof value[k] !== "string")
  )
    throw new Error("invalid pending dependency edit");
  const plan = value as unknown as PendingEdit;
  const request: unknown = json(plan.request);
  if (
    !object(request) ||
    typeof request.name !== "string" ||
    !dependencyKinds.includes(request.kind as DependencyKind) ||
    typeof request.manifestOnly !== "boolean" ||
    (request.declaration !== null && !object(request.declaration))
  )
    throw new Error("invalid dependency request");
  const before = parsePackage(parse(plan.before));
  const expected: PackageSource = { ...before, schemaVersion: 2 };
  for (const kind of dependencyKinds) {
    const entries = { ...before[kind] };
    delete entries[request.name];
    expected[kind] = entries;
  }
  if (request.declaration !== null)
    expected[request.kind as DependencyKind] = {
      ...expected[request.kind as DependencyKind],
      [request.name]: request.declaration as unknown as DependencyDeclaration,
    };
  parsePackage(expected);
  if (stableJson(parsePackage(parse(plan.after))) !== stableJson(expected))
    throw new Error("dependency journal request and source transition differ");
  if (request.manifestOnly && plan.lockBefore !== plan.lockAfter)
    throw new Error("manifest-only request must preserve lock");
  if (!request.manifestOnly && plan.lockAfter === null)
    throw new Error("dependency request requires graph lock");
  if (plan.lockBefore) parseGraph(json(plan.lockBefore));

  parsePackage(parse(plan.before));
  parsePackage(parse(plan.after));
  if (plan.lockAfter) parseGraph(json(plan.lockAfter));
  return plan;
}
/** Validate complete finite graphs before trusting locks or importing frozen release content. */
function parseGraph(value: unknown): PackageGraph {
  const fields = (entry: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(entry).some((key) => !allowed.includes(key)))
      throw new Error("unsupported graph fields");
  };
  if (
    !object(value) ||
    value.schemaVersion !== 2 ||
    typeof value.root !== "string" ||
    !object(value.nodes)
  )
    throw new Error("invalid package graph");
  fields(value, ["schemaVersion", "root", "nodes"]);
  const graph = value as unknown as PackageGraph;
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (
      !/^[a-f0-9]{64}$/.test(id) ||
      !object(node) ||
      !object(node.record) ||
      node.record.id !== id ||
      typeof node.record.name !== "string" ||
      typeof node.record.version !== "string" ||
      typeof node.record.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(node.record.digest) ||
      typeof node.record.locator !== "string" ||
      !Array.isArray(node.edges)
    )
      throw new Error("invalid package instance");
    fields(node, ["record", "edges"]);
    fields(node.record, ["id", "name", "version", "digest", "locator", ...dependencyKinds]);
    const locator = node.record.locator.replace(/^file:/, "");
    if (locator !== ".") assertPortablePath(locator);
    parsePackage({
      schemaVersion: 2,
      name: node.record.name,
      version: node.record.version,
      work: [],
      groups: {},
      workerSetup: { setups: {} },
      files: [],
      ...Object.fromEntries(
        dependencyKinds.filter((k) => node.record[k] !== undefined).map((k) => [k, node.record[k]]),
      ),
    });
    validateDependencies(node.record);
    for (const kind of dependencyKinds)
      for (const entry of Object.values(node.record[kind] ?? {}))
        if (entry.source.startsWith("file:")) assertArchiveReference(entry.source);
    const expected = new Map(
      dependencyKinds
        .filter((kind) => kind !== "devDependencies" || id === graph.root)
        .flatMap((kind) =>
          Object.entries(node.record[kind] ?? {}).map(
            ([name, declaration]) => [name, { kind, declaration }] as const,
          ),
        ),
    );
    const seen = new Set<string>();
    for (const edge of node.edges) {
      if (
        !object(edge) ||
        typeof edge.name !== "string" ||
        seen.has(edge.name) ||
        !object(edge.declaration) ||
        typeof edge.declaration.source !== "string" ||
        typeof edge.declaration.range !== "string"
      )
        throw new Error("invalid package edge");
      fields(edge, ["name", "kind", "declaration", "target", "omitted"]);
      fields(edge.declaration, ["source", "range"]);
      const declaration = expected.get(edge.name);
      if (
        !declaration ||
        declaration.kind !== edge.kind ||
        stableJson(declaration.declaration) !== stableJson(edge.declaration) ||
        (typeof edge.target === "string") === (typeof edge.omitted === "string")
      )
        throw new Error("package edge differs from declarations");
      seen.add(edge.name);
      if (
        edge.omitted !== undefined &&
        (edge.kind !== "optionalDependencies" || typeof edge.omitted !== "string" || !edge.omitted)
      )
        throw new Error("invalid optional omission");
      if (edge.target !== undefined) {
        if (typeof edge.target !== "string") throw new Error("invalid package target");
        const target = graph.nodes[edge.target]?.record;
        if (
          !target ||
          target.name !== edge.name ||
          !matchesPackageVersion(target.version, edge.declaration.range)
        )
          throw new Error("package target does not satisfy edge");
      }
    }
    if (seen.size !== expected.size) throw new Error("missing declared package edges");
  }
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const node = graph.nodes[id];
    if (!node) throw new Error("missing graph root or target");
    visited.add(id);
    for (const edge of node.edges) if (edge.target) visit(edge.target);
  };
  visit(graph.root);
  if (visited.size !== Object.keys(graph.nodes).length)
    throw new Error("unreachable graph instances");
  return graph;
}

function validateLeaf(value: Record<string, unknown>, files: PackageFile[]): void {
  if (
    value.schemaVersion !== 1 ||
    typeof value.name !== "string" ||
    typeof value.version !== "string" ||
    !valid(value.version) ||
    !Array.isArray(value.operations) ||
    !object(value.groups) ||
    !object(value.workerSetup)
  )
    throw new Error("invalid leaf package contract");
  for (const path of ["AGENTS.md", "CLAUDE.md", "contract.json"])
    if (!files.some((file) => file.path === path)) throw new Error("missing package entry file");
  const operations: unknown[] = value.operations;
  for (const op of operations) {
    if (!object(op) || typeof op.id !== "string" || !Array.isArray(op.prerequisites))
      throw new Error("invalid archived operation");
    const operationId = op.id;
    assertSlug(operationId);
    if (
      !files.some((f) => f.path === `operations/${operationId}.md`) ||
      op.prerequisites.some((id) => !operations.some((other) => object(other) && other.id === id))
    )
      throw new Error("missing archived operation content or prerequisite");
  }
  // Reuse the canonical source validator to check setup names and group cycles.
  const rawNames: unknown = value.workerSetup.names;
  if (!Array.isArray(rawNames)) throw new Error("invalid archived setup names");
  const names = (rawNames as unknown[]).map((name) => {
    if (typeof name !== "string") throw new Error("invalid archived setup name");
    return name;
  });
  parsePackage({
    schemaVersion: 1,
    name: value.name,
    version: value.version,
    work: operations.map((op, index) => ({
      operation: (op as Record<string, unknown>).id,
      task: `operation-${index + 1}`,
      setup: (op as Record<string, unknown>).setup,
    })),
    groups: value.groups,
    workerSetup: {
      ...(value.workerSetup.default === null ? {} : { default: value.workerSetup.default }),
      setups: Object.fromEntries(
        names.map((name) => [name, { source: `worker-setup/${name}`, backend: "plain" }]),
      ),
    },
    files: [],
  });
  if (new Set(names).size !== names.length) throw new Error("duplicate archived setup names");
  for (const name of names)
    if (!files.some((f) => f.path === `worker-setup/${name}/WORKER.md`))
      throw new Error("missing archived setup");
  const operationIds = new Set(operations.map((op) => (op as Record<string, unknown>).id));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("cyclic archived operation prerequisite");
    if (done.has(id)) return;
    visiting.add(id);
    const op = operations.find((v) => object(v) && v.id === id) as Record<string, unknown>;
    for (const child of op.prerequisites as string[]) visit(child);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of operationIds) {
    if (typeof id !== "string") throw new Error("invalid operation ID");
    visit(id);
  }
  for (const file of files) {
    if (["contract.json", "AGENTS.md", "CLAUDE.md"].includes(file.path)) continue;
    if (file.path.startsWith("payload/")) {
      assertSourcePath(file.path);
      continue;
    }
    const operation = /^operations\/([^/]+)\.md$/.exec(file.path);
    if (operation && operationIds.has(operation[1])) continue;
    const setup = /^worker-setup\/([^/]+)\/(.+)$/.exec(file.path);
    if (!setup || !names.includes(setup[1] ?? "")) throw new Error("unexpected package file");
    const path = setup[2] ?? "";
    if (path === "WORKER.md") continue;
    const target = /^targets\/(codex|claude)\/(.+)$/.exec(path);
    if (!target) throw new Error("unexpected setup file");
    const output = target[2] ?? "";
    if (output.split("/").some((part) => part.toLowerCase().startsWith("wpm-repo-")))
      throw new Error("repository development content in archive");
    if (["AGENTS.md", "CLAUDE.md", ".mcp.json", ".codex/config.toml", "MCP.json"].includes(output))
      continue;
    if (!/^(\.agents|\.claude)\/(skills|rules)\//.test(output))
      throw new Error("unsupported native target output");
    assertSourcePath(output.split("/").slice(1).join("/"));
  }
  for (const name of names)
    for (const target of ["codex", "claude"] as const) {
      const prefix = `worker-setup/${name}/targets/${target}/`;
      validateApmMcpFiles(
        files
          .filter((file) => file.path.startsWith(prefix))
          .map((file) => ({ path: file.path.slice(prefix.length), bytes: file.bytes })),
        target,
      );
    }
}

function validateBundle(value: Record<string, unknown>, files: PackageFile[]): Bundle {
  const graph = parseGraph(value.graph);
  if (!object(value.packages)) throw new Error("missing package inventories");
  const bundle = value as unknown as Bundle;
  const expected = new Set(["contract.json", "AGENTS.md", "CLAUDE.md"]);
  for (const id of Object.keys(graph.nodes)) {
    const inventory = bundle.packages[id]?.inventory;
    if (!Array.isArray(inventory)) throw new Error("missing instance inventory");
    const own: PackageFile[] = [];
    for (const item of inventory) {
      if (!object(item) || typeof item.path !== "string" || typeof item.sha256 !== "string")
        throw new Error("invalid inventory");
      const path = `packages/${id.slice(0, 16)}/${item.path}`;
      const file = files.find((f) => f.path === path);
      if (!file || expected.has(path) || hash(file.bytes) !== item.sha256)
        throw new Error("archive inventory digest mismatch");
      expected.add(path);
      own.push({ path: item.path, bytes: file.bytes });
    }
    const leaf = own.find((f) => f.path === "contract.json");
    if (!leaf) throw new Error("missing instance contract");
    const contract: unknown = json(leaf.bytes.toString("utf8"));
    if (!object(contract)) throw new Error("invalid instance contract");
    validateLeaf(contract, own);
    const record = required(graph.nodes[id]).record;
    if (contract.name !== record.name || contract.version !== record.version)
      throw new Error("instance metadata differs");
    if (required(graph.nodes[id]).edges.some((e) => e.kind === "devDependencies"))
      throw new Error("dev edge in release");
  }
  if (files.some((f) => !expected.has(f.path))) throw new Error("unexpected graph archive file");
  return bundle;
}

/** Validate saved runtime contracts using the same semantic checks as frozen imports. */
export function validateReleaseFiles(files: PackageFile[]): Record<string, unknown> {
  const entry = files.find((file) => file.path === "contract.json");
  if (!entry) throw new Error("release has no contract.json");
  const value: unknown = json(entry.bytes.toString("utf8"));
  if (!object(value)) throw new Error("invalid release contract");
  const fields = (item: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(item).some((key) => !allowed.includes(key)))
      throw new Error("unsupported release contract field");
  };
  const leaf = (contract: Record<string, unknown>, own: PackageFile[]) => {
    fields(contract, ["schemaVersion", "name", "version", "operations", "groups", "workerSetup"]);
    if (!object(contract.workerSetup) || !Array.isArray(contract.operations))
      throw new Error("invalid release work/setup");
    fields(contract.workerSetup, ["default", "names"]);
    for (const operation of contract.operations) {
      if (!object(operation)) throw new Error("invalid release operation");
      fields(operation, ["id", "prerequisites", "setup"]);
      if (operation.setup !== null && typeof operation.setup !== "string")
        throw new Error("invalid release setup association");
    }
    validateLeaf(contract, own);
  };
  if (value.schemaVersion === 1) leaf(value, files);
  else if (value.schemaVersion === 2) {
    fields(value, ["schemaVersion", "graph", "packages"]);
    const bundle = validateBundle(value, files);
    if (
      Object.keys(bundle.packages).sort().join("\0") !==
      Object.keys(bundle.graph.nodes).sort().join("\0")
    )
      throw new Error("release instance inventory differs from graph");
    for (const id of Object.keys(bundle.graph.nodes)) {
      const prefix = `packages/${id.slice(0, 16)}/`;
      const own = files
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({ path: file.path.slice(prefix.length), bytes: file.bytes }));
      const contractFile = own.find((file) => file.path === "contract.json");
      if (!contractFile) throw new Error("missing instance contract");
      const contract: unknown = json(contractFile.bytes.toString("utf8"));
      if (!object(contract)) throw new Error("invalid instance contract");
      leaf(contract, own);
    }
  } else throw new Error("unsupported release contract version");
  return value;
}
