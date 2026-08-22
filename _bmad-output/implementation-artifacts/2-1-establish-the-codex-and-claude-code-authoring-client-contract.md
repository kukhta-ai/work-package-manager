---
baseline_commit: df4644b2f2a679ebe3e1717cf4f0d6fa71936c18
---

# Story 2.1: Establish the Codex and Claude Code Authoring-Client Contract

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-114. -->

## Story

As a package author,
I want WPM to identify supported authoring clients and their native surfaces consistently,
so that I can configure the intended authoring environment without confusing it with package target agents.

## Acceptance Criteria

1. Given a user or agent requests the supported authoring clients; when WPM presents its inventory or relevant help; then Codex appears with stable ID `codex`; and Claude Code appears with stable ID `claude-code`; and both retain consistent human-readable names.
2. Given Codex authoring support is inspected; when its contract is returned; then it identifies `~/.agents/skills` as the personal skill destination, `.agents/skills` as the workspace destination, and `AGENTS.md` as the workspace front door; and it supplies the current detection result and Codex-specific launch and reload guidance.
3. Given Claude Code authoring support is inspected; when its contract is returned; then it identifies `~/.claude/skills` as the personal skill destination, `.claude/skills` as the workspace destination, and `CLAUDE.md` as the workspace front door; and it supplies the current detection result and Claude-Code-specific launch and reload guidance.
4. Given a project's authoring clients differ from its deliverable targets; when WPM reports or retains either set; then both sets preserve their own values; and no authoring client is inferred from or written to `manifest.yml.targets`.
5. Given Hermes, OpenClaw, an empty value, or an unknown identifier is presented as an authoring client; when WPM evaluates its support status; then Codex and Claude Code remain the only selectable P0 clients; and deferred and invalid identifiers are machine-distinguishable and are not reported as successfully configured.

## Tasks / Subtasks

- [x] Establish one closed authoring-client registry and support evaluator (AC: 1-3, 5)
  - [x] Define the two selectable definitions once: stable ID, display name, personal/workspace skill
        destinations, native workspace front door, advisory detection behavior, launch hint, and reload guidance.
  - [x] Return a closed machine-readable support result that distinguishes `selectable`, `deferred`, and
        `invalid`; treat `hermes`/`openclaw` as deferred and empty/unknown values as invalid.
  - [x] Keep detection advisory: a current hint never selects a client and never claims installation,
        configuration, authorization, or a live session.
- [x] Expose read-only inspection through the existing CLI composition boundary (AC: 1-3, 5)
  - [x] Provide a small project-independent inventory/inspection surface and substantive help naming the two
        stable selectable IDs and their separation from deliverable targets.
  - [x] Gather current detection observations only through the injected `FileSystem` and `Environment` ports;
        keep formatting at the CLI edge and return stable human and machine-readable fields.
- [x] Preserve the authoring-client / deliverable-target split (AC: 4)
  - [x] Do not read, infer, persist, or mutate authoring-client selection through `Manifest.targets`; preserve
        the existing target-agent alias and `project targets` behavior unchanged.
  - [x] Add no installation, setup, reconciliation, personal/workspace write, agent launch, credential,
        subprocess, network, or session-management capability.
- [x] Add focused RED-to-GREEN and through-the-edges evidence (AC: 1-5)
  - [x] Unit-test exact definitions, deterministic order, current detected/not-detected/unavailable hints, and
        all selectable/deferred/invalid identifier classes.
  - [x] Test CLI inventory/inspection/help, machine-readable results, unchanged personal/workspace files, and
        a project whose `manifest.yml.targets` deliberately differs from the authoring-client inventory.
  - [x] Run focused unit/integration checks, typecheck, Biome, build, and package/generated-deliverable
        non-leakage checks; reserve the exact full `npm test` for independent review.

## Dev Notes

### Goal and Scope

This story creates the shared read-only contract later setup, workspace integration, handoff, and help can
consume. It is not the setup journey. A user must not gain extra mandatory detection or inspection steps: the
catalog is product infrastructure, while Story 2.10 remains the one explicit personal setup action.

The selectable P0 set is exactly `codex` and `claude-code`. Hermes and OpenClaw are recognized only so callers
can distinguish “known but deferred” from malformed or unknown input. Do not copy their legacy path data into
the new contract or imply partial support. Do not add a generic plugin framework.

### Contract Guardrails

- Keep one definition per selectable client. Downstream features should consume this registry rather than
  reproduce paths, front-door names, launch hints, or reload rules.
- Use stable structured discriminators for support and detection; prose is explanatory, not the machine
  contract. Equivalent observations must return definitions in one deterministic order.
