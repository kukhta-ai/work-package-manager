import { dirname, isAbsolute, join, posix, relative, win32 } from "node:path";
import { toPosix } from "../../util/posix-path.js";
import { editYaml, parseYaml, stringifyYaml } from "../../util/yaml.js";
import {
  type BundleAuthoringBlocker,
  BundleAuthoringPreflightError,
  type MutationBoundary,
  MutationFailure,
  type MutationLifecycleBeat,
} from "../errors.js";
import {
  AUTHORING_BACKLOG_DIR,
  AUTHORING_TASK_PREFIX,
  type BundleId,
  type BundleManifest,
  type OperationResult,
  type Project,
  parseBundleId,
  parseSemVer,
  type Template,
  type TemplateFile,
} from "../model/index.js";
import type { BacklogMd, ConfinedQuarantine, FileSystem, TaskRecord } from "../ports/index.js";
import {
  BUNDLE_AUTHORING_CONTRIBUTIONS_PATH,
  BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH,
  type BundleAuthoringContributions,
  bundleContributionScaffoldSha256,
  canonicalBundleAuthoringTaskSource,
  createEmptyBundleAuthoringContributions,
  parseBundleAuthoringContributions,
  type RecordedConcreteBundleContribution,
  recordedConcreteContributionFromPlan,
  serializeBundleAuthoringContributions,
  withRecordedBundleContribution,
} from "../services/bundle-authoring-contributions.js";
import {
  compileBundleAuthoringTaskPlan,
  compileRecordedBundleAuthoringTaskPlan,
  reconcileBundleAuthoringTaskPlan,
} from "../services/bundle-authoring-task-plan.js";
import { type CurrentState, planChanges } from "../services/derived-artefacts.js";
import { hashTextContent } from "../services/integrity.js";
import { type RenderedFile, renderSnippet, renderTree } from "../services/render.js";
import {
  parseBundleManifest,
  parseManifest,
  serializeBundleManifest,
} from "../services/schema/index.js";
import { inspectTemplateAuthoringTasks } from "../services/template-authoring-tasks.js";
import { resolveTemplate } from "../services/template-resolver.js";
import { advisorSkillPath } from "./advisor.js";
import { perBundleAuthoringTaskCatalog } from "./create-bundle.js";
import { deriveArtefactsFromTemplateSnapshot } from "./derive-artefacts-capability.js";
import { loadProject, type OperationContext } from "./lifecycle.js";

const DEFAULT_BUNDLE_TEMPLATE = "default";
const DEFAULT_PROJECT_TEMPLATE = "minimal";
const DEFAULT_VERSION = "0.1.0";
const BUNDLE_TEMPLATE_DIR = "bundle-template";
const BUNDLE_MANIFEST_FILE = "bundle.yml";
const MANIFEST_FILE = "manifest.yml";
const INSTALL_BACKLOG_DIR = "install-backlog";
const BACKLOG_ALIAS_DIR = "backlog";
const ADVISOR_SNIPPET_PATH = "advisor.SKILL.md.tmpl";
const BUNDLE_AUTHORING_QUARANTINE_DIR = ".wpm-bundle-authoring-quarantine";

/** Dependencies shared by the bounded create/enable complete-authoring operations. */
export interface BundleAuthoringOperationDeps {
  readonly fs: FileSystem;
  readonly backlog: BacklogMd;
  readonly builtinTemplatesRoot: string;
  readonly projectTemplateName?: string;
}

export interface CreateBundleWithAuthoringInput {
  readonly id: string;
  readonly version?: string;
  readonly disabled?: boolean;
  readonly advisor?: boolean;
  readonly templateName?: string;
}

export interface EnableBundleWithAuthoringInput {
  readonly id: string;
  readonly advisor?: boolean;
}

export interface SetDefaultBundleTemplateInput {
  readonly name: string;
}

export interface SetDefaultBundleTemplateResult extends OperationResult {
  readonly fileCount: number;
}

interface PlannedAction {
  readonly boundary: MutationBoundary;
  readonly beat: MutationLifecycleBeat;
  readonly apply: () => void;
}

interface ObservedContributionState {
  readonly state: BundleAuthoringContributions;
  readonly text: string | null;
}

interface ObservedBacklog {
  readonly records: readonly TaskRecord[];
  readonly activeEntries: readonly string[];
  readonly inactiveEntries: readonly string[];
  readonly criticalUnexpectedEntries: readonly string[];
  readonly taskPrefix: string;
}

interface ObservedAlias {
  readonly linkPath: string;
  readonly targetPath: string;
  readonly before:
    | { readonly kind: "missing" }
    | { readonly kind: "symbolic-link"; readonly target: string }
    | { readonly kind: "directory"; readonly evidence: string };
}

interface ObservedDerivedPlan {
  readonly changes: ReturnType<typeof planChanges>;
  readonly files: readonly {
    readonly path: string;
    readonly content: string;
    readonly before: string | null;
  }[];
  readonly aliases: readonly ObservedAlias[];
}

interface ObservedProjectSnapshot {
  readonly project: Project;
  readonly manifestText: string;
  readonly enabledDescriptors: ReadonlyMap<string, string>;
}

interface PlannedOutputPath {
  readonly path: string;
  readonly kind: "file" | "alias";
  readonly owner: string;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isCanonicalExistingPath(fs: FileSystem, path: string): boolean {
  return toPosix(fs.canonicalPath(path)) === toPosix(path);
}

function requiredCanonicalTaskSource(template: Template) {
  const source = canonicalBundleAuthoringTaskSource(template.authoringTaskSource);
  if (source === undefined) {
    throw new Error("validated bundle task source has no canonical durable producer image");
  }
  return source;
}

function blocker(blockers: BundleAuthoringBlocker[], value: BundleAuthoringBlocker): void {
  blockers.push(value);
}

function sortedBlockers(blockers: readonly BundleAuthoringBlocker[]): BundleAuthoringBlocker[] {
  return [...blockers].sort(
    (left, right) =>
      compareCodeUnits(left.surface, right.surface) ||
      compareCodeUnits(left.path ?? "", right.path ?? "") ||
      compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.message, right.message),
  );
}

function isContained(ancestor: string, candidate: string): boolean {
  const rel = relative(ancestor, candidate);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith("../") &&
    !rel.startsWith("..\\") &&
    !isAbsolute(rel)
  );
}

function addWholePlanPathBlockers(
  paths: readonly PlannedOutputPath[],
  blockers: BundleAuthoringBlocker[],
): void {
  const byPath = new Map<string, PlannedOutputPath[]>();
  for (const output of paths) {
    const existing = byPath.get(output.path) ?? [];
    existing.push(output);
    byPath.set(output.path, existing);
  }
  for (const [path, owners] of byPath) {
    if (owners.length <= 1) continue;
    blocker(blockers, {
      code: "bundle-plan-path-collision",
      surface: "bundle",
      path: toPosix(path),
      message: `one destination is claimed by multiple outputs: ${owners.map(({ owner }) => owner).join(", ")}`,
      recovery: "Repair the selected scaffold and derived outputs so every path has one owner.",
    });
  }
  for (const ancestor of paths) {
    for (const descendant of paths) {
      if (ancestor.path === descendant.path || !isContained(ancestor.path, descendant.path))
        continue;
      blocker(blockers, {
        code: "bundle-plan-nondirectory-ancestor",
        surface: "bundle",
        path: toPosix(ancestor.path),
        message: `${ancestor.owner} is a non-directory ancestor of ${descendant.owner}`,
        recovery:
          "Repair the selected scaffold and derived outputs so descendants have directory ancestors.",
      });
    }
  }
}

function addAliasTargetBlocker(
  fs: FileSystem,
  target: string,
  plannedFiles: readonly string[],
  blockers: BundleAuthoringBlocker[],
): void {
  try {
    const inspected = fs.inspectPath(target);
    const existingReal =
      inspected.kind === "directory" && toPosix(fs.canonicalPath(target)) === toPosix(target);
    const plannedReal = plannedFiles.some((path) => isContained(target, path));
    if (!existingReal && !plannedReal) {
      blocker(blockers, {
        code: "bundle-alias-target-missing",
        surface: "derived-artifact",
        path: toPosix(target),
        message: `alias target is ${inspected.kind} and no planned file creates its directory tree`,
        recovery: "Restore or plan a real alias target directory before creating the alias.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-alias-target-unreadable",
      surface: "derived-artifact",
      path: toPosix(target),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable canonical access to the planned alias target.",
    });
  }
}

function inspectMutationPath(
  fs: FileSystem,
  path: string,
  surface: BundleAuthoringBlocker["surface"],
  blockers: BundleAuthoringBlocker[],
): void {
  try {
    const capability = fs.inspectMutationCapability(path);
    if (!capability.capable) {
      blocker(blockers, {
        code: "bundle-mutation-unavailable",
        surface,
        path: toPosix(path),
        message: capability.reason,
        recovery:
          "Restore writable canonical access to every planned destination before repeating the request.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-mutation-capability-unreadable",
      surface,
      path: toPosix(path),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore inspectable mutation permissions for every planned destination.",
    });
  }
}

function inspectMutationPair(
  fs: FileSystem,
  firstPath: string,
  secondPath: string,
  blockers: BundleAuthoringBlocker[],
): void {
  try {
    const capability = fs.inspectMutationCompatibility(firstPath, secondPath);
    if (!capability.capable) {
      blocker(blockers, {
        code: "bundle-mutation-device-incompatible",
        surface: "bundle",
        path: `${toPosix(firstPath)} -> ${toPosix(secondPath)}`,
        message: capability.reason,
        recovery:
          "Place the workspace outputs and WPM-private evidence on one compatible filesystem.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-mutation-device-unreadable",
      surface: "bundle",
      path: `${toPosix(firstPath)} -> ${toPosix(secondPath)}`,
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore inspectable same-filesystem access for the bounded publication.",
    });
  }
}

function inspectQuarantineAbsent(
  fs: FileSystem,
  root: string,
  blockers: BundleAuthoringBlocker[],
): void {
  try {
    const kind = fs.inspectPath(root);
    if (kind.kind !== "missing") {
      blocker(blockers, {
        code: "bundle-authoring-quarantine-ambiguous",
        surface: "bundle",
        path: toPosix(root),
        message: `request-bound mutation evidence is ${kind.kind}, not absent`,
        recovery:
          "Preserve and resolve the prior bounded mutation evidence before repeating a bundle request.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-authoring-quarantine-unreadable",
      surface: "bundle",
      path: toPosix(root),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable access to the request-bound mutation evidence.",
    });
  }
}

function inspectQuarantinedReplacement(
  fs: FileSystem,
  publicPath: string,
  quarantine: ConfinedQuarantine,
  blockers: BundleAuthoringBlocker[],
): void {
  inspectMutationPath(fs, quarantine.path, "bundle", blockers);
  inspectMutationPair(fs, publicPath, quarantine.path, blockers);
}

function assertRealDirectory(fs: FileSystem, path: string): void {
  if (
    fs.inspectPath(path).kind !== "directory" ||
    toPosix(fs.canonicalPath(path)) !== toPosix(path)
  ) {
    throw new Error(`required mutation ancestor is not a canonical real directory: ${path}`);
  }
}

function ensureRealDirectoryChain(fs: FileSystem, root: string, path: string): void {
  assertRealDirectory(fs, root);
  if (path === root) return;
  if (!isContained(root, path)) {
    throw new Error(`planned directory escapes its canonical root: ${path}`);
  }
  const segments = relative(root, path).split(/[\\/]/u).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const inspected = fs.inspectPath(current);
    if (inspected.kind === "missing") fs.makeDirectories(current);
    assertRealDirectory(fs, current);
  }
}

function ensureAliasAtBoundary(
  fs: FileSystem,
  confinementRoot: string,
  targetArgument: string,
  targetPath: string,
  linkPath: string,
): void {
  assertRealDirectory(fs, confinementRoot);
  ensureRealDirectoryChain(fs, confinementRoot, dirname(linkPath));
  assertRealDirectory(fs, targetPath);
  if (fs.inspectPath(linkPath).kind !== "missing") {
    throw new Error(`alias destination appeared after preflight: ${linkPath}`);
  }
  fs.ensureAlias(targetArgument, linkPath);
  if (!exactAliasOrCopy(fs, linkPath, targetArgument, targetPath)) {
    throw new Error(`created alias does not exactly target its frozen source: ${linkPath}`);
  }
}

function inspectRealDirectory(
  fs: FileSystem,
  path: string,
  surface: BundleAuthoringBlocker["surface"],
  blockers: BundleAuthoringBlocker[],
  allowMissing = false,
): boolean {
  try {
    const kind = fs.inspectPath(path);
    if (allowMissing && kind.kind === "missing") return true;
    if (kind.kind !== "directory") {
      blocker(blockers, {
        code: "bundle-path-ancestor-ambiguous",
        surface,
        path: toPosix(path),
        message: `required path ancestor is ${kind.kind}, not a real directory`,
        recovery: "Restore a real directory chain beneath the canonical workspace root.",
      });
      return false;
    }
    const canonical = fs.canonicalPath(path);
    if (toPosix(canonical) !== toPosix(path)) {
      blocker(blockers, {
        code: "bundle-path-ancestor-noncanonical",
        surface,
        path: toPosix(path),
        message: `path ancestor resolves to ${toPosix(canonical)}`,
        recovery:
          "Use the canonical workspace root and replace aliased ancestors with real directories.",
      });
      return false;
    }
    return true;
  } catch (error) {
    blocker(blockers, {
      code: "bundle-path-ancestor-unreadable",
      surface,
      path: toPosix(path),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable no-follow access to every planned path ancestor.",
    });
    return false;
  }
}

function inspectOperationRoots(
  fs: FileSystem,
  ctx: OperationContext,
  blockers: BundleAuthoringBlocker[],
  allowMissingBundles = false,
): void {
  inspectRealDirectory(fs, ctx.workspaceRoot, "contribution-record", blockers);
  inspectRealDirectory(fs, ctx.deliverableRoot, "bundle", blockers);
  inspectRealDirectory(
    fs,
    join(ctx.deliverableRoot, "bundles"),
    "bundle",
    blockers,
    allowMissingBundles,
  );
}

function observeContributionState(
  fs: FileSystem,
  workspaceRoot: string,
  blockers: BundleAuthoringBlocker[],
): ObservedContributionState | undefined {
  const path = join(workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
  try {
    const pendingPath = join(workspaceRoot, BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH);
    const pendingKind = fs.inspectPath(pendingPath);
    if (pendingKind.kind !== "missing") {
      blocker(blockers, {
        code: "bundle-template-set-incomplete",
        surface: "contribution-record",
        path: toPosix(pendingPath),
        message: "a prior bundle-template publication did not reach its final cleanup boundary",
        recovery:
          "Inspect the typed partial result and the scaffold/record bytes, then remove the exact WPM pending marker only after resolving the incomplete publication.",
      });
    }
    const kind = fs.inspectPath(path);
    if (kind.kind === "missing") {
      return { state: createEmptyBundleAuthoringContributions(), text: null };
    }
    if (kind.kind !== "file") {
      blocker(blockers, {
        code: "contribution-record-ambiguous",
        surface: "contribution-record",
        path: toPosix(path),
        message: "the bundle contribution record is not a regular file",
        recovery: "Move the unowned path aside or restore the exact WPM contribution record.",
      });
      return undefined;
    }
    if (!isCanonicalExistingPath(fs, path)) {
      blocker(blockers, {
        code: "contribution-record-noncanonical",
        surface: "contribution-record",
        path: toPosix(path),
        message: "the bundle contribution record resolves through a noncanonical ancestor or alias",
        recovery: "Restore the exact regular WPM contribution record beneath the workspace root.",
      });
      return undefined;
    }
    const text = fs.read(path);
    const parsed = parseBundleAuthoringContributions(text);
    if (!parsed.ok) {
      blocker(blockers, {
        code: "contribution-record-invalid",
        surface: "contribution-record",
        path: toPosix(path),
        message: parsed.reason,
        recovery: "Restore the exact canonical WPM record before changing bundle authoring work.",
      });
      return undefined;
    }
    return { state: parsed.value, text };
  } catch (error) {
    blocker(blockers, {
      code: "contribution-record-unreadable",
      surface: "contribution-record",
      path: toPosix(path),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable regular-file access to the contribution record.",
    });
    return undefined;
  }
}

function readTree(fs: FileSystem, root: string): TemplateFile[] {
  const files: TemplateFile[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.list(directory)) {
      if (prefix.length === 0 && entry.name === BACKLOG_ALIAS_DIR) continue;
      const absolute = join(directory, entry.name);
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const inspected = fs.inspectPath(absolute);
      if (inspected.kind === "symbolic-link" || inspected.kind === "other") {
        throw new Error(`bundle scaffold contains an unsupported ${inspected.kind} at ${relative}`);
      }
      if (inspected.kind === "directory") walk(absolute, relative);
      else if (inspected.kind === "file")
        files.push({ path: relative, content: fs.read(absolute) });
    }
  };
  walk(root, "");
  return files.sort((left, right) => compareCodeUnits(left.path, right.path));
}

function treeEvidence(fs: FileSystem, root: string): string {
  const entries: Array<readonly [string, string]> = [];
  const walk = (path: string, relative: string): void => {
    const inspected = fs.inspectPath(path);
    if (inspected.kind === "file") {
      entries.push([relative, `file:${fs.read(path)}`]);
      return;
    }
    if (inspected.kind === "symbolic-link") {
      entries.push([relative, `symbolic-link:${inspected.target}`]);
      return;
    }
    if (inspected.kind !== "directory") {
      entries.push([relative, inspected.kind]);
      return;
    }
    entries.push([relative, "directory"]);
    for (const entry of fs
      .list(path)
      .sort((left, right) => compareCodeUnits(left.name, right.name))) {
      walk(
        join(path, entry.name),
        relative.length === 0 ? entry.name : `${relative}/${entry.name}`,
      );
    }
  };
  walk(root, "");
  return JSON.stringify(entries);
}

function confinedTreeFingerprint(fs: FileSystem, root: string): string {
  const entries: Array<{
    readonly path: string;
    readonly kind: "directory" | "file" | "symbolic-link" | "other";
    readonly sha256?: string;
    readonly target?: string;
  }> = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of [...fs.list(directory)].sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    )) {
      const absolute = join(directory, entry.name);
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const inspected = fs.inspectPath(absolute);
      if (inspected.kind === "directory") {
        entries.push({ path, kind: "directory" });
        walk(absolute, path);
      } else if (inspected.kind === "file") {
        entries.push({ path, kind: "file", sha256: fs.digestFile(absolute) });
      } else if (inspected.kind === "symbolic-link") {
        entries.push({ path, kind: "symbolic-link", target: inspected.target });
      } else if (inspected.kind === "other") {
        entries.push({ path, kind: "other" });
      } else {
        throw new Error(`tree entry disappeared during inspection: ${absolute}`);
      }
    }
  };
  walk(root, "");
  return hashTextContent(JSON.stringify(entries));
}

