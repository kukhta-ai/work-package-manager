import { NotFoundError } from "../errors.js";
import type { Project, TemplateFile } from "../model/index.js";
import type { FileSystem } from "../ports/index.js";
import {
  type ArtefactSnippets,
  type DesiredArtefacts,
  deriveArtefacts,
} from "../services/derived-artefacts.js";
import { resolveTemplate } from "../services/template-resolver.js";

/**
 * The concrete **artefact-derivation capability** the task-25 lifecycle harness injects as
 * `deriveArtefacts: (project) => DesiredArtefacts`. doc 13 §5 ④ describes the split this realizes: the
 * operation/composition *resolves the template snippets* and passes them as data, and the task-19 derivation
 * *renders* them. Here that means: resolve the project template (project-local shadowing built-in, via the
 * task-17 resolver), pick its front-door + orchestrator snippets, and call task-19 `deriveArtefacts`.
 *
 * Pure over the FileSystem port — it imports only the resolver/derivation services, the model, the errors, and
 * the port; never `node:fs`/`commander`/`execa`. The real project templates are tasks 30/31; this capability
 * works against whatever project template is installed (fixtures in tests).
 */

/** The default project template name (doc 10 §Templates: project templates include `minimal`). */
const DEFAULT_PROJECT_TEMPLATE = "minimal";

/** The dependencies the deriver needs: the filesystem port + the template roots + the project template name. */
export interface ArtefactDeriverDeps {
  /** The filesystem port (real or fake). */
  readonly fs: FileSystem;
  /** The built-in templates root (shipped with the CLI). */
  readonly builtinTemplatesRoot: string;
  /** The project-local templates root (`<projectRoot>/templates/`), shadowing the built-in when present. */
  readonly projectTemplatesRoot?: string;
  /** The project template to resolve snippets from (default `minimal`). */
  readonly projectTemplateName?: string;
}

/**
 * Select the front-door and orchestrator snippets from a project template's `snippets/` tree (doc 06: the
 * always-live `AGENTS.md` front door + the `<project>-installer/SKILL.md` orchestrator). The front-door snippet
 * is the one whose path is `AGENTS.md` (tolerating a `.tmpl` suffix); the orchestrator is the `SKILL.md` under
 * an `installer-skills/…-installer/` directory. A missing snippet is a template-authoring bug → a thrown Error.
 *
 * @param snippets - The project template's snippet files.
 * @returns The {@link ArtefactSnippets} for the task-19 derivation.
 */
function selectArtefactSnippets(snippets: readonly TemplateFile[]): ArtefactSnippets {
  const isFrontDoor = (path: string): boolean =>
    path === "AGENTS.md" ||
    path === "AGENTS.md.tmpl" ||
    path.endsWith("/AGENTS.md") ||
    path.endsWith("/AGENTS.md.tmpl");
  const isOrchestrator = (path: string): boolean =>
    path.includes("installer-skills/") && path.includes("-installer/") && path.endsWith("SKILL.md");

  const frontDoor = snippets.find((s) => isFrontDoor(s.path));
  if (frontDoor === undefined) {
    throw new Error("project template is missing the front-door (AGENTS.md) snippet");
  }
  const orchestrator = snippets.find((s) => isOrchestrator(s.path));
  if (orchestrator === undefined) {
    throw new Error(
      "project template is missing the orchestrator (<project>-installer/SKILL.md) snippet",
    );
  }
  return { frontDoor, orchestrator };
}

/**
 * Build the concrete `deriveArtefacts` capability for the lifecycle harness (doc 13 §5 ④). The returned
 * function resolves the project template once per call (no cache — the project is re-derived fresh each
 * operation), selects its front-door + orchestrator snippets, and renders the desired artefacts via task-19.
 *
 * @param deps - The filesystem port, template roots, and project template name.
 * @returns A pure `(project) => DesiredArtefacts` function suitable for `LifecycleDeps.deriveArtefacts`.
 * @throws {NotFoundError} If the project template cannot be resolved.
 */
export function makeArtefactDeriver(
  deps: ArtefactDeriverDeps,
): (project: Project) => DesiredArtefacts {
  const projectTemplateName = deps.projectTemplateName ?? DEFAULT_PROJECT_TEMPLATE;

  return (project: Project): DesiredArtefacts => {
    const resolution = resolveTemplate(projectTemplateName, "project", {
      fs: deps.fs,
      builtinTemplatesRoot: deps.builtinTemplatesRoot,
      projectTemplatesRoot: deps.projectTemplatesRoot,
    });
    if (!resolution.found) {
      throw new NotFoundError(
        `project template "${projectTemplateName}" not found (searched: ${resolution.searched.join(", ")})`,
      );
    }
    const snippets = selectArtefactSnippets(resolution.template.snippets);
    return deriveArtefacts(project, snippets);
  };
}
