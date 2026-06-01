# Test Automation Summary — task-19 (derived-artefacts service + scope-alias planning)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The derived-artefacts service is pure (no I/O — it's a projection the operation applies), so
> the "acceptance" band is the RERENDER lifecycle round exercised entirely in memory.

## Generated / relevant tests

### Unit (service behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/agent-aliases.test.ts` — the doc-05 map (claude-code→.claude/skills,
  codex/hermes→.agents/skills, openclaw→.openclaw/skills); unknown agent → undefined; **never a bare
  `skills/`**; .agents/skills shared by codex+hermes.
- [x] `test/unit/services/derived-artefacts.test.ts` — `deriveArtefacts` renders front-door + orchestrator
  with `{{project-name}}`/`{{bundles}}` (and the project name in the orchestrator PATH); bundle summaries in
  manifest order, ghost id skipped; `scopePlan` root + per-bundle entries, unknown agent surfaced, no-bundles
  case; determinism (×2 deep-equal); `planChanges` empty-when-current / detects-stale-file / detects-missing
  -file / detects-missing-aliases.

### Acceptance (the RERENDER lifecycle round), this skill
- [x] `test/unit/services/derived-artefacts.acceptance.test.ts`
  - Realistic `Project` (hermes-handoff; core 0.3.2 + web-handoff 0.2.0 with summaries; targets claude-code +
    codex) built from real `BundleManifest`s.
  - `deriveArtefacts` → front-door + orchestrator rendered with name + summaries (AC#1); alias plan = root +
    per-bundle for both targets, 6 entries (AC#2).
  - Determinism (derive ×2 deep-equal).
  - Full apply cycle (AC#3): `planChanges(desired, empty)` writes every file + alias → build the now-current
    state from that change set → `planChanges(desired, current)` is **empty** (re-derive onto a current
    project changes nothing).

## Coverage
- AC#1 (derive front-door + orchestrator + alias set): covered (unit + acceptance).
- AC#2 (aliases for declared targets at project + bundle level): covered (root + per-bundle; unknown
  surfaced).
- AC#3 (deterministic + no-op when current): covered (×2 deep-equal + the empty second-pass change set).

## Result
`npx vitest run` → 275 passed (29 files), run as a single process. `tsc --noEmit` clean, `biome check .`
clean (no warnings).

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The mutating operations (task-25/26+) invoke this as the §5 step ④ RERENDER: resolve the snippets
  (task-17) → `deriveArtefacts` → `planChanges` against the FileSystem-read current state → apply the delta
  (write files + `FileSystem.ensureAlias`). The agent→alias map (doc 05) is the source of truth for which
  aliases ship.
