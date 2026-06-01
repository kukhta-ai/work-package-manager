# Test Automation Summary — task-33 (Walking skeleton: one vertical slice through every layer)

> bmad-qa-generate-e2e-tests output. Feature under test: "the WALKING SKELETON — one real `wpm init <name>`
> drives a real change on disk through every layer (commander command surface → the `initProject` operation →
> the services → the FileSystem + BacklogMd ports), observed in a REAL working directory." The FOUNDATION-
> COMPLETE checkpoint before the per-command leaves (tasks 34–84). Framework: vitest (`unit` + `integration`
> projects). No UI/runtime API → Steps 2–3 (API/browser E2E) do not apply.

## Tests — `test/integration/cli.init.test.ts` (8 cases) — THE WALKING SKELETON (AC#1)
Runs the slice end-to-end against a REAL `NodeFileSystem` in a real tmpdir through the production `run()` path
(and the actual `dist/cli.js` binary when built); isolated per-tmpdir via `withTempDir`.
- AC#1 — `run(["init","hermes-handoff","--at",dir])` → a working project on REAL DISK: `manifest.yml` parses
  (name substituted, empty bundles/targets), `AGENTS.md` (front-door from the SNIPPET, the name + the doc-07
  recognition line), the orchestrator `installer-skills/<name>-installer/SKILL.md` + `references/journaling.md`,
  `README.md`, `RALPH-LOOP.md` — all present, NO `{{…}}` in any produced file (recursive scan). Exit 0.
- AC#2 — the SMALLEST slice: the produced project has NO `bundles/` scaffold (that is the full `init`).
- refusal — re-running `init` on the existing project → exit 1 (`ConflictError`), `manifest.yml` byte-unchanged.
- default-cwd — without `--at`, `init <name>` nests under `<cwd>/<name>` (doc 10/12).
- AC#3 (ADDED) — the command surface is reachable: `init --help` shows `<name>`, `--at`, and the worked
  `Example:` (dogfooding the task-28 contract — `init` has options/args so it MUST carry one).
- AC#1/#3 through the built binary (`describeIfBuilt`): `execFileSync(node, [dist/cli.js, "init", …])` for BOTH
  `init <name>` (default cwd → `<cwd>/<name>/`) and `--at <dir>` — the truest "single command-line invocation …
  real working directory."
- BacklogMd port (`describeIfBacklog`, HOME/XDG-isolated): the real `BacklogCli` initialises a valid
  `.authoring-backlog/` (task_prefix=authoring → a created task is `authoring-1`).

## Tests — `test/unit/operations/init-project.test.ts` (8 cases) — the operation over in-memory ports
- working project + the derived front-door/orchestrator (from snippets) + the manifest parsing + the BacklogMd
  port init; full `{{…}}`-free substitution; AC#2 no `bundles/`; `ConflictError` on re-run (manifest
  unchanged); `NotFoundError` on a missing template.
- (ADDED) `changedPaths` lists every produced path (the observability contract the command's `formatResult`
  uses) and contains no duplicate.
- (ADDED) **single-source verified:** the front-door + orchestrator `init` writes to disk are BYTE-IDENTICAL to
  what the task-26 `makeArtefactDeriver` produces — proving `init` renders from the SAME single source the
  deriver (every mutation) uses (the collapse's whole point).

## Tests — UPDATED for the single-source collapse
- `test/unit/templates/minimal-project.test.ts` — the front-door/orchestrator are rendered from `snippets/`
  (not the removed `files/` copies); the `references/journaling.md`-from-`files/` assertion is kept; the
  drift-guard test is REPLACED by a single-source assertion (the two `files/` `.tmpl`s no longer exist; the
  snippets do).
- `test/unit/templates/minimal-project.acceptance.test.ts` — `instantiate()` now models what `init` does (copy
  `files/` AND render the two snippets), so the black-box AC#1/AC#2 checks hold unchanged.
- `test/unit/cli/help-contract.test.ts` — the "bare group" exemplar switched from `init` (now a real leaf) to
  `template`; `init` is asserted to carry an example (it has options/args).

## AC → coverage map
| AC | Covered by |
|----|------------|
| #1 real-disk change through every layer in a real working directory | the 8 integration cases (run() + built-binary + real-backlog), each asserting on REAL DISK |
| #2 smallest meaningful slice, not a complete command | "no bundles/" in both the integration and unit tests; the operation implements only doc-10 init steps 1–4 + 8 (+ the authoring-backlog) |
| #3 the layers compose end-to-end (foundation complete) | the built-binary E2E (commander → operation → real fs); the `init --help` command-surface case; the single-source byte-identical case (operation ↔ deriver) |

## Gaps found & closed
1. (observability) No test asserted the operation's `changedPaths` lists the produced files. Added a case
   asserting every produced path is listed (and de-duplicated) — the seam the command's `formatResult` reports.
2. (single-source end-to-end) The collapse's correctness — that `init` uses the SAME source the deriver uses —
   was implied but not proven. Added a byte-identical assertion (`init`'s written front-door/orchestrator ==
   `makeArtefactDeriver`'s output).
3. (command surface / AC#3) Added `init --help` dogfooding task-28: the surface shows `<name>` + `--at` + the
   worked example, demonstrating commander is wired into the slice.

## Coverage
- ACs: 3/3, each by multiple cases. 8 unit + 8 integration = 16 init cases (+ the updated template tests), all
  green. The slice is proven through commander, the operation, the services, and BOTH ports (FileSystem +
  BacklogMd), on real disk and through the real binary.
- No UI → no browser E2E; no runtime API → no status-code tests.

## The single-source collapse (resolved task-30 forward-note)
`templates/project/minimal/files/AGENTS.md.tmpl` and `…/files/installer-skills/{{project-name}}-installer/
SKILL.md.tmpl` are REMOVED. The front-door + orchestrator live ONLY in `snippets/`; `init` copies `files/`
(manifest, README, RALPH-LOOP, the orchestrator's static `references/journaling.md`) AND renders the two
snippets via the deriver — every artefact has exactly one source. The drift-guard test is obsolete and removed.

## Next steps
- Run in CI via the three-command gate + a build (so the binary tests run): tsc + biome + vitest + `npm run
  build` + vitest again.
- This is the foundation epic's final task. Tasks 34–84 fill the command leaves (the full `init`, `project`,
  `template`, `build` groups) on top of this proven hexagon.
