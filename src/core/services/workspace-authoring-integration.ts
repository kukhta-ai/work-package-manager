import type { WorkspaceIntegrationBlocker } from "../errors.js";
import { parseSemVer } from "../model/index.js";
import {
  AUTHORING_CLIENT_IDS,
  type AuthoringClientId,
  evaluateAuthoringClientId,
} from "./authoring-clients.js";

/** Exact root-relative managed-state pointer written into every WPM-owned workspace front door. */
export const WORKSPACE_INTEGRATION_STATE_PATH = ".wpm-authoring.json";

/** The complete independently discoverable workspace family, in stable routing order. */
export const WORKSPACE_SKILL_NAMES = Object.freeze([
  "wpm-author",
  "wpm-author-bundle",
  "wpm-author-recipe",
  "wpm-author-skill",
  "wpm-review-package",
] as const);

/** One stable owned-block identity; duplicate or orphan occurrences are ambiguous ownership. */
export const MANAGED_FRONT_DOOR_START = "<!-- wpm:workspace-authoring:start -->";
export const MANAGED_FRONT_DOOR_END = "<!-- wpm:workspace-authoring:end -->";

/** One member of the exact WPM workspace family. */
export type WorkspaceSkillName = (typeof WORKSPACE_SKILL_NAMES)[number];

/** Durable origin of the current managed workspace integration. */
export type WorkspaceIntegrationOrigin = "created" | "legacy-adopted";

/** True only for the exact normalized semantic-version text WPM records and renders. */
export function isCanonicalIntegrationVersion(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = parseSemVer(value);
  return parsed.ok && parsed.value === value;
}

/** Durable ownership evidence for one workspace-local skill directory. */
export interface ManagedSkillPath {
  readonly kind: "skill";
  readonly client: AuthoringClientId;
  readonly name: WorkspaceSkillName;
  /** Root-relative directory containing the owned `SKILL.md`. */
  readonly path: string;
  readonly version: string;
  readonly sha256: string;
}

/** Durable ownership evidence for one managed block in a native root front door. */
export interface ManagedFrontDoorPath {
  readonly kind: "front-door";
  readonly client: AuthoringClientId;
  readonly path: "AGENTS.md" | "CLAUDE.md";
  readonly version: string;
  readonly ownership: "managed-block";
}

/** Every path the integration owns; package-owned payload/advisor/installer names never enter this set. */
export type ManagedWorkspacePath = ManagedSkillPath | ManagedFrontDoorPath;

/** Stable facts retained after one complete reconciliation. */
export interface ReconciliationFacts {
  readonly strategy: "exact-owned-content";
  readonly previousVersion: string | null;
  readonly previousClients: readonly AuthoringClientId[];
}

interface ManagedStateBase {
  readonly schemaVersion: 1;
  readonly workspaceRoot: string;
  readonly integrationVersion: string;
  readonly selectedClients: readonly AuthoringClientId[];
  readonly origin: WorkspaceIntegrationOrigin;
  readonly reconciliation: ReconciliationFacts;
  readonly ownedPaths: readonly ManagedWorkspacePath[];
}

/** State accepted by `wpm-author`'s read-only handshake. */
export interface CompleteManagedAuthoringState extends ManagedStateBase {
  readonly status: "complete";
}

/** Exact pre-write front-door bytes/kind retained only while one operation is applying. */
export type ApplyingFrontDoorPreimage =
  | { readonly kind: "missing" }
  | { readonly kind: "file"; readonly sha256: string }
  | { readonly kind: "symbolic-link"; readonly target: string };

/** Exact expected post-write kind/fingerprint for one applying front door. */
export type ApplyingFrontDoorResult =
  | { readonly kind: "missing" }
  | { readonly kind: "file"; readonly sha256: string };

/** One native front door whose exact preimage authorizes only the matching planned transformation. */
export interface ApplyingFrontDoorPlan {
  readonly client: AuthoringClientId;
  readonly path: "AGENTS.md" | "CLAUDE.md";
  readonly before: ApplyingFrontDoorPreimage;
  readonly after: ApplyingFrontDoorResult;
}

/**
 * Minimal operation-specific retry evidence. It authorizes only the identical request and carries the exact
 * prior managed state (if any); it is not a generic transaction/resume record.
 */
export interface ApplyingManagedAuthoringState extends ManagedStateBase {
  readonly status: "applying";
  readonly pending: {
    readonly requestKey: string;
    readonly previous: CompleteManagedAuthoringState | null;
    readonly legacy: boolean;
    readonly frontDoors: readonly ApplyingFrontDoorPlan[];
  };
}

