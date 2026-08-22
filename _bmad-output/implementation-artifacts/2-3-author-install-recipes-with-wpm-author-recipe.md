---
baseline_commit: 92c734a0e32e91d72bc26ea6fddc973ea60dc2de
---

# Story 2.3: Author Install Recipes with `wpm-author-recipe`

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-116. -->

## Story

As a package author,
I want a focused `wpm-author-recipe` skill,
so that I can author an install backlog a fresh executor can run, verify, and resume without my conversation.

## Acceptance Criteria

1. Given `wpm-author-recipe` is invoked without a prior bootstrap conversation; when an author describes a new installation outcome; then the resulting install backlog expresses the required detect, setup, and verify work; and dependencies that affect execution order are explicit; and that install backlog remains the single recipe task source.
2. Given an existing recipe must support a newer version; when the skill completes the revision; then desired-state work expresses the current intended result; and one-time transition work is limited to the prior-version states for which it applies; and previously shipped migration history is not silently redefined.
3. Given a context-less executor runs or resumes the resulting recipe; when it evaluates a task for completion; then the task has observable acceptance outcomes; and every required receipt fact is completion-gated; and completed work can be distinguished without relying on the authoring conversation.
4. Given a recipe lacks required verification, contains ambiguous state or migration work, or has unresolved or cyclic dependencies; when its authoring outcome is assessed; then every discoverable blocker is identified; and the recipe is not presented as ready.
5. The exact packed WPM package exposes `wpm-author-recipe` independently without repository-relative resources.
6. Generated work-package deliverables contain no copy of the `wpm-author-recipe` workspace-authoring skill.

## Tasks / Subtasks

- [x] Author one portable, self-contained recipe skill with the current official helper (AC: 1-4)
  - [x] Invoke the installed official Codex `skill-creator`; retain only the smallest portable skill structure
        needed by both Codex and Claude Code and give it a focused recipe-authoring trigger.
  - [x] Guide an author from a stated installation outcome to an explicit detect/setup/verify task graph in the
        bundle's one install backlog, using current Backlog.md task surfaces rather than a WPM task mirror.
  - [x] Keep desired-state work idempotent and current; add one-time migrations only for explicit prior-state
        transitions and preserve immutable shipped migration history.
  - [x] Require observable acceptance outcomes and completion-gated receipt facts without writing an install
        receipt during authoring.
  - [x] Assess all discoverable missing verification, ambiguous kind/version/gate, unresolved dependency, and
        cycle blockers together before calling the recipe ready.
- [x] Add focused deterministic recipe-authoring evidence (AC: 1-4)
  - [x] Cover new outcomes, revisions, receipt gates, explicit execution-order dependencies, context-less
        resume, and aggregate blocked results without introducing CLI or domain code.
  - [x] Prove focused discovery and explicit identity for Codex and Claude Code native workspace paths, plus
        natural trigger and unrelated non-trigger behavior from the same portable bytes.
- [x] Prove the package and generated-deliverable boundaries (AC: 5-6)
  - [x] Inspect and extract an exact clean-revision npm archive, delete the source checkout, and prove the
        self-contained skill remains readable from both supported native workspace placements.
  - [x] Build representative tar, Git, and conditional zip deliverables and reject both the skill path and a
        unique skill-content marker from every generated artifact.
  - [x] Record current helper/host/source evidence and fresh live Codex discovery, explicit invocation, unnamed
        activation, unrelated non-trigger, and observable recipe outcome; leave authenticated live Claude
        behavioral parity to the approved post-TASK-127 exact-revision gate.
- [x] Run proportional quality gates (AC: 1-6)
  - [x] Run the official skill validator, focused Vitest unit/integration/package/non-leakage bands, typecheck,
        repository-wide Biome, build, and diff checks; reserve the exact full `npm test` for independent review.

## Dev Notes

### Goal and Boundary

This story adds one packaged knowledge surface, not a recipe engine. The skill teaches the user's authoring
agent to write and revise the existing per-bundle Backlog.md recipe using the currently installed `backlog`
CLI. It must not add a WPM command, core operation, schema, adapter, alternate task store, or receipt writer.

