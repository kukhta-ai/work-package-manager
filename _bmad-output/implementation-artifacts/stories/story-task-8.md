# Story task-8 — Add continuous integration

> Lean implementation spec (BMAD create-story output). Grounded in `docs/12` §"CI", the tea CI design
> (`_bmad-output/test-artifacts/ci.md`), and the CONTRIBUTING "merge gate" section (task-3). Deliverable is
> a single workflow file; no src logic.

## Acceptance criteria (the contract)
1. Every push and pull request is automatically checked, and a failure blocks merge.
2. The automated checks are the same lint, type, and test gates a contributor runs locally.
3. The checks pass on the supported Node range across Linux, macOS, and Windows (doc 12).
4. The checks pass on the current codebase.

## Sources / conformance (don't contradict)
- `ci.md` §1: GitHub Actions; matrix **Node 20 + 22 × {ubuntu, macos, windows}**; gate = the identical
  three commands; **any failure blocks merge**; trigger = every push + every PR.
- `ci.md` §2: CI MUST run the SAME three-command gate as local, in order: `biome ci` (incl. the core
  import-boundary rule) → `tsc --noEmit` → `vitest`. No weaker/stronger gate; CI's value is breadth.
- CONTRIBUTING (task-3) "The merge gate is the local check suite": local `biome check` ↔ CI `biome ci`
  (same rules, CI mode); types `tsc --noEmit`; tests `vitest run`. The workflow must match that mapping.
- `ci.md` §3.5 / task-3: "failure blocks merge" is enforced by **required-status-checks branch
  protection** — a repo SETTING (human/admin, Phase 7), NOT a repo file. Note it in a comment; do not
  configure it.
- `ci.md` §6: release/publish on tag is OUT OF SCOPE — deliver `ci.yml` only, not `release.yml`.

## Approach / deliverable
Create `.github/workflows/ci.yml`:
- `name: CI`
- `on:` `push` (all branches — covers working branches) + `pull_request` (scoped to `dev`, `main` bases).
- `concurrency:` group on workflow+ref, `cancel-in-progress: true` (cancel superseded runs).
- one job `gate`, `strategy: { fail-fast: false, matrix: { os: [ubuntu-latest, macos-latest,
  windows-latest], node: [20, 22] } }`, `runs-on: ${{ matrix.os }}`, a clear `name:`.
- steps: `actions/checkout@v4`; `actions/setup-node@v4` (`node-version: ${{ matrix.node }}`, `cache: npm`);
  `npm ci`; then the gate as three separate, ordered, named steps (fail on first non-zero):
  1. `npm run typecheck`   (tsc, no emit)
  2. `npx biome ci .`      (Biome CI mode of the same biome.json — same rules as local `biome check`)
  3. `npm test`            (vitest run — unit + integration)
- pin action majors `@v4`. Comment the file so it's self-explanatory (esp. the local↔CI parity and the
  branch-protection boundary).

## Decisions to record (boundaries)
- **No `npm i -g backlog.md` step yet.** `ci.md` §3.3 says CI must provision backlog.md so the real
  `BacklogMd` adapter's INTEGRATION tests aren't silently skipped — but that adapter is **task-14**; the
  current integration band (`cli.bin`, `core-boundary`, `tmpdir`) does NOT invoke backlog. So adding it now
  would provision for nonexistent tests (and risk a flaky/slow install). Add the backlog.md provisioning
  step **with task-14**, when the integration band first shells out. Flag this seam in a workflow comment +
  the report. (This conforms to `ci.md` §3.3 "task-8 decides the concrete provisioning … so integration
  tests are not silently skipped" — today there are none to skip.)
- **husky/`npm ci` footgun:** `npm ci` runs `prepare: husky`. husky v9 is CI-safe (just sets
  `core.hooksPath`). VERIFY locally that `npm ci` completes cleanly (prepare doesn't error). Only guard
  `prepare` if it genuinely breaks; prefer leaving it clean. Report the finding.

## AC#4 proof (can't run Actions here)
Run the IDENTICAL gate locally: `npm ci` then `npm run typecheck` && `npx biome ci .` && `npm test`. Paste
real output. State the cross-OS/Node matrix runs in CI; the local run proves the commands are correct and
the current tree passes the same gate.

## Gate / DoD
- Valid YAML; `tsc --noEmit` / `biome check .` / `vitest run` still green (workflow is yaml, outside those
  sets, but don't regress). Comment the workflow; no dead code.

## Boundaries (do NOT do here)
- No `release.yml` / publish. No branch-protection config. No coverage gate / reporting service. No
  backlog.md provisioning yet (task-14). Don't edit `docs/`, `AGENTS.md`, `backlog/`, `.bmad/`, task-5's
  biome config, or the local scripts.
