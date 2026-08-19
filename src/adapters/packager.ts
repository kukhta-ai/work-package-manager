import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { BUILD_FORMATS } from "../completion/enums.js";
import { ValidationError } from "../core/errors.js";
import type { FrontDoorTransform } from "../core/operations/build.js";
import type { FileSystem } from "../core/ports/index.js";
import { toPosix } from "../util/posix-path.js";
import { runSync } from "../util/shell.js";

/**
 * The build PACKAGER — the INFRASTRUCTURE that turns a project's shippable file set into a distributable
 * archive, and pushes one to a destination (doc 10 rows `build package` / `build publish`; doc 12
 * §"Distribution": "the project IS the package — no separate publish step that transforms it"). This is a
 * driven adapter: it lives OUTSIDE `src/core/`, so it may use `node:fs`/`node:os` and shell out via
 * {@link runSync} — exactly the effects the pure `build` operation (`src/core/operations/build.ts`) is
 * forbidden (doc 13 §1/§3/§6). The pure operation computes the PLAN (validate + frozen-lockfile + the
 * shippable file list); THIS performs the EFFECT. Errors are raised as the core's typed {@link UsageError}/
 * {@link ValidationError} so the CLI maps them to the right exit code with no adapter-specific handling.
 *
 * Archiving shells out to ubiquitous tools (no new dependency — `runSync` wraps the already-present execa):
 * `tar` (tarball), `git archive` (git), `zip` (zip). `zip` may be absent on a given platform; a missing tool
 * for a valid format is surfaced as a clear typed error, never an opaque crash.
 */

/** A build output format (doc 10 `build package --format`) — the model's single source, also the completion enum. */
export type BuildFormat = (typeof BUILD_FORMATS)[number];

/** The file extension produced for each format (`.tgz` for the gzip-tar formats, `.zip` for zip). */
const FORMAT_EXTENSION: Readonly<Record<BuildFormat, string>> = {
  zip: "zip",
  tarball: "tgz",
  git: "tgz",
};

/** A request to produce an archive of a project's shippable file set. */
export interface PackageRequest {
  /** The project root the shippable paths are relative to. */
  readonly root: string;
  /** The directory the archive is written into (the CLI passes the workspace's `builds/` output directory). */
  readonly outDir: string;
  /** The archive's base name (no extension) — typically `<project>-<version>`. */
  readonly baseName: string;
  /** The archive format. */
  readonly format: BuildFormat;
  /** The sorted, root-relative shippable file paths (from the pure build plan). */
  readonly files: readonly string[];
  /**
   * The executor-front-door transforms to apply while archiving (task-90; doc 06/12; the pure plan's
   * `frontDoorTransforms`). When non-empty, the tarball/zip formats STAGE the shippable set into a temp dir and,
   * per transform, write the canonical `AGENTS.md` from the reserved `_AGENTS.md`'s bytes (verbatim), synthesize
   * the per-target alias front doors, and drop the `_AGENTS.md` (so the archive carries the canonical name only).
   * Omitted/empty ⇒ the archive contains exactly `files`, unchanged (the pre-task-90 behaviour). Every format,
   * including `git`, consumes this same transformed file set (TASK-95).
   */
  readonly transforms?: readonly FrontDoorTransform[];
}

/** A request to push a built archive to a destination (doc 10 `build publish <destination>`). */
export interface PushRequest {
  /** The project root (the cwd for a git-remote push). */
  readonly root: string;
  /** The path of the already-built archive to push. */
  readonly archive: string;
  /** Where to push it — a local directory path, or a git remote (URL / remote name). */
  readonly destination: string;
}

/** The outcome of a push: a human-readable description of where the archive landed (for the success line). */
export interface PushResult {
  /** Where the archive was placed/pushed (a directory path, or `git remote <destination>`). */
  readonly where: string;
}

/**
 * Compute the absolute output path for a request: `<outDir>/<baseName>.<ext>`, as a POSIX path. This value is
 * both RETURNED to the CLI (which prints it in the `packaged …` / `published …` line) and a portable artefact
 * reference, so it must read with `/` on every OS — hence `toPosix` over the native `join`. The archive is
 * still WRITTEN through `tar`/`zip`/`git`, all of which accept a `/`-separated output path on Windows, so the
 * single POSIX form serves both the effect and the printed/returned value (no native variant is needed).
 */
function outputPath(req: PackageRequest): string {
  return toPosix(join(req.outDir, `${req.baseName}.${FORMAT_EXTENSION[req.format]}`));
}

