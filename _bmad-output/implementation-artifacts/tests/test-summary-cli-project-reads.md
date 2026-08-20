# Test Automation Summary — `project show` / `project root` / `project validate` (tasks 37/49/48)

QA pass (bmad-qa-generate-e2e-tests; framework: vitest, the project standard). CLI tool, no UI → "E2E" =
acceptance-level end-to-end through the production `run()` entry point over in-memory ports, plus a
real-filesystem integration variant. All three commands are READS (no mutation, no side effects).

## Generated / extended tests

### Acceptance (in-process `run()` + in-memory ports) — `test/unit/cli/project-reads-commands.test.ts`
- [x] **37 show:** prints name/version/description/root/targets and EACH enabled bundle with the version read from
      its `bundle.yml` (incl. the summary); `--json` parses as valid JSON with the same fields and `bundles[].version`;
      text and JSON render the SAME orientation (a cross-render consistency test, so they cannot diverge);
      read-only (manifest byte-unchanged); no-project → exit 1 naming manifest.yml + init, and `-C` honoured;
      `--help` shows `--json` + an example.
- [x] **49 root:** prints exactly `"/proj\n"` (single line, no padding/decoration — composable in `$(...)`) with
      `-C`; walks up from a nested cwd to the nearest root with no `-C`; read-only; no-project → exit 1; `--help` substantive.
- [x] **48 validate:** a coherent project → a pass line + exit 0, changes nothing; an INCOHERENT project with
      THREE distinct problems in ONE fixture (empty targets + a missing-dependency requires + an orphan `bundles/stray`
      dir) → ALL THREE findings reported in one pass, each on its own line naming the location, exit 1; the
      manifest/bundle.yml are byte-unchanged when problems are found (no side effects); the error line is a clean
      domain error (no stack); a project with no `bundles/` dir validates fine; no-project → exit 1; `--help` substantive.

### Integration (real `NodeFileSystem` in a tmpdir) — `test/integration/cli.project-reads.test.ts`
- [x] show prints the orientation incl the bundle version read off real `bundle.yml`; `--json` parses; root prints
      the bare resolved path on real disk.
- [x] validate passes a coherent real project (exit 0), then reports + exits 1 on an orphan dir, leaving the
      manifest untouched.

## Coverage
- Commands: `project show [--json]`, `project root`, `project validate` — 3/3 covered.
- AC: TASK-37 (#1–#5), TASK-49 (#1–#4), TASK-48 (#1–#6) — all covered, with the headline behaviours asserted:
  validate's **all-findings-in-one-pass** (≥3 distinct findings) and **exit 1 on any finding**; show's `--json`
  parity; root's single-line composability.

## Notes
- `project validate` backs the EXISTING task-20 `validateProject` service (no new validation logic); it aggregates
  every problem (no fail-fast), which is exactly AC#2. The CLI lists `bundles/` dir names (the fs touch the pure
  service needs) and threads them as the read input; a non-empty report is mapped to exit 1 by throwing a
  `ValidationError` (clean domain error → exit 1) AFTER printing the per-finding lines to stdout.
- DIVERGENCE recorded: doc 10 row 148 step 5 lists a scope-alias well-formedness check, but the task-20 service
  deliberately omits it (its JSDoc), and AC#1 lists only the service's checks — so this command conforms to the
  service it backs; the scope-alias check is a fuller-vision item outside task-20.
- Observed (NOT in scope, not mine): the *real binary* `bundle new <id> --version <v>` printed a version string
  and created no bundle — a `--version` parsing quirk in the previously-merged `bundle` command. The `bundle new`
  tests pass via `run()`; my fixtures seed bundles directly, so this does not affect the project-reads tests.
- All tests pass under `vitest run`; independent (each builds its own fixture), no sleeps.
