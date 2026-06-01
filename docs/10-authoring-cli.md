# 10 · The Authoring CLI

The concrete surface of doc `04`'s protocol — what the authoring agent actually invokes when helping a human build an installer-project. Where `04` describes *how* the agent should behave (draw out the author's intent, decompose into detect/setup/verify, force the three author decisions, simulate the executor), this document is the *command surface* those behaviours produce changes through. Read it as the static spec the agent dispatches against, sitting alongside `06`'s skeleton and `07`'s contract.

The binary is called `wpm` throughout as a working placeholder. Whether it ends up implemented as a standalone CLI, an MCP server, or a thin wrapper script over Backlog.md + filesystem + YAML edits is an implementation detail; the surface below is the same in each case.

## Design principles

The shape comes from a few decisions the prior docs already make.

**The CLI authors recipes, never receipts.** Every command produces or edits a piece of the shipped project — recipe tasks, manifest entries, payload files, skills, templates. The receipt is the executor's job at install time on the user's machine; nothing in this CLI writes to it.

**One command per author intent, not per persistent store.** "Create a new bundle" is one author intent that happens to touch both `bundles/<id>/` and `manifest.yml`; it gets one command. The two-store split is an implementation detail the CLI hides, not a workflow seam.

**The bundle is the working unit; its contents live inside it.** Each top-level command group corresponds to either a user-managed unit (`project`, `bundle`, `template`) or a workflow concept (`init`, `build`). Sub-entities that only exist within a bundle — its files, templates, scripts, payload skills, bundle-scoped install-time skills, its advisor, plus its `requires`/`meta`/`version` — are subcommands of `bundle <id>`, not top-level peers. Install-time helper skills that belong to the whole project are subcommands of `project` (`project installer-skills`); install-time skills that belong to a bundle are subcommands of that bundle (`bundle <id> installer-skills`, `bundle <id> advisor`). There is no top-level group for them — a skill is always a property of the thing it serves. The author thinks "I'm working on `web-handoff`; it has these files and these skills"; the command tree mirrors that: `bundle web-handoff files add …`, not `files add web-handoff …`. The `manifest.yml` file is where project state is stored, but it isn't a CLI concept; `project ...` and `bundle ...` write to it transparently, the same way they write to `bundle.yml` without a `bundle-yml` group existing.

**Project context is explicit.** Every command except `init` and the project-agnostic `template` subcommands operates on a specific project, identified by walking up from the working directory until a `manifest.yml` is found. A global flag `-C, --project <path>` overrides the search. Project-bound commands fail loudly when no project is resolved, naming the marker and suggesting `init` or `-C`. Each group's relationship to a concrete project is stated in the tree below — **project-bound** (needs a project), **project-creating** (`init`), **project-aware** (works either way, behaviour shifts).

**V2 tagging is the recipe-task convention, not a CLI verb.** The three load-bearing tags from `08` — identity (`step:<slug>`), kind (`kind:state` / `kind:migration`), and version (milestone) — are applied at the moment the agent creates a task via Backlog.md directly inside a bundle. The CLI doesn't wrap that; it documents the convention (in `08`) and verifies compliance through review-phase tasks in `.authoring-backlog/` (see `11`).

**Templates are discoverable, not a distribution system.** Both the project root and individual bundles come from named templates the author can list and inspect. There are two sources: the CLI's built-ins, and whatever directories live in the project's own `templates/`. Authoring a custom template is "drop a directory in `templates/` with a `template.yml`" — there's no `add`/`publish`/`update` machinery, because template *sharing* (across projects, across authors) is a future concern, not a v1 one; for now a custom template is shared the same way any code is, by copying the directory. The single hardcoded `bundle-template/` becomes one materialised default, not a special case in the filesystem.

**Above Backlog.md, not parallel to it.** Every command in this CLI does something Backlog.md doesn't — project-wide orchestration, manifest + bundle coordination, scaffolding, templates, derived-artefact regeneration. **Task operations are not wrapped here at all** — neither read (list, view, search) nor write (create, edit, reorder, archive). The agent invokes Backlog.md directly inside the relevant backlog root, applying the V2 tagging conventions from `08`. The CLI's job is to define those conventions (in `08`) and to track verification work as review-phase tasks in the authoring-backlog (in `11`), not to alias `backlog task create`.

**Structure, not content.** The CLI manages structure — projects, bundles, the manifest entries, the registered references to payload files and skills. The user-facing content of the installer — task descriptions, SKILL.md bodies, payload file contents — is written by the agent directly via the filesystem (its editor, write tools, `cat > … << EOF`); the CLI's role is to register, list, and validate what the agent placed.

Where a command appears to write content (e.g., `init` creating `AGENTS.md`, `project targets add` re-rendering it, `bundle new` creating a `bundle.yml`), that content comes through **one of exactly two paths**:

- **Template-driven**: a registered template provides a snippet, and the CLI does mechanical placeholder substitution (`{{project-name}}` → `hermes-handoff`, `{{bundles}}` → the list of summaries pulled from each `bundle.yml`, etc.). No sense-dependent prose is invented at command time — the template author wrote it once, and the CLI fills variables.
- **Task-driven**: the CLI creates a task in `.authoring-backlog/` (directly, at the moment the command introduces new authoring scope) for the agent to write the content via filesystem, the same way the agent writes everything else.

