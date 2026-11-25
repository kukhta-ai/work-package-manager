/**
 * Whether a template scaffolds a whole project or a single bundle (doc 06; doc 10 `template`/`bundle
 * template`). Project templates carry the front-door/manifest/orchestrator content; bundle templates carry
 * a single bundle's scaffold.
 */
export type TemplateScope = "project" | "bundle";

/**
 * A declared template parameter — a `{{placeholder}}` the render step substitutes (doc 06; doc 12
 * "Templates as data"). `description` and `default` are optional authoring aids.
 */
export interface TemplateParameter {
  /** The parameter name, used as the `{{name}}` placeholder. */
  readonly name: string;
  /** Optional human description of what the parameter is for. */
  readonly description?: string;
  /** Optional default value when the author does not supply one. */
  readonly default?: string;
}

/**
 * One file in a template's tree, represented purely as data: a relative path plus its (pre-substitution)
 * text content. The model carries the template as data; the actual `{{placeholder}}` substitution and disk
 * I/O are the render service's job (task-16), not the model's.
 */
export interface TemplateFile {
  /** The file's path relative to the template root (and to the instantiated output root). */
  readonly path: string;
  /** The file's template text, with `{{placeholder}}` markers not yet substituted. */
  readonly content: string;
}

/**
 * The untrusted, inert authoring-task declaration retained from `template.yml` for aggregate inspection.
 *
 * The schema parser deliberately does not turn these two values into executable behavior or fail on the
 * first malformed task. The dedicated template-authoring-task inspector validates the complete declaration
 * and returns every safely discoverable finding together. Keeping the values unknown at this boundary makes
 * that trust transition explicit.
 */
export interface TemplateAuthoringTaskSource {
  /** The producer-defined revision exactly as declared; the inspector validates its grammar when tasks exist. */
  readonly revision: unknown;
  /** The exact `authoring-tasks` value; only the inspector may compile it into typed task data. */
  readonly tasks: unknown;
  /** Parser problems retained so malformed or unsupported YAML cannot collapse into apparently valid data. */
  readonly yamlProblems?: readonly {
    readonly code: string;
    readonly token: string;
    readonly line: number;
    readonly column: number;
  }[];
}

/**
 * A template as *data* (doc 13 §2; doc 06): its name, scope, declared parameters, the file tree copied at
 * init, the on-demand snippet set rendered later by add-commands, and any inert authoring-task source retained
 * for read-only aggregate inspection. Resolving, rendering, and task inspection remain separate services.
 */
export interface Template {
  /** The template's name (how it is referenced on the CLI). */
  readonly name: string;
  /** Whether it scaffolds a project or a bundle. */
  readonly scope: TemplateScope;
  /** Optional one-line human description of the template (the `template.yml` `description`; shown by `template show`). */
  readonly description?: string;
  /** The parameters the template declares. */
  readonly parameters: readonly TemplateParameter[];
  /** The file tree copied wholesale at init time. */
  readonly files: readonly TemplateFile[];
  /** On-demand single-file stubs rendered later by add-commands (the advisor / skill stubs). */
  readonly snippets: readonly TemplateFile[];
  /** Optional inert authoring-task declaration retained for read-only inspection. */
  readonly authoringTaskSource?: TemplateAuthoringTaskSource;
}
