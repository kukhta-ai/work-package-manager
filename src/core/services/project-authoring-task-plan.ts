import type { MandatoryAuthoringTask } from "../model/index.js";
import type {
  InspectedTemplateAuthoringTask,
  TemplateAuthoringTaskInspection,
  TemplateAuthoringTaskProblemCode,
  TemplateProducer,
} from "./template-authoring-tasks.js";

/** Reserved label that distinguishes WPM materialised template work from mandatory/user-authored tasks. */
export const TEMPLATE_TASK_LABEL = "wpm:template-task";

/** Exact provenance retained on a materialised template task independently of its displayed title. */
export interface ProjectAuthoringTaskProvenance {
  readonly producer: TemplateProducer;
  readonly revision: string;
  readonly key: string;
  /** Concrete bundle instance for a bundle-template task; absent for the selected project template. */
  readonly bundleId?: string;
}

/** One task in the complete, immutable fresh-init authoring plan. */
export interface PlannedProjectAuthoringTask {
  /** Operation-scoped identity used to resolve dependencies to actual Backlog IDs. */
  readonly identity: string;
  readonly title: string;
  readonly acceptanceCriteria: readonly string[];
  /** Stable plan identities, never Backlog IDs; the operation resolves these while applying the plan. */
  readonly dependencyIdentities: readonly string[];
  /** Exact Backlog labels. Mandatory tasks deliberately retain the historical empty label set. */
  readonly labels: readonly string[];
  /** Present only for template-defined work. */
  readonly provenance?: ProjectAuthoringTaskProvenance;
}

/** Machine-readable problem codes added while validating the complete multi-contribution init plan. */
export type ProjectAuthoringTaskPlanProblemCode =
  | TemplateAuthoringTaskProblemCode
  | "cyclic-dependency"
  | "dependency-unresolved"
  | "identity-collision"
  | "mandatory-task-invalid"
  | "rendered-title-collision";

/** One deterministic, contribution-aware complete-plan finding. */
export interface ProjectAuthoringTaskPlanProblem {
  readonly code: ProjectAuthoringTaskPlanProblemCode;
  readonly contribution: string;
  readonly path: string;
  readonly message: string;
}

interface ProjectContributionInput {
  readonly inspection: TemplateAuthoringTaskInspection;
  readonly mandatoryTasks: readonly MandatoryAuthoringTask[];
}

interface BundleContributionInput extends ProjectContributionInput {
  readonly id: string;
}

/** Inputs for one concrete bundle operation using the same identity/provenance contract as fresh init. */
export interface CompileBundleAuthoringTaskPlanInput extends BundleContributionInput {}

/** Inputs already captured by init LOAD: one project contribution and each concrete pre-included bundle. */
export interface CompileProjectAuthoringTaskPlanInput {
  readonly project: ProjectContributionInput;
  readonly bundles: readonly BundleContributionInput[];
}

/** The pure compiler exposes no tasks when any applicable contribution or combined-plan fact is invalid. */
export type ProjectAuthoringTaskPlanResult =
  | {
      readonly ok: true;
      readonly tasks: readonly PlannedProjectAuthoringTask[];
      readonly problems: readonly [];
    }
  | {
      readonly ok: false;
      readonly tasks: readonly [];
      readonly problems: readonly ProjectAuthoringTaskPlanProblem[];
    };

/** The single-bundle compiler has the same aggregate result contract as the complete fresh-init compiler. */
export type BundleAuthoringTaskPlanResult = ProjectAuthoringTaskPlanResult;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function bundleIdentity(identity: string, bundleId: string): string {
  return `${identity}#bundle:${bundleId}`;
}

function inspectionContribution(
  inspection: TemplateAuthoringTaskInspection,
  bundleId?: string,
): string {
  const revision = inspection.revision ?? "<invalid-revision>";
  const base = `template:${inspection.producer.source}:${inspection.producer.scope}:${inspection.producer.name}@${revision}`;
  return bundleId === undefined ? base : bundleIdentity(base, bundleId);
}