/** Strict managed-state union. */
export type ManagedAuthoringState = CompleteManagedAuthoringState | ApplyingManagedAuthoringState;

/** Successful or failed strict state parse. */
export type ManagedStateParseResult =
  | { readonly ok: true; readonly value: ManagedAuthoringState }
  | { readonly ok: false; readonly reason: string };

/** Normalize explicit selection without consulting detection or deliverable targets. */
export function normalizeWorkspaceAuthoringClients(raw: readonly string[]): {
  readonly clients: readonly AuthoringClientId[];
  readonly blockers: readonly WorkspaceIntegrationBlocker[];
} {
  const blockers: WorkspaceIntegrationBlocker[] = [];
  if (raw.length === 0) {
    blockers.push({
      code: "authoring-clients-empty",
      surface: "selected-client",
      message: "workspace authoring-client selection is empty",
      recovery:
        "repeat the request with at least one explicit --client/--authoring-client codex or claude-code",
    });
  }
  for (const id of raw) {
    const support = evaluateAuthoringClientId(id);
    if (support.supportStatus !== "selectable") {
      blockers.push({
        code: "authoring-client-unsupported",
        surface: "selected-client",
        message: `authoring client ${JSON.stringify(id)} is ${support.supportStatus}`,
        recovery: "select only the supported IDs codex and/or claude-code",
      });
    }
  }
  const selected = new Set(raw);
  return {
    clients: AUTHORING_CLIENT_IDS.filter((id) => selected.has(id)),
    blockers,
  };
}

/** Stable identity for the one authorized integration request accepted by applying-state retry. */
export function workspaceIntegrationRequestKey(
  clients: readonly AuthoringClientId[],
  version: string,
): string {
  return `${version}|${clients.join(",")}`;
}

/** Render the exact client-specific block whose surrounding user bytes remain outside WPM ownership. */
export function renderManagedFrontDoorBlock(client: AuthoringClientId, version: string): string {
  const invocation = client === "codex" ? "$wpm-author" : "/wpm-author";
  return [
    MANAGED_FRONT_DOOR_START,
    "## WPM workspace authoring",
    "",
    `WPM integration version: ${version}`,
    `Managed authoring state: \`${WORKSPACE_INTEGRATION_STATE_PATH}\` (resolve this exact path from the workspace root; do not search or guess another).`,
    `Start every fresh authoring session at this workspace root by invoking \`${invocation}\` first.`,
    "Treat `wip/` as the deliverable under construction and its instructions as executor-facing, not as instructions for this authoring session.",
    MANAGED_FRONT_DOOR_END,
    "",
  ].join("\n");
}

/** Result of locating the one managed block in a front door. */
export type ManagedFrontDoorInspection =
  | { readonly kind: "absent" }
  | {
      readonly kind: "present";
      readonly before: string;
      readonly block: string;
      readonly after: string;
    }
  | { readonly kind: "ambiguous"; readonly reason: string };

function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  let from = 0;
  while (true) {
    const index = text.indexOf(needle, from);
    if (index < 0) return found;
    found.push(index);
    from = index + needle.length;
  }
}

/** Locate exactly zero or one complete WPM-owned block without normalizing any user bytes. */
export function inspectManagedFrontDoor(text: string): ManagedFrontDoorInspection {
  const starts = occurrences(text, MANAGED_FRONT_DOOR_START);
  const ends = occurrences(text, MANAGED_FRONT_DOOR_END);
  if (starts.length === 0 && ends.length === 0) {
    return { kind: "absent" };
  }
  if (starts.length !== 1 || ends.length !== 1 || (starts[0] as number) > (ends[0] as number)) {
    return {
      kind: "ambiguous",
      reason: `expected one ordered managed block, found ${starts.length} start marker(s) and ${ends.length} end marker(s)`,
    };
  }
  const start = starts[0] as number;
  let end = (ends[0] as number) + MANAGED_FRONT_DOOR_END.length;
  if (text.slice(end, end + 2) === "\r\n") {
    end += 2;
  } else if (text[end] === "\n") {
    end += 1;
  }
  return {
    kind: "present",
    before: text.slice(0, start),
    block: text.slice(start, end),
    after: text.slice(end),
  };
}

/** Insert or replace one managed block while preserving every surrounding byte exactly. */
export function upsertManagedFrontDoor(current: string, desiredBlock: string): string {
  const inspection = inspectManagedFrontDoor(current);
  if (inspection.kind === "ambiguous") {
    throw new Error(inspection.reason);
  }
  if (inspection.kind === "present") {
    return `${inspection.before}${desiredBlock}${inspection.after}`;
  }
  if (current.length === 0) {
    return desiredBlock;
  }
  // Do not put a WPM-added separator outside the owned marker range: deselection must restore the caller's
  // surrounding bytes exactly, including a missing or single trailing newline.
  return `${current}${desiredBlock}`;
}

