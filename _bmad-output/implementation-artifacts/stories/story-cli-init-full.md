---
baseline_commit: 54b974d94fb98c4220eadb619443e431d2c28800
---
# Story cli-init-full — `wpm init <name>` FULL (task 34)

Status: review

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md task 34, read via `backlog task 34 --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 line 137 (the `init` row, all 12 steps), doc 11 §3 ("Materialised by `wpm init`": the project-wide authoring
> task catalog), doc 12 §"two-tier resolution" + §"Built-in templates" (the `minimal` project template + `default`
> bundle template), doc 13 §1/§3/§5 (purity / ports / bootstrap-not-six-beat).
>
> **The FULL `init` command** — EXTENDS the task-33 walking-skeleton `initProject`
> (`src/core/operations/init-project.ts`). The skeleton already did the smallest meaningful slice (template
> resolve, refuse-if-exists, copy `files/` with substitution, derive AGENTS.md + installer SKILL.md, init the
> empty `.authoring-backlog/`). This story adds the rest of doc-10:137: the `bundles/bundle-template/` scaffold,
> scope aliases, the authoring-task materialisation, `.gitignore`, and the `--template`/`--list-templates`/`--param`
> flags. **Extend the function and its CLI wiring — do NOT rewrite.**
>
> **This batch ALSO closes a recorded divergence** (forward-noted in `.bmad/sdlc-state.yaml` by worker11/H): a
> small `create-bundle.ts` change so `bundle new`'s default bundle template PREFERS the project's
> `bundles/bundle-template/` when present (falling back to the registry `default`), making `bundle template set`
> meaningful for `bundle new` and making `init`'s `bundles/bundle-template/` the live default `bundle new` clones.

## Acceptance criteria (verbatim from the backlog — `backlog task 34 --plain`)

- **AC#1** Running init in an empty target produces a project root containing `manifest.yml` with project name from
  the positional and `targets` and `bundles` taken from the chosen template, a `bundles` directory with the default
  bundle template materialised at `bundles/bundle-template/`, and empty `installer-skills` `templates` and
  `.authoring-backlog` directories, where `.authoring-backlog` is a Backlog.md root whose `task_prefix` is `authoring`.
- **AC#2** The derived `AGENTS.md` and the project installer `SKILL.md` are produced by mechanical template
  substitution only, with no invented prose.
- **AC#3** One scope-alias is created for each target the chosen template declares, resolved through the built-in
  agent-to-alias map; when the template declares no targets, no aliases are created.
- **AC#4** The project-wide authoring task set from the doc 11 catalog is materialised in `.authoring-backlog`, and
  for every bundle the template pre-includes the matching per-bundle authoring set is materialised too.
- **AC#5** When the target path already exists the command refuses with a typed error and a non-zero exit, creating
  nothing.
- **AC#6** The `--list-templates` flag prints the available project templates and exits without creating a project;
  values passed with `--param key=value` are available to placeholder substitution.
- **AC#7** The `.authoring-backlog` directory is recorded in `.gitignore`, a summary naming the created path and the
  number of materialised tasks is printed, and the command exits 0.
- **AC#8** Help output gives a one-line description, a synopsis, every flag and the positional with their meaning,
  and a worked example; `--template` and `--list-templates` values complete from the available project templates.

DoD (project-level, enforced per task): typechecks clean (`tsc --noEmit`) + Biome clean (`biome ci`); tests added
and green (unit for pure logic, integration where it touches ports); public functions documented; no dead code; the
core import-boundary rule is not violated.

## doc-10:137 — the 12 steps ⇄ which AC, and which the SKELETON already did

| # | doc-10:137 step | AC | Skeleton (task-33) | This story |
|---|---|---|---|---|
| 1 | Resolve template (default builtin `minimal`) | AC#1/#6 | hardcoded `minimal` | thread the CHOSEN template (`--template`, default `minimal`) |
| 2 | Refuse if target PATH exists | AC#5 | refused on `manifest.yml` | reconcile: refuse when the **target path** exists |
| 3 | copy template `files/` w/ `{{placeholders}}` | AC#1 | ✅ done (`renderTree`) | keep; add `--param` to the params map |
| 4 | instantiate `manifest.yml` from template snippet | AC#1 | ✅ (manifest.yml.tmpl is in `files/`) | keep (minimal ships `targets: []`/`bundles: []`) |
| 5 | create `bundles/` + copy default bundle template → `bundles/bundle-template/` | AC#1 | ✗ | **ADD** (the divergence-relevant step) |
| 6 | create empty `installer-skills/`, `templates/`, `.authoring-backlog/` (Backlog.md root, `task_prefix=authoring`) | AC#1 | partial (`.authoring-backlog` ✅) | **ADD** empty `installer-skills/` + `templates/` |
| 7 | scope-alias per `manifest.targets` (built-in map); none ⇒ none | AC#3 | ✗ | **ADD** (via the deriver's `aliasPlan` + `fs.ensureAlias`) |
| 8 | render `AGENTS.md` + `<project>-installer/SKILL.md` | AC#2 | ✅ done (`makeArtefactDeriver`) | keep |
| 9 | materialise project-wide authoring tasks (doc-11) | AC#4 | ✗ (returns `[]`) | **ADD** (the 8-task project-wide set) |
| 10 | per-pre-included-bundle, materialise its per-bundle set | AC#4 | ✗ | **ADD** (reuse `perBundleAuthoringTasks`; none for `minimal`) |
| 11 | add `.authoring-backlog/` to `.gitignore` | AC#7 | ✗ | **ADD** |
| 12 | print summary (path + N tasks) | AC#7 | partial (summary line) | keep + the `materialised: N` line via `formatResult` |

## KEY FINDING — only `minimal` + `default` templates exist (record in Completion Notes)

Verified on disk (`templates/`): the ONLY project template is `minimal` (scope:project, `parameters: [project-name]`,
ships `manifest.yml.tmpl` with `targets: []`/`bundles: []`), and the ONLY bundle template is `default`
(scope:bundle, `parameters: [bundle-id, version]`, a `files/` tree with AGENTS.md.tmpl + install-backlog/ +
payload/ + installer-skills/). **`single-bundle`/`multi-bundle` (doc-10:275, doc-12) do NOT exist** — they are
described in the docs but never built. They are OUT OF SCOPE (do not invent them — "out of scope per design set").

Consequence for `init <name>` with the default `minimal` template:
- `targets` is empty ⇒ **AC#3 yields ZERO aliases**.
- `bundles` is empty ⇒ **AC#4's per-bundle set is empty**; only the **project-wide 8-task set** materialises.
- `bundles/bundle-template/` is the **`default` bundle template's `files/` tree** copied in (the SAME tree
  `bundle template set default` writes — verified verbatim, placeholders intact).
- `--list-templates` prints just `minimal` (the one project template) and exits 0.

## doc-11 §3 — the project-wide authoring task set (the 8 titles to materialise, verbatim)

These are the `wpm init` project-wide tasks (doc-11 §3 "Materialised by `wpm init`"). Build them as
`AuthoringTaskSpec[]` (title + one free-text acceptance criterion from doc-11, agent-self-attested) in a new
exported pure helper `projectWideAuthoringTasks()` in `init-project.ts` (mirrors `perBundleAuthoringTasks`):

1. **Set project metadata** — `manifest.yml.project` has `description`, `license` (ideally `repository`, `author`) set via `wpm project meta`.
2. **Confirm target agents** — `manifest.yml.targets` has at least one entry (via `wpm project targets add`).
3. **Verify manifest coherence** — `wpm project validate` exits clean.
4. **Verify scope-alias symlinks** — each scope-alias corresponds to a target in `manifest.targets` and points at `installer-skills/`; no bare `skills/`.
5. **Verify AGENTS.md and main installer skill are current** — `AGENTS.md` + `<project>-installer/SKILL.md` reflect the current `manifest.yml` + each enabled `bundle.yml`.
6. **Verify helpers and advisors registered** — every root `installer-skills/` SKILL.md corresponds to a registered helper or advisor.
7. **Bump project release version** — `manifest.yml.project.version` advanced since the previous release tag (or set for the first release).
8. **Build dry-run** — `wpm build dry-run` exits clean.

> Idempotent by title (reuse `materialiseAuthoringTasks` — the same engine the six-beat ⑤ uses). Re-running `init`
> can't happen (refuse-if-exists), but the materialiser's title-idempotency is still the correct mechanism, and it
> de-dupes the project-wide set against any per-bundle set that names an overlapping title.

## ARCHITECTURE — where the logic lives (doc 13 §1/§5)

- `init` is the **BOOTSTRAP**: it CREATES the project, so it does NOT ride the task-25 `runMutation` six-beat (those
  ① LOAD an existing project; there is none). `initProject` stays its own small pure-over-ports operation — it
  already takes `{ fs, backlog, builtinTemplatesRoot }`; thread the chosen template name, the `--param` map, and do
  the materialise DIRECTLY (build the task list, then `backlog.init` the `.authoring-backlog` root, then
  `materialiseAuthoringTasks(backlog, authoringRoot, specs)`). Mirror how the skeleton already calls `backlog.init`.
- **Core boundary (the fixed invariant)**: `init-project.ts` lives under `src/core/operations/` — it may import
  only the model/errors/services + the ports + `node:path`; NEVER `node:fs`/`commander`/`execa`. The
  core-boundary lint test (`test/integration/core-boundary.test.ts`) enforces this.
- **Scope aliases (AC#3) — reuse the deriver's plan, don't hand-roll**: the `makeArtefactDeriver` deriver already
  returns `desired.aliasPlan` (from `scopePlan(manifest.targets, manifest.bundles)` in `derived-artefacts.ts`).
  After writing the manifest/bundles, build the in-memory `Project` projection with the CHOSEN template's
  `targets`/`bundles` and call the deriver; then for each `aliasPlan.aliases` entry, `fs.ensureAlias(join(target,
  aliasTo), join(target, linkPath))` — EXACTLY how the lifecycle's `applyRerender` does it. For `minimal` (no
  targets) the plan is empty ⇒ no aliases (AC#3 negative case). The deriver ALSO derives AGENTS.md + the installer
  SKILL.md (step 8 / AC#2) — so one deriver call covers steps 7 + 8 and keeps the front-door byte-identical to
  every later mutation (the single-source discipline the skeleton's test already guards).
- **Output is not a port** (doc 13 §3): the CLI shell formats the summary (the `formatResult` `materialised: N`
  line); `--list-templates` printing lives in the shell.
- **Error model** (doc 13 §7): refuse-if-exists is a `ConflictError` (exit 1); a missing template is `NotFoundError`
  (exit 1); `--list-templates` and `--help` exit 0.

## THE create-bundle DEFAULT change (§4 — close the divergence; doc-10:150 step 2)

Current `createBundleSpec.apply` resolves its scaffold from the REGISTRY:
`resolveTemplate(bundleTemplateName, "bundle", { fs, builtinTemplatesRoot, projectTemplatesRoot })` with
`bundleTemplateName = deps.bundleTemplateName ?? "default"`. So `bundle template set` (which writes
`bundles/bundle-template/`) is INERT for `bundle new`. doc-10:150 step 2: `bundle new` defaults to the PROJECT'S
`bundles/bundle-template/`.

**Fix (minimal, doc-10:150-conforming):** in `createBundleSpec.apply`, when **no explicit `--template`** was given
(`deps.bundleTemplateName === undefined`) AND `bundles/bundle-template/` exists under `root`, scaffold from THAT
directory's tree (read it via the FileSystem port — e.g. a small `readDirTree(fs, dir)` that yields
`TemplateFile[]`, OR reuse the resolver's tree-reading path) instead of the registry. When `bundles/bundle-template/`
is ABSENT, fall back to the registry `default` (unchanged behaviour). An EXPLICIT `--template <name>` STILL resolves
from the registry (unchanged). Keep `renderTree(params)` substitution either way (the scaffold keeps placeholders;
`bundle new` fills them).

> WHY it's safe: the existing `cli.bundle-new.test.ts` (task-27 proof leaf) seeds a project with NO
> `bundles/bundle-template/` → exercises the registry fallback (must stay green). The real-binary `bundle new`
> tests run after `init` (which after THIS story creates `bundles/bundle-template/`) → exercise the new
> project-scaffold path. Both must pass. The change is a `default`-only branch; explicit `--template` is untouched.
>
> Note `bundle template set` writes `bundles/bundle-template/` as a `files/`-tree COPY with NO `template.yml`
> descriptor inside it. So `createBundle`'s project-scaffold branch must read the DIRECTORY TREE directly (every
> file under `bundles/bundle-template/`), NOT call `resolveTemplate` (which expects a `template.yml`). Substitute
> `{{bundle-id}}`/`{{version}}`/`{{project-name}}` over that tree exactly as the registry path does.

## RECONCILIATION — skeleton-era tests that must be UPDATED to the full-init contract

Full `init` now creates `bundles/bundle-template/` (+ `installer-skills/`, `templates/`, materialised tasks,
`.gitignore`). Four tests encode the OLD skeleton "smallest slice / init ships no bundles/" assertion and must be
updated to the full-init contract (this is legitimate: task-34 supersedes task-33's deliberately-minimal slice):

1. `test/integration/cli.init.test.ts` — the `AC#2 — it is the SMALLEST slice: no bundles/ scaffold` test
   (asserts `bundles` absent). Replace with full-init assertions (bundles/bundle-template/ present; .gitignore;
   project-wide tasks materialised).
