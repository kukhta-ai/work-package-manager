---
baseline_commit: f169979d2638354172f31eb0a1121addb01f6730
---

# Story 2.2: Plan and Change Bundles with `wpm-author-bundle`

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-115. -->

## Story

As a package author,
I want a focused `wpm-author-bundle` skill,
so that I can plan or change one bundle without loading unrelated authoring guidance.

## Acceptance Criteria

1. Given `wpm-author-bundle` is invoked without a prior bootstrap conversation; when a bundle's capability boundary is incomplete or ambiguous; then what belongs in that bundle, what is an external dependency, and what remains a separate capability are explicit; and unresolved author decisions are surfaced rather than invented.
2. Given the boundary of a new or existing bundle is agreed; when the skill completes the requested bundle work; then the bundle's stated purpose and lifecycle state are represented in WPM-managed project state; and each required metadata value, declared dependency, and payload registration either resolves through that state or is reported as unresolved; and no unresolved bundle-level concern is reported as complete.
3. Given the work also requires recipe authoring, skill or front-door authoring, or whole-package review; when `wpm-author-bundle` reaches that boundary; then it leaves the distinct work explicitly pending without claiming to have completed it; and its bundle-level result remains independently usable.
4. Given the workspace, bundle identity, or requested dependency is invalid or conflicting; when the skill evaluates the requested bundle work; then the blocking condition and affected boundary are identified; and no successful bundle result is claimed.
5. The exact packed WPM package exposes `wpm-author-bundle` independently without repository-relative resources.
6. Generated work-package deliverables contain no copy of the `wpm-author-bundle` workspace-authoring skill.

## Tasks / Subtasks

- [x] Author one portable workspace skill with the current official helper (AC: 1-4)
  - [x] Invoke the installed official Codex `skill-creator`; retain only the smallest portable skill structure
        needed by both Codex and Claude Code, with a focused `wpm-author-bundle` discovery description.
  - [x] Make the skill usable without hidden bootstrap context: establish one bundle's belongs/dependency/
        separate-capability boundary, ask only for unresolved author decisions, and refuse to invent them.
  - [x] Drive existing WPM bundle inspection and mutation surfaces for purpose/metadata, dependencies, payload
        registration, and lifecycle; report resolved, unresolved, blocked, and explicitly pending boundaries.
  - [x] Leave recipe content, authored skills/front doors, and whole-package review to Stories 2.3-2.5 while
        retaining an independently usable bundle result.
- [x] Add focused structural and behavioral evidence (AC: 1-4)
  - [x] Verify valid frontmatter, concise instructions, independent invocation, natural-language activation,
        and non-activation for unrelated work without adding a new CLI command or domain subsystem.
  - [x] Cover ambiguous boundaries, agreed new/existing bundles, unresolved fields, invalid workspace/identity/
        dependency input, and the three specialist handoff boundaries.
- [x] Prove both distribution boundaries and the corrected per-story supported-host contract (AC: 5-6)
  - [x] Inspect the exact npm-packed archive for the complete self-contained skill and run it without any
        repository-relative resource.
  - [x] Build a representative work-package deliverable and prove the workspace-authoring skill is absent.
  - [x] Record helper/host versions and current official sources; deterministic Codex and Claude Code native
        paths, frontmatter, discovery/explicit identity, trigger/non-trigger contract, and source-free
        portability; and fresh live Codex discovery, explicit invocation, natural-language trigger,
        non-trigger, and observable bundle outcome. Preserve Claude discovery and authentication diagnostics
        without claiming final live Claude parity, which belongs to the post-TASK-127 exact-revision gate.
- [x] Run proportional quality gates (AC: 1-6)
  - [x] Run focused Vitest, official skill validation, typecheck, repository-wide Biome, build, pack, and
        generated-deliverable non-leakage checks; reserve the exact full `npm test` for independent review.

## Dev Notes

### Goal and Boundary

This story adds one packaged authoring knowledge surface, not new product behavior. The skill teaches an agent
to use WPM's existing bundle commands and WPM-managed YAML/state correctly. If an existing command cannot
represent the requested state, that is an unresolved or blocked outcome—not authorization to add a command,
schema, task engine, or parallel state file.

