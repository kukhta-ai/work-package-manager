import type { MandatoryAuthoringTask, Template, TemplateScope } from "../model/index.js";

/** Where a resolved template producer came from. Project-local templates shadow built-ins at resolution. */
export type TemplateProducerSource = "built-in" | "project-local";

/** Stable producer identity used to scope otherwise-local task keys. */
export interface TemplateProducer {
  readonly source: TemplateProducerSource;
  readonly scope: TemplateScope;
  readonly name: string;
}

/** The operation family where a contribution can later be materialised. */
export type TemplateAuthoringTaskMaterialisationScope =
  | "project-initialization"
  | "bundle-creation-or-enablement";

/** Machine-distinguishable problem categories returned by aggregate inspection. */
export type TemplateAuthoringTaskProblemCode =
  | "acceptance-criteria-empty"
  | "acceptance-criteria-not-list"
  | "acceptance-criterion-invalid"
  | "cyclic-dependency"
  | "dependency-invalid"
  | "dependencies-not-list"
  | "duplicate-dependency"
  | "duplicate-key"
  | "key-invalid"
  | "mandatory-title-collision"
  | "producer-identity-mismatch"
  | "rendered-title-collision"
  | "revision-invalid"
  | "task-not-mapping"
  | "tasks-not-list"
  | "title-invalid"
  | "unsafe-text"
  | "unavailable-context"
  | "unresolved-dependency"
  | "unsupported-context"
  | "unsupported-field"
  | "unsupported-yaml-content";

/** One deterministic finding about an inert contribution. */
export interface TemplateAuthoringTaskProblem {
  readonly code: TemplateAuthoringTaskProblemCode;
  readonly path: string;
  readonly message: string;
}

/** A dependency resolved to either a producer-scoped task identity or a mandatory stable reference. */
export interface ResolvedTemplateAuthoringTaskDependency {
  readonly reference: string;
  readonly resolvedIdentity: string;
}

/** One fully validated, symbolically rendered task exposed by template inspection. */
export interface InspectedTemplateAuthoringTask {
  readonly identity: string;
  readonly key: string;
  readonly title: string;
  readonly acceptanceCriteria: readonly string[];
  readonly dependencies: readonly ResolvedTemplateAuthoringTaskDependency[];
  readonly contextKeys: readonly string[];
}

interface TemplateAuthoringTaskInspectionBase {
  readonly producer: TemplateProducer;
  readonly materialisationScope: TemplateAuthoringTaskMaterialisationScope;
  readonly mode: "additional";
}

/**
 * Aggregate read-only result for an optional template authoring-task contribution. The discriminant prevents
 * invalid declaration bytes from being consumed as compiled tasks.
 */
export type TemplateAuthoringTaskInspection =
  | (TemplateAuthoringTaskInspectionBase & {
      readonly status: "none";
      readonly revision: undefined;
      readonly tasks: readonly [];
      readonly problems: readonly [];
    })
  | (TemplateAuthoringTaskInspectionBase & {
      readonly status: "valid";
      readonly revision: string;
      readonly tasks: readonly InspectedTemplateAuthoringTask[];
      readonly problems: readonly [];
    })
  | (TemplateAuthoringTaskInspectionBase & {
      readonly status: "invalid";
      readonly revision: string | undefined;
      readonly tasks: readonly [];
      readonly problems: readonly TemplateAuthoringTaskProblem[];
    });

/** Inputs to the pure contribution inspector. */
export interface InspectTemplateAuthoringTasksInput {
  readonly template: Template;
  readonly producer: TemplateProducer;
  readonly mandatoryTasks: readonly MandatoryAuthoringTask[];
  /** Optional concrete WPM context supplied by later operation-specific preflights. */
  readonly context?: Readonly<Record<string, string>>;
}

interface ParsedTask {
  readonly index: number;
  readonly key?: string;
  readonly title?: string;
  readonly acceptanceCriteria: readonly string[];
  readonly dependencies: readonly string[];
  readonly contextKeys: readonly string[];
}

const REVISION = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const LOCAL_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTEXT_TOKEN = /\{\{([^{}]+)\}\}/g;
const TASK_FIELDS = new Set(["key", "title", "acceptance-criteria", "depends-on"]);

const SYMBOLIC_CONTEXT: Readonly<Record<string, string>> = {
  "wpm.project.name": "<project-name>",
  "wpm.bundle.id": "<bundle-id>",
  "wpm.bundle.version": "<bundle-version>",
};

