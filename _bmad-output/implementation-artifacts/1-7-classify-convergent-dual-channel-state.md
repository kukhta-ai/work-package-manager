---
baseline_commit: 9fa3ac88004b2bb49f7dd387f37a100cec76beda
---

# Story 1.7: Classify Convergent Dual-Channel State

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-113. -->

## Story

As a WPM maintainer,
I want the GitHub and npm assessments combined into one stable result,
so that later authorization can distinguish safe progress, compatible partial completion, and conflicts.

## Acceptance Criteria

1. For one persisted candidate and its two channel assessments, combined state receives exactly one classification under this precedence: conflicting, blocked, complete, resumable, matching, ready.
2. After higher-precedence conditions are excluded, candidate-identity disagreement between assessments or a hard conflict from either channel classifies the result as conflicting.
3. After conflicting is excluded, absence of a required candidate binding, bounded activation fact, or read-only observation needed to derive a non-empty required-boundary set or the next safe boundary classifies the result as blocked.
4. After conflicting and blocked are excluded, a non-empty required-boundary set whose every required channel boundary is externally complete and candidate-matching classifies the result as complete.
5. After conflicting, blocked, and complete are excluded, at least one complete required boundary plus at least one outstanding required boundary, with all completed or observed objects candidate-compatible, classifies the result as resumable.
6. After higher-precedence conditions are excluded, no complete required boundary plus at least one candidate-bound external object, with every observed object candidate-compatible, classifies the result as matching.
7. A candidate-matching immutable npm version awaiting its approved final dist-tag is compatible but incomplete for combined classification.
8. Ready requires a non-empty required-boundary set, sufficient required facts, no complete required boundary, and no candidate-bound external object.
9. An explicitly empty required-boundary policy produces no ready result.
10. A conflicting result identifies every mismatched candidate identity and the affected channel or object.
11. A blocked result identifies each missing binding, activation fact, or required observation.
12. A resumable result preserves compatible completed work.
13. A resumable result identifies only the outstanding forward boundary.
14. Recovery guidance for a conflicting result does not recommend rollback, overwrite, retagging, or version reuse.
15. Repeated evaluation of identical candidate, policy, and channel observations produces the same classification and evidence.
16. Combined-state evaluation changes no local or external release state.

## Tasks / Subtasks

- [x] Define the closed combined-assessment boundary (AC: 1-3, 8-11, 15)
  - [x] Revalidate one persisted Story 1.4 candidate and accept only the reviewed Story 1.5 GitHub and Story
        1.6 npm assessment projections; aggregate independently invalid candidate, policy, and assessment input.
  - [x] Accept a caller-supplied activation record plus an explicit, duplicate-free subset of the bounded
        GitHub/npm boundary inventory. Keep an empty set representable but never ready or complete.
  - [x] Bind each channel's candidate ID, package version, revision, and exact artifact digest evidence to the
        persisted candidate; distinguish an absent binding from a contradictory one.
- [x] Classify compatible and incompatible evidence once (AC: 1-15)
  - [x] Aggregate every candidate-identity mismatch and hard GitHub/npm conflict first, with stable channel,
        object, identity, and field evidence and no destructive recovery suggestion.
  - [x] Aggregate unresolved bounded activation facts, missing assessment bindings, and missing/unverified
        observations needed for each required or next-safe boundary as blockers.
  - [x] Project required boundary completion and known-compatible outstanding state from the existing channel
        matches/missing/unverified/manual-authority findings without re-assessing either channel.
  - [x] Apply exactly one precedence chain: conflicting, blocked, complete, resumable, matching, ready. Preserve
        completed compatible boundaries and expose only required forward outstanding boundaries.
  - [x] Keep an exact matching npm immutable version with a missing/different approved final tag compatible;
        the tag remains an incomplete manual-authority boundary, never a hard conflict or automatic retag plan.
- [x] Expose one local read-only combination command (AC: 1-3, 10-16)
  - [x] Reuse the hardened persisted-candidate loader and stable ordinary-file JSON reader for the policy and
        two assessment files; emit structured JSON with machine-distinguishable invocation/input failures.
  - [x] Add no Git/GitHub/npm client, HTTP/fetch, subprocess, credential discovery, environment authority,
        local receipt/cache, mutation, activation, publication, rollback, or independently rebuilt artifact.
