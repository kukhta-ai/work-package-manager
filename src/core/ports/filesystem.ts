/**
 * The FileSystem port (doc 13 §3) — the one abstraction through which the pure core reaches the file tree.
 * The core computes against this interface and never learns whether it got the real adapter (`node-fs`) or
 * the in-memory fake (`memory-fs`), which is what makes the bulk of the system unit-testable in memory
 * (doc 13 §1).
 *
 * Every method is **synchronous**: the core is sequential and does no concurrent or long I/O, so sync keeps
 * the whole stack uncoloured and tests trivial (cross-cutting decision; doc 13 §0). The disk vocabulary is
 * deliberately small — exactly the operations doc 13 §3 names, nothing more.
 *
 * This file lives under `src/core/`, so the import-boundary rule applies — but an interface imports nothing
 * effectful, so it is trivially clean. The effects live in the adapters under `src/adapters/`.
 */

/**
 * One entry returned by {@link FileSystem.list}: its name (not a full path) and whether it is a file or a
 * directory. The builder only needs names plus the file/directory distinction.
 */
export interface DirEntry {
  /** The entry's name within the listed directory (no path separators). */
  readonly name: string;
  /** Whether the entry is a regular file or a directory. */
  readonly kind: "file" | "directory";
}

/**
 * The result of {@link FileSystem.ensureAlias}: which mechanism the adapter actually used to create the
 * scope alias. On POSIX it is a symlink; on Windows (where symlinks need elevation) the adapter falls back
 * to a recursive copy and reports a `warning` the operation can surface to the user. The caller never
 * branches on platform — it only reads this result (doc 13 §3: "the core never branches on platform").
 *
 * Output is not a port: the adapter does not print the warning, it returns it here.
 */
export type AliasResult =
  | { readonly kind: "symlink" }
  | { readonly kind: "copy"; readonly warning: string };

/**
 * A no-follow inspection of one filesystem path. Workspace-integration ownership checks must distinguish a
 * regular file/directory from a symbolic link (including a broken link) before they authorize a write; the
 * existing `exists` probe intentionally follows links and therefore cannot supply that evidence.
 */
export type PathInspection =
  | { readonly kind: "missing" }
  | { readonly kind: "file" }
  | { readonly kind: "directory" }
  | { readonly kind: "symbolic-link"; readonly target: string }
  | { readonly kind: "other" };

/** One immutable UTF-8 read bound to the digest of those exact bytes. */
export interface DigestedText {
  readonly content: string;
  readonly sha256: string;
}

/** Read-only evidence that the current process can mutate one path through its existing parent chain. */
export type MutationCapability =
  | { readonly capable: true }
  | { readonly capable: false; readonly reason: string };

/** Exact file preimage checked inside one confined atomic write. */
export type ConfinedWritePrecondition =
  | {
      readonly kind: "missing";
      /** When set, the target's direct parent must itself be absent before this one-file tree is created. */
      readonly parentTree?: "missing";
    }
  | { readonly kind: "text"; readonly content: string; readonly parentTree?: never }
  | {
      readonly kind: "sha256";
      readonly sha256: string;
      /** When set, the target's direct parent must contain this file and no sibling entries. */
      readonly parentTree?: "one-file";
    };

/** Deterministic WPM-private residue identity for one guarded applying beat. */
export interface ConfinedQuarantine {
  /** Request-bound private root recorded in the applying state. */
  readonly root: string;
  /** Exact file/tree slot beneath {@link root} used by this beat. */
  readonly path: string;
}

/**
 * The file-system operations the builder needs, as a replaceable, synchronous abstraction (doc 13 §3).
 */
export interface FileSystem {
  /**
   * Read a UTF-8 text file and return its contents.
   *
   * @param path - The file path.
   * @returns The file's contents as a string.
   * @throws If the file does not exist or cannot be read.
   */
  read(path: string): string;

  /**
   * Write a UTF-8 text file **atomically**, creating any missing parent directories first.
   *
   * The write either fully succeeds or leaves a pre-existing file at `path` intact — an interrupted write
   * never leaves a partial or corrupt file observable at `path` (the real adapter writes to a temp file in
   * the same directory, then renames over the target). If the adapter created missing parents for a failed
   * write, it removes only those that remain empty so an initial bootstrap write can be retried safely.
   *
   * @param path - The destination file path.
   * @param content - The full contents to write.
   */
  write(path: string, content: string): void;