The skill is independently usable when a user asks to create or revise installation recipe tasks. It owns:

- decomposition of a requested installation outcome into detect, setup, and verify work;
- current desired state versus prior-state-gated one-time migration work;
- externally observable acceptance outcomes;
- execution-order dependency declarations and cycle/unresolved-dependency assessment; and
- the receipt facts each task must gate before a recipient's executor can mark it Done.

It does not own bundle metadata or lifecycle, payload and skill/front-door content, whole-package review,
workspace integration, or template task-generation behavior. Leave those boundaries to `wpm-author-bundle`,
`wpm-author-skill`, `wpm-review-package`, and their later stories. Do not turn this skill into a general WPM
orientation surface.

### Existing Product and Backlog Surfaces

- A bundle created by WPM has a relative `backlog -> install-backlog` alias. Run Backlog.md from
  `wip/bundles/<id>` so the bundle's `install-backlog/` remains the single recipe task source. Never hand-edit
  files under that backlog and never create an authoring-side shadow recipe.
- Verification host Backlog.md is `1.45.2`. Its current task authoring surface includes `backlog task create`
  with `--description`, repeatable `--ac`, repeatable `--dod`, `--no-dod-defaults`, `-l/--labels`,
  `-m/--milestone`, `--dep/--depends-on`, `--ref`, `--notes`, and `--plain`; `backlog task edit` provides the
  corresponding supported revision/checklist fields. Inspect live `--help` before exact invocation rather than
  copying an older command example.
- Each recipe task carries one immutable `step:<slug>` identity label, one immutable `kind:state` or
  `kind:migration` label, and the applicable bundle-version milestone. Use one comma-separated label argument;
  repeated label options do not accumulate. Dependencies are task IDs, not step slugs, so resolve the IDs from
  a plain task listing before creating or revising an edge.
- `kind:state` expresses the current idempotent desired result. Re-running it detects and reconciles drift.
  A `kind:migration` is justified only by an explicit transition from prior installed states; its applicability
  is an observable from-version condition in the task contract. Once shipped, preserve its meaning and fix
  forward with a new migration rather than silently editing history.
- Acceptance criteria describe observable outcomes, not implementation steps. A context-less executor uses
  them to detect already-satisfied state and to verify work regardless of the machine-specific method it chose.
- `install-backlog/config.yml` provides the default Definition of Done. Keep its receipt gates aligned with
  the facts a task can erase while acting: verified effect, file references/checksums, ownership, inverse
  operation, pinned decisions, and non-file effects. Add task-specific `--dod` only when needed; use
  `--no-dod-defaults` only when the task genuinely creates no reversible or non-recoverable fact and that choice
  is explicit. The author defines these gates but never fills the receipt; only the target-side executor writes
  per-environment `--ref`, notes, decisions, and completion evidence at install time.

### Authoring and Readiness Flow

For a new or revised recipe, keep the result inspectable rather than ceremonial:

1. Validate that the workspace and bundle recipe root are the intended boundary; do not auto-initialize or
   infer another bundle.
2. Elicit the outcome, prerequisites, machine variance, observable success, confirmation/trust constraints,
   and non-recoverable facts. Surface missing author decisions instead of inventing them.
3. Model the current desired state with enough `kind:state` tasks to make detect, setup, and verify explicit.
   These are concerns in the task graph, not a requirement for brittle procedural shell steps.
4. For a version revision, compare intended state with the preserved prior recipe/receipt contract. Revise state
   tasks to the new desired result; add an immutable migration only for a genuine prior-state transition and
   state its exact prior-version applicability.
5. Declare every ordering relationship as a Backlog dependency. Resolve the full graph before mutation where
   possible; do not rely on prose order. Detect self-dependencies, cycles, missing targets, and incompatible
   or ambiguous ordering.
6. Re-read the resulting task graph as a fresh executor. Each task must say what can be observed, establish its
   prerequisites through dependencies, and carry the applicable completion gates. A separate verify outcome
   must establish bundle readiness and confirm the receipt evidence it depends on.