const CONTEXT_BY_SCOPE: Readonly<Record<TemplateScope, ReadonlySet<string>>> = {
  project: new Set(["wpm.project.name"]),
  bundle: new Set(["wpm.project.name", "wpm.bundle.id", "wpm.bundle.version"]),
};
const TERMINAL_FORMAT_CHARACTER = /\p{Cf}/u;

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasUnsafeText(text: string): boolean {
  for (const character of text) {
    const codePoint = character.codePointAt(0) as number;
    if (
      codePoint < 32 ||
      (codePoint >= 127 && codePoint <= 159) ||
      character === "\u2028" ||
      character === "\u2029" ||
      TERMINAL_FORMAT_CHARACTER.test(character) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return true;
    }
  }
  return false;
}

/** Whether one already-rendered task text is safe to retain and materialise without parsing context again. */
export function isSafeMaterialisedAuthoringTaskText(text: string): boolean {
  return (
    text.length > 0 &&
    text === text.trim() &&
    !hasUnsafeText(text) &&
    !text.includes("{{") &&
    !text.includes("}}")
  );
}

function issue(
  problems: TemplateAuthoringTaskProblem[],
  code: TemplateAuthoringTaskProblemCode,
  path: string,
  message: string,
): void {
  problems.push({ code, path, message });
}

function materialisationScope(scope: TemplateScope): TemplateAuthoringTaskMaterialisationScope {
  return scope === "project" ? "project-initialization" : "bundle-creation-or-enablement";
}

function producerIdentity(producer: TemplateProducer, revision: string, key: string): string {
  return `template:${producer.source}:${producer.scope}:${producer.name}@${revision}:${key}`;
}

function renderText(
  text: string,
  path: string,
  scope: TemplateScope,
  context: Readonly<Record<string, string>> | undefined,
  problems: TemplateAuthoringTaskProblem[],
): { readonly text: string; readonly contextKeys: readonly string[] } {
  const keys = new Set<string>();
  const allowed = CONTEXT_BY_SCOPE[scope];
  const rendered = text.replace(CONTEXT_TOKEN, (whole, rawKey: string) => {
    const key = rawKey.trim();
    if (key !== rawKey || !(key in SYMBOLIC_CONTEXT)) {
      issue(
        problems,
        "unsupported-context",
        path,
        `unsupported authoring-task context expression ${JSON.stringify(whole)}`,
      );
      return whole;
    }
    if (!allowed.has(key)) {
      issue(
        problems,
        "unavailable-context",
        path,
        `context ${JSON.stringify(key)} is unavailable to ${scope} templates`,
      );
      return whole;
    }
    keys.add(key);
    if (context !== undefined) {
      if (!Object.hasOwn(context, key)) {
        issue(
          problems,
          "unavailable-context",
          path,
          `required context ${JSON.stringify(key)} was not supplied`,
        );
        return SYMBOLIC_CONTEXT[key] ?? whole;
      }
      const value = context[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        issue(
          problems,
          "unavailable-context",
          path,
          `required context ${JSON.stringify(key)} must be a non-empty string`,
        );
        return SYMBOLIC_CONTEXT[key] ?? whole;
      }
      if (hasUnsafeText(value)) {
        issue(
          problems,
          "unsafe-text",
          path,
          `context ${JSON.stringify(key)} must not contain terminal control, format, or separator characters`,
        );
        return SYMBOLIC_CONTEXT[key] ?? whole;
      }
      return value;
    }
    return SYMBOLIC_CONTEXT[key] ?? whole;
  });

  if (
    hasUnsafeText(rendered) &&
    !problems.some((problem) => problem.path === path && problem.code === "unsafe-text")
  ) {
    issue(
      problems,
      "unsafe-text",
      path,
      `${path} must not contain terminal control, format, or separator characters`,
    );
  }

  if (rendered.includes("{{") || rendered.includes("}}")) {
    const alreadyReported = problems.some(
      (problem) =>
        problem.path === path &&
        (problem.code === "unsupported-context" || problem.code === "unavailable-context"),
    );
    if (!alreadyReported) {
      issue(
        problems,
        "unsupported-context",
        path,
        "only documented {{wpm.*}} authoring-task context references are supported",
      );
    }
  }

  return { text: rendered, contextKeys: [...keys].sort(compareCodeUnits) };
}

