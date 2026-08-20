# 12 · The Installer-Builder Project Architecture

The previous eleven docs describe the *shape* of what gets built (bundle-projects, manifests, install-backlogs, the runtime flow) and the CLI that builds them (the `wpm` command). This doc describes the **project that ships the `wpm` CLI itself** — its codebase, layout, technology choices, distribution model, and the cross-cutting concerns (testing, CI, dogfooding) that don't belong in any of 00-11.

Read with `10` (the CLI surface this project implements), `07` (the templates it ships), and `11` (the authoring-backlog mechanic the CLI materialises into).

## What the installer-builder is

A single Node.js + TypeScript package, distributed via npm, that ships three things:

1. **The `wpm` CLI binary** — the surface fully specified in `10`.
2. **Built-in templates** — the hand-authored, version-controlled trees the CLI scaffolds from with mechanical placeholder substitution.
   **Shipped project templates:** `minimal`.
   **Shipped bundle templates:** `default`.
   Project-local templates can add specialized shapes and shadow a built-in of the same name. The shipped project template carries more than directory structure: its files hold the *instructional content* that makes a generated install work — the orchestrator skill, the front-door recognition text, the per-task workflow, the loop instructions (catalogued in `06`, "What the template's files actually say"). It does *not* bundle a discipline-enforcer skill of our own; where an author wants enforcement, they vendor an existing one (`06`).
3. **The builder's own agent skill** — `installer-builder/SKILL.md` plus references, packaged so an agent reading it knows how to drive the CLI to author a bundle-project. The meta-skill that closes the loop: the CLI is agent-friendly *by virtue of an agent skill that ships alongside it*, not by hoping the agent figures it out from `--help`.

The doc set (`docs/00-14.md`) lives in the same repo and is part of what ships, but is a static deliverable — not loaded at runtime, not executed, just there to be read.

## Engineering decisions, with rationale

**Language: Node.js + TypeScript.** Backlog.md (our hard runtime dependency, since the CLI shells out for every task operation) is itself Node.js. Sharing the ecosystem keeps installation simple — one `npm i -g` step gets both. TypeScript for the implementation because the manifest, bundle.yml, and template schemas are structural enough that a type system pays for itself within the first refactor. ESM-only (no CommonJS dual-build) since Backlog.md's tooling is modern Node.

**CLI framework: commander.** Boring, mature, declarative. Handles deeply nested subcommands, flag types, help-text generation. The competition (yargs, clipanion, citty, oclif) either matches it or adds complexity we don't need. commander's `.command()` chain maps cleanly to the tree in `10`, and its `.helpInformation()` / `.helpOption()` hooks let us meet the `--help` content contract from `10`'s discoverability principle without a custom help renderer.

**Tab completion: omelette.** Generates bash/zsh/fish completion scripts and dispatches dynamic completions back to the CLI via a `__complete` hook. This is what makes "bundle IDs are completable from `manifest.yml.bundles`" actually work — the shell calls `installer __complete bundle <partial>`, the CLI loads the manifest, prints suggestions. omelette is small and unopinionated; the alternative (writing completion scripts by hand per shell) is a maintenance trap.

**YAML: `yaml` (eemeli/yaml).** Preserves comments and key order through round-trips, which matters because the manifest and bundle.yml files are author-edited and we never want to silently re-format them when we touch them programmatically. `js-yaml` is faster but doesn't preserve comments.

**Testing: vitest.** TS-native, fast, ESM-friendly, snapshot-test support. The CLI has three flavours of test surface — pure unit logic (version constraints, kebab validation, template render), integration (real command sequences in a tmpdir), and snapshot (rendered AGENTS.md / SKILL.md against a fixture) — vitest covers all three without ceremony.

**Backlog.md adapter: shell-out, not library.** Backlog.md exposes a CLI, not a stable JS API. We invoke `backlog task create`/`list`/`edit`/`archive` as subprocess calls (`execa`-style), parse `--plain` text output for reads, pass arguments for writes. Adapter is `src/core/backlog-md.ts`; everywhere else in the codebase calls through it. This insulates us from Backlog.md version churn.

