# Story task-20 — Implement the validate service

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from docs 13 §4 + 10 + the task-18 engine + the task-10 model). Phase C services tier. doc 13 §4
> `validate`. PURE — composes the task-18 version-constraint `resolve` + the task-10 model; no I/O.
> Synchronous.

## Story
As the `project validate` operation (and the §5 CHECK step of mutating operations), I need a pure service that
inspects a loaded `Project` and reports, with specific problems, whether every dependency constraint resolves,
whether the requires-graph is acyclic, whether at least one target agent is declared, and whether any bundle
directory under `bundles/` is missing from the manifest — so the author catches dependency/scope problems at
validate time, not install time.

## Acceptance criteria (the contract)
1. Validating a project reports whether every dependency constraint resolves, whether the dependency graph is
   acyclic, whether at least one target agent is declared, and whether any bundle directory is missing from
   the manifest (doc 10/13).
2. A valid project reports no problems; each kind of broken project reports its specific problem.
3. Review-phase concerns such as step-slug uniqueness and Definition-of-Done compliance are out of scope here
   (doc 11).

## Developer context (the docs)
- doc 13 §4 (line 95): "`validate` — `(Project)` → `ValidationReport`: constraints resolve, no cycles, targets
  non-empty, no orphan bundle directories (a dir under `bundles/` absent from the manifest is flagged). The
  `project validate` logic (10). **Deeper checks (step-slug uniqueness, DoD compliance) are review-phase
  tasks (11), not CLI checks, and deliberately live outside this service.**" (AC#3.)
- doc 10 `project validate`: bundle dirs match `manifest.yml.bundles` (no orphans **except `bundle-template/`**);
  for each `requires`: required bundle id is enabled AND its `version` satisfies the constraint; no circular
  `requires`; `targets:` non-empty; (`project.version` valid semver — already guaranteed by the parsed
  `SemVer`; and scope-alias well-formedness — NOT in doc 13 §4's list, OUT OF SCOPE for task-20).
- task-18: `resolve(nodes: BundleNode[]): ResolutionReport { constraints: ConstraintResult[]; cycles:
  BundleId[][] }`; `ConstraintResult { from, to, range, satisfied, actualVersion?, reason?:
  "missing"|"version-mismatch" }`. Cycles are detection-not-enumeration → `cycles.length > 0` means cyclic.
- task-10 model: `ValidationReport { ok: boolean; problems: ValidationProblem[] }`; `ValidationProblem
  { message: string; field?: string }`. `Project { rootPath; manifest; bundles: ReadonlyMap<BundleId,
  BundleManifest> }`; `Manifest { meta; bundles: BundleId[]; targets: AgentName[] }`.

## Design — `src/core/services/validate.ts` (PURE; boundary rule applies)
- **`validateProject(project: Project, bundleDirectoryNames: readonly string[]): ValidationReport`** — PURE
  over data. `bundleDirectoryNames` are the directory names actually present under `bundles/` (the operation
  reads them via the FS port `list` and passes them in, so validate stays pure).
- **Four checks; AGGREGATE all problems (no fail-fast) so a multi-broken project reports each (AC#2):**
  1. **Constraints resolve** — build `BundleNode[]` from `project.bundles` (`{ id, version, requires }`) and
     call task-18 `resolve`. For each `ConstraintResult` with `satisfied === false`:
     - `reason === "missing"` → problem `bundle "<from>" requires "<to>" which is not enabled` (field
       `requires.<to>`).
     - `reason === "version-mismatch"` → problem `bundle "<from>" requires "<to>"@<range> but "<to>" is
       <actualVersion>` (field `requires.<to>`).
  2. **Acyclic** — for each cycle in `resolve(...).cycles`: problem `dependency cycle: <a -> b -> a>` (the
     path joined by ` -> `; field `requires`).
  3. **≥1 target** — `project.manifest.targets.length === 0` → problem `no target agents declared` (field
     `targets`).
  4. **No orphan bundle directory** — let `enabled = new Set(project.manifest.bundles)`. For each `name` in
     `bundleDirectoryNames` where `name !== "bundle-template"` AND `!enabled.has(name)`: problem
     `bundle directory "<name>" is not listed in the manifest (orphan/disabled)` (field `bundles`). (Compare
     the dir name to the enabled id **strings**.)
  - `ok = problems.length === 0`. A valid project → `{ ok: true, problems: [] }` (AC#2).
- **OUT OF SCOPE (AC#3):** NO step-slug uniqueness, NO DoD compliance (doc 11 review-phase tasks). NO
  scope-alias well-formedness (not in doc 13 §4 / AC#1). NO re-checking schema/kebab (the parsed model
  already guarantees those).
- **PURE**: import only task-18 (`resolve`, `BundleNode`) + the task-10 model (`Project`, `ValidationReport`,
  `ValidationProblem`, `BundleId`/etc. as types). NO `node:fs`/`commander`/`execa` — boundary clean on
  `src/core/services/`.
- Export: `validateProject` (+ reuse the model's `ValidationReport`/`ValidationProblem`).

## Tests (`test/unit/services/validate.test.ts` — pure)
Build fixture `Project`s via the task-10 parsers (id/version/summary/confirmation/requires; manifest meta +
targets + bundles order).
- VALID project (core 0.3.2, web-handoff 0.2.0 requires core ^0.3.0, one target, dirs = [core, web-handoff,
  bundle-template]) → `{ ok: true, problems: [] }`.
- missing-dep (web-handoff requires absent `doc-handoff`) → one problem naming both, field `requires.doc-handoff`.
- version-mismatch (core 0.4.0 vs ^0.3.0) → one problem naming `<range>` + the actual version.
- cycle (a↔b) → one problem `dependency cycle: ...`.
- empty targets → one problem `no target agents declared`.
- orphan dir (`bundles/stray/` not in manifest) → one problem naming `stray`; AND `bundle-template` in the dir
  list is NOT flagged.
- MULTI-problem project (empty targets + an orphan dir + a version-mismatch) → ALL three reported; `ok:false`.
- a missing dir that IS enabled is fine; the enabled-but-no-dir case isn't an orphan (only EXTRA dirs are
  flagged, per doc 10 "dir under bundles/ absent from manifest").

## DoD
- Pure (boundary clean — verify biome on `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean,
  `vitest run` green (SINGLE process), `npm ci` clean (no new deps). JSDoc every public fn; no dead code.

## Previous-story intelligence (carried forward)
- task-18 `resolve` returns DATA (constraints + cycles), never throws — validate consumes it and maps each
  unsatisfied/cycle into a `ValidationProblem`. task-11 pattern: field-precise problem messages. Run `biome
  check --write` before the gate; run vitest as a SINGLE process (task-18 concurrency caveat).

## Boundaries (do NOT do here)
- No fs (the operation reads the bundle dir names + passes them in; the operation also resolves the project).
  No domain-error throwing (the operation maps the report at task-23). No review-phase checks (doc 11). No
  scope-alias check. No new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status),
  task-5's biome.json, task-10–19.
