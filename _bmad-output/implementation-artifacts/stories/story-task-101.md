---
baseline_commit: a4bcde1e8dcfbbad73dcfc34f5c0f0a2b56a0def
---

# Story task-101 — Reconcile shipped documentation with the templates the CLI provides

Status: done

> Follow-up implementation spec produced by the invoked `bmad-create-story` workflow. TASK-101 is outside
> the foundation epic represented by `epics.md` and `sprint-status.yaml`, so those artifacts are not to be
> extended or mutated. The source contract is the read-only output of `backlog task 101 --plain`, reconciled
> with docs `00`–`14`, the shipped template trees, and the implemented resolver/CLI behavior.

## Story

As an author using the shipped documentation,
I want every concrete template and payload-registration example to match the CLI's actual resolution rules,
so that I can follow a worked session without discovering a missing template or a duplicated payload path.

## Acceptance Criteria

1. No shipped doc presents a worked example that depends on a project or bundle template the CLI cannot
   resolve.
2. Every project and bundle template named in the docs is either CLI-resolvable or is no longer named.

## Tasks / Subtasks

- [x] Establish an executable documentation/template inventory (AC: 1, 2)
  - [x] Derive the shipped project and bundle template names from the real `templates/<scope>/` trees.
  - [x] Add a focused drift test that fails while docs name templates outside that inventory.
  - [x] Cover concrete `--template` commands and the documented shipped-template catalogs, not only one
        known bad example.
- [x] Reconcile the CLI contract and worked sessions in doc `10` (AC: 1, 2)
  - [x] Describe `minimal` as the only shipped project template and `default` as the only shipped bundle
        template, while preserving project-local template extensibility.
  - [x] Replace the unavailable pre-populated project-template example with `minimal` followed by explicit
        bundle creation, keeping the later dependency/version example internally satisfiable.
  - [x] Make the custom `template.yml` schema example use a placeholder rather than presenting an unavailable
        concrete template name.
  - [x] Register the worked payload as `launcher.json`, relative to `payload/files/`, rather than passing a
        path already prefixed with `payload/files/`.
- [x] Reconcile the worked authoring process in doc `11` (AC: 1, 2)
  - [x] Start from `minimal`, create `core` explicitly, and keep the materialized task counts/IDs coherent.
  - [x] Include a correct payload-files example whose `files add` argument is `launcher.json` relative to the
        bundle's `payload/files/` directory.
- [x] Reconcile the shipped-template architecture description in doc `12` (AC: 1, 2)
  - [x] Make the package inventory and directory tree describe only `project/minimal` and `bundle/default`.
  - [x] Remove unavailable template names from explanatory prose, fixture examples, and the first-run command.
  - [x] Retain the architecture's data-not-code model and explain specialized shapes as author-supplied,
        project-local templates rather than fictional built-ins.
- [x] Verify the result (AC: 1, 2)
  - [x] Run the focused drift test and relevant template/file-registration tests.
  - [x] Build the CLI and probe the built template-list surface for both scopes.
  - [x] Run typecheck, lint, build, and the complete test suite.
  - [x] Run the `bmad-qa-generate-e2e-tests` workflow and record its acceptance evidence.

## Dev Notes

### Source-of-truth inventory

The implementation and shipped filesystem agree on a deliberately small built-in set:

| Scope | CLI-resolvable built-in directories | Concrete names currently claimed by docs but absent | Decision |
|---|---|---|---|
| project | `minimal` | `single-bundle`, `multi-bundle` | Remove the unavailable names and build worked sessions from `minimal` plus explicit `bundle new` commands. |
| bundle | `default` | `with-payload-skill`, `adopts-system-tool` | Remove the unavailable names; keep the generic custom-template schema with a non-concrete placeholder. |

The resolver first checks project-local `<deliverable>/templates/<scope>/<name>`, then the shipped built-in
root. `template list` enumerates directories from those same roots. Documentation should therefore distinguish
the exact shipped set from the supported extension mechanism: specialized custom templates remain valid when
an author supplies them locally, but the docs must not advertise invented built-ins.

This docs reconciliation is smaller and more faithful than implementing four new content-heavy templates.
The existing CLI, template tree, and authoring skill already converge on `minimal`/`default`; TASK-98/99
intentionally corrected the agent-facing workflow to that current truth. Adding the four names would introduce
new shipped instructional content and product behavior beyond TASK-101's observable consistency outcome.

### Payload path contract

`wpm bundle <id> files add <path>` resolves `<path>` underneath
`bundles/<id>/payload/files/`. The author places `launcher.json` at
`bundles/<id>/payload/files/launcher.json`, then registers it with:

```bash
wpm bundle <id> files add launcher.json
```

Passing `payload/files/launcher.json` makes the CLI look for
`payload/files/payload/files/launcher.json`. Docs `10` and `11` must each show the relative form explicitly,
matching the already-correct bundled authoring skill.