2. `test/unit/operations/init-project.test.ts` — same `AC#2 smallest slice` test (asserts `${TARGET}/bundles`
   absent). Update to assert the full tree.
3. `test/integration/cli.bundle-template.e2e.test.ts` — `55 — show on a fresh project … exits non-zero` asserts
   `bundles/bundle-template` ABSENT after real `init`. After this story it is PRESENT, so `show` now SUCCEEDS on a
   fresh project. Update that test (now `show` exits 0 and prints the tree on a fresh init).
4. `test/integration/cli.bundle-template.e2e.test.ts` — `56#2 — an unresolved name fails changing nothing` asserts
   `bundles/bundle-template` ABSENT after init. It is now PRESENT after init (created by init, not by the failed
   `set`). Re-assert "the failed `set` changed nothing" WITHOUT relying on the dir's absence (e.g. snapshot the
   tree before the failed set and assert it's unchanged).

> The unit `test/unit/cli/bundle-template-commands.test.ts` uses its OWN hand-built `seed()` (a fixture project
> that genuinely ships no `bundles/bundle-template/`, NOT real `init`) — it does NOT break. Leave it.

## TASKS / SUBTASKS

- [x] **T1 — Extend `initProject` core (AC#1,#3,#4,#5,#6,#7)** `src/core/operations/init-project.ts`
  - [x] T1.1 Extend `InitProjectInput` with `templateName?: string` (default `minimal`) + `params?: ReadonlyMap<string,string>` (the `--param` pairs, merged with `project-name`).
  - [x] T1.2 Step 1: resolve the CHOSEN template (not hardcoded). Step 2/AC#5: refuse when the **target path** exists (`fs.exists(targetDir)` → ConflictError), not only on `manifest.yml`.
  - [x] T1.3 Step 3: copy `files/` with `renderTree` over the merged params (project-name + `--param`).
  - [x] T1.4 Step 5/AC#1: create `bundles/` and materialise the default bundle template at `bundles/bundle-template/` — copy the `default` bundle template's `files/` tree via `resolveTemplate("default","bundle").template.files` (verbatim, placeholders intact, like `bundle template set`).
  - [x] T1.5 Step 6/AC#1: create empty `installer-skills/` + `templates/` (the `.authoring-backlog/` is already created); ensure the manifest's empty `installer-skills`/`templates` exist as dirs.
  - [x] T1.6 Steps 7+8/AC#2,#3: build the in-memory `Project` projection from the chosen template's targets/bundles; call the deriver once → write AGENTS.md + installer SKILL.md (keep) AND create each `aliasPlan.aliases` entry via `fs.ensureAlias`. No targets ⇒ no aliases.
  - [x] T1.7 Steps 9+10/AC#4: build the project-wide set (`projectWideAuthoringTasks()` — new exported helper, the 8 doc-11 titles) + for each pre-included bundle in `manifest.bundles`, `perBundleAuthoringTasks(id, { advisor: true })` (imported from create-bundle). `backlog.init` the authoring root, then `materialiseAuthoringTasks` the combined specs. Return `materialisedTaskTitles` = the created titles.
  - [x] T1.8 Step 11/AC#7: write `.gitignore` containing `.authoring-backlog/` (append the line if a `.gitignore` already exists from `files/`; else create it).
  - [x] T1.9 Update the doc comment to describe the FULL init (remove the "skeleton slice" framing); document the new helper + the new input fields.
- [x] **T2 — Wire the CLI `init` command (AC#5,#6,#7,#8)** `src/cli.ts` `initModule`
  - [x] T2.1 Add options: `--template <name>` (default `minimal`), `--list-templates`, `--param <pair...>` (repeatable `key=value`). Update `.description()` (mentions templates) + the `<name>` arg help.
  - [x] T2.2 `--list-templates`: list project-scope templates via `listTemplates({ fs, builtinTemplatesRoot }, { scope: "project" })`, print them, exit 0 WITHOUT creating anything (do not resolve a target dir / call initProject).
  - [x] T2.3 Parse `--param key=value` repeats into a `Map<string,string>` (split on the FIRST `=`; reject a pair with no `=` as a UsageError). Pass `templateName` + `params` into `initProject`.
  - [x] T2.4 `withExamples`: a single worked example showing `--template` + naming `--list-templates`/`--param` in its note (AC#8; one example so the singular `Example:` heading the task-28 guard asserts is preserved). Keep `--at`.
  - [x] T2.5 `COMPLETION_SPECS.init`: add `options: { "--template": "project-template-names", "--list-templates": "project-template-names" }` (AC#8: both complete from project templates). Keep `args: [undefined]`.
- [x] **T3 — Close the create-bundle divergence (§4)** `src/core/operations/create-bundle.ts`
  - [x] T3.1 In `apply`, when `deps.bundleTemplateName === undefined` AND `bundles/bundle-template/` exists under `root`: scaffold from that directory's tree (`readDirTree(fs, dir)` → `TemplateFile[]`), substituting the same params. Else: registry `default` (unchanged). Explicit `--template`: registry (unchanged).
  - [x] T3.2 Keep `bundle.yml` write + manifest append + advisor unchanged.
- [x] **T4 — Tests (unit + integration; AC#1-8 + §4)**
  - [x] T4.1 Unit `test/unit/operations/init-project.test.ts`: full tree (bundles/bundle-template/, installer-skills/, templates/, .gitignore, project-wide 8 tasks, materialisedTaskTitles non-empty, aliases empty for minimal, refuse-target-exists, --param, explicit --template not-found). Old smallest-slice test replaced.
  - [x] T4.2 Unit for `projectWideAuthoringTasks()` (8 titles in order, each ≥1 AC).
  - [x] T4.3 Unit `test/unit/operations/create-bundle.test.ts`: §4 — project scaffold present + no --template ⇒ clones it (marker file appears, placeholders substituted); explicit --template ⇒ registry (marker absent); no scaffold ⇒ registry fallback (no regression).
  - [x] T4.4 Integration `test/integration/cli.init.test.ts`: full real-binary `init` E2E (manifest, bundles/bundle-template/, AGENTS.md + installer skill, real-BacklogCli .authoring-backlog + 8 project-wide tasks, .gitignore, summary, exit 0); --list-templates; refuse-when-target-exists; --param; malformed --param exit 2; real-disk scope-alias (AC#3). Old smallest-slice test replaced.
  - [x] T4.5 Integration `test/integration/cli.bundle-new.test.ts`: §4 reconciliation E2E — after init, edit bundles/bundle-template/ then `bundle new x` reflects the edit (set is live, id substituted); plus `bundle template set default` then `bundle new` still works. (The absent-scaffold registry path stays covered by the existing task-27 proof leaf.)
  - [x] T4.6 Update `test/integration/cli.bundle-template.e2e.test.ts` tests 55 (fresh-init now HAS bundle-template → show exits 0) + 56#2 (snapshot-before/after the failed set, not dir absence).
- [x] **T5 — Gate (COLD, CI order, ONE vitest at a time)**: `tsc --noEmit` clean, `biome ci .` clean, `npm run build` ok; full `vitest run` green (real-`dist/cli.js`-vs-real-Backlog.md E2E RAN). See Completion Notes for numbers.

## Dev Notes

- **Reuse seams** (all verified present): `initProject` (extend), `makeArtefactDeriver`
  (`src/core/operations/derive-artefacts-capability.ts`) → AGENTS.md + `aliasPlan`; `scopePlan`/`deriveArtefacts`
  (`src/core/services/derived-artefacts.ts`); `aliasPathFor` (`src/core/services/agent-aliases.ts`);
  `perBundleAuthoringTasks` (`src/core/operations/create-bundle.ts`); `resolveTemplate`/`listTemplates`
  (`src/core/services/template-resolver.ts` — note `readTree` there is the on-disk tree reader the resolver uses,
  but it's not exported; T1.4/T3.1 read the dir tree via the fs port directly); `materialiseAuthoringTasks`
  (`src/core/services/materialisation.ts`); `AUTHORING_BACKLOG_DIR`/`AUTHORING_TASK_PREFIX`
  (`src/core/model/constants.ts`); the `FileSystem` port (`copyTree`, `ensureAlias`, `write`, `makeDirectories`,
  `list`, `read`, `exists`).
- **The deriver call needs a `Project` projection.** The skeleton already builds one (with empty targets/bundles
  and a nominal `0.1.0` version) for step 8. Extend it to carry the CHOSEN template's `targets`/`bundles` (for
  `minimal` both empty). The version brand is recovered via `parseSemVer` (skeleton already does this).
- **`bundles/bundle-template/` copy**: the `default` bundle template's `files/` tree on disk is
  `templates/bundle/default/files/`. `resolveTemplate("default", "bundle", deps)` returns it as in-memory
  `TemplateFile[]` (`template.files`). Write each verbatim to `bundles/bundle-template/<path>` (NO substitution —
  the scaffold keeps placeholders). This is the SAME bytes `bundle template set default` writes (consistency is
  desirable, not strictly required).
- **`--param` semantics**: doc-10:137 step 3 says placeholders are substituted "mechanically"; `--param k=v`
  ADDS to the param map alongside `project-name`. For `minimal` (whose only declared parameter is `project-name`)
  extra params are harmless (unreferenced). Do NOT validate params against the template's declared parameter list
  (out of scope; the render service throws only on UNRESOLVED placeholders, not on EXTRA params).
- **Run vitest ONE process at a time** — the integration project is `fileParallelism:false` over shared real
  `backlog`/`dist` state; concurrent runs collide into false failures.

### Project Structure Notes

- Files touched: `src/core/operations/init-project.ts` (extend), `src/core/operations/create-bundle.ts` (the §4
  default branch), `src/cli.ts` (`initModule` + `COMPLETION_SPECS.init`). Tests:
  `test/unit/operations/init-project.test.ts`, `test/unit/operations/create-bundle.test.ts`,
  `test/integration/cli.init.test.ts`, `test/integration/cli.bundle-new.test.ts` (maybe),
  `test/integration/cli.bundle-template.e2e.test.ts` (update 2 tests). No NEW source files needed (the project-wide
  helper goes in `init-project.ts` next to the operation).
- No model/schema change. No FileSystem port additions (the port is complete: `copyTree`/`ensureAlias`/`write`/
  `list`/`read`/`exists`/`makeDirectories`).

### References

- [Source: docs/10-authoring-cli.md §"Per-command actions" — the `init <name> [--at] [--template] [--list-templates] [--param k=v]` row (line 137), all 12 steps]
- [Source: docs/10-authoring-cli.md — the `bundle new <id>` row (line 150) step 2: "Resolve bundle template (default: project's `bundles/bundle-template/`)"]
- [Source: docs/10-authoring-cli.md §"Templates" (line ~275): project templates `minimal`/`single-bundle`/`multi-bundle`; bundle templates `default`/…]
- [Source: docs/11-authoring-process.md §3 "Materialised by `wpm init`" (lines 41-54): the 8 project-wide task titles + the per-pre-included-bundle set]
- [Source: docs/12-builder-architecture.md §"Built-in templates" + §"two-tier resolution": the `templates/` layout + project-local-shadows-built-in]
- [Source: docs/13-core-architecture.md §1 (pure core / ports), §3 (FileSystem port, output is not a port), §5 (bootstrap vs six-beat), §7 (error model)]
- [Source: src/core/operations/init-project.ts — the task-33 skeleton this story extends]
- [Source: src/core/operations/create-bundle.ts — `perBundleAuthoringTasks` + the registry template resolution the §4 change adjusts]
- [Source: src/core/services/derived-artefacts.ts — `scopePlan`/`deriveArtefacts`/`AliasPlan`; src/core/operations/lifecycle.ts `applyRerender` — the alias-creation pattern to mirror]
- [Source: .bmad/sdlc-state.yaml — the recorded forward-note/divergence this batch closes]

## Dev Agent Record

### Agent Model Used

Opus 4.8 (1M context) — BMAD build worker (this session)

### Completion Notes List

- **BMAD skills run (Rule 3):** `bmad-create-story` (this story; auto-discovery suppressed per the repo convention — the Backlog.md task 34 is the real contract), `bmad-dev-story` (T1–T4 implementation), `bmad-qa-generate-e2e-tests` (the E2E layer below). Recorded in the task `--notes` too.
- **Templates that exist on disk:** ONLY `minimal` (project) + `default` (bundle). `single-bundle`/`multi-bundle` do NOT exist (doc-described, not built) → out of scope; not invented. So with the default `minimal`: no targets ⇒ AC#3 yields zero aliases; no pre-included bundles ⇒ AC#4's per-bundle set is empty; only the project-wide 8-task set materialises; `bundles/bundle-template/` holds the `default` bundle template's tree; `--list-templates` prints just `minimal`.
- **AC#5 design (reconciliation to the AC):** the skeleton refused only on an existing `manifest.yml`; the AC says refuse when the **target path** exists. Implemented as `fs.exists(targetDir) → ConflictError`. Consequence: `init --at <existing-dir>` is now refused, so the integration tests target a fresh `join(dir, "proj")` subdir (the tmpdir itself exists). The default-cwd case (`init <name>` → `<cwd>/<name>`, a non-existent subdir) is unaffected.
- **§4 divergence closed:** `createBundle` now PREFERS the project's `bundles/bundle-template/` (read via `readDirTree` over the fs port — it has no `template.yml`, so the resolver can't read it) when `--template` is NOT given AND the dir exists; falls back to the registry `default` otherwise; an explicit `--template` always uses the registry. Proven: a marker file edited into `bundles/bundle-template/` post-`init` shows up in the next `bundle new` (set is now LIVE); the absent-scaffold registry path stays green (task-27 proof leaf + a dedicated unit test). H (tasks 55/56) is unchanged.
- **Single-source preserved:** `init` writes AGENTS.md + the installer SKILL.md from ONE `makeArtefactDeriver` call (covering steps 7+8), byte-identical to every later mutation (guarded by the existing single-source test).
- **QA pass (`bmad-qa-generate-e2e-tests`) found + closed a latent gap:** AC#3's POSITIVE case (alias per *declared* target) and AC#4's per-bundle case were only structurally present, because `minimal` declares no targets/bundles AND `buildProjection` originally HARDCODED `targets: []`/`bundles: []` — a template that declared them would have been silently ignored. Fix: `buildProjection` now LOADS the just-rendered `manifest.yml` (+ each pre-included `bundle.yml`) so `init` genuinely honors whatever the chosen template declares. Added two unit tests driving a fixture template with a declared target + a pre-included `core` bundle: AC#3-positive (root + per-bundle alias) and AC#4-positive (project-wide 8 + per-bundle 12 = 20 materialised). No real-binary positive test is possible (no template-with-targets ships; out of scope, not invented). Summary: `_bmad-output/implementation-artifacts/tests/test-summary-cli-init-full.md`.
- **Cold gate (CI order):** `tsc --noEmit` → 0 errors; `biome ci .` → clean (0 errors, 0 warnings; formatter applied, no hand-edited whitespace); `npm run build` → ok (`dist/cli.js` emitted). `vitest run` → see the final report. Core-boundary lint test green (init-project.ts imports only model/errors/services/ports + node:path).

### File List

- `src/core/operations/init-project.ts` (MODIFIED — extended the skeleton to the full 12-step init; added `projectWideAuthoringTasks()` export; `InitProjectInput` gains `templateName`/`params`)
- `src/core/operations/create-bundle.ts` (MODIFIED — §4: prefer `bundles/bundle-template/` for the default scaffold; added `readDirTree` helper + `BUNDLE_TEMPLATE_DIR` const)
- `src/cli.ts` (MODIFIED — `initModule`: `--template`/`--list-templates`/`--param` + `parseParams`/`formatProjectTemplateList`; `COMPLETION_SPECS.init` options)
- `test/unit/operations/init-project.test.ts` (REWRITTEN — full-init contract + AC#3/AC#4 positive-case tests + `projectWideAuthoringTasks` unit)
- `test/unit/operations/create-bundle.test.ts` (MODIFIED — §4 default-branch describe block)
- `test/integration/cli.init.test.ts` (REWRITTEN — full-init real-disk + real-binary + real-backlog + scope-alias E2E)
- `test/integration/cli.bundle-new.test.ts` (MODIFIED — §4 reconciliation E2E)
- `test/integration/cli.bundle-template.e2e.test.ts` (MODIFIED — tests 55 + 56#2 updated to the post-task-34 reality)
- `_bmad-output/implementation-artifacts/stories/story-cli-init-full.md` (NEW — this story)
- `_bmad-output/implementation-artifacts/tests/test-summary-cli-init-full.md` (NEW — QA E2E coverage summary)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-01 | `bmad-create-story`: story authored from Backlog.md task 34 (auto-discovery suppressed per repo convention). |
| 2026-06-01 | `bmad-dev-story`: T1–T4 implemented (full `initProject` + CLI flags + §4 create-bundle default + tests). Cold gate green. |
| 2026-06-01 | `bmad-qa-generate-e2e-tests`: verified per-AC E2E coverage; found + closed a latent gap — `buildProjection` now loads the rendered manifest so `init` honors a template's declared targets/bundles; added AC#3/AC#4 positive-case unit tests. |
