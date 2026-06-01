# Story task-26 — One representative operation end-to-end through the lifecycle (`createBundle`)

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 10 row `bundle new` + doc 11 §3 the per-bundle catalog + doc 06 the bundle skeleton + doc 13
> §5/§6/§8). The COMPOSITION PROOF: one real mutating operation riding the task-25 harness through all six
> beats, observable with NO CLI, ahead of the per-command work (tasks 34+). PURE over the PORTS. Synchronous.

## Story
As the first concrete inhabitant of the operations tier, build `createBundle` (the `bundle new` use case, doc
10) as an `OperationSpec` run through task-25's `runMutation`, and make the harness's injected `deriveArtefacts`
capability real (resolving the project template's snippets via task-17 + task-19). This proves an operation
composes the services + abstractions correctly — validating input, scaffolding from a template, recording the
change in the manifest, re-deriving the front-door, and materialising its doc-11 authoring tasks — end to end,
without commander.

## Acceptance criteria (the contract)
1. One state-changing operation works end to end through the shared sequence — validating input, producing
   files from a template, recording the change in the project, re-deriving artefacts, and materialising its
   authoring tasks (doc 13 §5; doc 10 `bundle new`).
2. Its reported result and its effects on the project are observable without involving the command-line
   surface (doc 13 §6: the operation returns data; output is not a port).
3. It demonstrates that an operation composes the services and abstractions correctly, ahead of any per-command
   work (the composition proof; tasks 34+ wire the CLI).

## Developer context (the docs)
- doc 13 §5 names `createBundle` as THE example: "createBundle supplies ③ (scaffold dir from template + append
  to manifest) and a ⑤ plan (the per-bundle authoring tasks + the advisor task); ④ falls out of the changed
  Project for free."
- doc 10 row `bundle new <id>` (the canonical action list): ① validate `<id>` (kebab + not in manifest + not a
  reserved verb); ② resolve bundle template (default `bundles/bundle-template/`); ③ scaffold `bundles/<id>/`
  from template with `{{bundle-id}}`/`{{version}}` substituted; ④ set `id`/`version`/`requires:{}`/
  `task_prefix` in `bundle.yml` (+ `install-backlog/config.yml`); ⑤ unless `--disabled` append `<id>` to
  `manifest.bundles`; ⑥ unless `--no-advisor` run advisor-add (stub + "Write advisor content for `<id>`");
  ⑦ materialise the per-bundle authoring task set (doc 11); ⑧ re-render derived artefacts.
- doc 11 §3 "Materialised by `wpm bundle new <id>`" — the EXACT 12-task catalog (the per-bundle set of 11 + the
  advisor task; doc 10/11: "12 with the auto-advisor"). Titles + ACs verbatim below — DO NOT invent.
- doc 06: the bundle skeleton — `bundles/<id>/` carries `bundle.yml`, `installer-skills/` + per-bundle scope
  aliases (`.agents/skills`/`.claude/skills`/… → `installer-skills/`), `payload/`, `install-backlog/`. The
  "self-similar surfaces" (§ "Self-similar surfaces") make the per-bundle alias target `bundles/<id>/
  installer-skills/` — which MUST exist so the alias the rerender creates is non-broken (the task-25 lesson).

