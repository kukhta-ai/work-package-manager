# Story task-94: Update the README and first-run UX for the workspace flow

Status: ready-for-dev

<!-- Created by driving bmad-create-story from the design docs (stated fallback): task-94 lives in the
     Backlog.md `backlog/` root, not in the epic-1 sprint-status mirror, so the skill's sprint-driven
     auto-discovery cannot select it. Per CLAUDE.md "How the doc-set maps onto BMAD", the planning
     artifacts are docs/00-14; this story is steered from docs 00/01/06/10/12 + the task ACs.
     sprint-status.yaml is intentionally NOT mutated. Docs-only task: qa-generate-e2e-tests is N/A. -->

## Story

As a **human evaluating or adopting `wpm`**,
I want the README's onboarding to walk me through the *authoring workspace* flow that the tool now implements,
so that I install the authoring skill, scaffold a workspace, author the deliverable through my agent, and build a distributable — without being misled by the older "author at the project root" description.

## Acceptance Criteria

(verbatim from `backlog task 94 --plain`)

1. The README first-run walkthrough covers installing the authoring skill and creating a workspace, then authoring through the agent and building into the build-output directory.
2. The README describes the workspace layout (authoring root, deliverable subdirectory, build output) and which parts ship.
3. The README states the authoring skill is the authoring-agent instruction surface and how to install or reinstall it.
4. The README no longer describes the deliverable as authored at the project root.

## Tasks / Subtasks

- [ ] Add a "Getting started" / first-run walkthrough to README.md (AC: #1, #3)
  - [ ] Step 1: install `wpm` + the `backlog.md` peer dep (reuse the existing Prerequisites facts).
  - [ ] Step 2: `wpm skill install` — install the bundled `installer-builder` authoring skill into the user agent skill scope; note it is idempotent (reinstall to update).
  - [ ] Step 3: `wpm init <name>` — scaffold an authoring workspace; `cd` into it.
  - [ ] Step 4: author through the agent (the agent reads the authoring front door + drives the CLI via the installed skill, against the `.authoring-backlog/`).
  - [ ] Step 5: `wpm build` — package the `wip/` deliverable into `builds/`.
- [ ] Add a "workspace layout" description (AC: #2, #4)
  - [ ] Name the three regions: authoring workspace root (authoring front door + `.authoring-backlog/`), deliverable subdirectory `wip/`, build-output directory `builds/`.
  - [ ] State which parts ship: only `wip/` un-nested; the wrapper (authoring front door, `.authoring-backlog/`, `builds/`) never ships.
  - [ ] Ensure no remaining claim describes the deliverable as authored at the project root.
- [ ] State the authoring skill is the authoring-agent instruction surface (AC: #3)
  - [ ] `wpm skill install` is how to install/reinstall it; reinstall is idempotent and reports installed-vs-updated per scope.

## Dev Notes

- **Scope**: edit ONLY `README.md` (+ this story artifact). No code, no other docs, no backlog edits, no commits. Verified the implemented surface against `src/cli.ts` (`initModule`, `skillModule`, `buildModule`) and `src/core/operations/init-project.ts` / `install-authoring-skill.ts`.
- **First-run flow (AC#1)** — doc 12 §"The generated authoring workspace", doc 01 §"The author works inside a workspace", doc 10 §"Project context resolution". The order is: install wpm + `backlog.md` (existing Prerequisites), `wpm skill install`, `wpm init <name>`, `cd <name>`, author through the agent, `wpm build`.
- **Commands verified against the code (do not invent flags)**:
  - `wpm skill install` — `skillModule` (cli.ts ~3291). Copies the bundled `installer-builder` skill into detected user agent scopes (`~/.claude/skills`, `~/.agents/skills`, `~/.hermes/skills`, `~/.openclaw/skills`); idempotent, reports installed/updated per scope; exits non-zero if no supported scope is detected. `AUTHORING_SKILL_NAME = "installer-builder"`.
  - `wpm init <name> [--at <path>] [--template <name>] [--list-templates] [--param k=v]` — `initModule` (cli.ts ~2211). Default template `minimal`; default target dir is `<cwd>/<name>`. Scaffolds the workspace; prints a `wpm skill install` tip when the skill is absent.
  - `wpm build` group — `buildModule` (cli.ts ~3056): `build dry-run`, `build package [--format zip|tarball|git]`, `build publish <destination>`. Per the task brief and doc 10/12, describe build's INTENT ("packages the `wip/` deliverable into `builds/`") at the README level without over-promising the builds/-routing detail still being finalized (task-89). Doc 10 row 125: "build — project-bound · package the wip/ deliverable into builds/".
- **Workspace layout (AC#2)** — doc 06 §"Authoring workspace vs. shipped artifact" + doc 12 §"The generated authoring workspace". Three regions: workspace root (authoring front door `AGENTS.md`/`CLAUDE.md` + `.authoring-backlog/`), `wip/` (the deliverable), `builds/` (build output). Only `wip/` un-nested ships; the wrapper never ships (`.gitignore` excludes `.authoring-backlog/` + `builds/`).
- **Authoring skill = instruction surface (AC#3)** — doc 12 §"The bundled agent skill": the `installer-builder` skill is what makes the CLI agent-idiomatic; the authoring front door points the agent at it. Reinstall via `wpm skill install` (idempotent).
- **Remove flat/project-root claim (AC#4)** — the current README has no explicit "author at the project root" walkthrough (it documents only install/prereqs/dev), but the new layout section must state the deliverable lives under `wip/`, not at the project root, so no reader infers the old flat model. Keep the existing tone/structure (the intro, Prerequisites, "What's in here", Development sections stay).

### Project Structure Notes

- README.md is the only product file changed. The existing sections (intro, Prerequisites, What's in here, Where to start, Development, "A note on the word installer") are preserved; a first-run walkthrough + workspace-layout description are added, placed to read naturally for a newcomer (after Prerequisites / before deep design reading).

### References

- [Source: docs/00-foundation-and-lineage.md] (model + vocabulary: work-package, bundle, deliverable)
- [Source: docs/01-the-author-experience.md#The-author-works-inside-a-workspace-not-on-the-bare-deliverable]
- [Source: docs/06-artifact-structure.md#Authoring-workspace-vs-shipped-artifact]
- [Source: docs/10-authoring-cli.md] (`init`, `build`, `skill install` surface; project context resolution)
- [Source: docs/12-builder-architecture.md#The-generated-authoring-workspace] + #The-bundled-agent-skill

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD worker, create-story + dev-story driven from docs as stated fallback)

### Completion Notes List

- BMAD: `bmad-create-story` was invoked (loaded) but gates on the epic-1 sprint-status mirror, which excludes
  task-94 (and the mirror must not be mutated); `dev-story` gates the same way. Per CLAUDE.md Rule 3's stated
  fallback, both were driven from the docs (00/01/06/10/12) + the task ACs. `qa-generate-e2e-tests` is N/A
  (docs-only task). This file is the create-story artifact.

### File List

- `README.md` (first-run walkthrough + workspace-layout section; removed any flat/project-root framing)
</content>
</invoke>
