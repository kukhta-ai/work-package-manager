# Test Automation Summary — task-30 (the minimal project template)

> bmad-qa-generate-e2e-tests output (sprint-status writes suppressed — orchestrator-owned). The deliverable is
> a content template (no UI/HTTP/CLI), so the "E2E" framing lands as acceptance tests exercising the REAL
> shipped template through the public resolver/render path as a black box, matching the repo's
> `*.acceptance.test.ts` house pattern. Framework: vitest. No new deps.

## Generated tests

### Unit (mechanics) — `test/unit/templates/minimal-project.test.ts` (bmad-dev-story) — 5
- AC#1 produces manifest + AGENTS.md + RALPH-LOOP.md + README.md + orchestrator SKILL.md + journaling.md; manifest parses (name/version/empty lists).
- AC#2 the front-door's three doc-07 sections (recognition+kickoff / install shape / standing rules) by CONTENT.
- AC#3 the three stub snippets resolve + render with sample params.
- AC#4 no unresolved `{{…}}` marker across produced files + the deriver snippets.
- loop closure: the task-26 `makeArtefactDeriver` resolves the front-door + orchestrator from this template.

### Acceptance (black box via the resolver/render path, AC-framed) — `test/unit/templates/minimal-project.acceptance.test.ts` — 4
- AC#1 "a fresh project root, ready to install into".
- AC#2 "the front door states policy; the orchestrator supplies procedure".
- AC#3 "the three rendered-skill shapes, scaffolded and ready" (advisor → user NEED, payload → RUNTIME).
- AC#4 "every marker resolved; the deriver closes the loop with task-26/27".

Both files MIRROR the REAL on-disk `templates/` into a MemoryFileSystem (via node:fs) and exercise the genuine authored content — not an inlined copy.

## Coverage / AC evidence (cite doc 06/07)
- AC#1 (doc 06/07): instantiating `minimal` yields the 5 required artefacts; the manifest is valid (parseManifest).
- AC#2 (doc 07 §"The front door — policy"): the front-door `AGENTS.md.tmpl` carries the three FIXED elements, authored from doc 07 with its vocabulary:
  - recognition+kickoff (flip stance to "install"; entry points: the front door / the `{{project-name}}-installer` skill / `/goal: install this project`; vendored discipline skills + RALPH-LOOP for unattended runs),
  - the install shape (orient on manifest → detect → bundle menu via `{{bundles}}` → resolve requires + preview for consent → per-bundle backlog detect→setup→verify→record, resume across restarts → close),
  - the standing rules (record-only-non-recoverable / read-prior-record-and-reuse / reverse-only-what-you-installed / shared-dep-from-graph / checksum-before-overwrite-and-ask / contain-a-failing-bundle / pause-at-confirmation), with mechanics deferred to `references/journaling.md`.
- AC#3 (doc 06; doc 07's three rendered-skill shapes): advisor / install-time / payload stubs, each with its distinct trigger discipline.
- AC#4: task-16 errors on an unconsumed `{{…}}`, so a clean render PROVES no stray marker; the scan asserts it across every produced file's content + path.

## The template tree authored
```
templates/project/minimal/
├── template.yml                         (name: minimal, scope: project, parameters: [project-name])
├── files/  manifest.yml.tmpl · AGENTS.md.tmpl · RALPH-LOOP.md.tmpl · README.md.tmpl ·
│           installer-skills/{{project-name}}-installer/SKILL.md.tmpl + references/journaling.md.tmpl
└── snippets/ AGENTS.md · installer-skills/{{project-name}}-installer/SKILL.md (deriver-resolved) ·
            advisor.SKILL.md.tmpl · installer-skill.SKILL.md.tmpl · payload-skill.SKILL.md.tmpl (AC#3 stubs)
```
Placeholders: `{{project-name}}` (everywhere), `{{bundles}}` (front-door menu), `{{bundle-id}}`/`{{skill-name}}` (stubs, supplied by the add-commands later). `.tmpl` is stripped on render.

## How instantiation was tested
No `init` command yet (deferred to a later task), so the template is instantiated DIRECTLY: mirror the real `templates/` into a MemoryFileSystem, `resolveTemplate("minimal","project",…)` (task-17), `renderTree`/`renderSnippet` (task-16), write via the FS port (core boundary intact). The task-26 `makeArtefactDeriver` is run against the same in-memory copy to prove the deriver finds the front-door + orchestrator snippets.

## Packaging
- Added `"templates"` to `package.json` `files` (so `npm pack` ships it; the composition root resolves `builtinTemplatesRoot = ../templates` from `dist/`). No deps changed → lockfile unchanged; `npm ci` clean.

## biome / formatting note
- biome.json `files.includes` = `["src/**","test/**","*.json","*.ts"]`, so `templates/**` (`.md`/`.yml`) is OUTSIDE biome's scope — the template content is not linted/formatted by biome, and no exclusion config is needed. The test `.ts` IS in scope and is clean.

## Divergences (doc wins; see story)
- The template does NOT include `CLAUDE.md` or scope-alias dirs — doc 07 explicitly classifies those as MECHANISM (symlinks the install creates), not templated content. Matches doc 07 §"Template layout".

## Result
- minimal-project.test.ts: 5 passed. minimal-project.acceptance.test.ts: 4 passed. (Full-suite + tsc + biome 0-warnings verified in the gate.)

## Next steps
- task-31 (the bundle templates: `default`, `with-payload-skill`, `adopts-system-tool`) + `single-bundle`/`multi-bundle` project templates. task-33 (the walking skeleton wires the real templates through `init`/the deriver). The `init` command (a later task) instantiates this template.