## The doc-11 per-bundle authoring tasks `createBundle` materialises (verbatim — cite doc 11 §3)
For id `<id>` (default path, advisor ON → all 12; `--no-advisor` → omit #5):
1. **Plan bundle `<id>`** — AC: `bundles/<id>/bundle.yml` has `summary`, `version`, `confirmation-level` set; the `requires` map declares any inter-bundle dependencies.
2. **Fill install-backlog for `<id>`** — AC: at least one `kind:state` task with a `step:<slug>` label exists; DoD is configured in `install-backlog/config.yml`; the detect/setup/verify trio is present.
3. **Author payload for `<id>`** — AC: `payload/files/` and `payload/templates/` are populated for whatever the install-backlog tasks reference via `--ref`.
4. **Scaffold payload skill for `<id>`** — AC: if the bundle delivers a runtime agent skill, at least one is registered via `bundle <id> skills add <name>`; if none, close with a note to that effect.
5. **Write advisor content for `<id>`** — AC: `installer-skills/<id>-advisor/SKILL.md` has a real trigger description and a recommendation body, replacing the placeholder. (Omitted under `--no-advisor`.)
6. **Verify step slug uniqueness for `<id>`** — AC: every `step:<slug>` label across `bundles/<id>/install-backlog/tasks/` and `archive/` is unique.
7. **Verify DoD compliance for `<id>`** — AC: every task in the bundle carries the DoD items declared in `bundles/<id>/install-backlog/config.yml.dod`.
8. **Verify payload references for `<id>`** — AC: every `--ref <path>` value in the bundle's tasks corresponds to a file registered under `bundle <id> files` or `bundle <id> templates`.
9. **Verify skill registration for `<id>`** — AC: every payload skill and install-time skill registered for the bundle has its SKILL.md present with valid frontmatter; the advisor (unless opted out) is filled past its placeholder.
10. **Verify version constraints for `<id>`** — AC: every entry in `bundles/<id>/bundle.yml.requires` resolves against the depended-upon bundle's declared `version`.
11. **Review install-backlog independence for `<id>`** — AC: no hard-coded IDs from other bundles; no undeclared host-environment assumptions.
12. **Simulate fresh-install executor for `<id>`** — AC: agent walks the tasks as a context-less executor, documenting ambiguous ACs / dangling `--ref` / unmet preconditions; closes on a clean walk.
(Order: plan → fill → payload → skill → advisor → the verify/review/simulate set — natural reading order; nothing enforces it.)

## Confirmed composition surfaces (read before writing)
- task-10 `parseBundleId(raw): Parsed<BundleId>` already enforces kebab + `RESERVED_BUNDLE_VERBS`. task-10
  `BundleManifest`, `serializeBundleManifest` (schema), `AuthoringTaskSpec {title, acceptanceCriteria}`.
- task-13 yaml leaf: `parseYaml`, `stringifyYaml`, and `editYaml(text, mutate)` — the COMMENT-PRESERVING
  document editor (doc 13: do NOT hand-serialise the manifest; mutate the live `Document`).
- task-16 `renderTree(files, params)` / `renderSnippet(snippet, params)` → `RenderedFile {path, content}`.
- task-17 `resolveTemplate(name, scope, {fs, builtinTemplatesRoot, projectTemplatesRoot?}): TemplateResolution`
  (project-shadows-builtin); `Template {name, scope, parameters, files: TemplateFile[], snippets:
  TemplateFile[]}`.
- task-19 `ArtefactSnippets {frontDoor: TemplateFile; orchestrator: TemplateFile}`; `deriveArtefacts(project,
  snippets): DesiredArtefacts`; `buildParams` reads each bundle's `summary` for the front-door menu line.
- task-25 `runMutation(deps, ctx, spec, input): OperationResult`; `LifecycleDeps {fs, backlog,
  deriveArtefacts}`; `OperationSpec {summary, check?, apply, materialise?}`; `ApplyContext {fs, backlog, root}`.

## Design — Deliverable 1: `createBundle` in `src/core/operations/create-bundle.ts`
A factory that builds the `OperationSpec<CreateBundleInput>` (so the input — the raw id + flags — is the
`runMutation` input). PURE over the ports (boundary rule: only the services/ports/model/errors + `node:path`;
NO `node:fs`/`commander`/`execa`).

- `interface CreateBundleInput { readonly id: string; readonly version?: string; readonly disabled?: boolean;
  readonly advisor?: boolean; }` (`version` default `"0.1.0"`; `advisor` default true — `--no-advisor` sets it
  false). A `bundleTemplateName` (default the project's `bundle-template`) may also be an input/dep.
- `createBundleSpec(deps): OperationSpec<CreateBundleInput>` where `deps` carries what ③ needs that the harness
  doesn't: the `builtinTemplatesRoot` (+ derived `projectTemplatesRoot`) for the bundle-template resolution.
  (The FS/backlog come from `ApplyContext`.) The beats:
  - **② CHECK** — `const parsed = parseBundleId(input.id)`; on `!parsed.ok` raise `ValidationError(parsed
    .problem.message)`. Then if `project.manifest.bundles` includes the parsed id raise
    `ConflictError("bundle '<id>' already exists in the manifest")`. Pure read; no effect.
  - **③ APPLY** — two structural effects via the ports:
    (a) **scaffold `bundles/<id>/` from the bundle template**: `resolveTemplate(bundleTemplateName, "bundle",
        {fs, builtinTemplatesRoot, projectTemplatesRoot: join(root, "templates")})`; on `found:false` raise
        `NotFoundError` (template missing — an authoring/setup problem surfaced as a typed error). Render the
        template's `files` with `renderTree(template.files, params)` where `params = {bundle-id: <id>,
        version: <version>, project-name: <manifest.meta.name>}`, and `fs.write(join(root, "bundles", <id>,
        f.path), f.content)` each. The template's `files/` MUST include `bundle.yml`, `installer-skills/`
        (its target dir — so the per-bundle alias is non-broken), and `install-backlog/config.yml` (doc 06).
    (b) **write `bundle.yml`** — build a `BundleManifest {id, version, summary, confirmationLevel, requires:
        {}}` (a default summary like `"<id> bundle"` so the front-door menu has a line; the doc-11 "Plan"
        task tells the author to refine it), `serializeBundleManifest` → `stringifyYaml` → `fs.write(join(root,
        "bundles", <id>, "bundle.yml"), …)`. (If the template's files already render a `bundle.yml`, this
        canonical write supersedes it with the correct id/version — the structural source of truth.)
    (c) **append `<id>` to `manifest.bundles`** UNLESS `input.disabled`: read `manifest.yml`, `editYaml(text,
        doc => { (doc seq "bundles").add(<id>) })` — COMMENT-PRESERVING — then `fs.write(join(root,
        "manifest.yml"), edited)`. (Use the live-document path so the manifest's comments/ordering survive.)
    Collect changed paths: the scaffolded files + `bundle.yml` + `manifest.yml`.
  - **④ RERENDER (automatic, from the harness)** — NOT arranged here; the harness reloads the post-apply
    project (now listing `<id>`) and calls the injected `deriveArtefacts` → re-renders the front-door (its menu
    now includes the new bundle's summary) + the per-bundle scope aliases. This is what forces Deliverable 2.
  - **⑤ MATERIALISE plan** — `materialise: (project, input) => AuthoringTaskSpec[]` returns the doc-11 12-task
    set (titles with `<id>` substituted, ACs verbatim), OMITTING the advisor task (#5) when `input.advisor ===
    false`. The harness runs the title-idempotent materialiser around it.
  - **⑥ RESULT** — `summary` e.g. `"created bundle <id>"`; the harness folds ③'s + ④'s changed paths and ⑤'s
    titles into the `OperationResult`.

## Design — Deliverable 2: the concrete `deriveArtefacts` capability
`src/core/operations/derive-artefacts-capability.ts` (or co-located): a factory
`makeArtefactDeriver(deps): (project: Project) => DesiredArtefacts` that RESOLVES the project template's
front-door + orchestrator snippets via task-17 and calls task-19 `deriveArtefacts(project, snippets)`. PURE
over the ports.
- `deps = { fs: FileSystem; builtinTemplatesRoot: string; projectTemplatesRoot?: string; projectTemplateName?:
  string }` (default project template name e.g. `"minimal"`; doc 10 §Templates).
- Implementation: `const res = resolveTemplate(projectTemplateName, "project", {fs, builtinTemplatesRoot,
  projectTemplatesRoot})`; on `found:false` raise `NotFoundError`. From `res.template.snippets` pick the
  front-door snippet (path `AGENTS.md`/`AGENTS.md.tmpl`) and the orchestrator snippet (path under
  `installer-skills/{{project-name}}-installer/SKILL.md` or similar) → `ArtefactSnippets {frontDoor,
  orchestrator}` → `return deriveArtefacts(project, snippets)`. (This is exactly doc 13 §5 ④ "resolve the
  snippets, pass them as data" — the operation/composition resolves; task-19 renders.)
- The composition root (task-27/33) wires this real deriver into `LifecycleDeps.deriveArtefacts`. For task-26
  we PROVE it with in-memory fixture templates (below).

## Fixture templates (tests — what a prior `init` would have left on disk)
Seed into `MemoryFileSystem` the way `init` leaves them (doc 10 row `init`):
- A **project template** at `<builtin>/project/minimal/` with `template.yml` (`name: minimal`, `scope:
  project`) + a `snippets/` tree providing the front-door + orchestrator snippets (e.g.
  `snippets/AGENTS.md` containing `{{project-name}}` and a `{{bundles}}` menu marker, and
  `snippets/installer-skills/{{project-name}}-installer/SKILL.md`).
- A **bundle template** at `<builtin>/bundle/default/` (or the project's `bundles/bundle-template/`) with
  `template.yml` (`scope: bundle`, params `bundle-id`/`version`) + a `files/` tree providing `bundle.yml`
  (with `{{bundle-id}}`/`{{version}}`), an `installer-skills/.keep` (so the alias target dir exists), and
  `install-backlog/config.yml`.
- The seeded project: `manifest.yml` (name + version + targets `[claude]` + `bundles: []`), an initialised
  `.authoring-backlog` (FakeBacklog `init(root, {taskPrefix:"authoring"})`), the project's own
  `installer-skills/` dir (so the ROOT scope alias the rerender creates is non-broken), and the project +
  bundle templates above.

## Tests (`test/unit/operations/create-bundle.test.ts` + `.acceptance.test.ts`) — NO CLI (AC#2)
In-memory `MemoryFileSystem` + `FakeBacklog` + the fixture templates + the real `makeArtefactDeriver` wired
into `LifecycleDeps`. Run `createBundle` via `runMutation` and assert the full observable end state:
- **AC#1 (five sub-steps)** — (validate-input) a good id proceeds; (template→files) `bundles/<id>/` exists with
  its `bundle.yml` (id/version correct, parses) + `installer-skills/` target dir + `install-backlog/config.yml`
  from the template; (record-in-project) `<id>` appended to `manifest.yml` AND the manifest still PARSES and
  its COMMENTS are preserved (seed a manifest with a comment, assert it survives); (re-derive) the front-door
  `AGENTS.md` re-rendered to LIST the new bundle (its summary line present); (materialise) all 12 doc-11
  authoring tasks present in `FakeBacklog` (or 11 with `--no-advisor`).
- **AC#1 (alias non-broken)** — the per-bundle scope alias `bundles/<id>/.claude/skills` exists and is
  NON-broken: `fs.exists("bundles/<id>/.claude/skills")` is true because its target `bundles/<id>/
  installer-skills/` exists (the now-faithful `exists` from task-25). Same for the ROOT alias.
- **AC#2 (no CLI)** — everything asserted comes from the `OperationResult` (summary, changedPaths,
  materialisedTaskTitles) + the in-memory fakes; NO commander/cli.ts imported anywhere in the test.
- **AC#3 (composition)** — the operation only declares check/apply/materialise; the harness drove LOAD/④/⑤ — so
  the front-door re-render + the materialisation happened without `createBundle` arranging them (assert the
  spec's apply does not call deriveArtefacts/materialiseAuthoringTasks).
- **Errors / idempotency** — a duplicate id (already in manifest) raises `ConflictError` and changes nothing
  (no scaffold, manifest untouched, no tasks); a bad id (`"New"`, or `"a--b"`, or `"list"`) raises
  `ValidationError`; a re-run with the bundle already present is idempotent (second `OperationResult` empty
  changedPaths from ④ + empty materialisedTaskTitles from ⑤ — ties back to task-25; note ② would actually raise
  Conflict on a true re-run, so idempotency is shown at the ④/⑤ layer via a spec variant or by asserting the
  doc-11 titles are not re-created when present).
- **Unit** — `makeArtefactDeriver` resolves the fixture project template and returns a `DesiredArtefacts` whose
  front-door lists the bundles (pure helper test); the doc-11 task-list builder returns the right 12/11 titles.

## DoD
- Pure-over-ports (boundary clean — verify `biome check` on `src/core/operations/`; only services/ports/model/
  errors + `node:path`). `tsc --noEmit` clean, `biome check src test` clean with **0 warnings** (watch
  `noConfusingVoidType`: an `apply` that returns nothing must be typed `… | undefined`, not `… | void`, per
  the task-25 fix), `vitest run` green (SINGLE process), `npm ci` clean (no new deps). JSDoc every export
  (cite doc 10/11/13); no dead code.

## Previous-story intelligence (carried forward)
- task-25: the harness reloads post-apply, ④ is automatic; an `apply` returning nothing is typed `ApplyOutcome
  | undefined`. The fake's `exists` now FAITHFULLY follows aliases (broken → false) — so the scaffold MUST
  create the alias TARGET (`installer-skills/`) for the alias to read as present (this is WHY doc 06 ships the
  per-bundle `installer-skills/`). task-19 `RenderedFile.path`/`AliasPlanEntry.linkPath`/`aliasTo` are
  PROJECT-RELATIVE → join with root. task-13 `editYaml` preserves comments; assert a seeded comment survives.
  task-12 `MemoryFileSystem` normalizes POSIX → `/`-rooted roots in tests. Single-process vitest (task-18).
  Run `biome check --write` before the gate.

## Boundaries (do NOT do here)
- No commander / cli.ts / composition root (task-27/33). No real templates (tasks 30/31 — use fixtures). No
  OTHER operations (`enable`/`disable`/`requires`/`targets` — out of scope; only `createBundle`). No new deps.
  Don't edit docs/, AGENTS.md, backlog/, .bmad/ (incl. sprint-status), task-5's biome.json, task-10–25 source
  (compose them; if a genuine gap blocks an AC, surface it as a divergence — don't silently patch a prior
  task). If doc 10's `bundle new` surface differs from this sketch, the DOC wins — note the divergence.
