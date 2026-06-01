# Test Automation Summary — task-26 (createBundle end-to-end through the lifecycle)

> bmad-qa-generate-e2e-tests output (sprint-status writes suppressed — orchestrator-owned). The composition
> proof is a pure operation (no UI/HTTP/CLI — its no-CLI-in-the-loop is AC#2), so the "E2E" framing lands as
> acceptance tests through the public operation API as a black box, matching the repo's `*.acceptance.test.ts`
> house pattern. Framework: vitest (already present; no new deps).

## Generated tests

### Unit (mechanics) — `test/unit/operations/create-bundle.test.ts` (bmad-dev-story) — 11
- [x] AC#1 five sub-steps: validate → scaffold from template (bundle.yml parses id "web"; installer-skills/ + install-backlog/config.yml present) → record in manifest (lists "web"; seeded COMMENT survives) → front-door re-derived (lists "- web bundle"; `# demo`) → all 12 doc-11 tasks materialised; OperationResult observable
- [x] AC#1 aliases NON-broken: per-bundle `bundles/web/.claude/skills` + root `/proj/.claude/skills` exist, targets resolve (the task-25 faithful `exists`)
- [x] AC#3 the spec only declares check/apply/materialise; harness drove ④/⑤
- [x] errors: reserved id "list" → ValidationError (nothing changed); non-kebab "a--b" → ValidationError; duplicate "web" → ConflictError (manifest + backlog unchanged on the failed re-run)
- [x] `--no-advisor` → 11 tasks, no "Write advisor content for core"
- [x] `perBundleAuthoringTasks` unit: 12 with advisor / 11 without; every task has ≥1 AC
- [x] `makeArtefactDeriver` unit: resolves the fixture project template, front-door lists the bundles

### Acceptance (black box, AC-framed, NO CLI) — `test/unit/operations/create-bundle.acceptance.test.ts` — 3
- [x] AC#1 "the bundle-new use case runs the full six-beat lifecycle" — `web-handoff` end-to-end; all five sub-steps observable; 12 doc-11 tasks
- [x] AC#2 "an operation returns data; the CLI is not in the loop" — outcome fully readable from OperationResult + the fakes; per-bundle alias non-broken; no commander/cli.ts imported
- [x] AC#3 "the operation is pure composition; the harness wires the lifecycle" — task-17 resolve + task-16 render + task-13 comment-preserving edit + task-19 derive + task-21 materialise composed around the spec; second bundle (`doc-handoff`) leaves the first's front-door entry intact and adds the new one (rerender idempotency)

## Coverage
- `createBundle` (the `bundle new` use case): all six beats end-to-end via `runMutation`; the doc-11 §3 12-task catalog (and 11 under `--no-advisor`); the ②-CHECK error paths (reserved/kebab/duplicate); comment-preserving manifest append (task-13 `editYaml`); the concrete `makeArtefactDeriver` (task-19) wired as the harness's ④ capability.
- doc-11 authoring tasks materialised (cite doc 11 §3 "Materialised by `wpm bundle new <id>`"): Plan / Fill install-backlog / Author payload / Scaffold payload skill / Write advisor content (advisor-on only) / Verify step slug uniqueness / Verify DoD compliance / Verify payload references / Verify skill registration / Verify version constraints / Review install-backlog independence / Simulate fresh-install executor — all with doc-11 ACs verbatim.

## Notable divergence / fixture note
- The agent→alias map (task-19 `agent-aliases.ts`) keys on `claude-code` (doc 06/10 canonical name), NOT `claude`. The fixtures target `claude-code` so `scopePlan` emits the `.claude/skills` aliases; an unknown target (e.g. `claude`) is correctly dropped to `unknownTargets` with no alias. No product change — a fixture-correctness detail.

## Result
- `create-bundle.test.ts`: 11 passed. `create-bundle.acceptance.test.ts`: 3 passed. (Full-suite + tsc + biome 0-warnings verified in the gate.)

## Next steps
- task-27: commander composition root + DI + error handler + `src/util/exit.ts` (wires the real `makeArtefactDeriver` + `createBundleSpec` behind the CLI).