/**
 * Encode template origin/revision/key as a closed, deterministic Backlog-visible label set.
 *
 * Values come from the strict Story 3.1 producer/revision/key grammars, so none can contain commas or
 * ambiguous path/native syntax. The optional bundle label scopes repeated use of one bundle producer.
 */
export function templateTaskProvenanceLabels(
  provenance: ProjectAuthoringTaskProvenance,
): readonly string[] {
  const labels = [
    TEMPLATE_TASK_LABEL,
    `wpm:template-origin:${provenance.producer.source}:${provenance.producer.scope}:${provenance.producer.name}`,
    `wpm:template-revision:${provenance.revision}`,
    `wpm:template-key:${provenance.key}`,
  ];
  if (provenance.bundleId !== undefined) labels.push(`wpm:bundle:${provenance.bundleId}`);
  return labels;
}

function addInspectionProblems(
  inspection: TemplateAuthoringTaskInspection,
  contribution: string,
  problems: ProjectAuthoringTaskPlanProblem[],
): void {
  if (inspection.status !== "invalid") return;
  for (const problem of inspection.problems) {
    problems.push({
      code: problem.code,
      contribution,
      path: problem.path,
      message: problem.message,
    });
  }
}

function mandatoryTasks(
  catalog: readonly MandatoryAuthoringTask[],
  contribution: string,
  bundleId: string | undefined,
  problems: ProjectAuthoringTaskPlanProblem[],
): PlannedProjectAuthoringTask[] {
  const tasks: PlannedProjectAuthoringTask[] = [];
  for (const [index, task] of catalog.entries()) {
    const path = `mandatory[${index}]`;
    if (
      task.reference.trim().length === 0 ||
      task.title.trim().length === 0 ||
      task.acceptanceCriteria.length === 0 ||
      task.acceptanceCriteria.some((criterion) => criterion.trim().length === 0)
    ) {
      problems.push({
        code: "mandatory-task-invalid",
        contribution,
        path,
        message: `${path} must have a stable reference, non-empty title, and observable acceptance criteria`,
      });
    }
    tasks.push({
      identity: bundleId === undefined ? task.reference : bundleIdentity(task.reference, bundleId),
      title: task.title,
      acceptanceCriteria: [...task.acceptanceCriteria],
      dependencyIdentities: [],
      labels: [],
    });
  }
  return tasks;
}

function plannedTemplateTask(
  task: InspectedTemplateAuthoringTask,
  inspection: Extract<TemplateAuthoringTaskInspection, { readonly status: "valid" }>,
  bundleId?: string,
): PlannedProjectAuthoringTask {
  const provenance: ProjectAuthoringTaskProvenance = {
    producer: inspection.producer,
    revision: inspection.revision,
    key: task.key,
    ...(bundleId !== undefined ? { bundleId } : {}),
  };
  const scopeIdentity = (identity: string): string =>
    bundleId === undefined ? identity : bundleIdentity(identity, bundleId);
  return {
    identity: scopeIdentity(task.identity),
    title: task.title,
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencyIdentities: task.dependencies.map(({ reference, resolvedIdentity }) =>
      reference.startsWith("self:") ? scopeIdentity(resolvedIdentity) : scopeIdentity(reference),
    ),
    labels: templateTaskProvenanceLabels(provenance),
    provenance,
  };
}

