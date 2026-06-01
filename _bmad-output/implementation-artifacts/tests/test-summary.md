# Test Automation Summary — `bundle <id> version` family (tasks 59/60/61)

> bmad-qa-generate-e2e-tests output. Feature: the per-bundle VERSION family
> (`bundle <id> version` / `version bump` / `version set`) in the wpm CLI.
> The wpm CLI has no UI/HTTP surface, so "E2E" = through-the-binary tests driving the BUILT `dist/cli.js` over a
> real `NodeFileSystem` tmpdir + the real `backlog` CLI (the project's `describeIfBuilt` + `execFileSync` style);
> the API-test step is N/A (no service endpoints). Plus an in-process AC suite via `run()` over in-memory ports.

## Generated / extended tests

### Unit (in-process, AC-driven) — ADDED `test/unit/cli/bundle-version-commands.test.ts` (26 tests)
Over `MemoryFileSystem` + `FakeBacklog`, a TWO-bundle fixture (bundle `b` requires bundle `a`). Covers:
- **59 (READ):** prints the bundle.yml version; read-only (manifest + bundle.yml byte-identical after); no-project
  → exit 1 naming manifest.yml + init; the id completes from enabled bundles; help documents `bump` + `set`.
- **60 (BUMP+MATERIALISE):** computes the next semver for patch/minor/major/0.x, writes it (comment + key order
  preserved), prints it; materialises the 3 per-bundle tasks AND the cross-bundle requirer-constraint task
  (`Review version constraint on a at 0.2.0`); idempotent by title (re-bump → no duplicates); the negative case
  (a bundle nothing requires → no constraint task) + no-self-constraint; bad/missing level → exit 2 unchanged;
  no-project → exit 1; the `<level>` completion → major/minor/patch (via the public `run()` `__complete`
  dispatch); rerender; help (level positional + values + example).
- **61 (SET):** valid semver written (comment preserved) + re-rendered + printed; no materialise; non-semver and
  partial (`1.2`) → exit 2 unchanged; no-project → exit 1; help (version positional + example).
- **author workflow** (read → bump → read → set → read): the bundle.yml is the single source of truth; the
  requirer bundle `b` is never touched.

### Integration (real binary + real backlog) — EXTENDED `test/integration/cli.bundle-id.e2e.test.ts` (5 tests)
A new `describeIfBuilt` block driving the BUILT `dist/cli.js`:
- `bundle <id> version` prints the scaffolded 0.1.0.
- `bundle a version bump minor` advances `bundles/a/bundle.yml` to 0.2.0 (comments preserved) AND lands the four
  bump tasks — **including `Review version constraint on a at 0.2.0`** — in the REAL `<proj>/.authoring-backlog`
  (asserted via `backlog task list --plain`). The loop-closure proof: the cross-bundle requirer scan runs over the
  real loaded project (bundle `b`'s `requires:{a}` fixture hand-set on disk, since `requires add` / family K is not
  yet built — marked with an explicit comment).
- `bundle a version set 2.0.0` writes the explicit version; a bad level / non-semver → exit 2 unchanged.
- completion `__complete bundle web version bump` → major/minor/patch; `version --help` documents bump + set.
- a bump → version round-trip (the read reflects the mutation through the real binary).

## Coverage
- CLI commands: `bundle <id> version` (59), `bundle <id> version bump` (60), `bundle <id> version set` (61) — all
  three, every acceptance criterion, in-process AND through the real binary.
- The cross-bundle requirer-constraint materialise (60#2) is covered in-process (FakeBacklog) AND against the real
  Backlog.md `.authoring-backlog`.

## Gate
- `tsc --noEmit` 0 · `biome check src test` 0/0 (139 files) · `npm run build` 0 · `vitest run` 713 passed (69
  files; the real-binary + real-backlog E2E executed cold against fresh `dist/`) · `npm ci` 0 vulnerabilities.

## Next steps
- A focused-LIGHT review follows (the family reuses the vetted task-39/40/41 VERSION pattern + the task-57/58
  per-bundle registry).
