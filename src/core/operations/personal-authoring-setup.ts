import { posix, win32 } from "node:path";
import { compareCodeUnits } from "../../util/code-unit-order.js";
import { toPosix } from "../../util/posix-path.js";
import {
  type MutationBoundary,
  type PersonalAuthoringSetupBlocker,
  type PersonalAuthoringSetupClientProgress,
  PersonalAuthoringSetupMutationFailure,
  PersonalAuthoringSetupPreflightError,
} from "../errors.js";
import type { DirEntry, Environment, FileSystem, PathInspection } from "../ports/index.js";
import {
  AUTHORING_CLIENT_IDS,
  type AuthoringClientDefinition,
  type AuthoringClientId,
  authoringClientReloadGuidance,
  evaluateAuthoringClientId,
  listAuthoringClientDefinitions,
} from "../services/authoring-clients.js";
import { hashTextContent } from "../services/integrity.js";
import {
  type ApplyingPersonalAuthoringState,
  type ApplyingPersonalClientPlan,
  type CompletePersonalAuthoringState,
  LEGACY_PERSONAL_SKILL_NAME,
  type ManagedPersonalClient,
  PERSONAL_AUTHORING_QUARANTINE_DIRECTORY,
  PERSONAL_AUTHORING_STATE_PATH,
  PERSONAL_BOOTSTRAP_SKILL_NAME,
  type PersonalSetupOutcome,
  parsePersonalAuthoringState,
  personalSetupQuarantineRoot,
  personalSetupRequestKey,
  serializePersonalAuthoringState,
} from "../services/personal-authoring-setup.js";
import { isCanonicalIntegrationVersion } from "../services/workspace-authoring-integration.js";

/** The two existing ports used by projectless personal setup. */
export interface PersonalAuthoringSetupDeps {
  readonly fs: FileSystem;
  readonly env: Environment;
}

/** One explicit, complete personal-setup request. */
export interface PersonalAuthoringSetupInput {
  readonly bundledSkillsRoot: string;
  readonly clientIds: readonly string[];
  readonly setupVersion: string;
}

export type PersonalLegacyResult = "absent" | "migrated" | "preserved-unowned-or-modified";

/** Stable per-client successful setup result. */
export interface PersonalAuthoringSetupClientResult {
  readonly id: AuthoringClientId;
  readonly destination: string;
  readonly outcome: PersonalSetupOutcome;
  readonly legacy: PersonalLegacyResult;
  readonly changed: boolean;
  readonly reloadGuidance?: string;
  readonly nextAction: "$wpm-create-package" | "/wpm-create-package";
}

/** Structured success for one complete selected set. */
export interface PersonalAuthoringSetupResult {
  readonly status: "complete";
  readonly summary: string;
  readonly selectedClients: readonly AuthoringClientId[];
  readonly defaults: readonly AuthoringClientId[];
  readonly statePath: string;
  readonly clients: readonly PersonalAuthoringSetupClientResult[];
  readonly changedPaths: readonly string[];
  readonly setupApplied: true;
}

/** Read-only, fully preflighted selection used only to show one combined interactive confirmation. */
export interface PersonalAuthoringSetupPreview {
  readonly status: "ready";
  readonly selectedClients: readonly AuthoringClientId[];
  readonly statePath: string;
  readonly clients: readonly {
    readonly id: AuthoringClientId;
    readonly destination: string;
    readonly outcome: PersonalSetupOutcome;
    readonly legacy: PersonalLegacyResult;
    readonly changed: boolean;
  }[];
}

/** One immutable setup plan held across an interactive confirmation boundary. */
export interface PreparedPersonalAuthoringSetup {
  readonly preview: PersonalAuthoringSetupPreview;
  /** Apply only the captured plan; every effect preimage is checked again immediately. */
  apply(): PersonalAuthoringSetupResult;
}

interface CapturedSkillSource {
  readonly content: string;
  readonly sha256: string;
}

interface TreeEntry {
  readonly path: string;
  readonly kind: "directory" | "file" | "symbolic-link" | "other";
  readonly sha256?: string;
  readonly target?: string;
}

interface TreeObservation {
  readonly entries: readonly TreeEntry[];
  readonly fingerprint: string;
}

function isExactTreeSubset(
  candidate: readonly TreeEntry[],
  complete: readonly TreeEntry[],
): boolean {
  return candidate.every((entry) =>
    complete.some((expected) => JSON.stringify(expected) === JSON.stringify(entry)),
  );
}

interface LegacyObservation {
  readonly kind: "absent" | "tree" | "other";
  readonly fingerprint: string | null;
  readonly entries?: readonly TreeEntry[];
}

interface SkillObservation {
  readonly kind: "missing" | "exact" | "ambiguous";
  readonly sha256?: string;
  readonly message?: string;
}

type PrivateFileObservation =
  | { readonly kind: "missing" }
  | { readonly kind: "file"; readonly sha256: string }
  | { readonly kind: "other"; readonly message: string };

interface PlannedClient {
  readonly definition: AuthoringClientDefinition;
  readonly nativeDestination: string;
  readonly nativeLegacyPath: string;
  readonly currentQuarantinePath: string;
  readonly legacyQuarantinePath: string;
  /** Exact legacy observation captured for the next immediate preimage check. */
  readonly legacyPreimageFingerprint: string | null;
  readonly plan: ApplyingPersonalClientPlan;
  readonly needsWrite: boolean;
  readonly needsLegacyRemoval: boolean;
}

interface SetupPlan {
  readonly clients: readonly AuthoringClientId[];
  readonly nativeHome: string;
  readonly statePath: string;
  readonly quarantineRoot: string;
  readonly applyingStateQuarantinePath: string;
  readonly completeStateQuarantinePath: string;
  readonly stateTextBefore?: string;
  readonly stateSha256Before?: string;
  readonly applyingStatePreimageSha256?: string;
  readonly applyingState: ApplyingPersonalAuthoringState;
  readonly completeState: CompletePersonalAuthoringState;
  readonly sourceContent: string;
  readonly plannedClients: readonly PlannedClient[];
  readonly retrying: boolean;
  readonly resumeStage: "applying" | "complete";
  readonly noMutation: boolean;
}

function clientQuarantinePath(
  api: typeof posix | typeof win32,
  quarantineRoot: string,
  client: AuthoringClientId,
  kind: "current.preimage" | "legacy",
): string {
  return api.join(quarantineRoot, client, kind);
}

function assertEffectConfinement(
  deps: PersonalAuthoringSetupDeps,
  plannedHome: string,
  relativeDirectory: string,
): void {
  const blockers: PersonalAuthoringSetupBlocker[] = [];
  const observedHome = inspectHome(deps, blockers);
  if (
    observedHome === undefined ||
    comparablePath(deps.env, observedHome.native) !== comparablePath(deps.env, plannedHome)
  ) {
    throw new Error("HOME identity changed after personal setup preflight");
  }
  inspectDirectoryAncestors(deps, plannedHome, relativeDirectory, blockers, {
    surface: "destination",
  });
  if (blockers.length > 0) {
    throw new Error(blockers.map(({ code, path }) => `${code}${path ? `:${path}` : ""}`).join(","));
  }
}

function addBlocker(
  blockers: PersonalAuthoringSetupBlocker[],
  blocker: PersonalAuthoringSetupBlocker,
): void {
  const identity = `${blocker.code}|${blocker.client ?? ""}|${blocker.path ?? ""}`;
  if (
    !blockers.some(
      (existing) => `${existing.code}|${existing.client ?? ""}|${existing.path ?? ""}` === identity,
    )
  ) {
    blockers.push(blocker);
  }
}

function pathApi(env: Environment): typeof posix | typeof win32 {
  return env.platform() === "win32" ? win32 : posix;
}

function comparablePath(env: Environment, path: string): string {
  const portable = toPosix(path).replace(/^\/(?=[A-Za-z]:\/)/, "");
  return env.platform() === "win32" ? portable.toLowerCase() : portable;
}

function normalizeClients(
  raw: readonly string[],
  blockers: PersonalAuthoringSetupBlocker[],
): readonly AuthoringClientId[] {
  if (raw.length === 0) {
    addBlocker(blockers, {
      code: "personal-clients-empty",
      surface: "selection",
      message: "personal authoring-client selection is empty",
      recovery: "select at least one supported client: codex and/or claude-code",
    });
  }
  for (const id of raw) {
    const support = evaluateAuthoringClientId(id);
    if (support.supportStatus !== "selectable") {
      addBlocker(blockers, {
        code: "personal-client-unsupported",
        surface: "selection",
        client: id,
        message: `authoring client ${JSON.stringify(id)} is ${support.supportStatus}`,
        recovery: "select only the supported IDs codex and/or claude-code",
      });
    }
  }
  const selected = new Set(raw);
  return AUTHORING_CLIENT_IDS.filter((id) => selected.has(id));
}