**Symlinks on Windows: a fallback to copies.** Scope-alias symlinks (per `06`) are real `fs.symlink` calls on POSIX. On Windows, where symlinks require admin or developer mode, the CLI falls back to copying `installer-skills/` into each alias path and warns the author that updates need a re-copy step. The detection logic lives in `src/util/symlink.ts`.

**Distribution: a single global npm install.** `npm i -g <package-name>` (final name TBD; working name in the repo is `wpm`) provides the `wpm` binary on `PATH`. Backlog.md is a `peerDependency`, not bundled — installing the builder pings the user to also `npm i -g backlog.md` if missing. This matches the convention of CLIs like `npm`/`pnpm`/`yarn` rather than forcing a transitive bundle.

**CI: GitHub Actions; matrix on Node LTS × {Linux, macOS, Windows}.** Test on every push, build on tag, publish to npm on tagged release. Workflow files in `.github/workflows/`.

## The directory scaffold

```
installer/                          the installer-builder project root
│
│   ── PROJECT META ───────────────────────────────────────────────────────
├── README.md                  [REQ]  intro, install, first-run, links into docs/
├── LICENSE                    [REQ]
├── CONTRIBUTING.md            [OPT]
├── CHANGELOG.md               [OPT]  release history
├── package.json               [REQ]  npm metadata; declares bin: { installer: "./dist/cli.js" }
├── tsconfig.json              [REQ]
├── .gitignore                 [REQ]  includes dist/, node_modules/, .backlog/archive/junk
├── .npmrc                     [OPT]
├── biome.json                 [OPT]  lint + format (or .eslintrc + .prettierrc)
│
│   ── DOC SET ────────────────────────────────────────────────────────────
├── docs/                      [REQ]  the design docs (00-14); shipped in npm package
│   ├── 00-foundation-and-lineage.md
│   ├── 01-author-experience.md
│   ├── 02-end-user-experience.md
│   ├── 03-executing-agent-protocol.md
│   ├── 04-authoring-agent-protocol.md
│   ├── 05-native-agent-surfaces.md
│   ├── 06-project-skeleton.md
│   ├── 07-install-contract.md
│   ├── 08-versioning-and-migrations.md
│   ├── 09-installation-process.md
│   ├── 10-authoring-cli.md
│   ├── 11-authoring-process.md
│   ├── 12-builder-architecture.md     this file
│   ├── 13-core-architecture.md        the core app's internal architecture
│   └── 14-lineage-reference.md        appendix: installer/package-manager lineage table
│
│   ── CLI IMPLEMENTATION ────────────────────────────────────────────────
├── src/                       [REQ]
│   ├── cli.ts                       entry point: argv → commander dispatch → exit code
│   │
│   ├── commands/                    one module per CLI command/group from 10's tree
│   │   ├── init.ts                  wpm init
│   │   ├── project/
│   │   │   ├── index.ts             group wiring
│   │   │   ├── show.ts
│   │   │   ├── meta.ts
│   │   │   ├── version.ts           bare / bump / set
│   │   │   ├── targets.ts           add / list / remove
│   │   │   ├── installer-skills.ts  add / list / remove (project-scoped install-time skills)
│   │   │   ├── validate.ts
│   │   │   └── root.ts
│   │   ├── bundle/
│   │   │   ├── index.ts             group wiring + per-id sub-context routing (reserved-id guard)
│   │   │   ├── new.ts               also runs advisor-add + task materialisation unless --no-advisor
│   │   │   ├── enable.ts
│   │   │   ├── disable.ts
│   │   │   ├── remove.ts            full teardown: manifest + dir + advisor + authoring-task archive
│   │   │   ├── list.ts
│   │   │   ├── template.ts          show / set
│   │   │   ├── id/                  the per-bundle subcontext
│   │   │   │   ├── show.ts
│   │   │   │   ├── meta.ts
│   │   │   │   ├── version.ts
│   │   │   │   ├── requires.ts
│   │   │   │   ├── files.ts
│   │   │   │   ├── templates.ts
│   │   │   │   ├── scripts.ts
│   │   │   │   ├── skills.ts        payload skills (delivered)
│   │   │   │   ├── installer-skills.ts  bundle-scoped install-time helper skills
│   │   │   │   └── advisor.ts       add / remove (the bundle's pull-UX advisor)
│   │   ├── template/
│   │   │   ├── index.ts
│   │   │   ├── list.ts
│   │   │   └── show.ts
│   │   └── build.ts                 dry-run / package / publish
│   │
│   ├── core/                        domain logic — no I/O concerns, no argv parsing
│   │   ├── project-context.ts       walk-up resolve manifest.yml, -C override
│   │   ├── manifest.ts              read / write / validate manifest.yml schema
│   │   ├── bundle-yml.ts            read / write / validate bundle.yml schema
│   │   ├── template-resolver.ts     two-tier resolution (project-local templates/ → builtin)
│   │   ├── render.ts                template-driven mechanical substitution (Structure-not-Content)
│   │   ├── authoring-backlog.ts     task materialisation + title-based idempotency
│   │   ├── backlog-md.ts            adapter: shell-out to `backlog` CLI
│   │   ├── scope-aliases.ts         create/remove symlinks, validate well-formedness
│   │   ├── agent-aliases.ts         built-in map: agent name → scope-alias path
│   │   ├── version-constraint.ts    npm-style semver parser + matcher (^, ~, >=, =, ranges)
│   │   ├── integrity.ts             vendored-content hashing + wpm.lock emit/verify (08)
│   │   ├── derived-artefacts.ts     re-render AGENTS.md + main installer skill on mutation
│   │   └── validate.ts              `project validate` logic
│   │
│   ├── completion/                  dynamic tab-completion handlers
│   │   ├── bundle-ids.ts            from current project's manifest.yml
│   │   ├── agent-names.ts           from manifest.yml.targets / built-in well-known
│   │   ├── template-names.ts        from built-in + project-local templates/, filterable by scope
│   │   ├── file-paths.ts            from filesystem context within bundle
│   │   └── enums.ts                 finite value sets (bump levels, formats, etc.)
│   │
│   ├── help/                        --help content generation
│   │   ├── synopsis.ts              usage line from commander metadata
│   │   ├── flags.ts                 flag table with types + defaults
│   │   └── examples.ts              per-command worked examples (loaded from JSON sidecar)
│   │
│   └── util/                        infrastructure, no domain knowledge
│       ├── fs.ts                    atomic writes, ensureDir, gitignore patching
│       ├── yaml.ts                  comment-preserving read/write via eemeli/yaml
│       ├── kebab-case.ts            id validation
│       ├── symlink.ts               symlink with Windows-copy fallback
│       ├── shell.ts                 execa wrapper with consistent error reporting
│       └── exit.ts                  error formatting + exit codes (0, 1, 2, …)
│
│   ── BUILT-IN TEMPLATES ────────────────────────────────────────────────
├── templates/                 [REQ]  ships in the npm package; the built-in template set (project-local templates/ shadow these)
│   ├── project/
│   │   └── minimal/
│   │       ├── template.yml             scope: project, parameters: [project-name]
│   │       ├── files/                   copied at init with substitution
│   │       │   ├── manifest.yml.tmpl
│   │       │   ├── RALPH-LOOP.md.tmpl   the unattended-loop rules, as plain instructions (06)
│   │       │   ├── README.md.tmpl
│   │       │   └── installer-skills/
│   │       │       └── {{project-name}}-installer/
│   │       │           └── references/journaling.md.tmpl
│   │       │       (an author may also VENDOR third-party discipline skills here — e.g. from
│   │       │        superpowers, MIT — but those aren't part of the builder's template; see 06)
│   │       └── snippets/                derived front doors + ON-DEMAND stubs (not copied wholesale)
│   │           ├── AGENTS.md                    executor front-door source
│   │           ├── authoring-front-door.md.tmpl workspace front-door source
│   │           ├── installer-skills/{{project-name}}-installer/SKILL.md
│   │           ├── advisor.SKILL.md.tmpl        rendered by `bundle <id> advisor add` / `bundle new`
│   │           ├── installer-skill.SKILL.md.tmpl rendered by `… installer-skills add` (scaffold branch)
│   │           └── payload-skill.SKILL.md.tmpl   rendered by `bundle <id> skills add` (scaffold branch)
│   │
│   └── bundle/
│       └── default/
│           ├── template.yml             scope: bundle; `bundle.yml` is written canonically
│           └── files/
│               ├── _AGENTS.md.tmpl      author-owned per-bundle front door
│               ├── install-backlog/
│               │   ├── config.yml.tmpl  DoD scaffold
│               │   └── tasks/           detect → setup → verify starter tasks
│               ├── installer-scripts/
│               ├── installer-skills/
│               └── payload/             empty agent-skills/, files/, and templates/ roots
│
│   ── BUILDER'S OWN AGENT SKILL (for authoring, builder-side) ───────────
├── agent-skills/              [REQ]  ships in the npm package; the meta-skill for AUTHORING bundle-projects
│   └── installer-builder/
│       ├── SKILL.md                 description triggers on "author a bundle-project"/"build an installer";
│       │                              body teaches the agent the CLI surface + the authoring workflow
│       └── references/
│           ├── command-reference.md compressed cheat-sheet derived from 10
│           ├── authoring-workflow.md compressed version of 11
│           └── conventions.md       V2 tagging + structure-not-content + no-mirror, compressed
│
│   ── SHELL COMPLETION SCRIPTS ─────────────────────────────────────────
├── completions/               [REQ]  installed via `wpm completion install` (or similar)
│   ├── installer.bash
│   ├── installer.zsh
│   └── installer.fish
│
│   ── TESTS ────────────────────────────────────────────────────────────
├── test/                      [REQ]
│   ├── unit/                        pure-logic tests, no fs / no subprocess
│   │   ├── version-constraint.test.ts
│   │   ├── kebab-case.test.ts
│   │   ├── render.test.ts
│   │   ├── manifest.test.ts
│   │   └── ...
│   ├── integration/                 real command sequences in tmpdir
│   │   ├── init-then-bundle-new.test.ts
│   │   ├── version-bump-cascades.test.ts
│   │   ├── targets-add-removes.test.ts
│   │   ├── template-publish-roundtrip.test.ts
│   │   └── ...
│   ├── snapshot/                    rendered output stability
│   │   ├── agents-md.test.ts        AGENTS.md for hermes-handoff fixture
│   │   ├── installer-skill.test.ts
│   │   └── ...
│   └── fixtures/
│       ├── hermes-handoff/          the worked-example project for tests
│       ├── minimal-project/
│       └── ...
│
│   ── BUILD & CI ───────────────────────────────────────────────────────
├── .github/
│   └── workflows/
│       ├── ci.yml                       test on push, matrix on Node LTS × OS
│       ├── release.yml                  build + publish to npm on tag
│       └── docs.yml                     optional: publish docs/ to a site
│
│   ── BUILDER'S OWN DEV BACKLOG (DOGFOOD) ──────────────────────────────
├── AGENTS.md                  [REQ]  this project's front door for agents working on the builder
├── CLAUDE.md                  [OPT]  → AGENTS.md (symlink)
└── .backlog/                  [REQ]  Backlog.md root for the builder's own development tracking
    ├── config.yml                       task_prefix=builder
    ├── tasks/
    └── archive/
```

