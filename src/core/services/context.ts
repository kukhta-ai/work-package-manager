import { dirname, join, resolve } from "node:path";
import type { Environment, FileSystem } from "../ports/index.js";

/**
 * The `context` service (doc 13 §7) — *project context resolution*, the step that runs **before any
 * project-bound operation** to locate the project the command should act on. It answers one question: given
 * where the command was invoked (and an optional `-C/--project` override), *which directory is the project
 * root*, or is there no project at all?
 *
 * It is pure **over the Environment + FileSystem ports** (doc 13 §3/§5): it reads the working directory from
 * {@link Environment.cwd} and probes for the project marker through {@link FileSystem.exists}, and so resolves
 * deterministically against the in-memory fakes in tests. It uses `node:path` (`join`/`dirname`/`resolve`) —
 * pure string operations the import-boundary rule permits in the core — but never `node:fs`: every disk touch
 * goes through the port.
 *
 * doc 10 ("Project context is explicit"): every command except `init` and the project-agnostic `template`
 * subcommands operates on a project identified by **walking up from the working directory until a
 * `manifest.yml` is found**, git-style; a global `-C/--project <path>` **overrides** that search and points
 * straight at a project root. The outcome is a discriminated {@link ProjectContext}: a *located* root, or an
 * explicit *no-project* result. Crucially, no-project is **data, not an exception** — the project-agnostic
 * `template list`/`show` tolerate it by falling back to built-ins, while a project-bound command maps it to a
 * Not-found domain error (task-23) at the command layer (naming the marker and suggesting `init`/`-C`). This
 * service itself never throws and never prints; it only *computes the context* and hands it back.
 */

/** The project marker filename: a directory is a project root iff it directly contains this (doc 00/06). */
export const PROJECT_MARKER = "manifest.yml";

/**
 * The result of {@link resolveContext}: either a located project root, or an explicit *no-project* outcome.
 *
 * A discriminated union on `found` so callers must handle both arms. `{ found: false }` is a normal,
 * inspectable value — **never a thrown error** (doc 13 §7): project-agnostic callers (`template list`/`show`)
 * proceed with built-ins, and project-bound callers turn it into a Not-found domain error (task-23) at the
 * command layer.
 */
export type ProjectContext =
  | { readonly found: true; readonly root: string }
  | { readonly found: false };

/** The injected dependencies a resolution needs: the environment and filesystem ports (doc 13 §3). */
export interface ResolveDeps {
  /** The filesystem port (real or fake), used only to probe for the marker via {@link FileSystem.exists}. */
  readonly fs: FileSystem;
  /** The environment port (real or fake), used for the starting working directory via {@link Environment.cwd}. */
  readonly env: Environment;
}

/** Options that steer a resolution. */
export interface ResolveOptions {
  /**
   * The `-C/--project <path>` override (doc 10). When present it **replaces** the upward search: it points at
   * a project root directly, the marker is checked at *that* directory only (no walk-up), and a relative value
   * is resolved against the working directory ({@link Environment.cwd}).
   */
  readonly projectOverride?: string;
}

/**
 * Resolve the project context for a command (doc 13 §7).
 *
 * - **With an override** (`opts.projectOverride`): resolve it against the working directory (so both absolute
 *   and relative overrides work), then check the marker at *exactly* that directory — no upward walk. Present
 *   → that directory is the root; absent → no-project.
 * - **Without an override**: walk upward from {@link Environment.cwd}, git-style, returning the **nearest**
 *   ancestor that directly contains {@link PROJECT_MARKER}. If the filesystem root is reached without a hit,
 *   the result is no-project. The walk always terminates: it stops the moment a directory's parent equals
 *   itself (`dirname(dir) === dir`, the filesystem root), so it can neither loop forever nor step past root.
 *
 * Never throws and never performs output — a missing project is reported as `{ found: false }` (the command
 * layer decides whether that is fatal).
 *
 * @param deps - The injected environment + filesystem ports.
 * @param opts - Optional resolution options (the `-C/--project` override).
 * @returns The located project root, or an explicit no-project result.
 */
export function resolveContext(deps: ResolveDeps, opts?: ResolveOptions): ProjectContext {
  const { fs, env } = deps;

  const override = opts?.projectOverride;
  if (override !== undefined) {
    // The override points AT a project root: resolve it against cwd (absolute overrides resolve to
    // themselves), then check the marker there and only there — never walk up from an override.
    const root = resolve(env.cwd(), override);
    return fs.exists(join(root, PROJECT_MARKER)) ? { found: true, root } : { found: false };
  }

  // No override: walk upward from cwd until the marker is found or the filesystem root is passed.
  let dir = env.cwd();
  while (true) {
    if (fs.exists(join(dir, PROJECT_MARKER))) {
      return { found: true, root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // `dirname` of the filesystem root is the root itself — we have checked it and found nothing.
      return { found: false };
    }
    dir = parent;
  }
}