The bundle is the unit of capability and lifecycle. The skill should distinguish:

- what the bundle itself delivers;
- external bundle dependencies represented by `requires`;
- payload registrations represented by the existing files/templates/scripts/skills families; and
- separate recipe, agent-skill/front-door, and package-review work that stays pending.

Do not turn this into a form or a mandatory multi-step ceremony. Ask only for choices whose absence changes the
bundle boundary or makes WPM-managed state incomplete. Never claim a complete bundle result while a bundle-level
purpose, lifecycle decision, dependency, metadata value, or requested payload registration remains unresolved.

### Existing Product Surfaces to Drive

- Project/workspace validation and bundle inspection already exist. Use `wpm project validate`,
  `wpm bundle list`, `wpm bundle <id> show`, and focused family `list` commands to understand current state.
- Structure and mutations already exist through `wpm bundle new|enable|disable|remove`, `bundle <id> meta`,
  `version`, `requires`, `files`, `templates`, `scripts`, `skills`, `installer-skills`, and `advisor` commands.
  Read each leaf's current `--help` before giving exact syntax; do not bypass WPM by hand-editing its YAML.
- Content remains agent-authored at the paths WPM scaffolds or registers. This skill may identify required
  recipe/skill/advisor content as pending, but Stories 2.3 and 2.4 own how that content is authored.
- Backlog.md persists authoring tasks and must only be operated through its CLI. This specialist does not add
  template task-generation behavior (Epic 3) or claim whole-package readiness (Story 2.5).

### Skill Shape and Discovery Contract

- Create `agent-skills/wpm-author-bundle/SKILL.md` as an independently packaged, portable skill. Prefer no
  references, scripts, assets, UI metadata, or host-specific wrapper unless the official helper demonstrates a
  concrete need. A single self-contained file best matches this focused job.
- Use the stable name `wpm-author-bundle`. Its description must say what it does and when it should activate,
  while excluding recipe authoring, skill/front-door authoring, general package review, and unrelated coding.
- Keep instructions host-neutral. Do not embed absolute paths, repository-relative resources, current checkout
  paths, credentials, agent launch behavior, BMAD workflow details, or deliverable-target inference.
- Codex discovers workspace skills from `.agents/skills`; Claude Code discovers project skills from
  `.claude/skills`. Story 2.7 owns materialising/reconciling this packaged asset into those destinations. This
  story proves the asset itself; it must not mutate either client scope or front door.

### Current Official Authoring Facts (accessed 2026-08-22)

- Official Codex helper: `/home/agent/.codex/skills/.system/skill-creator/SKILL.md`, SHA-256
  `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`, invoked from Codex CLI
  `0.148.0`. It favors one focused job, concise non-obvious instructions, precise discovery, and supporting
  resources only when they provide real deterministic or progressive-disclosure value.
- Codex skill authoring/discovery: <https://learn.chatgpt.com/docs/build-skills>. A skill is a directory with
  `SKILL.md`; `name` and `description` drive explicit and implicit use; repository skills use
  `.agents/skills`; `$skill-creator` is the official authoring helper.
- Claude Code skill authoring/discovery: <https://code.claude.com/docs/en/slash-commands>. Project skills use
  `.claude/skills/<name>/SKILL.md`; the directory name supplies explicit `/name` invocation and the description
  supports automatic discovery. Current verification host: Claude Code `2.1.158`.
- Anthropic skill design guidance:
  <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices> and official helper source
  <https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md>.
  Keep the name portable, describe both what and when, minimize context, and test real activation behavior.

Record final helper/host versions, current official sources, deterministic two-platform native compatibility,
and fresh live Codex evidence in the story and QA summary. Preserve truthful Claude discovery and diagnostics
without claiming authenticated behavioral parity; the approved final cold gate owns that evidence for all six
skills against the exact final packed revision. Tests should assert the stable contract, not copy volatile
documentation prose.

### Architecture, Packaging, and Reuse

- `agent-skills/` is the package-owned asset root already included by `package.json.files`. The generic
  revision-scoped ship-set and package-boundary machinery from Stories 1.1-1.2 should include the new skill
  without adding an artifact-type special case or per-skill inspector.