Concretely: `bundle new` is template-driven (it copies from the chosen bundle template); `bundle <id> version bump` is task-driven (adds review tasks rather than writing migration content itself); `project targets add`, `bundle <id> advisor add`, and `… installer-skills add` (in its scaffold branch) are both — template-driven render of a structural stub (the re-rendered `AGENTS.md`/installer skill; the advisor's or helper's frontmatter + placeholder body) plus task-driven materialisation of the prose-writing work. The CLI never decides what prose belongs in an `AGENTS.md` recognition line, a SKILL.md body, or an advisor's recommendation trigger — those came from the template author once (the structural shell) or get written by the agent against a materialised task (the sense-dependent body). This is why the skill-adding commands share one verb, `add`, with a uniform meaning: *attach the skill if the author already wrote it, otherwise scaffold a stub and queue the writing* — never silently author a finished skill.

**Derived artefacts stay current automatically.** `AGENTS.md` and `<project>-installer/SKILL.md` are pure derivatives of `manifest.yml` + each enabled bundle's `bundle.yml`. There is no separate `update` or `regenerate` command — every command that mutates one of the input files re-renders the derivatives as part of its own action (mechanical substitution from the project template's snippets). `project targets add/remove`, `bundle new/enable/disable`, `bundle <id> meta`, `bundle <id> version bump/set`, and `project meta`/`project version` all carry this implicit re-render; the row's action list calls it out where it's load-bearing for the command's intent (the agent-list change in `project targets`, the bundle-list change in `bundle new`) and elides it where it's incidental.

**Every command is discoverable from the terminal.** Two contracts apply to every command, every subcommand, every leaf — including the groups themselves:

- **Tab completion** completes commands, subcommands, flags, and positional arguments wherever a value set is knowable. Bundle IDs come from `manifest.yml.bundles`. Target agent names from `manifest.yml.targets` (for `remove`) or from the CLI's built-in well-known list (for `add`). Template names from the available templates (built-in + project's `templates/`), filterable by `template.yml.scope`. File paths inside a bundle from filesystem context. Version-bump levels (`major|minor|patch`), format choices (`zip|tarball|git`), confirmation levels (`safe|dangerous`), kind values (`kind:state|kind:migration`) — every finite enum, completed. Unknown-value positionals (a new `<id>` on `bundle new`) get no suggestions but still complete flags after the positional is typed.
- **`--help` / `-h`** is supported and returns substantive content on every command, top-level group through leaf. The output includes: a one-line description, a synopsis line (`usage: wpm bundle new <id> [--template <name>] [--disabled] [--version <v>]`), every flag with its type and default, every positional argument with its meaning, and a worked usage example where the flag set is non-trivial. The help is self-sufficient for the common case — an author who's used a Unix-style CLI before should never need to consult this doc to learn how a command is invoked.

A command that lacks either is a CLI bug, not a corner case. The cost of meeting both contracts is what buys the CLI its conversational fluency at the terminal; without them, the no-mirror principle (don't wrap Backlog.md, don't wrap the filesystem) becomes friction rather than freedom.

## The command tree

