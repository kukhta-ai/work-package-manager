---
baseline_commit: 1c1ef37d7c63de3149c7dcafccd09730379314f4
---

# Story 2.9: Guide Package Creation with `wpm-create-package`

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-122. -->

## Story

As a work-package author,
I want an installed personal bootstrap skill to guide package creation,
so that I can reach a prepared authoring workspace without reconstructing WPM's setup sequence.

## Acceptance Criteria

1. Given a controlled supported-client personal-scope fixture populated only from WPM's exact local package ship set; when a new session discovers installed personal skills; then `wpm-create-package` is available without a source checkout or repository-relative resources.
2. Given `wpm-create-package` and WPM receive a package-creation intent; when the skill establishes readiness; then it identifies unresolved readiness, package-intent, authoring-client, and workspace decisions and asks only for those unresolved decisions.
3. Given readiness is established and the author explicitly selects one or more supported authoring-client IDs plus a package intent; when bootstrap runs; then the created or adopted workspace uses that authoring-client selection independently of deliverable `manifest.yml.targets` and reaches a prepared handoff.
4. Given a prerequisite or setup dependency is missing; when bootstrap evaluates readiness; then it reports the blocker and one actionable recovery without claiming workspace preparation or handoff success.
5. Given predictable workspace creation or adoption, integration, task-plan, package-state, or handoff prerequisites are invalid, unavailable, or conflicting; when bootstrap evaluates the request; then every affected blocker and surface is reported before the first write, and the workspace, authoring backlog, generated deliverable, selected client integrations, and handoff evidence remain unchanged.
6. Given bootstrap reaches a prepared handoff; when it reports completion; then it identifies the workspace root and applicable launch, reload, and fresh-session verification instructions, stops at the workspace boundary, and does not claim it spawned or authenticated an agent, received acceptance, or progressed authoring tasks.
7. Given package creation and later package builds complete; when generated deliverables are inspected; then personal bootstrap skills are absent from generated deliverables.

## Tasks / Subtasks

- [x] Create one instruction-only personal bootstrap skill with the official skill creator (AC: 1-4, 6)
  - [x] Freshly invoke the installed official `skill-creator` initializer for `wpm-create-package`, retain only the portable `SKILL.md`, and run its validator.
  - [x] Use exact frontmatter identity and a focused positive/negative activation description that supports explicit `$wpm-create-package`, natural package-bootstrap intent, and adjacent-work non-triggering.
  - [x] Keep every instruction self-contained: no checkout paths, repository-relative references, scripts, assets, templates, or client-specific copies.
- [x] Guide only unresolved bootstrap decisions (AC: 2-4)
  - [x] Establish whether the installed `wpm` executable and Backlog.md prerequisite are usable before discussing mutation, and distinguish a missing prerequisite from a malformed or conflicting workspace.
  - [x] Resolve package intent, exact create-versus-adopt root, explicit non-empty supported client IDs, and only the template/parameter decisions a fresh init actually needs.
  - [x] Never infer authoring-client selection from personal detection or deliverable targets; never install or configure the personal skill from inside itself.
  - [x] Return one actionable recovery for each unresolved prerequisite and make no prepared/handoff claim while blocked.
- [x] Drive the existing create/adopt and prepared-handoff boundary safely (AC: 3-6)
  - [x] For a fresh workspace, issue one explicit `wpm init ... --authoring-client ...` request and consume its already-coherent prepared result; do not append a second happy-path preparation operation.
  - [x] For adoption, inspect the exact workspace wrapper without making whole-project validation or empty deliverable targets a bootstrap gate, then run read-only handoff verification for the requested clients before mutation so core-task/backlog and independently discoverable handoff defects are visible before integration.
  - [x] Treat only the exact missing/stale managed integration, selected native surface, and not-yet-prepared receipt evidence as repairable by the requested integration/prepare sequence; any other verification blocker stops the flow unchanged.
  - [x] Invoke `wpm authoring integrate` once with the complete explicit desired client selection, then prepare the handoff once; never treat a single `--client` as additive and never continue after a non-success.
  - [x] Report only the approved root/client launch, reload, verification, and first-skill facts returned by WPM; stop before starting a client, authenticating, accepting handoff, or selecting/claiming/routing authoring work.
