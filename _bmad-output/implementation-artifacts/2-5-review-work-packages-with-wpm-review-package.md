---
baseline_commit: 4c88bb09a4fe766e6c6f2cd9bd33f877d0a47231
---

# Story 2.5: Review Work Packages with `wpm-review-package`

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-118. -->

## Story

As a package author,
I want a focused `wpm-review-package` skill,
so that a fresh agent can expose package defects and give me a trustworthy local handoff-readiness result.

## Acceptance Criteria

1. Given no prior authoring conversation is available; when `wpm-review-package` reviews a workspace; then it evaluates the bounded FR49 catalog: package structure, references, registrations, version constraints, context-less executor simulation, build non-leakage, and release readiness.
2. Given the bounded review catalog is evaluated; when review inputs are resolved; then its complete scope is derivable from durable workspace and deliverable artifacts without another WPM skill or prior conversation supplying hidden context.
3. Given package structure, references, registrations, or version constraints contain defects; when package coherence is reviewed; then every detected defect in those four catalog categories is reported with its affected artifact or relationship in one review result.
4. Given a bundle represents a fresh installation or version transition; when its executor experience is simulated without authoring context; then unstated prerequisites, ambiguous outcomes, unresolved references, undeclared coupling, and missing verification or usage guidance are reported.
5. Given build or release readiness is reviewed; when the review concludes; then readiness is reported only when package coherence, executor simulation, and build evidence agree.
6. Given a workspace-authoring surface is found in the prospective deliverable; when build non-leakage is reviewed; then release readiness is blocked.
7. Given release readiness is reported; when the review result is presented; then it is not presented as publication authorization.
8. Given no separate fix authorization was supplied; when package review completes; then the reviewed workspace and deliverable content remain unchanged.
9. The exact packed WPM package exposes `wpm-review-package` independently without repository-relative resources.
10. Generated work-package deliverables contain no copy of the `wpm-review-package` workspace-authoring skill.

## Tasks / Subtasks

- [x] Author one portable, self-contained package-review skill with the current official helper (AC: 1-8)
  - [x] Invoke the installed official Codex `skill-creator` and retain only the portable `SKILL.md` required by both supported clients.
  - [x] Define the seven-category FR49 review as the complete review boundary; derive every input from durable workspace and prospective-deliverable artifacts.
  - [x] Aggregate package-structure, reference, registration, and version defects; simulate both fresh-install and evidenced transition paths from a context-less executor's perspective.
  - [x] Produce one inspectable local readiness result, fail closed on missing evidence or authoring leakage, and never mutate/fix reviewed content or imply publication authority.
- [x] Add focused deterministic package-review evidence (AC: 1-8)
  - [x] Prove the finite catalog, durable-input boundary, aggregate coherence findings, executor simulation, readiness join, no-write contract, and explicit authority boundary.
  - [x] Prove identical Codex and Claude Code native path/frontmatter/discovery and explicit identity plus focused trigger and unrelated non-trigger behavior.
- [x] Prove exact package and generated-deliverable boundaries (AC: 9-10)
  - [x] Inspect and extract an exact clean-revision WPM archive, delete its source checkout, and re-read the complete skill from both native placements.
  - [x] Plant a unique marker in both authoring-client skill paths, inspect a real build from a symlink-preserving disposable workspace copy, and reject the skill path and marker from representative tar, Git, and conditional zip deliverables.
  - [x] Prove the original workspace and any pre-existing deliverable remain byte/link-identical before and after review evidence.
  - [x] Record fresh live Codex discovery, explicit invocation, unnamed natural activation, unrelated non-trigger, and a representative read-only review outcome from the accepted installed tarball; do not invoke or claim live Claude behavior.
- [x] Run proportional quality gates (AC: 1-10)
  - [x] Run the official validator, focused unit/package/non-leakage bands, typecheck, Biome, build, and diff checks; reserve the exact full `npm test` for independent review.

## Dev Notes

### Goal and Boundary

This story adds one packaged knowledge surface, not another review engine. A fresh authoring agent uses current
WPM read surfaces and ordinary artifact inspection to review one work-package workspace before handoff. No
`src/`, CLI, domain, schema, template, dependency, publication, or channel-assessment surface is added.

The skill is read-only over the reviewed workspace and prospective deliverable. It reports defects and missing
evidence; it does not repair them, check off authoring tasks, rewrite registries, regenerate content, or turn a
local readiness result into tag, release, npm, or publication authority. A later separately authorized fix is a
different task, not a mode hidden inside review.