function stableTopologicalPack(
  inspection: Extract<TemplateAuthoringTaskInspection, { readonly status: "valid" }>,
  contribution: string,
  bundleId: string | undefined,
  problems: ProjectAuthoringTaskPlanProblem[],
): PlannedProjectAuthoringTask[] {
  const planned = inspection.tasks.map((task) => plannedTemplateTask(task, inspection, bundleId));
  const indexByIdentity = new Map(planned.map(({ identity }, index) => [identity, index]));
  const indegrees = new Uint32Array(planned.length);
  const dependents = Array.from({ length: planned.length }, () => [] as number[]);
  for (const [index, task] of planned.entries()) {
    for (const dependency of task.dependencyIdentities) {
      const dependencyIndex = indexByIdentity.get(dependency);
      if (dependencyIndex === undefined) continue;
      indegrees[index] = (indegrees[index] ?? 0) + 1;
      dependents[dependencyIndex]?.push(index);
    }
  }

  // A binary min-heap preserves the original declaration-index tie break without repeatedly scanning and
  // splicing the remaining graph. The join therefore retains Story 3.1's iterative deep-graph safety.
  const ready: number[] = [];
  const pushReady = (index: number): void => {
    ready.push(index);
    let cursor = ready.length - 1;
    while (cursor > 0) {
      const parent = Math.floor((cursor - 1) / 2);
      const parentValue = ready[parent];
      if (parentValue === undefined || parentValue <= index) break;
      ready[cursor] = parentValue;
      cursor = parent;
    }
    ready[cursor] = index;
  };
  const popReady = (): number | undefined => {
    const first = ready[0];
    const last = ready.pop();
    if (first === undefined || last === undefined || ready.length === 0) return first;
    let cursor = 0;
    while (true) {
      const left = cursor * 2 + 1;
      if (left >= ready.length) break;
      const right = left + 1;
      const leftValue = ready[left];
      const rightValue = ready[right];
      if (leftValue === undefined) break;
      const child = rightValue !== undefined && rightValue < leftValue ? right : left;
      const childValue = ready[child];
      if (childValue === undefined || childValue >= last) break;
      ready[cursor] = childValue;
      cursor = child;
    }
    ready[cursor] = last;
    return first;
  };
  for (let index = 0; index < indegrees.length; index += 1) {
    if (indegrees[index] === 0) pushReady(index);
  }

  const emitted = new Set<number>();
  const ordered: PlannedProjectAuthoringTask[] = [];
  for (let nextIndex = popReady(); nextIndex !== undefined; nextIndex = popReady()) {
    const next = planned[nextIndex];
    if (next === undefined) continue;
    ordered.push(next);
    emitted.add(nextIndex);
    for (const dependent of dependents[nextIndex] ?? []) {
      const remaining = (indegrees[dependent] ?? 0) - 1;
      indegrees[dependent] = remaining;
      if (remaining === 0) pushReady(dependent);
    }
  }
  if (ordered.length !== planned.length) {
    problems.push({
      code: "cyclic-dependency",
      contribution,
      path: "authoring-tasks",
      message: "the concrete contribution has no deterministic dependency-first task order",
    });
    // Retain declaration order only to discover independent combined-plan collisions below. An invalid
    // result never exposes these tasks to an operation.
    ordered.push(...planned.filter((_, index) => !emitted.has(index)));
  }
  return ordered;
}

function contributionForTask(task: PlannedProjectAuthoringTask): string {
  if (task.provenance === undefined) {
    return task.identity.includes("#bundle:")
      ? `mandatory:bundle:${task.identity.slice(task.identity.lastIndexOf("#bundle:") + 8)}`
      : "mandatory:project";
  }
  const base = `template:${task.provenance.producer.source}:${task.provenance.producer.scope}:${task.provenance.producer.name}@${task.provenance.revision}`;
  return task.provenance.bundleId === undefined
    ? base
    : bundleIdentity(base, task.provenance.bundleId);
}

