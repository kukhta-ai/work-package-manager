# Code Quality — linting, formatting, style, and enforcement

Research (2026) into what linting / formatting / code-style tooling to adopt for the builder (a TypeScript-ESM CLI per `12`), and how to *enforce* it so it doesn't rot. Conclusion first, then the reasoning, then the concrete setup and how it threads into the foundational backlog.

## Conclusion

**Adopt Biome as the single lint + format tool, keep `tsc` as the type gate, and enforce in three layers: editor (format-on-save) → pre-commit hook (fast, staged-only) → CI (the real gate, full repo, blocking).** This is exactly what `12` already guessed (`biome.json [OPT] lint + format`); the research confirms it for a new 2026 TS project and makes the enforcement story concrete. The one caveat to log: Biome's *type-aware* lint rules are ~80% of where typescript-eslint is (full parity targeted late 2026), so `tsc --noEmit` is not optional — it covers what the linter still can't.

## Why Biome (not ESLint + Prettier)

The 2026 landscape has consolidated. The relevant facts from current comparisons:

- **Biome is the default for new projects.** It is one Rust binary that does linting, formatting, and import organization, replacing the ESLint + Prettier + typescript-eslint + eslint-config-prettier + import-sorter stack. v2.x (current ~2.4) ships 400+ rules drawn from ESLint and typescript-eslint. Adopting it removes ~10 dev dependencies and the perennial ESLint↔Prettier conflict-config dance.
- **Speed is real and matters in CI.** Reported 10–50× over ESLint+Prettier (e.g. linting 10k files: ESLint ~45s vs Biome ~0.8s). For our small CLI it's instant; the value is fast pre-commit hooks and cheap CI.
- **Smooth upgrades.** No plugin ecosystem to break on version bumps — updates add rules rather than shattering config. For a project that wants low maintenance overhead, this is the deciding ergonomic.
- **The honest limits, and why they don't bite us:**
  - *Type-aware rules ~75–85% of typescript-eslint.* Biome 2.x has the important ones (notably `noFloatingPromises`, which catches unhandled async — the single most valuable type-aware rule for a CLI that shells out and does file I/O), but full type-aware coverage is a late-2026 roadmap item. **Mitigation:** `tsc --noEmit` in CI is the real type gate regardless of linter; we'd run it anyway.
  - *No custom-rule plugin ecosystem like ESLint's.* We don't need framework plugins (no React/Next), and the one project-specific rule we *do* want — the hexagonal import-boundary rule from `13` ("nothing under `core/` imports commander/execa/omelette/node:fs") — is enforceable with Biome's `noRestrictedImports` rather than a custom plugin. If we ever outgrow that, ESLint is the escape hatch.

ESLint + Prettier remains the right call only for heavy-plugin or framework-coupled codebases — not us. Oxlint (the OXC speed-layer linter) is faster still but is lint-only and doesn't format, so it doesn't replace the combined workflow Biome gives; not worth a second tool here.

## What the rules should actually be

Biome's rules are **opt-in per group** — a common gotcha is that `biome init` leaves most checks off until you enable groups, so a config that only sets `recommended: true` silently under-checks. The starting policy:

- **Recommended set on**, plus selectively enable the `suspicious`, `correctness`, `complexity`, `style`, and `nursery` groups that earn their keep.
- **`noFloatingPromises`** (type-aware) on — unhandled promises are the highest-value bug class for an async I/O CLI.
- **`noExplicitAny`** as warn→error as the code matures; the domain model in `13` is built on branded types precisely to avoid `any`.
- **`noRestrictedImports`** configured to encode `13`'s dependency rule — flag any import of `commander`, `execa`, `omelette`, or `node:fs`/`node:os` from within `src/core/**`. This makes the hexagonal boundary a lint error, not a code-review hope (the literature's repeated warning is that the boundary "breaks down without a clear place where it's enforced").
- **Import organization on** (Biome sorts/groups imports) — removes a whole class of diff noise and review nits.
- **Config philosophy** (the consensus across every 2026 guide): *start minimal, add a rule only when it prevents a real bug, delete rules that generate more noise than signal.* Don't import a 200-line maximalist config.

Formatting is Biome's near-Prettier defaults — accept them as-is. The point of an opinionated formatter is to end the discussion; the only decisions worth making are indent width and line width, set once in `biome.json` and never argued about again.

## How to enforce it — three layers, because each covers the others' gaps

