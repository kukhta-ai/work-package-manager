# CI Design — quality pipeline (`testarch-ci`, adapted to a CLI)

> **Status:** design-only. This is the CI **design/plan**; it creates **no** `.github/workflows/*`
> file. The CI workflow is **FOUNDATION.md task-8**, which implements the design below. The standard
> `testarch-ci` workflow scaffolds a pipeline around **browser-E2E** execution; adapted here to a Node
> + TS CLI whose pipeline runs the **three-command gate** (`docs/12` "CI"). `tea` does **not** write
> the workflow YAML now — doing so would pre-empt and conflict with task-8.
> Sources: `docs/12-builder-architecture.md`, `FOUNDATION.md`, and `test-design.md` (the gate).

## 1 · Verdict

- **Provider: GitHub Actions** — workflow files in `.github/workflows/` (`docs/12` "CI"; the scaffold
  names `ci.yml`, with `release.yml` separate — see §6).
- **Matrix: supported Node LTS × OS** — **Node 20 and Node 22** × **{ubuntu, macos, windows}**
  (`docs/12` "CI": "matrix on Node LTS × {Linux, macOS, Windows}"; task-8 AC: "supported Node range
  across Linux/macOS/Windows"). Node 20 + 22 are the current/next active LTS lines; task-8 pins the
  exact list to whatever LTS lines are supported at implementation time (`docs/12` does not freeze
  version numbers, so the design tracks "supported LTS," not a hardcoded pair).
- **Gate per cell: the identical three commands** run locally (§2). **Any failure blocks merge**
  (task-8 AC).
- **Trigger: every push and every pull request** (task-8 AC: "every push/PR auto-checked").

## 2 · The pipeline runs the **same** three-command gate as local

The whole point of CI here is **parity** with the local gate — "the SAME lint/type/test gates as
local" (task-8 AC). Each matrix cell runs, in order, exactly the three commands from
`test-design.md` §5 (`docs/12` "CI" / "Development workflow"):

```
1. biome ci          # lint + format-check, incl. the core import-boundary rule   (task-5 owns the rule)
2. tsc --noEmit      # full ESM type-check, no emit                               (task-6/-7 wire the script)
3. vitest            # the whole suite: unit + integration + snapshot             (task-6 owns the harness)
```

CI **must not** run a different, weaker, or stronger gate than a developer's machine or the pre-commit
hook; the three legs and their meaning are defined once and reused (`test-design.md` §5). CI's extra
value is **breadth** (the OS × Node matrix), not a different gate.

## 3 · Job shape — the plan **task-8 implements**

Listed as a plan, not as YAML. Each matrix cell is one job that:

1. **Checks out** the repository at the pushed/PR commit (cold — no warm cache assumptions; the
   Phase 6 epic gate further requires a *cold-start full-suite* run, `test-design.md` §7).
2. **Sets up Node** at the cell's version (20 or 22).
3. **Installs dependencies** from the lockfile (clean, reproducible install) — including **Backlog.md**,
   which the **integration** band shells out to (`docs/12`: Backlog.md is the hard runtime dependency
   the CLI invokes for task operations; it is a **peer dependency** for end users but must be
   **present in CI** so the real `BacklogMd` adapter's integration tests run). task-8 decides the
   concrete provisioning (e.g. install `backlog.md` as part of the CI setup) so integration tests are
   not silently skipped.
4. **Runs the three-command gate** (§2), in order, failing the job on the first non-zero exit.
5. **Reports status** back to the commit/PR; a failing cell **blocks merge** (enforced via the
   repository's required-status-checks branch protection — a settings concern task-8/task-3 wire,
   noted here as the mechanism by which "failure blocks merge" becomes real).

**Cross-OS correctness is a first-class reason for the matrix**, not incidental: the **Windows
symlink→copy fallback** in the `ensureAlias` adapter (`docs/12` "Symlinks on Windows"; `docs/13` §3)
only gets real coverage on a Windows runner, and path/line-ending behaviour differs across OSes. The
matrix is what proves the adapter layer behaves on all three platforms.

## 4 · Green on current code

The CI workflow must be **green on the code present when task-8 lands** (task-8 AC). Because the gate
is the same three commands the harness (task-6) and Biome (task-5) already pass locally, a correctly
wired matrix is green by construction at that point; CI's job is to keep it green across the matrix on
every later push/PR.

## 5 · Dependency ordering (why CI comes after 2–6)

Per FOUNDATION.md, **task-8 needs tasks 2, 3, 4, 5, 6** — CI enforces conventions and tooling that must
exist first: the branching model (task-2) and PR/review/merge rules (task-3) define what "blocks
merge" protects; versioning (task-4) is settled but **publish is out of scope here** (§6); Biome
(task-5) and vitest (task-6) provide legs 1 and 3 of the gate. This CI design assumes those are in
place and simply **runs their gate across the matrix**.

## 6 · Explicitly out of scope here

- **Release / publish on tag.** `docs/12` mentions a separate `release.yml` ("build on tag, publish to
  npm on tagged release"), but per FOUNDATION.md ("What is deliberately NOT here": *Distribution/publish
  wiring … comes with the command leaves*) and the spawn brief, **the publish pipeline is later
  command work**, not this foundational CI. task-8 delivers the **CI quality gate** (`ci.yml`);
  `release.yml` / npm publish is intentionally deferred.
- **Coverage thresholds / reporting services, caching tuning, required-reviewer automation** — task-8
  may add basic dependency caching for speed, but no coverage gate or third-party reporting service is
  designed here; the gate is the three commands, nothing layered on top.

## 7 · Reconciliation with task-8 (no conflict)

- This design **creates no workflow file**; task-8 implements §1–§5.
- The **matrix** (Node LTS × {ubuntu, macos, windows}) and **trigger** (push/PR) come straight from
  `docs/12` "CI" and task-8's acceptance criteria.
- The **gate** is identical to local (the same three commands), satisfying "the SAME lint/type/test
  gates as local" — no divergence introduced.
- **Publish-on-tag is excluded**, matching FOUNDATION.md's scope boundary; including it would be the
  conflict, so it is deliberately left to later command work.
