# Story task-92 — Embed the authoring quality protocol from doc 04 in the installer-builder skill

> Lean implementation spec (BMAD create-story output). **Content-only** skill authoring. The
> `installer-builder` skill *points at* doc `04` but does not carry its protocol, so the authoring-quality
> discipline never reaches the agent at runtime. Add it as an on-demand reference. Edits live **only** under
> `agent-skills/installer-builder/` (one new reference + the SKILL.md link). No code; no `backlog/` edits.
>
> Note on BMAD scaffolding: task-92 belongs to the authoring-workspace epic, tracked in Backlog.md, **not**
> in the foundation `sprint-status.yaml` (which mirrors epic-1, tasks 1–33). This story file follows the
> existing `story-task-N.md` convention but the foundation sprint-status is deliberately **not** mutated
> (it would corrupt the read-only epic-1 mirror). create-story's sprint auto-discovery is therefore N/A;
> the story is driven from `backlog task 92 --plain` + doc `04` as the stated source.

## Acceptance criteria (the contract — from `backlog task 92 --plain`)
1. The installer-builder skill set includes a reference that distills doc `04`: the three author decisions,
   the simulate-the-executor move, the independence and leaked-coupling check, and the must-nots.
2. The skill body links to that reference under its progressive-disclosure model.
3. The reference stays within the length discipline the other references follow.
4. The reference attributes its source to doc `04` and does not contradict it.

## What to distill (from `docs/04-authoring-agent-protocol.md`; do not re-invent)
- **Prime directive:** make the implicit explicit — the bundle is all the executor inherits; move every tacit
  fact from the authoring conversation into the contract.
- **The three author decisions** the agent forces (never decides itself): trust gradient (pin exactly vs.
  describe intent), what gets verified ("how will the executor know this worked?"), and confirmation level
  (danger) per step.
- **The strongest move — simulate the executor:** role-play the executor with none of the conversation's
  context against the draft; every stall is leaked context. Extends to upgrades (simulate arriving at the
  previous version and applying the new one).
- **Independence / leaked-coupling hunt:** undeclared assumptions, shared mutable state, hard-coded IDs,
  assumed-not-declared ordering — report them; refuse the convenient cross-bundle coupling.
- **Decompose to detect → setup → verify** (the shape the executor reads) and define the receipt / DoD.
- **Must-nots:** don't confabulate domain facts (ask/flag instead); don't silently resolve the author's
  ambiguity; don't over-pin to feel safe; don't let a bundle be done without verification.

## Implementation plan
- Add **one** new reference `references/quality-protocol.md` distilling the above — terse, scannable,
  imperative, matching the existing three references' heading style and density (~67–83 lines; ≤ ~85).
- Carry a `Source: docs/04 …` attribution line (AC#4); stay faithful — distillation, not a copy, not a
  contradiction.
- Link it from `SKILL.md` under the existing **"Where to go for depth (read these on demand)"** bullet list,
  matching the exact format of the other three reference links (AC#2).

## Boundaries (do NOT do here)
- Edit ONLY under `agent-skills/installer-builder/` (the new reference + the SKILL.md link). No code, no other
  docs, no `backlog/` edits, no commits, no AC/DoD ticks (orchestrator owns those).
- Do **not** copy doc `04` wholesale or invent protocol content beyond it. Hold the fixed core
  (goals/vocab/style) invariant.
- qa-generate-e2e-tests is N/A — no executable behaviour; this is skill-content authoring.

## Gate / DoD
- One new reference exists, distilling doc `04`'s three decisions + simulate-the-executor + independence check
  + must-nots (AC#1), within the references' length discipline (AC#3), attributing doc `04` and not
  contradicting it (AC#4); SKILL.md links it under its progressive-disclosure section (AC#2). Voice matches the
  sibling references.