### The Complete Seven-Category Review

The following catalog is finite and is the whole FR49 review boundary. Do not expand it into general quality,
security, release-channel, or style review, and do not silently omit a category:

1. **Package structure** — distinguish the workspace wrapper from `wip/`; reconcile manifest-declared enabled
   bundles with bundle directories; verify reserved executor-front-door sources, Backlog aliases, and expected
   package regions without treating wrapper authoring surfaces as deliverable content.
2. **References** — resolve every manifest/bundle payload file, template, script, skill, installer-helper, task
   reference, and lock reference to its exact durable artifact and scope.
3. **Registrations** — treat the owning `manifest.yml` or `bundle.yml` registry as authority. Disk scans and
   orientation views are not registration; registered scaffolds/TODO content are not complete; advisors and
   front doors correctly have no helper or payload-skill registry entry.
4. **Version constraints** — inspect project/bundle SemVer, enabled-bundle dependency ranges and cycles,
   `wpm.lock`, and durable transition evidence (`state`, migrations, from-version, and consumer constraint
   review). Missing history remains unresolved rather than inferred.
5. **Context-less executor simulation** — simulate a fresh install and every evidenced version transition from
   extracted deliverable artifacts alone. Report unstated prerequisites, ambiguous or non-observable outcomes,
   unresolved references, undeclared coupling/order, and missing verification, receipt facts, or usage guidance.
6. **Build non-leakage** — inspect a real prospective archive and reject workspace-only authoring surfaces,
   disabled/orphan/scaffold input, build outputs, distribution-preparation content, and planted review-skill
   identity or marker bytes, while allowing the intentionally generated executor `AGENTS.md` and target aliases.
7. **Release readiness** — report local handoff readiness only when package coherence, context-less simulation,
   and real build evidence all agree. Unresolved or blocked evidence means not ready; readiness is explicitly
   not publication authorization.

### Existing Read Surfaces and Aggregate Behavior

- Start from an explicit workspace root. Use `wpm project show --json`, `wpm bundle list`, and `wpm bundle <id>
  show` for orientation, then read the exact owning YAML and referenced ordinary files. Never auto-init or infer
  a different root/bundle to make review pass.
- `wpm project validate` is useful evidence for constraints, cycles, non-empty targets, and orphan bundle
  directories; it is not the whole review. Capture all of its findings and continue every independent catalog
  check. If project loading or one parent artifact is unreadable, mark dependent checks blocked while still
  completing independent checks.
- Validate portable paths, ordinary-file type, symlink identity/target, registry relationship, and bounded
  package scope. A directory listing, `project show`, or bundle file tree never substitutes for the owning
  registration.
- Report every detected package-structure, reference, registration, and version defect together. Each finding
  names its category, affected artifact or relationship, and durable evidence. Sort/stabilize output so the same
  bytes yield the same review result.
- The skill must work without `wpm-author`, another WPM skill, or facts from the bootstrap conversation. Missing
  author decisions remain explicit unresolved facts.

### Real Build Evidence Without Mutating the Review Subject

Snapshot the exact original workspace before build inspection: path/type, regular-file bytes, and symlink
targets, including any pre-existing `builds/` outputs or other prospective deliverable. Make a disposable copy
that preserves symlinks and run `wpm build dry-run` plus a real `wpm build package` only in that copy, using the
accepted installed WPM runtime. Inspect the produced archive's paths, link layout, and relevant content bytes,
then prove the original snapshot is unchanged. A dry-run listing alone is not build evidence.

If prerequisites prevent a real archive, report the missing evidence and do not claim readiness. Never run
`wpm build publish`, Git/tag/release/npm commands, credentials, or remote reads/writes. The disposable copy may
be deleted after evidence is captured; the reviewed original and pre-existing deliverables remain untouched.

Use a planted unique marker in both native workspace skill locations so non-leakage is non-vacuous. Reject the
exact `wpm-review-package` authoring skill path/marker across tarball, Git, and zip when available. Do not reject
the legitimate generated executor front door merely because it becomes `AGENTS.md` in the deliverable.

### Result Contract

Return one inspectable result containing:

