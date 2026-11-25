# 08 · Versioning & Migrations

Where `07` defines the contract for getting a bundle installed correctly and recording it, this defines how a bundle changes safely **over time** — versioning and migrations. It's the same machinery seen along the time axis: the receipt becomes an applied-migration ledger, the recipe gains a second kind of task, and one storage rule keeps updates from corrupting state. Read it as the time-extension of the install contract.

The whole thing rests on one reframing carried over from the package-manager study: **an update is Repair against a bumped target version.** Repair already means "re-run detection, find drift from the desired state, reconcile." An update simply *raises* the desired state. So there is no separate update engine — there is the install loop, pointed at a persistent receipt by a higher-versioned recipe.

## The one storage rule everything depends on

Never store install state inside the distributable artifact. dpkg ships files but keeps state in `/var/lib/dpkg`; Flyway keeps a `schema_history` table beside the database it migrates. So there are two backlogs. The **recipe** (`bundles/<b>/install-backlog/`, shipped in the repo) is versioned, read-only, and replaced wholesale on update; it carries no state. The **receipt** is a persistent Backlog.md backlog the install stamps out in a user-side state location (the `/var/lib/dpkg` analog) that repo replacement never touches — this is where the agent actually executes, and it is the durable record. The recipe is replaceable *because* it holds no state; the receipt persists *because* it lives outside the recipe.

The receipt has two physical zones, both native to Backlog.md (`init` creates `tasks/`, `archive/`, `completed/`, `drafts/`). **`tasks/` is the live current-version set** — the continuing `kind:state` tasks (reconciled in place each version) plus any pending migrations. **`archive/` is the durable history in full fidelity** — applied `kind:migration` tasks moved there once done (`backlog task archive <id>` relocates the whole file, intact and still readable, out of the active board), and retired steps moved there as tombstones. Crucially, a task is preserved *whole*, not compacted: its per-step inverse op stays as the task's own content, so the knowledge of how to undo what an old version installed is never thrown away. The archived `kind:migration` tasks **are** the applied-migration ledger — full records, not a summary.

