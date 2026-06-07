import { join } from "node:path";
import { NotFoundError, UsageError } from "../errors.js";
import type { Environment, FileSystem } from "../ports/index.js";
import { USER_SCOPE_PATHS } from "../services/agent-aliases.js";

/**
 * `installAuthoringSkill` — the `wpm skill install` use case (doc 12 line 349: `installer skill install`
 * "copies agent-skills/installer-builder/ into the user's scope"). It closes the distribution gap doc 12
 * §"The bundled agent skill" names: the `installer-builder` authoring skill ships inside the npm package but,
 * without this command, never reaches the author's agent. This copies the bundled skill into the **user
 * (personal) agent skill scope** of every supported agent detected on the machine, so the agent catalogues it
 * at its next session start (doc 05 §"Discovery is location-bound").
 *
 * It is **pure over the FileSystem + Environment ports** (doc 13 §1/§3): it composes only those two ports +
 * the model's {@link USER_SCOPE_PATHS} map + `node:path`, never `node:fs`/`node:os`/`child_process`/`commander`
 * — so the core import-boundary rule holds. It is project-independent (no `resolveContext`): the user scope is
 * a machine-wide location under HOME, so the command works with no project present, and (AC#6) it never writes
 * inside any workspace deliverable subdirectory (`wip/` or otherwise) — it targets HOME-rooted scopes only.
 * Failures are raised as typed task-23 `DomainError`s for the CLI boundary to map to an exit code.
 */

/** The bundled authoring skill's directory name under `agent-skills/` (doc 12 §"The bundled agent skill"). */
export const AUTHORING_SKILL_NAME = "installer-builder";

/** The dependencies {@link installAuthoringSkill} needs: the filesystem + environment ports. */
export interface InstallAuthoringSkillDeps {
  /** The filesystem port (real `NodeFileSystem` in production). */
  readonly fs: FileSystem;
  /** The environment port — read HOME from here, never `process` (doc 13 §3). */
  readonly env: Environment;
}

/** The input to {@link installAuthoringSkill}. */
export interface InstallAuthoringSkillInput {
  /**
   * The runtime root of the package's bundled `agent-skills/` directory (assembled at the composition root via
   * `fileURLToPath(new URL("../agent-skills", import.meta.url))`, parallel to `builtinTemplatesRoot`). The skill
   * copied is `<bundledSkillsRoot>/installer-builder/`.
   */
  readonly bundledSkillsRoot: string;
}

/** A user agent scope detected under HOME: the agent it belongs to, its config dir, and its skills scope. */
export interface DetectedAgentScope {
  /** The agent-name string (a key of {@link USER_SCOPE_PATHS}). */
  readonly agent: string;
  /** The HOME-rooted personal config dir whose presence signals the agent (e.g. `<HOME>/.claude`). */
  readonly configDir: string;
  /** The HOME-rooted personal skills scope the skill is installed into (e.g. `<HOME>/.claude/skills`). */
  readonly scope: string;
}

/** What the install did at one scope: a fresh `installed`, or an `updated` over a pre-existing skill. */
export interface InstalledScopeRecord {
  /** The agent whose scope was written. */
  readonly agent: string;
  /** The HOME-rooted skills scope written to (named in the command output — AC#5). */
  readonly scope: string;
  /** The absolute destination directory the skill now lives at. */
  readonly destination: string;
  /** Whether the skill was freshly installed or updated over an existing copy (AC#2). */
  readonly status: "installed" | "updated";
}

/** The structured result of {@link installAuthoringSkill}; the command layer formats it (output is not core). */
export interface InstallAuthoringSkillResult {
  /** The skill's name (always {@link AUTHORING_SKILL_NAME}). */
  readonly skillName: string;
  /** One record per scope written, in detection order (names the scope(s) — AC#5). */
  readonly installed: readonly InstalledScopeRecord[];
  /** The destination directories created or updated. */
  readonly changedPaths: readonly string[];
}

/**
 * Read HOME through the Environment port; a missing/empty HOME is a usage error (there is no user scope to
 * install into). Mirrors `src/util/completion-install.ts`'s HOME handling.
 *
 * @param env - The environment port.
 * @returns The HOME directory path.
 * @throws {UsageError} If HOME is unset or empty.
 */
function requireHome(env: Environment): string {
  const home = env.getEnv("HOME");
  if (home === undefined || home === "") {
    throw new UsageError("cannot install the authoring skill: HOME is not set");
  }
  return home;
}

