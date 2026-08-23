import { join } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import { parseYaml } from "../../util/yaml.js";
import {
  type MutationBoundary,
  MutationFailure,
  type WorkspaceIntegrationBlocker,
  WorkspaceIntegrationPreflightError,
} from "../errors.js";
import { AUTHORING_TASK_PREFIX } from "../model/index.js";
import type { BacklogMd, FileSystem, PathInspection } from "../ports/index.js";
import {
  type AuthoringClientDefinition,
  type AuthoringClientId,
  listAuthoringClientDefinitions,
} from "../services/authoring-clients.js";
import { validateSkillFrontmatter } from "../services/frontmatter.js";
import { hashTextContent } from "../services/integrity.js";
import { renderSnippet } from "../services/render.js";
import { parseManifest } from "../services/schema/index.js";
import { resolveTemplate } from "../services/template-resolver.js";
import {
  type ApplyingFrontDoorPlan,
  type ApplyingFrontDoorPreimage,
  type ApplyingFrontDoorResult,
  type ApplyingManagedAuthoringState,
  type CompleteManagedAuthoringState,
  inspectManagedFrontDoor,
  isCanonicalIntegrationVersion,
  type ManagedAuthoringState,
  type ManagedFrontDoorPath,
  type ManagedSkillPath,
  type ManagedWorkspacePath,
  normalizeWorkspaceAuthoringClients,
  parseManagedAuthoringState,
  removeManagedFrontDoor,
  renderManagedFrontDoorBlock,
  serializeManagedAuthoringState,
  upsertManagedFrontDoor,
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
  type WorkspaceIntegrationOrigin,
  type WorkspaceSkillName,
  workspaceIntegrationRequestKey,
} from "../services/workspace-authoring-integration.js";

const LEGACY_PROJECT_TEMPLATE = "minimal";
const LEGACY_FRONT_DOOR_SNIPPET = "authoring-front-door.md";

/** The existing four-port dependencies needed by workspace integration. */
export interface WorkspaceAuthoringIntegrationDeps {
  readonly fs: FileSystem;
  readonly backlog: BacklogMd;
  readonly bundledSkillsRoot: string;
  readonly builtinTemplatesRoot: string;
}

/** Explicit operation input; client IDs never come from detection or the deliverable manifest. */
export interface WorkspaceAuthoringIntegrationInput {
  readonly workspaceRoot: string;
  readonly clientIds: readonly string[];
  readonly integrationVersion: string;
}

/** Structured success for the selected workspace scopes. Story 2.8 alone may prepare a handoff. */
export interface WorkspaceAuthoringIntegrationResult {
  readonly summary: string;
  readonly selectedClients: readonly AuthoringClientId[];
  readonly integrationVersion: string;
  readonly origin: WorkspaceIntegrationOrigin;
  readonly statePath: typeof WORKSPACE_INTEGRATION_STATE_PATH;
  readonly changedPaths: readonly string[];
  readonly handoffPrepared: false;
}

/** One exact workspace-local file captured by fresh-init integration preflight. */
export interface FreshWorkspaceAuthoringFile {
  readonly client: AuthoringClientId;
  /** Workspace-root-relative portable path. */
  readonly path: string;
  readonly content: string;
}

/** Immutable Story-2.7 integration slice embedded in the larger fresh-workspace init plan. */
export interface FreshWorkspaceAuthoringPlan {
  readonly clients: readonly AuthoringClientId[];
  readonly integrationVersion: string;
  readonly files: readonly FreshWorkspaceAuthoringFile[];
  readonly completeState: CompleteManagedAuthoringState;
  readonly completeStateText: string;
  readonly applyingFrontDoors: readonly ApplyingFrontDoorPlan[];
  readonly applyingState: ApplyingManagedAuthoringState;
  readonly applyingStateText: string;
}

/** Source/destination snapshot that fresh init binds into its whole-request fingerprint. */
export interface FreshWorkspaceAuthoringPlanSeed {
  readonly clients: readonly AuthoringClientId[];
  readonly integrationVersion: string;
  readonly files: readonly FreshWorkspaceAuthoringFile[];
  readonly completeState: CompleteManagedAuthoringState;
  readonly completeStateText: string;
  readonly applyingFrontDoors: readonly ApplyingFrontDoorPlan[];
}

interface SkillSource {
  readonly name: WorkspaceSkillName;
  readonly content: string;
  readonly sha256: string;
}

interface PlannedAction extends MutationBoundary {
  readonly perform: (fs: FileSystem) => void;
}

interface IntegrationSnapshot {
  readonly clients: readonly AuthoringClientId[];
  readonly definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>;
  readonly sources: ReadonlyMap<WorkspaceSkillName, SkillSource>;
  readonly currentState: ManagedAuthoringState | undefined;
  readonly currentStateText: string | undefined;
  readonly previousState: CompleteManagedAuthoringState | null;
  readonly legacy: boolean;
  readonly origin: WorkspaceIntegrationOrigin;
}

interface IntegrationPlan {
  readonly snapshot: IntegrationSnapshot;
  readonly applyingState: ApplyingManagedAuthoringState;
  readonly completeState: CompleteManagedAuthoringState;
  readonly actions: readonly PlannedAction[];
}

function blocker(
  code: string,
  surface: WorkspaceIntegrationBlocker["surface"],
  message: string,
  recovery: string,
): WorkspaceIntegrationBlocker {
  return { code, surface, message, recovery };
}

function inspectIntegrationVersion(version: string, blockers: WorkspaceIntegrationBlocker[]): void {
  const empty = version.trim().length === 0;
  const renderedVersion = JSON.stringify(version);
  if (isCanonicalIntegrationVersion(version)) return;
  blockers.push(
    blocker(
      empty ? "integration-version-empty" : "integration-version-invalid",
      "packaged-content",
      empty
        ? "the installed WPM integration version is empty"
        : `the installed WPM integration version ${renderedVersion} is not canonical semantic-version text`,
      "repair the installed WPM package before integration",
    ),
  );
}

function portable(path: string): string {
  return toPosix(path);
}

function definitionMap(): ReadonlyMap<AuthoringClientId, AuthoringClientDefinition> {
  return new Map(listAuthoringClientDefinitions().map((definition) => [definition.id, definition]));
}

function expectedSkillPath(
  definition: AuthoringClientDefinition,
  name: WorkspaceSkillName,
): string {
  return portable(join(definition.workspaceSkillsDirectory, name));
}

function expectedOwnedPaths(
  clients: readonly AuthoringClientId[],
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  sources: ReadonlyMap<WorkspaceSkillName, SkillSource>,
  version: string,
): ManagedWorkspacePath[] {
  const owned: ManagedWorkspacePath[] = [];
  for (const client of clients) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    for (const name of WORKSPACE_SKILL_NAMES) {
      const source = sources.get(name) as SkillSource;
      owned.push({
        kind: "skill",
        client,
        name,
        path: expectedSkillPath(definition, name),
        version,
        sha256: source.sha256,
      });
    }
    owned.push({
      kind: "front-door",
      client,
      path: definition.workspaceFrontDoor,
      version,
      ownership: "managed-block",
    });
  }
  return owned;
}

function reconciliationFor(
  previous: CompleteManagedAuthoringState | null,
  clients: readonly AuthoringClientId[],
  version: string,
): CompleteManagedAuthoringState["reconciliation"] {
  const unchanged =
    previous !== null &&
    previous.integrationVersion === version &&
    previous.selectedClients.join(",") === clients.join(",");
  return unchanged
    ? previous.reconciliation
    : {
        strategy: "exact-owned-content",
        previousVersion: previous?.integrationVersion ?? null,
        previousClients: previous?.selectedClients ?? [],
      };
}

function inspectSkillSources(
  deps: WorkspaceAuthoringIntegrationDeps,
  blockers: WorkspaceIntegrationBlocker[],
): ReadonlyMap<WorkspaceSkillName, SkillSource> {
  const sources = new Map<WorkspaceSkillName, SkillSource>();
  for (const name of WORKSPACE_SKILL_NAMES) {
    const directory = join(deps.bundledSkillsRoot, name);
    try {
      const path = join(directory, "SKILL.md");
      const inspection = deps.fs.inspectPath(directory);
      const leaf = deps.fs.inspectPath(path);
      const entries = inspection.kind === "directory" ? deps.fs.list(directory) : [];
      if (
        inspection.kind !== "directory" ||
        leaf.kind !== "file" ||
        entries.length !== 1 ||
        entries[0]?.name !== "SKILL.md" ||
        entries[0]?.kind !== "file"
      ) {
        blockers.push(
          blocker(
            "packaged-skill-shape-invalid",
            "packaged-content",
            `packaged workspace skill ${name} must contain exactly one regular SKILL.md`,
            "reinstall or repair the exact WPM package, then repeat the integration request",
          ),
        );
        continue;
      }
      const captured = deps.fs.readWithDigest(path);
      const content = captured.content;
      const frontmatter = validateSkillFrontmatter(content, portable(path));
      if (frontmatter.name !== name) {
        blockers.push(
          blocker(
            "packaged-skill-identity-mismatch",
            "packaged-content",
            `packaged ${name}/SKILL.md declares ${JSON.stringify(frontmatter.name)}`,
            "reinstall or repair the exact WPM package, then repeat the integration request",
          ),
        );
        continue;
      }
      sources.set(name, { name, content, sha256: captured.sha256 });
    } catch (error) {
      blockers.push(
        blocker(
          "packaged-skill-invalid",
          "packaged-content",
          `packaged workspace skill ${name} is invalid: ${error instanceof Error ? error.message : String(error)}`,
          "reinstall or repair the exact WPM package, then repeat the integration request",
        ),
      );
    }
  }
  return sources;
}

