# Test Automation Summary — `wpm init` FULL (task-34)

Framework: **vitest** (the project's existing runner). Integration project runs `fileParallelism: false` over
shared real `backlog`/`dist` state — run ONE vitest process at a time.

## AC → E2E / integration coverage (all GREEN)

| AC | What it requires | Covering test(s) |
|----|------------------|------------------|
| #1 | project root: manifest (name from positional; targets/bundles from template), `bundles/bundle-template/`, empty `installer-skills`/`templates`/`.authoring-backlog` (Backlog.md root, `task_prefix=authoring`) | `cli.init.test.ts` → `assertProjectOnDisk` (real disk, all paths) + unit `init-project.test.ts` AC#1 |
| #2 | derived `AGENTS.md` + installer `SKILL.md`, mechanical substitution, no prose | `assertProjectOnDisk` (substituted name + no markers outside the scaffold) + unit "single-source byte-identical to deriver" |
| #3 | one scope-alias per declared target; none if no targets | real-disk: `init` (minimal) ⇒ NO `.claude/skills`; `project targets add claude-code` ⇒ real symlink. **Unit AC#3-positive** (fixture template declaring `claude-code` + pre-including `core`): root alias `.claude/skills`→`installer-skills/` AND per-bundle alias `bundles/core/.claude/skills`→`bundles/core/installer-skills/` |
| #4 | project-wide set materialised + per-bundle set for each pre-included bundle | real-`BacklogCli`: the 8 project-wide titles land in a real `.authoring-backlog` (`authoring-1..8`, next=`authoring-9`). **Unit AC#4-positive**: project-wide (8) + per-bundle `core` (12) = 20 materialised |
| #5 | refuse when target path exists; create nothing | `cli.init.test.ts` "re-running init on an existing path exits 1 changing nothing" + unit refuse-target-exists |
| #6 | `--list-templates` prints + creates nothing; `--param k=v` feeds substitution | `cli.init.test.ts` two tests + malformed-`--param` exit-2 + unit `--param` threads through |
| #7 | `.gitignore` has `.authoring-backlog/`; summary names path + N tasks; exit 0 | `assertProjectOnDisk` (.gitignore) + "materialised: 8" summary assertion |
| #8 | help: description, synopsis, every flag + positional, example; `--template`/`--list-templates` complete from project templates | `init --help` E2E (every flag asserted) + completion unit (`init` → `project-template-names`) |
| §4 | `bundle new` clones `bundles/bundle-template/` (set is live); still works registry-only | `cli.bundle-new.test.ts` (edit-then-clone, reflects edit + id substituted) + unit create-bundle §4 block + the task-27 proof leaf (registry fallback) |

## Generated / updated tests

- `test/unit/operations/init-project.test.ts` — REWRITTEN to the full-init contract; ADDED AC#3-positive + AC#4-positive (fixture template with a declared target + pre-included bundle) + `projectWideAuthoringTasks` unit.
- `test/unit/operations/create-bundle.test.ts` — ADDED the §4 default-branch describe (project scaffold preferred / explicit-template registry / absent-scaffold fallback).
- `test/integration/cli.init.test.ts` — REWRITTEN: real-`run()` + real-`dist/cli.js` + real-`backlog` (`.authoring-backlog`) + real-disk scope-alias.
- `test/integration/cli.bundle-new.test.ts` — ADDED the §4 reconciliation E2E.
- `test/integration/cli.bundle-template.e2e.test.ts` — tests 55 + 56#2 updated to the post-task-34 reality.

## Gap found and CLOSED by this QA pass

AC#3's POSITIVE case ("one alias **per declared target**") and AC#4's per-bundle case were only structurally
present, never exercised — because the only project template on disk (`minimal`) declares no targets and
pre-includes no bundles, AND `buildProjection` originally hardcoded `targets: []`/`bundles: []`. That hardcode
was a latent correctness gap: a template that DID declare targets/bundles would have been silently ignored.

Fix: `buildProjection` now LOADS the just-rendered `manifest.yml` (and each pre-included `bundle.yml`) — so `init`
genuinely honors whatever the chosen template declares. Added the two unit tests above (fixture template with a
declared target + a pre-included bundle) to lock the positive cases. No real-binary positive test is possible
because no template-with-targets ships today (out of scope; not invented).

## Coverage

- AC#1–#8: covered end-to-end (real disk + real binary + real backlog where the AC touches those ports).
- §4 reconciliation: covered (live-set clone + no-regression).
- No redundant/padding tests added.

## Next steps

- The Phase-6 epic gate (cold E2E re-run + tea trace/nfr) covers this command alongside the rest of the CLI epic.
