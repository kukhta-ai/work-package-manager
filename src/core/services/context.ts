import { dirname, join, resolve } from "node:path";
import type { Environment, FileSystem } from "../ports/index.js";

/**
 * The `context` service (doc 13 §7) — *project context resolution*, the step that runs **before any
 * project-bound operation** to locate the **authoring workspace** the command should act on, and the nested
 * **deliverable** subdirectory it operates within. It answers one question: given where the command was invoked
 * (and an optional `-C/--project` override), *which directory is the workspace root* (and therefore which
 * `<workspace>/wip` is the deliverable root), or is there no workspace at all?
 *
 * It is pure **over the Environment + FileSystem ports** (doc 13 §3/§5): it reads the working directory from
 * {@link Environment.cwd} and probes for the workspace marker through {@link FileSystem.exists}, and so resolves
 * deterministically against the in-memory fakes in tests. It uses `node:path` (`join`/`dirname`/`resolve`) —
 * pure string operations the import-boundary rule permits in the core — but never `node:fs`: every disk touch
 * goes through the port.
 *
 * doc 10 ("Project context is explicit" + "Project context resolution"): every command except `init`, the
 * project-agnostic `template` subcommands, and the machine-level installers operates on an authoring workspace,
 * resolved by **walking up from the working directory until the workspace marker is found** — a directory holding
 * the deliverable subdirectory `wip/` with a `wip/manifest.yml`, beside the authoring front door. The resolved
 * workspace root is the directory that directly contains `wip/manifest.yml`, and the deliverable root is exactly
 * `<workspace>/wip` (where the manifest, bundles, installer-skills, templates, and executor front door live).
 * Because the walk keys on `wip/manifest.yml` at the *parent* of the deliverable, a command run anywhere within
 * the workspace — the root, inside `wip/`, or inside a bundle at `wip/bundles/<id>/…` — resolves the **same**
 * deliverable root. A global `-C/--project <path>` **overrides** that search and points straight at a workspace
 * root elsewhere (the marker is checked at `<path>/wip/manifest.yml`, no walk-up). A bare directory that holds a
 * `manifest.yml` directly (not under `wip/`) is **not** a workspace — only `wip/manifest.yml` identifies one.
 * The outcome is a discriminated {@link ProjectContext}: a *located* workspace (both roots), or an explicit
 * *no-workspace* result. Crucially, no-workspace is **data, not an exception** — the project-agnostic
 * `template list`/`show` tolerate it by falling back to built-ins, while a project-bound command maps it to a
 * Not-found domain error (task-23) at the command layer (naming the marker and suggesting `init`/`-C`). This
 * service itself never throws and never prints; it only *computes the context* and hands it back.
 */

/** The deliverable subdirectory of an authoring workspace (docs 06/12): the workspace's `wip/` directory. */
export const DELIVERABLE_DIR = "wip";

/** The manifest filename inside the deliverable subdirectory — the leaf of the workspace marker (doc 10/06). */
export const WORKSPACE_MANIFEST = "manifest.yml";

/**
 * The workspace marker, relative to a candidate directory: a directory is a workspace root iff it directly
 * contains this `wip/manifest.yml` (doc 10 "Project context resolution"). The marker is `wip/manifest.yml`
 * rather than a bare `manifest.yml` (whose presence at a directory would make an unwrapped deliverable look like
 * a workspace) or the gitignored `.authoring-backlog/` (absent after a fresh clone).
 */
export const WORKSPACE_MARKER = join(DELIVERABLE_DIR, WORKSPACE_MANIFEST);

/**
 * The result of {@link resolveContext}: either a located workspace (its workspace root and the nested
 * deliverable root), or an explicit *no-workspace* outcome.
 *
 * A discriminated union on `found` so callers must handle both arms. `{ found: false }` is a normal,
 * inspectable value — **never a thrown error** (doc 13 §7): project-agnostic callers (`template list`/`show`)
 * proceed with built-ins, and project-bound callers turn it into a Not-found domain error (task-23) at the
 * command layer.
 */
export type ProjectContext =
  | {
      readonly found: true;
      /** The authoring workspace root: the directory that directly contains `wip/manifest.yml`. */
      readonly workspaceRoot: string;
      /** The deliverable root — exactly `<workspaceRoot>/wip` — every project-bound command reads and writes. */
      readonly deliverableRoot: string;
    }
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
   * The `-C/--project <path>` override (doc 10). When present it **replaces** the upward search: it points at a
   * workspace root directly, the marker `wip/manifest.yml` is checked at *that* directory only (no walk-up), and
   * a relative value is resolved against the working directory ({@link Environment.cwd}).
   */
  readonly projectOverride?: string;
}

/** Build the located-workspace context for a confirmed workspace root: its root plus the nested deliverable. */
function located(workspaceRoot: string): ProjectContext {
  return {
    found: true,
    workspaceRoot,
    deliverableRoot: join(workspaceRoot, DELIVERABLE_DIR),
  };
}

/**
 * Resolve the project context for a command (doc 13 §7).
 *
 * - **With an override** (`opts.projectOverride`): resolve it against the working directory (so both absolute
 *   and relative overrides work) to a candidate workspace root, then check the marker `wip/manifest.yml` at
 *   *exactly* that directory — no upward walk. Present → that directory is the workspace root (and `<dir>/wip`
 *   the deliverable root); absent → no-workspace.
 * - **Without an override**: walk upward from {@link Environment.cwd}, git-style, returning the **nearest**
 *   ancestor that directly contains the marker `wip/manifest.yml`. If the filesystem root is reached without a
 *   hit, the result is no-workspace. The walk always terminates: it stops the moment a directory's parent equals
 *   itself (`dirname(dir) === dir`, the filesystem root), so it can neither loop forever nor step past root.
 *
 * Never throws and never performs output — a missing workspace is reported as `{ found: false }` (the command
 * layer decides whether that is fatal).
 *
 * @param deps - The injected environment + filesystem ports.
 * @param opts - Optional resolution options (the `-C/--project` override).
 * @returns The located workspace (workspace + deliverable roots), or an explicit no-workspace result.
 */
export function resolveContext(deps: ResolveDeps, opts?: ResolveOptions): ProjectContext {
  const { fs, env } = deps;

  const override = opts?.projectOverride;
  if (override !== undefined) {
    // The override points AT a workspace root: resolve it against cwd (absolute overrides resolve to
    // themselves), then check `wip/manifest.yml` there and only there — never walk up from an override.
    const workspaceRoot = resolve(env.cwd(), override);
    return fs.exists(join(workspaceRoot, WORKSPACE_MARKER))
      ? located(workspaceRoot)
      : { found: false };
  }

  // No override: walk upward from cwd until the marker is found or the filesystem root is passed.
  let dir = env.cwd();
  while (true) {
    if (fs.exists(join(dir, WORKSPACE_MARKER))) {
      return located(dir);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // `dirname` of the filesystem root is the root itself — we have checked it and found nothing.
      return { found: false };
    }
    dir = parent;
  }
}