function inspectWorkspaceAndBacklog(
  deps: WorkspaceAuthoringIntegrationDeps,
  workspaceRoot: string,
  blockers: WorkspaceIntegrationBlocker[],
): string | undefined {
  const wip = join(workspaceRoot, "wip");
  const manifestPath = join(wip, "manifest.yml");
  const builds = join(workspaceRoot, "builds");
  const backlogRoot = join(workspaceRoot, ".authoring-backlog");
  try {
    const rootInspection = deps.fs.inspectPath(workspaceRoot);
    if (rootInspection.kind !== "directory") {
      blockers.push(
        blocker(
          "workspace-root-invalid",
          "target",
          `${portable(workspaceRoot)} must be one real directory; found ${rootInspection.kind}`,
          "select the canonical workspace root rather than an alias or conflicting path",
        ),
      );
    } else {
      const canonical = deps.fs.canonicalPath(workspaceRoot);
      if (portable(canonical) !== portable(workspaceRoot)) {
        blockers.push(
          blocker(
            "workspace-root-noncanonical",
            "target",
            `${portable(workspaceRoot)} resolves to ${portable(canonical)}`,
            "repeat from the canonical workspace root so durable identity cannot escape through an alias",
          ),
        );
      }
    }
  } catch (error) {
    blockers.push(
      blocker(
        "workspace-root-unreadable",
        "target",
        error instanceof Error ? error.message : String(error),
        "make the canonical workspace root inspectable, then repeat the request",
      ),
    );
  }
  let manifestIsFile = false;
  let backlogIsDirectory = false;
  for (const [path, kind, code] of [
    [wip, "directory", "workspace-wip-invalid"],
    [manifestPath, "file", "workspace-manifest-invalid"],
    [builds, "directory", "workspace-builds-invalid"],
    [backlogRoot, "directory", "workspace-backlog-path-invalid"],
  ] as const) {
    try {
      const actual = deps.fs.inspectPath(path);
      if (path === manifestPath) manifestIsFile = actual.kind === "file";
      if (path === backlogRoot) backlogIsDirectory = actual.kind === "directory";
      if (actual.kind === kind) continue;
      blockers.push(
        blocker(
          code,
          kind === "directory" && path === backlogRoot ? "backlog" : "target",
          `${portable(path)} must be a ${kind}; found ${actual.kind}`,
          "restore the exact WPM authoring workspace wrapper before reapplying integration",
        ),
      );
    } catch (error) {
      blockers.push(
        blocker(
          `${code}-unreadable`,
          kind === "directory" && path === backlogRoot ? "backlog" : "target",
          `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact workspace surface readable, then repeat the request",
        ),
      );
    }
  }

  let backlogAvailable = false;
  try {
    const availability = deps.backlog.inspectAvailability();
    backlogAvailable = availability.available;
    if (!availability.available) {
      blockers.push(
        blocker(
          "backlog-unavailable",
          "backlog",
          `Backlog.md is unavailable: ${availability.reason}`,
          "install or repair Backlog.md, then repeat the complete request",
        ),
      );
    }
  } catch (error) {
    blockers.push(
      blocker(
        "backlog-unavailable",
        "backlog",
        `Backlog.md availability cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "install or repair Backlog.md, then repeat the complete request",
      ),
    );
  }
  if (backlogAvailable && backlogIsDirectory) {
    try {
      const root = deps.backlog.inspectRoot(backlogRoot);
      if (!root.valid || root.taskPrefix !== AUTHORING_TASK_PREFIX) {
        blockers.push(
          blocker(
            "authoring-backlog-root-invalid",
            "backlog",
            root.valid
              ? `the exact authoring backlog uses task prefix ${JSON.stringify(root.taskPrefix)}`
              : `the exact authoring backlog is invalid: ${root.reason}`,
            "restore the exact workspace .authoring-backlog root with task prefix authoring",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        blocker(
          "authoring-backlog-root-unreadable",
          "backlog",
          error instanceof Error ? error.message : String(error),
          "make the exact authoring backlog identity inspectable, then repeat the request",
        ),
      );
    }
    try {
      deps.backlog.listTasks(backlogRoot);
    } catch (error) {
      blockers.push(
        blocker(
          "authoring-backlog-malformed",
          "backlog",
          `the authoring backlog cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          "repair or restore the authoring backlog through Backlog.md, then repeat the request",
        ),
      );
    }
  }

  if (!manifestIsFile) return undefined;
  try {
    const parsed = parseManifest(parseYaml(deps.fs.read(manifestPath)));
    if (!parsed.ok) {
      blockers.push(
        blocker(
          "workspace-manifest-malformed",
          "target",
          parsed.problem.message,
          "repair the deliverable manifest through the normal WPM authoring workflow",
        ),
      );
      return undefined;
    }
    return parsed.value.meta.name;
  } catch (error) {
    blockers.push(
      blocker(
        "workspace-manifest-malformed",
        "target",
        error instanceof Error ? error.message : String(error),
        "repair the deliverable manifest through the normal WPM authoring workflow",
      ),
    );
    return undefined;
  }
}

function renderExpectedLegacyFrontDoor(
  deps: WorkspaceAuthoringIntegrationDeps,
  projectName: string,
  blockers: WorkspaceIntegrationBlocker[],
): string | undefined {
  let resolution: ReturnType<typeof resolveTemplate>;
  try {
    resolution = resolveTemplate(LEGACY_PROJECT_TEMPLATE, "project", {
      fs: deps.fs,
      builtinTemplatesRoot: deps.builtinTemplatesRoot,
    });
  } catch (error) {
    blockers.push(
      blocker(
        "legacy-signature-unavailable",
        "packaged-content",
        error instanceof Error ? error.message : String(error),
        "reinstall or repair the exact WPM package, then repeat adoption",
      ),
    );
    return undefined;
  }
  if (!resolution.found) {
    blockers.push(
      blocker(
        "legacy-signature-unavailable",
        "packaged-content",
        `built-in ${LEGACY_PROJECT_TEMPLATE} template is unavailable`,
        "reinstall or repair the exact WPM package, then repeat adoption",
      ),
    );
    return undefined;
  }
  const snippet = resolution.template.snippets.find(
    ({ path }) =>
      path === LEGACY_FRONT_DOOR_SNIPPET || path === `${LEGACY_FRONT_DOOR_SNIPPET}.tmpl`,
  );
  if (snippet === undefined) {
    blockers.push(
      blocker(
        "legacy-signature-unavailable",
        "packaged-content",
        "built-in legacy authoring-front-door snippet is unavailable",
        "reinstall or repair the exact WPM package, then repeat adoption",
      ),
    );
    return undefined;
  }
  try {
    return renderSnippet(snippet, new Map([["project-name", projectName]])).content;
  } catch (error) {
    blockers.push(
      blocker(
        "legacy-signature-unavailable",
        "packaged-content",
        error instanceof Error ? error.message : String(error),
        "reinstall or repair the exact WPM package, then repeat adoption",
      ),
    );
    return undefined;
  }
}

function inspectCurrentState(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  clients: readonly AuthoringClientId[],
  blockers: WorkspaceIntegrationBlocker[],
): { state?: ManagedAuthoringState; text?: string } {
  const statePath = join(input.workspaceRoot, WORKSPACE_INTEGRATION_STATE_PATH);
  let inspection: PathInspection;
  try {
    inspection = deps.fs.inspectPath(statePath);
  } catch (error) {
    blockers.push(
      blocker(
        "managed-state-unreadable",
        "managed-state",
        error instanceof Error ? error.message : String(error),
        "make the exact managed-state path inspectable or restore it from a trusted copy",
      ),
    );
    return {};
  }
  if (inspection.kind === "missing") return {};
  if (inspection.kind !== "file") {
    blockers.push(
      blocker(
        "managed-state-path-ambiguous",
        "managed-state",
        `${portable(statePath)} is ${inspection.kind}, not a WPM-owned regular file`,
        "restore or remove the conflicting path only after establishing its ownership",
      ),
    );
    return {};
  }
  let text: string;
  try {
    text = deps.fs.read(statePath);
  } catch (error) {
    blockers.push(
      blocker(
        "managed-state-unreadable",
        "managed-state",
        error instanceof Error ? error.message : String(error),
        "make the exact managed-state file readable or restore it from a trusted copy",
      ),
    );
    return {};
  }
  const parsed = parseManagedAuthoringState(text);
  if (!parsed.ok) {
    blockers.push(
      blocker(
        "managed-state-invalid",
        "managed-state",
        parsed.reason,
        "restore a valid WPM-owned state record or recover the workspace from a trusted copy",
      ),
    );
    return { text };
  }
  if (text !== serializeManagedAuthoringState(parsed.value)) {
    blockers.push(
      blocker(
        "managed-state-bytes-modified",
        "managed-state",
        "the managed-state file is structurally valid but no longer has its exact WPM-owned bytes",
        "restore the exact canonical WPM-owned state record before reapplying integration",
      ),
    );
  }
  if (parsed.value.workspaceRoot !== portable(input.workspaceRoot)) {
    blockers.push(
      blocker(
        "managed-state-workspace-mismatch",
        "managed-state",
        `managed state declares ${JSON.stringify(parsed.value.workspaceRoot)}, not ${JSON.stringify(portable(input.workspaceRoot))}`,
        "run integration only at the workspace root recorded by WPM or restore the record",
      ),
    );
  }
  if (
    parsed.value.status === "applying" &&
    parsed.value.pending.requestKey !==
      workspaceIntegrationRequestKey(clients, input.integrationVersion)
  ) {
    blockers.push(
      blocker(
        "partial-request-mismatch",
        "managed-state",
        "an applying integration belongs to a different client/version request",
        "repeat the identical recorded request, or recover it before authorizing a different request",
      ),
    );
  }
  if (
    parsed.value.status === "applying" &&
    (parsed.value.integrationVersion !== input.integrationVersion ||
      parsed.value.selectedClients.join(",") !== clients.join(","))
  ) {
    blockers.push(
      blocker(
        "partial-state-request-mismatch",
        "managed-state",
        "the applying state's selected clients/version do not match the identical retry request",
        "restore the exact applying record or repeat the request it records",
      ),
    );
  }
  return { state: parsed.value, text };
}

function ownedSkill(
  state: CompleteManagedAuthoringState | null,
  client: AuthoringClientId,
  name: WorkspaceSkillName,
): ManagedSkillPath | undefined {
  return state?.ownedPaths.find(
    (path): path is ManagedSkillPath =>
      path.kind === "skill" && path.client === client && path.name === name,
  );
}

function ownedFrontDoor(
  state: CompleteManagedAuthoringState | null,
  client: AuthoringClientId,
): ManagedFrontDoorPath | undefined {
  return state?.ownedPaths.find(
    (path): path is ManagedFrontDoorPath => path.kind === "front-door" && path.client === client,
  );
}

function validateStateShape(
  state: CompleteManagedAuthoringState | null,
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  if (state === null) return;
  const expectedCount = state.selectedClients.length * (WORKSPACE_SKILL_NAMES.length + 1);
  if (state.ownedPaths.length !== expectedCount) {
    blockers.push(
      blocker(
        "managed-state-owned-paths-incomplete",
        "managed-state",
        `managed state records ${state.ownedPaths.length} owned paths; expected ${expectedCount}`,
        "restore the last valid WPM-owned managed state before reapplying integration",
      ),
    );
  }
  const expectedOrder = state.selectedClients.flatMap((client) => [
    ...WORKSPACE_SKILL_NAMES.map((name) => `skill:${client}:${name}`),
    `front-door:${client}`,
  ]);
  const actualOrder = state.ownedPaths.map((path) =>
    path.kind === "skill" ? `skill:${path.client}:${path.name}` : `front-door:${path.client}`,
  );
  if (actualOrder.join("|") !== expectedOrder.join("|")) {
    blockers.push(
      blocker(
        "managed-state-owned-paths-order-invalid",
        "managed-state",
        "managed state owned paths are not in canonical client/family order",
        "restore the exact canonical WPM-owned managed state before reapplying integration",
      ),
    );
  }
  for (const client of state.selectedClients) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    for (const name of WORKSPACE_SKILL_NAMES) {
      const record = ownedSkill(state, client, name);
      if (
        record === undefined ||
        record.path !== expectedSkillPath(definition, name) ||
        record.version !== state.integrationVersion
      ) {
        blockers.push(
          blocker(
            "managed-state-owned-skill-invalid",
            "managed-state",
            `managed state has no coherent ${client}/${name} ownership record`,
            "restore the last valid WPM-owned managed state before reapplying integration",
          ),
        );
      }
    }
    const frontDoor = ownedFrontDoor(state, client);
    if (
      frontDoor === undefined ||
      frontDoor.path !== definition.workspaceFrontDoor ||
      frontDoor.version !== state.integrationVersion
    ) {
      blockers.push(
        blocker(
          "managed-state-front-door-invalid",
          "managed-state",
          `managed state has no coherent ${client} front-door ownership record`,
          "restore the last valid WPM-owned managed state before reapplying integration",
        ),
      );
    }
  }
}

function inspectLegacy(
  deps: WorkspaceAuthoringIntegrationDeps,
  workspaceRoot: string,
  expected: string | undefined,
  blockers: WorkspaceIntegrationBlocker[],
): boolean {
  const agentsPath = join(workspaceRoot, "AGENTS.md");
  const claudePath = join(workspaceRoot, "CLAUDE.md");
  let recognized = true;
  let agentsInspection: PathInspection = { kind: "missing" };
  let claudeInspection: PathInspection = { kind: "missing" };
  try {
    agentsInspection = deps.fs.inspectPath(agentsPath);
  } catch (error) {
    recognized = false;
    blockers.push(
      blocker(
        "legacy-front-door-unreadable",
        "ownership",
        error instanceof Error ? error.message : String(error),
        "make the exact legacy AGENTS.md path inspectable before adoption",
      ),
    );
  }
  try {
    claudeInspection = deps.fs.inspectPath(claudePath);
  } catch (error) {
    recognized = false;
    blockers.push(
      blocker(
        "legacy-front-door-alias-unreadable",
        "ownership",
        error instanceof Error ? error.message : String(error),
        "make the exact legacy CLAUDE.md path inspectable before adoption",
      ),
    );
  }
  let agentsExact = false;
  try {
    agentsExact =
      expected !== undefined &&
      agentsInspection.kind === "file" &&
      deps.fs.read(agentsPath) === expected;
  } catch {
    agentsExact = false;
  }
  if (!agentsExact) {
    recognized = false;
    blockers.push(
      blocker(
        "legacy-front-door-unrecognized",
        "ownership",
        "AGENTS.md is not the exact WPM-generated legacy installer-builder front door",
        "restore the exact legacy WPM-owned bytes or move user-authored content away before adoption",
      ),
    );
  }
  let aliasExact =
    claudeInspection.kind === "symbolic-link" &&
    portable(claudeInspection.target) === portable(agentsPath);
  if (claudeInspection.kind === "file" && expected !== undefined) {
    try {
      aliasExact = deps.fs.read(claudePath) === expected;
    } catch {
      aliasExact = false;
    }
  }
  if (!aliasExact) {
    recognized = false;
    blockers.push(
      blocker(
        "legacy-front-door-alias-unrecognized",
        "ownership",
        "CLAUDE.md is not the exact WPM-generated legacy alias to AGENTS.md",
        "restore the exact legacy WPM-owned alias or move user-authored content away before adoption",
      ),
    );
  }
  return recognized;
}

function action(
  id: string,
  path: string,
  description: string,
  perform: (fs: FileSystem) => void,
): PlannedAction {
  return { id, path: portable(path), description, perform };
}

function skillDirectoryIsExact(
  fs: FileSystem,
  directory: string,
): { exact: boolean; digest?: string } {
  if (fs.inspectPath(directory).kind !== "directory") return { exact: false };
  try {
    const entries = fs.list(directory);
    if (entries.length !== 1 || entries[0]?.name !== "SKILL.md" || entries[0]?.kind !== "file") {
      return { exact: false };
    }
    if (fs.inspectPath(join(directory, "SKILL.md")).kind !== "file") {
      return { exact: false };
    }
    return { exact: true, digest: fs.digestFile(join(directory, "SKILL.md")) };
  } catch {
    return { exact: false };
  }
}

function planSkill(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  source: SkillSource,
  previous: CompleteManagedAuthoringState | null,
  legacy: boolean,
  retrying: boolean,
  actions: PlannedAction[],
  blockers: WorkspaceIntegrationBlocker[],
): void {
  const directory = join(input.workspaceRoot, definition.workspaceSkillsDirectory, source.name);
  const inspection = deps.fs.inspectPath(directory);
  const prior = ownedSkill(previous, definition.id, source.name);
  if (inspection.kind === "missing") {
    if (prior !== undefined) {
      blockers.push(
        blocker(
          "owned-skill-missing",
          "ownership",
          `${portable(directory)} is missing despite its recorded WPM ownership`,
          "restore the recorded WPM-owned skill or recover managed state explicitly",
        ),
      );
      return;
    }
    actions.push(
      action(
        `${definition.id}:skill:${source.name}:write`,
        join(directory, "SKILL.md"),
        `install ${source.name} for ${definition.id}`,
        (fs) => fs.write(join(directory, "SKILL.md"), source.content),
      ),
    );
    return;
  }
  const actual = skillDirectoryIsExact(deps.fs, directory);
  if (!actual.exact) {
    if (
      retrying &&
      prior === undefined &&
      inspection.kind === "directory" &&
      deps.fs.list(directory).length === 0
    ) {
      actions.push(
        action(
          `${definition.id}:skill:${source.name}:write`,
          join(directory, "SKILL.md"),
          `finish ${source.name} for ${definition.id}`,
          (fs) => fs.write(join(directory, "SKILL.md"), source.content),
        ),
      );
      return;
    }
    blockers.push(
      blocker(
        "skill-destination-ambiguous",
        "destination",
        `${portable(directory)} is occupied by a non-exact skill directory`,
        "preserve or move the unowned content, then repeat the complete request",
      ),
    );
    return;
  }
  if (actual.digest === source.sha256) {
    if (retrying || prior?.sha256 === source.sha256) return;
    blockers.push(
      blocker(
        prior !== undefined ? "owned-skill-modified" : "skill-destination-unowned",
        "ownership",
        prior !== undefined
          ? `${portable(directory)} matches the requested package bytes but not its recorded prior WPM digest`
          : `${portable(directory)} contains matching package bytes but is not proven WPM-owned`,
        prior !== undefined
          ? "restore the recorded WPM-owned bytes before updating, or preserve the modification under another name"
          : legacy
            ? "move the occupied destination before strict legacy adoption"
            : "move the occupied destination before adding this client",
      ),
    );
    return;
  }
  if (prior !== undefined && actual.digest === prior.sha256) {
    actions.push(
      action(
        `${definition.id}:skill:${source.name}:update`,
        join(directory, "SKILL.md"),
        `update owned ${source.name} for ${definition.id}`,
        (fs) => fs.write(join(directory, "SKILL.md"), source.content),
      ),
    );
    return;
  }
  blockers.push(
    blocker(
      prior !== undefined ? "owned-skill-modified" : "skill-destination-unowned",
      "ownership",
      `${portable(directory)} does not match ${prior !== undefined ? "its recorded WPM digest" : "an absent destination"}`,
      prior !== undefined
        ? "restore the recorded WPM-owned bytes or preserve the modification under another name"
        : legacy
          ? "move the unowned destination before strict legacy adoption"
          : "move the unowned destination before adding this client",
    ),
  );
}

function frontDoorFile(
  fs: FileSystem,
  path: string,
): { inspection: PathInspection; text?: string } {
  const inspection = fs.inspectPath(path);
  return inspection.kind === "file" ? { inspection, text: fs.read(path) } : { inspection };
}

function frontDoorPreimage(
  current: ReturnType<typeof frontDoorFile>,
): ApplyingFrontDoorPreimage | undefined {
  if (current.inspection.kind === "missing") return { kind: "missing" };
  if (current.inspection.kind === "file" && current.text !== undefined) {
    return { kind: "file", sha256: hashTextContent(current.text) };
  }
  if (current.inspection.kind === "symbolic-link") {
    return { kind: "symbolic-link", target: current.inspection.target };
  }
  return undefined;
}

function recordFrontDoorPreimage(
  plans: ApplyingFrontDoorPlan[],
  definition: AuthoringClientDefinition,
  current: ReturnType<typeof frontDoorFile>,
  after: string | null,
): void {
  const before = frontDoorPreimage(current);
  if (before === undefined) {
    throw new Error(`cannot record ${definition.workspaceFrontDoor} preimage`);
  }
  plans.push({
    client: definition.id,
    path: definition.workspaceFrontDoor,
    before,
    after: after === null ? { kind: "missing" } : { kind: "file", sha256: hashTextContent(after) },
  });
}

function planSelectedFrontDoor(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  previous: CompleteManagedAuthoringState | null,
  legacy: boolean,
  retrying: boolean,
  legacyText: string | undefined,
  frontDoors: ApplyingFrontDoorPlan[],
  actions: PlannedAction[],
  blockers: WorkspaceIntegrationBlocker[],
): void {
  const path = join(input.workspaceRoot, definition.workspaceFrontDoor);
  const desiredBlock = renderManagedFrontDoorBlock(definition.id, input.integrationVersion);
  const current = frontDoorFile(deps.fs, path);
  const prior = ownedFrontDoor(previous, definition.id);

  if (legacy) {
    if (definition.id === "codex") {
      if (
        current.inspection.kind === "file" &&
        current.text !== undefined &&
        current.text === legacyText
      ) {
        recordFrontDoorPreimage(frontDoors, definition, current, desiredBlock);
        actions.push(
          action(
            `${definition.id}:front-door:write`,
            path,
            "replace the owned legacy front door",
            (fs) => fs.write(path, desiredBlock),
          ),
        );
        return;
      }
      if (
        retrying &&
        current.inspection.kind === "file" &&
        current.text !== undefined &&
        inspectManagedFrontDoor(current.text).kind === "present" &&
        upsertManagedFrontDoor(current.text, desiredBlock) === current.text
      ) {
        return;
      }
      blockers.push(
        blocker(
          "legacy-front-door-unrecognized",
          "ownership",
          `${portable(path)} is neither the exact legacy front door nor the exact selected managed front door`,
          "restore the last WPM-owned applying bytes, then repeat the identical request",
        ),
      );
      return;
    }
    if (
      current.inspection.kind === "symbolic-link" &&
      portable(current.inspection.target) === portable(join(input.workspaceRoot, "AGENTS.md"))
    ) {
      recordFrontDoorPreimage(frontDoors, definition, current, desiredBlock);
      actions.push(
        action(
          `${definition.id}:front-door:unlink-legacy`,
          path,
          "remove the owned legacy alias",
          (fs) => fs.remove(path),
        ),
      );
      actions.push(
        action(
          `${definition.id}:front-door:write`,
          path,
          "write the native managed front door",
          (fs) => fs.write(path, desiredBlock),
        ),
      );
      return;
    }
    if (current.inspection.kind === "file" && current.text === legacyText) {
      recordFrontDoorPreimage(frontDoors, definition, current, desiredBlock);
      actions.push(
        action(
          `${definition.id}:front-door:write`,
          path,
          "replace the exact fresh alias copy",
          (fs) => fs.write(path, desiredBlock),
        ),
      );
      return;
    }
    if (current.inspection.kind === "missing" && retrying) {
      actions.push(
        action(
          `${definition.id}:front-door:write`,
          path,
          "finish the native managed front door",
          (fs) => fs.write(path, desiredBlock),
        ),
      );
      return;
    }
    if (
      retrying &&
      current.inspection.kind === "file" &&
      current.text !== undefined &&
      inspectManagedFrontDoor(current.text).kind === "present" &&
      upsertManagedFrontDoor(current.text, desiredBlock) === current.text
    ) {
      return;
    }
    blockers.push(
      blocker(
        "legacy-front-door-alias-unrecognized",
        "ownership",
        `${portable(path)} is neither the exact legacy alias nor the exact selected managed front door`,
        "restore the last WPM-owned applying bytes, then repeat the identical request",
      ),
    );
    return;
  }

  if (current.inspection.kind === "missing") {
    if (prior !== undefined) {
      blockers.push(
        blocker(
          "owned-front-door-missing",
          "ownership",
          `${portable(path)} is missing despite its recorded WPM-owned block`,
          "restore the recorded front door or recover managed state explicitly",
        ),
      );
      return;
    }
    actions.push(
      action(
        `${definition.id}:front-door:write`,
        path,
        "write the native managed front door",
        (fs) => fs.write(path, desiredBlock),
      ),
    );
    recordFrontDoorPreimage(frontDoors, definition, current, desiredBlock);
    return;
  }
  if (current.inspection.kind !== "file" || current.text === undefined) {
    blockers.push(
      blocker(
        "front-door-destination-ambiguous",
        "destination",
        `${portable(path)} is ${current.inspection.kind}, not a preservable regular file`,
        "move or restore the conflicting front door after establishing its ownership",
      ),
    );
    return;
  }
  const managed = inspectManagedFrontDoor(current.text);
  if (managed.kind === "ambiguous") {
    blockers.push(
      blocker(
        "front-door-markers-ambiguous",
        "ownership",
        `${portable(path)}: ${managed.reason}`,
        "restore one exact WPM-owned managed block before reapplying integration",
      ),
    );
    return;
  }
  if (managed.kind === "present") {
    const expectedPrior =
      prior === undefined ? undefined : renderManagedFrontDoorBlock(definition.id, prior.version);
    if (
      (prior === undefined && !retrying) ||
      (retrying
        ? managed.block !== desiredBlock && managed.block !== expectedPrior
        : managed.block !== expectedPrior)
    ) {
      blockers.push(
        blocker(
          prior !== undefined ? "owned-front-door-modified" : "front-door-block-unowned",
          "ownership",
          `${portable(path)} contains a managed marker block not proven by state`,
          "restore the recorded WPM-owned block or preserve the modification outside the managed markers",
        ),
      );
      return;
    }
    const desired = `${managed.before}${desiredBlock}${managed.after}`;
    recordFrontDoorPreimage(frontDoors, definition, current, desired);
    if (desired !== current.text) {
      actions.push(
        action(
          `${definition.id}:front-door:update`,
          path,
          "update only the owned front-door block",
          (fs) => fs.write(path, desired),
        ),
      );
    }
    return;
  }
  if (prior !== undefined) {
    blockers.push(
      blocker(
        "owned-front-door-missing",
        "ownership",
        `${portable(path)} no longer contains its recorded WPM-owned block`,
        "restore the recorded block or preserve user content and recover managed state explicitly",
      ),
    );
    return;
  }
  const desired = upsertManagedFrontDoor(current.text, desiredBlock);
  recordFrontDoorPreimage(frontDoors, definition, current, desired);
  actions.push(
    action(
      `${definition.id}:front-door:append`,
      path,
      "append one managed block beside user content",
      (fs) => fs.write(path, desired),
    ),
  );
}

function planRetiredClient(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  previous: CompleteManagedAuthoringState,
  retrying: boolean,
  frontDoors: ApplyingFrontDoorPlan[],
  actions: PlannedAction[],
  blockers: WorkspaceIntegrationBlocker[],
): void {
  for (const name of WORKSPACE_SKILL_NAMES) {
    const prior = ownedSkill(previous, definition.id, name);
    if (prior === undefined) continue;
    const directory = join(input.workspaceRoot, prior.path);
    try {
      const inspection = deps.fs.inspectPath(directory);
      if (retrying && inspection.kind === "missing") continue;
      if (retrying && inspection.kind === "directory" && deps.fs.list(directory).length === 0) {
        actions.push(
          action(
            `${definition.id}:skill:${name}:remove`,
            directory,
            `finish retiring partially removed owned ${name}`,
            (fs) => fs.remove(directory),
          ),
        );
        continue;
      }
      const actual = skillDirectoryIsExact(deps.fs, directory);
      if (!actual.exact || actual.digest !== prior.sha256) {
        blockers.push(
          blocker(
            "owned-skill-modified",
            "ownership",
            `${portable(directory)} cannot be safely retired because its recorded bytes changed`,
            "restore the recorded WPM-owned bytes or keep this client selected",
          ),
        );
        continue;
      }
      actions.push(
        action(`${definition.id}:skill:${name}:remove`, directory, `retire owned ${name}`, (fs) =>
          fs.remove(directory),
        ),
      );
    } catch (error) {
      blockers.push(
        blocker(
          "retired-skill-unreadable",
          "ownership",
          `${portable(directory)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the recorded retired skill inspectable before repeating the request",
        ),
      );
    }
  }
  if (retrying) return;
  const priorFrontDoor = ownedFrontDoor(previous, definition.id);
  if (priorFrontDoor === undefined) return;
  const path = join(input.workspaceRoot, priorFrontDoor.path);
  let current: ReturnType<typeof frontDoorFile>;
  try {
    current = frontDoorFile(deps.fs, path);
  } catch (error) {
    blockers.push(
      blocker(
        "retired-front-door-unreadable",
        "ownership",
        `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "make the recorded retired front door inspectable before repeating the request",
      ),
    );
    return;
  }
  if (current.inspection.kind !== "file" || current.text === undefined) {
    blockers.push(
      blocker(
        "owned-front-door-modified",
        "ownership",
        `${portable(path)} cannot be safely retired because it is ${current.inspection.kind}`,
        "restore the recorded WPM-owned front door or keep this client selected",
      ),
    );
    return;
  }
  const managed = inspectManagedFrontDoor(current.text);
  const expected = renderManagedFrontDoorBlock(definition.id, priorFrontDoor.version);
  if (managed.kind !== "present" || managed.block !== expected) {
    blockers.push(
      blocker(
        "owned-front-door-modified",
        "ownership",
        `${portable(path)} managed block changed and cannot be safely retired`,
        "restore the recorded WPM-owned block or keep this client selected",
      ),
    );
    return;
  }
  const desired = removeManagedFrontDoor(current.text);
  recordFrontDoorPreimage(frontDoors, definition, current, desired.length === 0 ? null : desired);
  actions.push(
    action(
      `${definition.id}:front-door:remove`,
      path,
      "remove only the retired managed block",
      (fs) => {
        if (desired.length === 0) fs.remove(path);
        else fs.write(path, desired);
      },
    ),
  );
}

function planLegacyRetirement(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  clients: readonly AuthoringClientId[],
  legacyText: string | undefined,
  frontDoors: ApplyingFrontDoorPlan[],
  actions: PlannedAction[],
  blockers: WorkspaceIntegrationBlocker[],
): void {
  if (!clients.includes("codex")) {
    const path = join(input.workspaceRoot, "AGENTS.md");
    try {
      const current = frontDoorFile(deps.fs, path);
      if (
        current.inspection.kind === "file" &&
        current.text !== undefined &&
        current.text === legacyText
      ) {
        frontDoors.push({
          client: "codex",
          path: "AGENTS.md",
          before: { kind: "file", sha256: hashTextContent(current.text) },
          after: { kind: "missing" },
        });
        actions.push(
          action("legacy:front-door:AGENTS.md:remove", path, "retire legacy AGENTS.md", (fs) =>
            fs.remove(path),
          ),
        );
      } else {
        blockers.push(
          blocker(
            "legacy-front-door-unrecognized",
            "ownership",
            `${portable(path)} is no longer the exact legacy WPM-owned front door`,
            "restore the exact legacy bytes or preserve the replacement before repeating the request",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        blocker(
          "legacy-front-door-retirement-unreadable",
          "ownership",
          `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact legacy AGENTS.md path inspectable before repeating the request",
        ),
      );
    }
  }
  if (!clients.includes("claude-code")) {
    const path = join(input.workspaceRoot, "CLAUDE.md");
    try {
      const current = frontDoorFile(deps.fs, path);
      const exactAlias =
        current.inspection.kind === "symbolic-link" &&
        portable(current.inspection.target) === portable(join(input.workspaceRoot, "AGENTS.md"));
      const exactCreatedCopy = current.inspection.kind === "file" && current.text === legacyText;
      if (exactAlias || exactCreatedCopy) {
        const before = frontDoorPreimage(current);
        if (before === undefined) throw new Error("cannot record legacy CLAUDE.md preimage");
        frontDoors.push({
          client: "claude-code",
          path: "CLAUDE.md",
          before,
          after: { kind: "missing" },
        });
        actions.push(
          action(
            "legacy:front-door:CLAUDE.md:remove",
            path,
            "retire legacy CLAUDE.md alias",
            (fs) => fs.remove(path),
          ),
        );
      } else {
        blockers.push(
          blocker(
            "legacy-front-door-alias-unrecognized",
            "ownership",
            `${portable(path)} is no longer the exact legacy WPM-owned alias`,
            "restore the exact legacy alias or preserve the replacement before repeating the request",
          ),
        );
      }
    } catch (error) {
      blockers.push(
        blocker(
          "legacy-front-door-alias-retirement-unreadable",
          "ownership",
          `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact legacy CLAUDE.md path inspectable before repeating the request",
        ),
      );
    }
  }
}

function frontDoorMatchesPreimage(
  current: ReturnType<typeof frontDoorFile>,
  expected: ApplyingFrontDoorPreimage,
): boolean {
  if (expected.kind === "missing") return current.inspection.kind === "missing";
  if (expected.kind === "file") {
    return (
      current.inspection.kind === "file" &&
      current.text !== undefined &&
      hashTextContent(current.text) === expected.sha256
    );
  }
  return (
    current.inspection.kind === "symbolic-link" &&
    portable(current.inspection.target) === portable(expected.target)
  );
}

function frontDoorMatchesOutput(
  current: ReturnType<typeof frontDoorFile>,
  expected: ApplyingFrontDoorResult,
): boolean {
  return expected.kind === "missing"
    ? current.inspection.kind === "missing"
    : current.inspection.kind === "file" &&
        current.text !== undefined &&
        hashTextContent(current.text) === expected.sha256;
}

function frontDoorResult(content: string | null): ApplyingFrontDoorResult {
  return content === null
    ? { kind: "missing" }
    : { kind: "file", sha256: hashTextContent(content) };
}

function frontDoorPreimageShapeIsValid(
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  clients: readonly AuthoringClientId[],
  previous: CompleteManagedAuthoringState | null,
  legacy: boolean,
  before: ApplyingFrontDoorPreimage,
): boolean {
  const selected = clients.includes(definition.id);
  if (legacy) {
    return definition.id === "codex"
      ? before.kind === "file"
      : (before.kind === "symbolic-link" &&
          portable(before.target) === portable(join(input.workspaceRoot, "AGENTS.md"))) ||
          before.kind === "file";
  }
  const prior = ownedFrontDoor(previous, definition.id);
  return selected
    ? prior === undefined
      ? before.kind === "missing" || before.kind === "file"
      : before.kind === "file"
    : prior !== undefined && before.kind === "file";
}

function deriveFrontDoorOutputFromPreimage(
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  clients: readonly AuthoringClientId[],
  previous: CompleteManagedAuthoringState | null,
  legacy: boolean,
  legacyText: string | undefined,
  current: ReturnType<typeof frontDoorFile>,
): string | null | undefined {
  const selected = clients.includes(definition.id);
  if (legacy) {
    if (legacyText === undefined) return undefined;
    const exactLegacy =
      definition.id === "codex"
        ? current.inspection.kind === "file" && current.text === legacyText
        : (current.inspection.kind === "symbolic-link" &&
            portable(current.inspection.target) ===
              portable(join(input.workspaceRoot, "AGENTS.md"))) ||
          (current.inspection.kind === "file" && current.text === legacyText);
    if (!exactLegacy) return undefined;
    return selected ? renderManagedFrontDoorBlock(definition.id, input.integrationVersion) : null;
  }

  const prior = ownedFrontDoor(previous, definition.id);
  if (selected) {
    if (current.inspection.kind === "missing" && prior === undefined) {
      return renderManagedFrontDoorBlock(definition.id, input.integrationVersion);
    }
    if (current.inspection.kind !== "file" || current.text === undefined) return undefined;
    const managed = inspectManagedFrontDoor(current.text);
    if (prior === undefined) {
      if (managed.kind !== "absent") return undefined;
    } else if (
      managed.kind !== "present" ||
      managed.block !== renderManagedFrontDoorBlock(definition.id, prior.version)
    ) {
      return undefined;
    }
    return upsertManagedFrontDoor(
      current.text,
      renderManagedFrontDoorBlock(definition.id, input.integrationVersion),
    );
  }

  if (prior === undefined || current.inspection.kind !== "file" || current.text === undefined) {
    return undefined;
  }
  const managed = inspectManagedFrontDoor(current.text);
  if (
    managed.kind !== "present" ||
    managed.block !== renderManagedFrontDoorBlock(definition.id, prior.version)
  ) {
    return undefined;
  }
  const remaining = removeManagedFrontDoor(current.text);
  return remaining.length === 0 ? null : remaining;
}

function completedFrontDoorIsCoherent(
  definition: AuthoringClientDefinition,
  clients: readonly AuthoringClientId[],
  input: WorkspaceAuthoringIntegrationInput,
  legacy: boolean,
  current: ReturnType<typeof frontDoorFile>,
): boolean {
  if (current.inspection.kind === "missing") return !clients.includes(definition.id);
  if (current.inspection.kind !== "file" || current.text === undefined) return false;
  const managed = inspectManagedFrontDoor(current.text);
  return clients.includes(definition.id)
    ? managed.kind === "present" &&
        managed.block === renderManagedFrontDoorBlock(definition.id, input.integrationVersion)
    : !legacy && managed.kind === "absent";
}

function planApplyingFrontDoors(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  clients: readonly AuthoringClientId[],
  previous: CompleteManagedAuthoringState | null,
  legacy: boolean,
  legacyText: string | undefined,
  plans: readonly ApplyingFrontDoorPlan[],
  actions: PlannedAction[],
  blockers: WorkspaceIntegrationBlocker[],
): void {
  const touched = new Set<AuthoringClientId>([
    ...clients,
    ...(legacy ? [...definitions.keys()] : (previous?.selectedClients ?? [])),
  ]);
  const expectedDefinitions = [...definitions.values()].filter(({ id }) => touched.has(id));
  if (
    plans.length !== expectedDefinitions.length ||
    plans.some(
      (plan, index) =>
        plan.client !== expectedDefinitions[index]?.id ||
        plan.path !== expectedDefinitions[index]?.workspaceFrontDoor,
    )
  ) {
    blockers.push(
      blocker(
        "partial-state-front-doors-mismatch",
        "managed-state",
        "the applying state's front-door preimages do not cover the exact planned native paths",
        "restore the exact WPM-generated applying record before retrying",
      ),
    );
    return;
  }

  for (const [index, definition] of expectedDefinitions.entries()) {
    const plan = plans[index] as ApplyingFrontDoorPlan;
    if (!frontDoorPreimageShapeIsValid(input, definition, clients, previous, legacy, plan.before)) {
      blockers.push(
        blocker(
          "partial-state-front-door-preimage-invalid",
          "managed-state",
          `${definition.workspaceFrontDoor} preimage is incoherent with the exact prior/request`,
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
      continue;
    }
    const path = join(input.workspaceRoot, definition.workspaceFrontDoor);
    let current: ReturnType<typeof frontDoorFile>;
    try {
      current = frontDoorFile(deps.fs, path);
    } catch (error) {
      blockers.push(
        blocker(
          "partial-front-door-unreadable",
          "destination",
          `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact planned front door inspectable before retrying",
        ),
      );
      continue;
    }
    if (frontDoorMatchesOutput(current, plan.after)) {
      if (completedFrontDoorIsCoherent(definition, clients, input, legacy, current)) continue;
      blockers.push(
        blocker(
          "partial-state-front-door-result-invalid",
          "managed-state",
          `${definition.workspaceFrontDoor} planned result is incoherent with the exact request`,
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
      continue;
    }

    const selectedLegacyAlias =
      legacy &&
      clients.includes(definition.id) &&
      plan.before.kind === "symbolic-link" &&
      plan.after.kind === "file";
    let desired: string | null | undefined;
    if (frontDoorMatchesPreimage(current, plan.before)) {
      desired = deriveFrontDoorOutputFromPreimage(
        input,
        definition,
        clients,
        previous,
        legacy,
        legacyText,
        current,
      );
      if (selectedLegacyAlias) {
        actions.push(
          action(
            `${definition.id}:front-door:unlink-legacy`,
            path,
            "remove the owned legacy alias",
            (fs) => fs.remove(path),
          ),
        );
      }
    } else if (selectedLegacyAlias && current.inspection.kind === "missing") {
      desired = renderManagedFrontDoorBlock(definition.id, input.integrationVersion);
    } else {
      blockers.push(
        blocker(
          "partial-front-door-conflict",
          "ownership",
          `${portable(path)} matches neither its exact planned preimage nor its exact planned result`,
          "preserve the changed user content and restore the exact partial-operation bytes before retrying",
        ),
      );
      continue;
    }
    if (
      desired === undefined ||
      JSON.stringify(frontDoorResult(desired)) !== JSON.stringify(plan.after)
    ) {
      blockers.push(
        blocker(
          "partial-state-front-door-result-invalid",
          "managed-state",
          `${definition.workspaceFrontDoor} planned fingerprint does not match its authorized transformation`,
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
      continue;
    }
    actions.push(
      action(
        `${definition.id}:front-door:retry`,
        path,
        "finish the exact planned native front door",
        (fs) => {
          if (desired === null) fs.remove(path);
          else fs.write(path, desired);
        },
      ),
    );
  }
}

function inspectSelectedClientAncestors(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  let current = input.workspaceRoot;
  for (const segment of definition.workspaceSkillsDirectory.split("/")) {
    current = join(current, segment);
    try {
      const inspection = deps.fs.inspectPath(current);
      if (inspection.kind === "missing") return;
      if (inspection.kind === "directory") continue;
      blockers.push(
        blocker(
          "workspace-skill-ancestor-ambiguous",
          "destination",
          `${portable(current)} is ${inspection.kind}, not a real workspace directory`,
          "replace the selected client's aliased/conflicting ancestor with a real workspace directory",
        ),
      );
      return;
    } catch (error) {
      blockers.push(
        blocker(
          "workspace-skill-ancestor-unreadable",
          "destination",
          `${portable(current)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the selected native workspace scope inspectable, then repeat the request",
        ),
      );
      return;
    }
  }
}

function inspectUnselectedOrphans(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
  definition: AuthoringClientDefinition,
  allowRecognizedLegacyAlias: boolean,
  blockers: WorkspaceIntegrationBlocker[],
): void {
  let scope = input.workspaceRoot;
  let scopeDirectory = true;
  for (const segment of definition.workspaceSkillsDirectory.split("/")) {
    scope = join(scope, segment);
    try {
      const inspection = deps.fs.inspectPath(scope);
      if (inspection.kind === "missing" || inspection.kind === "file") {
        scopeDirectory = false;
        break;
      }
      if (inspection.kind !== "directory") {
        blockers.push(
          blocker(
            "unselected-skill-ancestor-ambiguous",
            "ownership",
            `${portable(scope)} is ${inspection.kind}, so absence of an unselected WPM scope cannot be proven`,
            "replace the unselected client's aliased/special ancestor with a real workspace directory or remove it after establishing ownership",
          ),
        );
        scopeDirectory = false;
        break;
      }
    } catch (error) {
      blockers.push(
        blocker(
          "unselected-skill-ancestor-unreadable",
          "ownership",
          `${portable(scope)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the unselected native scope inspectable before proving it contains no WPM integration",
        ),
      );
      scopeDirectory = false;
      break;
    }
  }
  for (const name of scopeDirectory ? WORKSPACE_SKILL_NAMES : []) {
    const path = join(scope, name);
    try {
      const inspection = deps.fs.inspectPath(path);
      if (inspection.kind === "missing") continue;
      blockers.push(
        blocker(
          "unselected-skill-orphan",
          "ownership",
          `${portable(path)} exists for an unselected client without recorded WPM ownership`,
          "preserve or remove the orphan only after establishing ownership, then repeat the request",
        ),
      );
    } catch (error) {
      blockers.push(
        blocker(
          "unselected-skill-unreadable",
          "ownership",
          `${portable(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          "make the unselected native path inspectable before proving it has no orphan integration",
        ),
      );
    }
  }

  const frontDoor = join(input.workspaceRoot, definition.workspaceFrontDoor);
  try {
    const inspection = deps.fs.inspectPath(frontDoor);
    if (inspection.kind === "missing" || inspection.kind === "directory") return;
    if (inspection.kind === "symbolic-link") {
      if (
        allowRecognizedLegacyAlias &&
        definition.id === "claude-code" &&
        portable(inspection.target) === portable(join(input.workspaceRoot, "AGENTS.md"))
      ) {
        return;
      }
      blockers.push(
        blocker(
          "unselected-front-door-ambiguous",
          "ownership",
          `${portable(frontDoor)} is an alias, so the unselected client may still receive workspace instructions`,
          "remove the alias only after establishing ownership, or explicitly select that client",
        ),
      );
      return;
    }
    if (inspection.kind !== "file") {
      blockers.push(
        blocker(
          "unselected-front-door-ambiguous",
          "ownership",
          `${portable(frontDoor)} is ${inspection.kind}, so absence of an unselected WPM front door cannot be proven`,
          "replace the special path only after establishing ownership, then repeat the request",
        ),
      );
      return;
    }
    const managed = inspectManagedFrontDoor(deps.fs.read(frontDoor));
    if (managed.kind === "absent") return;
    blockers.push(
      blocker(
        "unselected-front-door-orphan",
        "ownership",
        `${portable(frontDoor)} contains ${managed.kind === "ambiguous" ? "ambiguous WPM markers" : "an unowned WPM managed block"} for an unselected client`,
        "restore or remove the orphaned managed block only after establishing ownership",
      ),
    );
  } catch (error) {
    blockers.push(
      blocker(
        "unselected-front-door-unreadable",
        "ownership",
        `${portable(frontDoor)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "make the unselected front door readable before proving it has no orphan integration",
      ),
    );
  }
}

/** Complete side-effect-free preflight and deterministic operation-specific plan. */
function planIntegration(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
): IntegrationPlan {
  const blockers: WorkspaceIntegrationBlocker[] = [];
  const normalized = normalizeWorkspaceAuthoringClients(input.clientIds);
  blockers.push(...normalized.blockers);
  inspectIntegrationVersion(input.integrationVersion, blockers);
  const definitions = definitionMap();
  const sources = inspectSkillSources(deps, blockers);
  const projectName = inspectWorkspaceAndBacklog(deps, input.workspaceRoot, blockers);
  const stateObservation = inspectCurrentState(deps, input, normalized.clients, blockers);

  const currentState = stateObservation.state;
  let previousState: CompleteManagedAuthoringState | null = null;
  let legacy = false;
  const retrying = currentState?.status === "applying";
  let origin: WorkspaceIntegrationOrigin = "legacy-adopted";
  if (currentState?.status === "complete") {
    previousState = currentState;
    origin = currentState.origin;
  } else if (currentState?.status === "applying") {
    previousState = currentState.pending.previous;
    legacy = currentState.pending.legacy;
    origin = currentState.origin;
  } else if (currentState === undefined && stateObservation.text === undefined) {
    legacy = true;
  }
  validateStateShape(previousState, definitions, blockers);
  if (currentState?.status === "applying") {
    if (currentState.pending.legacy && previousState !== null) {
      blockers.push(
        blocker(
          "partial-state-legacy-previous-conflict",
          "managed-state",
          "an applying legacy request cannot also claim a previous complete managed state",
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
    }
    if (
      !currentState.pending.legacy &&
      previousState === null &&
      currentState.origin !== "created"
    ) {
      blockers.push(
        blocker(
          "partial-state-origin-invalid",
          "managed-state",
          "a no-previous, non-legacy applying state is valid only for fresh created integration",
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
    }
    if (
      previousState !== null &&
      (previousState.workspaceRoot !== currentState.workspaceRoot ||
        previousState.origin !== currentState.origin)
    ) {
      blockers.push(
        blocker(
          "partial-state-previous-mismatch",
          "managed-state",
          "the applying state's previous ownership belongs to another root or origin",
          "restore the exact prior and applying WPM state pair before retrying",
        ),
      );
    }
    const expectedReconciliation = reconciliationFor(
      previousState,
      normalized.clients,
      input.integrationVersion,
    );
    if (JSON.stringify(currentState.reconciliation) !== JSON.stringify(expectedReconciliation)) {
      blockers.push(
        blocker(
          "partial-state-reconciliation-mismatch",
          "managed-state",
          "the applying state's reconciliation facts do not match its exact prior/request",
          "restore the exact WPM-generated applying record before retrying",
        ),
      );
    }
  }

  const clientsTouchedByPlan = new Set<AuthoringClientId>([
    ...normalized.clients,
    ...(previousState?.selectedClients ?? []),
  ]);
  for (const definition of definitions.values()) {
    if (clientsTouchedByPlan.has(definition.id)) {
      inspectSelectedClientAncestors(deps, input, definition, blockers);
    } else {
      inspectUnselectedOrphans(deps, input, definition, legacy, blockers);
    }
  }

  const legacyText =
    legacy && projectName !== undefined
      ? renderExpectedLegacyFrontDoor(deps, projectName, blockers)
      : undefined;
  if (legacy && currentState === undefined) {
    inspectLegacy(deps, input.workspaceRoot, legacyText, blockers);
  }

  const actions: PlannedAction[] = [];
  const frontDoors: ApplyingFrontDoorPlan[] =
    currentState?.status === "applying" ? [...currentState.pending.frontDoors] : [];
  for (const client of normalized.clients) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    for (const name of WORKSPACE_SKILL_NAMES) {
      const source = sources.get(name);
      if (source !== undefined) {
        try {
          planSkill(
            deps,
            input,
            definition,
            source,
            previousState,
            legacy,
            retrying,
            actions,
            blockers,
          );
        } catch (error) {
          blockers.push(
            blocker(
              "skill-destination-unreadable",
              "destination",
              `${definition.id}/${name}: ${error instanceof Error ? error.message : String(error)}`,
              "make the exact selected skill destination inspectable, then repeat the request",
            ),
          );
        }
      }
    }
    if (!retrying) {
      try {
        planSelectedFrontDoor(
          deps,
          input,
          definition,
          previousState,
          legacy,
          retrying,
          legacyText,
          frontDoors,
          actions,
          blockers,
        );
      } catch (error) {
        blockers.push(
          blocker(
            "front-door-unreadable",
            "destination",
            `${definition.workspaceFrontDoor}: ${error instanceof Error ? error.message : String(error)}`,
            "make the selected native front door inspectable, then repeat the request",
          ),
        );
      }
    }
  }
  if (previousState !== null) {
    for (const retired of previousState.selectedClients.filter(
      (client) => !normalized.clients.includes(client),
    )) {
      try {
        planRetiredClient(
          deps,
          input,
          definitions.get(retired) as AuthoringClientDefinition,
          previousState,
          retrying,
          frontDoors,
          actions,
          blockers,
        );
      } catch (error) {
        blockers.push(
          blocker(
            "retired-client-path-unreadable",
            "ownership",
            `${retired}: ${error instanceof Error ? error.message : String(error)}`,
            "make every recorded retired-client path inspectable, then repeat the request",
          ),
        );
      }
    }
  } else if (legacy && !retrying) {
    try {
      planLegacyRetirement(
        deps,
        input,
        normalized.clients,
        legacyText,
        frontDoors,
        actions,
        blockers,
      );
    } catch (error) {
      blockers.push(
        blocker(
          "legacy-front-door-retirement-unreadable",
          "ownership",
          error instanceof Error ? error.message : String(error),
          "make every exact legacy front-door path inspectable before repeating the request",
        ),
      );
    }
  }
  if (retrying) {
    planApplyingFrontDoors(
      deps,
      input,
      definitions,
      normalized.clients,
      previousState,
      legacy,
      legacyText,
      frontDoors,
      actions,
      blockers,
    );
  }

  const ownedPaths =
    sources.size === WORKSPACE_SKILL_NAMES.length
      ? expectedOwnedPaths(normalized.clients, definitions, sources, input.integrationVersion)
      : [];
  if (
    currentState?.status === "applying" &&
    JSON.stringify(currentState.ownedPaths) !== JSON.stringify(ownedPaths)
  ) {
    blockers.push(
      blocker(
        "partial-state-owned-paths-mismatch",
        "managed-state",
        "the applying state's owned paths do not match the exact selected package request",
        "restore the exact applying record before retrying the identical request",
      ),
    );
  }
  const frontDoorOrder = [...definitions.keys()];
  frontDoors.sort(
    (left, right) => frontDoorOrder.indexOf(left.client) - frontDoorOrder.indexOf(right.client),
  );

  if (blockers.length > 0) {
    throw new WorkspaceIntegrationPreflightError(blockers);
  }
  const reconciliation = reconciliationFor(
    previousState,
    normalized.clients,
    input.integrationVersion,
  );
  const completeState: CompleteManagedAuthoringState = {
    schemaVersion: 1,
    status: "complete",
    workspaceRoot: portable(input.workspaceRoot),
    integrationVersion: input.integrationVersion,
    selectedClients: normalized.clients,
    origin,
    reconciliation,
    ownedPaths,
  };
  const applyingState: ApplyingManagedAuthoringState = {
    ...completeState,
    status: "applying",
    pending: {
      requestKey: workspaceIntegrationRequestKey(normalized.clients, input.integrationVersion),
      previous: previousState,
      legacy,
      frontDoors,
    },
  };

  const statePath = join(input.workspaceRoot, WORKSPACE_INTEGRATION_STATE_PATH);
  const currentStateText = stateObservation.text;
  const applyingText = serializeManagedAuthoringState(applyingState);
  const completeText = serializeManagedAuthoringState(completeState);
  const mutationActions = [...actions];
  const alreadyComplete =
    currentState?.status === "complete" &&
    currentStateText === completeText &&
    mutationActions.length === 0;
  if (!alreadyComplete && currentStateText !== applyingText) {
    mutationActions.unshift(
      action(
        "managed-state:applying",
        statePath,
        "record the exact authorized applying state",
        (fs) => fs.write(statePath, applyingText),
      ),
    );
  }
  if (!alreadyComplete && currentStateText !== completeText) {
    mutationActions.push(
      action(
        "managed-state:complete",
        statePath,
        "publish the complete managed-state handshake",
        (fs) => fs.write(statePath, completeText),
      ),
    );
  }

  return {
    snapshot: {
      clients: normalized.clients,
      definitions,
      sources,
      currentState,
      currentStateText,
      previousState,
      legacy,
      origin,
    },
    applyingState,
    completeState,
    actions: mutationActions,
  };
}

function executePlan(fs: FileSystem, plan: IntegrationPlan): string[] {
  const completed: MutationBoundary[] = [];
  const changed: string[] = [];
  for (let index = 0; index < plan.actions.length; index += 1) {
    const planned = plan.actions[index] as PlannedAction;
    try {
      planned.perform(fs);
      const evidence: MutationBoundary = {
        id: planned.id,
        description: planned.description,
        ...(planned.path !== undefined ? { path: planned.path } : {}),
      };
      completed.push(evidence);
      if (planned.path !== undefined && !changed.includes(planned.path)) changed.push(planned.path);
    } catch (cause) {
      const unattempted = plan.actions.slice(index + 1).map(({ id, path, description }) => ({
        id,
        description,
        ...(path !== undefined ? { path } : {}),
      }));
      throw new MutationFailure({
        operation: "workspace authoring integration",
        failedBeat: "APPLY",
        completed,
        failed: {
          id: planned.id,
          description: planned.description,
          ...(planned.path !== undefined ? { path: planned.path } : {}),
        },
        unattempted,
        recovery:
          "make the failed boundary writable/recoverable, then repeat the identical selected-client and WPM-version request; completed WPM-owned bytes will be verified and preserved",
        cause,
      });
    }
  }
  return changed;
}

/**
 * Apply or reapply selected workspace authoring integration after one complete no-write preflight.
 *
 * @throws {WorkspaceIntegrationPreflightError} for aggregated predictable blockers before mutation.
 * @throws {MutationFailure} for typed progress when an unforeseen planned effect fails.
 */
export function integrateWorkspaceAuthoring(
  deps: WorkspaceAuthoringIntegrationDeps,
  input: WorkspaceAuthoringIntegrationInput,
): WorkspaceAuthoringIntegrationResult {
  const plan = planIntegration(deps, input);
  const changedPaths = executePlan(deps.fs, plan);
  return {
    summary:
      changedPaths.length === 0
        ? `workspace authoring integration is already current at ${input.integrationVersion}`
        : `workspace authoring integration applied for ${plan.snapshot.clients.join(", ")}`,
    selectedClients: plan.snapshot.clients,
    integrationVersion: input.integrationVersion,
    origin: plan.snapshot.origin,
    statePath: WORKSPACE_INTEGRATION_STATE_PATH,
    changedPaths,
    handoffPrepared: false,
  };
}

/**
 * Side-effect-free source/selection snapshot used by fresh init before the workspace target exists. The caller
 * combines these captured bytes with its complete template/task/destination plan, then binds the applying state
 * to that whole immutable plan before any target write.
 */
export function planFreshWorkspaceAuthoringIntegration(
  deps: Pick<WorkspaceAuthoringIntegrationDeps, "fs" | "backlog" | "bundledSkillsRoot">,
  input: WorkspaceAuthoringIntegrationInput,
): FreshWorkspaceAuthoringPlanSeed {
  const normalized = normalizeWorkspaceAuthoringClients(input.clientIds);
  const blockers: WorkspaceIntegrationBlocker[] = [...normalized.blockers];
  inspectIntegrationVersion(input.integrationVersion, blockers);
  const sources = inspectSkillSources(
    { ...deps, builtinTemplatesRoot: "" } as WorkspaceAuthoringIntegrationDeps,
    blockers,
  );
  try {
    const availability = deps.backlog.inspectAvailability();
    if (!availability.available) {
      blockers.push(
        blocker(
          "backlog-unavailable",
          "backlog",
          `Backlog.md is unavailable: ${availability.reason}`,
          "install or repair Backlog.md, then repeat the complete request",
        ),
      );
    }
  } catch (error) {
    blockers.push(
      blocker(
        "backlog-unavailable",
        "backlog",
        `Backlog.md availability could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "install or repair Backlog.md, then repeat the complete request",
      ),
    );
  }
  if (blockers.length > 0) throw new WorkspaceIntegrationPreflightError(blockers);

  const definitions = definitionMap();
  const ownedPaths = expectedOwnedPaths(
    normalized.clients,
    definitions,
    sources,
    input.integrationVersion,
  );
  const reconciliation = {
    strategy: "exact-owned-content" as const,
    previousVersion: null,
    previousClients: [] as const,
  };
  const completeState: CompleteManagedAuthoringState = {
    schemaVersion: 1,
    status: "complete",
    workspaceRoot: portable(input.workspaceRoot),
    integrationVersion: input.integrationVersion,
    selectedClients: normalized.clients,
    origin: "created",
    reconciliation,
    ownedPaths,
  };
  const frontDoors: ApplyingFrontDoorPlan[] = normalized.clients.map((client) => {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    return {
      client,
      path: definition.workspaceFrontDoor,
      before: { kind: "missing" },
      after: {
        kind: "file",
        sha256: hashTextContent(renderManagedFrontDoorBlock(client, input.integrationVersion)),
      },
    };
  });
  const files: FreshWorkspaceAuthoringFile[] = [];
  for (const client of normalized.clients) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    for (const name of WORKSPACE_SKILL_NAMES) {
      const source = sources.get(name) as SkillSource;
      files.push({
        client,
        path: portable(join(definition.workspaceSkillsDirectory, name, "SKILL.md")),
        content: source.content,
      });
    }
    files.push({
      client,
      path: definition.workspaceFrontDoor,
      content: renderManagedFrontDoorBlock(client, input.integrationVersion),
    });
  }
  return {
    clients: normalized.clients,
    integrationVersion: input.integrationVersion,
    files,
    completeState,
    completeStateText: serializeManagedAuthoringState(completeState),
    applyingFrontDoors: frontDoors,
  };
}

/** Bind a fresh integration snapshot to the immutable whole-init request that will execute it. */
export function authorizeFreshWorkspaceAuthoringPlan(
  seed: FreshWorkspaceAuthoringPlanSeed,
  pendingRequestKey: string,
): FreshWorkspaceAuthoringPlan {
  const applyingState: ApplyingManagedAuthoringState = {
    ...seed.completeState,
    status: "applying",
    pending: {
      requestKey: pendingRequestKey,
      previous: null,
      legacy: false,
      frontDoors: seed.applyingFrontDoors,
    },
  };
  return {
    ...seed,
    applyingState,
    applyingStateText: serializeManagedAuthoringState(applyingState),
  };
}
