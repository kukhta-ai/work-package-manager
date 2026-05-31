# Story task-13 — Implement comment-preserving YAML

> Lean implementation spec (BMAD create-story output). doc 12 §"YAML: `yaml` (eemeli/yaml)". A **pure leaf**
> in `src/util/yaml.ts`: wraps the `yaml` lib, does **no** file I/O (the read/write is the FileSystem port's
> job, task-12). Reads flow `FileSystem.read` → `parseYaml` → `schema.parseX`; mutations of author-edited
> files flow through the comment-preserving `editYaml` path.

## Acceptance criteria (the contract)
1. A configuration file edited programmatically keeps its comments and key order; only the intended change
   differs (doc 12).
2. A file read and written back without changes is byte-for-byte identical.

## Dependency
`yaml@2.9.0` (eemeli/yaml, exact-pinned, in `dependencies`; ships its own types — no `@types`). Added; run
`npm install` then confirm `npm ci` succeeds (task-8 lesson).

## EMPIRICAL FINDING (drives fixtures + the honest AC#2 caveat) — probed against yaml@2.9.0
`YAML.parseDocument(text).toString()` round-trips **byte-for-byte identically** for realistic manifest/
bundle YAML: leading/standalone/inline comments, key order, blank lines, quoted+unquoted values, lists,
nested maps, and trailing newlines ALL survive exactly. **One normalization exists:** multiple spaces before
an inline comment collapse to a single space (`version: 0.1.0      # x` → `version: 0.1.0 # x`). So AC#2
holds exactly for normally-formatted files; the only divergence is non-canonical multi-space comment
alignment. The AC#2 byte-identity tests use single-space-before-comment fixtures (canonical) and ALSO assert
the multi-space normalization explicitly so the caveat is documented honestly, not hidden.
Edit path probed too: `doc.setIn(["project","version"], v)` changes ONLY the version line (comment + order
preserved); adding `requires.<id>` appends while preserving siblings' inline comments. AC#1 fully holds.

## API (`src/util/yaml.ts`)
- `parseYaml(text: string): unknown` — `YAML.parse(text)`; plain JS value for the schema service to validate.
- `stringifyYaml(value: unknown): string` — `YAML.stringify(value)`; for FRESH writes (e.g. `init` from
  `schema.serializeManifest`). Drops comments/unknown keys by nature — only for brand-new files.
- `parseDocument(text: string): Document` — re-export the eemeli `Document` (the CST-backed editable form).
- `stringifyDocument(doc: Document): string` — `doc.toString()`.
- `editYaml(text: string, mutate: (doc: Document) => void): string` — the ergonomic comment-preserving EDIT
  path: parseDocument → mutate(doc) (e.g. `doc.setIn(["project","version"], "0.2.0")`, or a `requires.<id>`
  entry) → toString. ONLY the touched key differs; comments/order/unknown keys survive.
- Re-export the `Document` type (and `YAMLError` if useful) so operations can type the mutate callback.

## The seam (note in module doc)
task-11's `schema.serializeX` makes a FRESH plain object and DROPS comments + unknown keys — right for new
files (`stringifyYaml(serializeX(...))`). To MUTATE an author-edited file, operations MUST use `editYaml`
instead, so comments and unknown keys survive. Document this contrast in the module JSDoc.

## Tests (`test/unit/util/yaml.test.ts` — pure)
- **AC#2 byte-identity:** realistic `manifest.yml` + `bundle.yml` fixtures (comments, blank lines, quoted/
  unquoted, lists, a requires map) with single-space-before-comment → `parseDocument(text).toString() ===
  text`. PLUS an explicit test documenting the multi-space-before-comment normalization (the one caveat).
- **AC#1 edit-preserves:** a manifest fixture WITH a header comment, an inline comment, and deliberate key
  order → `editYaml` bumping `project.version` → assert (a) new value present, (b) every comment still
  present, (c) key order unchanged, (d) a line-diff shows EXACTLY ONE changed line. A second: add a
  `requires.<id>` entry → new entry present, sibling's inline comment preserved.
- **Basics:** `parseYaml`/`stringifyYaml` round-trip a plain object; nested maps, lists, a requires-style map.

## Gate / DoD
- `src/util/yaml.ts` pure (only the `yaml` lib; no `node:fs`/`commander`/`execa`). `tsc --noEmit` clean,
  `biome check .` clean, `vitest run` green, `npm ci` clean (new dep). JSDoc every public fn; no dead code.

## Boundaries (do NOT do here)
- No file I/O (FileSystem port, task-12). No schema validation (task-11 consumes `parseYaml`'s output). Don't
  wire any operation to use editYaml yet (that's the operations, task-25/26+). Don't edit docs/, AGENTS.md,
  backlog/, .bmad/, task-5's biome.json, task-10/11/12.
