# `wpm` command reference (compressed from doc `10`)

A cheat-sheet of the command surface. One line per command: what it does and its key flags. For the full
per-command actions (what each reads/writes/validates), read doc `10` §"Per-command actions" — this is the
projection, not the source.

> Binary: `wpm` (the `installer` alias is the same program). Every command supports `--help`/`-h` with a
> synopsis, flags, and an example, and tab-completion where a value set is knowable — you should rarely need
> this file to learn an invocation.

## Load-bearing principles (doc `10` §"Design principles")

- **One command per author intent** — "create a bundle" is one command even though it touches `bundles/<id>/`
  *and* `manifest.yml`.
- **Project context is explicit** — every command except `init` and `template …` resolves a project by walking
  up from the cwd for `manifest.yml`; `-C, --project <path>` overrides. Outside a project it fails loudly.
- **Above Backlog.md, not parallel** — task operations are **not** wrapped here. Create/list/edit/archive
  recipe tasks with Backlog.md directly inside the bundle (the no-mirror rule; see `conventions.md`).
- **Structure, not content** — the CLI registers/validates structure; you write all content. Content reaches
  disk via *template substitution* (a stub) or a *materialised authoring task* (you write it) — never invented
  by the CLI.
- **Derived artefacts stay current** — the `<project>-installer/SKILL.md` orchestrator and the scope aliases
  re-render on every mutation; there is no `regenerate` command. The author-owned executor front door
  `wip/_AGENTS.md` is the exception: written once at `init`, it is **never** re-rendered.

## The command tree (doc `10` §"The command tree")

```
wpm init <name> [--at <path>] [--template <name>] [--list-templates] [--param k=v …]
    scaffold an authoring workspace (workspace root + wip/ deliverable + empty builds/); default template
    minimal (the only one shipped); init creates a <name>/ subdir of cwd unless --at; materialises the project-wide authoring tasks

wpm template list [--scope project|bundle]            list templates (project-local shadow built-in)
wpm template show <name> [--scope …]                  metadata + file tree of one template

wpm skill install                                     copy the bundled installer-builder authoring skill into your
    agent's user skill scope (~/.claude/skills, ~/.agents/skills, …); idempotent; project-independent

wpm project show [--json]                             orient: name / version / targets / bundles
wpm project meta [--name|--description|--license|--repository|--author …]   edit manifest project fields
wpm project version [bump <major|minor|patch> | set <v>]                    show / move the release version
wpm project targets add|list|remove <agent>           the supported agents; add creates a scope-alias + re-renders
wpm project installer-skills add|list|remove <name> [--path <p>]           project-scoped install-time helper skills
wpm project validate                                  deps resolve, no cycles, targets non-empty, no orphan dirs
wpm project root                                      print the resolved deliverable root (<workspace>/wip) for $(...) composition

wpm bundle new <id> [--template <name>] [--disabled] [--version 0.1.0] [--no-advisor]
    create bundles/<id>/ AND enable it; auto-scaffolds an advisor; materialises the per-bundle task set
wpm bundle enable|disable <id>                        add/remove an existing bundle from the manifest
wpm bundle remove <id>                                full teardown (dir + advisor + archive tasks; confirms)
wpm bundle list                                       each bundle's id, version, state/migration task counts
wpm bundle template show|set <name>                   the project's default bundle template

wpm bundle <id> show                                  bundle.yml + tree
wpm bundle <id> meta [--version|--summary|--confirmation-level safe|dangerous]
wpm bundle <id> version [bump <major|minor|patch> | set <v>]               (bump materialises review tasks)
wpm bundle <id> requires add|list|remove <dep-id> [<constraint>]           inter-bundle dependency, npm-style
wpm bundle <id> files add|list|remove <path>          payload/files/ — authoritative reference files
wpm bundle <id> templates add|list|remove <path>      payload/templates/ — parameterized (lower-trust tier)
wpm bundle <id> scripts add|list|remove <path>        installer-scripts/ — install-time tooling, NOT delivered
wpm bundle <id> skills add|list|remove <name> [--path <p>]                  payload/agent-skills/ — runtime products
wpm bundle <id> installer-skills add|list|remove <name> [--path <p>]        bundle-scoped install-time helpers
wpm bundle <id> advisor add|remove                    the bundle's pull-UX advisor (one per bundle)

wpm build dry-run                                      project validate + lockfile check + preview the shippable tree (no artefact)
wpm build package [--format zip|tarball|git]          write builds/<project>-<version>.<ext>; archive root = the wip/
    deliverable un-nested (manifest.yml at the root), _AGENTS.md→AGENTS.md + per-target aliases synthesized; the
    wrapper never ships (authoring front door, .authoring-backlog/, builds/ all live above wip/; .git/node_modules/dist pruned)
wpm build publish <destination>                       build, then push to a registry/git remote (optional)
```

## What is deliberately NOT a command (doc `10` §"What this surface deliberately omits")

- No "elicit intent" / "ask the trust-gradient" command — that is your behaviour, not a CLI op.
- No command to write **content** (task bodies, SKILL.md bodies, payload files) — you write those; the CLI
  registers/validates.
- No command to write the **receipt** — that is the recipient agent's job at install time.
- No `wpm task …` / `wpm plan …` wrappers around Backlog.md — use Backlog.md directly (no-mirror).

For the `manifest.yml` / `bundle.yml` schemas and the template mechanics, see doc `10` §"schemas" and
§"Templates".
