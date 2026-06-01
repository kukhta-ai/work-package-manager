# Story task-16 — Implement the template render engine

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — and steered from docs/13 §4 + docs/12 + docs/10 + the task-10 `Template` model). Phase C, the services
> tier. doc 13 §4 `render`: `(TemplateTree, params) → file map`, substitution only, touches no disk.

## Story
As an operation that scaffolds projects/bundles, I need a pure render engine that takes a template's file
tree (already read off disk as data) plus parameter values and returns the rendered output files — with
every `{{placeholder}}` mechanically substituted and nothing computed — so `init`/`bundle new` (batch) and
the add-commands' scaffold branch (one snippet at a time) produce faithful, review-able output.

## Acceptance criteria (the contract)
1. Given a template's file tree and a set of parameter values, the corresponding output files are produced
   with every placeholder substituted (doc 13).
2. Rendering performs substitution only — no conditional logic and no computed content (Structure-not-Content,
   doc 10).
3. Files meant to be placed at initialisation and snippets meant to be produced on demand are distinguishable
   and handled accordingly (doc 12).

## Developer context (the docs)
- doc 13 §4: "`render` — `(TemplateTree, params)` → a file map. No conditionals or loops, only
  `{{placeholder}}` substitution (Structure-not-Content, 10). The operation reads the template via
  `FileSystem` and writes the result; `render` itself touches no disk."
- doc 12 "Templates as data, not code": `render.ts` walks `files/` and writes each file with `{{placeholder}}`
  substitution; "no conditionals, no loops, no logic"; `files/` is copied at init, `snippets/` are rendered
  on demand — "both use the same `render.ts` substitution; they differ only in *when*".
- doc 10 "Structure, not content": mechanical `{{placeholder}}` substitution (`{{project-name}}` →
  `hermes-handoff`); "Placeholders substitute at scaffold time — `{{bundle-id}}`, `{{project-name}}`,
  `{{version}}`, `{{tool}}` — anywhere in `files/`."
- doc 06: placeholders appear in PATHS too (e.g. `installer-skills/{{project-name}}-installer/SKILL.md.tmpl`)
  and the `.tmpl` suffix is stripped on output (`manifest.yml.tmpl` → `manifest.yml`).
- task-10 model (`src/core/model/template.ts`): `TemplateFile = {path, content}`; `Template` separates
  `files` from `snippets`. REUSE these.

## Design — `src/core/services/render.ts` (PURE; boundary rule applies)
- **Params type**: `RenderParams = ReadonlyMap<string, string>` (or `Record<string,string>` — Map chosen for
  a clean "has/get" + clear "missing" semantics).