/**
 * Whether the named command-line tool is available on this platform (probed with a benign version/help flag).
 * Used to turn an absent `zip` into a clear typed error before attempting the archive, rather than letting
 * `runSync` throw an opaque spawn failure.
 *
 * @param tool - The executable name (e.g. `"zip"`).
 * @param versionArg - The benign argument that prints a version and exits 0 (e.g. `"-v"`).
 * @returns `true` when the tool ran (exists), `false` on a spawn failure (absent).
 */
function toolAvailable(tool: string, versionArg: string): boolean {
  try {
    runSync(tool, [versionArg]);
    return true;
  } catch (err) {
    // `runSync` throws two shapes: "Command failed (exit N)" when the tool RAN but exited non-zero (so it
    // EXISTS), and "Command could not be run" on a spawn failure (the tool is ABSENT). Only the latter means
    // unavailable — a present-but-nonzero version probe still proves the tool exists.
    const message = err instanceof Error ? err.message : String(err);
    return message.startsWith("Command failed (exit");
  }
}

/**
 * Produce a distributable archive of the project's shippable file set, returning its path (doc 10 row 182).
 * The archive contains EXACTLY the supplied `files` (the pure plan's shippable set), so what `build package`
 * writes matches what `build dry-run` previewed. Format mechanics:
 *
 * - **tarball** → `tar -czf <out> -C <root> -T <listfile>`: the sorted relative paths are written to a temp
 *   list file (avoids ARG_MAX and is robust for large sets), and `tar` reads the files itself.
 * - **git** → stage the exact shippable set, write a temporary Git tree from it, then run `git archive` over
 *   that tree. This keeps Git-format layout identical to tarball/zip without depending on the source workspace's
 *   repository or committed `HEAD` (TASK-95).
 * - **zip** → `zip -r -q -y <out> <files…>` (cwd = root): `-y` preserves planned symlinks instead of
 *   dereferencing them, so zip layout stays aligned with tarball/Git. `zip` may be ABSENT — probed first; a
 *   missing `zip` raises a typed error suggesting `--format tarball` rather than crashing.
 *
 * @param req - The package request (root, output dir, base name, format, shippable files).
 * @returns The absolute path of the produced archive.
 * @throws {ValidationError} On a missing tool, an empty file set, or a tool failure (exit 1, environment-level).
 */
export function createArchive(req: PackageRequest): string {
  const out = outputPath(req);

  if (req.files.length === 0) {
    // An empty ship set is an environment/state problem, not a bad CLI argument → ValidationError (exit 1).
    throw new ValidationError("nothing to package: the shippable file set is empty");
  }

  switch (req.format) {
    case "tarball":
      return createTarball(req, out);
    case "git":
      return createGitArchive(req, out);
    case "zip":
      return createZip(req, out);
    default: {
      // Unreachable: the CLI's `.choices([...BUILD_FORMATS])` rejects an unknown format as a usage error (exit
      // 2) before reaching here. Defensive exhaustiveness for a future format added to the enum but not here.
      const never: never = req.format;
      throw new ValidationError(`unsupported build format: ${String(never)}`);
    }
  }
}

/**
 * An archive source: the directory whose tree is archived plus the sorted, root-relative file list to put in it.
 * Either the project root + plain shippable set (tarball/zip without transforms), or a temp staging directory +
 * the prepared set (all Git builds, and transformed tarball/zip builds).
 */
interface ArchiveSource {
  /** The directory the archive is rooted at (`-C <dir>` / the zip cwd). */
  readonly dir: string;
  /** The sorted, root-relative paths to archive from {@link dir}. */
  readonly files: readonly string[];
  /** A temp staging dir to delete after archiving, or `undefined` when archiving the project root directly. */
  readonly cleanup: string | undefined;
}

/**
 * Stage the exact shippable set into a temp dir and apply any executor-front-door transforms (task-90; docs
 * 06/12). Each entry is copied preserving symlinks. For each transform, the canonical `AGENTS.md` is copied from
 * the ORIGINAL `_AGENTS.md` bytes, aliases are relative symlinks to it, and the prefixed source is removed. Git
 * builds always use this prepared source (TASK-95); tarball/zip use it when transforms are present. If staging
 * fails before returning, this function removes its own temp directory; otherwise the caller owns cleanup.
 *
 * @param req - The package request (root, shippable files, transforms).
 * @returns The {@link ArchiveSource} rooted at the staging dir.
 */
