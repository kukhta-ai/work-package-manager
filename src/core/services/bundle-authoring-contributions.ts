import type {
  MandatoryAuthoringTask,
  TemplateAuthoringTaskSource,
  TemplateFile,
} from "../model/index.js";
import { parseBundleId } from "../model/index.js";
import { UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES } from "./bundle-authoring-task-plan.js";
import { hashArtifactFiles } from "./integrity.js";
import {
  type PlannedProjectAuthoringTask,
  type ProjectAuthoringTaskProvenance,
  templateTaskProvenanceLabels,
} from "./project-authoring-task-plan.js";
import {
  inspectTemplateAuthoringTasks,
  isSafeMaterialisedAuthoringTaskText,
  type TemplateProducer,
} from "./template-authoring-tasks.js";

/** Authoring-only workspace-root record. The build input is `wip/`, so this path never enters a deliverable. */
export const BUNDLE_AUTHORING_CONTRIBUTIONS_PATH = ".wpm-bundle-authoring.json";
/** Bounded fail-closed marker while `bundle template set` publishes scaffold + record across distinct files. */
export const BUNDLE_AUTHORING_TEMPLATE_SET_PENDING_PATH =
  ".wpm-bundle-authoring.template-set.pending.json";

/** A concrete template task frozen for one bundle instance. */
export interface RecordedBundleAuthoringTask {
  readonly identity: string;
  readonly key: string;
  readonly title: string;
  readonly acceptanceCriteria: readonly string[];
  readonly dependencyIdentities: readonly string[];
  readonly labels: readonly string[];
}

/** A selected producer that contributed no additional work. */
export interface RecordedNoBundleContribution {
  readonly status: "none";
  readonly producer: TemplateProducer;
}

/** One frozen, concrete bundle contribution. */
export interface RecordedBundleTaskContribution {
  readonly status: "tasks";
  readonly producer: TemplateProducer;
  readonly revision: string;
  readonly tasks: readonly RecordedBundleAuthoringTask[];
}

export type RecordedConcreteBundleContribution =
  | RecordedNoBundleContribution
  | RecordedBundleTaskContribution;

/** A valid inert default declaration retained independently of its scaffold bytes. */
export interface RecordedDefaultSourceContribution {
  readonly status: "source";
  readonly producer: TemplateProducer;
  readonly source: TemplateAuthoringTaskSource;
}

export type RecordedDefaultBundleContribution =
  | RecordedNoBundleContribution
  | RecordedDefaultSourceContribution;

/** The current project default contribution and exact scaffold-tree binding. */
export interface RecordedDefaultBundleSelection {
  readonly scaffoldSha256: string;
  readonly contribution: RecordedDefaultBundleContribution;
}

/** One concrete bundle entry, ordered by bundle id. */
export interface RecordedBundleContributionEntry {
  readonly id: string;
  readonly contribution: RecordedConcreteBundleContribution;
}

/** Strict version-1 producer image for bundle contribution ownership. */
export interface BundleAuthoringContributions {
  readonly schemaVersion: 1;
  readonly defaultContribution: RecordedDefaultBundleSelection | null;
  readonly bundles: readonly RecordedBundleContributionEntry[];
}

export type BundleAuthoringContributionsParseResult =
  | { readonly ok: true; readonly value: BundleAuthoringContributions }
  | { readonly ok: false; readonly reason: string };

const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TEMPLATE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** The project default scaffold is producer evidence, never one concrete bundle contribution. */
const RESERVED_DEFAULT_SCAFFOLD_ID = "bundle-template";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function producer(value: unknown): TemplateProducer | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["source", "scope", "name"]) ||
    (value.source !== "built-in" && value.source !== "project-local") ||
    value.scope !== "bundle" ||
    typeof value.name !== "string" ||
    !TEMPLATE_NAME.test(value.name)
  ) {
    return undefined;
  }
  return { source: value.source, scope: "bundle", name: value.name };
}

function stringList(value: unknown, allowEmpty = true): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    !value.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    return undefined;
  }
  return value as readonly string[];
}

const SYMBOLIC_BUNDLE_MANDATORY_TASKS: readonly MandatoryAuthoringTask[] =
  UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES.map((reference, index) => ({
    reference,
    title: `WPM symbolic mandatory bundle task ${index + 1}`,
    acceptanceCriteria: ["The symbolic mandatory task is available"],
  }));

/**
 * Normalize an inspected bundle authoring-task source into the durable record's fixed producer image.
 *
 * Callers use this after template inspection succeeds. `undefined` keeps the helper total if an uninspected
 * or structurally invalid source reaches the boundary; no partial source is ever returned.
 */