function readString(
  value: unknown,
  code: "key-invalid" | "title-invalid" | "acceptance-criterion-invalid" | "dependency-invalid",
  path: string,
  problems: TemplateAuthoringTaskProblem[],
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    issue(problems, code, path, `${path} must be a non-empty string`);
    return undefined;
  }
  if (value !== value.trim()) {
    issue(
      problems,
      code,
      path,
      `${path} must not contain leading or trailing whitespace because task text is materialised literally`,
    );
    return undefined;
  }
  return value;
}

function parseTask(
  raw: unknown,
  index: number,
  scope: TemplateScope,
  context: Readonly<Record<string, string>> | undefined,
  problems: TemplateAuthoringTaskProblem[],
): ParsedTask | undefined {
  const base = `authoring-tasks[${index}]`;
  if (!isMapping(raw)) {
    issue(problems, "task-not-mapping", base, `${base} must be a mapping`);
    return undefined;
  }

  for (const key of Object.keys(raw).sort(compareCodeUnits)) {
    if (!TASK_FIELDS.has(key)) {
      issue(
        problems,
        "unsupported-field",
        `${base}.${key}`,
        `${base}.${key} is unsupported; authoring tasks are inert declarative data only`,
      );
    }
  }

  const key = readString(raw.key, "key-invalid", `${base}.key`, problems);
  if (key !== undefined && !LOCAL_KEY.test(key)) {
    issue(
      problems,
      "key-invalid",
      `${base}.key`,
      `${base}.key must be a lowercase kebab-case stable key`,
    );
  }

  const titleRaw = readString(raw.title, "title-invalid", `${base}.title`, problems);
  const renderedTitle =
    titleRaw === undefined
      ? undefined
      : renderText(titleRaw, `${base}.title`, scope, context, problems);

  const acceptanceCriteria: string[] = [];
  const contextKeys = new Set(renderedTitle?.contextKeys ?? []);
  if (!Array.isArray(raw["acceptance-criteria"])) {
    issue(
      problems,
      "acceptance-criteria-not-list",
      `${base}.acceptance-criteria`,
      `${base}.acceptance-criteria must be a list`,
    );
  } else if (raw["acceptance-criteria"].length === 0) {
    issue(
      problems,
      "acceptance-criteria-empty",
      `${base}.acceptance-criteria`,
      `${base}.acceptance-criteria must contain at least one observable outcome`,
    );
  } else {
    for (const [criterionIndex, criterionRaw] of raw["acceptance-criteria"].entries()) {
      const criterionPath = `${base}.acceptance-criteria[${criterionIndex}]`;
      const criterion = readString(
        criterionRaw,
        "acceptance-criterion-invalid",
        criterionPath,
        problems,
      );
      if (criterion !== undefined) {
        const rendered = renderText(criterion, criterionPath, scope, context, problems);
        acceptanceCriteria.push(rendered.text);
        for (const contextKey of rendered.contextKeys) contextKeys.add(contextKey);
      }
    }
  }

  const dependencies: string[] = [];
  if (raw["depends-on"] !== undefined) {
    if (!Array.isArray(raw["depends-on"])) {
      issue(
        problems,
        "dependencies-not-list",
        `${base}.depends-on`,
        `${base}.depends-on must be a list when present`,
      );
    } else {
      const seen = new Set<string>();
      for (const [dependencyIndex, dependencyRaw] of raw["depends-on"].entries()) {
        const dependencyPath = `${base}.depends-on[${dependencyIndex}]`;
        const dependency = readString(
          dependencyRaw,
          "dependency-invalid",
          dependencyPath,
          problems,
        );
        if (dependency === undefined) continue;
        if (seen.has(dependency)) {
          issue(
            problems,
            "duplicate-dependency",
            dependencyPath,
            `dependency ${JSON.stringify(dependency)} is declared more than once`,
          );
        }
        seen.add(dependency);
        dependencies.push(dependency);
      }
    }
  }

  return {
    index,
    ...(key !== undefined && LOCAL_KEY.test(key) ? { key } : {}),
    ...(renderedTitle !== undefined ? { title: renderedTitle.text } : {}),
    acceptanceCriteria,
    dependencies,
    contextKeys: [...contextKeys].sort(compareCodeUnits),
  };
}

