# Input reconciliation — agent-driven onboarding flow investigation

## Input

- `_bmad-output/implementation-artifacts/investigations/agent-driven-onboarding-flow-investigation.md`
- Reconciled against `_bmad-output/planning-artifacts/prd.md`
- Later scope authority: `_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md`
- No `addendum.md` exists.

## Approved-scope gaps

### 1. Bootstrap conversation economy is only partially captured

The PRD says what `wpm-create-package` covers and separately limits the authoring-client chooser, but it does not explicitly preserve the approved interaction rule from Story 2.9: reuse supplied or retained readiness, package-intent, client, and workspace facts, and ask only for decisions still required. Without that requirement, an implementation can satisfy FR16 while re-asking known information or turning bootstrap into a fixed questionnaire. Add the ask-only-unresolved rule and the single actionable recovery response for a missing prerequisite to the onboarding UX contract.

### 2. Fresh-workspace task selection is underspecified

FR18 compresses the backlog continuation behavior to “resumes or claims” work. It omits the approved Story 2.6 ordering and containment semantics: surface in-progress work before claiming anything new; claim exactly one dependency-eligible task when none is active; and leave the backlog unchanged while reporting clearly when nothing is eligible. These details are the deterministic handoff experience that prevents duplicate or ambiguous work after the bootstrap conversation disappears.

### 3. Specialist skills lack a shared fail-honest interaction contract

FR19 and FR47–FR49 describe each specialist's knowledge area, but they do not fully retain the investigation's qualitative boundary, refined in Stories 2.2–2.5: each specialist must work without hidden bootstrap context, surface unresolved author decisions instead of inventing them, leave work owned by another specialist explicitly pending, and avoid claiming readiness when its own boundary is unresolved. For `wpm-review-package`, the approved read-only default when no fix authorization was supplied is also absent from the PRD. Capture these as shared specialist behavior rather than repeating implementation detail per skill.

### 4. Multi-client handoff failure containment is implied, not guaranteed

FR27–FR28 require adapter-specific findings and recovery, but do not explicitly state the approved Story 2.8 outcome that a stale or missing surface for one configured client must not cause unaffected clients to be declared invalid. Make verification results per-client and preserve valid client results. This keeps the multi-select setup trustworthy and avoids presenting a single integration defect as a total handoff failure.

## Deliberate later-authority exclusions

No gap is recorded for public acquisition or activation, template-provided authoring skills, fresh-clone/missing-backlog reconstruction, template evolution or drift reconciliation, automatic agent spawning, or durable receiver acceptance. The approved epic explicitly defers those investigation recommendations, and the updated PRD reflects that boundary correctly.
