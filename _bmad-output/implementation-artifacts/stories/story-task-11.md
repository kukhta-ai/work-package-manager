# Story task-11 — Implement the three schemas with validators

> Lean implementation spec (BMAD create-story output). Doc 13 §4's `schema` service, under
> `src/core/services/schema/` (pure core — the task-5 boundary rule applies). Depends ONLY on task-10's
> model; **operates on already-parsed data (`unknown`), NOT raw YAML and NOT files** (doc 13 §4: "services
> that read content take it as data; the operation does the I/O"). **Do NOT import `yaml`** — the
> string↔object round-trip + comment preservation is task-13, layered on top.

## Acceptance criteria (the contract)
1. A well-formed manifest, bundle descriptor, and template descriptor each parse into the model and serialize
   back without losing information (doc 06/10).
2. The manifest yields release identity + enabled-bundle list + target agents; a bundle descriptor yields
   id/version/summary/confirmation/requires; a template descriptor yields scope + parameters.
3. A malformed descriptor is rejected with a message identifying what is wrong (and which field).
4. Invalid ids/versions/ranges are rejected on the SAME rules the model enforces (reuse task-10 parsers).

## Sources resolved (don't invent)
- **`bundles` is a FLAT LIST OF ID STRINGS.** docs/06 (line 22-24 + line 137) say "flat list of enabled
  bundle IDs" / "flat enabled-bundle list"; docs/00, docs/13, and the task-10 model agree. docs/10's
  line-150 `{id: <id>}` (in the `bundle enable` row) is an OUTLIER/inconsistency — follow the authoritative
  flat-list shape; note the discrepancy in the report.
- **`ProjectMeta` already has `author`** (added in task-10) — no model gap; map `project.author`.
- Field shapes (docs/06/10): manifest = `project:` {name, version, description?, license?, repository?,
  author?} + `targets:` [agent…] + `bundles:` [id…]; bundle.yml = {id, version, summary, confirmation
  (safe|dangerous), requires: {dep-id: range}}; template.yml = {name, scope (project|bundle), parameters}.

## File layout (`src/core/services/schema/`, barrel via index.ts)
- `problems.ts` — small internal helpers for structural validation that build `ValidationProblem`s:
  `isPlainObject(x): x is Record<string, unknown>`, `requireString(obj, key, ctx): Parsed<string>`,
  `optionalString(...)`, and a `prefix(field, ...)` for nesting (e.g. `project.version`). Pure; reused by all
  three schemas. (Keeps each schema readable and messages consistent.)
- `manifest.ts` — `parseManifest(data: unknown): Parsed<Manifest>` + `serializeManifest(m: Manifest):
  ManifestData` (plain object). Validates `project` is an object; `project.name` string; `project.version`
  via `parseSemVer`; optional desc/license/repository/author strings; `targets` an array, each via
  `parseAgentName`; `bundles` an array, each via `parseBundleId`.
- `bundle.ts` — `parseBundleManifest(data): Parsed<BundleManifest>` + `serializeBundleManifest(b)`.
  Validates id (`parseBundleId`), version (`parseSemVer`), summary (string), confirmation (one of
  safe|dangerous), requires (object map: each key `parseBundleId`, each value `parseVersionRange`).
- `template.ts` — `parseTemplateDescriptor(data): Parsed<Template>` + `serializeTemplateDescriptor(t)`.
  Validates name (string), scope (project|bundle), parameters (array of {name, description?, default?}).
  **NOTE:** the on-disk `files`/`snippets` trees are populated by the resolver (task-17) from disk; the
  DESCRIPTOR (`template.yml`) only carries name/scope/parameters. So parse fills `files: []`, `snippets: []`
  and serialize OMITS them (descriptor ≠ full Template). Document this boundary.
- `index.ts` — barrel; also export the `*Data` plain-object types so task-13 (YAML) can target them.

## Fail-fast vs aggregate (DECISION)
Each `parseX` returns `Parsed<X>` (task-10 shape: a single `problem` on failure) — so it cannot return a
list. Decision: **fail at the first problem, but make every problem field-precise** (message names the exact
field, e.g. `manifest: "project.version" is not a valid semantic version`, `bundle "web-handoff":
"requires.core" is not a valid npm-style version range`). This satisfies AC#3 ("identifying what is wrong")
without changing the `Parsed<T>` contract. (A future `validate` service — task-20 — is where multi-problem
aggregation into a `ValidationReport` belongs; descriptor parsing fails fast on the first structural/field
error, which is the more useful behaviour at the parse boundary.) Record this choice.

## Round-trip fidelity (AC#1)
`parseX(serializeX(value))` yields back an EQUAL value, modulo semver normalization (intentional — the model
already stores normalized strings, so a round-trip is stable). `serializeX` omits absent optionals and
produces the real `project:`/`targets:`/`bundles:` shape. Test the round-trip for each schema (deep-equal,
comparing Map contents for `requires`).

## Tests (`test/unit/schema/*.test.ts` — pure, no fs/yaml)
- well-formed parse → assert AC#2 fields extracted; serialize → parse round-trip equal (AC#1).
- malformed each rejected with a clear, field-naming message (AC#3): non-object; missing required
  (`project`, `name`, `version`, `id`, `summary`, `scope`); wrong type (version a number, targets a string,
  requires an array); bad enum (confirmation `"perhaps"`, scope `"global"`).
- AC#4: invalid id/version/range delegated to task-10 parsers (e.g. bundle id `"Remove"`/`"new"`, version
  `"1.2"`, range `"garbage"`) → rejected with the model's rules.

## Gate / DoD
- Pure: only the task-10 model (+ no other runtime dep); NO `yaml`/`commander`/`execa`/`node:fs`. Biome
  boundary clean on `src/core/services/schema/`. `tsc --noEmit` clean; `vitest run` green. JSDoc public fns;
  no dead code.

## Boundaries (do NOT do here)
- No YAML text parsing / comment preservation (task-13). No file I/O. No template tree/snippet population
  (task-17). No multi-problem aggregation/`ValidationReport` (task-20). Don't edit docs/, AGENTS.md,
  backlog/, .bmad/, task-5's biome.json, task-10's model.