## The generated authoring workspace (what `wpm init` scaffolds)

The scaffold above is the **builder-project** — the repo that *ships* the `wpm` CLI. It is not what an author works in. When an author runs `wpm init`, the CLI generates a separate, much smaller tree: an **authoring workspace** that wraps the deliverable, distinct from both this builder-project and from the shipped-artifact scaffold of `06`. It has the three regions named consistently across the design set — the **authoring workspace root**, the **deliverable subdirectory `wip/`**, and the **build-output directory `builds/`**:

```
my-installer/                          the AUTHORING WORKSPACE ROOT (wpm init output; the wrapper, never shipped)
│
├── AGENTS.md                          authoring front door: flips the agent into "author a bundle-project" mode;
│                                      points at the installer-builder skill + the authoring backlog (04, 11)
├── CLAUDE.md                          → AGENTS.md (symlink alias; GEMINI.md etc. likewise)
├── .gitignore                         ignores .authoring-backlog/ and builds/ by default
│
├── .authoring-backlog/                OUR zone: the authoring agent's work tracker (gitignored, builder-time only; 11)
│   ├── config.yml                       task_prefix=authoring
│   └── tasks/
│
├── wip/                               the DELIVERABLE under construction — the bundle-project skeleton of 06/07.
│   │                                  Its release ship set, un-nested to the archive root, IS the shipped artifact.
│   ├── manifest.yml                     project release identity + enabled bundles + targets (06)
│   ├── _AGENTS.md                       the executor front door, author-owned, under a reserved leading-underscore
│   │                                    prefix so it stays .md-editable but is NOT auto-discovered by any agent
│   │                                    during authoring; the build strips the prefix → AGENTS.md at the archive
│   │                                    root + CLAUDE.md/GEMINI.md aliases per targets (see below)
│   ├── installer-skills/  …             install-time skills + scope-alias symlinks (06)
│   └── bundles/<id>/                    each bundle: its own _AGENTS.md (same prefix rule) + install-backlog/ … (06)
│
└── builds/                            BUILD OUTPUT: the archives `wpm build` emits (isolated from the workspace)
    └── <project>-<version>.<ext>        each archive = the filtered wip/ release ship set at its root (06)
```