- [x] Prove exact personal-native package portability and generated non-leak boundaries (AC: 1, 7)
  - [x] Add RED-first unit coverage for frontmatter, trigger/non-trigger scope, readiness/decision/preflight instructions, complete client selection, prepared-only success, and prohibited claims.
  - [x] Prove the exact packaged `SKILL.md` remains byte-identical and source-free at Codex `~/.agents/skills/wpm-create-package/SKILL.md` and Claude Code `~/.claude/skills/wpm-create-package/SKILL.md` fixtures.
  - [x] Extend exact archive and installed-package evidence so only the package ship set supplies the personal skill after source deletion.
  - [x] Extend tar/Git/conditional-zip and rendered-deliverable sentinels so the personal skill name, native paths, and unique instruction bytes never enter canonical `wip/` or generated outputs.
- [x] Prove current supported-host behavior without widening the story (AC: 1-7)
  - [x] Record current installed Codex and Claude Code versions plus the official skill-creator hash and official source access date.
  - [x] Run a fresh isolated Codex session against the exact accepted installed archive and personal-native skill fixture for discovery, explicit invocation, natural trigger, adjacent non-trigger, and a real prepared workspace outcome.
  - [x] Use deterministic fixture/text compatibility for Claude Code only; do not invoke live Claude, reuse host authentication state, or claim authenticated Claude acceptance.
  - [x] Run the focused unit/package/non-leak/static/build bands and literal QA workflow; leave the exact stable full `npm test` to the independent reviewer.

## Dev Notes

### Goal and Ownership Boundary

Story 2.9 owns exactly one packaged **personal bootstrap skill**, `wpm-create-package`, and the evidence that the
same instruction-only bytes work from supported Codex and Claude Code personal skill locations. The skill begins
after WPM has been acquired and made executable. It guides an author from package intent to the prepared handoff
already implemented by Stories 2.7 and 2.8.

This story does not own personal-scope installation or reconciliation (Story 2.10), a new CLI/core/domain
subsystem, client detection as selection, deliverable targets, a setup transaction, package-authoring work,
`wpm-author` routing, receiving-agent acceptance, or the complete cold install journey (Story 2.11). It must not
change the approved managed-state or handoff-receipt schemas. Authenticated live Claude is deferred through
TASK-127 and the approved consolidated final-revision gate.

The skill is author-facing and personal; it is not one of the five workspace-local authoring specialists. The
selected workspace skill family remains exactly `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`,
`wpm-author-skill`, and `wpm-review-package`.

### Portable Native Skill Contract

Use the current official `skill-creator` directly and record its exact bytes/version evidence. The retained
artifact should be only `agent-skills/wpm-create-package/SKILL.md`; generated UI metadata, scripts, references,
and assets are unnecessary and would violate the portable instruction-only boundary.

The frontmatter must be the same minimal intersection accepted by both hosts:

- `name: wpm-create-package`;
- one concise `description` that front-loads package-bootstrap intent, names WPM/work-package creation, permits
  explicit and natural activation, and excludes continuing an already prepared workspace or editing/reviewing
  an existing bundle, recipe, payload skill/front door, or package; and
- no host-specific invocation-control fields.

Codex discovers personal skills at `$HOME/.agents/skills`; Claude Code discovers them at
`$HOME/.claude/skills`. The same directory identity, frontmatter identity, and `SKILL.md` bytes must support
Codex `$wpm-create-package` and Claude Code `/wpm-create-package`. Do not mention a contributor checkout or
link to local resources; after extraction and source deletion the file must remain complete on its own.

Current official sources accessed 2026-08-23:

- OpenAI's Codex skill guide says Codex initially sees each skill's name/description, loads the complete
  `SKILL.md` on selection, supports explicit `$` mention and description-based implicit activation, scans the
  personal `$HOME/.agents/skills` location, and recommends focused imperative instruction-first skills.
- Claude Code's skill guide documents personal `~/.claude/skills/<name>/SKILL.md`, explicit `/name` invocation,
  description-based model invocation, and restart fallback when a new top-level skills directory was created
  after session start.

