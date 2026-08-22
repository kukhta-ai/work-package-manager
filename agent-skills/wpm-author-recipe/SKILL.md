---
name: wpm-author-recipe
description: Author or revise one WPM bundle's install-backlog recipe with observable state, migration, dependency, verification, and receipt-gate contracts. Use for creating or changing installation recipe tasks; leave bundle planning, skill/front-door authoring, and package review to their focused skills.
---

# Author a WPM install recipe

Turn the author's installation outcome into a recipe that a fresh, context-less executor can detect, apply,
verify, record, and resume. This skill is self-contained; do not rely on a bootstrap conversation or another
authoring skill to supply recipe meaning.

## Stay inside the recipe boundary

Work only in an existing WPM workspace and an explicit bundle. Do not auto-init a project, infer a bundle, or
change bundle metadata, lifecycle, payload, front doors, or targets. Route bundle-boundary work to
`wpm-author-bundle`, agent-skill or front-door content to `wpm-author-skill`, and whole-package readiness to
`wpm-review-package`. Name adjacent work only when the request or inspected state actually requires it.

The bundle's install backlog is the single recipe task source:

1. Confirm the workspace and requested bundle with `wpm project show --json` and `wpm bundle <id> show`.
2. Work from `wip/bundles/<id>`, where `backlog` must resolve to the same canonical directory as its sibling
   `install-backlog`. Prove that identity before writing; equal-looking directories are not enough. A detached
   copy or platform fallback would create a shadow recipe, so report it as a blocker.
3. Run `backlog --version`, `backlog task create --help`, and `backlog task edit --help` before relying on exact
   flags. Inspect tasks with `backlog task list --plain`, `backlog search --type task --plain`, and
   `backlog task <task-id> --plain`; inspect dependency order with `backlog sequence list --plain`; inspect
   configured receipt defaults with `backlog config get definitionOfDone`.

Use Backlog.md directly through those supported commands. Never hand-edit its task, archive, index, or config
files. There is no WPM recipe-task command: do not invent or use a `wpm` task mirror, second recipe, or authoring
receipt. Backlog.md 1.45.2 does not support `backlog config set definitionOfDone`; when project defaults need
repair, use its supported interactive `backlog config` editor only when interaction is available, then re-read
the result. Otherwise leave the configuration defect blocked rather than editing YAML or claiming per-task
patches repaired the project default. If the alias identity, bundle identity, or supported Backlog surface is
missing or ambiguous, report it as a blocker instead of initializing or bypassing the boundary.

## Elicit the contract before changing tasks

Ask only for missing facts that affect the recipe:

- the intended installed outcome and its externally observable proof;
- prerequisites and ordering relationships;
- machine or platform variance the executor must be free to adapt to;
- confirmation or trust constraints that affect action;
- the bundle version whose desired state is being authored; and
- non-recoverable facts the executor must record while acting.

Do not guess, invent, or silently resolve an author decision. Draft the complete task graph first, inspect the
existing active and preserved task history, and identify every predictable blocker before mutation.

## Model current desired state

Use `kind:state` for idempotent work that expresses the current intended result. A re-run must be safe: the
executor reasons against the acceptance outcome, recognizes an already satisfied state, and reconciles drift
without depending on the original method.

Every recipe has explicit **detect → setup → verify** concerns:

- **Detect** establishes what observable state already exists and whether setup is needed.
- **Setup** states the desired installed outcome, not fixed machine-specific steps.
- **Verify** is a separate verification outcome that independently proves the final capability and the receipt
  evidence on which completion depends.

Create enough tasks to make those concerns unambiguous; titles alone are not proof. Give every state task exactly one
immutable `step:<slug>` identity label, one `kind:state` label, and the bundle-version milestone. Pass both
labels in one comma-separated label argument because repeated label flags do not accumulate.

The state graph must express its real lifecycle: setup depends on detection, and verification depends on every
setup or migration outcome needed for readiness. A different decomposition is valid only when its complete
dependency graph still establishes those same observable boundaries without relying on file or creation order.

Write acceptance criteria as observable outcomes—the **what**, not the method or procedure. Keep one concern
per criterion and include negative or edge outcomes where they change success. A fresh executor must be able to
detect and verify the task from its acceptance criteria without the authoring conversation.

## Preserve migrations across versions

When revising a recipe, first distinguish the new current desired state from a transition that only applies to
an older installed state:

- Revise a `kind:state` task and advance its milestone when its current intended result changes.
- Add `kind:migration` only for a genuine one-time transition from explicit prior-version states. Its acceptance
  contract must make the from-version or installed-version gate observable and say when it does not apply.
- Give a migration its own stable `step:<slug>` and the version introducing it.
- Order pending migrations oldest-first by milestone; declare dependency edges wherever one transition relies
  on another, and make final verification depend on every applicable transition outcome.
- Treat previously shipped migration history as immutable. Never edit its meaning, broaden its prior-state
  gate, recycle its slug, or silently redefine it after recipients may have applied it. Fix forward with a new
  migration.

If state versus migration kind, the prior-version gate, or shipped history is ambiguous, leave the choice
unresolved and block readiness. Do not turn uncertainty into a migration “just in case.”

## Declare and validate execution order