/**
 * Detect which supported agents have a personal scope present under `home`. An agent is **detected** when its
 * personal config dir exists (e.g. `<HOME>/.claude` for `claude-code`) — the broad "this agent is set up on the
 * machine" signal (doc 05's personal-scope table). The config dir is the first segment of the agent's HOME-
 * relative scope path ({@link USER_SCOPE_PATHS}); the skills scope itself is the full path (created on install
 * if it does not exist yet).
 *
 * @param fs - The filesystem port.
 * @param home - The HOME directory.
 * @returns The detected scopes, in {@link USER_SCOPE_PATHS} iteration order (may be empty).
 */
export function detectUserAgentScopes(fs: FileSystem, home: string): DetectedAgentScope[] {
  const detected: DetectedAgentScope[] = [];
  for (const [agent, suffix] of Object.entries(USER_SCOPE_PATHS)) {
    const firstSegment = suffix.split("/")[0];
    if (firstSegment === undefined) {
      continue;
    }
    const configDir = join(home, firstSegment);
    if (fs.exists(configDir)) {
      detected.push({ agent, configDir, scope: join(home, suffix) });
    }
  }
  return detected;
}

/**
 * Whether the bundled authoring skill is already present in at least one detected user agent scope. Used by
 * `wpm init` to decide whether to surface the "run `wpm skill install`" hint (AC#4 — "when it is absent"); the
 * install command itself does not need it (it always (re)copies and reports installed/updated per scope).
 *
 * @param fs - The filesystem port.
 * @param home - The HOME directory.
 * @returns `true` when every detected scope already holds the skill (and at least one scope is detected).
 */
export function authoringSkillPresent(fs: FileSystem, home: string): boolean {
  const scopes = detectUserAgentScopes(fs, home);
  if (scopes.length === 0) {
    return false;
  }
  return scopes.every((s) => fs.exists(join(s.scope, AUTHORING_SKILL_NAME)));
}

/**
 * Copy the bundled `installer-builder` authoring skill into the user agent skill scope of every supported agent
 * detected on the machine (doc 12 line 349).
 *
 * Steps:
 * 1. Resolve HOME (→ {@link UsageError} if unset).
 * 2. Resolve the bundled skill source `<bundledSkillsRoot>/installer-builder/` (→ {@link NotFoundError} if it
 *    is missing — a packaging bug; this never fires in a real install).
 * 3. Detect the supported agents' user scopes (AC#1). If **none** is detected, raise a {@link UsageError}
 *    BEFORE writing anything (AC#3 — reports the condition, exits non-zero, writes nothing).
 * 4. For each detected scope, copy the skill to `<scope>/installer-builder/`, recording `installed` (fresh) or
 *    `updated` (a copy already existed) so the command reports what it did (AC#2). `copyTree` merges/overwrites
 *    with the source bytes, so a re-run reproduces an identical tree — the install is idempotent.
 *
 * @param deps - The filesystem + environment ports.
 * @param input - The bundled `agent-skills/` root.
 * @returns The {@link InstallAuthoringSkillResult}: the per-scope records and the changed destination paths.
 * @throws {UsageError} If HOME is unset, or no supported agent scope is detected (exit 2).
 * @throws {NotFoundError} If the bundled skill source is missing (a packaging error; exit 1).
 */
export function installAuthoringSkill(
  deps: InstallAuthoringSkillDeps,
  input: InstallAuthoringSkillInput,
): InstallAuthoringSkillResult {
  const { fs, env } = deps;
  const home = requireHome(env);

  // 2. The bundled source must exist; its absence is a packaging defect, not a user error.
  const source = join(input.bundledSkillsRoot, AUTHORING_SKILL_NAME);
  if (!fs.exists(source)) {
    throw new NotFoundError(
      `bundled authoring skill "${AUTHORING_SKILL_NAME}" not found at ${source} (packaging error)`,
    );
  }

  // 3. Detect supported agent scopes; with none present there is nothing to install into (AC#3) — raise
  // BEFORE any write so the failure leaves the filesystem untouched.
  const scopes = detectUserAgentScopes(fs, home);
  if (scopes.length === 0) {
    throw new UsageError(
      "no supported agent skill scope detected under HOME " +
        "(looked for ~/.claude, ~/.agents, ~/.hermes, ~/.openclaw); nothing was installed — " +
        "set up a supported agent first, then re-run `wpm skill install`",
    );
  }

  // 4. Copy into each detected scope, recording installed vs updated (AC#2) and naming each scope (AC#5).
  const installed: InstalledScopeRecord[] = [];
  const changedPaths: string[] = [];
  for (const { agent, scope } of scopes) {
    const destination = join(scope, AUTHORING_SKILL_NAME);
    const status: InstalledScopeRecord["status"] = fs.exists(destination) ? "updated" : "installed";
    fs.copyTree(source, destination);
    installed.push({ agent, scope, destination, status });
    changedPaths.push(destination);
  }

  return { skillName: AUTHORING_SKILL_NAME, installed, changedPaths };
}
