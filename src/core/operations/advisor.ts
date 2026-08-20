import { posix } from "node:path";
import type { FileSystem } from "../ports/index.js";
import { renderSkillStub } from "./scaffold-skill.js";

/**
 * The shared **advisor scaffold** (doc 10 row `bundle <id> advisor add`, step 1; also invoked by `bundle new`
 * step 6 and `bundle enable` step 3). It renders the project template's advisor snippet
 * (`snippets/advisor.SKILL.md.tmpl`) into the conventional pull-UX advisor stub at
 * `installer-skills/<id>-advisor/SKILL.md`, substituting `{{bundle-id}}` → `<id>`. The structural shell only —
 * the sense-dependent prose (the real trigger description + recommendation body) is written later by the agent
 * against the "Write advisor content for `<id>`" authoring task the operations materialise (doc 10 §"Where a
 * command appears to write content": template-driven stub + task-driven content).
 *
 * **No-op when the advisor already exists** (doc 10 row 176, step 3): if the SKILL.md is already present this
 * returns `[]` without rewriting it — which is exactly what makes `bundle enable`'s "unless an advisor already
 * exists" fall out for free, and what makes `bundle new`/`advisor add` idempotent.
 *
 * It is now a thin specialisation of the shared {@link renderSkillStub} (the generalised stub renderer the
 * payload-skill (O) and installer-skill (P/F) families also use): it supplies the advisor snippet path + the
 * `{{bundle-id}}` substitution and the conventional advisor stub path, and inherits the resolve → render →
 * write-unless-exists behaviour. The single source of the advisor-scaffold logic so `bundle new`, `bundle
 * enable`, and `bundle <id> advisor add` cannot drift — and now shared with the other scaffold-or-attach
 * families.
 *
 * **Pure over the FileSystem port** (doc 13 §1): it imports only the shared renderer + the port + `node:path`,
 * never the CLI framework / subprocess library / `node:fs`.
 */

/** The default project template the advisor snippet is resolved from (doc 10 §Templates: project `minimal`). */
export const DEFAULT_PROJECT_TEMPLATE = "minimal";

/** The advisor snippet's path within a project template's `snippets/` tree (relative, as `resolveTemplate` reads it). */
const ADVISOR_SNIPPET_PATH = "advisor.SKILL.md.tmpl";

/** The non-port dependencies {@link scaffoldAdvisor} needs to resolve the project template's advisor snippet. */
export interface AdvisorDeps {
  /** The built-in templates root (shipped with the CLI), searched after the project-local `templates/`. */
  readonly builtinTemplatesRoot: string;
  /** The project template whose advisor snippet is rendered (default `minimal`; project-local shadows built-in). */
  readonly projectTemplateName?: string;
}

/**
 * The project-relative directory of a bundle's advisor stub: `installer-skills/<id>-advisor/` (doc 10). This is
 * the directory `bundle <id> advisor remove` deletes (doc 10 row 177 step 1) and the parent of the advisor's
 * {@link advisorSkillPath}. Exported as the single source of the advisor directory so the scaffold (which writes
 * the SKILL.md under it) and the remove (which deletes the whole directory) cannot drift.
 *
 * @param id - The bundle id the advisor serves.
 * @returns The project-relative advisor directory.
 */
export function advisorSkillDir(id: string): string {
  // A LOGICAL path: it is shown in the "left at …" message and is the stub's project-relative location, so it
  // must be POSIX on every OS — built with `posix.join` (never `node:path.join`, which yields `\` on Windows).
  return posix.join("installer-skills", `${id}-advisor`);
}

/** The project-relative path of a bundle's advisor stub: `installer-skills/<id>-advisor/SKILL.md` (doc 10). */
export function advisorSkillPath(id: string): string {
  // LOGICAL (the bundle-relative stub path the scaffold renders + the registry/message form) ⇒ POSIX.
  return posix.join(advisorSkillDir(id), "SKILL.md");
}

/**
 * The title of the "Write advisor content for `<id>`" authoring task (doc 11 §3) — the single source of that
 * task's title, so `bundle new`/`bundle enable` (which materialise it via {@link perBundleAuthoringTasks}) and
 * `bundle <id> advisor add`/`remove` (which materialise it and archive it by title) all agree byte-for-byte. A
 * divergence here would orphan the task on `advisor remove` (it archives by exact title), so it MUST be one
 * function (doc 11: "Idempotency, where it matters, is by title").
 *
 * @param id - The bundle id whose advisor content is to be written.
 * @returns The authoring task's title.
 */
export function advisorContentTaskTitle(id: string): string {
  return `Write advisor content for ${id}`;
}

/**
 * Render the advisor stub for bundle `id` to `installer-skills/<id>-advisor/SKILL.md`, unless it already exists.
 *
 * Delegates to the shared {@link renderSkillStub}: it resolves the project template (project-local shadowing
 * built-in, like the artefact deriver), finds its `advisor.SKILL.md.tmpl` snippet, renders it with
 * `{{bundle-id}}` → `id`, and writes the result through the FileSystem port. A no-op (returns `[]`) when the
 * stub is already present.
 *
 * @param deps - The built-in templates root + optional project template name.
 * @param fs - The FileSystem port.
 * @param root - The absolute project root the stub is written under.
 * @param id - The bundle id (kebab-case) the advisor serves.
 * @returns The absolute path written (a one-element array), or `[]` when the advisor already existed.
 * @throws {NotFoundError} If the project template — or its advisor snippet — cannot be resolved (an
 *   authoring-time template bug, not a user error).
 */
export function scaffoldAdvisor(
  deps: AdvisorDeps,
  fs: FileSystem,
  root: string,
  id: string,
): string[] {
  return renderSkillStub(
    {
      builtinTemplatesRoot: deps.builtinTemplatesRoot,
      ...(deps.projectTemplateName !== undefined
        ? { projectTemplateName: deps.projectTemplateName }
        : {}),
    },
    fs,
    root,
    advisorSkillPath(id),
    ADVISOR_SNIPPET_PATH,
    new Map([["bundle-id", id]]),
  );
}