7. Report resolved task changes, unresolved author choices, and every discoverable blocker. `ready` is allowed
   only when the detect/setup/verify shape, state/migration semantics, graph, acceptance outcomes, and receipt
   gates are coherent. Successful individual edits remain truthful even when the overall result is blocked.

Do not make authoring receipts look like sample output, write install-time environment observations into the
shipped recipe, redefine a migration that recipients may already have applied, or say task file order is an
execution dependency. Never reduce the detect/setup/verify requirement to titles alone: readiness rests on the
observable task contracts and graph.

### Skill Shape and Official Sources

- Create only `agent-skills/wpm-author-recipe/SKILL.md`. A single self-contained file is preferred because this
  focused job does not need scripts, references, assets, or host-specific metadata.
- Stable identity is `wpm-author-recipe`. Its description should state both what it does and when to use it,
  and exclude bundle planning, agent-skill/front-door authoring, and package review so unrelated requests do not
  load it.
- Codex native workspace placement is `.agents/skills/wpm-author-recipe/SKILL.md`, with explicit
  `$wpm-author-recipe` invocation. Claude Code native project placement is
  `.claude/skills/wpm-author-recipe/SKILL.md`, with explicit `/wpm-author-recipe` invocation. Story 2.7 owns
  materialising those destinations; this story proves identical portable bytes at each path without writing
  either real user scope.
- Current official sources rechecked on **2026-08-22**:
  - Codex Build skills guide: <https://learn.chatgpt.com/docs/build-skills>
  - Claude Code Extend Claude with skills: <https://code.claude.com/docs/en/skills>
  - Anthropic skill-authoring best practices:
    <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Official Codex helper source:
  `/home/agent/.codex/skills/.system/skill-creator/SKILL.md`, SHA-256
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`. Verification hosts at story start:
  Codex CLI `0.148.0`, Claude Code `2.1.158`, Node `v22.22.1`, npm `10.9.4`, TypeScript `6.0.3`, Vitest `4.1.7`,
  and Biome `2.4.16`.

Invoke the current official helper during implementation and record how its focused job, trigger, concision,
progressive-disclosure, and forward-evaluation guidance affected the asset. Deterministic tests must prove both
supported native contracts without freezing volatile documentation prose. Run fresh live Codex sessions only;
do not invoke or retry live Claude. Authenticated live Claude behavior is explicitly consolidated after
TASK-127 against one exact final packed revision and must not be claimed by this story.

### Architecture, Packaging, and Testing

- `agent-skills/` is already in `package.json.files`; the generic declared ship-set from Stories 1.1-1.2 must
  include this required asset without an artifact-type-specific inspector. Extend only the expected ship-set
  and existing package evidence needed for the new asset.
- Follow Story 2.2's focused unit-test shape for strict frontmatter, complete content boundaries, trigger and
  non-trigger language, current Backlog surfaces, and absence of checkout-specific links or resources.
- Extend the existing clean synthetic-revision package test to bind the archive entry to the source bytes,
  extract it, delete the copied source checkout, and re-read the complete asset. Exercise both native paths from
  those extracted bytes; do not claim package-root discovery that Story 2.7 owns.
- Strengthen the existing real tar/Git/conditional-zip non-leakage journey with the new native skill path and a
  unique marker that first exists in the authoring workspace. Reject both path and marker in generated
  deliverables so the proof is non-vacuous.
- RED first. Run the new focused unit band while the asset is absent, then turn it GREEN through the skill
  bytes. Run the official `quick_validate.py`, focused skill/package/build tests, typecheck, repository-wide
  Biome, build, and `git diff --check`. The independent reviewer owns the one exact full `npm test` on stable
  product/test bytes.
- No `src/`, dependency, template, front-door, manifest-target, or Backlog product change is expected. If the
  existing surfaces cannot express an AC, surface that as a blocker rather than expanding the story.

### Previous Story and Git Intelligence

- Story 2.2 established the one-file portable skill pattern, focused what/when descriptions, exact clean-pack
  byte binding, source-deletion proof, deterministic Codex/Claude native fixtures, live Codex evidence, and
  non-vacuous generated-deliverable non-leakage. Reuse those harnesses and reviewer hardening; do not duplicate
  bundle decisions in this skill.
- The approved 2026-08-22 Correct Course proposal keeps deterministic Claude compatibility per skill while
  deferring only authenticated live Claude behavior to the final exact-revision gate. Preserve that boundary
  explicitly in story and QA evidence.
- Baseline is `92c734a0e32e91d72bc26ea6fddc973ea60dc2de`. No file in canonical `docs/00`-`docs/14` changed since the
  persistent preload revision `5d1c08aaa03be0211274936cfa3715a4a962be2f`.

### Expected File Boundaries

- New: `agent-skills/wpm-author-recipe/SKILL.md`, one focused unit/acceptance test, and the TASK-116 QA summary.
- Modified only as needed: existing package-preparation and real-build non-leakage tests, this story, and the
  live sprint tracker.
- Do not change executable product code, templates, package metadata, dependencies, other skills, Backlog,
  `.bmad/sdlc-state.yaml`, planning artifacts, `AGENTS.md`, `docs/SDLC.md`, `.serena`, branch, commits, or merges.

### References

- [Source: backlog task TASK-116 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-23-Author-Install-Recipes-with-wpm-author-recipe]
- [Source: _bmad-output/planning-artifacts/prd.md#Workspace-authoring-skills-integration-and-handoff]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-21-final.md]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-22.md]
- [Source: _bmad-output/implementation-artifacts/2-2-plan-and-change-bundles-with-wpm-author-bundle.md]
- [Source: agent-skills/installer-builder/references/conventions.md]
- [Source: agent-skills/installer-builder/references/quality-protocol.md]
- [Source: agent-skills/installer-builder/references/task-conventions.md]
- [Source: https://learn.chatgpt.com/docs/build-skills]
- [Source: https://code.claude.com/docs/en/skills]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. The customization resolver found no workflow override,
  prepend/append activation steps, or completion hook; its `file:{project-root}/**/project-context.md`
  persistent fact matched no file.
- Literal `bmad-dev-story` invoked in YOLO mode with the same no-override/no-hook resolver result. The official
  Codex `skill-creator` was then invoked directly from
  `/home/agent/.codex/skills/.system/skill-creator/SKILL.md`; helper SHA-256 was
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`. Its focused what/when description,
  concise one-file structure, absence of unused resources/UI metadata, and forward-evaluation guidance shaped
  the asset. `quick_validate.py` reported `Skill is valid!`.
