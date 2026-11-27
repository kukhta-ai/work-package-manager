---
id: TASK-28
title: Wire the --help content contract
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-06-01 09:59'
labels: []
dependencies:
  - TASK-27
ordinal: 28000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every command's help shows how to invoke it, its options with their effects, and at least one worked example (doc 10 discoverability)
- [x] #2 No registered command has empty or missing help
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wired the --help content contract (doc 10 discoverability) on the task-27 commander root. src/help/examples.ts: withExamples(command, examples) attaches a worked example via commander .addHelpText('after', ...) -- the one piece of doc-10's contract commander does not auto-render (it already gives the description, the Usage synopsis, each option's effect + default, and each .argument's meaning). bundle new now declares .argument('<id>', meaning) (fixing a <id> double-registration) + a worked example. AC#1: bundle new --help renders description + Usage + Arguments(<id> meaning) + options-with-effects/defaults + an Example block; -h equals --help; --help exits 0. AC#2: a completeness GUARD walks every registered command recursively and asserts non-empty description + a Usage line + (for commands with own options or a positional arg) a worked example -- using the fully-rendered help (outputHelp/fullHelp, NOT helpInformation which omits addHelpText). The reviewer constructed every failure scenario and confirmed the guard BITES (empty-desc/no-usage/missing-example all caught) and is correctly scoped (bare groups exempt, doc-10's 'where the flag set is non-trivial') -- so the 51 leaves in tasks 34-84 cannot ship empty help. The mechanism is reusable: a future leaf declares description/options/argument + withExamples and complies. Boundary intact (src/help is the impure shell; src/core untouched). BMAD skills (reliable worker): create-story, dev-story, qa-generate-e2e-tests. Reviewer ran story-automator-review -> APPROVE (the load-bearing guard verified sound). Fixed both NITs: corrected the EXAMPLE_HEADING JSDoc (it said helpInformation, now correctly says outputHelp -- preventing a future false-guard landmine), and added a renderExamples unit test covering the single + multi (Examples:) paths. Gate: tsc 0, biome 0 warnings, vitest 478 passed (2 env-gated skips), npm ci 0.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