- Detection is a hint only. The current code's personal-config-root observation can be represented through
  `FileSystem` plus `Environment`; absence must not make a selectable client unsupported, and presence must not
  make it selected or “configured.” If HOME cannot be resolved, return an explicit unavailable observation
  rather than inventing a result or failing the inventory.
- Human inspection should be concise. A machine-readable form must retain exact IDs, paths, front door,
  detection status, launch command/cwd rule, reload rule, selectable flag, and support status.
- Read-only inspection may report deferred or invalid input successfully as an evaluation, but its result must
  never label those inputs selected, installed, configured, or supported.

### Architecture and Reuse

- Place registry/types and support evaluation in the pure core. Put current detection in a read-only operation
  over the existing `FileSystem` and `Environment` ports. Keep Commander and rendering in `src/cli.ts`; do not
  import filesystem, OS, subprocess, or CLI modules under `src/core/`.
- Preserve the four-port composition. No fifth port, executable runner, credential/session abstraction, or
  coding-agent process owner is needed.
- `src/core/services/agent-aliases.ts` describes deliverable target-agent aliases and the legacy personal
  install surface. Its Hermes/OpenClaw entries do not make those IDs selectable authoring clients. Do not infer
  the new catalog from `ALIAS_PATHS`, `USER_SCOPE_PATHS`, or a project's manifest.
- `src/core/operations/install-authoring-skill.ts` currently performs ambient, mutating legacy installation.
  Do not call or broaden it here. Story 2.10 owns explicit selected-client installation and reconciliation.
- Follow the existing `CommandModule`, injected `CliDeps`, `runWithExit`, formatter-at-the-edge, `--json`, and
  `withExamples` patterns. A read-only authoring-client inventory may be project-independent; it must not call
  `requireProject` merely because the caller happens to be in a workspace.

### Official Client Facts (checked 2026-08-22)

Only stable facts required by this contract are fixed below; exact upstream prose and product versions are not
copied into the implementation.

