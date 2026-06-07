# Story task-96 + task-97 — Teach the AC what-not-how contract and the native agent surfaces in the installer-builder skill

> Lean implementation spec (BMAD create-story output, **stated-fallback mode**). **Content-only** skill
> authoring (Story A of epic-4, *authoring-context*). Two high-value concepts are taught NOWHERE in the
> authoring agent's only runtime surfaces (the `installer-builder` skill + the workspace front door): (G1)
> the acceptance-criteria *what-not-how* contract, and (G2) the native agent surfaces / five skill roles.
> Add one on-demand reference for each, link both from `SKILL.md`. Edits live **only** under
> `agent-skills/installer-builder/` (two new references + the SKILL.md link/count update) plus, to keep the
> suite green, the skill's own structural test. No `wpm` code; no `backlog/` status/AC edits; no commits.
>
> **BMAD process note (Rule 3).** `bmad-create-story` was invoked via the Skill tool but **cannot run
> unattended** for these tasks: its Step-1 auto-discovery reads
> `_bmad-output/implementation-artifacts/sprint-status.yaml`, which is a **read-only mirror of foundation
> epic-1 (tasks 1–33)** and excludes epic-4 tasks 96/97; mutating it is forbidden (it would corrupt the
> mirror). This matches the documented precedent for tasks 92–94. The story is therefore driven from
> `backlog task 96/97 --plain` + `_bmad-output/authoring-context-ledger.md` + `docs/task-writing-conventions.md`
> + `docs/05-native-agent-surfaces.md` as the stated source. `bmad-dev-story` is likewise keyed to that
> sprint mirror, so implementation proceeds from the ledger+docs under the same fallback.

## Acceptance criteria (the contract — from `backlog task 96/97 --plain`)

**TASK-96 — `references/task-conventions.md`**
1. The skill set includes a reference stating that AC are observable outcomes, not the steps to reach them.
2. The reference covers, as outcomes: one concern per criterion; negative/edge behaviour; naming a boundary
   contract while leaving internals unspecified.
3. The reference gives a check for distinguishing an outcome from a method.
4. The skill body links to the reference under progressive disclosure.
5. The reference attributes its source to the task-writing conventions and does not contradict them.
6. The reference stays within the references' length discipline.

**TASK-97 — `references/native-surfaces.md`**
1. A reference distinguishes the skill roles an author places, stating for each where it lives and what
   triggers it.
2. It states skills are discovered only from scanned scopes and that a skill outside one is inert.
3. It states the executor front-door + per-target alias mechanic, consistent with the author-owned
   reserved-prefix front door.
4. It warns against a bare `skills/` directory and against placing a payload skill in a scanned scope.
5. The skill body links it under progressive disclosure; it is attributed to doc `05`; it stays within the
   length discipline.

## What to distill (from the ledger + source docs; do not re-invent)

- **task-conventions.md** ← `docs/task-writing-conventions.md` + ledger §4(e)/U4: the 6 rules (outcome-not-steps;
  checkable from outside; one concern/declarative; cover negatives/edges; *specify the seam, leave the stuffing*;
  never restate the DoD), the seam-vs-stuffing contract table, and the fast classifier ("could two competent
  implementers satisfy it with different code? yes=keep, no=rewrite"). The wpm-specific *why*: the AC **is** the
  verification that travels inside the bundle (binds every recipe-task `--ac`).
- **native-surfaces.md** ← `docs/05` + epic-3 truth + ledger §4(d): discovery is location-bound (scanned scopes,
  session-start, description is load-bearing, inert otherwise, mid-session clone won't fire); the per-agent scope
  table; the five skill roles (installer / vendored-discipline / advisor / install-time-helper / payload) with
  where each LIVES + TRIGGER; install-time roles get aliases, payload does not; never a bare `skills/`; the
  executor front-door + per-target alias mechanic — **referencing** `conventions.md` §front-door, not duplicating.

## Implementation plan

- Add `references/task-conventions.md` (~70–85 lines) and `references/native-surfaces.md` (~70–85 lines), terse,
  imperative, scannable, matching the sibling references' heading style and a `> Source:` attribution line.
- Link both from `SKILL.md`'s **"Where to go for depth (read these on demand)"** list in the same format as the
  existing four; update the "depth lives in the four files" count to **six files**.
- Keep the suite green: extend the structural test `test/unit/agent-skills/installer-builder-skill.test.ts`'s
  `REFERENCES` set to the full on-disk reference set (so the two new files get the same exist/non-trivial/
  pointed-at/no-placeholder validation) and correct the now-stale "three" wording. Strengthen, do not weaken.

## Boundaries (do NOT do here)

- Edit ONLY under `agent-skills/installer-builder/` (two new references + the SKILL.md link/count) and the one
  skill structural test (to keep the suite green). No `wpm` code, no other docs, no `backlog/` edits, no commits,
  no AC/DoD ticks, no branch changes (the orchestrator owns those).
- Distillation, not a copy; cite the canonical doc, do not fork a second source of truth. Hold the fixed core
  (goals/vocabulary/style) invariant. `native-surfaces.md` must not duplicate `conventions.md`'s `_AGENTS.md`
  section — reference it and add the surfaces/roles model it lacks.
- qa-generate-e2e-tests is N/A — no executable runtime behaviour; this is skill-content authoring.

## Gate / DoD

- Two new references exist, each satisfying its AC set and within the length band; `SKILL.md` links both under
  progressive disclosure with the count updated; faithful to the source docs (no contradiction); no duplication
  of the `_AGENTS.md` section. `npm run typecheck`, `npm run lint`, and `npm test` all green.
