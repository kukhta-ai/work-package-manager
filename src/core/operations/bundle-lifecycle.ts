import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * The `bundle enable` / `bundle disable` use cases (doc 10 rows 150/151) — the rest of the bundle-MEMBERSHIP
 * lifecycle alongside `bundle new` (task-26 `createBundleSpec`). Both are mutations that ride the task-25
 * `runMutation` six-beat harness, so ④ RERENDER re-derives the front-door menu around them automatically (the
 * load-bearing effect both rows call out): enable's id re-appears in the menu, disable's drops out. Membership
 * is the only thing they touch — neither scaffolds the bundle dir (that is `bundle new`) nor deletes it (that is
 * `bundle remove`, task-53).
 *
 * Pure over the FileSystem port (doc 13 §1): the manifest edit goes through the task-13 comment-preserving
 * `editYaml`; enable composes the shared {@link scaffoldAdvisor} + the shared {@link perBundleAuthoringTasks}
 * plan. They import only the model/errors/services + the port + `node:path` — never `node:fs`/`commander`/`execa`.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";

/** The input to {@link disableBundleSpec}: the bundle id to remove from the manifest. */
interface DisableBundleInput {
  /** The id of the enabled bundle to disable (its directory stays on disk untouched). */
  readonly id: string;
}

/**
 * `bundle disable <id>` (doc 10 row 151), a mutation. ② CHECK rejects an id not in the manifest (a typed
 * {@link NotFoundError}, exit 1). ③ APPLY removes `<id>` from `manifest.yml.bundles` comment-preservingly and
 * does nothing else — **the directory stays on disk untouched** (52#1; that is the whole point, so re-enable
 * restores it for free). ④ RERENDER then re-derives the front-door without the bundle, dropping it from the
 * menu (52#2). No advisor/file teardown (that is `bundle remove`), and no materialisation (disable queues no
 * authoring work).
 *
 * @returns The operation spec.
 */
export function disableBundleSpec(): OperationSpec<DisableBundleInput> {
  return {
    summary: (_project, input) => `disabled bundle ${input.id}`,

    check: (project, input) => {
      // `manifest.bundles` is a `BundleId[]`; compare as strings since `input.id` is the raw (possibly invalid)
      // user argument — disable validates membership, not id well-formedness (doc 10 row 151).
      if (!(project.manifest.bundles as readonly string[]).includes(input.id)) {
        throw new NotFoundError(`bundle "${input.id}" is not enabled in the manifest`);
      }
    },

    apply: ({ fs, root }: ApplyContext, project, input): ApplyOutcome => {
      // Remove the entry from manifest.bundles by its index, comment-preservingly. The directory under
      // bundles/<id>/ is deliberately left in place (52#1) — disable affects only manifest membership.
      const manifestPath = join(root, MANIFEST_FILE);
      const index = (project.manifest.bundles as readonly string[]).indexOf(input.id);
      const next = editYaml(fs.read(manifestPath), (doc) => {
        doc.deleteIn(["bundles", index]);
      });
      fs.write(manifestPath, next);
      return { changedPaths: [manifestPath] };
    },
  };
}
