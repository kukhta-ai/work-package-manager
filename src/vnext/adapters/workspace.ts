import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { execaSync } from "execa";
import { parse, stringify } from "yaml";
import { BacklogCli } from "../../adapters/backlog-cli.js";
import { NodeFileSystem } from "../../adapters/node-fs.js";
import type { BacklogMd, TaskRecord } from "../../core/ports/backlog.js";
import {
  assertPortablePath,
  assertSlug,
  assertSourcePath,
  effectiveSetup,
  emptyPackage,
  type PackageSource,
  parsePackage,
  removeSetups,
  selectOperations,
  stableJson,
} from "../core/model.js";

import { editSourceText } from "../core/source-text.js";
import { ApmBackend, type ApmTarget, type ApmTool, preparedApmSetup } from "./apm.js";
import { assertPortableTree } from "./portable-tree.js";

interface SourceSnapshot {
  source: PackageSource;
  text: string;
}
interface CapturedFile {
  path: string;
  bytes: Buffer;
}
interface CompiledOperation {
  id: string;
  prerequisites: string[];
  setup: string | null;
  content: string;
}

/** Effectful workspace adapter. Native tasks are accessed exclusively through Backlog.md's port. */
export class VnextWorkspace {
  readonly root: string;
  private readonly fs = new NodeFileSystem();
  private reserved = false;
  constructor(
    root: string,
    private readonly backlog: BacklogMd = new BacklogCli(),
  ) {
    this.root = resolve(root);
  }