### Decision and Readiness Dialogue

Begin by separating facts that can be inspected from decisions only the author can make. Detect the installed
`wpm` executable, inspect supported clients with `wpm authoring clients --json`, and inspect an author-provided
candidate root before asking questions. Ask only for facts still unresolved:

- the intended package identity/purpose and, for fresh creation, the desired template/required parameters;
- create a fresh workspace or adopt one exact existing workspace root; and
- a non-empty explicit set drawn only from `codex` and `claude-code`.

Never select from HOME detection, installed personal directories, an existing client binary, or
`manifest.yml.targets`. Never guess a root, silently create a sibling, overwrite an occupied target, reinterpret
a normal package-edit request as bootstrap, or teach the user how to install `wpm-create-package` from within
the skill. If WPM, Backlog.md, a supported selection, or a required author decision is missing, state the exact
blocker, one concrete recovery, and that preparation did not occur.

### Create and Adopt Flows

For creation, use the existing explicit surface:

`wpm init <name> --template <template> --at <target> --authoring-client <id> [...]`

Repeat `--authoring-client` for the entire requested set. Init already captures and preflights its complete
workspace/template/Backlog/integration/handoff plan, publishes the prepared receipt last, and returns exact
client actions. A successful init is the handoff completion boundary; do not invoke `handoff prepare` again.

For adoption, do not naïvely mutate integration and discover a bad core task plan afterward. First establish the
exact existing root with read-only project orientation and execute the read-only receiving verifier
for every requested client:

`wpm -C <root> authoring handoff verify --client <id> --json`

`project show --json` names the nested deliverable path as `root`; require it to equal `<root>/wip`, but retain
the author-approved wrapper root for all handoff/integration `-C` arguments. Never redirect adoption into `wip/`.

Verification intentionally reports non-zero when integration or a prepared receipt is absent, but it also
inspects the intended Backlog root and mandatory core task records. Aggregate all results. Continue only when
every blocker is one of the bounded managed-integration/native-selected-surface/missing-or-stale-owned-receipt
facts that the planned operations own; a workspace, manifest, Backlog, core-task, root, package-version, unowned
path, or unreadable/ambiguous surface blocker stops before mutation. Do not suppress an unknown blocker merely
because integration is missing.

Treat exact `preparing` receipt provenance as a separate recovery boundary. An `init|...` plan key authorizes
only the identical original init request, never adoption. A coherent `handoff|...` key authorizes only the exact
standalone prepare retry without a preceding integration; its success goes directly to the prepared-result
boundary and its non-success stops, so neither path falls through to integration. Unknown or malformed prefixes fail closed. This keeps
Story 2.8's partial-publication recovery executable instead of routing a known partial through the wrong flow.
An exact canonical prepared receipt and complete state that agree with each other may differ only from the newly
requested complete client set; that is a supported re-selection for integrate-then-prepare, not a foreign receipt.

Then invoke integration exactly once with the **complete desired set**:

`wpm -C <root> authoring integrate --client <id> [...]`

Integration performs its own deterministic aggregate preflight before any write. Only after its success invoke
`wpm -C <root> authoring handoff prepare --json`. Stop on either non-success and report the exact WPM evidence;
do not claim rollback or preparation. The verification-first observation plus integration's authoritative
preflight closes the predictable cross-operation blocker seam without inventing a dry-run, setup command, or
generic transaction. A race after preflight remains a truthful typed partial/non-success, never a prepared
claim.

### Truthful Prepared Boundary

Only WPM's `handoffPrepared: true`/prepared result is success. Preserve its canonical workspace root, configured
client order, launch working directory, reload guidance, front door, verification argv, and first `wpm-author`
invocation. Report that the user must launch or restart the selected client at the recorded root, run the fresh
session verifier, and then invoke `wpm-author`.

Stop there. Do not launch Codex/Claude, mutate host authentication, claim that a receiving agent accepted the
handoff, invoke `wpm-author`, list/select/claim a task, route a specialist, or author package content. A
successful integration with `handoff prepared: no` is not bootstrap success.

### Package, Source-Free, and Non-Leak Evidence