Everything outside `wip/` is authoring-only and never ships; the filtered release ship set from `wip/`, un-nested, *is* the shipped artifact. The filtering removes authoring-only bundle scaffolds, disabled/orphaned bundle entries, and unresolved builder-template sources, while preserving runtime template payloads under enabled bundles. This is the wrapper around `06`'s scaffold, not the scaffold itself — and it is the artifact an author's agent operates on (`04`), driven through the authoring-backlog (`11`). The build's filtering, un-nesting, and executor front door's authoring-time naming are CLI/build behaviour, specified here and with the rest of the `wpm build`/`init` surface (`10`).

## What `wpm build` produces (un-nesting, exclusions, and the front-door prefix-strip)

`wpm build` (`10`) turns the workspace into a shipped artifact by reading the `wip/` deliverable and writing an archive into `builds/`, named `<project>-<version>.<ext>` from `manifest.yml.project`. Three behaviours define the transform; all three follow from the workspace separation above.

**Un-nesting.** The archive root is the release ship set from the `wip/` deliverable, lifted to the top level. Files in that set retain their content; the front-door filenames receive the reserved-prefix transform below. The shipped-artifact contract of `06`/`07` is therefore the filtered contents of `wip/`, viewed from the archive root.

**Exclusions.** The workspace wrapper is **never part of any build artifact**: the authoring backlog (`.authoring-backlog/`), the authoring front door (the workspace-root `AGENTS.md` and its `CLAUDE.md`/`GEMINI.md` aliases), and the build-output directory (`builds/`) are all excluded from every archive. Within `wip/`, the authoring-only `bundles/bundle-template/` scaffold, every disabled or orphaned direct child of `bundles/`, and every unresolved builder-source `*.tmpl` file are excluded. A `*.tmpl` beneath an enabled bundle's `payload/templates/` tree is instead runtime payload content and remains in the ship set, including nested paths and symlink entries. Packaging does not mutate these authoring inputs, so the scaffold remains available for later `bundle new` operations.

