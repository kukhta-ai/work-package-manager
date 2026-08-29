---
name: wpm-author
description: Continue WPM package authoring in a prepared workspace by orienting at its root, surfacing or claiming Backlog.md work, handling project-level tasks, and routing focused work to the one matching workspace specialist. Use when asked to continue, resume, or choose the next WPM authoring task. Do not use to execute a delivered work package, bypass a specialist already requested, or initialize or adopt an unprepared directory.
---

# Continue work in a WPM authoring workspace

Treat orientation and selection as one fail-closed workflow. Complete every predictable read and compatibility
check before changing Backlog.md or any workspace artifact.

## Keep the four workspace regions distinct

Begin in the current directory and require it to be the candidate workspace root. Do not walk upward, search
parent directories, run `wpm init`, auto-adopt another directory, or choose a more plausible root.

Identify and report these canonical regions:

- **Workspace root** — the authoring wrapper and location of the native root authoring front door.
- **Deliverable** — `wip/`, with `wip/manifest.yml` as its structural marker.
- **Build output** — `builds/`, isolated from both the wrapper and deliverable.
- **Authoring backlog** — `.authoring-backlog/`, the Backlog.md root and only task store.

Resolve real path and kind for every region. Require each child region to remain inside the declared workspace
root and require the regions to be distinct. Never use `.authoring-backlog/` alone as proof of a workspace; it
is gitignored working state.

The selected root `AGENTS.md` or `CLAUDE.md` is the authoring front door. `wip/_AGENTS.md`, per-bundle
`_AGENTS.md` files, a generated deliverable `AGENTS.md`, and anything under `builds/` are executor sources or
build output. Never treat those files as instructions for this authoring session. Read them only when the
current task's observable outcome requires inspecting them.

`manifest.targets` selects agents supported by the delivered package; it does not select an authoring client
or identify the current workspace front door. WPM workspace integration owns installing, writing, and
reconciling a workspace-root authoring front door and its managed pointer. Do not edit that managed front door
directly or route its integration work to `wpm-author-skill`. That specialist owns capability content,
including deliverable executor front doors, not managed workspace integration.

## Read only the managed-integration handshake

The root authoring front door must name one exact root-relative managed-state path. Read that path only. Do
not search for another state file, infer or guess a filename, follow a path outside the candidate root, or
derive integration identity from nearby skill directories.

Consume only the minimum read-only handshake needed here:

- the declared workspace-root identity;
- one coherent WPM integration version; and
- the WPM-owned relative path and version for `wpm-author` and, when routing, the selected specialist.

Confirm the declared root is the current workspace root. Confirm this skill's owned path contains a
`SKILL.md` whose frontmatter identity is `wpm-author` at the coherent version. Do not write, repair, migrate,
reconcile, or broaden managed state. Workspace integration owns those actions.

If the pointer, record, required fields, ownership, path confinement, skill identity, or version is missing,
corrupt, or incompatible, mark **managed integration** affected. Its one recovery is: reapply and verify WPM
workspace integration, then start a fresh session at the reported root. Do not guess around the defect.

## Preflight every prerequisite without mutation

Inspect these three prerequisite groups independently and aggregate every affected group in this stable order:

1. **Workspace layout** — candidate root, `wip/manifest.yml`, region kinds, and path confinement. Recovery:
   return to the prepared workspace root identified by WPM handoff verification, or prepare/adopt the intended
   workspace through WPM if it does not exist.
2. **Managed integration** — exact front-door pointer and the minimum handshake above. Recovery: reapply and
   verify WPM workspace integration.
3. **Backlog.md** — `.authoring-backlog/` is an available, valid Backlog.md root and every required CLI read
   succeeds with consistent identities, statuses, and dependencies. Recovery: repair or restore that backlog
   through its normal Backlog.md/WPM workflow, never by editing managed files.

