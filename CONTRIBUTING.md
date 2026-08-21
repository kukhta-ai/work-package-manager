# Contributing to `wpm`

This guide covers the engineering conventions for developing the `wpm` builder itself — the branching
model, and (in later sections) pull-request review and versioning. It governs *how we build the tool*; it
is not about installing or using a generated bundle-project. The authoritative process is the BMAD-based
SDLC in [`AGENTS.md`](./AGENTS.md) and its sequence diagram in [`docs/SDLC.md`](./docs/SDLC.md); the
sections below are the concrete conventions those describe.

> **Public distribution is inactive.** This repository has no approved public package coordinate, release
> workflow, publication authority, or public release channel. Contributor work may prepare and verify local
> artifacts, but public activation remains a separate human-authorized decision.

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

## Pull requests, review & merge

A pull request is how completed epic work reaches the integration branch: at the handoff, the epic branch
is pushed and opened as a PR against `dev` (`docs/SDLC.md` Phase 7). This section defines what a PR must
satisfy, how merges are performed, and the gate that blocks them. It governs *our development of the
builder*; the `## Branching model` section above defines the branches these PRs flow through.

### What a pull request must satisfy before merge

A PR is mergeable only when all three hold (`AGENTS.md` Phase 7 + "User gates"; task-8):