- [x] Add focused RED-to-GREEN and through-the-edges evidence (AC: 1-16)
  - [x] Unit-test every classification, precedence overlap, empty/non-empty boundary policy, missing versus
        mismatched identity, exhaustive conflicts/blockers, npm manual-tag compatibility, ordering, and reruns.
  - [x] Extend the real exact-candidate journey through both existing assessment commands and the combination
        command; snapshot candidate, assessment/policy inputs, Git tags, npm configuration, credential/trust,
        and representative external state before and after every outcome.
  - [x] Extend structural and package/deliverable non-leakage guards; run focused distribution unit/integration,
        typecheck, Biome, build, and explicit `dist`/pack/generated-artifact checks. Reserve exact full
        `npm test` for independent review.

## Dev Notes

### Scope and Outcome

This story combines evidence; it does not observe either service again and does not plan or perform a release.
The only product decision supplied here is a caller-owned projection of already-authorized activation facts and
an explicit set of required boundaries. The implementation may validate that policy but must not choose a
coordinate, channel role, ordering, authority, trust relationship, or boundary set.

Keep this in `distribution-preparation/`, outside `src/core`, `dist`, the npm `files` allowlist, product CLI,
and generated work-package deliverables. Story 1.7 closes Epic 1's local preparation classifier only; public
activation and every remote write remain deferred.

### Required Reuse and Preserved Contracts

- `loadPersistedCandidate` remains the only command-side candidate loader. Its reviewed stable archive reread,
  package/repository projection, exact digests, evidence validation, path/link/race guards, and changed-binding
  refusal must remain intact.
- `normalizeExactCandidate`, `normalizeActivation`, the closed activation inventory, deterministic text order,
  and `readAssessmentJson` are the shared hardened seams. Extend a genuinely neutral helper only if needed;
  do not copy a weaker candidate, activation, or stable-file implementation.
- Story 1.5's assessment result is the GitHub evidence source: exact candidate projection; required tag,
  release, package asset/checksums/evidence; ordered `matches`, `missing`, `unverified`, and `conflicts`.
- Story 1.6's assessment result is the npm evidence source: exact candidate/archive metadata projection;
  required coordinate/version/artifact/final tag/repository/provenance/authority/evidence; ordered `matches`,
  `missing`, `unverified`, `manualAuthority`, `conflicts`, and the fixed unsafe-action guard.
- Do not call either channel evaluator from the combined classifier. It consumes their reviewed output and
  must not reconstruct GitHub/npm observations or silently upgrade missing evidence.

### Minimal Combined Policy and Boundary Inventory

Use a small versioned closed policy containing the caller-supplied activation record and an explicit array of
required boundary IDs. The refinable internal shape should keep exactly these semantic IDs in stable order:

1. `github.tag`
2. `github.release`
3. `github.asset`
4. `npm.version`
5. `npm.final-dist-tag`

Reject unknown or duplicate IDs. An empty array is valid policy evidence so AC 9 is observable, but it yields a
blocked result naming the absent required-boundary decision. `ready` and `complete` always require a non-empty
set. Boundary facts come from the exact candidate and channel assessment: the GitHub asset is the candidate
archive; the npm tag is the assessment's approved final dist-tag. Do not introduce arbitrary workflow stages,
commands, or remote identifiers.

Evaluate the supplied activation record with the existing closed Story 1.1 inventory. It may be synthetically
complete for classification tests while the product remains `activation: disabled`, release-ineligible, and
publication-incapable. Any unresolved inventory item is a blocker. The channel assessments' unresolved-fact
projections must be consistent with the supplied activation record; inconsistency cannot be treated as proof.

### Evidence Projection and Precedence

Normalize closed plain-data projections of both reviewed assessment results. Permit an explicitly absent
assessment or candidate binding so the specified blocked outcome can be represented; malformed values and
unsupported fields are invalid input, while contradictory valid identities are conflict evidence.

For each channel, compare candidate ID, package version, source revision, and its required exact artifact
digest/size evidence with the persisted candidate. Report every mismatch, not only the first. A hard entry in
either channel's `conflicts` array wins even when blockers also exist. Preserve the source channel/object/field
in every combined conflict.

Map reviewed match evidence to boundaries without interpreting arbitrary strings:

- GitHub `tag`, `release`, and exact candidate `asset` matches complete their corresponding boundaries.
- npm exact `version` and approved `tag` matches complete `npm.version` and `npm.final-dist-tag`.
- A matching npm version plus `manualAuthority` for the approved tag completes only `npm.version`; the tag is
  compatible and outstanding.
- A channel `missing` finding proves known absence for its corresponding boundary. A required `unverified`
  finding or an assessment that cannot establish either match or known absence blocks the classification.