- Codex: repository skills are discovered under `.agents/skills`, personal skills under
  `~/.agents/skills`, and `AGENTS.md` is the workspace instruction front door. Launch with `codex` from the
  intended workspace root. Skill changes are detected automatically; if a skill remains absent, restart the
  client in the target directory. [Source: https://learn.chatgpt.com/docs/build-skills]
  [Source: https://learn.chatgpt.com/docs/agent-configuration/agents-md]
  [Source: https://learn.chatgpt.com/docs/codex/cli]
- Claude Code: project skills are discovered under `.claude/skills`, personal skills under
  `~/.claude/skills`, and `CLAUDE.md` is its workspace instruction front door. Launch with `claude` from the
  intended workspace root. Skill directories are watched live; creating a previously absent top-level skill
  directory may require restarting the session. [Source: https://code.claude.com/docs/en/slash-commands]
  [Source: https://code.claude.com/docs/en/claude-directory]
  [Source: https://code.claude.com/docs/en/cli-usage]
- These official facts define guidance, not process ownership. WPM does not launch, authenticate, reload, or
  verify a client session in this story.

### Testing Requirements

- Start RED with contract tests that import the intended registry/evaluator and CLI tests that invoke the
  intended read-only inventory before those surfaces exist.
- Cover exact identity/name/path/front-door values for both clients and prove ordering/repeated output stability.
- Cover Codex-only, Claude-only, both, neither, and unavailable detection observations without treating any
  observation as selection. Exercise paths through the fake ports; use a real isolated environment only for a
  bounded read-only integration seam.
- Cover `hermes` and `openclaw` as deferred, and `""`, whitespace-only, uppercase/near-miss, and unknown IDs as
  invalid. Assert the categories are structurally different and none exposes a configured/success result.
- Seed a project with deliberately different target values, run inventory/inspection from inside it, and prove
  both the manifest bytes and all personal/workspace surfaces are unchanged. Inventory stays exactly Codex and
  Claude Code regardless of targets.
- Verify help is self-sufficient and the new command follows the repository-wide example contract. Run build
  before built-CLI integration and confirm no authoring-client state or test fixture leaks into generated work
  packages; source modules may ship normally through `dist` as product code.

### Epic 1 Carry-Forward and Git Intelligence

- Epic 1 closed PASS/LOW with 7/7 stories, 46/46 criteria, zero open findings, and one cold exact-tip gate at
  1,473/1,473 tests. Its generic clean-package and source-free packed-install harness remains available for
  later asset stories; this read-only contract adds no packaged skill asset and does not regenerate a release
  candidate.
- Reuse its review lessons: closed schemas, canonical ordering, explicit negative states, pure/effect separation,
  and no-write evidence from both structural absence and before/after snapshots.
- Story baseline: `df4644b2f2a679ebe3e1717cf4f0d6fa71936c18` on
  `feature/authoring-agent-onboarding-task-114`. No `docs/00`-`docs/14` file changed since this persistent
  worker's complete preload revision `5d1c08aaa03be0211274936cfa3715a4a962be2f`.
- Current stack remains Node `>=20`, TypeScript `6.0.3`, Commander `14.0.3`, Vitest `4.1.7`, and Biome
  `2.4.16`. Add no dependency.

### Expected File Boundaries

- Expected new surfaces: a pure authoring-client model/registry, one read-only core operation, focused unit and
  integration tests, and the TASK-114 QA summary. Exact filenames remain implementation-refinable.
- Expected modified surfaces: core model exports if needed, `src/cli.ts`, CLI/help tests, this story, and the
  sprint tracker.
- Do not change package installation behavior, `manifest.yml` schema/targets, project templates/front doors,
  agent skills, release-preparation tooling, package metadata, Backlog, SDLC state, contributor instructions,
  canonical design docs, `.serena`, branch, commits, or merges.

### References

- [Source: backlog task TASK-114 --plain]
- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-21-Establish-the-Codex-and-Claude-Code-Authoring-Client-Contract]
- [Source: _bmad-output/planning-artifacts/prd.md#Authoring-adapters-personal-setup-and-bootstrap]
- [Source: _bmad-output/planning-artifacts/addendum.md#Architecture-inputs-for-authoring-onboarding]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Project-Context-Analysis]
- [Source: _bmad-output/implementation-artifacts/investigations/agent-driven-onboarding-flow-investigation.md#Agent-adapter-contract]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-08-22.md]
- [Source: _bmad-output/test-artifacts/gate-decision-authoring-agent-onboarding-epic-1.json]

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

- Create-story checklist verdict: PASS. All five TASK-114 acceptance criteria are preserved verbatim; the
  guide defines one reusable two-client contract, closed selectable/deferred/invalid states, advisory
  read-only detection, an inspectable help/CLI seam, and explicit target-axis/no-write boundaries without
  pulling setup, installation, persistence, process ownership, or deferred clients into Story 2.1.
- Create-story synthesis used the unchanged complete design/planning preload plus the current Epic 1
  retrospective/gate delta, TASK-114, source/code seams, and official OpenAI/Anthropic documentation accessed
  on 2026-08-22.
- Dev-story RED evidence: the focused service suite failed to resolve
  `src/core/operations/authoring-clients.js`, while all six initial CLI cases exited 2 because
  `wpm authoring clients` was not registered.
- Dev-story GREEN evidence: the final focused unit/help/CLI band passed 47/47; real-filesystem and core-boundary
  integration passed 5/5; the selected generated-deliverable non-leakage regression passed 1/1. Typecheck,
  repository-wide Biome over 240 files, build, built-CLI inventory/deferred/help inspection, and diff hygiene
  passed. npm dry-pack contained 429 entries, including the compiled registry/operation, with no tests, story
  state, or authoring-client selection state leaked. The exact full `npm test` remains reviewer-owned.
- The implementation exposes one closed two-client registry, advisory detected/not-detected/unavailable
  observations through existing ports, and one text/JSON CLI projection. Support evaluation keeps
  selectable/deferred/invalid states distinct and always reports `configured: false`; no manifest, personal,
  workspace, process, credential, or network mutation capability was introduced.
- Dev-story checklist verdict: PASS (26/26). All tasks are complete; all five criteria have focused evidence;
  the story and sprint tracker are ready for QA/review. Stable dev product/test aggregate hash:
  `9ad54c64ec781b4386796194477a2c2925ff9dc42b18b2b6176068ab859dd2f3`.
- QA added one built-distribution journey over `dist/cli.js`, covering JSON/text/help from an isolated Claude
  environment while an OpenClaw-only deliverable target remains unchanged. Final focused results are 47/47
  unit/help/CLI and 6/6 real-filesystem/core-boundary integration, plus 1/1 selected generated-deliverable
  non-leakage. Typecheck, repository-wide Biome over 240 files, stable product build, dry-pack inspection, and
  diff hygiene passed; the exact full suite remains reviewer-owned.
- QA checklist verdict: PASS. All five acceptance criteria have unit and through-the-edges coverage; API/UI
  items are not applicable. QA summary:
  `_bmad-output/implementation-artifacts/tests/test-summary-task-114.md`. Stable QA product/test hash:
  `a7af5fa4515f92527bddb73940dd4ffe23da3788965543211f7f0f255762c68b`.

### Change Log

- 2026-08-22: Created Story 2.1 implementation context through literal `bmad-create-story` in YOLO mode.
- 2026-08-22: Implemented the stable Codex/Claude Code authoring-client registry, read-only inspection/help
  surface, closed support evaluation, and focused no-write/target-separation evidence through literal
  `bmad-dev-story` in YOLO mode.
- 2026-08-22: Strengthened the real acceptance boundary with a built-CLI JSON/text/help and whole-tree
  non-mutation journey through literal `bmad-qa-generate-e2e-tests` in YOLO mode.
- 2026-08-22: Independent automatic-fix review resolved four medium- and one low-severity findings, completed
  the exact stable-diff gate, and approved Story 2.1 with zero open findings.

### File List

- `_bmad-output/implementation-artifacts/2-1-establish-the-codex-and-claude-code-authoring-client-contract.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-114.md`
- `src/cli.ts`
- `src/core/operations/authoring-clients.ts`
- `src/core/services/authoring-clients.ts`
- `test/integration/cli.authoring-clients.test.ts`
- `test/unit/cli/authoring-clients-commands.test.ts`
- `test/unit/services/authoring-clients.test.ts`

## Senior Developer Review (AI)

### Outcome

**APPROVE — 5/5 acceptance criteria satisfied, 0 open findings.**

The literal `bmad-story-automator-review` workflow ran in automatic-fix mode against TASK-114, this story,
the QA evidence, the complete in-scope diff, Epic 1 regressions, the Epic 2 planning/UX/architecture inputs,
and the unchanged `docs/00`–`docs/14` design set.

### Findings Resolved

- **MEDIUM:** the exported stable client-ID tuple was runtime-mutable, allowing a consumer to append a third
  ID despite the closed P0 contract. The tuple is now frozen and regression-tested.
- **MEDIUM:** relative or whitespace-only `HOME` values were treated as resolved. A relative `HOME=.` could
  mistake a workspace `.agents` directory for the personal Codex configuration root. Detection now requires
  an absolute HOME in the injected platform dialect and otherwise reports `home-unavailable`.
- **MEDIUM:** mere path existence let a regular file named `~/.agents` or `~/.claude` count as the declared
  personal configuration directory. The read-only probe now confirms directory semantics through the existing
  FileSystem port and conservatively treats non-directory/unreadable entries as not detected.
- **MEDIUM:** caller/environment-controlled strings were inserted verbatim into human output. An invalid ID
  containing a newline could forge a `configured: yes` line. Human output now escapes raw IDs and observed
  paths while retaining exact JSON values.
- **LOW:** help described inventory as a “selection,” did not pair the exact display names with stable IDs, and
  human selectable output omitted its configured state. Help now names `Codex (codex)` and
  `Claude Code (claude-code)`, labels detection advisory, and text output states `configured: no`.

`node:path` was audited explicitly and is not an open boundary finding: the enacted `biome.json` contract and
`test/integration/core-boundary.test.ts` deliberately allow its pure string operations while forbidding
`node:fs`, `node:os`, subprocess, completion, and CLI imports under `src/core/`. The boundary regression and
repository-wide Biome gate passed.

### Verification

- RED review band: **7 failures / 31 tests**, directly reproducing all concrete findings; fixed band:
  **31/31 passed**.
- Focused authoring/help/legacy-target unit band: **84/84 passed across 8 files**.
- Generated-deliverable build regression: **21/21 passed**.
- Real-filesystem, built-CLI, and explicit core-boundary integration band: **6/6 passed across 2 files**.
- `npm run typecheck`, repository-wide `npm run lint` (**240 files**), `npm run build`, and
  `git diff --check`: **passed**.
- npm dry-pack: **429 entries**; both compiled authoring-client modules present and no test, story, sprint,
  Backlog, state, or `.serena` files leaked.
- One exact stable-diff `npm test`: **120/120 files, 1,507/1,507 tests passed** in **484.03 seconds**.
- Stable executable product/test aggregate hash:
  `cbb1f41a4251edae93f20f4352fb849182b71d3e130181bdc23bc2cb2a1e8bef`.

### Workflow Customization

The review skill's customization resolver was invoked once with the available `python3` launcher after the
default `python` executable was unavailable; it confirmed that the skill has no `customize.toml`. No workflow
override, activation prepend/append, matching `project-context.md`, or completion hook applied. Backlog,
`.bmad/sdlc-state.yaml`, contributor/policy docs, `.serena`, branch, commits, and merge state were not changed
by review.