**The executor front door's reserved-prefix transform.** The deliverable's executor front door — the file that, once installed, recognises an *end user's* agent and runs the install (`06`, `07`) — must be **editable by the author during authoring yet invisible to the *authoring* agent**, which would otherwise read it as a directive (agent instruction-file discovery is by **exact basename**, with no globs, and every target agent does on-demand subdirectory loading, so nesting under `wip/` alone does not shield it). It is therefore authored under a **reserved leading-underscore prefix** — `wip/_AGENTS.md`, and per bundle `wip/bundles/<id>/_AGENTS.md` — kept `.md` so it stays author-editable, but never matched by any agent's front-door basename (`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`). The build **strips the leading underscore** to restore the canonical names — `_AGENTS.md` → `AGENTS.md` at the archive root, `bundles/<id>/_AGENTS.md` → `bundles/<id>/AGENTS.md` — and creates the `CLAUDE.md`/`GEMINI.md` aliases (build-created symlinks) for each agent in `manifest.targets` — and the same prefix-strip-plus-alias treatment applies per bundle, so each `bundles/<id>/_AGENTS.md` likewise yields `bundles/<id>/AGENTS.md` with its own build-created per-target `bundles/<id>/CLAUDE.md`/`GEMINI.md` aliases. Only the front door carries the prefix; the aliases are build-created. Authored front-door content must therefore **avoid** the reserved source names `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `AGENTS.override.md`, and `CONTEXT.md` (all auto-discovered), and must not use the `.tmpl` suffix. Runtime payload templates are the explicit exception described above. The **per-project installer skill and the advisors are not prefixed and not transformed**: they remain ordinary authored deliverable content under `wip/` and ship as-is, because they are `SKILL.md` files that activate only when a scanned scope points at them — during authoring the workspace's scope aliases do not, so they need no shielding. (Caveat: a user could *non-default*-configure an agent to also read `_AGENTS.md`; the design protects against defaults and documents the residual case rather than claiming an absolute guarantee.)

## Layered architecture

Three layers, each depending only on the ones below:

**CLI layer (`src/commands/`, `src/cli.ts`)** — argv parsing via commander, dispatch to domain functions, error formatting, exit codes, help-text generation, completion dispatch. Thin: every command is roughly read-flags → call-domain-function → format-output. The thinness is enforced by reading code review for "is this command doing logic that should be in `core/`?"

**Domain layer (`src/core/`)** — manifest and bundle.yml schemas, template resolution (project-local then built-in), rendering, validation, authoring-backlog materialisation, scope-alias management, version-constraint resolution. No subprocess calls, no argv, no exit codes — pure functions over an injected filesystem and an injected Backlog.md adapter. This is what's unit-tested.

**Adapter / infrastructure layer (`src/util/`, `src/core/backlog-md.ts`)** — atomic file writes, YAML round-tripping, symlink creation with Windows fallback, subprocess execution, shell completion script emission. The bottom of the stack; nothing above it talks to the OS directly.

The discipline this enforces: integration tests can spin a real tmpdir and run real commands, but unit tests work entirely in-memory with the adapter mocked. The CLI layer is small enough to manually inspect for the discoverability contracts from `10` (every command's `--help` is wired, every command's completion is wired).

## How the CLI implements each load-bearing principle from `10`

Mapping principles to where they live in the code:

| Principle from `10` | Implementation locus |
|---|---|
| One command per author intent | One file in `src/commands/` per leaf command; multiple persistent-store mutations behind a single dispatch |
| Project context is explicit | `src/core/project-context.ts` does the walk-up + `-C` override; called once per project-bound command |
| Above Backlog.md, not parallel | `src/core/backlog-md.ts` is the only file that calls `backlog …`; the CLI never wraps task operations |
| Structure, not content | `src/core/render.ts` (template substitution) and `src/core/authoring-backlog.ts` (task materialisation) are the two paths; no other module writes user-visible prose |
| Derived artefacts stay current automatically | `src/core/derived-artefacts.ts` is invoked from every mutating command in the CLI layer |
| Every command is discoverable | commander's `.helpInformation()` hook + `src/help/` + `src/completion/`, exercised by integration tests asserting `installer <cmd> --help` exits 0 with non-empty output and that `installer __complete …` returns suggestions where expected |
| V2 tagging is convention, not verb | The CLI never calls `backlog task create -l kind:state …` itself; the agent does. Review-phase tasks in the authoring-backlog verify compliance |

## Templates as data, not code

Built-in templates in `templates/` are *static directory trees plus a small `template.yml`*. The CLI's `render.ts` reads `template.yml` to learn the parameter list, walks `files/` recursively, and writes each file out with `{{placeholder}}` substitution. There is no template engine logic in the templates themselves — no conditionals, no loops, no logic. When a project needs specialized shapes, each is a separate project-local template directory rather than a conditional branch inside another template.

A project template carries two kinds of content: `files/` is copied wholesale at `init` time; `snippets/` holds single-file stubs rendered on demand later (the advisor, install-time-skill, and payload-skill SKILL.md stubs that `… advisor add` / `… installer-skills add` / `… skills add` emit in their scaffold branch). Both use the same `render.ts` substitution; they differ only in *when* the CLI reaches for them. Keeping snippets in the template (rather than hard-coding the stub text in the CLI) is the same structure-not-content discipline that governs everything else: the stub's shape is template-author content, and the CLI only fills variables.

This keeps templates trivially diff-able and review-able, and means template authoring is just "write the files you want, mark variables with `{{...}}`, drop the directory in `templates/`." A custom template a project ships is the same kind of artefact the built-ins are — there's no separate publish step that transforms it.

## The bundled agent skill (`agent-skills/installer-builder/`)

This is the layer that closes the loop on the discoverability principle. Tab-completion and `--help` make the CLI usable; an agent skill makes it *idiomatic*. The skill teaches an agent reading it:

1. **When to invoke it.** The description triggers on "author a bundle-project," "build an installer," "create an agentic installer," "ship this as a bundle-project."
2. **The mental model.** The agent reads enough of the model (bundles, manifest, install-backlog, payload, the authoring-backlog) to know what it's producing.
3. **The workflow.** Elicit the human author's intent (per the agent's instructions, not a fixed script), scaffold via `wpm init`, work through the authoring-backlog phase by phase, drive Backlog.md directly for recipe tasks, use the CLI for structure.
4. **The conventions.** V2 tagging, structure-not-content, no-mirror, idempotent detect.

The skill body itself is short; the depth lives in `references/` (each a markdown file under 100 lines), loaded by the agent only when needed. This is the standard SKILL.md progressive-disclosure shape from `05`.

Installation: when the user runs `npm i -g <package>`, the post-install script offers to copy `agent-skills/installer-builder/` into the agent's scanned scope (`~/.claude/skills/`, `~/.agents/skills/`, etc.) — opt-in, not silent. Skipping the copy is fine; the agent can still use the CLI from `--help` alone, just less idiomatically.

## Execution mechanics live in the project-template files

The behaviours that make an *install* work aren't separate shipped artifacts — they're content inside files the project template already carries, copied into every generated project at `init`. There's no fourth package category; there's the project template, and these files are part of it. The full catalogue of what each file says is in `06` ("What the template's files actually say"); the builder-side point is that authoring these files well is authoring the templates well.

Two things are worth calling out here. First, the **per-task workflow** (`09` §3 — detect→…→verify→record, never-touch-siblings) is *stated* in the template's `AGENTS.md` and expanded procedurally in the per-project `⟨project⟩-installer` skill. The builder does not ship a separate "discipline" skill of its own authorship; the workflow lives where install instructions have always lived. Second, **`RALPH-LOOP.md`** is a plain-prose doc the template carries — the install task statement plus the per-iteration SDLC instructions, i.e. the *prompt* an unattended loop feeds each fresh agent instance (the analogue of the `prompt.md`/`CLAUDE.md` prompt template real Ralph runners use). It is **not** a loop runner. The runner, if the author wants unattended installs, is a separately-named third-party plugin they vendor (below); `RALPH-LOOP.md` is the instructions that plugin — or a bare agent re-reading it each pass — executes.

The builder deliberately does **not** ship a discipline-*enforcer* skill or a loop *runner* of its own. Where an author wants the workflow enforced rather than merely stated, the move (documented in `06`) is to **vendor a real, existing discipline skill** — obra's superpowers (MIT), BMAD-METHOD, or Spec Kit — into the project's `installer-skills/`. Where they want unattended execution, they **vendor a real Ralph runner plugin** — a separately-named third-party package such as `snarktank/ralph` (MIT), which carries its own `.claude-plugin/` manifest, `skills/`, and `ralph.sh` loop — into `installer-skills/` or the agent's plugin scope. That runner is distinct from the `RALPH-LOOP.md` doc the builder's template *does* author: the doc is the per-iteration prompt (task + SDLC), the plugin is the engine that runs it. Both vendored artifacts are the author's choice per project, made at authoring time, under their own licenses, not something the builder maintains or bundles by default. The builder's only responsibility is that `installer-skills/` (and the agent's plugin scope) are the right homes for them (`05`, `10`) and that `AGENTS.md` and the orchestrator can point the agent at whatever is present.

## Distribution and the user's install experience

A first-time user, end-to-end:

```bash
# Install Backlog.md first (peer dep)
npm i -g backlog.md