export function canonicalBundleAuthoringTaskSource(
  value: unknown,
): TemplateAuthoringTaskSource | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["revision", "tasks"]) ||
    typeof value.revision !== "string" ||
    !REVISION.test(value.revision) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length === 0
  ) {
    return undefined;
  }
  const keys = new Set<string>();
  const tasks: Record<string, unknown>[] = [];
  for (const task of value.tasks) {
    if (!isRecord(task)) return undefined;
    const expected = ["key", "title", "acceptance-criteria"];
    if (Object.hasOwn(task, "depends-on")) expected.push("depends-on");
    if (
      !hasExactKeys(task, expected) ||
      typeof task.key !== "string" ||
      !KEY.test(task.key) ||
      keys.has(task.key) ||
      typeof task.title !== "string" ||
      task.title.length === 0 ||
      stringList(task["acceptance-criteria"], false) === undefined ||
      (Object.hasOwn(task, "depends-on") && stringList(task["depends-on"]) === undefined)
    ) {
      return undefined;
    }
    keys.add(task.key);
    tasks.push({
      key: task.key,
      title: task.title,
      "acceptance-criteria": [...(task["acceptance-criteria"] as readonly string[])],
      ...(Object.hasOwn(task, "depends-on")
        ? { "depends-on": [...(task["depends-on"] as readonly string[])] }
        : {}),
    });
  }
  return { revision: value.revision, tasks };
}

function defaultSource(
  value: unknown,
  parsedProducer: TemplateProducer,
): TemplateAuthoringTaskSource | undefined {
  const source = canonicalBundleAuthoringTaskSource(value);
  if (source === undefined) return undefined;
  const inspection = inspectTemplateAuthoringTasks({
    template: {
      name: parsedProducer.name,
      scope: "bundle",
      parameters: [],
      files: [],
      snippets: [],
      authoringTaskSource: source,
    },
    producer: parsedProducer,
    mandatoryTasks: SYMBOLIC_BUNDLE_MANDATORY_TASKS,
  });
  return inspection.status === "valid" ? source : undefined;
}

function noContribution(value: Record<string, unknown>): RecordedNoBundleContribution | undefined {
  if (!hasExactKeys(value, ["status", "producer"]) || value.status !== "none") return undefined;
  const parsedProducer = producer(value.producer);
  return parsedProducer === undefined ? undefined : { status: "none", producer: parsedProducer };
}

function parseDefaultContribution(value: unknown): RecordedDefaultBundleContribution | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === "none") return noContribution(value);
  if (value.status !== "source" || !hasExactKeys(value, ["status", "producer", "source"])) {
    return undefined;
  }
  const parsedProducer = producer(value.producer);
  if (parsedProducer === undefined) return undefined;
  const source = defaultSource(value.source, parsedProducer);
  return source === undefined ? undefined : { status: "source", producer: parsedProducer, source };
}

function expectedIdentity(
  parsedProducer: TemplateProducer,
  revision: string,
  key: string,
  bundleId: string,
): string {
  return `template:${parsedProducer.source}:bundle:${parsedProducer.name}@${revision}:${key}#bundle:${bundleId}`;
}

function parseTask(
  value: unknown,
  parsedProducer: TemplateProducer,
  revision: string,
  bundleId: string,
): RecordedBundleAuthoringTask | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "identity",
      "key",
      "title",
      "acceptanceCriteria",
      "dependencyIdentities",
      "labels",
    ]) ||
    typeof value.key !== "string" ||
    !KEY.test(value.key) ||
    value.identity !== expectedIdentity(parsedProducer, revision, value.key, bundleId) ||
    typeof value.title !== "string" ||
    !isSafeMaterialisedAuthoringTaskText(value.title)
  ) {
    return undefined;
  }
  const acceptanceCriteria = stringList(value.acceptanceCriteria, false);
  const dependencyIdentities = stringList(value.dependencyIdentities);
  const labels = stringList(value.labels, false);
  const provenance: ProjectAuthoringTaskProvenance = {
    producer: parsedProducer,
    revision,
    key: value.key,
    bundleId,
  };
  const expectedLabels = templateTaskProvenanceLabels(provenance);
  if (
    acceptanceCriteria === undefined ||
    acceptanceCriteria.some((criterion) => !isSafeMaterialisedAuthoringTaskText(criterion)) ||
    dependencyIdentities === undefined ||
    new Set(dependencyIdentities).size !== dependencyIdentities.length ||
    labels === undefined ||
    labels.length !== expectedLabels.length ||
    labels.some((label, index) => label !== expectedLabels[index]) ||
    dependencyIdentities.some((identity) => !identity.endsWith(`#bundle:${bundleId}`))
  ) {
    return undefined;
  }
  return {
    identity: value.identity as string,
    key: value.key,
    title: value.title,
    acceptanceCriteria,
    dependencyIdentities,
    labels,
  };
}

function parseConcreteContribution(
  value: unknown,
  bundleId: string,
): RecordedConcreteBundleContribution | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === "none") return noContribution(value);
  if (
    value.status !== "tasks" ||
    !hasExactKeys(value, ["status", "producer", "revision", "tasks"]) ||
    typeof value.revision !== "string" ||
    !REVISION.test(value.revision) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length === 0
  ) {
    return undefined;
  }
  const parsedProducer = producer(value.producer);
  if (parsedProducer === undefined) return undefined;
  const tasks: RecordedBundleAuthoringTask[] = [];
  const identities = new Set<string>();
  const keys = new Set<string>();
  const titles = new Set<string>();
  for (const taskValue of value.tasks) {
    const task = parseTask(taskValue, parsedProducer, value.revision, bundleId);
    if (
      task === undefined ||
      identities.has(task.identity) ||
      keys.has(task.key) ||
      titles.has(task.title)
    ) {
      return undefined;
    }
    identities.add(task.identity);
    keys.add(task.key);
    titles.add(task.title);
    tasks.push(task);
  }
  return { status: "tasks", producer: parsedProducer, revision: value.revision, tasks };
}

