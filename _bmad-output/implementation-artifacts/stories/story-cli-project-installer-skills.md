# Story cli-project-installer-skills — `project installer-skills add` / `list` / `remove` (tasks 45 + 46 + 47)

Status: ready-for-dev

> BMAD create-story output (skill-driven; BMAD sprint-status/epics auto-discovery suppressed — the real contract
> is the Backlog.md backlog tasks 45/46/47, read via `backlog task <id> --plain`, NOT the foundation-epic-1
> `epics.md`/`sprint-status.yaml`; the orchestrator owns sprint status and forbids touching it). Steered from doc
> 10 rows 178–180 + doc 10 line 32 (the structure-not-content "scaffold-or-attach" principle), doc 10 command
> tree lines 74–76, doc 11 §3, doc 06 lines 30/31/48/52/77/153 (root `installer-skills/`: CANONICAL install-time
> skills authored once; the main `<project>-installer` skill; scope aliases; union-scanned; NEVER a bare
> `skills/`), doc 13 §1/§5/§7/§8 (purity / lifecycle / error model).
>
> This is **project-bound family F** in the CLI epic-2 — the PROJECT-SCOPED TWIN of the just-completed Family P
> (`bundle <id> installer-skills`, tasks 77–79). It REUSES the Family-O skill scaffold-or-attach machinery
> (`renderSkillStub` + `validateSkillFrontmatter` + the registry-edit mechanics) and the SCAN-list pattern P
> introduced, but operates at the PROJECT ROOT (`installer-skills/`) against a NEW manifest-level registry, is
> wired as a `project` SUBCOMMAND (not per-bundle), and adds two project-only rules: a RESERVED-NAME REFUSAL
> (AC45#4) and a `list` EXCLUSION of the main installer + the advisors (AC46#1).

## Acceptance criteria (verbatim from the backlog — read via `backlog task <id> --plain`)

### TASK-45 — `project installer-skills add <name> [--path <path>]` (a MUTATION; doc-10 row 178)
1. When a SKILL.md exists at the resolved path or the `--path` location, its frontmatter is validated and the
   reference is registered at root scope.
2. When none exists and no `--path` is given, a stub is rendered at `installer-skills/<name>/SKILL.md` from the
   project template installer-skill snippet (frontmatter plus placeholder body, no invented prose) and a
   content-authoring task is materialised and registered.
3. When `--path` is given but nothing exists there, the command fails with a typed error directing the author to
   omit `--path` to scaffold.
4. A name ending in `-advisor` or matching the main installer skill name is refused as reserved.
5. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override.
6. Help output is substantive (description, synopsis, the name positional and `--path`, an example); on success
   it prints what it did (attached, or scaffolded with the task id) and exits 0.

### TASK-46 — `project installer-skills list` (a READ; doc-10 row 179)
1. The command enumerates the helper SKILL.md files under root `installer-skills`, excluding the main installer
   skill and the advisor skills.
2. The command reads and reports only, with no change on disk, and exits 0 on success.
3. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override.
4. Help output is substantive (description, synopsis, an example).

### TASK-47 — `project installer-skills remove <name>` (a MUTATION; doc-10 row 180)
1. The named helper is deregistered at root scope and the command prints that the SKILL.md was left at
   `installer-skills/<name>/` for the author to delete deliberately.
2. The file content is left untouched on disk: deregister, not delete.
3. Removing a name that is not registered fails with a typed not-found error and a non-zero exit.
4. Run outside any project it exits non-zero naming the missing `manifest.yml` and suggesting `init` or the `-C`
   override.
5. Help output is substantive (description, synopsis, the name positional, an example) and the name completes from
   registered project helpers; on success exits 0.

## doc-10 contract (cite the rows)

> `project installer-skills add <name> [--path <path>]` (row 178): "1. **Refuse a `<name>` ending in `-advisor`
> (reserved) or matching the main installer skill name.** 2. Resolve target: `--path` if given, else
> `installer-skills/<name>/SKILL.md` at root. 3. **If a SKILL.md exists there (attach):** validate frontmatter;
> register at root scope. 4. **If none exists and no `--path` (scaffold):** **Template-driven** render a stub at
> the conventional path from the project template's installer-skill snippet; **Task-driven** materialise 'Write
> content for install-time skill `<name>`'; register. 5. **If `--path` was given but nothing exists there:** error
> (omit `--path` to scaffold). 6. Print what it did (attached, or scaffolded + the task id)." [Source: docs/10
> §Per-command actions row 178; §command tree lines 74–76.]
> — NOTE step 1 (the reserved-name refusal) is F-ONLY; P (`bundle <id> installer-skills`) has no such rule. There
> is NO alias-ensure clause (that was P's step 5 / AC77#4 — bundle-specific).

> `project installer-skills list` (row 179): "Enumerate root `installer-skills/` for project helpers (excluding
> the main installer skill and the `<id>-advisor` skills)." [Source: docs/10 row 179.] — a directory SCAN with an
> EXCLUSION; the exclusion is WHY it must scan (a registry would not hold the main installer or the advisors,
> which are created by `init`/`bundle <id> advisor add`, not by `installer-skills add`).

> `project installer-skills remove <name>` (row 180): "Deregister at root; print 'deregistered; SKILL.md left at
> `installer-skills/<name>/`'." [Source: docs/10 row 180.]

> What the root `installer-skills/` holds (doc-06 lines 30/31): "`installer-skills/` [OPT] CANONICAL install-time
> skills — authored once, here. … `<project>-installer/` main installer skill ('install this bundle-project');
> named `<project>-installer`." So the root `installer-skills/` contains: the MAIN installer skill
> (`<project>-installer`), the per-bundle ADVISOR skills (`<id>-advisor`, scaffolded by `bundle <id> advisor add`
> at the project root — doc-10 row 116), AND the project-scoped HELPER skills this family manages. `list` shows
> only the last group (excluding the first two); the scope aliases point each agent's skills scope at this dir
> (doc-06 lines 48–53). [Source: docs/06 lines 30/31/48/52/77/153.]

> The governing PRINCIPLE (doc 10 line 32): same scaffold-or-attach uniform `add` meaning as O/P — *attach the
> skill if the author already wrote it, otherwise scaffold a stub and queue the writing* — never silently author
> a finished skill. [docs/10 line 32.]

