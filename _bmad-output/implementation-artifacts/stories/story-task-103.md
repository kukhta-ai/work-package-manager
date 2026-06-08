# Story task-103 — Let bundle scaffolding omit or cleanly remove an unused payload-skill stub

Status: ready-for-dev

> BMAD create-story output produced via the **stated fallback** (Rule 3): the `bmad-create-story` /
> `bmad-dev-story` skills auto-discover the foundation **epic-1** sprint mirror (`sprint-status.yaml` / `epics.md`)
> and cannot run unattended against this ad-hoc `feature/fix-103` bug branch, which has no sprint entry. So this
> story is driven directly from the binding contract — `backlog task 103 --plain` (3 ACs) + the fix brief — and
> steered from doc 10 rows 173/175 (`bundle <id> skills add` / `remove`), doc 10 line 32 (structure-not-content
> "scaffold + queue the writing"), doc 10 line 282 (the bundle-template catalogue: `default` ships an **empty
> payload**), and doc 13 §1/§5/§8 (purity / six-beat lifecycle / error model). The fallback is reported back to
> the orchestrator.

## Acceptance criteria (verbatim from the backlog — `backlog task 103 --plain`)

1. Creating a bundle does not leave an unregistered payload-skill stub that the build then ships.
2. A scaffolded-but-unregistered payload skill can be removed through the CLI.
3. A bundle that ships no payload skill builds without a placeholder skill in the archive.

## The bug (confirmed by the epic-4 dogfood)

`wpm bundle new <id>` clones the bundle template, which ships
`templates/bundle/default/files/payload/agent-skills/{{bundle-id}}-skill/SKILL.md.tmpl`. Every new bundle therefore
gets a payload-skill stub **on disk** with placeholder content, but it is **NOT registered** in
`bundle.yml.payload.skills` (which stays `[]`). The build (`src/core/operations/build.ts` `shippableFiles`)
enumerates the on-disk `payload/agent-skills/**`, so it ships that placeholder regardless of registration. And
`wpm bundle <id> skills remove <id>-skill` refuses ("not registered … nothing to deregister"), so a config-only
bundle is stuck shipping a placeholder skill it cannot remove via the CLI.

## The model (verified in code before changing)

- `bundle <id> skills add <name> [--path]` — SCAFFOLD a stub + register, or ATTACH an existing SKILL.md + register
  (`scaffoldSkillRefSpec` / `attachSkillRefSpec`, `src/core/operations/skill-refs.ts`). The scaffold renders from
  the **project** template snippet `payload-skill.SKILL.md.tmpl` (NOT the bundle template), so it is unaffected by
  the bundle-template fix. This is how a payload skill SHOULD come to exist (and it registers).
- `bundle <id> skills remove <name>` — currently DEREGISTERS and **leaves** the SKILL.md on disk
  (`removeSkillRefSpec`; doc 10 row 175 / 76#1/#2 — the deliberate "deregister, not delete" model, like
  `files remove`). Its `check` throws `NotFoundError` when the name is not registered ⇒ an orphan is unremovable.
- doc 10 line 282 already specifies `default` as the **empty-payload** scaffold and names a SEPARATE
  `with-payload-skill` template (`default` + a payload skill). So the shipped `default` template carrying a
  payload-skill stub is **already inconsistent with the doc**; removing it conforms to the spec.

## The fix

### PRIMARY — AC#1 + AC#3: stop `bundle new` from creating the unregistered stub

Remove the payload-skill stub `templates/bundle/default/files/payload/agent-skills/{{bundle-id}}-skill/` from the
bundle template. After this, `bundle new` creates no payload skill; `skills add` scaffolds one on demand (it
already does, from the project snippet). Keep the empty payload-skills SLOT present with a `.keep`, matching the
sibling `payload/files/.keep` and `payload/templates/.keep` (the template advertises "the payload delivery slots")
— a `.keep` is not a skill, is never registered, and never ships as a placeholder skill. The install-backlog
task-2 body mentions `payload/agent-skills/` only **generically** ("register the `payload/agent-skills/` skill"),
which now correctly implies the author uses `skills add`; no reconciliation needed there.

