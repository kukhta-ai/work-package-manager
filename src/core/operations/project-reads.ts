import type { Project, ValidationReport } from "../model/index.js";
import { validateProject } from "../services/validate.js";
import type { ReadSpec } from "./lifecycle.js";

/**
 * The read-only `project` orientation commands (doc 10 rows `project show` / `project validate`) — pure
 * projections off the loaded {@link Project}, plugged into the task-25 `runRead` read trace (doc 13 §8). They
 * change nothing on disk; the CLI shell formats the projected value (output is not a port — doc 13 §3).
 *
 * (`project root` (doc 10 row 149) needs no spec here: it is just the already-resolved project root path printed
 * on one line — the command resolves it via `resolveContext` and prints it directly.)
 *
 * Pure: imports only the model, the task-20 {@link validateProject} service, and the lifecycle {@link ReadSpec}
 * type — never `commander`/`node:fs`/`execa` — so the import-boundary rule on `src/core/operations/` holds.
 */

/** One enabled bundle in the {@link ProjectOrientation}: its id, the version read from its `bundle.yml`, and the summary. */
export interface BundleOrientation {
  /** The bundle's stable id. */
  readonly id: string;
  /** The bundle's version, read from its `bundle.yml` (doc 10 `project show` step 2). */
  readonly version: string;
  /** The bundle's user-facing one-line summary (the menu line). */
  readonly summary: string;
}

/**
 * The project orientation (doc 10 `project show`): the project's identity plus every enabled bundle with its
 * version. A pure, render-agnostic value — the command formats it as text or, with `--json`, as JSON, so the two
 * renderings cannot diverge. Versions are stringified from the branded `SemVer`.
 */
export interface ProjectOrientation {
  /** The project name. */
  readonly name: string;
  /** The project's release version. */
  readonly version: string;
  /** The optional one-line description (absent when the manifest declares none). */
  readonly description?: string;
  /** The resolved project root path. */
  readonly root: string;
  /** The target agent runtimes the project supports. */
  readonly targets: readonly string[];
  /** The enabled bundles, in manifest order, each with the version read from its `bundle.yml`. */
  readonly bundles: readonly BundleOrientation[];
}

/**
 * `project show` (doc 10 row 140), a read. Projects the {@link ProjectOrientation} from the loaded project: name,
 * version, description, resolved root, targets, and each enabled bundle with the version + summary read from its
 * `bundle.yml` (the project already loaded every bundle, so no extra read). Bundles are ordered by the manifest's
 * enabled list. Changes nothing (AC#3).
 *
 * @returns The read spec projecting the orientation.
 */
export function showProjectSpec(): ReadSpec<void, ProjectOrientation> {
  return {
    summary: "project orientation",
    project: (project: Project): ProjectOrientation => {
      const bundles: BundleOrientation[] = project.manifest.bundles.map((id) => {
        const bundle = project.bundles.get(id);
        // A manifest-enabled bundle is always loaded (the loader read its bundle.yml), so `bundle` is present;
        // fall back defensively so a projection is total even if a bundle were somehow absent.
        return {
          id,
          version: bundle !== undefined ? bundle.version : "",
          summary: bundle !== undefined ? bundle.summary : "",
        };
      });
      return {
        name: project.manifest.meta.name,
        version: project.manifest.meta.version,
        ...(project.manifest.meta.description !== undefined
          ? { description: project.manifest.meta.description }
          : {}),
        root: project.rootPath,
        targets: [...project.manifest.targets],
        bundles,
      };
    },
  };
}

/**
 * `project validate` (doc 10 row 148), a read that reports coherence findings (doc 13 §4). It backs the task-20
 * {@link validateProject} service, which AGGREGATES every problem in one pass (no fail-fast) — so the command
 * reports all findings, not just the first (AC#2). The bundle directory names are read by the CLI through the
 * FileSystem port and threaded in as the read INPUT, keeping this projection pure. Changes nothing (AC#3); the
 * command maps a non-empty report to exit 1 (AC#4).
 *
 * @returns The read spec projecting the {@link ValidationReport}; its input is the bundle directory names.
 */
export function validateProjectSpec(): ReadSpec<readonly string[], ValidationReport> {
  return {
    summary: "project validation",
    project: (project: Project, bundleDirectoryNames: readonly string[]): ValidationReport =>
      validateProject(project, bundleDirectoryNames),
  };
}
