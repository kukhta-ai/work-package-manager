# Epics & Stories — work-package-manager (`wpm`) — BMAD projection shim

> **Authoritative source**: `FOUNDATION.md` (the 33 foundational tasks, in dependency order) and the
> live **Backlog.md** backlog under `backlog/` (the tasks themselves, each already carrying acceptance
> criteria + Definition of Done). This file is a BMAD-required projection of those; it is **NOT** a
> second source of truth, and it **invents no new epics or stories**. The Backlog.md tasks are the
> authoritative per-story state; this shim only points at them. **Backlog.md is operated through its CLI
> only** — this shim does **not** create or edit any task (a repo hook forbids touching `backlog/`, and
> the tasks already exist). Where this file and FOUNDATION.md / the backlog disagree, those win.

---

## The single epic in flight

**Epic-1 — the foundational backlog** (`FOUNDATION.md`): stand up the project that ships the `wpm` CLI,
building doc `13`'s hexagon **bottom-up** — toolchain → model + ports → services → operations/lifecycle →
CLI/driving adapter → built-in content → a walking skeleton that proves it composes. These tasks are the
**substrate every CLI-command leaf later stands on**; none is a command itself (those come later, one task
per command in doc `10`'s tree — see "Out of scope"). (FOUNDATION.md intro.)

**Its 33 stories are the existing Backlog.md tasks `TASK-1 … TASK-33`** — already created, each with
acceptance criteria + a 3-item Definition of Done. **Story state is whatever Backlog.md reports** (`To
Do` / `In Progress` / `Done`, ticked AC/DoD); `backlog sequence list` reports which task is ready next.
The **build order is FOUNDATION.md's dependency order** — and FOUNDATION.md establishes (verified by
topological sort) that **id order is itself a valid build order**, so build ascending. (FOUNDATION.md
§"Build order", §"Ids are in dependency order".)

A **project-level Definition of Done** in `backlog/config.yml` gates every task — typecheck clean (`tsc
--noEmit`), Biome clean (`biome ci`), tests green (vitest), and **no core-boundary violation** — dogfooding
the DoD-as-gate idea from doc `07`. (FOUNDATION.md intro; confirmed present on each task record, e.g.
TASK-6/TASK-25/TASK-33.)

---

## The six phases (FOUNDATION.md) — a reading aid, not task metadata

FOUNDATION.md groups the 33 stories into phases A–G for readability (the tasks themselves carry no phase
label — the project's plain-task ethos, doc `11`):

- **Phase A · Repository, conventions, and toolchain (TASK-1 … TASK-9)** — a runnable, testable,
  CI-backed Node+TS (ESM) package; how the team works in the repo; and the builder's own dogfood backlog.
  Conventions + code-quality tooling come *before* CI because CI enforces them: Biome (pinned exact) with
  the `noRestrictedImports` core-boundary rule, husky + lint-staged pre-commit, and CI as the real
  three-command gate (`biome ci` + `tsc --noEmit` + vitest, matrix on Node LTS × OS).
- **Phase B · Domain model and ports (TASK-10 … TASK-15)** — the pure inside and the driven edges of the
  hexagon (doc `13` §2/§3): branded model + the three schemas, and the four ports (FileSystem,
  comment-preserving YAML inside it, BacklogMd, Clock/Environment), each with a real adapter and a fake,
  unit-tested in isolation.
- **Phase C · Services (TASK-16 … TASK-22)** — the pure logic tier (doc `13` §4): render engine, two-tier
  template resolution, version-constraint resolution, the derived-artefacts service (incl. scope-alias
  planning), validate, authoring-task materialisation, and integrity (vendored-content hashing +
  `wpm.lock`).
- **Phase D · Operations, lifecycle, errors, context (TASK-23 … TASK-26)** — the use-case tier and the
  cross-cutting machinery (doc `13` §5–§7): the typed error model + exit-code mapping, context resolution,
  the **shared mutation lifecycle harness** (the six beats), and **one representative operation
  end-to-end** through it. This is the framework each later command leaf plugs into.
- **Phase E · CLI / driving adapter (TASK-27 … TASK-29)** — the driving edge every command shares: the
  commander composition root + registration pattern + DI + error handler, the `--help` content contract,
  and tab-completion plumbing. After this, a command leaf is "fill in one operation + register one
  command."
- **Phase F · Built-in content (TASK-30 … TASK-32)** — the least authored content a command can be tested
  against: the minimal project template (AGENTS.md, RALPH-LOOP.md, orchestrator skill, snippets), the
  default bundle template, and the builder's own agent skill. (The rest of the template set is follow-on
  content.)
- **Phase G · Walking skeleton (TASK-33)** — one thin vertical thread through every layer, in an
  integration test against a real tmpdir: the **"foundation complete" checkpoint**, proof the hexagon
  composes before the per-command leaves are filled in.

---

## The critical path to the walking skeleton (TASK-33)

FOUNDATION.md §"Build order" gives the critical path:

```
TASK-1 → TASK-6 → TASK-10 → TASK-11 → TASK-16 → TASK-19 → TASK-25 → TASK-26 → TASK-33
```

with two spines joining at TASK-33:

- the **CLI spine** — `TASK-12, TASK-14, TASK-15, TASK-23 → TASK-27` (ports + error model → composition
  root), and
- the **minimal template** — `TASK-16 → TASK-30`.

TASK-33 itself depends on **TASK-26, TASK-27, TASK-30** (the representative operation, the CLI spine, and
the minimal template). The "very beginning" is TASK-1, the conventions (TASK-2 … TASK-4), and the
model+ports (TASK-10 … TASK-15); everything else unlocks once those land. (FOUNDATION.md §"Build order".)

---

## How the stories map to doc `13` (FOUNDATION.md §"How this maps to doc 13")

Phase B = the model (doc `13` §2) and ports (§3); Phase C = the services tier (§4); Phase D = the
operations tier (§5), the shared mutation lifecycle (§5), the error model (§7), and context resolution
(§7); Phase E = the driving adapter / composition root (§1, §6). The representative operation (TASK-26)
and the walking skeleton (TASK-33) exist to prove the ports-and-adapters composition end-to-end before the
per-command work begins — exactly the boundary doc `13` draws between *delivery* (the builder's job) and
*execution* (the agent's). (FOUNDATION.md §"How this maps to doc 13".)

---

## Out of scope for epic-1 (FOUNDATION.md §"What is deliberately NOT here")

Not part of this epic — **do not invent these as stories here**:

- **The CLI command leaves** (`init`, `project meta`, `bundle new`, `bundle <id> files add`, `build`, …) —
  one task each, added later per user scenario, each standing up its operation (the lifecycle from
  TASK-25) and registering its command (the pattern from TASK-27).
- **The full template set** beyond `minimal` + `default` (single-bundle, multi-bundle, with-payload-skill,
  adopts-system-tool) — follow-on content.
- **The per-command authoring-task catalogs** (doc `11`) — the materialisation *engine* (TASK-21) is
  foundational; each command's specific catalog ships with that command.
- **Distribution/publish wiring** (`build package/publish`, the npm release) — later command work; TASK-4
  settles the *conventions* and TASK-22 settles lockfile *verification*, but the publish command itself
  comes with the command leaves.

(FOUNDATION.md §"What is deliberately NOT here".)
