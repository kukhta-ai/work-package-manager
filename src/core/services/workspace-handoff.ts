import { isAbsolute, posix, win32 } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import {
  AUTHORING_CLIENT_IDS,
  type AuthoringClientId,
  authoringClientFirstSkillInvocation,
  authoringClientReloadGuidance,
  listAuthoringClientDefinitions,
} from "./authoring-clients.js";
import {
  isCanonicalIntegrationVersion,
  WORKSPACE_INTEGRATION_STATE_PATH,
} from "./workspace-authoring-integration.js";

/** Exact root-relative prepared-handoff receipt. It is authoring state and never enters `wip/`. */
export const WORKSPACE_HANDOFF_RECEIPT_PATH = ".wpm-handoff.json";

/** Exact root-relative Backlog.md root named by every handoff receipt. */
export const WORKSPACE_HANDOFF_BACKLOG_PATH = ".authoring-backlog";

/** One configured client's actionable, process-free handoff facts. */
export interface WorkspaceHandoffClientReceipt {
  readonly id: AuthoringClientId;
  readonly launch: {
    readonly command: "codex" | "claude";
    readonly workingDirectory: string;
  };
  readonly workspaceSkillsDirectory: string;
  readonly frontDoor: "AGENTS.md" | "CLAUDE.md";
  readonly reload: {
    readonly kind: "automatic-with-restart-fallback" | "live-watch-with-new-directory-restart";
    readonly guidance: string;
  };
  readonly firstSkill: {
    readonly name: "wpm-author";
    readonly invocation: string;
  };
  readonly verification: {
    readonly command: "wpm";
    readonly args: readonly string[];
    readonly workingDirectory: string;
  };
}

interface WorkspaceHandoffReceiptBase {
  readonly schemaVersion: 1;
  readonly workspaceRoot: string;
  readonly integrationVersion: string;
  readonly managedStatePath: typeof WORKSPACE_INTEGRATION_STATE_PATH;
  readonly authoringBacklogPath: typeof WORKSPACE_HANDOFF_BACKLOG_PATH;
  readonly configuredClients: readonly AuthoringClientId[];
  readonly clients: readonly WorkspaceHandoffClientReceipt[];
}

/** Exact bounded partial-publication evidence; it is not a generic resume token. */
export interface PreparingWorkspaceHandoffReceipt extends WorkspaceHandoffReceiptBase {
  readonly status: "preparing";
  readonly requestKey: string;
}

/** Strict deterministic completion claim, with no retry journal retained after publication. */
export interface PreparedWorkspaceHandoffReceipt extends WorkspaceHandoffReceiptBase {
  readonly status: "prepared";
}

/** Strict deterministic sender/receiver contract for one prepared workspace. */
export type WorkspaceHandoffReceipt =
  | PreparingWorkspaceHandoffReceipt
  | PreparedWorkspaceHandoffReceipt;

export type WorkspaceHandoffReceiptParseResult =
  | { readonly ok: true; readonly value: WorkspaceHandoffReceipt }
  | { readonly ok: false; readonly reason: string };

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

function canonicalClients(values: readonly AuthoringClientId[]): readonly AuthoringClientId[] {
  const selected = new Set(values);
  return AUTHORING_CLIENT_IDS.filter((id) => selected.has(id));
}

function canonicalAbsoluteRoot(value: string): boolean {
  const portable = toPosix(value);
  if (portable !== value || /(^|\/)\.\.?($|\/)/.test(portable)) return false;
  if (/^[A-Za-z]:\//.test(portable)) {
    return (
      win32.isAbsolute(portable) &&
      toPosix(win32.normalize(portable)) === portable &&
      (/^[A-Za-z]:\/$/.test(portable) || !portable.endsWith("/"))
    );
  }
  return (
    isAbsolute(portable) &&
    !portable.startsWith("//") &&
    posix.normalize(portable) === portable &&
    (portable === "/" || !portable.endsWith("/"))
  );
}

function validRequestKey(value: string): boolean {
  return /^(?:init|handoff)\|sha256:[a-f0-9]{64}$/.test(value);
}

function clientReceipt(
  client: AuthoringClientId,
  workspaceRoot: string,
): WorkspaceHandoffClientReceipt {
  const definition = listAuthoringClientDefinitions().find(({ id }) => id === client);
  if (definition === undefined) throw new Error(`unsupported authoring client ${client}`);
  return {
    id: definition.id,
    launch: {
      command: definition.launch.command,
      workingDirectory: workspaceRoot,
    },
    workspaceSkillsDirectory: definition.workspaceSkillsDirectory,
    frontDoor: definition.workspaceFrontDoor,
    reload: {
      kind: definition.reload.kind,
      guidance: authoringClientReloadGuidance(definition.id),
    },
    firstSkill: {
      name: "wpm-author",
      invocation: authoringClientFirstSkillInvocation(definition.id),
    },
    verification: {
      command: "wpm",
      args: ["-C", workspaceRoot, "authoring", "handoff", "verify", "--client", definition.id],
      workingDirectory: workspaceRoot,
    },
  };
}

