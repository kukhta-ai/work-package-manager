# Story task-3 — Define PR, review, and merge rules

> Lean implementation spec (BMAD create-story output). Documentation/template task: capture the project's
> *actual* PR/review/merge rules, verified against `AGENTS.md`, `docs/SDLC.md` Phase 7, `docs/07`, `docs/12`,
> and the `backlog task 8` gate. No code changes. Must stay consistent with the task-2 branching section.

## Acceptance criteria (the contract)
1. A contributor knows what a PR must satisfy before merge: passing checks, review, and a linked task.
2. The repository's merge behaviour is documented, with the rationale for the chosen strategy.
3. Opening a PR prompts the author for the expected information.
4. The merge gate is the same check suite a contributor runs locally, and the project Definition of Done
   is named as part of it (doc 07).

## Sources verified (don't invent)
- `backlog task 8 --plain`: AC#1 "a failure blocks merge"; AC#2 "the same lint, type, and test gates a
  contributor runs locally"; DoD names the three commands — `tsc --noEmit`, `biome ci`, `vitest` — plus
  "core import-boundary rule is not violated". (This is the merge gate for AC#4.)
- `AGENTS.md` Phase 7: "open a PR `--base dev` (`gh pr create`). The PR must show green CI (the
  three-command gate from task-8)"; "Never self-merge to `dev` or `main`." `User gates`: "merging into
  `dev` or `main`" is a human gate.
- `AGENTS.md` §"Definition of Done": "type-checks and the linter is clean (including the core
  import-boundary rule), tests are added and green, public functions are documented with no dead code,
  every acceptance criterion is observably satisfied and ticked, and the work is committed on its
  sub-branch and merged to `feature/foundation`." → the DoD checklist the PR template carries.
- `docs/SDLC.md` Phase 7: push `feature/foundation`; PR `--base dev`; "[GATE] review PR + merge → dev
  (promotion to main is a separate human decision)".
- `docs/07` §"The enforcement — Definition of Done": the **DoD-as-gate** principle ("recording stops being
  a thing the agent *should* do and becomes a thing it *must* do"). NB: doc 07's DoD is the **install
  contract's** executor-side DoD (effect verified, files checksummed, inverse op recorded). It is **not**
  our development DoD. For AC#4 I echo doc 07's *DoD-as-gate principle* and apply it to **our** development
  DoD (AGENTS.md) — citing doc 07 as the lineage, **not** importing its install-DoD items. Be explicit
  they are different DoDs serving the same enforcement shape; do not conflate.
- `docs/12`: Biome is one tool for lint+format; CI is GitHub Actions, matrix Node LTS × {Linux, macOS,
  Windows}. (Note: the merge gate runs `biome ci` — CI mode; a contributor runs `biome check` locally; same
  rules. State this precisely so AC#4's "same suite" is accurate, not sloppy.)
- task-2 `CONTRIBUTING.md` §"Story-branch lifecycle": story branches merge back **`--no-ff`** "so the merge
  is an explicit, revertable unit"; then deleted. → align the merge-strategy wording with this exactly.

## Deliverables
1. **Append** `## Pull requests, review & merge` to `CONTRIBUTING.md` after the branching section (the
   task-2 "Section ownership" note reserved this slot). Don't reflow the branching section.
2. **Create** `.github/PULL_REQUEST_TEMPLATE.md` (AC#3) — GitHub auto-populates a new PR's body from it.

### `## Pull requests, review & merge` outline (what to write)
- intro: where this fits; PRs are how epic work reaches `dev` (Phase 7); this governs our development.
- `### What a pull request must satisfy before merge` (AC#1) — three bullets:
  - **Passing checks** — the three-command gate (`tsc --noEmit` + `biome ci` + `vitest`), the SAME suite
    run locally + in CI (task-8); a failure blocks merge.
  - **Review** — ≥1 approving review; **never self-merge** (AGENTS.md). Merging into `dev`/`main` is a
    human gate.
  - **A linked backlog task** — every PR traces to a `task-<id>` Backlog.md story (`Closes`/`Relates to`).
- `### Merge strategy and why` (AC#2) — story→epic uses **`--no-ff`** (each story an explicit, revertable
  merge unit; preserves per-story history vs flattening — hence not squash/rebase for these). Epic→`dev`
  via reviewed PR (`gh pr create --base dev`). `dev → main` is a separate deliberate human decision. State
  the choice AND the rationale.
- `### The merge gate is the local check suite` (AC#4) — the exact gate blocking a merge is the same three
  commands a contributor runs locally (name `biome ci` vs `biome check` distinction); and the project
  **Definition of Done** (typecheck+Biome clean incl. core import-boundary rule; tests added+green; public
  functions documented / no dead code) is a **named, explicit** part of what a PR meets — echoing doc 07's
  DoD-as-gate. Point at the PR template's DoD checklist.
- `### Opening a pull request` — what the author provides (summary, linked task, DoD checklist, pasted gate
  result, green-CI confirmation); note the `.github/PULL_REQUEST_TEMPLATE.md` auto-fills these.

### `.github/PULL_REQUEST_TEMPLATE.md` content (AC#3) — concise + usable
- **Summary** of the change.
- **Linked task**: `Closes task-<id>` / `Relates to task-<id>`.
- **Definition of Done** checklist (checkboxes): typecheck + Biome clean (incl. core import-boundary rule);
  tests added + green (unit/integration as fits); public functions documented / no dead code; every AC
  observably satisfied.
- **How verified**: paste the three-command gate output.
- **CI**: confirm green (the same three-command gate, all OS/Node in the matrix).
- A short reviewer reminder: no self-merge; ≥1 approval.

## Tests / DoD (doc/template task)
- DoD#1: no code change → `tsc`/`biome`/`vitest` stay green; run all three to confirm. (`CONTRIBUTING.md`
  and `.github/PULL_REQUEST_TEMPLATE.md` are outside the compiled/tested set; verify biome doesn't trip on
  the new `.md`.)
- DoD#2: no testable code logic; no brittle string-match tests — green suite satisfies it (orchestrator
  records).
- DoD#3: N/A public functions; prose clear, self-consistent, and aligned with the task-2 branching section.

## Boundaries (do NOT do here)
- Don't write versioning/release rules (task-4) or the CI workflow file (task-8) — only reference task-8's
  gate as the merge gate. Don't edit `AGENTS.md`, `docs/`, `backlog/`, `.bmad/`, or the task-2 branching
  section's existing prose.