- Reuse the existing skill tests' YAML/frontmatter parsing and markdown/link checks where useful. Add a focused
  test file rather than broadening the legacy `installer-builder` skill's meaning.
- Build/package tests must inspect the produced archive, not the source tree alone. Extract or install the
  exact archive into an isolated root and show the skill needs no missing repo resource.
- Generated work-package builds select authored project content from `wip/`; package-owned workspace skills
  must remain absent from zip, tarball, and git deliverables. Extend the smallest existing real build harness
  that proves this boundary rather than creating another build implementation.
- No `src/core` change is expected. If executable behavior genuinely must change, stop and surface the
  boundary because that would exceed this story's approved knowledge-asset scope.

### Previous Story and Git Intelligence

- Story 2.1 established stable authoring-client IDs and native workspace destinations/front doors. Detection is
  advisory and never means installed or configured; authoring clients remain independent of
  `manifest.yml.targets`. Reuse that contract later—do not duplicate, mutate, or infer client selection here.
- Reviewer hardening in Story 2.1 favors closed schemas, immutable catalogs, absolute-path-safe observations,
  escaped human output, and explicit no-write proofs. For this content-only story, apply the analogous lessons:
  focused boundaries, explicit negative states, no implicit success, and source/archive/deliverable evidence.
- Current baseline is `f169979d2638354172f31eb0a1121addb01f6730`. No `docs/00`-`docs/14` file changed since
  persistent preload revision `5d1c08aaa03be0211274936cfa3715a4a962be2f`.
- Current stack remains Node `>=20` (verification host `v22.22.1`), TypeScript `6.0.3`, Vitest `4.1.7`, and
  Biome `2.4.16`. Add no dependency.

### Testing Requirements

- RED first: a focused test should fail because `agent-skills/wpm-author-bundle/SKILL.md` is absent. Cover
  frontmatter identity/description, portability, required bundle concerns, separate pending boundaries, and
  explicit blocked/unresolved/no-success wording without brittle full-prose snapshots.
- Use deterministic isolated native-path fixtures for Codex and Claude Code to prove frontmatter, discovery and
  explicit-invocation identity, trigger/non-trigger contract, and source-free portability. Fresh live Codex
  evidence must distinguish discovery, explicit invocation, natural-language activation, unrelated non-trigger,
  and an observable WPM-managed result or verified no-write state. Authenticated live Claude behavioral parity
  is consolidated after TASK-127 against the exact final packed revision and is not a TASK-115 completion gate.
- Pack/build after the asset lands. Verify the exact tar entry and extracted content; remove or avoid access to
  the repository source before host execution. Verify a representative generated deliverable contains no
  `wpm-author-bundle` path or content marker.
- Run focused unit/integration/package bands while bytes move. The independent reviewer owns one exact full
  `npm test` after the product/test hash is stable.

### Expected File Boundaries

- New: `agent-skills/wpm-author-bundle/SKILL.md`, a focused unit/acceptance test, and TASK-115 QA summary.
- Modified only if required: the smallest existing package/archive or real-build integration test, this story,
  and the live sprint tracker.
- Do not change product CLI/domain code, templates, generated front doors, recipes, other skills, package
  metadata, dependencies, Backlog, SDLC state, contributor instructions, canonical docs, `.serena`, branch,
  commits, or merges.

### References