Report all affected prerequisites together with exactly one applicable recovery for each. A failed group does
not excuse skipping safe read-only checks for another group. Until all three pass, do not invoke a specialist,
do not claim or resume a task, do not change task status, notes, criteria, or dependencies, and do not write a
workspace artifact.

## Take one complete Backlog CLI snapshot

Operate Backlog.md only through its CLI from `.authoring-backlog/`. Never read or edit task Markdown, task
files, indexes, sequences, or configuration directly.

1. Run `backlog task list --plain`. Retain the complete result and surface **every** task whose status is
   `In Progress` before choosing, resuming, or claiming work.
2. Run `backlog sequence list --plain`.
3. Run `backlog task <id> --plain` for every task identity present in either view. Use task records—not title
   keywords or sequence position alone—to obtain status, dependencies, description, acceptance criteria, and
   scope.
4. Cross-check identities, statuses, and dependency edges across all three views. Every listed dependency of
   a selectable task must have a record whose status is `Done`.

Treat these reads as one fresh logical snapshot. If a command fails, a task record is missing, or the views
are malformed or contradictory, the Backlog.md prerequisite is blocked. Never reinterpret malformed backlog
evidence as an empty backlog or no eligible work.

This logical snapshot is not a lock or conditional claim. Do not invent a Backlog command, lock, transaction,
or compare-and-set surface. Close the stale-evidence window with the CLI-only freshness barrier below and
report concurrent drift honestly.

Treat task selection as a serialized authoring boundary. The Backlog CLI has no conditional status edit, so
this workflow cannot prove cross-session claim ownership and must not describe its freshness reads as an
atomic multi-agent claim. If the invoking coordinator or author cannot exclude another concurrent selector,
stop without mutation, ask them to serialize selection, and restart orientation afterward. Within that
serialized boundary, the freshness and post-edit reads below prove this session made at most one status edit
and that the selected task is observable as current.

## Classify the current task before selecting it

Classify from the task record's complete requested outcome and acceptance criteria. Do not route from a
keyword-only title match.

- **Project-level work** stays here and is handled directly. This includes unambiguously project-wide
  metadata, targets, package authoring content, and other work that does not enter a specialist boundary.
- One bundle's capability boundary, metadata, dependencies, payload registration, or lifecycle routes to
  `wpm-author-bundle`.
- Install-backlog recipe detect, setup, verify, state, or migration work routes to `wpm-author-recipe`.
- Advisor, installer-helper, payload-skill content, or a deliverable executor front door such as
  `wip/_AGENTS.md` or a bundle `_AGENTS.md` routes to `wpm-author-skill`.
- Whole-package structure, references, registrations, versions, executor simulation, build non-leakage, or
  release-readiness review routes to `wpm-review-package`.

A task that ambiguously spans several specialist domains is blocked classification, not permission to split,
guess, or invoke several skills. Report the ambiguous boundaries and ask the author to clarify the task
through Backlog.md's CLI.

Specialist compatibility applies only to a specialist classification. Before such a task can be selected or
routed, prove that its one matching specialist is recorded as WPM-owned at one exact relative path and at the
coherent integration version. Read that path's `SKILL.md` and confirm its frontmatter identity. Invoke only
that skill through the current host's native skill mechanism. A project classification requires no specialist
and remains selectable after the workspace, managed-integration, Backlog, classification, and dependency
checks pass.

Never substitute another WPM specialist, a personal or global copy, legacy `installer-builder`, or a
repository-relative source copy. Missing, stale, mismatched, ambiguous, or multiply owned specialist evidence
blocks selection. Its one recovery is to reapply and verify workspace integration. Do not skip the first
dependency-eligible task and claim unrelated later work to hide an integration defect.

## Resume active work before claiming new work

If any tasks are `In Progress`, claim nothing and create no task:

- Report all active task identities, titles, dependencies, and classifications before any choice.
- If exactly one is active, name it before continuing. If several are active, require the author to select
  one; never choose silently.
- Preflight the selected task's classification and, only for a specialist classification, specialist
  compatibility before reporting it as resumed.
