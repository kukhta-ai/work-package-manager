# Story task-98 + task-99 — Make the core bet/executor-loop explicit, and correct the authoring skill to the workspace + current command surface

> Lean implementation spec (BMAD create-story output, **stated-fallback mode**). **Content-only** skill
> authoring (Story B of epic-4, *authoring-context*). Two clusters in the authoring agent's only runtime
> surface (`agent-skills/installer-builder/`): **(98)** add the missing CONCEPT depth — name the core bet,
> give the author the executor runtime loop to simulate against, state the receipt done-gate and the
> how-to-use close; **(99)** fix the 9 places the skill is STALE/WRONG after the epic-3 workspace changes,
> plus the build-rows description. Edits live **only** under `agent-skills/installer-builder/` (SKILL.md +
> four references) plus this story artifact. No `wpm` code; no `backlog/` status/AC edits; no commits.
>
> **BMAD process note (Rule 3).** `bmad-create-story` was invoked via the Skill tool but **cannot run
> unattended** for these tasks: its Step-1 auto-discovery and Step-6 update key off
> `_bmad-output/implementation-artifacts/sprint-status.yaml`, which is a **read-only mirror of foundation
> epic-1 (tasks 1–33)** and excludes epic-4 tasks 98/99 (confirmed: 0 occurrences of 98/99). Its Steps 2–4
> require `epics.md`/`architecture.md` planning artifacts that do not exist for epic-4 (our planning
> artifacts are docs `00`–`14` + the ledger). Mutating the epic-1 mirror is forbidden (it would corrupt it).
> This matches the documented precedent for tasks 92–97. The story is therefore driven from
> `backlog task 98/99 --plain` + `_bmad-output/authoring-context-ledger.md` (§2 C2/C5/C6/U7, §4(a)/(b)/(c),
> §6(B), §7) + docs `00`/`03`/`04`/`07`/`09` + ground-truth CLI (`node dist/cli.js … --help`, `src/cli.ts`,
> `src/core/operations/{build,lifecycle}.ts`) as the stated source. `bmad-dev-story` is likewise keyed to
> that sprint mirror, so implementation proceeds from the ledger+docs+CLI under the same fallback.

## Acceptance criteria (the contract — from `backlog task 98/99 --plain`)

**TASK-98 — concept depth (the bet / the executor loop / the done-gate / the how-to-use close)**
1. The skill states *why* AC describe outcomes not steps: a reasoning agent adapting to an environment the
   author never sees.
2. The author can find the executor runtime loop it authors for, deep enough to simulate it: detect, verify,
   record, resume, idempotent re-run.
3. The skill states recording the receipt is a precondition for a task being done.
4. The skill states the author duty to provide the bundle how-to-use close.
5. The additions respect the length discipline — new depth lands in a reference or existing slack, not by
   bloating the spine.

**TASK-99 — correct to the workspace + current command surface (the 9 drift fixes + build rows)**
1. The command surface includes the command that installs the authoring skill into the agent scope.
2. No surface claims the executor front door is auto-regenerated; it is author-owned, written once.
3. Every worked path resolves under the deliverable subdirectory (`wip/`), not the flat project root.
4. The build is described as producing the un-nested deliverable into the build-output directory.
5. The skill references only project/bundle templates the tool actually provides.

## What was distilled / fixed (from the ledger + ground-truth; do not re-invent)

**TASK-98 (depth lands per ledger §7 budget):**
- **The bet** → SKILL.md spine, by tightening (doc `00` l.11): "intent plus verification, executed by a
  reasoning agent, beats fixed steps — because the install runs on a machine you never see; so a recipe task
  states an outcome to verify, not steps to replay." Names the *why* behind the what-not-how AC contract.
- **The executor runtime loop** → `quality-protocol.md` §"simulate the executor" (which already said
  "simulate the executor" — given the loop to simulate against). doc `03` l.11 + l.17, doc `09` l.11/59/118/
  155–158: fresh-context-per-task picking the next unfinished task off disk; the uniform movement
  **detect → skip-if-satisfied → plan → do → verify against the AC → record → advance**; detection reasons
  against the AC; idempotent re-run *is* the repair primitive; restart resumes from the receipt;
  failure contained to its own bundle.
- **The done-gate** → `quality-protocol.md` §"Define the receipt" (doc `07` l.79–83, doc `00` l.36): the
  bundle's `install-backlog/config.yml` Definition of Done maps 1:1 to the receipt facts, so the executor
  cannot mark a task Done until they are recorded — the author sets that DoD.