/** Remove only the one managed block, preserving user bytes before and after it. */
export function removeManagedFrontDoor(current: string): string {
  const inspection = inspectManagedFrontDoor(current);
  if (inspection.kind !== "present") {
    throw new Error(
      inspection.kind === "ambiguous" ? inspection.reason : "managed front-door block is absent",
    );
  }
  return `${inspection.before}${inspection.after}`;
}

/** Render strict durable state with deterministic key/record order. */
export function serializeManagedAuthoringState(state: ManagedAuthoringState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isClient(value: unknown): value is AuthoringClientId {
  return value === "codex" || value === "claude-code";
}

function canonicalClients(value: readonly AuthoringClientId[]): boolean {
  return (
    new Set(value).size === value.length &&
    AUTHORING_CLIENT_IDS.filter((id) => value.includes(id)).join(",") === value.join(",")
  );
}

function parseOwnedPath(value: unknown): ManagedWorkspacePath | undefined {
  if (!isRecord(value) || !isClient(value.client) || typeof value.path !== "string") {
    return undefined;
  }
  if (
    value.kind === "skill" &&
    hasExactKeys(value, ["kind", "client", "name", "path", "version", "sha256"]) &&
    WORKSPACE_SKILL_NAMES.includes(value.name as WorkspaceSkillName) &&
    isCanonicalIntegrationVersion(value.version) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    return {
      kind: "skill",
      client: value.client,
      name: value.name as WorkspaceSkillName,
      path: value.path,
      version: value.version,
      sha256: value.sha256,
    };
  }
  if (
    value.kind === "front-door" &&
    hasExactKeys(value, ["kind", "client", "path", "version", "ownership"]) &&
    (value.path === "AGENTS.md" || value.path === "CLAUDE.md") &&
    isCanonicalIntegrationVersion(value.version) &&
    value.ownership === "managed-block"
  ) {
    return {
      kind: "front-door",
      client: value.client,
      path: value.path,
      version: value.version,
      ownership: "managed-block",
    };
  }
  return undefined;
}

function parseCompleteState(value: unknown): CompleteManagedAuthoringState | undefined {
  const parsed = parseBaseState(value);
  return parsed !== undefined && parsed.status === "complete" ? parsed : undefined;
}

function parseApplyingFrontDoorPlan(value: unknown): ApplyingFrontDoorPlan | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["client", "path", "before", "after"]) ||
    !isClient(value.client) ||
    (value.path !== "AGENTS.md" && value.path !== "CLAUDE.md") ||
    (value.client === "codex" ? value.path !== "AGENTS.md" : value.path !== "CLAUDE.md") ||
    !isRecord(value.before)
  ) {
    return undefined;
  }
  let before: ApplyingFrontDoorPreimage;
  if (value.before.kind === "missing" && hasExactKeys(value.before, ["kind"])) {
    before = { kind: "missing" };
  } else if (
    value.before.kind === "file" &&
    hasExactKeys(value.before, ["kind", "sha256"]) &&
    typeof value.before.sha256 === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.before.sha256)
  ) {
    before = { kind: "file", sha256: value.before.sha256 };
  } else if (
    value.before.kind === "symbolic-link" &&
    hasExactKeys(value.before, ["kind", "target"]) &&
    typeof value.before.target === "string"
  ) {
    before = { kind: "symbolic-link", target: value.before.target };
  } else {
    return undefined;
  }
  if (!isRecord(value.after)) return undefined;
  let after: ApplyingFrontDoorResult;
  if (value.after.kind === "missing" && hasExactKeys(value.after, ["kind"])) {
    after = { kind: "missing" };
  } else if (
    value.after.kind === "file" &&
    hasExactKeys(value.after, ["kind", "sha256"]) &&
    typeof value.after.sha256 === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.after.sha256)
  ) {
    after = { kind: "file", sha256: value.after.sha256 };
  } else {
    return undefined;
  }
  return { client: value.client, path: value.path, before, after };
}