`package.json` already ships the whole `agent-skills` root; no manifest or production source change is expected.
Extend exact package inventory and extraction assertions for the new personal skill. Copy only its accepted
packaged `SKILL.md` to controlled Codex and Claude personal-native fixtures, delete the copied source checkout,
and prove discovery/identity/bytes from the installed archive rather than an ambient repository.

The personal skill is tooling for the author, never payload. Extend built tarball, Git, and conditional-zip
deliverable checks with a unique instruction sentinel, `wpm-create-package`, `.agents/skills/wpm-create-package`,
and `.claude/skills/wpm-create-package`. None may appear under `wip/`, generated build roots, installer assets,
or package payload registries. Package inclusion under top-level `agent-skills/` is expected and must not be
mistaken for deliverable inclusion.

### Test and Live-Evidence Strategy

Drive the contract RED-first in a focused unit file. Pin minimal frontmatter, instruction-only inventory,
positive explicit/natural triggers, negative adjacent intents, exact supported client selection, question-only-
when-unresolved behavior, verification-first adoption, all-blocker/prewrite language, prepared-only success,
and prohibited process/auth/acceptance/task claims.

Extend the existing package-preparation and packed-install harnesses, not a parallel packer. Prove exact bytes
after source deletion at both personal-native paths. Extend the existing built deliverable non-leak harness so
tar/Git/zip evidence remains one coherent boundary.

For the current live Codex check, construct a disposable HOME/CODEX_HOME and workspace from the exact accepted
archive, copy no repository source into the host, and start fresh sessions after installing the personal skill.
Record current `codex --version`, `claude --version`, the official skill-creator SHA-256, archive identity, prompts,
and results. Exercise discovery, explicit `$wpm-create-package`, natural package-bootstrap activation, adjacent
non-triggering, and one real prepared Codex workspace outcome. Never invoke live Claude or reuse/mutate the real
host's personal skills, configuration, credentials, or authentication files.

### Previous Story and Git Intelligence

- Story 2.8 is independently approved with 7/7 criteria and 0 open findings. Its final product/test aggregate
  was `db90d87eecaefd9d44d6098666d95bdcf1025ec62fe9810e4ee2b8219779ff42`; the reviewer passed 130/130 focused,
  26/26 built/non-leak, 2/2 packed-source-free, and 1,645/1,645 full-suite tests.
- Preserve its exact `.wpm-handoff.json` prepared receipt, authoritative `.wpm-authoring.json`, explicit `-C`
  root behavior, current-package five-skill digest verification, inert human output, and partial-init retry.
- Baseline `1c1ef37d7c63de3149c7dcafccd09730379314f4` is the state-integrated HEAD after approved TASK-121 merge.

### Project Structure Notes

- Expected product artifact: `agent-skills/wpm-create-package/SKILL.md`.
- Expected focused unit evidence: `test/unit/agent-skills/wpm-create-package-skill.test.ts`.
- Expected package evidence: `test/integration/distribution-preparation/package-preparation.test.ts` and
  `test/integration/distribution-preparation/packed-install.test.ts`.
- Expected non-leak evidence: `test/integration/cli.build.e2e.test.ts` and, if needed for the rendered in-memory
  boundary, `test/integration/distribution-preparation/public-surfaces.test.ts`.
- No `src/`, CLI, domain, port, adapter, package manifest, workspace integration/state, or handoff schema change
  is expected unless a focused RED proves an observable TASK-122 gap that cannot be expressed truthfully in the
  portable skill.

### References