Project three stable sets: required completed boundaries, required outstanding forward boundaries, and all
candidate-bound compatible external objects (including matches outside the required set). Then apply one
first-match chain only:

1. `conflicting`: any identity mismatch or hard channel conflict.
2. `blocked`: no conflict, but empty boundary policy, unresolved activation fact, missing binding, inconsistent
   activation projection, or insufficient required observation.
3. `complete`: non-empty required set and every required boundary complete.
4. `resumable`: some but not all required boundaries complete.
5. `matching`: no required boundary complete, but at least one compatible candidate-bound object exists.
6. `ready`: non-empty required set, all required facts/observations sufficient, and no compatible external
   object exists.

This order makes the six classes mutually exclusive. A resumable report exposes completed work separately and
lists only required incomplete boundaries as forward work; it does not repeat non-required or already complete
objects as outstanding.

### Result and Recovery Guard

Return one versioned deterministic report with the single classification, exact candidate identity, normalized
required boundaries, completed boundaries, outstanding boundaries, compatible external evidence, blockers,
conflicts, and explicit inactive eligibility. Canonically sort every finding/set independently of caller object
or array order.

For conflicts, a minimal stop-and-resolve-evidence message is sufficient. Always expose a fixed prohibition on
rollback, overwrite, retagging, version reuse, republication, and unpublish/republication; never emit a command
or write plan. Valid blocked/matching/resumable/conflicting results are successful evaluations, not command
errors.

### Read-Only Command Contract

A thin local script should accept the persisted candidate directory, combined policy JSON, and the structured
outputs of the existing GitHub and npm assessment commands. Prefer consuming their `{status: "assessed",
assessment: ...}` envelopes so the real journey uses actual prior command bytes rather than hand-rebuilt
equivalents.

- Exit 0 for every valid combined classification.
- Exit 2 for invalid invocation syntax.
- Exit 1 for unreadable/malformed/non-ordinary input, rejected assessment envelopes, invalid closed schema, or
  failed exact-candidate verification.
- Emit structured JSON only. Write no result file and inspect no process environment, credential, Git, GitHub,
  npm, or network state.

### Testing Requirements

- Pure tests cover all six classifications and overlapping precedence: conflict plus blocker; blocker plus
  complete-looking matches; complete versus resumable; matching versus ready; explicit empty policy; missing
  versus mismatched binding; cross-channel/candidate ID, version, revision, size, and digest disagreement;
  every hard channel conflict; stable exhaustive findings; and identical-input reruns.
- Required-boundary tests cover subsets and full sets, order normalization, duplicates/unknown IDs, non-empty
  ready/complete invariants, compatible npm version/manual-tag state, required unverified observations, and
  non-required matching objects.
- Command tests cover usage, rejected assessment envelopes, independently invalid policy/assessment files,
  symlink/non-ordinary/invalid UTF-8 reads through the shared helper, corrupt candidate refusal, structured
  valid classifications, and unchanged inputs.
- The real journey starts from one clean-pack/installed/prepared candidate, obtains both assessments through
  their real local scripts, then classifies ready, matching, resumable, complete, blocked, and conflicting
  projections without changing candidate trees, assessment/policy bytes, Git tags, isolated npm config and
  credential sentinels, or representative remote state.
- Public-surface tests reject subprocess, HTTP/fetch/registry clients, credential readers, Git/release/npm
  mutation commands, publication workflows, and activation. Preserve `private: true` and prove every new
  preparation file remains outside `dist`, npm pack, and generated tar/Git/conditional-zip deliverables.

### Previous Story and Review Intelligence

- Story 1.5's independent review approved 4/4 ACs after hardening exact candidate identity, closed nested
  schemas, nullable GitHub metadata, aggregate invalid inputs, stable ordinary-file reads, and canonical
  duplicate handling. Final stable suite: 1,406/1,406.
- Story 1.6's independent review approved 6/6 ACs after binding npm repository metadata to a stable reread of
  the exact archive, preventing unresolved metadata from matching, separating mutable authority uncertainty
  from immutable conflicts, aggregating file/schema errors, distinguishing unknown repository evidence,
  rejecting semver-like dist-tags, and conflicting on exact-coordinate incompatible occupancy. Final stable
  suite: 1,439/1,439; executable product/test hash
  `095c5bf5ebc5c373023c2e3aa3737aaf9edf6044369ff733d49e27915841dd5a`.
- Those reviewed result shapes are the inputs to this story. Do not weaken their semantics by accepting a
  digest match without repository/provenance proof or by recasting authority uncertainty as artifact conflict.

