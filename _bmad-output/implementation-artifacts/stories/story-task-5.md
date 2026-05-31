# Story task-5 — Set up Biome (lint + format) and pre-commit hooks

> Lean implementation spec (BMAD create-story output). This is the **logic-bearing** toolchain task that
> expands task-1's minimal `biome.json`: a fixed formatting standard, the **core import-boundary rule**
> that must actually fire (doc 13 §1; AGENTS.md invariant), and husky+lint-staged commit-time protection.
> Verified the Biome 2.4.16 rule shape against the **pinned schema** (`https://biomejs.dev/schemas/2.4.16/
> schema.json`) since context7 was unavailable.

## Acceptance criteria (the contract)
1. Linting and formatting run on demand and report a clean result on the current codebase.
2. A formatting standard is fixed once, so two contributors editing the same file produce no
   formatting-only differences.
3. An import that violates doc 13's core boundary (core depending on the CLI framework, the subprocess
   library, or OS/file-system modules) is reported as a violation.
4. Committing reformats and re-checks the touched files automatically, with feedback in seconds.
5. A fresh clone receives this commit-time protection without manual setup.

## Schema facts verified (Biome 2.4.16, from the pinned schema — not guessed)
- `noRestrictedImports` is in the **`style`** rule group (schema: `Style.noRestrictedImports`; rule page
  `no-restricted-imports`).
- Config shape: `{ "level": "error", "options": { "paths": { "<module>": "<message>" } } }`. `paths` is an
  **object map** (module name → value); each value may be a **plain string** message (schema `Paths` =
  `string | PathOptions`). So mapping each forbidden module to a message string is valid.
- File scoping uses **`overrides[].includes`** (v2 key; array of globs), and each override entry may carry
  its own `linter` block (schema `OverridePattern.includes` + `.linter`). Top-level `files.includes` is the
  v2 key (already in task-1's config). v1's `include`/`ignore` are gone.

## Approach / files to change
1. **`biome.json` — fixed formatting standard (AC#1, AC#2).** Set formatter opinions EXPLICITLY so two
   contributors get byte-identical output: `indentStyle: space`, `indentWidth: 2`, `lineWidth: 100`,
   `lineEnding: lf`, and under a `javascript.formatter` block `quoteStyle: double`, `semicolons: always`,
   `trailingCommas: all` (Biome's defaults, but pinned EXPLICITLY per the directive — silence-by-default is
   the thing AC#2 forbids). Keep `linter.rules.recommended: true`. Keep `assist.organizeImports`.
2. **`biome.json` — core import-boundary rule (AC#3).** Add an `overrides` entry:
   ```jsonc
   "overrides": [
     { "includes": ["src/core/**"],
       "linter": { "rules": { "style": { "noRestrictedImports": {
         "level": "error",
         "options": { "paths": {
           "commander": "<msg>", "execa": "<msg>", "omelette": "<msg>",
           "node:fs": "<msg>", "node:fs/promises": "<msg>",
           "node:os": "<msg>", "node:child_process": "<msg>"
   } } } } } } }
   ]
   ```
   `node:path` and `node:url` are PURE and remain ALLOWED (not listed). `src/core/` doesn't exist yet
   (tasks 10+); the rule is configured for when it does, and proven by the test below.
3. **Pre-commit (AC#4, AC#5).** Install **husky@9 + lint-staged** exact-pinned (`npm install`). Add
   `"prepare": "husky"` to scripts (fresh clone → hook installed on `npm install`, AC#5). `.husky/pre-commit`
   runs `npx lint-staged`. lint-staged config (in package.json): `"*.{ts,tsx,js,json,jsonc}": "biome check
   --write --no-errors-on-unmatched"` — reformats + re-checks only staged files in seconds (AC#4). Must
   PASS on clean code (the orchestrator commits over this hook) and fail only on genuine violations.
4. **Boundary test (AC#3 proof) — `test/integration/core-boundary.test.ts`.** Airtight, both directions:
   - writes a temp `src/core/__boundary_fixture__.ts` importing a FORBIDDEN module (`node:fs`), runs
     `biome check <file>` via subprocess, asserts the output reports `noRestrictedImports` (and non-zero
     exit). Cleanup in `finally` (and `afterEach`/`afterAll` safety net) so the committed tree stays clean.
   - writes a temp `src/core/__boundary_allowed__.ts` importing an ALLOWED module (`node:path`), runs the
     same check, asserts NO `noRestrictedImports` violation — proving the boundary is scoped, not blanket.
   - also (negative-scope) optionally assert a temp file OUTSIDE core importing `node:fs` is NOT flagged by
     the rule (the override is core-only). Keep cleanup bulletproof: deterministic temp paths under
     `src/core/`, removed in `finally` + `afterAll`; create `src/core/` if missing and remove it if we made
     it. A small documented helper runs biome and returns `{code, output}`.

## Gate / DoD
- AC#1's clean `biome check .` IS DoD#1; also `tsc --noEmit` clean and `vitest run` green incl. the new
  boundary test. Run `biome format --write` once if existing files need to conform (keep the diff minimal).
- Document the public test helper; no dead code.

## Boundaries (do NOT do here)
- Don't create real `src/core/` modules (tasks 10+) — only the rule config + the temp-fixture test. Don't
  add the CI workflow (task-8) or the unit/integration split scaffolding beyond placing this one integration
  test. Don't edit `docs/`, `AGENTS.md`, `backlog/`, `.bmad/`.