- **Passing checks.** CI runs the three-command gate — `tsc --noEmit`, `biome ci`, and `vitest` — and a
  failure **blocks the merge** (task-8 AC#1). This is the *same* suite a contributor runs locally (see
  [The merge gate is the local check suite](#the-merge-gate-is-the-local-check-suite)), green across the
  supported Node/OS matrix.
- **Review.** At least one approving review is required, and you **never self-merge** — merging into `dev`
  (or `main`) is a human gate, performed by a reviewer other than the author (`AGENTS.md` → "User gates":
  "merging into `dev` or `main`"; "Never self-merge to `dev` or `main`").
- **A linked backlog task.** Every PR traces to a Backlog.md story by id — `Closes task-<id>` (or
  `Relates to task-<id>` when it only advances one). No PR lands without a task it implements; the backlog
  is the source of truth for *what* the change is for.

### Merge strategy and why

- **Story branch → epic branch: `--no-ff` (no fast-forward).** Each story is merged back into its epic
  branch as an explicit merge commit (`git merge --no-ff feature/<epic>-task-<id>`), then the story branch
  is deleted — exactly as the [Story-branch lifecycle](#story-branch-lifecycle) above describes. **Why
  `--no-ff` and not squash or rebase:** it keeps each story an explicit, revertable merge unit and
  preserves that story's real commit history, rather than flattening the epic into a single linear strand.
  If a story has to be backed out, its merge commit is the one thing to revert, and its development steps
  stay legible in the history.
- **Epic branch → `dev`: reviewed pull request.** The epic branch lands on `dev` via a PR opened with
  `gh pr create --base dev`, subject to the review and check rules above (`docs/SDLC.md` Phase 7).
- **`dev` → `main`: a separate, deliberate human decision.** Promotion to the release branch is never
  automatic and never bundled with the `dev` merge; it is a distinct human action (`docs/SDLC.md` Phase 7:
  "promotion to main is a separate human decision"). See [What may never be committed to
  `main`](#what-may-never-be-committed-to-main) for the rule that protects it.

### The merge gate is the local check suite

The gate that blocks a merge is **the same check suite you run locally** — there is no separate, stricter
CI-only bar to be surprised by (task-8 AC#2). The three commands are:

| Check | Locally | In CI (the merge gate) |
|---|---|---|
| Types | `npm run typecheck` (`tsc --noEmit`) | `tsc --noEmit` |
| Lint + format | `npm run lint` (`biome check .`) | `biome ci` |
| Tests | `npm test` (`vitest run`) | `vitest` |

(`biome check` and `biome ci` enforce the **same** rules — including the core import-boundary rule from
task-5; `ci` is just Biome's non-interactive, no-write CI mode. Run the local commands before opening a PR
and you have already run the gate.)

Crucially, the project **Definition of Done is a named, explicit part of what a PR must meet** — not an
unwritten expectation. This echoes the install contract's *Definition-of-Done-as-gate* principle from
[`docs/07`](./docs/07-install-contract.md) §"The enforcement — Definition of Done": there, the executor
cannot mark a task Done until the receipt facts hold, so recording becomes something it *must* do to make
progress; here the same enforcement shape is applied to **our development** DoD, so a change cannot merge
until the DoD holds. (The two DoDs are distinct — doc 07's is the *executor's* install-receipt DoD; ours is
the *builder-development* DoD below — but the "DoD gates the done/merge state" mechanism is the same.) Our
development DoD, which the PR template carries as a checklist the author ticks, is (`AGENTS.md` §"Definition
of Done"):

1. it type-checks (`tsc --noEmit`) and Biome is clean — **including the core import-boundary rule**;
2. tests are added and green (`vitest`) — unit for pure logic, integration where it touches ports;
3. public functions are documented, with no dead code; and
4. every acceptance criterion of the linked task is observably satisfied.

### Opening a pull request

Opening a PR auto-populates the body from
[`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md), which prompts you for: a
**summary** of the change; the **linked task** (`Closes task-<id>`); the **DoD checklist** to tick; **how
you verified it** (paste the three-command gate output); and **confirmation CI is green**. Fill it in fully
— a reviewer approves against exactly that information, and (per the rules above) no one merges their own
PR.

## Versioning & releases

This section governs the version of **the `wpm` builder itself** — the number in `package.json` (currently
`0.1.0`). It applies the Semantic Versioning model that [`docs/08`](./docs/08-versioning-and-migrations.md)
establishes for the artifacts the builder produces to the builder's eventual releases. It does not imply that
the current private package is publicly distributed. (Doc 08 itself is about *bundle* versioning; see [The
builder's version is not a bundle's version](#the-builders-version-is-not-a-bundles-version) for the
distinction.)

### Semantic versioning for the builder

The builder is versioned `MAJOR.MINOR.PATCH` with npm-style SemVer semantics. For *this tool*, the three
levels mean:

- **MAJOR** — a **breaking change** to the CLI surface or behaviour (a removed/renamed command, flag, or
  exit-code change) **or to the generated-artifact contract** (the shape of what `wpm init` / `bundle new`
  produce — manifest, `bundle.yml`, templates, the install-backlog contract) in a way that could break an
  existing user or an already-generated project.
- **MINOR** — a **backward-compatible** new command or capability: additive surface that doesn't change or
  remove existing behaviour.
- **PATCH** — a **backward-compatible bug fix** with no surface change: behaviour is corrected, nothing in
  the CLI or generated-artifact contract changes shape.

**For any change, decide:** *Could this break an existing user or a project the builder already generated?*
→ **MAJOR**. *Else, does it add new surface?* → **MINOR**. *Else (it only fixes a bug)* → **PATCH**.

Pre-1.0 caveat (honest): while the builder is `0.y.z`, the surface is still stabilizing — under SemVer a
`0.x` line makes no stability promise, so a breaking change may land in a **minor** (`0.y`) bump rather than
forcing `1.0.0`. The decision rule above still names each change's *intent*; the first stable surface is
`1.0.0`.

### The builder's version is not a bundle's version

There are two completely independent version lines, in two different artifacts, and they never move
together:

| | The builder | A bundle the builder produces |
|---|---|---|
| Where the version lives | `package.json` (one version for the whole `wpm` tool) | that bundle's `bundle.yml` `version` (one per bundle) |
| What it versions | the CLI + its generated-artifact contract | that single bundle's recipe/payload |
| Whose artifact | this repo (`wpm`) | a *generated* bundle-project (a different repo) |
| Cadence | bumped when the builder is released | bumped on the bundle's own cadence |
| Inter-dependency | n/a | bundles depend on each other by npm-style `requires` constraints, validated by `wpm project validate` (doc 08) |

A bundle carries a **stable `id` and a moving `version`** ([`docs/08`](./docs/08-versioning-and-migrations.md)
§"Identity vs version"; doc 00 vocabulary). **Bumping the builder never bumps a generated bundle, and bumping
a bundle never bumps the builder** — they are separate version lines in separate artifacts maintained by
different actors. Consequently, **this `CHANGELOG.md` tracks the builder's releases only**; a generated
project keeps its own per-bundle history in its bundles' `bundle.yml` files, not here.

### Release activation is deferred

No builder release can be cut from the current repository state. `package.json` is deliberately private, the
public identity and GitHub/npm channel policy are unresolved, and `.github/workflows/release.yml` does not
exist. The current CI workflow is a source-quality gate only; `wpm build publish` remains a separate command
for pushing a generated work-package archive and is not a mechanism for releasing WPM itself.

Routine version development and maintenance of the `[Unreleased]` changelog remain valid. Cutting a public
release — rolling those entries into a released version, tagging it, creating a GitHub Release, or publishing
to npm — becomes actionable only after a later human-authorized activation defines the public identity,
channel policy, trust/authority, and immutable release procedure. Until then, contributor work stops at
reviewed source changes and non-publishing local package evidence.

Maintainers can produce that local evidence with `npm run package:inspect -- --revision HEAD`. The command
requires a clean checkout, performs a clean production build, packs and inspects the real local archive, and
reports its exact boundary. It does not publish, tag, create a release, use credentials, or mutate remote state.
Save the JSON report outside the checkout, then run `npm run package:verify-install -- --report <report-file>`
to install those exact inspected bytes in a disposable consumer environment and exercise every declared bin
and required package path. The verifier performs no WPM setup and checks that representative Codex and Claude
Code personal/workspace configuration remains unchanged.

### Changelog

Release history lives in [`CHANGELOG.md`](./CHANGELOG.md), in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

- `## [Unreleased]` always sits on top and collects in-progress changes as they merge.
- Each released version appears below it as `## [X.Y.Z] - YYYY-MM-DD`, with changes grouped under the
  standard headings — **Added**, **Changed**, **Fixed**, **Removed** (and **Deprecated** / **Security** as
  needed).
- After later activation defines a release process, that process moves the `[Unreleased]` entries under the new
  version heading. The changelog records the **builder's** versions only (per the section above).

## Tracking work — the dogfood backlog

The builder **dogfoods Backlog.md**: all development work on `wpm` is tracked as tasks in the in-repo
[`backlog/`](./backlog/) root — the same Backlog.md the builder itself shells out to for the install-backlogs
it produces. Using the tool on its own development is deliberate (`docs/12` §"Dogfooding: the builder uses
Backlog.md too"): it surfaces real Backlog.md UX issues we'd otherwise miss, and it documents the project's
history as durable task records rather than only as commits. The foundational work — the tasks that turn the
design set into code — lives there as a dependency-ordered backlog.

### Operate the backlog only through the `backlog` CLI

**Never hand-edit anything under `backlog/`.** The task files, `config.yml`, the sequence, and the indexes are
CLI-managed state; editing them by hand corrupts the index and the task IDs. There is always a `backlog`
command for what you need — opening a file under `backlog/tasks/` in an editor is never correct. (This mirrors
the hard rule in [`AGENTS.md`](./AGENTS.md); a repo hook also blocks direct edits.) The everyday commands:

```bash
backlog task list --plain                  # the whole backlog (ALWAYS --plain for agents/scripts)
backlog task <id> --plain                  # one task: its acceptance criteria + Definition of Done
backlog sequence list                      # dependency-ordered plan — what's ready to work next
backlog task edit <id> -s "In Progress"    # move a task into progress when you start it
backlog task edit <id> --check-ac <n>      # tick acceptance criterion n (only once it truly holds)
backlog task edit <id> --check-dod <n>     # tick Definition-of-Done item n
backlog task edit <id> -s "Done"           # close it (only when AC + DoD are all satisfied)
```

For anything else, `backlog <cmd> --help`.

### Status lifecycle and the Definition-of-Done gate

Each task moves through a simple status lifecycle — **To Do → In Progress → Done** — and is gated by a
**shared, project-level Definition of Done**. The DoD is configured once in `backlog/config.yml`
(`definitionOfDone`), so **every** task carries the same three items:

1. **Typechecks clean (`tsc --noEmit`) and Biome clean (`biome ci`)** — including the core import-boundary
   rule.
2. **Tests added and green (`vitest`)** — unit for pure logic, integration where it touches ports.
3. **Public functions documented; no dead code; the core import-boundary rule is not violated.**

A task is **not** marked `Done` until both its **acceptance criteria** and these **Definition-of-Done** items
are observably satisfied and ticked (`--check-ac` / `--check-dod`). The DoD here is the same bar the
[merge gate](#the-merge-gate-is-the-local-check-suite) enforces — the three-command suite, run locally, by the
pre-commit hook, and in CI — so per-task completion and mergeability stay aligned.

### The front door for working on the builder

The agent front door for developing `wpm` is [`AGENTS.md`](./AGENTS.md) (and its `CLAUDE.md` symlink): it
defines the BMAD-based SDLC — reading the design set, the persistent specialists, the per-story loop, and the
user gates. This section is the quick reference that workflow relies on for the backlog mechanics; `AGENTS.md`
is the authoritative process and is human-owned (changing it is a user gate, not a routine edit).
