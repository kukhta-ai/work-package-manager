import { type MandatoryAuthoringTask, parseBundleId } from "../model/index.js";
import type { TaskRecord } from "../ports/index.js";
import type { RecordedConcreteBundleContribution } from "./bundle-authoring-contributions.js";
import {
  type BundleAuthoringTaskPlanResult,
  type CompileBundleAuthoringTaskPlanInput,
  compileBundleAuthoringTaskPlan,
  type PlannedProjectAuthoringTask,
  type ProjectAuthoringTaskPlanProblem,
  TEMPLATE_TASK_LABEL,
} from "./project-authoring-task-plan.js";

export type { BundleAuthoringTaskPlanResult, CompileBundleAuthoringTaskPlanInput };
export { compileBundleAuthoringTaskPlan };

/**
 * Stable bundle references a template contribution may depend on regardless of command options.
 *
 * The advisor task is deliberately absent: it is conditional (`--no-advisor`) and therefore cannot be a
 * durable producer dependency even when one particular materialisation happens to include it.
 */
export const UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES = [
  "wpm:bundle:plan",
  "wpm:bundle:fill-install-backlog",
  "wpm:bundle:author-payload",
  "wpm:bundle:scaffold-payload-skill",
  "wpm:bundle:verify-step-slugs",
  "wpm:bundle:verify-dod",
  "wpm:bundle:verify-payload-references",
  "wpm:bundle:verify-skill-registration",
  "wpm:bundle:verify-version-constraints",
  "wpm:bundle:review-install-backlog-independence",
  "wpm:bundle:simulate-fresh-install",
] as const;

const UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCE_SET = new Set<string>(
  UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCES,
);

export type BundleAuthoringReconciliationProblemCode =
  | "duplicate-existing-ownership"
  | "existing-definition-mismatch"
  | "existing-dependency-mismatch"
  | "existing-dependent-missing-dependency"
  | "foreign-title-ownership"
  | "malformed-template-ownership";

export interface BundleAuthoringReconciliationProblem {
  readonly code: BundleAuthoringReconciliationProblemCode;
  readonly taskId: string;
  readonly message: string;
}

export interface PreservedBundleAuthoringTask {
  readonly identity: string;
  readonly id: string;
  readonly task: PlannedProjectAuthoringTask;
  readonly record: TaskRecord;
}

export interface MissingBundleAuthoringTask {
  readonly task: PlannedProjectAuthoringTask;
}

export type BundleAuthoringReconciliationResult =
  | {
      readonly ok: true;
      readonly preserved: readonly PreservedBundleAuthoringTask[];
      readonly missing: readonly MissingBundleAuthoringTask[];
      readonly problems: readonly [];
    }
  | {
      readonly ok: false;
      /** Independently observed exact matches remain useful for complete read-only preflight reporting. */
      readonly preserved: readonly PreservedBundleAuthoringTask[];
      /** Planned identities with no active owner, even when another active record is invalid. */
      readonly missing: readonly MissingBundleAuthoringTask[];
      readonly problems: readonly BundleAuthoringReconciliationProblem[];
    };

const RESERVED_LABEL =
  /^(?:wpm:template-task|wpm:template-origin:|wpm:template-revision:|wpm:template-key:|wpm:bundle:)/;