- [Source: Backlog TASK-122]
- [Source: _bmad-output/planning-artifacts/prd.md]
- [Source: _bmad-output/planning-artifacts/epics-authoring-client-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-client-onboarding-addendum.md]
- [Source: _bmad-output/planning-artifacts/ux-review-first-run.md]
- [Source: _bmad-output/implementation-artifacts/2-8-prepare-and-verify-a-fresh-agent-handoff.md]
- [Source: src/core/services/authoring-clients.ts]
- [Source: src/core/operations/init-project.ts]
- [Source: src/core/operations/workspace-authoring-integration.ts]
- [Source: src/core/operations/workspace-handoff.ts]
- [Source: https://developers.openai.com/codex/skills/]
- [Source: https://code.claude.com/docs/en/skills]
- [Source: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices]

## Dev Agent Record

### Agent Model Used

GPT-5.6 Codex

### Implementation Plan

- Scaffold one minimal instruction-only `wpm-create-package` artifact with the current official skill creator,
  then drive its activation, decision, preflight, prepared-boundary, and non-leak contract RED-first.
- Extend the existing exact package/source-deletion/native-placement and generated tar/Git/zip non-leak harnesses
  without changing the manifest, CLI, core operations, managed state, receipt, or Story 2.10 installer surface.
- Prove deterministic Claude Code compatibility and run a fresh isolated Codex acceptance matrix from the exact
  accepted installed archive, with authenticated live Claude deferred.

### Debug Log References

- Literal `bmad-create-story` invoked in YOLO mode. Customization resolution found no workflow override,
  activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-dev-story` invoked in YOLO mode. Its customization resolver supplied no workflow override,
  activation hook, completion hook, or matching `project-context.md` persistent fact.
- Literal `bmad-qa-generate-e2e-tests` invoked in YOLO mode. Its customization resolver supplied no workflow
  override, activation prepend/append step, completion hook, or matching `project-context.md` persistent fact.
- Official `skill-creator` invoked through `init_skill.py wpm-create-package --path agent-skills`; the generated
  placeholder supplied the RED fixture, and only the required instruction-only `SKILL.md` was retained.
- Placeholder RED: 1/12 focused tests passed and 11/12 failed. Worker GREEN was 14/14; independent-review
  RED/GREEN added the stale-version adoption contract and reached 15/15. Official `quick_validate.py` passed.
- A bounded read-only adoption/retry seam audit reported and rechecked exact wrapper-root, empty-target,
  prepared-reselection, and `init|`/`handoff|` recovery paths; its final pass found no remaining P0/P1 issue.
- Official Codex and Claude Code skill sources were freshly accessed on 2026-08-23 before authoring.
- Exact-final accepted package revision `4c6ac92040c6988ae81e52aa1041880f6c43ac8e` produced 451 archive entries
  and SHA-256 `f2b52c2c416fc0097e2a78b902102442043410d44e25d32111a5c3ee53d06175`; the
  copied source checkout was deleted before installed/native/live evidence.
- Fresh Codex `0.148.0` sessions passed discovery, explicit unresolved readiness, natural unnamed prepared
  outcome, and adjacent non-trigger checks. The isolated copied auth file was removed afterward. Claude Code
  `2.1.158` received deterministic fixture/text coverage only; no live Claude agent was invoked.

### Completion Notes List

- Story context created from TASK-122, the approved Story 2.8 handoff contract, current package/test seams, and
  current official supported-client skill documentation.
- Added one portable personal bootstrap skill with strict readiness, explicit complete authoring-client
  selection, safe create/adopt ordering, strict receipt provenance, and a prepared-only stopping boundary.
- Kept production CLI/core/state/package-manifest bytes unchanged; workspace integration remains exactly the
  five existing specialist skills and the personal bootstrap skill remains outside generated deliverables.
- Proved exact source-free package bytes at Codex and Claude personal-native paths, then exercised the accepted
  installed artifact through a fresh Codex live matrix. No live Claude, host setup, process/authentication,
  receiving acceptance, or authoring task progress is claimed.
- Focused validator/unit/public/package/non-leak/typecheck/lint/build/diff checks and the independent stable
  full `npm test` are green.

### File List

- `_bmad-output/implementation-artifacts/2-9-guide-package-creation-with-wpm-create-package.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-122.md`
- `agent-skills/wpm-create-package/SKILL.md`
- `test/unit/agent-skills/wpm-create-package-skill.test.ts`
- `test/integration/distribution-preparation/package-preparation.test.ts`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/integration/cli.build.e2e.test.ts`

## Senior Developer Review (AI)

### Verdict

**APPROVE — 7/7 acceptance criteria satisfied; 0 open findings.** The independent reviewer literally invoked
`bmad-story-automator-review` in auto-fix mode, reconciled the complete story/task/git scope, fixed every real
finding, re-audited the final adoption and package boundaries, and ran the stable focused, static, build,
source-free package, live Codex, and full-suite gates.

### Findings Resolved

- **HIGH:** the skill classified a canonical same-root prepared receipt and complete managed state at a prior
  WPM integration version as a foreign conflict. The bounded exception now permits only an exact coherent
  prior-version pair through integration's authoritative complete no-write preflight, then prepares on success;
  foreign roots, noncanonical bytes, receipt/state disagreement, and partial states remain fail-closed.
- **HIGH (evidence):** the retained worker JSONL did not preserve prompts, launcher argv, cwd/environment, or
  non-secret authentication lifecycle facts, so explicit versus natural activation was under-attributed. A
  fresh exact-package rebind now records a sanitized manifest with all four prompts, argv/environment, thread
  IDs, archive identity, command counts, outcome inspection, and auth-copy removal evidence.

### Gate Evidence

- Stable product/test inventory: **6 files**, aggregate
  `53b917fb85ff9bf64111784904fb0ffec12f9dda5e5088638288274fd662bcee`.
- Official skill validator: PASS; focused skill/public band: **2 files, 26/26 tests passed**.
- TypeScript typecheck: PASS; Biome: PASS over **255 files**; build and `git diff --check`: PASS.
- Package/source-free band: **2 files, 8/8 tests passed**; built tar/Git/conditional-zip selection:
  **1 passed, 25 skipped**.
- Fresh accepted synthetic revision: `24517151b837b34ab0c2e9799df74ae5134ea3ad`; archive SHA-256
  `49b50b2636e74459cea096b3df3753f47e9c3d46e36aaf4db787e74a9ac16369`, **567,310 bytes / 451 entries**.
  Extracted, installed, Codex-personal, and Claude-personal skill bytes all hash to
  `a01a56f71428d82d9ca50cf8e3eb7abd1324f4fa0f36efc886c8ae8a18a4d5f7`; source was deleted before use.
- Fresh Codex discovery, explicit unresolved, unnamed natural prepared outcome, and adjacent existing-recipe
  nontrigger passed on the exact archive. The sanitized manifest is
  `/tmp/task122-review-live-nxYvEb/review-run-manifest.txt` (SHA-256
  `1d96cf19c741771c74689035d4488702a14b47d6a04e0689ba75c532d3b26fac`). The disposable auth copy was removed,
  source auth stat remained unchanged, no Codex process remained, and live Claude was not invoked.
- Exact completed stable full `npm test`: **131 files, 1,660/1,660 tests passed** in **524.31s**. A later evidence
  grep accidentally shell-expanded the command name and started another invocation; it was detected and
  terminated after about 12 seconds, before completion or a gate result, with the stable hash unchanged.
- The retained worker archive independently resolves to
  `f2b52c2c416fc0097e2a78b902102442043410d44e25d32111a5c3ee53d06175`; the earlier `...d2de` checkpoint was stale.

### Acceptance-Criteria Disposition

All seven criteria pass: the exact instruction-only personal skill is dual-native and source-free; readiness
asks only unresolved decisions; authoring-client selection is explicit and independent of deliverable targets;
fresh creation and coherent adoption reach only a WPM-prepared handoff; complete predictable preflight remains
no-write; completion stops before process/authentication/acceptance/task authority; and planted personal-skill
name/path/content never enters `wip/`, tar, Git, or conditional zip deliverables.

## Change Log

- 2026-08-23: Created Story 2.9 from Backlog TASK-122 via literal `bmad-create-story` in YOLO mode.
- 2026-08-23: Implemented the instruction-only personal bootstrap skill, exact package/native portability,
  prepared-boundary guidance, and generated-deliverable non-leak evidence via literal `bmad-dev-story`.
- 2026-08-23: Ran literal `bmad-qa-generate-e2e-tests`; focused tests, accepted source-free archive, isolated
  Codex behavior, static/build gates, and 7/7 worker AC trace are ready for independent review.
- 2026-08-23: Independent auto-fix review resolved two HIGH findings, reached 0 open, passed the final focused,
  static, build, package/source-free, live Codex, non-leak, and full-suite gates, and approved Story 2.9.
