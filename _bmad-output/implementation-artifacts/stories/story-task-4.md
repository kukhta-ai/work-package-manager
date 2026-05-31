# Story task-4 — Define versioning, release, and changelog conventions

> Lean implementation spec (BMAD create-story output). Documentation task: capture the project's
> versioning/release/changelog conventions, grounded in `docs/08` (versioning & migrations) and `docs/12`
> (release/CI). No code changes. Must stay consistent with the task-2/3 `CONTRIBUTING.md` sections.

## Acceptance criteria (the contract)
1. A contributor can determine, for any change, whether it is a major, minor, or patch release of the
   builder.
2. The steps from tagging a version to a published release are documented (doc 12).
3. Release history is recorded in a human-readable changelog with an in-progress section for unreleased
   changes.
4. The builder's own version is clearly distinguished from the independent versions of the bundles it
   produces (doc 08).

## Sources verified (don't invent — and don't misattribute)
- `docs/08` establishes the **semver model for BUNDLES** (the produced artifacts): a bundle's `id` is
  stable across releases, its `version` (semver) moves, and inter-bundle `requires` are **npm-style**
  constraints (`^0.3.0`, `~1.2.0`, `>=2.0.0 <3.0.0`) validated by `wpm project validate` (§"Identity vs
  version", §"The dependency contract"; doc 00 vocab "a bundle carries a stable id and a moving version").
  **NB:** doc 08 does **not** define the *builder's own* version. So AC#1's builder MAJOR/MINOR/PATCH rules
  are the **same semver discipline applied to the `wpm` package's `package.json` version** — I cite doc 08
  for the semver model + npm-style semantics it sets, and state plainly that doc 08 governs bundles while
  the builder applies that model to itself. Do not present the builder-version definitions as doc-08 text.
- `docs/12` §CI (line 35): "Test on every push, **build on tag, publish to npm on tagged release**. Workflow
  files in `.github/workflows/`." §Distribution (line 33): `npm i -g`; Backlog.md a `peerDependency`. Scaffold
  (line 228) names `release.yml` = "build + publish to npm on tag"; (line 46) `CHANGELOG.md [OPT]` = release
  history. → the release process (AC#2).
- task-1 directive / `package.json`: the builder is currently `0.1.0` (pre-1.0, unreleased).
- FOUNDATION / AGENTS.md "deliberately NOT here": the `build` command (dry-run/package/publish) and the
  `release.yml` workflow are **later** work; task-4 fixes the **convention**, task-8 wires the CI test gate.
  → document the release process as the agreed convention, **not** as already-wired automation.
- task-2/3 `CONTRIBUTING.md`: append after the task-3 "## Pull requests, review & merge" section (ends at
  the "Opening a pull request" subsection); don't reflow earlier sections; match their header style + tone.

## Deliverables
1. **Append** `## Versioning & releases` to `CONTRIBUTING.md` after the task-3 section.
2. **Create** `CHANGELOG.md` — Keep-a-Changelog style, top `## [Unreleased]`, seeded lightly (an `### Added`
   line that the foundation is in development, pre-1.0). High-level + honest; don't enumerate every task.

### `## Versioning & releases` outline (what to write)
- intro: this governs the **builder's** versioning; cite doc 08 (semver model) + doc 12 (release/CI).
- `### Semantic versioning for the builder` (AC#1) — `MAJOR.MINOR.PATCH` of the `wpm` package
  (`package.json`, currently `0.1.0`), npm-style. Define for THIS tool:
  - **MAJOR** = breaking change to the CLI surface/behaviour or the generated-artifact contract;
  - **MINOR** = backward-compatible new command/capability;
  - **PATCH** = backward-compatible bug fix, no surface change.
  - a short **"for any change, decide:"** rule of thumb so AC#1 is directly answerable.
  - note pre-1.0 caveat (0.y.z: surface still stabilizing) briefly + honestly.
- `### The builder's version is not a bundle's version` (AC#4) — the decoupling: builder has ONE version
  (`package.json`); each produced **bundle** carries its OWN `version` in `bundle.yml`, bumped on its own
  cadence; bundles depend on each other by npm-style `requires` (doc 08). Bumping the builder never bumps a
  generated bundle and vice-versa — separate version lines, separate artifacts, separate repos. This
  CHANGELOG tracks the **builder's** releases only.
- `### Release process` (AC#2, doc 12) — steps tag→publish: bump `package.json` → move `[Unreleased]`
  entries under `## [X.Y.Z] - <date>` → commit → tag `vX.Y.Z` → push the tag → CI `release.yml` builds +
  publishes to npm on the tagged release; `npm i -g` distribution. **Explicitly note**: the publish workflow
  file and the `build` package/publish command are later work (FOUNDATION "NOT here"); this is the agreed
  **convention**, task-8 wires the CI test gate. So no "already automated" claim.
- `### Changelog` (AC#3) — Keep-a-Changelog: `## [Unreleased]` always on top; released versions below with
  date + grouped Added/Changed/Fixed/Removed; link to `CHANGELOG.md`.

### `CHANGELOG.md` content (AC#3) — Keep-a-Changelog, lightly seeded
- Header + a one-line note on the format + that it tracks the **builder** only (per-bundle versions live in
  each bundle's `bundle.yml`).
- `## [Unreleased]` with `### Added` — high-level line: the foundation (the `wpm` CLI toolchain + builder
  hexagon) is in active development pre-1.0. Do NOT list each task.
- A short footer noting the current builder version is `0.1.0` (unreleased) / first tagged release will move
  entries up. Keep honest — no fabricated released versions.

## Tests / DoD (doc task)
- DoD#1: no code change → `tsc`/`biome`/`vitest` stay green; run all three to confirm. (`CHANGELOG.md` +
  `CONTRIBUTING.md` are markdown, outside the lint/type/test sets — verify biome doesn't trip on the new md.)
- DoD#2: no testable code logic; no brittle string-match tests — green suite satisfies it.
- DoD#3: N/A public functions; prose clear, self-consistent, aligned with task-2/3 sections.

## Boundaries (do NOT do here)
- Don't author the `release.yml` workflow (later) or the CI test workflow (task-8) or the `build` command.
  Don't bump `package.json`. Don't edit `AGENTS.md`, `docs/`, `backlog/`, `.bmad/`, or the task-2/3 prose.