- the explicit workspace and prospective archive identity;
- one entry for each of the seven catalog categories;
- aggregate findings with affected artifact/relationship and evidence;
- blocked or unresolved checks and why they could not be completed;
- fresh-install and applicable transition-simulation findings;
- real build/non-leakage evidence and original-workspace unchanged proof; and
- `release readiness: ready | not-ready`, followed by the explicit statement that this is local handoff
  readiness and not authorization to publish.

Use `ready` only when all seven categories completed without a blocking defect or unresolved required evidence.
Never let one successful validation/build observation erase an independent finding.

### Skill Shape and Official Sources

- Create only `agent-skills/wpm-review-package/SKILL.md`. The bounded workflow needs no script, reference,
  asset, host-specific metadata, or product implementation change.
- Stable identity is `wpm-review-package`. Its description should front-load reviewing a WPM work package for
  handoff, mention the read-only boundary, and exclude authoring/fixing and publication decisions.
- Codex native workspace placement is `.agents/skills/wpm-review-package/SKILL.md`, explicitly invoked as
  `$wpm-review-package`. Claude Code native project placement is `.claude/skills/wpm-review-package/SKILL.md`,
  explicitly invoked as `/wpm-review-package`. TASK-120 owns installation; this story proves identical portable
  bytes without touching real user scopes.
- Official sources rechecked on **2026-08-23**:
  - Codex Build skills guide: <https://learn.chatgpt.com/docs/build-skills>
  - Claude Code Extend Claude with skills: <https://code.claude.com/docs/en/skills>
- Official Codex helper source is
  `/home/agent/.codex/skills/.system/skill-creator/SKILL.md`, SHA-256
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`. Story-start hosts: Codex CLI
  `0.148.0`, Claude Code `2.1.158`, Node `v22.22.1`, npm `10.9.4`, Backlog.md `1.45.2`, TypeScript `6.0.3`,
  Vitest `4.1.7`, and Biome `2.4.16`.

Invoke the helper during implementation and record how its focused what/when description, smallest useful
instruction-only shape, explicit trigger/non-trigger tests, and forward-verifiable workflow influence the
asset. Deterministically prove both supported clients; run fresh live Codex only. Authenticated live Claude
parity remains the approved post-TASK-127 exact-revision gate and is neither invoked nor claimed here.

### Packaging and Testing

- Reuse the reviewed Story 2.2-2.4 skill tests and clean-package harness. Add the asset to the generic declared
  expected ship set; do not add an artifact-specific package inspector.
- RED first while the asset is absent. Tests should verify the finite categories and observable review
  relationships, not freeze incidental wording.
- Extend the clean synthetic-revision test to bind archive bytes to source, extract it, delete the source, and
  prove identical skill bytes at both native placements. Do not claim package-root discovery.
- Extend the real build band with symlink-preserving disposable-copy, original-snapshot, and planted-marker
  assertions. Keep archive format parity and avoid modifying the source workspace.
- Live Codex must resolve `wpm` only from the accepted installed tarball, never repository `dist`; the natural
  session reviews an intentionally defective disposable fixture and returns aggregate not-ready evidence while
  independent snapshots prove zero mutation.
- Run `quick_validate.py`, focused Vitest bands, typecheck, Biome, build, and `git diff --check`. The independent
  reviewer owns the one exact full `npm test` after stable product/test bytes.

### Previous Story and Git Intelligence

- Story 2.4 established portable identity, owning-registry authority, ordinary-file/path confinement,
  all-or-nothing aggregate preflight, dual-native planted non-leakage, and accepted-installed-runtime live-host
  evidence. Reuse those reviewed patterns rather than loosening or duplicating them.
- Baseline is `4c88bb09a4fe766e6c6f2cd9bd33f877d0a47231`; it contains the independently approved TASK-117 merge. The
  canonical `docs/00`-`docs/14` remain unchanged since the persistent preload revision.

### Expected File Boundaries

- New: `agent-skills/wpm-review-package/SKILL.md`, one focused unit test, this story, and TASK-118 QA summary.
- Modified only as needed: the existing clean-package and real-build non-leakage tests plus live sprint tracker.
- Do not change `src/`, CLI/domain/schema/template/dependency files, other skills, Backlog,
  `.bmad/sdlc-state.yaml`, planning artifacts, `AGENTS.md`, `docs/SDLC.md`, `.serena`, branch, commits, or merges.

### References

- [Source: backlog task TASK-118 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-25-Review-Work-Packages-with-wpm-review-package]
- [Source: _bmad-output/planning-artifacts/prd.md#Workspace-authoring-skills-integration-and-handoff]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-22.md]
- [Source: _bmad-output/implementation-artifacts/2-4-author-agent-skills-and-front-doors-with-wpm-author-skill.md]
- [Source: test/integration/distribution-preparation/package-preparation.test.ts]
- [Source: test/integration/cli.build.e2e.test.ts]
- [Source: https://learn.chatgpt.com/docs/build-skills]
- [Source: https://code.claude.com/docs/en/skills]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Keep the product change to one portable instruction-only skill, driven by current WPM read/build surfaces.
- Specify and test the finite seven-category result, aggregate findings, context-less simulations, strict
  no-write/publication boundary, and WPM convention-role distinctions.
- Extend the existing clean-package and generated-deliverable harnesses for exact source-free exposure,
  symlink-preserving disposable builds, planted non-leakage, and original-subject identity.
- Validate behavior with deterministic Codex/Claude native contracts and fresh accepted-tarball Codex sessions;
  retain live Claude parity for the approved final exact-revision gate.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolver found no workflow override,
  activation prepend/append step, completion hook, or matching project-context fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Its resolver found no workflow override, activation
  prepend/append step, completion hook, or project-context fact; the parent-authorized proportional policy
  replaced its generic full-suite step with the focused stable-diff band and left exact `npm test` to review.
- Official `skill-creator` was freshly invoked from the installed helper at SHA-256
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`. Its initializer established the
  portable directory, its smallest-useful-shape guidance removed generated host metadata, and its validator
  passed the final one-file skill.
