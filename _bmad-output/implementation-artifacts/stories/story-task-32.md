# Story task-32 — Author the builder's own agent skill

Status: ready-for-dev

> BMAD create-story output (skill-driven; sprint-status/epics auto-discovery suppressed — orchestrator-owned;
> steered from doc 12 §"BUILDER'S OWN AGENT SKILL" (the exact tree) + §"The bundled agent skill" (what it
> teaches) + doc 13 §0 (the two principles) + doc 05 §"Agent Skills, in depth"/§progressive-disclosure +
> doc 10 (the CLI surface) + doc 11 (the authoring process) + doc 08 (V2 tagging) + doc 00 (vocabulary/voice)).
> CONTENT-AUTHORING: the real built-in **builder's own agent skill** at `agent-skills/installer-builder/` —
> the STATIC meta-skill (about `wpm` itself; NO `{{placeholders}}`) shipped in the npm package so an agent that
> reads it can drive the `wpm` CLI to AUTHOR a bundle-project. The skill's voice + the model vocabulary are
> FIXED product style (doc 00), authored from the docs — not invented.

## Story
As a coding agent (Claude Code, Codex, …) that a human has asked to "author a bundle-project" / "build an
installer", I need the builder's own agent skill on disk and shipped in the npm package: a
`agent-skills/installer-builder/SKILL.md` whose description triggers on those intents and whose lean body
teaches me to drive the `wpm` CLI end-to-end to author a bundle-project, plus three on-demand `references/`
files (a CLI cheat-sheet, the authoring workflow, the conventions) I load only when I need the depth — so I
can do the work idiomatically without external instruction.

## Acceptance criteria (the contract — verbatim from the backlog)
1. An agent reading the builder's own skill can drive the command-line surface to author a bundle-project
   without external instruction (doc 12).
2. The skill activates on intents like authoring a bundle-project or building an installer, and conveys the
   SDLC-agnostic and thin-builder principles (doc 13).
3. Detailed material is reachable on demand rather than front-loaded (progressive disclosure, doc 05).

