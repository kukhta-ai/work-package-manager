# Test Automation Summary — cli-bundle-templates (Family M, tasks 68/69/70)

Framework: **vitest** (the project's existing runner). E2E style: through-the-built-`dist/cli.js` over a real
`NodeFileSystem` tmpdir + the real `backlog` CLI (the same harness as Family L). `describeIfBuilt` skips only
when `dist/` is unbuilt; CI builds first, so the block RUNS.

## Generated Tests

### Real-binary E2E (`test/integration/cli.bundle-id.e2e.test.ts`, appended block) — 8 tests, all pass
- [x] 68#1 — `templates add` registers a placed template in `bundle.yml` payload; placed-file content unchanged
  (structure-not-content).
- [x] 68#2 — `templates add ghost.tmpl` (not on disk) exits 1; `bundle.yml` byte-unchanged.
- [x] 69#1 — `templates list` shows the registered template; a fresh bundle prints `(no templates)`.
- [x] 70#1/70#2 — `templates remove` exits 0, prints `left at payload/templates/agents.md.tmpl`, drops the entry
  from `bundle.yml`, BUT leaves the file on disk (existsSync) with content intact.
- [x] 70#3 — `templates remove nope.tmpl` (not registered) exits 1; `bundle.yml` unchanged.
- [x] completion — `__complete templates add` lists placed templates; `__complete templates remove` lists
  registered templates.
- [x] help — `bundle web templates add --help` reaches the leaf; contains `bundle web templates add` + `<path>`
  + `Example`.
- [x] OLD-bundle.yml compat — a `bundle.yml` with NO `payload:` key still drives `templates list` (`(no
  templates)`) and `templates add` (introduces the field) — absent ⇒ empty, end-to-end.

### Unit (in-process, `dev-story` step) — `test/unit/cli/bundle-templates-commands.test.ts`
Covers the same ACs in-process over MemoryFileSystem (registration order, set-like idempotency, nested paths,
comment + key-order preservation, the cross-category isolation case proving files + templates round-trip
independently), plus the schema round-trip cases in `test/unit/schema/bundle.test.ts`.

## Coverage
- tasks 68/69/70 acceptance criteria: every AC has at least one real-binary E2E assertion (above) AND an
  in-process unit assertion.
- The descriptor-driven operation is reused unchanged; M = `TEMPLATES_DESCRIPTOR` + model field + schema branch
  + CLI module + completion bind + create-bundle init.

## Cold gate (CI order, run against a fresh `dist/`)
`npm ci` → 0 vuln · `npx tsc --noEmit` → clean · `npx biome ci .` → clean (152 files) · `npm run build` → ok ·
`npx vitest run` → **822 passed (72 files), 0 failed, 0 skipped**. The templates E2E block ran (8/8) — verified
not-skipped.

## Next Steps
- Family N (`bundle <id> scripts`) follows M identically against `installer-scripts/`.
