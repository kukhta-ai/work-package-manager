# Test Automation Summary — cli-bundle-scripts (Family N, tasks 71/72/73)

Framework: **vitest**. E2E style: through-the-built-`dist/cli.js` over a real `NodeFileSystem` tmpdir + the real
`backlog` CLI. `describeIfBuilt` skips only when `dist/` is unbuilt; CI builds first, so the block RUNS.

## Generated Tests

### Real-binary E2E (`test/integration/cli.bundle-id.e2e.test.ts`, appended block) — 8 tests, all pass
- [x] 71#1 — `scripts add` registers a placed installer-script in `bundle.yml` payload (under `payload.scripts`);
  placed-file content unchanged. Also asserts the script lives under `installer-scripts/` (a SIBLING of
  `payload/`) and NOT under `payload/installer-scripts/`.
- [x] 71#2 — `scripts add ghost.sh` (not on disk) exits 1; `bundle.yml` byte-unchanged.
- [x] 72#1 — `scripts list` shows the registered script; a fresh bundle prints `(no scripts)`.
- [x] 73#1/73#2 — `scripts remove` exits 0, prints `left at installer-scripts/probe.sh`, drops the entry from
  `bundle.yml`, BUT leaves the file on disk (existsSync) with content intact.
- [x] 73#3 — `scripts remove nope.sh` (not registered) exits 1; `bundle.yml` unchanged.
- [x] completion — `__complete scripts add` lists placed installer-scripts; `__complete scripts remove` lists
  registered scripts.
- [x] help — `bundle web scripts add --help` reaches the leaf; contains `bundle web scripts add` + `<path>` +
  `Example`.
- [x] OLD-bundle.yml compat — a `bundle.yml` with NO `payload:` key still drives `scripts list` (`(no scripts)`)
  and `scripts add` (introduces the field) — absent ⇒ empty, end-to-end.

### Unit (in-process, `dev-story` step) — `test/unit/cli/bundle-scripts-commands.test.ts`
Covers the same ACs in-process, plus: the **sibling-of-payload nuance** (a file under `payload/installer-scripts/`
FAILS the existence check — only `installer-scripts/<path>` satisfies `scripts add`) and the **three-category
coexistence** case (files + templates + scripts all round-trip; removing the script leaves the others). Schema
round-trip cases in `test/unit/schema/bundle.test.ts`.

## Coverage
- tasks 71/72/73 acceptance criteria: every AC has a real-binary E2E assertion + an in-process unit assertion.
- The descriptor-driven operation + completion factories are reused unchanged; N = `SCRIPTS_DESCRIPTOR`
  (`onDiskDir: "installer-scripts"`) + model field + schema branch + CLI module + completion binds + create-bundle
  init. N proves the descriptor seam handles a NON-`payload/` on-disk dir.

## Registry-key decision (recorded)
On-disk `installer-scripts/` (sibling of `payload/`, install-time tooling NOT delivered — doc-06:96/77,
doc-07:51) but registry key `payload.scripts`: the `payload:` map is the reference registry, not a delivery
claim; delivery is a downstream build concern (tasks 82–84). Defaulted to `payload.scripts`; no doc reason to
deviate.

## Cold gate (CI order, run against a fresh `dist/`)
`npm ci` → 0 vuln · `npx tsc --noEmit` → clean · `npx biome ci .` → clean (153 files) · `npm run build` → ok ·
`npx vitest run` → **856 passed (73 files), 0 failed, 0 skipped**. The scripts E2E block ran (8/8) — verified
not-skipped (real stderr: `no file at bundles/web/installer-scripts/ghost.sh`).

## Final bundle.yml shape (real binary)
Fresh bundle: `payload: { files: [], templates: [], scripts: [] }`. After registering one ref per category, all
three lists populate via the real eemeli/yaml round-trip.
