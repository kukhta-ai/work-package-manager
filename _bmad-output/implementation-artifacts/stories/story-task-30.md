# Story task-30 — Author the minimal project template

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 06 §"What the template's files actually say"/§the skeleton + doc 07 §"The front door —
> policy"/§"Template layout" + the task-17 `resolveTemplate`, task-16 `render`, task-19 `deriveArtefacts`, and
> task-26 `makeArtefactDeriver`/`derive-artefacts-capability.ts` contracts I already built). CONTENT-AUTHORING:
> the real built-in project template at `templates/project/minimal/`. The front-door shape + voice are FIXED
> product style (doc 00/07), authored from the docs — not invented.

## Story
As `init` (the project-creating command, later tasks) and the task-26 `makeArtefactDeriver` (which resolves
the front-door + orchestrator snippets), I need the real built-in `minimal` project template on disk: a
`template.yml`, a `files/` tree `init` copies into a new project root (manifest, front-door, loop-instructions,
README, orchestrator skill), and a `snippets/` tree of on-demand stubs (the front-door + orchestrator the
deriver resolves, plus advisor / install-time / payload skill stubs the add-commands render) — every
placeholder resolving at instantiation.

## Acceptance criteria (the contract)
1. Initialising from the minimal project template produces a working project: a manifest, an always-read
   front-door file, the unattended-loop instructions, an entry README, and the project's orchestrator skill
   (doc 06/07).
2. The front-door file carries recognition-and-kickoff, the install shape, and the standing rules described in
   doc 07 §"The front door — policy".
