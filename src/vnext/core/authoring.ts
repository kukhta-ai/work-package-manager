import { inc, parse as parseVersion, type ReleaseType } from "semver";
import type { TaskRecord } from "../../core/ports/backlog.js";
import { type PackageSource, parsePackage } from "./model.js";

/** Native task marker for editable source that has not been finalized. */
export const draftLabel = "wpm-authoring:draft";

/** Readiness describes authored source, never execution of recipient work. */
export function operationProblems(
  task: TaskRecord,
  id: string,
  requireInstructions = false,
): string[] {
  const problems: string[] = [];
  if (!task.labels.includes(`wpm-operation:${id}`))
    problems.push("missing stable operation identity");
  if (!task.title.trim()) problems.push("missing title");
  if (requireInstructions && !task.description?.trim()) problems.push("missing instructions");
  if (!task.acceptanceCriteria.length || task.acceptanceCriteria.some((item) => !item.text.trim()))
    problems.push("missing acceptance criteria");
  return problems;
}

/** Alter only direct group references; prerequisites remain untouched. */
export function changeGroup(
  source: PackageSource,
  name: string,
  operations: string[],
  groups: string[],
  action: "add" | "remove",
): PackageSource {
  const current = Object.hasOwn(source.groups, name) ? source.groups[name] : undefined;
  if (!current) throw new Error(`unknown group: ${name}`);
  for (const id of operations)
    if (!source.work.some((work) => work.operation === id))
      throw new Error(`unknown operation: ${id}`);
  for (const id of groups)
    if (!Object.hasOwn(source.groups, id)) throw new Error(`unknown group: ${id}`);
  const edit = (before: string[], values: string[]): string[] =>
    action === "add"
      ? [...new Set([...before, ...values])]
      : before.filter((id) => !values.includes(id));
  return parsePackage({
    ...source,
    groups: {
      ...source.groups,
      [name]: {
        operations: edit(current.operations, operations),
        groups: edit(current.groups, groups),
      },
    },
  });
}

/** Resolve an exact version or a supported semantic increment without release effects. */
export function nextVersion(current: string, value: string, preid?: string): string {
  const levels: ReleaseType[] = [
    "major",
    "minor",
    "patch",
    "premajor",
    "preminor",
    "prepatch",
    "prerelease",
  ];
  const level = levels.find((item) => item === value);
  if (
    preid !== undefined &&
    (!level?.startsWith("pre") || !/^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/.test(preid))
  )
    throw new Error("--preid requires a prerelease increment and valid identifier");
  const parsed = parseVersion(value);
  const exact = parsed
    ? `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`
    : null;
  const result = level ? inc(current, level, undefined, preid) : exact;
  if (!result || (!level && result !== value))
    throw new Error(`invalid semantic version or increment: ${value}`);
  return result;
}
