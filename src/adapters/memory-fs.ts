import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
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
import { toPosix } from "../util/posix-path.js";

/**
 * An in-memory {@link FileSystem} (doc 13 §1) — the fake that lets the pure core's logic run entirely in
 * memory in tests (AC#1). Pure: it uses no `node:fs`, only `Map`/`Set`, so it is deterministic and needs no
 * tmpdir. The lifecycle/operation tests (tasks 25/26) reuse it, so it is a faithful, complete implementation
 * of every operation.
 *
 * Paths are normalized to a POSIX-style absolute form (leading `/`, no `.`/`..` segments, no trailing slash)
 * so behaviour is identical regardless of the host OS. Files live in a `Map<path, content>`; directories are
 * tracked in a `Set<path>` (every ancestor of a written file is recorded, and empty directories are
 * representable via {@link makeDirectories}).
 */
export class MemoryFileSystem implements FileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>(["/"]);
  private readonly directoryIdentities = new Map<string, number>([["/", 0]]);
  private nextDirectoryIdentity = 1;
  /** Recorded aliases (linkPath → target), so tests can assert what was aliased. */
  private readonly aliases = new Map<string, string>();

  /** Deterministic test seam after a retained public file preimage has been detached. */
  protected afterConfinedFileDetachment(_path: string, _quarantinePath: string): void {}

  /** Deterministic test seam immediately before no-clobber public file publication. */
  protected beforeConfinedFilePublication(_path: string): void {}

  /** Deterministic test seam after desired bytes are public but before private cleanup. */
  protected afterConfinedFilePublication(_path: string, _quarantinePath: string): void {}

  /** Deterministic test seam after a retained public tree has been detached. */
  protected afterConfinedTreeDetachment(_path: string, _quarantinePath: string): void {}

  /** Recognize both supported absolute-path dialects without depending on the test runner's host platform. */
  private isAbsolute(path: string): boolean {
    return posix.isAbsolute(path) || win32.isAbsolute(path);
  }

  /**
   * Normalize a path to a POSIX-style absolute path: forward slashes, a leading `/`, `.`/`..` resolved, and
   * no trailing slash (except the root). Relative inputs are treated as rooted at `/`.
   */
  private normalize(path: string): string {
    const segments: string[] = [];
    for (const raw of path.replace(/\\/g, "/").split("/")) {
      if (raw === "" || raw === ".") continue;
      if (raw === "..") {
        segments.pop();
        continue;
      }
      segments.push(raw);
    }
    return `/${segments.join("/")}`;
  }

  /** The normalized parent directory of a normalized path (`/` for top-level entries). */
  private parentOf(normalized: string): string {
    const idx = normalized.lastIndexOf("/");
    return idx <= 0 ? "/" : normalized.slice(0, idx);
  }

  /** Record `dir` and all of its ancestors as existing directories. */
  private recordDir(dir: string): void {
    let current = dir;
    while (true) {
      if (!this.directories.has(current)) {
        this.directories.add(current);
        this.directoryIdentities.set(current, this.nextDirectoryIdentity);
        this.nextDirectoryIdentity += 1;
      }
      if (current === "/") break;
      current = this.parentOf(current);
    }
  }

  private removeEmptyDirectoryChain(start: string, stopAfter: string): void {
    let current = this.normalize(start);
    const stop = this.normalize(stopAfter);
    let quarantineRoot = current;
    while (this.parentOf(quarantineRoot) !== stop && quarantineRoot !== "/") {
      quarantineRoot = this.parentOf(quarantineRoot);
    }
    if (this.inspectPath(quarantineRoot).kind === "directory") {
      for (const entry of this.list(quarantineRoot)) {
        if (entry.kind !== "directory") continue;
        const child = `${quarantineRoot}/${entry.name}`;
        if (this.list(child).length === 0) {
          this.directories.delete(child);
          this.directoryIdentities.delete(child);
        }
      }
    }
    while (current !== "/") {
      const kind = this.inspectPath(current).kind;
      if (kind === "directory") {
        if (this.list(current).length > 0) return;
        this.directories.delete(current);
        this.directoryIdentities.delete(current);
      } else if (kind !== "missing") {
        return;
      }
      if (current === stop) return;
      current = this.parentOf(current);
    }
  }

  private directoryIdentity(path: string): number | undefined {
    return this.directoryIdentities.get(this.normalize(path));
  }

  private assertDirectoryIdentity(path: string, expected: number | undefined): void {
    const actual = this.directoryIdentity(path);
    if (expected === undefined || actual === undefined || actual !== expected) {
      throw new Error(`confined write parent identity changed: ${this.normalize(path)}`);
    }
  }

  private assertConfinedMutationPath(
    confinementRoot: string,
    path: string,
    finalKind: "file-or-missing" | "directory",
  ): void {
    const root = this.normalize(confinementRoot);
    const target = this.normalize(path);
    if (target === root || !target.startsWith(`${root}/`)) {
      throw new Error(`confined mutation path escapes its root: ${target}`);
    }
    let current = "";
    const segments = target.split("/").filter((segment) => segment.length > 0);
    for (let index = 0; index < segments.length; index += 1) {
      current += `/${segments[index] as string}`;
      if (this.aliases.has(current)) {
        throw new Error(`confined mutation path contains a symbolic link: ${current}`);
      }
      const final = index === segments.length - 1;
      if (!final && this.files.has(current)) {
        throw new Error(`confined mutation ancestor is not a directory: ${current}`);
      }
      if (final && finalKind === "file-or-missing" && this.directories.has(current)) {
        throw new Error(`confined write target is not a regular file: ${current}`);
      }
      if (final && finalKind === "directory" && !this.directories.has(current)) {
        throw new Error(`confined removal target is not a regular directory: ${current}`);
      }
    }
  }

  private assertQuarantine(
    confinementRoot: string,
    quarantine: ConfinedQuarantine,
    finalKind: "file-or-missing" | "directory" = "file-or-missing",
  ): { readonly root: string; readonly path: string } {
    const confinement = this.normalize(confinementRoot);
    const root = this.normalize(quarantine.root);
    const path = this.normalize(quarantine.path);
    if (
      root === confinement ||
      !root.startsWith(`${confinement}/`) ||
      path === root ||
      !path.startsWith(`${root}/`)
    ) {
      throw new Error(
        "confined quarantine must be a strict descendant of HOME and its request root",
      );
    }
    const inspected = this.inspectPath(path);
    this.assertConfinedMutationPath(
      confinement,
      path,
      finalKind === "directory" && inspected.kind === "directory" ? "directory" : "file-or-missing",
    );
    return { root, path };
  }

  private treeSnapshot(root: string): {
    readonly entries: readonly {
      readonly path: string;
      readonly kind: "directory" | "file" | "symbolic-link" | "other";
      readonly sha256?: string;
      readonly target?: string;
    }[];
    readonly fingerprint: string;
  } {
    const entries: Array<{
      path: string;
      kind: "directory" | "file" | "symbolic-link" | "other";
      sha256?: string;
      target?: string;
    }> = [];
    const walk = (directory: string, relativeRoot: string): void => {
      const listed = [...this.list(directory)].sort((left, right) =>
        compareCodeUnits(left.name, right.name),
      );
      for (const entry of listed) {
        const absolute = `${directory.replace(/\/$/, "")}/${entry.name}`;
        const relativePath =
          relativeRoot.length === 0 ? entry.name : `${relativeRoot}/${entry.name}`;
        const inspected = this.inspectPath(absolute);
        if (inspected.kind === "directory") {
          entries.push({ path: relativePath, kind: "directory" });
          walk(absolute, relativePath);
        } else if (inspected.kind === "file") {
          entries.push({ path: relativePath, kind: "file", sha256: this.digestFile(absolute) });
        } else if (inspected.kind === "symbolic-link") {
          entries.push({ path: relativePath, kind: "symbolic-link", target: inspected.target });
        } else if (inspected.kind === "other") {
          entries.push({ path: relativePath, kind: "other" });
        } else {
          throw new Error(`tree entry disappeared during confined inspection: ${absolute}`);
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

  /** @inheritdoc */
  read(path: string): string {
    const p = this.normalize(path);
    const content = this.files.get(p);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file, read '${p}'`);
    }
    return content;
  }

  /**
   * Write atomically by nature — a single `Map` set is indivisible, so a partial file is impossible — and
   * create parent directories as needed (AC#2, AC#4).
   *
   * @inheritdoc
   */
  write(path: string, content: string): void {
    const p = this.normalize(path);
    if (this.directories.has(p)) {
      throw new Error(`EISDIR: illegal operation on a directory, write '${p}'`);
    }
    this.recordDir(this.parentOf(p));
    this.files.set(p, content);
  }

  /** @inheritdoc */
  writeConfined(
    confinementRoot: string,
    path: string,
    content: string,
    expected: ConfinedWritePrecondition,
    quarantine?: ConfinedQuarantine,
  ): void {
    const target = this.normalize(path);
    const parent = this.parentOf(target);
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    const inspected = this.inspectPath(path);
    const desiredSha256 = createHash("sha256").update(content, "utf8").digest("hex");
    const privateSlot =
      quarantine === undefined ? undefined : this.assertQuarantine(confinementRoot, quarantine);
    const quarantinePath = privateSlot?.path;
    const quarantineRoot = privateSlot?.root;
    const displacedPath = quarantinePath === undefined ? undefined : `${quarantinePath}.displaced`;
    if (expected.kind !== "missing" && quarantinePath === undefined) {
      throw new Error("confined replacement requires request-bound quarantine evidence");
    }
    const retained = quarantinePath === undefined ? undefined : this.files.get(quarantinePath);
    const displaced = displacedPath === undefined ? undefined : this.files.get(displacedPath);
    const staged =
      quarantinePath === undefined ? undefined : this.files.get(`${quarantinePath}.staged`);
    let publicationParentIdentity = this.directoryIdentity(parent);
    const createdPublicationDirectories: Array<{
      readonly path: string;
      readonly identity: number;
    }> = [];
    const beforeSha256 =
      expected.kind === "missing"
        ? undefined
        : expected.kind === "sha256"
          ? expected.sha256
          : createHash("sha256").update(expected.content, "utf8").digest("hex");
    if (
      retained !== undefined &&
      createHash("sha256").update(retained, "utf8").digest("hex") !== beforeSha256
    ) {
      throw new Error(`confined retained preimage changed: ${quarantinePath}`);
    }
    if (
      displaced !== undefined &&
      (retained === undefined ||
        createHash("sha256").update(displaced, "utf8").digest("hex") !== beforeSha256)
    ) {
      throw new Error(`confined displaced public evidence changed: ${displacedPath}`);
    }
    const publicSha256 =
      inspected.kind === "file"
        ? createHash("sha256").update(this.read(path), "utf8").digest("hex")
        : undefined;
    if (
      staged !== undefined &&
      createHash("sha256").update(staged, "utf8").digest("hex") !== desiredSha256
    ) {
      throw new Error(`confined staged bytes changed: ${quarantinePath}.staged`);
    }
    const resumesEmptyCreatedParent =
      expected.kind === "missing" &&
      expected.parentTree === "missing" &&
      publicSha256 === undefined &&
      staged !== undefined &&
      createHash("sha256").update(staged, "utf8").digest("hex") === desiredSha256 &&
      this.inspectPath(parent).kind === "directory" &&
      this.list(parent).length === 0;
    if (
      expected.parentTree === "missing" &&
      publicSha256 !== desiredSha256 &&
      this.inspectPath(parent).kind !== "missing" &&
      !resumesEmptyCreatedParent
    ) {
      throw new Error(`confined write parent-tree preimage is not missing: ${parent}`);
    }
    if (expected.parentTree === "one-file") {
      if (this.inspectPath(parent).kind !== "directory") {
        throw new Error(`confined write parent tree is not a regular directory: ${parent}`);
      }
      const targetName = target.slice(parent === "/" ? 1 : parent.length + 1);
      const entries = this.list(parent);
      const expectedEntries = retained === undefined || publicSha256 !== undefined ? 1 : 0;
      if (
        entries.length !== expectedEntries ||
        (expectedEntries === 1 && (entries[0]?.name !== targetName || entries[0]?.kind !== "file"))
      ) {
        throw new Error(`confined write parent tree changed: ${parent}`);
      }
    }
    if (
      retained !== undefined &&
      publicSha256 !== undefined &&
      publicSha256 !== desiredSha256 &&
      publicSha256 !== beforeSha256
    ) {
      throw new Error(`confined public path raced while prior bytes were retained: ${path}`);
    }
    if (displaced !== undefined && publicSha256 !== undefined) {
      throw new Error(`confined public path raced while displaced bytes were retained: ${path}`);
    }
    if (expected.kind !== "missing" && publicSha256 === desiredSha256 && retained === undefined) {
      throw new Error(
        `confined desired-looking public replacement lacks its retained prior bytes: ${path}`,
      );
    }
    if (publicSha256 === desiredSha256) {
      if (expected.parentTree !== undefined) {
        const targetName = target.slice(parent === "/" ? 1 : parent.length + 1);
        const entries = this.list(parent);
        if (
          entries.length !== 1 ||
          entries[0]?.name !== targetName ||
          entries[0]?.kind !== "file"
        ) {
          throw new Error(`confined write parent tree changed during publication: ${parent}`);
        }
      }
      if (quarantinePath !== undefined) this.files.delete(`${quarantinePath}.staged`);
      if (quarantinePath !== undefined) this.afterConfinedFilePublication(target, quarantinePath);
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      this.assertDirectoryIdentity(parent, publicationParentIdentity);
      if (this.inspectPath(target).kind !== "file" || this.digestFile(path) !== desiredSha256) {
        throw new Error(`confined write publication changed after final boundary: ${path}`);
      }
      if (expected.parentTree !== undefined) {
        const targetName = target.slice(parent === "/" ? 1 : parent.length + 1);
        const entries = this.list(parent);
        if (
          entries.length !== 1 ||
          entries[0]?.name !== targetName ||
          entries[0]?.kind !== "file"
        ) {
          throw new Error(`confined write parent tree changed during publication: ${parent}`);
        }
      }
      if (displacedPath !== undefined) this.files.delete(displacedPath);
      if (quarantinePath !== undefined) this.files.delete(quarantinePath);
      if (quarantinePath !== undefined && quarantineRoot !== undefined) {
        this.removeEmptyDirectoryChain(
          this.parentOf(quarantinePath),
          this.parentOf(quarantineRoot),
        );
      }
      return;
    }
    if (displaced !== undefined) {
      if (publicSha256 !== undefined) {
        throw new Error(`confined public path raced while displaced bytes were retained: ${path}`);
      }
      this.files.delete(displacedPath as string);
      this.afterConfinedFileDetachment(target, quarantinePath as string);
    }
    if (retained !== undefined) {
      // The exact prior bytes are already request-bound; the public path may be absent on retry.
    } else if (expected.kind === "missing") {
      if (inspected.kind !== "missing") {
        throw new Error(`confined write preimage is not missing: ${path}`);
      }
    } else {
      if (inspected.kind !== "file") {
        throw new Error(`confined write preimage is not a regular file: ${path}`);
      }
      if (expected.kind === "text" && this.read(path) !== expected.content) {
        throw new Error(`confined write text preimage changed: ${path}`);
      }
      if (expected.kind === "sha256" && this.digestFile(path) !== expected.sha256) {
        throw new Error(`confined write digest preimage changed: ${path}`);
      }
    }
    if (quarantinePath !== undefined) {
      this.recordDir(this.parentOf(quarantinePath));
      this.files.set(`${quarantinePath}.staged`, content);
      if (retained !== undefined && publicSha256 === beforeSha256) {
        this.files.delete(target);
        this.afterConfinedFileDetachment(target, quarantinePath);
      }
      if (retained === undefined && inspected.kind === "file") {
        this.files.set(quarantinePath, this.read(path));
        this.files.delete(target);
        this.afterConfinedFileDetachment(target, quarantinePath);
      }
    }
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    if (this.inspectPath(target).kind !== "missing") {
      throw new Error(`confined public path raced after detachment: ${path}`);
    }
    try {
      if (this.inspectPath(parent).kind === "missing") {
        const createdPaths: string[] = [];
        let current = parent;
        while (current !== "/" && this.inspectPath(current).kind === "missing") {
          createdPaths.push(current);
          current = this.parentOf(current);
        }
        this.recordDir(parent);
        for (const createdPath of createdPaths) {
          const identity = this.directoryIdentity(createdPath);
          if (identity !== undefined) {
            createdPublicationDirectories.push({ path: createdPath, identity });
          }
        }
      }
      if (publicationParentIdentity === undefined) {
        publicationParentIdentity = this.directoryIdentity(parent);
      }
      this.beforeConfinedFilePublication(target);
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      this.assertDirectoryIdentity(parent, publicationParentIdentity);
      if (this.inspectPath(target).kind !== "missing") {
        throw new Error(`confined public path raced before publication: ${path}`);
      }
      this.write(path, content);
      if (this.digestFile(path) !== desiredSha256) {
        throw new Error(`confined write publication changed: ${path}`);
      }
      if (quarantinePath !== undefined) this.files.delete(`${quarantinePath}.staged`);
      if (quarantinePath !== undefined) this.afterConfinedFilePublication(target, quarantinePath);
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      this.assertDirectoryIdentity(parent, publicationParentIdentity);
      if (this.inspectPath(target).kind !== "file" || this.digestFile(path) !== desiredSha256) {
        throw new Error(`confined write publication changed after final boundary: ${path}`);
      }
      if (expected.parentTree !== undefined) {
        const targetName = target.slice(parent === "/" ? 1 : parent.length + 1);
        const entries = this.list(parent);
        if (
          entries.length !== 1 ||
          entries[0]?.name !== targetName ||
          entries[0]?.kind !== "file"
        ) {
          throw new Error(`confined write parent tree changed during publication: ${parent}`);
        }
      }
      if (quarantinePath !== undefined) {
        if (displacedPath !== undefined) this.files.delete(displacedPath);
        this.files.delete(quarantinePath);
        if (quarantineRoot !== undefined) {
          this.removeEmptyDirectoryChain(
            this.parentOf(quarantinePath),
            this.parentOf(quarantineRoot),
          );
        }
      }
      if (expected.parentTree !== undefined) {
        const targetName = target.slice(parent === "/" ? 1 : parent.length + 1);
        const entries = this.list(parent);
        if (
          entries.length !== 1 ||
          entries[0]?.name !== targetName ||
          entries[0]?.kind !== "file"
        ) {
          throw new Error(`confined write parent tree changed during publication: ${parent}`);
        }
      }
    } catch (error) {
      for (const created of createdPublicationDirectories) {
        if (
          this.directoryIdentity(created.path) !== created.identity ||
          this.inspectPath(created.path).kind !== "directory" ||
          this.list(created.path).length > 0
        ) {
          break;
        }
        this.directories.delete(created.path);
        this.directoryIdentities.delete(created.path);
      }
      throw error;
    }
  }

  /** @inheritdoc */
  exists(path: string): boolean {
    return this.existsResolved(this.normalize(path), new Set<string>());
  }

  /** @inheritdoc */
  inspectPath(path: string): PathInspection {
    const p = this.normalize(path);
    const target = this.aliases.get(p);
    if (target !== undefined) {
      return { kind: "symbolic-link", target };
    }
    if (this.files.has(p)) {
      return { kind: "file" };
    }
    if (this.directories.has(p)) {
      return { kind: "directory" };
    }
    return { kind: "missing" };
  }

  /** @inheritdoc */
  digestFile(path: string): string {
    return createHash("sha256").update(this.read(path), "utf8").digest("hex");
  }

  /** @inheritdoc */
  readWithDigest(path: string): { content: string; sha256: string } {
    const content = this.read(path);
    return {
      content,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    };
  }

  /** @inheritdoc */
  canonicalPath(path: string): string {
    const normalized = this.normalize(path);
    const inspection = this.inspectPath(normalized);
    if (inspection.kind === "missing") {
      throw new Error(`ENOENT: no such path, realpath '${normalized}'`);
    }
    if (inspection.kind === "symbolic-link") {
      return this.resolveAliasTarget(normalized, inspection.target);
    }
    return normalized;
  }

  /** @inheritdoc */
  inspectMutationCapability(_path: string): MutationCapability {
    return { capable: true };
  }

  /** @inheritdoc */
  inspectMutationCompatibility(_firstPath: string, _secondPath: string): MutationCapability {
    return { capable: true };
  }

  /**
   * Faithful existence check that **follows aliases the way `existsSync` follows a symlink** (the real
   * adapter's behaviour). A direct file or directory at `p` exists. Otherwise, if `p` is a recorded alias
   * link, its existence is that of its *target* — so a **broken** alias (target absent) is `false`, exactly as
   * `existsSync` returns `false` for a dangling symlink. Alias chains are followed transitively; a cycle is
   * bounded by a visited-set and reported as `false`, mirroring `existsSync`'s `ELOOP → false` (so the fake
   * can never loop forever). This parity matters because a derivation's idempotency (task-19 `planChanges` /
   * task-25 lifecycle) probes `exists(linkPath)`: a non-broken alias must read as present so it is not
   * "re-created" on a redundant re-run.
   */
  private existsResolved(p: string, visited: Set<string>): boolean {
    if (this.files.has(p) || this.directories.has(p)) return true;
    const target = this.aliases.get(p);
    if (target === undefined) return false;
    if (visited.has(p)) return false; // alias cycle → ELOOP-equivalent
    visited.add(p);
    return this.existsResolved(this.resolveAliasTarget(p, target), visited);
  }

  /**
   * Resolve an alias's stored (raw) target to an absolute path the way a real symlink resolves: an absolute
   * target is taken as-is; a **relative** target is resolved against the link's PARENT directory (POSIX
   * symlink semantics), not the cwd. This is what lets the fake faithfully model a *relative* alias such as
   * the per-bundle `backlog → install-backlog` link (TASK-102): the raw `install-backlog` is preserved for
   * inspection (see {@link aliasTarget}) yet still resolves under the bundle dir for {@link exists}.
   */
  private resolveAliasTarget(link: string, rawTarget: string): string {
    const t = toPosix(rawTarget);
    return this.isAbsolute(rawTarget)
      ? this.normalize(t)
      : this.normalize(`${this.parentOf(link)}/${t}`);
  }

  /** @inheritdoc */
  makeDirectories(path: string): void {
    this.recordDir(this.normalize(path));
  }

  /** @inheritdoc */
  list(path: string): DirEntry[] {
    const dir = this.normalize(path);
    // Match node's distinction: listing a path that is a file is ENOTDIR (not "doesn't exist").
    if (this.files.has(dir)) {
      throw new Error(`ENOTDIR: not a directory, list '${dir}'`);
    }
    if (!this.directories.has(dir)) {
      throw new Error(`ENOENT: no such directory, list '${dir}'`);
    }
    const prefix = dir === "/" ? "/" : `${dir}/`;
    const names = new Map<string, "file" | "directory">();
    const collect = (fullPath: string, kind: "file" | "directory") => {
      if (!fullPath.startsWith(prefix) || fullPath === dir) return;
      const rest = fullPath.slice(prefix.length);
      const name = rest.split("/")[0];
      if (name === undefined || name === "") return;
      // A name that has deeper segments is a directory; mark directories as such, never downgrade.
      const childKind: "file" | "directory" = rest.includes("/") ? "directory" : kind;
      if (childKind === "directory" || !names.has(name)) {
        names.set(name, childKind);
      }
    };
    for (const filePath of this.files.keys()) collect(filePath, "file");
    for (const dirPath of this.directories) collect(dirPath, "directory");
    // Match NodeFileSystem.list: a symbolic link is a non-directory entry at this surface. Callers that need
    // its concrete no-follow kind use inspectPath on the child after listing it.
    for (const aliasPath of this.aliases.keys()) collect(aliasPath, "file");
    return [...names].map(([name, kind]) => ({ name, kind }));
  }

  /** @inheritdoc */
  copyTree(from: string, to: string): void {
    const src = this.normalize(from);
    const dst = this.normalize(to);
    if (this.files.has(src)) {
      // Copying a single file.
      this.write(dst, this.files.get(src) as string);
      return;
    }
    if (!this.directories.has(src)) {
      throw new Error(`ENOENT: no such file or directory, copyTree '${src}'`);
    }
    this.recordDir(dst);
    const srcPrefix = src === "/" ? "/" : `${src}/`;
    // Copy every directory and file living under the source prefix, re-rooted at the destination.
    for (const dirPath of [...this.directories]) {
      if (dirPath.startsWith(srcPrefix)) {
        this.recordDir(`${dst}/${dirPath.slice(srcPrefix.length)}`);
      }
    }
    for (const [filePath, content] of [...this.files]) {
      if (filePath.startsWith(srcPrefix)) {
        this.files.set(`${dst}/${filePath.slice(srcPrefix.length)}`, content);
        this.recordDir(this.parentOf(`${dst}/${filePath.slice(srcPrefix.length)}`));
      }
    }
  }

  /** @inheritdoc */
  remove(path: string): void {
    const p = this.normalize(path);
    // Remove the path itself and everything beneath it; absent path is a no-op (force semantics).
    this.files.delete(p);
    const prefix = `${p}/`;
    for (const filePath of [...this.files.keys()]) {
      if (filePath.startsWith(prefix)) this.files.delete(filePath);
    }
    for (const dirPath of [...this.directories]) {
      if (dirPath === p || dirPath.startsWith(prefix)) {
        if (dirPath !== "/") {
          this.directories.delete(dirPath);
          this.directoryIdentities.delete(dirPath);
        }
      }
    }
    // Also drop any alias whose LINK path is `p` or sits beneath it — faithful to the real adapter, where
    // `remove` unlinks a symlink (so a later `exists` of the link path returns false). Without this an
    // alias entry would survive `remove`, masking the deletion a scope-alias teardown (e.g. `targets remove`)
    // depends on.
    for (const linkPath of [...this.aliases.keys()]) {
      if (linkPath === p || linkPath.startsWith(prefix)) {
        this.aliases.delete(linkPath);
      }
    }
  }

  /** @inheritdoc */
  removeFileConfined(
    confinementRoot: string,
    path: string,
    expectedContent: string,
    quarantine: ConfinedQuarantine,
  ): void {
    const target = this.normalize(path);
    this.assertConfinedMutationPath(confinementRoot, target, "file-or-missing");
    const privateSlot = this.assertQuarantine(confinementRoot, quarantine);
    if (this.inspectPath(target).kind !== "file" || this.read(target) !== expectedContent) {
      throw new Error(`confined file removal preimage changed: ${target}`);
    }
    if (this.inspectPath(privateSlot.path).kind !== "missing") {
      throw new Error(`confined file removal quarantine is occupied: ${privateSlot.path}`);
    }
    this.recordDir(this.parentOf(privateSlot.path));
    this.files.set(privateSlot.path, expectedContent);
    this.files.delete(target);
    this.afterConfinedFileDetachment(target, privateSlot.path);
    if (
      this.inspectPath(target).kind !== "missing" ||
      this.inspectPath(privateSlot.path).kind !== "file" ||
      this.read(privateSlot.path) !== expectedContent
    ) {
      if (this.inspectPath(target).kind === "missing") this.files.set(target, expectedContent);
      throw new Error(
        `confined public file raced after detachment: ${target}; prior bytes retained at ${privateSlot.path}`,
      );
    }
    this.files.delete(privateSlot.path);
    this.removeEmptyDirectoryChain(
      this.parentOf(privateSlot.path),
      this.parentOf(privateSlot.root),
    );
    if (this.inspectPath(target).kind !== "missing") {
      throw new Error(`confined public file raced before removal completion: ${target}`);
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
    const target = this.normalize(path);
    const privateSlot = this.assertQuarantine(confinementRoot, quarantine, "directory");
    const quarantinePath = privateSlot.path;
    const quarantineRoot = privateSlot.root;
    const displacedPath = `${quarantinePath}.displaced`;
    let publicKind = this.inspectPath(target).kind;
    let retainedKind = this.inspectPath(quarantinePath).kind;
    let displacedKind = this.inspectPath(displacedPath).kind;
    if (retainedKind !== "missing" && retainedKind !== "directory") {
      throw new Error(`confined retained tree is not a regular directory: ${quarantinePath}`);
    }
    if (displacedKind !== "missing" && displacedKind !== "directory") {
      throw new Error(`confined displaced tree is not a regular directory: ${displacedPath}`);
    }
    if (retainedKind === "missing" && publicKind !== "missing") {
      this.assertConfinedMutationPath(confinementRoot, path, "directory");
      if (this.treeFingerprint(path) !== expectedTreeFingerprint) {
        throw new Error(`confined removal tree preimage changed: ${path}`);
      }
      this.copyTree(target, quarantinePath);
      retainedKind = this.inspectPath(quarantinePath).kind;
      if (
        retainedKind !== "directory" ||
        this.treeFingerprint(quarantinePath) !== expectedTreeFingerprint
      ) {
        throw new Error(`confined retained tree changed during capture: ${quarantinePath}`);
      }
    } else if (
      retainedKind === "directory" &&
      publicKind === "directory" &&
      this.treeFingerprint(quarantinePath) !== expectedTreeFingerprint
    ) {
      if (
        this.treeFingerprint(target) !== expectedTreeFingerprint ||
        !this.treeIsExactSubset(quarantinePath, target)
      ) {
        throw new Error(`confined retained tree conflicts with public capture: ${quarantinePath}`);
      }
      this.copyTree(target, quarantinePath);
      if (this.treeFingerprint(quarantinePath) !== expectedTreeFingerprint) {
        throw new Error(`confined retained tree changed during resumed capture: ${quarantinePath}`);
      }
    }
    if (displacedKind !== "missing") {
      if (
        retainedKind !== "directory" ||
        this.treeFingerprint(quarantinePath) !== expectedTreeFingerprint ||
        !this.treeIsExactSubset(displacedPath, quarantinePath)
      ) {
        throw new Error(`confined displaced tree evidence changed: ${displacedPath}`);
      }
      if (publicKind !== "missing") {
        throw new Error(`confined public tree raced while owned bytes were displaced: ${path}`);
      }
      this.afterConfinedTreeDetachment(target, quarantinePath);
      if (this.inspectPath(target).kind !== "missing") {
        throw new Error(`confined public tree raced after detachment: ${path}`);
      }
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      if (!this.treeIsExactSubset(displacedPath, quarantinePath)) {
        throw new Error(`confined displaced tree changed before cleanup: ${displacedPath}`);
      }
      this.remove(displacedPath);
      displacedKind = "missing";
    }
    if (retainedKind === "directory" && publicKind !== "missing") {
      this.assertConfinedMutationPath(confinementRoot, path, "directory");
      if (this.treeFingerprint(path) !== expectedTreeFingerprint) {
        throw new Error(`confined removal tree preimage changed: ${path}`);
      }
      this.copyTree(target, displacedPath);
      this.remove(target);
      displacedKind = this.inspectPath(displacedPath).kind;
      publicKind = "missing";
      this.afterConfinedTreeDetachment(target, quarantinePath);
      if (this.inspectPath(target).kind !== "missing") {
        throw new Error(`confined public tree raced after detachment: ${path}`);
      }
      this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
      if (
        displacedKind !== "directory" ||
        this.treeFingerprint(displacedPath) !== expectedTreeFingerprint
      ) {
        throw new Error(`confined public tree changed during displacement: ${displacedPath}`);
      }
      this.remove(displacedPath);
    }
    if (this.inspectPath(target).kind !== "missing") {
      throw new Error(`confined public tree raced after detachment: ${path}`);
    }
    if (
      this.inspectPath(quarantinePath).kind === "missing" &&
      this.inspectPath(displacedPath).kind === "missing"
    ) {
      this.removeEmptyDirectoryChain(this.parentOf(quarantinePath), this.parentOf(quarantineRoot));
      return;
    }
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    if (this.treeFingerprint(quarantinePath) !== expectedTreeFingerprint) {
      throw new Error(`confined retained tree changed before cleanup: ${quarantinePath}`);
    }
    if (this.inspectPath(target).kind !== "missing") {
      throw new Error(`confined public tree raced before cleanup: ${path}`);
    }
    this.assertConfinedMutationPath(confinementRoot, path, "file-or-missing");
    this.remove(quarantinePath);
    this.removeEmptyDirectoryChain(this.parentOf(quarantinePath), this.parentOf(quarantineRoot));
  }

  /**
   * Record an alias and report it as a symlink. The in-memory fake has no real platform, so it always uses
   * the symlink kind (the Windows-copy fallback is the real adapter's concern, exercised via
   * `src/util/symlink.ts`). A relative target is stored **verbatim** (raw), exactly as a real symlink keeps it;
   * an absolute target is normalized to this fake's POSIX observation dialect. Thus the portable
   * `backlog → install-backlog` link (TASK-102) stays byte-for-byte relative, while a Win32 absolute target is
   * exposed with `/` separators. Resolution for {@link exists} happens in {@link resolveAliasTarget}.
   *
   * @inheritdoc
   */
  ensureAlias(target: string, linkPath: string): AliasResult {
    const link = this.normalize(linkPath);
    // This fake exposes a POSIX namespace. Normalize an OS-native ABSOLUTE target only at the observation
    // boundary where it is recorded, while preserving a relative symlink target byte-for-byte (archive
    // portability relies on values such as `install-backlog` remaining exactly relative).
    this.aliases.set(link, this.isAbsolute(target) ? toPosix(target) : target);
    this.recordDir(this.parentOf(link));
    return { kind: "symlink" };
  }

  /**
   * Test-only accessor: the observed target an alias points at, or `undefined` if no alias exists at
   * `linkPath`. An absolute target reads back in POSIX form; a relative target reads back verbatim (so a test
   * can assert a link is RELATIVE, e.g. `backlog → install-backlog`).
   *
   * @param linkPath - The alias location to look up.
   * @returns The observed target path the link stores, or `undefined`.
   */
  aliasTarget(linkPath: string): string | undefined {
    return this.aliases.get(this.normalize(linkPath));
  }
}
