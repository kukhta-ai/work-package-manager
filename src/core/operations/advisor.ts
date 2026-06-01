import { join } from "node:path";
import { NotFoundError } from "../errors.js";
import type { FileSystem } from "../ports/index.js";
import { renderSnippet } from "../services/render.js";
import { resolveTemplate } from "../services/template-resolver.js";

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
 * **Pure over the FileSystem port** (doc 13 §1): it composes the task-17 template resolver and the task-16
 * render service and writes through the FileSystem port — importing only those services + the model + the
 * errors + `node:path`, never `node:fs`/`commander`/`execa`. The single source of the advisor-scaffold logic so
 * `bundle new`, `bundle enable`, and `bundle <id> advisor add` (task-80) cannot drift.
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

/** The project-relative path of a bundle's advisor stub: `installer-skills/<id>-advisor/SKILL.md` (doc 10). */
export function advisorSkillPath(id: string): string {
  return join("installer-skills", `${id}-advisor`, "SKILL.md");
}

/**
 * Render the advisor stub for bundle `id` to `installer-skills/<id>-advisor/SKILL.md`, unless it already exists.
 *
 * Resolves the project template (project-local shadowing built-in, like the artefact deriver), finds its
 * `advisor.SKILL.md.tmpl` snippet, renders it with `{{bundle-id}}` → `id`, and writes the result through the
 * FileSystem port. A no-op (returns `[]`) when the stub is already present.
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
  const stubAbs = join(root, advisorSkillPath(id));
  // doc 10 row 176 step 3: no-op if the advisor already exists (do not clobber authored content).
  if (fs.exists(stubAbs)) {
    return [];
  }

  const projectTemplateName = deps.projectTemplateName ?? DEFAULT_PROJECT_TEMPLATE;
  const resolution = resolveTemplate(projectTemplateName, "project", {
    fs,
    builtinTemplatesRoot: deps.builtinTemplatesRoot,
    projectTemplatesRoot: join(root, "templates"),
  });
  if (!resolution.found) {
    throw new NotFoundError(
      `project template "${projectTemplateName}" not found (searched: ${resolution.searched.join(", ")})`,
    );
  }
  const snippet = resolution.template.snippets.find((s) => s.path === ADVISOR_SNIPPET_PATH);
  if (snippet === undefined) {
    throw new NotFoundError(
      `project template "${projectTemplateName}" is missing the advisor snippet "${ADVISOR_SNIPPET_PATH}"`,
    );
  }

  const rendered = renderSnippet(snippet, new Map([["bundle-id", id]]));
  fs.write(stubAbs, rendered.content);
  return [stubAbs];
}
