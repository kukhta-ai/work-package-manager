# The authoring workflow (compressed from doc `11`)

How you actually build a bundle-project over time. The spine is the **authoring-backlog**: the CLI materialises
the work, you complete it. For the behavioural protocol behind *why* you pick tasks and how to do them well,
read doc `04`; the full materialisation catalog is doc `11`.

## The authoring-backlog

Each project gets a hidden `.authoring-backlog/` at its root — its own Backlog.md root with
`task_prefix=authoring`, gitignored by default (per-author working state, not shipped). It is **separate** from
any bundle's install-backlog, so authoring ids (`authoring-1`, …) never collide with recipe ids.

It is materialised **incrementally** — tasks appear the moment a CLI command introduces new authoring scope,
never by a periodic re-scan. There is no `wpm plan`.

## Materialise → work loop (doc `11` §4)

```
CLI COMMAND THAT INTRODUCES SCOPE (init, bundle new, version bump, requires add/remove,
                                   project targets add, the skill-adding commands, bundle enable)
   → [MUTATE]      structural change to manifest.yml / bundle.yml / disk
   → [MATERIALISE] for each task in that command's catalog: create it unless a task with that title
                   already exists (idempotent by title)
   → AGENT WORK LOOP:
       cd .authoring-backlog && backlog task list --plain -s "To Do"   # see outstanding work
       pick a task by TITLE (natural order: plan → fill → payload → review → release; nothing enforces it)
       backlog task edit <id> -s "In Progress"
       do the work via the rest of the CLI + Backlog.md directly in the relevant bundle
       backlog task edit <id> -s Done                                  # YOU self-attest; the CLI never auto-closes
   → AUTHORING DONE when `backlog task list -s "To Do" --plain` is empty
```

ACs on authoring tasks are **free-text criteria you self-attest against** — not machine-checked. The one way
the backlog falls behind reality is sidestepping the CLI (hand-editing `manifest.yml`); don't.

## Who materialises what (doc `11` §3, summarized)

- **`wpm init`** — the project-wide set: set project metadata, confirm targets, verify manifest coherence,
  verify scope-alias symlinks, verify `AGENTS.md`/installer-skill current, verify helpers/advisors registered,
  bump project version, build dry-run. (Plus a per-bundle set for any bundle the template pre-includes.)
- **`wpm bundle new <id>`** — the per-bundle set (12 with the auto-advisor; 11 with `--no-advisor`): *Plan
  bundle*, *Fill install-backlog* (AC: a `kind:state` task with a `step:<slug>` label exists, DoD configured,
  the detect/setup/verify trio present), *Author payload*, *Scaffold payload skill*, *Write advisor content*,
  then the verify/review tasks (step-slug uniqueness, DoD compliance, payload references, skill registration,
  version constraints, install-backlog independence, simulate fresh-install executor).
- **`wpm bundle <id> version bump`** — review state-tasks at the new version, consider migration tasks, simulate
  the upgrade, and a constraint-review task for every bundle that requires `<id>`.
- **`requires add/remove`**, **`project targets add`**, the **skill-adding commands** — each materialises its own
  focused follow-up task(s).

## A worked session (doc `11` §"A worked authoring session", compressed)

```
wpm init hermes-handoff --template minimal            # materialises the project-wide authoring tasks (minimal ships no bundle)
cd hermes-handoff                                     # the workspace root: wpm walks up to wip/manifest.yml

wpm project meta --description "Handoff capabilities" --license MIT
wpm project targets add claude-code
wpm project targets add hermes

wpm bundle new core                                  # a base bundle the feature will depend on
wpm bundle new web-handoff                            # > Created. Advisor scaffolded. Materialised 12 tasks.
wpm bundle web-handoff meta --summary "Hand off a web page to the user's browser"
wpm bundle web-handoff requires add core "^0.1.0"     # core ships at the default 0.1.0; constraint must be satisfiable

# Fill the install-backlog by calling Backlog.md DIRECTLY inside the bundle (see conventions.md):
(cd wip/bundles/web-handoff && \
   backlog task create "ensure Chromium present" \
     -l "kind:state,step:ensure-chromium" -m 0.1.0 \
     --ac "chromium --version prints" --dod "ownership recorded")

# Author payload via the filesystem, THEN register it (the CLI doesn't write content):
#   cp launcher.json wip/bundles/web-handoff/payload/files/   then:
wpm bundle web-handoff files add launcher.json          # <path> is relative to payload/files/
wpm bundle web-handoff skills add handoff-web            # scaffolds a stub + a "write it" task if absent

# Work the review tasks, then:
wpm project show
wpm build dry-run
```

The three author decisions you must force out (trust gradient, confirmation level, what gets verified) and the
detect→setup→verify decomposition are the behavioural protocol in doc `04`. The CLI surface those dispatch
through is `command-reference.md`; the recipe-task tagging is `conventions.md`.