function exactAliasOrCopy(
  fs: FileSystem,
  linkPath: string,
  symbolicTarget: string,
  copyTarget: string,
): boolean {
  const inspected = fs.inspectPath(linkPath);
  if (inspected.kind === "symbolic-link") {
    return exactAliasTarget(inspected.target, symbolicTarget);
  }
  return (
    inspected.kind === "directory" &&
    fs.inspectPath(copyTarget).kind === "directory" &&
    treeEvidence(fs, linkPath) === treeEvidence(fs, copyTarget)
  );
}

function exactAliasTarget(observedTarget: string, expectedTarget: string): boolean {
  // The in-memory port exposes absolute targets in a POSIX observation dialect. Relative symlink targets are
  // portable archive data, however, and must retain their exact bytes (not merely equivalent separators).
  const expectedIsAbsolute = posix.isAbsolute(expectedTarget) || win32.isAbsolute(expectedTarget);
  if (!expectedIsAbsolute) return observedTarget === expectedTarget;
  return (
    (posix.isAbsolute(observedTarget) || win32.isAbsolute(observedTarget)) &&
    toPosix(observedTarget) === toPosix(expectedTarget)
  );
}

function scaffoldMatches(
  fs: FileSystem,
  root: string,
  files: readonly TemplateFile[],
  opaquePaths: readonly string[] = [BACKLOG_ALIAS_DIR],
): boolean {
  if (fs.inspectPath(root).kind !== "directory") return false;
  const expectedFiles = new Map(files.map(({ path, content }) => [path, content]));
  const expectedDirectories = new Set<string>([""]);
  const opaque = new Set(opaquePaths);
  for (const { path } of files) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      expectedDirectories.add(segments.slice(0, index).join("/"));
    }
  }
  for (const path of opaque) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      expectedDirectories.add(segments.slice(0, index).join("/"));
    }
  }
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>([""]);
  const walk = (directory: string, prefix: string): boolean => {
    for (const entry of fs.list(directory)) {
      const absolute = join(directory, entry.name);
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (opaque.has(path)) continue;
      const inspected = fs.inspectPath(absolute);
      if (inspected.kind === "directory") {
        if (!expectedDirectories.has(path)) return false;
        seenDirectories.add(path);
        if (!walk(absolute, path)) return false;
      } else if (inspected.kind === "file") {
        if (expectedFiles.get(path) !== fs.read(absolute)) return false;
        seenFiles.add(path);
      } else return false;
    }
    return true;
  };
  return (
    walk(root, "") &&
    seenFiles.size === expectedFiles.size &&
    seenDirectories.size === expectedDirectories.size
  );
}

/** Exact deterministic fingerprint retained with a selected default scaffold. */
export function bundleScaffoldSha256(files: readonly TemplateFile[]): string {
  return bundleContributionScaffoldSha256(files);
}