### Test design

Add one repository acceptance/drift test under `test/unit/docs/` (or the closest existing convention) that:

- derives actual names from directories containing `template.yml` below `templates/project/` and
  `templates/bundle/`;
- asserts each docs declaration of the shipped project/bundle inventory equals those derived names;
- scans concrete `wpm init ... --template <name>` and `wpm bundle ... --template <name>` examples and rejects
  names outside the appropriate derived inventory;
- prevents the four removed concrete names from returning anywhere in package-shipped Markdown (`README.md`
  plus every `docs/**/*.md` file), without treating unshipped root planning docs as product documentation;
- scans concrete `wpm bundle ... files add <path>` examples, rejects a `payload/files/`-prefixed argument,
  and requires the corrected `launcher.json` example in both docs `10` and `11`.

Keep this as a content-contract test against real repository artifacts. Resolver behavior and the files
command itself already have focused unit/integration coverage; do not duplicate their internals or add runtime
special cases just to make documentation pass.

### Architecture and boundaries

- Documentation and test changes only are expected: `docs/10-authoring-cli.md`,
  `docs/11-authoring-process.md`, `docs/12-builder-architecture.md`, and one focused test file.
- Preserve the fixed goals, vocabulary, authoring model, structure-not-content principle, project-local
  shadowing behavior, and pure-core boundary from docs `00`/`10`/`12`/`13`.
- Do not change the resolver, built-in template set, CLI semantics, agent skill, package manifest, backlog
  state, or foundation sprint mirror.
- Do not edit anything under `backlog/`, switch branches, commit, merge, or touch `.serena/`.

### Project Structure Notes

- Shipped built-ins live at `templates/project/minimal/` and `templates/bundle/default/`.
- Resolution is implemented by `src/core/services/template-resolver.ts`; CLI wiring and the payload path join
  are in `src/cli.ts`.
- Existing behavioral coverage lives in `test/unit/services/template-resolver.test.ts`,
  `test/unit/cli/template-commands.test.ts`, `test/unit/cli/bundle-files-commands.test.ts`, and the matching CLI
  integration suites. The new test owns cross-artifact drift, not resolver semantics.
- `package.json` ships `docs`, `templates`, and `agent-skills`, making documentation consistency part of the
  package contract.

### References

