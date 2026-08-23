import { join } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import {
  type HandoffBlocker,
  type HandoffClientValidity,
  HandoffPreparationPreflightError,
  HandoffVerificationError,
  type MutationBoundary,
  MutationFailure,
} from "../errors.js";
import { AUTHORING_TASK_PREFIX, type OperationResult } from "../model/index.js";
import type { BacklogMd, FileSystem } from "../ports/index.js";
import {
  AUTHORING_CLIENT_IDS,
  type AuthoringClientDefinition,
  type AuthoringClientId,
  authoringClientFirstSkillInvocation,
  evaluateAuthoringClientId,
  listAuthoringClientDefinitions,
} from "../services/authoring-clients.js";
import { WORKSPACE_MARKER } from "../services/context.js";
import { validateSkillFrontmatter } from "../services/frontmatter.js";
import { hashTextContent } from "../services/integrity.js";
import {
  type CompleteManagedAuthoringState,
  inspectManagedFrontDoor,
  isCanonicalIntegrationVersion,
  parseManagedAuthoringState,
  renderManagedFrontDoorBlock,
  serializeManagedAuthoringState,
  WORKSPACE_INTEGRATION_STATE_PATH,
  WORKSPACE_SKILL_NAMES,
  type WorkspaceSkillName,
} from "../services/workspace-authoring-integration.js";
import {
  createWorkspaceHandoffReceipt,
  parseWorkspaceHandoffReceipt,
  serializeWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_BACKLOG_PATH,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
  type WorkspaceHandoffClientReceipt,
  type WorkspaceHandoffReceipt,
} from "../services/workspace-handoff.js";
import { projectWideAuthoringTasks } from "./init-project.js";

/** Existing ports are sufficient for both preparation and read-only verification. */
export interface WorkspaceHandoffDeps {
  readonly fs: FileSystem;
  readonly backlog: BacklogMd;
  /** Exact workspace-skill sources shipped by the currently executing WPM package. */
  readonly bundledSkillsRoot: string;
}

export interface PrepareWorkspaceHandoffInput {
  readonly workspaceRoot: string;
  readonly integrationVersion: string;
}

export interface VerifyWorkspaceHandoffInput extends PrepareWorkspaceHandoffInput {
  /** Actual injected process directory, retained separately from upward workspace discovery. */
  readonly actualWorkingDirectory: string;
  readonly clientId: string;
}

/** Truthful sender-facing result; `prepared` is emitted only after the final receipt publication succeeds. */
export interface PreparedWorkspaceHandoffResult extends OperationResult {
  readonly status: "prepared";
  readonly handoffPrepared: true;
  readonly workspaceRoot: string;
  readonly receiptPath: typeof WORKSPACE_HANDOFF_RECEIPT_PATH;
  readonly configuredClients: readonly AuthoringClientId[];
  readonly clients: readonly WorkspaceHandoffClientReceipt[];
}

export interface VerifiedWorkspaceHandoffResult {
  readonly status: "verified";
  readonly summary: string;
  readonly workspaceRoot: string;
  readonly selectedClient: AuthoringClientId;
  readonly sharedValid: true;
  readonly clients: readonly HandoffClientValidity[];
  readonly agreement: {
    readonly workingDirectory: { readonly status: "valid"; readonly path: string };
    readonly receipt: {
      readonly status: "valid";
      readonly path: typeof WORKSPACE_HANDOFF_RECEIPT_PATH;
    };
    readonly managedState: {
      readonly status: "valid";
      readonly path: typeof WORKSPACE_INTEGRATION_STATE_PATH;
    };
    readonly authoringBacklog: {
      readonly status: "valid";
      readonly path: typeof WORKSPACE_HANDOFF_BACKLOG_PATH;
    };
    readonly clients: readonly {
      readonly id: AuthoringClientId;
      readonly status: "valid";
      readonly frontDoor: { readonly status: "valid"; readonly path: string };
      readonly skillFamily: {
        readonly status: "valid";
        readonly directory: string;
        readonly names: readonly WorkspaceSkillName[];
        readonly paths: readonly string[];
      };
    }[];
  };
  readonly workEvidence: {
    readonly resumable: boolean;
    readonly dependencyEligible: boolean;
  };
  readonly nextAction: {
    readonly skill: "wpm-author";
    readonly invocation: string;
  };
}

interface WorkspaceEvidence {
  readonly blockers: HandoffBlocker[];
  state?: CompleteManagedAuthoringState;
  stateText?: string;
  stateAuthoritative: boolean;
  readonly invalidClients: Set<AuthoringClientId>;
  readonly taskStatuses: Map<string, string>;
  readonly coreTasks: Array<{
    readonly id: string;
    readonly status: string;
    readonly dependencies: readonly string[];
  }>;
  readonly packagedSkills: Map<WorkspaceSkillName, { readonly sha256: string }>;
}