const TEMPLATE_ORIGIN =
  /^wpm:template-origin:(?:built-in|project-local):(project|bundle):[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TEMPLATE_REVISION = /^wpm:template-revision:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const TEMPLATE_KEY = /^wpm:template-key:[a-z0-9]+(?:-[a-z0-9]+)*$/;

function bundleScopeId(label: string): string | undefined {
  if (!label.startsWith("wpm:bundle:")) return undefined;
  const id = label.slice("wpm:bundle:".length);
  return parseBundleId(id).ok ? id : undefined;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function reservedLabels(labels: readonly string[]): readonly string[] {
  return labels.filter((label) => RESERVED_LABEL.test(label));
}

function wellFormedTemplateOwnership(labels: readonly string[]): boolean {
  if (
    labels[0] !== TEMPLATE_TASK_LABEL ||
    labels.length < 4 ||
    labels.length > 5 ||
    !TEMPLATE_ORIGIN.test(labels[1] ?? "") ||
    !TEMPLATE_REVISION.test(labels[2] ?? "") ||
    !TEMPLATE_KEY.test(labels[3] ?? "")
  ) {
    return false;
  }
  const scope = TEMPLATE_ORIGIN.exec(labels[1] ?? "")?.[1];
  return scope === "bundle"
    ? labels.length === 5 && bundleScopeId(labels[4] ?? "") !== undefined
    : labels.length === 4;
}

function templateOwnershipScope(
  labels: readonly string[],
): { readonly scope: "project" } | { readonly scope: "bundle"; readonly bundleId: string } {
  const scope = TEMPLATE_ORIGIN.exec(labels[1] ?? "")?.[1];
  if (scope === "bundle") {
    return { scope, bundleId: (labels[4] ?? "").slice("wpm:bundle:".length) };
  }
  return { scope: "project" };
}

function plannedBundleIds(tasks: readonly PlannedProjectAuthoringTask[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.provenance?.bundleId !== undefined) {
      ids.add(task.provenance.bundleId);
      continue;
    }
    const marker = task.identity.lastIndexOf("#bundle:");
    if (marker >= 0) ids.add(task.identity.slice(marker + "#bundle:".length));
  }
  return ids;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function acceptanceText(record: TaskRecord): readonly string[] {
  return record.acceptanceCriteria.map(({ text }) => text);
}

function issue(
  problems: BundleAuthoringReconciliationProblem[],
  code: BundleAuthoringReconciliationProblemCode,
  record: Pick<TaskRecord, "id">,
  message: string,
): void {
  problems.push({ code, taskId: record.id, message });
}

/**
 * Compare one complete concrete bundle plan with active Backlog records without changing human-owned state.
 *
 * Mandatory records retain the historical exact-title/definition identity. Template records are recognized
 * only through their complete reserved provenance label set. Status, checked boxes, notes, extra sections,
 * metadata, DoD and unrelated labels are deliberately outside WPM ownership and are not compared.
 */
export function reconcileBundleAuthoringTaskPlan(input: {
  readonly tasks: readonly PlannedProjectAuthoringTask[];
  readonly records: readonly TaskRecord[];
}): BundleAuthoringReconciliationResult {
  const problems: BundleAuthoringReconciliationProblem[] = [];
  const templateByLabels = new Map<string, PlannedProjectAuthoringTask>();
  const mandatoryByTitle = new Map<string, PlannedProjectAuthoringTask>();
  const plannedByTitle = new Map(input.tasks.map((task) => [task.title, task]));
  const currentBundleIds = plannedBundleIds(input.tasks);
  for (const task of input.tasks) {
    if (task.labels.includes(TEMPLATE_TASK_LABEL)) {
      templateByLabels.set(task.labels.join("\u0000"), task);
    } else {
      mandatoryByTitle.set(task.title, task);
    }
  }

  const matched = new Map<string, TaskRecord>();
  for (const record of input.records) {
    const ownedLabels = reservedLabels(record.labels);
    let task: PlannedProjectAuthoringTask | undefined;
    if (ownedLabels.length > 0) {
      if (!wellFormedTemplateOwnership(ownedLabels)) {
        issue(
          problems,
          "malformed-template-ownership",
          record,
          `task ${record.id} has an incomplete, unknown, or noncanonical WPM template ownership label set`,
        );
        continue;
      }
      task = templateByLabels.get(ownedLabels.join("\u0000"));
      if (task === undefined) {
        const ownership = templateOwnershipScope(ownedLabels);
        if (ownership.scope === "bundle" && currentBundleIds.has(ownership.bundleId)) {
          issue(
            problems,
            "malformed-template-ownership",
            record,
            `task ${record.id} has well-formed WPM ownership for bundle ${JSON.stringify(ownership.bundleId)}, but that ownership is absent from the recorded contribution`,
          );
        } else if (plannedByTitle.has(record.title)) {
          issue(
            problems,
            "foreign-title-ownership",
            record,
            `task ${record.id} owns planned title ${JSON.stringify(record.title)} for another WPM contribution`,
          );
        }
        continue;
      }
    } else {
      task = mandatoryByTitle.get(record.title);
      if (task === undefined && plannedByTitle.has(record.title)) {
        issue(
          problems,
          "foreign-title-ownership",
          record,
          `task ${record.id} owns planned title ${JSON.stringify(record.title)} without its exact WPM provenance`,
        );
        continue;
      }
    }
    if (task === undefined) continue;
    if (matched.has(task.identity)) {
      issue(
        problems,
        "duplicate-existing-ownership",
        record,
        `multiple active tasks claim planned identity ${JSON.stringify(task.identity)}`,
      );
      continue;
    }
    matched.set(task.identity, record);
    if (
      record.title !== task.title ||
      !sameStrings(acceptanceText(record), task.acceptanceCriteria)
    ) {
      issue(
        problems,
        "existing-definition-mismatch",
        record,
        `task ${record.id} does not match the recorded title and acceptance definition for ${JSON.stringify(task.identity)}`,
      );
    }
  }

  for (const task of input.tasks) {
    const record = matched.get(task.identity);
    if (record === undefined) continue;
    const expected: string[] = [];
    let unavailable = false;
    for (const dependency of task.dependencyIdentities) {
      const dependencyRecord = matched.get(dependency);
      if (dependencyRecord === undefined) {
        unavailable = true;
        issue(
          problems,
          "existing-dependent-missing-dependency",
          record,
          `existing task ${record.id} depends on planned identity ${JSON.stringify(dependency)}, which is not yet materialised`,
        );
      } else {
        expected.push(dependencyRecord.id);
      }
    }
    if (!unavailable && !sameStrings(record.dependencies, expected)) {
      issue(
        problems,
        "existing-dependency-mismatch",
        record,
        `task ${record.id} dependencies do not match the recorded contribution`,
      );
    }
  }

  problems.sort(
    (left, right) =>
      compareCodeUnits(left.taskId, right.taskId) ||
      compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.message, right.message),
  );
  const preserved = input.tasks
    .filter((task) => matched.has(task.identity))
    .map((task) => ({
      identity: task.identity,
      id: matched.get(task.identity)?.id ?? "",
      task,
      record: matched.get(task.identity) as TaskRecord,
    }));
  const missing = input.tasks
    .filter((task) => !matched.has(task.identity))
    .map((task) => ({ task }));
  return problems.length > 0
    ? { ok: false, preserved, missing, problems }
    : { ok: true, preserved, missing, problems: [] };
}

/** Convert compiler findings into the same deterministic contribution-aware shape for operation preflight. */
export function bundlePlanProblems(
  result: BundleAuthoringTaskPlanResult,
): readonly ProjectAuthoringTaskPlanProblem[] {
  return result.ok ? [] : result.problems;
}

/** Rehydrate a strictly parsed concrete contribution without consulting its original template source. */
export function compileRecordedBundleAuthoringTaskPlan(input: {
  readonly id: string;
  readonly mandatoryTasks: readonly MandatoryAuthoringTask[];
  readonly contribution: RecordedConcreteBundleContribution;
}): BundleAuthoringTaskPlanResult {
  const mandatoryOnly = compileBundleAuthoringTaskPlan({
    id: input.id,
    mandatoryTasks: input.mandatoryTasks,
    inspection: {
      status: "none",
      producer: input.contribution.producer,
      materialisationScope: "bundle-creation-or-enablement",
      mode: "additional",
      revision: undefined,
      tasks: [],
      problems: [],
    },
  });
  if (!mandatoryOnly.ok || input.contribution.status === "none") return mandatoryOnly;

  const revision = input.contribution.revision;
  const templateTasks: PlannedProjectAuthoringTask[] = input.contribution.tasks.map((task) => ({
    identity: task.identity,
    title: task.title,
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencyIdentities: [...task.dependencyIdentities],
    labels: [...task.labels],
    provenance: {
      producer: input.contribution.producer,
      revision,
      key: task.key,
      bundleId: input.id,
    },
  }));
  const tasks = [...mandatoryOnly.tasks, ...templateTasks];
  const identities = new Set<string>();
  const titles = new Set<string>();
  const problems: ProjectAuthoringTaskPlanProblem[] = [];
  for (const [index, task] of tasks.entries()) {
    const contribution =
      task.provenance === undefined
        ? `mandatory:bundle:${input.id}`
        : `template:${task.provenance.producer.source}:bundle:${task.provenance.producer.name}@${task.provenance.revision}#bundle:${input.id}`;
    if (identities.has(task.identity)) {
      problems.push({
        code: "identity-collision",
        contribution,
        path: `tasks[${index}].identity`,
        message: `recorded identity ${JSON.stringify(task.identity)} is duplicated`,
      });
    }
    if (titles.has(task.title)) {
      problems.push({
        code: "rendered-title-collision",
        contribution,
        path: `tasks[${index}].title`,
        message: `recorded title ${JSON.stringify(task.title)} is duplicated`,
      });
    }
    identities.add(task.identity);
    titles.add(task.title);
  }
  for (const [index, task] of tasks.entries()) {
    for (const [dependencyIndex, dependency] of task.dependencyIdentities.entries()) {
      const bundleSuffix = `#bundle:${input.id}`;
      const unscopedDependency = dependency.endsWith(bundleSuffix)
        ? dependency.slice(0, -bundleSuffix.length)
        : dependency;
      if (
        task.provenance !== undefined &&
        unscopedDependency.startsWith("wpm:bundle:") &&
        !UNCONDITIONAL_BUNDLE_MANDATORY_REFERENCE_SET.has(unscopedDependency)
      ) {
        problems.push({
          code: "dependency-unresolved",
          contribution: `recorded:bundle:${input.id}`,
          path: `tasks[${index}].dependencies[${dependencyIndex}]`,
          message: `recorded dependency identity ${JSON.stringify(dependency)} is not an unconditional bundle mandatory reference`,
        });
        continue;
      }
      if (identities.has(dependency)) continue;
      problems.push({
        code: "dependency-unresolved",
        contribution: `recorded:bundle:${input.id}`,
        path: `tasks[${index}].dependencies[${dependencyIndex}]`,
        message: `recorded dependency identity ${JSON.stringify(dependency)} is unavailable`,
      });
    }
  }
  const indexByIdentity = new Map(tasks.map(({ identity }, index) => [identity, index]));
  const indegrees = new Uint32Array(tasks.length);
  const dependents = Array.from({ length: tasks.length }, () => [] as number[]);
  for (const [index, task] of tasks.entries()) {
    for (const dependency of task.dependencyIdentities) {
      const dependencyIndex = indexByIdentity.get(dependency);
      if (dependencyIndex === undefined) continue;
      indegrees[index] = (indegrees[index] ?? 0) + 1;
      dependents[dependencyIndex]?.push(index);
    }
  }
  const ready: number[] = [];
  const pushReady = (index: number): void => {
    ready.push(index);
    let cursor = ready.length - 1;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      if ((ready[parent] ?? 0) <= (ready[cursor] ?? 0)) break;
      [ready[parent], ready[cursor]] = [ready[cursor] ?? 0, ready[parent] ?? 0];
      cursor = parent;
    }
  };
  const popReady = (): number | undefined => {
    const first = ready[0];
    const last = ready.pop();
    if (first === undefined || last === undefined || ready.length === 0) return first;
    ready[0] = last;
    let cursor = 0;
    while (true) {
      const left = cursor * 2 + 1;
      const right = left + 1;
      let smallest = cursor;
      if (left < ready.length && (ready[left] ?? 0) < (ready[smallest] ?? 0)) smallest = left;
      if (right < ready.length && (ready[right] ?? 0) < (ready[smallest] ?? 0)) smallest = right;
      if (smallest === cursor) break;
      [ready[cursor], ready[smallest]] = [ready[smallest] ?? 0, ready[cursor] ?? 0];
      cursor = smallest;
    }
    return first;
  };
  for (let index = 0; index < tasks.length; index += 1) {
    if (indegrees[index] === 0) pushReady(index);
  }
  const ordered: PlannedProjectAuthoringTask[] = [];
  while (ready.length > 0) {
    const index = popReady();
    if (index === undefined) break;
    const task = tasks[index];
    if (task !== undefined) ordered.push(task);
    for (const dependent of dependents[index] ?? []) {
      indegrees[dependent] = (indegrees[dependent] ?? 1) - 1;
      if (indegrees[dependent] === 0) pushReady(dependent);
    }
  }
  if (ordered.length !== tasks.length) {
    problems.push({
      code: "cyclic-dependency",
      contribution: `recorded:bundle:${input.id}`,
      path: "tasks",
      message: "recorded bundle contribution contains a cyclic dependency",
    });
  }
  return problems.length > 0
    ? { ok: false, tasks: [], problems }
    : { ok: true, tasks: ordered, problems: [] };
}