- RED/GREEN: the absent-skill baseline failed all 12 initial unit checks; the first implementation passed
  12/12. A live semantic audit then exposed convention-role ambiguity; the new regression failed 1/13 before
  the WPM `bundle-template`, disabled-bundle, reserved installer/advisor, and native-alias distinctions were
  added, then passed 13/13.
- Current official sources were accessed on 2026-08-23. The official Codex changelog lists CLI `0.149.0`, while
  the evidence host remained `0.148.0`; current Claude documentation covers behavior through `2.1.218`, while
  the installed host remained `2.1.158`. No host, credential, or Claude-auth state was changed, and no live
  Claude inference was run.
- Literal `bmad-qa-generate-e2e-tests` was invoked in YOLO mode. Its resolver found no workflow override,
  activation prepend/append step, completion hook, or matching project-context fact. The acceptance audit found
  no uncovered executable seam after the semantic regression, so QA changed no product or test byte.

### Completion Notes List

- Create-story checklist verdict: PASS. All ten TASK-118 acceptance criteria are preserved verbatim; the
  package-author outcome, finite seven-category boundary, durable-input and aggregate-finding rules,
  context-less simulation, real disposable-copy build evidence, strict no-write/publication-authority
  boundary, exact package/non-leak contract, revised two-client/live-Codex DoD, and content-only implementation
  scope are actionable without adding product behavior.
- Added one portable `wpm-review-package` skill and focused tests only; no `src/`, CLI, domain, schema,
  dependency, or template surface changed. The finite review returns one stable seven-category readiness result,
  aggregates coherence findings, simulates fresh/evidenced-transition execution, and has no fix or publication
  authority.
- Exact clean synthetic revision `6777a68bd405d35edfbb2434c2e49f3b4d4437b1` produced accepted
  `wpm-0.1.0.tgz` (481,832 bytes; SHA-256
  `765b15d2d6ba84f833ed1e727d13d1c23778c96fda4b8289c7d7d21664ea8b65`). Final skill SHA-256
  `609e07bbe90b903f11e4db4d6c58079c30149973536e7983a840be1e40a73282` matched source, extracted archive,
  and installed package; the source was removed and both accepted bins resolved to installed `wpm/dist/cli.js`.
- Fresh isolated Codex `0.148.0` sessions passed workspace discovery, explicit `$wpm-review-package`, unnamed
  natural activation, unrelated non-trigger (`899`), and a representative aggregate `not-ready` outcome. The
  natural run used the accepted installed WPM, built only a symlink-preserving disposable copy, rejected the
  authoring skill/marker from the tarball, preserved bounded generated executor links, and proved the original
  314-entry snapshot plus pre-existing archive byte/link-identical.