## How AC maps to the deliverable (read first)
- **AC#1 "an agent can drive the CLI to author a bundle-project without external instruction"** = the SKILL.md
  body + the three `references/` together are SELF-SUFFICIENT: the body teaches the mental model + the
  end-to-end workflow shape + which surface does what (the CLI for structure; Backlog.md directly for recipe
  tasks; the agent writes all content); `command-reference.md` is the full command surface; `authoring-
  workflow.md` is the phase-by-phase process; `conventions.md` is the V2 tagging + the rules. An agent with
  ONLY this skill (no doc set) can scaffold → fill → review → build. [Source: docs/12 §"The bundled agent
  skill" steps 1–4; docs/12 §"BUILDER'S OWN AGENT SKILL"]
- **AC#2 "activates on intents … conveys SDLC-agnostic + thin-builder"** = the SKILL.md frontmatter
  `description` fires on "author a bundle-project" / "build an installer" / "create a wpm project" / "ship this
  as a bundle-project" (doc 12 §"The bundled agent skill" #1), AND the body states doc-13 §0's TWO principles:
  (a) **thin builder, fat agent** — the builder authors+packages instructions and never executes an install;
  the CLI does mechanical scaffolding + materialises authoring tasks, the AGENT does the authoring thinking and
  writes every piece of content, and the END USER's agent does the install at runtime; (b) **SDLC-agnostic** —
  the product never models or assumes a particular development process; a workflow (Ralph loop, a review gate,
  spec-driven phases, or nothing) is *vendored content* an author optionally drops into `installer-skills/`,
  never something the builder builds in. [Source: docs/13 §0]
- **AC#3 "reachable on demand rather than front-loaded"** = the standard SKILL.md progressive-disclosure shape
  (doc 05): the name+description are always-resident (cheap), the body loads on a description match and is SHORT
  (doc 12: "the skill body itself is short"), and the depth lives in `references/` (doc 12: "each a markdown
  file under 100 lines, loaded by the agent only when needed"). The SKILL.md POINTS at the references rather
  than inlining their content. [Source: docs/05 §"Agent Skills, in depth"/§"Discovery is location-bound";
  docs/12 §"The bundled agent skill" final paragraph]

## What this is, and what it is NOT (avoid the confusion)
- **IS:** the *builder-side* meta-skill, shipped in the npm package alongside `dist`/`docs`/`templates`, that
  teaches an agent to **author** a bundle-project by driving `wpm`. Static content about `wpm` itself.
- **IS NOT:** the per-project `{{project-name}}-installer` SKILL.md the project template ships (that is
  *install-side*, lives under `templates/project/minimal/`, was authored in task-30, and uses
  `{{placeholders}}`). This task does NOT touch `templates/`.
- **IS NOT:** a discipline-enforcer or a loop runner (doc 12: "the builder deliberately does NOT ship a
  discipline-enforcer skill or a loop runner of its own"). It only TEACHES; enforcement/looping are vendored by
  the author per project.

## Confirmed mechanics (READ — facts I established from the docs + codebase)
- **The exact tree (doc 12 §"BUILDER'S OWN AGENT SKILL"):**
  ```
  agent-skills/                       ships in the npm package (the meta-skill for AUTHORING bundle-projects)
  └── installer-builder/
      ├── SKILL.md                    description triggers on "author a bundle-project"/"build an installer";
      │                                 body teaches the CLI surface + the authoring workflow + the principles
      └── references/
          ├── command-reference.md    compressed cheat-sheet of the CLI (from doc 10's command tree)
          ├── authoring-workflow.md   compressed version of doc 11 (the authoring process)
          └── conventions.md          V2 tagging (kind:/step:/version) + structure-not-content + no-mirror
  ```
- **SKILL.md frontmatter shape** (doc 05 §"Frontmatter fields"; mirror the existing template SKILLs' style — a
  `---`-fenced block FIRST): `name: installer-builder` (lowercase-with-hyphens, matches the folder) +
  `description:` (the load-bearing activation field). Optional fields (`version`, `license`) are allowed but not
  required.
- **The CLI name:** `wpm` is the canonical prose name (doc 00 — "work-package-manager (`wpm`)"; doc 10 — "the
  binary is called `wpm` throughout"). The repo ships a dual-bin `{wpm, installer}` (state divergence #2, both
  → `dist/cli.js`). USE `wpm` in all examples; note the `installer` alias ONCE (e.g. in the command-reference).
- **The model vocabulary is FIXED (doc 00 §Vocabulary):** bundle / bundle-project / manifest / install-backlog
  (the recipe) / receipt / front-door (`AGENTS.md`) / payload / authoring-backlog / detection / target agent /
  confirmation level / advisor / recipe-vs-receipt. Author in this voice; do not coin new terms.
- **The CLI surface to compress (doc 10 §"The command tree"):** top-level `init`, `template (list|show)`,
  `project (show|meta|version|targets|installer-skills|validate|root)`, `bundle (new|enable|disable|remove|
  list|template; and per-bundle <id> show|meta|version|requires|files|templates|scripts|skills|installer-skills
  |advisor)`, `build (dry-run|package|publish)`. The load-bearing principles (doc 10 §"Design principles"):
  one-command-per-intent; project context is explicit (walk-up for `manifest.yml`, `-C` override); **above
  Backlog.md, not parallel** (task ops are NOT wrapped — use Backlog.md directly inside the bundle);
  **structure, not content** (CLI registers/validates; the agent writes content; content arrives via
  template-driven substitution OR a task-driven authoring task); derived artefacts (`AGENTS.md` + the installer
  skill) re-render automatically on every mutation; every command is discoverable (`--help` + completion).
- **The authoring process to compress (doc 11):** the `.authoring-backlog/` (task_prefix=authoring, hidden,
  gitignored, its own Backlog.md root) is materialised incrementally — `wpm init` creates the project-wide task
  set; `wpm bundle new <id>` creates the per-bundle set (the 12 from doc 11 §3 / task-26's
  `perBundleAuthoringTasks`); `version bump`/`requires add|remove`/`targets add`/the skill-adding commands
  materialise their own follow-ups. The agent WORKS those tasks via Backlog.md directly (list → pick by title →
  In Progress → do via the CLI + Backlog.md → self-attest Done). Idempotent by title; the CLI NEVER auto-closes;
  authoring done when the To-Do list is empty. [doc 11 §3, §4, §"A worked authoring session"]
- **The conventions to compress (doc 08 §"Task tagging system" + §"How these tags ride on Backlog.md"):**
  the three recipe-task tags — **identity** `step:<slug>` (immutable correlation key), **kind** `kind:state`
  (detect/setup/verify; idempotent; editable across versions) vs `kind:migration` (run-once, version-gated,
  immutable once shipped), **version** = the Backlog.md milestone (`-m <version>`, the one queryable axis).
  Backlog.md flag mechanics: labels do NOT accumulate across repeated `-l` → put both in ONE comma-separated
  `-l "kind:state,step:<slug>"`; `--ac`/`--dod` DO accumulate; `--dep` is by task **id** (look it up via
  `backlog task list --plain`). Plus the two cross-cutting rules: **structure-not-content** (CLI does structure;
  agent writes content) and **no-mirror** (never wrap Backlog.md task ops — use it directly). [doc 08; doc 10
  §"Above Backlog.md"; doc 11 §"no-mirror"]
- **Packaging:** `package.json` `files` is currently `["dist","docs","templates"]`. ADD `"agent-skills"` so
  `npm pack` ships the skill (doc 12: "ships in the npm package"). Run `npm ci` after to confirm the lockfile
  is still in sync (no dep change, so it should be a no-op).
- **Biome/markdown:** `biome.json` `files.includes` = `["src/**","test/**","*.json","*.ts"]` — `agent-skills/**`
  (like `templates/**`) is OUTSIDE biome's globs, so the skill's `.md` files are NOT linted/formatted (no
  formatting fight; the new TEST `.ts` IS). No biome config change needed (note this).
- **This is pure content** — there is NO `src/core/` code to write, so the core import-boundary rule is not
  engaged here (the DoD item about it is satisfied vacuously; note it). The only `.ts` is the test.

## The files to author

### `agent-skills/installer-builder/SKILL.md` (AC#1 body + AC#2 triggers/principles + AC#3 lean)
- **Frontmatter:** `name: installer-builder`; `description:` a single sentence that (a) says what the skill
  does ("Author a bundle-project — a `wpm` agentic-installer — by driving the `wpm` CLI") and (b) lists the
  activation intents ("Use when the user asks to author a bundle-project, build an installer, create a `wpm`
  project, or ship a capability as an agentic installer"). These are the AC#2 triggers, quoted from doc 12.
- **Body (LEAN — when-to-use + mental model + workflow shape + pointers; the DEPTH is in references/):**
  1. **What you're building (the mental model, doc 00):** a *bundle-project* = one repo with a `manifest.yml`
     (release identity + the flat list of enabled *bundles* + *target agents*) and one or more *bundles*, each
     an independent unit with its own *install-backlog* (the shipped *recipe* — a detect→setup→verify task
     graph) + *payload* (what it delivers) + a *front-door* `AGENTS.md`. The end user's agent runs the recipe;
     the receipt (state) lives in the task records, not a separate store.
  2. **The two principles you operate under (AC#2, doc 13 §0) — state them plainly:**
     - **Thin builder, fat agent.** `wpm` authors and packages instructions; it never installs anything. The
       CLI does mechanical structure (scaffold dirs, edit YAML, register references) and materialises authoring
       tasks; YOU do the authoring thinking and write every piece of content (task bodies, SKILL.md bodies,
       payload files); the END USER's agent does the install at runtime. Don't expect the CLI to "do the
       install" or write prose for you.
     - **SDLC-agnostic.** The product models no particular development process. If a project wants a disciplined
       or unattended install (a Ralph loop, a review gate, spec-driven phases), the author *vendors* an existing
       skill/runner into `installer-skills/` — it is content, never built into `wpm`. Don't reach for a built-in
       "workflow"; there isn't one, by design.
  3. **The workflow shape (AC#1 — the end-to-end arc, deferring detail to `references/authoring-workflow.md`):**
     elicit the human author's intent (per your own judgment, not a fixed script) → `wpm init <name>
     [--template …]` to scaffold (this materialises the project-wide authoring tasks) → for each capability
     `wpm bundle new <id>` (materialises that bundle's task set) → work the `.authoring-backlog/` task-by-task:
     set bundle meta + `requires`, **fill each install-backlog by calling Backlog.md DIRECTLY inside the
     bundle** (`cd bundles/<id> && backlog task create …` with V2 tags), author payload via the filesystem then
     register it with the CLI (`bundle <id> files/skills add`), then the review tasks → `wpm build dry-run` →
     `wpm build package`. Note the authoring-backlog is the spine: list it, pick by title, self-attest Done.
  4. **Which surface does what (the discipline, deferring to `references/conventions.md`):** the CLI for
     STRUCTURE (projects, bundles, manifest entries, registered refs) and never for task ops; **Backlog.md
     directly** for every install-backlog task and the authoring-backlog (the *no-mirror* rule); YOUR editor for
     all CONTENT (*structure-not-content*). Apply the V2 tagging (`kind:`/`step:`/milestone) when you create
     recipe tasks.
  5. **Where to go next (the on-demand pointers — AC#3):** "For the full command surface, read
     `references/command-reference.md`. For the phase-by-phase authoring process and the per-bundle task set,
     read `references/authoring-workflow.md`. For the recipe-task tagging conventions and the Backlog.md flag
     rules, read `references/conventions.md`." Keep the body itself short — these references carry the depth.
- **Keep it lean:** target the body well under the references' combined size (doc 12: "the skill body itself is
  short"); the test asserts the SKILL.md is meaningfully smaller than the references combined and that it names
  all three references.

### `agent-skills/installer-builder/references/command-reference.md` (compress doc 10; cite it; < ~100 lines)
- A compact cheat-sheet of the command tree (doc 10 §"The command tree"): `init`; `template list|show`;
  `project show|meta|version (bump|set)|targets (add|list|remove)|installer-skills (add|list|remove)|validate|
  root`; `bundle new|enable|disable|remove|list|template (show|set)`; per-bundle `bundle <id> show|meta|version|
  requires|files|templates|scripts|skills|installer-skills|advisor`; `build dry-run|package|publish`. One line
  each (verb + what it does + key flags). State the load-bearing principles tersely: project context is
  explicit (`-C`/walk-up); task ops are NOT here (use Backlog.md directly — no-mirror); the CLI does
  structure-not-content; derived artefacts auto-re-render; `--help`/completion on every command. Note the
  `wpm`/`installer` dual bin once. End with a "see doc 10 for the full per-command actions" pointer (cite, don't
  restate the whole table).

### `agent-skills/installer-builder/references/authoring-workflow.md` (compress doc 11; cite it; < ~100 lines)
- The authoring process: the hidden `.authoring-backlog/` (task_prefix=authoring, its own Backlog.md root,
  gitignored) materialised incrementally by scope-changing commands; the materialisation→work loop (doc 11 §4):
  `wpm init` makes the project-wide set; `wpm bundle new <id>` the per-bundle set (list the 12 titles from doc
  11 §3 briefly: Plan / Fill install-backlog / Author payload / Scaffold payload skill / Write advisor content /
  the verify+review+simulate tasks); the agent lists `.authoring-backlog` via Backlog.md, picks by title, sets
  In Progress, does the work via the CLI + Backlog.md, self-attests Done; idempotent by title; CLI never
  auto-closes; done when To-Do empty. Include the doc-11 worked-session skeleton (init → meta → targets add →
  bundle new → fill via `cd bundles/<id> && backlog task create …` → register payload → build dry-run),
  compressed. Cite doc 11 (and doc 04 for the behavioural protocol) for the depth.

### `agent-skills/installer-builder/references/conventions.md` (compress doc 08 + the two rules; cite; < ~100 lines)
- **V2 recipe-task tagging (doc 08 §"Task tagging system"):** the three tags — `step:<slug>` (identity,
  immutable), `kind:state` vs `kind:migration` (discipline: reconcile-and-edit vs apply-once-and-freeze),
  milestone `-m <version>` (the queryable version axis). The detect→setup→verify trio is `kind:state`; a
  version-gated change coming from an older version is `kind:migration`.
- **Backlog.md flag mechanics (doc 08 §"How these tags ride on Backlog.md"):** labels do NOT accumulate → ONE
  comma-separated `-l "kind:state,step:<slug>"`; `--ac`/`--dod` DO accumulate; `--dep` is by task **id** (look
  it up first via `backlog task list --plain`); ids are upper-cased in display, lower-case on the command line.
- **The two cross-cutting rules:** *structure-not-content* (the CLI manages structure; the agent writes all
  user-facing content) and *no-mirror* (never wrap Backlog.md task ops — read/write tasks with Backlog.md
  directly, inside the relevant backlog root). Cite doc 08 / doc 10 / doc 11.

## Tests (`test/unit/agent-skills/installer-builder-skill.test.ts`) — read the REAL shipped files (static)
PURE + deterministic: this is static content, so the test reads the actual files from disk via `node:fs` (tests
may use `node:fs`); no MemoryFileSystem/resolver/subprocess ceremony. Resolve the skill root via
`fileURLToPath(new URL("../../../agent-skills/installer-builder", import.meta.url))`. Assert:
- **AC#2 frontmatter + triggers:** `SKILL.md` exists; its content starts with a `---`-fenced frontmatter block;
  parse it (a tiny hand-rolled split on `---`, or `parseYaml` from `src/util/yaml.js`) and assert `name ===
  "installer-builder"` and `description` is a non-empty string. The description (lower-cased) contains the
  activation intents — assert it matches `author` AND (`bundle-project` OR `installer`) — i.e. it fires on
  "author a bundle-project" / "build an installer".
- **AC#2 principles in the body:** the SKILL.md body conveys BOTH principles — assert it contains the
  thin-builder idea (matches `thin builder` or both `thin`+`fat agent`, or the phrase "never executes"/"never
  installs") AND the SDLC-agnostic idea (matches `SDLC-agnostic` or `sdlc-agnostic`, and references vendoring a
  workflow rather than building one in).
- **AC#1 self-sufficiency (the CLI verbs + the surface discipline):** the body references the key CLI verbs —
  assert it contains `wpm init`, `bundle new`, and `build` (and mentions driving `backlog` directly for recipe
  tasks). This shows an agent could drive the surface from the skill alone.
- **AC#3 progressive disclosure (lean body + pointers + the three references exist & are non-trivial):**
  - all three `references/{command-reference,authoring-workflow,conventions}.md` exist and each is non-trivial
    (e.g. `> 400` chars / `> 15` non-empty lines — pick a robust floor);
  - the SKILL.md NAMES all three references by filename (it points at them);
  - the SKILL.md is reasonably LEAN — assert its byte length is LESS than the combined byte length of the three
    references (the depth lives in references/, not inlined). Also assert the SKILL.md does NOT itself inline a
    full command table (e.g. it doesn't contain every one of, say, 8+ distinct `wpm <group>` lines that belong
    in the reference — a light heuristic; keep it robust, not brittle).
- **(hygiene) static, no placeholders:** assert NO `{{…}}` marker appears in the SKILL.md or any reference (this
  is content about `wpm` itself, not a template) — guards against accidentally copying a templated stub.

> Keep assertions CONTENT-based and robust (substring/lowercased/length-floor), not brittle exact-match — the
> prose is FIXED-voice but will be authored, so test for the load-bearing signals, not verbatim sentences. One
> `describe` per AC reads well (mirror `minimal-project.acceptance.test.ts`'s per-AC structure).

## DoD (the backlog DoD for task-32)
- `tsc --noEmit` clean; `biome check src test` clean with **0 errors / 0 warnings** (run `biome check --write
  src test` FIRST to clear import-organize/format nits on the new TEST `.ts`; `agent-skills/**` is outside
  biome's globs so the skill `.md` files are not linted — note this). `vitest run` green (SINGLE process).
  `npm ci` clean (after adding `agent-skills` to `package.json files`). Core import-boundary rule: not engaged
  (no `src/core/` change — the only `.ts` is the test, which legitimately uses `node:fs`); DoD item satisfied
  vacuously — note it. No dead code; the test helper documented.

## Previous-story intelligence (carried forward — task-30, task-31)
- **task-30 authored the OTHER skill** (the per-project `{{project-name}}-installer` under
  `templates/project/minimal/`): that one is install-side + templated. THIS task's skill is builder-side +
  static. Don't conflate them; don't edit `templates/`.
- **task-31 established:** the real-files-read-from-disk test pattern (`node:fs` in `test/` is fine); `package.
  json files` already lists `templates` (task-30 added it) — follow the same move to add `agent-skills`;
  `agent-skills/**` (like `templates/**`) is outside biome's globs (no formatting fight; run `biome check
  --write` on the new `.ts`); single-process vitest (task-18).
- **SKILL.md frontmatter style** is set by the existing template SKILLs: a `---`-fenced `name` + `description`
  block FIRST, body after. Mirror it.

## Boundaries (do NOT do here)
- Do NOT edit `templates/` (the per-project installer skill is a different artefact, task-30). Do NOT author a
  discipline-enforcer or loop runner (doc 12 forbids the builder shipping one). Do NOT add `{{placeholders}}`
  (static content about `wpm`). Do NOT restate whole docs verbatim in the references — COMPRESS + cite the
  source (doc 12: "each a markdown file under 100 lines"). Do NOT add new CLI commands or change the command
  surface (doc 10 is the surface — reference it, don't extend it). Do NOT edit `docs/`, the repo-root
  `AGENTS.md`/`CLAUDE.md`, `.bmad/` (incl. sprint-status), or the dev `backlog/`. Do NOT touch task-10–31
  source. If doc 12/13/05/10/11/08 specify something this sketch omits, the DOC wins — add it + note the
  divergence in the final report.

## Dev Agent Record
### Agent Model Used
(filled by dev-story)
### Completion Notes List
### File List
