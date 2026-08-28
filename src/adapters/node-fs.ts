import { createHash, randomBytes } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  cpSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  opendirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";
import type {
  AliasResult,
  ConfinedQuarantine,
  ConfinedWritePrecondition,
  DirEntry,
  FileSystem,
  MutationCapability,
  PathInspection,
} from "../core/ports/filesystem.js";
import { compareCodeUnits } from "../util/code-unit-order.js";
import { ensureSymlinkOrCopy, type SymlinkStrategyOptions } from "../util/symlink.js";

interface NodeTreeEntry {
  readonly path: string;
  readonly kind: "directory" | "file" | "symbolic-link" | "other";
  readonly sha256?: string;
  readonly target?: string;
}

interface NodePathIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

/**
 * The real {@link FileSystem} adapter, backed by `node:fs` synchronous APIs (the core is synchronous —
 * doc 13 §0). It lives under `src/adapters/`, outside the pure core, so using `node:fs`/`node:path`/
 * `node:crypto` here is correct — the import-boundary rule forbids those only under `src/core/`.
 *
 * The composition root (`cli.ts`, task-27) constructs one of these; tests use {@link MemoryFileSystem}
 * instead.
 */
export class NodeFileSystem implements FileSystem {
  /**
   * @param aliasOptions - Optional injected symlink/copy strategy (platform + primitives), forwarded to
   *   {@link ensureSymlinkOrCopy}. Defaults to the real environment; tests inject `platform: "win32"` to
   *   exercise the copy fallback.
   */
  constructor(private readonly aliasOptions: SymlinkStrategyOptions = {}) {}

  /** Deterministic subclass seam for exercising a change after the last file preimage read. */
  protected beforeConfinedFilePublication(_path: string): void {}

  /** Deterministic subclass seam after private staging but before the public preimage is revalidated. */
  protected afterConfinedFileStaging(_path: string): void {}

  /** Deterministic subclass seam after exact prior bytes are retained but before public displacement. */
  protected beforeConfinedFileDetachment(_path: string, _quarantinePath: string): void {}

  /** Deterministic subclass seam after atomic public displacement but before private evidence validation. */
  protected afterConfinedFileDisplacement(_path: string, _displacedPath: string): void {}

  /** Deterministic subclass seam for exercising interruption/races after a public file is displaced. */
  protected afterConfinedFileDetachment(_path: string, _quarantinePath: string): void {}

  /** Deterministic subclass seam after desired bytes are public but before private cleanup. */
  protected afterConfinedFilePublication(_path: string, _quarantinePath: string): void {}

  /** Deterministic subclass seam for exercising a change after the last tree preimage read. */
  protected beforeConfinedTreeDetachment(_path: string): void {}

  /** Deterministic subclass seam after private tree setup but before public tree revalidation. */
  protected afterConfinedTreePrivatePreparation(_path: string): void {}

  /** Deterministic subclass seam for exercising interruption/races after a public tree is displaced. */
  protected afterConfinedTreeDetachment(_path: string, _quarantinePath: string): void {}

  /** Deterministic test seam immediately before request-bound displaced-tree cleanup. */
  protected beforeConfinedTreeCleanup(_displacedPath: string): void {}

  /** Deterministic test seam after the staged private link is retired but before prior cleanup. */
  protected afterConfinedStagedCleanup(_stagedPath: string): void {}

