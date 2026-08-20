import { posix } from "node:path";
import type { AgentName, BundleId, Project, TemplateFile } from "../model/index.js";
import { aliasPathFor } from "./agent-aliases.js";
import { type RenderedFile, type RenderParams, renderSnippet } from "./render.js";

/**
 * The `derived-artefacts` service (doc 13 §4; §5 step ④ RERENDER): a **pure projection** of the desired
 * on-disk state derived from a {@link Project} — the always-read front-door `AGENTS.md`, the
 * `<project>-installer` orchestrator skill, and the set of scope aliases that should exist. Idempotent by
 * construction: same `Project` (+ same template snippets) ⇒ same output.
 *
 * It performs **no I/O**: the operation resolves the template snippets (via the template-resolver) and passes
 * them in as data, then takes this projection, diffs it against reality with {@link planChanges}, and applies
 * only the delta (writing files / creating aliases through the FileSystem port). This service imports only
 * the render service, the model, the alias map, and `node:path` (pure string joins) — never `node:fs`.
 */

/** The canonical directory each scope alias points at, relative to the project (or bundle) root. */
const INSTALLER_SKILLS_DIR = "installer-skills";

/** One scope alias to create: a symlink at `linkPath` pointing at the `aliasTo` `installer-skills/` dir. */
export interface AliasPlanEntry {
  /** The target agent this alias serves. */
  readonly target: AgentName;
  /** Where the symlink is created (project-relative), e.g. `.claude/skills` or `bundles/web/.claude/skills`. */
  readonly linkPath: string;
  /** The `installer-skills/` directory the alias points at (project-relative). */
  readonly aliasTo: string;
}

/**
 * The scope-alias plan: the aliases that should exist for the declared targets at root and per bundle, plus
 * any declared targets that are not in the built-in agent map (so the caller can warn rather than silently
 * drop them — doc 10).
 */
export interface AliasPlan {
  /** The aliases that should exist. */
  readonly aliases: AliasPlanEntry[];
  /** Declared targets with no built-in alias path. */
  readonly unknownTargets: AgentName[];
}

/**
 * The snippets the projection renders, passed as data (the operation resolved them from the template). Each
 * is a {@link TemplateFile} (path + pre-substitution content).
 */
export interface ArtefactSnippets {
  /** The front-door `AGENTS.md` snippet. */
  readonly frontDoor: TemplateFile;
  /** The `<project>-installer` orchestrator-skill snippet (its path may carry `{{project-name}}`). */
  readonly orchestrator: TemplateFile;
}

/** The desired on-disk artefacts derived from a project: the rendered files and the alias plan. */
export interface DesiredArtefacts {
  /** The rendered derived files (front-door + orchestrator skill). */
  readonly files: RenderedFile[];
  /** The scope-alias plan. */
  readonly aliasPlan: AliasPlan;
}

/**
 * The actual current on-disk state, supplied as data by the operation, against which {@link planChanges}
 * diffs the desired artefacts.
 */
export interface CurrentState {
  /** The current content of files, by path (absent path ⇒ the file does not exist). */
  readonly files: ReadonlyMap<string, string>;
  /** The link paths of aliases that already exist. */
  readonly aliases: ReadonlySet<string>;
}

/** The delta to apply: only the files/aliases that differ from the current state (empty when up to date). */
export interface ChangeSet {
  /** Files whose content is missing or differs and must be written. */
  readonly filesToWrite: RenderedFile[];
  /** Aliases that do not yet exist and must be created. */
  readonly aliasesToCreate: AliasPlanEntry[];
}

/**
 * Plan the scope aliases that should exist for the declared `targets`, at the project root AND inside each
 * bundle (the self-similar surfaces — doc 06: the front-door / install-time-skill mechanics recur per
 * bundle). Each known target yields a root alias plus one per bundle; targets with no built-in alias path are
 * collected into `unknownTargets`. The order is deterministic (targets in input order × [root, then bundles
 * in id order]).
 *
 * @param targets - The project's declared target agents.
 * @param bundleIds - The enabled bundle ids.
 * @returns The {@link AliasPlan}.
 */