An ordering requirement is a Backlog dependency, never task file order or prose. Draft edges with step slugs,
validate the whole proposed graph, then resolve each edge to the actual task ID returned by
`backlog task list --plain`. Use the current `--dep` or `--depends-on` task-ID surface supported by
`backlog task create` or `backlog task edit`. On the verified 1.45.2 surface, edit-time `--dep` replaces the
complete dependency set rather than appending one edge, while `--ac` and `--dod` append. Do not repeat
`--acceptance-criteria` to replace a set: that form does not reliably retain every supplied value. To replace
criteria, re-read the task, remove its existing criteria by descending index with repeatable `--remove-ac`,
then append the complete intended set with repeatable `--ac`. Re-read the result so a focused revision neither
drops unrelated edges nor duplicates or preserves stale criteria.

Pass dependency IDs exactly as the plain task listing displays them, including the complete prefix and case;
do not shorten them to a number or rewrite their spelling. In `backlog sequence list --plain`, each numbered
`Sequence N` is a dependency stage, not a separate disconnected graph. A detect → setup → verify chain
correctly appears as one task in each successive stage; tasks shown together in one stage are independent at
that point. Never rewrite a valid dependency merely to collapse those stage headings. Use explicit edit flags
only—do not invoke a bare interactive task editor or supply an `EDITOR` script to rewrite managed task files.

Before applying an edge, check the complete relevant graph for:

- a missing or unresolved dependency target;
- self-dependency;
- a direct or transitive cycle; and
- an ordering assumption that has no declared edge.

Aggregate all discoverable dependency blockers. Never create a known-invalid edge merely to observe the
Backlog response, and never claim that creation order supplies execution order.

## Gate receipt facts without writing the receipt

The shipped install backlog is the recipe. The persistent filled task records on the recipient's machine are
the receipt. You define what completion must record; only the target-side executor writes the receipt while
installing or resuming. Never write author-machine observations, ownership, inverse operations, or simulated
receipt entries into the shipped recipe.

Inspect the bundle's Definition of Done with the supported Backlog config surface. The completion gate must
cover every applicable non-recoverable fact:

- effect verified against the task's acceptance outcomes;
- placed or modified file references and checksums;
- ownership—installed by the executor versus adopted from the machine;
- the inverse operation and the condition under which it is safe;
- decisions and pinned values with their rationale; and
- non-file effects such as services, registrations, or produced artifacts.

Use the recipe's configured defaults and add a task-specific `--dod` only for an additional required fact.
`--no-dod-defaults` is valid only when the task genuinely creates no reversible or non-recoverable fact and the
author explicitly accepts that result. Even then, supply the reduced applicable gates explicitly with
repeatable `--dod`, including effect verification; never ship a recipe task with an empty Definition of Done.
A task cannot be Done until its applicable receipt facts are recorded. That gate lets a resumed executor
distinguish completed work from pending work without conversation memory.

Authoring completion is not installation completion. Leave shipped recipe tasks `To Do`, with acceptance and
DoD checkboxes unchecked. Do not use status, checklist, notes, or final-summary edits to manufacture completed
work or target-machine observations. Static payload references may be part of the recipe contract, but observed
placements, checksums, ownership, inverse operations, and other per-machine facts belong only to the recipient's
receipt. If an alleged recipe already contains completed/check-marked tasks or per-machine receipt facts, treat
the recipe-versus-receipt boundary as unresolved rather than erasing that evidence.

## Assess, apply, and verify

Before mutation, assess the draft and existing graph together. At minimum, find:

- missing or non-observable verification;
- acceptance criteria that prescribe a method instead of a checkable outcome;
- ambiguous state or migration kind, version milestone, or prior-version gate;
- missing receipt completion gates;
- completed/check-marked recipe state or target-machine receipt evidence in the shipped source;
- unresolved, missing, self, or cyclic dependencies;
- a detached `backlog` copy that is not the canonical `install-backlog`; and
- a duplicate or colliding `step:<slug>` in active or preserved history.

Report every discoverable blocker in one pass. If any remains, the recipe is **not ready**; do not mask one
failure by stopping at the first, and do not present successful individual edits as overall readiness.

When preflight is coherent, apply the smallest supported `backlog task create` and `backlog task edit` changes.
Re-read every affected task, the plain task listing, and `backlog sequence list --plain`, then simulate a fresh
executor and, for a revision, an executor arriving from each supported prior-version state.

Return an inspectable result:

- **Recipe:** bundle, recipe root, and intended version.
- **Resolved:** created or revised state tasks, migrations, dependencies, acceptance outcomes, and receipt
  gates proven in Backlog-managed state.
- **Unresolved:** author choices or unavailable history that prevent a coherent contract.
- **Blocked:** all discovered verification, state/migration, identity, receipt-gate, and graph defects.
- **Pending:** only genuinely required adjacent bundle, skill/front-door, or package-review work and its focused
  skill.
- **Recipe result:** `ready`, `incomplete`, or `blocked`.

Use `ready` only when detect/setup/verify, current state, applicable immutable migrations, observable acceptance
outcomes, receipt gates, and the dependency graph are all coherent. Otherwise state exactly what remains and
never claim the recipe or package is complete.