  private assertConfinedMutationPath(
    confinementRoot: string,
    path: string,
    finalKind: "file-or-missing" | "directory",
  ): void {
    const root = resolve(confinementRoot);
    const target = resolve(path);
    const compare = (value: string): string =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (compare(realpathSync.native(root)) !== compare(root)) {
      throw new Error(`confined mutation root is not canonical: ${confinementRoot}`);
    }
    const relativePath = relative(root, target);
    if (
      relativePath.length === 0 ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`confined mutation path escapes its root: ${path}`);
    }
    let current = root;
    const segments = relativePath.split(sep);
    for (let index = 0; index < segments.length; index += 1) {
      current = join(current, segments[index] as string);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (finalKind === "directory") {
            throw new Error(`confined removal path is missing: ${current}`);
          }
          return;
        }
        throw error;
      }
      if (stat.isSymbolicLink()) {
        throw new Error(`confined mutation path contains a symbolic link: ${current}`);
      }
      const final = index === segments.length - 1;
      if (!final && !stat.isDirectory()) {
        throw new Error(`confined mutation ancestor is not a directory: ${current}`);
      }
      if (final && finalKind === "file-or-missing" && !stat.isFile()) {
        throw new Error(`confined write target is not a regular file: ${current}`);
      }
      if (final && finalKind === "directory" && !stat.isDirectory()) {
        throw new Error(`confined removal target is not a regular directory: ${current}`);
      }
    }
  }

  private treeSnapshot(root: string): {
    readonly entries: readonly NodeTreeEntry[];
    readonly fingerprint: string;
  } {
    const entries: NodeTreeEntry[] = [];
    const walk = (directory: string, relativeRoot: string): void => {
      const listed = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        compareCodeUnits(left.name, right.name),
      );
      for (const entry of listed) {
        const absolute = join(directory, entry.name);
        const relativePath =
          relativeRoot.length === 0 ? entry.name : `${relativeRoot}/${entry.name}`;
        const stat = lstatSync(absolute);
        if (stat.isDirectory()) {
          entries.push({ path: relativePath, kind: "directory" });
          walk(absolute, relativePath);
        } else if (stat.isFile()) {
          entries.push({
            path: relativePath,
            kind: "file",
            sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
          });
        } else if (stat.isSymbolicLink()) {
          entries.push({
            path: relativePath,
            kind: "symbolic-link",
            target: readlinkSync(absolute),
          });
        } else {
          entries.push({ path: relativePath, kind: "other" });
        }
      }
    };
    walk(root, "");
    return {
      entries,
      fingerprint: `sha256:${createHash("sha256")
        .update(JSON.stringify(entries), "utf8")
        .digest("hex")}`,
    };
  }

  private treeFingerprint(root: string): string {
    return this.treeSnapshot(root).fingerprint;
  }

  private treeIsExactSubset(candidateRoot: string, completeRoot: string): boolean {
    const candidate = this.treeSnapshot(candidateRoot).entries;
    const complete = this.treeSnapshot(completeRoot).entries;
    return candidate.every((entry) =>
      complete.some((expected) => JSON.stringify(expected) === JSON.stringify(entry)),
    );
  }

  private lstatIfPresent(path: string): ReturnType<typeof lstatSync> | undefined {
    try {
      return lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private assertWriteFilePreimage(path: string, expected: ConfinedWritePrecondition): void {
    const stat = this.lstatIfPresent(path);
    if (expected.kind === "missing") {
      if (stat !== undefined) throw new Error(`confined write preimage is not missing: ${path}`);
      return;
    }
    if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`confined write preimage is not a regular file: ${path}`);
    }
    if (expected.kind === "text" && readFileSync(path, "utf8") !== expected.content) {
      throw new Error(`confined write text preimage changed: ${path}`);
    }
    if (
      expected.kind === "sha256" &&
      createHash("sha256").update(readFileSync(path)).digest("hex") !== expected.sha256
    ) {
      throw new Error(`confined write digest preimage changed: ${path}`);
    }
  }

  private assertWriteParentPreimage(
    path: string,
    expected: ConfinedWritePrecondition,
    phase: "initial" | "commit" | "displaced" | "published",
  ): void {
    if (expected.parentTree === undefined) return;
    const parent = dirname(path);
    const stat = this.lstatIfPresent(parent);
    if (expected.parentTree === "missing" && phase === "initial") {
      if (stat !== undefined) {
        throw new Error(`confined write parent-tree preimage is not missing: ${parent}`);
      }
      return;
    }
    if (stat === undefined || !stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`confined write parent tree is not a regular directory: ${parent}`);
    }
    const expectedEntries = phase === "published" ? [basename(path)] : [];
    if (expected.parentTree === "one-file" && (phase === "initial" || phase === "commit")) {
      expectedEntries.push(basename(path));
    }
    const entries = readdirSync(parent).sort(compareCodeUnits);
    if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
      throw new Error(`confined write parent tree changed: ${parent}`);
    }
  }

  private ensureConfinedDirectoryChain(confinementRoot: string, directory: string): string[] {
    const root = resolve(confinementRoot);
    const target = resolve(directory);
    const relativePath = relative(root, target);
    if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error(`confined mutation directory escapes its root: ${directory}`);
    }
    const created: string[] = [];
    try {
      let current = root;
      for (const segment of relativePath.split(sep).filter((value) => value.length > 0)) {
        current = join(current, segment);
        const stat = this.lstatIfPresent(current);
        if (stat === undefined) {
          mkdirSync(current);
          created.push(current);
          const createdStat = lstatSync(current);
          if (!createdStat.isDirectory() || createdStat.isSymbolicLink()) {
            throw new Error(`confined created ancestor is not a regular directory: ${current}`);
          }
        } else if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error(`confined mutation ancestor is not a regular directory: ${current}`);
        }
      }
      return created;
    } catch (error) {
      for (const createdPath of created.reverse()) {
        try {
          rmdirSync(createdPath);
        } catch {
          // Preserve anything that appeared in a newly created directory.
        }
      }
      throw error;
    }
  }

  private assertQuarantine(
    confinementRoot: string,
    quarantine: ConfinedQuarantine,
    finalKind: "file-or-missing" | "directory" = "file-or-missing",
  ): { readonly root: string; readonly path: string } {
    const root = resolve(quarantine.root);
    const path = resolve(quarantine.path);
    const confinement = resolve(confinementRoot);
    const rootRelative = relative(confinement, root);
    const pathRelative = relative(root, path);
    if (
      rootRelative.length === 0 ||
      rootRelative === ".." ||
      rootRelative.startsWith(`..${sep}`) ||
      isAbsolute(rootRelative) ||
      pathRelative.length === 0 ||
      pathRelative === ".." ||
      pathRelative.startsWith(`..${sep}`) ||
      isAbsolute(pathRelative)
    ) {
      throw new Error(
        "confined quarantine must be a strict descendant of HOME and its request root",
      );
    }
    if (this.lstatIfPresent(path) !== undefined || finalKind === "file-or-missing") {
      this.assertConfinedMutationPath(confinement, path, finalKind);
    } else {
      this.assertConfinedMutationPath(confinement, path, "file-or-missing");
    }
    return { root, path };
  }

  private fileDigestIfRegular(path: string): string | undefined {
    const stat = this.lstatIfPresent(path);
    if (stat === undefined) return undefined;
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`confined private file is not regular: ${path}`);
    }
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  private expectedDigest(
    expected: Exclude<ConfinedWritePrecondition, { kind: "missing" }>,
  ): string {
    return expected.kind === "sha256"
      ? expected.sha256
      : createHash("sha256").update(expected.content, "utf8").digest("hex");
  }

  private cleanupEmptyQuarantine(quarantineRoot: string, slot: string): void {
    try {
      const stat = this.lstatIfPresent(quarantineRoot);
      if (stat?.isDirectory() && !stat.isSymbolicLink()) {
        for (const entry of readdirSync(quarantineRoot, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
          const child = join(quarantineRoot, entry.name);
          if (readdirSync(child).length === 0) rmdirSync(child);
        }
      }
    } catch {
      // Preserve changed, nested, or non-empty private evidence for the operation's next exact inventory.
    }
    let current = dirname(slot);
    const stop = dirname(quarantineRoot);
    while (current !== stop && current !== dirname(current)) {
      try {
        rmdirSync(current);
      } catch {
        if (this.lstatIfPresent(current) !== undefined) return;
      }
      current = dirname(current);
    }
  }

  private captureIdentities(paths: readonly string[]): ReadonlyMap<string, NodePathIdentity> {
    return new Map(paths.map((path) => [path, this.pathIdentity(path)] as const));
  }

  private pathIdentity(path: string): NodePathIdentity {
    const stat = lstatSync(path, { bigint: true });
    return {
      dev: stat.dev,
      ino: stat.ino,
    };
  }

  private sameIdentity(left: NodePathIdentity, right: NodePathIdentity): boolean {
    return left.dev === right.dev && left.ino === right.ino;
  }

  private directoryIdentityIfPresent(path: string): NodePathIdentity | undefined {
    const stat = this.lstatIfPresent(path);
    if (stat === undefined) return undefined;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`confined write parent is not a regular directory: ${path}`);
    }
    return this.pathIdentity(path);
  }

  private assertDirectoryIdentity(path: string, expected: NodePathIdentity | undefined): void {
    const actual = this.directoryIdentityIfPresent(path);
    if (expected === undefined || actual === undefined || !this.sameIdentity(actual, expected)) {
      throw new Error(`confined write parent identity changed: ${path}`);
    }
  }

  private removeCreatedDirectoryIfUnchanged(
    confinementRoot: string,
    path: string,
    identity: NodePathIdentity | undefined,
  ): void {
    if (identity === undefined) return;
    try {
      this.assertConfinedMutationPath(confinementRoot, path, "directory");
      const actual = this.pathIdentity(path);
      if (!this.sameIdentity(actual, identity) || readdirSync(path).length > 0) {
        return;
      }
      rmdirSync(path);
    } catch {
      // Preserve a replaced, non-empty, or no-longer-confined directory.
    }
  }

  /** @inheritdoc */
  read(path: string): string {
    return readFileSync(path, "utf8");
  }

  /**
   * Write `content` to `path` atomically (doc 13 §3): create the parent directory, write to a unique temp
   * file in the **same** directory, then `renameSync` it over the target (rename is atomic within one
   * filesystem). If anything fails before the rename, the temp file is unlinked so no `.tmp` residue is left
   * and the pre-existing target is untouched.
   *
   * @inheritdoc
   */
  write(path: string, content: string): void {
    this.writeAtomic(path, content);
  }

  /** @inheritdoc */
  writeConfined(
    confinementRoot: string,
    path: string,
    content: string,
    expected: ConfinedWritePrecondition,
    quarantine?: ConfinedQuarantine,
  ): void {
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    const desiredDigest = createHash("sha256").update(content, "utf8").digest("hex");
    const privateSlot =
      quarantine === undefined ? undefined : this.assertQuarantine(confinementRoot, quarantine);
    if (expected.kind !== "missing" && privateSlot === undefined) {
      throw new Error("confined replacement requires request-bound quarantine evidence");
    }
    const parent = dirname(path);
    const stagingDirectory =
      privateSlot === undefined
        ? expected.parentTree === undefined
          ? parent
          : dirname(parent)
        : dirname(privateSlot.path);
    const windowsSameParentTransient =
      process.platform === "win32" && privateSlot === undefined && stagingDirectory === parent;
    const privateSlotFromParent =
      privateSlot === undefined ? undefined : relative(parent, privateSlot.path);
    // Windows directory-search handles can block retirement of request-bound evidence below the directory
    // they inspect. Other quarantine geometries retain the shorter publication-only release window.
    const windowsNestedPrivateCleanup =
      process.platform === "win32" &&
      privateSlotFromParent !== undefined &&
      privateSlotFromParent.length > 0 &&
      privateSlotFromParent !== ".." &&
      !privateSlotFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(privateSlotFromParent);
    const beforeDigest = expected.kind === "missing" ? undefined : this.expectedDigest(expected);
    let initialPublicDescriptor: number | undefined;
    let initialPublicIdentity: NodePathIdentity | undefined;
    let initialPublicDigest: string | undefined;
    let initialPublicBytes: Buffer | undefined;
    try {
      const initialPublicStat = this.lstatIfPresent(path);
      if (initialPublicStat !== undefined) {
        if (!initialPublicStat.isFile() || initialPublicStat.isSymbolicLink()) {
          throw new Error(`confined public preimage is not a regular file: ${path}`);
        }
        initialPublicDescriptor = openSync(path, constants.O_RDONLY);
        const descriptorStat = fstatSync(initialPublicDescriptor, { bigint: true });
        initialPublicIdentity = { dev: descriptorStat.dev, ino: descriptorStat.ino };
        if (!this.sameIdentity(this.pathIdentity(path), initialPublicIdentity)) {
          closeSync(initialPublicDescriptor);
          initialPublicDescriptor = undefined;
          throw new Error(`confined public preimage changed during initial capture: ${path}`);
        }
        initialPublicBytes = readFileSync(initialPublicDescriptor);
        initialPublicDigest = createHash("sha256").update(initialPublicBytes).digest("hex");
      }
    } catch (error) {
      if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
      throw error;
    }
    const retainedBeforePreparation =
      privateSlot === undefined ? undefined : this.fileDigestIfRegular(privateSlot.path);
    if (retainedBeforePreparation !== undefined && retainedBeforePreparation !== beforeDigest) {
      if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
      throw new Error(`confined retained preimage changed: ${privateSlot?.path}`);
    }
    if (expected.kind !== "missing") {
      if (initialPublicDigest === undefined && retainedBeforePreparation === undefined) {
        if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
        throw new Error(`confined write preimage is not a regular file: ${path}`);
      }
      if (
        initialPublicDigest !== undefined &&
        initialPublicDigest !== beforeDigest &&
        !(initialPublicDigest === desiredDigest && retainedBeforePreparation === beforeDigest)
      ) {
        if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
        throw new Error(
          initialPublicDigest === desiredDigest
            ? `confined desired-looking public replacement lacks its retained prior bytes: ${path}`
            : `confined write digest preimage changed: ${path}`,
        );
      }
    }
    let createdPrivate: string[] = [];
    let createdPrivateIdentities: ReadonlyMap<string, NodePathIdentity> = new Map();
    let publicationParentIdentity: NodePathIdentity | undefined;
    let publicationParentHandle: ReturnType<typeof opendirSync> | undefined;
    try {
      createdPrivate = this.ensureConfinedDirectoryChain(confinementRoot, stagingDirectory);
      createdPrivateIdentities = this.captureIdentities(createdPrivate);
      publicationParentIdentity = this.directoryIdentityIfPresent(parent);
      publicationParentHandle =
        publicationParentIdentity === undefined ? undefined : opendirSync(parent);
    } catch (error) {
      if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
      throw error;
    }
    const stagedPath = privateSlot === undefined ? undefined : `${privateSlot.path}.staged`;
    const displacedPath = privateSlot === undefined ? undefined : `${privateSlot.path}.displaced`;
    const createdPublic: string[] = [];
    const createdPublicIdentities = new Map<string, NodePathIdentity>();
    let createdOneFileParent = false;
    let tmp: string | undefined;
    try {
      if (
        privateSlot !== undefined &&
        expected.kind !== "missing" &&
        retainedBeforePreparation === undefined &&
        initialPublicDigest === beforeDigest &&
        initialPublicBytes !== undefined
      ) {
        writeFileSync(privateSlot.path, initialPublicBytes, { flag: "wx" });
        if (this.fileDigestIfRegular(privateSlot.path) !== beforeDigest) {
          throw new Error(`confined retained preimage changed during capture: ${privateSlot.path}`);
        }
      }
      let stagedWasPresent = false;
      if (stagedPath !== undefined) {
        const stagedDigest = this.fileDigestIfRegular(stagedPath);
        stagedWasPresent = stagedDigest !== undefined;
        if (stagedDigest === undefined) {
          writeFileSync(stagedPath, content, { encoding: "utf8", flag: "wx" });
        } else if (stagedDigest !== desiredDigest) {
          throw new Error(`confined staged bytes changed: ${stagedPath}`);
        }
        tmp = stagedPath;
      } else {
        tmp = join(stagingDirectory, `.${randomBytes(16).toString("hex")}.tmp`);
        writeFileSync(tmp, content, { encoding: "utf8", flag: "wx" });
      }

      this.afterConfinedFileStaging(path);

      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      let publicDigest = this.fileDigestIfRegular(path);
      if (initialPublicIdentity === undefined) {
        if (publicDigest !== undefined) {
          throw new Error(`confined public path raced while private bytes were staged: ${path}`);
        }
      } else if (
        publicDigest !== initialPublicDigest ||
        !this.sameIdentity(this.pathIdentity(path), initialPublicIdentity)
      ) {
        throw new Error(
          `confined public preimage changed while private bytes were staged: ${path}`,
        );
      }
      let retainedDigest =
        privateSlot === undefined ? undefined : this.fileDigestIfRegular(privateSlot.path);
      let displacedDigest =
        displacedPath === undefined ? undefined : this.fileDigestIfRegular(displacedPath);
      const resumesEmptyCreatedParent =
        expected.kind === "missing" &&
        expected.parentTree === "missing" &&
        publicDigest === undefined &&
        stagedPath !== undefined &&
        stagedWasPresent &&
        this.fileDigestIfRegular(stagedPath) === desiredDigest;

      if (
        expected.kind !== "missing" &&
        publicDigest === desiredDigest &&
        retainedDigest === undefined
      ) {
        throw new Error(
          `confined desired-looking public replacement lacks its retained prior bytes: ${path}`,
        );
      }

      this.assertWriteParentPreimage(
        path,
        expected,
        publicDigest === desiredDigest
          ? "published"
          : resumesEmptyCreatedParent
            ? "commit"
            : retainedDigest === undefined
              ? "initial"
              : publicDigest === undefined
                ? "displaced"
                : "initial",
      );

      if (retainedDigest !== undefined && retainedDigest !== beforeDigest) {
        throw new Error(`confined retained preimage changed: ${privateSlot?.path}`);
      }
      if (displacedDigest !== undefined) {
        if (retainedDigest !== beforeDigest || displacedDigest !== beforeDigest) {
          throw new Error(`confined displaced public evidence changed: ${displacedPath}`);
        }
        if (publicDigest !== undefined) {
          throw new Error(
            `confined public path raced while displaced bytes were retained: ${path}`,
          );
        }
        if (publicDigest === undefined) {
          unlinkSync(displacedPath as string);
          displacedDigest = undefined;
          this.afterConfinedFileDetachment(path, privateSlot?.path as string);
          if (this.lstatIfPresent(path) !== undefined) {
            throw new Error(`confined public path raced after detachment: ${path}`);
          }
        }
      }
      if (retainedDigest === undefined && publicDigest !== desiredDigest) {
        if (expected.parentTree !== "missing") {
          this.assertWriteParentPreimage(path, expected, "commit");
        }
        this.assertWriteFilePreimage(path, expected);
      }
      if (
        retainedDigest === undefined &&
        publicDigest !== desiredDigest &&
        expected.kind !== "missing"
      ) {
        if (privateSlot === undefined) throw new Error("internal: missing quarantine");
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        this.assertWriteFilePreimage(path, expected);
        const priorBytes = readFileSync(path);
        if (createHash("sha256").update(priorBytes).digest("hex") !== beforeDigest) {
          throw new Error(`confined public preimage changed during capture: ${path}`);
        }
        writeFileSync(privateSlot.path, priorBytes, { flag: "wx" });
        retainedDigest = this.fileDigestIfRegular(privateSlot.path);
        if (retainedDigest !== beforeDigest) {
          throw new Error(`confined retained preimage changed during capture: ${privateSlot.path}`);
        }
        this.beforeConfinedFilePublication(path);
        this.assertWriteFilePreimage(path, expected);
      }
      if (
        retainedDigest !== undefined &&
        publicDigest !== undefined &&
        publicDigest !== desiredDigest
      ) {
        if (privateSlot === undefined || displacedPath === undefined) {
          throw new Error("internal: missing quarantine displacement path");
        }
        if (publicDigest !== beforeDigest || displacedDigest !== undefined) {
          throw new Error(`confined public path raced while prior bytes were retained: ${path}`);
        }
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        const publicDescriptor = openSync(path, constants.O_RDONLY);
        const publicStat = fstatSync(publicDescriptor, { bigint: true });
        let displacedIdentity: NodePathIdentity | undefined;
        try {
          this.beforeConfinedFileDetachment(path, privateSlot.path);
          this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
          renameSync(path, displacedPath);
          this.afterConfinedFileDisplacement(path, displacedPath);
          displacedIdentity = this.pathIdentity(displacedPath);
          displacedDigest = this.fileDigestIfRegular(displacedPath);
        } finally {
          closeSync(publicDescriptor);
        }
        if (
          displacedDigest !== beforeDigest ||
          displacedIdentity === undefined ||
          displacedIdentity.dev !== publicStat.dev ||
          displacedIdentity.ino !== publicStat.ino
        ) {
          try {
            this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
            linkSync(displacedPath, path);
            const restoredIdentity = this.pathIdentity(path);
            if (!this.sameIdentity(restoredIdentity, displacedIdentity)) {
              throw new Error(`confined raced public entry could not be restored exactly: ${path}`);
            }
            unlinkSync(displacedPath);
            displacedDigest = undefined;
          } catch (restoreError) {
            throw new Error(
              `confined public path raced during displacement; raced bytes retained at ${displacedPath}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`,
            );
          }
          throw new Error(`confined public path raced during displacement: ${path}`);
        }
        unlinkSync(displacedPath);
        displacedDigest = undefined;
        publicDigest = undefined;
        this.afterConfinedFileDetachment(path, privateSlot.path);
        if (this.lstatIfPresent(path) !== undefined) {
          throw new Error(`confined public path raced after detachment: ${path}`);
        }
      }

      if (publicDigest !== desiredDigest) {
        if (this.lstatIfPresent(path) !== undefined) {
          throw new Error(`confined public path raced before publication: ${path}`);
        }
        if (expected.parentTree === "missing" && this.lstatIfPresent(parent) === undefined) {
          const publicParents = this.ensureConfinedDirectoryChain(confinementRoot, parent);
          createdPublic.push(...publicParents);
          for (const [createdPath, identity] of this.captureIdentities(publicParents)) {
            createdPublicIdentities.set(createdPath, identity);
          }
          createdOneFileParent = publicParents.includes(parent);
          publicationParentIdentity = this.directoryIdentityIfPresent(parent);
          publicationParentHandle = opendirSync(parent);
        }
        this.beforeConfinedFilePublication(path);
        this.assertWriteParentPreimage(
          path,
          expected,
          expected.parentTree === "one-file" ? "displaced" : "commit",
        );
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        this.assertDirectoryIdentity(parent, publicationParentIdentity);
        // On Windows, opendirSync can retain a directory-search handle for a non-empty parent. Release that
        // handle across hard-link publication; path identity checks bracket this platform-specific window.
        if (process.platform === "win32") {
          const inspectionHandle = publicationParentHandle;
          publicationParentHandle = undefined;
          inspectionHandle?.closeSync();
          this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
          this.assertDirectoryIdentity(parent, publicationParentIdentity);
        }
        linkSync(tmp, path);
        if (windowsSameParentTransient && tmp !== undefined) {
          this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
          this.assertDirectoryIdentity(parent, publicationParentIdentity);
          if (this.fileDigestIfRegular(path) !== desiredDigest) {
            throw new Error(`confined write publication changed before transient cleanup: ${path}`);
          }
          this.assertWriteParentPreimage(path, expected, "published");
          unlinkSync(tmp);
          tmp = undefined;
        }
        if (process.platform === "win32" && !windowsNestedPrivateCleanup) {
          publicationParentHandle = opendirSync(parent);
          this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
          this.assertDirectoryIdentity(parent, publicationParentIdentity);
        }
      }
      if (this.fileDigestIfRegular(path) !== desiredDigest) {
        throw new Error(`confined write publication changed: ${path}`);
      }
      this.assertWriteParentPreimage(path, expected, "published");
      this.assertDirectoryIdentity(parent, publicationParentIdentity);
      if (windowsNestedPrivateCleanup) {
        const inspectionHandle = publicationParentHandle;
        publicationParentHandle = undefined;
        inspectionHandle?.closeSync();
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        this.assertDirectoryIdentity(parent, publicationParentIdentity);
      }
      if (stagedPath !== undefined && this.lstatIfPresent(stagedPath) !== undefined) {
        if (this.fileDigestIfRegular(stagedPath) !== desiredDigest) {
          throw new Error(`confined staged bytes changed before cleanup: ${stagedPath}`);
        }
        unlinkSync(stagedPath);
        tmp = undefined;
        this.afterConfinedStagedCleanup(stagedPath);
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        this.assertDirectoryIdentity(parent, publicationParentIdentity);
        if (this.fileDigestIfRegular(path) !== desiredDigest) {
          throw new Error(`confined write publication changed after staged cleanup: ${path}`);
        }
        this.assertWriteParentPreimage(path, expected, "published");
      }
      if (privateSlot !== undefined) this.afterConfinedFilePublication(path, privateSlot.path);
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      this.assertDirectoryIdentity(parent, publicationParentIdentity);
      if (this.fileDigestIfRegular(path) !== desiredDigest) {
        throw new Error(`confined write publication changed after final boundary: ${path}`);
      }
      this.assertWriteParentPreimage(path, expected, "published");
      if (displacedPath !== undefined && this.lstatIfPresent(displacedPath) !== undefined) {
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        if (this.fileDigestIfRegular(path) !== desiredDigest) {
          throw new Error(
            `confined write publication changed before displacement cleanup: ${path}`,
          );
        }
        this.assertWriteParentPreimage(path, expected, "published");
        if (this.fileDigestIfRegular(displacedPath) !== beforeDigest) {
          throw new Error(
            `confined displaced public evidence changed before cleanup: ${displacedPath}`,
          );
        }
        unlinkSync(displacedPath);
      }
      if (privateSlot !== undefined && this.lstatIfPresent(privateSlot.path) !== undefined) {
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        if (this.fileDigestIfRegular(path) !== desiredDigest) {
          throw new Error(`confined write publication changed before preimage cleanup: ${path}`);
        }
        this.assertWriteParentPreimage(path, expected, "published");
        if (this.fileDigestIfRegular(privateSlot.path) !== beforeDigest) {
          throw new Error(`confined retained preimage changed before cleanup: ${privateSlot.path}`);
        }
        unlinkSync(privateSlot.path);
      }
      if (windowsNestedPrivateCleanup) {
        publicationParentHandle = opendirSync(parent);
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        this.assertDirectoryIdentity(parent, publicationParentIdentity);
        if (this.fileDigestIfRegular(path) !== desiredDigest) {
          throw new Error(`confined write publication changed after private cleanup: ${path}`);
        }
        this.assertWriteParentPreimage(path, expected, "published");
      }
    } catch (error) {
      const retained = privateSlot?.path;
      const retainedMessage =
        retained !== undefined && this.lstatIfPresent(retained) !== undefined
          ? `; prior bytes retained at ${retained}`
          : "";
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}${retainedMessage}`,
        { cause: error },
      );
    } finally {
      if (windowsSameParentTransient && tmp !== undefined) {
        const inspectionHandle = publicationParentHandle;
        publicationParentHandle = undefined;
        inspectionHandle?.closeSync();
      }
      if (tmp !== undefined) {
        try {
          if (privateSlot === undefined) unlinkSync(tmp);
        } catch {
          // The non-durable staging inode may already be absent.
        }
      }
      if (initialPublicDescriptor !== undefined) closeSync(initialPublicDescriptor);
      publicationParentHandle?.closeSync();
      if (createdOneFileParent) {
        this.removeCreatedDirectoryIfUnchanged(
          confinementRoot,
          parent,
          createdPublicIdentities.get(parent),
        );
      }
      for (const createdPath of createdPublic.reverse()) {
        this.removeCreatedDirectoryIfUnchanged(
          confinementRoot,
          createdPath,
          createdPublicIdentities.get(createdPath),
        );
      }
      if (privateSlot !== undefined)
        this.cleanupEmptyQuarantine(privateSlot.root, privateSlot.path);
      for (const createdPath of createdPrivate.reverse()) {
        this.removeCreatedDirectoryIfUnchanged(
          confinementRoot,
          createdPath,
          createdPrivateIdentities.get(createdPath),
        );
      }
    }
  }

  private writeAtomic(path: string, content: string): void {
    const dir = dirname(path);
    const newlyCreatedCandidates: string[] = [];
    let current = dir;
    while (!existsSync(current)) {
      newlyCreatedCandidates.push(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    let tmp: string | undefined;
    try {
      mkdirSync(dir, { recursive: true });
      // Unique temp name in the same directory so the rename stays on one filesystem (and is therefore atomic).
      tmp = join(dir, `.${randomBytes(8).toString("hex")}.tmp`);
      writeFileSync(tmp, content, "utf8");
      renameSync(tmp, path);
    } catch (err) {
      // Best-effort cleanup; never let cleanup mask the original error. Removing only empty directories that
      // were absent before this call makes a failed first bootstrap write retryable without deleting raced-in
      // user content.
      if (tmp !== undefined) {
        try {
          unlinkSync(tmp);
        } catch {
          // ignore — the temp may not have been created or may already have been renamed
        }
      }
      for (const created of newlyCreatedCandidates) {
        try {
          rmdirSync(created);
        } catch {
          // ignore — absent/non-empty directories are either already clean or contain content we must preserve
        }
      }
      throw err;
    }
  }

  /** @inheritdoc */
  exists(path: string): boolean {
    return existsSync(path);
  }

  /** @inheritdoc */
  inspectPath(path: string): PathInspection {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        return { kind: "symbolic-link", target: readlinkSync(path) };
      }
      if (stat.isDirectory()) {
        return { kind: "directory" };
      }
      return stat.isFile() ? { kind: "file" } : { kind: "other" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing" };
      }
      throw error;
    }
  }

  /** @inheritdoc */
  digestFile(path: string): string {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  /** @inheritdoc */
  readWithDigest(path: string): { content: string; sha256: string } {
    const bytes = readFileSync(path);
    return {
      content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  /** @inheritdoc */
  canonicalPath(path: string): string {
    return realpathSync.native(path);
  }

  /** @inheritdoc */
  inspectMutationCapability(path: string): MutationCapability {
    let current = path;
    try {
      while (true) {
        try {
          const stat = lstatSync(current);
          if (current !== path) {
            if (!stat.isDirectory()) {
              throw new Error(`ENOTDIR: mutation ancestor is not a directory, '${current}'`);
            }
            accessSync(current, constants.W_OK | constants.X_OK);
            return { capable: true };
          }
          if (stat.isDirectory()) {
            accessSync(dirname(current), constants.W_OK | constants.X_OK);
            const pending = [current];
            while (pending.length > 0) {
              const directory = pending.pop() as string;
              accessSync(directory, constants.W_OK | constants.X_OK);
              for (const entry of readdirSync(directory, { withFileTypes: true })) {
                if (entry.isDirectory()) pending.push(join(directory, entry.name));
              }
            }
          } else {
            accessSync(dirname(current), constants.W_OK | constants.X_OK);
          }
          return { capable: true };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          const parent = dirname(current);
          if (parent === current) throw error;
          current = parent;
        }
      }
    } catch (error) {
      return {
        capable: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** @inheritdoc */
  inspectMutationCompatibility(firstPath: string, secondPath: string): MutationCapability {
    const nearestDevice = (candidate: string): string => {
      let current = resolve(candidate);
      while (true) {
        const stat = this.lstatIfPresent(current);
        if (stat !== undefined) {
          if (stat.isSymbolicLink()) {
            throw new Error(`mutation ancestor is a symbolic link: ${current}`);
          }
          return String(stat.dev);
        }
        const parent = dirname(current);
        if (parent === current) throw new Error(`cannot resolve mutation device for ${candidate}`);
        current = parent;
      }
    };
    try {
      const firstDevice = nearestDevice(firstPath);
      const secondDevice = nearestDevice(secondPath);
      return firstDevice === secondDevice
        ? { capable: true }
        : {
            capable: false,
            reason: `request-bound mutation crosses devices (${firstDevice} != ${secondDevice})`,
          };
    } catch (error) {
      return {
        capable: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** @inheritdoc */
  makeDirectories(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  /** @inheritdoc */
  list(path: string): DirEntry[] {
    return readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
    }));
  }

  /** @inheritdoc */
  copyTree(from: string, to: string): void {
    cpSync(from, to, { recursive: true });
  }

  /** @inheritdoc */
  remove(path: string): void {
    rmSync(path, { recursive: true, force: true });
  }

  /** @inheritdoc */
  removeFileConfined(
    confinementRoot: string,
    path: string,
    expectedContent: string,
    quarantine: ConfinedQuarantine,
  ): void {
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    const privateSlot = this.assertQuarantine(confinementRoot, quarantine);
    if (this.lstatIfPresent(privateSlot.path) !== undefined) {
      throw new Error(`confined file removal quarantine is occupied: ${privateSlot.path}`);
    }
    const expectedBytes = Buffer.from(expectedContent, "utf8");
    const expectedDigest = createHash("sha256").update(expectedBytes).digest("hex");
    const stat = this.lstatIfPresent(path);
    if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`confined file removal preimage is not a regular file: ${path}`);
    }
    const descriptor = openSync(path, constants.O_RDONLY);
    const descriptorStat = fstatSync(descriptor, { bigint: true });
    const initialIdentity = { dev: descriptorStat.dev, ino: descriptorStat.ino };
    const initialBytes = readFileSync(descriptor);
    if (
      !this.sameIdentity(this.pathIdentity(path), initialIdentity) ||
      createHash("sha256").update(initialBytes).digest("hex") !== expectedDigest
    ) {
      closeSync(descriptor);
      throw new Error(`confined file removal preimage changed during capture: ${path}`);
    }
    try {
      this.ensureConfinedDirectoryChain(confinementRoot, dirname(privateSlot.path));
      this.beforeConfinedFileDetachment(path, privateSlot.path);
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      if (
        this.fileDigestIfRegular(path) !== expectedDigest ||
        !this.sameIdentity(this.pathIdentity(path), initialIdentity)
      ) {
        throw new Error(`confined file removal preimage changed before detachment: ${path}`);
      }
      renameSync(path, privateSlot.path);
      this.afterConfinedFileDetachment(path, privateSlot.path);
      const retainedIdentity = this.pathIdentity(privateSlot.path);
      if (
        !this.sameIdentity(retainedIdentity, initialIdentity) ||
        this.fileDigestIfRegular(privateSlot.path) !== expectedDigest ||
        this.lstatIfPresent(path) !== undefined
      ) {
        if (this.lstatIfPresent(path) === undefined) {
          writeFileSync(path, initialBytes, { flag: "wx" });
        }
        throw new Error(
          `confined public file raced after detachment: ${path}; prior bytes retained at ${privateSlot.path}`,
        );
      }
      unlinkSync(privateSlot.path);
      if (this.lstatIfPresent(path) !== undefined) {
        throw new Error(`confined public file raced before removal completion: ${path}`);
      }
    } catch (error) {
      const retained = this.lstatIfPresent(privateSlot.path) !== undefined;
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}${retained ? `; retained evidence at ${privateSlot.path}` : ""}`,
        { cause: error },
      );
    } finally {
      closeSync(descriptor);
      this.cleanupEmptyQuarantine(privateSlot.root, privateSlot.path);
    }
  }

  /** @inheritdoc */
  removeConfined(
    confinementRoot: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: ConfinedQuarantine,
  ): void {
    if (quarantine === undefined) {
      throw new Error("confined tree retirement requires request-bound quarantine evidence");
    }
    const privateSlot = this.assertQuarantine(confinementRoot, quarantine, "directory");
    const displacedPath = `${privateSlot.path}.displaced`;
    let initialPublicHandle: ReturnType<typeof opendirSync> | undefined;
    let initialPublicIdentity: NodePathIdentity | undefined;
    let initialPublicFingerprint: string | undefined;
    try {
      const initialPublicStat = this.lstatIfPresent(path);
      if (initialPublicStat !== undefined) {
        if (!initialPublicStat.isDirectory() || initialPublicStat.isSymbolicLink()) {
          throw new Error(`confined public tree is not a regular directory: ${path}`);
        }
        initialPublicHandle = opendirSync(path);
        initialPublicIdentity = this.pathIdentity(path);
        initialPublicFingerprint = this.treeFingerprint(path);
        if (!this.sameIdentity(this.pathIdentity(path), initialPublicIdentity)) {
          throw new Error(`confined public tree changed during initial capture: ${path}`);
        }
      }
    } catch (error) {
      initialPublicHandle?.closeSync();
      throw error;
    }
    let created: string[];
    try {
      created = this.ensureConfinedDirectoryChain(confinementRoot, dirname(privateSlot.path));
    } catch (error) {
      initialPublicHandle?.closeSync();
      throw error;
    }
    try {
      this.afterConfinedTreePrivatePreparation(path);
      let publicStat = this.lstatIfPresent(path);
      if (initialPublicIdentity === undefined) {
        if (publicStat !== undefined) {
          throw new Error(
            `confined public tree raced while private evidence was prepared: ${path}`,
          );
        }
      } else if (
        publicStat === undefined ||
        !publicStat.isDirectory() ||
        publicStat.isSymbolicLink() ||
        !this.sameIdentity(this.pathIdentity(path), initialPublicIdentity) ||
        this.treeFingerprint(path) !== initialPublicFingerprint
      ) {
        throw new Error(
          `confined public tree changed while private evidence was prepared: ${path}`,
        );
      }
      let retainedStat = this.lstatIfPresent(privateSlot.path);
      let displacedStat = this.lstatIfPresent(displacedPath);
      if (retainedStat !== undefined) {
        if (!retainedStat.isDirectory() || retainedStat.isSymbolicLink()) {
          throw new Error(`confined retained tree is not a regular directory: ${privateSlot.path}`);
        }
        if (
          publicStat !== undefined &&
          this.treeFingerprint(privateSlot.path) !== expectedTreeFingerprint
        ) {
          this.assertConfinedMutationPath(confinementRoot, path, "directory");
          if (
            this.treeFingerprint(path) !== expectedTreeFingerprint ||
            !this.treeIsExactSubset(privateSlot.path, path)
          ) {
            throw new Error(
              `confined retained tree conflicts with public capture: ${privateSlot.path}`,
            );
          }
          cpSync(path, privateSlot.path, {
            recursive: true,
            errorOnExist: false,
            force: false,
            verbatimSymlinks: true,
          });
          if (this.treeFingerprint(privateSlot.path) !== expectedTreeFingerprint) {
            throw new Error(
              `confined retained tree changed during resumed capture: ${privateSlot.path}`,
            );
          }
        }
      } else if (publicStat !== undefined) {
        this.assertConfinedMutationPath(confinementRoot, path, "directory");
        if (this.treeFingerprint(path) !== expectedTreeFingerprint) {
          throw new Error(`confined removal tree preimage changed: ${path}`);
        }
        cpSync(path, privateSlot.path, {
          recursive: true,
          errorOnExist: true,
          force: false,
          verbatimSymlinks: true,
        });
        retainedStat = this.lstatIfPresent(privateSlot.path);
        if (
          retainedStat === undefined ||
          !retainedStat.isDirectory() ||
          retainedStat.isSymbolicLink() ||
          this.treeFingerprint(privateSlot.path) !== expectedTreeFingerprint
        ) {
          throw new Error(`confined retained tree changed during capture: ${privateSlot.path}`);
        }
      }

      if (displacedStat !== undefined) {
        if (!displacedStat.isDirectory() || displacedStat.isSymbolicLink()) {
          throw new Error(`confined displaced tree is not a regular directory: ${displacedPath}`);
        }
        if (
          retainedStat === undefined ||
          this.treeFingerprint(privateSlot.path) !== expectedTreeFingerprint ||
          !this.treeIsExactSubset(displacedPath, privateSlot.path)
        ) {
          throw new Error(`confined displaced tree evidence changed: ${displacedPath}`);
        }
        if (publicStat !== undefined) {
          throw new Error(`confined public tree raced while owned bytes were displaced: ${path}`);
        }
      }

      if (retainedStat !== undefined && publicStat !== undefined) {
        if (displacedStat !== undefined) {
          throw new Error(`confined public tree raced while owned bytes were displaced: ${path}`);
        }
        this.assertConfinedMutationPath(confinementRoot, path, "directory");
        if (this.treeFingerprint(path) !== expectedTreeFingerprint) {
          throw new Error(`confined removal tree preimage changed: ${path}`);
        }
        const observedHandle = opendirSync(path);
        const observed = this.pathIdentity(path);
        let displacedMatchesObserved = false;
        try {
          this.beforeConfinedTreeDetachment(path);
          this.assertConfinedMutationPath(confinementRoot, path, "directory");
          if (this.treeFingerprint(path) !== expectedTreeFingerprint) {
            throw new Error(`confined removal tree preimage changed: ${path}`);
          }
          renameSync(path, displacedPath);
          displacedStat = lstatSync(displacedPath);
          this.afterConfinedTreeDetachment(path, privateSlot.path);
          this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
          if (this.lstatIfPresent(path) !== undefined) {
            throw new Error(`confined public tree raced after detachment: ${path}`);
          }
          displacedMatchesObserved =
            this.sameIdentity(this.pathIdentity(displacedPath), observed) &&
            this.treeFingerprint(displacedPath) === expectedTreeFingerprint;
        } finally {
          observedHandle.closeSync();
        }
        if (!displacedMatchesObserved) {
          const racedPath = `${displacedPath}.raced`;
          if (this.lstatIfPresent(racedPath) !== undefined) {
            throw new Error(
              `confined public tree changed during displacement; raced tree retained at ${displacedPath}`,
            );
          }
          renameSync(displacedPath, racedPath);
          throw new Error(
            `confined public tree changed during displacement; raced tree retained at ${racedPath}`,
          );
        }
        this.beforeConfinedTreeCleanup(displacedPath);
        rmSync(displacedPath, { recursive: true });
        displacedStat = undefined;
        publicStat = undefined;
      } else if (displacedStat !== undefined) {
        this.afterConfinedTreeDetachment(path, privateSlot.path);
        if (this.lstatIfPresent(path) !== undefined) {
          throw new Error(`confined public tree raced after detachment: ${path}`);
        }
        this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
        if (!this.treeIsExactSubset(displacedPath, privateSlot.path)) {
          throw new Error(`confined displaced tree changed before cleanup: ${displacedPath}`);
        }
        this.beforeConfinedTreeCleanup(displacedPath);
        rmSync(displacedPath, { recursive: true });
        displacedStat = undefined;
      }

      const retainedAfter = this.lstatIfPresent(privateSlot.path);
      if (retainedAfter === undefined) return;
      if (!retainedAfter.isDirectory() || retainedAfter.isSymbolicLink()) {
        throw new Error(`confined retained tree is not a regular directory: ${privateSlot.path}`);
      }
      const detached = this.treeSnapshot(privateSlot.path);
      if (detached.fingerprint !== expectedTreeFingerprint) {
        throw new Error(`confined retained tree changed before cleanup: ${privateSlot.path}`);
      }
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      if (this.lstatIfPresent(path) !== undefined) {
        throw new Error(`confined public tree raced before cleanup: ${path}`);
      }
      rmSync(privateSlot.path, { recursive: true });
    } catch (error) {
      const retainedMessage =
        this.lstatIfPresent(privateSlot.path) === undefined
          ? ""
          : `; owned tree retained at ${privateSlot.path}`;
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}${retainedMessage}`,
        { cause: error },
      );
    } finally {
      initialPublicHandle?.closeSync();
      this.cleanupEmptyQuarantine(privateSlot.root, privateSlot.path);
      for (const createdPath of created.reverse()) {
        try {
          rmdirSync(createdPath);
        } catch {
          // Preserve retained request-bound evidence.
        }
      }
    }
  }

  /** @inheritdoc */
  ensureAlias(target: string, linkPath: string): AliasResult {
    return ensureSymlinkOrCopy(target, linkPath, this.aliasOptions);
  }
}
