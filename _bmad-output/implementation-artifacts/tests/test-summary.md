# Test Automation Summary — bundle <id> show / meta + the per-bundle routing (tasks 57/58)

> bmad-qa-generate-e2e-tests output. The wpm CLI has no UI/HTTP surface, so "E2E" = through-the-binary tests
> driving the BUILT `dist/cli.js` over a real `NodeFileSystem` tmpdir + the real `backlog` CLI (the project's
> `describeIfBuilt` + `execFileSync` style). API-test step is N/A (no service endpoints).

## Generated / assessed Tests

### E2E (real `dist/cli.js`, real backlog, `withTempDir`) — `test/integration/cli.bundle-id.e2e.test.ts`
Pre-existing from dev-story (6): show prints metadata+tree; meta edits bundle.yml in place + a fixed verb still
routes; `--version` sets the bundle version; bad `--confirmation-level`→exit 2 + non-enabled→exit 1; per-bundle
`--help` reaches the leaf (+ group/fixed-verb help); completion (`bundle <tab>` verbs+ids, `bundle <id> <tab>`
subcommands, `meta --confirmation-level <tab>` safe|dangerous).

ADDED this pass (4 — the genuine real-binary gaps):
- a **show → meta → show round-trip**: the second show reflects the meta edit (the read sees the mutation through
  the real round-trip; the headline "reads see writes" property).
- **key-order preservation on the REAL `bundle.yml`** across the eemeli/yaml round-trip (in-process asserted it;
  this confirms it over the actual shipped bundle.yml + the real YAML library).
- the routing honours **`-C` placed AFTER the dynamic subcommand** (and before) — a routing-specific concern, now
  verified on the real binary from a cwd outside the project.
- **meta no-flags → exit 2** and **non-semver `--version` → exit 2** on the real binary, asserting nothing is
  written on either failure (boundary validation end-to-end).

### Pre-existing in-process coverage (not duplicated)
`test/unit/cli/bundle-id-commands.test.ts` — 21 `run()` + `MemoryFileSystem` AC tests (the routing pattern-setter
+ every AC of 57/58, incl. comment/key-order preservation, the at-least-one-flag rule, and the `bundle <tab>`
id-position completion).

## Coverage
- The `bundle <id> <subcommand>` ROUTING (the pattern-setter for 21 later families): fixed-verb dispatch,
  dynamic-id dispatch, `-C` in every position, per-bundle `--help`, NotFound on a non-enabled id, exit-code
  mapping — covered in-process AND on the real binary.
- `bundle <id> show` / `bundle <id> meta` user flows + the completion surfaces — covered.
- Service/API endpoints: N/A (CLI, no HTTP).

## Verification
- `npm run build` then `vitest run`: 68 files, **680 tests passing** (the 10 `bundle-id` E2E tests executed
  against the freshly-built `dist/`). `tsc` 0, `biome ci src test` 0/0 (137 files).

## Next Steps
- Runs in CI (CI builds `dist/` before `npm test`, so the `describeIfBuilt` E2E block executes).
- The reusable `PerBundleCommandModule` / `PER_BUNDLE_MODULES` + the run()-level routing are the extension point
  the J-Q families (tasks 59–81) build on; their E2E should follow this file's pattern.