/** Construct canonical receipt data solely from durable workspace identity and the frozen client catalog. */
export function createWorkspaceHandoffReceipt(
  input:
    | {
        readonly status: "preparing";
        readonly workspaceRoot: string;
        readonly integrationVersion: string;
        readonly configuredClients: readonly AuthoringClientId[];
        readonly requestKey: string;
      }
    | {
        readonly status: "prepared";
        readonly workspaceRoot: string;
        readonly integrationVersion: string;
        readonly configuredClients: readonly AuthoringClientId[];
      },
): WorkspaceHandoffReceipt {
  const workspaceRoot = toPosix(input.workspaceRoot);
  if (!canonicalAbsoluteRoot(workspaceRoot)) {
    throw new Error("workspace handoff root must be canonical portable absolute text");
  }
  if (!isCanonicalIntegrationVersion(input.integrationVersion)) {
    throw new Error(
      "workspace handoff integration version must be canonical semantic-version text",
    );
  }
  if (input.status === "preparing" && !validRequestKey(input.requestKey)) {
    throw new Error("workspace handoff request key is invalid");
  }
  const configuredClients = canonicalClients(input.configuredClients);
  if (configuredClients.length === 0) {
    throw new Error("workspace handoff must configure at least one supported client");
  }
  const common = {
    schemaVersion: 1,
    workspaceRoot,
    integrationVersion: input.integrationVersion,
    managedStatePath: WORKSPACE_INTEGRATION_STATE_PATH,
    authoringBacklogPath: WORKSPACE_HANDOFF_BACKLOG_PATH,
    configuredClients,
    clients: configuredClients.map((client) => clientReceipt(client, workspaceRoot)),
  } as const;
  return input.status === "preparing"
    ? { ...common, status: "preparing", requestKey: input.requestKey }
    : { ...common, status: "prepared" };
}

/** Canonical newline-terminated JSON representation used for both ownership and publication. */
export function serializeWorkspaceHandoffReceipt(receipt: WorkspaceHandoffReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

/** Parse only exact canonical receipt bytes whose nested client facts still match the current frozen catalog. */
export function parseWorkspaceHandoffReceipt(text: string): WorkspaceHandoffReceiptParseResult {
  try {
    const value: unknown = JSON.parse(text);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      (value.status !== "preparing" && value.status !== "prepared") ||
      !hasExactKeys(value, [
        "schemaVersion",
        "status",
        "workspaceRoot",
        "integrationVersion",
        ...(value.status === "preparing" ? ["requestKey"] : []),
        "managedStatePath",
        "authoringBacklogPath",
        "configuredClients",
        "clients",
      ]) ||
      typeof value.workspaceRoot !== "string" ||
      !canonicalAbsoluteRoot(value.workspaceRoot) ||
      !isCanonicalIntegrationVersion(value.integrationVersion) ||
      (value.status === "preparing" &&
        (typeof value.requestKey !== "string" || !validRequestKey(value.requestKey))) ||
      value.managedStatePath !== WORKSPACE_INTEGRATION_STATE_PATH ||
      value.authoringBacklogPath !== WORKSPACE_HANDOFF_BACKLOG_PATH ||
      !Array.isArray(value.configuredClients) ||
      value.configuredClients.length === 0 ||
      !value.configuredClients.every(isClient) ||
      !Array.isArray(value.clients)
    ) {
      return { ok: false, reason: "handoff receipt does not match schema version 1" };
    }
    const common = {
      workspaceRoot: value.workspaceRoot,
      integrationVersion: value.integrationVersion,
      configuredClients: value.configuredClients,
    };
    const expected =
      value.status === "preparing"
        ? createWorkspaceHandoffReceipt({
            ...common,
            status: "preparing",
            requestKey: value.requestKey as string,
          })
        : createWorkspaceHandoffReceipt({ ...common, status: "prepared" });
    if (
      JSON.stringify(value) !== JSON.stringify(expected) ||
      text !== serializeWorkspaceHandoffReceipt(expected)
    ) {
      return { ok: false, reason: "handoff receipt is not exact canonical current-catalog data" };
    }
    return { ok: true, value: expected };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
