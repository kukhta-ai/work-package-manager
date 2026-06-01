import type { Environment, FileSystem } from "../core/ports/index.js";

/**
 * The named-source registry for tab-completion (doc 10 §"Every command is discoverable" → completable values;
 * doc 12 §directory scaffold `src/completion/`). This is the IMPURE-SHELL side of completion, but the registry
 * itself is pure data + lookup — the SOURCES read project state only through the injected ports + pure core
 * services (`resolveContext`/`parseManifest`/`listTemplates`), never `node:fs`/`commander`/`omelette` directly.
 *
 * The load-bearing property (task-29 AC#3): a command/option declares its completion **by source name**, and
 * the `__complete` dispatch resolves the name through this registry. So a later command leaf (tasks 34–84) adds
 * a state-dependent completion by registering a named source (or referencing a built-in one) — WITHOUT touching
 * the dispatch wiring. Fixed-enum completions (AC#2) are the same mechanism specialized to a constant array.
 */

/**
 * What a completion source sees when it resolves: the ports it may read state through, the built-in templates
 * root, the active `-C/--project` override (so completion respects the same project the command would), and the
 * partial token being completed (a source MAY prefix-filter on it — {@link prefixFilter} is the shared helper).
 */
export interface CompletionContext {
  /** The filesystem port (real or fake) — the only way a source reaches disk. */
  readonly fs: FileSystem;
  /** The environment port (real or fake) — supplies the working directory for project resolution. */
  readonly env: Environment;
  /** The built-in templates root shipped with the package (project-local templates shadow these). */
  readonly builtinTemplatesRoot: string;
  /** The `-C/--project <path>` override carried on the command line, if any, so completion targets it. */
  readonly projectOverride?: string;
  /** The partial token the user is completing (may be `""`); sources prefix-filter their suggestions by it. */
  readonly partial: string;
}

/** A completion source: produces the suggestion list for a value position from the {@link CompletionContext}. */
export type CompletionSource = (ctx: CompletionContext) => string[];

/**
 * Keep only suggestions that start with `partial` (case-sensitive, like the shells). A `""` partial keeps
 * everything. Shared by every source so prefix behaviour is uniform.
 *
 * @param values - The candidate suggestions.
 * @param partial - The partial token being completed.
 * @returns The candidates that start with `partial`.
 */
export function prefixFilter(values: readonly string[], partial: string): string[] {
  if (partial === "") {
    return [...values];
  }
  return values.filter((v) => v.startsWith(partial));
}

/**
 * Build a {@link CompletionSource} that completes to a fixed set of values (AC#2: "options with a fixed set of
 * valid values complete to those values"). The values are knowable without project state, so the source ignores
 * everything in the context except the partial, which it prefix-filters by.
 *
 * @param values - The finite value set (e.g. `["major", "minor", "patch"]`).
 * @returns A source returning those values, prefix-filtered by the partial.
 */
export function fixedEnum(values: readonly string[]): CompletionSource {
  return (ctx) => prefixFilter(values, ctx.partial);
}

/**
 * A mutable registry mapping a source NAME to its {@link CompletionSource}. The dispatch consults it by name, so
 * new sources are added without restructuring the wiring (AC#3). Resolution of an unknown name yields `[]` (a
 * missing source completes to nothing) rather than throwing — completion must never crash a shell.
 */
export class CompletionRegistry {
  private readonly sources = new Map<string, CompletionSource>();

  /**
   * Register a named source. Re-registering a name replaces it (last wins) — this is intentional so a project
   * or a test can override a built-in source by name.
   *
   * @param name - The source name (e.g. `"bundle-ids"`).
   * @param source - The resolver to associate with the name.
   */
  register(name: string, source: CompletionSource): void {
    this.sources.set(name, source);
  }

  /**
   * Whether a source is registered under `name`.
   *
   * @param name - The source name.
   * @returns `true` if a source exists for `name`.
   */
  has(name: string): boolean {
    return this.sources.has(name);
  }

  /**
   * Resolve suggestions for a named source. An unknown name returns `[]` (never throws). A source that itself
   * throws (e.g. a malformed manifest) is contained and yields `[]`, so completion degrades to "no suggestions"
   * rather than erroring in the user's shell.
   *
   * @param name - The source name to resolve.
   * @param ctx - The completion context (ports + partial).
   * @returns The suggestion list, or `[]` if the name is unknown or the source failed.
   */
  resolve(name: string, ctx: CompletionContext): string[] {
    const source = this.sources.get(name);
    if (source === undefined) {
      return [];
    }
    try {
      return source(ctx);
    } catch {
      return [];
    }
  }
}
