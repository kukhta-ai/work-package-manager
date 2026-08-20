# Story task-86 — Specify the workspace CLI and build behavior in the design set

> Lean implementation spec (BMAD create-story output). **Docs-only design refinement** of the human-owned
> design set, USER-AUTHORIZED as part of the authoring-workspace epic. **Companion to the already-merged
> task-85**, which introduced the authoring *workspace* (workspace root + authoring front door +
> `.authoring-backlog/`; deliverable subdirectory `wip/`; build-output `builds/`; built archive = `wip/`
> un-nested to the archive root, content unchanged; wrapper never ships). Task-86 evolves the **CLI and
> build** docs to match. Edits docs **10, 12, 07, 09, and the authoring-backlog catalog in 11** only. No
> code; no `backlog/` AC ticks; no commits.
>
> Note on BMAD scaffolding: task-86 belongs to the authoring-workspace epic tracked in Backlog.md, **not**
> in the foundation `sprint-status.yaml` (which mirrors epic-1, tasks 1–33). create-story auto-discovery
> targets that epic-1 mirror, which does not contain task-86, so this story was driven from the committed
> docs (the stated Rule-3 fallback) and written here following the `story-task-85.md` convention. The
> foundation sprint-status is deliberately **not** mutated.

## The decided contract (do NOT re-decide — from task-86 Implementation Notes)
**Reserved-prefix executor front door.** Agent instruction-file discovery is by **exact basename**, no
globs; every target agent (Claude Code, Codex, Gemini, Cursor) does on-demand subdirectory loading, so
nesting alone does **not** shield a file. DECISION: the deliverable's executor front door is authored under
a reserved **leading-underscore** name — root `wip/_AGENTS.md`, per-bundle `wip/bundles/<id>/_AGENTS.md` —
kept `.md` so it stays **author-editable**, and never auto-discovered by any agent (no agent recognizes the
`_`-prefixed basename). The **build strips the leading underscore** to produce the canonical `AGENTS.md` at
the archive root (and `bundles/<id>/AGENTS.md`), and creates the `CLAUDE.md`/`GEMINI.md` aliases per
`manifest.targets` as build-created symlinks. Only `_AGENTS.md` needs the prefix; the aliases are
build-created. Source names to **avoid** for authored content: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`,
`AGENTS.override.md`, `CONTEXT.md`. Do **not** use `.tmpl` (the repo's placeholder-template convention;
these are author-owned content). The per-project installer skill and the advisors stay **ordinary authored
deliverable content** under `wip/` — *not* prefixed and *not* transformed by the build (they are SKILL.md
files, only active when a scope is scanned, so they need no shielding). Caveat: a user could non-default
agent config make an agent also read `_AGENTS.md`; we design against defaults and document it.

**Consequence — the executor front door is author-owned, not auto-regenerated.** Because it is authored
(and editable) as `_AGENTS.md`, it leaves the CLI's auto-rendered "derived artefacts" set. The author
maintains it; an authoring-backlog task (AC#8) catches drift against current bundles + targets. The
install-time bundle menu is built from `manifest` + each bundle's `summary` at install time (06/07), so the
front door does not hardcode the bundle list and does not need per-command re-rendering.

## Acceptance criteria (the contract — from `backlog task 86 --plain`)
1. **doc 10** — `init` creates an authoring *workspace* (authoring front door + authoring backlog at the
   root, the deliverable subdirectory `wip/`, the build-output directory `builds/`), not the deliverable at
   the project root.
2. **doc 10** — project-bound commands resolve the workspace and operate on the deliverable subdirectory
   `wip/`; a command run anywhere within the workspace resolves the same deliverable root.
3. **doc 10** — a project-bound command run outside any workspace fails, naming the workspace marker and
   pointing at `init` or the `-C` override.
4. **doc 10** — `build` writes the packaged artifact into `builds/`, named by the project release name and
   version, with the artifact root being the un-nested deliverable.
5. **doc 12** — the authoring backlog, the authoring front door, and `builds/` are excluded from every build
   artifact.
6. **docs 07 AND 09** — the install contract and installation process apply to the un-nested built archive
   whose root is the deliverable; the workspace wrapper is not part of the shipped artifact.
7. **doc 12** — the deliverable executor front door is author-owned content under a reserved, build-stripped
   prefix (`_AGENTS.md`) — editable but not auto-discovered during authoring; the build restores it to its
   canonical name (`AGENTS.md` + `CLAUDE.md`/`GEMINI.md` aliases per targets) in the archive; the per-project
   installer skill and advisors remain authored deliverable content.
8. **doc 11** authoring-backlog catalog — keep a task that verifies the **author-owned** executor front door
   reflects the current manifest bundles + targets (it is author-owned, NOT auto-regenerated). Reconcile the
   existing "Verify AGENTS.md and main installer skill are current" task (which assumed auto-rerender).

## Workspace marker (the seam — decided here, stated once in doc 10)
The **authoring workspace root** is the nearest ancestor directory of cwd that holds the **deliverable
subdirectory `wip/` with its `manifest.yml`** (equivalently: the authoring front door beside `wip/`). The
resolvable, committed signal is `wip/manifest.yml` — chosen because `.authoring-backlog/` is gitignored
(absent after a fresh clone) and a bare `AGENTS.md` basename is too generic to identify a workspace alone.
Resolution walks up from cwd; the **deliverable root** every project-bound command operates on is
`<workspace>/wip`. This correctly resolves the *same* deliverable root whether cwd is the workspace root,
`wip/`, or `wip/bundles/<id>/…` (AC#2). `-C, --project <path>` targets a workspace anywhere. The error names
this marker and points at `init`/`-C` (AC#3).

## Implementation plan (per doc)
- **`10` (authoring CLI) — the main edit surface (AC#1–#4):**
  - *Design principles* — "Project context is explicit": resolve the *workspace*, operate on `wip/`; fail
    naming the workspace marker. "Derived artefacts stay current automatically": clarify that the
    auto-rendered derived artefact is the **main installer skill**; the **executor front door is author-owned**
    (`_AGENTS.md`, not auto-rendered). "Structure, not content": `init` creates the *authoring* front door;
    the executor front door is author-owned content.
  - *Command tree* — `init` "scaffolds an authoring workspace"; `build` writes to `builds/`.
  - *Per-command actions* — rewrite the `init` row to scaffold the workspace (authoring front door + aliases
    at root; `.authoring-backlog/`; `wip/` deliverable incl. `_AGENTS.md` author-owned front-door stub +
    scope aliases under `wip/`; `builds/`; gitignore `.authoring-backlog/` + `builds/`). Rewrite
    `build package`/`dry-run` to output into `builds/`, name `<project>-<version>.<ext>`, archive root =
    `wip/` un-nested. Decouple the executor front door from `targets add`'s re-render (author-owned).
  - *Project context resolution* section — state the workspace marker, the `wip/` deliverable root, the
    "anywhere within the workspace → same root" property, and the new error message. Keep `project root`
    printing the **deliverable root** (`wip/`) so `$(wpm project root)/bundles/...` still composes.
  - *Worked sessions / Implementation note* — update raw `cd bundles/…`/`mkdir -p bundles/…`/`cp … bundles/…`
    to `wip/bundles/…` (consistent with task-85's doc-11 session); CLI command *arguments* stay
    deliverable-relative (the CLI resolves `wip/`). Note the executor front door is author-owned in the
    derived-artefact regeneration line.
- **`12` (builder architecture) — AC#5, AC#7:** in/after "The generated authoring workspace" section: name
  the front door in the `wip/` tree as `_AGENTS.md`; add a focused subsection "What `wpm build` produces"
  stating (a) un-nesting `wip/` → archive root, content unchanged; (b) **exclusions**: `.authoring-backlog/`,
  the authoring front door (+ its aliases), and `builds/` are excluded from every artifact (AC#5); (c) the
  **front-door prefix-strip**: `wip/_AGENTS.md` → `AGENTS.md`, `wip/bundles/<id>/_AGENTS.md` →
  `bundles/<id>/AGENTS.md`, plus `CLAUDE.md`/`GEMINI.md` aliases per `manifest.targets`; the reserved
  underscore keeps it author-editable yet undiscovered (exact-basename discovery); reserved source names to
  avoid; the non-default-config caveat; installer skill + advisors ship as-is, unshielded (AC#7).
- **`07` (install contract) — AC#6:** add a short note (template-layout intro) that the contract applies to
  the **un-nested built archive whose root is the deliverable**; during authoring the tree lives under the
  workspace's `wip/`; the workspace wrapper (authoring front door, `.authoring-backlog/`, `builds/`) is not
  part of the shipped artifact; the front door arrives at the archive root under its canonical name (build
  strips the `_AGENTS.md` prefix). Cross-ref 06/11/12.
- **`09` (installation process) — AC#6:** add a note to §2 that the carried files live under the workspace's
  `wip/` during authoring and ship as the un-nested archive (root = deliverable); the wrapper is not shipped;
  the executor front door arrives at the archive root via the build's prefix-strip (cross-ref 10/12).
- **`11` (authoring catalog) — AC#8:** reconcile the `wpm init` task "Verify AGENTS.md and main installer
  skill are current" → verify the **author-owned executor front door** (`_AGENTS.md`) reflects the current
  `manifest` bundles + targets (it is author-maintained, NOT auto-regenerated); the main installer skill (if
  still auto-rendered) is the residual sidestepping check. Adjust "Verify scope-alias symlinks" only if its
  `wip/` framing needs a touch (task-85 already moved it to `wip/`).

## Boundaries (do NOT do here)
- Edit ONLY `07/09/10/11/12` (+ a cross-ref fix elsewhere only if one genuinely breaks; note it). No code,
  no `backlog/` AC/DoD ticks, no commits, no branch changes.
- Do **not** redefine task-85's vocabulary (`wip/`, `builds/`, workspace root, authoring front door, un-nested
  archive). Reuse it verbatim.
- Do **not** alter the **fixed core** — `00` model/vocabulary/goals and `13` principles (pure core,
  ports-and-adapters, SDLC-agnostic). The shipped-artifact contract (06/07) is **unchanged in substance**:
  this only clarifies it applies to the un-nested archive and adds the build's prefix-strip + workspace
  resolution.
- Do **not** broadly re-architect the main installer skill's derived-vs-authored status (out of scope) —
  task-86 only moves the **executor front door** to author-owned and notes the installer skill/advisors ship
  unchanged.
- `what`-not-`how` voice (`docs/task-writing-conventions.md`): describe observable seams — the marker, exit
  behaviour, archive naming/location, the `_AGENTS.md`→`AGENTS.md` transform — not procedure. Match each
  doc's heading/prose style; prefer cross-references over duplication.

## Gate / DoD (doc task)
- No code change. Prose consistent with each doc's voice. Cross-references among 07/09/10/11/12 (and outward
  to 06/08) stay coherent. Every one of the 8 ACs observably satisfied in the named doc/section. No doc still
  says the deliverable is authored/built at the project root, nor that the executor front door is
  auto-rendered.
