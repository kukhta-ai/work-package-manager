---
id: TASK-5
title: Set up Biome (lint + format) and pre-commit hooks
status: Done
assignee: []
created_date: '2026-05-29 12:23'
updated_date: '2026-05-31 22:14'
labels: []
dependencies:
  - TASK-1
ordinal: 5000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Linting and formatting run on demand and report a clean result on the current codebase
- [x] #2 A formatting standard is fixed once, so two contributors editing the same file produce no formatting-only differences
- [x] #3 An import that violates doc 13's core boundary (core depending on the CLI framework, the subprocess library, or OS/file-system modules) is reported as a violation
- [x] #4 Committing reformats and re-checks the touched files automatically, with feedback in seconds
- [x] #5 A fresh clone receives this commit-time protection without manual setup
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Biome lint+format with a FIXED formatter standard (space/2, lineWidth 100, lf; double quotes, semicolons always, trailing commas all) -> deterministic, idempotent format (AC#1,2). Core import-boundary rule (AC#3): biome.json 'overrides' scoped to src/core/** with style.noRestrictedImports forbidding commander/execa/omelette/node:fs/node:fs:promises/node:os/node:child_process (each with a doc-13-citing message); node:path+node:url allowed. Proven by test/integration/core-boundary.test.ts -- airtight 3-way: forbidden-in-core FIRES, allowed node:path does NOT, forbidden-OUTSIDE-core does NOT (correct scoping); finally+afterAll cleanup, never pollutes the tree (only removes src/core if it created it). Pre-commit (AC#4,5): husky@9.1.7 + lint-staged@17.0.7 (exact); .husky/pre-commit=npx lint-staged; lint-staged runs 'biome check --write' on staged ts/js/json (touched-only, seconds); prepare:husky re-arms a fresh clone (core.hooksPath=.husky/_). REVIEW: dedicated reviewer APPROVE -- 7/7 forbidden fire, node:path/url allowed, gate green (tsc 0 / biome 0 / vitest 10/10). DIVERGENCE: the env permission policy blocked the WORKER from creating the executable git-hook .husky/pre-commit; the orchestrator (owns git) created it after user grant. Deferred NIT: lint-staged glob (jsonc/tsx/js) vs biome files.includes drift -- harmless (no such root files).
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
