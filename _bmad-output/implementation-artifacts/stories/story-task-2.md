# Story task-2 — Define the branching model and branch-naming convention

> Lean implementation spec (BMAD create-story output). This is a **documentation** task: capture the
> branching model this project *actually* uses, verified against `AGENTS.md` "Branch topology",
> `docs/SDLC.md`, the recorded task-1 slash→hyphen adaptation in `.bmad/sdlc-state.yaml`, and the live
> `git branch`/`git log`. No code changes.

## Acceptance criteria (the contract)
1. A contributor can find the documented branching model and knows which branch is releasable at all times.
2. Branch names follow one documented convention, illustrated by examples.
3. It is unambiguous what may never be committed directly to the main branch.
4. The convention does not contradict the executor's branch-per-bundle behaviour (doc 09).

## Sources verified (don't invent — capture reality)
- `AGENTS.md` → "Branch topology (sequential …)": `main → dev → feature/foundation →
  feature/foundation/task-<id>`; `fix/foundation/<issue>` only at the epic gate; sub-branches merge
  `--no-ff` then are deleted; one worker, single working tree, no worktrees.
- `docs/SDLC.md`: Phase 7 — push `feature/foundation`, PR `--base dev`, "[GATE] review PR + merge → dev
  (promotion to main is a separate human decision)"; Legend repeats the topology + `--no-ff` + delete.
- `.bmad/sdlc-state.yaml` DIVERGENCE note: git cannot hold both a branch `feature/foundation` and a branch
  `feature/foundation/task-N` (ref **file-vs-directory** clash), so task sub-branches are
  `feature/foundation-task-N` (slash→hyphen). Merge target + Phase-7 push branch unchanged.
- Live `git branch`: `main`, `dev`, `feature/foundation`, `feature/foundation-task-2` coexist — proves the
  hyphen adaptation (the slash form could not coexist with `feature/foundation`). `git log`: task-1 landed
  via a `--no-ff` merge commit (547350f) with its sub-branch deleted. Matches the model exactly.
- `docs/09-installation-process.md` (for AC#4): the executor (the **end-user's agent**, at **install
  time**, in the **generated** project) works **per bundle** as isolated units — "contain to the failing
  bundle", "leave sibling bundles intact", "never touch a sibling", per-bundle soft rollback. NB: doc 09
  frames this as per-bundle *work isolation*; it does not prescribe a literal git branch name. So AC#4 is
  satisfied by documenting that this is a **runtime/install** concept in a **different repo**, orthogonal
  to how we develop the builder — our dev branching neither governs nor contradicts it. (Capture it as
  doc 09 actually states it; do not assert a "branch per bundle" wording doc 09 doesn't use.)

## Deliverable
Create `CONTRIBUTING.md` with a top-level `## Branching model` section (doc 12 lists `CONTRIBUTING.md`;
`AGENTS.md` says branching/PR/versioning conventions live here). Structure with `##`/`###` headers so:
- **task-3** can append `## Pull requests, review & merge`,
- **task-4** can append `## Versioning & releases`,
later, without reflowing this section. Add a brief intro line + a forward-looking note that those sections
are owned by tasks 3/4 so the seams are explicit.

### Section outline (what to write)
- `## Branching model`
  - intro: where this lives, what it governs, that it's our *development* method (cite AGENTS.md/SDLC.md).
  - `### The branches` — a table: `main` (always-releasable, protected, no direct commits), `dev`
    (long-lived integration; not guaranteed releasable), `feature/<epic>` (per-epic off dev),
    `feature/<epic>-task-<id>` (per-story off the epic branch), `fix/<epic>/<issue>` (epic-gate fixes).
  - `### Which branch is releasable` — state plainly: **`main` is releasable at all times**; `dev` is the
    integration branch and is *not* guaranteed releasable. (AC#1.)
  - `### Naming convention` — one convention + concrete examples; the slash→hyphen rule for task branches
    **and the reason** (ref file-vs-directory clash with the `feature/foundation` ref). (AC#2.)
  - `### What may never be committed to \`main\`` — any direct commit; `main` changes only via reviewed,
    green-CI PR promoted by a deliberate human decision (SDLC Phase 7). (AC#3.)
  - `### Story-branch lifecycle` — off epic branch → `--no-ff` merge back → delete; one story in flight,
    single working tree, no worktrees (AGENTS.md per-story loop §9).
  - `### Relationship to the executor's per-bundle behaviour (doc 09)` — the AC#4 distinction: that's the
    end-user's agent, at install time, in the generated project, working per bundle (isolated units); a
    runtime concept in a separate repo, orthogonal to and not contradicted by our dev branching.

## Tests / DoD (documentation task)
- DoD#1: change **no code** → `tsc`/`biome`/`vitest` must stay green; run all three to confirm no
  regression. (The new `CONTRIBUTING.md` is outside the compiled/tested set.)
- DoD#2: no testable code logic here; do **not** add brittle string-match tests on the markdown just to
  tick a box — the existing suite staying green satisfies it (orchestrator records this).
- DoD#3: N/A for public functions; instead ensure the prose is clear, self-consistent, and citation-backed.

## Boundaries (do NOT do here)
- Do not write the PR/review/merge mechanics (task-3) or versioning/release process (task-4) — only leave
  the headers' seams. Do not edit `AGENTS.md`, `docs/`, `backlog/`, or `.bmad/`.
