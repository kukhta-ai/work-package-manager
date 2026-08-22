import { posix, win32 } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import type { Environment, FileSystem } from "../ports/index.js";
import {
  type AuthoringClientDefinition,
  type AuthoringClientSupport,
  evaluateAuthoringClientId,
  listAuthoringClientDefinitions,
  type SelectableAuthoringClient,
} from "../services/authoring-clients.js";

/** Dependencies for read-only authoring-client inspection. */
export interface InspectAuthoringClientsDeps {
  /** Filesystem used only to observe native personal configuration roots. */
  readonly fs: FileSystem;
  /** Environment used only to resolve HOME. */
  readonly env: Environment;
}

/** The current advisory detection result for one selectable client. */
export type AuthoringClientDetection =
  | {
      readonly status: "detected" | "not-detected";
      readonly basis: "personal-config-directory";
      readonly observedPath: string;
    }
  | {
      readonly status: "unavailable";
      readonly basis: "personal-config-directory";
      readonly reason: "home-unavailable";
    };

/** A selectable authoring-client contract augmented with its current advisory detection result. */
export type InspectedAuthoringClient = SelectableAuthoringClient & {
  readonly currentDetection: AuthoringClientDetection;
};

function currentDetection(
  deps: InspectAuthoringClientsDeps,
  definition: AuthoringClientDefinition,
): AuthoringClientDetection {
  const home = deps.env.getEnv("HOME");
  const path = deps.env.platform() === "win32" ? win32 : posix;
  if (home === undefined || home.length === 0 || !path.isAbsolute(home)) {
    return {
      status: "unavailable",
      basis: "personal-config-directory",
      reason: "home-unavailable",
    };
  }
  const relativePath = definition.detection.path.slice(2);
  const observedPath = path.join(home, relativePath);
  let detected = false;
  if (deps.fs.exists(observedPath)) {
    try {
      // `exists` deliberately accepts files and directories. Listing is the narrow existing-port probe that
      // proves this particular observation is the config DIRECTORY the contract names, while remaining
      // read-only and following directory symlinks in the real adapter.
      deps.fs.list(observedPath);
      detected = true;
    } catch {
      // A file, disappeared path, or unreadable/non-directory entry is not positive detection evidence.
      detected = false;
    }
  }
  return {
    status: detected ? "detected" : "not-detected",
    basis: "personal-config-directory",
    observedPath: toPosix(observedPath),
  };
}

/**
 * Inspect every selectable P0 client without selecting or configuring any of them.
 *
 * @param deps - Existing injected filesystem and environment ports.
 * @returns Stable Codex/Claude Code contracts with current advisory detection.
 */
export function inspectAuthoringClients(
  deps: InspectAuthoringClientsDeps,
): readonly InspectedAuthoringClient[] {
  return listAuthoringClientDefinitions().map((definition) => ({
    ...definition,
    supportStatus: "selectable",
    selectable: true,
    configured: false,
    currentDetection: currentDetection(deps, definition),
  }));
}

/**
 * Inspect or evaluate one raw authoring-client identifier.
 *
 * @param deps - Existing injected filesystem and environment ports.
 * @param raw - Exact caller-supplied identifier.
 * @returns A detected selectable contract, or a deferred/invalid support result.
 */
export function inspectAuthoringClient(
  deps: InspectAuthoringClientsDeps,
  raw: string,
):
  | InspectedAuthoringClient
  | Exclude<AuthoringClientSupport, { readonly supportStatus: "selectable" }> {
  const support = evaluateAuthoringClientId(raw);
  if (support.supportStatus !== "selectable") {
    return support;
  }
  return {
    ...support,
    currentDetection: currentDetection(deps, support),
  };
}
