# Test Automation Summary — task-22 (integrity service: vendored-content hashing + wpm.lock)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The integrity service is pure (hashes + lockfile over file content the operation supplies;
> no I/O), so it is fully unit-testable; the "acceptance" band is the build -> persist -> verify
> `--frozen-lockfile` lifecycle exercised in memory.

## Generated / relevant tests

### Unit (service behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/integrity.test.ts` — `hashArtifactFiles` determinism + order-independence,
  content-sensitivity, rename-sensitivity, path/content injectivity (no length-collision), stable empty hash;
  `buildLockfile` pins source+version+hash (deterministic); `verifyLockfile` passes on match / fails naming
  the drifted artifact / missing / extra / a mix; `serialize`→`parse` lossless round-trip; malformed-lockfile
  parse throws.

### Acceptance (the --frozen-lockfile build->persist->verify lifecycle), this skill
- [x] `test/unit/services/integrity.acceptance.test.ts`
  - Vendors two realistic artifacts: a discipline skill `obra/superpowers@v2` (SKILL.md + references/) and a
    Ralph loop runner `snarktank/ralph@v1.2` (ralph.sh + .claude-plugin/plugin.json).
  - `buildLockfile` → `serializeLockfile` (what `wpm build` writes to `wpm.lock`) → `parseLockfile` (what a
    later `wpm project validate` reads) → the pins survive **losslessly**; the source/version/hash are
    recoverable — exactly which version, from where (AC#1/#3).
  - `verifyLockfile(parsedLock, unchanged)` **passes** (clean build, AC#2).
  - A tampered vendored skill (one byte of superpowers' SKILL.md changed) → `verifyLockfile` **fails naming
    `superpowers` as drifted** (the `--frozen-lockfile` catch, AC#2); a dropped artifact → **missing**.

## Coverage
- AC#1 (pinned to source + resolved version + content fingerprint): covered (unit + acceptance).
- AC#2 (verify passes on match, fails on drift): covered (unit + acceptance tamper + missing/extra).
- AC#3 (pins recoverable — which version, from where): covered (lossless `wpm.lock` round-trip).

## Result
`npx vitest run` → 315 passed (35 files), run as a single process. `tsc --noEmit` clean, `biome check .`
clean (`node:crypto` is allowed in core — not flagged by the import-boundary rule).

## Next steps
- Run in CI (the matrix runs the three-command gate).
- `wpm build` (later command work) reads each vendored artifact's files via the FileSystem port → `buildLockfile`
  → writes `wpm.lock` (serialize) — and on a frozen build / `wpm project validate`, reads `wpm.lock` (parse) +
  the current vendored files → `verifyLockfile` → maps a non-`ok` result to the Integrity domain error
  (task-23). The plan-preview lists each artifact's locked version + source (doc 08/09).
