# Story task-10 — Define the domain model and branded types

> Lean implementation spec (BMAD create-story output). The KEYSTONE of doc 13 §2 and the FIRST code under
> `src/core/` — so the task-5 Biome core import-boundary rule now applies to real code. Pure data + smart
> constructors; illegal states unrepresentable. Sources: docs/13 §2, docs/00 Vocabulary, docs/06 field
> shapes, docs/10 `bundle` tree (reserved verbs). docs/08 deep version rules are task-18 — only npm-style
> range *format* here.

## Acceptance criteria (the contract)
1. Bundle ids, agent names, versions, and version ranges are each a distinct type that exists only after
   passing validation; an invalid value cannot be constructed (doc 13).
2. A bundle id is rejected unless it is kebab-case and not a reserved word.
3. The model can represent a project, its manifest, its bundles, a templated unit, an authoring-task spec, a
   validation report, and an operation result.
4. The model carries no dependency on the CLI framework, the file system, or any other I/O.

## Sources verified (field shapes + reserved verbs — don't invent)
- docs/00 Vocabulary: Bundle id = stable kebab-case id naming the dir + Backlog.md `task_prefix` + the
  `requires` key, never changes. Summary = user-facing menu line. Target agent = runtime name (Claude Code,
  Hermes, Codex…). Manifest = release identity + flat enabled bundle ids + target agents. `requires:
  {dep-id: "<npm-style constraint>"}`.
- docs/06: manifest = `project:` (name, version, optional description/license/repository/author) + `targets`
  + `bundles`; bundle.yml = `id` (stable), `version` (current), `summary` (menu line), confirmation level,
  `requires` map (npm-style); template.yml = `scope: project|bundle` + `parameters` + `files/` + snippets.
- docs/10 (cited TWICE — `bundle new` validation + the `<id>` tree note): reserved cross-bundle verbs =
  **`new | enable | disable | remove | list | template`** ("those name cross-bundle ops"; "otherwise
  `bundle <id> …` would be ambiguous"). This is the EXACT reserved set for BundleId. confirmation-level
  values = `safe | dangerous` (docs/10 `meta`).

## File layout (`src/core/model/`, barrel via index.ts)
- `result.ts` — `ValidationProblem` (`{ message: string; field?: string }`) + `Parsed<T>`
  (`{ ok: true; value: T } | { ok: false; problem: ValidationProblem }`) + tiny `ok()`/`fail()` helpers.
  The reusable value-OR-failure shape every parser returns (NO throwing — typed errors are task-23).
- `branded.ts` — the `Brand<T, B>` compile-time brand helper (`T & { readonly __brand: B }`); zero runtime
  cost; the parser is the sole producer.
- `ids.ts` — `BundleId` (kebab-case AND not a reserved verb, AC#2) + `parseBundleId`; `AgentName` +
  `parseAgentName`. Kebab regex: `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase/digits/hyphens, no leading/trailing/
  double hyphen). RESERVED_BUNDLE_VERBS = the 6 from docs/10. AgentName: a sane runtime-name shape (allow
  the real-world spellings — `claude-code`, `codex`, `hermes`; accept lowercase kebab; these become
  scope-alias keys). Document the reserved list + cite docs/10.
- `version.ts` — `SemVer` + `parseSemVer` (via `semver.valid`), `VersionRange` + `parseVersionRange` (via
  `semver.validRange`). Uses the **`semver`** package (pure, no I/O → allowed in core; boundary rule only
  forbids commander/execa/omelette/node:fs/etc). Store the normalized string the semver fn returns. task-18
  reuses semver for satisfies/resolve.
- `manifest.ts` — `ConfirmationLevel = "safe" | "dangerous"`; `ProjectMeta` (name; version: SemVer; optional
  description/license/repository/author); `Manifest` (meta + `bundles: BundleId[]` + `targets: AgentName[]`).
- `bundle.ts` — `BundleManifest` (`id: BundleId`, `version: SemVer`, `summary: string`, `confirmation:
  ConfirmationLevel`, `requires: ReadonlyMap<BundleId, VersionRange>` — a typed map of dep→range).
- `template.ts` — `TemplateScope = "project" | "bundle"`; `TemplateParameter`; `TemplateFile` (path + text,
  as DATA); `Template` (name, scope, parameters, files, snippets). Shape only — rendering is task-16.
- `project.ts` — `Project` (rootPath: string [NOT an fs handle], manifest: Manifest, bundles:
  ReadonlyMap<BundleId, BundleManifest>). Pure projection; no caching, no I/O.
- `operation.ts` — `AuthoringTaskSpec` (title + acceptanceCriteria: string[]); `ValidationReport`
  (`{ ok: boolean; problems: ValidationProblem[] }`); `OperationResult` (summary: string; changedPaths:
  string[]; materialisedTaskTitles: string[]) (doc 13 §2 last bullet).
- `index.ts` — barrel re-exporting the public types + parsers.

## The branded smart-constructor pattern (AC#1)
- Brand: `type BundleId = Brand<string, "BundleId">` — compile-time only.
- Parser is the SOLE producer: `parseBundleId(raw: string): Parsed<BundleId>` returns `ok(value as BundleId)`
  or `fail({message, field})`. No constructor/cast is exported elsewhere, so an aggregate field typed
  `BundleId` is provably valid — illegal states unrepresentable. Same for AgentName/SemVer/VersionRange.

## semver dependency decision (DIVERGENCE to record)
Add `semver@^7` (dependency) + `@types/semver@^7` (devDependency) per the directive — semver is pure
(no I/O), so allowed in core; task-18 reuses it. After adding, run `npm install` to sync the lockfile, then
`npm ci` to confirm it still works (task-8 lesson). Confirm the NodeNext-correct import form for the CJS
`semver` during impl (likely `import semver from "semver"` via esModuleInterop, or the `semver/functions/*`
submodules) — whichever type-checks under `verbatimModuleSyntax`.

## Tests (`test/unit/model/*.test.ts` — pure, no fs/subprocess)
- BundleId: valid kebab (`web-handoff`, `core`, `a1`, `x-y-z`); invalid (empty, `Web`, `-x`, `x-`, `x--y`,
  `web_handoff`, `web handoff`); EACH reserved verb (`new`/`enable`/`disable`/`remove`/`list`/`template`)
  rejected; a near-miss accepted (`new-bundle`, `lister`).
- AgentName: valid (`claude-code`, `codex`, `hermes`); invalid (empty, bad shape).
- SemVer: valid (`0.1.0`, `1.2.3`); invalid (`1`, `v1.2`, `abc`, `1.2`).
- VersionRange: valid (`^0.3.0`, `~1.2`, `>=2 <3`, `1.x`); invalid (`^^1`, `garbage`).
- AC#1 "can't construct invalid" is shown structurally: parsers return `{ok:false}` (never throw); aggregates
  only accept branded fields (a compile-time test: building a Manifest from parsed values type-checks).

## Gate / DoD
- `tsc --noEmit` clean, `biome check .` clean **including the boundary rule on the new `src/core/`** (run it
  — a forbidden import would flag), `vitest run` green. `npm install` (sync lock) then `npm ci` (verify).
  JSDoc every public type + parser; no dead code.

## Boundaries (do NOT do here)
- No rendering (task-16), no schema parse-from-YAML (task-11 — this is the in-memory model + branded
  primitives), no satisfies/resolve (task-18), no error throwing (task-23). No fs/CLI. Don't edit docs/,
  AGENTS.md, backlog/, .bmad/, task-5's biome.json.