- TASK-101 contract and recorded payload-path correction: `backlog task 101 --plain` (read via CLI only).
- CLI surface, template schema/catalog, worked sessions, and files-add contract:
  [Source: docs/10-authoring-cli.md#Per-command-actions],
  [Source: docs/10-authoring-cli.md#Templates],
  [Source: docs/10-authoring-cli.md#Two-worked-sessions]
- Authoring lifecycle and worked session: [Source: docs/11-authoring-process.md#A-worked-authoring-session]
- Package inventory, template layout/model, and first-run example:
  [Source: docs/12-builder-architecture.md#What-the-installer-builder-is],
  [Source: docs/12-builder-architecture.md#The-directory-scaffold],
  [Source: docs/12-builder-architecture.md#Templates-as-data-not-code],
  [Source: docs/12-builder-architecture.md#Distribution-and-the-users-install-experience]
- Layering and pure-core constraints: [Source: docs/13-core-architecture.md]
- Runtime resolution: [Source: src/core/services/template-resolver.ts]
- CLI template roots and payload-relative path join: [Source: src/cli.ts]
- Actual shipped registries: [Source: templates/project/minimal/template.yml],
  [Source: templates/bundle/default/template.yml]
- Already-correct author-facing example:
  [Source: agent-skills/installer-builder/references/authoring-workflow.md#A-worked-session-doc-11-a-worked-authoring-session-compressed]
- Follow-up provenance and the prior decision to defer human-owned doc reconciliation:
  [Source: _bmad-output/implementation-artifacts/stories/story-task-98-99.md]

## Dev Agent Record

### Agent Model Used

GPT-5.6

### Baseline Commit

`a4bcde1e8dcfbbad73dcfc34f5c0f0a2b56a0def`

### Implementation Plan

- Derive the registry from the real template directories and make docs declarations/examples executable
  against that inventory.
- Rebuild the former pre-populated-template sessions from `minimal` plus explicit, version-coherent bundle
  creation.
- Lock template names and payload-relative registration commands together with a shipped-artifact drift test.

### Debug Log References

- `bmad-create-story` invoked for TASK-101; customization resolved with no activation hooks and no completion
  hook. Planning discovery found no TASK-101 entry in the foundation-only epics/sprint mirror, so the workflow
  used the Backlog CLI contract and committed design/runtime sources without mutating sprint state.
- Built-CLI inventory probe: project scope reports `minimal`; bundle scope reports `default`.
- RED: the new drift suite initially reported seven failures: missing exact inventory declarations, three
  unavailable `--template` commands, deferred names in docs, the prefixed payload path, and no corrected
  `launcher.json` example in docs `10`/`11`.
- GREEN: `test/unit/docs/template-documentation-drift.test.ts` passes all eleven cases after implementation and
  review refinements.
- A false-positive on doc `05`'s ordinary adjective “multi-bundle work” was removed while retaining whole-doc
  exact-token coverage for prose, trees, YAML, and fenced commands.
- `bmad-qa-generate-e2e-tests` added two built-binary scenarios: the reconciled happy path validates cleanly,
  and unavailable legacy project/bundle templates fail without partial scaffolds.

### Completion Notes List

- Reconciled docs `10`–`12` to the actual shipped registry: project `minimal`, bundle `default`; specialized
  shapes remain supported through project-local templates without being advertised as built-ins.
- Reworked both authoring sessions to create `core@0.3.0` explicitly from `minimal`; a real built-CLI smoke run
  confirmed the documented 8 project tasks + 11 advisor-free core tasks and version `0.3.0`.
- Corrected payload registration in docs `10` and `11` to stage `launcher.json` under `payload/files/` and pass
  only `launcher.json` to `files add`. Also corrected the adjacent worked-session claim so only the derived
  installer skill, not the author-owned executor front door, is described as auto-rendered.
- Added a static acceptance guard over package-shipped Markdown (`README.md` plus every `docs/**/*.md` file)
  and the real template trees. It checks exact inventories, concrete template commands, deferred-name absence
  across prose/tree/YAML/code, payload-relative `files add` examples, and worked-session version coherence.
  Root `FOUNDATION.md` and `ROADMAP.md` are deliberately outside this scan because the package does not ship
  them.
- Verification: focused unit 85/85; selected built-CLI integration 5/5 (92 filtered); typecheck clean; Biome
  clean across 198 files; build clean; built template lists exactly `project/minimal` and `bundle/default`;
  pre-QA complete built suite 98 files / 1,245 tests passed with zero skips or failures.
- Final review verification: E2E 2/2; documentation guard 11/11; typecheck clean; Biome clean across 199 files;
  build clean; complete built suite 99 files / 1,250 tests passed with zero skips or failures.
- BMAD evidence: `bmad-create-story`, `bmad-dev-story`, and `bmad-qa-generate-e2e-tests` were invoked in that
  order. Each resolved an empty completion hook.

### File List

- `_bmad-output/implementation-artifacts/stories/story-task-101.md` — story contract and execution evidence.
- `docs/10-authoring-cli.md` — actual template catalogs, resolvable worked session, relative payload path.
- `docs/11-authoring-process.md` — explicit minimal/core flow and relative payload registration example.
- `docs/12-builder-architecture.md` — actual built-in inventory/tree/model and resolvable first-run command.
- `_bmad-output/implementation-artifacts/tests/test-summary-task-101.md` — QA automation and coverage record.
- `test/integration/docs-template-examples.e2e.test.ts` — reconciled workflow and atomic legacy-name failures.
- `test/unit/docs/template-documentation-drift.test.ts` — shipped-doc/template/path drift regression guard.

### Change Log

- 2026-08-19: Reconciled shipped template documentation and worked commands with the real CLI registry; added
  cross-artifact drift coverage (TASK-101, `bmad-dev-story`).
- 2026-08-19: Added built-CLI happy/error-path automation and QA evidence (`bmad-qa-generate-e2e-tests`).
- 2026-08-19: Separate-lane `bmad-story-automator-review` widened the shipped-doc boundary, repaired worked-session
  version/path coherence, strengthened regressions, and approved the corrected story.
- 2026-08-19: Persistent separate-lane `bmad-story-automator-review` cycle 2 revalidated the prior fixes and
  approved TASK-101 with the complete 1,250-test gate green.

## Senior Developer Review (AI)

### Outcome

**APPROVE** — both TASK-101 acceptance criteria and the recorded payload-path correction are implemented. The
adversarial review found three blocking documentation/test-quality gaps and two low-severity precision gaps;
all were fixed automatically, and the exact final gate is green.

### Acceptance-criteria audit

- **AC #1 — implemented.** Every shipped worked command now uses the built-in `minimal` project template or the
  default bundle scaffold. The built-binary E2E executes the documented no-`--at` initialization path, creates
  `core@0.3.0`, registers `launcher.json` relative to `payload/files/`, and validates the resulting project.
- **AC #2 — implemented.** The only advertised built-ins are project `minimal` and bundle `default`, matching
  the real descriptor-bearing directories and built `template list` output. Exact deferred identifiers are
  absent from every package-shipped Markdown surface; specialized shapes are described only as project-local.
- **Recorded payload-path correction — implemented.** Docs `10` and `11` stage under `payload/files/` but pass
  only `launcher.json`; static and built-CLI assertions cover both the documented command and stored value.

### Findings and automatic fixes

1. **MEDIUM — fixed:** the drift guard loaded only numbered docs `00`–`14`, although npm ships `README.md`,
   `docs/SDLC.md`, `docs/task-writing-conventions.md`, and any future nested `docs/**/*.md`. It now recursively
   enumerates the shipped docs tree, includes npm's package README, and explicitly excludes unshipped root
   planning docs `FOUNDATION.md` and `ROADMAP.md.
   (`test/unit/docs/template-documentation-drift.test.ts`)
2. **MEDIUM — fixed:** doc `11` created `core@0.3.0` but assigned the worked core recipe task to milestone
   `0.1.0`. The milestone is now `0.3.0`, with a static same-session version-coherence regression.
   (`docs/11-authoring-process.md`, `test/unit/docs/template-documentation-drift.test.ts`)
3. **MEDIUM — fixed:** doc `10` still described no-`--at` initialization as targeting cwd, while the CLI and
   worked sessions use `<cwd>/<name>`; the task E2E also substituted `--at` and did not prove the claimed total
   or IDs. The contract text now matches runtime, and the E2E runs the exact default path and asserts 19 tasks,
   `authoring-9`, and `authoring-10`.
   (`docs/10-authoring-cli.md`, `test/integration/docs-template-examples.e2e.test.ts`)
4. **LOW — fixed:** the ordinary doc `05` phrase “multi-bundle work” was globally removed before scanning every
   document, allowing the same phrase in a real template context elsewhere to evade the guard. The exception is
   now restricted to that one file, sentence, and occurrence.
   (`test/unit/docs/template-documentation-drift.test.ts`)
5. **LOW — fixed:** after changing `project/` to a one-child tree, the `minimal/` branch kept stale continuation
   glyphs. The template inventory diagram now represents the real nesting without phantom siblings.
   (`docs/12-builder-architecture.md`)

### File-list and task audit

- Every application/documentation file in the uncommitted diff is present in the story File List. The Backlog
  record and `.bmad/sdlc-state.yaml` are orchestration-owned; `.serena/` is untouched and excluded.
- Every checked task/subtask has matching documentation or automated evidence. The complete real
  `templates/project/minimal` and `templates/bundle/default` trees, resolver precedence, CLI wiring, package
  contents, task counts/IDs, versions, and payload-relative paths were independently inspected.
- `package.json#files` ships the full `docs/` tree; npm additionally includes `README.md`. Dry-run packing
  confirms root `FOUNDATION.md` and `ROADMAP.md` do not ship, so their deferred roadmap names are out of AC scope.

### Verification

- Workflow evidence: installed `bmad-story-automator-review` was invoked directly. It has no
  `customize.toml`, and no matching team/user override was present, so workflow defaults applied.
- Focused documentation guard: **11/11 passed**.
- TASK-101 built-binary E2E: **2/2 passed**.
- Full local gate: `npm run typecheck` passed; `npm run lint` checked **199 files**; `npm run build` passed;
  `npm test` passed **1,250/1,250 tests across 99 files**, zero skipped or failed.
- Built CLI inventory probes: exactly `project/minimal` and `bundle/default`; `git diff --check` passed.
- Sprint sync: `sprint-status.yaml` covers foundation tasks 1–33 only, so it has no `task-101` key; Backlog.md
  remains authoritative and was intentionally not changed by the reviewer.

### Review cycle 2 revalidation

- **Outcome: APPROVE.** No new HIGH, MEDIUM, LOW, or CRITICAL findings were verified; no application or test
  fixes were required.
- All five cycle-1 findings remain closed: the guard still covers the shipped README and recursive `docs/**/*.md`
  surface, core stays version-coherent at `0.3.0`, the E2E uses the default `<cwd>/<name>` init path and proves
  exactly 19 tasks including `authoring-9`/`authoring-10`, the doc `05` exemption remains occurrence-specific,
  and doc `12` retains the corrected one-child ASCII tree.
- Both acceptance criteria remain proven. Built inventory probes report only `project/minimal` and
  `bundle/default`; the focused guard passed **11/11**, and the built-binary TASK-101 E2E passed **2/2**.
- The recorded payload-path correction remains proven: docs `10` and `11` pass only `launcher.json` to
  `files add`, and the built E2E confirms `bundle.yml` stores `launcher.json` without a `payload/files/` prefix.
- Cycle-2 full gate: typecheck passed; Biome checked **199 files**; build passed; `npm test` passed
  **1,250/1,250 tests across 99 files**; built template inventory probes and `git diff --check` passed.
- Per the review assignment, no sprint, Backlog, branch, commit, or orchestration state was changed.

_Reviewer: persistent separate-lane reviewer, `bmad-story-automator-review`, 2026-08-19._