```
installer
│
├── init <project-name>                          project-creating · scaffolds a project root
│       [--at <path>]                              defaults to cwd
│       [--template <name>]                        default: built-in "minimal"
│       [--list-templates] [--param key=value …]
│
├── template                                     project-aware · the templates available to instantiate from
│   ├── list                                     all applicable (project-local + built-in in a project; built-in otherwise)
│   │       [--scope project|bundle]               filter by template scope
│   └── show <name> [--scope ...]                metadata + tree of one template
│                                                 (custom templates are discovered from the project's templates/ dir
│                                                  and the built-ins; authoring one is "drop a dir in templates/", no command)
│
├── project                                      project-bound · the project as a release unit
│   ├── show [--json]                            name, version, description, root, targets, bundles (the orientation call)
│   ├── meta                                     edit project metadata in one call
│   │       [--name <n>] [--description <d>]
│   │       [--license <l>] [--repository <url>]
│   │       [--author <a>]
│   ├── version                                  bare: show current release version
│   │   ├── bump <major|minor|patch>             bump and write back to manifest.yml
│   │   └── set <explicit-version>               set to an explicit version (rare)
│   ├── targets                                  the agents this installer supports (Claude Code, Hermes, Codex, …)
│   │   ├── add <agent>                          start supporting <agent>: append to manifest, create scope-alias,
│   │   │                                          re-render derived artefacts, materialise per-bundle verify tasks
│   │   ├── list
│   │   └── remove <agent>                       reverse of add
│   ├── installer-skills add|list|remove <name>  project-scoped install-time helper skills
│   │       [--path <path>]                        add: attach an existing SKILL.md, or scaffold a stub +
│   │                                              materialise a content task if none exists; at installer-skills/<name>/
│   ├── validate                                 dep constraints resolve; no cycles; targets non-empty; no orphan bundle dirs
│   └── root                                     print the resolved project root path (composable in $(...))
│
├── bundle                                       project-bound · THE author's primary working unit
│   │
│   │  ── cross-bundle operations (no specific bundle context):
│   ├── new <id>                                  create the dir AND enable in manifest (the default)
│   │       [--template <name>] [--disabled]        template defaults to bundles/bundle-template/;
│   │       [--version 0.1.0] [--no-advisor]        --disabled creates without enabling (rare; defer a draft);
│   │                                               --no-advisor skips the auto advisor (for dep-only bundles like core).
│   │                                               <id> is kebab-case and must not be a reserved word
│   │                                               (new|enable|disable|remove|list|template) — those name cross-bundle ops
│   ├── enable <id>                               add an existing disabled bundle to manifest
│   │       [--no-advisor]                          skip the auto advisor add (the same flag bundle new takes)
│   ├── disable <id>                              remove from manifest; the dir stays on disk, invisible to the installer
│   ├── remove <id>                               full teardown: drop from manifest, delete bundles/<id>/,
│   │                                               delete its advisor stub, archive its authoring tasks (asks to confirm)
│   ├── list                                      each bundle's id, version, and state/migration task counts
│   ├── template show|set                         the project's default bundle template
│   │
│   │  ── per-bundle operations (after `bundle <id>`, a fresh subcommand space on that bundle):
│   └── <id>                                      enters per-bundle context
│       ├── show                                  bundle.yml + tree summary
│       ├── meta                                  edit bundle.yml: --version, --summary, --confirmation-level <safe|dangerous>
│       ├── version                               bare: show this bundle's current version
│       │   ├── bump <major|minor|patch>          bumps version + reminds about migrations
│       │   └── set <explicit-version>            set to an explicit version (rare)
│       ├── requires add|list|remove              dependency on another bundle by id + npm-style version constraint
│       │       <dep-bundle-id> [<version-constraint>]    e.g. add core "^0.3.0"
│       ├── files add|list|remove <path>          payload/files/ — authoritative reference files
│       ├── templates add|list|remove <path>      payload/templates/ — parameterised (lower-trust tier)
│       ├── scripts add|list|remove <path>        installer-scripts/ — install-time tooling, NOT delivered
│       ├── skills add|list|remove <name>         payload/agent-skills/ — the RUNTIME products
│       │       [--path <path>]                     default: payload/agent-skills/<name>/SKILL.md
│       │                                           agent authors the SKILL.md; CLI verifies + registers
│       ├── installer-skills add|list|remove <name>  install-time helper skills scoped to this bundle
│       │       [--path <path>]                       add: attach existing, or scaffold a stub + content task if none;
│       │                                             at bundles/<id>/installer-skills/<name>/ (union-scanned; see 06)
│       └── advisor add|remove                      this bundle's pull-UX advisor (one per bundle)
│                                                   add: render stub at installer-skills/<id>-advisor/ + materialise content task;
│                                                   remove: delete stub + close the task. Auto-added by `bundle new`.
│
│   (Task operations on a bundle's install-backlog — create, list, view, edit, reorder, archive —
│    use Backlog.md directly inside the bundle. V2 tagging conventions are in `08`.
│    Example: cd bundles/<id> && backlog task create "..." -l "kind:state,step:<slug>" -m <v> --ac "..." --dod "...")
│   (Bundle documentation is just files under bundles/<id>/docs/ — nothing references them, so there's no
│    register step; the author writes and edits them directly.)
│
└── build                                        project-bound · package for distribution
    ├── dry-run                                  run `project validate` + show what would ship
    ├── package [--format <zip|tarball|git>]
    └── publish <destination>                    push to a registry/git remote (optional)
```

## Per-command actions

One row per leaf command. The **Group** column is left blank when it carries from the row above (so the visual block grouping shows hierarchy). The **Actions** column is what the CLI does on that invocation — what files it reads, writes, validates, regenerates. Useful both as a contract for implementation and as a reference for spotting where any given command's behaviour is ambiguous or overlaps with another.

