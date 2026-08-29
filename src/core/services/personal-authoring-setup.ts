import { AUTHORING_CLIENT_IDS, type AuthoringClientId } from "./authoring-clients.js";
import { hashTextContent } from "./integrity.js";
import { isCanonicalIntegrationVersion } from "./workspace-authoring-integration.js";

/** HOME-relative durable state for personal bootstrap ownership and workspace-client defaults. */
export const PERSONAL_AUTHORING_STATE_PATH = ".wpm/authoring-setup.json";

/** The only WPM skill normal personal setup manages. */
export const PERSONAL_BOOTSTRAP_SKILL_NAME = "wpm-create-package";

/** The prior monolithic personal skill recognized only through an exact packaged-tree proof. */
export const LEGACY_PERSONAL_SKILL_NAME = "installer-builder";

/** HOME-relative private residue root used only while one applying request is incomplete. */
export const PERSONAL_AUTHORING_QUARANTINE_DIRECTORY = ".wpm/authoring-setup-quarantine";

/** Per-client reconciliation outcome reported by setup. */
export type PersonalSetupOutcome = "installed" | "unchanged" | "updated" | "migrated";

/** Durable ownership evidence for one managed personal bootstrap destination. */
export interface ManagedPersonalClient {
  readonly client: AuthoringClientId;
  readonly destination: string;
  readonly version: string;
  readonly sha256: string;
}

interface PersonalStateBase {
  readonly schemaVersion: 1;
  readonly home: string;
  readonly setupVersion: string;
  /** Latest explicit personal selection, reused only as later workspace-creation defaults. */
  readonly defaults: readonly AuthoringClientId[];
  /** Cumulative ownership; an unselected client's prior record is retained untouched. */
  readonly managed: readonly ManagedPersonalClient[];
}

/** Stable state after every selected client and the retained defaults have converged. */
export interface CompletePersonalAuthoringState extends PersonalStateBase {
  readonly status: "complete";
}

/** Exact legacy observation bound into one applying plan. */
export interface ApplyingPersonalLegacyPlan {
  readonly path: string;
  readonly action: "absent" | "preserve" | "remove";
  /** Exact no-follow tree/kind fingerprint; null only for absence. */
  readonly fingerprint: string | null;
}

/** One selected client's immutable before/after ownership plan. */
export interface ApplyingPersonalClientPlan {
  readonly client: AuthoringClientId;
  readonly destination: string;
  readonly outcome: PersonalSetupOutcome;
  /** Null means the current bootstrap destination was absent during LOAD. */
  readonly beforeSha256: string | null;
  readonly afterSha256: string;
  readonly legacy: ApplyingPersonalLegacyPlan;
}

/** Operation-specific retry evidence; it is not a general transaction or resume record. */
export interface ApplyingPersonalAuthoringState extends PersonalStateBase {
  readonly status: "applying";
  readonly pending: {
    readonly requestKey: string;
    readonly sourceSha256: string;
    readonly quarantineRoot: string;
    readonly previous: CompletePersonalAuthoringState | null;
    readonly clients: readonly ApplyingPersonalClientPlan[];
  };
}

export type PersonalAuthoringState =
  | CompletePersonalAuthoringState
  | ApplyingPersonalAuthoringState;

export type PersonalAuthoringStateParseResult =
  | { readonly ok: true; readonly value: PersonalAuthoringState }
  | { readonly ok: false; readonly reason: string };

