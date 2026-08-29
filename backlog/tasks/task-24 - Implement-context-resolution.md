---
id: TASK-24
title: Implement context resolution
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 02:55'
labels: []
dependencies:
  - TASK-11
  - TASK-12
  - TASK-15
ordinal: 24000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 From any working directory inside a project, the project root is located by searching upward for its manifest (doc 13)
- [x] #2 An explicit override can point at a project regardless of the working directory
- [x] #3 When no project is found, the outcome says so explicitly, so callers that work without one can proceed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Context resolution src/core/services/context.ts (PURE over the Environment + FileSystem ports + node:path; no node:fs; boundary-clean). resolveContext(deps{fs,env}, opts?{projectOverride}) -> discriminated ProjectContext {found:true,root} | {found:false} -- NEVER throws/prints (no-project is DATA: the command maps it to NotFoundError for project-bound commands, or template list/show tolerate it with built-ins). PROJECT_MARKER='manifest.yml'. AC#1 walk-up: checks the STARTING cwd first then each ancestor via dirname, returns the NEAREST dir containing the marker (nearest-wins). AC#2 override: resolve(env.cwd(), override) (absolute -> itself, relative -> vs cwd), marker checked at THAT dir ONLY (no walk-up), WINS over a cwd-chain project. AC#3 explicit no-project + TERMINATES: the while-loop stops at the fs root (dirname(dir)===dir) -- reviewer instrumented it: exactly depth+1 fs.exists calls, never hangs/steps-past-root; {found:false} on both the walk-up-miss and the override-miss (test wraps in .not.toThrow). Edge cases verified: cwd IS root, override '.'/'' resolve to cwd safely, root-only marker, deep cwd. SKILLS RUN (Rule 3): worker bmad-create-story + bmad-dev-story + bmad-qa-generate-e2e-tests (all head-less, sprint-status suppressed); reviewer bmad-story-automator-review (report-only) -> APPROVE, zero findings. No new deps. Gate green (tsc 0 / biome 89 / vitest 365 / npm ci clean, single process).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
