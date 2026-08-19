# Test Automation Summary — TASK-101 documentation/template parity

> `bmad-qa-generate-e2e-tests` output. Feature under test: package-shipped Markdown (`README.md` and `docs/`)
> advertises only project and bundle templates the shipped `wpm` registry resolves, and worked payload
> registration uses a path
> relative to `payload/files/`. Framework: Vitest 4.1.7 (`unit` and `integration` projects). This Node CLI has
> no HTTP API or browser UI, so API status-code and semantic-locator checklist items are not applicable.

## Generated tests

### Built-CLI E2E — `test/integration/docs-template-examples.e2e.test.ts`

- Runs the reconciled author flow through rebuilt `dist/cli.js` and the real filesystem/Backlog.md edge:
  `init --template minimal` → add a target → create advisor-free `core@0.3.0` → create `web-handoff` → add the
  satisfiable `^0.3.0` requirement → stage and register `launcher.json` → validate the project.
- Confirms `minimal` materializes 8 project tasks and advisor-free `core` materializes 11 bundle tasks.
- Confirms the default no-`--at` path creates `<cwd>/hermes-handoff`, produces exactly 19 tasks, and assigns
  `authoring-9`/`authoring-10` to core planning/backlog work as documented.
- Confirms registration stores `launcher.json`, not `payload/files/launcher.json`.
- Covers two critical error paths: the formerly documented `single-bundle` project template and
  `with-payload-skill` bundle template fail with typed CLI errors and leave no partial project/bundle state.

### Cross-artifact acceptance guard — `test/unit/docs/template-documentation-drift.test.ts`

- Derives built-in names from real directories containing `template.yml` under both template scopes.
- Requires every marked shipped inventory in package-shipped Markdown (`README.md` plus `docs/**/*.md`) to
  equal the real registry, while excluding unshipped root planning docs `FOUNDATION.md` and `ROADMAP.md`.
- Checks every concrete `wpm init ... --template` / `wpm bundle new ... --template` example against its scope.
- Prevents deferred names from returning in prose, directory trees, YAML, or fenced commands, with exact-token
  boundaries that do not mistake larger fixture labels or doc `05`'s ordinary “multi-bundle work” adjective
  for a template declaration.
- Rejects concrete `files add` arguments prefixed by `payload/files/` and requires a relative
  `launcher.json` example in both docs `10` and `11`.
- Keeps the doc `11` core recipe-task milestone aligned with the explicit `core` bundle version in the same
  worked session.
- Keeps doc `10`'s default init destination aligned with runtime and the worked session's subsequent `cd`.

## Acceptance coverage

| Criterion | Automated evidence |
| --- | --- |
| AC #1 — no worked example depends on an unresolvable template | Whole-doc concrete-command scan plus successful built-CLI execution of the reconciled workflow; legacy names fail atomically |
| AC #2 — every named template resolves or is removed | Real-directory inventory equality, exact deferred-name scan across all package-shipped Markdown, and built `template list` probes |
| Recorded payload-path correction | Static all-command scan plus real staging/registration assertion for `launcher.json` |

- Acceptance criteria automated: **2/2**, plus the recorded payload-path defect.
- TASK-101-specific cases: **13** total (**11** static cross-artifact cases + **2** built-CLI E2E cases).
- Happy paths: exact inventory, three reconciled `minimal` examples, explicit core creation, relative payload
  registration, and clean project validation.
- Critical errors: unavailable project/bundle templates are rejected without partial scaffolds; prefixed
  payload paths and deferred doc names are statically prohibited.

## Verification

- QA focused built-CLI E2E: **2/2 passed**.
- QA/review focused documentation guard: **11/11 passed**.
- Related development unit gate: **85/85 passed** across resolver, real templates, template commands, payload
  files, and documentation drift.
- Selected existing built-CLI integration gate: **5/5 passed** (92 unrelated cases filtered).
- Fresh built-CLI smoke: project template list = `project/minimal`; bundle template list = `bundle/default`;
  `minimal` init = 8 tasks; `core@0.3.0 --no-advisor` = 11 tasks.
- Final static/build gates: `npm run typecheck`, `npm run lint` (**199 files**), and `npm run build` passed.
- Final complete built suite: **1,250/1,250 passed across 99 files**, zero skipped or failed.

## Checklist disposition

- Tests use standard Vitest APIs and the repository's isolated temporary-directory pattern.
- Descriptions name observable user outcomes; no hardcoded waits, sleeps, ordering dependencies, or shared
  fixture state are introduced.
- Happy path and two critical failure cases are covered.
- Test files live in the existing `test/unit/` and `test/integration/` project layouts.
- API, UI, and locator checklist items are **N/A** because `wpm` is a filesystem/subprocess CLI.

## Next steps

- Keep `npm run build && npm test` in CI so the built-binary cases execute instead of self-skipping when
  `dist/` is absent.
- When a new built-in template is intentionally added, add its directory and update every marked shipped
  inventory in the same change; the drift suite will identify any incomplete update.
