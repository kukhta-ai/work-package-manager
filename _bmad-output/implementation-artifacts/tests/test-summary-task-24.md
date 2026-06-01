# Test Automation Summary — task-24 (context resolution)

> bmad-qa-generate-e2e-tests output (sprint-status writes suppressed — orchestrator-owned). Pure service (no
> UI/HTTP), so the "E2E" framing lands as acceptance tests through the public API as a black box, matching the
> repo's `*.acceptance.test.ts` house pattern. Framework: vitest (already present; no new deps).

## Generated tests

### Unit (mechanics) — `test/unit/services/context.test.ts` (bmad-dev-story)
- [x] AC#1a marker at cwd → `{found:true, root: cwd}`
- [x] AC#1b nearest ancestor several levels up → `{found:true, root: ancestor}`
- [x] AC#2a absolute override ignores cwd
- [x] AC#2b relative override resolved against cwd
- [x] AC#2c override dir without marker → `{found:false}` (no walk-up from override)
- [x] AC#3 no marker to fs root → `{found:false}`, asserted not to throw (walk terminates)
- [x] AC#3 cwd === fs root with no marker → `{found:false}`
- [x] nearest-manifest-wins (cwd and ancestor both projects → cwd)
- [x] determinism (same fs+env+opts → identical result)

### Acceptance (black box, AC-framed) — `test/unit/services/context.acceptance.test.ts`
- [x] AC#1 "agent runs a project-bound command from a deep subdirectory" → nearest enclosing manifest; + run from root
- [x] AC#2 "-C/--project pins the project" outside any project; relative override; override wins over an unrelated project on the cwd chain
- [x] AC#3 "running outside any project yields an explicit, inspectable no-project, not a crash"; override-at-non-project → `{found:false}`

## Coverage
- Service `resolveContext`: all three acceptance criteria covered end-to-end + the walk-up termination guarantee + nearest-wins + determinism. Both arms of the `ProjectContext` discriminated union exercised.
- Pure/deterministic: MemoryFileSystem + FakeEnvironment, `/`-rooted paths; no real fs/process/git.

## Result
- `context.test.ts`: 9 passed. `context.acceptance.test.ts`: 7 passed. (Full-suite + tsc + biome verified in the gate below.)

## Next steps
- Command-layer wiring (later task): map `{found:false}` to a NotFoundError naming `manifest.yml` for project-bound commands; `template list`/`show` fall back to built-ins.
