/**
 * The closed P0 authoring-client catalog. Authoring clients describe the coding agents used to author a WPM
 * package; they are deliberately independent of the target agents stored in `manifest.yml.targets`.
 */

/** Stable selectable authoring-client identifiers, in display order. */
export const AUTHORING_CLIENT_IDS = Object.freeze(["codex", "claude-code"] as const);

/** A stable identifier for a selectable P0 authoring client. */
export type AuthoringClientId = (typeof AUTHORING_CLIENT_IDS)[number];

/** Recognized identifiers whose authoring contracts are deliberately deferred from P0. */
export type DeferredAuthoringClientId = "hermes" | "openclaw";

/** The native facts shared by setup, workspace integration, handoff, verification, and help. */
export interface AuthoringClientDefinition {
  /** Stable machine identifier. */
  readonly id: AuthoringClientId;
  /** Consistent human-readable product name. */
  readonly displayName: string;
  /** Native personal skill directory, expressed relative to the user's home. */
  readonly personalSkillsDirectory: string;
  /** Native workspace-local skill directory. */
  readonly workspaceSkillsDirectory: string;
  /** Native instruction front door at the workspace root. */
  readonly workspaceFrontDoor: "AGENTS.md" | "CLAUDE.md";
  /** The advisory, read-only detection behavior for this client. */
  readonly detection: {
    readonly basis: "personal-config-directory";
    readonly path: string;
  };
  /** Native launch guidance. WPM reports it but never owns the client process. */
  readonly launch: {
    readonly command: "codex" | "claude";
    readonly workingDirectory: "workspace-root";
  };
  /** Native reload guidance, represented as a stable machine-readable rule. */
  readonly reload: {
    readonly kind: "automatic-with-restart-fallback" | "live-watch-with-new-directory-restart";
  };
}

/** A selectable catalog result; support never implies that setup has configured the client. */
export type SelectableAuthoringClient = AuthoringClientDefinition & {
  readonly supportStatus: "selectable";
  readonly selectable: true;
  readonly configured: false;
};

/** A recognized identifier whose current native contract is intentionally not supported. */
export interface DeferredAuthoringClient {
  readonly id: DeferredAuthoringClientId;
  readonly supportStatus: "deferred";
  readonly selectable: false;
  readonly configured: false;
  readonly reason: "contract-deferred";
}

/** An empty or unknown authoring-client identifier. */
export interface InvalidAuthoringClient {
  readonly id: string;
  readonly supportStatus: "invalid";
  readonly selectable: false;
  readonly configured: false;
  readonly reason: "empty" | "unknown";
}

/** The closed support evaluation returned for any caller-supplied identifier. */
export type AuthoringClientSupport =
  | SelectableAuthoringClient
  | DeferredAuthoringClient
  | InvalidAuthoringClient;

const DEFINITIONS: readonly AuthoringClientDefinition[] = [
  {
    id: "codex",
    displayName: "Codex",
    personalSkillsDirectory: "~/.agents/skills",
    workspaceSkillsDirectory: ".agents/skills",
    workspaceFrontDoor: "AGENTS.md",
    detection: { basis: "personal-config-directory", path: "~/.agents" },
    launch: { command: "codex", workingDirectory: "workspace-root" },
    reload: { kind: "automatic-with-restart-fallback" },
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    personalSkillsDirectory: "~/.claude/skills",
    workspaceSkillsDirectory: ".claude/skills",
    workspaceFrontDoor: "CLAUDE.md",
    detection: { basis: "personal-config-directory", path: "~/.claude" },
    launch: { command: "claude", workingDirectory: "workspace-root" },
    reload: { kind: "live-watch-with-new-directory-restart" },
  },
] as const;

const DEFERRED_IDS: readonly DeferredAuthoringClientId[] = ["hermes", "openclaw"];

function copyDefinition(definition: AuthoringClientDefinition): AuthoringClientDefinition {
  return {
    ...definition,
    detection: { ...definition.detection },
    launch: { ...definition.launch },
    reload: { ...definition.reload },
  };
}

/**
 * List the complete selectable P0 catalog in stable display order.
 *
 * @returns The Codex and Claude Code definitions.
 */
export function listAuthoringClientDefinitions(): readonly AuthoringClientDefinition[] {
  return DEFINITIONS.map(copyDefinition);
}

/**
 * Evaluate a raw authoring-client identifier without treating detection or deliverable targets as selection.
 *
 * @param raw - The exact caller-supplied identifier.
 * @returns A machine-distinguishable selectable, deferred, or invalid result.
 */
export function evaluateAuthoringClientId(raw: string): AuthoringClientSupport {
  const definition = DEFINITIONS.find(({ id }) => id === raw);
  if (definition !== undefined) {
    return {
      ...copyDefinition(definition),
      supportStatus: "selectable",
      selectable: true,
      configured: false,
    };
  }
  if ((DEFERRED_IDS as readonly string[]).includes(raw)) {
    return {
      id: raw as DeferredAuthoringClientId,
      supportStatus: "deferred",
      selectable: false,
      configured: false,
      reason: "contract-deferred",
    };
  }
  return {
    id: raw,
    supportStatus: "invalid",
    selectable: false,
    configured: false,
    reason: raw.trim().length === 0 ? "empty" : "unknown",
  };
}
