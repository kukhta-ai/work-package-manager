---
title: "Sprint Change Proposal — Reliable Final-Gate Consolidation"
date: 2026-08-23
status: approved-and-applied
mode: Batch/YOLO
scope: Moderate
recommendedApproach: Direct Adjustment
approval: "User explicitly instructed restoration and durable main-session handoff on 2026-08-23."
policy_revision: fast-gates-v2
supersedes: fast-gates-v1
---

# Sprint Change Proposal — Reliable Final-Gate Consolidation

## 1. Issue Summary

The earlier `fast-gates-v1` correction correctly identified repeated story-level full suites and live-host
matrices as the dominant avoidable latency, but its application was not safe or durable. Commit `8b0a567`
mixed the policy with active story and protected process-file changes, and the subsequent correction
`0347cb0` reasonably restored those files while interpreting the approved deferral as Claude-only. That left
the repository back on a roughly seven-to-ten-minute exact full `npm test` for every otherwise-clean story,
plus repeated live Codex behavior sessions.

The user has now explicitly approved restoring the broader speed policy and asked that the main session be
given a durable instruction to preserve it. The problem is process timing, not product scope or missing test
coverage: focused acceptance, static, build, package, and independent-review evidence already catch the
story-local defects, while the complete exact suite and live-host matrix are most meaningful after the final
implementation revision exists.

## 2. Impact Analysis

- Product goals, functional requirements, acceptance criteria, architecture, UX, story count, dependencies,
  order, and public-activation boundaries remain unchanged.
- Literal BMAD create/dev/QA/review workflows, one independent adversarial reviewer, focused regression
  tests, typecheck, Biome, relevant builds, deterministic Codex/Claude compatibility, exact package
  availability, and generated-deliverable non-leakage remain mandatory per story.
- Ordinary stories no longer run the exact full `npm test` or live Codex/Claude behavior matrix. This removes
  the repeated slow work without weakening task-specific proof.
- A reviewer may require an exceptional story-level full suite only for a named, concrete cross-cutting risk
  that cannot be bounded by focused tests. The reason and result must be recorded; ritual repetition is not
  an exception.
- One post-TASK127 cold gate runs from one clean exact revision: clean dependency installation, typecheck,
  repository lint, build, exact full `npm test`, exact package/packed-install/candidate/channel rebinding, and
  fresh live Codex plus externally authenticated live Claude parity for all six exact packaged skills.
- No production or test behavior is changed by this correction.

## 3. Recommended Approach

Use a **Moderate Direct Adjustment** with five reliability controls:

1. Apply a new `fast-gates-v2` policy rather than replaying or cherry-picking the mixed `8b0a567` commit.
2. Put the revision, source, effective story, exception rule, and mandatory main-session notice in
   `.bmad/sdlc-state.yaml`; persistent workers and reviewers must compare the revision on resume.
3. Keep the governing AGENTS/SDLC language explicit: focused evidence per story, one exact final cold gate,
   and invalidation whenever executable or test bytes change after that gate.
4. Bind ship-boundary evidence to a stable product/test hash. Reuse an earlier worker/QA proof only when
   review changes no product/test byte and the evidence names that same hash.
5. Update the active TASK-121 handoff plus future skill/family task notes so cached story context cannot
   silently retain the reverted full-suite instruction.

Rollback and MVP reduction are not viable: no implemented capability is wrong and no product outcome needs
removal. Direct adjustment has low technical risk because it changes only verification timing and preserves a
documented escape hatch for concrete cross-cutting risk.

## 4. Detailed Change Proposals

### AGENTS.md / SDLC — per-story verification

**OLD**

Every independent story review ends with one exact full CI-equivalent local suite; skill stories also own
fresh live Codex behavior evidence.

**NEW**

Every story runs the literal workflows, focused acceptance/regression tests, typecheck, Biome, relevant build,
and one independent review. A changed ship boundary receives one stable-hash-bound exact
archive/source-free/non-leak proof. The exact full suite and live supported-client behavior matrix are not
ordinary-story gates. A reviewer may request the full suite only for a documented concrete cross-cutting risk
that focused evidence cannot bound.

**Rationale:** This preserves fast defect localization and independent scrutiny while removing repeated
whole-repository and live-host work from revisions that are not final.

### PRD / Epic / Readiness — final verification ownership

**OLD**

Live Codex is repeated by each skill story; only authenticated live Claude parity is consolidated after Story
3.3. The exact full suite is repeated per story.

**NEW**

Skill stories retain fresh helper use, deterministic two-platform contract evidence, exact package
availability, and non-leakage. After TASK-127, one clean exact revision owns the exact full suite, candidate
rebinding, and both live Codex and authenticated live Claude six-skill matrices.

**Rationale:** Live behavior is most trustworthy against the final packaged bytes, and deterministic
story-level contracts continue to catch platform drift earlier.

### State and task handoff — stale-policy invalidation

**OLD**

The state tracker has no delivery-policy revision, and TASK-121 says its reviewer owns an exact full
`npm test`.

**NEW**

The state tracker carries `delivery_policy.revision: fast-gates-v2`, an explicit mandatory handoff notice,
and the final-gate contract. TASK-121 and later task notes point to that revision. A worker/reviewer with an
unread revision must reread the policy before choosing gates.

**Rationale:** The main session and persistent specialists share repository state even when chat context is
stale; a revision token is the durable communication seam.

## 5. Implementation Handoff

- Root applies and commits only process/planning/state/backlog policy files; active TASK-121 product/test
  bytes remain outside the policy commit.
- The active TASK-121 reviewer must apply `fast-gates-v2`: finish the independent audit and focused/static/
  build/package checks, but do not launch the exact full `npm test` absent a recorded exception.
- Workers and QA use focused gates for TASK-122 through TASK-127 and bind package evidence to stable hashes.
- TEA owns the post-TASK127 clean exact-revision gate, exact artifact/candidate/channel rebinding, and live
  two-host six-skill matrix.
- Any executable/test fix produced by the final gate invalidates that gate; focused checks run first, then the
  complete final gate runs once again on the new stable revision.

Success means the policy survives branch/session transitions, TASK-121 no longer instructs a ritual full
suite, no product/test file enters the process commit, and final handoff remains blocked until the complete
post-TASK127 gate passes.

## Correct Course Checklist Result

All 26 checklist items were disposed: 22 completed; Direct Adjustment is viable with low effort and low risk;
rollback and MVP reduction are not viable; no epic, story, dependency, order, or sprint-entry change is
required; zero action-needed items remain. The user's explicit restoration instruction is the required
approval, so no additional approval round is needed.
