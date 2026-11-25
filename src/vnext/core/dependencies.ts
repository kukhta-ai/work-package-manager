import { parse as parseVersion, rcompare, satisfies, validRange } from "semver";

export type DependencyKind = "dependencies" | "devDependencies" | "optionalDependencies";
export interface DependencyDeclaration {
  source: string;
  range: string;
}
export type DependencyDeclarations = Partial<
  Record<DependencyKind, Record<string, DependencyDeclaration>>
>;
export const dependencyKinds: DependencyKind[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];
export interface PackageCandidate {
  locator: string;
  name: string;
  version: string;
}
export interface PackageRecord extends PackageCandidate, DependencyDeclarations {
  id: string;
  digest: string;
}
export interface DependencyEdge {
  name: string;
  kind: DependencyKind;
  declaration: DependencyDeclaration;
  target?: string;
  omitted?: string;
}
export interface PackageInstance {
  record: PackageRecord;
  edges: DependencyEdge[];
}
export interface PackageGraph {
  schemaVersion: 2;
  root: string;
  nodes: Record<string, PackageInstance>;
}
export interface PackageCatalog {
  workspace: PackageCandidate[];
  archive(parent: PackageCandidate, source: string): PackageCandidate | undefined;
  load(candidate: PackageCandidate): PackageRecord;
  frozen?(this: void, candidate: PackageCandidate): PackageGraph | undefined;
}

/** Validate declarations independently of source IO and resolver availability. */
export function validateDependencies(value: DependencyDeclarations): void {
  const seen = new Set<string>();
  for (const kind of dependencyKinds)
    for (const [name, entry] of Object.entries(value[kind] ?? {})) {
      if (!/^[a-z][a-z0-9-]*$/.test(name) || seen.has(name))
        throw new Error(`invalid or repeated dependency: ${name}`);
      seen.add(name);
      if (!validRange(entry.range) || !entry.range.trim())
        throw new Error(`invalid dependency range: ${name}`);
      if (entry.source !== "workspace" && !entry.source.startsWith("file:"))
        throw new Error(`unsupported dependency source: ${entry.source}`);
      if (entry.source === "file:") throw new Error("empty archive source");
    }
}

/** Exact versions preserve build metadata; other expressions use standard SemVer range matching. */
export function matchesPackageVersion(version: string, range: string): boolean {
  const exact = parseVersion(range);
  return exact
    ? version === `${exact.version}${exact.build.length ? `+${exact.build.join(".")}` : ""}`
    : satisfies(version, range);
}

class Unavailable extends Error {}
/** Resolve a finite instance graph. Package cycles are references, never operation ordering. */
export function resolvePackageGraph(
  root: PackageCandidate,
  catalog: PackageCatalog,
  previous?: PackageGraph,
  upgrade = false,
): PackageGraph {
  const nodes: Record<string, PackageInstance> = {};
  const previousNodes = previous?.nodes ?? {};
  const choose = (
    parent: PackageCandidate,
    name: string,
    declaration: DependencyDeclaration,
    old?: DependencyEdge,
  ): PackageCandidate => {
    const candidates = (
      declaration.source === "workspace"
        ? catalog.workspace
        : [catalog.archive(parent, declaration.source)].filter(
            (entry): entry is PackageCandidate => entry !== undefined,
          )
    ).filter((entry) => entry.name === name);
    const suitable = candidates.filter((entry) =>
      matchesPackageVersion(entry.version, declaration.range),
    );
    const pinned = old?.target ? previousNodes[old.target]?.record : undefined;
    const match =
      !upgrade &&
      pinned &&
      suitable.find(
        (entry) => entry.locator === pinned.locator && entry.version === pinned.version,
      );
    if (match) return match;
    const [selected, second] = suitable.sort((a, b) => rcompare(a.version, b.version));
    if (!selected)
      throw new Unavailable(
        `missing ${name}@${declaration.range}; available: ${candidates.map((candidate) => candidate.version).join(", ") || "none"}`,
      );
    if (second && rcompare(selected.version, second.version) === 0)
      throw new Error(`ambiguous package version: ${name}`);
    return selected;
  };
  const visit = (candidate: PackageCandidate, chain: string[], dev: boolean): string => {
    const record = catalog.load(candidate);
    if (
      record.name !== candidate.name ||
      record.version !== candidate.version ||
      record.locator !== candidate.locator
    )
      throw new Error("package metadata changed during resolution");
    const frozen = catalog.frozen?.(candidate);
    if (frozen) {
      if (frozen.nodes[frozen.root]?.record.id !== record.id)
        throw new Error("frozen root differs from selected source");
      for (const [id, instance] of Object.entries(frozen.nodes)) {
        if (nodes[id] && JSON.stringify(nodes[id]) !== JSON.stringify(instance))
          throw new Error(`conflicting frozen instance: ${id}`);
        nodes[id] = instance;
      }
      return frozen.root;
    }
    if (nodes[record.id]) return record.id;
    const instance: PackageInstance = { record, edges: [] };
    nodes[record.id] = instance;
    const old = Object.values(previous?.nodes ?? {}).find(
      (n) => n.record.locator === record.locator,
    );
    for (const kind of dependencyKinds) {
      if (kind === "devDependencies" && !dev) continue;
      const declarations = record[kind] ?? {};
      for (const name of Object.keys(declarations).sort()) {
        const declaration = declarations[name] as DependencyDeclaration;
        const edge: DependencyEdge = { name, kind, declaration };
        instance.edges.push(edge);
        const oldEdge = old?.edges.find(
          (e) =>
            e.name === name &&
            e.kind === kind &&
            e.declaration.source === declaration.source &&
            e.declaration.range === declaration.range,
        );
        if (!upgrade && kind === "optionalDependencies" && oldEdge?.omitted) {
          edge.omitted = oldEdge.omitted;
          continue;
        }
        const before = new Set(Object.keys(nodes));
        try {
          edge.target = visit(
            choose(candidate, name, declaration, oldEdge),
            [...chain, `${record.name}@${record.version}`],
            false,
          );
        } catch (error) {
          if (kind !== "optionalDependencies" || !(error instanceof Unavailable)) {
            if (error instanceof Unavailable)
              throw new Unavailable(
                `${chain.concat(`${record.name}@${record.version}`).join(" -> ")} -> ${error.message}`,
              );
            throw error;
          }
          for (const id of Object.keys(nodes)) if (!before.has(id)) delete nodes[id];
          edge.omitted = error.message;
        }
      }
    }
    return record.id;
  };
  const rootId = visit(root, [], true);
  return {
    schemaVersion: 2,
    root: rootId,
    nodes,
  };
}

/** Select the runtime closure without dev-only nodes, preserving cycles and explicit omissions. */
export function runtimeGraph(graph: PackageGraph): PackageGraph {
  const nodes: Record<string, PackageInstance> = {};
  const visit = (id: string): void => {
    if (nodes[id]) return;
    const node = graph.nodes[id];
    if (!node) throw new Error(`dangling dependency: ${id}`);
    const edges = node.edges.filter((e) => e.kind !== "devDependencies");
    nodes[id] = { record: { ...node.record, devDependencies: {} }, edges };
    for (const edge of edges) if (edge.target) visit(edge.target);
  };
  visit(graph.root);
  return { ...graph, nodes };
}