function safeInspect(
  fs: FileSystem,
  path: string,
  blockers: PersonalAuthoringSetupBlocker[],
  input: {
    readonly code: string;
    readonly surface: PersonalAuthoringSetupBlocker["surface"];
    readonly client?: string;
    readonly recovery: string;
  },
): PathInspection | undefined {
  try {
    return fs.inspectPath(path);
  } catch (error) {
    addBlocker(blockers, {
      ...input,
      path: toPosix(path),
      message: `cannot inspect ${toPosix(path)}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

function inspectHome(
  deps: PersonalAuthoringSetupDeps,
  blockers: PersonalAuthoringSetupBlocker[],
): { readonly native: string; readonly portable: string } | undefined {
  const raw = deps.env.getEnv("HOME");
  const api = pathApi(deps.env);
  if (raw === undefined || raw.length === 0 || !api.isAbsolute(raw)) {
    addBlocker(blockers, {
      code: "personal-home-unavailable",
      surface: "home",
      message: "HOME must identify one absolute existing personal root",
      recovery: "set HOME to the exact non-aliased personal root and repeat setup",
    });
    return undefined;
  }
  const native = api.normalize(raw);
  if (comparablePath(deps.env, raw) !== comparablePath(deps.env, native)) {
    addBlocker(blockers, {
      code: "personal-home-noncanonical",
      surface: "home",
      path: toPosix(raw),
      message: `HOME is not its canonical lexical identity ${toPosix(native)}`,
      recovery: "repeat setup with HOME set to the exact canonical directory",
    });
    return undefined;
  }
  if (api.parse(native).root === native) {
    addBlocker(blockers, {
      code: "personal-home-invalid",
      surface: "home",
      path: toPosix(native),
      message: "HOME cannot be a filesystem or volume root",
      recovery: "set HOME to one exact non-root personal directory and repeat setup",
    });
    return undefined;
  }
  const inspected = safeInspect(deps.fs, native, blockers, {
    code: "personal-home-unreadable",
    surface: "home",
    recovery: "restore readable access to the exact HOME directory and repeat setup",
  });
  if (inspected === undefined) return undefined;
  if (inspected.kind !== "directory") {
    addBlocker(blockers, {
      code: "personal-home-invalid",
      surface: "home",
      path: toPosix(native),
      message: `HOME is ${inspected.kind}, not a regular directory`,
      recovery: "use the exact non-aliased existing HOME directory",
    });
    return undefined;
  }
  try {
    const canonical = deps.fs.canonicalPath(native);
    if (comparablePath(deps.env, canonical) !== comparablePath(deps.env, native)) {
      addBlocker(blockers, {
        code: "personal-home-noncanonical",
        surface: "home",
        path: toPosix(native),
        message: `HOME resolves to a different canonical path ${toPosix(canonical)}`,
        recovery: "repeat setup with HOME set to the exact canonical directory",
      });
      return undefined;
    }
    deps.fs.list(native);
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-home-unreadable",
      surface: "home",
      path: toPosix(native),
      message: `HOME cannot be read canonically: ${error instanceof Error ? error.message : String(error)}`,
      recovery: "restore readable access to the exact HOME directory and repeat setup",
    });
    return undefined;
  }
  return { native, portable: toPosix(native) };
}

function inspectDirectoryAncestors(
  deps: PersonalAuthoringSetupDeps,
  home: string,
  relativeDirectory: string,
  blockers: PersonalAuthoringSetupBlocker[],
  input: { readonly client?: AuthoringClientId; readonly surface: "destination" | "managed-state" },
): void {
  const api = pathApi(deps.env);
  let current = home;
  for (const segment of relativeDirectory.split("/").filter((value) => value.length > 0)) {
    current = api.join(current, segment);
    const inspected = safeInspect(deps.fs, current, blockers, {
      code: "personal-destination-unreadable",
      surface: input.surface,
      ...(input.client === undefined ? {} : { client: input.client }),
      recovery: "restore a regular non-aliased directory ancestor or choose another HOME",
    });
    if (inspected === undefined || inspected.kind === "missing") return;
    if (inspected.kind !== "directory") {
      addBlocker(blockers, {
        code: "personal-destination-ancestor-invalid",
        surface: input.surface,
        ...(input.client === undefined ? {} : { client: input.client }),
        path: toPosix(current),
        message: `destination ancestor is ${inspected.kind}, not a regular directory`,
        recovery: "restore a regular non-aliased directory ancestor or choose another HOME",
      });
      return;
    }
    try {
      if (
        comparablePath(deps.env, deps.fs.canonicalPath(current)) !==
        comparablePath(deps.env, current)
      ) {
        addBlocker(blockers, {
          code: "personal-destination-ancestor-noncanonical",
          surface: input.surface,
          ...(input.client === undefined ? {} : { client: input.client }),
          path: toPosix(current),
          message: "destination ancestor resolves outside its lexical HOME path",
          recovery: "replace the aliased ancestor with a regular directory before setup",
        });
        return;
      }
      deps.fs.list(current);
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-destination-unreadable",
        surface: input.surface,
        ...(input.client === undefined ? {} : { client: input.client }),
        path: toPosix(current),
        message: `destination ancestor is unreadable: ${error instanceof Error ? error.message : String(error)}`,
        recovery: "restore readable access to the regular destination ancestor",
      });
      return;
    }
  }
}

function inspectMutationCapability(
  deps: PersonalAuthoringSetupDeps,
  path: string,
  blockers: PersonalAuthoringSetupBlocker[],
  input: {
    readonly client?: AuthoringClientId;
    readonly surface: "destination" | "managed-state" | "ownership";
  },
): void {
  try {
    const capability = deps.fs.inspectMutationCapability(path);
    if (capability.capable) return;
    addBlocker(blockers, {
      code: "personal-destination-not-writable",
      surface: input.surface,
      ...(input.client === undefined ? {} : { client: input.client }),
      path: toPosix(path),
      message: `selected setup path is not currently mutable: ${capability.reason}`,
      recovery: "restore write access to the named personal path and repeat the identical request",
    });
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-destination-not-writable",
      surface: input.surface,
      ...(input.client === undefined ? {} : { client: input.client }),
      path: toPosix(path),
      message: `cannot establish mutation capability: ${error instanceof Error ? error.message : String(error)}`,
      recovery: "restore inspectable write access to the named personal path and repeat setup",
    });
  }
}

function inspectMutationCompatibility(
  deps: PersonalAuthoringSetupDeps,
  publicPath: string,
  quarantinePath: string,
  blockers: PersonalAuthoringSetupBlocker[],
  input: {
    readonly client?: AuthoringClientId;
    readonly surface: "destination" | "managed-state" | "ownership";
  },
): void {
  try {
    const capability = deps.fs.inspectMutationCompatibility(publicPath, quarantinePath);
    if (capability.capable) return;
    addBlocker(blockers, {
      code: "personal-quarantine-device-incompatible",
      surface: input.surface,
      ...(input.client === undefined ? {} : { client: input.client }),
      path: toPosix(publicPath),
      message: capability.reason,
      recovery: "use a HOME whose selected client and WPM-private state paths share one device",
    });
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-quarantine-device-incompatible",
      surface: input.surface,
      ...(input.client === undefined ? {} : { client: input.client }),
      path: toPosix(publicPath),
      message: error instanceof Error ? error.message : String(error),
      recovery: "restore inspectable same-device personal paths and repeat setup",
    });
  }
}

function snapshotTree(fs: FileSystem, root: string): TreeObservation {
  const entries: TreeEntry[] = [];
  const walk = (directory: string, relative: string): void => {
    const listed = [...fs.list(directory)].sort((a, b) => compareCodeUnits(a.name, b.name));
    for (const entry of listed) {
      const absolute = posix.join(directory.replaceAll("\\", "/"), entry.name);
      // Keep the native prefix/dialect for the effect port; only the relative identity is portable.
      const nativeAbsolute = directory.includes("\\")
        ? win32.join(directory, entry.name)
        : posix.join(directory, entry.name);
      const childRelative = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const inspected = fs.inspectPath(nativeAbsolute);
      if (inspected.kind === "directory") {
        entries.push({ path: childRelative, kind: "directory" });
        walk(nativeAbsolute, childRelative);
      } else if (inspected.kind === "file") {
        entries.push({ path: childRelative, kind: "file", sha256: fs.digestFile(nativeAbsolute) });
      } else if (inspected.kind === "symbolic-link") {
        entries.push({ path: childRelative, kind: "symbolic-link", target: inspected.target });
      } else if (inspected.kind === "other") {
        entries.push({ path: childRelative, kind: "other" });
      } else {
        throw new Error(`tree entry disappeared during inspection: ${absolute}`);
      }
    }
  };
  walk(root, "");
  return { entries, fingerprint: hashTextContent(JSON.stringify(entries)) };
}

function inspectPackagedSources(
  deps: PersonalAuthoringSetupDeps,
  input: PersonalAuthoringSetupInput,
  blockers: PersonalAuthoringSetupBlocker[],
): { readonly current?: CapturedSkillSource; readonly legacy?: TreeObservation } {
  const api = pathApi(deps.env);
  const currentRoot = api.join(input.bundledSkillsRoot, PERSONAL_BOOTSTRAP_SKILL_NAME);
  const currentInspection = safeInspect(deps.fs, currentRoot, blockers, {
    code: "personal-source-invalid",
    surface: "packaged-content",
    recovery: "repair or reinstall the exact WPM package before setup",
  });
  let current: CapturedSkillSource | undefined;
  if (currentInspection?.kind !== "directory") {
    if (currentInspection !== undefined) {
      addBlocker(blockers, {
        code: "personal-source-invalid",
        surface: "packaged-content",
        path: toPosix(currentRoot),
        message: `packaged ${PERSONAL_BOOTSTRAP_SKILL_NAME} source is ${currentInspection.kind}`,
        recovery: "repair or reinstall the exact WPM package before setup",
      });
    }
  } else {
    try {
      const entries = deps.fs.list(currentRoot);
      const skillPath = api.join(currentRoot, "SKILL.md");
      if (
        entries.length !== 1 ||
        entries[0]?.name !== "SKILL.md" ||
        deps.fs.inspectPath(skillPath).kind !== "file"
      ) {
        throw new Error("expected one regular SKILL.md and no other packaged entries");
      }
      current = deps.fs.readWithDigest(skillPath);
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-source-invalid",
        surface: "packaged-content",
        path: toPosix(currentRoot),
        message: `packaged bootstrap source is unusable: ${error instanceof Error ? error.message : String(error)}`,
        recovery: "repair or reinstall the exact WPM package before setup",
      });
    }
  }

  const legacyRoot = api.join(input.bundledSkillsRoot, LEGACY_PERSONAL_SKILL_NAME);
  const legacyInspection = safeInspect(deps.fs, legacyRoot, blockers, {
    code: "personal-legacy-source-invalid",
    surface: "packaged-content",
    recovery: "repair or reinstall the WPM package containing exact legacy migration evidence",
  });
  let legacy: TreeObservation | undefined;
  if (legacyInspection?.kind !== "directory") {
    if (legacyInspection !== undefined) {
      addBlocker(blockers, {
        code: "personal-legacy-source-invalid",
        surface: "packaged-content",
        path: toPosix(legacyRoot),
        message: `packaged legacy source is ${legacyInspection.kind}`,
        recovery: "repair or reinstall the WPM package containing exact legacy migration evidence",
      });
    }
  } else {
    try {
      legacy = snapshotTree(deps.fs, legacyRoot);
      if (
        legacy.entries.length === 0 ||
        legacy.entries.some(({ kind }) => kind !== "file" && kind !== "directory")
      ) {
        throw new Error("legacy source must be one non-empty regular file tree");
      }
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-legacy-source-invalid",
        surface: "packaged-content",
        path: toPosix(legacyRoot),
        message: `packaged legacy source is unusable: ${error instanceof Error ? error.message : String(error)}`,
        recovery: "repair or reinstall the WPM package containing exact legacy migration evidence",
      });
    }
  }
  return { current, legacy };
}

function inspectSkillDestination(
  fs: FileSystem,
  path: string,
  blockers: PersonalAuthoringSetupBlocker[],
  client: AuthoringClientId,
): SkillObservation {
  const inspected = safeInspect(fs, path, blockers, {
    code: "personal-destination-unreadable",
    surface: "destination",
    client,
    recovery: "restore readable access or move the conflicting current bootstrap destination",
  });
  if (inspected === undefined) return { kind: "ambiguous", message: "inspection failed" };
  if (inspected.kind === "missing") return { kind: "missing" };
  if (inspected.kind !== "directory") {
    return { kind: "ambiguous", message: `destination is ${inspected.kind}` };
  }
  try {
    const entries = fs.list(path);
    const api = path.includes("\\") ? win32 : posix;
    const skillPath = api.join(path, "SKILL.md");
    if (
      entries.length !== 1 ||
      entries[0]?.name !== "SKILL.md" ||
      fs.inspectPath(skillPath).kind !== "file"
    ) {
      return { kind: "ambiguous", message: "destination is not the exact one-file skill tree" };
    }
    return { kind: "exact", sha256: fs.digestFile(skillPath) };
  } catch (error) {
    return {
      kind: "ambiguous",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function inspectLegacyDestination(fs: FileSystem, path: string): LegacyObservation {
  try {
    const inspected = fs.inspectPath(path);
    if (inspected.kind === "missing") return { kind: "absent", fingerprint: null };
    if (inspected.kind === "directory") {
      try {
        const tree = snapshotTree(fs, path);
        return { kind: "tree", fingerprint: tree.fingerprint, entries: tree.entries };
      } catch {
        return {
          kind: "other",
          fingerprint: hashTextContent("unreadable-directory"),
        };
      }
    }
    if (inspected.kind === "file") {
      try {
        return {
          kind: "other",
          fingerprint: hashTextContent(`file:${fs.digestFile(path)}`),
        };
      } catch {
        return { kind: "other", fingerprint: hashTextContent("unreadable-file") };
      }
    }
    return { kind: "other", fingerprint: hashTextContent(JSON.stringify(inspected)) };
  } catch {
    return { kind: "other", fingerprint: hashTextContent("unreadable-path") };
  }
}

function inspectPrivateFile(fs: FileSystem, path: string): PrivateFileObservation {
  try {
    const inspected = fs.inspectPath(path);
    if (inspected.kind === "missing") return { kind: "missing" };
    if (inspected.kind !== "file") {
      return { kind: "other", message: `private evidence is ${inspected.kind}` };
    }
    return { kind: "file", sha256: fs.digestFile(path) };
  } catch (error) {
    return {
      kind: "other",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function quarantineBlocker(
  blockers: PersonalAuthoringSetupBlocker[],
  path: string,
  message: string,
): void {
  addBlocker(blockers, {
    code: "personal-quarantine-invalid",
    surface: "managed-state",
    path: toPosix(path),
    message,
    recovery: "preserve and reconcile the request-bound WPM quarantine evidence explicitly",
  });
}

function quarantineUnreadableBlocker(
  blockers: PersonalAuthoringSetupBlocker[],
  path: string,
  error: unknown,
): void {
  addBlocker(blockers, {
    code: "personal-quarantine-unreadable",
    surface: "managed-state",
    path: toPosix(path),
    message: `cannot inspect request-bound quarantine: ${error instanceof Error ? error.message : String(error)}`,
    recovery:
      "restore readable access to the WPM-private quarantine and repeat the identical request",
  });
}

function inspectUnboundQuarantineParent(
  deps: PersonalAuthoringSetupDeps,
  home: string,
  blockers: PersonalAuthoringSetupBlocker[],
): void {
  const api = pathApi(deps.env);
  const parent = api.join(home, PERSONAL_AUTHORING_QUARANTINE_DIRECTORY);
  const inspected = safeInspect(deps.fs, parent, blockers, {
    code: "personal-quarantine-unreadable",
    surface: "managed-state",
    recovery:
      "restore readable access to the WPM-private quarantine and repeat the identical request",
  });
  if (inspected === undefined) return;
  const parentKind = inspected.kind;
  if (parentKind === "missing") return;
  if (parentKind !== "directory") {
    quarantineBlocker(blockers, parent, `personal quarantine root is ${parentKind}`);
    return;
  }
  let entries: readonly DirEntry[];
  try {
    entries = [...deps.fs.list(parent)].sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    );
  } catch (error) {
    quarantineUnreadableBlocker(blockers, parent, error);
    return;
  }
  for (const entry of entries) {
    quarantineBlocker(
      blockers,
      api.join(parent, entry.name),
      "an unbound personal-setup quarantine generation is present",
    );
  }
}

function inspectQuarantineInventory(
  deps: PersonalAuthoringSetupDeps,
  input: {
    readonly home: string;
    readonly quarantineRoot: string;
    readonly retrying: boolean;
    readonly applyingState: ApplyingPersonalAuthoringState;
    readonly completeState: CompletePersonalAuthoringState;
    readonly plannedClients: readonly PlannedClient[];
  },
  blockers: PersonalAuthoringSetupBlocker[],
): void {
  const api = pathApi(deps.env);
  const parent = api.join(input.home, PERSONAL_AUTHORING_QUARANTINE_DIRECTORY);
  const inspectedParent = safeInspect(deps.fs, parent, blockers, {
    code: "personal-quarantine-unreadable",
    surface: "managed-state",
    recovery:
      "restore readable access to the WPM-private quarantine and repeat the identical request",
  });
  if (inspectedParent === undefined) return;
  const parentKind = inspectedParent.kind;
  if (parentKind === "missing") return;
  if (parentKind !== "directory") {
    quarantineBlocker(blockers, parent, `personal quarantine root is ${parentKind}`);
    return;
  }
  const rootName = api.basename(input.quarantineRoot);
  let parentEntries: readonly DirEntry[];
  try {
    parentEntries = [...deps.fs.list(parent)].sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    );
  } catch (error) {
    quarantineUnreadableBlocker(blockers, parent, error);
    return;
  }
  for (const entry of parentEntries) {
    if (entry.name !== rootName || entry.kind !== "directory") {
      quarantineBlocker(
        blockers,
        api.join(parent, entry.name),
        "an unbound personal-setup quarantine generation is present",
      );
    }
  }
  const inspectedRoot = safeInspect(deps.fs, input.quarantineRoot, blockers, {
    code: "personal-quarantine-unreadable",
    surface: "managed-state",
    recovery:
      "restore readable access to the WPM-private quarantine and repeat the identical request",
  });
  if (inspectedRoot === undefined) return;
  const rootKind = inspectedRoot.kind;
  if (rootKind === "missing") return;
  if (rootKind !== "directory") {
    quarantineBlocker(blockers, input.quarantineRoot, `request quarantine is ${rootKind}`);
    return;
  }
  const allowedScaffoldingDirectories = new Set<string>(
    input.plannedClients.map(({ plan }) => plan.client),
  );
  const allowedRetryDirectories = new Set<string>(
    input.plannedClients.flatMap(({ plan }) => [
      plan.client,
      `${plan.client}/legacy`,
      `${plan.client}/legacy.displaced`,
    ]),
  );
  let tree: TreeObservation;
  try {
    tree = snapshotTree(deps.fs, input.quarantineRoot);
  } catch (error) {
    quarantineUnreadableBlocker(blockers, input.quarantineRoot, error);
    return;
  }
  if (!input.retrying) {
    for (const entry of tree.entries) {
      if (entry.kind !== "directory" || !allowedScaffoldingDirectories.has(entry.path)) {
        quarantineBlocker(
          blockers,
          api.join(input.quarantineRoot, ...entry.path.split("/")),
          "quarantine evidence exists without its exact applying state",
        );
      }
    }
    return;
  }

  const entryPaths = new Set(tree.entries.map((entry) => entry.path));
  const displacedSlots = new Map<string, string>([
    ["state-applying.preimage.displaced", "state-applying.preimage"],
    ["state-complete.preimage.displaced", "state-complete.preimage"],
  ]);
  for (const { plan } of input.plannedClients) {
    displacedSlots.set(
      `${plan.client}/current.preimage.displaced`,
      `${plan.client}/current.preimage`,
    );
    displacedSlots.set(`${plan.client}/legacy.displaced`, `${plan.client}/legacy`);
  }
  for (const [displacedPath, retainedPath] of displacedSlots) {
    if (entryPaths.has(displacedPath) && !entryPaths.has(retainedPath)) {
      quarantineBlocker(
        blockers,
        api.join(input.quarantineRoot, ...displacedPath.split("/")),
        "displaced quarantine evidence has no exact retained preimage",
      );
    }
  }
  const publicStatePath = api.join(input.home, PERSONAL_AUTHORING_STATE_PATH);
  const publicState = safeInspect(deps.fs, publicStatePath, blockers, {
    code: "personal-state-unreadable",
    surface: "managed-state",
    recovery: "restore readable access to the exact personal setup state",
  });
  for (const displacedStatePath of [
    "state-applying.preimage.displaced",
    "state-complete.preimage.displaced",
  ]) {
    if (
      entryPaths.has(displacedStatePath) &&
      publicState !== undefined &&
      publicState.kind !== "missing"
    ) {
      quarantineBlocker(
        blockers,
        api.join(input.quarantineRoot, displacedStatePath),
        "displaced state evidence conflicts with a present public state path",
      );
    }
  }
  const hasApplyingStateEvidence = tree.entries.some((entry) =>
    entry.path.startsWith("state-applying.preimage"),
  );
  const hasCompleteStateEvidence = tree.entries.some((entry) =>
    entry.path.startsWith("state-complete.preimage"),
  );
  if (hasApplyingStateEvidence && hasCompleteStateEvidence) {
    quarantineBlocker(
      blockers,
      input.quarantineRoot,
      "request quarantine mixes applying-state and complete-state generations",
    );
  }
  const hasClientEvidence = tree.entries.some(
    (entry) =>
      !entry.path.startsWith("state-") &&
      !(entry.kind === "directory" && allowedScaffoldingDirectories.has(entry.path)),
  );
  if ((hasApplyingStateEvidence || hasCompleteStateEvidence) && hasClientEvidence) {
    quarantineBlocker(
      blockers,
      input.quarantineRoot,
      "request quarantine mixes state and client mutation generations",
    );
  }

  const stateApplyingText = serializePersonalAuthoringState(input.applyingState);
  const stateCompleteText = serializePersonalAuthoringState(input.completeState);
  const expectedFiles = new Map<string, string | undefined>([
    [
      "state-applying.preimage",
      input.applyingState.pending.previous === null
        ? undefined
        : hashTextContent(
            serializePersonalAuthoringState(input.applyingState.pending.previous),
          ).slice("sha256:".length),
    ],
    [
      "state-applying.preimage.displaced",
      input.applyingState.pending.previous === null
        ? undefined
        : hashTextContent(
            serializePersonalAuthoringState(input.applyingState.pending.previous),
          ).slice("sha256:".length),
    ],
    ["state-applying.preimage.staged", hashTextContent(stateApplyingText).slice("sha256:".length)],
    ["state-complete.preimage", hashTextContent(stateApplyingText).slice("sha256:".length)],
    [
      "state-complete.preimage.displaced",
      hashTextContent(stateApplyingText).slice("sha256:".length),
    ],
    ["state-complete.preimage.staged", hashTextContent(stateCompleteText).slice("sha256:".length)],
  ]);
  for (const planned of input.plannedClients) {
    expectedFiles.set(
      `${planned.plan.client}/current.preimage`,
      planned.plan.beforeSha256 ?? undefined,
    );
    expectedFiles.set(
      `${planned.plan.client}/current.preimage.displaced`,
      planned.plan.beforeSha256 ?? undefined,
    );
    expectedFiles.set(`${planned.plan.client}/current.preimage.staged`, planned.plan.afterSha256);
  }
  for (const entry of tree.entries) {
    if (entry.kind === "directory") {
      if (
        !allowedRetryDirectories.has(entry.path) &&
        !input.plannedClients.some(
          ({ plan }) =>
            entry.path.startsWith(`${plan.client}/legacy/`) ||
            entry.path.startsWith(`${plan.client}/legacy.displaced/`),
        )
      ) {
        quarantineBlocker(
          blockers,
          api.join(input.quarantineRoot, ...entry.path.split("/")),
          "request quarantine contains an unplanned directory",
        );
      }
      continue;
    }
    const expected = expectedFiles.get(entry.path);
    const isLegacyEntry = input.plannedClients.some(
      ({ plan }) =>
        plan.legacy.action === "remove" &&
        (entry.path.startsWith(`${plan.client}/legacy/`) ||
          entry.path.startsWith(`${plan.client}/legacy.displaced/`)),
    );
    if (isLegacyEntry) continue;
    if (entry.kind !== "file" || !expectedFiles.has(entry.path) || expected !== entry.sha256) {
      quarantineBlocker(
        blockers,
        api.join(input.quarantineRoot, ...entry.path.split("/")),
        "request quarantine contains unplanned or changed bytes",
      );
    }
  }
}

function assertQuarantineClean(deps: PersonalAuthoringSetupDeps, plan: SetupPlan): void {
  const inspected = deps.fs.inspectPath(plan.quarantineRoot);
  if (inspected.kind !== "missing") {
    throw new Error("request-bound personal setup quarantine is not clean");
  }
}

function stateDestination(
  api: typeof posix | typeof win32,
  home: string,
  definition: AuthoringClientDefinition,
): string {
  return api.join(home, definition.personalSkillsDirectory.slice(2), PERSONAL_BOOTSTRAP_SKILL_NAME);
}

function legacyDestination(
  api: typeof posix | typeof win32,
  home: string,
  definition: AuthoringClientDefinition,
): string {
  return api.join(home, definition.personalSkillsDirectory.slice(2), LEGACY_PERSONAL_SKILL_NAME);
}

function validateCompleteStateRelations(
  state: CompletePersonalAuthoringState,
  portableHome: string,
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  api: typeof posix | typeof win32,
  nativeHome: string,
  blockers: PersonalAuthoringSetupBlocker[],
): void {
  if (state.home !== portableHome) {
    addBlocker(blockers, {
      code: "personal-state-home-mismatch",
      surface: "managed-state",
      message: `personal state belongs to ${state.home}, not ${portableHome}`,
      recovery: "restore the matching canonical HOME or move the foreign state aside",
    });
  }
  for (const record of state.managed) {
    const definition = definitions.get(record.client);
    const expected =
      definition === undefined ? undefined : stateDestination(api, nativeHome, definition);
    if (expected === undefined || record.destination !== toPosix(expected)) {
      addBlocker(blockers, {
        code: "personal-state-destination-mismatch",
        surface: "managed-state",
        client: record.client,
        path: record.destination,
        message: "personal state records a noncanonical managed destination",
        recovery: "restore the exact WPM-owned state or move the conflicting state aside",
      });
    }
  }
}

function inspectState(
  deps: PersonalAuthoringSetupDeps,
  statePath: string,
  portableHome: string,
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  nativeHome: string,
  blockers: PersonalAuthoringSetupBlocker[],
): {
  readonly text?: string;
  readonly sha256?: string;
  readonly state?: CompletePersonalAuthoringState | ApplyingPersonalAuthoringState;
} {
  const inspected = safeInspect(deps.fs, statePath, blockers, {
    code: "personal-state-unreadable",
    surface: "managed-state",
    recovery: "restore the exact readable WPM personal setup state or move it aside",
  });
  if (inspected === undefined || inspected.kind === "missing") return {};
  if (inspected.kind !== "file") {
    addBlocker(blockers, {
      code: "personal-state-invalid",
      surface: "managed-state",
      path: toPosix(statePath),
      message: `personal state path is ${inspected.kind}, not a regular file`,
      recovery: "move the conflicting state path aside and repeat setup",
    });
    return {};
  }
  try {
    const captured = deps.fs.readWithDigest(statePath);
    const { content: text, sha256 } = captured;
    const parsed = parsePersonalAuthoringState(text);
    if (!parsed.ok) {
      addBlocker(blockers, {
        code: "personal-state-invalid",
        surface: "managed-state",
        path: toPosix(statePath),
        message: parsed.reason,
        recovery: "restore the exact canonical WPM personal setup state or move it aside",
      });
      return { text, sha256 };
    }
    validateCompleteStateRelations(
      parsed.value.status === "complete"
        ? parsed.value
        : (parsed.value.pending.previous ?? {
            schemaVersion: 1,
            status: "complete",
            home: parsed.value.home,
            setupVersion: parsed.value.setupVersion,
            defaults: parsed.value.defaults,
            managed: parsed.value.managed,
          }),
      portableHome,
      definitions,
      pathApi(deps.env),
      nativeHome,
      blockers,
    );
    return { text, sha256, state: parsed.value };
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-state-unreadable",
      surface: "managed-state",
      path: toPosix(statePath),
      message: error instanceof Error ? error.message : String(error),
      recovery: "restore readable access to the exact personal setup state",
    });
    return {};
  }
}

function discoverQuarantinedApplyingState(
  deps: PersonalAuthoringSetupDeps,
  quarantineRoot: string,
  blockers: PersonalAuthoringSetupBlocker[],
):
  | {
      readonly text: string;
      readonly sha256: string;
      readonly state: ApplyingPersonalAuthoringState;
      readonly resumeStage: "applying" | "complete";
    }
  | undefined {
  const api = pathApi(deps.env);
  const candidates = [
    {
      path: api.join(quarantineRoot, "state-applying.preimage.staged"),
      resumeStage: "applying" as const,
    },
    {
      path: api.join(quarantineRoot, "state-complete.preimage"),
      resumeStage: "complete" as const,
    },
  ];
  const found: Array<{
    readonly text: string;
    readonly sha256: string;
    readonly state: ApplyingPersonalAuthoringState;
    readonly resumeStage: "applying" | "complete";
  }> = [];
  for (const candidate of candidates) {
    let inspected: PathInspection;
    try {
      inspected = deps.fs.inspectPath(candidate.path);
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-quarantine-unreadable",
        surface: "managed-state",
        path: toPosix(candidate.path),
        message: error instanceof Error ? error.message : String(error),
        recovery:
          "restore the request-bound WPM quarantine evidence and repeat the identical request",
      });
      continue;
    }
    if (inspected.kind === "missing") continue;
    if (inspected.kind !== "file") {
      addBlocker(blockers, {
        code: "personal-quarantine-invalid",
        surface: "managed-state",
        path: toPosix(candidate.path),
        message: `request-bound applying evidence is ${inspected.kind}, not a regular file`,
        recovery: "preserve and inspect the unexpected quarantine entry before retrying",
      });
      continue;
    }
    try {
      const captured = deps.fs.readWithDigest(candidate.path);
      const parsed = parsePersonalAuthoringState(captured.content);
      if (!parsed.ok || parsed.value.status !== "applying") {
        throw new Error(parsed.ok ? "quarantine evidence is not applying state" : parsed.reason);
      }
      found.push({
        text: captured.content,
        sha256: captured.sha256,
        state: parsed.value,
        resumeStage: candidate.resumeStage,
      });
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-quarantine-invalid",
        surface: "managed-state",
        path: toPosix(candidate.path),
        message: error instanceof Error ? error.message : String(error),
        recovery: "preserve and inspect the unexpected quarantine entry before retrying",
      });
    }
  }
  if (found.length === 0) return undefined;
  const selected =
    found.find(({ resumeStage }) => resumeStage === "complete") ??
    (found[0] as (typeof found)[number]);
  if (found.some(({ text }) => text !== selected.text)) {
    addBlocker(blockers, {
      code: "personal-quarantine-conflict",
      surface: "managed-state",
      message: "request-bound quarantine contains conflicting applying-state generations",
      recovery: "preserve and reconcile the conflicting WPM quarantine evidence explicitly",
    });
    return undefined;
  }
  return selected;
}

function canonicalManaged(
  previous: CompletePersonalAuthoringState | null,
  selected: readonly AuthoringClientId[],
  definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>,
  api: typeof posix | typeof win32,
  home: string,
  version: string,
  sourceSha256: string,
): readonly ManagedPersonalClient[] {
  const prior = new Map((previous?.managed ?? []).map((record) => [record.client, record]));
  for (const client of selected) {
    const definition = definitions.get(client) as AuthoringClientDefinition;
    prior.set(client, {
      client,
      destination: toPosix(stateDestination(api, home, definition)),
      version,
      sha256: sourceSha256,
    });
  }
  return AUTHORING_CLIENT_IDS.flatMap((client) => {
    const record = prior.get(client);
    return record === undefined ? [] : [record];
  });
}

function expectedOutcome(
  prior: ManagedPersonalClient | undefined,
  beforeSha256: string | null,
  sourceSha256: string,
  migrate: boolean,
): PersonalSetupOutcome {
  if (migrate) return "migrated";
  if (prior !== undefined) return prior.sha256 === sourceSha256 ? "unchanged" : "updated";
  return beforeSha256 === null ? "installed" : "unchanged";
}

function buildNormalClientPlans(input: {
  readonly deps: PersonalAuthoringSetupDeps;
  readonly clients: readonly AuthoringClientId[];
  readonly definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>;
  readonly home: string;
  readonly quarantineRoot: string;
  readonly previous: CompletePersonalAuthoringState | null;
  readonly source: CapturedSkillSource;
  readonly legacySource: TreeObservation | undefined;
  readonly blockers: PersonalAuthoringSetupBlocker[];
}): readonly PlannedClient[] {
  const api = pathApi(input.deps.env);
  const plans: PlannedClient[] = [];
  for (const client of input.clients) {
    const definition = input.definitions.get(client) as AuthoringClientDefinition;
    const destination = stateDestination(api, input.home, definition);
    const legacyPath = legacyDestination(api, input.home, definition);
    const current = inspectSkillDestination(input.deps.fs, destination, input.blockers, client);
    const prior = input.previous?.managed.find((record) => record.client === client);
    let beforeSha256: string | null | undefined;
    let needsWrite = false;
    if (current.kind === "missing") {
      if (prior !== undefined) {
        addBlocker(input.blockers, {
          code: "personal-owned-skill-missing",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message: "a complete managed record exists but its owned bootstrap skill is missing",
          recovery:
            "restore the recorded owned bytes or move the conflicting state aside explicitly",
        });
      } else {
        beforeSha256 = null;
        needsWrite = true;
      }
    } else if (current.kind === "ambiguous" || current.sha256 === undefined) {
      addBlocker(input.blockers, {
        code: "personal-destination-ambiguous",
        surface: "ownership",
        client,
        path: toPosix(destination),
        message: current.message ?? "current bootstrap destination is ambiguous",
        recovery: "move the unowned or modified current destination aside before setup",
      });
    } else {
      beforeSha256 = current.sha256;
      if (prior !== undefined) {
        if (current.sha256 !== prior.sha256) {
          addBlocker(input.blockers, {
            code: "personal-owned-skill-modified",
            surface: "ownership",
            client,
            path: toPosix(destination),
            message: "actual bootstrap bytes differ from the recorded prior ownership digest",
            recovery:
              "restore the recorded owned bytes or move the conflicting state aside explicitly",
          });
        } else {
          needsWrite = current.sha256 !== input.source.sha256;
        }
      } else if (current.sha256 !== input.source.sha256) {
        addBlocker(input.blockers, {
          code: "personal-destination-ambiguous",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message:
            "an unrecorded current destination does not equal the exact packaged bootstrap bytes",
          recovery: "move the unowned or modified current destination aside before setup",
        });
      }
    }

    const legacy = inspectLegacyDestination(input.deps.fs, legacyPath);
    const exactLegacy =
      input.legacySource !== undefined &&
      legacy.kind === "tree" &&
      JSON.stringify(legacy.entries) === JSON.stringify(input.legacySource.entries);
    const legacyAction = legacy.kind === "absent" ? "absent" : exactLegacy ? "remove" : "preserve";
    const outcome = expectedOutcome(
      prior,
      beforeSha256 ?? null,
      input.source.sha256,
      legacyAction === "remove",
    );
    if (beforeSha256 !== undefined) {
      plans.push({
        definition,
        nativeDestination: destination,
        nativeLegacyPath: legacyPath,
        currentQuarantinePath: clientQuarantinePath(
          api,
          input.quarantineRoot,
          client,
          "current.preimage",
        ),
        legacyQuarantinePath: clientQuarantinePath(api, input.quarantineRoot, client, "legacy"),
        legacyPreimageFingerprint: legacy.fingerprint,
        plan: {
          client,
          destination: toPosix(destination),
          outcome,
          beforeSha256,
          afterSha256: input.source.sha256,
          legacy: {
            path: toPosix(legacyPath),
            action: legacyAction,
            fingerprint: legacy.fingerprint,
          },
        },
        needsWrite,
        needsLegacyRemoval: legacyAction === "remove",
      });
    }
  }
  return plans;
}

function validateApplyingRelations(input: {
  readonly applying: ApplyingPersonalAuthoringState;
  readonly clients: readonly AuthoringClientId[];
  readonly source: CapturedSkillSource | undefined;
  readonly legacySource: TreeObservation | undefined;
  readonly version: string;
  readonly portableHome: string;
  readonly definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>;
  readonly api: typeof posix | typeof win32;
  readonly nativeHome: string;
  readonly blockers: PersonalAuthoringSetupBlocker[];
}): CompletePersonalAuthoringState | undefined {
  const { applying } = input;
  const sourceSha256 = input.source?.sha256 ?? applying.pending.sourceSha256;
  if (
    applying.home !== input.portableHome ||
    applying.setupVersion !== input.version ||
    applying.defaults.join(",") !== input.clients.join(",") ||
    (input.source !== undefined && applying.pending.sourceSha256 !== input.source.sha256) ||
    applying.pending.requestKey !==
      personalSetupRequestKey(input.clients, input.version, sourceSha256) ||
    applying.pending.quarantineRoot !==
      personalSetupQuarantineRoot(applying.home, applying.pending.requestKey)
  ) {
    addBlocker(input.blockers, {
      code: "personal-applying-request-mismatch",
      surface: "managed-state",
      message: "the applying state does not match the identical client/version/package request",
      recovery: "restore the exact package and repeat the identical explicit setup request",
    });
    return undefined;
  }
  const previous = applying.pending.previous;
  if (previous !== null) {
    validateCompleteStateRelations(
      previous,
      input.portableHome,
      input.definitions,
      input.api,
      input.nativeHome,
      input.blockers,
    );
  }
  const expectedManaged = canonicalManaged(
    previous,
    input.clients,
    input.definitions,
    input.api,
    input.nativeHome,
    input.version,
    sourceSha256,
  );
  if (JSON.stringify(expectedManaged) !== JSON.stringify(applying.managed)) {
    addBlocker(input.blockers, {
      code: "personal-applying-plan-invalid",
      surface: "managed-state",
      message: "the applying state's desired ownership set is incoherent",
      recovery: "restore the exact applying state and repeat the identical setup request",
    });
    return undefined;
  }
  for (const plan of applying.pending.clients) {
    const definition = input.definitions.get(plan.client) as AuthoringClientDefinition;
    const expectedDestination = toPosix(stateDestination(input.api, input.nativeHome, definition));
    const expectedLegacy = toPosix(legacyDestination(input.api, input.nativeHome, definition));
    const prior = previous?.managed.find(({ client }) => client === plan.client);
    const legacyActionValid =
      input.legacySource === undefined
        ? true
        : plan.legacy.fingerprint === input.legacySource.fingerprint
          ? plan.legacy.action === "remove"
          : plan.legacy.action !== "remove";
    const relationValid =
      plan.destination === expectedDestination &&
      plan.legacy.path === expectedLegacy &&
      plan.afterSha256 === sourceSha256 &&
      (prior === undefined
        ? plan.beforeSha256 === null || plan.beforeSha256 === sourceSha256
        : plan.beforeSha256 === prior.sha256) &&
      plan.outcome ===
        expectedOutcome(prior, plan.beforeSha256, sourceSha256, plan.legacy.action === "remove") &&
      legacyActionValid;
    if (!relationValid) {
      addBlocker(input.blockers, {
        code: "personal-applying-plan-invalid",
        surface: "managed-state",
        client: plan.client,
        path: plan.destination,
        message: "the applying client plan is not the canonical source/destination/legacy plan",
        recovery: "restore the exact applying state and package before retrying",
      });
    }
  }
  return {
    schemaVersion: 1,
    status: "complete",
    home: applying.home,
    setupVersion: applying.setupVersion,
    defaults: applying.defaults,
    managed: applying.managed,
  };
}

function buildRetryClientPlans(input: {
  readonly deps: PersonalAuthoringSetupDeps;
  readonly applying: ApplyingPersonalAuthoringState;
  readonly legacySource: TreeObservation | undefined;
  readonly blockers: PersonalAuthoringSetupBlocker[];
  readonly definitions: ReadonlyMap<AuthoringClientId, AuthoringClientDefinition>;
  readonly home: string;
  readonly quarantineRoot: string;
}): readonly PlannedClient[] {
  const api = pathApi(input.deps.env);
  const plans: PlannedClient[] = [];
  for (const plan of input.applying.pending.clients) {
    const definition = input.definitions.get(plan.client) as AuthoringClientDefinition;
    const destination = stateDestination(api, input.home, definition);
    const legacyPath = legacyDestination(api, input.home, definition);
    const currentQuarantinePath = clientQuarantinePath(
      api,
      input.quarantineRoot,
      plan.client,
      "current.preimage",
    );
    const legacyQuarantinePath = clientQuarantinePath(
      api,
      input.quarantineRoot,
      plan.client,
      "legacy",
    );
    const current = inspectSkillDestination(
      input.deps.fs,
      destination,
      input.blockers,
      plan.client,
    );
    const retainedCurrent = inspectPrivateFile(input.deps.fs, currentQuarantinePath);
    const stagedCurrent = inspectPrivateFile(input.deps.fs, `${currentQuarantinePath}.staged`);
    const displacedCurrent = inspectPrivateFile(
      input.deps.fs,
      `${currentQuarantinePath}.displaced`,
    );
    let publicIsEmptyDestination = false;
    if (current.kind === "ambiguous") {
      try {
        publicIsEmptyDestination =
          input.deps.fs.inspectPath(destination).kind === "directory" &&
          input.deps.fs.list(destination).length === 0;
      } catch (error) {
        addBlocker(input.blockers, {
          code: "personal-applying-destination-mismatch",
          surface: "ownership",
          client: plan.client,
          path: plan.destination,
          message: `cannot inspect interrupted destination: ${error instanceof Error ? error.message : String(error)}`,
          recovery: "restore readable access to the exact recorded destination before retrying",
        });
      }
    }
    let needsWrite = false;
    if (
      stagedCurrent.kind === "other" ||
      (stagedCurrent.kind === "file" && stagedCurrent.sha256 !== plan.afterSha256)
    ) {
      addBlocker(input.blockers, {
        code: "personal-applying-quarantine-mismatch",
        surface: "ownership",
        client: plan.client,
        path: toPosix(`${currentQuarantinePath}.staged`),
        message:
          stagedCurrent.kind === "other"
            ? stagedCurrent.message
            : "staged bootstrap bytes differ from the immutable desired digest",
        recovery: "preserve and reconcile the request-bound staged bytes before retrying",
      });
    }
    if (
      displacedCurrent.kind === "other" ||
      (displacedCurrent.kind === "file" &&
        (displacedCurrent.sha256 !== plan.beforeSha256 || !publicIsEmptyDestination))
    ) {
      addBlocker(input.blockers, {
        code: "personal-applying-quarantine-mismatch",
        surface: "ownership",
        client: plan.client,
        path: toPosix(`${currentQuarantinePath}.displaced`),
        message:
          displacedCurrent.kind === "other"
            ? displacedCurrent.message
            : "displaced bootstrap evidence conflicts with the immutable public plan",
        recovery: "preserve both generations and reconcile the interrupted update explicitly",
      });
    }
    if (retainedCurrent.kind === "other") {
      addBlocker(input.blockers, {
        code: "personal-applying-quarantine-mismatch",
        surface: "ownership",
        client: plan.client,
        path: toPosix(currentQuarantinePath),
        message: retainedCurrent.message,
        recovery: "preserve and reconcile the request-bound retained bytes before retrying",
      });
    } else if (retainedCurrent.kind === "file") {
      const publicAgrees =
        publicIsEmptyDestination ||
        (current.kind === "exact" &&
          (current.sha256 === plan.beforeSha256 || current.sha256 === plan.afterSha256));
      if (
        plan.beforeSha256 === null ||
        retainedCurrent.sha256 !== plan.beforeSha256 ||
        !publicAgrees
      ) {
        addBlocker(input.blockers, {
          code: "personal-applying-quarantine-mismatch",
          surface: "ownership",
          client: plan.client,
          path: toPosix(currentQuarantinePath),
          message: "retained bootstrap evidence does not agree with the immutable public plan",
          recovery: "preserve both generations and reconcile the interrupted update explicitly",
        });
      } else {
        needsWrite = true;
      }
    } else if (
      plan.beforeSha256 === null &&
      publicIsEmptyDestination &&
      stagedCurrent.kind === "file" &&
      stagedCurrent.sha256 === plan.afterSha256
    ) {
      needsWrite = true;
    } else if (current.kind === "missing") {
      if (plan.beforeSha256 === null) {
        needsWrite = true;
      } else {
        addBlocker(input.blockers, {
          code: "personal-applying-destination-mismatch",
          surface: "ownership",
          client: plan.client,
          path: plan.destination,
          message: "a retry path recorded as present is now missing",
          recovery: "restore the exact recorded before or desired bytes before retrying",
        });
      }
    } else if (current.kind === "exact" && current.sha256 !== undefined) {
      if (current.sha256 === plan.afterSha256) {
        needsWrite = false;
      } else if (current.sha256 === plan.beforeSha256) {
        needsWrite = true;
      } else {
        addBlocker(input.blockers, {
          code: "personal-applying-destination-mismatch",
          surface: "ownership",
          client: plan.client,
          path: plan.destination,
          message: "a retry path is neither its exact recorded before nor desired digest",
          recovery: "restore the exact recorded before or desired bytes before retrying",
        });
      }
    } else {
      addBlocker(input.blockers, {
        code: "personal-applying-destination-mismatch",
        surface: "ownership",
        client: plan.client,
        path: plan.destination,
        message: current.message ?? "retry destination is ambiguous",
        recovery: "restore the exact recorded before or desired one-file skill tree",
      });
    }
    if (stagedCurrent.kind === "file") needsWrite = true;

    const legacy = inspectLegacyDestination(input.deps.fs, legacyPath);
    const retainedLegacy = inspectLegacyDestination(input.deps.fs, legacyQuarantinePath);
    const displacedLegacy = inspectLegacyDestination(
      input.deps.fs,
      `${legacyQuarantinePath}.displaced`,
    );
    const legacySource = input.legacySource;
    let needsLegacyRemoval = false;
    let legacyPreimageFingerprint = legacy.fingerprint;
    if (displacedLegacy.kind !== "absent") {
      const displacedIsRetainedSubset =
        displacedLegacy.kind === "tree" &&
        retainedLegacy.kind === "tree" &&
        isExactTreeSubset(displacedLegacy.entries ?? [], retainedLegacy.entries ?? []);
      if (
        plan.legacy.action !== "remove" ||
        legacy.kind !== "absent" ||
        retainedLegacy.kind !== "tree" ||
        displacedLegacy.kind !== "tree" ||
        retainedLegacy.fingerprint !== plan.legacy.fingerprint ||
        !displacedIsRetainedSubset
      ) {
        addBlocker(input.blockers, {
          code: "personal-applying-quarantine-mismatch",
          surface: "ownership",
          client: plan.client,
          path: toPosix(`${legacyQuarantinePath}.displaced`),
          message: "displaced legacy evidence conflicts with the immutable removal plan",
          recovery: "preserve and reconcile both request-bound legacy generations explicitly",
        });
      } else {
        needsLegacyRemoval = true;
        legacyPreimageFingerprint =
          legacy.kind === "absent" ? retainedLegacy.fingerprint : plan.legacy.fingerprint;
      }
    } else if (plan.legacy.action !== "remove" && retainedLegacy.kind !== "absent") {
      addBlocker(input.blockers, {
        code: "personal-applying-quarantine-mismatch",
        surface: "ownership",
        client: plan.client,
        path: toPosix(legacyQuarantinePath),
        message: "a retained legacy tree exists for a plan that never authorized removal",
        recovery: "preserve and reconcile the unexpected request-bound legacy evidence",
      });
    } else if (plan.legacy.action === "remove" && retainedLegacy.kind !== "absent") {
      const retainedIsComplete = retainedLegacy.fingerprint === plan.legacy.fingerprint;
      const retainedIsExpectedSubset =
        retainedLegacy.kind === "tree" &&
        (retainedIsComplete ||
          (legacySource !== undefined &&
            isExactTreeSubset(retainedLegacy.entries ?? [], legacySource.entries)));
      const publicAgreesWithRetained =
        legacy.kind === "absent" || legacy.fingerprint === plan.legacy.fingerprint;
      if (!publicAgreesWithRetained || !retainedIsExpectedSubset) {
        addBlocker(input.blockers, {
          code: "personal-applying-quarantine-mismatch",
          surface: "ownership",
          client: plan.client,
          path: toPosix(legacyQuarantinePath),
          message: "retained legacy evidence conflicts with the public path or package tree",
          recovery: "preserve both generations and reconcile the interrupted retirement explicitly",
        });
      } else {
        needsLegacyRemoval = true;
        legacyPreimageFingerprint =
          legacy.kind === "absent" ? retainedLegacy.fingerprint : plan.legacy.fingerprint;
      }
    } else if (plan.legacy.action === "absent") {
      if (legacy.kind !== "absent") {
        addBlocker(input.blockers, {
          code: "personal-applying-legacy-mismatch",
          surface: "ownership",
          client: plan.client,
          path: plan.legacy.path,
          message: "a legacy path appeared after the immutable plan was published",
          recovery: "restore the exact recorded legacy absence before retrying",
        });
      }
    } else if (plan.legacy.action === "preserve") {
      if (legacy.fingerprint !== plan.legacy.fingerprint) {
        addBlocker(input.blockers, {
          code: "personal-applying-legacy-mismatch",
          surface: "ownership",
          client: plan.client,
          path: plan.legacy.path,
          message: "the preserved legacy sibling changed after the immutable plan was published",
          recovery: "restore the exact preserved legacy observation before retrying",
        });
      }
    } else if (legacy.kind === "absent") {
      needsLegacyRemoval = false;
    } else if (
      legacy.fingerprint === plan.legacy.fingerprint ||
      (legacy.kind === "tree" &&
        legacySource !== undefined &&
        isExactTreeSubset(legacy.entries ?? [], legacySource.entries))
    ) {
      needsLegacyRemoval = true;
    } else {
      addBlocker(input.blockers, {
        code: "personal-applying-legacy-mismatch",
        surface: "ownership",
        client: plan.client,
        path: plan.legacy.path,
        message:
          "the legacy removal path is neither its exact prior tree nor an exact remaining packaged subset",
        recovery: "restore the exact recognized legacy tree or its exact applying-removal residue",
      });
    }
    plans.push({
      definition,
      nativeDestination: destination,
      nativeLegacyPath: legacyPath,
      currentQuarantinePath,
      legacyQuarantinePath,
      legacyPreimageFingerprint,
      plan,
      needsWrite,
      needsLegacyRemoval,
    });
  }
  return plans;
}

function planSetup(
  deps: PersonalAuthoringSetupDeps,
  input: PersonalAuthoringSetupInput,
): SetupPlan {
  const blockers: PersonalAuthoringSetupBlocker[] = [];
  const clients = normalizeClients(input.clientIds, blockers);
  if (!isCanonicalIntegrationVersion(input.setupVersion)) {
    addBlocker(blockers, {
      code: "personal-version-invalid",
      surface: "managed-state",
      message: "personal setup version must be one canonical non-empty semantic version",
      recovery: "repeat setup with the exact installed WPM version",
    });
  }
  const home = inspectHome(deps, blockers);
  const definitions = new Map(listAuthoringClientDefinitions().map((value) => [value.id, value]));
  const sources = inspectPackagedSources(deps, input, blockers);
  const api = pathApi(deps.env);
  let statePath = "";
  let observedState: ReturnType<typeof inspectState> = {};
  let quarantinedResumeStage: "applying" | "complete" | undefined;
  let capturedApplyingPrefix = false;
  if (home !== undefined) {
    statePath = api.join(home.native, PERSONAL_AUTHORING_STATE_PATH);
    inspectDirectoryAncestors(deps, home.native, ".wpm", blockers, {
      surface: "managed-state",
    });
    inspectDirectoryAncestors(
      deps,
      home.native,
      PERSONAL_AUTHORING_QUARANTINE_DIRECTORY,
      blockers,
      { surface: "managed-state" },
    );
    observedState = inspectState(
      deps,
      statePath,
      home.portable,
      definitions,
      home.native,
      blockers,
    );
    if (sources.current !== undefined && clients.length > 0) {
      const requestKey = personalSetupRequestKey(
        clients,
        input.setupVersion,
        sources.current.sha256,
      );
      const nativeQuarantineRoot = api.normalize(
        personalSetupQuarantineRoot(home.portable, requestKey),
      );
      const discovered = discoverQuarantinedApplyingState(deps, nativeQuarantineRoot, blockers);
      if (discovered !== undefined) {
        const previousText =
          discovered.state.pending.previous === null
            ? undefined
            : serializePersonalAuthoringState(discovered.state.pending.previous);
        const desiredCompleteText = serializePersonalAuthoringState({
          schemaVersion: 1,
          status: "complete",
          home: discovered.state.home,
          setupVersion: discovered.state.setupVersion,
          defaults: discovered.state.defaults,
          managed: discovered.state.managed,
        });
        const publicMatchesPartial =
          observedState.text === undefined ||
          observedState.text === discovered.text ||
          observedState.text === previousText ||
          observedState.text === desiredCompleteText;
        if (!publicMatchesPartial) {
          addBlocker(blockers, {
            code: "personal-quarantine-public-conflict",
            surface: "managed-state",
            path: toPosix(statePath),
            message: "public personal state does not match the request-bound partial preimage",
            recovery:
              "preserve both state generations and reconcile the interrupted request explicitly",
          });
        } else {
          observedState = discovered;
          quarantinedResumeStage = discovered.resumeStage;
        }
      } else {
        const retainedApplyingPreimage = inspectPrivateFile(
          deps.fs,
          api.join(nativeQuarantineRoot, "state-applying.preimage"),
        );
        capturedApplyingPrefix =
          retainedApplyingPreimage.kind === "file" &&
          observedState.state?.status === "complete" &&
          observedState.sha256 === retainedApplyingPreimage.sha256;
      }
    }
    for (const client of clients) {
      const definition = definitions.get(client) as AuthoringClientDefinition;
      inspectDirectoryAncestors(
        deps,
        home.native,
        definition.personalSkillsDirectory.slice(2),
        blockers,
        { client, surface: "destination" },
      );
      const destination = stateDestination(api, home.native, definition);
      const current = inspectSkillDestination(deps.fs, destination, blockers, client);
      if (current.kind === "ambiguous" && observedState.state?.status !== "applying") {
        addBlocker(blockers, {
          code: "personal-destination-ambiguous",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message: current.message ?? "current bootstrap destination is ambiguous",
          recovery: "move the unowned or modified current destination aside before setup",
        });
      }
      const prior =
        observedState.state?.status === "complete"
          ? observedState.state.managed.find((record) => record.client === client)
          : undefined;
      if (prior !== undefined && current.kind === "missing") {
        addBlocker(blockers, {
          code: "personal-owned-skill-missing",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message: "a complete managed record exists but its owned bootstrap skill is missing",
          recovery:
            "restore the recorded owned bytes or move the conflicting state aside explicitly",
        });
      } else if (
        prior !== undefined &&
        current.kind === "exact" &&
        current.sha256 !== prior.sha256
      ) {
        addBlocker(blockers, {
          code: "personal-owned-skill-modified",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message: "actual bootstrap bytes differ from the recorded prior ownership digest",
          recovery:
            "restore the recorded owned bytes or move the conflicting state aside explicitly",
        });
      } else if (
        prior === undefined &&
        observedState.state?.status !== "applying" &&
        current.kind === "exact" &&
        (sources.current === undefined || current.sha256 !== sources.current.sha256)
      ) {
        addBlocker(blockers, {
          code: "personal-destination-ambiguous",
          surface: "ownership",
          client,
          path: toPosix(destination),
          message:
            sources.current === undefined
              ? "an unrecorded current destination cannot be proven without the packaged bootstrap source"
              : "an unrecorded current destination differs from the exact packaged bootstrap bytes",
          recovery: "restore the exact package or move the unowned current destination aside",
        });
      }
    }
  }

  if (home !== undefined && clients.length > 0 && sources.current === undefined) {
    const prospectiveQuarantineRoot =
      observedState.state?.status === "applying"
        ? api.normalize(observedState.state.pending.quarantineRoot)
        : api.join(home.native, PERSONAL_AUTHORING_QUARANTINE_DIRECTORY, "preflight");
    const stateDefinitelyChanges =
      observedState.text === undefined ||
      observedState.state?.status === "applying" ||
      (observedState.state?.status === "complete" &&
        (observedState.state.setupVersion !== input.setupVersion ||
          observedState.state.defaults.join(",") !== clients.join(",")));
    if (stateDefinitelyChanges) {
      const applyingQuarantinePath = api.join(prospectiveQuarantineRoot, "state-applying.preimage");
      const completeQuarantinePath = api.join(prospectiveQuarantineRoot, "state-complete.preimage");
      inspectMutationCapability(deps, statePath, blockers, { surface: "managed-state" });
      inspectMutationCapability(deps, prospectiveQuarantineRoot, blockers, {
        surface: "managed-state",
      });
      inspectMutationCapability(deps, applyingQuarantinePath, blockers, {
        surface: "managed-state",
      });
      inspectMutationCapability(deps, completeQuarantinePath, blockers, {
        surface: "managed-state",
      });
      inspectMutationCompatibility(deps, statePath, applyingQuarantinePath, blockers, {
        surface: "managed-state",
      });
      inspectMutationCompatibility(deps, statePath, completeQuarantinePath, blockers, {
        surface: "managed-state",
      });
    }
    if (observedState.state?.status === "applying") {
      const projectedComplete: CompletePersonalAuthoringState = {
        schemaVersion: 1,
        status: "complete",
        home: observedState.state.home,
        setupVersion: observedState.state.setupVersion,
        defaults: observedState.state.defaults,
        managed: observedState.state.managed,
      };
      const validatedComplete = validateApplyingRelations({
        applying: observedState.state,
        clients,
        source: undefined,
        legacySource: sources.legacy,
        version: input.setupVersion,
        portableHome: home.portable,
        definitions,
        api,
        nativeHome: home.native,
        blockers,
      });
      const retryPlans = buildRetryClientPlans({
        deps,
        applying: observedState.state,
        legacySource: sources.legacy,
        blockers,
        definitions,
        home: home.native,
        quarantineRoot: api.normalize(observedState.state.pending.quarantineRoot),
      });
      inspectQuarantineInventory(
        deps,
        {
          home: home.native,
          quarantineRoot: api.normalize(observedState.state.pending.quarantineRoot),
          retrying: true,
          applyingState: observedState.state,
          completeState: validatedComplete ?? projectedComplete,
          plannedClients: retryPlans,
        },
        blockers,
      );
      for (const planned of retryPlans) {
        if (planned.needsWrite) {
          inspectMutationCapability(
            deps,
            api.join(planned.nativeDestination, "SKILL.md"),
            blockers,
            { client: planned.plan.client, surface: "destination" },
          );
          inspectMutationCapability(deps, planned.currentQuarantinePath, blockers, {
            client: planned.plan.client,
            surface: "managed-state",
          });
          inspectMutationCompatibility(
            deps,
            api.join(planned.nativeDestination, "SKILL.md"),
            planned.currentQuarantinePath,
            blockers,
            { client: planned.plan.client, surface: "destination" },
          );
        }
        if (planned.needsLegacyRemoval) {
          inspectMutationCapability(deps, planned.nativeLegacyPath, blockers, {
            client: planned.plan.client,
            surface: "ownership",
          });
          inspectMutationCapability(deps, planned.legacyQuarantinePath, blockers, {
            client: planned.plan.client,
            surface: "managed-state",
          });
          inspectMutationCompatibility(
            deps,
            planned.nativeLegacyPath,
            planned.legacyQuarantinePath,
            blockers,
            { client: planned.plan.client, surface: "ownership" },
          );
        }
      }
    } else {
      inspectUnboundQuarantineParent(deps, home.native, blockers);
      for (const client of clients) {
        const definition = definitions.get(client) as AuthoringClientDefinition;
        const destination = stateDestination(api, home.native, definition);
        const prior =
          observedState.state?.status === "complete"
            ? observedState.state.managed.find((record) => record.client === client)
            : undefined;
        const current = inspectSkillDestination(deps.fs, destination, blockers, client);
        const currentDefinitelyChanges = prior === undefined && current.kind === "missing";
        if (currentDefinitelyChanges) {
          inspectMutationCapability(deps, api.join(destination, "SKILL.md"), blockers, {
            client,
            surface: "destination",
          });
          inspectMutationCapability(
            deps,
            clientQuarantinePath(api, prospectiveQuarantineRoot, client, "current.preimage"),
            blockers,
            { client, surface: "managed-state" },
          );
          inspectMutationCapability(deps, prospectiveQuarantineRoot, blockers, {
            surface: "managed-state",
          });
          inspectMutationCompatibility(
            deps,
            api.join(destination, "SKILL.md"),
            clientQuarantinePath(api, prospectiveQuarantineRoot, client, "current.preimage"),
            blockers,
            { client, surface: "destination" },
          );
        }
        const legacyPath = legacyDestination(api, home.native, definition);
        const legacy = inspectLegacyDestination(deps.fs, legacyPath);
        if (
          sources.legacy !== undefined &&
          legacy.kind === "tree" &&
          JSON.stringify(legacy.entries) === JSON.stringify(sources.legacy.entries)
        ) {
          inspectMutationCapability(deps, legacyPath, blockers, {
            client,
            surface: "ownership",
          });
          inspectMutationCapability(
            deps,
            clientQuarantinePath(api, prospectiveQuarantineRoot, client, "legacy"),
            blockers,
            { client, surface: "managed-state" },
          );
          inspectMutationCapability(deps, prospectiveQuarantineRoot, blockers, {
            surface: "managed-state",
          });
          inspectMutationCompatibility(
            deps,
            legacyPath,
            clientQuarantinePath(api, prospectiveQuarantineRoot, client, "legacy"),
            blockers,
            { client, surface: "ownership" },
          );
        }
      }
    }
  }

  if (home === undefined || sources.current === undefined || clients.length === 0) {
    if (blockers.length === 0) {
      throw new Error("internal: incomplete setup evidence without blockers");
    }
    throw new PersonalAuthoringSetupPreflightError(blockers);
  }

  let previous: CompletePersonalAuthoringState | null = null;
  let plannedClients: readonly PlannedClient[] = [];
  let completeState: CompletePersonalAuthoringState;
  let applyingState: ApplyingPersonalAuthoringState;
  let retrying = false;
  let quarantineRoot = "";

  if (observedState.state?.status === "applying") {
    retrying = true;
    applyingState = observedState.state;
    previous = observedState.state.pending.previous;
    quarantineRoot = api.normalize(observedState.state.pending.quarantineRoot);
    const projectedComplete: CompletePersonalAuthoringState = {
      schemaVersion: 1,
      status: "complete",
      home: observedState.state.home,
      setupVersion: observedState.state.setupVersion,
      defaults: observedState.state.defaults,
      managed: observedState.state.managed,
    };
    const validatedComplete = validateApplyingRelations({
      applying: observedState.state,
      clients,
      source: sources.current,
      legacySource: sources.legacy,
      version: input.setupVersion,
      portableHome: home.portable,
      definitions,
      api,
      nativeHome: home.native,
      blockers,
    });
    completeState = validatedComplete ?? projectedComplete;
    plannedClients = buildRetryClientPlans({
      deps,
      applying: observedState.state,
      legacySource: sources.legacy,
      blockers,
      definitions,
      home: home.native,
      quarantineRoot,
    });
  } else {
    retrying = capturedApplyingPrefix;
    previous = observedState.state?.status === "complete" ? observedState.state : null;
    const requestKey = personalSetupRequestKey(clients, input.setupVersion, sources.current.sha256);
    const portableQuarantineRoot = personalSetupQuarantineRoot(home.portable, requestKey);
    quarantineRoot = api.normalize(portableQuarantineRoot);
    plannedClients = buildNormalClientPlans({
      deps,
      clients,
      definitions,
      home: home.native,
      quarantineRoot,
      previous,
      source: sources.current,
      legacySource: sources.legacy,
      blockers,
    });
    completeState = {
      schemaVersion: 1,
      status: "complete",
      home: home.portable,
      setupVersion: input.setupVersion,
      defaults: clients,
      managed: canonicalManaged(
        previous,
        clients,
        definitions,
        api,
        home.native,
        input.setupVersion,
        sources.current.sha256,
      ),
    };
    applyingState = {
      ...completeState,
      status: "applying",
      pending: {
        requestKey,
        sourceSha256: sources.current.sha256,
        quarantineRoot: portableQuarantineRoot,
        previous,
        clients: plannedClients.map(({ plan }) => plan),
      },
    };
  }

  const completeText = serializePersonalAuthoringState(completeState);
  const clientMutation = plannedClients.some(
    ({ needsWrite, needsLegacyRemoval }) => needsWrite || needsLegacyRemoval,
  );
  const quarantineInspection = safeInspect(deps.fs, quarantineRoot, blockers, {
    code: "personal-quarantine-unreadable",
    surface: "managed-state",
    recovery:
      "restore readable access to the WPM-private quarantine and repeat the identical request",
  });
  const noMutation =
    observedState.text === completeText &&
    !clientMutation &&
    quarantineInspection?.kind === "missing";
  const applyingStateQuarantinePath = api.join(quarantineRoot, "state-applying.preimage");
  const completeStateQuarantinePath = api.join(quarantineRoot, "state-complete.preimage");
  const applyingStatePrivateEvidencePresent = [
    applyingStateQuarantinePath,
    `${applyingStateQuarantinePath}.displaced`,
    `${applyingStateQuarantinePath}.staged`,
  ].some((path) => inspectPrivateFile(deps.fs, path).kind !== "missing");
  const resumeStage =
    quarantinedResumeStage ??
    (observedState.state?.status === "applying" && !applyingStatePrivateEvidencePresent
      ? "complete"
      : "applying");
  inspectQuarantineInventory(
    deps,
    {
      home: home.native,
      quarantineRoot,
      retrying,
      applyingState,
      completeState,
      plannedClients,
    },
    blockers,
  );
  if (!noMutation) {
    inspectMutationCapability(deps, statePath, blockers, { surface: "managed-state" });
    inspectMutationCapability(deps, quarantineRoot, blockers, { surface: "managed-state" });
    if (resumeStage !== "complete") {
      inspectMutationCapability(deps, applyingStateQuarantinePath, blockers, {
        surface: "managed-state",
      });
      inspectMutationCompatibility(deps, statePath, applyingStateQuarantinePath, blockers, {
        surface: "managed-state",
      });
    }
    inspectMutationCapability(deps, completeStateQuarantinePath, blockers, {
      surface: "managed-state",
    });
    inspectMutationCompatibility(deps, statePath, completeStateQuarantinePath, blockers, {
      surface: "managed-state",
    });
    for (const planned of plannedClients) {
      if (planned.needsWrite) {
        inspectMutationCapability(deps, api.join(planned.nativeDestination, "SKILL.md"), blockers, {
          client: planned.plan.client,
          surface: "destination",
        });
        inspectMutationCapability(deps, planned.currentQuarantinePath, blockers, {
          client: planned.plan.client,
          surface: "managed-state",
        });
        inspectMutationCompatibility(
          deps,
          api.join(planned.nativeDestination, "SKILL.md"),
          planned.currentQuarantinePath,
          blockers,
          { client: planned.plan.client, surface: "destination" },
        );
      }
      if (planned.needsLegacyRemoval) {
        inspectMutationCapability(deps, planned.nativeLegacyPath, blockers, {
          client: planned.plan.client,
          surface: "ownership",
        });
        inspectMutationCapability(deps, planned.legacyQuarantinePath, blockers, {
          client: planned.plan.client,
          surface: "managed-state",
        });
        inspectMutationCompatibility(
          deps,
          planned.nativeLegacyPath,
          planned.legacyQuarantinePath,
          blockers,
          { client: planned.plan.client, surface: "ownership" },
        );
      }
    }
  }
  if (blockers.length > 0) throw new PersonalAuthoringSetupPreflightError(blockers);
  return {
    clients,
    nativeHome: home.native,
    statePath,
    quarantineRoot,
    applyingStateQuarantinePath,
    completeStateQuarantinePath,
    ...(observedState.text === undefined ? {} : { stateTextBefore: observedState.text }),
    ...(observedState.sha256 === undefined ? {} : { stateSha256Before: observedState.sha256 }),
    ...(retrying
      ? applyingState.pending.previous === null
        ? {}
        : {
            applyingStatePreimageSha256: hashTextContent(
              serializePersonalAuthoringState(applyingState.pending.previous),
            ).slice("sha256:".length),
          }
      : observedState.sha256 === undefined
        ? {}
        : { applyingStatePreimageSha256: observedState.sha256 }),
    applyingState,
    completeState,
    sourceContent: sources.current.content,
    plannedClients,
    retrying,
    resumeStage,
    noMutation,
  };
}

interface SetupAction {
  readonly boundary: MutationBoundary;
  /** The client whose boundary is being attempted, if this is a client action. */
  readonly affectedClient?: PersonalAuthoringSetupClientProgress;
  /** The client completed by this action; migration completes only after legacy retirement. */
  readonly completedClient?: PersonalAuthoringSetupClientProgress;
  readonly run: () => readonly string[];
}

class ClientEffectError extends Error {
  constructor(
    readonly path: string,
    readonly underlying: unknown,
    readonly client?: PersonalAuthoringSetupClientProgress,
  ) {
    super(`client effect failed at ${path}`);
  }
}

function clientProgress(planned: PlannedClient): PersonalAuthoringSetupClientProgress {
  return {
    id: planned.plan.client,
    destination: planned.plan.destination,
    outcome: planned.plan.outcome,
  };
}

function plannedClientChanged(planned: PlannedClient): boolean {
  return (
    planned.plan.beforeSha256 !== planned.plan.afterSha256 ||
    planned.plan.legacy.action === "remove"
  );
}

function currentSkillChanged(planned: PlannedClient): boolean {
  return planned.plan.beforeSha256 !== planned.plan.afterSha256;
}

function applyingStateText(plan: SetupPlan): string {
  return serializePersonalAuthoringState(plan.applyingState);
}

function assertApplyingState(deps: PersonalAuthoringSetupDeps, plan: SetupPlan): void {
  assertEffectConfinement(deps, plan.nativeHome, ".wpm");
  const expectedSha256 = hashTextContent(applyingStateText(plan)).slice("sha256:".length);
  const publicKind = deps.fs.inspectPath(plan.statePath).kind;
  if (publicKind === "file" && deps.fs.digestFile(plan.statePath) === expectedSha256) return;
  const retainedKind = deps.fs.inspectPath(plan.completeStateQuarantinePath).kind;
  if (
    retainedKind === "file" &&
    deps.fs.digestFile(plan.completeStateQuarantinePath) === expectedSha256 &&
    (publicKind === "missing" ||
      (publicKind === "file" &&
        deps.fs.digestFile(plan.statePath) ===
          hashTextContent(serializePersonalAuthoringState(plan.completeState)).slice(
            "sha256:".length,
          )))
  ) {
    return;
  }
  throw new Error("personal applying state changed before the next selected effect");
}

function legacyMatchesFinalPlan(fs: FileSystem, planned: PlannedClient): boolean {
  const observed = inspectLegacyDestination(fs, planned.nativeLegacyPath);
  return planned.plan.legacy.action === "preserve"
    ? observed.fingerprint === planned.plan.legacy.fingerprint
    : observed.kind === "absent";
}

function legacyMatchesEffectPreimage(fs: FileSystem, planned: PlannedClient): boolean {
  const retained = inspectLegacyDestination(fs, planned.legacyQuarantinePath);
  const observed = inspectLegacyDestination(fs, planned.nativeLegacyPath);
  if (retained.kind === "absent") {
    return observed.fingerprint === planned.legacyPreimageFingerprint;
  }
  if (retained.fingerprint === planned.legacyPreimageFingerprint) {
    return observed.kind === "absent" || observed.fingerprint === planned.legacyPreimageFingerprint;
  }
  return (
    retained.kind === "tree" &&
    observed.kind === "tree" &&
    observed.fingerprint === planned.legacyPreimageFingerprint &&
    isExactTreeSubset(retained.entries ?? [], observed.entries ?? [])
  );
}

function assertPlannedClientFinal(
  deps: PersonalAuthoringSetupDeps,
  plan: SetupPlan,
  planned: PlannedClient,
): void {
  const progress = clientProgress(planned);
  try {
    assertEffectConfinement(
      deps,
      plan.nativeHome,
      planned.definition.personalSkillsDirectory.slice(2),
    );
  } catch (error) {
    throw new ClientEffectError(planned.plan.destination, error, progress);
  }
  const current = inspectSkillDestination(
    deps.fs,
    planned.nativeDestination,
    [],
    planned.plan.client,
  );
  if (current.kind !== "exact" || current.sha256 !== planned.plan.afterSha256) {
    throw new ClientEffectError(
      planned.plan.destination,
      new Error("current bootstrap does not match its desired final digest"),
      progress,
    );
  }
  if (!legacyMatchesFinalPlan(deps.fs, planned)) {
    throw new ClientEffectError(
      planned.plan.legacy.path,
      new Error("legacy sibling does not match its planned final state"),
      progress,
    );
  }
  if (
    deps.fs.inspectPath(planned.currentQuarantinePath).kind !== "missing" ||
    deps.fs.inspectPath(`${planned.currentQuarantinePath}.displaced`).kind !== "missing" ||
    deps.fs.inspectPath(`${planned.currentQuarantinePath}.staged`).kind !== "missing" ||
    deps.fs.inspectPath(planned.legacyQuarantinePath).kind !== "missing" ||
    deps.fs.inspectPath(`${planned.legacyQuarantinePath}.displaced`).kind !== "missing"
  ) {
    throw new ClientEffectError(
      planned.plan.destination,
      new Error("request-bound client quarantine is not clean"),
      progress,
    );
  }
}

function validateNoMutationPlan(deps: PersonalAuthoringSetupDeps, plan: SetupPlan): void {
  const blockers: PersonalAuthoringSetupBlocker[] = [];
  try {
    assertEffectConfinement(deps, plan.nativeHome, ".wpm");
    if (
      deps.fs.inspectPath(plan.statePath).kind !== "file" ||
      deps.fs.digestFile(plan.statePath) !==
        hashTextContent(serializePersonalAuthoringState(plan.completeState)).slice("sha256:".length)
    ) {
      throw new Error("complete personal state changed after preflight");
    }
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-plan-state-drift",
      surface: "managed-state",
      path: toPosix(plan.statePath),
      message: error instanceof Error ? error.message : String(error),
      recovery: "restore the displayed complete state and repeat the authorized setup request",
    });
  }
  for (const planned of plan.plannedClients) {
    try {
      assertPlannedClientFinal(deps, plan, planned);
    } catch (error) {
      addBlocker(blockers, {
        code: "personal-plan-client-drift",
        surface: "ownership",
        client: planned.plan.client,
        path: error instanceof ClientEffectError ? error.path : planned.plan.destination,
        message:
          error instanceof ClientEffectError && error.underlying instanceof Error
            ? error.underlying.message
            : error instanceof Error
              ? error.message
              : String(error),
        recovery:
          "restore the exact displayed client preimage and repeat the authorized setup request",
      });
    }
  }
  try {
    assertQuarantineClean(deps, plan);
  } catch (error) {
    addBlocker(blockers, {
      code: "personal-plan-quarantine-drift",
      surface: "managed-state",
      path: toPosix(plan.quarantineRoot),
      message: error instanceof Error ? error.message : String(error),
      recovery: "preserve and reconcile the request-bound setup evidence before retrying",
    });
  }
  inspectUnboundQuarantineParent(deps, plan.nativeHome, blockers);
  if (blockers.length > 0) throw new PersonalAuthoringSetupPreflightError(blockers);
}

function executePlan(deps: PersonalAuthoringSetupDeps, plan: SetupPlan): readonly string[] {
  const api = pathApi(deps.env);
  const actions: SetupAction[] = [];
  if (plan.resumeStage !== "complete")
    actions.push({
      boundary: {
        id: "personal-state:applying",
        path: toPosix(plan.statePath),
        description: "publish or reconcile exact personal setup applying evidence",
      },
      run: () => {
        assertEffectConfinement(deps, plan.nativeHome, ".wpm");
        deps.fs.writeConfined(
          plan.nativeHome,
          plan.statePath,
          applyingStateText(plan),
          plan.applyingStatePreimageSha256 === undefined
            ? { kind: "missing" }
            : { kind: "sha256", sha256: plan.applyingStatePreimageSha256 },
          { root: plan.quarantineRoot, path: plan.applyingStateQuarantinePath },
        );
        return [toPosix(plan.statePath)];
      },
    });
  for (const planned of plan.plannedClients) {
    const progress = clientProgress(planned);
    actions.push({
      boundary: {
        id: `personal-client:${planned.plan.client}:bootstrap`,
        path: planned.plan.destination,
        description: `${planned.plan.outcome} ${planned.plan.client} personal bootstrap`,
      },
      affectedClient: progress,
      ...(planned.needsLegacyRemoval ? {} : { completedClient: progress }),
      run: () => {
        const changed: string[] = [];
        try {
          assertApplyingState(deps, plan);
          assertEffectConfinement(
            deps,
            plan.nativeHome,
            planned.definition.personalSkillsDirectory.slice(2),
          );
        } catch (error) {
          throw new ClientEffectError(toPosix(planned.nativeDestination), error);
        }
        const current = inspectSkillDestination(
          deps.fs,
          planned.nativeDestination,
          [],
          planned.plan.client,
        );
        const currentMatchesAfter =
          current.kind === "exact" && current.sha256 === planned.plan.afterSha256;
        if (!planned.needsWrite && !currentMatchesAfter) {
          throw new ClientEffectError(
            toPosix(planned.nativeDestination),
            new Error("current bootstrap destination changed after preflight"),
          );
        }
        if (!legacyMatchesEffectPreimage(deps.fs, planned)) {
          throw new ClientEffectError(
            toPosix(planned.nativeLegacyPath),
            new Error("legacy destination changed after preflight"),
          );
        }
        if (planned.needsWrite) {
          const skillPath = api.join(planned.nativeDestination, "SKILL.md");
          try {
            deps.fs.writeConfined(
              plan.nativeHome,
              skillPath,
              plan.sourceContent,
              planned.plan.beforeSha256 === null
                ? { kind: "missing", parentTree: "missing" }
                : {
                    kind: "sha256",
                    sha256: planned.plan.beforeSha256,
                    parentTree: "one-file",
                  },
              { root: plan.quarantineRoot, path: planned.currentQuarantinePath },
            );
            changed.push(toPosix(planned.nativeDestination));
          } catch (error) {
            throw new ClientEffectError(toPosix(planned.nativeDestination), error);
          }
        }
        return changed;
      },
    });
    if (planned.needsLegacyRemoval) {
      actions.push({
        boundary: {
          id: `personal-client:${planned.plan.client}:legacy`,
          path: planned.plan.legacy.path,
          description: `retire exact owned legacy bootstrap for ${planned.plan.client}`,
        },
        affectedClient: progress,
        completedClient: progress,
        run: () => {
          try {
            assertApplyingState(deps, plan);
            assertEffectConfinement(
              deps,
              plan.nativeHome,
              planned.definition.personalSkillsDirectory.slice(2),
            );
          } catch (error) {
            throw new ClientEffectError(toPosix(planned.nativeLegacyPath), error);
          }
          const current = inspectSkillDestination(
            deps.fs,
            planned.nativeDestination,
            [],
            planned.plan.client,
          );
          if (current.kind !== "exact" || current.sha256 !== planned.plan.afterSha256) {
            throw new ClientEffectError(
              toPosix(planned.nativeDestination),
              new Error("current bootstrap destination changed before legacy retirement"),
            );
          }
          if (!legacyMatchesEffectPreimage(deps.fs, planned)) {
            throw new ClientEffectError(
              toPosix(planned.nativeLegacyPath),
              new Error("legacy destination changed before retirement"),
            );
          }
          try {
            if (planned.legacyPreimageFingerprint === null) {
              throw new Error("legacy removal plan is missing its exact tree fingerprint");
            }
            deps.fs.removeConfined(
              plan.nativeHome,
              planned.nativeLegacyPath,
              planned.legacyPreimageFingerprint,
              { root: plan.quarantineRoot, path: planned.legacyQuarantinePath },
            );
            return [toPosix(planned.nativeLegacyPath)];
          } catch (error) {
            throw new ClientEffectError(toPosix(planned.nativeLegacyPath), error);
          }
        },
      });
    }
  }
  actions.push({
    boundary: {
      id: "personal-state:complete",
      path: toPosix(plan.statePath),
      description: "publish complete personal defaults and ownership evidence",
    },
    run: () => {
      assertEffectConfinement(deps, plan.nativeHome, ".wpm");
      assertApplyingState(deps, plan);
      for (const planned of plan.plannedClients) assertPlannedClientFinal(deps, plan, planned);
      deps.fs.writeConfined(
        plan.nativeHome,
        plan.statePath,
        serializePersonalAuthoringState(plan.completeState),
        {
          kind: "sha256",
          sha256: hashTextContent(applyingStateText(plan)).slice("sha256:".length),
        },
        { root: plan.quarantineRoot, path: plan.completeStateQuarantinePath },
      );
      if (
        deps.fs.inspectPath(plan.statePath).kind !== "file" ||
        deps.fs.digestFile(plan.statePath) !==
          hashTextContent(serializePersonalAuthoringState(plan.completeState)).slice(
            "sha256:".length,
          )
      ) {
        throw new Error("complete personal state changed during final publication");
      }
      for (const planned of plan.plannedClients) assertPlannedClientFinal(deps, plan, planned);
      assertQuarantineClean(deps, plan);
      const finalBlockers: PersonalAuthoringSetupBlocker[] = [];
      inspectUnboundQuarantineParent(deps, plan.nativeHome, finalBlockers);
      if (finalBlockers.length > 0) {
        throw new PersonalAuthoringSetupPreflightError(finalBlockers);
      }
      return [toPosix(plan.statePath)];
    },
  });

  const completedBoundaries: MutationBoundary[] = [];
  const completedClients: PersonalAuthoringSetupClientProgress[] = [];
  const changedPaths: string[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] as SetupAction;
    try {
      changedPaths.push(...action.run());
      completedBoundaries.push(action.boundary);
      if (action.completedClient !== undefined) completedClients.push(action.completedClient);
    } catch (caught) {
      const clientError = caught instanceof ClientEffectError ? caught : undefined;
      const failedBoundary =
        clientError === undefined
          ? action.boundary
          : { ...action.boundary, path: clientError.path };
      const remaining = actions.slice(index + 1);
      const failedClient = clientError?.client ?? action.affectedClient ?? null;
      const completedAtFailure =
        failedClient === null
          ? completedClients
          : completedClients.filter(({ id }) => id !== failedClient.id);
      const completedIds = new Set(completedAtFailure.map(({ id }) => id));
      const unattemptedClients = remaining
        .flatMap(({ affectedClient }) => (affectedClient === undefined ? [] : [affectedClient]))
        .filter(
          (client, remainingIndex, all) =>
            client.id !== failedClient?.id &&
            !completedIds.has(client.id) &&
            all.findIndex(({ id }) => id === client.id) === remainingIndex,
        );
      const selection = plan.clients.map((client) => `--client ${client}`).join(" ");
      throw new PersonalAuthoringSetupMutationFailure({
        completedClients: completedAtFailure,
        failedClient,
        unattemptedClients,
        completed: completedBoundaries,
        failed: failedBoundary,
        unattempted: remaining.map(({ boundary }) => boundary),
        recovery: `preserve request-bound evidence at ${toPosix(plan.quarantineRoot)}, fix the named failure, then repeat the identical explicit request: wpm authoring setup ${selection}`,
        cause: clientError?.underlying ?? caught,
      });
    }
  }
  return [...new Set(changedPaths)];
}

function resultFor(plan: SetupPlan, changedPaths: readonly string[]): PersonalAuthoringSetupResult {
  return {
    status: "complete",
    summary: `configured personal WPM bootstrap for ${plan.clients.join(", ")}`,
    selectedClients: [...plan.clients],
    defaults: [...plan.completeState.defaults],
    statePath: toPosix(plan.statePath),
    clients: plan.plannedClients.map((planned) => {
      const changed = plannedClientChanged(planned);
      return {
        id: planned.plan.client,
        destination: planned.plan.destination,
        outcome: planned.plan.outcome,
        legacy:
          planned.plan.legacy.action === "remove"
            ? "migrated"
            : planned.plan.legacy.action === "preserve"
              ? "preserved-unowned-or-modified"
              : "absent",
        changed,
        ...(currentSkillChanged(planned)
          ? { reloadGuidance: authoringClientReloadGuidance(planned.plan.client) }
          : {}),
        nextAction: planned.plan.client === "codex" ? "$wpm-create-package" : "/wpm-create-package",
      };
    }),
    changedPaths: [...changedPaths],
    setupApplied: true,
  };
}

function previewForPlan(plan: SetupPlan): PersonalAuthoringSetupPreview {
  return {
    status: "ready",
    selectedClients: [...plan.clients],
    statePath: toPosix(plan.statePath),
    clients: plan.plannedClients.map((planned) => ({
      id: planned.plan.client,
      destination: planned.plan.destination,
      outcome: planned.plan.outcome,
      legacy:
        planned.plan.legacy.action === "remove"
          ? "migrated"
          : planned.plan.legacy.action === "preserve"
            ? "preserved-unowned-or-modified"
            : "absent",
      changed: plannedClientChanged(planned),
    })),
  };
}

/** Capture one exact read-only plan that can cross a single interactive confirmation without replanning. */
export function preparePersonalAuthoringSetup(
  deps: PersonalAuthoringSetupDeps,
  input: PersonalAuthoringSetupInput,
): PreparedPersonalAuthoringSetup {
  const plan = planSetup(deps, input);
  return {
    preview: previewForPlan(plan),
    apply: () => {
      if (plan.noMutation) {
        validateNoMutationPlan(deps, plan);
        return resultFor(plan, []);
      }
      return resultFor(plan, executePlan(deps, plan));
    },
  };
}

/** Complete read-only setup preflight for callers that do not retain the immutable plan. */
export function previewPersonalAuthoringSetup(
  deps: PersonalAuthoringSetupDeps,
  input: PersonalAuthoringSetupInput,
): PersonalAuthoringSetupPreview {
  return previewForPlan(planSetup(deps, input));
}

/**
 * Configure exactly one explicit personal client set after one complete immutable preflight.
 * Detection, project context, deliverable targets, prompts, processes, and authentication are outside this core.
 */
export function setupPersonalAuthoring(
  deps: PersonalAuthoringSetupDeps,
  input: PersonalAuthoringSetupInput,
): PersonalAuthoringSetupResult {
  return preparePersonalAuthoringSetup(deps, input).apply();
}

/** Read canonical complete defaults for init; absence is distinct from malformed/applying state. */
export function readPersonalAuthoringDefaults(
  deps: PersonalAuthoringSetupDeps,
): readonly AuthoringClientId[] | undefined {
  const blockers: PersonalAuthoringSetupBlocker[] = [];
  const home = inspectHome(deps, blockers);
  if (home === undefined) {
    if (deps.env.getEnv("HOME") === undefined || deps.env.getEnv("HOME") === "") return undefined;
    throw new PersonalAuthoringSetupPreflightError(blockers);
  }
  const api = pathApi(deps.env);
  const statePath = api.join(home.native, PERSONAL_AUTHORING_STATE_PATH);
  inspectDirectoryAncestors(deps, home.native, ".wpm", blockers, {
    surface: "managed-state",
  });
  if (blockers.length > 0) throw new PersonalAuthoringSetupPreflightError(blockers);
  let inspected: PathInspection;
  try {
    inspected = deps.fs.inspectPath(statePath);
  } catch (error) {
    throw new PersonalAuthoringSetupPreflightError([
      {
        code: "personal-state-unreadable",
        surface: "managed-state",
        path: toPosix(statePath),
        message: `cannot inspect personal state: ${error instanceof Error ? error.message : String(error)}`,
        recovery: "restore readable canonical personal state or pass explicit workspace clients",
      },
    ]);
  }
  if (inspected.kind === "missing") {
    inspectUnboundQuarantineParent(deps, home.native, blockers);
    if (blockers.length > 0) throw new PersonalAuthoringSetupPreflightError(blockers);
    return undefined;
  }
  if (inspected.kind !== "file") {
    throw new PersonalAuthoringSetupPreflightError([
      {
        code: "personal-state-invalid",
        surface: "managed-state",
        path: toPosix(statePath),
        message: `personal state path is ${inspected.kind}`,
        recovery:
          "restore the canonical complete personal state or pass explicit workspace clients",
      },
    ]);
  }
  let stateText: string;
  try {
    stateText = deps.fs.read(statePath);
  } catch (error) {
    throw new PersonalAuthoringSetupPreflightError([
      {
        code: "personal-state-unreadable",
        surface: "managed-state",
        path: toPosix(statePath),
        message: `cannot read personal state: ${error instanceof Error ? error.message : String(error)}`,
        recovery: "restore readable canonical personal state or pass explicit workspace clients",
      },
    ]);
  }
  const parsed = parsePersonalAuthoringState(stateText);
  if (!parsed.ok || parsed.value.status !== "complete" || parsed.value.home !== home.portable) {
    throw new PersonalAuthoringSetupPreflightError([
      {
        code: "personal-state-invalid",
        surface: "managed-state",
        path: toPosix(statePath),
        message: parsed.ok ? "personal state is not complete for this HOME" : parsed.reason,
        recovery:
          "restore the canonical complete personal state or pass explicit workspace clients",
      },
    ]);
  }
  return parsed.value.defaults;
}
