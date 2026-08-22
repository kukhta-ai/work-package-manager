---
title: "Sprint Change Proposal — Consolidate Live Claude Skill Parity at the Final Packed Revision"
date: 2026-08-22
status: approved
mode: Batch/YOLO
scope: Moderate
recommendedApproach: Direct Adjustment
approval: "User explicitly approved on 2026-08-22: defer Claude parity live test to after all the implementation."
---

# Sprint Change Proposal — Consolidate Live Claude Skill Parity at the Final Packed Revision

## 1. Issue Summary

Story 2.2 / TASK-115 completed its product, automated compatibility, exact-package, generated-non-leakage,
official-helper, and live Codex evidence. Claude Code 2.1.158 also discovered the exact packaged
`wpm-author-bundle` skill in its native workspace scope, but authenticated inference could not start because
the host's existing first-party OAuth token had expired.

Three separately authorized minimal probes ended with the same result before inference or tool use:
`401 OAuth access token has expired. Re-authenticate to continue.` The final probe exited 1 after 29,825 ms,
used zero input/output tokens and zero tools, and changed no credential, product, test, or workspace state.

The current shared skill-story DoD makes this external authentication prerequisite block each skill story in
turn. That ordering does not improve the six skills and would repeatedly interrupt implementation for the same
host prerequisite. The approved correction defers only authenticated live Claude execution evidence and
consolidates it against the exact final packed revision after implementation is complete.

## 2. Impact Analysis

### Epic and story impact

- Epic 2 remains viable and keeps all six independently reviewable WPM skills.
- Stories 2.2–2.6 and 2.9 retain, per story:
  - a freshly invoked official authoring helper and current official sources/helper/host versions;
  - deterministic Codex and Claude Code native-path, frontmatter, discovery, trigger-contract, and portability
    compatibility tests;
  - exact packed/source-free availability and generated-deliverable non-leakage proof; and
  - live Codex discovery, explicit invocation, natural-language trigger, non-trigger, and observable outcome
    evidence.
- Authenticated live Claude explicit invocation, natural-language trigger, unrelated non-trigger, and
  representative observable outcome are moved from each skill story to one consolidated final gate covering
  all six skills: `wpm-create-package`, `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`,
  `wpm-author-skill`, and `wpm-review-package`.
- TASK-115's recorded Claude discovery and 401 evidence remain valid diagnostic evidence, but the missing live
  Claude executions no longer block its story-level completion after the approved task/DoD adjustment is
  applied through the normal backlog workflow.
- No story or epic is added, removed, rolled back, or renumbered. Stories 2.7, 2.8, 2.10, and 2.11 keep their
  existing product outcomes. Epic 3 keeps its existing scope and order.

### Final-gate placement

The consolidated Claude gate belongs in the existing final cold gate after Story 3.3, once the exact final
revision has been packed and its source-free boundary has passed. This is the only existing point that meets
both parts of the approved wording: **after all implementation** and **against the exact final packed
revision**. It runs before final handoff or any later human-authorized distribution activation.

Claude authentication is an external prerequisite for that gate. WPM does not acquire credentials, launch
login, mutate agent settings, or claim session ownership. Failure to satisfy the prerequisite blocks final
handoff/activation, not intermediate skill implementation.

### Planning-artifact impact

| Artifact | Impact |
| --- | --- |
| PRD | Adjust the shared skill-story evidence constraint and final cold-gate wording only. Functional requirements and MVP remain unchanged. |
| PRD addendum | No change. Distribution, authority, and trust boundaries remain intact. |
| Epic/story plan | Adjust the shared DoD supplement, affected skill-story completion rule, and existing final cold gate. No new story. |
| Architecture | No change. This is evidence scheduling; pure-core, ports, process-ownership, and credential boundaries are unchanged. |
| UX | No change. No extra user step, setup prompt, authentication feature, or product flow is introduced. |
| Product/tests | No rollback or new subsystem. Existing deterministic cross-host tests remain mandatory. |
| Sprint/Backlog | Later PO/Developer application updates the shared DoD/task wording and statuses through their governed tools; this proposal run changes neither. |

## 3. Recommended Approach

Use **Direct Adjustment** with a **Moderate** change classification.

This preserves the intended quality bar while moving one externally blocked, repetitive runtime gate to the
point where it has the strongest evidence value: the exact final artifact. It does not reduce product scope,
remove Claude compatibility, weaken source-free/non-leakage proof, or substitute static checks for final live
parity.

- Implementation effort: low; wording, evidence ownership, and gate sequencing only.
- Verification effort: unchanged in substance and lower in repeated setup overhead.
- Timeline effect: unblocks Stories 2.2–2.6 and 2.9 while retaining a hard pre-handoff gate.
- Risk: moderate because a Claude-only behavioral issue may be found later.
- Mitigation: deterministic Claude-native compatibility tests remain per story, exact pack/non-leakage proof
  remains per story, live Codex remains per story, and final Claude sessions exercise all six skills against
  the exact final package. A final-gate defect is fixed before handoff and the affected gates rerun.