- Stable focused gate: 4 files / 56 tests passed after formatting; official skill validator, typecheck, Biome,
  build, and `git diff --check` passed. Exact full `npm test` remains reviewer-owned.
- QA traced all ten acceptance criteria and reran the focused risk band: unit 13/13 and selected integration
  4/4 passed (39 unrelated cases skipped). The QA checklist passed and its summary is ready for independent
  review.

## File List

- `_bmad-output/implementation-artifacts/2-5-review-work-packages-with-wpm-review-package.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-118.md`
- `agent-skills/wpm-review-package/SKILL.md`
- `test/unit/agent-skills/wpm-review-package-skill.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/cli.build.e2e.test.ts`

## Senior Developer Review (AI)

### Review Outcome

**APPROVE — 0 open findings.** An independent replacement reviewer literally invoked
`bmad-story-automator-review` in auto-fix mode and audited all ten acceptance criteria against the durable
workspace, exact packed package, generated deliverables, and fresh-context executor evidence.

### Findings Resolved

- **HIGH — circular no-write evidence:** the prior test planted authoring markers in the reviewed original
  before taking its baseline. The corrected flow snapshots the pristine original first and injects exact native
  skill bytes plus the unique marker only into the symlink-preserving disposable copy.
- **HIGH — stale build evidence:** inherited build outputs could have been mistaken for evidence from the
  current review. The corrected flow removes copied builds, proves the expected selected-format output is
  absent, builds immediately, and inspects the resulting tar/Git/conditional-zip deliverables.
- **HIGH — source isolation and TOCTOU:** the prior flow did not prove copy equivalence, prevent source-Git
  ascent, or close the boundary after the build. The corrected flow compares the unmodified copy with the
  original byte/link baseline, proves Git discovery cannot resolve the source worktree, and rechecks the
  original workspace and pre-existing archive after every disposable-copy mutation and build.

### Acceptance and Gate Evidence

- Acceptance audit: **10/10 PASS**. The seven-category catalog is finite; inputs are durable and
  fresh-context; coherence findings aggregate affected artifacts/relationships; fresh and update simulations
  are both covered; readiness requires coherence, simulation, and fresh real-build agreement; authoring leaks
  block readiness; readiness is not publication authority; originals remain unchanged; the exact packed skill
  is portable across both native clients; and planted tar/Git/conditional-zip deliverables do not leak it.
- Focused/static gates: official skill validation, TASK-118 unit/integration bands,
  package-preparation/public-surface coverage, typecheck, Biome over 244 files, build, and diff check all passed.
- Stable full gate: exactly one `npm test` passed **124/124 files and 1555/1555 tests** in 548.90s. No
  product or test byte changed afterward.
- Exact source-free package: clean synthetic revision
  `9c1a8006a63b231543ec1c11e4eb33dead62e5b1`; accepted 433-entry, 482,148-byte archive SHA-256
  `f3bd57089f253ee0cb7ede64ef47f87ed6a14c98476648d001f1999e177b9284`; source, extracted, and installed
  skill SHA-256 `6d13b74090c40e60ff3888e47b9e9248032728c5a4eb3824aaef55af93e5aeb2`; both consumer bins resolved from
  installed `node_modules` after source removal.
- Fresh Codex `0.148.0` sessions passed workspace discovery, explicit invocation, natural activation with the
  corrected complete seven-category aggregate (`not-ready` for the intentionally defective fixture), and the
  unrelated `899` non-trigger. The review built only its isolated disposable copy, did not publish, and did
  not mutate host/auth/Claude state; live Claude remains deferred until after TASK-127.
- Stable product/test manifest aggregate SHA-256:
  `39b1b09fb0b7a7345d1161a96b99be5abca3770b1b7610c66d0e9591def91105`.

## Change Log

- 2026-08-23: Created Story 2.5 from TASK-118 with the literal create-story workflow and marked it ready for development.
- 2026-08-23: Implemented the read-only review skill, exact package/non-leak boundaries, and deterministic plus live-Codex evidence with literal dev-story; moved to review.
- 2026-08-23: Completed literal QA with 10/10 acceptance-criteria trace and no additional executable change;
  retained review status for independent review and its reviewer-owned full gate.
- 2026-08-23: Literal independent auto-fix review resolved three HIGH evidence defects, reached 0 open
  findings, passed focused/static/package/live-Codex evidence plus the one stable full gate, and marked the
  story done.