/** Deterministic state bytes; exact canonical bytes are part of the ownership proof. */
export function serializePersonalAuthoringState(state: PersonalAuthoringState): string {
  const canonicalComplete = (
    value: CompletePersonalAuthoringState,
  ): CompletePersonalAuthoringState => ({
    schemaVersion: 1,
    status: "complete",
    home: value.home,
    setupVersion: value.setupVersion,
    defaults: value.defaults,
    managed: value.managed,
  });
  const canonical: PersonalAuthoringState =
    state.status === "complete"
      ? canonicalComplete(state)
      : {
          schemaVersion: 1,
          status: "applying",
          home: state.home,
          setupVersion: state.setupVersion,
          defaults: state.defaults,
          managed: state.managed,
          pending: {
            requestKey: state.pending.requestKey,
            sourceSha256: state.pending.sourceSha256,
            quarantineRoot: state.pending.quarantineRoot,
            previous:
              state.pending.previous === null ? null : canonicalComplete(state.pending.previous),
            clients: state.pending.clients,
          },
        };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isClient(value: unknown): value is AuthoringClientId {
  return value === "codex" || value === "claude-code";
}

function canonicalClients(clients: readonly AuthoringClientId[], allowEmpty = false): boolean {
  return (
    (allowEmpty || clients.length > 0) &&
    new Set(clients).size === clients.length &&
    AUTHORING_CLIENT_IDS.filter((id) => clients.includes(id)).join(",") === clients.join(",")
  );
}

function isCanonicalPortableHome(value: string): boolean {
  if (value.includes("\\") || value.includes("\0")) return false;
  if (value === "/" || /^[A-Za-z]:\/$/.test(value) || /^\/\/[^/]+\/[^/]+\/$/.test(value)) {
    return true;
  }
  const portableBody = value.startsWith("//")
    ? value.slice(2)
    : /^[A-Za-z]:\//.test(value)
      ? value.slice(3)
      : value.startsWith("/")
        ? value.slice(1)
        : undefined;
  if (portableBody === undefined || portableBody.length === 0 || value.endsWith("/")) return false;
  const segments = portableBody.split("/");
  if (value.startsWith("//") && segments.length < 2) return false;
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function expectedPortableDestination(home: string, client: AuthoringClientId): string {
  const suffix =
    client === "codex" ? ".agents/skills/wpm-create-package" : ".claude/skills/wpm-create-package";
  return `${home === "/" ? "" : home.replace(/\/$/, "")}/${suffix}`;
}

function expectedPortableLegacyPath(home: string, client: AuthoringClientId): string {
  const suffix =
    client === "codex" ? ".agents/skills/installer-builder" : ".claude/skills/installer-builder";
  return `${home === "/" ? "" : home.replace(/\/$/, "")}/${suffix}`;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function parseManaged(value: unknown): ManagedPersonalClient | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["client", "destination", "version", "sha256"]) ||
    !isClient(value.client) ||
    typeof value.destination !== "string" ||
    value.destination.length === 0 ||
    !isCanonicalIntegrationVersion(value.version) ||
    !isDigest(value.sha256)
  ) {
    return undefined;
  }
  return {
    client: value.client,
    destination: value.destination,
    version: value.version,
    sha256: value.sha256,
  };
}

function parseLegacyPlan(value: unknown): ApplyingPersonalLegacyPlan | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["path", "action", "fingerprint"]) ||
    typeof value.path !== "string" ||
    value.path.length === 0 ||
    (value.action !== "absent" && value.action !== "preserve" && value.action !== "remove")
  ) {
    return undefined;
  }
  if (value.action === "absent") {
    return value.fingerprint === null
      ? { path: value.path, action: "absent", fingerprint: null }
      : undefined;
  }
  if (typeof value.fingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.fingerprint)) {
    return undefined;
  }
  return { path: value.path, action: value.action, fingerprint: value.fingerprint };
}

function isOutcome(value: unknown): value is PersonalSetupOutcome {
  return (
    value === "installed" || value === "unchanged" || value === "updated" || value === "migrated"
  );
}

function parseClientPlan(value: unknown): ApplyingPersonalClientPlan | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "client",
      "destination",
      "outcome",
      "beforeSha256",
      "afterSha256",
      "legacy",
    ]) ||
    !isClient(value.client) ||
    typeof value.destination !== "string" ||
    value.destination.length === 0 ||
    !isOutcome(value.outcome) ||
    !(value.beforeSha256 === null || isDigest(value.beforeSha256)) ||
    !isDigest(value.afterSha256)
  ) {
    return undefined;
  }
  const legacy = parseLegacyPlan(value.legacy);
  if (legacy === undefined) return undefined;
  return {
    client: value.client,
    destination: value.destination,
    outcome: value.outcome,
    beforeSha256: value.beforeSha256 as string | null,
    afterSha256: value.afterSha256,
    legacy,
  };
}

function parseComplete(value: unknown): CompletePersonalAuthoringState | undefined {
  const parsed = parseStateValue(value);
  return parsed?.status === "complete" ? parsed : undefined;
}

