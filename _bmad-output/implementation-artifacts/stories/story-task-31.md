# Story task-31 — Author the default bundle template

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 07 §"Template layout"/§"The enforcement — Definition of Done"/§"The receipt — storage" + doc
> 06 §the skeleton/§"What the template's files actually say" + doc 09 §3 the per-task workflow + doc 08 §"Task
> tagging system"/§"How these tags ride on Backlog.md", against the task-26 `createBundle`/`createBundleSpec`
> contract I already built). CONTENT-AUTHORING: the real built-in BUNDLE template at `templates/bundle/default/`
> that `createBundle` renders into `bundles/<id>/`. The per-bundle scope-notes voice + the install-backlog
> recipe shape are FIXED product style (doc 00/06/07/08), authored from the docs — not invented.

## Story
As the task-26 `createBundle` operation (the `bundle new <id>` use case, doc 10), which resolves
`templates/bundle/default/` via `resolveTemplate(name, "bundle", …)`, renders its `files/` tree with
`renderTree({bundle-id, version, project-name})`, and writes the result into `bundles/<id>/` (then writes
`bundle.yml` itself, canonically), I need the real built-in `default` bundle template on disk: a `template.yml`
declaring the three parameters, and a `files/` tree carrying everything a working bundle needs EXCEPT
`bundle.yml` — per-bundle scope notes (`AGENTS.md`), a pre-initialized `install-backlog/` (a `config.yml` with
`task_prefix` + a Definition-of-Done, plus a starter detect→setup→verify task trio), the per-bundle
`installer-skills/` alias-target dir, the `payload/` delivery slots, and the `installer-scripts/` slot — with
every placeholder resolving at instantiation.

## Acceptance criteria (the contract — verbatim from the backlog)
1. Adding a bundle from the default template produces a working bundle: its descriptor, its install-backlog
   gated by a Definition of Done, and its scope notes (doc 07).
2. The produced bundle carries a detect-then-setup-then-verify task scaffold (doc 06/09).
3. Every placeholder in the template is substituted in the produced bundle.

