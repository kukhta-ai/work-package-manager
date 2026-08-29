---
id: TASK-29
title: Wire tab-completion plumbing
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 10:37'
labels: []
dependencies:
  - TASK-27
ordinal: 29000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A user can install shell completion for the common shells (doc 12)
- [x] #2 Options with a fixed set of valid values complete to those values
- [x] #3 Completions that depend on project state are produced by named sources that later command work can supply, without restructuring the completion wiring
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wired tab-completion (omelette 0.4.17) on the task-27 root. src/completion/: a named-source REGISTRY (registry.ts) mapping a source name to a resolver + a COMPLETION_SPECS side-table (command path -> option/arg source names); completeArgv (complete.ts) derives command/subcommand/flag suggestions from the commander tree and resolves value positions via the registry; enum sources (enums.ts) for the doc-10 finite sets (bump-levels/build-formats/confirmation-levels/task-kinds/template-scopes/shells); state-dependent sources (bundle-ids/template-names/agent-names) resolve through the ports + pure core (resolveContext honoring -C, parseManifest, listTemplates), returning [] never throwing. src/util/completion-install.ts emits the script (omelette PURE generators only) + ensures an idempotent loader block, through the FileSystem port. AC1: completion install [--shell] writes shell-correct bash/zsh/fish scripts + sources them idempotently; bad shell -> UsageError exit 2. AC2: fixed enums complete + prefix-filter. AC3: a 34-84 leaf adds a state-dependent completion by registering a named source + a spec entry, with NO change to completeArgv (extensibility test proves it). DIVERGENCE (recorded): omelette's runtime is process.exit-driven/not-commander-aware/raw-node:fs, incompatible with the task-27 testable ports architecture, so we use only its pure script generators + a custom ports-pure completeArgv dispatch -- faithful to doc 12 (omelette generates the scripts + dispatches via a callback). MUST-FIX (found by orchestrator verification, fixed): the omelette-generated script calls wpm --comp<shell> --compgen, NOT __complete, so the CLI's __complete-only intercept meant real-shell completion was DEAD; fixed run() to intercept the real --comp<shell>/--compgen protocol (byte-accurate to omelette 0.4.17) + added a loop-closure test (extract the callback from generateScript(shell), run it through run(), assert) for all three shells; independently verified against the built binary. BMAD skills: create-story, dev-story, qa-generate-e2e-tests (+ dev-story for the fix). Reviewer ran story-automator-review -> APPROVE (re-verified the loop closes 3 ways). Fixed NIT N1 (redundant loaderLine ternary). S1 (binary test silently skips without a dist build) is NOT a CI gap -- ci.yml builds (npm run build) before npm test; the Phase-6 cold E2E must follow the same sequence (npm ci -> typecheck -> biome ci -> build -> test) so the binary tests run. Gate: tsc 0, biome 0 warnings, vitest 511 passed, npm ci 0; omelette 0.4.17 exact.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