function parseValue(value: unknown): BundleAuthoringContributions | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["schemaVersion", "defaultContribution", "bundles"]) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.bundles)
  ) {
    return undefined;
  }
  let parsedDefault: RecordedDefaultBundleSelection | null = null;
  if (value.defaultContribution !== null) {
    if (
      !isRecord(value.defaultContribution) ||
      !hasExactKeys(value.defaultContribution, ["scaffoldSha256", "contribution"]) ||
      typeof value.defaultContribution.scaffoldSha256 !== "string" ||
      !DIGEST.test(value.defaultContribution.scaffoldSha256)
    ) {
      return undefined;
    }
    const contribution = parseDefaultContribution(value.defaultContribution.contribution);
    if (contribution === undefined) return undefined;
    parsedDefault = {
      scaffoldSha256: value.defaultContribution.scaffoldSha256,
      contribution,
    };
  }
  const bundles: RecordedBundleContributionEntry[] = [];
  const recordedTitles = new Set<string>();
  let previous = "";
  for (const entry of value.bundles) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ["id", "contribution"]) ||
      typeof entry.id !== "string" ||
      !parseBundleId(entry.id).ok ||
      entry.id === RESERVED_DEFAULT_SCAFFOLD_ID ||
      entry.id <= previous
    ) {
      return undefined;
    }
    const contribution = parseConcreteContribution(entry.contribution, entry.id);
    if (contribution === undefined) return undefined;
    if (contribution.status === "tasks") {
      for (const task of contribution.tasks) {
        if (recordedTitles.has(task.title)) return undefined;
        recordedTitles.add(task.title);
      }
    }
    bundles.push({ id: entry.id, contribution });
    previous = entry.id;
  }
  return { schemaVersion: 1, defaultContribution: parsedDefault, bundles };
}

/** Empty version-1 record used when the first contribution is written into a legacy workspace. */
export function createEmptyBundleAuthoringContributions(): BundleAuthoringContributions {
  return { schemaVersion: 1, defaultContribution: null, bundles: [] };
}

/** Exact order-independent fingerprint binding one recorded default selection to its scaffold file tree. */
export function bundleContributionScaffoldSha256(files: readonly TemplateFile[]): string {
  return hashArtifactFiles(files).slice("sha256:".length);
}

/** Canonical newline-terminated JSON. Callers supply the producer-image order and the parser enforces it. */
export function serializeBundleAuthoringContributions(state: BundleAuthoringContributions): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** Strict parser: schema, relationships, canonical order, and exact producer bytes are all ownership evidence. */
export function parseBundleAuthoringContributions(
  text: string,
): BundleAuthoringContributionsParseResult {
  try {
    const value: unknown = JSON.parse(text);
    const parsed = parseValue(value);
    if (
      parsed === undefined ||
      JSON.stringify(value) !== JSON.stringify(parsed) ||
      text !== serializeBundleAuthoringContributions(parsed)
    ) {
      return {
        ok: false,
        reason: "bundle authoring contribution record is not exact canonical version-1 data",
      };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Freeze only the template-owned portion of one already-compiled concrete bundle plan. */
export function recordedConcreteContributionFromPlan(
  producer: TemplateProducer,
  bundleId: string,
  tasks: readonly PlannedProjectAuthoringTask[],
): RecordedConcreteBundleContribution {
  const owned = tasks.filter((task) => task.provenance?.bundleId === bundleId);
  if (owned.length === 0) return { status: "none", producer };
  const revision = owned[0]?.provenance?.revision;
  if (
    revision === undefined ||
    owned.some(
      (task) =>
        task.provenance === undefined ||
        task.provenance.revision !== revision ||
        JSON.stringify(task.provenance.producer) !== JSON.stringify(producer),
    )
  ) {
    throw new Error("concrete bundle plan does not have one coherent template producer revision");
  }
  return {
    status: "tasks",
    producer,
    revision,
    tasks: owned.map((task) => ({
      identity: task.identity,
      key: task.provenance?.key ?? "",
      title: task.title,
      acceptanceCriteria: [...task.acceptanceCriteria],
      dependencyIdentities: [...task.dependencyIdentities],
      labels: [...task.labels],
    })),
  };
}

/** Replace one bundle entry without discarding ownership for other bundle instances. */
export function withRecordedBundleContribution(
  state: BundleAuthoringContributions,
  entry: RecordedBundleContributionEntry,
): BundleAuthoringContributions {
  const bundles = state.bundles.filter(({ id }) => id !== entry.id).concat(entry);
  bundles.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return { ...state, bundles };
}