## How AC maps to the deliverable (read first)
- **AC#1 "descriptor"** = `bundle.yml`. The TEMPLATE does NOT ship it — `createBundle` ③ APPLY writes it
  canonically (it is the structural source of truth for id/version/requires/confirmation; doc 10 step 4). The
  template ships *everything else*; the operation owns `bundle.yml`. So AC#1's "descriptor" is satisfied by the
  operation rendering the template (which produces the rest) AND writing `bundle.yml` — the test asserts the
  produced bundle has a parsing `bundle.yml` after `createBundle` runs, and that the template ships none (no
  double-write). [Source: docs/07-install-contract.md#Template layout; src/core/operations/create-bundle.ts]
- **AC#1 "install-backlog gated by a Definition of Done"** = `install-backlog/config.yml` carrying
  `task_prefix: {{bundle-id}}` + a `definition_of_done:` array whose items map one-to-one to the receipt facts
  (doc 07 §enforcement), PLUS each task file carrying its own `## Definition of Done` block (the shipped
  per-task gate; the config array is only the create-time DEFAULT, not retroactively applied to a
  pre-initialized backlog — confirmed by probe). [Source: docs/07-install-contract.md#The enforcement — Definition of Done]
- **AC#1 "scope notes"** = `AGENTS.md` per-bundle front-door scope notes ("closest-wins"; same front-door
  mechanic as root). [Source: docs/06-project-skeleton.md#Self-similar surfaces; docs/07-install-contract.md#Template layout]
- **AC#2 "detect→setup→verify scaffold"** = three valid Backlog.md task files in `install-backlog/tasks/`, each
  with a `kind:state` + `step:<slug>` label and the detect/setup/verify recording shape; task IDs prefixed
  `{{bundle-id}}-…`. [Source: docs/06-project-skeleton.md#the install-backlog two kinds; docs/08-versioning-and-migrations.md#Task tagging system; docs/09-installation-process.md#3 The per-task workflow]
- **AC#3 "every placeholder substituted"** = no `{{…}}` marker survives in any produced file's CONTENT or PATH
  after `createBundle` renders the template (incl. a `{{bundle-id}}-N - …` task filename — task-16 substitutes
  placeholders in paths too). [Source: src/core/services/render.ts; verified for project templates in task-30]

## Confirmed mechanics (READ — these are facts I established, not guesses)
- **The renderer (task-16, `src/core/services/render.ts`):** `{{kebab-name}}` substitution in BOTH path and
  content; a trailing `.tmpl` is stripped from the output path; an UNCONSUMED `{{…}}` after substitution is a
  render ERROR (`renderString` throws "invalid or unresolved placeholder"). So every marker MUST be one of the
  three declared params (`bundle-id`, `version`, `project-name`) — this is WHY AC#3 holds by construction. A
  literal `.keep` (no placeholders, no `.tmpl`) renders to itself.
- **The operation (task-26, `createBundleSpec.apply`):** resolves the bundle template (project-local shadows
  built-in), builds `params = {bundle-id: id, version, project-name: project.manifest.meta.name}`, runs
  `renderTree(resolution.template.files, params)`, writes each rendered file to `join(root, "bundles", id,
  file.path)`, THEN writes `bundles/<id>/bundle.yml` from a canonical `BundleManifest` via
  `serializeBundleManifest` + `stringifyYaml` (summary defaults to `"<id> bundle"`, confirmation `"safe"`,
  requires `{}`), THEN appends `<id>` to `manifest.bundles`. The harness then ④ re-derives the front-door and ⑤
  materialises the 12 authoring tasks. → **The template MUST NOT ship `files/bundle.yml`** (it would render
  then be clobbered, stripping comments — the task-26/31 double-write hazard). Also do NOT ship `CLAUDE.md` or
  the `.agents/.claude/.openclaw` scope aliases: doc 07 says those are MECHANISM (symlinks the operation/install
  creates), not template content.
- **The per-bundle alias-target dir:** the task-26 fixture shipped `files/installer-skills/.keep` so the
  per-bundle scope-alias TARGET dir (`bundles/<id>/installer-skills/`) EXISTS after scaffold (the rerender
  creates `bundles/<id>/.claude/skills → installer-skills`, which must be non-broken). MIRROR this — ship a
  `.keep` in `installer-skills/`.
- **Backlog.md (1.45.2) — pre-initialized backlog, no `backlog init` on the user machine** (doc 07: "a
  committed `config.yml` plus `tasks/` is all Backlog.md needs"). PROBED + CONFIRMED:
  - A `config.yml` with `task_prefix: <bundle-id>` is honored on the NEXT `task create` (a new task becomes
    `<bundle-id>-1`). The full set of keys `init` writes is large, but Backlog.md tolerates a MINIMAL
    `config.yml` for reading — it only needs `task_prefix` + the structural shape. Ship the keys doc 06/07 name
    (`task_prefix`, `definition_of_done`) plus the small set Backlog.md needs to operate (`project_name`,
    `default_status`, `statuses`, `filesystem_only: true`). Filesystem-only git (no remote/auto-commit) is the
    doc-07 "filesystem-only git" requirement.
  - A hand-authored task file is READ correctly by `backlog task list --plain` / `backlog task <id> --plain`
    when it has: YAML frontmatter (`id:` UPPERCASED e.g. `WEB-HANDOFF-1`; `title`; `status: To Do`;
    `assignee: []`; `labels:` as a quoted YAML list; `dependencies:` UPPERCASED ids or `[]`; `ordinal:`), then
    a `## Acceptance Criteria` section wrapped in `<!-- AC:BEGIN -->` / `<!-- AC:END -->` with `- [ ] #1 …`
    lines, and a `## Definition of Done` section wrapped in `<!-- DOD:BEGIN -->` / `<!-- DOD:END -->` with
    `- [ ] #1 …` lines. The per-task DoD block is what makes recording gate Done for a SHIPPED task (the config
    `definition_of_done` is only the create-time default; it is NOT injected into pre-authored files). The
    filename is `<ID-lowercased> - <Title-with-dashes>.md`.
- **`{{bundle-id}}` in a PATH segment:** task-16 substitutes placeholders in the path, so a task file named
  `{{bundle-id}}-1 - Detect ….md.tmpl` renders to `web-handoff-1 - Detect ….md`. Put the bundle id into the
  task filenames AND the frontmatter `id:` (uppercased the {{bundle-id}} can't be — but Backlog.md upper-cases
  on read regardless; ship the id as `{{bundle-id}}-1` etc. in the frontmatter `id:` — PROBED: a hand-authored
  lowercase id like `web-handoff-1` is still listed as `WEB-HANDOFF-1`, so lowercase-in-file is fine).
- **`step:<slug>` immutable identity + `kind:state`:** doc 08 — labels do NOT accumulate across repeated `-l`
  flags; ship both in ONE comma-separated `labels:` list. The detect/setup/verify trio are all `kind:state`
  (idempotent; re-run = Repair). Slugs unique per bundle (e.g. `detect`, `setup`, `verify`, or more specific).
- **Biome / packaging:** `biome.json` `files.includes` = `["src/**","test/**","*.json","*.ts"]` — `templates/**`
  is OUTSIDE biome's globs, so the template's `.md`/`.yml`/`.keep` are NOT linted/formatted (no formatting
  fight; the new TEST `.ts` IS linted). `package.json files` ALREADY includes `"templates"` (added in task-30)
  — so `npm pack` ships the new template; nothing to add there.

## The template tree to author
```
templates/bundle/default/
├── template.yml                                  # name: default, scope: bundle, parameters: [bundle-id, version, project-name]
└── files/                                        # createBundle renders this into bundles/<id>/ (with {{…}} substitution + .tmpl strip)
    ├── AGENTS.md.tmpl                             # AC#1 SCOPE NOTES: per-bundle front-door ("closest-wins"), bundle-scoped mechanic (doc 07)
    ├── installer-skills/
    │   └── .keep                                  # AC#1 fidelity: makes bundles/<id>/installer-skills/ EXIST so the rerender's scope alias is non-broken (task-26 fixture did exactly this)
    ├── payload/
    │   ├── files/.keep                            # delivered-content slot (doc 06/07): authoritative reference files (empty until authored)
    │   ├── templates/.keep                        # delivered-content slot (doc 06/07): parameterized files (empty until authored)
    │   └── agent-skills/
    │       └── {{bundle-id}}-skill/SKILL.md.tmpl  # OPTIONAL payload-skill stub: RUNTIME-trigger description, inert until install copies it (doc 06/07). {{bundle-id}} in the PATH proves path-substitution.
    ├── installer-scripts/
    │   └── .keep                                  # NOT templated content (doc 07: per-project/bespoke) — a .keep just preserves the slot
    └── install-backlog/                           # the PRE-INITIALIZED nested Backlog.md (doc 07: committed config.yml + tasks/ = no `backlog init`)
        ├── config.yml.tmpl                        # AC#1 GATE: task_prefix: {{bundle-id}} + definition_of_done (the 6 receipt facts) + filesystem-only git
        └── tasks/                                 # AC#2 the detect→setup→verify trio (valid Backlog.md task files; kind:state + step:<slug>; ids {{bundle-id}}-N)
            ├── {{bundle-id}}-1 - Detect whether the capability is already present.md.tmpl
            ├── {{bundle-id}}-2 - Set up the capability.md.tmpl
            └── {{bundle-id}}-3 - Verify the capability and record the receipt.md.tmpl
```
- **Placeholders (task-16 `{{kebab-name}}`):** `{{bundle-id}}` (AGENTS.md, config.yml, every task file's
  id/title/body, the payload-skill path), `{{version}}` (AGENTS.md/config note where useful), `{{project-name}}`
  (AGENTS.md — "part of the `{{project-name}}` project"). EVERY marker is one of these three → renders clean.
- **`.keep` files** carry NO placeholders and NO `.tmpl` → they render to themselves (a literal `.keep`),
  preserving otherwise-empty dirs through git + the renderer.

## Content to author (cite the docs; keep doc 06/07/08 voice)

### `template.yml`
```yaml
name: default
scope: bundle
description: The default bundle scaffold — per-bundle scope notes, a pre-initialized install-backlog (config.yml with task_prefix + a Definition of Done, and a starter detect→setup→verify task trio), the payload delivery slots, and the installer-skills / installer-scripts slots. The operation writes bundle.yml canonically; this template ships everything else.
parameters:
  - name: bundle-id
    description: The bundle's stable id (kebab-case); the install-backlog task_prefix and the task-id prefix.
    required: true
  - name: version
    description: The bundle's initial version (semver).
    required: true
  - name: project-name
    description: The parent project's name (for the per-bundle scope-notes front door).
    required: true
```
- (Mirror the task-30 `template.yml` shape: `name`/`scope`/`description`/`parameters[]` with `name`/
  `description`/`required`. The resolver only needs `name`+`scope`; the extra fields are descriptive.
  task-26's CHECK already validated `version`/`id`, but `template.yml` declaring all three params is correct +
  documents them.)

### `files/AGENTS.md.tmpl` (AC#1 — per-bundle scope notes, doc 07 §"Template layout" + doc 06 §"Self-similar surfaces")
- A SHORT per-bundle front door (closest-wins refines the root). State: this is the `{{bundle-id}}` bundle of
  the `{{project-name}}` project; the root `AGENTS.md` install loop still governs — these are scope notes that
  refine it WHILE this bundle is the working dir. Name the bundle-scoped mechanic: when an agent works this
  bundle as cwd, this `AGENTS.md` and any `installer-skills/` here compose with the root (union for skills,
  closest-wins for instructions, doc 06). Note the bundle's recipe is `install-backlog/` (detect→setup→verify),
  its delivered content is `payload/`, and that recording is gated by the install-backlog's Definition of Done.
  Keep it lean (it must sit in context while this bundle is worked). Cite the doc voice; do NOT restate the
  whole root front door.

### `files/install-backlog/config.yml.tmpl` (AC#1 GATE — doc 07 §enforcement + doc 08 §"How these tags ride")
- `task_prefix: "{{bundle-id}}"` (self-describing ids like `{{bundle-id}}-1`; MUST be set before tasks exist —
  the shipped tasks already use it).
- `definition_of_done:` — the six receipt facts (doc 07 §enforcement, ONE-TO-ONE), phrased as self-attestable
  checklist items the executor ticks before Done:
  1. effect verified against the task's acceptance criteria (doc 09 "verify before record");
  2. files placed/modified are recorded via `--ref` and their checksum journaled in the notes;
  3. ownership recorded (installed-vs-adopted) in the notes;
  4. the inverse op (uninstall step + condition) recorded in the notes;
  5. decisions + rationale recorded (notes or `--final`);
  6. non-file effects (services, registrations, builds) recorded in the notes.
- The minimal Backlog.md operating keys so the pre-initialized backlog reads/operates: `project_name:
  "{{bundle-id}}"`, `default_status: "To Do"`, `statuses: ["To Do", "In Progress", "Done"]`,
  `filesystem_only: true` (the doc-07 "filesystem-only git"). SINGLE-SPACE inline comments (eemeli/yaml reflow
  forward-note) IF any inline comment is used — though config.yml here is plain.

### `files/install-backlog/tasks/{{bundle-id}}-1 - Detect ….md.tmpl` (AC#2 — DETECT, doc 09 ②)
- Frontmatter: `id: {{bundle-id}}-1`; `title: Detect whether the capability is already present`;
  `status: To Do`; `assignee: []`; `labels: ['kind:state', 'step:detect']`; `dependencies: []`; `ordinal: 1000`.
- `## Acceptance Criteria` (AC:BEGIN/END): `- [ ] #1 the bundle's intent is checked against this environment by
  inspection, and whether it is already satisfied (and by what mechanism) is determined — never assumed`.
- `## Definition of Done` (DOD:BEGIN/END): the same six receipt facts as config (a shipped task carries its own
  DoD block — that is the gate for a pre-initialized backlog). For a pure-detection step with no reversible
  effect, the body notes the executor may `--no-dod-defaults` ONLY where genuinely no effect is produced
  (doc 07 §enforcement allows opting a no-effect step out) — but ship the full block; the executor prunes.
- Body prose (after the DoD block): the detect recipe — "Read this task's prior receipt entry (keyed by
  `step:detect`); inspect the environment for the capability; if already satisfied, RECORD + skip to verify;
  else proceed to `{{bundle-id}}-2`." Author-placeholder: "⟨describe what 'present' means for {{bundle-id}}⟩".

### `files/install-backlog/tasks/{{bundle-id}}-2 - Set up ….md.tmpl` (AC#2 — SETUP, doc 09 ③④)
- Frontmatter: `id: {{bundle-id}}-2`; `title: Set up the capability`; `labels: ['kind:state', 'step:setup']`;
  `dependencies: ['{{bundle-id}}-1']` (UPPERCASE on read; lowercase-in-file is accepted — PROBED); `ordinal:
  2000`.
- AC: `- [ ] #1 the capability is installed or the user's existing one is adopted, honoring the bundle's
  confirmation level; what was placed is captured for the receipt`.
- DoD block: the six facts. Body: "DETECT first (idempotent — skip if `{{bundle-id}}-1` found it satisfied);
  perform the setup honoring `bundle.yml.confirmation`; capture placed files (`--ref`), ownership
  (installed-vs-adopted), the inverse op, and any non-file effect into the notes BEFORE Done."
  Author-placeholder: "⟨the concrete setup for {{bundle-id}}: place payload/files, run installer-scripts, …⟩".

### `files/install-backlog/tasks/{{bundle-id}}-3 - Verify … and record ….md.tmpl` (AC#2 — VERIFY, doc 09 ⑤⑥)
- Frontmatter: `id: {{bundle-id}}-3`; `title: Verify the capability and record the receipt`; `labels:
  ['kind:state', 'step:verify']`; `dependencies: ['{{bundle-id}}-2']`; `ordinal: 3000`.
- AC: `- [ ] #1 the bundle's acceptance criteria hold now (the agent reasons about real success, handing off to
  the user where a step needs them), and the receipt entries written during setup are confirmed`.
- DoD block: the six facts. Body: "VERIFY against the acceptance criteria (doc 07: DoD gates, verify confirms —
  re-read the setup task's recorded entries to confirm them); hand to the user where a check needs them; RECORD
  the confirmation. This is the bundle's closing step." Author-placeholder: "⟨the concrete check for
  {{bundle-id}}: a version prints, a smoke test passes, the user confirms a sample⟩".

### `files/payload/agent-skills/{{bundle-id}}-skill/SKILL.md.tmpl` (OPTIONAL payload stub, doc 06/07)
- SKILL.md frontmatter `name: {{bundle-id}}-skill`, a placeholder description that triggers on the bundle's
  RUNTIME use (NOT install) — "Use when …⟨the runtime need {{bundle-id}} serves⟩". A one-line placeholder body.
  doc 06: payload skills are inert in the repo until install copies them into a scanned scope; namespaced; never
  a bare `skills/`. The `{{bundle-id}}` in the PATH additionally proves task-16 path-substitution in the test.
- (This is OPTIONAL per the brief; including it strengthens AC and exercises a `{{bundle-id}}` PATH segment +
  the payload slot. If it complicates the gate, the `.keep`s alone satisfy doc 06's minimal payload slots — but
  prefer shipping it.)

### `.keep` files
- `files/installer-skills/.keep`, `files/payload/files/.keep`, `files/payload/templates/.keep`,
  `files/installer-scripts/.keep` — empty (or a one-line `# placeholder so the dir ships` comment is fine;
  empty is simplest). No `.tmpl`, no placeholders.

## Tests (`test/unit/templates/default-bundle.test.ts`) — close the loop with task-26 via the REAL template
PURE over `MemoryFileSystem`, mirroring `test/unit/templates/minimal-project.test.ts`. Steps:
1. **Mirror the real `templates/` tree into memory** (reuse the task-30 test's `mirror`/`seedTemplates`
   approach: `readdirSync`/`readFileSync` from the on-disk `templates/` into `MemoryFileSystem` at a BUILTIN
   root — tests MAY use `node:fs`). This exercises the GENUINE authored template, not a fixture copy.
2. **Seed a project the way `init`/the task-26 seed does:** a `manifest.yml` (with a comment to prove the append
   preserves it), an initialized authoring backlog via `FakeBacklog.init`, and the ROOT `installer-skills/`
   target dir (so the root rerender alias is non-broken). Mirror the REAL project template too (it's under the
   same `templates/` tree, so the single mirror covers both — the deriver resolves `project/minimal` from it).
3. **Run `createBundle` for a sample id** (e.g. `web-handoff`) through `runMutation(lifecycleDeps, {root}, spec,
   {id: "web-handoff"})`, with `spec = createBundleSpec({builtinTemplatesRoot: BUILTIN, bundleTemplateName:
   "default"})` and `lifecycleDeps.deriveArtefacts = makeArtefactDeriver({fs, builtinTemplatesRoot: BUILTIN,
   projectTemplatesRoot: `${ROOT}/templates`, projectTemplateName: "minimal"})`.
4. **Assert the produced `bundles/web-handoff/`:**
   - **AC#1 descriptor:** `bundle.yml` exists and PARSES (`parseBundleManifest(parseYaml(...))`), id ===
     "web-handoff" — written by the OPERATION.
   - **AC#1 single-write:** the TEMPLATE ships no `bundle.yml` → assert `resolveTemplate("default","bundle",…)
     .template.files` contains NO entry whose rendered/`.tmpl`-stripped path is `bundle.yml` (prove no
     double-write at the source); and `result.changedPaths` lists `bundles/web-handoff/bundle.yml` exactly once.
   - **AC#1 install-backlog gate:** `install-backlog/config.yml` exists, parses as YAML,
     `task_prefix === "web-handoff"`, and `definition_of_done` is a NON-empty array (≥ the six facts).
   - **AC#1 scope notes:** `AGENTS.md` exists and its content carries the scope-notes markers (e.g.
     "web-handoff", the project name "demo", "closest-wins"/"scope", "install-backlog").
   - **AC#2 detect→setup→verify:** the three task files exist at their SUBSTITUTED paths
     (`install-backlog/tasks/web-handoff-1 - Detect….md`, `-2 - Set up….md`, `-3 - Verify….md`); each content
     contains `kind:state` and its `step:` slug (`step:detect`/`step:setup`/`step:verify`); `-2` depends on
     `WEB-HANDOFF-1`, `-3` on `WEB-HANDOFF-2`; each has a `## Acceptance Criteria` and a `## Definition of Done`
     block.
   - **AC#3 no marker survives:** walk EVERY file the operation wrote under `bundles/web-handoff/` (collect them
     from `result.changedPaths`, or list the dir via the FS port) and assert neither the CONTENT nor the PATH
     matches `/\{\{[^}]*\}\}/`. (Belt-and-suspenders: also render the raw `template.files` with the three params
     and assert no leftover.)
   - **AC#1 manifest:** "web-handoff" appended to `manifest.yml`, the seeded comment survives, the manifest
     parses; the front-door was re-derived and lists "- web-handoff bundle".
5. **(OPTIONAL, ISOLATED) real-`backlog`-CLI integration test** proving the rendered `install-backlog` is a
   VALID pre-initialized backlog: render the bundle template to a real tmpdir (write the rendered files with
   `node:fs`), then run `backlog task list --plain` with cwd at the rendered `install-backlog/` and assert the
   three tasks (`WEB-HANDOFF-1/2/3`) list. ISOLATE per the memory note: per-test tmpdir + per-test `HOME`/
   `XDG_CONFIG_HOME`, and set `fileParallelism: false` (or a `describe.sequential` / a separate `*.integration.
   test.ts` excluded from the parallel default) — the real-backlog tests are flaky under concurrency. If this
   proves fiddly under the single-process vitest gate, the in-memory assertions above ALREADY satisfy all three
   ACs; treat the CLI test as confirming-evidence, not load-bearing.

> The test reads the real files from `templates/` via `node:fs` into the `MemoryFileSystem` (the resolver +
> operation read through the FS port — the CORE boundary stays intact; only the TEST touches `node:fs`). This
> is exactly the task-30 pattern.

## DoD (the backlog DoD for task-31)
- `tsc --noEmit` clean; `biome check src test` clean with **0 errors / 0 warnings** (run `biome check --write
  src test` first to clear import-organize/format nits on the new TEST `.ts`; `templates/**` is outside biome's
  globs so the template files are not linted — note this). `vitest run` green (SINGLE process). `npm ci` clean
  (`templates` already in `package.json files`). Core import-boundary intact (no `node:fs`/`commander`/`execa`
  in `src/core/`; the test's `node:fs` is in `test/`). No dead code; the new test helper documented.

## Previous-story intelligence (carried forward — task-26, task-30)
- **task-26 fixtures are the contract for the template shape:** the bundle template fixture shipped
  `files/bundle.yml` (id/version only), `files/installer-skills/.keep`, `files/install-backlog/config.yml`
  (task_prefix only). For the REAL template: DROP `files/bundle.yml` (the forward-note + the operation writing
  it canonically), KEEP `installer-skills/.keep`, and EXPAND `config.yml` (add the DoD) + ADD the task trio +
  payload/installer-scripts slots + `AGENTS.md`. The operation's params are EXACTLY `{bundle-id, version,
  project-name}` — use only those three placeholders.
- **task-30 established:** the real-template-into-MemoryFileSystem test pattern (`mirror` via `node:fs`); the
  `.tmpl`-strip + path-substitution behavior; `templates` is already in `package.json files`; `templates/**` is
  outside biome globs (no formatting fight, but run `biome check --write` on the new `.ts`); single-process
  vitest (task-18); the eemeli/yaml single-space-inline-comment forward-note (applies if any `.yml` here uses
  inline comments).
- **Probe (this session):** a pre-initialized `config.yml` `task_prefix` is honored on next create; a
  hand-authored task file with AC:BEGIN/END + DOD:BEGIN/END blocks lists + reads correctly; the config
  `definition_of_done` array is the create-time DEFAULT (NOT injected into pre-authored files) — so each shipped
  task MUST carry its own `## Definition of Done` block. Real-backlog tests need HOME/XDG isolation +
  `fileParallelism:false`.

## Boundaries (do NOT do here)
- Do NOT ship `files/bundle.yml` (operation owns it — render-then-clobber hazard). Do NOT ship `CLAUDE.md` or
  `.agents/.claude/.openclaw` scope aliases (doc 07: mechanism, not template). Do NOT author a real payload/
  installer-script (per-project/bespoke; ship slots + an optional skill STUB only). Do NOT add the
  `bundle/single` or other bundle templates (only `bundle/default`). Do NOT edit `docs/`, the repo-root
  `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status), or the dev `backlog/` — the install-backlog you
  author lives under `templates/.../install-backlog/` (template CONTENT with `{{bundle-id}}` placeholders; the
  `backlog` CLI cannot author it; the `templates/` hookify carve-out lets Write/Edit author it). Do NOT touch
  task-10–27 source. If doc 06/07/08/09 specify something this sketch omits, the DOC wins — add it + note the
  divergence in the final report.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
