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
 * A template as *data* (doc 13 §2; doc 06): its name, scope, declared parameters, the file tree copied at
 * init, and the on-demand snippet set rendered later by add-commands. This is the shape only — resolving and
 * rendering templates are later tasks (17 and 16).
 */
export interface Template {
  /** The template's name (how it is referenced on the CLI). */
  readonly name: string;
  /** Whether it scaffolds a project or a bundle. */
  readonly scope: TemplateScope;
  /** The parameters the template declares. */
  readonly parameters: readonly TemplateParameter[];
  /** The file tree copied wholesale at init time. */
  readonly files: readonly TemplateFile[];
  /** On-demand single-file stubs rendered later by add-commands (the advisor / skill stubs). */
  readonly snippets: readonly TemplateFile[];
}
