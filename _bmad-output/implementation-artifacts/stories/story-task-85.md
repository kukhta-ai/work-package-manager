# Story task-85 — Specify the authoring-workspace architecture in the design set (authoring side)

> Lean implementation spec (BMAD create-story output). **Docs-only design refinement** of the human-owned
> design set. Introduces the *authoring workspace* that wraps the deliverable, separating the authoring
> surface from the shipped artifact. Edits docs **01, 04, 06, 11, 12** only. No code; no `backlog/` edits.
> This is the contract that implementation tasks **86–90** conform to.
>
> Note on BMAD scaffolding: task-85 belongs to the authoring-workspace epic, tracked in Backlog.md, **not**
> in the foundation `sprint-status.yaml` (which mirrors epic-1, tasks 1–33). This story file follows the
> existing `story-task-N.md` convention but the foundation sprint-status is deliberately **not** mutated
> (it would corrupt the read-only epic-1 mirror).

## The architecture to specify (decided; do not re-decide)
The design currently describes the deliverable (the bundle-project skeleton of `06`) as authored **in place
at the project root**, where the shipped executor front door (`AGENTS.md`, `06`/`07`) collides with the
authoring agent's own front door / stance. The fix is an **authoring workspace** that wraps the deliverable,
with three regions and one consistent vocabulary (use these exact names):

- **authoring workspace root** (a.k.a. "workspace root") — the authoring surface: the *authoring* front door
  + the **authoring backlog** (`.authoring-backlog/`, `task_prefix=authoring`, gitignored, builder-time only).
- **deliverable subdirectory = `wip/`** — the bundle-project skeleton of `06` (manifest.yml, bundles/,
  installer-skills/, the executor front door, scope-alias symlinks) lives **under `wip/`** during authoring.
- **build-output directory = `builds/`** — build artifacts isolated here.

**Key invariant:** the built archive is the `wip/` deliverable **un-nested to the archive root, content
unchanged.** The workspace wrapper (authoring front door, `.authoring-backlog/`, `builds/`) is **never** part
of any shipped artifact. The shipped-artifact contract (`06`/`07`) is therefore **unchanged** — only its
*location during authoring* moves under `wip/`.

## Acceptance criteria (the contract — from `backlog task 85 --plain`)
1. One consistent vocabulary for the three regions (workspace root; deliverable subdir `wip/`; build-output
   `builds/`) is defined and used across the changed docs.
2. `06` states the skeleton lives under `wip/` during authoring, and the built archive is that same skeleton
   un-nested to the archive root with content unchanged.
3. `01` describes the workspace: authoring front door + authoring backlog at the root, deliverable under
   `wip/`, builds isolated in `builds/`.
4. `04` states the authoring agent operates from the workspace root and treats `wip/` as the artifact it is
   building, not as instructions addressed to it.
5. `11` places the authoring backlog at the workspace root, gitignored + builder-time only.
6. `12` shows the directory scaffold of a generated authoring workspace, distinct from the shipped-artifact
   scaffold.
7. The docs state the authoring front door and authoring backlog are never part of any shipped artifact.
8. No updated doc still describes the deliverable as authored at the project root; cross-references among the
   changed docs stay consistent.

## Implementation plan (per doc)
- **`00` (read-only anchor):** the new vocabulary must *extend* `00`'s model/vocabulary, not contradict it.
  "Project" stays the shipped repo; the workspace is the authoring-time wrapper around it. Do **not** edit `00`.
- **`06` §1 (skeleton) + §Lifecycle/Hard rules:** the canonical home of the three-region vocabulary and the
  un-nesting invariant (AC#1, #2). Frame the existing tree as "the `wip/` deliverable during authoring; the
  build un-nests it to the archive root." State the wrapper is never shipped (AC#7). Shipped contract unchanged.
- **`01`:** in "What good authoring produces" / the dogfooding close, describe the workspace: authoring front
  door + authoring backlog at root, deliverable under `wip/`, builds in `builds/` (AC#3).
- **`04`:** add to the opening stance / "what it must not do": the agent operates from the workspace root and
  treats `wip/` as the artifact under construction, **not** as instructions addressed to it (AC#4). This is the
  core reason the workspace exists — it resolves the front-door collision.
- **`11` §1 ("Where the authoring work lives"):** reframe the tree so `.authoring-backlog/` sits at the
  **workspace root** alongside the authoring front door, with `wip/` holding the deliverable and `builds/` the
  output; keep "gitignored + builder-time only" (AC#5, #7). Update the worked-session paths if needed (AC#8).
- **`12` §"The directory scaffold":** add a scaffold of a **generated authoring workspace** (root = authoring
  front door + `.authoring-backlog/` + `wip/<deliverable>` + `builds/`), explicitly distinct from `12`'s own
  *builder-project* scaffold and from `06`'s shipped-artifact scaffold (AC#6). Note `wpm init` scaffolds the
  workspace (behavior detail deferred to task-86/87).

## Boundaries (do NOT do here)
- Edit ONLY `01/04/06/11/12` (+ a cross-ref fix elsewhere only if one breaks). No code, no `backlog/` edits,
  no commits, no AC/DoD ticks (orchestrator owns those).
- Do **not** specify the `_AGENTS.md` reserved-prefix mechanism for the executor front door — that is the
  **sibling task 86** (CLI/build). Here, `06`'s description of where the executor front door lives need only be
  consistent with "author-owned content under `wip/`".
- Do **not** alter the fixed core: `00` goals/model/vocabulary and `13` principles (pure core,
  ports-and-adapters, SDLC-agnostic). This **adds** the workspace layer.
- Match each doc's existing prose voice/heading style; prefer cross-referencing canonical sections over
  duplicating content (`what`-not-`how` per `task-writing-conventions.md`).

## Gate / DoD (doc task)
- No code change. Prose consistent with each doc's voice. Cross-references among 01/04/06/11/12 stay coherent
  (AC#8). No doc still says the deliverable is authored at the project root.