### AC#2: make an on-disk-but-UNREGISTERED payload skill removable through the CLI

Design — **CLI owns the registered-vs-orphan probe and dispatches to single-purpose specs**, mirroring the
established `skills add` 3-way (attach / scaffold / error) split (doc-13 §1: "the 3-way decision needs a disk probe
and a pure `check` has no port"). The `skills remove <name>` leaf becomes a 3-way:

- **REGISTERED** → `removeSkillRefSpec` (UNCHANGED: deregister, leave the SKILL.md on disk — preserves 76#1/#2 and
  the installer-skill families P/F that reuse it).
- **UNREGISTERED but present on disk** at the conventional `payload/agent-skills/<name>/` → a new single-purpose
  `removeUnregisteredSkillStubSpec`: there is nothing to deregister, so it removes the stray scaffold directory via
  the fs port (`fs.remove`), and reports it clearly.
- **UNREGISTERED and absent** → `NotFoundError` ("not registered … and no stub on disk … nothing to remove"),
  exit 1, nothing changed (preserves 76#3).

Why this is consistent with deregister-not-delete: that contract protects **registered** (author-committed)
content — the registry is authoritative for payload skills (inert until install, doc 06). An UNREGISTERED on-disk
skill was never committed through `add`; it is debris (the template stub, or a manually-placed stub). Removing it
on an EXPLICIT `remove <name>`, with a clear message naming exactly what was deleted, is the sensible action — and
the registered path's deregister-and-leave behaviour is byte-for-byte untouched.

Completion: `skills remove` completes from the **union** of registered names ∪ on-disk folder names (a new
`skillNamesRemovable` source), so an orphan is discoverable to remove — exactly the set the new 3-way handles.

## Files to change

- `templates/bundle/default/files/payload/agent-skills/{{bundle-id}}-skill/SKILL.md.tmpl` — DELETE.
- `templates/bundle/default/files/payload/agent-skills/.keep` — ADD (preserve the slot).
- `src/core/operations/skill-refs.ts` — add `removeUnregisteredSkillStubSpec(descriptor)` + its input type.
- `src/cli.ts` — `bundleSkillsModule` remove leaf: probe registry (a `runRead` of `listSkillRefsSpec`) + dispatch.
- `src/completion/skills-removable.ts` (new) + `src/completion/registry.ts` + the `skills remove` routing in
  `src/cli.ts` — union completion source.

## Purity / boundary

`build.ts` is untouched and stays pure (it already ships on-disk `payload/agent-skills/**`; the latent
"deregister-then-still-ships" issue is NOTED, not fixed — out of scope for these ACs). The new spec imports only
`node:path`, the model, the errors, and the lifecycle types + the injected fs port — no CLI framework / subprocess
/ `node:fs`. The core import-boundary rule holds.

## Tests (dev-story)

- Unit (`test/unit/templates/default-bundle.test.ts`): AC#1 — the produced bundle has the `payload/agent-skills`
  slot but NO skill subdirectory / SKILL.md, and `bundle.yml.payload.skills == []`.
- Unit (`test/unit/operations/skill-refs.test.ts`): `removeUnregisteredSkillStubSpec` removes the orphan dir;
  errors when absent.
- Unit (`test/unit/cli/bundle-skills-commands.test.ts`): the remove dispatch — orphan removed; registered still
  deregister-and-leaves; neither ⇒ exit 1.
- E2E (`test/integration/cli.bundle-new.test.ts`): AC#1 — `bundle new` leaves no payload skill + `payload.skills == []`.
- E2E (`test/integration/cli.build.e2e.test.ts`): AC#3 — built tarball contains no placeholder payload skill.
- E2E (`test/integration/cli.bundle-id.e2e.test.ts`): reconcile the sample-skill-dependent tests (place a skill
  where ATTACH/ completion needs one), and add the orphan-removal E2E.

## Definition of Done

Typecheck clean, Biome clean, tests added + green (fast suite + the four named e2e), public funcs documented, no
dead code, `src/core/` import-boundary intact. No commit, no branch change, no backlog status/AC ticks.
