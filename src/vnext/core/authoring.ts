import { inc, parse as parseVersion, type ReleaseType } from "semver";
import { isSeq, parse, parseDocument } from "yaml";
import type { TaskRecord } from "../../core/ports/backlog.js";
import { type PackageSource, parsePackage, stableJson } from "./model.js";
import { editSourceText } from "./source-text.js";

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

/** Retain authored sequence nodes by stable identity, then validate the complete source transition. */
export function editAuthoringSourceText(
  text: string,
  before: PackageSource,
  after: PackageSource,
): string {
  const document = parseDocument(text);
  if (document.errors.length) throw new Error("cannot edit malformed authoring YAML");
  if (stableJson(before) === stableJson(after)) return text;
  const reconcile = <T>(
    path: string[],
    previous: T[],
    next: T[],
    key: (value: T) => string,
  ): void => {
    if (stableJson(previous) === stableJson(next)) return;
    const sequence = document.getIn(path);
    if (!isSeq(sequence)) throw new Error("resolve source sequence alias before editing selection");
    const existing = new Map(
      previous.map((value, index) => [key(value), sequence.items[index]] as const),
    );
    sequence.items = next.map((value) => existing.get(key(value)) ?? document.createNode(value));
  };
  reconcile(["work"], before.work, after.work, (value) => value.operation);
  for (const [name, group] of Object.entries(before.groups)) {
    const next = Object.hasOwn(after.groups, name) ? after.groups[name] : undefined;
    if (next) {
      reconcile(["groups", name, "operations"], group.operations, next.operations, stableJson);
      reconcile(["groups", name, "groups"], group.groups, next.groups, stableJson);
    }
  }
  const rebased: unknown = document.toJS();
  const result = editSourceText(document.toString(), rebased, after);
  const actual: unknown = parse(result, { logLevel: "error" });
  if (stableJson(actual) !== stableJson(after))
    throw new Error("authored YAML aliases conflict with source edit");
  return result;
}
