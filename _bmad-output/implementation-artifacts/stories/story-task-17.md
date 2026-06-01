# Story task-17 — Implement two-tier template resolution

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned
> — steered from docs/13 §4 + docs/12 + docs/10 + the task-10/11/12/13 surfaces). Phase C services tier.
> doc 13 §4 `template-resolver`. Composes the FileSystem PORT (task-12) + schema service (task-11) + yaml
> (task-13) + the task-10 `Template` model. Synchronous.

## Story
As the `init` / `bundle new` / `template list|show` operations, I need to resolve a template by name and
scope — preferring a project-local template over a built-in of the same name — and to list the available
templates filtered by scope, so the CLI can scaffold from the right template and a missing one is reported
clearly.

## Acceptance criteria (the contract)
1. Resolving a template name finds a project-local template before a built-in one of the same name (doc
   10/12).
2. Templates can be listed, filtered to those valid for a project versus for a bundle.
3. A name matching no template yields a clear not-found outcome.

## Developer context (the docs)
- doc 12 scaffold: templates live at `<root>/<scope>/<name>/` (`<scope>` ∈ {`project`, `bundle`}); each
  template dir holds `template.yml` + a `files/` tree (+ optional `snippets/`). Two roots: the **built-in**
  root (shipped in the package) and the **project-local** root (`<projectRoot>/templates/`); "project-local
  templates/ shadow these".
- doc 10: `template list [--scope project|bundle]` — "all applicable (project-local + built-in in a project;
  built-in otherwise)", "filter by template scope". `template show <name>` — metadata + tree.
- doc 13 §4: the resolver is a pure service; the operation does the I/O — here through the injected
  FileSystem port (task-12), so the service is pure-over-ports (no `node:fs`).
- Built-in templates DON'T exist in the repo yet (tasks 30–31 author them) → TEST with fixture template
  trees on the in-memory FileSystem fake (task-12 `MemoryFileSystem`).

## Design — `src/core/services/template-resolver.ts` (pure-over-ports; boundary rule applies)
- `node:path` IS allowed in core (doc 13 §1: pure string ops) — use it for path joins. `node:fs` is NOT —
  all disk access goes through the FS port.
- **Deps**: `interface ResolverDeps { fs: FileSystem; builtinTemplatesRoot: string; projectTemplatesRoot?:
  string }` — the injected port + the two roots (project-local optional: a no-project context has only
  built-ins, doc 10 "built-in otherwise").
