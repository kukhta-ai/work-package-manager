import type { Project, ValidationProblem, ValidationReport } from "../model/index.js";
import { type BundleNode, resolve } from "./version-constraint.js";

/**
 * The `validate` service (doc 13 §4; doc 10 `project validate`): inspects a loaded {@link Project} and
 * reports the project-level problems an author should fix before building or installing — composing the
 * task-18 version-constraint engine. PURE: it computes over the project data plus the bundle directory names
 * the operation read (via the FileSystem port) and passes in; it performs no I/O and throws nothing for a
 * normal invalid project (the problems are data; the operation maps them to a domain error at task-23).
 *
 * It checks exactly the four things doc 13 §4 names — constraints resolve, no cycles, targets non-empty, no
 * orphan bundle directories — and **deliberately leaves out** the review-phase checks (step-slug uniqueness,
 * Definition-of-Done compliance) which are authoring-backlog tasks (doc 11), and the scope-alias
 * well-formedness check (not part of doc 13 §4's list). Schema/kebab/semver validity is already guaranteed by
 * the parsed branded model, so it is not re-checked here.
 *
 * Imports only the version-constraint service and the task-10 model, so the import-boundary rule on
 * `src/core/services/` is satisfied.
 */

/** The directory name that is always allowed under `bundles/` without a manifest entry (doc 10). */
const BUNDLE_TEMPLATE_DIR = "bundle-template";

/**
 * Validate a project and return a {@link ValidationReport}. All problems are aggregated (no fail-fast), so a
 * project with several issues reports each of them; `ok` is `true` exactly when there are no problems.
 *
 * The four checks (doc 13 §4):
 * 1. **Constraints resolve** — each `requires` edge's dependency is enabled and its version satisfies the
 *    constraint (a `missing` or `version-mismatch` problem otherwise).
 * 2. **Acyclic** — the `requires` graph has no dependency cycle (a problem naming the cycle path otherwise).
 * 3. **Targets non-empty** — at least one target agent is declared.
 * 4. **No orphan bundle directory** — every directory under `bundles/` (other than `bundle-template/`) is
 *    listed in the manifest.
 *
 * @param project - The loaded project (manifest + every enabled bundle's parsed manifest).
 * @param bundleDirectoryNames - The directory names actually present under `bundles/`, supplied by the
 *   operation (read via the FileSystem port).
 * @returns The validation report.
 */
export function validateProject(
  project: Project,
  bundleDirectoryNames: readonly string[],
): ValidationReport {
  const problems: ValidationProblem[] = [];

  // (1) + (2): dependency constraints + cycles, via the version-constraint engine.
  const nodes: BundleNode[] = [];
  for (const bundle of project.bundles.values()) {
    nodes.push({ id: bundle.id, version: bundle.version, requires: bundle.requires });
  }
  const report = resolve(nodes);

  for (const constraint of report.constraints) {
    if (constraint.satisfied) {
      continue;
    }
    const field = `requires.${constraint.to}`;
    if (constraint.reason === "missing") {
      problems.push({
        message: `bundle "${constraint.from}" requires "${constraint.to}" which is not enabled`,
        field,
      });
    } else {
      problems.push({
        message: `bundle "${constraint.from}" requires "${constraint.to}"@${constraint.range} but "${constraint.to}" is ${constraint.actualVersion}`,
        field,
      });
    }
  }

  for (const cycle of report.cycles) {
    problems.push({
      message: `dependency cycle: ${cycle.join(" -> ")}`,
      field: "requires",
    });
  }

  // (3): at least one target agent.
  if (project.manifest.targets.length === 0) {
    problems.push({ message: "no target agents declared", field: "targets" });
  }

  // (4): no orphan bundle directory (a dir under bundles/ absent from the manifest, except bundle-template/).
  const enabled = new Set<string>(project.manifest.bundles.map((id) => id as string));
  for (const name of bundleDirectoryNames) {
    if (name === BUNDLE_TEMPLATE_DIR) {
      continue;
    }
    if (!enabled.has(name)) {
      problems.push({
        message: `bundle directory "${name}" is not listed in the manifest (orphan/disabled)`,
        field: "bundles",
      });
    }
  }

  return { ok: problems.length === 0, problems };
}
