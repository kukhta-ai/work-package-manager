import { join } from "node:path";
import { NotFoundError } from "../errors.js";
import type { FileSystem } from "../ports/index.js";
import type { RenderParams } from "../services/render.js";
import { renderSnippet } from "../services/render.js";
import { resolveTemplate } from "../services/template-resolver.js";

/**
 * The shared **skill-stub renderer** (doc 10 §"Where a command appears to write content": the template-driven
 * structural stub the scaffold branch of every `… skills add` / `… installer-skills add` / `advisor add`
 * emits). It is the GENERALISATION of `advisor.ts`'s original `scaffoldAdvisor` body — "resolve the project
 * template (project-local shadows built-in) → find a snippet by path → `renderSnippet` it with substitutions →
 * write through the FileSystem port, NO-OP if the file already exists" — lifted so the advisor, payload skills
 * (O), and the installer-skill families (P/F) all render their own snippet through ONE implementation and cannot
 * drift. `advisor.ts` now calls this; O's `scaffoldSkillRefSpec` calls it with the payload-skill snippet.
 *
 * **Pure over the FileSystem port** (doc 13 §1): it composes the task-17 template resolver + the task-16 render
 * service and writes through the FileSystem port — importing only those services + the model render type + the
 * errors + `node:path`, never the CLI framework / subprocess library / `node:fs`. The import-boundary rule on
 * `src/core/operations/` is satisfied.
 */

/** The default project template the snippets are resolved from (doc 10 §Templates: project `minimal`). */
export const DEFAULT_PROJECT_TEMPLATE = "minimal";

/** The non-port dependencies {@link renderSkillStub} needs to resolve the project template's snippet. */
export interface SkillStubDeps {
  /** The built-in templates root (shipped with the CLI), searched after the project-local `templates/`. */
  readonly builtinTemplatesRoot: string;
  /** The project template whose snippet is rendered (default `minimal`; project-local shadows built-in). */
  readonly projectTemplateName?: string;
}

/**
 * Render a project-template snippet into a stub at `stubRelPath`, unless the stub already exists.
 *
 * Resolves the project template (project-local shadowing built-in, like the artefact deriver and
 * `scaffoldAdvisor`), finds its `snippetPath` snippet, renders it with `substitutions`, and writes the result
 * through the FileSystem port. A no-op (returns `[]`) when the stub is already present — so it never clobbers
 * authored content and the scaffold branch stays idempotent.
 *
 * @param deps - The built-in templates root + optional project template name.
 * @param fs - The FileSystem port.
 * @param root - The absolute project root the stub is written under.
 * @param stubRelPath - The project-relative path to write the rendered stub to (e.g. a `SKILL.md`).
 * @param snippetPath - The snippet's path within the project template's `snippets/` tree.
 * @param substitutions - The `{{placeholder}}` → value map the snippet is rendered with.
 * @returns The absolute path written (a one-element array), or `[]` when the stub already existed.
 * @throws {NotFoundError} If the project template — or its snippet — cannot be resolved (a template bug, not a
 *   user error).
 */
export function renderSkillStub(
  deps: SkillStubDeps,
  fs: FileSystem,
  root: string,
  stubRelPath: string,
  snippetPath: string,
  substitutions: RenderParams,
): string[] {
  const stubAbs = join(root, stubRelPath);
  // No-op if the stub already exists (do not clobber authored content) — doc 10 row 176 step 3 for the advisor;
  // the same guard makes O's scaffold idempotent.
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
  const snippet = resolution.template.snippets.find((s) => s.path === snippetPath);
  if (snippet === undefined) {
    throw new NotFoundError(
      `project template "${projectTemplateName}" is missing the snippet "${snippetPath}"`,
    );
  }

  const rendered = renderSnippet(snippet, substitutions);
  fs.write(stubAbs, rendered.content);
  return [stubAbs];
}
