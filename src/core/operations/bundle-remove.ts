import { join } from "node:path";
import { editYaml } from "../../util/yaml.js";
import { NotFoundError } from "../errors.js";
import { AUTHORING_BACKLOG_DIR } from "../model/index.js";
import { advisorSkillDir } from "./advisor.js";
import type { ApplyContext, ApplyOutcome, OperationSpec } from "./lifecycle.js";

/**
 * The `bundle remove <id>` use case (doc 10 row 153) — the DESTRUCTIVE full teardown of a bundle, built as an
 * {@link OperationSpec} riding the task-25 `runMutation` six-beat harness so ④ RERENDER drops the bundle from the
 * front-door menu automatically (the same beat `disable` relies on). It is the destructive twin of `disable`
 * (which only edits manifest membership) generalised to the WHOLE bundle: it COMPOSES the existing teardown
 * pieces rather than inventing new mechanics —
 *
 *   - ③ APPLY step 2: drop `<id>` from `manifest.yml.bundles` **if present** (the SAME comment-preserving
 *     `editYaml` delete-by-index `disableBundleSpec` uses);
 *   - step 3: delete `bundles/<id>/` through the FileSystem port's recursive `remove`;
 *   - step 4: delete the advisor stub `installer-skills/<id>-advisor/` **if present** (via the shared
 *     {@link advisorSkillDir});
 *   - step 5: archive the bundle's authoring tasks whose titles NAME `<id>` (generalising the archive-by-title
 *     from `advisor remove` to ALL per-bundle tasks, with prefix-collision-safe matching — {@link titleNamesBundle}).
 *
 * The genuinely-NEW mechanic — author confirmation (doc 10 row 153 step 1) — is NOT here: the confirmation
 * decision is made in the CLI shell (it owns `process.stdin`), and this pure operation runs ONLY once confirmed
 * (doc 13 §3: stdin is not a port). There is NO `materialise` plan — `remove` ARCHIVES tasks (an apply-time
 * BacklogMd effect), it never CREATES any.
 *
 * **Pure over the FileSystem + BacklogMd ports** (doc 13 §1): imports only the model/errors, the lifecycle
 * types, the shared advisor helper, the comment-preserving yaml leaf, and `node:path` — never
 * `node:fs`/`commander`/`execa`. The directory deletes and the task archives are apply-time effects performed
 * through the injected ports on {@link ApplyContext}.
 */

/** The project manifest filename at the root. */
const MANIFEST_FILE = "manifest.yml";
/** The directory under a project root that holds the bundles. */
const BUNDLES_DIR = "bundles";

/** The set of characters that may appear inside a (kebab-case) bundle id — used as the token-boundary class. */
const ID_CHAR = "A-Za-z0-9-";

/** The structured facts {@link removeBundleSpec}'s ③ APPLY records, read back by its ⑥ summary thunk. */
interface RemovalReport {
  /** Whether `<id>` was present in `manifest.yml.bundles` and was dropped. */
  manifestEntryRemoved: boolean;
  /** Whether the advisor stub directory existed and was deleted. */
  advisorRemoved: boolean;
  /** How many authoring tasks naming `<id>` were archived. */
  archivedTaskCount: number;
}

/** The input to {@link removeBundleSpec}: the (already-confirmed, already-existence-checked) bundle id to remove. */
export interface RemoveBundleInput {
  /** The id of the bundle to tear down (its directory, advisor, and authoring tasks are deleted). */
  readonly id: string;
}

/**
 * Whether an authoring-task `title` names `id` as a WHOLE bundle token — the prefix-collision-safe predicate that
 * lets `bundle remove web` archive `web`'s tasks WITHOUT touching `web-extra`'s (doc 11 §3 titles take the forms
 * `Plan bundle <id>`, `… for <id>`, `Adapt <id>'s … to use <dep>`, `Review … on <id> at <ver>`, etc., so the id
 * appears at the end, mid-title, or trailed by a possessive `'s`/a version).
 *
 * The id must be bounded on BOTH sides by a non-id character (`[A-Za-z0-9-]`) or the string edge. Crucially a
 * hyphen counts as an id character — so the "after" boundary FAILS inside `web-extra` (the `-` is an id char, not
 * a boundary), which is exactly what stops `web` matching the longer id. JS `\b` would NOT do this: it treats `-`
 * as a word boundary, so `\bweb\b` matches inside `web-extra`; excluding `-` from the boundary class is the fix
 * the Q review's advisor-task class demanded. A trailing `'s`, a space, a `→`, or end-of-string all satisfy the
 * after-boundary (none is an id char), so possessive and at-end forms still match.
 *
 * @param title - The authoring task's title.
 * @param id - The bundle id to test for as a whole token.
 * @returns `true` when `title` names `id` as a whole token (not as a prefix of a longer id).
 */