- RED: the focused recipe-skill unit file failed all 10 tests while the asset was absent. GREEN: the new file
  passed 10/10, and the combined bundle/recipe skill band passed 19/19.
- Final accepted-package evidence used clean synthetic revision `9e06a5b70b400c31213652b37191a95c26d385fa`
  and produced `wpm-0.1.0.tgz` with 431 entries, size 474013 bytes, and SHA-256
  `7850b514741225a1415ddb1378a93b490fac8f1f47cbc08af6de6aaf699adcc2`. Extracted recipe-skill SHA-256 was
  `0cc30eaf3678784dd84ef7c0352a148bf5c1e9ba4efe0d58be6b88a7ad93ad4d`; the copied source was deleted and
  identical bytes remained readable at deterministic `.agents/skills/` and `.claude/skills/` placements.
- Final live Codex `0.148.0` evidence ran from the accepted tarball's installed WPM `0.1.0` runtime, never repo
  `dist`. Discovery named `wpm-author-recipe`, `$wpm-author-recipe`, `/wpm-author-recipe`, and its focused
  trigger without writes. Explicit invocation with insufficient facts returned one aggregate `blocked` result
  without writes. An unnamed, fully specified request on Backlog.md `1.45.2` selected the skill and produced a
  `ready` three-task detect -> setup -> verify recipe with explicit dependencies, milestone `0.1.0`, observable
  command/semver outcomes, adaptive adoption/setup, independent verification, six unchanged receipt gates,
  all tasks and checklists untouched at `To Do`, and no authoring receipt. Its graph appeared correctly as one
  task in each of three successive dependency stages. The only incidental extra delta was Backlog's semantic
  config normalization in the disposable host. A fresh unrelated session returned only `667`, invoked no
  tools, and preserved the read-only host exactly.