- **Placeholder grammar (AC#2 enforcement)**: a placeholder is exactly `{{<param-name>}}` where
  `<param-name>` matches `[a-z0-9]+(?:-[a-z0-9]+)*` (kebab — the same shape our param names use:
  `project-name`, `bundle-id`, `version`, `tool`). The regex is `/\{\{([a-z0-9]+(?:-[a-z0-9]+)*)\}\}/g`.
  Optional inner whitespace (`{{ name }}`) MAY be tolerated — decide in impl; default: NO inner spaces (strict
  token) so the grammar stays unambiguous. A logic-like token (`{{#if x}}`, `{{/each}}`, `{{> partial}}`)
  does NOT match this grammar → it is an **unmatched placeholder** and errors (proving no logic is
  interpreted).
- **Substitute in BOTH content AND path**, then **strip a trailing `.tmpl`** from the output path
  (`a/b.yml.tmpl` → `a/b.yml`; only the final `.tmpl`).
- **Every placeholder MUST resolve (AC#1)**: scanning a content/path string, any `{{name}}` whose `name` is
  not in params is an ERROR. Also, any `{{...}}` brace-pair that does not match the strict grammar at all
  (e.g. `{{#if}}`) is an ERROR (unmatched/invalid placeholder). The error names the offending placeholder
  text AND the file path (and whether it was in the path or the content). Pure: THROW a plain `Error` with
  that message (the typed DomainError model is task-23; a service may throw a descriptive Error which the
  operation maps later) — OR return a Result. DECISION: throw a descriptive `Error` (render is invoked
  inside an operation that will wrap failures; a fresh-write render failure is a template/param bug, fail
  loud). Record this choice. (Extra params with no placeholder are harmless — ignored.)
- **Files vs snippets (AC#3) — distinct API**:
  - `renderTree(files: readonly TemplateFile[], params): RenderedFile[]` (or a `path→content` map) — the
    init-time batch (`init` / `bundle new`).
  - `renderSnippet(snippet: TemplateFile, params): RenderedFile` — ONE on-demand snippet (the add-commands'
    scaffold branch).
  - `RenderedFile = { path: string; content: string }` (the rendered output file). The two entry points make
    the files-vs-snippets distinction explicit in the API; both share one internal `renderFile` so behavior
    is identical (doc 12: "both use the same render.ts substitution").
  - A `renderString(text, params, context)` internal used by both for content + path.
- **PURE**: no `node:fs`/`commander`/`execa`/etc. Only the task-10 model. Boundary rule on
  `src/core/services/render.ts` must stay clean.
- Add to a services barrel if one exists (create `src/core/services/index.ts`? — only if useful; the schema
  service used a per-service barrel. Keep consistent: a `render` has a single file; export from it directly,
  and optionally a top-level `src/core/services/index.ts` — decide in impl, don't over-engineer).

## Tests (`test/unit/services/render.test.ts` — pure)
- AC#1: substitute `{{project-name}}`/`{{version}}` in CONTENT; substitute in a PATH
  (`installer-skills/{{project-name}}-installer/SKILL.md.tmpl` → `installer-skills/hermes-installer/SKILL.md`);
  multiple occurrences; multiple params.
- `.tmpl` stripping: `manifest.yml.tmpl` → `manifest.yml`; a non-`.tmpl` file unchanged; only the FINAL
  `.tmpl` stripped (`x.tmpl.tmpl` → `x.tmpl`).
- AC#1 error: an unmatched placeholder (`{{missing}}` not in params) throws, naming the placeholder + file;
  same for a placeholder in a PATH.
- AC#2 (no logic): `{{#if x}}…{{/if}}` / `{{#each}}` / `{{> partial}}` are NOT interpreted — they error as
  unmatched/invalid placeholders (proving substitution-only). A literal-looking `{{notaparam}}` with no value
  errors rather than being left or computed.
- AC#3: `renderTree` renders a multi-file batch → the file map; `renderSnippet` renders ONE → a single
  RenderedFile; the two are distinct entry points.
- Realistic fixture: a small `Template`-shaped `files` array (manifest.yml.tmpl + a placeholder-in-path
  SKILL.md.tmpl) rendered with `{project-name, version}`.
- Edge: empty tree → empty map; a file with no placeholders passes through (minus `.tmpl`); an extra unused
  param is harmless.

## DoD
- Pure (boundary clean — verify biome on `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean,
  `vitest run` green, `npm ci` clean (no new deps). JSDoc every public fn/type; no dead code.

## Previous-story intelligence (carried forward)
- Pattern (task-11 schema service): pure service under `src/core/services/<name>/`, reuse the task-10 model,
  field-precise error messages, comprehensive unit tests. task-11 used a per-service folder + barrel; render
  is a single file — a folder is optional. Run `biome check --write` before the gate (hook enforces).
- task-11 decision echo: services FAIL with a clear message at the boundary; the typed DomainError model is
  task-23. Here render THROWS a descriptive Error on an unresolved/invalid placeholder (fail-loud for a
  fresh-write template bug).

## Boundaries (do NOT do here)
- No fs / no reading templates from disk (the operation does that via the FileSystem port; task-17 resolves
  templates). No template-descriptor parsing (task-11 did `template.yml`). No wiring into operations (later).
  No new deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json,
  task-10–15.