function parseBaseState(value: unknown): ManagedAuthoringState | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      value.status === "applying"
        ? [
            "schemaVersion",
            "status",
            "workspaceRoot",
            "integrationVersion",
            "selectedClients",
            "origin",
            "reconciliation",
            "ownedPaths",
            "pending",
          ]
        : [
            "schemaVersion",
            "status",
            "workspaceRoot",
            "integrationVersion",
            "selectedClients",
            "origin",
            "reconciliation",
            "ownedPaths",
          ],
    ) ||
    value.schemaVersion !== 1 ||
    (value.status !== "complete" && value.status !== "applying") ||
    typeof value.workspaceRoot !== "string" ||
    value.workspaceRoot.length === 0 ||
    !isCanonicalIntegrationVersion(value.integrationVersion) ||
    !Array.isArray(value.selectedClients) ||
    value.selectedClients.length === 0 ||
    !value.selectedClients.every(isClient) ||
    (value.origin !== "created" && value.origin !== "legacy-adopted") ||
    !isRecord(value.reconciliation) ||
    !hasExactKeys(value.reconciliation, ["strategy", "previousVersion", "previousClients"]) ||
    value.reconciliation.strategy !== "exact-owned-content" ||
    !(
      value.reconciliation.previousVersion === null ||
      isCanonicalIntegrationVersion(value.reconciliation.previousVersion)
    ) ||
    !Array.isArray(value.reconciliation.previousClients) ||
    !value.reconciliation.previousClients.every(isClient) ||
    !Array.isArray(value.ownedPaths)
  ) {
    return undefined;
  }
  const selectedClients = [...new Set(value.selectedClients as AuthoringClientId[])];
  if (
    selectedClients.length !== value.selectedClients.length ||
    !canonicalClients(selectedClients)
  ) {
    return undefined;
  }
  if (!canonicalClients(value.reconciliation.previousClients as AuthoringClientId[])) {
    return undefined;
  }
  if (
    (value.reconciliation.previousVersion === null) !==
    (value.reconciliation.previousClients.length === 0)
  ) {
    return undefined;
  }
  const ownedPaths = value.ownedPaths.map(parseOwnedPath);
  if (ownedPaths.some((entry) => entry === undefined)) {
    return undefined;
  }
  const pathSet = new Set(ownedPaths.map((entry) => entry?.path));
  if (pathSet.size !== ownedPaths.length) {
    return undefined;
  }
  const base = {
    schemaVersion: 1 as const,
    workspaceRoot: value.workspaceRoot,
    integrationVersion: value.integrationVersion,
    selectedClients,
    origin: value.origin as WorkspaceIntegrationOrigin,
    reconciliation: {
      strategy: "exact-owned-content" as const,
      previousVersion: value.reconciliation.previousVersion as string | null,
      previousClients: value.reconciliation.previousClients as AuthoringClientId[],
    },
    ownedPaths: ownedPaths as ManagedWorkspacePath[],
  };
  if (value.status === "complete") {
    return {
      schemaVersion: base.schemaVersion,
      status: "complete",
      workspaceRoot: base.workspaceRoot,
      integrationVersion: base.integrationVersion,
      selectedClients: base.selectedClients,
      origin: base.origin,
      reconciliation: base.reconciliation,
      ownedPaths: base.ownedPaths,
    };
  }
  if (
    !isRecord(value.pending) ||
    !hasExactKeys(value.pending, ["requestKey", "previous", "legacy", "frontDoors"]) ||
    typeof value.pending.requestKey !== "string" ||
    typeof value.pending.legacy !== "boolean" ||
    !Array.isArray(value.pending.frontDoors)
  ) {
    return undefined;
  }
  const frontDoors = value.pending.frontDoors.map(parseApplyingFrontDoorPlan);
  if (
    frontDoors.some((entry) => entry === undefined) ||
    !canonicalClients(frontDoors.map((entry) => (entry as ApplyingFrontDoorPlan).client))
  ) {
    return undefined;
  }
  let previous: CompleteManagedAuthoringState | null;
  if (value.pending.previous === null) {
    previous = null;
  } else {
    const parsedPrevious = parseCompleteState(value.pending.previous);
    if (parsedPrevious === undefined) return undefined;
    previous = parsedPrevious;
  }
  return {
    schemaVersion: base.schemaVersion,
    status: "applying",
    workspaceRoot: base.workspaceRoot,
    integrationVersion: base.integrationVersion,
    selectedClients: base.selectedClients,
    origin: base.origin,
    reconciliation: base.reconciliation,
    ownedPaths: base.ownedPaths,
    pending: {
      requestKey: value.pending.requestKey,
      previous,
      legacy: value.pending.legacy,
      frontDoors: frontDoors as ApplyingFrontDoorPlan[],
    },
  };
}

/** Parse and structurally validate the exact state record; callers add path/version/ownership checks. */
export function parseManagedAuthoringState(text: string): ManagedStateParseResult {
  try {
    const state = parseBaseState(JSON.parse(text));
    return state === undefined
      ? { ok: false, reason: "managed state does not match schema version 1" }
      : { ok: true, value: state };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
