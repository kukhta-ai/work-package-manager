import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import type { BundleManifest, ConfirmationLevel, Project, SemVer } from "../model/index.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * `bundle <id> meta` (doc 10 row 158), a mutation that edits a specific bundle's `bundle.yml` metadata via
 * `--version` / `--summary` / `--confirmation-level`. It rides the task-25 `runMutation` six-beat lifecycle, so
 * ④ RERENDER re-derives the front-door menu around it automatically — a changed `summary` flows to the bundle
 * menu line (doc 10 line 34). It does NOT materialise authoring tasks (editing metadata queues no work).
 *
 * Structure-not-content (doc 10): each provided field is updated IN PLACE through the task-13 comment-preserving
 * {@link editYaml} `Document.setIn`, which replaces a scalar without re-serialising the document — so omitted
 * flags leave their fields byte-untouched (AC#1) and existing comments + key order are preserved (AC#3). The
 * `--version`/`--confirmation-level` values are already validated at the CLI boundary (a bad value is a usage
 * error there), so this operation receives only well-formed inputs.
 *
 * Pure over the FileSystem port (doc 13 §1): it imports only the model + errors + the task-13 yaml leaf +
 * `node:path` — never `node:fs`/`commander`/`execa`.
 */

/** A bundle's manifest filename, under `bundles/<id>/`. */
const BUNDLE_MANIFEST_FILE = "bundle.yml";

/**
 * The input to {@link editBundleMetaSpec}: the target bundle id plus the fields to update. Each metadata field
 * is optional and updated only when present (the omitted ones are left unchanged — AC#1). The version is the
 * already-parsed branded {@link SemVer} (the CLI validated `--version` at the boundary).
 */
export interface EditBundleMetaInput {
  /** The bundle id to edit (selected by the `bundle <id>` routing). */
  readonly id: string;
  /** When present, the new bundle version (already parsed; sets `bundle.yml.version`). */
  readonly version?: SemVer;
  /** When present, the new one-line summary (sets `bundle.yml.summary`). */
  readonly summary?: string;
  /** When present, the new confirmation level (sets `bundle.yml.confirmation`). */
  readonly confirmation?: ConfirmationLevel;
}

/**
 * Build the `bundle <id> meta` {@link OperationSpec} (doc 10 row 158). ② CHECK the id is an enabled bundle (else
 * a {@link NotFoundError}); ③ APPLY updates only the provided fields in `bundles/<id>/bundle.yml`
 * comment-and-key-order-preservingly; ④ RERENDER (the harness) reflects a changed summary in the menu.
 *
 * @returns The operation spec.
 */
export function editBundleMetaSpec(): OperationSpec<EditBundleMetaInput> {
  return {
    summary: (_project, { id }) => `updated bundle ${id} metadata`,

    /** ② CHECK — the id must be an enabled bundle (defense-in-depth with the routing's `requireEnabledBundle`). */
    check: (project: Project, { id }: EditBundleMetaInput) => {
      if (!(project.bundles as ReadonlyMap<string, BundleManifest>).has(id)) {
        throw new NotFoundError(`bundle "${id}" is not an enabled bundle`);
      }
    },

    /** ③ APPLY — update only the provided fields in `bundle.yml`, in place (comments + key order preserved). */
    apply: ({ fs, root }: ApplyContext, _project, input): ApplyOutcome => {
      const bundleYmlPath = join(root, "bundles", input.id, BUNDLE_MANIFEST_FILE);
      const next = editYaml(fs.read(bundleYmlPath), (doc) => {
        if (input.version !== undefined) {
          doc.setIn(["version"], input.version);
        }
        if (input.summary !== undefined) {
          doc.setIn(["summary"], input.summary);
        }
        if (input.confirmation !== undefined) {
          doc.setIn(["confirmation"], input.confirmation);
        }
      });
      fs.write(bundleYmlPath, next);
      return { changedPaths: [bundleYmlPath] };
    },
  };
}
