import { NotFoundError } from "../errors.js";
import type { BundleManifest, ConfirmationLevel, Project } from "../model/index.js";
import type { ReadSpec } from "./lifecycle.js";

/**
 * The read-only per-bundle command `bundle <id> show` (doc 10 row 157) — a pure projection off the loaded
 * {@link Project}, plugged into the task-25 `runRead` read trace (doc 13 §8). It changes nothing on disk; the
 * CLI shell formats the projected {@link BundleView} (output is not a port — doc 13 §3).
 *
 * The bundle's directory tree is NOT something the pure projection can read — `fs` is not a read-spec input — so
 * (exactly as `validateProjectSpec` threads the bundle directory NAMES) the CLI shell lists `bundles/<id>/`
 * through the FileSystem port and threads the relative paths in as the read INPUT. The projection stays pure.
 *
 * Pure: imports only the model + the errors + the lifecycle {@link ReadSpec} type — never
 * `commander`/`node:fs`/`execa` — so the import-boundary rule on `src/core/operations/` holds.
 */

/** One `requires` entry in a {@link BundleView}: the depended-upon bundle id and the version range string. */
export interface BundleRequirement {
  /** The depended-upon bundle's id. */
  readonly id: string;
  /** The npm-style version range it must satisfy. */
  readonly range: string;
}

/**
 * A render-agnostic view of a bundle's `bundle.yml` metadata plus its file tree (doc 10 `bundle <id> show`). The
 * command formats it as text; a future `--json` would render the SAME value, so the two cannot diverge. Versions
 * and ranges are stringified from their branded forms.
 */
export interface BundleView {
  /** The bundle's stable id. */
  readonly id: string;
  /** The bundle's current version. */
  readonly version: string;
  /** The user-facing one-line summary (the menu line). */
  readonly summary: string;
  /** How much consent this bundle's steps need. */
  readonly confirmation: ConfirmationLevel;
  /** The dependency contract, in declaration order: each required bundle id + its range. */
  readonly requires: readonly BundleRequirement[];
  /** The bundle's directory tree — relative paths under `bundles/<id>/`, sorted (threaded in by the shell). */
  readonly tree: readonly string[];
}

/** The input to {@link showBundleSpec}: the target bundle id and its directory tree (read by the CLI shell). */
export interface ShowBundleInput {
  /** The bundle id to show (selected by the `bundle <id>` routing). */
  readonly id: string;
  /** The relative paths under `bundles/<id>/`, read by the CLI through the FileSystem port and threaded in. */
  readonly tree: readonly string[];
}

/**
 * `bundle <id> show` (doc 10 row 157), a read. Projects the {@link BundleView} for an ENABLED bundle: its
 * `bundle.yml` metadata (already parsed into `project.bundles`) plus the threaded-in file tree. The loaded
 * {@link Project} holds a bundle in `project.bundles` ONLY if it is enabled (the loader read its `bundle.yml`),
 * so a missing entry is the not-found signal (AC#2). Changes nothing (AC#3).
 *
 * @returns The read spec projecting the bundle view; its input carries the id + the directory tree.
 */
export function showBundleSpec(): ReadSpec<ShowBundleInput, BundleView> {
  return {
    summary: (_project, { id }) => `bundle ${id}`,
    project: (project: Project, { id, tree }: ShowBundleInput): BundleView => {
      // `project.bundles` is keyed by the branded `BundleId`; look up by the raw id string (a non-enabled id
      // simply isn't a key → undefined, the not-found signal).
      const bundle = (project.bundles as ReadonlyMap<string, BundleManifest>).get(id);
      if (bundle === undefined) {
        throw new NotFoundError(
          `bundle "${id}" is not an enabled bundle — run \`wpm bundle list\` to see enabled bundles, or \`wpm bundle enable ${id}\``,
        );
      }
      const requires: BundleRequirement[] = [];
      for (const [depId, range] of bundle.requires) {
        requires.push({ id: depId as string, range: range as string });
      }
      return {
        id: bundle.id as string,
        version: bundle.version as string,
        summary: bundle.summary,
        confirmation: bundle.confirmation,
        requires,
        tree: [...tree].sort(),
      };
    },
  };
}
