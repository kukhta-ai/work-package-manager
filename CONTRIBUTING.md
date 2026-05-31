# Contributing to `wpm`

This guide covers the engineering conventions for developing the `wpm` builder itself — the branching
model, and (in later sections) pull-request review and versioning. It governs *how we build the tool*; it
is not about installing or using a generated bundle-project. The authoritative process is the BMAD-based
SDLC in [`AGENTS.md`](./AGENTS.md) and its sequence diagram in [`docs/SDLC.md`](./docs/SDLC.md); the
sections below are the concrete conventions those describe.

> **Section ownership.** This file is assembled across a few foundational tasks. The `## Branching model`
> section below is owned by task-2. `## Pull requests, review & merge` (task-3) and
> `## Versioning & releases` (task-4) are appended later and are intentionally absent for now.

## Branching model

Development is **sequential**: one story is in flight at a time, in a single working tree (no git
worktrees). Work flows inward from short-lived story branches to the integration branch and, by a
deliberate human decision, to the release branch. The topology is
`main → dev → feature/<epic> → feature/<epic>-task-<id>`, with a `fix/<epic>/<issue>` branch opened only at
the epic gate on failure (`AGENTS.md` → "Branch topology"; `docs/SDLC.md` Legend).

### The branches

| Branch | Role | Releasable? | Direct commits? |
|---|---|---|---|
| `main` | The release branch — always in a releasable state. Protected. | **Yes, at all times.** | **Never** — see [What may never be committed to `main`](#what-may-never-be-committed-to-main). |
| `dev` | Long-lived integration branch. Completed epic work lands here via a reviewed, green-CI PR. | No — not guaranteed releasable; `main` is. | No — lands only via PR from an epic branch. |
| `feature/<epic>` | Per-epic branch off `dev` (e.g. `feature/foundation` for the foundation backlog). Collects that epic's stories. | No | Only the epic's own merges (see below). |
| `feature/<epic>-task-<id>` | Per-story branch off the epic branch (e.g. `feature/foundation-task-12`). One per backlog task. | No | Yes — this is where a story's work is committed. |
| `fix/<epic>/<issue>` | Opened **only** at the epic gate when the cold-start E2E run fails (`docs/SDLC.md` Phase 6). Same merge-and-delete rule as a story branch. | No | Yes — the fix is committed here, then merged back. |

### Which branch is releasable

**`main` is releasable at all times.** That is its single defining property: any commit on `main` has
passed review and green CI and represents a state we are willing to ship. `dev` is the integration branch
where epic work accumulates; it is *not* guaranteed releasable, because in-progress integration may sit
there ahead of a release. When you need "the last known-good state," that is `main` — never `dev`
(`AGENTS.md` → "Branch topology"; `docs/SDLC.md` Phase 7).

### Naming convention

There is **one** naming convention, by branch kind:

| Kind | Pattern | Examples |
|---|---|---|
| Release | `main` | `main` |
| Integration | `dev` | `dev` |
| Epic | `feature/<epic>` | `feature/foundation` |
| Story | `feature/<epic>-task-<id>` | `feature/foundation-task-12`, `feature/foundation-task-2` |
| Epic-gate fix | `fix/<epic>/<issue>` | `fix/foundation/cold-start-e2e` |

**Why the story branch uses a hyphen (`-task-<id>`), not a slash.** The natural form would be
`feature/<epic>/task-<id>` (e.g. `feature/foundation/task-12`). Git cannot represent that **at the same
time** as the epic branch `feature/foundation`: git stores a branch ref as a file at
`.git/refs/heads/feature/foundation`, but `feature/foundation/task-12` would require `feature/foundation`
to be a *directory* — a file-vs-directory clash on the same path. Because the epic branch and its story
branches must coexist, story branches join the segment with a hyphen:
`feature/foundation-task-12`. The merge target and the Phase-7 push branch are unchanged by this — only the
story-branch *spelling* differs. (Recorded as a mechanics divergence in `.bmad/sdlc-state.yaml`; the
epic-gate `fix/<epic>/<issue>` branch keeps the slash form because no `fix/<epic>` ref exists to clash
with.)

### What may never be committed to `main`

**Nothing is ever committed directly to `main`.** There are no exceptions — no hotfix, no docs-only tweak,
no "trivial" change goes straight onto `main`. Every change reaches `main` the same way:

1. it is developed on a story branch, integrated into its epic branch, and merged into `dev` via a
   reviewed pull request that shows **green CI**; then
2. promotion from `dev` to `main` is a **separate, deliberate human decision** (`docs/SDLC.md` Phase 7:
   "merge → dev (promotion to main is a separate human decision)").

Equivalently: a direct push/commit to `main`, a self-merge, or any change that has not been through a
reviewed green-CI PR is prohibited. `main` is protected to enforce this mechanically.

### Story-branch lifecycle

Per the per-story loop (`AGENTS.md` → "The per-story loop", step "Integrate"; `docs/SDLC.md` Phase 5):

1. Branch the story off the epic branch:
   `git checkout feature/<epic> && git checkout -b feature/<epic>-task-<id>`.
2. Do the work and commit it on the story branch (commit messages reference `task-<id>`).
3. When the task is Done, merge it back **with `--no-ff`** so the merge is an explicit, revertable unit:
   `git checkout feature/<epic> && git merge --no-ff feature/<epic>-task-<id>`.
4. **Delete** the story branch: `git branch -d feature/<epic>-task-<id>`.

Only one story branch is active at a time, in a single working tree — no parallel worktrees. The same
`--no-ff` merge-and-delete rule applies to an epic-gate `fix/<epic>/<issue>` branch.

### Relationship to the executor's per-bundle behaviour (doc 09)

This branching model is about **our development of the builder**. It must not be confused with the
**executor's** behaviour at install time. When an end user points their agent at a *generated*
bundle-project, that agent works **one bundle at a time as an isolated unit**: it contains a failure to the
failing bundle, leaves sibling bundles intact, never reaches into another bundle's state, and rolls a
bundle back on its own ([`docs/09-installation-process.md`](./docs/09-installation-process.md) §§3, 5). That
per-bundle isolation is a **runtime / install-time** concept, living in a **different repository** (the
project the builder generates) and operated by a different actor (the end user's agent).

The two never interact: our `feature/<epic>-task-<id>` story branches organize how *we* land changes in the
`wpm` repo; the executor's per-bundle handling organizes how an *install* proceeds in a generated project.
Our convention therefore neither governs nor contradicts the executor's per-bundle behaviour — they operate
on different repos, at different times, under different agents. (Doc 09 frames the executor's unit of work
as the *bundle*; it does not prescribe a git branch name for it, so there is no naming conflict to
reconcile here.)