### Git and Runtime Intelligence

- Story baseline at creation: `9fa3ac88004b2bb49f7dd387f37a100cec76beda` on
  `feature/authoring-agent-onboarding-task-113`.
- Relevant commits: `62e6013` (TASK-112 implementation plus independent review fixes), `34eabfc` (TASK-112
  merge), `872174c` (reviewed TASK-111 implementation), and `ada7f97` (TASK-111 merge).
- No `docs/00`–`docs/14` file changed since this persistent worker's complete preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`.
- Current local runtime: Node `v22.22.1`, npm `10.9.4`, Vitest `4.1.7`; preserve Node `>=20` and CI Node 20/22.
  No new dependency, external API, or current-version decision is required, so web research adds no relevant
  implementation fact beyond the reviewed Story 1.5/1.6 contracts.

### Project Structure Notes

- Expected new surfaces: one pure convergence classifier, one thin local combination command, focused unit and
  real-journey tests, one assessment-only package script, and the QA summary. Exact filenames are refinable.
- Expected modified surfaces: package script registration, the existing distribution-preparation public/
  non-leakage guard, the real packed-install journey, sprint tracker, and this story record.
- Do not edit `src/core/**`, product CLI commands/help, release workflows, credentials, Backlog, SDLC state,
  `AGENTS.md`, `docs/SDLC.md`, `.serena`, canonical design docs, branch, commits, or merges.

### References

- [Source: backlog task TASK-113 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-17-Classify-Convergent-Dual-Channel-State]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Deduction-3-Publication-must-be-modeled-as-a-convergent-state-machine]
- [Source: _bmad-output/implementation-artifacts/1-5-assess-github-release-staging-without-writes.md]
- [Source: _bmad-output/implementation-artifacts/1-6-assess-npm-publication-without-writes.md]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Debug Log References

- Literal `bmad-create-story` run in YOLO mode; customization resolved persistent fact
  `file:{project-root}/**/project-context.md` with no matching files and no prepend/append/on-complete hooks.
- Literal `bmad-dev-story` run in YOLO mode; customization resolved the same persistent fact with no matching
  files and no prepend/append/on-complete hooks.
- Literal `bmad-qa-generate-e2e-tests` run in YOLO mode; customization resolved the same persistent fact with
  no matching files and no prepend/append/on-complete hooks.

### Completion Notes List

- Create-story checklist verdict: PASS. All 16 TASK-113 acceptance criteria are preserved verbatim; the
  implementation guide defines one bounded five-boundary policy and one pure precedence chain, reuses both
  independently reviewed channel contracts, distinguishes absent from contradictory evidence, and excludes
  observation, publication, activation, credentials, rollback, and generic reconciliation machinery.
- Dev-story RED evidence: the pure classifier suite first failed because `convergence-assessment.js` did not
  exist; the command suite independently failed because `assess-convergence.js` did not exist.
- Dev-story GREEN evidence: 18 focused unit tests, 11 public-surface integration checks, the 2-test real
  packed-install journey (109.54s), and the focused tar/Git/conditional-zip parity test passed. Typecheck,
  touched-file Biome, build, `dist` exclusion, and npm dry-pack inspection (421 files, zero preparation leaks)
  passed. Per the repository's proportional-review policy, the exact full `npm test` remains reviewer-owned.
- Implementation combines one exact persisted candidate with caller-supplied activation/boundary policy and
  reviewed local GitHub/npm assessment envelopes. It reports one deterministic classification and exhaustive
  binding/conflict/blocker evidence while keeping all eligibility inactive and every recovery action inert.
- Dev-story checklist verdict: PASS (25/25). All story tasks are complete, every AC has focused evidence, the
  implementation uses no new dependency or effect surface, and story/sprint are ready for independent review.
- QA strengthened exhaustive conflict evidence with a regression that changes all nine candidate/artifact
  binding fields independently in both channel reports and proves all 18 mismatches survive the single
  conflicting classification. QA also tightened the fixed conflict-recovery vocabulary to prohibit all
  retagging, matching AC 14 without adding any action surface.
- QA checklist verdict: PASS. Distribution units passed 140/140 and distribution integrations passed 25/25
  using an isolated rerun after one diagnosed pre-convergence child timeout in the concurrent band. Typecheck,
  repository-wide Biome over 235 files, build, `dist` exclusion, and diff hygiene passed. QA summary:
  `_bmad-output/implementation-artifacts/tests/test-summary-task-113.md`.