- A focused real-package run initially hit host `ENOSPC` during `npm ci`. The reviewer used npm's supported
  cache cleanup, retained the accepted archive and evidence, and the corrected single rerun passed 1/1. This
  was an environment-capacity failure, not a product assertion.
- Final dev gates: official validator PASS; combined focused skill tests 19/19; exact clean-package integration
  1/1 (5 skipped); public packaged-skill surface 1/1 (10 skipped); real tar/Git/conditional-zip non-leakage 1/1
  (24 skipped); `npm run typecheck`, repository-wide `npm run lint`, `npm run build`, and `git diff --check`
  PASS. The exact full `npm test` remains reserved for the independent reviewer.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its resolver found no override, activation step, or
  completion hook; the declared project-context glob matched no file. QA audited AC 1-6, found no remaining
  executable coverage gap, and changed no product/test byte. Its combined package/public-surface/non-leakage
  band passed 3/3 across 3 files (39 unrelated cases skipped), and the focused skill band passed 19/19.

### Completion Notes List

- Create-story checklist verdict: PASS. All six TASK-116 acceptance criteria are preserved verbatim, the
  actor/outcome and content-only boundary are explicit, current Backlog 1.45.2 surfaces are verified, and every
  source/architecture/testing/package/native-host constraint needed for implementation is present without
  absorbing bundle, skill/front-door, review, workspace-integration, template-task, or product-CLI scope.
- Official Codex and Anthropic sources were refreshed on 2026-08-22. No source, dependency, or contract blocker
  was found. Authenticated live Claude behavior remains intentionally deferred under the approved correction.
- Implemented one self-contained `wpm-author-recipe` knowledge surface with no CLI, core, adapter, schema,
  template, dependency, or manifest-target change. It keeps the install backlog authoritative, makes
  detect/setup/verify and dependency order explicit, separates idempotent state from prior-gated immutable
  migrations, gates receipt facts without authoring them, and aggregates readiness blockers.
- Exact clean-pack/source-deletion, deterministic Codex/Claude native placement, fresh live Codex
  discovery/explicit/natural/non-trigger, and non-vacuous tar/Git/conditional-zip path-and-content non-leakage
  evidence satisfy the revised Story 2.3 contract. No live Claude inference was attempted or claimed.
- QA verdict: PASS / READY FOR INDEPENDENT REVIEW. Stable product/test aggregate SHA-256 is
  `168b95390c543bff4ecb8687fc8760c89f81ba00d28b71daf3a5389295a92b54`; independent review approved with
  zero open findings.

### File List

- `_bmad-output/implementation-artifacts/2-3-author-install-recipes-with-wpm-author-recipe.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-116.md`
- `agent-skills/wpm-author-recipe/SKILL.md`
- `test/unit/agent-skills/wpm-author-recipe-skill.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/cli.build.e2e.test.ts`

### Change Log

- 2026-08-22: Created Story 2.3 from TASK-116 with the literal create-story workflow and marked it ready for
  development.
- 2026-08-22: Invoked the literal dev-story workflow and official skill-creator, implemented the portable
  recipe-authoring skill, added deterministic/package/non-leakage automation, completed fresh live Codex
  evidence, and moved the story to review.
- 2026-08-22: Invoked the literal QA workflow, audited all six ACs, reran the focused acceptance band, and
  recorded a PASS / READY FOR INDEPENDENT REVIEW verdict without changing product/test bytes.
- 2026-08-22: Invoked the literal `bmad-story-automator-review` workflow in auto-fix mode, resolved six
  findings, completed the stable focused/static/package and full gates, and approved Story 2.3 with zero open
  findings.

## Senior Developer Review (AI)

### Workflow and Verdict