function inspectBacklog(
  fs: FileSystem,
  backlog: BacklogMd,
  root: string,
  blockers: BundleAuthoringBlocker[],
): ObservedBacklog | undefined {
  inspectRealDirectory(fs, root, "backlog", blockers);
  try {
    const availability = backlog.inspectAvailability();
    if (!availability.available) {
      blocker(blockers, {
        code: "backlog-unavailable",
        surface: "backlog",
        path: toPosix(root),
        message: availability.reason,
        recovery:
          "Install or restore the supported Backlog.md executable, then repeat the request.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "backlog-unavailable",
      surface: "backlog",
      path: toPosix(root),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore the supported Backlog.md executable, then repeat the request.",
    });
  }
  let taskPrefix = "";
  try {
    const inspected = backlog.inspectRoot(root);
    if (!inspected.valid) {
      blocker(blockers, {
        code: "backlog-root-invalid",
        surface: "backlog",
        path: toPosix(root),
        message: inspected.reason,
        recovery: "Restore the workspace's exact authoring Backlog.md root.",
      });
      return undefined;
    }
    taskPrefix = inspected.taskPrefix;
    if (taskPrefix !== AUTHORING_TASK_PREFIX) {
      blocker(blockers, {
        code: "backlog-task-prefix-mismatch",
        surface: "backlog",
        path: toPosix(root),
        message: `authoring backlog task prefix is ${JSON.stringify(taskPrefix)}, expected ${JSON.stringify(AUTHORING_TASK_PREFIX)}`,
        recovery: "Restore the workspace authoring task prefix before materialising bundle work.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "backlog-root-unreadable",
      surface: "backlog",
      path: toPosix(root),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable access to the workspace authoring backlog.",
    });
    return undefined;
  }
  let inventory: ReturnType<BacklogMd["inspectTaskInventory"]> | undefined;
  try {
    inventory = backlog.inspectTaskInventory(root);
    if (!inventory.configurationMatchesFreshDefaults) {
      blocker(blockers, {
        code: "backlog-configuration-mismatch",
        surface: "backlog",
        path: toPosix(root),
        message: "the authoring backlog configuration no longer matches its managed defaults",
        recovery:
          "Restore the exact managed authoring Backlog.md configuration before materialising work.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "backlog-inventory-unreadable",
      surface: "backlog",
      path: toPosix(root),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore no-follow inventory access to the workspace authoring backlog.",
    });
  }
  try {
    const summaries = backlog.listTasks(root);
    const records: TaskRecord[] = [];
    let summaryRecordMismatch = false;
    for (const summary of summaries) {
      try {
        const record = backlog.readTask(root, summary.id);
        if (
          record.id !== summary.id ||
          record.title !== summary.title ||
          record.status !== summary.status
        ) {
          summaryRecordMismatch = true;
        }
        records.push(record);
      } catch (error) {
        blocker(blockers, {
          code: "backlog-task-unreadable",
          surface: "backlog",
          path: summary.id,
          message: error instanceof Error ? error.message : String(error),
          recovery: `Restore readable access to authoring task ${summary.id}.`,
        });
      }
    }
    const listedIds = summaries.map(({ id }) => id).sort(compareCodeUnits);
    const recordIds = records.map(({ id }) => id).sort(compareCodeUnits);
    const activeEntries = [...(inventory?.activeEntries ?? listedIds)].sort(compareCodeUnits);
    const criticalUnexpectedEntries = (inventory?.unexpectedEntries ?? [])
      .filter((entry) => entry.startsWith(".locks/") || entry.startsWith("unrecognized:tasks/"))
      .sort(compareCodeUnits);
    if (
      new Set(listedIds).size !== listedIds.length ||
      new Set(recordIds).size !== recordIds.length ||
      new Set(activeEntries).size !== activeEntries.length ||
      summaryRecordMismatch ||
      JSON.stringify(recordIds) !== JSON.stringify(listedIds) ||
      JSON.stringify(activeEntries) !== JSON.stringify(listedIds)
    ) {
      blocker(blockers, {
        code: "backlog-active-inventory-ambiguous",
        surface: "backlog",
        path: toPosix(root),
        message:
          "active task-store entries, list summaries, and full records contain duplicate IDs or do not agree exactly",
        recovery:
          "Resolve malformed, duplicate, or hidden active task entries before materialising work.",
      });
    }
    if (criticalUnexpectedEntries.length > 0) {
      blocker(blockers, {
        code: "backlog-active-inventory-ambiguous",
        surface: "backlog",
        path: criticalUnexpectedEntries.join(", "),
        message: "the authoring backlog contains an active lock or unrecognized active entry",
        recovery: "Resolve the ambiguous active Backlog.md evidence before materialising work.",
      });
    }
    return {
      records,
      activeEntries,
      inactiveEntries: [...(inventory?.inactiveEntries ?? [])].sort(compareCodeUnits),
      criticalUnexpectedEntries,
      taskPrefix,
    };
  } catch (error) {
    blocker(blockers, {
      code: "backlog-list-unreadable",
      surface: "backlog",
      path: toPosix(root),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable access to the workspace authoring backlog.",
    });
    return undefined;
  }
}

function observeProjectSnapshot(
  fs: FileSystem,
  deliverableRoot: string,
  blockers: BundleAuthoringBlocker[],
): ObservedProjectSnapshot | undefined {
  const manifestPath = join(deliverableRoot, MANIFEST_FILE);
  let manifestText: string;
  let manifest: Project["manifest"];
  try {
    if (fs.inspectPath(manifestPath).kind !== "file") {
      throw new Error("project manifest is not a regular file");
    }
    if (!isCanonicalExistingPath(fs, manifestPath)) {
      throw new Error("project manifest resolves through a noncanonical ancestor or alias");
    }
    manifestText = fs.read(manifestPath);
    const parsed = parseManifest(parseYaml(manifestText));
    if (!parsed.ok) throw new Error(parsed.problem.message);
    manifest = parsed.value;
  } catch (error) {
    blocker(blockers, {
      code: "project-manifest-invalid",
      surface: "manifest",
      path: toPosix(manifestPath),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Repair the canonical project manifest before changing bundle membership.",
    });
    return undefined;
  }

  const evidence = new Map<string, string>();
  const bundles = new Map<BundleId, BundleManifest>();
  let valid = true;
  for (const id of manifest.bundles) {
    const path = join(deliverableRoot, "bundles", id, BUNDLE_MANIFEST_FILE);
    try {
      if (fs.inspectPath(path).kind !== "file") {
        throw new Error("enabled bundle descriptor is not a regular file");
      }
      if (!isCanonicalExistingPath(fs, path)) {
        throw new Error(
          "enabled bundle descriptor resolves through a noncanonical ancestor or alias",
        );
      }
      const text = fs.read(path);
      const parsed = parseBundleManifest(parseYaml(text));
      if (!parsed.ok) throw new Error(parsed.problem.message);
      if (parsed.value.id !== id) {
        throw new Error(
          `descriptor id ${JSON.stringify(parsed.value.id)} does not match manifest/path id ${JSON.stringify(id)}`,
        );
      }
      bundles.set(id, parsed.value);
      evidence.set(path, text);
    } catch (error) {
      valid = false;
      blocker(blockers, {
        code: "enabled-bundle-snapshot-invalid",
        surface: "manifest",
        path: toPosix(path),
        message: error instanceof Error ? error.message : String(error),
        recovery: "Restore exact readable enabled bundle descriptors before changing membership.",
      });
    }
  }
  if (!valid) return undefined;
  return {
    project: { rootPath: deliverableRoot, manifest, bundles },
    manifestText,
    enabledDescriptors: evidence,
  };
}

function assertDescriptorEvidenceUnchanged(
  fs: FileSystem,
  evidence: ReadonlyMap<string, string>,
): void {
  for (const [path, text] of evidence) {
    if (
      fs.inspectPath(path).kind !== "file" ||
      !isCanonicalExistingPath(fs, path) ||
      fs.read(path) !== text
    ) {
      throw new Error(`enabled bundle descriptor changed after preflight: ${path}`);
    }
  }
}

function projectTemplate(
  deps: BundleAuthoringOperationDeps,
  deliverableRoot: string,
  blockers: BundleAuthoringBlocker[],
): Template | undefined {
  const name = deps.projectTemplateName ?? DEFAULT_PROJECT_TEMPLATE;
  try {
    const resolution = resolveTemplate(name, "project", {
      fs: deps.fs,
      builtinTemplatesRoot: deps.builtinTemplatesRoot,
      projectTemplatesRoot: join(deliverableRoot, "templates"),
    });
    if (!resolution.found) {
      blocker(blockers, {
        code: "project-template-unavailable",
        surface: "derived-artifact",
        message: `project template ${JSON.stringify(name)} was not found`,
        recovery: "Restore the selected project template before changing bundle membership.",
      });
      return undefined;
    }
    return resolution.template;
  } catch (error) {
    blocker(blockers, {
      code: "project-template-invalid",
      surface: "derived-artifact",
      message: error instanceof Error ? error.message : String(error),
      recovery: "Repair the selected project template before changing bundle membership.",
    });
    return undefined;
  }
}

function observeDesiredChanges(
  fs: FileSystem,
  root: string,
  desired: ReturnType<typeof deriveArtefactsFromTemplateSnapshot>,
  blockers: BundleAuthoringBlocker[],
): ObservedDerivedPlan {
  const renderable = desired.files.filter(({ path }) => path !== "AGENTS.md");
  const files = new Map<string, string>();
  const observedFiles: Array<{ path: string; content: string; before: string | null }> = [];
  for (const file of renderable) {
    const absolute = join(root, file.path);
    try {
      const kind = fs.inspectPath(absolute);
      if (kind.kind === "file") {
        if (!isCanonicalExistingPath(fs, absolute)) {
          blocker(blockers, {
            code: "derived-path-noncanonical",
            surface: "derived-artifact",
            path: toPosix(absolute),
            message: "derived file resolves through a noncanonical ancestor or alias",
            recovery: "Replace aliased ancestors with real directories beneath the workspace root.",
          });
          continue;
        }
        const before = fs.read(absolute);
        files.set(file.path, before);
        observedFiles.push({ path: file.path, content: file.content, before });
      } else if (kind.kind === "missing") {
        observedFiles.push({ path: file.path, content: file.content, before: null });
      } else {
        blocker(blockers, {
          code: "derived-path-ambiguous",
          surface: "derived-artifact",
          path: toPosix(absolute),
          message: `derived file destination is ${kind.kind}, not a regular file or absence`,
          recovery: "Move the unowned destination aside or restore the expected regular file.",
        });
      }
    } catch (error) {
      blocker(blockers, {
        code: "derived-path-unreadable",
        surface: "derived-artifact",
        path: toPosix(absolute),
        message: error instanceof Error ? error.message : String(error),
        recovery: "Restore readable access to the derived destination.",
      });
    }
  }
  const aliases = new Set<string>();
  const observedAliases: ObservedAlias[] = [];
  for (const alias of desired.aliasPlan.aliases) {
    const absolute = join(root, alias.linkPath);
    const target = join(root, alias.aliasTo);
    try {
      const kind = fs.inspectPath(absolute);
      if (kind.kind === "missing") {
        observedAliases.push({
          linkPath: alias.linkPath,
          targetPath: alias.aliasTo,
          before: { kind: "missing" },
        });
        continue;
      }
      const parentReal = inspectRealDirectory(fs, dirname(absolute), "derived-artifact", blockers);
      const targetReal = inspectRealDirectory(fs, target, "derived-artifact", blockers);
      const copyCanonical = kind.kind !== "directory" || isCanonicalExistingPath(fs, absolute);
      if (!parentReal || !targetReal || !copyCanonical) {
        if (!copyCanonical) {
          blocker(blockers, {
            code: "derived-alias-noncanonical",
            surface: "derived-artifact",
            path: toPosix(absolute),
            message: "derived alias copy resolves through a noncanonical ancestor or alias",
            recovery: "Restore an exact real WPM-owned alias copy beneath the workspace root.",
          });
        }
        continue;
      }
      const targetKind = fs.inspectPath(target);
      const exactSymbolicLink =
        kind.kind === "symbolic-link" && exactAliasTarget(kind.target, target);
      const exactCopy =
        kind.kind === "directory" &&
        targetKind.kind === "directory" &&
        treeEvidence(fs, absolute) === treeEvidence(fs, target);
      if (exactSymbolicLink || exactCopy) {
        aliases.add(alias.linkPath);
        observedAliases.push({
          linkPath: alias.linkPath,
          targetPath: alias.aliasTo,
          before:
            kind.kind === "symbolic-link"
              ? { kind: "symbolic-link", target: kind.target }
              : { kind: "directory", evidence: treeEvidence(fs, absolute) },
        });
      } else {
        blocker(blockers, {
          code: "derived-alias-ambiguous",
          surface: "derived-artifact",
          path: toPosix(absolute),
          message: `derived alias destination is ${kind.kind} and does not exactly target ${toPosix(target)}`,
          recovery:
            "Restore the exact WPM-created alias/copy or move the unowned destination aside.",
        });
      }
    } catch (error) {
      blocker(blockers, {
        code: "derived-alias-unreadable",
        surface: "derived-artifact",
        path: toPosix(absolute),
        message: error instanceof Error ? error.message : String(error),
        recovery: "Restore readable access to the derived alias destination.",
      });
    }
  }
  const current: CurrentState = { files, aliases };
  return {
    changes: planChanges({ files: renderable, aliasPlan: desired.aliasPlan }, current),
    files: observedFiles,
    aliases: observedAliases,
  };
}

function assertDerivedPreimage(fs: FileSystem, root: string, observed: ObservedDerivedPlan): void {
  for (const file of observed.files) {
    const path = join(root, file.path);
    const inspected = fs.inspectPath(path);
    if (
      (file.before === null && inspected.kind !== "missing") ||
      (file.before !== null &&
        (inspected.kind !== "file" ||
          !isCanonicalExistingPath(fs, path) ||
          fs.read(path) !== file.before))
    ) {
      throw new Error(`derived file changed after preflight: ${path}`);
    }
  }
  for (const alias of observed.aliases) {
    const path = join(root, alias.linkPath);
    const inspected = fs.inspectPath(path);
    if (alias.before.kind === "missing") {
      if (inspected.kind !== "missing")
        throw new Error(`derived alias appeared after preflight: ${path}`);
    } else if (
      !isCanonicalExistingPath(fs, dirname(path)) ||
      !isCanonicalExistingPath(fs, join(root, alias.targetPath)) ||
      (alias.before.kind === "symbolic-link"
        ? inspected.kind !== "symbolic-link" || inspected.target !== alias.before.target
        : inspected.kind !== "directory" ||
          !isCanonicalExistingPath(fs, path) ||
          treeEvidence(fs, path) !== alias.before.evidence)
    ) {
      throw new Error(`derived alias changed after preflight: ${path}`);
    }
  }
}

function assertDerivedPostcondition(
  fs: FileSystem,
  root: string,
  observed: ObservedDerivedPlan,
): void {
  for (const file of observed.files) {
    const path = join(root, file.path);
    if (
      fs.inspectPath(path).kind !== "file" ||
      !isCanonicalExistingPath(fs, path) ||
      fs.read(path) !== file.content
    ) {
      throw new Error(`derived file does not match the complete plan: ${path}`);
    }
  }
  for (const alias of observed.aliases) {
    const path = join(root, alias.linkPath);
    const target = join(root, alias.targetPath);
    if (
      !isCanonicalExistingPath(fs, dirname(path)) ||
      !isCanonicalExistingPath(fs, target) ||
      !exactAliasOrCopy(fs, path, target, target)
    ) {
      throw new Error(`derived alias does not match the complete plan: ${path}`);
    }
  }
}

function sameRecord(left: TaskRecord, right: TaskRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createdRecordMatches(
  record: TaskRecord,
  task: import("../services/project-authoring-task-plan.js").PlannedProjectAuthoringTask,
  dependencies: readonly string[],
): boolean {
  return (
    record.title === task.title &&
    record.description === null &&
    JSON.stringify(record.acceptanceCriteria.map(({ text }) => text)) ===
      JSON.stringify(task.acceptanceCriteria) &&
    JSON.stringify(record.dependencies) === JSON.stringify(dependencies) &&
    JSON.stringify(record.labels) === JSON.stringify(task.labels)
  );
}

function executeActions(
  operation: string,
  actions: readonly PlannedAction[],
  recovery: string,
): void {
  const completed: MutationBoundary[] = [];
  for (const [index, action] of actions.entries()) {
    try {
      action.apply();
      completed.push(action.boundary);
    } catch (cause) {
      throw new MutationFailure({
        operation,
        failedBeat: action.beat,
        completed,
        failed: action.boundary,
        unattempted: actions.slice(index + 1).map(({ boundary }) => boundary),
        recovery,
        cause,
      });
    }
  }
}

function expectedFileWrite(
  fs: FileSystem,
  path: string,
  content: string,
  before: string | null,
  confinementRoot?: string,
  quarantine?: ConfinedQuarantine,
): () => void {
  return () => {
    const kind = fs.inspectPath(path);
    if (before === null) {
      if (kind.kind !== "missing") throw new Error(`destination appeared after preflight: ${path}`);
    } else if (kind.kind !== "file" || fs.read(path) !== before) {
      throw new Error(`destination changed after preflight: ${path}`);
    }
    if (confinementRoot === undefined) {
      fs.write(path, content);
    } else {
      fs.writeConfined(
        confinementRoot,
        path,
        content,
        before === null ? { kind: "missing" } : { kind: "text", content: before },
        quarantine,
      );
    }
  };
}

function stateWriteAction(
  fs: FileSystem,
  workspaceRoot: string,
  observation: ObservedContributionState,
  next: BundleAuthoringContributions,
  expectedPendingText?: string,
  quarantine?: ConfinedQuarantine,
): PlannedAction {
  const path = join(workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
  const pendingPath = join(workspaceRoot, BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH);
  const write = expectedFileWrite(
    fs,
    path,
    serializeBundleAuthoringContributions(next),
    observation.text,
    workspaceRoot,
    quarantine,
  );
  return {
    boundary: {
      id: "bundle-contribution-record",
      path: toPosix(path),
      description: "publish the concrete recorded bundle contribution",
    },
    beat: "APPLY",
    apply: () => {
      const pendingKind = fs.inspectPath(pendingPath);
      if (expectedPendingText === undefined) {
        if (pendingKind.kind !== "missing") {
          throw new Error("bundle-template-set pending marker appeared after preflight");
        }
      } else if (pendingKind.kind !== "file" || fs.read(pendingPath) !== expectedPendingText) {
        throw new Error("bundle-template-set pending marker changed after publication");
      }
      write();
    },
  };
}

function assertContributionStateUnchanged(
  fs: FileSystem,
  workspaceRoot: string,
  observation: ObservedContributionState,
): void {
  const path = join(workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
  const pendingPath = join(workspaceRoot, BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH);
  if (fs.inspectPath(pendingPath).kind !== "missing") {
    throw new Error("bundle-template-set pending marker appeared after preflight");
  }
  const kind = fs.inspectPath(path);
  if (observation.text === null) {
    if (kind.kind !== "missing")
      throw new Error("bundle contribution record appeared after preflight");
  } else if (
    kind.kind !== "file" ||
    !isCanonicalExistingPath(fs, path) ||
    fs.read(path) !== observation.text
  ) {
    throw new Error("bundle contribution record changed after preflight");
  }
}

function assertBacklogShape(
  input: {
    readonly fs: FileSystem;
    readonly backlog: BacklogMd;
    readonly backlogRoot: string;
    readonly inactiveEntries: readonly string[];
    readonly criticalUnexpectedEntries: readonly string[];
    readonly taskPrefix: string;
  },
  expectedExisting: ReadonlyMap<string, TaskRecord>,
): void {
  assertRealDirectory(input.fs, input.backlogRoot);
  const root = input.backlog.inspectRoot(input.backlogRoot);
  if (!root.valid || root.taskPrefix !== input.taskPrefix) {
    throw new Error("authoring backlog root changed after complete preflight");
  }
  const summaries = input.backlog.listTasks(input.backlogRoot);
  const summaryIds = summaries.map(({ id }) => id).sort(compareCodeUnits);
  const expectedIds = [...expectedExisting.keys()].sort(compareCodeUnits);
  if (
    summaries.length !== expectedExisting.size ||
    new Set(summaryIds).size !== summaryIds.length ||
    JSON.stringify(summaryIds) !== JSON.stringify(expectedIds) ||
    summaries.some((summary) => {
      const expected = expectedExisting.get(summary.id);
      return (
        expected === undefined ||
        summary.title !== expected.title ||
        summary.status !== expected.status
      );
    })
  ) {
    throw new Error("authoring backlog changed after complete preflight");
  }
  const inventory = input.backlog.inspectTaskInventory(input.backlogRoot);
  if (
    !inventory.configurationMatchesFreshDefaults ||
    JSON.stringify([...inventory.activeEntries].sort(compareCodeUnits)) !==
      JSON.stringify([...expectedExisting.keys()].sort(compareCodeUnits)) ||
    JSON.stringify([...inventory.inactiveEntries].sort(compareCodeUnits)) !==
      JSON.stringify(input.inactiveEntries) ||
    JSON.stringify(
      inventory.unexpectedEntries
        .filter((entry) => entry.startsWith(".locks/") || entry.startsWith("unrecognized:tasks/"))
        .sort(compareCodeUnits),
    ) !== JSON.stringify(input.criticalUnexpectedEntries)
  ) {
    throw new Error("authoring backlog inventory changed after complete preflight");
  }
}

function assertBacklogSnapshot(
  input: {
    readonly fs: FileSystem;
    readonly backlog: BacklogMd;
    readonly backlogRoot: string;
    readonly inactiveEntries: readonly string[];
    readonly criticalUnexpectedEntries: readonly string[];
    readonly taskPrefix: string;
  },
  expectedExisting: ReadonlyMap<string, TaskRecord>,
): void {
  assertBacklogShape(input, expectedExisting);
  for (const [id, before] of expectedExisting) {
    if (!sameRecord(input.backlog.readTask(input.backlogRoot, id), before)) {
      throw new Error(`authoring task ${id} changed after complete preflight`);
    }
  }
}

function plannedTaskActions(input: {
  readonly fs: FileSystem;
  readonly backlog: BacklogMd;
  readonly backlogRoot: string;
  readonly records: readonly TaskRecord[];
  readonly inactiveEntries: readonly string[];
  readonly criticalUnexpectedEntries: readonly string[];
  readonly taskPrefix: string;
  readonly preserved: readonly { readonly identity: string; readonly id: string }[];
  readonly missing: readonly {
    readonly task: import("../services/project-authoring-task-plan.js").PlannedProjectAuthoringTask;
  }[];
  readonly materialised: string[];
}): {
  readonly actions: readonly PlannedAction[];
  readonly assertFinalSnapshot: () => void;
} {
  const ids = new Map(input.preserved.map(({ identity, id }) => [identity, id]));
  const expectedExisting = new Map(input.records.map((record) => [record.id, record]));
  const assertCurrentBacklogShape = (): void => assertBacklogShape(input, expectedExisting);
  const assertCurrentBacklogSnapshot = (): void => assertBacklogSnapshot(input, expectedExisting);
  const actions: PlannedAction[] = [
    {
      boundary: {
        id: "authoring-task-plan-precondition",
        description: "verify the frozen authoring Backlog preimage",
      },
      beat: "MATERIALISE",
      apply: assertCurrentBacklogShape,
    },
  ];
  actions.push(
    ...input.missing.map(({ task }) => ({
      boundary: {
        id: `authoring-task:${task.identity}`,
        description: `materialise authoring task ${JSON.stringify(task.title)}`,
      },
      beat: "MATERIALISE" as const,
      apply: () => {
        assertCurrentBacklogShape();
        const dependencies = task.dependencyIdentities.map((identity) => {
          const id = ids.get(identity);
          if (id === undefined)
            throw new Error(`planned dependency ${identity} has no actual Backlog ID`);
          return id;
        });
        const created = input.backlog.createTask(input.backlogRoot, {
          title: task.title,
          acceptanceCriteria: task.acceptanceCriteria,
          dependencies,
          labels: task.labels,
        });
        if (
          expectedExisting.has(created.id) ||
          created.title !== task.title ||
          created.status !== "To Do"
        ) {
          throw new Error(
            "created authoring task summary collides with or differs from its frozen plan",
          );
        }
        const createdRecord = input.backlog.readTask(input.backlogRoot, created.id);
        if (
          createdRecord.id !== created.id ||
          createdRecord.title !== created.title ||
          createdRecord.status !== created.status ||
          !createdRecordMatches(createdRecord, task, dependencies)
        ) {
          throw new Error(`created authoring task ${created.id} does not match its frozen plan`);
        }
        ids.set(task.identity, created.id);
        expectedExisting.set(created.id, createdRecord);
        input.materialised.push(task.title);
      },
    })),
  );
  actions.push({
    boundary: {
      id: "authoring-task-plan-postcondition",
      description: "verify the complete bundle authoring task plan",
    },
    beat: "MATERIALISE" as const,
    apply: assertCurrentBacklogShape,
  });
  return { actions, assertFinalSnapshot: assertCurrentBacklogSnapshot };
}

function bundleManifest(id: string, version: string): BundleManifest | undefined {
  const parsedId = parseBundleId(id);
  const parsedVersion = parseSemVer(version);
  if (!parsedId.ok || !parsedVersion.ok) return undefined;
  return {
    id: parsedId.value,
    version: parsedVersion.value,
    summary: `${id} bundle`,
    confirmation: "safe",
    requires: new Map(),
    payload: { files: [], templates: [], scripts: [], skills: [] },
    installerSkills: [],
  };
}

function isBacklogAliasPath(path: string): boolean {
  return path === BACKLOG_ALIAS_DIR || path.startsWith(`${BACKLOG_ALIAS_DIR}/`);
}

function addPlanProblems(
  blockers: BundleAuthoringBlocker[],
  problems: readonly {
    readonly code: string;
    readonly contribution: string;
    readonly path: string;
    readonly message: string;
  }[],
): void {
  for (const problem of problems) {
    blocker(blockers, {
      code: problem.code,
      surface: "authoring-task-plan",
      path: `${problem.contribution}:${problem.path}`,
      message: problem.message,
      recovery: "Repair the recorded or selected bundle contribution before repeating the request.",
    });
  }
}

function addPriorBundleTitleConflicts(input: {
  readonly blockers: BundleAuthoringBlocker[];
  readonly currentId: string;
  readonly currentTasks: readonly import("../services/project-authoring-task-plan.js").PlannedProjectAuthoringTask[];
  readonly state: BundleAuthoringContributions | undefined;
  readonly enabledBundleIds: readonly string[];
}): void {
  const priorTitles = new Map<string, string>();
  const priorBundleIds = new Set<string>(input.enabledBundleIds);
  for (const entry of input.state?.bundles ?? []) {
    if (entry.id === input.currentId) continue;
    priorBundleIds.add(entry.id);
    if (entry.contribution.status !== "tasks") continue;
    for (const task of entry.contribution.tasks) {
      priorTitles.set(task.title, `recorded bundle ${JSON.stringify(entry.id)}`);
    }
  }
  for (const id of priorBundleIds) {
    if (id === input.currentId) continue;
    for (const task of perBundleAuthoringTaskCatalog(id, { advisor: false })) {
      if (!priorTitles.has(task.title)) {
        priorTitles.set(task.title, `mandatory work for bundle ${JSON.stringify(id)}`);
      }
    }
  }
  for (const task of input.currentTasks) {
    const owner = priorTitles.get(task.title);
    if (owner === undefined) continue;
    blocker(input.blockers, {
      code: "recorded-bundle-title-conflict",
      surface: "authoring-task-plan",
      path: task.title,
      message: `${owner} already reserves rendered title ${JSON.stringify(task.title)}`,
      recovery:
        "Repair the conflicting recorded contribution before materialising either bundle's work.",
    });
  }
}

/** Create one enabled or disabled bundle from one frozen template/default selection and complete task plan. */
export function createBundleWithAuthoring(
  deps: BundleAuthoringOperationDeps,
  ctx: OperationContext,
  input: CreateBundleWithAuthoringInput,
): OperationResult {
  const { fs, backlog } = deps;
  const blockers: BundleAuthoringBlocker[] = [];
  inspectOperationRoots(fs, ctx, blockers, true);
  const quarantineRoot = join(ctx.workspaceRoot, BUNDLE_AUTHORING_QUARANTINE_DIR);
  const quarantineFor = (slot: string): ConfinedQuarantine => ({
    root: quarantineRoot,
    path: join(quarantineRoot, `create-${hashTextContent(input.id).slice(7, 23)}`, slot),
  });
  inspectQuarantineAbsent(fs, quarantineRoot, blockers);
  const projectObservation = observeProjectSnapshot(fs, ctx.deliverableRoot, blockers);
  const project = projectObservation?.project;
  const projectManifestText = projectObservation?.manifestText;
  const enabledDescriptorEvidence = projectObservation?.enabledDescriptors;
  const parsedId = parseBundleId(input.id);
  if (!parsedId.ok) {
    blocker(blockers, {
      code: "bundle-id-invalid",
      surface: "input",
      message: parsedId.problem.message,
      recovery: "Choose a portable kebab-case bundle id that is not a reserved command verb.",
    });
  } else if (input.id === BUNDLE_TEMPLATE_DIR) {
    blocker(blockers, {
      code: "bundle-id-reserved-scaffold",
      surface: "input",
      message: `${JSON.stringify(BUNDLE_TEMPLATE_DIR)} is reserved for the project default bundle scaffold`,
      recovery: "Choose a bundle id that does not occupy the default-scaffold boundary.",
    });
  }
  const version = input.version ?? DEFAULT_VERSION;
  const parsedVersion = parseSemVer(version);
  const planVersion = parsedVersion.ok ? parsedVersion.value : version;
  if (!parsedVersion.ok) {
    blocker(blockers, {
      code: "bundle-version-invalid",
      surface: "input",
      message: parsedVersion.problem.message,
      recovery: "Choose a canonical semantic version for the new bundle.",
    });
  }
  if (project?.manifest.bundles.some((id) => id === input.id)) {
    blocker(blockers, {
      code: "bundle-already-enabled",
      surface: "manifest",
      message: `bundle ${JSON.stringify(input.id)} already exists in the manifest`,
      recovery: "Choose a new bundle id; bundle new does not reconcile an existing bundle.",
    });
  }
  const bundleDir = join(ctx.deliverableRoot, "bundles", input.id);
  try {
    if (fs.inspectPath(bundleDir).kind !== "missing") {
      blocker(blockers, {
        code: "bundle-destination-occupied",
        surface: "bundle",
        path: toPosix(bundleDir),
        message: "the requested bundle destination already exists",
        recovery: "Choose a new id or move the existing unowned bundle directory aside.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-destination-unreadable",
      surface: "bundle",
      path: toPosix(bundleDir),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable no-follow access to the bundle destination.",
    });
  }

  const stateObservation = observeContributionState(fs, ctx.workspaceRoot, blockers);
  if (stateObservation?.state.bundles.some(({ id }) => id === input.id)) {
    blocker(blockers, {
      code: "bundle-contribution-already-recorded",
      surface: "contribution-record",
      message: `bundle ${JSON.stringify(input.id)} already has a recorded contribution`,
      recovery:
        "Choose a new bundle id; recorded contribution ownership is never silently replaced.",
    });
  }
  const backlogRoot = join(ctx.workspaceRoot, AUTHORING_BACKLOG_DIR);
  const backlogObservation = inspectBacklog(fs, backlog, backlogRoot, blockers);
  const records = backlogObservation?.records;

  let scaffoldFiles: readonly TemplateFile[] | undefined;
  let projectScaffoldEvidence: string | undefined;
  let liveDefaultScaffoldSha256: string | undefined;
  let selectedTemplate: Template | undefined;
  let selectedProducer:
    | {
        readonly source: "built-in" | "project-local";
        readonly scope: "bundle";
        readonly name: string;
      }
    | undefined;
  let selectedScaffoldAuthoritative = false;
  let recordedContribution: RecordedConcreteBundleContribution | undefined;
  let compiled: ReturnType<typeof compileBundleAuthoringTaskPlan> | undefined;
  const mandatory = perBundleAuthoringTaskCatalog(input.id, { advisor: input.advisor !== false });
  const inspectionMandatory = perBundleAuthoringTaskCatalog(input.id, { advisor: false });
  const explicit = input.templateName !== undefined;
  const projectScaffold = join(ctx.deliverableRoot, "bundles", BUNDLE_TEMPLATE_DIR);
  try {
    const implicitScaffoldKind = explicit ? undefined : fs.inspectPath(projectScaffold);
    if (implicitScaffoldKind?.kind === "directory") {
      const sourceAlias = join(projectScaffold, BACKLOG_ALIAS_DIR);
      const sourceAliasKind = fs.inspectPath(sourceAlias);
      if (
        sourceAliasKind.kind !== "missing" &&
        !exactAliasOrCopy(
          fs,
          sourceAlias,
          INSTALL_BACKLOG_DIR,
          join(projectScaffold, INSTALL_BACKLOG_DIR),
        )
      ) {
        blocker(blockers, {
          code: "bundle-template-backlog-ambiguous",
          surface: "template",
          path: toPosix(sourceAlias),
          message: "project default scaffold backlog boundary is not the exact WPM alias/copy",
          recovery: "Restore the exact relative backlog alias/copy or remove the ambiguous path.",
        });
      }
      projectScaffoldEvidence = treeEvidence(fs, projectScaffold);
      scaffoldFiles = readTree(fs, projectScaffold);
      if (treeEvidence(fs, projectScaffold) !== projectScaffoldEvidence) {
        throw new Error("project bundle scaffold changed while its immutable snapshot was loading");
      }
      liveDefaultScaffoldSha256 = bundleScaffoldSha256(scaffoldFiles);
      const recordedDefault = stateObservation?.state.defaultContribution;
      const selected = recordedDefault?.contribution;
      if (selected?.status === "source") {
        selectedProducer = {
          source: selected.producer.source,
          scope: "bundle",
          name: selected.producer.name,
        };
        selectedTemplate = {
          name: selected.producer.name,
          scope: "bundle",
          parameters: [],
          files: [],
          snippets: [],
          authoringTaskSource: selected.source,
        };
        selectedScaffoldAuthoritative = true;
      } else {
        const producer =
          selected?.producer === undefined
            ? {
                source: "project-local" as const,
                scope: "bundle" as const,
                name: BUNDLE_TEMPLATE_DIR,
              }
            : {
                source: selected.producer.source,
                scope: "bundle" as const,
                name: selected.producer.name,
              };
        selectedProducer = producer;
        selectedTemplate = {
          name: producer.name,
          scope: "bundle",
          parameters: [],
          files: [],
          snippets: [],
        };
        selectedScaffoldAuthoritative = true;
      }
    } else if (implicitScaffoldKind !== undefined && implicitScaffoldKind.kind !== "missing") {
      blocker(blockers, {
        code: "bundle-template-destination-ambiguous",
        surface: "template",
        path: toPosix(projectScaffold),
        message: `project default bundle scaffold is ${implicitScaffoldKind.kind}, not a real directory or absence`,
        recovery:
          "Restore the real project default scaffold or remove the ambiguous path before creating a bundle.",
      });
    } else {
      if (
        !explicit &&
        stateObservation?.state.defaultContribution !== null &&
        stateObservation?.state.defaultContribution !== undefined
      ) {
        blocker(blockers, {
          code: "bundle-template-record-mismatch",
          surface: "template",
          path: toPosix(projectScaffold),
          message: "the recorded default contribution has no matching live project scaffold",
          recovery:
            "Restore the recorded scaffold or explicitly publish a new default template selection.",
        });
      }
      const name = input.templateName ?? DEFAULT_BUNDLE_TEMPLATE;
      const resolution = resolveTemplate(name, "bundle", {
        fs,
        builtinTemplatesRoot: deps.builtinTemplatesRoot,
        projectTemplatesRoot: join(ctx.deliverableRoot, "templates"),
      });
      if (!resolution.found) {
        blocker(blockers, {
          code: "bundle-template-not-found",
          surface: "template",
          message: `bundle template ${JSON.stringify(name)} not found`,
          recovery: "Choose an available bundle template or restore the selected template source.",
        });
      } else {
        scaffoldFiles = resolution.template.files;
        selectedTemplate = resolution.template;
        selectedProducer = { source: resolution.source, scope: "bundle", name };
        selectedScaffoldAuthoritative = true;
      }
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-template-invalid",
      surface: "template",
      message: error instanceof Error ? error.message : String(error),
      recovery: "Repair the selected template/scaffold before repeating the request.",
    });
  }

  // A damaged or ambiguous live default scaffold cannot authorize creation, but its independently readable
  // recorded source can still contribute concrete-context diagnostics to the complete preflight report.
  if (!explicit && selectedTemplate === undefined && selectedProducer === undefined) {
    const recorded = stateObservation?.state.defaultContribution?.contribution;
    if (recorded?.status === "source") {
      selectedProducer = {
        source: recorded.producer.source,
        scope: "bundle",
        name: recorded.producer.name,
      };
      selectedTemplate = {
        name: recorded.producer.name,
        scope: "bundle",
        parameters: [],
        files: [],
        snippets: [],
        authoringTaskSource: recorded.source,
      };
    }
  }

  if (selectedTemplate !== undefined && selectedProducer !== undefined) {
    const inspection = inspectTemplateAuthoringTasks({
      template: selectedTemplate,
      producer: selectedProducer,
      mandatoryTasks: inspectionMandatory,
      ...(project === undefined
        ? {}
        : {
            context: {
              "wpm.project.name": project.manifest.meta.name,
              "wpm.bundle.id": input.id,
              "wpm.bundle.version": planVersion,
            },
          }),
    });
    const inspectedPlan = compileBundleAuthoringTaskPlan({
      id: input.id,
      mandatoryTasks: mandatory,
      inspection,
    });
    if (!inspectedPlan.ok) addPlanProblems(blockers, inspectedPlan.problems);
    else if (project !== undefined && selectedScaffoldAuthoritative) {
      compiled = inspectedPlan;
      recordedContribution = recordedConcreteContributionFromPlan(
        selectedProducer,
        input.id,
        compiled.tasks,
      );
    }
  }
  const reconciliation =
    compiled?.ok && records !== undefined
      ? reconcileBundleAuthoringTaskPlan({ tasks: compiled.tasks, records })
      : undefined;
  if (reconciliation !== undefined && !reconciliation.ok) {
    for (const problem of reconciliation.problems) {
      blocker(blockers, {
        code: problem.code,
        surface: "authoring-task-plan",
        path: problem.taskId,
        message: problem.message,
        recovery:
          "Restore the exact recorded WPM-owned task definition while preserving human progress.",
      });
    }
  }
  if (
    reconciliation !== undefined &&
    reconciliation.missing.length > 0 &&
    (backlogObservation?.inactiveEntries?.length ?? 0) > 0
  ) {
    blocker(blockers, {
      code: "inactive-task-ownership-ambiguous",
      surface: "backlog",
      path: backlogObservation?.inactiveEntries?.join(", "),
      message: "inactive Backlog records may already own missing bundle authoring work",
      recovery:
        "Restore or inspect the inactive records before creating replacement authoring tasks.",
    });
  }
  if (reconciliation !== undefined && reconciliation.missing.length > 0) {
    inspectMutationPath(
      fs,
      join(backlogRoot, "backlog", "tasks", ".wpm-planned-task.md"),
      "backlog",
      blockers,
    );
    inspectMutationPath(fs, join(backlogRoot, "backlog", ".locks", "create"), "backlog", blockers);
  }

  if (compiled?.ok) {
    addPriorBundleTitleConflicts({
      blockers,
      currentId: input.id,
      currentTasks: compiled.tasks,
      state: stateObservation?.state,
      enabledBundleIds: project?.manifest.bundles ?? [],
    });
  }

  const selectedProjectTemplate = projectTemplate(deps, ctx.deliverableRoot, blockers);
  const manifest = bundleManifest(input.id, planVersion);
  let renderedFiles: readonly RenderedFile[] = [];
  let manifestBefore: string | undefined;
  let manifestAfter: string | undefined;
  let desired: ReturnType<typeof deriveArtefactsFromTemplateSnapshot> | undefined;
  let changes: ReturnType<typeof planChanges> | undefined;
  let derivedObservation: ObservedDerivedPlan | undefined;
  if (project !== undefined && scaffoldFiles !== undefined && manifest !== undefined) {
    try {
      const params = new Map([
        ["bundle-id", input.id],
        ["version", planVersion],
        ["project-name", project.manifest.meta.name],
      ]);
      const byPath = new Map<string, RenderedFile>();
      for (const file of renderTree(scaffoldFiles, params)) {
        if (file.path === BUNDLE_MANIFEST_FILE || isBacklogAliasPath(file.path)) {
          blocker(blockers, {
            code: "bundle-output-reserved-path",
            surface: "bundle",
            path: file.path,
            message: "selected scaffold output collides with a WPM-owned bundle boundary",
            recovery: "Remove bundle.yml and backlog alias paths from the selected scaffold.",
          });
          continue;
        }
        const prior = byPath.get(file.path);
        if (prior !== undefined && prior.content !== file.content) {
          blocker(blockers, {
            code: "bundle-output-collision",
            surface: "bundle",
            path: file.path,
            message: "two selected scaffold files render to the same path with different bytes",
            recovery: "Repair the selected bundle scaffold path placeholders.",
          });
        } else byPath.set(file.path, file);
      }
      byPath.set(BUNDLE_MANIFEST_FILE, {
        path: BUNDLE_MANIFEST_FILE,
        content: stringifyYaml(serializeBundleManifest(manifest)),
      });
      renderedFiles = [...byPath.values()].sort((left, right) =>
        compareCodeUnits(left.path, right.path),
      );
      if (!renderedFiles.some(({ path }) => path.startsWith(`${INSTALL_BACKLOG_DIR}/`))) {
        blocker(blockers, {
          code: "bundle-install-backlog-missing",
          surface: "bundle",
          path: INSTALL_BACKLOG_DIR,
          message: "selected scaffold does not materialise the bundle install-backlog target",
          recovery: "Add at least one install-backlog file to the selected bundle scaffold.",
        });
      }
      manifestBefore = projectManifestText;
      if (manifestBefore === undefined) throw new Error("project manifest snapshot is unavailable");
      manifestAfter =
        input.disabled === true
          ? manifestBefore
          : editYaml(manifestBefore, (doc) => doc.addIn(["bundles"], input.id));
      const postManifest =
        input.disabled === true
          ? project.manifest
          : { ...project.manifest, bundles: [...project.manifest.bundles, manifest.id] };
      const postBundles = new Map(project.bundles);
      if (input.disabled !== true) postBundles.set(manifest.id, manifest);
      const postProject: Project = {
        rootPath: project.rootPath,
        manifest: postManifest,
        bundles: postBundles,
      };
      if (selectedProjectTemplate !== undefined) {
        desired = deriveArtefactsFromTemplateSnapshot(postProject, selectedProjectTemplate);
        derivedObservation = observeDesiredChanges(fs, ctx.deliverableRoot, desired, blockers);
        changes = derivedObservation.changes;
      }
    } catch (error) {
      blocker(blockers, {
        code: "bundle-output-invalid",
        surface: "bundle",
        message: error instanceof Error ? error.message : String(error),
        recovery:
          "Repair the selected bundle/project template output before repeating the request.",
      });
    }
  }

  let advisor: { readonly path: string; readonly content: string } | undefined;
  if (input.advisor !== false && selectedProjectTemplate !== undefined) {
    const snippet = selectedProjectTemplate.snippets.find(
      ({ path }) => path === ADVISOR_SNIPPET_PATH,
    );
    if (snippet === undefined) {
      blocker(blockers, {
        code: "advisor-snippet-missing",
        surface: "advisor",
        message: `project template is missing ${ADVISOR_SNIPPET_PATH}`,
        recovery: "Restore the project template advisor snippet or use --no-advisor.",
      });
    } else {
      try {
        const rendered = renderSnippet(snippet, new Map([["bundle-id", input.id]]));
        const path = join(ctx.deliverableRoot, advisorSkillPath(input.id));
        const kind = fs.inspectPath(path);
        if (kind.kind === "missing") advisor = { path, content: rendered.content };
        else {
          blocker(blockers, {
            code: "advisor-destination-ambiguous",
            surface: "advisor",
            path: toPosix(path),
            message: `advisor destination is already occupied by an unowned ${kind.kind}`,
            recovery: "Move the unowned advisor destination aside or use --no-advisor.",
          });
        }
      } catch (error) {
        blocker(blockers, {
          code: "advisor-output-invalid",
          surface: "advisor",
          message: error instanceof Error ? error.message : String(error),
          recovery: "Repair the project advisor snippet or use --no-advisor.",
        });
      }
    }
  }

  const createOutputPaths: PlannedOutputPath[] = [
    ...renderedFiles.map((file) => ({
      path: join(bundleDir, file.path),
      kind: "file" as const,
      owner: `bundle scaffold ${file.path}`,
    })),
    {
      path: join(bundleDir, BACKLOG_ALIAS_DIR),
      kind: "alias" as const,
      owner: "bundle backlog alias",
    },
    ...(derivedObservation?.files.map((file) => ({
      path: join(ctx.deliverableRoot, file.path),
      kind: "file" as const,
      owner: `derived file ${file.path}`,
    })) ?? []),
    ...(derivedObservation?.aliases.map((alias) => ({
      path: join(ctx.deliverableRoot, alias.linkPath),
      kind: "alias" as const,
      owner: `derived alias ${alias.linkPath}`,
    })) ?? []),
    ...(advisor === undefined
      ? []
      : [{ path: advisor.path, kind: "file" as const, owner: "bundle advisor" }]),
  ];
  addWholePlanPathBlockers(createOutputPaths, blockers);
  const createPlannedFiles = createOutputPaths
    .filter(({ kind }) => kind === "file")
    .map(({ path }) => path);
  addAliasTargetBlocker(fs, join(bundleDir, INSTALL_BACKLOG_DIR), createPlannedFiles, blockers);
  for (const alias of changes?.aliasesToCreate ?? []) {
    addAliasTargetBlocker(
      fs,
      join(ctx.deliverableRoot, alias.aliasTo),
      createPlannedFiles,
      blockers,
    );
  }
  for (const output of createOutputPaths) {
    const mutates =
      output.owner.startsWith("bundle scaffold") ||
      output.owner === "bundle backlog alias" ||
      output.owner === "bundle advisor" ||
      changes?.filesToWrite.some(({ path }) => output.path === join(ctx.deliverableRoot, path)) ||
      changes?.aliasesToCreate.some(
        ({ linkPath }) => output.path === join(ctx.deliverableRoot, linkPath),
      );
    if (mutates) inspectMutationPath(fs, output.path, "bundle", blockers);
  }
  inspectMutationPath(
    fs,
    join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH),
    "contribution-record",
    blockers,
  );
  if (stateObservation?.text !== null && stateObservation?.text !== undefined) {
    inspectQuarantinedReplacement(
      fs,
      join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH),
      quarantineFor("contribution-record"),
      blockers,
    );
  }
  if (input.disabled !== true) {
    const manifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
    inspectMutationPath(fs, manifestPath, "manifest", blockers);
    inspectQuarantinedReplacement(fs, manifestPath, quarantineFor("manifest"), blockers);
  }
  for (const file of derivedObservation?.files ?? []) {
    if (file.before !== null && changes?.filesToWrite.some(({ path }) => path === file.path)) {
      inspectQuarantinedReplacement(
        fs,
        join(ctx.deliverableRoot, file.path),
        quarantineFor(`derived-${hashTextContent(file.path).slice(7, 23)}`),
        blockers,
      );
    }
  }

  if (blockers.length > 0) throw new BundleAuthoringPreflightError(sortedBlockers(blockers));
  if (
    project === undefined ||
    enabledDescriptorEvidence === undefined ||
    stateObservation === undefined ||
    recordedContribution === undefined ||
    compiled === undefined ||
    !compiled.ok ||
    reconciliation === undefined ||
    !reconciliation.ok ||
    manifestBefore === undefined ||
    manifestAfter === undefined ||
    desired === undefined ||
    derivedObservation === undefined ||
    changes === undefined ||
    records === undefined ||
    backlogObservation === undefined
  ) {
    throw new Error("bundle create preflight did not produce a complete immutable plan");
  }

  const assertFrozenProjectScaffold = (): void => {
    if (
      projectScaffoldEvidence !== undefined &&
      (fs.inspectPath(projectScaffold).kind !== "directory" ||
        treeEvidence(fs, projectScaffold) !== projectScaffoldEvidence)
    ) {
      throw new Error("project bundle scaffold changed after preflight");
    }
  };

  const actions: PlannedAction[] = [
    {
      boundary: {
        id: "bundle-create-preconditions",
        description: "verify the frozen bundle create inputs before the first write",
      },
      beat: "APPLY",
      apply: () => {
        assertBacklogSnapshot(
          {
            fs,
            backlog,
            backlogRoot,
            inactiveEntries: backlogObservation.inactiveEntries,
            criticalUnexpectedEntries: backlogObservation.criticalUnexpectedEntries,
            taskPrefix: backlogObservation.taskPrefix,
          },
          new Map(records.map((record) => [record.id, record])),
        );
        if (fs.inspectPath(bundleDir).kind !== "missing") {
          throw new Error("bundle destination appeared after preflight");
        }
        const manifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
        if (
          fs.inspectPath(manifestPath).kind !== "file" ||
          !isCanonicalExistingPath(fs, manifestPath) ||
          fs.read(manifestPath) !== manifestBefore
        ) {
          throw new Error("project manifest changed after preflight");
        }
        assertDescriptorEvidenceUnchanged(fs, enabledDescriptorEvidence);
        assertContributionStateUnchanged(fs, ctx.workspaceRoot, stateObservation);
        assertDerivedPreimage(fs, ctx.deliverableRoot, derivedObservation);
        assertFrozenProjectScaffold();
      },
    },
  ];
  for (const file of renderedFiles) {
    const path = join(bundleDir, file.path);
    actions.push({
      boundary: {
        id: `bundle-file:${file.path}`,
        path: toPosix(path),
        description: `write bundle file ${file.path}`,
      },
      beat: "APPLY",
      apply: expectedFileWrite(fs, path, file.content, null, ctx.deliverableRoot),
    });
  }
  const aliasPath = join(bundleDir, BACKLOG_ALIAS_DIR);
  actions.push({
    boundary: {
      id: "bundle-backlog-alias",
      path: toPosix(aliasPath),
      description: "create the bundle backlog alias",
    },
    beat: "APPLY",
    apply: () => {
      ensureAliasAtBoundary(
        fs,
        ctx.deliverableRoot,
        INSTALL_BACKLOG_DIR,
        join(bundleDir, INSTALL_BACKLOG_DIR),
        aliasPath,
      );
    },
  });
  // The scaffold tree is explicitly human-editable between selections. Its live frozen bytes author the new
  // bundle, while the separately recorded inert contribution remains the only task source. Refresh the
  // scaffold binding in this same record publication so success cannot leave a stale pair. An interrupted
  // `bundle template set` is still rejected by its pending marker before this path is reached.
  const stateWithLiveDefault =
    liveDefaultScaffoldSha256 !== undefined && stateObservation.state.defaultContribution !== null
      ? {
          ...stateObservation.state,
          defaultContribution: {
            ...stateObservation.state.defaultContribution,
            scaffoldSha256: liveDefaultScaffoldSha256,
          },
        }
      : stateObservation.state;
  const nextState = withRecordedBundleContribution(stateWithLiveDefault, {
    id: input.id,
    contribution: recordedContribution,
  });
  const contributionStateAction = stateWriteAction(
    fs,
    ctx.workspaceRoot,
    stateObservation,
    nextState,
    undefined,
    stateObservation.text === null ? undefined : quarantineFor("contribution-record"),
  );
  actions.push({
    ...contributionStateAction,
    apply: () => {
      assertFrozenProjectScaffold();
      contributionStateAction.apply();
    },
  });
  if (input.disabled !== true) {
    const manifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
    actions.push({
      boundary: {
        id: "bundle-manifest-enable",
        path: toPosix(manifestPath),
        description: "append the new bundle to the enabled manifest set",
      },
      beat: "APPLY",
      apply: expectedFileWrite(
        fs,
        manifestPath,
        manifestAfter,
        manifestBefore,
        ctx.workspaceRoot,
        quarantineFor("manifest"),
      ),
    });
  }
  if (advisor !== undefined) {
    actions.push({
      boundary: {
        id: "bundle-advisor",
        path: toPosix(advisor.path),
        description: "write the bundle advisor stub",
      },
      beat: "APPLY",
      apply: expectedFileWrite(fs, advisor.path, advisor.content, null, ctx.deliverableRoot),
    });
  }
  for (const file of changes.filesToWrite) {
    const path = join(ctx.deliverableRoot, file.path);
    const before = fs.inspectPath(path).kind === "file" ? fs.read(path) : null;
    actions.push({
      boundary: {
        id: `derived-file:${file.path}`,
        path: toPosix(path),
        description: `refresh derived file ${file.path}`,
      },
      beat: "RERENDER",
      apply: expectedFileWrite(
        fs,
        path,
        file.content,
        before,
        ctx.workspaceRoot,
        before === null
          ? undefined
          : quarantineFor(`derived-${hashTextContent(file.path).slice(7, 23)}`),
      ),
    });
  }
  for (const alias of changes.aliasesToCreate) {
    const path = join(ctx.deliverableRoot, alias.linkPath);
    actions.push({
      boundary: {
        id: `derived-alias:${alias.linkPath}`,
        path: toPosix(path),
        description: `create derived alias ${alias.linkPath}`,
      },
      beat: "RERENDER",
      apply: () => {
        const target = join(ctx.deliverableRoot, alias.aliasTo);
        ensureAliasAtBoundary(fs, ctx.deliverableRoot, target, target, path);
      },
    });
  }
  const materialised: string[] = [];
  const taskPlanActions = plannedTaskActions({
    fs,
    backlog,
    backlogRoot,
    records,
    inactiveEntries: backlogObservation.inactiveEntries,
    criticalUnexpectedEntries: backlogObservation.criticalUnexpectedEntries,
    taskPrefix: backlogObservation.taskPrefix,
    preserved: reconciliation.preserved,
    missing: reconciliation.missing,
    materialised,
  });
  actions.push(...taskPlanActions.actions);
  actions.push({
    boundary: {
      id: "bundle-create-postcondition",
      description: "verify the complete bundle create plan before reporting success",
    },
    beat: "MATERIALISE",
    apply: () => {
      assertRealDirectory(fs, join(ctx.deliverableRoot, "bundles"));
      const manifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
      if (
        fs.inspectPath(manifestPath).kind !== "file" ||
        !isCanonicalExistingPath(fs, manifestPath) ||
        fs.read(manifestPath) !== manifestAfter
      ) {
        throw new Error("project manifest does not match the complete bundle plan");
      }
      assertDescriptorEvidenceUnchanged(fs, enabledDescriptorEvidence);
      const statePath = join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
      if (
        fs.inspectPath(statePath).kind !== "file" ||
        !isCanonicalExistingPath(fs, statePath) ||
        fs.read(statePath) !== serializeBundleAuthoringContributions(nextState)
      ) {
        throw new Error("bundle contribution record does not match the complete plan");
      }
      const derivedBundleFiles = derivedObservation.files
        .map((file) => ({ file, absolute: join(ctx.deliverableRoot, file.path) }))
        .filter(({ absolute }) => isContained(bundleDir, absolute))
        .map(({ file, absolute }) => ({
          path: toPosix(relative(bundleDir, absolute)),
          content: file.content,
        }));
      const derivedBundleAliases = derivedObservation.aliases
        .map((alias) => join(ctx.deliverableRoot, alias.linkPath))
        .filter((path) => isContained(bundleDir, path))
        .map((path) => toPosix(relative(bundleDir, path)));
      if (
        !scaffoldMatches(
          fs,
          bundleDir,
          [...renderedFiles, ...derivedBundleFiles],
          [BACKLOG_ALIAS_DIR, ...derivedBundleAliases],
        )
      ) {
        throw new Error("created bundle tree does not exactly match the frozen scaffold plan");
      }
      if (
        !exactAliasOrCopy(
          fs,
          join(bundleDir, BACKLOG_ALIAS_DIR),
          INSTALL_BACKLOG_DIR,
          join(bundleDir, INSTALL_BACKLOG_DIR),
        )
      ) {
        throw new Error("created bundle backlog alias does not match the frozen plan");
      }
      if (
        advisor !== undefined &&
        (fs.inspectPath(advisor.path).kind !== "file" ||
          !isCanonicalExistingPath(fs, advisor.path) ||
          fs.read(advisor.path) !== advisor.content)
      ) {
        throw new Error("bundle advisor does not match the complete plan");
      }
      assertDerivedPostcondition(fs, ctx.deliverableRoot, derivedObservation);
      if (fs.inspectPath(quarantineRoot).kind !== "missing") {
        throw new Error("request-bound bundle create mutation evidence remains before success");
      }
      assertFrozenProjectScaffold();
      taskPlanActions.assertFinalSnapshot();
    },
  });
  executeActions(
    "bundle create",
    actions,
    `Inspect the completed paths and failed boundary for bundle ${JSON.stringify(input.id)}, preserve their evidence, and resolve the failed effect before choosing an explicit forward completion. The same create request may be rejected after its destination or contribution record exists; this result does not claim the bundle operation completed.`,
  );
  return {
    summary: `created bundle ${input.id}${input.advisor !== false ? " (advisor scaffolded)" : ""}`,
    changedPaths: actions.flatMap(({ boundary, beat }) =>
      beat === "MATERIALISE" || boundary.path === undefined ? [] : [boundary.path],
    ),
    materialisedTaskTitles: materialised,
    ...(desired.aliasPlan.unknownTargets.length > 0
      ? {
          warnings: desired.aliasPlan.unknownTargets.map(
            (agent) =>
              `agent ${JSON.stringify(agent)} is not a built-in known agent; its scope-alias was skipped — configure it manually`,
          ),
        }
      : {}),
  };
}

/** Enable a disabled bundle using only its durable concrete contribution, or mandatory-only legacy behavior. */
export function enableBundleWithAuthoring(
  deps: BundleAuthoringOperationDeps,
  ctx: OperationContext,
  input: EnableBundleWithAuthoringInput,
): OperationResult {
  const { fs, backlog } = deps;
  const blockers: BundleAuthoringBlocker[] = [];
  inspectOperationRoots(fs, ctx, blockers, true);
  const quarantineRoot = join(ctx.workspaceRoot, BUNDLE_AUTHORING_QUARANTINE_DIR);
  const quarantineFor = (slot: string): ConfinedQuarantine => ({
    root: quarantineRoot,
    path: join(quarantineRoot, `enable-${hashTextContent(input.id).slice(7, 23)}`, slot),
  });
  inspectQuarantineAbsent(fs, quarantineRoot, blockers);
  const projectObservation = observeProjectSnapshot(fs, ctx.deliverableRoot, blockers);
  const project = projectObservation?.project;
  const projectManifestText = projectObservation?.manifestText;
  const enabledDescriptorEvidence = projectObservation?.enabledDescriptors;
  const parsedId = parseBundleId(input.id);
  if (!parsedId.ok) {
    blocker(blockers, {
      code: "bundle-id-invalid",
      surface: "input",
      message: parsedId.problem.message,
      recovery: "Choose a portable kebab-case bundle id.",
    });
  } else if (input.id === BUNDLE_TEMPLATE_DIR) {
    blocker(blockers, {
      code: "bundle-id-reserved-scaffold",
      surface: "input",
      message: `${JSON.stringify(BUNDLE_TEMPLATE_DIR)} is reserved for the project default bundle scaffold`,
      recovery: "Choose a disabled bundle outside the default-scaffold boundary.",
    });
  }
  if (project?.manifest.bundles.some((id) => id === input.id)) {
    blocker(blockers, {
      code: "bundle-already-enabled",
      surface: "manifest",
      message: `bundle ${JSON.stringify(input.id)} is already enabled`,
      recovery: "Choose a disabled bundle; enable does not rewrite an enabled bundle.",
    });
  }
  const disabledBundleDir = join(ctx.deliverableRoot, "bundles", input.id);
  let bundleDirectoryReal = false;
  try {
    if (fs.inspectPath(disabledBundleDir).kind === "missing") {
      blocker(blockers, {
        code: "disabled-bundle-missing",
        surface: "bundle",
        path: toPosix(disabledBundleDir),
        message: "disabled bundle directory does not exist",
        recovery: "Restore the disabled bundle directory before enabling it.",
      });
    } else {
      bundleDirectoryReal = inspectRealDirectory(fs, disabledBundleDir, "bundle", blockers);
    }
  } catch (error) {
    blocker(blockers, {
      code: "disabled-bundle-unreadable",
      surface: "bundle",
      path: toPosix(disabledBundleDir),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable no-follow access to the disabled bundle directory.",
    });
  }
  const descriptorPath = join(disabledBundleDir, BUNDLE_MANIFEST_FILE);
  let bundle: BundleManifest | undefined;
  let descriptorText: string | undefined;
  if (bundleDirectoryReal)
    try {
      const kind = fs.inspectPath(descriptorPath);
      if (kind.kind !== "file") {
        blocker(blockers, {
          code: "disabled-bundle-missing",
          surface: "bundle",
          path: toPosix(descriptorPath),
          message: `bundle directory does not exist with a regular descriptor (found: ${kind.kind})`,
          recovery: "Restore the disabled bundle directory and its regular bundle.yml descriptor.",
        });
      } else {
        descriptorText = fs.read(descriptorPath);
        const parsed = parseBundleManifest(parseYaml(descriptorText));
        if (!parsed.ok) {
          blocker(blockers, {
            code: "disabled-bundle-invalid",
            surface: "bundle",
            path: toPosix(descriptorPath),
            message: parsed.problem.message,
            recovery: "Repair the disabled bundle descriptor before enabling it.",
          });
        } else if (parsed.value.id !== input.id) {
          blocker(blockers, {
            code: "disabled-bundle-id-mismatch",
            surface: "bundle",
            path: toPosix(descriptorPath),
            message: `descriptor id ${JSON.stringify(parsed.value.id)} does not match path id ${JSON.stringify(input.id)}`,
            recovery: "Restore path and descriptor identity agreement.",
          });
        } else bundle = parsed.value;
      }
    } catch (error) {
      blocker(blockers, {
        code: "disabled-bundle-unreadable",
        surface: "bundle",
        path: toPosix(descriptorPath),
        message: error instanceof Error ? error.message : String(error),
        recovery: "Restore readable access to the disabled bundle descriptor.",
      });
    }

  const stateObservation = observeContributionState(fs, ctx.workspaceRoot, blockers);
  const producer = { source: "project-local", scope: "bundle", name: BUNDLE_TEMPLATE_DIR } as const;
  const contribution = stateObservation?.state.bundles.find(({ id }) => id === input.id)
    ?.contribution ?? {
    status: "none" as const,
    producer,
  };
  const mandatory = perBundleAuthoringTaskCatalog(input.id, { advisor: input.advisor !== false });
  const compiled = compileRecordedBundleAuthoringTaskPlan({
    id: input.id,
    mandatoryTasks: mandatory,
    contribution,
  });
  if (!compiled.ok) addPlanProblems(blockers, compiled.problems);
  if (compiled.ok) {
    addPriorBundleTitleConflicts({
      blockers,
      currentId: input.id,
      currentTasks: compiled.tasks,
      state: stateObservation?.state,
      enabledBundleIds: project?.manifest.bundles ?? [],
    });
  }
  const backlogRoot = join(ctx.workspaceRoot, AUTHORING_BACKLOG_DIR);
  const backlogObservation = inspectBacklog(fs, backlog, backlogRoot, blockers);
  const records = backlogObservation?.records;
  const reconciliation =
    compiled.ok && records !== undefined
      ? reconcileBundleAuthoringTaskPlan({ tasks: compiled.tasks, records })
      : undefined;
  if (reconciliation !== undefined && !reconciliation.ok) {
    for (const problem of reconciliation.problems) {
      blocker(blockers, {
        code: problem.code,
        surface: "authoring-task-plan",
        path: problem.taskId,
        message: problem.message,
        recovery:
          "Restore the exact recorded WPM-owned task definition while preserving human progress.",
      });
    }
  }
  if (
    reconciliation !== undefined &&
    reconciliation.missing.length > 0 &&
    (backlogObservation?.inactiveEntries?.length ?? 0) > 0
  ) {
    blocker(blockers, {
      code: "inactive-task-ownership-ambiguous",
      surface: "backlog",
      path: backlogObservation?.inactiveEntries?.join(", "),
      message: "inactive Backlog records may already own missing bundle authoring work",
      recovery:
        "Restore or inspect the inactive records before creating replacement authoring tasks.",
    });
  }
  if (reconciliation !== undefined && reconciliation.missing.length > 0) {
    inspectMutationPath(
      fs,
      join(backlogRoot, "backlog", "tasks", ".wpm-planned-task.md"),
      "backlog",
      blockers,
    );
    inspectMutationPath(fs, join(backlogRoot, "backlog", ".locks", "create"), "backlog", blockers);
  }

  const selectedProjectTemplate = projectTemplate(deps, ctx.deliverableRoot, blockers);
  let manifestBefore: string | undefined;
  let manifestAfter: string | undefined;
  let desired: ReturnType<typeof deriveArtefactsFromTemplateSnapshot> | undefined;
  let changes: ReturnType<typeof planChanges> | undefined;
  let derivedObservation: ObservedDerivedPlan | undefined;
  if (project !== undefined && bundle !== undefined && selectedProjectTemplate !== undefined) {
    try {
      manifestBefore = projectManifestText;
      if (manifestBefore === undefined) throw new Error("project manifest snapshot is unavailable");
      manifestAfter = editYaml(manifestBefore, (doc) => doc.addIn(["bundles"], input.id));
      const postProject: Project = {
        rootPath: project.rootPath,
        manifest: { ...project.manifest, bundles: [...project.manifest.bundles, bundle.id] },
        bundles: new Map([...project.bundles, [bundle.id, bundle]]),
      };
      desired = deriveArtefactsFromTemplateSnapshot(postProject, selectedProjectTemplate);
      derivedObservation = observeDesiredChanges(fs, ctx.deliverableRoot, desired, blockers);
      changes = derivedObservation.changes;
    } catch (error) {
      blocker(blockers, {
        code: "enable-plan-invalid",
        surface: "derived-artifact",
        message: error instanceof Error ? error.message : String(error),
        recovery: "Repair the manifest/project template before enabling the bundle.",
      });
    }
  }

  let advisor: { readonly path: string; readonly content: string } | undefined;
  let retainedAdvisor: { readonly path: string; readonly content: string } | undefined;
  if (input.advisor !== false && selectedProjectTemplate !== undefined) {
    const snippet = selectedProjectTemplate.snippets.find(
      ({ path }) => path === ADVISOR_SNIPPET_PATH,
    );
    if (snippet === undefined) {
      blocker(blockers, {
        code: "advisor-snippet-missing",
        surface: "advisor",
        message: `project template is missing ${ADVISOR_SNIPPET_PATH}`,
        recovery: "Restore the project template advisor snippet or use --no-advisor.",
      });
    } else {
      const path = join(ctx.deliverableRoot, advisorSkillPath(input.id));
      try {
        const kind = fs.inspectPath(path);
        if (kind.kind === "missing") {
          advisor = {
            path,
            content: renderSnippet(snippet, new Map([["bundle-id", input.id]])).content,
          };
        } else if (kind.kind === "file" && isCanonicalExistingPath(fs, path)) {
          retainedAdvisor = { path, content: fs.read(path) };
        } else {
          blocker(blockers, {
            code: "advisor-destination-ambiguous",
            surface: "advisor",
            path: toPosix(path),
            message:
              kind.kind === "file"
                ? "advisor destination resolves through a noncanonical ancestor or alias"
                : `advisor destination is ${kind.kind}`,
            recovery: "Move the unowned advisor destination aside or use --no-advisor.",
          });
        }
      } catch (error) {
        blocker(blockers, {
          code: "advisor-output-invalid",
          surface: "advisor",
          message: error instanceof Error ? error.message : String(error),
          recovery: "Repair the project advisor snippet or use --no-advisor.",
        });
      }
    }
  }

  const enableOutputPaths: PlannedOutputPath[] = [
    ...(derivedObservation?.files.map((file) => ({
      path: join(ctx.deliverableRoot, file.path),
      kind: "file" as const,
      owner: `derived file ${file.path}`,
    })) ?? []),
    ...(derivedObservation?.aliases.map((alias) => ({
      path: join(ctx.deliverableRoot, alias.linkPath),
      kind: "alias" as const,
      owner: `derived alias ${alias.linkPath}`,
    })) ?? []),
    ...(advisor === undefined && retainedAdvisor === undefined
      ? []
      : [
          {
            path: (advisor ?? retainedAdvisor)?.path as string,
            kind: "file" as const,
            owner: "bundle advisor",
          },
        ]),
    {
      path: join(ctx.deliverableRoot, MANIFEST_FILE),
      kind: "file" as const,
      owner: "project manifest",
    },
  ];
  addWholePlanPathBlockers(enableOutputPaths, blockers);
  const enablePlannedFiles = enableOutputPaths
    .filter(({ kind }) => kind === "file")
    .map(({ path }) => path);
  for (const alias of changes?.aliasesToCreate ?? []) {
    addAliasTargetBlocker(
      fs,
      join(ctx.deliverableRoot, alias.aliasTo),
      enablePlannedFiles,
      blockers,
    );
  }
  const plannedManifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
  inspectMutationPath(fs, plannedManifestPath, "manifest", blockers);
  inspectQuarantinedReplacement(fs, plannedManifestPath, quarantineFor("manifest"), blockers);
  if (advisor !== undefined) inspectMutationPath(fs, advisor.path, "advisor", blockers);
  for (const file of changes?.filesToWrite ?? []) {
    const path = join(ctx.deliverableRoot, file.path);
    inspectMutationPath(fs, path, "derived-artifact", blockers);
    const observed = derivedObservation?.files.find((candidate) => candidate.path === file.path);
    if (observed?.before !== null && observed?.before !== undefined) {
      inspectQuarantinedReplacement(
        fs,
        path,
        quarantineFor(`derived-${hashTextContent(file.path).slice(7, 23)}`),
        blockers,
      );
    }
  }
  for (const alias of changes?.aliasesToCreate ?? []) {
    inspectMutationPath(
      fs,
      join(ctx.deliverableRoot, alias.linkPath),
      "derived-artifact",
      blockers,
    );
  }

  if (blockers.length > 0) throw new BundleAuthoringPreflightError(sortedBlockers(blockers));
  if (
    project === undefined ||
    enabledDescriptorEvidence === undefined ||
    bundle === undefined ||
    descriptorText === undefined ||
    stateObservation === undefined ||
    !compiled.ok ||
    reconciliation === undefined ||
    !reconciliation.ok ||
    records === undefined ||
    manifestBefore === undefined ||
    manifestAfter === undefined ||
    desired === undefined ||
    derivedObservation === undefined ||
    changes === undefined ||
    backlogObservation === undefined
  ) {
    throw new Error("bundle enable preflight did not produce a complete immutable plan");
  }
  const actions: PlannedAction[] = [];
  const manifestPath = join(ctx.deliverableRoot, MANIFEST_FILE);
  const writeManifest = expectedFileWrite(
    fs,
    manifestPath,
    manifestAfter,
    manifestBefore,
    ctx.workspaceRoot,
    quarantineFor("manifest"),
  );
  actions.push({
    boundary: {
      id: "bundle-manifest-enable",
      path: toPosix(manifestPath),
      description: "append the disabled bundle to the enabled manifest set",
    },
    beat: "APPLY",
    apply: () => {
      assertBacklogSnapshot(
        {
          fs,
          backlog,
          backlogRoot,
          inactiveEntries: backlogObservation.inactiveEntries,
          criticalUnexpectedEntries: backlogObservation.criticalUnexpectedEntries,
          taskPrefix: backlogObservation.taskPrefix,
        },
        new Map(records.map((record) => [record.id, record])),
      );
      if (
        fs.inspectPath(descriptorPath).kind !== "file" ||
        !isCanonicalExistingPath(fs, descriptorPath) ||
        fs.read(descriptorPath) !== descriptorText
      ) {
        throw new Error("disabled bundle descriptor changed after preflight");
      }
      assertDescriptorEvidenceUnchanged(fs, enabledDescriptorEvidence);
      assertContributionStateUnchanged(fs, ctx.workspaceRoot, stateObservation);
      assertDerivedPreimage(fs, ctx.deliverableRoot, derivedObservation);
      if (
        retainedAdvisor !== undefined &&
        (fs.inspectPath(retainedAdvisor.path).kind !== "file" ||
          !isCanonicalExistingPath(fs, retainedAdvisor.path) ||
          fs.read(retainedAdvisor.path) !== retainedAdvisor.content)
      ) {
        throw new Error("retained bundle advisor changed after preflight");
      }
      writeManifest();
    },
  });
  if (advisor !== undefined) {
    actions.push({
      boundary: {
        id: "bundle-advisor",
        path: toPosix(advisor.path),
        description: "write the bundle advisor stub",
      },
      beat: "APPLY",
      apply: expectedFileWrite(fs, advisor.path, advisor.content, null, ctx.deliverableRoot),
    });
  }
  for (const file of changes.filesToWrite) {
    const path = join(ctx.deliverableRoot, file.path);
    const before = fs.inspectPath(path).kind === "file" ? fs.read(path) : null;
    actions.push({
      boundary: {
        id: `derived-file:${file.path}`,
        path: toPosix(path),
        description: `refresh derived file ${file.path}`,
      },
      beat: "RERENDER",
      apply: expectedFileWrite(
        fs,
        path,
        file.content,
        before,
        ctx.workspaceRoot,
        before === null
          ? undefined
          : quarantineFor(`derived-${hashTextContent(file.path).slice(7, 23)}`),
      ),
    });
  }
  for (const alias of changes.aliasesToCreate) {
    const path = join(ctx.deliverableRoot, alias.linkPath);
    actions.push({
      boundary: {
        id: `derived-alias:${alias.linkPath}`,
        path: toPosix(path),
        description: `create derived alias ${alias.linkPath}`,
      },
      beat: "RERENDER",
      apply: () => {
        const target = join(ctx.deliverableRoot, alias.aliasTo);
        ensureAliasAtBoundary(fs, ctx.deliverableRoot, target, target, path);
      },
    });
  }
  const materialised: string[] = [];
  const taskPlanActions = plannedTaskActions({
    fs,
    backlog,
    backlogRoot,
    records,
    inactiveEntries: backlogObservation.inactiveEntries,
    criticalUnexpectedEntries: backlogObservation.criticalUnexpectedEntries,
    taskPrefix: backlogObservation.taskPrefix,
    preserved: reconciliation.preserved,
    missing: reconciliation.missing,
    materialised,
  });
  actions.push(...taskPlanActions.actions);
  actions.push({
    boundary: {
      id: "bundle-enable-postcondition",
      description: "verify the complete bundle enable plan before reporting success",
    },
    beat: "MATERIALISE",
    apply: () => {
      if (
        fs.inspectPath(descriptorPath).kind !== "file" ||
        !isCanonicalExistingPath(fs, descriptorPath) ||
        fs.read(descriptorPath) !== descriptorText
      ) {
        throw new Error("enabled bundle descriptor changed before success");
      }
      assertDescriptorEvidenceUnchanged(fs, enabledDescriptorEvidence);
      const statePath = join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
      if (
        stateObservation.text === null
          ? fs.inspectPath(statePath).kind !== "missing"
          : fs.inspectPath(statePath).kind !== "file" ||
            !isCanonicalExistingPath(fs, statePath) ||
            fs.read(statePath) !== stateObservation.text
      ) {
        throw new Error("bundle contribution record changed before success");
      }
      if (
        fs.inspectPath(manifestPath).kind !== "file" ||
        !isCanonicalExistingPath(fs, manifestPath) ||
        fs.read(manifestPath) !== manifestAfter
      ) {
        throw new Error("project manifest does not match the complete enable plan");
      }
      if (
        advisor !== undefined &&
        (fs.inspectPath(advisor.path).kind !== "file" ||
          !isCanonicalExistingPath(fs, advisor.path) ||
          fs.read(advisor.path) !== advisor.content)
      ) {
        throw new Error("bundle advisor does not match the complete plan");
      }
      if (
        retainedAdvisor !== undefined &&
        (fs.inspectPath(retainedAdvisor.path).kind !== "file" ||
          !isCanonicalExistingPath(fs, retainedAdvisor.path) ||
          fs.read(retainedAdvisor.path) !== retainedAdvisor.content)
      ) {
        throw new Error("retained bundle advisor changed before success");
      }
      assertDerivedPostcondition(fs, ctx.deliverableRoot, derivedObservation);
      if (fs.inspectPath(quarantineRoot).kind !== "missing") {
        throw new Error("request-bound bundle enable mutation evidence remains before success");
      }
      taskPlanActions.assertFinalSnapshot();
    },
  });
  executeActions(
    "bundle enable",
    actions,
    `Inspect the completed paths and failed boundary for bundle ${JSON.stringify(input.id)} and resolve the failed effect. If the manifest boundary was written, use the supported disable then enable sequence only after verifying the retained descriptor and contribution record; this result does not claim enablement completed.`,
  );
  return {
    summary: `enabled bundle ${input.id}${input.advisor !== false ? " (advisor scaffolded)" : ""}`,
    changedPaths: actions.flatMap(({ boundary, beat }) =>
      beat === "MATERIALISE" || boundary.path === undefined ? [] : [boundary.path],
    ),
    materialisedTaskTitles: materialised,
    ...(desired.aliasPlan.unknownTargets.length > 0
      ? {
          warnings: desired.aliasPlan.unknownTargets.map(
            (agent) =>
              `agent ${JSON.stringify(agent)} is not a built-in known agent; its scope-alias was skipped — configure it manually`,
          ),
        }
      : {}),
  };
}

/** Replace the project default scaffold and its inert task contribution under one bounded publication plan. */
export function setDefaultBundleTemplateWithAuthoring(
  deps: BundleAuthoringOperationDeps,
  ctx: OperationContext,
  input: SetDefaultBundleTemplateInput,
): SetDefaultBundleTemplateResult {
  const blockers: BundleAuthoringBlocker[] = [];
  inspectOperationRoots(deps.fs, ctx, blockers, true);
  const stateObservation = observeContributionState(deps.fs, ctx.workspaceRoot, blockers);
  let resolution: ReturnType<typeof resolveTemplate> | undefined;
  try {
    resolution = resolveTemplate(input.name, "bundle", {
      fs: deps.fs,
      builtinTemplatesRoot: deps.builtinTemplatesRoot,
      projectTemplatesRoot: join(ctx.deliverableRoot, "templates"),
    });
    if (!resolution.found) {
      blocker(blockers, {
        code: "bundle-template-not-found",
        surface: "template",
        message: `bundle template ${JSON.stringify(input.name)} was not found`,
        recovery: "Choose an available bundle-scope template.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-template-invalid",
      surface: "template",
      message: error instanceof Error ? error.message : String(error),
      recovery: "Repair the selected bundle template before replacing the project default.",
    });
  }
  let project: Project | undefined;
  try {
    project = loadProject(deps.fs, ctx.deliverableRoot);
  } catch (error) {
    blocker(blockers, {
      code: "project-manifest-invalid",
      surface: "manifest",
      message: error instanceof Error ? error.message : String(error),
      recovery: "Repair the project before replacing its default bundle template.",
    });
  }

  const dest = join(ctx.deliverableRoot, "bundles", BUNDLE_TEMPLATE_DIR);
  let beforeEvidence: string | null = null;
  let beforeFingerprint: string | null = null;
  try {
    const kind = deps.fs.inspectPath(dest);
    if (kind.kind === "directory") {
      beforeEvidence = treeEvidence(deps.fs, dest);
      beforeFingerprint = confinedTreeFingerprint(deps.fs, dest);
    } else if (kind.kind !== "missing") {
      blocker(blockers, {
        code: "bundle-template-destination-ambiguous",
        surface: "bundle",
        path: toPosix(dest),
        message: `default scaffold destination is ${kind.kind}`,
        recovery: "Move the unowned destination aside before setting the default template.",
      });
    }
  } catch (error) {
    blocker(blockers, {
      code: "bundle-template-destination-unreadable",
      surface: "bundle",
      path: toPosix(dest),
      message: error instanceof Error ? error.message : String(error),
      recovery: "Restore readable no-follow access to the default scaffold.",
    });
  }

  let nextState: BundleAuthoringContributions | undefined;
  if (resolution?.found && project !== undefined && stateObservation !== undefined) {
    if (!resolution.template.files.some(({ path }) => path.startsWith(`${INSTALL_BACKLOG_DIR}/`))) {
      blocker(blockers, {
        code: "bundle-install-backlog-missing",
        surface: "bundle",
        path: INSTALL_BACKLOG_DIR,
        message: "selected default template does not materialise an install-backlog target",
        recovery: "Add at least one install-backlog file to the selected bundle template.",
      });
    }
    for (const file of resolution.template.files) {
      if (file.path === BUNDLE_MANIFEST_FILE || isBacklogAliasPath(file.path)) {
        blocker(blockers, {
          code: "bundle-template-reserved-path",
          surface: "bundle",
          path: file.path,
          message: "selected default scaffold collides with a WPM-owned bundle boundary",
          recovery: "Remove bundle.yml and backlog alias paths from the template files tree.",
        });
      }
    }
    const producer = {
      source: resolution.source,
      scope: "bundle" as const,
      name: resolution.template.name,
    };
    const inspection = inspectTemplateAuthoringTasks({
      template: resolution.template,
      producer,
      mandatoryTasks: perBundleAuthoringTaskCatalog("bundle-preview", { advisor: false }),
    });
    if (inspection.status === "invalid") {
      for (const problem of inspection.problems) {
        blocker(blockers, {
          code: problem.code,
          surface: "authoring-task-plan",
          path: problem.path,
          message: problem.message,
          recovery: "Repair the selected template contribution before setting it as the default.",
        });
      }
    } else {
      nextState = {
        ...stateObservation.state,
        defaultContribution: {
          scaffoldSha256: bundleContributionScaffoldSha256(resolution.template.files),
          contribution:
            inspection.status === "none"
              ? { status: "none", producer }
              : {
                  status: "source",
                  producer,
                  source: requiredCanonicalTaskSource(resolution.template),
                },
        },
      };
    }
  }

  const templateOutputPaths: PlannedOutputPath[] = [
    ...(resolution?.found
      ? resolution.template.files.map((file) => ({
          path: join(dest, file.path),
          kind: "file" as const,
          owner: `default scaffold ${file.path}`,
        }))
      : []),
    {
      path: join(dest, BACKLOG_ALIAS_DIR),
      kind: "alias" as const,
      owner: "default scaffold backlog alias",
    },
  ];
  addWholePlanPathBlockers(templateOutputPaths, blockers);
  addAliasTargetBlocker(
    deps.fs,
    join(dest, INSTALL_BACKLOG_DIR),
    templateOutputPaths.filter(({ kind }) => kind === "file").map(({ path }) => path),
    blockers,
  );
  for (const output of templateOutputPaths) {
    inspectMutationPath(deps.fs, output.path, "bundle", blockers);
  }
  const pendingPath = join(ctx.workspaceRoot, BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH);
  const statePath = join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH);
  inspectMutationPath(deps.fs, pendingPath, "contribution-record", blockers);
  inspectMutationPath(deps.fs, statePath, "contribution-record", blockers);
  if (beforeEvidence !== null) inspectMutationPath(deps.fs, dest, "bundle", blockers);

  const nextStateText =
    nextState === undefined ? undefined : serializeBundleAuthoringContributions(nextState);
  const quarantineRoot =
    nextStateText === undefined
      ? undefined
      : join(ctx.workspaceRoot, ".wpm-bundle-authoring-quarantine");
  const quarantinePath =
    quarantineRoot === undefined || nextStateText === undefined
      ? undefined
      : join(quarantineRoot, hashTextContent(nextStateText).slice(7, 23), "prior-scaffold");
  const stateQuarantine =
    quarantineRoot === undefined || nextStateText === undefined
      ? undefined
      : {
          root: quarantineRoot,
          path: join(quarantineRoot, hashTextContent(nextStateText).slice(7, 23), "state"),
        };
  const pendingQuarantine =
    quarantineRoot === undefined || nextStateText === undefined
      ? undefined
      : {
          root: quarantineRoot,
          path: join(
            quarantineRoot,
            hashTextContent(nextStateText).slice(7, 23),
            "pending-cleanup",
          ),
        };
  if (quarantineRoot !== undefined) {
    inspectQuarantineAbsent(deps.fs, quarantineRoot, blockers);
  }
  if (beforeFingerprint !== null && quarantineRoot !== undefined && quarantinePath !== undefined) {
    inspectMutationPath(deps.fs, quarantinePath, "bundle", blockers);
    inspectMutationPair(deps.fs, dest, quarantinePath, blockers);
  }
  if (stateObservation?.text !== null && stateObservation?.text !== undefined && stateQuarantine) {
    inspectQuarantinedReplacement(deps.fs, statePath, stateQuarantine, blockers);
  }
  if (pendingQuarantine !== undefined) {
    inspectMutationPath(deps.fs, pendingQuarantine.path, "contribution-record", blockers);
    inspectMutationPair(deps.fs, pendingPath, pendingQuarantine.path, blockers);
  }

  if (blockers.length > 0) throw new BundleAuthoringPreflightError(sortedBlockers(blockers));
  if (
    !resolution?.found ||
    stateObservation === undefined ||
    nextState === undefined ||
    nextStateText === undefined ||
    quarantineRoot === undefined ||
    quarantinePath === undefined ||
    stateQuarantine === undefined ||
    pendingQuarantine === undefined
  ) {
    throw new Error("bundle template set preflight did not produce a complete immutable plan");
  }
  const pendingText = `${JSON.stringify(
    {
      schemaVersion: 1,
      operation: "bundle-template-set",
      template: input.name,
      previousStateSha256:
        stateObservation.text === null ? null : hashTextContent(stateObservation.text).slice(7),
      nextStateSha256: hashTextContent(nextStateText).slice(7),
      scaffoldSha256: bundleContributionScaffoldSha256(resolution.template.files),
      quarantine: toPosix(relative(ctx.workspaceRoot, quarantinePath)),
    },
    null,
    2,
  )}\n`;
  const publishPending = expectedFileWrite(
    deps.fs,
    pendingPath,
    pendingText,
    null,
    ctx.workspaceRoot,
  );
  const assertPending = (): void => {
    if (
      deps.fs.inspectPath(pendingPath).kind !== "file" ||
      deps.fs.read(pendingPath) !== pendingText
    ) {
      throw new Error("bundle-template-set pending marker changed before a planned effect");
    }
  };
  const actions: PlannedAction[] = [
    {
      boundary: {
        id: "bundle-template-set-pending",
        path: toPosix(pendingPath),
        description: "publish the bounded bundle-template-set pending marker",
      },
      beat: "APPLY",
      apply: () => {
        assertContributionStateUnchanged(deps.fs, ctx.workspaceRoot, stateObservation);
        const kind = deps.fs.inspectPath(dest);
        if (
          (beforeEvidence === null && kind.kind !== "missing") ||
          (beforeEvidence !== null &&
            (kind.kind !== "directory" || treeEvidence(deps.fs, dest) !== beforeEvidence))
        ) {
          throw new Error("default bundle scaffold changed after preflight");
        }
        publishPending();
      },
    },
  ];
  if (beforeEvidence !== null) {
    actions.push({
      boundary: {
        id: "bundle-template-remove-prior",
        path: toPosix(dest),
        description: "retire the prior default bundle scaffold",
      },
      beat: "APPLY",
      apply: () => {
        assertPending();
        if (beforeFingerprint === null) {
          throw new Error("default bundle scaffold is missing its exact removal fingerprint");
        }
        if (
          deps.fs.inspectPath(dest).kind !== "directory" ||
          treeEvidence(deps.fs, dest) !== beforeEvidence
        ) {
          throw new Error("default bundle scaffold changed after preflight");
        }
        deps.fs.removeConfined(ctx.workspaceRoot, dest, beforeFingerprint, {
          root: quarantineRoot,
          path: quarantinePath,
        });
      },
    });
  }
  for (const file of [...resolution.template.files].sort((left, right) =>
    compareCodeUnits(left.path, right.path),
  )) {
    const path = join(dest, file.path);
    actions.push({
      boundary: {
        id: `bundle-template-file:${file.path}`,
        path: toPosix(path),
        description: `write default bundle scaffold file ${file.path}`,
      },
      beat: "APPLY",
      apply: () => {
        assertPending();
        expectedFileWrite(deps.fs, path, file.content, null, ctx.deliverableRoot)();
      },
    });
  }
  const aliasPath = join(dest, BACKLOG_ALIAS_DIR);
  actions.push({
    boundary: {
      id: "bundle-template-backlog-alias",
      path: toPosix(aliasPath),
      description: "create the default scaffold backlog alias",
    },
    beat: "APPLY",
    apply: () => {
      assertPending();
      ensureAliasAtBoundary(
        deps.fs,
        ctx.deliverableRoot,
        INSTALL_BACKLOG_DIR,
        join(dest, INSTALL_BACKLOG_DIR),
        aliasPath,
      );
    },
  });
  const assertPublishedScaffold = (): void => {
    if (!scaffoldMatches(deps.fs, dest, resolution.template.files)) {
      throw new Error("published default scaffold does not exactly match the selected snapshot");
    }
    if (
      !exactAliasOrCopy(deps.fs, aliasPath, INSTALL_BACKLOG_DIR, join(dest, INSTALL_BACKLOG_DIR))
    ) {
      throw new Error("published default scaffold backlog alias is not exact");
    }
  };
  actions.push({
    boundary: {
      id: "bundle-template-scaffold-postcondition",
      path: toPosix(dest),
      description: "verify the selected scaffold snapshot before publishing its record",
    },
    beat: "APPLY",
    apply: () => {
      if (
        deps.fs.inspectPath(pendingPath).kind !== "file" ||
        deps.fs.read(pendingPath) !== pendingText
      ) {
        throw new Error("bundle-template-set pending marker changed before scaffold verification");
      }
      assertPublishedScaffold();
    },
  });
  actions.push(
    stateWriteAction(
      deps.fs,
      ctx.workspaceRoot,
      stateObservation,
      nextState,
      pendingText,
      stateObservation.text === null ? undefined : stateQuarantine,
    ),
  );
  actions.push({
    boundary: {
      id: "bundle-template-set-pending-cleanup",
      path: toPosix(pendingPath),
      description: "retire the completed bundle-template-set pending marker",
    },
    beat: "APPLY",
    apply: () => {
      if (
        deps.fs.inspectPath(pendingPath).kind !== "file" ||
        deps.fs.read(pendingPath) !== pendingText
      ) {
        throw new Error("bundle-template-set pending marker changed before cleanup");
      }
      if (
        deps.fs.inspectPath(statePath).kind !== "file" ||
        deps.fs.read(statePath) !== nextStateText
      ) {
        throw new Error("bundle contribution record changed before template-set cleanup");
      }
      assertPublishedScaffold();
      deps.fs.removeFileConfined(ctx.workspaceRoot, pendingPath, pendingText, pendingQuarantine);
      if (deps.fs.inspectPath(pendingPath).kind !== "missing") {
        throw new Error("bundle-template-set pending marker remains after cleanup");
      }
    },
  });
  actions.push({
    boundary: {
      id: "bundle-template-set-postcondition",
      description: "verify the scaffold and contribution record pairing before reporting success",
    },
    beat: "APPLY",
    apply: () => {
      if (deps.fs.inspectPath(pendingPath).kind !== "missing") {
        throw new Error("bundle-template-set pending marker remains before success");
      }
      if (
        deps.fs.inspectPath(statePath).kind !== "file" ||
        deps.fs.read(statePath) !== nextStateText
      ) {
        throw new Error("bundle contribution record does not match the selected scaffold");
      }
      assertPublishedScaffold();
      if (deps.fs.inspectPath(quarantineRoot).kind !== "missing") {
        throw new Error("request-bound template-set mutation evidence remains before success");
      }
    },
  });
  executeActions(
    "bundle template set",
    actions,
    "Inspect the pending marker plus the named scaffold and contribution-record boundaries, finish or restore their exact pairing, then retire only that exact marker. This result does not claim the template selection completed.",
  );
  return {
    summary: `set bundle template from ${JSON.stringify(input.name)}`,
    changedPaths: [
      toPosix(dest),
      toPosix(join(ctx.workspaceRoot, BUNDLE_AUTHORING_CONTRIBUTIONS_PATH)),
    ],
    materialisedTaskTitles: [],
    fileCount: resolution.template.files.length,
  };
}
