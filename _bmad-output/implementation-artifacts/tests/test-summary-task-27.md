# Test Automation Summary — task-27 (commander composition root + DI + error handler)

> bmad-qa-generate-e2e-tests output (sprint-status writes suppressed — orchestrator-owned). The CLI is driven
> programmatically through `run()` as a black box (no child process), so the "E2E" framing lands as acceptance
> tests through the public CLI API, matching the repo's `*.acceptance.test.ts` house pattern. Framework: vitest
> (already present). New dep: commander@15.0.0 (doc 12 mandates it; was missing from the manifest — added).

## Generated / updated tests

### Unit (mechanics) — bmad-dev-story
- `test/unit/cli.smoke.test.ts` (REPLACED the bootstrap smoke) — 5: --version/--help/bare→0; unknown→2; help lists the 5 groups.
- `test/unit/util/exit.test.ts` (NEW) — 13: the exit-code table over runWithExit + formatError (UsageError→2; NotFound/Conflict/Constraint/Validation→1 clean; unexpected→1 +stack iff debug; DomainError stays clean with debug; commander help/version→0 silent; commander unknown-command→2).
- `test/unit/cli/dispatch-di.test.ts` (NEW) — 9: AC#1 dispatch + AC#2 same-injected-instance + AC#4 all six reserved verbs + a normal id + AC#3 project-not-found.
- `test/unit/util/symlink.test.ts` (EXTENDED) — +1: the fake↔real parity case (parent dir created before the link).

### Acceptance (black box via run(), AC-framed) — `test/unit/cli/cli.acceptance.test.ts` (NEW) — 12
- AC#1 "one registration pattern, dispatched" — help names all 5 groups; `bundle new web` dispatches to the leaf and creates the bundle.
- AC#2 "dependencies injected at the entry point reach the command" — one CliDeps; effects land in the SAME fs/backlog instances; output on the injected sink.
- AC#3 "exit-code table as lived behaviour" — duplicate→1 (clean, no stack); no-project→1 (names manifest.yml); unknown cmd→2; --version/--help→0; an unexpected error (malformed bundle template.yml → plain Error)→1 with the stack ONLY in debug.
- AC#4 "the grammar guard keeps bundle <id> unambiguous" — reserved verbs new/enable/list/template→2 naming the verb; a normal id succeeds.

### Integration (real fs, real tmpdir) — `test/integration/cli.bundle-new.test.ts` (NEW) — 1
- `bundle new web -C <tmpdir>` against a real NodeFileSystem + fixture project/templates on disk → exit 0, scaffold on disk, manifest updated, front-door re-derived. (FakeBacklog; the full real-template+real-backlog slice is task-33.)
- `test/integration/cli.bin.test.ts` (UPDATED) — the built-binary `--help` assertion now matches commander's `Usage:` block.

## Coverage / AC evidence
- AC#1: the `CommandModule` registration pattern registers all 5 doc-10 groups; dispatch verified to the `bundle new` proof leaf.
- AC#2: `CliDeps` (fs/backlog/clock/env + builtinTemplatesRoot) assembled once (`makeRealDeps`) and threaded via the registration closure; tests prove the same instances reach the command.
- AC#3: `src/util/exit.ts` `runWithExit` is the single exit-code decision (reusing task-23 `exitCodeFor`); the table is covered category-by-category + debug-gated stack; commander errors routed via `.exitOverride()`.
- AC#4: the reserved-verb refusal lives at the CLI grammar layer (`bundle new` action) as a `UsageError`→2, sourced from the model's exported `RESERVED_BUNDLE_VERBS`; the operation's `parseBundleId`→`ValidationError`→1 stays as defense-in-depth.

## Divergences recorded (doc wins; see story)
1. commander was NOT in the manifest (the brief assumed it was). doc 12 mandates commander → added + pinned to exact 15.0.0 + lockfile regenerated + npm ci.
2. `src/cli.ts` existed as a bootstrap whose own JSDoc said task-27 replaces it → replaced (+ smoke/bin tests updated). The planned hand-off.
3. **fake↔real fidelity fix (task-12 `src/util/symlink.ts`)**: the real `ensureSymlinkOrCopy` did NOT create the link's parent dir, so a real `fs.symlink('.claude/skills')` failed ENOENT when `.claude/` was absent (the MemoryFileSystem fake auto-creates it). Surfaced by the real-fs integration test. Fixed faithfully (mkdir -p the link's parent first; injectable `makeDirectories`), + a parity unit test. Non-breaking (existing symlink tests green).

## Result
- New/updated: smoke 5, exit 13, dispatch-di 9, symlink +1, acceptance 12, integration 1 (+ bin updated). Full suite green; tsc 0; biome 0 warnings; npm ci 0; core boundary intact (no commander/node:process/node:fs under src/core/**).

## Next steps
- task-28 (--help content contract), task-29 (omelette tab-completion), tasks 34–84 (the leaves, following the `CommandModule` pattern), task-33 (the walking skeleton with the real templates).