function parseStateValue(value: unknown): PersonalAuthoringState | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      value.status === "applying"
        ? ["schemaVersion", "status", "home", "setupVersion", "defaults", "managed", "pending"]
        : ["schemaVersion", "status", "home", "setupVersion", "defaults", "managed"],
    ) ||
    value.schemaVersion !== 1 ||
    (value.status !== "complete" && value.status !== "applying") ||
    typeof value.home !== "string" ||
    !isCanonicalPortableHome(value.home) ||
    !isCanonicalIntegrationVersion(value.setupVersion) ||
    !Array.isArray(value.defaults) ||
    !value.defaults.every(isClient) ||
    !Array.isArray(value.managed)
  ) {
    return undefined;
  }
  const home = value.home as string;
  const defaults = value.defaults as AuthoringClientId[];
  if (!canonicalClients(defaults)) return undefined;
  const managed = value.managed.map(parseManaged);
  if (managed.some((entry) => entry === undefined)) return undefined;
  const managedRecords = managed as ManagedPersonalClient[];
  if (
    !canonicalClients(
      managedRecords.map(({ client }) => client),
      true,
    ) ||
    new Set(managedRecords.map(({ destination }) => destination)).size !== managedRecords.length
  ) {
    return undefined;
  }
  if (
    managedRecords.some(
      ({ client, destination }) => destination !== expectedPortableDestination(home, client),
    ) ||
    defaults.some((client) => {
      const record = managedRecords.find((managedRecord) => managedRecord.client === client);
      return record === undefined || record.version !== value.setupVersion;
    })
  ) {
    return undefined;
  }
  const base = {
    schemaVersion: 1 as const,
    home,
    setupVersion: value.setupVersion,
    defaults,
    managed: managedRecords,
  };
  if (value.status === "complete") {
    return { ...base, status: "complete" };
  }
  if (
    !isRecord(value.pending) ||
    !hasExactKeys(value.pending, [
      "requestKey",
      "sourceSha256",
      "quarantineRoot",
      "previous",
      "clients",
    ]) ||
    typeof value.pending.requestKey !== "string" ||
    value.pending.requestKey.length === 0 ||
    !isDigest(value.pending.sourceSha256) ||
    typeof value.pending.quarantineRoot !== "string" ||
    !Array.isArray(value.pending.clients)
  ) {
    return undefined;
  }
  const clients = value.pending.clients.map(parseClientPlan);
  if (clients.some((entry) => entry === undefined)) return undefined;
  const clientPlans = clients as ApplyingPersonalClientPlan[];
  if (
    !canonicalClients(clientPlans.map(({ client }) => client)) ||
    clientPlans.map(({ client }) => client).join(",") !== defaults.join(",")
  ) {
    return undefined;
  }
  let previous: CompletePersonalAuthoringState | null;
  if (value.pending.previous === null) {
    previous = null;
  } else {
    previous = parseComplete(value.pending.previous) ?? null;
    if (previous === null) return undefined;
  }
  if (previous !== null && previous.home !== base.home) return undefined;
  if (
    value.pending.requestKey !==
    personalSetupRequestKey(defaults, base.setupVersion, value.pending.sourceSha256)
  ) {
    return undefined;
  }
  if (
    value.pending.quarantineRoot !==
    personalSetupQuarantineRoot(base.home, value.pending.requestKey)
  ) {
    return undefined;
  }
  const previousByClient = new Map(
    (previous?.managed ?? []).map((record) => [record.client, record]),
  );
  for (const plan of clientPlans) {
    const prior = previousByClient.get(plan.client);
    const expectedOutcome: PersonalSetupOutcome =
      plan.legacy.action === "remove"
        ? "migrated"
        : prior !== undefined
          ? prior.sha256 === value.pending.sourceSha256
            ? "unchanged"
            : "updated"
          : plan.beforeSha256 === null
            ? "installed"
            : "unchanged";
    if (
      plan.destination !== expectedPortableDestination(base.home, plan.client) ||
      plan.legacy.path !== expectedPortableLegacyPath(base.home, plan.client) ||
      plan.afterSha256 !== value.pending.sourceSha256 ||
      (prior === undefined
        ? !(plan.beforeSha256 === null || plan.beforeSha256 === value.pending.sourceSha256)
        : plan.beforeSha256 !== prior.sha256) ||
      plan.outcome !== expectedOutcome
    ) {
      return undefined;
    }
  }
  const desiredByClient = new Map(previousByClient);
  for (const plan of clientPlans) {
    desiredByClient.set(plan.client, {
      client: plan.client,
      destination: plan.destination,
      version: base.setupVersion,
      sha256: value.pending.sourceSha256,
    });
  }
  const desiredManaged = AUTHORING_CLIENT_IDS.flatMap((client) => {
    const record = desiredByClient.get(client);
    return record === undefined ? [] : [record];
  });
  if (JSON.stringify(desiredManaged) !== JSON.stringify(base.managed)) return undefined;
  return {
    ...base,
    status: "applying",
    pending: {
      requestKey: value.pending.requestKey,
      sourceSha256: value.pending.sourceSha256,
      quarantineRoot: value.pending.quarantineRoot,
      previous,
      clients: clientPlans,
    },
  };
}

/** Strict schema + exact-canonical-byte parser for personal setup state. */
export function parsePersonalAuthoringState(text: string): PersonalAuthoringStateParseResult {
  try {
    const state = parseStateValue(JSON.parse(text));
    if (state === undefined) {
      return { ok: false, reason: "personal authoring state does not match schema version 1" };
    }
    if (serializePersonalAuthoringState(state) !== text) {
      return { ok: false, reason: "personal authoring state bytes are not canonical" };
    }
    return { ok: true, value: state };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Stable external-request identity; full path/legacy evidence remains bound in `pending.clients`. */
export function personalSetupRequestKey(
  clients: readonly AuthoringClientId[],
  version: string,
  sourceSha256: string,
): string {
  return `${version}|${sourceSha256}|${clients.join(",")}`;
}

/** Canonical portable private root bound one-to-one to an applying request. */
export function personalSetupQuarantineRoot(home: string, requestKey: string): string {
  const requestDigest = hashTextContent(requestKey).slice("sha256:".length);
  return `${home === "/" ? "" : home.replace(/\/$/, "")}/${PERSONAL_AUTHORING_QUARANTINE_DIRECTORY}/${requestDigest}`;
}
