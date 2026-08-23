---
title: "Sprint Change Proposal — Durable Fast Story Gates"
date: 2026-08-23
status: approved-and-applied
mode: Batch/YOLO
scope: Moderate
recommendedApproach: Direct Adjustment
approval: "User explicitly approved immediate reliable application on 2026-08-23."
policy_revision: fast-gates-v1
---

# Sprint Change Proposal — Durable Fast Story Gates

## 1. Issue Summary

The first speed correction was not durable. It remained partly uncommitted, its planning/state projection was
lost during TASK-120 integration, and already-running persistent specialists continued from cached
instructions. TASK-120 consequently ran a failed full suite and a 447.42-second replacement full suite, while
the next story again told its reviewer to run the full suite.

The quality strategy is sound; its delivery and invalidation mechanism failed. This proposal makes the policy
committed, state-versioned, immediately applicable to TASK-121, and independently visible on every specialist
resume.

## 2. Impact Analysis

- Product scope, functional requirements, acceptance criteria, architecture, UX, story count, dependencies,
  and order remain unchanged.
- Per-story literal BMAD workflows, independent adversarial review, focused tests, typecheck, Biome, relevant
  builds, deterministic two-platform compatibility, package-boundary coverage, and generated non-leakage stay
  mandatory.
- Exact archive/source-free evidence is accepted once per changed ship boundary against the stable behavior
  hash. An earlier worker/QA run is reusable only when review changes no product/test byte and the evidence is
  bound to that exact hash.
- Ordinary story cycles do not run the exact full `npm test` or live-client behavior matrices.
- One post-TASK127 cold gate runs dependency installation, typecheck, repository lint, build, the exact full
  suite, exact package/candidate/channel rebinding, and fresh live Codex plus externally authenticated live
  Claude parity for all six exact packaged skills.
- No product or test byte is changed by this correction.

## 3. Recommended Approach

Use a **Moderate Direct Adjustment** with four reliability controls:

1. Commit the governing AGENTS/SDLC/planning/backlog changes as one process-only commit on the active branch.
2. Add `delivery_policy.revision: fast-gates-v1` to `.bmad/sdlc-state.yaml`; every persistent worker/reviewer
   must compare and reread the policy block on resume before choosing gates.
3. Update the active TASK-121 story and Backlog note immediately so cached story context cannot retain the old
   reviewer-owned full-suite instruction.
4. Keep the final cold gate explicit in PRD, epic plan, readiness report, SDLC diagram, and state tracker, so a
   later transition cannot silently reduce it to Claude-only evidence.

Rollback and MVP reduction are not viable: no implementation is wrong and no product outcome changes. The
risk is low after commit because the state revision token makes stale specialist context detectable.

## 4. Detailed Change Proposals

### Per-story gate

**Old:** independent review finishes with an exact full local suite; skill stories also run live Codex evidence.

**New:** independent review finishes with focused/static/build evidence and, only when needed, one hash-bound
archive/source-free acceptance. Exact full-suite and live-host evidence are Phase 6 only.

### Final gate

**Old:** the final gate consolidates live Claude only, while exact full suites and live Codex repeat per story.

**New:** after TASK-127, one clean exact revision runs the full CI-equivalent suite, exact artifact rebinding,
and both live Codex and authenticated live Claude matrices for all six skills.

### Resume invalidation

**Old:** persistent specialists could retain an earlier policy when uncommitted files changed around them.

**New:** `.bmad/sdlc-state.yaml` carries a named policy revision and source. A mismatch or unread revision is a
pre-gate stop: reread AGENTS fast-feedback rules and the current story, then continue without a full preload.

## 5. Implementation Handoff

- Root owns the process-only commit and verifies its exact file inventory.
- Worker/QA apply focused gates under `fast-gates-v1` beginning with TASK-121.
- Reviewer rereads the state policy before TASK-121 review and must not launch an ordinary-story full suite.
- TEA owns the post-TASK127 clean full gate and live two-host matrix.
- Any final-gate executable/test fix creates a new exact revision and one new complete final gate.

Success means the policy survives branch transitions, TASK-121 contains no stale full-suite instruction, the
backlog sequence/status is unchanged, and no product/test file enters the process commit.

## Correct Course Checklist Result

All 26 checklist items were disposed: 22 completed; Direct Adjustment is viable; rollback and MVP reduction
are not viable; sprint-entry mutation is not applicable; zero action-needed items remain. The user supplied
explicit approval, so no additional approval round is required.