  /** Guard every existing descendant component; source symlinks are never followed. */
  private confined(
    relative: string,
    required: "file" | "directory" | "optional" = "optional",
  ): string {
    const safe = assertPortablePath(relative);
    if (
      existsSync(this.root) &&
      (!lstatSync(this.root).isDirectory() || lstatSync(this.root).isSymbolicLink())
    )
      throw new Error("workspace root must be a real directory");
    let current = this.root;
    const segments = safe.split("/");
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const stat = lstatSync(current, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink()) throw new Error(`symbolic source path is forbidden: ${relative}`);
      if (stat && index < segments.length - 1 && !stat.isDirectory())
        throw new Error(`source parent is not a directory: ${relative}`);
      if (
        index === segments.length - 1 &&
        required !== "optional" &&
        (!stat || (required === "file" ? !stat.isFile() : !stat.isDirectory()))
      )
        throw new Error(`missing ${required}: ${relative}`);
    }
    return current;
  }

  /** Bind captured bytes to a regular file descriptor and recheck its confined parent chain. */
  private readBytes(relativePath: string): Buffer {
    const path = this.confined(relativePath, "file");
    const expected = lstatSync(path, { bigint: true });
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const actual = fstatSync(descriptor, { bigint: true });
      if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino)
        throw new Error(`source identity changed during capture: ${relativePath}`);
      const bytes = readFileSync(descriptor);
      this.confined(relativePath, "file");
      const current = lstatSync(path, { bigint: true });
      const after = fstatSync(descriptor, { bigint: true });
      const canonical = relative(realpathSync.native(this.root), realpathSync.native(path));
      if (
        isAbsolute(canonical) ||
        canonical === ".." ||
        canonical.startsWith("../") ||
        canonical.startsWith("..\\") ||
        current.dev !== actual.dev ||
        current.ino !== actual.ino ||
        current.size !== actual.size ||
        current.mtimeNs !== actual.mtimeNs ||
        current.ctimeNs !== actual.ctimeNs ||
        after.size !== actual.size ||
        after.mtimeNs !== actual.mtimeNs ||
        after.ctimeNs !== actual.ctimeNs
      )
        throw new Error(`source changed or escaped during capture: ${relativePath}`);
      return bytes;
    } finally {
      closeSync(descriptor);
    }
  }

  /** Serialize WPM writers. An interrupted reservation is preserved for deliberate inspection. */
  private reserve<T>(action: () => T): T {
    const path = this.confined(".wpm-mutation.lock");
    const contents = stableJson({ schemaVersion: 1, request: randomUUID(), process: process.pid });
    try {
      this.fs.writeConfined(this.root, path, contents, { kind: "missing" });
    } catch (error) {
      throw new Error(
        `workspace mutation reservation unavailable; another writer or interrupted request owns .wpm-mutation.lock: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    this.reserved = true;
    try {
      return action();
    } finally {
      this.reserved = false;
      this.clearPending(".wpm-mutation.lock", contents);
    }
  }

  private snapshot(): SourceSnapshot {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(this.readBytes("package.yml"));
    const value: unknown = parse(text);
    return { source: parsePackage(value), text };
  }
  private writeText(relative: string, contents: string, previous?: string): void {
    if (contents === previous) {
      if (this.readBytes(relative).toString("utf8") !== previous)
        throw new Error(`confined write preimage changed: ${relative}`);
      return;
    }
    const path = this.confined(relative);
    const quarantineRoot = join(this.root, ".wpm-transactions", randomUUID());
    this.fs.writeConfined(
      this.root,
      path,
      contents,
      previous === undefined ? { kind: "missing" } : { kind: "text", content: previous },
      previous === undefined
        ? undefined
        : { root: quarantineRoot, path: join(quarantineRoot, "preimage") },
    );
  }
  private save(snapshot: SourceSnapshot, source: PackageSource): void {
    parsePackage(source);
    this.writeText(
      "package.yml",
      editSourceText(snapshot.text, snapshot.source, source),
      snapshot.text,
    );
  }

  private pending(relative: string, expected: unknown): { contents: string; resumed: boolean } {
    const contents = stableJson(expected);
    const path = this.confined(relative);
    const previous = existsSync(path) ? this.readBytes(relative).toString("utf8") : undefined;
    if (previous !== undefined && previous !== contents)
      throw new Error(`another interrupted request owns ${relative}; inspect it before retrying`);
    if (previous === undefined) this.writeText(relative, contents);
    return { contents, resumed: previous !== undefined };
  }

  private clearPending(relative: string, contents: string): void {
    const quarantineRoot = join(this.root, ".wpm-transactions", randomUUID());
    this.fs.removeFileConfined(this.root, this.confined(relative, "file"), contents, {
      root: quarantineRoot,
      path: join(quarantineRoot, "preimage"),
    });
  }

  /** Initialize source plus a separate native authoring backlog, without any recipient runtime. */
  init(name: string, dryRun = false): unknown {
    const source = emptyPackage(name);
    if (!dryRun && !this.reserved) {
      this.confined(".wpm-mutation.lock");
      mkdirSync(this.root, { recursive: true });
      return this.reserve(() => this.init(name, dryRun));
    }
    const pendingPath = ".wpm-pending-init.json";
    const hasPending = existsSync(this.confined(pendingPath));
    if (
      !hasPending &&
      (existsSync(this.confined("package.yml")) || existsSync(join(this.root, ".wpm-source")))
    )
      throw new Error("package source already exists");
    if (dryRun) return { dryRun, source, effects: ["package.yml", ".wpm-source/backlog/"] };
    const available = this.backlog.inspectAvailability();
    if (!available.available)
      throw new Error(`Backlog.md is required for authoring: ${available.reason}`);
    mkdirSync(this.root, { recursive: true });
    const pending = this.pending(pendingPath, { schemaVersion: 1, kind: "init", source });
    const authoring = join(this.root, ".wpm-source");
    if (!existsSync(authoring)) mkdirSync(authoring);
    const stat = lstatSync(authoring);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("authoring root changed during init");
    const inspection = this.nativeCall(authoring, () => this.backlog.inspectRoot(authoring));
    if (!inspection.valid) {
      if (readdirSync(authoring).length !== 0)
        throw new Error(
          "interrupted native backlog initialization requires inspection; preserved .wpm-source and pending request",
        );
      this.nativeCall(authoring, () => this.backlog.init(authoring, { taskPrefix: "operation" }));
    } else {
      const inventory = this.nativeCall(authoring, () =>
        this.backlog.inspectTaskInventory(authoring),
      );
      if (
        inspection.taskPrefix !== "operation" ||
        !inventory.configurationMatchesFreshDefaults ||
        inventory.activeEntries.length ||
        inventory.inactiveEntries.length ||
        inventory.unexpectedEntries.length
      )
        throw new Error("interrupted init has authored native changes; preserved for inspection");
    }
    if (existsSync(this.confined("package.yml"))) {
      if (stableJson(this.snapshot().source) !== stableJson(source))
        throw new Error("interrupted init conflicts with authored package.yml");
    } else this.writeText("package.yml", stringify(source));
    this.clearPending(pendingPath, pending.contents);
    return source;
  }

  /** Inspect declarations only; this does not fetch sources or activate an agent. */
  view(): PackageSource {
    return this.snapshot().source;
  }

  /** Backlog reads its native files itself; reject aliases before giving that process authority. */
  private assertNativeBoundary(authoring: string): void {
    const root = this.confined(".wpm-source", "directory");
    if (authoring !== root) throw new Error("unexpected native authoring root");
    const canonicalRoot = realpathSync.native(root);
    const visit = (path: string): void => {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
        throw new Error("native authoring source must contain only real files and directories");
      const difference = relative(canonicalRoot, realpathSync.native(path));
      if (
        isAbsolute(difference) ||
        difference === ".." ||
        difference.startsWith("../") ||
        difference.startsWith("..\\")
      )
        throw new Error("native authoring source escaped its workspace boundary");
      if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
    };
    visit(root);
  }

  private nativeCall<T>(authoring: string, call: () => T): T {
    this.assertNativeBoundary(authoring);
    const value = call();
    this.assertNativeBoundary(authoring);
    return value;
  }

  private authoringRoot(): string {
    // The hidden authoring folder is an internal boundary, never accepted as an authored payload path.
    const authoring = join(this.root, ".wpm-source");
    const stat = lstatSync(authoring, { throwIfNoEntry: false });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error("missing real .wpm-source authoring root");
    const inspection = this.nativeCall(authoring, () => this.backlog.inspectRoot(authoring));
    if (!inspection.valid)
      throw new Error(`invalid native authoring backlog: ${inspection.reason}`);
    return authoring;
  }

  /** Create one native Backlog task and associate its stable package operation identity. */
  addOperation(
    id: string,
    title: string,
    options: {
      prerequisites: string[];
      acceptanceCriteria: string[];
      setup?: string | null;
      dryRun: boolean;
    },
  ): unknown {
    assertSlug(id);
    if (!options.dryRun && !this.reserved)
      return this.reserve(() => this.addOperation(id, title, options));
    const snapshot = this.snapshot();
    if (snapshot.source.work.some((work) => work.operation === id))
      throw new Error(`operation already exists: ${id}`);
    if (!title.trim()) throw new Error("operation title must not be empty");
    if (
      !options.acceptanceCriteria.length ||
      options.acceptanceCriteria.some((criterion) => !criterion.trim())
    )
      throw new Error("operation requires nonempty observable acceptance criteria");
    const dependencies = options.prerequisites.map((prerequisite) => {
      const work = snapshot.source.work.find((entry) => entry.operation === prerequisite);
      if (!work) throw new Error(`unknown prerequisite: ${prerequisite}`);
      return work.task;
    });
    if (
      options.setup !== undefined &&
      options.setup !== null &&
      !Object.hasOwn(snapshot.source.workerSetup.setups, options.setup)
    )
      throw new Error(`unknown setup: ${options.setup}`);
    if (options.dryRun)
      return {
        dryRun: true,
        operation: id,
        title,
        dependencies,
        effects: ["native authoring task", "package.yml"],
      };
    const authoring = this.authoringRoot();
    const matches = this.nativeCall(authoring, () => this.backlog.listTasks(authoring))
      .map((task) => this.nativeCall(authoring, () => this.backlog.readTask(authoring, task.id)))
      .filter((task) => task.labels.includes(`wpm-operation:${id}`));
    if (matches.length > 1)
      throw new Error(`ambiguous native operation identity: ${id}; inspect its authoring tasks`);
    let task = matches[0];
    if (
      task &&
      (task.title !== title ||
        stableJson(task.dependencies.map((entry) => entry.toLowerCase()).sort()) !==
          stableJson(dependencies.map((entry) => entry.toLowerCase()).sort()) ||
        stableJson(task.acceptanceCriteria.map((criterion) => criterion.text)) !==
          stableJson(options.acceptanceCriteria))
    )
      throw new Error(
        `interrupted operation conflicts with native authored task: ${id}; inspect ${task.id}`,
      );
    if (!task) {
      const created = this.nativeCall(authoring, () =>
        this.backlog.createTask(authoring, {
          title,
          dependencies,
          acceptanceCriteria: options.acceptanceCriteria,
          labels: [`wpm-operation:${id}`],
        }),
      );
      task = this.nativeCall(authoring, () => this.backlog.readTask(authoring, created.id));
    }
    const work =
      options.setup === undefined
        ? { operation: id, task: task.id }
        : { operation: id, task: task.id, setup: options.setup };
    this.save(snapshot, { ...snapshot.source, work: [...snapshot.source.work, work] });
    return work;
  }

  /** Group membership controls selection only. Prerequisites remain native task dependencies. */
  setGroup(name: string, operations: string[], groups: string[], dryRun = false): unknown {
    if (!dryRun && !this.reserved)
      return this.reserve(() => this.setGroup(name, operations, groups, dryRun));

    assertSlug(name);
    const snapshot = this.snapshot();
    const source = parsePackage({
      ...snapshot.source,
      groups: {
        ...snapshot.source.groups,
        [name]: { operations: [...new Set(operations)], groups: [...new Set(groups)] },
      },
    });
    const selection = selectOperations(source, name);
    if (!dryRun) this.save(snapshot, source);
    return { name, selection, dryRun };
  }

  /** Create a plain source draft. Named drafts never silently become defaults. */
  createSetup(name?: string, dryRun = false): unknown {
    const selected = name ?? "default";
    assertSlug(selected);
    if (!dryRun && !this.reserved) return this.reserve(() => this.createSetup(name, dryRun));
    const snapshot = this.snapshot();
    const sourcePath = `worker-setup/${selected}`;
    const workerPath = `${sourcePath}/WORKER.md`;
    const contents = `# Worker setup: ${selected}\n\nUse the recipient's existing agent. Follow the selected operation and verify its acceptance criteria.\n`;
    const pendingPath = ".wpm-pending-setup.json";
    const hasPending = existsSync(this.confined(pendingPath));
    if (
      !hasPending &&
      (Object.hasOwn(snapshot.source.workerSetup.setups, selected) ||
        existsSync(this.confined(sourcePath)))
    )
      throw new Error(`setup declaration or source already exists: ${selected}`);
    const definition = { source: sourcePath, backend: "plain" as const };
    const prior = Object.hasOwn(snapshot.source.workerSetup.setups, selected)
      ? snapshot.source.workerSetup.setups[selected]
      : undefined;
    if (prior && stableJson(prior) !== stableJson(definition))
      throw new Error(`interrupted setup conflicts with authored declaration: ${selected}`);
    const setups = { ...snapshot.source.workerSetup.setups, [selected]: definition };
    const workerSetup =
      name === undefined
        ? { ...snapshot.source.workerSetup, default: selected, setups }
        : { ...snapshot.source.workerSetup, setups };
    const source = parsePackage({ ...snapshot.source, workerSetup });
    if (!dryRun) {
      const pending = this.pending(pendingPath, {
        schemaVersion: 1,
        kind: "plain-setup",
        name: selected,
        default: name === undefined,
        source: sourcePath,
        contents,
      });
      if (existsSync(this.confined(sourcePath))) {
        if (
          !pending.resumed ||
          readdirSync(this.confined(sourcePath, "directory")).length !== 1 ||
          this.readBytes(workerPath).toString("utf8") !== contents
        )
          throw new Error(`interrupted setup source has authored changes; preserved ${sourcePath}`);
      } else
        this.fs.writeConfined(this.root, this.confined(workerPath), contents, {
          kind: "missing",
          parentTree: "missing",
        });
      this.save(snapshot, source);
      this.clearPending(pendingPath, pending.contents);
    }
    return { name: selected, ...definition, default: name === undefined, dryRun };
  }

  /** Reference an existing confined source, without copying, fetching, resolving or installing it. */
  addSetup(
    path: string,
    name: string,
    requestedBackend: "plain" | "apm" | undefined,
    dryRun = false,
  ): unknown {
    if (!dryRun && !this.reserved)
      return this.reserve(() => this.addSetup(path, name, requestedBackend, dryRun));

    assertSlug(name);
    const snapshot = this.snapshot();
    const source = assertSourcePath(path);
    this.confined(source, "directory");
    const backend =
      requestedBackend ??
      (existsSync(this.confined(`${source}/apm.yml`))
        ? "apm"
        : existsSync(this.confined(`${source}/WORKER.md`))
          ? "plain"
          : undefined);
    if (!backend)
      throw new Error(`unresolved setup source format: ${source}; no WORKER.md or apm.yml`);
    this.confined(`${source}/${backend === "plain" ? "WORKER.md" : "apm.yml"}`, "file");
    const previous = Object.hasOwn(snapshot.source.workerSetup.setups, name)
      ? snapshot.source.workerSetup.setups[name]
      : undefined;
    if (previous) {
      if (assertSourcePath(previous.source) === source && previous.backend === backend)
        return { name, ...previous, unchanged: true };
      throw new Error(`setup name already references another source: ${name}`);
    }
    if (!dryRun)
      this.save(snapshot, {
        ...snapshot.source,
        workerSetup: {
          ...snapshot.source.workerSetup,
          setups: { ...snapshot.source.workerSetup.setups, [name]: { source, backend } },
        },
      });
    return { name, source, backend, dryRun };
  }

  /** Explicit native composition phases; only selected setup sources and owned target projects are affected. */
  apmPhase(
    name: string,
    phase: "lock" | "install" | "compile",
    target: ApmTarget | undefined,
    tool: ApmTool,
    dryRun = false,
  ): unknown {
    assertSlug(name);
    const source = this.snapshot().source;
    const definition = Object.hasOwn(source.workerSetup.setups, name)
      ? source.workerSetup.setups[name]
      : undefined;
    if (definition?.backend !== "apm") throw new Error(`setup is not an APM definition: ${name}`);
    if (phase !== "lock" && phase !== "install" && phase !== "compile")
      throw new Error("unknown APM phase");
    if (phase !== "lock" && target !== "codex" && target !== "claude")
      throw new Error("select a qualified APM target explicitly");
    if (dryRun)
      return {
        dryRun: true,
        name,
        backend: "apm",
        phase,
        target: target ?? null,
        toolVerified: false,
        agentLaunched: false,
        effects:
          phase === "lock"
            ? ["native apm.lock.yaml resolution"]
            : ["owned native target project", "composition receipt"],
      };
    if (!this.reserved) return this.reserve(() => this.apmPhase(name, phase, target, tool, dryRun));
    const backend = new ApmBackend(this.root, name, definition.source, tool);
    switch (phase) {
      case "lock":
        return backend.lock();
      case "install":
        if (target === undefined) throw new Error("missing APM target");
        return backend.install(target);
      case "compile":
        if (target === undefined) throw new Error("missing APM target");
        return backend.compile(target);
    }
  }

  /** Select only the explicit default; a lone named setup is not a default. */
  viewSetup(name?: string): unknown {
    const source = this.snapshot().source;
    const selected = name ?? source.workerSetup.default;
    if (selected === undefined) {
      if (Object.keys(source.workerSetup.setups).length > 0)
        throw new Error("no default setup; select a name explicitly");
      return { setup: null, message: "no additional worker setup" };
    }
    const definition = Object.hasOwn(source.workerSetup.setups, selected)
      ? source.workerSetup.setups[selected]
      : undefined;
    if (!definition) throw new Error(`unknown setup: ${selected}`);
    return {
      name: selected,
      ...definition,
      representation:
        definition.backend === "plain"
          ? "plain instructions for existing agent"
          : "pinned APM native project composition; instructions and skills only",
      content: new TextDecoder("utf-8", { fatal: true }).decode(
        this.readBytes(
          `${assertSourcePath(definition.source)}/${definition.backend === "plain" ? "WORKER.md" : "apm.yml"}`,
        ),
      ),
    };
  }

  /** Removing declarations preserves authored files and preflights all references before writing. */
  removeSetups(names: string[], dryRun = false): unknown {
    if (!dryRun && !this.reserved) return this.reserve(() => this.removeSetups(names, dryRun));
    const snapshot = this.snapshot();
    const source = removeSetups(snapshot.source, names);
    if (!dryRun) this.save(snapshot, source);
    return { removed: [...new Set(names)], sourcePreserved: true, dryRun };
  }

  private compileOperations(source: PackageSource): CompiledOperation[] {
    if (source.work.length === 0) return [];
    const root = this.authoringRoot();
    const byTask = new Map(source.work.map((work) => [work.task.toLowerCase(), work.operation]));
    const result = source.work
      .map((work) => {
        const task = this.nativeCall(root, () => this.backlog.readTask(root, work.task));
        if (!task.labels.includes(`wpm-operation:${work.operation}`))
          throw new Error(`native task lacks stable operation identity: ${work.operation}`);
        if (task.acceptanceCriteria.length === 0)
          throw new Error(`operation requires observable acceptance criteria: ${work.operation}`);
        const prerequisites = task.dependencies
          .map((dependency) => {
            const operation = byTask.get(dependency.toLowerCase());
            if (!operation) throw new Error(`unregistered operation prerequisite: ${dependency}`);
            return operation;
          })
          .sort();
        return {
          id: work.operation,
          prerequisites,
          setup: effectiveSetup(source, work),
          content: renderTask(task, work.operation),
        };
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error(`cyclic operation prerequisite: ${id}`);
      if (done.has(id)) return;
      visiting.add(id);
      for (const prerequisite of result.find((operation) => operation.id === id)?.prerequisites ??
        [])
        visit(prerequisite);
      visiting.delete(id);
      done.add(id);
    };
    for (const operation of result) visit(operation.id);
    return result;
  }

  private capture(): {
    files: CapturedFile[];
    source: PackageSource;
    operations: CompiledOperation[];
  } {
    const snapshot = this.snapshot();
    const source = snapshot.source;
    const operations = this.compileOperations(source);
    const files: CapturedFile[] = [];
    for (const path of [...source.files].sort()) files.push({ path, bytes: this.readBytes(path) });
    for (const [name, definition] of Object.entries(source.workerSetup.setups).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      if (definition.backend === "apm") {
        for (const file of preparedApmSetup(this.root, name, definition.source))
          files.push({ path: `worker-setup/${name}/${file.path}`, bytes: file.bytes });
        continue;
      }
      const sourcePath = `${assertSourcePath(definition.source)}/WORKER.md`;
      files.push({
        path: `worker-setup/${name}/WORKER.md`,
        bytes: this.readBytes(sourcePath),
      });
    }
    const contract = {
      schemaVersion: 1,
      name: source.name,
      version: source.version,
      operations: operations.map((operation) => ({
        id: operation.id,
        prerequisites: operation.prerequisites,
        setup: operation.setup,
      })),
      groups: source.groups,
      workerSetup: {
        default: source.workerSetup.default ?? null,
        names: Object.keys(source.workerSetup.setups).sort(),
      },
    };
    files.push({ path: "contract.json", bytes: Buffer.from(stableJson(contract)) });
    for (const operation of operations)
      files.push({ path: `operations/${operation.id}.md`, bytes: Buffer.from(operation.content) });
    files.push({
      path: "AGENTS.md",
      bytes: Buffer.from(
        "# Work package\n\nUse your existing agent. Read contract.json and select an operation or group with the user. Group membership selects work; only prerequisites determine readiness. Read each operations/<id>.md and its assigned worker-setup/<name>/WORKER.md before acting. A null setup requires no extra context. Explain requirements, obtain permission for external effects, perform the work, and verify every acceptance criterion. Keep mutable work state outside this immutable package. WPM and Backlog.md are not required on the recipient machine.\n",
      ),
    });
    files.push({ path: "CLAUDE.md", bytes: Buffer.from("@AGENTS.md\n") });
    if (this.readBytes("package.yml").toString("utf8") !== snapshot.text)
      throw new Error("package source changed during capture");
    assertPortableTree(files.map(({ path }) => ({ path, kind: "file" })));
    return {
      files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      source,
      operations,
    };
  }

  /** Check actual authored content, associations and native task prerequisites without effects. */
  check(): unknown {
    const { source, operations, files } = this.capture();
    return {
      valid: true,
      name: source.name,
      version: source.version,
      operations: operations.length,
      files: files.map((file) => file.path),
      agentSupport: {
        generic: "static instructions",
        codex: "project AGENTS.md",
        claude: "project CLAUDE.md import",
        loaded: false,
      },
    };
  }

  private lockContents(capture: ReturnType<VnextWorkspace["capture"]>): string {
    return stableJson({
      schemaVersion: 1,
      source: capture.source,
      files: capture.files.map(({ path, bytes }) => ({ path, sha256: digest(bytes) })),
    });
  }

  /** Intentionally record local source integrity. Plain packages require no synthetic APM lock. */
  lock(dryRun = false): unknown {
    if (!dryRun && !this.reserved) return this.reserve(() => this.lock(dryRun));
    const capture = this.capture();
    const contents = this.lockContents(capture);
    const path = this.confined("wpm.lock.json");
    if (!dryRun)
      this.writeText(
        "wpm.lock.json",
        contents,
        existsSync(path) ? readFileSync(path, "utf8") : undefined,
      );
    return {
      dryRun,
      sha256: digest(Buffer.from(contents)),
      dependencies: [],
      resolver: "local-source-integrity",
    };
  }

  /** Rehearse portable artifact extraction in an owned disposable directory. This never launches an agent. */
  test(dryRun = false): unknown {
    if (!dryRun && !this.reserved) return this.reserve(() => this.test(dryRun));
    if (dryRun)
      return {
        dryRun: true,
        effects: ["temporary extraction rehearsal", "test-results/vnext-latest.json"],
        agentExecution: false,
      };
    const directory = mkdtempSync(join(tmpdir(), "wpm-vnext-rehearsal-"));
    let outcome: {
      passed: boolean;
      kind: string;
      agentExecution: boolean;
      archiveSha256?: string;
      error?: string;
    } = { passed: false, kind: "static-recipient-artifact-rehearsal", agentExecution: false };
    try {
      const capture = this.capture();
      const bytes = createDeterministicTarball(capture.files);
      const archive = join(directory, "package.tgz");
      const recipient = join(directory, "recipient");
      mkdirSync(recipient);
      writeFileSync(archive, bytes);
      execaSync("tar", ["-xzf", archive, "-C", recipient], { reject: true });
      for (const file of capture.files) {
        if (!readFileSync(join(recipient, file.path)).equals(file.bytes))
          throw new Error(`recipient content mismatch: ${file.path}`);
      }
      outcome = { ...outcome, passed: true, archiveSha256: digest(bytes) };
      return outcome;
    } catch (error) {
      outcome = { ...outcome, error: error instanceof Error ? error.message : String(error) };
      throw error;
    } finally {
      rmSync(directory, { recursive: true, force: true });
      const path = this.confined("test-results/vnext-latest.json");
      this.writeText(
        "test-results/vnext-latest.json",
        stableJson(outcome),
        existsSync(path) ? readFileSync(path, "utf8") : undefined,
      );
    }
  }

  /** Capture and build once; every tar header, ordering and gzip timestamp is deterministic. */
  build(dryRun = false): unknown {
    if (!dryRun && !this.reserved) return this.reserve(() => this.build(dryRun));
    const capture = this.capture();
    const lock = this.confined("wpm.lock.json");
    if (
      existsSync(lock) &&
      this.readBytes("wpm.lock.json").toString("utf8") !== this.lockContents(capture)
    )
      throw new Error("source integrity lock is stale; run wpm vnext lock intentionally");
    const relative = `builds/${capture.source.name}-${capture.source.version}.tgz`;
    const bytes = createDeterministicTarball(capture.files);
    if (!dryRun) {
      const path = this.confined(relative);
      mkdirSync(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, bytes, { flag: "wx" });
        this.confined(relative);
        renameSync(temporary, path);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
    return {
      dryRun,
      archive: relative,
      sha256: digest(bytes),
      files: capture.files.map((file) => file.path),
    };
  }
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function renderTask(task: TaskRecord, id: string): string {
  return `# ${task.title}\n\nOperation: wpm-operation:${id}\n\n${task.description ?? ""}\n\n## Acceptance criteria\n\n${task.acceptanceCriteria.map((criterion) => `- [ ] ${criterion.text}`).join("\n")}\n${task.definitionOfDone.length ? `\n## Definition of done\n\n${task.definitionOfDone.map((criterion) => `- [ ] ${criterion.text}`).join("\n")}\n` : ""}`;
}

/** Minimal portable USTAR writer: regular files only, no shell, symlinks, wall-clock metadata or owner data. */
function createDeterministicTarball(files: CapturedFile[]): Buffer {
  assertPortableTree(files.map(({ path }) => ({ path, kind: "file" })));
  const chunks: Buffer[] = [];
  for (const { path, bytes } of files) {
    assertPortablePath(path);
    if (Buffer.byteLength(path) > 100)
      throw new Error(`archive path exceeds portable USTAR name limit: ${path}`);
    const header = Buffer.alloc(512);
    header.write(path, 0, 100, "utf8");
    const octal = (value: number, offset: number, width: number): void => {
      const encoded = value.toString(8).padStart(width - 1, "0");
      if (encoded.length >= width) throw new Error("archive exceeds USTAR numeric limit");
      header.write(`${encoded}\0`, offset, width, "ascii");
    };
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(bytes.length, 124, 12);
    octal(0, 136, 12);
    header.fill(0x20, 148, 156);
    header.write("0", 156, 1);
    header.write("ustar\0", 257, 6);
    header.write("00", 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    chunks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  const compressed = gzipSync(Buffer.concat(chunks), { level: 9 });
  compressed[9] = 255; // RFC 1952: portable unknown OS; never encode the build host.
  return compressed;
}