Rollback is not recommended: completed work is correct and unaffected. MVP review or scope reduction is not
recommended: the approved user outcome and supported-client set remain unchanged.

## 4. Detailed Change Proposals

### A. PRD shared delivery constraint

**Current:**

> Every story that creates or changes a WPM-owned skill must use a fresh official Codex or Claude Code
> skill-authoring helper at implementation time and record the helper and host versions, then-current official
> source links and access date, and fresh-session discovery, explicit-invocation, natural-language trigger,
> non-trigger, and outcome evidence for both supported platforms.

**Proposed:**

> Every story that creates or changes a WPM-owned skill must use a fresh official Codex or Claude Code
> skill-authoring helper at implementation time and record the helper and host versions, then-current official
> source links and access date, deterministic native-path/frontmatter/discovery compatibility evidence for
> Codex and Claude Code, exact packed/source-free availability, generated-deliverable non-leakage, and live
> Codex discovery, explicit-invocation, natural-language trigger, non-trigger, and observable outcome evidence.
> After all scoped implementation, authenticated live Claude Code explicit-invocation, natural-language
> trigger, non-trigger, and representative-outcome parity for all six WPM skills is proven once against the
> exact final packed revision before final handoff or activation. Authentication is an external prerequisite
> for that final gate and is not a WPM capability.

**Rationale:** Preserve every evidence category while assigning the external authenticated-host gate to the
final artifact rather than blocking each intermediate skill story.

### B. Epic 2 shared Skill Story DoD supplement

**Current:** Each of Stories 2.2–2.6 and 2.9 must complete fresh live evidence for both hosts before its own
completion.

**Proposed:** Each story owns the fresh helper/source/version record, deterministic two-host native contract,
exact package/source-free proof, generated non-leakage, and live Codex evidence. The story records any Claude
discovery or diagnostic evidence available, but authenticated live Claude behavioral parity is owned by the
consolidated final gate and is not duplicated as a story blocker.

**Rationale:** Keep each skill independently testable without repeating one external credential gate six
times.

### C. Stories 2.2–2.6 and 2.9

**Current completion implication:** A skill story remains open when authenticated live Claude execution is
unavailable, even if its acceptance criteria and all other shared evidence pass.

**Proposed completion implication:** A skill story may complete when its acceptance criteria, official-helper
record, deterministic Codex/Claude compatibility, pack/source-free proof, non-leakage proof, live Codex
evidence, and normal quality gates pass. It must not claim final live Claude parity; that claim remains pending
at the consolidated gate.

**Rationale:** Make the deferral explicit rather than silently waiving or falsely claiming evidence.

### D. Existing final cold gate

**Current:** After Story 3.3, rebuild and inspect the final package, regenerate the inactive candidate from the
exact bytes, and rerun the no-write distribution assessments.

**Proposed:** Keep that sequence and add, after exact-package/source-free verification and before final
handoff/activation, authenticated fresh Claude Code parity for all six exact packaged skills. For each skill,
the evidence covers native discovery, explicit invocation, a natural-language trigger, an unrelated
non-trigger, and a representative observable outcome or verified no-write outcome appropriate to the skill.
Identical packed bytes are used throughout; no repository-relative resource or independently rebuilt artifact
may substitute.

**Rationale:** This is the strongest and least ambiguous place to verify the actual artifact that would be
handed off.

## 5. Implementation Handoff

**Classification:** Moderate — Product Owner / Developer coordination for backlog and evidence ownership;
normal Developer/QA execution afterward.

1. Product Owner applies the approved shared-DoD/task wording through the Backlog CLI; no hand edit under
   `backlog/`.
2. Developer/QA updates TASK-115's story and QA disposition without deleting its truthful 401 evidence, then
   applies the same evidence ownership to Stories 2.3–2.6 and 2.9 as they are created.
3. Sprint tracking is synchronized through the normal workflow; no story/epic is added or renumbered.
4. The final-gate owner obtains an externally authenticated Claude Code session, builds one exact final packed
   revision, and runs the consolidated six-skill parity before final handoff/activation.
5. If final live parity exposes a defect, the owning skill is corrected, its focused and package gates rerun,
   a new exact final artifact is produced, and the consolidated gate reruns against those new bytes.

Success means all six skills retain their story-level deterministic/package/Codex evidence, the consolidated
authenticated Claude matrix passes against one exact final packed revision, and no product code owns
credentials, login, agent spawning, or session lifecycle.

## Correct Course Checklist Result

All 26 checklist items were disposed: 22 completed, Direct Adjustment marked viable, rollback and MVP review
marked not viable, and sprint-entry mutation marked not applicable to this proposal-only run. There are no
unresolved action-needed items.

The user explicitly approved this correction on 2026-08-22, including Moderate classification, Direct
Adjustment, no rollback, no MVP reduction, no new product scope, and no additional approval round.