function stageArchiveSource(req: PackageRequest): ArchiveSource {
  const dir = mkdtempSync(join(tmpdir(), "wpm-stage-"));
  try {
    // (1) Copy the shippable set into the staging dir, preserving symlinks (scope aliases) and any dir leaves.
    for (const rel of req.files) {
      const src = join(req.root, rel);
      const dst = join(dir, rel);
      mkdirSync(dirname(dst), { recursive: true });
      const stat = lstatSync(src);
      if (stat.isSymbolicLink()) {
        // Re-create the link with its exact target so the archived entry is byte-identical to a non-staged build.
        symlinkSync(readlinkSync(src), dst);
      } else if (stat.isDirectory()) {
        // A directory leaf (rare — the ship set is files + symlink aliases); recreate it so the path exists.
        mkdirSync(dst, { recursive: true });
      } else {
        copyFileSync(src, dst);
      }
    }

    // (2) Apply each front-door transform, tracking which paths the archive should list.
    const dropped = new Set<string>();
    const added: string[] = [];
    for (const transform of req.transforms ?? []) {
      const toDst = join(dir, transform.to);
      mkdirSync(dirname(toDst), { recursive: true });
      // Verbatim: copy the ORIGINAL reserved front door's bytes (not the staged copy, which is about to be dropped).
      copyFileSync(join(req.root, transform.from), toDst);
      added.push(transform.to);
      // The aliases are relative symlinks to the canonical name in the same directory (e.g. CLAUDE.md → AGENTS.md).
      const canonical = basename(transform.to);
      for (const alias of transform.aliases) {
        const aliasDst = join(dir, alias);
        mkdirSync(dirname(aliasDst), { recursive: true });
        symlinkSync(canonical, aliasDst);
        added.push(alias);
      }
      // Drop the staged reserved front door so the archive never carries both names (AC#5).
      rmSync(join(dir, transform.from), { force: true });
      dropped.add(transform.from);
    }

    const files = [...req.files.filter((f) => !dropped.has(f)), ...added].sort();
    return { dir, files, cleanup: dir };
  } catch (err) {
    // If copying or transforming fails before an ArchiveSource can be returned, the caller has no cleanup path.
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Resolve where a tarball/zip archive is rooted and which files it lists. With front-door transforms present,
 * the shippable set is staged and transformed; otherwise those formats archive the project root directly.
 */
function archiveSource(req: PackageRequest): ArchiveSource {
  if ((req.transforms ?? []).length > 0) {
    return stageArchiveSource(req);
  }
  return { dir: req.root, files: req.files, cleanup: undefined };
}

/** Create a gzip tarball of the shippable files via `tar -C <dir> -T <listfile>` (a temp list avoids ARG_MAX). */
function createTarball(req: PackageRequest, out: string): string {
  const source = archiveSource(req);
  const listDir = mkdtempSync(join(tmpdir(), "wpm-pkg-"));
  const listFile = join(listDir, "files.txt");
  try {
    // One relative path per line; `tar -T` reads them and archives each, rooted at `-C <dir>`.
    writeFileSync(listFile, `${source.files.join("\n")}\n`, "utf8");
    runArchiveTool("tar", ["-czf", out, "-C", source.dir, "-T", listFile], "tar");
  } finally {
    rmSync(listDir, { recursive: true, force: true });
    if (source.cleanup !== undefined) {
      rmSync(source.cleanup, { recursive: true, force: true });
    }
  }
  return out;
}

/**
 * Create a gzip-tar archive through Git from the exact prepared shippable tree (TASK-95). The temporary index
 * is written to a tree object and archived directly, so no commit identity or source-repository `HEAD` is needed.
 */
function createGitArchive(req: PackageRequest, out: string): string {
  // Git must ALWAYS stage, even without front-door transforms: req.root may be the `wip/` subdirectory of a
  // larger repository, and `git archive HEAD` would archive that enclosing checkout rather than req.files.
  const source = stageArchiveSource(req);
  try {
    runSync("git", ["init", "--quiet"], { cwd: source.dir });
    // The plan is authoritative even when the deliverable carries .gitignore/.gitattributes. Force every staged
    // path into the index and neutralize every Git attribute that can transform content at check-in/archive time,
    // so Git neither drops planned paths nor rewrites/transcodes author-owned bytes in the temporary tree.
    writeFileSync(
      join(source.dir, ".git", "info", "attributes"),
      "* -export-ignore -export-subst -text -eol -filter -ident -working-tree-encoding\n",
      "utf8",
    );
    runSync(
      "git",
      [
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.symlinks=true",
        "add",
        "--all",
        "--force",
        "--",
        ".",
      ],
      { cwd: source.dir },
    );
    const tree = runSync("git", ["write-tree"], { cwd: source.dir }).stdout.trim();
    if (tree.length === 0) {
      throw new Error("git write-tree returned no tree id");
    }
    runSync("git", ["archive", "--format=tar.gz", "-o", out, tree], { cwd: source.dir });
  } catch (err) {
    // Git absent or any plumbing/archive failure → a clear typed error (exit 1), with the underlying reason.
    const reason = err instanceof Error ? err.message : String(err);
    throw new ValidationError(
      `git archive failed while packaging the prepared shippable tree\n${reason}`,
    );
  } finally {
    if (source.cleanup !== undefined) {
      rmSync(source.cleanup, { recursive: true, force: true });
    }
  }
  return out;
}

/**
 * Create a zip of the shippable files via `zip -r -q -y` (cwd = source dir). Info-ZIP's `-y` stores symbolic
 * links as links rather than following their targets, preserving the same planned layout as tarball/Git.
 */
function createZip(req: PackageRequest, out: string): string {
  if (!toolAvailable("zip", "-v")) {
    throw new ValidationError(
      "`zip` is not available on this system — install it, or use `--format tarball` (or `--format git`)",
    );
  }
  const source = archiveSource(req);
  try {
    // Run with cwd=<source dir> so entries are root-relative; `-y` preserves scope/front-door alias symlinks.
    runArchiveTool("zip", ["-r", "-q", "-y", out, ...source.files], "zip", {
      cwd: source.dir,
    });
  } finally {
    if (source.cleanup !== undefined) {
      rmSync(source.cleanup, { recursive: true, force: true });
    }
  }
  return out;
}

/** Run an archiving tool, re-wrapping any failure (including a spawn failure) as a typed {@link ValidationError}. */
function runArchiveTool(
  tool: string,
  args: readonly string[],
  label: string,
  opts?: { cwd?: string },
): void {
  try {
    runSync(tool, args, opts ?? {});
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`${label} failed while creating the archive\n${reason}`);
  }
}

/**
 * Push an already-built archive to a destination (doc 10 row 183 — deliberately open: "registry URL, git
 * remote, etc."). Two testable, headless destination kinds are supported:
 *
 * - **a local directory** (the destination exists as a directory): the archive is COPIED into it via the
 *   FileSystem port — the simplest verifiable publish (no network/credentials).
 * - **a git remote** (anything else): `git push <destination>` (cwd = root). Headless-testable against a
 *   local bare repo; a real remote URL is the same shell-out.
 *
 * A real npm/registry publish (an HTTP upload needing credentials) is DEFERRED — it is the same shell-out a
 * `npm publish` would be, out of scope for v1 (doc 12 §"What's deliberately not in the architecture": a
 * fetch/publish registry is a v2 conversation).
 *
 * @param deps - The FileSystem port (for the local-directory copy).
 * @param req - The push request (root, the built archive, the destination).
 * @returns Where the archive landed (for the command's success line).
 * @throws {ValidationError} On a git-push failure (exit 1).
 */
export function pushArchive(deps: { readonly fs: FileSystem }, req: PushRequest): PushResult {
  // A local directory destination → copy the archive in (the headless happy path). `target` is RETURNED as the
  // printed `where`, so it is POSIX-normalized: the publish-destination path a user sees must read with `/` on
  // every OS (doc 10 row 183). The FileSystem port's `copyTree` accepts the `/`-form on Windows too, so the one
  // POSIX value serves both the copy and the printed result.
  if (deps.fs.exists(req.destination)) {
    const target = toPosix(join(req.destination, basename(req.archive)));
    deps.fs.copyTree(req.archive, target);
    return { where: target };
  }

  // Otherwise treat the destination as a git remote (URL or remote name) and push the current commit. `HEAD`
  // is pushed explicitly (rather than a bare `git push`) so the publish does not depend on a configured
  // upstream/tracking branch — it works against a fresh remote or a bare repo.
  try {
    runSync("git", ["push", req.destination, "HEAD"], { cwd: req.root });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ValidationError(
      `failed to push to "${req.destination}" — expected an existing local directory or a reachable git remote\n${reason}`,
    );
  }
  return { where: `git remote ${req.destination}` };
}

/** Re-export so a caller importing the packager need not also reach into the completion enums. */
export { BUILD_FORMATS };