## THE SCAN-vs-REGISTRY DECISION (same as P — record in the Completion Notes)

Identical resolution to Family P (a doc-10-led refinement, NOT a user gate): keep a **registry** (a NEW
manifest-level `installerSkills` field) for **add / remove / `remove`-completion**, and make **`list` SCAN the
root `installer-skills/` directory** (minus the main installer + the advisors). `remove` deregisters but LEAVES
the SKILL.md, so the scan-based `list` keeps showing a removed helper until the author deletes the file — the
payload-vs-installer-skill split (installer-skills are union-scanned at install — doc-06). F's `list` additionally
EXCLUDES the main `<project>-installer` and the `<id>-advisor` folders (AC46#1) — which a registry-read could not
do (those are not in the registry), reinforcing that `list` must scan.

## HOW F COMPUTES THE NAMES TO EXCLUDE / REFUSE

- **Main installer skill name:** `${manifest.meta.name}-installer` (doc-06:31 "named `<project>-installer`"). The
  project name is read from the loaded `manifest.yml` (`project.name`).
- **Advisor skill names:** `<bundle-id>-advisor` (doc-10 row 116). For the SCAN EXCLUSION (AC46#1 "the
  `<id>-advisor` skills"), exclude any folder whose name ENDS IN `-advisor` (this covers every bundle's advisor
  without enumerating bundles — simpler and robust to disabled/renamed bundles). For the REFUSAL (AC45#4), refuse
  a `<name>` ending in `-advisor` OR equal to `${meta.name}-installer`.
- **The `-advisor` reserved suffix is a pure-data check** (no manifest needed): a small predicate
  `endsWith("-advisor")`. The `<project>-installer` check needs the loaded project's name. Both are evaluated in
  the project-scoped spec's `check` (it has the loaded `project`), raising a typed error.

> WHY a USAGE error (exit 2) for the refusal: AC45#4 "refused as RESERVED" is a bad CLI ARGUMENT (the author asked
> for a name they may not use), like `bundle new <reserved-verb>` (which raises `UsageError`, exit 2 — see
> `RESERVED_BUNDLE_VERBS` in `cli.ts`). So the refusal is a `UsageError` raised at the boundary BEFORE the
> mutation (exit 2, nothing registered/scaffolded). Contrast the `--path`-missing error (AC45#3) and the
> not-registered remove (AC47#3), which are `NotFoundError` (exit 1) — those are missing-resource conditions, not
> bad arguments.

## THE CORE ADDITION — PROJECT-SCOPED specs (decision (b): a small project-scoped spec set)

The existing `skill-refs.ts` specs (`attachSkillRefSpec`/`scaffoldSkillRefSpec`/`removeSkillRefSpec`) are
BUNDLE-KEYED: their input carries `{id}`, they call `requireBundle(project, id)`, and they edit
`bundles/<id>/bundle.yml` at `descriptor.registryPath`. The project scope has NO id, edits `manifest.yml`, and
reads `project.manifest` — the SAME structural divergence `version.ts`/`targets.ts` already embody (project ops
edit `manifest.yml` directly; bundle ops take an id and edit `bundle.yml`).

**Decision (b): add a small set of PROJECT-SCOPED specs** (a new `src/core/operations/installer-skills-project.ts`,
or a clearly-separated section of `skill-refs.ts`), reusing the SHARED leaf helpers — NOT generalising the
descriptor. Rationale + the rejected alternative:
- **(a) generalise `SkillRefDescriptor` to a "host" abstraction** (parameterise `requireBundle`, the manifest
  path, the host type `BundleManifest | Manifest`, and the input `{id?}`): this threads an optionality through
  every O/P spec and the descriptor's `select` signature, churning the just-merged, twice-reused bundle core for
  one project consumer. REJECTED — it complicates the shared core to absorb a divergence the codebase already
  models by having separate project vs bundle operations.
- **(b) project-scoped specs** that mirror `version.ts`'s shape (edit `manifest.yml` via `editYaml` at
  `ctx.root`, project from `project.manifest`), reusing `renderSkillStub` (the stub render),
  `validateSkillFrontmatter` (the attach validation), and the SAME registry-edit mechanics (set-like `setIn` add,
  index `deleteIn` remove) — just over `manifest.yml`'s `["installerSkills"]` sequence instead of
  `bundle.yml`'s. **CHOSEN** — minimal, single-purpose, and consistent with the existing project/bundle split.

The shared pieces F reuses unchanged: `renderSkillStub` (`scaffold-skill.ts`), `validateSkillFrontmatter`
(`frontmatter.ts`), the `SkillRef` type, `editYaml`, and the SCAN-list spec `scanInstallerSkillsSpec`
(`skill-refs.ts`) — which projects threaded names and is scope-agnostic, so F reuses it as-is (the EXCLUSION is
applied in the CLI-shell scan walk, not the spec).

### The project-scoped specs (shape)
```ts
// src/core/operations/installer-skills-project.ts  (project scope; mirrors version.ts/targets.ts)
const PROJECT_INSTALLER_SKILLS_DIR = "installer-skills";       // ROOT-relative
const PROJECT_SNIPPET = "installer-skill.SKILL.md.tmpl";
const MANIFEST_FILE = "manifest.yml";
const REGISTRY_PATH = ["installerSkills"];                      // manifest.yml top-level sequence

/** ROOT-relative conventional SKILL.md path: installer-skills/<name>/SKILL.md. */
export function conventionalProjectSkillPath(name: string): string;

export interface AttachProjectSkillInput { readonly name: string; readonly path: string; }
export interface ScaffoldProjectSkillInput { readonly name: string; }
export interface RemoveProjectSkillInput { readonly name: string; }

export function attachProjectInstallerSkillSpec(): OperationSpec<AttachProjectSkillInput>;
  // CHECK: validate the name is NOT reserved (endsWith -advisor OR === `${meta.name}-installer`) → UsageError.
  //        (the refusal lives in CHECK so it aborts before any effect; it needs the loaded project's name.)
  // APPLY: read installer-skills/<name|path>/SKILL.md via fs → validateSkillFrontmatter → register {name,path}
  //        in manifest.yml's installerSkills (set-like on name) via editYaml. NO materialise.
export function scaffoldProjectInstallerSkillSpec(deps: SkillStubDeps): OperationSpec<ScaffoldProjectSkillInput>;
  // CHECK: same reserved-name refusal.
  // APPLY: renderSkillStub(deps, fs, root, `installer-skills/<name>/SKILL.md`, PROJECT_SNIPPET, {skill-name})
  //        + register {name, conventionalPath}. WITH materialise → "Write content for install-time skill <name>".
export function removeProjectInstallerSkillSpec(): OperationSpec<RemoveProjectSkillInput>;
  // CHECK: the name IS registered (else NotFoundError). APPLY: deleteIn the entry by index; NEVER delete the
  //        SKILL.md; summary "deregistered; SKILL.md left at installer-skills/<name>/ — delete it yourself …".
```

> The reserved-name refusal is in the ATTACH and SCAFFOLD `check` (both `add` paths reach a spec — the CLI 3-way
> picks attach vs scaffold vs the `--path`-missing error). Put it in BOTH specs' `check` (a shared
> `assertNotReserved(project, name)` helper) so the refusal fires regardless of branch and BEFORE any effect.
> ALTERNATIVELY raise it in the CLI shell before dispatch (the shell has the loaded project? — no: the shell has
> the root, not the parsed manifest; resolving the name needs `manifest.meta.name`). Cleanest is the spec `check`
> (it has the loaded `project`). For the `--path`-missing error branch, the CLI still raises `NotFoundError`
> before `runMutation` (no spec runs) — so the reserved-name check must ALSO be reachable there if a reserved name
> is given WITH a missing `--path`; precedence: **refuse the reserved name FIRST** (a reserved name is invalid
> regardless of `--path`), so do the reserved-name check in the CLI shell too, OR ensure the `--path`-missing
> throw is ordered AFTER a reserved-name throw. SIMPLEST + most robust: a tiny pure `isReservedInstallerSkillName(
> name, projectName)` helper used BOTH in the CLI shell (to refuse before the 3-way probe) AND re-asserted in the
> spec `check` (defense-in-depth) — the project name for the shell check comes from a cheap parse of `manifest.yml`
> the shell already can do (or thread it). Decide in dev-story; RECORD the final placement.

## PART 1 — THE MODEL + SCHEMA EXTENSION (a NEW manifest-level `installerSkills` registry)

Mirror P's bundle-level work, but at the MANIFEST level.

### `src/core/model/manifest.ts` — add `installerSkills` to `Manifest`
```ts
export interface Manifest {
  readonly meta: ProjectMeta;
  readonly bundles: readonly BundleId[];
  readonly targets: readonly AgentName[];
  /** Registered PROJECT-scoped install-time helper skills (doc 10 row 178) at root `installer-skills/`. Each is a
   *  {@link SkillRef} ({name, path}). NOT delivered (install-time helpers — doc 06/07). This registry backs
   *  add/remove/completion; `installer-skills list` SCANS the dir (excluding the main `<project>-installer` + the
   *  `<id>-advisor`s, which are not in this registry). Absent in manifest.yml ⇒ empty (purely additive). */
  readonly installerSkills: readonly SkillRef[];
}
```
Import `SkillRef` from `./bundle.js` (or wherever `model/index.ts` exports it). Export stays via `model/index.ts`.

### `src/core/services/schema/manifest.ts` — round-trip `installerSkills` (absent ⇒ empty)
- Extend `ManifestData` to add `readonly installerSkills: readonly { readonly name: string; readonly path: string
  }[]`.
- Parse it: `manifest.yml`'s top-level `installerSkills` (a list of `{name,path}` mappings). REUSE the SAME
  `{name,path}`-list validation P generalised (`parseSkillRefs` in `schema/bundle.ts` — EXPORT it from there, or
  lift it to a shared `schema/skill-refs.ts`/`schema/problems.ts` helper so both manifest + bundle schemas import
  ONE validator). Absent ⇒ `[]`. Field label `installerSkills`.
- `serializeManifest`: emit `installerSkills: manifest.installerSkills.map(s => ({name, path}))` — BUT match the
  existing `serializeManifest` style, which OMITS absent optional fields. Decision: emit `installerSkills` ALWAYS
  (empty ⇒ `[]`) like the bundle schema does for `payload`/`installerSkills`, so a written manifest carries the
  field; OR omit when empty to match `targets`/`bundles` (which are always emitted as arrays). Since `targets` and
  `bundles` are always emitted as (possibly empty) arrays, emit `installerSkills: []` always too (consistent).
  RECORD the choice; round-trip test it either way.

> **Compatibility (HARD):** every EXISTING `manifest.yml` (and the `minimal` template's `manifest.yml.tmpl`, which
> has NO `installerSkills`) MUST still parse — `installerSkills` becomes `[]`. The manifest parser is on the LOAD
> path for EVERY project-bound command; a regression breaks everything. Schema unit tests: absent ⇒ `[]`;
> populated round-trips; malformed entry → rejected naming `installerSkills`.

### `Manifest`-typed literals — add `installerSkills: []`
Making `installerSkills` a REQUIRED field on `Manifest` means every TS-typed `Manifest` (or inline-manifest)
LITERAL must add `installerSkills: []`. GREP for typed literals (NOT YAML-string data passed to `parseManifest`,
which need no change):
- `src/core/operations/init-project.ts` — the `Project.manifest` literal (`{ meta, targets: [], bundles: [] }`).
- Test fixtures building a typed `Manifest`/`Project`: `test/unit/services/derived-artefacts.test.ts` +
  `.acceptance.test.ts`, `test/unit/services/validate.test.ts` + `.acceptance.test.ts`,
  `test/unit/model/aggregates.test.ts`, `test/unit/operations/init-project.test.ts`,
  `test/unit/templates/minimal-project.test.ts` + `.acceptance.test.ts`,
  `test/unit/operations/create-bundle.test.ts` — GREP each for a `{ meta`/`manifest:` typed literal and add
  `installerSkills: []`. (String-YAML fixtures like `"bundles: []\n"` and schema-test DATA objects need NO change —
  the parser defaults absent ⇒ `[]`.) tsc will FAIL-FAST on any missed typed literal — fix until tsc is clean.

> The same `tsc`-driven sweep P did for `BundleManifest` literals (it added `installerSkills: []` to 7 bundle
> fixtures). F does the analogous sweep for `Manifest`/`Project` literals. Let tsc enumerate them.

### `init` / the manifest writer — init `installerSkills: []`
`init-project.ts` builds the in-memory `Project.manifest` literal (add `installerSkills: []` there). It does NOT
write the manifest via `serializeManifest` (it copies the `minimal` template's `manifest.yml.tmpl`), so the
WRITTEN manifest has no `installerSkills` key — which parses to `[]` (compat). That is fine: `installer-skills add`
introduces the field on first registration (via `editYaml setIn`), exactly as P's bundle `add` introduces
`installerSkills` on a payload-less `bundle.yml`. (OPTIONAL: add `installerSkills: []` to `manifest.yml.tmpl` for
symmetry with how the bundle template could carry it — but NOT required, and the doc-06 skeleton doesn't show it;
prefer leaving the template untouched, absent ⇒ empty. RECORD this.)

## PART 2 — THE CLI MODULE (`src/cli.ts`, add the `installer-skills` subgroup under `projectModule`)

F is a `project` SUBCOMMAND, so it is wired INSIDE `projectModule.register` (alongside `targets`/`version`/`show`/
`root`/`validate`), NOT in `PER_BUNDLE_MODULES`. Mirror the `targets` subgroup shape: `group.command("installer-
skills")` with `add`/`list`/`remove` leaves, each resolving the project via `requireProject(ctx, parent)`.

```ts
// inside projectModule.register(parent, ctx), after the `targets` subgroup:
const installerSkills = group
  .command("installer-skills")
  .description("register or inspect the project's install-time helper skills (not delivered) (doc 10)");

// ── project installer-skills add <name> [--path <path>] ────────────────────────────────────────────────────
const addLeaf = installerSkills
  .command("add")
  .argument("<name>", "the install-time helper skill's name (its SKILL.md folder under installer-skills/<name>/)")
  .option("--path <path>", "attach an existing SKILL.md at this project-relative path instead of the conventional location")
  .description("attach an existing project install-time helper skill, or scaffold a stub + queue its writing if none exists (doc 10)")
  .action((name: string, opts: { path?: string }) => {
    const root = requireProject(ctx, parent);
    // AC45#4: refuse a reserved name (ends in -advisor, or == `${project-name}-installer`) — a UsageError (exit 2)
    // BEFORE the 3-way probe. The project name is read from manifest.yml (cheap parse, like requireEnabledBundle).
    assertNotReservedInstallerSkillName(ctx, root, name);   // throws UsageError
    const conventional = conventionalProjectSkillPath(name);   // installer-skills/<name>/SKILL.md (ROOT-relative)
    const targetRel = opts.path ?? conventional;
    const exists = ctx.deps.fs.exists(join(root, targetRel));
    if (opts.path !== undefined && !exists) {
      throw new NotFoundError(`no SKILL.md at ${opts.path} — omit --path to scaffold a stub at ${conventional}, or place the file there first`);  // AC45#3
    }
    const result = exists
      ? runMutation(lifecycleDepsFor(ctx, root), { root }, attachProjectInstallerSkillSpec(), { name, path: targetRel })
      : runMutation(lifecycleDepsFor(ctx, root), { root }, scaffoldProjectInstallerSkillSpec({ builtinTemplatesRoot: ctx.deps.builtinTemplatesRoot }), { name });
    ctx.io.out.write(formatResult(result));   // AC45#6: attached / scaffolded + materialised: N
  });
withExamples(addLeaf, [
  { command: "wpm project installer-skills add detect-node", note: "attach the SKILL.md the agent placed, or scaffold a stub + queue its writing" },
  { command: "wpm project installer-skills add detect-node --path installer-skills/detect-node/SKILL.md", note: "attach an existing SKILL.md at an explicit project-relative path" },
]);

// ── project installer-skills list ──────────────────────────────────────────────────────────────────────────
// SCAN (doc-10:179): enumerate root installer-skills/ helper folders, EXCLUDING the main <project>-installer and
// any *-advisor folder. The fs walk + exclusion live in the shell (it owns the port + the project name).
const listLeaf = installerSkills
  .command("list")
  .description("list the project's install-time helper skills (scanned under installer-skills/, excluding the main installer + advisors) (doc 10)")
  .action(() => {
    const root = requireProject(ctx, parent);
    const scannedNames = projectInstallerSkillNames(ctx.deps.fs, root);  // excludes <project>-installer + *-advisor
    const { value } = runRead(ctx.deps.fs, { root }, scanInstallerSkillsSpec(), { id: "", scannedNames });
    ctx.io.out.write(formatInstallerSkillList(value));   // reuse P's formatter (names, or "(no installer skills)")
  });
withExamples(listLeaf, [{ command: "wpm project installer-skills list", note: "list the project's install-time helper skills" }]);

// ── project installer-skills remove <name> ─────────────────────────────────────────────────────────────────
const removeLeaf = installerSkills
  .command("remove")
  .argument("<name>", "the registered install-time helper to deregister (the SKILL.md is left on disk)")
  .description("deregister a project install-time helper skill, leaving its SKILL.md on disk (doc 10)")
  .action((name: string) => {
    const root = requireProject(ctx, parent);
    const result = runMutation(lifecycleDepsFor(ctx, root), { root }, removeProjectInstallerSkillSpec(), { name });
    ctx.io.out.write(formatResult(result));
  });
withExamples(removeLeaf, [{ command: "wpm project installer-skills remove detect-node", note: "deregister detect-node (its SKILL.md stays on disk)" }]);
```
- Reuse P's `formatInstallerSkillList` (it takes names) — already in `cli.ts`.
- Add a shell helper `projectInstallerSkillNames(fs, root)`: the immediate subdir names under
  `<root>/installer-skills/` that contain a SKILL.md, **MINUS** `${projectName}-installer` and any name ending in
  `-advisor` (read the project name from the loaded `manifest.yml`). Sorted. `[]` when the dir is absent.
- Add `assertNotReservedInstallerSkillName(ctx, root, name)` (or a pure `isReservedInstallerSkillName(name,
  projectName)` + the throw in the shell): refuse `name.endsWith("-advisor")` OR `name === \`${projectName}-installer\``
  with a `UsageError` (exit 2). Defense-in-depth: re-assert in the spec `check` too.
- `scanInstallerSkillsSpec()` takes `{id, scannedNames}` (P's input); pass `id: ""` (unused for project scope —
  its `summary` references the id, so EITHER pass a project label OR add a tiny project-summary overload. SIMPLEST:
  the scan spec's `summary` is cosmetic (`runRead` discards it for output); pass `id: ""` and the names project
  fine. If a non-empty/clean summary is wanted, make `scanInstallerSkillsSpec` accept an optional label — RECORD
  the choice. Reusing it with `id: ""` is acceptable since the read's value is the threaded names, printed by the
  CLI.)

> If reusing `scanInstallerSkillsSpec` with a dummy `id` feels impure, the alternative is a 3-line
> `scanProjectInstallerSkillsSpec` with input `{ scannedNames }`. Either is fine; prefer reuse unless the dummy id
> is awkward. RECORD which.

## PART 3 — COMPLETION (`COMPLETION_SPECS` under `project installer-skills` + sources)

These are TOP-LEVEL command paths (not per-bundle), so they go in `COMPLETION_SPECS` (the main table), NOT
`PER_BUNDLE_COMPLETION_SPECS`.
- `project installer-skills add <name>` — completes from the ON-DISK helper folder names under root
  `installer-skills/` (the attachable helpers; mirror P's on-disk source but ROOT-scoped, NOT id-aware — it reads
  the project root via `resolveContext`, no `bundleId`). Optionally EXCLUDE the reserved names (so completion
  never offers a name `add` would refuse) — nice-to-have, RECORD. A NEW source
  `projectInstallerSkillNamesOnDisk`. `"project installer-skills add": { args: ["project-installer-skills-on-disk"] }`.
- `project installer-skills remove <name>` (AC47#5 "completes from registered project helpers") — completes from
  the REGISTERED `manifest.installerSkills` names. A NEW source `projectInstallerSkillNamesRegistered` (read the
  project root, parse `manifest.yml`, project `installerSkills.map(s => s.name)`). `"project installer-skills
  remove": { args: ["project-installer-skills-registered"] }`.
- Register both in `defaultRegistry()`.

> These project sources are NOT id-aware (no `ctx.bundleId`) — they resolve the project root directly, like the
> `installed-target-names` source (which reads `manifest.targets`). Mirror that shape, not P's id-aware one.

## PART 4 — TEST PLAN (unit in-process + real-binary E2E; every AC mapped)

### Schema unit (`test/unit/schema/manifest.test.ts`, EXTEND)
- absent `installerSkills` ⇒ `[]` (and `targets`/`bundles` unaffected).
- populated `installerSkills: [{name,path}]` round-trips.
- `serialize` emits `installerSkills` per the chosen convention (empty ⇒ `[]` if always-emitted).
- malformed: not a list / entry not a mapping / entry missing name|path → rejected naming `installerSkills`.

### CLI unit (`test/unit/cli/project-installer-skills-commands.test.ts`, NEW — mirror bundle-installer-skills)
Seed `/proj` (manifest `name: demo`, so the main installer is `demo-installer`) with the project template snippets
(incl. `installer-skill.SKILL.md.tmpl` + the front-door + orchestrator for ④ RERENDER). The manifest has NO
`installerSkills` key (old shape). NO bundle needed (project scope). Place helpers under
`<proj>/installer-skills/<name>/SKILL.md`.
- **45#1 attach (conventional + --path)** — place a valid SKILL.md at `installer-skills/detect/SKILL.md`;
  `project installer-skills add detect` → exit 0; `manifest.installerSkills` has `{name:detect, path:installer-
  skills/detect/SKILL.md}`; file bytes UNCHANGED; SUMMARY "attached"; NO `materialised:` line. Plus a `--path`
  variant.
- **45#1 attach invalid frontmatter** — no `description` → exit 1 (ValidationError); manifest byte-identical.
- **45#2 scaffold** — `project installer-skills add fresh` (no file, no --path) → exit 0; a stub at
  `installer-skills/fresh/SKILL.md` (`name: fresh` + placeholder, NO invented prose); registered; the task **"Write
  content for install-time skill fresh"** (NO bundle id) materialised; SUMMARY + `materialised: 1`.
- **45#3 --path-but-missing** — `project installer-skills add ghost --path installer-skills/ghost/SKILL.md` → exit
  1 (NotFound naming the path + "omit --path"); manifest unchanged; no stub written.
- **45#4 reserved-name refusal** — `project installer-skills add foo-advisor` → exit 2 (UsageError); AND
  `project installer-skills add demo-installer` (the `<project>-installer` name) → exit 2; both register/scaffold
  NOTHING (manifest unchanged, no stub). (Assert the exit code is 2, distinct from the exit-1 errors.)
- **45#5 outside-project** — exit 1 naming `manifest.yml` + `init`.
- **45#6 help** — Usage + `<name>` + `--path` + Example.
- **46#1 list (scan + EXCLUSION)** — seed root `installer-skills/` with: `demo-installer/SKILL.md` (the main
  installer), `web-advisor/SKILL.md` (an advisor), `helper-one/SKILL.md` + `helper-two/SKILL.md` (real helpers,
  placed WITHOUT add). `project installer-skills list` → stdout = `helper-one\nhelper-two\n` (the main installer +
  the advisor are EXCLUDED, and the author-placed helpers show without registration — proving SCAN + exclusion).
- **46#1 empty** — no helpers (only the main installer + an advisor) → `(no installer skills)`.
- **46#2 read-only** — manifest unchanged after list.
- **46#3 outside-project** — exit 1 naming `manifest.yml`.
- **46#4 help** — Usage + Example.
- **47#1 remove** — register `fresh` (scaffold), `project installer-skills remove fresh` → gone from
  `manifest.installerSkills`; SUMMARY "left at installer-skills/fresh/"; exit 0.
- **47#2 file-left** — after remove, the SKILL.md still exists.
- **47#3 not-registered** — `project installer-skills remove nope` → exit 1 (NotFound); manifest unchanged.
- **47#4 outside-project** — exit 1 naming `manifest.yml`.
- **47#5 name completes from registered** — `__complete project installer-skills remove <tab>` → the registered
  names.
- **47#5 help** — Usage + `<name>` + Example.
- **end-to-end + scan-vs-registry** — scaffold `fresh` → list (shows) → remove → list STILL shows `fresh` (file
  left; scan ≠ registry); task materialised; (no comment-preservation assertion needed unless the seed manifest
  carries a comment — add one to assert it survives the `editYaml` add/remove).
- **add completes from on-disk helpers** — `__complete project installer-skills add <tab>` → on-disk helper names.
- **installer-skills group help** — lists add/list/remove.

### Real-binary E2E (`test/integration/cli.project-installer-skills.e2e.test.ts`, NEW — `describeIfBuilt`)
Through `dist/cli.js` + real `NodeFileSystem` tmpdir + real `backlog`. `init demo --at <proj>` gives a project
named `demo` (so the main installer is `demo-installer`, scaffolded by init at `installer-skills/demo-installer/`).
Add a `placeProjectInstallerSkill(proj, name, content)` helper writing `<proj>/installer-skills/<name>/SKILL.md`.
- **attach** — place `installer-skills/detect/SKILL.md`; `project installer-skills add detect` → exit 0;
  `manifest.yml` gains `installerSkills:` … `- name: detect` / `  path: installer-skills/detect/SKILL.md`; SUMMARY
  attached; file unchanged; NO materialised line.
- **scaffold + materialise (cold)** — `project installer-skills add fresh` → exit 0; SUMMARY scaffolded +
  materialised; stub at `installer-skills/fresh/SKILL.md` (`name: fresh` + TODO, no prose); registered;
  **the task "Write content for install-time skill fresh" materialised in `.authoring-backlog`** (assert via
  `backlog task list --plain` in `<proj>/.authoring-backlog`). The loop-closure proof.
- **--path-but-missing error** — exit ≠ 0; manifest unchanged; no stub.
- **45#4 reserved-name refusal (real binary)** — `project installer-skills add web-advisor` → exit 2; AND
  `project installer-skills add demo-installer` → exit 2; manifest unchanged each time.
- **list (scan + EXCLUSION)** — `init` already created `installer-skills/demo-installer/SKILL.md`; place
  `installer-skills/helper/SKILL.md` (no add) and `installer-skills/foo-advisor/SKILL.md`; `project
  installer-skills list` → stdout contains `helper`, and does NOT contain `demo-installer` or `foo-advisor`.
- **remove (deregister, file left, scan still shows)** — `project installer-skills remove detect` → exit 0;
  "left at installer-skills/detect/"; entry gone from manifest; SKILL.md still on disk; `list` still shows
  `detect`.
- **not-registered remove error** — exit ≠ 0; manifest unchanged.
- **completion** — `__complete project installer-skills add` → on-disk helper names; `__complete project
  installer-skills remove` (after add) → registered names.
- **help** — `project installer-skills add --help` contains the leaf usage, `<name>`, `--path`, Example.
- **OLD-manifest compat** — a `manifest.yml` with NO `installerSkills` key still drives `list`
  (`(no installer skills)`, modulo init's main installer being excluded) AND `add` (introduces the field).

---

## Dev Notes

### Files to ADD
- `src/core/operations/installer-skills-project.ts` — the project-scoped specs (attach/scaffold/remove over
  `manifest.yml`'s `installerSkills`) + `conventionalProjectSkillPath` + the reserved-name predicate, reusing
  `renderSkillStub` + `validateSkillFrontmatter` + `editYaml`. (OR a clearly-separated section of `skill-refs.ts`
  — but a separate file mirrors `version.ts`/`targets.ts` and keeps the bundle core untouched; PREFER the new
  file.)
- `src/completion/project-installer-skills-on-disk.ts` + `src/completion/project-installer-skills-registered.ts` —
  the two project-scoped completion sources (NOT id-aware; resolve the project root directly).
- `test/unit/cli/project-installer-skills-commands.test.ts` — the in-process CLI suite.
- `test/integration/cli.project-installer-skills.e2e.test.ts` — the real-binary E2E suite.

### Files to CHANGE
- `src/core/model/manifest.ts` — add `Manifest.installerSkills: readonly SkillRef[]` (+ import `SkillRef`).
- `src/core/services/schema/manifest.ts` — `ManifestData.installerSkills`; parse via the shared `{name,path}`-list
  validator (export/lift `parseSkillRefs` from `schema/bundle.ts`); wire into `parseManifest` + `serializeManifest`.
- `src/core/operations/init-project.ts` — add `installerSkills: []` to the in-memory `Project.manifest` literal.
- `src/cli.ts` — add the `installer-skills` subgroup under `projectModule`; the `projectInstallerSkillNames` shell
  walk (with exclusion) + the reserved-name helper; the two `COMPLETION_SPECS` entries; imports of the project
  specs + (reused) `scanInstallerSkillsSpec`/`formatInstallerSkillList`.
- `src/completion/registry.ts` — register the two project sources.
- `test/unit/schema/manifest.test.ts` — the `installerSkills` round-trip / absent / malformed cases.
- **Test fixtures (every `Manifest`/`Project`-typed literal)** — add `installerSkills: []`. Let tsc enumerate the
  set (the P precedent: a tsc-driven sweep). Likely: `derived-artefacts.test.ts` + `.acceptance`, `validate.test.ts`
  + `.acceptance`, `aggregates.test.ts`, `init-project.test.ts`, `minimal-project.test.ts` + `.acceptance`,
  `create-bundle.test.ts`. (String-YAML + parse-DATA fixtures need NO change.)

### Architecture constraints (doc 13 — HARD)
- **Core boundary**: `installer-skills-project.ts` stays PURE — import only model/services(frontmatter, render via
  renderSkillStub)/ports/errors/`node:path`/the yaml leaf, NEVER `node:fs`/`commander`/`execa`. The fs SCAN +
  exclusion for `list` and the reserved-name refusal-before-probe live in the CLI shell. (`core-boundary.test.ts`
  + Biome enforce.)
- **Core is synchronous**; all actions sync.
- **Error model** (docs/13 §7): reserved-name (AC45#4) → `UsageError` (exit 2 — a bad argument). `--path`-missing
  (add) + not-registered (remove) → `NotFoundError` (exit 1). Broken frontmatter on attach → `ValidationError`
  (exit 1). Outside-project → `requireProject`'s `NotFoundError` (exit 1).
- **Lifecycle**: attach/scaffold/remove ride `runMutation` (④ RERENDER auto — no per-bundle alias-ensure here;
  ④ still re-renders the front-door/orchestrator + the PROJECT-ROOT scope aliases, which is correct). ONLY scaffold
  has ⑤ MATERIALISE. list rides `runRead`. Structure-not-content: add never authors the body; remove never deletes.

### Reuse — do NOT reinvent
- `renderSkillStub` (stub render), `validateSkillFrontmatter` (attach validation), `SkillRef`, `editYaml`
  set-like-add / index-remove, `scanInstallerSkillsSpec` (the scan list spec), `formatInstallerSkillList`,
  `formatResult`/`withExamples`/`lifecycleDepsFor`/`requireProject`.
- The project subgroup wiring shape: `projectModule`'s `targets` subgroup (the `group.command("…")` + add/list/
  remove leaves each calling `requireProject`).
- The project-scoped manifest-edit shape: `version.ts` (edit `manifest.yml` via `editYaml`, project from
  `project.manifest`).
- The reserved-verb refusal precedent (UsageError exit 2): `bundle new`'s `RESERVED_BUNDLE_VERBS` check in `cli.ts`.
- The non-id-aware completion source shape: `installed-target-names` (reads `manifest.targets`).
- The `parseSkillRefs` `{name,path}` validator (P generalised it with a `fieldBase` param) — SHARE it across the
  bundle + manifest schemas (export it; do not duplicate the validation).

### Project Structure Notes
- F is the SECOND installer-skills twin and the proof the core generalises to PROJECT scope too: F adds project-
  scoped specs (mirroring version.ts/targets.ts) + a manifest-level registry, reusing the stub renderer +
  frontmatter validator + scan-list spec from O/P. The bundle core (`skill-refs.ts`'s O/P specs) is UNTOUCHED.
- The manifest-level `installerSkills` is the project analogue of P's bundle-level `installerSkills`. Both are
  install-time-helper registries (NOT delivered payload), absent ⇒ empty.
- F's `list` exclusion (main installer + advisors) is the project-only twist — it is the concrete reason `list`
  scans rather than reads the registry (the excluded skills are not registry entries).
- AC45#4's reserved-name refusal protects the two reserved roles at root: the main `<project>-installer` (one per
  project) and the per-bundle `<id>-advisor`s — neither is a hand-added helper, so `add` must refuse those names.

### References
- [Source: docs/10-authoring-cli.md §Per-command actions rows 178/179/180 (`project installer-skills
  add|list|remove`); §command tree lines 74–76; line 32 (scaffold-or-attach principle); line 25 (Structure, not
  content); row 116 (`bundle <id> advisor add` → `installer-skills/<id>-advisor/`).]
- [Source: docs/11-authoring-process.md §3 (materialised by the skill-adding commands, scaffold branch only — the
  project installer-skill content task "Write content for install-time skill `<name>`").]
- [Source: docs/06-project-skeleton.md lines 30/31/48/52/77/153 (root `installer-skills/` = CANONICAL install-time
  skills; the main `<project>-installer`; scope aliases; union-scanned; never a bare `skills/`); docs/07 line 51
  (install-time tooling not delivered).]
- [Source: docs/13-core-architecture.md §1 (ports/purity; operations MAY call the fs port; reads stay pure), §5/§8
  (six-beat lifecycle), §7 (error model → exit codes: UsageError=2, NotFound/Validation=1), §4 (services tier).]
- [Source: src/core/operations/skill-refs.ts (`scanInstallerSkillsSpec` — REUSED; the bundle specs are the model
  for the project specs); src/core/operations/scaffold-skill.ts (`renderSkillStub` — REUSED);
  src/core/services/frontmatter.ts (`validateSkillFrontmatter` — REUSED); src/core/operations/version.ts (the
  project-scoped manifest-edit operation shape); src/core/operations/targets.ts (the project subgroup operation
  shape); src/core/services/schema/manifest.ts (`parseManifest`/`serializeManifest` — extend for `installerSkills`);
  src/core/services/schema/bundle.ts (`parseSkillRefs` — SHARE it); src/cli.ts `projectModule` (the `targets`
  subgroup wiring) + `requireProject` + `RESERVED_BUNDLE_VERBS` (the UsageError precedent) + `formatInstallerSkillList`
  + `COMPLETION_SPECS`; src/completion/installed-target-names usage (the non-id-aware source shape);
  templates/project/minimal/snippets/installer-skill.SKILL.md.tmpl (the scaffold snippet — uses `{{skill-name}}`).]
- [Source: _bmad-output/implementation-artifacts/stories/story-cli-bundle-installer-skills.md — Family P, the
  bundle-scoped twin; F mirrors it at project scope (manifest registry, project subgroup, reserved-name refusal,
  list exclusion).]

## Dev Agent Record

### Agent Model Used
Opus 4.8 (1M context) — BMAD build worker. Skills actually run (Rule 3 evidence): `bmad-create-story` (this
story), `bmad-dev-story` (the project-scoped specs + manifest model/schema + CLI subgroup + completion + unit
tests), `bmad-qa-generate-e2e-tests` (the real-binary E2E block: attach / scaffold+materialise / --path-missing /
reserved-name refusal / list-scan-with-exclusion / remove-leaves-file / not-registered error).

### Completion Notes List
- **BMAD skills run (Rule 3 evidence):** `bmad-create-story` → this story; `bmad-dev-story` → the manifest
  model/schema + project-scoped specs + CLI subgroup + completion + unit tests; `bmad-qa-generate-e2e-tests` → the
  real-binary E2E suite (`cli.project-installer-skills.e2e.test.ts`).
- **Scan-vs-registry decision (same as P):** REGISTRY (the new top-level `manifest.yml` `installerSkills`,
  `{name,path}`) for add/remove/completion; `list` SCANS the root `installer-skills/` directory. `remove`
  deregisters but LEAVES the SKILL.md, so the scan-based `list` keeps showing it (the deliberate payload-vs-
  installer-skill split). Proven in-process (list-after-remove still shows) and real-binary.
- **Registry shape:** `Manifest` gains a top-level `installerSkills: [{name,path}]` (reuses O's `SkillRef`). Absent
  ⇒ `[]` (old/partial manifest.yml compat, verified at schema-unit + real-binary level). `serializeManifest` always
  emits `installerSkills: []` (like `targets`/`bundles`). The `parseSkillRefs` validator (P generalised it with a
  `fieldBase` param) is now EXPORTED from `schema/bundle.ts` and SHARED by both the bundle + manifest schemas (one
  validator, no duplication).
- **Project-scoped specs (decision (b)):** a NEW `src/core/operations/installer-skills-project.ts` holds
  attach/scaffold/remove operating on `manifest.yml`'s `installerSkills` (mirroring `version.ts`'s manifest-edit
  shape), reusing `renderSkillStub` + `validateSkillFrontmatter` + the `editYaml` set-like-add/index-remove
  mechanics. The bundle core (`skill-refs.ts` O/P specs) is UNTOUCHED — chosen over generalising the descriptor to
  a host abstraction (which would churn the twice-reused bundle core for one project consumer). The scan-list spec
  `scanInstallerSkillsSpec` is REUSED as-is (scope-agnostic — it projects threaded names; called with `id: ""`).
- **AC45#4 reserved-name refusal:** `<name>` ending in `-advisor` OR equal to `<project>-installer` →
  `UsageError` (exit 2 — a bad argument, distinct from the exit-1 missing-resource errors). Computed from the
  loaded manifest's project name (`${meta.name}-installer`). The pure predicate `isReservedInstallerSkillName(name,
  projectName)` lives in the spec module and is used in BOTH the CLI shell (to refuse BEFORE the 3-way probe — a
  reserved name is invalid regardless of `--path`) AND the spec `check` (defense-in-depth). Verified for both
  `foo-advisor`/`web-advisor` and the exact `demo-installer` name, in-process and real-binary.
- **AC46#1 list exclusion:** `list` SCANS root `installer-skills/*/SKILL.md` but EXCLUDES the main
  `<project>-installer` + any `*-advisor` folder (the same `isReservedInstallerSkillName` predicate). This is WHY
  `list` scans (the excluded skills are not registry entries — they are created by `init`/`advisor add`). Proven:
  on an init'd `demo` project, `list` hides `demo-installer` + `foo-advisor`, shows author-placed `helper`.
- **How F computes the main-installer name:** `${manifest.meta.name}-installer` (doc-06:31). The advisor exclusion
  matches any name ending in `-advisor` (covers every bundle's advisor without enumerating bundles).
- **NO alias-ensure clause:** that was P/bundle-specific (AC77#4). F's `add` has no alias step; ④ RERENDER still
  re-renders the front-door/orchestrator + the project-root scope aliases (correct), but the leaf adds nothing.
- **Placement:** F is a `project` SUBCOMMAND, wired inside `projectModule.register` as the `installer-skills`
  subgroup (alongside `targets`/`version`), NOT in `PER_BUNDLE_MODULES`. Completion specs are in the main
  `COMPLETION_SPECS` table (not per-bundle); the two sources are NOT id-aware (resolve the project root directly,
  like `installed-target-names`).
- **Help-contract fix:** the `add` leaf was initially given TWO worked examples ("Examples:"); the task-28
  in-process help-completeness guard (`fullHelp` via `cmd.outputHelp()` in a per-command loop) dropped the
  multi-example `addHelpText` block for that specific leaf (a commander/`outputHelp` ordering quirk — the real
  binary rendered it fine). Reduced `add` to a SINGLE worked example (matching every other passing leaf in the
  static program tree; the `--path` usage stays documented in the example note + the `--path` option help). The
  guard passes; the contract ("a worked usage example") is satisfied.
- **Fixtures:** every `Manifest`/`Project`-typed literal gained `installerSkills: []` — 1 src (`init-project.ts`)
  + 10 test fixtures, enumerated by tsc (the same tsc-driven sweep P did for `BundleManifest`).

### File List
ADD:
- `src/core/operations/installer-skills-project.ts` — the project-scoped attach/scaffold/remove specs +
  `conventionalProjectSkillPath` + `mainInstallerSkillName` + `isReservedInstallerSkillName`.
- `src/completion/project-installer-skills.ts` — the two project-scoped (non-id-aware) completion sources.
- `test/unit/cli/project-installer-skills-commands.test.ts` — the in-process CLI suite (24 tests).
- `test/integration/cli.project-installer-skills.e2e.test.ts` — the real-binary E2E suite (10 tests).

CHANGE:
- `src/core/model/manifest.ts` — add `Manifest.installerSkills: readonly SkillRef[]`.
- `src/core/services/schema/bundle.ts` — EXPORT `parseSkillRefs` (now shared).
- `src/core/services/schema/manifest.ts` — `ManifestData.installerSkills`; parse via the shared `parseSkillRefs`;
  wire into `parseManifest` + `serializeManifest`.
- `src/core/operations/init-project.ts` — init `installerSkills: []` in the `Project.manifest` literal.
- `src/cli.ts` — the `installer-skills` subgroup under `projectModule` (3-way add + reserved-name refusal + scan
  `list` + remove); `projectName` + `projectInstallerSkillNames` (scan-with-exclusion) shell helpers; the two
  `COMPLETION_SPECS` entries; imports.
- `src/completion/registry.ts` — register the two project sources.
- `test/unit/schema/manifest.test.ts` — the `installerSkills` round-trip / absent / malformed cases.
- Test fixtures (+`installerSkills: []` on each `Manifest`/`Project`-typed literal):
  `test/unit/model/aggregates.test.ts` (×2), `test/unit/operations/create-bundle.test.ts`,
  `test/unit/operations/init-project.test.ts`, `test/unit/services/derived-artefacts.test.ts` + `.acceptance`,
  `test/unit/services/validate.test.ts` + `.acceptance`, `test/unit/templates/minimal-project.test.ts` +
  `.acceptance`.

### Status
review — implementation complete, all 45/46/47 ACs satisfied. Left UNCOMMITTED for the orchestrator to review,
tick the backlog ACs, commit, and merge (per the worker brief: do not commit / touch sprint-status / sdlc-state).