export function titleNamesBundle(title: string, id: string): boolean {
  // Escape any regex metacharacters in id (kebab-case ids are [a-z0-9-], but escape defensively for robustness).
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^${ID_CHAR}])${escaped}([^${ID_CHAR}]|$)`).test(title);
}

/**
 * Build the `bundle remove` {@link OperationSpec} (doc 10 row 153 steps 2–7; doc 13 §5). Run it through the
 * task-25 `runMutation` with a {@link RemoveBundleInput} AFTER the CLI shell has confirmed the destructive action
 * and verified the bundle exists; the harness performs ① LOAD, ④ RERENDER (dropping the bundle from the menu), and
 * ⑥ RESULT around the teardown declared in ③ APPLY.
 *
 * @returns The operation spec. Its ⑥ summary reports exactly what was removed (the dir, whether an advisor went,
 *   and the archived-task count) — read from the apply-time {@link RemovalReport} the same `runMutation` call fills
 *   in ③ before resolving the summary in ⑥.
 */
export function removeBundleSpec(): OperationSpec<RemoveBundleInput> {
  // The apply beat fills this; the summary thunk (run AFTER apply, at ⑥) reads it. Both execute within the SAME
  // `runMutation` call, so the closure is populated by the time the summary is resolved.
  const report: RemovalReport = {
    manifestEntryRemoved: false,
    advisorRemoved: false,
    archivedTaskCount: 0,
  };

  return {
    summary: (_project, { id }) => {
      const advisorNote = report.advisorRemoved ? " + advisor" : "";
      const taskNote =
        report.archivedTaskCount > 0
          ? `, archived ${report.archivedTaskCount} authoring task(s)`
          : "";
      return `removed bundle ${id}: deleted ${BUNDLES_DIR}/${id}/${advisorNote}${taskNote}`;
    },

    /**
     * ③ APPLY — the doc-10 row-153 teardown (steps 2–5), all through the injected ports. NO `check` rejects on
     * membership: a disabled-but-present bundle dir is still removable (step 2 removes from the manifest IF
     * present; step 3 deletes the dir regardless). The CLI shell already guards the "nothing to remove at all"
     * case (neither enabled nor on disk) and the confirmation; this beat assumes the bundle exists and is confirmed.
     */
    apply: ({ fs, backlog, root }: ApplyContext, project, { id }): ApplyOutcome => {
      const changedPaths: string[] = [];

      // Step 2 — drop <id> from manifest.yml.bundles IF PRESENT (the SAME edit `disableBundleSpec` performs:
      // delete-by-index, comment-preservingly via the task-13 editYaml). Guarded so a disabled bundle (absent from
      // the manifest) is fine.
      const bundles = project.manifest.bundles as readonly string[];
      const index = bundles.indexOf(id);
      if (index >= 0) {
        const manifestPath = join(root, MANIFEST_FILE);
        const next = editYaml(fs.read(manifestPath), (doc) => {
          doc.deleteIn(["bundles", index]);
        });
        fs.write(manifestPath, next);
        changedPaths.push(manifestPath);
        report.manifestEntryRemoved = true;
      }

      // Step 3 — delete bundles/<id>/ from disk (the fs port's `remove` is recursive + no-op-if-absent).
      const bundleDir = join(root, BUNDLES_DIR, id);
      fs.remove(bundleDir);
      changedPaths.push(bundleDir);

      // Step 4 — delete the advisor stub installer-skills/<id>-advisor/ IF PRESENT. Probe first so the summary can
      // report whether an advisor was actually removed (doc 10 row 153 step 4: "if present"); `remove` is
      // no-op-if-absent regardless.
      const advisorDir = join(root, advisorSkillDir(id));
      if (fs.exists(advisorDir)) {
        fs.remove(advisorDir);
        changedPaths.push(advisorDir);
        report.advisorRemoved = true;
      }

      // Step 5 — archive the bundle's authoring tasks whose titles NAME <id> (doc 10 row 153 step 5). The
      // authoring backlog is the project's own Backlog.md root at <root>/.authoring-backlog (the SAME root the
      // harness materialises into). `listTasks` already excludes archived tasks, so a re-run finds nothing to
      // re-archive (idempotent). Prefix-collision-safe via `titleNamesBundle` (web must NOT match web-extra).
      // The bundle is being destroyed, so its authoring tasks are tombstones — archive ALL that name it,
      // regardless of status (a Done task is just as defunct as an open one once the bundle is gone).
      const authoringRoot = join(root, AUTHORING_BACKLOG_DIR);
      for (const task of backlog.listTasks(authoringRoot)) {
        if (titleNamesBundle(task.title, id)) {
          backlog.archiveTask(authoringRoot, task.id);
          report.archivedTaskCount += 1;
        }
      }

      return { changedPaths };
    },
  };
}

/**
 * Whether `id` is removable in the loaded project: it is either enabled in `manifest.yml.bundles` OR has a
 * directory on disk under `bundles/<id>/`. A non-removable id (neither enabled nor present) is the not-found
 * signal the CLI shell raises BEFORE confirming (so a typo never prompts then no-ops). The membership half is a
 * pure check over the loaded manifest; the on-disk half needs the FileSystem port, so the shell supplies the
 * `dirExists` it probed (the pure `check` has no port). Exported so the shell and any defense-in-depth check
 * agree on one definition.
 *
 * @param project - The loaded project (for manifest membership).
 * @param id - The bundle id under test.
 * @param dirExists - Whether `bundles/<id>/` exists on disk (probed by the shell through the fs port).
 * @returns `true` when the bundle can be removed.
 * @throws Never — returns a boolean for the caller to act on.
 */
export function isRemovableBundle(
  project: { manifest: { bundles: readonly string[] } },
  id: string,
  dirExists: boolean,
): boolean {
  return project.manifest.bundles.includes(id) || dirExists;
}

/**
 * The canonical "no such bundle to remove" error (exit 1) — raised by the CLI shell when {@link isRemovableBundle}
 * is false. Kept here beside the operation so the message and the predicate cannot drift.
 *
 * @param id - The bundle id that was not found.
 * @returns A {@link NotFoundError} naming the id and where it was looked for.
 */
export function noSuchBundleError(id: string): NotFoundError {
  return new NotFoundError(
    `bundle "${id}" not found — it is neither enabled in the manifest nor present under ${BUNDLES_DIR}/${id}`,
  );
}