- Continue the existing task identity and status. Resuming does not create, duplicate, or status-edit a task.

Pass only the focused current task, its acceptance criteria, and the validated workspace root to a specialist.
Do not load every specialist and do not let the specialist select, claim, or replace another backlog task.

## Refresh at the selection boundary

Immediately before reporting an active task as resumed or performing a claim status edit, apply one CLI-only
freshness barrier: re-run `backlog task list --plain` and `backlog sequence list --plain`, then re-read the
selected task and every dependency record with `backlog task <id> --plain`. Compare identities, all active
statuses, the selected status, and dependency statuses with the retained snapshot.

If any relevant fact drifted, if a new active task appeared, or if a dependency is no longer `Done`, stop
without mutation and restart orientation from a new complete snapshot. Do not route, resume, or claim from
stale evidence.

## Claim at most one eligible task

Only when no task is `In Progress`, evaluate every task record in the snapshot. Dependency eligibility depends
only on a readable, consistent task being `To Do` with every listed dependency `Done`. Classification and
specialist compatibility are later claim preconditions; they do not redefine dependency eligibility.

Use the existing dependency-sequence order, then the records' existing order and identity as the deterministic
tie-break. Do not invent priorities or reorder work. Preflight the first dependency-eligible task's
classification and every applicable workspace, Backlog, and specialist prerequisite. A classification or
specialist defect is a blocked selection with its own recovery; it does not mean that no dependency-eligible
work exists, and it is not permission to skip to unrelated later work.

After all preflight, the serialized-selection boundary, and the freshness barrier succeed, make exactly one
status mutation:

`backlog task edit <id> -s "In Progress"`

That status edit is the only mutation authorized during orientation and selection. Do not invoke
`backlog task create`, `--notes`, `--check-ac`, `--check-dod`, or any criteria or dependency mutation. Do not
mutate a second task.

After the status edit, re-run `backlog task list --plain` and `backlog sequence list --plain`, then re-read the
selected task and its dependency records. Only a matching `In Progress` record, still-`Done` dependencies, and
no conflicting newly active task make the claim observable as current. If the edit command fails, its outcome
is uncertain, or the post-edit reads disagree, do not retry the status edit, roll it back, edit another task,
or dispatch work. Return a blocked selection with the exact command and observed post-edit evidence plus one
recovery: inspect and repair the Backlog through its normal CLI, then restart orientation.

Only when no task meets the status-and-dependency definition above, report that no dependency-eligible
authoring work exists and make no Backlog or workspace mutation.

## Handle or route the current task

For project-level work, remain in this session and handle it directly. Follow the root authoring rules, work
only toward the task's observable acceptance outcomes, preserve coherent durable artifacts, and verify the
outcome before any Backlog status change. Continue to use only Backlog.md's CLI for task state.

For specialist work, invoke exactly the classified specialist. A successful route means the matching skill
received only the focused current task and validated root; it does not mean the task is complete. Keep any
other concern pending rather than claiming it was handled.

## Return one inspectable result

Return one deterministic result with:

- declared workspace root plus `wip/`, `builds/`, and `.authoring-backlog/` identities;
- managed integration version and relevant owned-skill evidence;
- every `In Progress` task;
- current or selected task plus dependency evidence;
- classification: `project` or one exact specialist;
- selection action: `resumed`, `claimed`, `none`, or `blocked`, including freshness and claim-mutation evidence;
- dispatch action: `handled-directly`, `routed`, `none`, or `blocked`; and
- every affected prerequisite or classification boundary with one recovery.

Use selection `resumed` only after the existing active task's route preflight and freshness barrier succeed.
Use selection `claimed` only after the single CLI edit and all verifying reads succeed. Record dispatch
separately so a run that both claims and routes, or resumes and handles directly, preserves both observable
facts. Never let a partial orientation, readable task title, or available unrelated specialist erase an
independent blocker.