# Install the builder
npm i -g <installer-package-name>

# (Optional) install the agent skill
installer skill install      # copies agent-skills/installer-builder/ into the user's scope

# Create their first bundle-project, then add the bundles it needs
wpm init my-installer --template minimal
cd my-installer
wpm bundle new core --no-advisor

# Their agent (Claude Code, Codex, etc.) takes over from here, working through the
# authoring-backlog that init populated
```

No registry beyond npm. No telemetry. No login. No template marketplace. The agent skill is opt-in.

## Development workflow

Standard Node project conventions:

```bash
npm install                 # dependencies
npm run dev                 # tsc --watch + run cli.ts on changes
npm test                    # vitest, full suite
npm run test:unit           # just unit
npm run test:integration    # just integration (slower, real tmpdirs)
npm run lint                # biome check
npm run build               # tsc → dist/
npm run release             # CI handles via tag push
```

`package.json`'s `bin` field points at `dist/cli.js`, so a local `npm link` makes the `wpm` command available pointed at the in-progress build.

## Dogfooding: the builder uses Backlog.md too

`.backlog/` at the repo root tracks development work on the builder itself. The same Backlog.md the builder shells out to is the one tracking issues against it. Tasks like "implement `bundle <id> requires add`," "wire tab completion for `template show`," "write integration test for version-bump cascades." Standard Backlog.md vocabulary — no `step:` / `kind:` / `phase:` labels (those are for bundle-project recipes, not for our development).

The dogfooding earns its keep three ways: it surfaces real Backlog.md UX issues we'd otherwise miss as builder authors; it documents the project's history as durable task records rather than just commits; and it teaches new contributors how the tool works *by using the tool itself*.

## What's deliberately not in the architecture (yet)

- **No plugin system.** Third-party commands can't be loaded at runtime. The surface in `10` is the surface. If extension proves a real need, it's a v2 conversation.
- **No telemetry.** No anonymous-usage pings, no error reporting beacons, no opt-in analytics. The CLI is silent by default.
- **No template registry or sharing.** Templates resolve from project-local `templates/` → built-in. There's no user-global template library, no `installer-hub` server, no marketplace, and no `template add`/`publish`/`update` commands. A custom template is a directory in the project's `templates/`; sharing one across projects or authors is a manual copy (or `git` of that directory) for now. A real fetch/publish registry is a v2 conversation.
- **No language bindings.** TypeScript only; if Python/Rust users want similar tooling, they re-implement it. The doc set 00-14 *is* the spec, and is language-neutral.
- **No GUI / web UI.** The CLI, `--help`, tab completion, the agent skill, and the design docs are the whole UX. No `wpm dashboard`.

Each of these is a future-conversation, not a missing-piece. Calling them out keeps the scope honest.

## Cross-refs

`10` is the surface this project implements. `07` and `06` describe what the templates contain. `11` is the workflow the authoring-backlog materialises. `04` is the agent-side counterpart of the bundled `installer-builder` skill — it describes how the agent *should behave* when driving this CLI. All five docs and this one together describe the full system: the design (00-09), the building-of-that-design's CLI (10-11), and the building-of-that-CLI's project (12).