function reportCycles(
  tasks: readonly ParsedTask[],
  problems: TemplateAuthoringTaskProblem[],
): void {
  const firstByKey = new Map<string, ParsedTask>();
  for (const task of tasks) {
    if (task.key !== undefined && !firstByKey.has(task.key)) firstByKey.set(task.key, task);
  }
  const graph = new Map<string, string[]>();
  for (const [key, task] of firstByKey) {
    graph.set(
      key,
      task.dependencies
        .filter((dependency) => dependency.startsWith("self:"))
        .map((dependency) => dependency.slice("self:".length))
        .filter((dependency) => firstByKey.has(dependency)),
    );
  }

  for (const [key, dependencies] of graph) {
    graph.set(key, [...dependencies].sort(compareCodeUnits));
  }

  // Iterative Kosaraju traversal avoids exhausting the JavaScript call stack on a deep, valid pack.
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const start of [...graph.keys()].sort(compareCodeUnits)) {
    if (visited.has(start)) continue;
    visited.add(start);
    const traversal: { key: string; nextDependency: number }[] = [
      { key: start, nextDependency: 0 },
    ];
    while (traversal.length > 0) {
      const frame = traversal[traversal.length - 1];
      if (frame === undefined) break;
      const dependencies = graph.get(frame.key) ?? [];
      const dependency = dependencies[frame.nextDependency];
      if (dependency !== undefined) {
        frame.nextDependency += 1;
        if (!visited.has(dependency)) {
          visited.add(dependency);
          traversal.push({ key: dependency, nextDependency: 0 });
        }
        continue;
      }
      finishOrder.push(frame.key);
      traversal.pop();
    }
  }

  const reverse = new Map<string, string[]>([...graph.keys()].map((key) => [key, []]));
  for (const [key, dependencies] of graph) {
    for (const dependency of dependencies) reverse.get(dependency)?.push(key);
  }
  for (const dependencies of reverse.values()) dependencies.sort(compareCodeUnits);

  const assigned = new Set<string>();
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (start === undefined || assigned.has(start)) continue;
    assigned.add(start);
    const component: string[] = [];
    const traversal = [start];
    while (traversal.length > 0) {
      const key = traversal.pop();
      if (key === undefined) break;
      component.push(key);
      for (const dependency of reverse.get(key) ?? []) {
        if (!assigned.has(dependency)) {
          assigned.add(dependency);
          traversal.push(dependency);
        }
      }
    }
    const sole = component[0] ?? "";
    const selfCycle = component.length === 1 && (graph.get(sole) ?? []).includes(sole);
    if (component.length <= 1 && !selfCycle) continue;
    const members = component.sort(compareCodeUnits);
    const first = members
      .map((member) => firstByKey.get(member))
      .filter((task): task is ParsedTask => task !== undefined)
      .sort((a, b) => a.index - b.index)[0];
    issue(
      problems,
      "cyclic-dependency",
      `authoring-tasks[${first?.index ?? 0}].depends-on`,
      `cyclic same-pack dependency: ${members.join(" -> ")}`,
    );
  }
}

/**
 * Compile and inspect an optional template authoring-task contribution without effects.
 *
 * All safely discoverable declaration, context, collision, dependency, and cycle problems are aggregated.
 * An invalid declaration returns no compiled tasks, so callers cannot accidentally present it as valid or
 * feed it to a later materialisation step.
 */