interface ReceiptEvidence {
  readonly kind: "missing" | "invalid" | "valid";
  readonly text?: string;
  readonly receipt?: WorkspaceHandoffReceipt;
}

function handoffBlocker(
  code: string,
  surface: HandoffBlocker["surface"],
  message: string,
  recovery: string,
  client?: string,
): HandoffBlocker {
  return {
    code,
    surface,
    message,
    recovery,
    ...(client !== undefined ? { client } : {}),
  };
}

function pushClientBlocker(
  evidence: WorkspaceEvidence,
  client: AuthoringClientId,
  blocker: HandoffBlocker,
): void {
  evidence.invalidClients.add(client);
  evidence.blockers.push(blocker);
}

function definitionMap(): ReadonlyMap<AuthoringClientId, AuthoringClientDefinition> {
  return new Map(listAuthoringClientDefinitions().map((definition) => [definition.id, definition]));
}

function fullSelectionRecovery(
  clients: readonly AuthoringClientId[],
  client: AuthoringClientId,
  action: string,
): string {
  const selection = clients.map((id) => `--client ${id}`).join(" ");
  return `${action} for ${client}, then reapply workspace integration with the complete recorded selection (${selection}); do not omit a valid peer`;
}

function inspectRoot(
  deps: WorkspaceHandoffDeps,
  workspaceRoot: string,
  evidence: WorkspaceEvidence,
): void {
  try {
    const root = deps.fs.inspectPath(workspaceRoot);
    if (root.kind !== "directory") {
      evidence.blockers.push(
        handoffBlocker(
          "workspace-root-invalid",
          "target",
          `${toPosix(workspaceRoot)} must be one real directory; found ${root.kind}`,
          "start from the exact canonical workspace root recorded by WPM",
        ),
      );
    } else {
      const canonical = toPosix(deps.fs.canonicalPath(workspaceRoot));
      if (canonical !== toPosix(workspaceRoot)) {
        evidence.blockers.push(
          handoffBlocker(
            "workspace-root-noncanonical",
            "target",
            `${toPosix(workspaceRoot)} resolves to ${canonical}`,
            "repeat from the canonical workspace root rather than an alias",
          ),
        );
      }
    }
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "workspace-root-unreadable",
        "target",
        error instanceof Error ? error.message : String(error),
        "make the recorded workspace root inspectable before repeating handoff",
      ),
    );
  }
  for (const [relativePath, surface] of [
    ["wip", "target"],
    ["builds", "target"],
    [WORKSPACE_HANDOFF_BACKLOG_PATH, "backlog"],
  ] as const) {
    const path = join(workspaceRoot, relativePath);
    try {
      const actual = deps.fs.inspectPath(path);
      if (actual.kind !== "directory") {
        evidence.blockers.push(
          handoffBlocker(
            `workspace-${relativePath.replaceAll(".", "").replaceAll("/", "-")}-invalid`,
            surface,
            `${toPosix(path)} must be one real directory; found ${actual.kind}`,
            `restore the exact workspace ${relativePath} directory before repeating handoff`,
          ),
        );
      }
    } catch (error) {
      evidence.blockers.push(
        handoffBlocker(
          `workspace-${relativePath.replaceAll(".", "").replaceAll("/", "-")}-unreadable`,
          surface,
          `${toPosix(path)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
          `make the workspace ${relativePath} directory inspectable before repeating handoff`,
        ),
      );
    }
  }
  const markerPath = join(workspaceRoot, WORKSPACE_MARKER);
  try {
    const marker = deps.fs.inspectPath(markerPath);
    if (marker.kind !== "file") {
      evidence.blockers.push(
        handoffBlocker(
          "workspace-marker-invalid",
          "target",
          `${toPosix(markerPath)} must be the regular authoring-workspace marker; found ${marker.kind}`,
          "restore the exact wip/manifest.yml workspace marker before repeating handoff",
        ),
      );
    }
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "workspace-marker-unreadable",
        "target",
        `${toPosix(markerPath)} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`,
        "make the exact wip/manifest.yml workspace marker inspectable before repeating handoff",
      ),
    );
  }
}

function inspectManagedState(
  deps: WorkspaceHandoffDeps,
  input: PrepareWorkspaceHandoffInput,
  evidence: WorkspaceEvidence,
): void {
  const statePath = join(input.workspaceRoot, WORKSPACE_INTEGRATION_STATE_PATH);
  try {
    const inspection = deps.fs.inspectPath(statePath);
    if (inspection.kind !== "file") {
      evidence.blockers.push(
        handoffBlocker(
          "managed-state-invalid",
          "managed-state",
          `${toPosix(statePath)} must be a complete regular managed-state file; found ${inspection.kind}`,
          "run workspace authoring integration to completion before preparing handoff",
        ),
      );
      return;
    }
    const text = deps.fs.read(statePath);
    const parsed = parseManagedAuthoringState(text);
    if (!parsed.ok || parsed.value.status !== "complete") {
      evidence.blockers.push(
        handoffBlocker(
          "managed-state-invalid",
          "managed-state",
          parsed.ok
            ? "workspace authoring integration is still applying"
            : `managed authoring state is invalid: ${parsed.reason}`,
          "complete the exact workspace authoring integration request before preparing handoff",
        ),
      );
      return;
    }
    let authoritative = true;
    if (text !== serializeManagedAuthoringState(parsed.value)) {
      authoritative = false;
      evidence.blockers.push(
        handoffBlocker(
          "managed-state-noncanonical",
          "managed-state",
          "managed authoring state bytes differ from their canonical WPM serialization",
          "restore the exact WPM-owned managed-state bytes before preparing handoff",
        ),
      );
    }
    if (
      parsed.value.workspaceRoot !== toPosix(input.workspaceRoot) ||
      parsed.value.integrationVersion !== input.integrationVersion
    ) {
      authoritative = false;
      evidence.blockers.push(
        handoffBlocker(
          "managed-state-mismatch",
          "managed-state",
          "managed authoring root or integration version does not match this WPM handoff request",
          "reapply workspace authoring integration from the recorded canonical root with this WPM version",
        ),
      );
    }
    evidence.state = parsed.value;
    evidence.stateText = text;
    evidence.stateAuthoritative = authoritative;
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "managed-state-unreadable",
        "managed-state",
        error instanceof Error ? error.message : String(error),
        "make the exact managed-state file readable before repeating handoff",
      ),
    );
  }
}

function inspectPackagedSkills(deps: WorkspaceHandoffDeps, evidence: WorkspaceEvidence): void {
  for (const name of WORKSPACE_SKILL_NAMES) {
    const directory = join(deps.bundledSkillsRoot, name);
    const leaf = join(directory, "SKILL.md");
    try {
      const directoryKind = deps.fs.inspectPath(directory);
      const leafKind = deps.fs.inspectPath(leaf);
      const entries = directoryKind.kind === "directory" ? deps.fs.list(directory) : [];
      if (
        directoryKind.kind !== "directory" ||
        leafKind.kind !== "file" ||
        entries.length !== 1 ||
        entries[0]?.name !== "SKILL.md" ||
        entries[0]?.kind !== "file"
      ) {
        evidence.blockers.push(
          handoffBlocker(
            "packaged-skill-shape-invalid",
            "packaged-content",
            `current packaged workspace skill ${name} must contain exactly one regular SKILL.md`,
            "reinstall or repair the exact WPM package before repeating handoff verification",
          ),
        );
        continue;
      }
      const captured = deps.fs.readWithDigest(leaf);
      const frontmatter = validateSkillFrontmatter(captured.content, toPosix(leaf));
      if (frontmatter.name !== name) {
        evidence.blockers.push(
          handoffBlocker(
            "packaged-skill-identity-mismatch",
            "packaged-content",
            `current packaged ${name}/SKILL.md declares ${JSON.stringify(frontmatter.name)}`,
            "reinstall or repair the exact WPM package before repeating handoff verification",
          ),
        );
        continue;
      }
      evidence.packagedSkills.set(name, { sha256: captured.sha256 });
    } catch (error) {
      evidence.blockers.push(
        handoffBlocker(
          "packaged-skill-invalid",
          "packaged-content",
          `current packaged workspace skill ${name} is invalid: ${error instanceof Error ? error.message : String(error)}`,
          "reinstall or repair the exact WPM package before repeating handoff verification",
        ),
      );
    }
  }
}

function inspectClientSurfaces(
  deps: WorkspaceHandoffDeps,
  input: PrepareWorkspaceHandoffInput,
  evidence: WorkspaceEvidence,
  fallbackReceipt?: WorkspaceHandoffReceipt,
): void {
  const state = evidence.state;
  const receiptIsCurrent =
    fallbackReceipt?.workspaceRoot === toPosix(input.workspaceRoot) &&
    fallbackReceipt.integrationVersion === input.integrationVersion;
  if (
    state !== undefined &&
    state.ownedPaths.length !== state.selectedClients.length * (WORKSPACE_SKILL_NAMES.length + 1)
  ) {
    evidence.stateAuthoritative = false;
    evidence.blockers.push(
      handoffBlocker(
        "managed-state-owned-paths-mismatch",
        "managed-state",
        `managed state records ${state.ownedPaths.length} owned paths; expected ${state.selectedClients.length * (WORKSPACE_SKILL_NAMES.length + 1)}`,
        "reapply workspace authoring integration to restore the exact selected-client ownership set",
      ),
    );
  }
  const clients =
    evidence.stateAuthoritative && state !== undefined
      ? state.selectedClients
      : receiptIsCurrent
        ? (fallbackReceipt?.configuredClients ?? [])
        : (state?.selectedClients ?? []);
  if (clients.length === 0) return;
  const definitions = definitionMap();
  const integrationVersion =
    evidence.stateAuthoritative && state !== undefined
      ? state.integrationVersion
      : receiptIsCurrent
        ? (fallbackReceipt?.integrationVersion ?? input.integrationVersion)
        : input.integrationVersion;
  for (const client of clients) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    if (evidence.packagedSkills.size !== WORKSPACE_SKILL_NAMES.length) {
      evidence.invalidClients.add(client);
    }
    if (!evidence.stateAuthoritative) {
      pushClientBlocker(
        evidence,
        client,
        handoffBlocker(
          "workspace-skill-family-unverifiable",
          "skill-family",
          `${client} skill fingerprints cannot be established without exact root-bound complete managed state`,
          `restore the exact complete ${WORKSPACE_INTEGRATION_STATE_PATH} ownership record for the configured clients, then rerun verification`,
          client,
        ),
      );
    }
    for (const name of WORKSPACE_SKILL_NAMES) {
      const expectedPath = toPosix(join(definition.workspaceSkillsDirectory, name));
      const records = (state?.ownedPaths ?? []).filter(
        (record) => record.kind === "skill" && record.client === client && record.name === name,
      );
      const record = records.length === 1 ? records[0] : undefined;
      if (
        state !== undefined &&
        (record === undefined ||
          record.kind !== "skill" ||
          record.path !== expectedPath ||
          record.version !== state.integrationVersion)
      ) {
        pushClientBlocker(
          evidence,
          client,
          handoffBlocker(
            "managed-skill-record-mismatch",
            "managed-state",
            `managed state does not contain one exact ${client}/${name} ownership record`,
            fullSelectionRecovery(clients, client, "restore the managed skill record"),
            client,
          ),
        );
      }
      const directory = join(input.workspaceRoot, expectedPath);
      const leaf = join(directory, "SKILL.md");
      try {
        const directoryKind = deps.fs.inspectPath(directory);
        const leafKind = deps.fs.inspectPath(leaf);
        const entries = directoryKind.kind === "directory" ? deps.fs.list(directory) : [];
        const canonical =
          directoryKind.kind === "directory" ? toPosix(deps.fs.canonicalPath(directory)) : "";
        const captured = leafKind.kind === "file" ? deps.fs.readWithDigest(leaf) : undefined;
        const packaged = evidence.packagedSkills.get(name);
        let identityMatches = false;
        if (captured !== undefined) {
          try {
            identityMatches =
              validateSkillFrontmatter(captured.content, toPosix(leaf)).name === name;
          } catch {
            identityMatches = false;
          }
        }
        if (
          directoryKind.kind !== "directory" ||
          canonical !== toPosix(directory) ||
          entries.length !== 1 ||
          entries[0]?.name !== "SKILL.md" ||
          entries[0]?.kind !== "file" ||
          leafKind.kind !== "file" ||
          !identityMatches ||
          captured?.sha256 !== packaged?.sha256 ||
          (evidence.stateAuthoritative &&
            record?.kind === "skill" &&
            captured?.sha256 !== record.sha256)
        ) {
          pushClientBlocker(
            evidence,
            client,
            handoffBlocker(
              "workspace-skill-mismatch",
              "skill-family",
              `${client}/${name} does not match its exact managed regular-file ownership evidence`,
              fullSelectionRecovery(
                clients,
                client,
                "preserve unexpected bytes and restore the recorded WPM-owned skill bytes",
              ),
              client,
            ),
          );
        }
      } catch (error) {
        pushClientBlocker(
          evidence,
          client,
          handoffBlocker(
            "workspace-skill-unreadable",
            "skill-family",
            `${client}/${name}: ${error instanceof Error ? error.message : String(error)}`,
            `make the exact ${client} skill path readable, then ${fullSelectionRecovery(clients, client, "restore the skill if needed")}`,
            client,
          ),
        );
      }
    }
    const frontRecords = (state?.ownedPaths ?? []).filter(
      (record) => record.kind === "front-door" && record.client === client,
    );
    const frontRecord = frontRecords.length === 1 ? frontRecords[0] : undefined;
    if (
      state !== undefined &&
      (frontRecord === undefined ||
        frontRecord.kind !== "front-door" ||
        frontRecord.path !== definition.workspaceFrontDoor ||
        frontRecord.version !== state.integrationVersion)
    ) {
      pushClientBlocker(
        evidence,
        client,
        handoffBlocker(
          "managed-front-door-record-mismatch",
          "managed-state",
          `managed state does not contain one exact ${client} front-door ownership record`,
          fullSelectionRecovery(clients, client, "restore the managed front-door record"),
          client,
        ),
      );
    }
    const path = join(input.workspaceRoot, definition.workspaceFrontDoor);
    try {
      const kind = deps.fs.inspectPath(path);
      const text = kind.kind === "file" ? deps.fs.read(path) : undefined;
      const managed = text === undefined ? undefined : inspectManagedFrontDoor(text);
      if (
        kind.kind !== "file" ||
        managed?.kind !== "present" ||
        managed.block !== renderManagedFrontDoorBlock(client, integrationVersion)
      ) {
        pushClientBlocker(
          evidence,
          client,
          handoffBlocker(
            "workspace-front-door-mismatch",
            "front-door",
            `${client} native front door does not contain the exact managed wpm-author block`,
            fullSelectionRecovery(
              clients,
              client,
              "restore the exact managed front-door block while preserving surrounding user content",
            ),
            client,
          ),
        );
      }
    } catch (error) {
      pushClientBlocker(
        evidence,
        client,
        handoffBlocker(
          "workspace-front-door-unreadable",
          "front-door",
          `${client}: ${error instanceof Error ? error.message : String(error)}`,
          `make ${definition.workspaceFrontDoor} readable, then ${fullSelectionRecovery(clients, client, "restore the front door if needed")}`,
          client,
        ),
      );
    }
  }
}

function inspectCoreBacklog(
  deps: WorkspaceHandoffDeps,
  input: PrepareWorkspaceHandoffInput,
  evidence: WorkspaceEvidence,
): void {
  const root = join(input.workspaceRoot, WORKSPACE_HANDOFF_BACKLOG_PATH);
  let available = false;
  try {
    const inspection = deps.backlog.inspectAvailability();
    available = inspection.available;
    if (!inspection.available) {
      evidence.blockers.push(
        handoffBlocker(
          "backlog-unavailable",
          "backlog",
          `Backlog.md is unavailable: ${inspection.reason}`,
          "install or repair Backlog.md before verifying the handoff",
        ),
      );
    }
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "backlog-unavailable",
        "backlog",
        error instanceof Error ? error.message : String(error),
        "install or repair Backlog.md before verifying the handoff",
      ),
    );
  }
  if (!available) return;
  try {
    const rootInspection = deps.backlog.inspectRoot(root);
    if (!rootInspection.valid || rootInspection.taskPrefix !== AUTHORING_TASK_PREFIX) {
      evidence.blockers.push(
        handoffBlocker(
          "authoring-backlog-root-mismatch",
          "backlog",
          rootInspection.valid
            ? `authoring backlog uses task prefix ${JSON.stringify(rootInspection.taskPrefix)}`
            : rootInspection.reason,
          "restore the exact .authoring-backlog root with task prefix authoring",
        ),
      );
    }
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "authoring-backlog-root-unreadable",
        "backlog",
        error instanceof Error ? error.message : String(error),
        "make the exact authoring-backlog identity readable before handoff",
      ),
    );
  }
  let tasks: ReturnType<BacklogMd["listTasks"]> = [];
  try {
    tasks = deps.backlog.listTasks(root);
    for (const task of tasks) evidence.taskStatuses.set(task.id, task.status);
  } catch (error) {
    evidence.blockers.push(
      handoffBlocker(
        "authoring-backlog-unreadable",
        "backlog",
        error instanceof Error ? error.message : String(error),
        "repair the authoring backlog through Backlog.md before handoff",
      ),
    );
    return;
  }
  for (const spec of projectWideAuthoringTasks()) {
    const matching = tasks.filter(({ title }) => title === spec.title);
    if (matching.length !== 1) {
      evidence.blockers.push(
        handoffBlocker(
          matching.length === 0 ? "core-authoring-task-missing" : "core-authoring-task-duplicate",
          "backlog",
          `expected exactly one current core task ${JSON.stringify(spec.title)}; found ${matching.length}`,
          "restore the mandatory core authoring task through the authorized workspace creation workflow",
        ),
      );
      continue;
    }
    try {
      const summary = matching[0] as (typeof matching)[number];
      const record = deps.backlog.readTask(root, summary.id);
      if (
        record.id !== summary.id ||
        record.title !== spec.title ||
        record.status !== summary.status ||
        record.acceptanceCriteria.length !== spec.acceptanceCriteria.length ||
        record.acceptanceCriteria.some(
          (criterion, index) => criterion.text !== spec.acceptanceCriteria[index],
        )
      ) {
        evidence.blockers.push(
          handoffBlocker(
            "core-authoring-task-mismatch",
            "backlog",
            `core task ${JSON.stringify(spec.title)} no longer matches its mandatory identity and criteria`,
            "preserve user history and restore the mandatory core task through an authorized workflow",
          ),
        );
      }
      evidence.coreTasks.push({
        id: record.id,
        status: record.status,
        dependencies: [...record.dependencies],
      });
    } catch (error) {
      evidence.blockers.push(
        handoffBlocker(
          "core-authoring-task-unreadable",
          "backlog",
          `${JSON.stringify(spec.title)}: ${error instanceof Error ? error.message : String(error)}`,
          "make the exact core task record readable through Backlog.md before handoff",
        ),
      );
    }
  }
}

function inspectWorkspace(
  deps: WorkspaceHandoffDeps,
  input: PrepareWorkspaceHandoffInput,
  fallbackReceipt?: WorkspaceHandoffReceipt,
): WorkspaceEvidence {
  const evidence: WorkspaceEvidence = {
    blockers: [],
    stateAuthoritative: false,
    invalidClients: new Set(),
    taskStatuses: new Map(),
    coreTasks: [],
    packagedSkills: new Map(),
  };
  if (!isCanonicalIntegrationVersion(input.integrationVersion)) {
    evidence.blockers.push(
      handoffBlocker(
        "handoff-request-version-invalid",
        "receipt",
        `handoff integration version ${JSON.stringify(input.integrationVersion)} is not canonical semantic-version text`,
        "repeat with the exact normalized version of the currently executing WPM package",
      ),
    );
  }
  inspectRoot(deps, input.workspaceRoot, evidence);
  inspectManagedState(deps, input, evidence);
  inspectPackagedSkills(deps, evidence);
  inspectClientSurfaces(deps, input, evidence, fallbackReceipt);
  inspectCoreBacklog(deps, input, evidence);
  return evidence;
}

function inspectReceipt(deps: WorkspaceHandoffDeps, workspaceRoot: string): ReceiptEvidence {
  const path = join(workspaceRoot, WORKSPACE_HANDOFF_RECEIPT_PATH);
  try {
    const inspection = deps.fs.inspectPath(path);
    if (inspection.kind === "missing") return { kind: "missing" };
    if (inspection.kind !== "file") return { kind: "invalid" };
    const text = deps.fs.read(path);
    const parsed = parseWorkspaceHandoffReceipt(text);
    return parsed.ok ? { kind: "valid", text, receipt: parsed.value } : { kind: "invalid", text };
  } catch {
    return { kind: "invalid" };
  }
}

function standaloneRequestKey(
  input: PrepareWorkspaceHandoffInput,
  stateText: string,
  clients: readonly AuthoringClientId[],
): string {
  return `handoff|${hashTextContent(
    JSON.stringify({
      schemaVersion: 1,
      workspaceRoot: toPosix(input.workspaceRoot),
      integrationVersion: input.integrationVersion,
      managedState: hashTextContent(stateText),
      configuredClients: clients,
      mandatoryCoreTasks: projectWideAuthoringTasks(),
    }),
  )}`;
}

function executePreparationActions(
  actions: readonly { readonly boundary: MutationBoundary; readonly perform: () => void }[],
): string[] {
  const completed: MutationBoundary[] = [];
  const changed: string[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] as (typeof actions)[number];
    try {
      action.perform();
      completed.push(action.boundary);
      if (action.boundary.path !== undefined && !changed.includes(action.boundary.path)) {
        changed.push(action.boundary.path);
      }
    } catch (cause) {
      throw new MutationFailure({
        operation: "workspace handoff preparation",
        failedBeat: "MATERIALISE",
        completed,
        failed: action.boundary,
        unattempted: actions.slice(index + 1).map(({ boundary }) => boundary),
        recovery:
          "make the failed receipt publication boundary recoverable, then repeat the identical handoff preparation request; no rollback, generic resume, or generic reconciliation is claimed",
        cause,
      });
    }
  }
  return changed;
}

/** Prepare or re-prepare a fully integrated existing workspace using one bounded two-publication plan. */
export function prepareWorkspaceHandoff(
  deps: WorkspaceHandoffDeps,
  input: PrepareWorkspaceHandoffInput,
): PreparedWorkspaceHandoffResult {
  const receiptEvidence = inspectReceipt(deps, input.workspaceRoot);
  const evidence = inspectWorkspace(deps, input, receiptEvidence.receipt);
  if (receiptEvidence.kind === "invalid") {
    evidence.blockers.push(
      handoffBlocker(
        "handoff-receipt-invalid",
        "receipt",
        `${WORKSPACE_HANDOFF_RECEIPT_PATH} is not an exact WPM-owned canonical receipt`,
        "preserve the conflicting receipt and restore/remove it only after establishing ownership",
      ),
    );
  }
  const state = evidence.state;
  const stateText = evidence.stateText;
  let prepared: WorkspaceHandoffReceipt | undefined;
  let preparing: WorkspaceHandoffReceipt | undefined;
  if (
    state !== undefined &&
    stateText !== undefined &&
    isCanonicalIntegrationVersion(input.integrationVersion)
  ) {
    const requestKey = standaloneRequestKey(input, stateText, state.selectedClients);
    try {
      prepared = createWorkspaceHandoffReceipt({
        status: "prepared",
        workspaceRoot: input.workspaceRoot,
        integrationVersion: input.integrationVersion,
        configuredClients: state.selectedClients,
      });
      preparing = createWorkspaceHandoffReceipt({
        status: "preparing",
        workspaceRoot: input.workspaceRoot,
        integrationVersion: input.integrationVersion,
        configuredClients: state.selectedClients,
        requestKey,
      });
      if (receiptEvidence.kind === "valid") {
        const existing = receiptEvidence.receipt as WorkspaceHandoffReceipt;
        if (existing.workspaceRoot !== toPosix(input.workspaceRoot)) {
          evidence.blockers.push(
            handoffBlocker(
              "handoff-receipt-root-mismatch",
              "receipt",
              `receipt root ${existing.workspaceRoot} does not match ${toPosix(input.workspaceRoot)}`,
              "preserve the foreign receipt and restore the receipt belonging to this exact workspace root",
            ),
          );
        } else if (
          existing.status === "preparing" &&
          receiptEvidence.text !== serializeWorkspaceHandoffReceipt(preparing)
        ) {
          evidence.blockers.push(
            handoffBlocker(
              "handoff-receipt-partial-mismatch",
              "receipt",
              "preparing receipt does not authorize this exact current handoff plan",
              "repeat the exact original preparation request or preserve/recover the conflicting receipt",
            ),
          );
        }
      }
    } catch (error) {
      evidence.blockers.push(
        handoffBlocker(
          "handoff-request-invalid",
          "receipt",
          `handoff request cannot produce canonical receipt evidence: ${error instanceof Error ? error.message : String(error)}`,
          "repeat with the canonical workspace root and current normalized WPM version",
        ),
      );
    }
  }
  if (evidence.blockers.length > 0 || prepared === undefined || preparing === undefined) {
    throw new HandoffPreparationPreflightError(evidence.blockers);
  }

  const receiptPath = join(input.workspaceRoot, WORKSPACE_HANDOFF_RECEIPT_PATH);
  const actions: { boundary: MutationBoundary; perform: () => void }[] = [];
  const exactPrepared =
    receiptEvidence.kind === "valid" &&
    receiptEvidence.receipt?.status === "prepared" &&
    receiptEvidence.text === serializeWorkspaceHandoffReceipt(prepared);
  const exactPreparing =
    receiptEvidence.kind === "valid" &&
    receiptEvidence.text === serializeWorkspaceHandoffReceipt(preparing);
  if (!exactPrepared && !exactPreparing) {
    actions.push({
      boundary: {
        id: "handoff-receipt:preparing",
        path: toPosix(receiptPath),
        description: "publish exact bounded handoff preparation evidence",
      },
      perform: () => deps.fs.write(receiptPath, serializeWorkspaceHandoffReceipt(preparing)),
    });
  }
  if (!exactPrepared) {
    actions.push({
      boundary: {
        id: "handoff-receipt:prepared",
        path: toPosix(receiptPath),
        description: "publish the prepared workspace handoff receipt",
      },
      perform: () => deps.fs.write(receiptPath, serializeWorkspaceHandoffReceipt(prepared)),
    });
  }
  const changedPaths = executePreparationActions(actions);
  return {
    status: "prepared",
    summary: `prepared fresh-agent handoff at ${toPosix(input.workspaceRoot)} for ${prepared.configuredClients.join(", ")}`,
    handoffPrepared: true,
    workspaceRoot: prepared.workspaceRoot,
    receiptPath: WORKSPACE_HANDOFF_RECEIPT_PATH,
    configuredClients: prepared.configuredClients,
    clients: prepared.clients,
    changedPaths,
    materialisedTaskTitles: [],
  };
}

/** Read-only receiving-agent verification; it never changes state or invokes/claims authoring work. */
export function verifyWorkspaceHandoff(
  deps: WorkspaceHandoffDeps,
  input: VerifyWorkspaceHandoffInput,
): VerifiedWorkspaceHandoffResult {
  const receiptEvidence = inspectReceipt(deps, input.workspaceRoot);
  const evidence = inspectWorkspace(deps, input, receiptEvidence.receipt);
  if (toPosix(input.actualWorkingDirectory) !== toPosix(input.workspaceRoot)) {
    evidence.blockers.unshift(
      handoffBlocker(
        "working-directory-mismatch",
        "working-directory",
        `current directory ${toPosix(input.actualWorkingDirectory)} does not equal recorded root ${toPosix(input.workspaceRoot)}`,
        `change the process working directory to ${JSON.stringify(toPosix(input.workspaceRoot))}, then rerun the receipt's exact verification command`,
      ),
    );
  }
  const receipt = receiptEvidence.receipt;
  if (receiptEvidence.kind !== "valid" || receipt?.status !== "prepared") {
    const recovery =
      receiptEvidence.kind === "missing"
        ? "from the recorded workspace root, run `wpm authoring handoff prepare` or use the receipt's structured WPM argv entry"
        : receipt?.status === "preparing" && receipt.requestKey.startsWith("init|")
          ? "repeat the identical original wpm init request; only that whole-init plan can finalize this preparing receipt"
          : receipt?.status === "preparing"
            ? "from the recorded workspace root, repeat `wpm authoring handoff prepare` for this exact standalone plan"
            : "preserve the conflicting receipt and restore its exact authorized WPM bytes before repeating preparation";
    evidence.blockers.push(
      handoffBlocker(
        receiptEvidence.kind === "missing"
          ? "handoff-receipt-missing"
          : receipt?.status === "preparing"
            ? "handoff-receipt-not-prepared"
            : "handoff-receipt-invalid",
        "receipt",
        "the workspace does not contain one exact current prepared handoff receipt",
        recovery,
      ),
    );
  } else {
    const stateClients = evidence.state?.selectedClients ?? [];
    if (
      receipt.workspaceRoot !== toPosix(input.workspaceRoot) ||
      receipt.integrationVersion !== input.integrationVersion ||
      receipt.configuredClients.join(",") !== stateClients.join(",")
    ) {
      evidence.blockers.push(
        handoffBlocker(
          "handoff-receipt-mismatch",
          "receipt",
          "prepared receipt root, version, or configured-client set disagrees with managed integration",
          "reapply integration if needed, then prepare a fresh exact handoff receipt",
        ),
      );
    }
  }

  const support = evaluateAuthoringClientId(input.clientId);
  if (support.supportStatus !== "selectable") {
    evidence.blockers.push(
      handoffBlocker(
        "handoff-client-unsupported",
        "selected-client",
        `authoring client ${JSON.stringify(input.clientId)} is ${support.supportStatus}`,
        "select exactly one configured supported client: codex or claude-code",
        input.clientId,
      ),
    );
  } else {
    const knownConfiguredClients =
      evidence.stateAuthoritative && evidence.state !== undefined
        ? evidence.state.selectedClients
        : receipt?.status === "prepared" &&
            receipt.workspaceRoot === toPosix(input.workspaceRoot) &&
            receipt.integrationVersion === input.integrationVersion
          ? receipt.configuredClients
          : undefined;
    if (knownConfiguredClients !== undefined && !knownConfiguredClients.includes(support.id)) {
      evidence.blockers.push(
        handoffBlocker(
          "handoff-client-not-configured",
          "selected-client",
          `${support.id} is supported but is not configured by this workspace handoff`,
          "verify with a configured receipt client or explicitly reapply integration before preparing again",
          support.id,
        ),
      );
    }
  }

  const stateClients = evidence.state?.selectedClients ?? [];
  const receiptClients = receipt?.configuredClients ?? [];
  const reportedClientIds = AUTHORING_CLIENT_IDS.filter(
    (id) => stateClients.includes(id) || receiptClients.includes(id),
  );
  const clients = reportedClientIds.map((id) => ({
    id,
    status:
      evidence.invalidClients.has(id) || !evidence.stateAuthoritative || !stateClients.includes(id)
        ? ("invalid" as const)
        : ("valid" as const),
  }));
  const sharedValid = evidence.blockers.every(({ client }) => client !== undefined);
  if (evidence.blockers.length > 0 || support.supportStatus !== "selectable") {
    throw new HandoffVerificationError({
      blockers: evidence.blockers,
      selectedClient: input.clientId,
      clients,
      sharedValid,
    });
  }
  return {
    status: "verified",
    summary: `verified fresh-agent handoff at ${toPosix(input.workspaceRoot)} for ${support.id}`,
    workspaceRoot: toPosix(input.workspaceRoot),
    selectedClient: support.id,
    sharedValid: true,
    clients,
    agreement: {
      workingDirectory: { status: "valid", path: toPosix(input.workspaceRoot) },
      receipt: { status: "valid", path: WORKSPACE_HANDOFF_RECEIPT_PATH },
      managedState: { status: "valid", path: WORKSPACE_INTEGRATION_STATE_PATH },
      authoringBacklog: { status: "valid", path: WORKSPACE_HANDOFF_BACKLOG_PATH },
      clients: (evidence.state?.selectedClients ?? []).map((id) => {
        const definition = definitionMap().get(id) as AuthoringClientDefinition;
        return {
          id,
          status: "valid" as const,
          frontDoor: { status: "valid" as const, path: definition.workspaceFrontDoor },
          skillFamily: {
            status: "valid" as const,
            directory: definition.workspaceSkillsDirectory,
            names: WORKSPACE_SKILL_NAMES,
            paths: WORKSPACE_SKILL_NAMES.map((name) =>
              toPosix(join(definition.workspaceSkillsDirectory, name, "SKILL.md")),
            ),
          },
        };
      }),
    },
    workEvidence: {
      resumable: evidence.coreTasks.some(({ status }) => status === "In Progress"),
      dependencyEligible: evidence.coreTasks.some(
        ({ status, dependencies }) =>
          status === "To Do" &&
          dependencies.every((dependency) => evidence.taskStatuses.get(dependency) === "Done"),
      ),
    },
    nextAction: {
      skill: "wpm-author",
      invocation: authoringClientFirstSkillInvocation(support.id),
    },
  };
}