3. On-demand stubs for an advisor skill, an install-time skill, and a payload skill are available for later
   use (doc 06; doc 07's three rendered-skill shapes).
4. Every placeholder in the template is substituted in the produced project, leaving no unresolved markers.

## Developer context (the docs — the FIXED content)
- doc 06 §"What the template's files actually say": the `AGENTS.md` (root) carries (1) recognition+kickoff,
  (2) the install shape, (3) the standing rules; the `<project>-installer/SKILL.md` is the orchestrator (when-
  to-use + loop mechanics + how to drive Backlog.md, with `references/journaling.md` for the receipt recipe);
  `RALPH-LOOP.md` is the plain-prose unattended-loop prompt (install task statement + per-iteration SDLC
  instructions); the advisor/installer-skill/payload-skill stubs each have a distinct trigger discipline.
- doc 07 §"The front door — policy" (AC#2 source — author from this, cite it):
  - **Recognition and kickoff** — the opening flips the agent's stance from "read and edit this codebase" to
    "install this project"; names the entry points (point the agent here, invoke `{{project-name}}-installer`,
    or `/goal: install this project`); points at any vendored discipline skills + `RALPH-LOOP.md` for
    unattended runs.
  - **The shape of the install** — orient on the manifest → detect what's present → offer the bundles as a
    menu (rendered from each bundle's `summary` → the `{{bundles}}` placeholder) → resolve `requires` + preview
    a plan for consent → work each selected bundle's backlog task-by-task (detect→…→verify→record), deferring
    and resuming across restarts → close with how to use what was installed.
  - **The standing rules** — record only what inspection can't recover; read a task's prior record before
    acting and reuse decisions; only reverse what you installed; decide a shared dependency's removability from
    the graph (not a counter); checksum a config file before overwriting and ask on conflict; contain a
    failing bundle; pause at confirmation points and resume from the record.
  - Mechanics are NOT in the front door — they live in the orchestrator skill's `references/journaling.md`
    (progressive disclosure). The README is "a short human entry (what it installs + a pointer into docs/)".
- doc 07 §"Template layout": the project template's TEMPLATE files are `AGENTS.md`, `manifest.yml`, `README.md`,
  the orchestrator `SKILL.md` + `references/journaling.md`, and the advisor/payload skill shapes (the three
  rendered-skill shapes). `CLAUDE.md` and the scope aliases are MECHANISM (symlinks the install creates), NOT
  templated — so they are NOT in this template.

## Confirmed mechanics (read before authoring)
- task-17 `resolveTemplate(name, scope, {fs, builtinTemplatesRoot, projectTemplatesRoot?})` reads `<root>/
  <scope>/<name>/template.yml` (needs `name` + `scope`; optional `parameters`) + `files/` + `snippets/` trees.
- task-16 `render`: `{{kebab-name}}` substitution in BOTH path and content; a trailing `.tmpl` is stripped from
  the output path. So `manifest.yml.tmpl` → `manifest.yml`, `installer-skills/{{project-name}}-installer/
  SKILL.md.tmpl` → `installer-skills/<name>-installer/SKILL.md`. An UNCONSUMED `{{…}}` after substitution is a
  render ERROR (task-16 enforces "substitution only" — so EVERY marker must be a declared param).
- task-26 `selectArtefactSnippets` keys: front-door = a snippet path that is/ends `AGENTS.md`(`.tmpl`);
  orchestrator = a snippet path containing `installer-skills/` AND `-installer/` ending `SKILL.md`. The real
  snippets MUST sit at those paths (mirror the task-26 fixtures).
- biome.json `files.includes` = `["src/**","test/**","*.json","*.ts"]` — `templates/**` is NOT under biome's
  globs, so the template's `.md`/`.yml` are NOT linted/formatted by biome. No exclusion config needed (record
  this). `package.json files` = `["dist","docs"]` — MUST add `"templates"` (the composition root resolves
  `builtinTemplatesRoot = ../templates`; `npm pack` must ship it).

## The template tree to author
```
templates/project/minimal/
├── template.yml                         # name: minimal, scope: project, parameters: [project-name]
├── files/                               # copied into the new project root at init (with substitution)
│   ├── manifest.yml.tmpl                # project meta ({{project-name}}, version 0.1.0) + targets: [] + bundles: []
│   │                                    #   SINGLE-SPACE inline comments (eemeli/yaml re-aligns multi-space
│   │                                    #   document-wide on a later edit; single-space keeps a `version bump`
│   │                                    #   diff line-local — forward note)
│   ├── AGENTS.md.tmpl                    # the FRONT DOOR (AC#2): recognition+kickoff / install shape / standing rules
│   ├── RALPH-LOOP.md.tmpl               # the unattended-loop prompt (install task statement + per-iteration SDLC)
│   ├── README.md.tmpl                   # short human entry: what it installs + pointer into docs/
│   └── installer-skills/
│       └── {{project-name}}-installer/
│           ├── SKILL.md.tmpl            # the ORCHESTRATOR (when-to-use + loop mechanics + how to drive Backlog.md)
│           └── references/
│               └── journaling.md.tmpl  # the receipt recipe (field/label/notes mapping) — doc 07 §storage
└── snippets/                            # on-demand stubs (NOT copied at init; rendered later)
    ├── AGENTS.md                        # FRONT-DOOR snippet the deriver resolves (task-26) — same content as files/AGENTS.md.tmpl
    ├── installer-skills/{{project-name}}-installer/SKILL.md   # ORCHESTRATOR snippet the deriver resolves
    ├── advisor.SKILL.md.tmpl           # AC#3 advisor stub: description triggers on the user's NEED; body recommends the bundle
    ├── installer-skill.SKILL.md.tmpl   # AC#3 install-time skill stub: frontmatter name + placeholder description/body
    └── payload-skill.SKILL.md.tmpl     # AC#3 payload stub: triggers on RUNTIME use, never install
```
- **Placeholders** (task-16 `{{kebab-name}}`): `{{project-name}}` (everywhere), `{{bundles}}` (the front-door
  install-shape menu). The orchestrator/README use `{{project-name}}`. The three stubs that name a
  bundle/skill use a placeholder for that (e.g. `{{bundle-id}}` / `{{skill-name}}`) — BUT since those stubs are
  rendered by the add-commands with their own params (not at `init`), and the AC#4 scan is over the `init`-time
  produced project, the stubs are NOT instantiated at init; the AC#4 no-marker scan covers the `files/` tree +
  the front-door/orchestrator snippets the deriver renders. (The stubs' own placeholders are validated by
  rendering them with sample params in the test, proving they resolve.)
- **template.yml** declares `parameters: [{name: project-name}]` so `init` knows the param. (task-16 errors on
  an unconsumed marker, so any param a file uses must be supplied at render — the test supplies project-name +
  bundles for the front-door, and bundle-id/skill-name when rendering a stub.)

## Content to author (AC#2 — FROM doc 07, cite it; keep doc 00/07 voice)
### `files/AGENTS.md.tmpl` (the front door) — three sections, doc 07 §"The front door — policy"
- **Recognition & kickoff**: a lead that says this is a `{{project-name}}` installer-project built with wpm,
  and the agent's job is to INSTALL it (not edit the repo); name the entry points (you're reading the front
  door; or invoke the `{{project-name}}-installer` skill; or `/goal: install this project`); note vendored
  discipline skills in `installer-skills/` and `RALPH-LOOP.md` for unattended runs.
- **The install shape**: orient on `manifest.yml` → detect → offer the bundle menu (the `{{bundles}}`
  summaries) → resolve `requires` + preview for consent → work each bundle's `install-backlog` task-by-task
  (detect→setup→verify→record), resuming across restarts → finish with how to use it. State the per-task
  workflow in brief; defer procedure to the orchestrator skill.
- **Standing rules**: the seven doc-07 rules (record-only-non-recoverable / read-prior-record-and-reuse /
  reverse-only-what-you-installed / shared-dep-from-graph / checksum-before-overwrite-and-ask / contain-a-
  failing-bundle / pause-at-confirmation-and-resume). Point at `references/journaling.md` for the exact
  recording mechanics (NOT in the front door).
### `files/installer-skills/{{project-name}}-installer/SKILL.md.tmpl` (orchestrator)
- SKILL.md frontmatter (`name: {{project-name}}-installer`, a description triggering on "install this
  project"); body = the procedural expansion of the install shape (orient/detect/offer/resolve/drive-the-loop)
  + a pointer to `references/journaling.md` for the receipt mechanics.
### `files/installer-skills/{{project-name}}-installer/references/journaling.md.tmpl`
- The receipt recipe (doc 07 §storage): which Backlog.md field holds which fact (`--ref`/`--ac`/`--dep` + the
  structured notes block for ownership/inverse-op/checksum/decision), MCP-preferred / `--plain` fallback.
### `files/RALPH-LOOP.md.tmpl` (doc 06 §RALPH-LOOP)
- Plain prose: the install task statement + the per-iteration SDLC (work one task at a time, use the receipt —
  not conversation memory — to know what's done and resume, halt on a handoff or DoD failure). It's the
  per-iteration PROMPT a loop feeds each fresh instance; also the portable fallback.
### `files/README.md.tmpl`
- Short human entry: what `{{project-name}}` installs + a pointer into `docs/` (and a one-liner on how an agent
  starts: read `AGENTS.md` or invoke the installer skill).
### `files/manifest.yml.tmpl`
- `project: { name: {{project-name}}, version: 0.1.0 }`, `targets: []`, `bundles: []`. Single-space inline
  comments. (Matches the task-11 manifest schema: project.name + project.version required; targets + bundles
  arrays.)
### `snippets/AGENTS.md` + `snippets/installer-skills/{{project-name}}-installer/SKILL.md`
- The deriver-resolved snippets — the SAME front-door + orchestrator content as the `files/` versions (the
  deriver re-renders the front-door on every mutation; the on-demand snippet IS that source). (No `.tmpl` on
  the snippet AGENTS.md so the deriver's `path === "AGENTS.md"` test matches directly; the orchestrator snippet
  path matches `installer-skills/…-installer/SKILL.md`.)
### The three AC#3 stubs (snippets, `.tmpl`)
- `advisor.SKILL.md.tmpl`: frontmatter `name: {{bundle-id}}-advisor`, a placeholder description ("triggers on
  the user's NEED for …") + a placeholder recommendation body — the agent fills the real trigger/recommendation
  (the "Write advisor content" task). doc 07: advisor triggers on the user's need.
- `installer-skill.SKILL.md.tmpl`: frontmatter `name: {{skill-name}}` + placeholder description/body — a
  bundle/project install-time helper stub.
- `payload-skill.SKILL.md.tmpl`: frontmatter `name: {{skill-name}}` + a placeholder RUNTIME-trigger
  description — the delivered product; inert until install copies it.

## Tests (`test/unit/templates/minimal-project.test.ts`) — instantiate the template directly (no init command)
PURE over `MemoryFileSystem` + the task-17 resolver + task-16 render. A helper `instantiate(fs, root, params)`:
resolve the template, `renderTree(template.files, params)`, `fs.write(join(root, f.path), f.content)` each
(goes through the FS port — core boundary intact). Then assert:
- **AC#1**: the produced project has `manifest.yml`, `AGENTS.md`, `RALPH-LOOP.md`, `README.md`, and
  `installer-skills/<name>-installer/SKILL.md` (+ `references/journaling.md`). The manifest PARSES
  (parseYaml + parseManifest) with the substituted name + version + empty bundles/targets.
- **AC#2**: the produced `AGENTS.md` contains substantive markers of EACH doc-07 element — recognition/kickoff
  (e.g. "install this project", the installer-skill name, RALPH-LOOP), the install shape (manifest / bundle
  menu / detect / requires / per-task workflow / resume), and the standing rules (record / reverse only what
  you installed / checksum / confirmation). Assert on CONTENT phrases, not mere file presence.
- **AC#3**: resolve the three stub snippets from `template.snippets` and render each with sample params
  (`{{bundle-id}}` = "web", `{{skill-name}}` = "detect-os") → they resolve to a `name:` frontmatter and a
  placeholder body, with NO leftover marker.
- **AC#4**: scan EVERY produced file (the rendered `files/` tree + the rendered front-door + orchestrator
  snippets) for `/\{\{[^}]*\}\}/` → ZERO matches (no unresolved marker).
- **Loop closure with task-26/27**: build a `Project` (name = the instantiated name, empty bundles) and run it
  through `makeArtefactDeriver({fs, builtinTemplatesRoot: "templates", projectTemplatesRoot, projectTemplateName:
  "minimal"})` → it RESOLVES the front-door + orchestrator snippets (no throw) and returns a `DesiredArtefacts`
  whose front-door content carries the recognition line — proving the real template satisfies the task-26
  deriver. (Seed the template into the SAME MemoryFileSystem at `templates/project/minimal/` so the resolver
  finds it; OR point the resolver at the real on-disk `templates/` via a real-fs read in an integration test —
  prefer the in-memory copy for a pure unit test, mirroring task-26.)

> Note: the test must seed the template content into the `MemoryFileSystem` (the resolver reads through the FS
> port). Read the real files from disk in the test via `node:fs` ONLY in a `test/` helper (tests may use
> node:fs), or inline the canonical content — prefer reading the real authored files from `templates/` with
> `node:fs` in the test so the test exercises the ACTUAL shipped template, not a copy.

## Packaging (required)
- Add `"templates"` to `package.json` `files` (so `npm pack` ships it; the composition root needs it at
  `../templates` from `dist/`). Regenerate the lockfile if needed + `npm ci`. (No new deps.)

## DoD
- `tsc --noEmit` clean; `biome check src test` clean with **0 warnings** (templates/ is outside biome's
  `files.includes`, so the template's `.md`/`.yml` are not linted — note this; the TEST `.ts` is). `vitest run`
  green (SINGLE process); `npm ci` clean. Core boundary intact (the instantiation helper writes via the FS
  port; no `node:fs` in `src/core/`). No dead code; document any helper.

## Previous-story intelligence (carried forward)
- task-26 fixtures established the exact snippet paths the deriver keys on — MIRROR them (`snippets/AGENTS.md`,
  `snippets/installer-skills/{{project-name}}-installer/SKILL.md`). task-16 strips `.tmpl` and ERRORS on an
  unconsumed `{{…}}` — so every marker must be a declared/supplied param (this is WHY AC#4 holds by
  construction, and why the test renders the stubs with sample params). manifest single-space inline comments
  (task-13 eemeli/yaml reflow). `MemoryFileSystem` POSIX-normalizes paths. Single-process vitest (task-18).
  templates/ is outside biome globs (no formatting fight). Run `biome check --write` on the test `.ts` before
  the gate.

## Boundaries (do NOT do here)
- No `init` COMMAND (later task — instantiate the template directly in the test; note init is deferred). No
  `single-bundle`/`multi-bundle` project templates or the `bundle/default` template (task-31 — author ONLY
  `project/minimal`). No `CLAUDE.md`/scope-alias files in the template (doc 07: those are mechanism, symlinks
  the install creates, not templated). No new deps. Don't edit the REPO-ROOT `AGENTS.md` (the template's OWN
  `AGENTS.md` under `templates/` IS the deliverable). Don't edit docs/, backlog/, .bmad/ (incl. sprint-status),
  task-5's biome.json (except — if truly needed — note it), task-10–27 source. If doc 06/07 specify files this
  sketch omits, the DOC wins — add them + note the divergence.