Two tested constraints shape this. Backlog.md **recycles task IDs after archive** (archive `task-3`, create another, and it becomes `task-3` again, coexisting with the archived one), so preserved tasks are addressed by a stable `step:` slug and a version label, **never by raw `task-N`**. And `archive/` is a **single bucket, not per-version folders**, so versions are distinguished by a label on each archived task, not by directory. (`cleanup` also moves Done tasks to `completed/`, but it's an interactive age-picker, so the agent uses the scriptable `task archive <id>` per task.)

Detection still owns the present: the archived tasks record what we *did* and how to reverse it, not a claim about current reality, which the agent re-derives by inspection. The records are memory; the environment is truth.

## Two kinds of task

A bundle's recipe holds two task kinds, the distinction borrowed directly from Flyway's versioned-vs-repeatable split:

- **State tasks** (`kind:state`) — the idempotent "ensure the desired state" steps: detect, setup, verify. They are safe to re-run, which is exactly what Repair does, and they **may be edited across versions** because re-running them reconciles to the new desired state (Flyway's repeatable migrations, which re-apply when their content changes).
- **Migration tasks** (`kind:migration`) — steps that only make sense when moving *from* a particular prior version: move a renamed config, transform stored data, retire a dropped dependency. They run **once**, in version order, gated on the recorded from-version, and are **immutable once shipped** (Flyway's versioned migrations, applied exactly once and never edited).

The practical effect: changing how a bundle reaches its current state is a state-task edit; changing what must happen *because* a user is coming from an older state is a new migration task.

## Task tagging system

Three tags, all written by the authoring agent on the recipe, carry forward into the receipt at first stamping. They are the entire structural vocabulary; everything else the executor needs to record (inverse op, ownership, chosen values) is journaled into the task's notes per `07`, not into more tags.

| Tag | Form | Job | Trad lineage |
|---|---|---|---|
| Identity | `step:<slug>` (label, immutable) | stable correlation key — survives version changes and ID recycling after archive | **MSI `ComponentId`** (stable per-component GUID; same purpose, same failure mode if violated) |
| Kind | `kind:state` or `kind:migration` (label, immutable) | which discipline applies — reconcile-and-edit or apply-once-and-freeze | **Flyway repeatable (R__) vs versioned (V__) migrations** |
| Version | `-m <version>` (Backlog.md **milestone**, queryable) | the version whose recipe currently defines this task; the one native version query | **dpkg `Version:` / RPM rpmdb / Homebrew Cellar / MSI `ProductVersion`** |

The milestone is the version axis on purpose: it's the only label-like attribute Backlog.md will let the agent *query* (`task list -m <v>` returns every task whose current content was shipped in that version, natively, without scanning). Everything else label-based is scan-and-read.

A task has at most one milestone, so it has to be the *current* version, not the version that first introduced the task. For migrations these are the same — migrations are immutable, so current never moves. For state tasks they diverge as the recipe edits a task across versions; the executor advances the receipt task's milestone when reconciling new content. First-introduction provenance is **not** tracked as a tag — it's audit-only, isn't load-bearing for install/update/repair/uninstall, and is recoverable from the recipe's git history. Retirement is similarly **not** a tag — a `kind:state` task sitting in `archive/` is, by definition, a tombstone; the kind plus location is the marker.

## How these tags ride on Backlog.md

Two practical constraints from the tool that the convention has to honour:

- **IDs are prefixed per bundle but recycled per archive.** Backlog.md has a `task_prefix` config key (default `task`); each bundle's recipe sets it to the bundle id so tasks become self-describing — `web-handoff-1`, `web-handoff-2` — which reads better in receipts and logs. The prefix is a single global value per backlog root (it cannot distinguish task kinds — that's `kind:`) and must be set *before* any tasks are created; the bundle template's `config.yml` carries it. Crucially, archive frees an ID for reuse, which is why preserved tasks are correlated by `step:<slug>` (immutable) and never by raw task-N.
- **Backlog.md flag mechanics the agent must respect.** Labels do *not* accumulate across repeated `-l` flags — only the last is kept — so multiple labels go in one comma-separated flag: `-l "kind:state,step:ensure-chromium"`. Acceptance criteria (`--ac`) and Definition-of-Done items (`--dod`), by contrast, *do* accumulate across repeated flags. Dependencies (`--dep`) are by task **id** (`web-handoff-1`), not by step slug; the agent looks the id up with `backlog task list --plain` before referencing it. The list display upper-cases ids (`WEB-HANDOFF-1`) but they're referenced lower-case on the command line.
- **The from-version gate for migrations is not a tag.** Version-range expressions like `<2.0` can't sit cleanly in a label string, and detection is the agent's reasoning anyway. So the gate lives in the migration task's detect/AC body as a comparison the agent makes against the recorded version. The `kind:migration` tag + the milestone tell the agent *which* version a migration is for; the body tells it *when* it applies.
- **Ordering** uses Backlog.md dependencies (`--dep`); for migrations, the agent additionally sorts pending ones oldest-first by milestone.
- **Immutability** is *our* discipline, not a tool guarantee — Backlog.md won't checksum-lock a shipped migration the way Flyway does. The rule (never edit a shipped migration; add a new one) is enforced by the authoring agent and the DoD, not the tool.

## Identity vs version

A bundle carries a stable `id` and a current `version` in `bundle.yml`. The `id` never changes across releases; the `version` moves. This is MSI's `UpgradeCode`-vs-`ProductCode` lesson: the stable identity is what lets an update recognise "this is the same bundle, newer" rather than installing a second copy beside the old one. The version string is semver, and unlike earlier iterations of this design where it was a human-only signal, it is now **also interpreted by the dependency resolver**: each bundle's `bundle.yml.requires` is a map of dep-bundle-id to npm-style version constraint (`^0.3.0`, `~1.2.0`, `>=2.0.0 <3.0.0`), and `wpm project validate` checks every constraint against the dependee's declared `version`. A breaking change in a depended-upon bundle therefore surfaces at validate time as a constraint failure, not implicitly at install time as a runtime mismatch — the author is forced to either bump the requiring bundles' constraints (and likely their state tasks / migrations) or roll back the breaking change.

## The dependency contract

Each bundle owns its `requires` map in its own `bundle.yml`, npm-style:

```yaml
# bundles/web-handoff/bundle.yml
id: web-handoff
version: 0.2.0
requires:
  core: "^0.3.0"
```

The constraint follows npm syntax: `^X.Y.Z` allows compatible minor updates (the most common case), `~X.Y.Z` allows compatible patch updates, explicit `>=X <Y` ranges work, exact `=X.Y.Z` works. One version of each bundle exists per project at a time (the version declared in its own `bundle.yml`), so resolution is constraint-validation, not constraint-resolution-across-multiple-candidates — there's no SAT solver, just a closure check. When `bundle <id> version bump` advances a bundle's version, the bump command itself materialises an authoring task for **every requiring bundle** (per `11`'s catalog): "review whether your constraint on `<id>` still holds at `<new-version>`," because a bump might require either widening a `^0.2.0` to `^0.3.0` or authoring a migration in the requirer to match the new contract.

This is the precedent borrowed from npm and Cargo workspaces: per-package metadata, version-constrained internal dependencies, and a workspace-level coordination point (here, `wpm project validate`) that catches incompatibility before install time.

## Pinning and integrity for vendored third-party content

The `requires` map governs *internal* dependencies between a project's own bundles. A second, separate axis governs the **third-party artifacts an author vendors in** — the discipline skills (superpowers and the like) and loop runners (a Ralph plugin) from `06`/`09`. These are different in kind: they're someone else's content, copied into the project, that the executing agent will *run*. Because the thing this format distributes is *instructions an agent executes*, tamper-evidence on that content is structural rather than optional — the relevant prior art here is software supply-chain security (SLSA, lockfiles), not package version ranges.

The mechanism is a **lockfile**, the same first-line-of-defence pattern npm/Cargo/pnpm use: pin every vendored artifact to an exact version *and* a content hash, commit it, and verify on build. A project carries an `wpm.lock` recording, for each vendored skill or runner, its source (where it came from — a marketplace plugin id, a git URL + ref, a release), its resolved version, and a hash of the vendored file tree. `wpm build` recomputes the hashes and **fails if they drift** from the lock (the `--frozen-lockfile` discipline), so a silently-modified vendored skill can't ride into a package unnoticed. `wpm project validate` surfaces the same check, and the plan-preview the end user sees (`02`, `09`) lists each vendored artifact with its locked version and source, so consent is informed rather than blind. This is what makes the "pin the version, surface it in the plan-preview, keep the license" guidance from `06`/`09` a concrete, verifiable contract instead of a hope.

This is deliberately a *progressive* floor, not a maximal one. The lockfile gives tamper-evidence and reproducibility — roughly the bottom of the SLSA build track (provenance and integrity of inputs). Stronger guarantees (cryptographic signing of the published package, signed provenance attesting how it was built, fully reproducible builds) are a coherent next step the format leaves room for but does not require at v1, exactly as the supply-chain frameworks treat their higher levels as opt-in hardening. The first job is that the content an agent will execute can't be tampered with undetected between authoring and install; signing and attestation come later.

## The update flow

Bringing a bundle current needs no diff computation. The agent fetches the new recipe (the repo at the new version), then runs it against the persistent receipt: the `kind:state` tasks reconcile in place (re-running, no-op where already satisfied), and the pending `kind:migration` tasks — those whose milestone is newer than the recorded version and whose from-version gate matches — fire in order. Each applied migration is then **archived** (it's done forever, so it leaves the active board and joins the durable ledger in `archive/`, full content intact), and any step the new recipe no longer defines is archived as a **tombstone** so its inverse op survives for uninstall. The recorded version advances. That is "Repair against a bumped target" made literal, and it degrades gracefully: a user several versions behind simply has more pending migrations to apply, oldest-first by milestone, each archived as it lands.

A **from-scratch install is the same loop against an empty receipt**: every state task runs to reach the current version directly, and every migration's gate finds no prior version and skips. This is the key difference from a replay-every-migration-from-V1 model — each version is *independently installable*, reaching current state through its (current) state tasks rather than by reconstructing its predecessors. Migrations only ever bridge an existing older install; they are never the path a new user takes to the current state.

Reversal stays forward-biased and honest, as in `07`: uninstall and failed-update rollback replay the inverse-op journal best-effort; a *guaranteed* reversible migration (an authored down-step) is per-task extra work, never assumed. Config files on update are handled conffile-style against the receipt's recorded checksum — user-modified files preserved, keep/replace/merge offered.

## Worked example — `web-handoff`, fresh 2.0 and 1.0 → 2.0

At 1.0 the bundle installed Chromium and placed a launcher whose config used an old key; the receipt records `version 1.0` and the Chromium task's notes journal ownership as installed (with the removal command). At 2.0 the author renames that config key, and **two** things change in the recipe — the distinction is the whole point.

First, the **state task** that places the launcher is *edited* to write the new key, because a user installing 2.0 from scratch must land on the correct 2.0 state directly. Editing state tasks across versions is expected, not forbidden — they always describe the current desired state. What's frozen is migrations, not state.

Second, the author *adds* a **migration task** for users coming from 1.x — labelled `kind:migration`, milestone `-m 2.0`, gated "applies only when a sub-2.0 install is present" — that rewrites the old key in the user's existing config and carries over any value they had set. Then they bump `bundle.yml` to 2.0.

The two install paths now both land correctly:

- **Fresh 2.0** (empty receipt): the state tasks run and place the launcher with the new key directly; the migration's gate finds no prior install and skips. One pass, correct result.
- **1.0 → 2.0** (receipt records 1.0): the state tasks reconcile (Chromium and the launcher already present, largely no-op), and the migration fires because recorded `1.0 < 2.0`, rewriting the existing key and preserving the user's value — the carry-over the idempotent state task couldn't know to perform. It is then archived into the ledger (full content, for audit and any later reversal), the recorded version advances to 2.0, and the live board returns to just the current state tasks.

The migration earns its place precisely because the state task alone can't move a user's old value across a rename: convergence would write the new key but strand the old one and its data. That carry-over, knowable only from the pre-2.0 state, is what a migration is for — and it's exactly what a fresh install has no need of.

## Hard rules

A shipped `kind:migration` task is immutable — fix forward by adding a new migration, never by editing an applied one, because the ledger assumes applied migrations don't change underneath it. The persistent receipt is never overwritten by an update; the recipe is replaceable precisely because the receipt lives elsewhere, and the agent reads the recipe but only ever writes the receipt. Worked tasks are preserved *whole* by archiving, never compacted or discarded — their inverse ops are the uninstall knowledge for what's on the machine. Preserved tasks are addressed by stable `step:` slug and version label, never by raw `task-N`, because Backlog.md recycles IDs after archive. A bundle's `id` is stable across all versions while its `version` moves, so an update is recognised as the same bundle rather than installed alongside the old one. Migrations run once, oldest-first, gated on the recorded from-version, and are archived once applied; state tasks re-run freely and reconcile in place. And reversal is forward-biased: replay the journal best-effort, treat a guaranteed-reversible migration as deliberate extra work.

Read with `07` (the install contract this extends), `06` (the `bundle.yml` fields and the labelled task kinds in the skeleton), `03` (how the executing agent runs the update), `02` (the end-user Update action), and `01`/`04` (the human and agent authoring discipline).