  /**
   * Recheck that every existing component from `confinementRoot` through `path` is a regular, no-follow
   * descendant at the mutation boundary, bind any requested one-file parent-tree preimage, then publish the
   * complete text without clobbering a path that appears after inspection.
   */
  writeConfined(
    confinementRoot: string,
    path: string,
    content: string,
    expected: ConfinedWritePrecondition,
    quarantine?: ConfinedQuarantine,
  ): void;

  /**
   * Test whether a path exists (file or directory).
   *
   * @param path - The path to test.
   * @returns `true` if something exists at `path`.
   */
  exists(path: string): boolean;

  /**
   * Inspect a path without following its final symbolic link.
   *
   * @param path - The path to inspect.
   * @returns Its concrete kind, or `missing`; symbolic links include their stored target.
   */
  inspectPath(path: string): PathInspection;

  /**
   * Compute the SHA-256 digest of one readable file's bytes. Used only as durable exact-content ownership
   * evidence; callers still inspect the path kind first.
   *
   * @param path - The file to digest.
   * @returns A lowercase hexadecimal SHA-256 digest.
   * @throws If the path is missing or not a readable file.
   */
  digestFile(path: string): string;

  /** Read one regular UTF-8 file and hash the exact same captured bytes. */
  readWithDigest(path: string): DigestedText;

  /**
   * Resolve an existing path through every symbolic-link ancestor to its absolute canonical identity.
   * Workspace integration uses this only to bind a durable root and prevent managed descendants escaping
   * through an aliased ancestor.
   */
  canonicalPath(path: string): string;

  /**
   * Inspect whether a later atomic write or owned removal at `path` is predictably possible now.
   * This performs no probe write and creates nothing; a later effect can still fail and is reported by the
   * operation's typed partial contract.
   */
  inspectMutationCapability(path: string): MutationCapability;

  /** Read-only proof that two effect paths resolve through existing ancestors on one filesystem/device. */
  inspectMutationCompatibility(firstPath: string, secondPath: string): MutationCapability;

  /**
   * Create a directory and any missing parents (like `mkdir -p`). A no-op if it already exists.
   *
   * @param path - The directory path to create.
   */
  makeDirectories(path: string): void;

  /**
   * List the immediate entries of a directory.
   *
   * @param path - The directory path.
   * @returns The directory's entries (names + kind); order is not guaranteed.
   * @throws If `path` does not exist or is not a directory.
   */
  list(path: string): DirEntry[];

  /**
   * Recursively copy a file or directory tree from `from` to `to`, preserving bytes (so binary payload
   * files survive intact). Missing parents of `to` are created. If `to` already exists, the copy **merges**
   * into it — existing files are kept and source files are added or overwritten; the destination is not
   * replaced wholesale.
   *
   * @param from - The source file or directory.
   * @param to - The destination path.
   */
  copyTree(from: string, to: string): void;

  /**
   * Recursively remove a path (file or directory). Does nothing — and does not error — if it is absent.
   *
   * @param path - The path to remove.
   */
  remove(path: string): void;

  /**
   * Recheck a no-follow descendant and its canonical no-follow tree fingerprint at the mutation boundary,
   * detach that exact tree without replacing a raced destination, then retire only the detached owned tree.
   */
  removeConfined(
    confinementRoot: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: ConfinedQuarantine,
  ): void;

  /**
   * Create a scope-alias link from `target` to `linkPath`, hiding the platform decision (doc 13 §3; doc 12).
   * On POSIX this is a symlink; on Windows it falls back to a recursive copy and reports a warning. The
   * caller reads the returned {@link AliasResult} and never branches on platform itself.
   *
   * @param target - The path the alias should point at (the real location).
   * @param linkPath - Where the alias is created.
   * @returns Which mechanism was used, plus a warning when it fell back to a copy.
   */
  ensureAlias(target: string, linkPath: string): AliasResult;
}