- [Source: backlog task TASK-115 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-22-Plan-and-Change-Bundles-with-wpm-author-bundle]
- [Source: _bmad-output/planning-artifacts/prd.md#Workspace-authoring-skills-integration-and-handoff]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Architectural-Boundaries]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-work-package-manager-2026-08-20/validation-report.md#Recommended-experience]
- [Source: _bmad-output/implementation-artifacts/2-1-establish-the-codex-and-claude-code-authoring-client-contract.md]
- [Source: https://learn.chatgpt.com/docs/build-skills]
- [Source: https://code.claude.com/docs/en/slash-commands]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Debug Log References

- Literal `bmad-create-story` run in YOLO mode; customization resolved persistent fact
  `file:{project-root}/**/project-context.md` with no matching files and no prepend/append/on-complete hooks.
- Literal `bmad-dev-story` run in YOLO mode with the same empty prepend/append/on-complete hooks and no matching
  project-context fact. RED was **7/7 failing** because the skill did not exist; the focused structural suite
  became **9/9 green** after the asset and reviewer-truth cases landed.
- The official Codex `skill-creator` was invoked literally with
  `init_skill.py wpm-author-bundle --path agent-skills`; `quick_validate.py` passes. Its guidance kept the
  result to one precise, self-contained `SKILL.md` with explicit what/when discovery and forward tests; the
  generated optional UI metadata was intentionally omitted because it provided no portable runtime value.
- Literal `bmad-qa-generate-e2e-tests` ran in YOLO mode. Its resolver found no activation hooks, no matching
  project-context fact, and an empty completion hook. Detailed acceptance and host evidence is in
  `tests/test-summary-task-115.md`.
- Literal `bmad-dev-story` resumed in review-continuation mode after the user-approved Moderate Direct
  Adjustment in `sprint-change-proposal-2026-08-22.md`. Its resolver again found no activation hooks, no
  matching project-context fact, and an empty completion hook. The revised contract exposed no executable or
  test gap, so this continuation changed evidence/status only and did not rerun the QA-generation workflow.

### Completion Notes List

- Create-story checklist verdict: PASS. The six TASK-115 acceptance criteria are preserved verbatim; the story
  defines one concise portable skill, existing-command-only implementation, explicit unresolved/blocked/
  pending outcomes, official-helper evidence, exact-pack availability, and generated-deliverable non-leakage
  without absorbing recipe, skill/front-door, review, integration, or template-task scope.
- Discovery used the approved Epic 2, PRD, architecture addendum, UX validation, unchanged design preload,
  final Story 2.1 implementation/review evidence, and current official OpenAI/Anthropic sources accessed
  2026-08-22. No missing source or scope blocker was found.
- The skill makes author agreement explicit instead of treating scaffold defaults as decisions, keeps
  lifecycle changes deliberate, never bypasses removal confirmation, requires enabled dependencies plus an
  explicit range, and distinguishes delivered payload from non-delivered scripts and helpers. Reviewer
  hardening makes dependency-cycle checks pre-mutation, preserves unrelated state during a focused edit, and
  reports recipe, skill/front-door, and whole-package work only when it is actually required.
- Exact-pack evidence: the reviewer-built accepted archive from clean synthetic revision
  `72bad8d21dbafbdb17dd374ccb6f35f0db1001e2` contained **430 entries**, measured **469,924 bytes**, exposed
  only `package/agent-skills/wpm-author-bundle/SKILL.md` for this skill, and had SHA-256
  `9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6`. The automated clean-revision test
  extracted it, deleted the source checkout, and re-read the complete source-free skill. The real tar/Git/
  conditional-zip build journey now plants the exact native workspace skill before rejecting both its path and
  unique content marker from generated deliverables.
- Fresh Codex `0.148.0` evidence is complete against that installed archive, not repository `dist/`: native
  workspace discovery; explicit `$wpm-author-bundle` ambiguity/no-write with an unchanged tree hash; natural
  unnamed activation that created and independently verified enabled `audit-export` version `0.3.0`, safe,
  purpose `exports signed audit reports`, with no dependency/payload/script/helper/advisor registrations and no
  inferred target; a read-only follow-up that kept the bundle usable while naming recipe, skill/front-door,
  whole-package review, and target selection as separate pending work; and unrelated `17 * 19` output `323`
  with no state change. The known workspace-write `bwrap` launcher denial reproduced once, after which the one
  allowed retry used full access confined to the isolated temporary host.
- Fresh Claude Code `2.1.158` initialization discovered `wpm-author-bundle` in both `slash_commands` and
  `skills` from `.claude/skills`, proving native discovery and `/wpm-author-bundle` identity. Authenticated
  execution could not begin because the configured first-party `claude.ai` OAuth access token returned
  `401 OAuth access token has expired. Re-authenticate to continue.` The evidence retains all three authorized
  401 probes; the final minimal no-settings probe exited 1 after 29,825 ms with zero input/output tokens, zero
  tool use, and no permission denial. No credential was read or changed and no interactive authentication was
  launched. Live Claude explicit, natural-trigger, non-trigger, and observed-outcome evidence remains
  intentionally unclaimed and is an external prerequisite for the post-TASK-127 exact-revision gate, not a
  TASK-115 blocker.
- Final safe gates: official validator PASS; **23/23** combined workspace-skill tests; **1/1** clean-revision
  package test; **1/1** public-surface test; **1/1** real tar/Git/conditional-zip non-leakage journey; typecheck,
  repository-wide Biome over **241 files**, build, and `git diff --check` PASS. Review continuation reran the
  official validator, **23/23** focused tests, typecheck, and repository-wide Biome with no product/test byte
  change. Independent review cycle 2 then ran the exact full `npm test`: **121/121 files and 1516/1516 tests
  passed** in 443.09 seconds on the unchanged stable diff. Stable four-file hash:
  `25153454f2dcb6ba070fe96e77ddbf484a631cec0c7fa154db3449696c49dcab`.
- Revised DoD4 verdict: PASS. Fresh helper/source/version evidence, deterministic Codex/Claude native-path,
  frontmatter, discovery/explicit identity, trigger/non-trigger and source-free portability evidence, exact
  pack/non-leakage proof, and current live Codex discovery/explicit/natural/non-trigger/outcome evidence are
  complete. Review continuation reverified Codex CLI `0.148.0`, Claude Code `2.1.158`, and the unchanged
  official helper SHA-256 `6656e54755638e8efcf275a472b9672eaa8a9a1b9e59dc210e275b03b59e1e66`.
  Independent review cycle 2 found zero new findings and approved the story; story and sprint are synchronized
  to `done`.

### File List

- `_bmad-output/implementation-artifacts/2-2-plan-and-change-bundles-with-wpm-author-bundle.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-115.md`
- `agent-skills/wpm-author-bundle/SKILL.md`
- `test/integration/cli.build.e2e.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/unit/agent-skills/wpm-author-bundle-skill.test.ts`

### Change Log

- 2026-08-22: Added the portable bundle-authoring skill, focused structural tests, exact clean-pack/source-free
  proof, generated-deliverable non-leakage automation, and fresh Codex host evidence. Recorded Claude discovery
  plus the reproducible expired-OAuth prerequisite under the then-active evidence contract.
- 2026-08-22: Review cycle 1 hardened dependency-cycle safety, focused-edit and validation behavior, result and
  pending semantics, registry taxonomy, non-vacuous deliverable leakage evidence, and exact installed-package
  Codex host evidence. The then-active review blocked only on fresh Claude execution evidence.
- 2026-08-22: Applied the approved Correct Course Direct Adjustment, retained all Claude discovery/401
  diagnostics, reassigned authenticated live Claude parity to the post-TASK-127 exact-final-revision gate,
  completed revised DoD4, and returned the unchanged product/test diff to review.
- 2026-08-22: Independent review cycle 2 re-audited the corrected contract and every prior fix, reproduced the
  exact archive and stable product/test hash, passed all focused/static/build/non-leakage gates plus the exact
  full suite, and approved TASK-115 with zero open findings.

## Senior Developer Review (AI)

### Outcome

**APPROVE — 6/6 acceptance criteria and revised DoD1-4 pass; 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode for cycle 2 against revised
TASK-115, this story, the QA summary, the complete in-scope diff, Story 2.1 regressions, the approved Epic
2/PRD/architecture/UX inputs, the approved Correct Course proposal, and the unchanged `docs/00`–`docs/14`
design set. The audit reverified all seven cycle-1 fixes and found no new product, test, package, Codex, or
helper defect. The original BLOCKED verdict remains correct history under the then-active both-live-host DoD;
the approved correction assigns authenticated live Claude behavioral parity to the post-TASK-127 final cold
gate while retaining the story-owned deterministic two-platform, exact-package/non-leakage, and live Codex bar.

### Findings Resolved

- **HIGH:** dependency-cycle detection was described only as a post-command check even though WPM writes a
  cyclic edge before warning. The skill now traverses the relevant existing dependency graph before
  `requires add` and forbids using the write-after-warning behavior as validation.
- **HIGH:** the original Codex host project resolved `wpm` to repository `dist/cli.js`, contradicting its
  source-free claim. Fresh evidence now uses only the CLI installed from the accepted tarball; the installed
  resource and exact native skill hashes are independently bound and the resulting WPM state is re-read.
- **MEDIUM:** generated-deliverable content leakage could pass vacuously because its skill marker was never
  planted in the authoring workspace. The real tar/Git/conditional-zip journey now writes the exact native
  workspace skill bytes first, proves the marker is present at the source boundary, and then proves path and
  content absence in every generated format.
- **MEDIUM:** a focused existing-bundle change could be turned into re-confirmation of every bundle field, and
  recipe/skill/review work was labelled pending even when neither the request nor inspected state required it.
  Existing unrelated WPM state is now preserved, only affected choices are elicited, and pending work is
  conditional and evidence-backed.
- **MEDIUM:** treating any `project validate` failure as an invalid workspace would block legitimate bundle
  work on an otherwise readable project with no executor target yet, or tempt target inference. Validation is
  now classified: structural workspace failures block; unrelated package incompleteness remains separate and
  targets are never added or inferred.
- **MEDIUM:** the result wording suppressed truthful successful state changes whenever another concern remained.
  Individual changes now appear under **Resolved** while `complete` remains forbidden for an unresolved or
  blocked overall bundle result.
- **LOW:** scripts and installer helpers were described as payload registrations despite WPM declaring them
  non-delivered install-time components. The instructions and result fields now preserve the product's exact
  delivered-payload/install-time taxonomy.

### Deferred External Prerequisite (Not a TASK-115 Blocker)

- Claude Code `2.1.158` discovers the exact skill in native workspace scope. Authenticated execution and the
  three recorded probes failed before inference with `401 OAuth access token has expired. Re-authenticate to
  continue.` No credential was inspected or changed and no login was initiated. The missing live Claude
  explicit/natural/non-trigger/outcome matrix remains truthfully unclaimed; it is now an external prerequisite
  for the exact-final-revision family gate after TASK-127 and does not block revised TASK-115 DoD4.

### Verification

- Official Codex `quick_validate.py`: **PASS**.
- Combined workspace-skill band: **23/23 passed**.
- Clean-revision exact-package/source-free journey: **1/1 passed**; accepted review archive **430 entries**,
  **469,924 bytes**, SHA-256 `9291cffc2110b4a98f2e55c24ca128caaca2e11de05d17bc70269de18afcc9c6`.
- Static/dynamic packaged-skill public-surface case: **1/1 passed**.
- Real tar/Git/conditional-zip generated-deliverable non-leakage journey: **1/1 passed**.
- `npm run typecheck`, repository-wide `npm run lint` (**241 files**), `npm run build`, and
  `git diff --check`: **passed**.
- Source-free Codex host: installed CLI version `0.1.0`; native skill SHA-256
  `54cee6e7527556448fa81a8daf879587d1cc419ec4c27038beb058ffbee84cd7`; explicit no-write, unnamed mutation,
  conditional pending-boundary inspection, unrelated non-trigger, and independent WPM-state verification pass.
- Stable product/test aggregate hash:
  `25153454f2dcb6ba070fe96e77ddbf484a631cec0c7fa154db3449696c49dcab`.
- Exact full `npm test`: **PASS** — **121/121 test files and 1516/1516 tests passed** in 443.09 seconds on these
  unchanged stable product/test bytes.
- Operational deviation: an evidence-search regex accidentally allowed the text `npm test` to expand
  as shell command substitution. It was detected and terminated with its exact npm/Vitest descendants at the
  first 10-second yield; no verdict or file change resulted, and process inspection confirmed nothing remained.
  This aborted launch is not the reserved exact full gate.

### Workflow Customization

The review skill's customization resolver was invoked with the available `python3` launcher and reported no
`customize.toml`; no workflow override, activation prepend/append, matching `project-context.md`, or completion
hook applied. Backlog, `.bmad/sdlc-state.yaml`, contributor/policy docs, `.serena`, branch, commits, and merge
state were not changed by review cycle 2. Only story, QA, and sprint evidence was synchronized after the exact
full gate passed on unchanged executable/test bytes.