The strong consensus: **pre-commit hooks for fast local feedback, CI as the actual gate, and never trust hooks alone** (they're bypassable with `--no-verify`). Editor integration on top so developers rarely hit either.

1. **Editor (format-on-save).** Commit `.vscode/settings.json` enabling Biome as the formatter with `formatOnSave`. This is friction-removal: most style issues never reach a commit because the editor already fixed them. Cheapest layer, highest day-to-day value.

2. **Pre-commit hook (fast, staged-only).** A Git hook that runs Biome on **staged files only**, auto-fixing what it can, so broken style/lint never enters history and the feedback is a second, not a 5-minute CI round-trip. Two viable runners:
   - **husky + lint-staged** — the industry standard (React, Next, Vite use it); `husky init` auto-installs the hook via the `prepare` script on `npm install`, which matters for contributor onboarding. lint-staged scopes the run to staged files.
   - **lefthook** — Go-based, parallel, fewer deps, no Node post-install; can run lint + type-check in parallel. Needs `"prepare": "lefthook install"` added manually since it doesn't auto-install on `npm install`.
   - **Recommendation: husky + lint-staged**, for the auto-install-on-`npm install` property (lower onboarding friction) and because it's what most contributors already know. lefthook is a fine alternative if we later want parallel hook steps. Keep the hook *fast*: format + lint staged files only — **do not** run the full type-check or test suite in pre-commit (that's CI's job; slow hooks get bypassed).
   - Standard config: `lint-staged` runs `biome check --write --no-errors-on-unmatched` on `*.{ts,js,json,jsonc}`.

3. **CI (the real gate, blocking).** GitHub Actions (already in `12`/task-4) runs, on every push and PR, the full non-negotiable suite over the *whole* repo:
   - `biome ci` (Biome's CI mode: check formatting + lint, no writes, non-zero exit on any finding),
   - `tsc --noEmit` (the type gate Biome doesn't fully cover),
   - `vitest run` (tests).
   CI is what actually blocks merge; the hook is a courtesy that keeps CI green most of the time. The merge gate is wired to require this suite passing (this is what task-25's "required green CI" PR rule points at, and it dovetails with the project-level Definition of Done in `config.yml`).

The `--no-verify` bypass is the known hole in layer 2 — which is *why* layer 3 exists and is the authority. Document that hooks are a convenience and CI is the gate, so nobody treats a bypassed hook as having skipped the real checks.

## Concrete setup (for the bootstrap tasks)

Dev dependencies: `@biomejs/biome` (pinned exact, `--save-exact`, so formatting can't shift under a caret bump), `husky`, `lint-staged`, `typescript`, `vitest`.

Files this produces, all in the repo root (consistent with `12`'s scaffold, which already lists `biome.json`):
- `biome.json` — the lint + format config (rule groups, `noFloatingPromises`, `noRestrictedImports` for the core boundary, format width/indent).
- `.vscode/settings.json` — Biome as default formatter + format-on-save.
- `.husky/pre-commit` — runs `lint-staged`.
- `lint-staged` block in `package.json` — `biome check --write` on staged JS/TS/JSON.
- `.github/workflows/ci.yml` — `biome ci` + `tsc --noEmit` + `vitest run`, matrix on Node LTS × {Linux, macOS, Windows} (per `12`).
- `package.json` scripts: `lint` (`biome check`), `format` (`biome format --write`), `check` (`biome check --write`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `prepare` (`husky`).

## How this threads into the foundational backlog

It refines three existing tasks rather than adding new ones — the work was already scoped, this makes the ACs concrete:

- **task-3 (Set up linting, formatting, and the test harness)** — name Biome as the tool; AC gains: `biome.json` present with recommended groups + `noFloatingPromises` + the `noRestrictedImports` core-boundary rule; `npm run lint`/`format`/`typecheck` exist and pass on the stub; `.vscode/settings.json` committed; husky + lint-staged installed with a staged-only pre-commit hook.
- **task-4 (Add continuous integration)** — AC gains: CI runs `biome ci` + `tsc --noEmit` + `vitest run` (the three-command suite), blocking, on the matrix already specified.
- **task-25 (Define PR, review, and merge rules)** — already says "required green CI"; clarify that the green-CI gate *is* this suite, and that pre-commit hooks are a convenience, not the gate.

Two notes worth carrying forward:
- The **`noRestrictedImports` core-boundary rule is the highest-leverage single config choice** — it turns `13`'s architectural invariant into an automated check, which is the one thing every hexagonal-architecture source says teams fail to enforce.
- **Pin Biome exactly** (`--save-exact`). An opinionated formatter that drifts on a minor bump produces noisy reformatting diffs across the whole repo; exact-pinning makes formatting reproducible, and Biome bumps become deliberate, reviewable commits.