export function inspectTemplateAuthoringTasks(
  input: InspectTemplateAuthoringTasksInput,
): TemplateAuthoringTaskInspection {
  const { template, producer, mandatoryTasks } = input;
  const scope = materialisationScope(template.scope);
  const source = template.authoringTaskSource;
  const base = {
    producer,
    materialisationScope: scope,
    mode: "additional" as const,
  };
  const problems: TemplateAuthoringTaskProblem[] = [];
  if (producer.scope !== template.scope || producer.name !== template.name) {
    issue(
      problems,
      "producer-identity-mismatch",
      "producer",
      `producer ${producer.scope}/${producer.name} does not match selected template ${template.scope}/${template.name}`,
    );
  }
  for (const problem of source?.yamlProblems ?? []) {
    issue(
      problems,
      "unsupported-yaml-content",
      `template.yml:${problem.line}:${problem.column}`,
      `unsupported YAML content ${JSON.stringify(problem.token)} (${problem.code})`,
    );
  }
  if (
    (source === undefined || (Array.isArray(source.tasks) && source.tasks.length === 0)) &&
    problems.length === 0
  ) {
    return { status: "none", ...base, revision: undefined, tasks: [], problems: [] };
  }
  if (source === undefined) {
    return { status: "invalid", ...base, revision: undefined, tasks: [], problems };
  }
  const revision =
    typeof source.revision === "string" && REVISION.test(source.revision)
      ? source.revision
      : undefined;
  if (revision === undefined) {
    issue(
      problems,
      "revision-invalid",
      "revision",
      "revision must be a non-empty opaque token using letters, digits, dots, underscores, or hyphens",
    );
  }
  if (!Array.isArray(source.tasks)) {
    issue(problems, "tasks-not-list", "authoring-tasks", "authoring-tasks must be a list");
  }

  const parsed = Array.isArray(source.tasks)
    ? source.tasks
        .map((task, index) => parseTask(task, index, template.scope, input.context, problems))
        .filter((task): task is ParsedTask => task !== undefined)
    : [];

  const byKey = new Map<string, ParsedTask[]>();
  for (const task of parsed) {
    if (task.key === undefined) continue;
    const entries = byKey.get(task.key) ?? [];
    entries.push(task);
    byKey.set(task.key, entries);
  }
  for (const [key, tasks] of [...byKey.entries()].sort(([a], [b]) => compareCodeUnits(a, b))) {
    for (const duplicate of tasks.slice(1)) {
      issue(
        problems,
        "duplicate-key",
        `authoring-tasks[${duplicate.index}].key`,
        `local stable key ${JSON.stringify(key)} is duplicated in producer revision`,
      );
    }
  }

  const titleOwners = new Map<string, ParsedTask>();
  const mandatoryByTitle = new Map(mandatoryTasks.map((task) => [task.title, task]));
  for (const task of parsed) {
    if (task.title === undefined) continue;
    const first = titleOwners.get(task.title);
    if (first !== undefined) {
      issue(
        problems,
        "rendered-title-collision",
        `authoring-tasks[${task.index}].title`,
        `rendered title collides with authoring-tasks[${first.index}]`,
      );
    } else {
      titleOwners.set(task.title, task);
    }
    if (mandatoryByTitle.has(task.title)) {
      issue(
        problems,
        "mandatory-title-collision",
        `authoring-tasks[${task.index}].title`,
        `rendered title collides with mandatory task ${JSON.stringify(mandatoryByTitle.get(task.title)?.reference)}`,
      );
    }
  }

  const mandatoryByReference = new Map(mandatoryTasks.map((task) => [task.reference, task]));
  const resolvedByIndex = new Map<number, ResolvedTemplateAuthoringTaskDependency[]>();
  for (const task of parsed) {
    const resolved: ResolvedTemplateAuthoringTaskDependency[] = [];
    for (const [dependencyIndex, reference] of task.dependencies.entries()) {
      const localKey = reference.startsWith("self:") ? reference.slice("self:".length) : undefined;
      const localTargets = localKey === undefined ? undefined : byKey.get(localKey);
      if (localTargets?.length === 1 && revision !== undefined) {
        resolved.push({
          reference,
          resolvedIdentity: producerIdentity(producer, revision, localKey ?? ""),
        });
      } else if (mandatoryByReference.has(reference)) {
        resolved.push({ reference, resolvedIdentity: reference });
      } else {
        issue(
          problems,
          "unresolved-dependency",
          `authoring-tasks[${task.index}].depends-on[${dependencyIndex}]`,
          `dependency ${JSON.stringify(reference)} does not resolve to one same-pack key or applicable mandatory reference`,
        );
      }
    }
    resolvedByIndex.set(task.index, resolved);
  }
  reportCycles(parsed, problems);

  problems.sort(
    (a, b) =>
      compareCodeUnits(a.path, b.path) ||
      compareCodeUnits(a.code, b.code) ||
      compareCodeUnits(a.message, b.message),
  );
  if (problems.length > 0 || revision === undefined) {
    return { status: "invalid", ...base, revision, tasks: [], problems };
  }

  const tasks: InspectedTemplateAuthoringTask[] = parsed.map((task) => ({
    identity: producerIdentity(producer, revision, task.key ?? ""),
    key: task.key ?? "",
    title: task.title ?? "",
    acceptanceCriteria: task.acceptanceCriteria,
    dependencies: resolvedByIndex.get(task.index) ?? [],
    contextKeys: task.contextKeys,
  }));
  return { status: "valid", ...base, revision, tasks, problems: [] };
}