export function scopePlan(
  targets: readonly AgentName[],
  bundleIds: readonly BundleId[],
): AliasPlan {
  const aliases: AliasPlanEntry[] = [];
  const unknownTargets: AgentName[] = [];
  for (const target of targets) {
    const aliasPath = aliasPathFor(target);
    if (aliasPath === undefined) {
      unknownTargets.push(target);
      continue;
    }
    // Project-root alias.
    aliases.push({ target, linkPath: aliasPath, aliasTo: INSTALLER_SKILLS_DIR });
    // Per-bundle aliases (self-similar surfaces). linkPath/aliasTo are LOGICAL project-relative paths — stored
    // in the plan, compared in `planChanges`, and shown — so they are built with `posix.join` to stay POSIX on
    // every OS (native `join` would emit `bundles\<id>\…` on Windows; the real adapter's `ensureAlias` roots
    // them under the project root for the actual symlink, where `/` is accepted).
    for (const id of bundleIds) {
      const bundleDir = posix.join("bundles", id);
      aliases.push({
        target,
        linkPath: posix.join(bundleDir, aliasPath),
        aliasTo: posix.join(bundleDir, INSTALLER_SKILLS_DIR),
      });
    }
  }
  return { aliases, unknownTargets };
}

/**
 * Build the render parameters from a {@link Project}: `project-name` from the manifest, and `bundles` as the
 * menu — one `- <summary>` line per enabled bundle, in manifest `bundles` order (each looked up from
 * `project.bundles`). A bundle id listed in the manifest but absent from the loaded bundles is skipped (it
 * contributes no summary line).
 */
function buildParams(project: Project): RenderParams {
  const lines: string[] = [];
  for (const id of project.manifest.bundles) {
    const bundle = project.bundles.get(id);
    if (bundle !== undefined) {
      lines.push(`- ${bundle.summary}`);
    }
  }
  return new Map<string, string>([
    ["project-name", project.manifest.meta.name],
    ["bundles", lines.join("\n")],
  ]);
}

/**
 * Derive the desired on-disk artefacts from a project (doc 13 §4): render the front-door and orchestrator
 * snippets with parameters computed from the project, and plan the scope aliases. Pure and deterministic —
 * the same `project` + `snippets` always yield a deep-equal result (AC#3).
 *
 * @param project - The loaded project projection.
 * @param snippets - The front-door and orchestrator snippets (resolved by the operation, passed as data).
 * @returns The {@link DesiredArtefacts}.
 * @throws If a snippet contains an unresolved placeholder (a template-authoring bug; from the render service).
 */
export function deriveArtefacts(project: Project, snippets: ArtefactSnippets): DesiredArtefacts {
  const params = buildParams(project);
  const frontDoor = renderSnippet(snippets.frontDoor, params);
  const orchestrator = renderSnippet(snippets.orchestrator, params);
  const aliasPlan = scopePlan(project.manifest.targets, project.manifest.bundles);
  return { files: [frontDoor, orchestrator], aliasPlan };
}

/**
 * Diff the desired artefacts against the actual current state and return only the changes to apply (doc 13
 * §4: "the operation diffs it against reality and applies it"). A file whose current content already equals
 * the desired content is skipped; an alias whose link path already exists is skipped. The {@link ChangeSet}
 * is therefore **empty** when the project is already current — so re-deriving onto an up-to-date project
 * writes nothing (AC#3). Pure: the operation supplies `current` (read via the FileSystem port).
 *
 * @param desired - The desired artefacts from {@link deriveArtefacts}.
 * @param current - The actual current on-disk state, as data.
 * @returns The {@link ChangeSet} of files to write and aliases to create.
 */
export function planChanges(desired: DesiredArtefacts, current: CurrentState): ChangeSet {
  const filesToWrite = desired.files.filter(
    (file) => current.files.get(file.path) !== file.content,
  );
  const aliasesToCreate = desired.aliasPlan.aliases.filter(
    (alias) => !current.aliases.has(alias.linkPath),
  );
  return { filesToWrite, aliasesToCreate };
}
