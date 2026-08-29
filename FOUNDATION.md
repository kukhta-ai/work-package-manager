# Foundational Backlog — the installer-builder

The **builder's own development backlog** (docs `12`/`13`): the project that ships the `wpm`
CLI, dogfooding Backlog.md to track its own construction. These 33 tasks are the **substrate every
CLI-command leaf stands on** — none is a command itself (those come later, one task per command in
the tree of `10`); together they are everything `wpm init` / `bundle new` / `build` need to
exist before they can be written.

The shape follows doc `13`'s hexagon, built **bottom-up**: toolchain → model + ports → services →
operations/lifecycle → CLI/driving adapter → content → a walking skeleton that proves it composes.
Tasks are plain Backlog.md tasks (title + acceptance criteria + deps), honoring the project's own
plain-task ethos (`11`); the phases below are a reading aid, not task metadata. A project-level
Definition of Done in `config.yml` — typecheck clean, Biome clean, tests green, no core-boundary
violation — gates every task, dogfooding the DoD-as-gate idea from `07`.

**Ids are in dependency order: id order is a valid build order** (verified acyclic by topological
sort). This rebuild also folds the dev-process conventions into Phase A in sequence, fixing the
earlier id/order mismatch.

## Phase A · Repository, conventions, and toolchain  (task-1 … task-9)

Stand up a runnable, testable, CI-backed Node+TS (ESM) package; settle how the team works in the
repo; and wire the builder's own backlog. Conventions and the code-quality tooling come *before* CI,
because CI enforces them.

- **task-1** — Initialize the Node + TypeScript (ESM) package
- **task-2** — Define the branching model and branch-naming convention · needs 1
- **task-3** — Define PR, review, and merge rules · needs 2
- **task-4** — Define versioning, release, and changelog conventions · needs 1
- **task-5** — Set up Biome (lint + format) and pre-commit hooks · needs 1
- **task-6** — Set up the vitest test harness · needs 1
- **task-7** — Establish the build and dev workflow · needs 1
- **task-8** — Add continuous integration (biome ci + tsc --noEmit + vitest; matrix) · needs 2,3,4,5,6
- **task-9** — Configure the builder's own dogfood backlog and agent front door · needs 1

Code quality is settled here per the research recommendation: **Biome** as the single lint+format
tool (pinned exact), a **`noRestrictedImports` rule encoding doc `13`'s core import-boundary**,
format-on-save in the editor, **husky + lint-staged** for a fast staged-only pre-commit, and CI as
the real three-command gate. Conventions split by size into branching+naming (2), PR/review/merge
(3), and versioning/release/changelog (4).

## Phase B · Domain model and ports  (task-10 … task-15)

The pure inside and the driven edges of the hexagon (`13`). Everything here is unit-tested in
isolation; the ports each get a real adapter and a fake.

- **task-10** — Define the domain model and branded types · needs 6
- **task-11** — Implement the three schemas with validators · needs 10
- **task-12** — Implement the FileSystem port (real + in-memory adapters) · needs 6
- **task-13** — Implement comment-preserving YAML · needs 12
- **task-14** — Implement the BacklogMd port (real shell-out + fake) · needs 6
- **task-15** — Implement the Clock and Environment ports · needs 6

## Phase C · Services  (task-16 … task-22)

The pure logic tier (`13` §4): focused, mostly-pure units the operations compose.

- **task-16** — Implement the template render engine · needs 11
- **task-17** — Implement two-tier template resolution · needs 11,12
- **task-18** — Implement version-constraint resolution · needs 10
- **task-19** — Implement the derived-artefacts service (incl. scope-alias planning) · needs 11,16
- **task-20** — Implement the validate service · needs 11,18
- **task-21** — Implement the authoring-task materialisation service · needs 14
- **task-22** — Implement the integrity service (vendored-content hashing + wpm.lock) · needs 12

## Phase D · Operations, lifecycle, errors, context  (task-23 … task-26)

The use-case tier and the cross-cutting machinery every operation rides on (`13` §5–§7). This is the
framework each later command leaf plugs into.

- **task-23** — Define the typed error model and exit-code mapping · needs 10
- **task-24** — Implement context resolution · needs 11,12,15
- **task-25** — Implement the shared mutation lifecycle harness · needs 19,21,23,24
- **task-26** — Implement one representative operation end-to-end through the lifecycle · needs 17,25

## Phase E · CLI / driving adapter  (task-27 … task-29)

The driving edge: the plumbing every command shares. After this, a command leaf is "fill in one
operation + register one command."

- **task-27** — Build the commander composition root, registration pattern, DI, and error handler · needs 12,14,15,23
- **task-28** — Wire the --help content contract · needs 27
- **task-29** — Wire tab-completion plumbing · needs 27

## Phase F · Built-in content  (task-30 … task-32)

The least authored content a command can be tested against. (The rest of the template set —
single-bundle, multi-bundle, with-payload-skill, adopts-system-tool — is follow-on content.)

- **task-30** — Author the minimal project template (AGENTS.md, RALPH-LOOP.md, orchestrator skill, snippets) · needs 16
- **task-31** — Author the default bundle template · needs 16
- **task-32** — Author the builder's own agent skill · needs 9

## Phase G · Walking skeleton  (task-33)

One thin vertical thread through every layer, in an integration test against a real tmpdir — the
**"foundation complete" checkpoint**, proof the hexagon composes before the per-command leaves are
filled in.

- **task-33** — Walking skeleton: one vertical slice through every layer · needs 26,27,30

## What is deliberately NOT here

- **The CLI command leaves** (`init`, `project meta`, `bundle new`, `bundle <id> files add`, `build`, …)
  — one task each, added per user scenario, each standing up its operation (the lifecycle from
  task-25) and registering its command (the pattern from task-27).
- **The full template set** beyond `minimal` + `default` — follow-on content.
- **The per-command authoring-task catalogs** (`11`) — the materialisation *engine* (task-21) is
  foundational; each command's specific catalog ships with that command.
- **Distribution/publish wiring** (`build package/publish`, the npm release) — later command work;
  task-4 settles the *conventions*, the integrity service (task-22) settles lockfile *verification*,
  but the publish command itself comes with the command leaves.

## Build order

Id order is itself a valid topological order, so build ascending. The critical path to the skeleton:
`1 → 6 → 10 → 11 → 16 → 19 → 25 → 26 → 33`, with the CLI spine (`12,14,15,23 → 27`) and the minimal
template (`16 → 30`) joining at 33. The true "very beginning" is task-1, the conventions (2–4), and
the model+ports (10–15); everything else unlocks once those land.

## How this maps to doc 13

Phase B = the model (`13` §2) and ports (§3); Phase C = the services tier (§4); Phase D = the
operations tier (§5), the shared mutation lifecycle (§5), the error model (§7), and context
resolution (§7); Phase E = the driving adapter / composition root (§1, §6). The representative
operation (task-26) and the walking skeleton (task-33) exist to prove the ports-and-adapters
composition end-to-end before the per-command work begins — exactly the boundary `13` draws between
*delivery* (the builder's job) and *execution* (the agent's).
