/**
 * One executor-front-door transform the build performs while archiving (doc 06/12): rename a reserved-prefix
 * `_AGENTS.md` to its canonical `AGENTS.md`, and synthesize the per-target alias front doors beside it. Computed
 * by the pure build operation (the policy); the packager adapter PERFORMS it (the effect — staging + the verbatim byte copy + the
 * alias symlinks). All paths are root-relative POSIX, so they line up with the shippable file list.
 */
export interface FrontDoorTransform {
  /** The reserved-prefix source path in the shippable set, e.g. `_AGENTS.md` or `bundles/core/_AGENTS.md`. */
  readonly from: string;
  /** The canonical stripped destination, in the same directory, e.g. `AGENTS.md` or `bundles/core/AGENTS.md`. */
  readonly to: string;
  /**
   * The build-created per-target alias front doors, in the same directory (e.g. `CLAUDE.md`,
   * `bundles/core/CLAUDE.md`) — one per targeted agent whose front-door basename is not the universal `AGENTS.md`
   * (doc 05). Empty when every target reads `AGENTS.md` natively.
   */
  readonly aliases: readonly string[];
}

/** One manifest-derived target skill-scope alias to synthesize in the prepared release tree. */
export interface ScopeAliasTransform {
  /** Exact root-relative target-native scope path, such as `.claude/skills`. */
  readonly linkPath: string;
  /** Corresponding root-relative canonical directory shipped in the artifact. */
  readonly aliasTo: string;
}
