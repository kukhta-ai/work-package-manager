---
id: TASK-33
title: 'Walking skeleton: one vertical slice through every layer'
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 11:01'
labels: []
dependencies:
  - TASK-26
  - TASK-27
  - TASK-30
ordinal: 33000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single command-line invocation drives a real change on disk through every layer — from the command surface, through context resolution and an operation, down to the file system — observed in a real working directory
- [x] #2 The exercised slice is the smallest meaningful one (for example, producing a project from the minimal template and confirming the files exist), not a complete command
- [x] #3 Passing this demonstrates the layers compose end to end, and it is recorded as the 'foundation complete' checkpoint before per-command work begins
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WALKING SKELETON / FOUNDATION COMPLETE. A single real wpm init <name> drives a real change on disk through every layer (commander -> the bootstrap initProject operation -> the services -> both real ports -> real disk), verified three ways: run() over a real NodeFileSystem in a tmpdir, the built dist/cli.js binary (default-cwd <cwd>/<name> + --at), and the real backlog CLI (.authoring-backlog). src/core/operations/init-project.ts: the BOOTSTRAP op (doc 13 §5; NOT runMutation/resolveContext -- init is project-creating, no context to load); the smallest meaningful slice (doc-10 init steps 1-4 + 8 + the empty .authoring-backlog): resolve the minimal template (NotFoundError) -> refuse if manifest exists (ConflictError) -> copy files/ with {{project-name}} -> render the front-door + orchestrator from snippets/ via makeArtefactDeriver (the SINGLE source) -> init .authoring-backlog. boundary-clean (node:path + services/model/ports/errors). src/cli.ts: the init groupOnly placeholder is now a real init <name> command (--at, withExamples per task-28, completion spec per task-29). AC1: real-disk E2E, manifest parses, zero {{}} markers, re-run on existing target -> ConflictError changing nothing. AC2: smallest slice (no bundles/, aliases, materialisation, .gitignore -- those are the full init, tasks 34-84). AC3: the hexagon composes end-to-end -- FOUNDATION COMPLETE checkpoint. RESOLVED the task-30 forward-note: removed files/AGENTS.md.tmpl + files/orchestrator SKILL.md.tmpl (snippets-only single source); init renders them from snippets per doc-10 step 8; drift-guard test replaced with a single-source assertion; minimal-project tests updated; coverage preserved. FIX (found via the real-backlog test, only the real edges catch it): initProject must fs.makeDirectories(authoringRoot) BEFORE backlog.init (the real adapter shells out cwd=root). Documented the FakeBacklog.init parity trap in its JSDoc (the SHOULD from review). BMAD skills (reliable worker): create-story, dev-story, qa-generate-e2e-tests. Reviewer ran story-automator-review -> APPROVE, readiness=YES (ready for the Phase-6 gate). Gate (fresh dist): tsc 0, biome 0 warnings, vitest 527 passed (binary + real-backlog tests RAN), npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
