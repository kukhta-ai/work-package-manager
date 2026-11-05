import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodeJson } from "./json.mjs";

const pureExternal =
  /^(?:node:)?(?:path|url)$|^(?:node:)?crypto$|^(?:node_modules\/)?(?:yaml|semver|ajv)(?:\/|$)/;
const core = /^src\/(?:core|vnext\/core)\//;

/** @typedef {{resolved?: string, module: string, couldNotResolve?: boolean}} Dependency */
/** @typedef {{modules: {source: string, dependencies: Dependency[]}[], summary?: {violations?: {rule: {name: string}, from: string, to: string}[]}}} Graph */

/** Check every first-party transitive path, including type imports and re-exports.
 * @param {Graph} graph
 */
export function inspectGraph(graph) {
  if (!graph?.modules?.length) throw new Error("Dependency graph is empty");
  const modules = new Map(graph.modules.map((entry) => [entry.source, entry]));
  const failures = [];
  for (const entry of graph.modules.filter((candidate) => core.test(candidate.source))) {
    const queue = [[entry.source]];
    const seen = new Set();
    while (queue.length) {
      const chain = queue.shift();
      if (!chain) break;
      const name = chain.at(-1);
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      for (const dependency of modules.get(name)?.dependencies ?? []) {
        const target = dependency.resolved ?? dependency.module;
        const next = [...chain, target];
        if (
          dependency.couldNotResolve ||
          /^(?:test|scripts|distribution-preparation)\//.test(target) ||
          /^src\/(?:adapters|vnext\/adapters|cli\.ts)/.test(target)
        ) {
          failures.push(next.join(" -> "));
        } else if (target.startsWith("src/") && !modules.has(target)) {
          failures.push(`${next.join(" -> ")} (first-party module was not analyzed)`);
        } else if (target.startsWith("src/")) {
          queue.push(next);
        } else if (!pureExternal.test(target)) {
          failures.push(next.join(" -> "));
        }
      }
    }
  }
  return [...new Set(failures)];
}

/** Run the pinned graph engine without shell or PATH fallback. */
export function checkArchitecture(root = process.cwd()) {
  const cli = fileURLToPath(
    new URL("../node_modules/dependency-cruiser/bin/dependency-cruise.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [cli, "src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (!result.stdout) throw new Error(result.stderr || "Dependency graph did not run");
  const graph = /** @type {Graph} */ (decodeJson(result.stdout));
  const failures = inspectGraph(graph);
  for (const violation of graph.summary?.violations ?? [])
    failures.push(`${violation.rule.name}: ${violation.from} -> ${violation.to}`);
  if (result.status !== 0 || failures.length) throw new Error(failures.join("\n") || result.stderr);
  const reachable = new Set(
    graph.modules.filter((entry) => core.test(entry.source)).map((entry) => entry.source),
  );
  for (const name of reachable) {
    for (const dependency of graph.modules.find((entry) => entry.source === name)?.dependencies ??
      []) {
      const target = dependency.resolved ?? dependency.module;
      if (target.startsWith("src/")) reachable.add(target);
    }
  }
  if (!reachable.size) throw new Error("No pure core modules were checked");
  const eslint = fileURLToPath(new URL("../node_modules/eslint/bin/eslint.js", import.meta.url));
  const config = fileURLToPath(new URL("../quality/pure-eslint.config.mjs", import.meta.url));
  const ambient = spawnSync(
    process.execPath,
    [eslint, "--config", config, "--no-ignore", ...reachable],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (ambient.status !== 0 || ambient.error)
    throw new Error(
      ambient.stdout || ambient.stderr || ambient.error?.message || "Pure effect check did not run",
    );
  return graph.modules.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Architecture: ${checkArchitecture()} modules checked`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