- Stable executable product/test aggregate hash over the seven changed product/test files:
  `74ac872a356f79a782ef4719f2eb5411f409263c3219f061bb8a0b6e6dcc27f3`. The exact full `npm test` remains
  reserved for the independent reviewer.
- Independent automatic-fix review resolved three high- and two medium-severity findings, hardened exact
  channel-report and stable-file identity, and approved all 16 criteria with zero open findings. The reviewed
  nine-file product/test hash is `e1d4839cd131d7fc25253e1e6e839899cb8d7b27b14d32a90f322e0bbccd843b`;
  the exact full suite passed 1,473/1,473.

### Change Log

- 2026-08-22: Created Story 1.7 implementation context through literal `bmad-create-story` in YOLO mode.
- 2026-08-22: Implemented the pure convergence classifier, local read-only command, focused acceptance tests,
  real candidate/channel journey, and package/deliverable non-leakage evidence through literal
  `bmad-dev-story` in YOLO mode.
- 2026-08-22: Strengthened exhaustive two-channel binding-conflict automation and completed the literal
  `bmad-qa-generate-e2e-tests` workflow in YOLO mode; story remains at review for independent review.
- 2026-08-22: Independent automatic-fix review hardened channel projection/evidence validation and stable
  file identity, completed the stable-diff gate, and approved the story with zero open findings.

### File List

- `_bmad-output/implementation-artifacts/1-7-classify-convergent-dual-channel-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-113.md`
- `distribution-preparation/assess-convergence.js`
- `distribution-preparation/assessment-files.js`
- `distribution-preparation/convergence-assessment.js`
- `distribution-preparation/prepare-candidate.js`
- `package.json`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/assess-convergence.test.ts`
- `test/unit/distribution-preparation/convergence-assessment.test.ts`

## Senior Developer Review (AI)

### Outcome

**APPROVE — 16/16 acceptance criteria satisfied, 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode against TASK-113, this story,
its QA evidence, the complete in-scope diff, the reviewed TASK-108–TASK-112 contracts, and the unchanged
`docs/00`–`docs/14` design set.

### Findings Resolved

- **HIGH:** channel reports did not close or bind their nested required tag/release/archive/checksum/evidence,
  npm coordinate/repository/provenance/authority, and exact SRI projections. The combined boundary now accepts
  only the reviewed channel shapes and reports every persisted-candidate projection mismatch as conflict data.
- **HIGH:** contradictory match/missing/unverified evidence, forged match fields, and npm final-tag/manual
  evidence without an immutable version match could complete boundaries. Category/field/state identities and
  npm prerequisites now fail closed; retained npm authority observations and missing-policy evidence must be
  internally consistent.
- **HIGH:** an unverified candidate-bound object outside the required subset could still yield `ready`,
  `matching`, or `resumable`. Such evidence now blocks every lower state while preserving an already complete
  non-empty required set.
- **MEDIUM:** equivalent unresolved-fact and finding arrays could produce order-dependent policy blockers or
  diagnostics. JSON inputs, findings, facts, reasons, owners, and boundary evidence now normalize canonically,
  with duplicate and unsupported evidence rejected deterministically.
- **MEDIUM:** stable ordinary-file readers checked the opened descriptor but did not rebind the named path
  after reading; persisted candidate reads also lacked a complete named-path/descriptor identity check. Both
  readers now compare the initial path, descriptor before/after, and final named path and reject swaps/links.

### Verification

- Classifier/command review band: **33/33 passed**; complete distribution unit band: **154/154 passed across
  13 files**.
- Complete distribution integration band: **25/25 passed across 4 files**; the real packed candidate journey
  passed **2/2 in 96.40 seconds**, and the remaining integrations passed **23/23**.
- `npm run typecheck`, repository-wide `npm run lint` (**235 files**), `npm run build`, and `git diff --check`:
  **passed**.
- Explicit `dist` inspection, generated-deliverable regression, and npm dry-run ship set (**421 entries**)
  found **0** convergence or `distribution-preparation` leaks.
- One exact stable-diff `npm test`: **117/117 files, 1,473/1,473 tests passed** in **401.51 seconds**.
- Stable executable product/test hash over the nine in-scope files:
  `e1d4839cd131d7fc25253e1e6e839899cb8d7b27b14d32a90f322e0bbccd843b` before and after the full gate.

### Workflow Customization

No matching `project-context.md`, activation prepend/append, workflow override, or completion hook applied.
Backlog, SDLC state, contributor instructions, canonical design docs, branch/commit/merge state, and `.serena`
were not changed by independent review.