- **`resolveTemplate(name: string, scope: TemplateScope, deps): TemplateResolution`** (AC#1, AC#3):
  - Search order: project-local `<projectTemplatesRoot>/<scope>/<name>/` FIRST (if a project root is given),
    then built-in `<builtinTemplatesRoot>/<scope>/<name>/`. First whose dir exists (via `fs.exists`) wins →
    project-local shadows built-in (AC#1).
  - On a hit, read the template into a fully-populated `Template`:
    - `template.yml`: `fs.read(<dir>/template.yml)` → `parseYaml` (task-13) → `parseTemplateDescriptor`
      (task-11) → name/scope/parameters. If `parseTemplateDescriptor` fails, surface that schema error
      (a malformed `template.yml` is an authoring error — see "error handling" below).
    - `files/`: recursively walk `<dir>/files/` via `fs.list`/`fs.read`, producing `TemplateFile[]` whose
      `path` is RELATIVE to `files/` (so it matches what render expects: the path within the instantiated
      output). Directories are descended; files are read.
    - `snippets/`: same recursive read of `<dir>/snippets/` if it exists; else `[]`.
  - Return `{ found: true; template }` on a hit.
  - **Not-found (AC#3)**: when neither tier has the dir, return `{ found: false; name; scope; searched:
    string[] }` (the searched dirs, project-local then built-in) — a DISCRIMINATED result, NOT a throw
    (a lookup miss is expected; the operation maps it to the Not-found DomainError at task-23). This
    deliberately contrasts render's throw (a template-AUTHORING bug).
- **`listTemplates(deps, filter?: { scope?: TemplateScope }): TemplateSummary[]`** (AC#2):
  - Enumerate `<scope>/` dirs under built-in AND project-local roots (each scope dir's immediate
    subdirectories are template names). MERGE with project-local shadowing a built-in of the same
    (name, scope) — a project-local entry replaces the built-in summary.
  - Read only `template.yml.scope`? No — the scope is the DIR we enumerated under, so a summary is
    `{ name, scope }` from the directory layout alone (no `files/` read — cheap, doc 10 "list" is a
    listing). (Optionally validate scope against `template.yml` — keep minimal; the dir layout is the
    source of truth for listing.)
  - `filter.scope` → only that scope's dir is enumerated. No filter → both `project` and `bundle`.
  - `TemplateSummary = { name: string; scope: TemplateScope }`.
- **Error handling**: a missing template = the `{found:false}` result (NOT throw). A malformed `template.yml`
  on a FOUND template = the schema `ValidationProblem` surfaced — return it (e.g.
  `{ found: false-ish }`?) — DECISION: throw a descriptive Error for a malformed `template.yml` (it's a
  template-authoring bug, like render; "found but broken" ≠ "not found"). Record this. Tests assert the
  schema error surfaces. (A future refinement could add a `{ found: true, invalid: problem }` variant; keep
  it simple now.)
- **Types** (export): `ResolverDeps`, `TemplateResolution` (the discriminated union), `TemplateSummary`,
  `ListFilter`(`{scope?}`). Reuse task-10 `Template`/`TemplateFile`/`TemplateScope`, task-12 `FileSystem`,
  task-11 `parseTemplateDescriptor`, task-13 `parseYaml`.

## Tests (`test/unit/services/template-resolver.test.ts` — pure, in-memory FS fixtures)
Build fixture template trees on `MemoryFileSystem` (write `template.yml` + `files/...` + `snippets/...`):
- AC#1 base: only a built-in `project/minimal` → resolve finds it; `template.files` carries the `files/`
  tree (relative paths) and parsed `parameters`.
- AC#1 shadow: built-in `project/minimal` + project-local `project/minimal` (different content) → resolve
  returns the PROJECT-LOCAL one (assert by a distinguishing file/param).
- AC#2: `listTemplates` with both roots populated (project + bundle scopes) → returns all; `filter:{scope:
  "project"}` → only project; `{scope:"bundle"}` → only bundle; project-local shadows a same-name built-in
  in the list (no duplicate).
- AC#3: resolve a name in neither tier → `{found:false, name, scope, searched:[...]}` naming both searched
  dirs.
- Tree read: a nested `files/` (e.g. `files/installer-skills/x/SKILL.md.tmpl`) → relative path preserved;
  `snippets/` read; absent `snippets/` → `[]`.
- Malformed `template.yml` (e.g. missing `scope`, or a bad scope) on a found template → the schema error
  surfaces (throws).
- no-project context (no `projectTemplatesRoot`) → only built-ins searched/listed.

## DoD
- Service uses only the FS port + schema + yaml + model + `node:path` (NO `node:fs`/`commander`/`execa` —
  boundary clean on `src/core/services/`). `tsc --noEmit` clean, `biome check .` clean, `vitest run` green,
  `npm ci` clean (no new deps). JSDoc every public fn/type; no dead code.

## Previous-story intelligence (carried forward)
- task-11 pattern: pure service reusing the model; field-precise errors. task-12: `MemoryFileSystem` is the
  in-memory FS fake — write fixtures into it for resolver tests (it normalizes paths POSIX-style, so use
  `/`-rooted paths). task-13: `parseYaml(text)` → data; task-11: `parseTemplateDescriptor(data)` →
  `Parsed<Template>` (fills name/scope/parameters, leaves files/snippets EMPTY for the resolver to populate).
- Decision echo: lookup miss = discriminated result (not-found is expected); authoring/parse error = throw
  (render/schema pattern). Run `biome check --write` before the gate.

## Boundaries (do NOT do here)
- No `node:fs`. No authoring built-in templates (tasks 30–31) — fixtures only. No wiring into operations
  (later). No rendering (task-16 did that; the resolver returns the `Template`, render consumes it). No new
  deps. Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json, task-10–16.
