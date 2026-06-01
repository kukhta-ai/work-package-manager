# Test Automation Summary — bundle lifecycle (tasks 50/51/52)

> bmad-qa-generate-e2e-tests output. The wpm CLI has no UI/HTTP surface, so "E2E" = through-the-binary tests
> driving the BUILT `dist/cli.js` over a real `NodeFileSystem` tmpdir + the real `backlog` CLI (the project's
> established `describeIfBuilt` + `execFileSync` style; `cli.bin.test.ts` / `cli.init.test.ts`). API-test step
> is N/A (no service endpoints).

## Generated Tests

### E2E (real `dist/cli.js` binary, real backlog, `withTempDir`)
- [x] `test/integration/cli.bundle-lifecycle.e2e.test.ts` — 6 cases:
  - the doc-10 worked authoring flow: `init` → `bundle new web-handoff` → `bundle new doc-handoff` — both
    advisors scaffold, both bundles appear in the front-door `AGENTS.md` menu + the manifest, and the per-bundle
    authoring tasks materialise in the real `.authoring-backlog` (asserted via `backlog task list`).
  - `--no-advisor` skips the stub AND its content task (real binary).
  - `--disabled` scaffolds the dir but leaves the bundle out of the manifest + menu.
  - a reserved cross-bundle verb id is refused with exit 2, creating nothing (real-binary exit-code path).
  - disable → re-enable restores manifest membership without duplicating the per-bundle tasks (title-idempotent,
    over the real backlog).
  - completion via `__complete`: `bundle enable` offers disabled-but-present dirs; `bundle disable` offers
    enabled bundles.

### Pre-existing coverage (not duplicated)
- `test/unit/cli/bundle-lifecycle-commands.test.ts` — 27 in-process `run()` + `MemoryFileSystem` AC tests
  (every AC of tasks 50/51/52).
- `test/integration/cli.bundle-new.test.ts` (describeIfBuilt block) — the `--version` commander-shadowing-bug
  regression (real binary: `bundle new <id> --version 1.2.3` sets the bundle version, `wpm --version` still
  prints the program version) + a new→disable→enable round-trip.

## Coverage
- User-facing lifecycle flows (real binary): bundle new (incl. `--version`/`--disabled`/`--no-advisor`/reserved
  verb), enable, disable, the two-bundle authoring flow, completion — covered.
- Service/API endpoints: N/A (CLI, no HTTP).

## Verification
- `npm run build` then `vitest run`: 66 files, 649 tests passing (the 6 new E2E tests executed against the
  freshly-built `dist/`). `tsc` 0, `biome ci src test` 0/0 (133 files).

## Next Steps
- Runs in CI (CI builds `dist/` before `npm test`, so the `describeIfBuilt` E2E block executes).