- **The how-to-use close** → `quality-protocol.md` new §"End every bundle with the how-to-use close" (doc
  `04` l.21, doc `03` l.17): a bundle isn't finished when the files land — only when the user knows what they
  now have and how to trigger it; it is the final movement of the executor's per-bundle lifecycle.

**TASK-99 (the 9 §6(B) fixes + G9 build rows), each verified against the live CLI:**
1. `command-reference.md` — added `wpm skill install` (copies the bundled installer-builder skill into the
   agent's user scope; idempotent; project-independent).
2. `command-reference.md` + `SKILL.md` — re-render claim corrected: `<project>-installer/SKILL.md` + scope
   aliases re-render on mutation; `wip/_AGENTS.md` is author-owned, written once at init, never re-rendered
   (verified in `lifecycle.ts` `applyRerender`).
3. `command-reference.md` `init` — "scaffold an authoring workspace (root + `wip/` deliverable + empty
   `builds/`)".
4. `command-reference.md` `project root` — prints the deliverable root `<workspace>/wip` (verified: CLI
   prints `…/wip`).
5. `SKILL.md` `init` — creates the workspace wrapping the deliverable in `wip/` (+ materialises project-wide
   tasks).
6. `SKILL.md` — `cd bundles/<id>` → `cd wip/bundles/<id>`.
7. `conventions.md` — `cd bundles/web-handoff` → `cd wip/bundles/web-handoff`.
8. `authoring-workflow.md` — worked `cd …` and `cp …` given the `wip/` prefix; the `files add` line left as
   instructed (see "Open issue" below).
9. `SKILL.md` + `authoring-workflow.md` — dropped non-existent `single-bundle`/`multi-bundle` templates;
   only `minimal` (project) ships (verified: `templates/project/` = `minimal`, `templates/bundle/` =
   `default`). Worked session switched to `--template minimal` and made self-consistent (explicit
   `wpm bundle new core` + a satisfiable `^0.1.0` constraint), then re-run end-to-end (`project validate`:
   "no problems found").
- G9: `command-reference.md` build rows now describe the `builds/<project>-<version>.<ext>` output, the
  `wip/`→archive-root un-nest (manifest.yml at root), `_AGENTS.md`→`AGENTS.md` + per-target aliases, and the
  wrapper exclusions (verified against `build dry-run` ship list + `build.ts` `NON_SHIPPABLE_TOP_LEVEL` /
  `computeFrontDoorTransforms` + `buildOutputDir`).

## Boundaries (did NOT do here)

- Edited ONLY under `agent-skills/installer-builder/` (SKILL.md + 4 references) + this story artifact. No
  `wpm` code, no other docs, no `backlog/` AC/DoD ticks, no commits, no branch changes.
- Did NOT duplicate Story A's two references: `native-surfaces.md` (skill discovery + 5 roles) and
  `task-conventions.md` (the AC what-not-how contract) were untouched. The new executor-loop content in
  `quality-protocol.md` is the *runtime* loop (distinct from native-surfaces' discovery model and from
  task-conventions' AC-as-verification framing).
- Did NOT build the missing templates or edit human-owned docs (05/10/11) — deferred to the human-gated
  TASK-101 per the epic-4 decisions.

## Open issue surfaced (out of the 9-fix scope; left per explicit instruction)

The worked `wpm bundle web-handoff files add payload/files/launcher.json` line (authoring-workflow.md) is, per
the **current** CLI, broken: the `<path>` arg is relative to `payload/files` (verified in `cli.ts` l.991 +
`--help` + empirically), so it resolves to `…/payload/files/payload/files/launcher.json` and **fails exit 1**.
The correct form is `files add launcher.json`. The task instruction (and ledger §6(B) row 8) state the path is
"bundle-relative" and to NOT change the line; that premise is factually wrong. Honoring the explicit
"do NOT change it" directive, the line was left as-is and the issue is flagged for a follow-up (same class as
ledger §6(A) "worked examples that fail").

## Gate / DoD

- `npm run typecheck` clean; `npm run lint` clean (195 files); `rm -rf dist && npm test` green (1076 passed,
  141 skipped — the 8 e2e files self-skip without dist). Skill structural test
  `test/unit/agent-skills/installer-builder-skill.test.ts` passes 14/14 unmodified (no assertion weakened).
- Length discipline held: SKILL.md 97 (<100 ceiling; only the bet added conceptually, + minor correctness
  rewording); quality-protocol.md 85 (≈ceiling; loop+done-gate+how-to-use absorbed, lower-value lines
  trimmed); command-reference.md 81; conventions.md 85; authoring-workflow.md 84. The two big concept
  depths (executor loop) landed in a reference's slack, never the spine.