| Group | Command | Actions on invocation |
|---|---|---|
| `init` | `init <name> [--at <path>] [--template <name>] [--list-templates] [--param k=v]` | 1. Resolve template (default builtin `minimal`)<br>2. Refuse if target path exists<br>3. **Template-driven**: copy template `files/` into `<path>`/cwd, substituting `{{placeholders}}` mechanically (no prose generated)<br>4. **Template-driven**: instantiate `manifest.yml` from the template's `manifest.yml` snippet — project name from positional, `targets:` and `bundles:` taken from the template (typically empty for `minimal`; pre-populated for `single-bundle`/`multi-bundle`)<br>5. Create `bundles/` and copy default bundle template to `bundles/bundle-template/`<br>6. Create empty `installer-skills/`, `templates/`, and `.authoring-backlog/` (Backlog.md root with `task_prefix=authoring`)<br>7. Create scope-alias symlinks for each target listed in `manifest.yml.targets` (looked up from the CLI's built-in agent→alias map); if no targets, no aliases yet (added later by `project targets add`)<br>8. **Template-driven**: render `AGENTS.md` and `<project>-installer/SKILL.md` from project template snippets<br>9. **Task-driven**: materialise the project-wide authoring tasks (set metadata, confirm targets, release-phase tasks, project-wide review tasks) per the catalog in `11`<br>10. **Task-driven**: for each bundle the template pre-includes in `manifest.yml.bundles`, materialise its per-bundle authoring task set (same as `bundle new`'s materialisation)<br>11. Add `.authoring-backlog/` to `.gitignore`<br>12. Print summary (project created at `<path>`, N authoring tasks materialised) |
| `template` | `template list [--scope ...]` | 1. Enumerate templates from built-in + (project's `templates/`, if in one)<br>2. Apply `--scope` filter<br>3. Print grouped by source, indicating shadowing (project shadows built-in) |
|  | `template show <name> [--scope ...]` | 1. Resolve by name + scope (project → built-in priority)<br>2. Read `template.yml`<br>3. Print metadata + a tree summary of `files/` |
| `project` | `project show [--json]` | 1. Read `manifest.yml`<br>2. Read each enabled bundle's `bundle.yml` for its version<br>3. Print orientation (name / version / description / root path / targets / bundles) — or the JSON form |
|  | `project meta [--name ...] [--description ...] [--license ...] [--repository ...] [--author ...]` | 1. Read `manifest.yml`<br>2. Update `project:` fields from provided flags (omitted flags untouched)<br>3. Write back |
|  | `project version` | 1. Read `manifest.yml.project.version`<br>2. Print to stdout |
|  | `project version bump <major\|minor\|patch>` | 1. Read current version<br>2. Compute next per semver rules<br>3. Update `manifest.yml.project.version`<br>4. Print new version |
|  | `project version set <explicit>` | 1. Validate semver<br>2. Update `manifest.yml.project.version`<br>3. Print |
|  | `project targets add <agent>` | 1. Validate `<agent>` is not already in `manifest.yml.targets`<br>2. Append to `manifest.yml.targets`<br>3. Create the scope-alias symlink for `<agent>` (`.claude/skills`, `.agents/skills`, etc. — looked up from the CLI's built-in map of well-known agents; warns and skips if `<agent>` is unknown so the author can configure the alias manually)<br>4. **Template-driven**: re-render `AGENTS.md` and `<project>-installer/SKILL.md` from project template snippets (mechanical substitution of the new agents list and bundle summaries)<br>5. **Task-driven**: materialise per-bundle authoring tasks "Verify `<id>`'s install-backlog works on `<agent>`"<br>6. Print summary |
|  | `project targets list` | 1. Read and print `manifest.yml.targets` |
|  | `project targets remove <agent>` | 1. Validate `<agent>` is in `manifest.yml.targets`<br>2. Remove from `manifest.yml.targets`<br>3. Remove the scope-alias symlink for `<agent>` (warn if it doesn't exist)<br>4. **Template-driven**: re-render derived artefacts (same substitution as `add`)<br>5. Warn if it was the last target<br>6. Print summary |
|  | `project validate` | 1. Bundle dirs match `manifest.yml.bundles` (no orphans except `bundle-template/`)<br>2. For each bundle's `requires`: required bundle ID is enabled, and its declared `bundle.yml.version` satisfies the version constraint<br>3. No circular `requires` (depth-first walk detects cycles)<br>4. `targets:` non-empty; `project.version` is valid semver<br>5. Scope-alias symlinks under `installer-skills/` are well-formed (no bare `skills/`)<br>6. Exit 0 or non-zero, printing findings |
|  | `project root` | 1. Resolve project root by walking up from cwd for `manifest.yml`<br>2. Print path to stdout (single line, no newline padding) |
| `bundle` | `bundle new <id> [--template <name>] [--disabled] [--version 0.1.0] [--no-advisor]` | 1. Validate `<id>`: kebab-case, not already in manifest, and not a reserved cross-bundle verb (`new`/`enable`/`disable`/`remove`/`list`/`template`) — otherwise `bundle <id> …` would be ambiguous<br>2. Resolve bundle template (default: project's `bundles/bundle-template/`)<br>3. **Template-driven**: create `bundles/<id>/` from template with placeholders substituted mechanically (`{{bundle-id}}` → `<id>`, `{{version}}` → `--version` value, etc.)<br>4. Set `id`, `version`, empty `requires: {}`, `task_prefix=<id>` in `bundle.yml` and in `install-backlog/config.yml`<br>5. Unless `--disabled`: append `<id>` to `manifest.yml.bundles` (flat list)<br>6. Unless `--no-advisor`: run the `bundle <id> advisor add` action (template-render the advisor stub + materialise its content-authoring task)<br>7. **Task-driven**: materialise the per-bundle authoring task set (plan / fill / payload / per-bundle review) per the catalog in `11`; titles are stable so re-invocation de-dupes by title<br>8. Print summary (bundle created, advisor scaffolded unless skipped, N authoring tasks materialised) |
|  | `bundle enable <id> [--no-advisor]` | 1. Validate dir exists and id not already in manifest<br>2. Append `{id: <id>}` to `manifest.yml.bundles`<br>3. Unless `--no-advisor` or an advisor already exists: run `bundle <id> advisor add`<br>4. **Task-driven**: idempotently materialise the per-bundle authoring task set (skips any task whose title already exists, so re-enabling a previously-authored bundle is a no-op) |
|  | `bundle disable <id>` | 1. Remove from `manifest.yml.bundles` (dir stays on disk; effect is inert)<br>2. Re-render derived artefacts (bundle drops out of the menu) |
|  | `bundle remove <id>` | 1. Confirm with the author (destructive)<br>2. Remove `<id>` from `manifest.yml.bundles` if present<br>3. Delete `bundles/<id>/` from disk<br>4. Delete the advisor stub `installer-skills/<id>-advisor/` if present<br>5. Archive the bundle's authoring tasks in `.authoring-backlog/` (the ones whose titles name `<id>`)<br>6. Re-render derived artefacts<br>7. Print what was removed |
|  | `bundle list` | 1. Enumerate `manifest.yml.bundles`<br>2. For each: read `bundle.yml` (version), scan install-backlog for `kind:state` and `kind:migration` task counts<br>3. Print table |
|  | `bundle template show` | 1. Inspect `bundles/bundle-template/`: its template metadata + tree |
|  | `bundle template set <name>` | 1. Resolve `<name>` from registry (must have `scope: bundle`)<br>2. Replace `bundles/bundle-template/` contents from template's `files/` |
|  | `bundle <id> show` | 1. Read `bundles/<id>/bundle.yml`<br>2. Print bundle metadata + tree summary |
|  | `bundle <id> meta [--version <v>] [--summary <s>] [--confirmation-level safe\|dangerous]` | 1. Read `bundle.yml`<br>2. Update fields from flags (omitted untouched)<br>3. Write back |
|  | `bundle <id> version` | 1. Read `bundle.yml.version`<br>2. Print |
|  | `bundle <id> version bump <major\|minor\|patch>` | 1. Compute next per semver<br>2. Update `bundle.yml.version`<br>3. **Task-driven**: materialise authoring tasks — "Review state-tasks for `<id>` at `<new-version>`", "Consider migration tasks for `<id>` `<prev>→<new>`", "Simulate upgrade for `<id>` from `<prev>` to `<new>`", and for each bundle whose `requires` map names `<id>`: "Review version constraint on `<id>` at `<new-version>`"<br>4. Print new version |
|  | `bundle <id> version set <v>` | 1. Validate semver<br>2. Update `bundle.yml.version`<br>3. Print |
|  | `bundle <id> requires add <dep-bundle-id> [<constraint>]` | 1. Validate `<dep-bundle-id>` is in `manifest.yml.bundles` (enabled)<br>2. Default constraint `^<dep's current version>` if not given<br>3. Append/overwrite entry in this `bundle.yml.requires` map<br>4. Warn if it introduces a cycle<br>5. **Task-driven**: materialise an authoring task "Adapt `<id>`'s install-backlog and payload to use `<dep-bundle-id>`" |
|  | `bundle <id> requires list` | 1. Read and print this bundle's `requires` map (dep-id + constraint per line) |
|  | `bundle <id> requires remove <dep-bundle-id>` | 1. Remove the entry from this `bundle.yml.requires` map<br>2. **Task-driven**: materialise an authoring task "Verify `<id>` no longer references `<dep-bundle-id>` in install-backlog tasks or payload" |
|  | `bundle <id> files add <path>` | 1. Validate `bundles/<id>/payload/files/<path>` exists on disk (agent placed it)<br>2. Register reference (in `bundle.yml` payload list or equivalent)<br>3. CLI does NOT write file content |
|  | `bundle <id> files list` | 1. Enumerate registered payload files (or scan `payload/files/`) |
|  | `bundle <id> files remove <path>` | 1. Deregister the reference<br>2. Leave the file on disk; print "deregistered; file left at `payload/files/<path>` — delete it yourself if you meant to" |
|  | `bundle <id> templates add\|list\|remove <path>` | Same as `files`, against `payload/templates/`; `remove` deregisters and leaves the file, printing where |
|  | `bundle <id> scripts add\|list\|remove <path>` | Same as `files`, against `installer-scripts/` (install-time tooling; NOT delivered to user); `remove` deregisters and leaves the file, printing where |
|  | `bundle <id> skills add <name> [--path <path>]` | 1. Resolve target: `--path` if given, else `bundles/<id>/payload/agent-skills/<name>/SKILL.md`<br>2. **If a SKILL.md exists there (attach):** validate frontmatter; register the reference<br>3. **If none exists and no `--path` (scaffold):** **Template-driven** render a payload-skill stub at the conventional path (frontmatter `name: <name>` + placeholder runtime-trigger description); **Task-driven** materialise "Write payload skill `<name>` for `<id>`"; register<br>4. **If `--path` given but nothing exists there:** error<br>5. Print what it did (attached, or scaffolded + task id) |
|  | `bundle <id> skills list` | 1. Enumerate registered payload skills |
|  | `bundle <id> skills remove <name>` | 1. Deregister; print "deregistered; SKILL.md left at `payload/agent-skills/<name>/` — delete it yourself if you meant to" |
|  | `bundle <id> installer-skills add <name> [--path <path>]` | 1. Resolve target: `--path` if given, else `bundles/<id>/installer-skills/<name>/SKILL.md`<br>2. **If a SKILL.md exists there (attach):** validate frontmatter (`name`, `description`); register the reference<br>3. **If none exists and no `--path` (scaffold):** **Template-driven** render a stub at the conventional path from the project template's installer-skill snippet (frontmatter `name: <name>` + placeholder description/body — no sense-dependent prose); **Task-driven** materialise "Write content for install-time skill `<name>` in `<id>`"; register<br>4. **If `--path` was given but nothing exists there:** error (omit `--path` to scaffold a stub at the conventional location)<br>5. Ensure the bundle's `installer-skills/` scope aliases exist (per `06`'s self-similar surfaces); create if absent<br>6. Print what it did (attached, or scaffolded + the task id) |
|  | `bundle <id> installer-skills list` | 1. Enumerate `bundles/<id>/installer-skills/` for helper SKILL.md files |
|  | `bundle <id> installer-skills remove <name>` | 1. Deregister; print "deregistered; SKILL.md left at `bundles/<id>/installer-skills/<name>/`" |
|  | `bundle <id> advisor add` | 1. **Template-driven**: render the advisor stub `installer-skills/<id>-advisor/SKILL.md` from the project template's advisor snippet (frontmatter `name: <id>-advisor` + a placeholder description/body — no sense-dependent prose)<br>2. **Task-driven**: materialise authoring task "Write advisor content for `<id>`" — the agent fills the trigger description + recommendation body<br>3. No-op if the advisor already exists |
|  | `bundle <id> advisor remove` | 1. Delete `installer-skills/<id>-advisor/`<br>2. Close/archive the "Write advisor content for <id>" task if still open |
| `project` | `project installer-skills add <name> [--path <path>]` | 1. Refuse a `<name>` ending in `-advisor` (reserved) or matching the main installer skill name<br>2. Resolve target: `--path` if given, else `installer-skills/<name>/SKILL.md` at root<br>3. **If a SKILL.md exists there (attach):** validate frontmatter; register at root scope<br>4. **If none exists and no `--path` (scaffold):** **Template-driven** render a stub at the conventional path from the project template's installer-skill snippet; **Task-driven** materialise "Write content for install-time skill `<name>`"; register<br>5. **If `--path` was given but nothing exists there:** error (omit `--path` to scaffold)<br>6. Print what it did (attached, or scaffolded + the task id) |
|  | `project installer-skills list` | 1. Enumerate root `installer-skills/` for project helpers (excluding the main installer skill and the `<id>-advisor` skills) |
|  | `project installer-skills remove <name>` | 1. Deregister at root; print "deregistered; SKILL.md left at `installer-skills/<name>/`" |
| `build` | `build dry-run` | 1. Run `project validate` (fail-fast on error)<br>2. Verify `wpm.lock` against vendored content — hashes must match (frozen-lockfile; fail on drift)<br>3. Print what would ship (file tree), with each vendored artifact's locked version + source; produce no artefact<br>4. (Deeper checks — independence, simulate-executor, simulate-upgrade, slug uniqueness, DoD compliance — live as review-phase tasks in `.authoring-backlog/`; see `11`) |
|  | `build package [--format zip\|tarball\|git]` | 1. Run `project validate`<br>2. Verify `wpm.lock` (frozen-lockfile; fail on drift)<br>3. Produce distributable in `--format` (default `zip`); print output path |
|  | `build publish <destination>` | 1. Build package (above)<br>2. Push to `<destination>` (registry URL, git remote, etc.) |

## The authoring-backlog

The CLI owns a hidden Backlog.md root at `.authoring-backlog/` that tracks the authoring agent's own work on the project (planning bundles, filling install-backlogs, running reviews, regenerating derived artefacts). There is **no dedicated CLI group for the authoring-backlog** — no `plan`, no `authoring`, no `tasks`. Tasks are created **incrementally, at the moment new authoring scope first becomes known**, by the commands that introduce it: `init` materialises the project-wide planning, meta, and release tasks (plus the per-bundle set for each bundle the chosen project template ships pre-included); `bundle new` materialises the per-bundle set for the bundle just created; `bundle <id> version bump` materialises state-task review + migration consideration + requirer-constraint review; `bundle <id> requires add/remove` and `project targets add` materialise their own focused follow-up tasks; the skill-adding commands materialise a content task when they scaffold a stub. Once created, tasks are operated through Backlog.md directly — listing, picking up, marking Done — in line with this doc's no-mirror principle.

Materialisation is idempotent by title: before creating a task, the command checks whether one with the same title already exists in `.authoring-backlog/` and skips if so. There's no dedicated key or label to maintain. The agent self-attests completion (no CLI auto-close); a task moves to Done because the agent did the work and said so, not because the CLI re-evaluated its AC.

The task catalog (which command materialises which tasks, with phases, ACs, and idempotency keys) is canonical in `11`. This doc owns the CLI surface; `11` owns the materialisation table and the workflow.

## Project context resolution

Every project-bound command needs to know which project it's operating on. Resolution mirrors git: the CLI walks up from the current working directory until it finds a `manifest.yml`, and treats the directory containing it as the project root. The global flag `-C, --project <path>` overrides the search; project-creating `init` writes to `<path>` if `--at <path>` is given (default cwd), and `template list`/`show` fall back to built-ins only when no project is resolved.

A project-bound command run outside any project exits non-zero with a single clear line, e.g.:

```
$ wpm bundle list
error: no manifest.yml found in /tmp or any parent directory.
       run `wpm init <project-name>` to create a project, or pass `-C <path>` to target one elsewhere.
```

The resolved path is itself readable via `wpm project root`, which prints just the path for shell composition (`cd "$(wpm project root)/bundles/..."`).

## The `manifest.yml` and `bundle.yml` schemas

`manifest.yml` is the project's release identity plus the list of enabled bundles. Per-bundle metadata (version, summary, dependencies on other bundles) lives in each bundle's own `bundle.yml`, in line with npm-style "each package owns its own metadata":

```yaml
# manifest.yml
project:
  name: hermes-handoff
  version: 3.0.0                    # the project's release version (distinct from per-bundle versions)
  description: Handoff capabilities for agentic workflows
  license: MIT
  repository: https://...           # optional
  author: ...                       # optional

targets:
  - claude-code
  - hermes

bundles:                            # flat list of enabled bundle IDs
  - core
  - web-handoff
  - doc-handoff
```

```yaml
# bundles/web-handoff/bundle.yml
id: web-handoff
version: 0.2.0
summary: Hand off a web page to the user's browser via the handoff channel
confirmation-level: safe
requires:
  core: "^0.3.0"                    # npm-style semver constraint; ^ allows compatible minor updates
```

The project version moves only under `project version bump`/`set`; per-bundle versions move only under `bundle <id> version bump`/`set`. A release at `3.0.0` may ship `web-handoff 0.2.0` and `doc-handoff 0.1.0`, each pinned by its own `bundle.yml.version`. The `bundle.yml.requires` map is the **dependency contract** — concrete bundle IDs with npm-style constraints (`^`, `~`, `>=`/`<`, exact `=`). `wpm project validate` checks each constraint resolves against the dependee's current declared version, and that no cycles exist in the dependency graph.

The user-facing menu the end-user sees (per `02`) is built from each bundle's `summary` field. The summary is the user-readable name; the `id` is internal.

## Templates

A template is a directory with a metadata file plus the tree to copy:

```
<template-name>/
├── template.yml          name, scope (project|bundle), description, parameters
├── files/                the tree that gets copied, with {{placeholders}}
└── README.md             optional human-facing notes
```

A minimal `template.yml`:

```yaml
name: adopts-system-tool
scope: bundle
description: A bundle that wraps a system tool, pre-scaffolded with the adopt-or-install pattern.
parameters:
  - name: bundle-id            # always present, supplied by `bundle new`
  - name: version              # defaults to 0.1.0 if not provided
  - name: tool                 # the system tool being wrapped, e.g. "chromium"
    required: true
```

Placeholders substitute at scaffold time — `{{bundle-id}}`, `{{project-name}}`, `{{version}}`, `{{tool}}` — anywhere in `files/`.

Templates resolve in priority order: **project-local** (`templates/` at project root, for project-specific shapes) → **built-in** (shipped with the CLI). A project-local entry shadows a built-in of the same name.

The starter set of built-ins is deliberately small. A project that wants its own shapes adds directories under its `templates/`; those are picked up automatically.

**Project templates:** `minimal` (root files only + the default bundle template installed as `bundles/bundle-template/`), `single-bundle` (`minimal` + one wired-in `core` bundle), `multi-bundle` (`minimal` + `core` + two example bundles depending on it via `requires`).

**Bundle templates:** `default` (detect→setup→verify state-task scaffold, empty payload, no migrations), `with-payload-skill` (`default` + a `payload/agent-skills/<name>/SKILL.md` runtime-trigger scaffold), `adopts-system-tool` (the detect→adopt-or-install pattern pre-scaffolded with the ownership-aware notes layout).

Reusing a refined bundle as a template today is a copy: drop the bundle's shape (with placeholders) into `templates/` as a bundle-scoped template, and `bundle new --template <name>` scaffolds from it. Cross-project and cross-author template sharing — a real registry with fetch/publish — is deferred until the core proves out (see `12`).

## Two worked sessions

A first-pass authoring session on a new project:

```
# single-bundle ships `core` only; we add the two handoff bundles explicitly.
wpm init hermes-handoff --template single-bundle
cd hermes-handoff

wpm project meta --description "Handoff capabilities for agentic workflows" \
                       --license MIT
wpm project targets add claude-code
wpm project targets add hermes

# core comes from the template; it's a dependency-only bundle, so give it a summary.
wpm bundle core meta --summary "The handoff messaging channel"

# Scaffold the two handoff bundles. Each `bundle new` creates the dir, enables it,
# auto-scaffolds an advisor stub, and materialises that bundle's authoring task set.
wpm bundle new web-handoff
# > Created bundle 'web-handoff'. Advisor scaffolded. Materialised 12 authoring tasks.
wpm bundle new doc-handoff
# > Created bundle 'doc-handoff'. Advisor scaffolded. Materialised 12 authoring tasks.

wpm bundle web-handoff meta --summary "Hand off a web page to the user's browser"
wpm bundle web-handoff requires add core "^0.3.0"
wpm bundle doc-handoff meta --summary "Hand off a document to the user's editor"
wpm bundle doc-handoff requires add core "^0.3.0"

# Task creation goes through Backlog.md directly, with V2 tagging applied as labels.
# NOTE: labels must be ONE comma-separated -l (repeated -l flags keep only the last);
# --ac and --dod, by contrast, accumulate across repeated flags.
(cd bundles/web-handoff && \
   backlog task create "ensure Chromium present" \
     -l "kind:state,step:ensure-chromium" \
     -m 0.1.0 \
     --ac "chromium --version prints" \
     --dod "ownership recorded")

# Dependencies are by task id, not by step slug. This bundle has task_prefix=web-handoff,
# so its task ids are web-handoff-N — look the id up first (e.g. `backlog task list --plain`).
(cd bundles/web-handoff && \
   backlog task create "place launcher config" \
     -l "kind:state,step:place-launcher-config" \
     -m 0.1.0 --dep web-handoff-1 \
     --ac "launcher reachable from agent scope")

# Author payload content via filesystem first (CLI doesn't write content):
mkdir -p bundles/web-handoff/payload/files
cp launchers/web-handoff.json bundles/web-handoff/payload/files/

mkdir -p bundles/web-handoff/payload/agent-skills/handoff-web
cat > bundles/web-handoff/payload/agent-skills/handoff-web/SKILL.md << 'EOF'
---
name: handoff-web
description: Hand off a web page to the user's browser via the handoff channel
---
(skill body authored by the agent…)
EOF

# Then register both with the CLI (it verifies and records, doesn't author):
wpm bundle web-handoff files  add payload/files/web-handoff.json
wpm bundle web-handoff skills add handoff-web

# Note: AGENTS.md and the main installer skill were re-rendered automatically as
# each of the above structural commands ran (no separate update step).

# Review-phase work — the tasks were materialised at `bundle new` time, so
# the agent just lists them via Backlog.md and works through them:
(cd .authoring-backlog && backlog task list --plain -s "To Do")

wpm project show                  # quick orientation check before building
wpm build dry-run
```

A version-bump session shipping a 2.0 with a config-key rename (the worked example from `08`):

```
wpm bundle web-handoff version bump minor                    # bundle: 0.1.0 → 0.2.0
                                                                    # also materialises: state-task review, migration consideration,
                                                                    #                    + requirer-constraint review for every bundle requiring web-handoff

# State task edit (refresh AC + milestone for the new version) via Backlog.md directly.
# Find the task id first (edit is by id, not by step slug; this bundle's prefix is web-handoff):
(cd bundles/web-handoff && backlog task list --plain | grep "place launcher config")
#   → WEB-HANDOFF-2 - place launcher config
(cd bundles/web-handoff && \
   backlog task edit web-handoff-2 \
     --ac "launcher reachable from agent scope; writes new key" \
     -m 0.2.0)

# Migration task — also via Backlog.md, single comma-separated -l, from-gate in the AC body.
# --dep takes the prerequisite's task id:
(cd bundles/web-handoff && \
   backlog task create "migrate config key" \
     -l "kind:migration,step:migrate-config-key-rename" \
     -m 0.2.0 --dep web-handoff-2 \
     --ac "applies when installed version < 0.2.0; rewrites old key to new key, preserving value")

# Agent picks up the materialised review tasks from the bump via Backlog.md:
(cd .authoring-backlog && backlog task list --plain -s "To Do")

wpm project version bump minor                                # project release: 3.0.0 → 3.1.0
wpm build dry-run
```

## What this surface deliberately omits

Four omissions are principled, not gaps. There's no command for "elicit the author's intent" or "ask the trust-gradient question" — those are the authoring agent's instruction-driven behaviour, not CLI operations. There's no command to *write* receipt content (notes, ownership, inverse op) — that's the executor's job at install time on the user's machine; this CLI authors recipes only. **There's no command that authors business content** — task descriptions, SKILL.md bodies, payload file contents are all written by the agent via the filesystem; the CLI registers and validates what the agent placed. And there are no per-task confirmation-level flags as full subcommands — confirmation is a bundle-level setting via `bundle <id> meta --confirmation-level`, since the tier applies consistently across a bundle's steps.

## Implementation note

The CLI is a thin wrapper: most commands compose filesystem operations (templated `cp -r` for `bundle new` from a template, file copies and `cat` for content the agent has authored, symlink management for scope aliases), YAML edits (`manifest.yml`, `bundle.yml`, `config.yml`), template resolution (project-local then built-in), and derived-artefact regeneration (AGENTS.md, scope aliases, the main installer skill). It does *not* wrap Backlog.md task operations; the agent calls those directly with the V2 conventions from `08`. The wrapper exists to enforce things Backlog.md and the filesystem don't — `task_prefix` set on the bundle's `config.yml` *before* any task is created (handled by `bundle new`), and the manifest's coherence with the bundles on disk (verified by `project validate`). Deeper checks — `step:<slug>` uniqueness across `tasks/` + `archive/`, DoD compliance, install-backlog independence, simulate-the-executor and simulate-the-upgrade dry-runs — live as review-phase tasks in the authoring-backlog (see `11`), worked through by the agent rather than wrapped as CLI verbs.

Read with `04` (the authoring agent's protocol — what the agent *does* with these commands), `06` (the skeleton these commands shape), `07` (the receipt-recording contract the recipes carry forward), `08` (the versioning rules `bundle <id> version bump` and Backlog.md task creation enforce together), and `11` (the authoring-backlog these commands materialise into and the catalog of which task each command creates).