- Literal skill: `bmad-story-automator-review`, automatic-fix mode, review cycle 1.
- Customization resolver: no `customize.toml`, workflow override, activation prepend/append step, persistent
  context match, or completion hook; the installed default workflow ran directly.
- Verdict: **APPROVE**. All six acceptance criteria and the revised deterministic two-client/live-Codex DoD
  are satisfied; authenticated live Claude remains correctly deferred to the post-TASK-127 final gate.
- Open findings: **0**.

### Findings Resolved

1. **HIGH — authoritative recipe boundary:** detached or copied Windows/platform `backlog` fallbacks could
   write a shadow recipe. The skill now requires canonical `backlog`/`install-backlog` directory identity and
   blocks rather than falling back.
2. **MEDIUM — current Backlog 1.45.2 contract:** discovery/config/edit semantics were incomplete. The skill now
   verifies the exact WPM and Backlog read surfaces, reads configured DoD, documents the unsupported config-set
   boundary, and uses only supported mutation surfaces.
3. **HIGH — recipe versus receipt:** authoring could leave tasks/checklists completed or write target-machine
   evidence. The contract now requires shipped tasks to remain `To Do`, all AC/DoD checks unchecked, and no
   status/notes/summary/per-machine receipt mutation.
4. **MEDIUM — non-empty completion gate:** `--no-dod-defaults` could produce a task with no DoD. It now requires
   explicit reduced, repeatable `--dod` gates including effect verification and never permits an empty DoD.
5. **HIGH — safe revision and graph interpretation:** repeated acceptance-criteria replacement, shortened task
   IDs, dependency-stage misreading, or an injected editor could corrupt managed state. The skill now removes
   criteria by descending index before appending the complete set, preserves exact IDs/case, explains sequence
   stages, re-reads results, and forbids bare editors and `EDITOR` rewrite scripts.
6. **MEDIUM — non-vacuous package evidence:** the package test could overwrite the tarball with Git output
   before reading its content. It now extracts and checks tar bytes before that overwrite, retaining independent
   tar/Git/conditional-zip path-and-marker evidence.

The review also records one safe-process deviation: an exploratory Backlog mutation command was initially run
from the repository instead of its intended temporary directory and created only untracked TASK-128. Root
removed that exact CLI-created file because Backlog 1.45.2 exposes no delete command; `backlog task TASK-128
--plain` then returned not found. No tracked Backlog byte was changed, and all later mutation probes used an
explicit disposable working directory. An early disposable natural-language run also misread sequence-stage
headings and attempted an editor-driven rewrite; it was interrupted and directly motivated finding 5's
hardening. The accepted final evidence supersedes that run.

### Final Evidence

- Final product/test aggregate SHA-256:
  `168b95390c543bff4ecb8687fc8760c89f81ba00d28b71daf3a5389295a92b54`.
- Exact accepted archive: clean revision `9e06a5b70b400c31213652b37191a95c26d385fa`, 431 entries, 474013
  bytes, SHA-256 `7850b514741225a1415ddb1378a93b490fac8f1f47cbc08af6de6aaf699adcc2`;
  source/extracted/installed skill SHA-256
  `0cc30eaf3678784dd84ef7c0352a148bf5c1e9ba4efe0d58be6b88a7ad93ad4d`.
- Source-free Codex: discovery, aggregate explicit blocked/no-write, unnamed natural ready outcome, and unrelated
  non-trigger all passed against installed WPM `0.1.0`, Backlog.md `1.45.2`, and Codex `0.148.0`. The natural
  result was exactly detect -> setup -> verify, three state tasks, no migration, no completed checks or receipt
  facts, six receipt defaults, and a green `wpm build dry-run`.
- Focused/static gates: official validator PASS; unit 19/19; exact package 1/1; packaged public-surface nonleak
  1/1; generated tar/Git/conditional-zip nonleak 1/1; build, typecheck, Biome over 242 files, and diff-check PASS.
- Exact full stable-diff gate: `npm test` PASS, **122/122 files and 1526/1526 tests**, 568.82s.
