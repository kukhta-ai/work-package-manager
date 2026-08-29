import type { BundleManifest, Project } from "../model/index.js";
import type { ReadSpec } from "./lifecycle.js";

/**
 * The read-only `bundle list` command (doc 10 row 154) — a pure projection off the loaded {@link Project},
 * plugged into the task-25 `runRead` read trace (doc 13 §8). It changes nothing on disk; the CLI shell formats
 * the projected rows as a table (output is not a port — doc 13 §3).
 *
 * Per enabled bundle it reports: the `id`, the `version` (read straight off `project.bundles` — the loader
 * already parsed each enabled bundle's `bundle.yml`), and the COUNT of `kind:state` vs `kind:migration` tasks in
 * its install-backlog. The kind counts are NOT something the pure projection can read — `fs` is not a read-spec
 * input, and (crucially) the install-backlog is NOT a discoverable Backlog.md root (doc 07 line 67), so it is an
 * fs SCAN, not a BacklogMd-port read. So (exactly as `showBundleSpec` threads the bundle directory tree) the CLI
 * shell scans each `bundles/<id>/install-backlog/tasks/` through the FileSystem port and threads the per-bundle
 * counts in as the read INPUT; the projection stays pure.
 *
 * Pure: imports only the model + the lifecycle {@link ReadSpec} type — never the CLI framework, the subprocess
 * library, or `node:fs` — so the import-boundary rule on `src/core/operations/` holds.
 */

/** One row of `bundle list` output: a bundle's id, version, and its install-backlog kind counts. */
export interface BundleListRow {
  /** The bundle's stable id. */
  readonly id: string;
  /** The bundle's current version (from its `bundle.yml`). */
  readonly version: string;
  /** The number of `kind:state` tasks in the bundle's install-backlog. */
  readonly stateCount: number;
  /** The number of `kind:migration` tasks in the bundle's install-backlog. */
  readonly migrationCount: number;
}

/** The per-bundle install-backlog kind counts the CLI shell scans and threads into {@link listBundlesSpec}. */
export interface KindCounts {
  /** Count of `kind:state` tasks. */
  readonly state: number;
  /** Count of `kind:migration` tasks. */
  readonly migration: number;
}

/** The input to {@link listBundlesSpec}: per-bundle install-backlog kind counts, keyed by bundle id. */
export interface ListBundlesInput {
  /** The `kind:state`/`kind:migration` counts per enabled bundle id (scanned by the shell through the fs port). */
  readonly counts: ReadonlyMap<string, KindCounts>;
}

/**
 * `bundle list` (doc 10 row 154), a read. Projects one {@link BundleListRow} per ENABLED bundle: the id + the
 * version (from `project.bundles`, which holds only enabled bundles — the loader read each one's `bundle.yml`)
 * plus the threaded-in install-backlog kind counts. Rows are sorted by id for a deterministic listing. Changes
 * nothing (AC54#2).
 *
 * @returns The read spec projecting the bundle rows; its input carries the per-bundle kind counts.
 */
export function listBundlesSpec(): ReadSpec<ListBundlesInput, BundleListRow[]> {
  return {
    summary: "bundle list",
    project: (project: Project, { counts }: ListBundlesInput): BundleListRow[] => {
      const rows: BundleListRow[] = [];
      for (const [id, bundle] of project.bundles as ReadonlyMap<string, BundleManifest>) {
        const c = counts.get(id) ?? { state: 0, migration: 0 };
        rows.push({
          id,
          version: bundle.version as string,
          stateCount: c.state,
          migrationCount: c.migration,
        });
      }
      rows.sort((a, b) => a.id.localeCompare(b.id));
      return rows;
    },
  };
}

/**
 * Whether a task `.md` file's text declares the `kind:<kind>` label (doc 08: `kind:state`/`kind:migration` are
 * Backlog.md labels). Backlog.md renders labels as a YAML block sequence in the task's frontmatter, each entry
 * single-quoted, e.g.:
 *
 * ```
 * labels:
 *   - 'kind:state'
 *   - 'step:detect'
 * ```
 *
 * This is a pure string test (no I/O — the CLI shell reads the file through the fs port and passes the text). It
 * scopes the match to the frontmatter `labels:` block so a task BODY that happens to mention the literal
 * `kind:state` cannot create a false count, and matches the label as a whole token (tolerating the quoting) so
 * `kind:state` does not match a hypothetical `kind:stateful`.
 *
 * @param taskFileText - The full text of a Backlog.md task `.md` file.
 * @param kind - The kind to test for (`"state"` or `"migration"`).
 * @returns `true` when the task carries the `kind:<kind>` label.
 */
export function hasKindLabel(taskFileText: string, kind: "state" | "migration"): boolean {
  return frontmatterLabels(taskFileText).includes(`kind:${kind}`);
}

/**
 * Extract the label tokens from a Backlog.md task `.md` file's YAML frontmatter `labels:` block. Returns the
 * unquoted label strings (e.g. `["kind:state", "step:detect"]`), or `[]` when the file has no frontmatter or no
 * labels. A pure string parse scoped to the leading `---`…`---` frontmatter and the `labels:` block-sequence
 * within it — deliberately NOT a full YAML parse (the file body may contain arbitrary markdown), and deliberately
 * NOT a whole-file scan (so a body mention of a label string is not miscounted).
 *
 * @param taskFileText - The full task file text.
 * @returns The label tokens declared under `labels:` in the frontmatter.
 */
function frontmatterLabels(taskFileText: string): string[] {
  const lines = taskFileText.split("\n");
  if (lines[0]?.trim() !== "---") {
    return [];
  }
  // The frontmatter is the region between the leading `---` and the next `---`.
  const closing = lines.indexOf("---", 1);
  const end = closing >= 0 ? closing : lines.length;

  const labels: string[] = [];
  for (let i = 1; i < end; i++) {
    if (lines[i]?.trim() !== "labels:") {
      continue;
    }
    // Collect the block-sequence entries (`  - <label>`) immediately following `labels:`.
    for (let j = i + 1; j < end; j++) {
      const match = /^\s*-\s*(.+?)\s*$/.exec(lines[j] ?? "");
      if (match === null) {
        break; // the labels block ended (a non-`- ` line)
      }
      labels.push(unquote(match[1] as string));
    }
    break; // only one `labels:` key per frontmatter
  }
  return labels;
}

/** Strip a single layer of surrounding single or double quotes from a YAML scalar (e.g. `'kind:state'`). */
function unquote(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