function validateCombinedPlan(
  tasks: readonly PlannedProjectAuthoringTask[],
  problems: ProjectAuthoringTaskPlanProblem[],
): void {
  const byIdentity = new Map<string, PlannedProjectAuthoringTask>();
  const byTitle = new Map<string, PlannedProjectAuthoringTask>();
  for (const [index, task] of tasks.entries()) {
    const contribution = contributionForTask(task);
    const identityOwner = byIdentity.get(task.identity);
    if (identityOwner !== undefined) {
      problems.push({
        code: "identity-collision",
        contribution,
        path: `tasks[${index}].identity`,
        message: `planned identity ${JSON.stringify(task.identity)} is also owned by ${JSON.stringify(contributionForTask(identityOwner))}`,
      });
    } else {
      byIdentity.set(task.identity, task);
    }
    const titleOwner = byTitle.get(task.title);
    if (titleOwner !== undefined) {
      problems.push({
        code: "rendered-title-collision",
        contribution,
        path: `tasks[${index}].title`,
        message: `rendered title ${JSON.stringify(task.title)} is also owned by ${JSON.stringify(contributionForTask(titleOwner))}`,
      });
    } else {
      byTitle.set(task.title, task);
    }
  }

  const knownIdentities = new Set(tasks.map(({ identity }) => identity));
  for (const [index, task] of tasks.entries()) {
    for (const [dependencyIndex, dependency] of task.dependencyIdentities.entries()) {
      if (knownIdentities.has(dependency)) continue;
      problems.push({
        code: "dependency-unresolved",
        contribution: contributionForTask(task),
        path: `tasks[${index}].dependencies[${dependencyIndex}]`,
        message: `planned dependency identity ${JSON.stringify(dependency)} is unavailable`,
      });
    }
  }
}

/** Compile one concrete bundle plan without fabricating an empty project contribution. */
export function compileBundleAuthoringTaskPlan(
  input: CompileBundleAuthoringTaskPlanInput,
): BundleAuthoringTaskPlanResult {
  const problems: ProjectAuthoringTaskPlanProblem[] = [];
  const mandatoryContribution = `mandatory:bundle:${input.id}`;
  const tasks = mandatoryTasks(input.mandatoryTasks, mandatoryContribution, input.id, problems);
  const contribution = inspectionContribution(input.inspection, input.id);
  addInspectionProblems(input.inspection, contribution, problems);
  if (input.inspection.status === "valid") {
    tasks.push(...stableTopologicalPack(input.inspection, contribution, input.id, problems));
  }
  validateCombinedPlan(tasks, problems);
  problems.sort(
    (left, right) =>
      compareCodeUnits(left.contribution, right.contribution) ||
      compareCodeUnits(left.path, right.path) ||
      compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.message, right.message),
  );
  return problems.length > 0
    ? { ok: false, tasks: [], problems }
    : { ok: true, tasks, problems: [] };
}

/**
 * Compile the complete fresh-workspace authoring task plan from already-inspected concrete contributions.
 *
 * Mandatory bytes/order remain unchanged, additional tasks are dependency-first with declaration-order
 * tie-breaking, and every contribution/combined-plan finding is aggregated before a valid plan is exposed.
 */
export function compileProjectAuthoringTaskPlan(
  input: CompileProjectAuthoringTaskPlanInput,
): ProjectAuthoringTaskPlanResult {
  const problems: ProjectAuthoringTaskPlanProblem[] = [];
  const tasks: PlannedProjectAuthoringTask[] = [];

  const projectContribution = inspectionContribution(input.project.inspection);
  tasks.push(
    ...mandatoryTasks(input.project.mandatoryTasks, "mandatory:project", undefined, problems),
  );
  addInspectionProblems(input.project.inspection, projectContribution, problems);
  if (input.project.inspection.status === "valid") {
    tasks.push(
      ...stableTopologicalPack(input.project.inspection, projectContribution, undefined, problems),
    );
  }

  for (const bundle of input.bundles) {
    const mandatoryContribution = `mandatory:bundle:${bundle.id}`;
    tasks.push(
      ...mandatoryTasks(bundle.mandatoryTasks, mandatoryContribution, bundle.id, problems),
    );
    const contribution = inspectionContribution(bundle.inspection, bundle.id);
    addInspectionProblems(bundle.inspection, contribution, problems);
    if (bundle.inspection.status === "valid") {
      tasks.push(...stableTopologicalPack(bundle.inspection, contribution, bundle.id, problems));
    }
  }

  validateCombinedPlan(tasks, problems);

  problems.sort(
    (left, right) =>
      compareCodeUnits(left.contribution, right.contribution) ||
      compareCodeUnits(left.path, right.path) ||
      compareCodeUnits(left.code, right.code) ||
      compareCodeUnits(left.message, right.message),
  );
  return problems.length > 0
    ? { ok: false, tasks: [], problems }
    : { ok: true, tasks, problems: [] };
}
