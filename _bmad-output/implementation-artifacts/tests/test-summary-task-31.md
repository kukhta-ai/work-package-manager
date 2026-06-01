# Test Automation Summary — task-31 (Author the default bundle template)

> bmad-qa-generate-e2e-tests output. Feature under test: "Adding a bundle from the default template
> (`templates/bundle/default/`) produces a working bundle." The observable end-to-end behavior is the
> production `createBundle` operation rendering the REAL template into `bundles/<id>/`. No UI exists (CLI /
> library), so the "E2E" layer is the acceptance test driving the production operation + the real `backlog`
> CLI. Framework: vitest (project's existing harness; `unit` + `integration` projects).

## Generated / confirmed tests

### Acceptance tests (operation end-to-end, in-memory) — `test/unit/templates/default-bundle.test.ts`
Drives the production `createBundle` (via the task-25 `runMutation` lifecycle harness) over the GENUINE
on-disk `templates/bundle/default/` mirrored into a `MemoryFileSystem`, for a sample id `web-handoff`.
- [x] AC#1 — produced bundle has a parsing `bundle.yml` descriptor (id == sample), a `install-backlog/config.yml`
  with `task_prefix == <id>` + a non-empty `definition_of_done`, and per-bundle `AGENTS.md` scope notes.
- [x] AC#1 — the template ships NO `bundle.yml`; the operation writes it exactly once (no render-then-clobber).
- [x] AC#1 — the per-bundle + root scope-alias TARGET dirs exist (non-broken aliases; `installer-skills/.keep`).
- [x] AC#1 — the payload delivery slots (`payload/files`, `payload/templates`, `installer-scripts`) exist.
- [x] AC#1 — the new bundle is appended to the manifest (seeded comment preserved) and the front-door re-derived.
- [x] AC#1 — every receipt fact (doc 07 §enforcement) is present as a DoD item in the rendered config.
- [x] AC#2 — detect→setup→verify trio: three task files, ids `<id>-1/2/3`, each `kind:state` + its `step:` slug,
  each a valid Backlog.md task file (AC + DoD blocks), setup→detect and verify→setup dependencies.
- [x] AC#3 — no `{{…}}` marker survives in any produced file's CONTENT or PATH.
- [x] AC#3 — rendering the raw template files leaves no marker (substitution-only holds by construction).
- [x] (robustness) materialise — the 12 doc-11 authoring tasks are created by the operation.
- [x] (robustness/critical case) reusable — the ONE default template specializes per id: a second, different
  bundle (`doc-handoff`) gets its own id-prefixed scaffold with NO leakage of the first bundle's id, and both
  are independently enabled in the manifest.

### Integration tests (real `backlog` CLI, real tmpdir) — `test/integration/templates/default-bundle-install-backlog.test.ts`
Renders the real template's recipe via the production resolver + render, then drives the REAL `backlog` CLI
(runs serially under the `integration` project's `fileParallelism: false`; HOME/XDG isolated to the tmpdir;
skips when the CLI is absent).
- [x] AC#1/#2 — the CLI lists the detect/setup/verify trio with bundle-prefixed ids, NO `backlog init` run.
- [x] AC#1/#2 — the CLI reads each task's labels (`kind:state`/`step:*`), AC, dependency, and Definition of Done.
- [x] AC#1 — the shipped per-task DoD is real: `backlog task edit … --check-dod 1` succeeds and checks the item.
- [x] AC#1 — the rendered `config.yml` drives the prefix: a CLI-created task is bundle-prefixed (`<id>-4`).

## AC → coverage map
| AC | Covered by |
|----|------------|
| #1 working bundle (descriptor + DoD-gated install-backlog + scope notes) | unit: cases 1,2,3,4,8,10; integration: all 4 |
| #2 detect→setup→verify scaffold | unit: case 5; integration: cases 1,2 |
| #3 every placeholder substituted | unit: cases 6,7 (+ reusability case re-checks no marker for a 2nd id) |

## Coverage
- ACs: 3/3 covered, each by ≥ 2 cases (operation-level + real-CLI where applicable).
- Happy path: covered (a bundle is added and is fully working). Critical cases: no-double-write of `bundle.yml`;
  no cross-id leakage across a second bundle; the real CLI proving the recipe content is genuine Backlog.md.
- No UI → no browser E2E applicable.

## Divergence recorded
Backlog.md 1.45.2 discovers a backlog root ONLY by a folder literally named `backlog/`; it does not discover
`install-backlog/`. The template ships `install-backlog/` per doc 06/07 (the unit test verifies the shipped
structure); the integration test renders the recipe into a `backlog/` folder solely so the CLI can read it, to
prove the rendered config + task FILES are genuine Backlog.md. Reconciling the `install-backlog/` folder name
with the executor's Backlog.md is an EXECUTION-time concern (doc 03/09; a future task).

## Next steps
- Run in CI via the three-command gate (tsc + biome + vitest), which already includes both new files.
- The execution-time tasks (doc 03/09) should resolve the `install-backlog/` ↔ `backlog/` folder-name
  divergence (executor renames/links the recipe folder, or a newer Backlog.md gains a configurable root).
