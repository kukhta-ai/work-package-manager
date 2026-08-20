# Authoring-agent context ledger (Phase A + B)

**Purpose.** Gather everything an agent that will *author* a wpm project/bundle needs to understand about
wpm's **concept** and **usage**, so it can be distilled into the authoring agent's two runtime surfaces.

**The hard constraint that shapes everything.** A generated authoring workspace ships the agent exactly **two
context surfaces**, and *nothing else*:
1. the workspace **authoring front door** (`AGENTS.md`, rendered from `templates/project/minimal/snippets/authoring-front-door.md.tmpl`, 40 lines, always resident); and
2. the **`installer-builder` skill** (`agent-skills/installer-builder/`: `SKILL.md` spine 86L + 4 on-demand references ≈ 310L), installed via `wpm skill install`.

The 15 design docs (`00`–`14`) are the **source of truth** but **do not travel into the workspace** (they live
in the wpm package, not the author's tree). So "improve the authoring agent's understanding" == *mine the docs +
CLI + templates → distill into those two surfaces*, under progressive disclosure, the ~70–85-line/reference
discipline, what-not-how, and "cite the canonical doc, don't fork a second source of truth."

**Method.** 6 parallel miners read the doc set in full, the CLI (ground truth), the templates, and the current
authoring surfaces, filtered through the need profile in §1. This file is the consolidated result. Status:
Phase A + B complete (gathering); Phase C (delivery design) / D (write) / E (dogfood-verify) not yet done.

---

## §1 — Phase A: the authoring-agent need profile (the relevance filter)

What an agent authoring a project/bundle must hold — distinct from the *contributor* (who builds wpm) and the
*executor* (who installs). Three axes; each item has an id used throughout the ledger.

**CONCEPT — understand, to author well**
- **C1 The model.** project = manifest + bundles; bundle = independent install unit with its own
  install-backlog (recipe) + payload + skills + `requires`; manifest = release identity + flat enabled-bundle
  list + target agents.
- **C2 The core bet.** Intent + verification run by a *reasoning agent* beats fixed steps run by a dumb engine,
  *because the target environment is unknown* — the WHY behind "tasks state outcomes, not steps."
- **C3 Structure-not-content.** The CLI owns structure; the agent writes the sense-dependent prose. Thin
  builder, fat agent.
- **C4 Bundle independence.** Bundles are independent; couplings are *declared* (`requires`), never assumed.
- **C5 Who runs it.** A context-less executing agent: detect→setup→verify, idempotent, records a receipt,
  pauses at confirmation/handoff, resumes across restarts, contains a failing bundle. The author writes *for* it.
- **C6 What "done"/"installed" means.** The install contract: the task's acceptance criteria *are* the
  verification carried inside the bundle; the receipt (recorded at do-time); installed-vs-adopted; idempotent
  re-run; uninstall by replaying journalled inverse ops.
- **C7 Native agent surfaces.** Per-scope skill discovery; the five skill roles; the `AGENTS.md`/`CLAUDE.md`
  front-door mechanic + scope aliases; the per-agent scope table.
- **C8 The authoring workspace.** Author in `wip/`, build to `builds/`, the executor front door is author-owned
  `_AGENTS.md` stripped to `AGENTS.md` at build; the wrapper never ships.

**USAGE — do, to author**
- **U1** the `wpm` command surface (structure via CLI). **U2** the authoring workflow + the `.authoring-backlog`
  catalog. **U3** recipe-task authoring (Backlog.md V2 tags `step:`/`kind:`/version-milestone, the
  detect→setup→verify trio, authored *directly* in each bundle's install-backlog, NOT via wpm). **U4** the
  acceptance-criteria what-not-how contract (the central, constantly-applied authoring skill). **U5**
  versioning/updates (project vs per-bundle versions, `requires` constraints, from-version migration gates,
  state-task vs migration). **U6** registration mechanics (files/skills/templates/scripts/advisors; payload vs
  installer-skills; scope aliases per target). **U7** build + handoff (dry-run/package; the author-owned
  `_AGENTS.md`).

**QUALITY — make it good + verify**
- **Q1** make-the-implicit-explicit (prime directive). **Q2** simulate-the-executor (highest-value move).
  **Q3** force the three author decisions (trust gradient / verification / confirmation level). **Q4** hunt
  leaked couplings. **Q5** don't confabulate / don't over-pin. **Q6** no bundle is done without a verify step
  (the AC is the proof).

---

## §2 — Phase B: the ledger (by need-item)

Each item: **current coverage** in the authoring surfaces (FULL / PARTIAL / ABSENT, from the audit) →
**the gathered nuggets** (distilled point — doc§) → **proposed delivery surface** (a Phase-C hint).

### CONCEPT

**C1 — The model.** Coverage: **FULL** (SKILL.md "What you are building" + ptr to doc 00).
- A project is one repository you hand over: bundles + an orchestrator (front-door file + manifest) deciding which run — doc00 §model.
- A bundle is an *independent* unit delivering one user-facing capability, its own Backlog.md root + payload — doc00 §model.
- Manifest = release identity + **flat** enabled-bundle-id list + target agents; per-bundle version/summary/requires live in `bundle.yml` — doc00 §Vocabulary / doc06.
- Bundle **id** is stable kebab-case (names dir, `task_prefix`, `requires`); **version** moves (id-vs-version = MSI UpgradeCode-vs-ProductCode) — doc00/doc06/doc08.
- A bundle dir **not listed in manifest is disabled & inert** (never offered/built/reviewed) — doc06 §Hard rules.
- Minimal viable package = `AGENTS.md` + `manifest.yml` + one bundle with an `install-backlog/` (config.yml carries the DoD) — doc06 §Minimal.
- *Surface:* keep in SKILL.md spine; deepen the vocabulary in a concept reference (see gaps).

**C2 — The core bet.** Coverage: **PARTIAL** (embodied in the trust-gradient + mandatory-verify, but never *named*; the "why outcomes beat steps" rationale is only implicit).
- "Intent + verification, executed by a reasoning agent, beats fixed steps" — *because the env is unknown* — doc00 §What this is. **(the single biggest concept gap)**
- You trade determinism for an install that *bends to reality instead of breaking on it*; the agent adapts, verification proves it — doc00.
- Verification must **travel inside each bundle** (the author can't pre-test the user's machine) — doc00.
- The executor is **smart but forgetful** — push work into its reasoning, keep only a minimal receipt — doc00.
- A pinned file is the author's *reference*, not a runtime guarantee; the executor checksums what it places — doc01 §three decisions. **(authors routinely get this wrong)**
- *Surface:* NAME the bet in SKILL.md spine (1–2 lines) + a concept reference; it's the "why" behind U3/U4/Q.

**C3 — Structure-not-content.** Coverage: **FULL** (conventions §cross-cutting; SKILL "which surface does what"; command-reference; front door).
- CLI manages structure (projects/bundles/manifest/registered refs); the agent writes content (task bodies, SKILL.md, payload files) by hand — doc10 §"Structure, not content"; doc04 §two surfaces.
- *Surface:* fine as is.

**C4 — Bundle independence.** Coverage: **FULL** (quality-protocol "Hunt leaked couplings").
- Couplings leak in unbidden ("core has obviously run by now"); flag undeclared assumptions, shared mutable state, hard-coded ids, assumed ordering — doc01 §independence.
- Inter-bundle ordering is **declared in `requires`**, never assumed; the multi-root structure is what makes "independent" checkable — doc01/doc00.
- *Surface:* fine; reinforce the `requires`-not-assume rule near U5.

**C5 — Who runs it (the executor).** Coverage: **PARTIAL** (context-less executor + detect→setup→verify + simulate are strong; the full runtime loop — record→resume-from-receipt, idempotent skip, containment — is only lightly echoed; canonical loop lives in docs 03/09, not the skill).
- The install is **a backlog executed by a looping reasoning agent**, each iteration a *fresh context* picking the next unfinished task from disk; memory lives in the filesystem — doc09 §1.
- Per-bundle loop is identical everywhere: **detect→skip-if-satisfied→plan→do→verify-against-AC→record→advance** — doc03/doc09 §3.
- DETECT is a *reasoning* check against the AC (may find intent met by a different mechanism, or a partial prior attempt) — doc09.
- The executor **resolves `requires` transitively**; the target agent is a **peer dependency** it checks for but never installs; if this agent isn't a declared target it **STOPs** — doc03/doc09 §5.
- **Idempotent detection IS the repair primitive** — install/update/repair collapse into one workflow pointed at different starting states — doc03/doc09 §6.
- It journals **only non-re-derivable facts** at do-time (installed-vs-adopted, inverse op, overwritten file, chosen value); re-derives the inspectable — doc03/doc09.
- Pauses at **handoffs** (marks Blocked + notes, resumes from receipt); on partial failure **contains damage to the failing bundle**, leaves siblings intact, offers a detect-safe retry; reversal is **soft, not transactional** — doc03/doc09 §5.
- *Surface:* this is what makes Q2 (simulate-the-executor) real — distil the loop into a concept/executor reference.

**C6 — The install contract.** Coverage: **PARTIAL** (all four sub-concepts present; the doc-07 framing — config.yml **Definition-of-Done that GATES receipt fields before Done** — is thin in the skill; fuller only in the bundle `_AGENTS.md` template).
- **The task fields ARE the receipt**; write only what you can't re-derive by looking — doc07 §intro.
- Contract has 4 layers: policy (`AGENTS.md`) + enforcement (**DoD**) + storage (task fields/labels/notes) + mechanism (MCP preferred, `--plain` fallback) — doc07.
- The **AC you write goes in `--ac` and IS the in-bundle verification**; it *doubles as the repair integrity check* — doc07 §receipt.
- Files placed/modified → `--ac`/`--ref` (the owned-files manifest, queryable); per-task requirement → `--dep`; per-environment facts (ownership, inverse op, checksum, decision) → the **single structured notes block** — doc07.
- **Backlog.md has a FIXED schema, no custom fields** — never invent frontmatter keys; labels are reserved for structural vocabulary (identity/kind/version) — doc07. **(easy to get wrong)**
- DoD items map 1:1 to receipt facts; "Done" is impossible until they hold; `--dod` adds per-task, `--no-dod-defaults` opts out only where there's no reversible effect — doc07 §enforcement.
- Recipe vs receipt: shipped `install-backlog/` holds NO state (replaced wholesale on update); the receipt is a persistent stamped copy — so update never loses record — doc07/doc08.
- *Surface:* deepen in the concept/contract reference; cross-link from U3/U4.

**C7 — Native agent surfaces.** Coverage: **PARTIAL** (front-door/alias mechanic covered in conventions; **the 5 skill roles taxonomy and the per-agent scope table are NOT distilled anywhere**).
- A skill fires **only when a prompt matches its `description`** — the description is the load-bearing field — doc05.
- Skills are catalogued **only from scanned scopes at session start**; a skill outside a scanned scope (or cloned mid-session) is inert — doc05.
- Each agent scans **cwd → repo root + one personal scope**; `.agents/skills/` is the consolidating standard (Codex+Hermes), with `.claude/skills/` + `.openclaw/skills/` as symlink aliases — doc05.
- **Never a bare `skills/`** at any level; only `installer-skills/` aliases sit in a scanned scope; payload skills get **no** alias (so they can't fire before install) — doc05/doc06.
- The five skill roles (see §4 table) — installer / vendored-discipline / advisor / install-time-helper / payload — each with a distinct trigger discipline — doc05.
- *Surface:* **NEW reference `native-surfaces.md`** (the 5 roles + scope table + front-door/alias mechanic).

**C8 — The authoring workspace.** Coverage: **PARTIAL** (excellent in the always-resident front door + conventions; SKILL.md & authoring-workflow.md never mention `wip/`/`builds/` — which is exactly why their worked-example paths drifted, see §6).
- The author never edits the deliverable in place; the tool generates a workspace that **wraps** it — doc01 §workspace.
- Three regions: **workspace root** (authoring front door + `.authoring-backlog/`, gitignored, builder-time only), **`wip/`** (the deliverable), **`builds/`** (output) — doc01/doc06/doc12.
- The built archive is `wip/` **un-nested to the archive root**, content unchanged *except* the executor front door's reserved-prefix strip (`_AGENTS.md`→`AGENTS.md` + build-created `CLAUDE.md`/`GEMINI.md` aliases per targets) — doc06/doc12.
- The wrapper (authoring front door, `.authoring-backlog/`, `builds/`) **never ships** — doc06.
- *Surface:* propagate `wip/` awareness into SKILL.md + authoring-workflow (the stale paths in §6).

### USAGE

**U1 — wpm command surface.** Coverage: **PARTIAL** (command-reference comprehensive **except it omits the `wpm skill install` group**, which the CLI ships and the front door references). See the verified command map in §4. Key seams: workspace marker `wip/manifest.yml` (walk-up) + `-C/--project`; exit codes **0 ok / 2 usage|input / 1 runtime|validation**; CLI does **not** wrap Backlog.md task ops or file content (the no-mirror rule). *Surface:* add the `skill install` row; fix the stale re-render claim (§6).

**U2 — authoring workflow + `.authoring-backlog` catalog.** Coverage: **FULL** (authoring-workflow.md; paths stale, §6).
- Tasks are materialised **incrementally** when a command introduces scope — no `wpm plan`, no re-scan — doc11.
- `init` materialises 8 project-wide tasks; `bundle new` materialises the 12-task per-bundle set; version-bump/requires/targets materialise focused follow-ups — doc11 §3 (verified 1:1 against the live CLI).
- Materialisation is **idempotent by title**; the agent self-attests completion — the CLI **never auto-closes** an AC — doc11 §4.
- Operate the authoring backlog with **Backlog.md directly** (`cd .authoring-backlog && backlog …`), no wpm wrapper — doc11 §5.
- *Surface:* fine; repoint stale `wip/` paths.

**U3 — recipe-task V2 tagging + detect→setup→verify.** Coverage: **FULL** (conventions §V2 tagging; quality-protocol §Decompose).
- Tag every recipe task with exactly three things: identity `step:<slug>`, `kind:state|kind:migration`, version milestone `-m` — nothing more — doc08.
- Authored **directly** in each bundle's install-backlog via `backlog`, NOT via wpm: `cd wip/bundles/<id> && backlog task create "…" -l "kind:state,step:<slug>" -m <v> --ac "…" --dod "…"` — doc10 §worked-sessions.
- Flag gotchas: labels do **not** accumulate (one comma-separated `-l`); `--ac`/`--dod` **do** accumulate; `--dep` is by task **id**, not slug — doc08/doc10.
- *Surface:* fine.

**U4 — the AC what-not-how contract.** Coverage: **PARTIAL → effectively ABSENT** (only the trust-gradient proxy; **no surface states "AC = observable outcome, not method"**). **This is the highest-value single addition** — CLAUDE.md says this contract binds BOTH wpm's own backlog AND every shipped bundle. The 6 rules (from `task-writing-conventions.md`):
1. Outcome, not steps. 2. Checkable from outside the boundary. 3. One concern each; declarative. 4. Cover negatives/edges as outcomes. 5. **Specify the seam, leave the stuffing** (name boundary contracts — exit codes, formats, port shapes, typed error kinds — not internals). 6. Never restate the DoD (it's in config.yml). Classifier: *could two competent implementers satisfy it with different code? Yes = keep; No = rewrite.*
- *Surface:* **NEW reference `task-conventions.md`** (or a deliberate trim of `conventions.md` to fit it).

**U5 — versioning / updates / migrations.** Coverage: **FULL** (conventions §V2 tagging; authoring-workflow version-bump).
- See the "Authoring an update" model in §4. Key: edit `kind:state` tasks to the new desired state (advance their `-m`); add a `kind:migration` only for what idempotency can't reach (gate in its detect/AC **body**, e.g. "applies when installed < 2.0"); **shipped migrations are immutable — fix forward**; bump `bundle.yml` version last (it materialises a constraint-recheck task in every requiring bundle) — doc08.
- `requires` is npm-style (`^ ~ >= = `); `wpm project validate` fails on a constraint that no longer holds (surfaces breakage at author time) — doc08.
- *Surface:* fine.

**U6 — registration mechanics.** Coverage: **FULL** (command-reference; SKILL "which surface does what").
- `files|templates|scripts add|list|remove <path>` **register refs only** — the CLI verifies the file exists, never writes content; `remove` leaves the file on disk — doc10. **(register-not-author; deregister-not-delete)**
- payload (`payload/agent-skills/`, runtime products, no alias) vs installer-skills (install-time, aliased) vs advisor (root-scoped, pull-UX) — doc06/doc05.
- *Surface:* fine.

**U7 — build + handoff.** Coverage: **PARTIAL** (commands + handoff concept present; the command-reference build rows never describe the `wip/`→archive-root transform/exclusions; no surface consolidates build+handoff).
- `build dry-run` (validate + preview, no artefact) → `build package [--format zip|tarball|git]` → `builds/<project>-<version>.<ext>` → `build publish <destination>` — doc10.
- Archive root = `wip/` un-nested; `_AGENTS.md`→`AGENTS.md` + aliases; wrapper excluded — doc06/doc12. (NOTE: `--format git` does **not** yet apply the transform — tracked TASK-95.)
- The author owns the **how-to-use close** (the bundle's postinstall message: "what you have + how to trigger it") — doc01/doc04.
- *Surface:* expand the build rows; add the how-to-use-close duty (doc-04 gap).

### QUALITY

**Q1–Q6** — Coverage: **FULL** (quality-protocol.md faithfully distils doc 04). Confirmed 1:1: make-implicit-explicit; draw-out-the-unknowns (describe→decompose→review); the three author decisions; hunt leaked couplings; simulate-the-executor (incl. simulate-upgrade); the must-nots; verify-required.
- **doc-04 leftovers NOT yet distilled:** (a) the **how-to-use close** (the connective tissue authors skip) — absent from all surfaces; (b) the **DoD-as-receipt-contract** (the config.yml DoD that gates recording before Done) — quality-protocol says "define what must be recorded" but never names the DoD gate. Both ~6–8 lines; fit quality-protocol's ~17-line slack.

---

## §3 — Vocabulary an author must use correctly (from doc 00/01, augmented)

Project · Bundle · Orchestrator (deliverable front-door + manifest) · Manifest · Bundle **id** (stable) ·
Bundle **summary** (the menu line) · Payload · Target agent (peer dependency) · Detection · Handoff point ·
Confirmation level · **Receipt** (in the task records) · **Recipe** (shipped, versioned, replaced wholesale) ·
Uninstall (replay inverse ops) · Version / **migration** (run-once, version-gated, forward-only) · `requires` ·
Update (= Repair against a bumped version) · Trust gradient · How-to-use close · Definition of Done ·
**Authoring workspace** · **Authoring front door** (≠) **Executor-facing front door** · `.authoring-backlog/` ·
`wip/` · `builds/` · install-backlog · `kind:state` / `kind:migration` / `step:<slug>` · installed-vs-adopted.

**Disambiguation to pin (M1 flag):** doc00 calls the deliverable's top construct the *orchestrator*; doc01 adds a
*separate authoring front door* at the workspace root. An author/skill must NOT conflate them — the
orchestrator/executor front door ships (in `wip/`), the authoring front door does not.

---

## §4 — Ready-to-distil cross-cutting blocks (the gold from mining)

These six blocks are the most directly reusable distillation inputs.

### (a) What the executor needs from every recipe task (author checklist)
1. **Detectable intent** — an AC the executor can reason against ("already satisfied here?"), tolerant of the
   intent being met differently than the recipe names.
2. **Verifiable success** — observable ACs re-checkable after DO (genuine success, not exit-0); say where a
   human confirms.
3. **Full self-containment** — runnable in a fresh context with zero conversational/prior-task memory; no "as
   chosen above."
4. **Declared deps, peer target** — every prerequisite in `requires`; the target agent only checked-for.
5. **Confirmation level per step** — routine vs dangerous, under one up-front approval.
6. **Explicit handoff points** — elevation/re-auth/restart stated as a stop, in plain language.
7. **Named recordable facts** — inverse op, installed-vs-adopted, checksum/overwritten files, chosen values
   (only the non-re-derivable); recording is DoD-gated.
8. **Operational "done" + how-to-use** — a clear per-task DoD + the CLOSE message.

### (b) Where executors stall (what simulate-the-executor must catch)
- references to vanished context ("the value we picked earlier") · method-as-AC with no observable check
  (DETECT can't tell it's done; VERIFY rubber-stamps exit-0) · assumed undeclared prerequisite / sibling reach ·
  missing inverse op or ownership flag · mis-tagged danger (destructive step left routine) · handoff buried in
  prose (an unattended loop presses past it).

### (c) Authoring an update (so the executor migrates correctly)
- Edit `kind:state` tasks to the new desired state first (a fresh install lands on the new version through them);
  advance each edited task's `-m`. · Add a `kind:migration` only for what idempotency can't reach; gate from-version
  in its detect/AC body; never edit a shipped migration (fix forward). · Bump `bundle.yml` version last (materialises a
  constraint-recheck task in every requiring bundle — widen or migrate). · Re-pin vendored content in `wpm.lock`. ·
  Trust the loop — you never diff, never write the receipt, never replay from V1.

### (d) The five skill roles (doc05) — place each by role
| Role | What it is | Where it lives | Trigger |
|---|---|---|---|
| **Installer skill** | orchestrates the whole-project install loop; project-named | `installer-skills/` `{project-name}-installer` | "install this project" |
| **Vendored discipline skill** | third-party skill copied in to *enforce* a workflow (pinned, license kept; not authored) | `installer-skills/` | its own upstream description |
| **Advisor skill** | pull-UX: recommends a bundle before install; one per bundle (auto-scaffolded) | `installer-skills/` `{bundle-id}-advisor` (**root-scoped**) | the user's *need* |
| **Install-time helper** | reusable mid-install helper (not an orchestrator) | project or `bundles/<id>/installer-skills/` | its own description, during install |
| **Payload skill** | the delivered product; install copies it into scope (that relocation = landing) | `bundles/<id>/payload/agent-skills/` (**non-scanned, no alias**) | the bundle's *runtime* use |
Roles 1–4 (install-time) get scanned-scope alias symlinks; role 5 (payload) deliberately does not.

### (e) The acceptance-criteria contract in 6 rules — see U4 above.

### (f) The deliverable shape (author's mental model — `wip/` contents = shipped archive root)
```
wip/                          ← un-nested to archive root at build; ONLY this ships
├── _AGENTS.md   (→AGENTS.md) [REQ] executor front door, authored under the underscore; build strips it
│              (CLAUDE.md, GEMINI.md)  build-CREATED symlink aliases per manifest.targets — do NOT author
├── RALPH-LOOP.md            [OPT] author-prose: install task statement + per-iteration SDLC
├── manifest.yml             [REQ] release id + flat enabled-bundle list + target agents
├── wpm.lock                 [OPT] pins vendored artifacts (version+hash); only if vendoring
├── installer-skills/        [OPT] canonical install-time skills (authored once, at root)
│   ├── <project>-installer/SKILL.md + references/journaling.md   (orchestrator + receipt mechanics)
│   └── <bundle-id>-advisor/SKILL.md                              (pull-UX; MUST be root-scoped)
│   (.agents/skills, .claude/skills, … → installer-skills/   scope aliases, one per targeted agent)
└── bundles/
    ├── bundle-template/      authoring scaffold (cp -r to make a bundle); inert via absence from manifest
    └── <id>/                 each bundle = its own Backlog.md root
        ├── _AGENTS.md (→AGENTS.md) [OPT] per-bundle closest-wins notes (also prefixed; build strips)
        ├── bundle.yml        [OPT] id(stable)+version(moves)+summary(menu)+confirmation+requires{}
        ├── payload/          files/ (authoritative, checksummed not verbatim) · templates/ (params) · agent-skills/ (runtime)
        ├── installer-scripts/[OPT] install-time tooling (probes/smoke tests) — not delivered
        └── install-backlog/  [REQ] THE RECIPE (shipped, versioned, holds NO receipt)
            ├── config.yml    task_prefix = bundle id; the DoD that gates receipt fields
            └── tasks/        kind:state (detect→setup→verify, idempotent) + kind:migration (run-once, immutable)
```

---

## §5 — GAPS (prioritized) — what to add/deepen, smallest-effort-highest-value first

| # | Gap | Need | Effort | Where it should land |
|---|---|---|---|---|
| G1 | **The AC what-not-how contract is taught nowhere** | U4 | ~20L | NEW `task-conventions.md` (or trim `conventions.md`) — **highest value** |
| G2 | **The 5 skill roles + per-agent scope table absent** | C7 | ~20L | NEW `native-surfaces.md` |
| G3 | **The core bet is never named; "why outcomes not steps" implicit** | C2 | ~3L | SKILL.md spine + concept reference |
| G4 | **The executor's full runtime loop (record→resume, idempotent skip, containment) only lightly echoed** | C5 | ~12L | concept/executor reference (makes Q2 real) |
| G5 | **The install contract's DoD-gates-receipt framing thin in the skill** | C6 | ~8L | concept reference / quality-protocol |
| G6 | **`wpm skill install` missing from command-reference** | U1 | ~2L | `command-reference.md` |
| G7 | **doc-04 leftovers: how-to-use close + DoD-as-receipt** | U7/Q | ~7L | `quality-protocol.md` (has slack) |
| G8 | **`wip/` awareness missing from SKILL.md + authoring-workflow** | C8 | ~5L | both (also fixes §6 path drift) |
| G9 | **Build `wip/`→archive transform/exclusions not in command-reference** | U7 | ~4L | `command-reference.md` |

---

## §6 — DRIFT & DIVERGENCE (correctness issues found while gathering)

Two classes. **(A) is the most urgent** — the docs ship worked examples that **fail**.

### (A) Docs vs ground-truth CLI/templates (these MISLEAD an author; some are broken commands)
| Sev | Issue | Reality |
|---|---|---|
| **CRITICAL** | doc10 §Templates + doc10/doc11 worked sessions open with `wpm init … --template single-bundle` and `bundle new --template with-payload-skill\|adopts-system-tool` | **Only `templates/project/minimal/` and `templates/bundle/default/` exist.** Those commands **fail exit 1** ("template not found"). The canonical first command in both docs is dead on arrival. Either build the missing templates or fix the docs to `minimal`/`default`. |
| MED | doc10 prose (l.49/199): `--at` "defaults to cwd" (reads as scaffold-in-place) | `init` default creates a **`<name>/` subdirectory** of cwd (matches the worked sessions' `cd hermes-handoff`). Prose contradicts itself. |
| MED | doc10 schema: `bundle.yml` uses `confirmation-level` | on-disk key is **`confirmation:`** (the *flag* is `--confirmation-level`). A doc-reader grepping `bundle.yml` won't find it. |
| MED | doc11 tree: `.authoring-backlog/config.yml`, `.authoring-backlog/tasks/` | reality nests one deeper: `.authoring-backlog/backlog/config.yml` (Backlog.md v2). The `cd .authoring-backlog && backlog …` pattern still works; literal paths are off by a segment. |
| LOW | doc10 omits global `--debug`, `bundle remove -y`, `bundle new -v` | additive; no author harm. |
| (good) | materialised task catalog | **exact 1:1 match** with doc11 (8 project-wide; 12 per-bundle); `.gitignore` has `.authoring-backlog/` + `builds/`. |

### (B) Authoring-skill surfaces vs current code (stale after epic-3) — 9 concrete fixes
| # | Surface · line | Stale claim | Correction |
|---|---|---|---|
| 1 | command-reference (tree) | no `skill` group | add `wpm skill install` → copies the installer-builder skill into the agent's user scope |
| 2 | command-reference l.23-24 + SKILL l.65 | "AGENTS.md … re-renders on every mutation" | executor front door `wip/_AGENTS.md` is **author-owned, written once at init, NEVER re-rendered**; only the installer SKILL.md + aliases re-render |
| 3 | command-reference l.29 | "scaffold a project root" | "scaffold an **authoring workspace** (root + `wip/` deliverable + `builds/`)" |
| 4 | command-reference l.40 | `project root` prints "project root" | prints the **deliverable root** (`<workspace>/wip`) |
| 5 | SKILL l.51 | init "creates the project" | creates the **workspace** wrapping the deliverable in `wip/` |
| 6 | SKILL l.58 | `cd bundles/<id> && backlog …` | `cd wip/bundles/<id>` |
| 7 | conventions l.42 | `cd bundles/web-handoff` | `cd wip/bundles/web-handoff` |
| 8 | authoring-workflow l.66/72 | `cd bundles/…`, `cp … bundles/…/payload/files/` | add the `wip/` prefix (the `wpm bundle … files add <path>` line is already correct — path is bundle-relative) |
| 9 | SKILL l.50 + authoring-workflow l.54 | `--template minimal\|single-bundle\|multi-bundle` / opens with `--template single-bundle` | only `minimal` ships — drop the others or mark not-yet-shipped (same as A-CRITICAL) |

### (C) Docs-internal under-specification (the docs that DON'T travel, for our own reconciliation)
- **doc06/doc07 trees show the post-build view, not the authoring reality** — they list `AGENTS.md`/`CLAUDE.md` at the deliverable root as if author-placed; the author edits `wip/_AGENTS.md` and never authors the aliases. Only the prose mentions the strip. Per-bundle front-door prefix is named only in **doc12** (the authority: per-bundle `_AGENTS.md` too).
- **The reserved-name avoidance set lives only in doc12** (avoid `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `AGENTS.override.md`, `CONTEXT.md` as authored basenames; don't use `.tmpl`). An author reading 06/07 wouldn't know.
- **`_AGENTS.md` is absent from doc05** (it predates epic-3); doc05 frames `CLAUDE.md`/`GEMINI.md` as hand-symlinkable, while epic-3 **build-generates** them per `manifest.targets`. Hold doc12 + tasks 85–95 as authority on authoring-time naming.
- **doc09 is already fully workspace-aware** (no drift) — a good model for how a doc should read post-epic-3.

---

## §7 — Length budget & delivery implication (input to Phase C)

| Surface | Lines | Headroom to ~85 | Verdict |
|---|---|---|---|
| SKILL.md (spine) | 86 | n/a (spine; keep <100) | at the edge; trim, don't grow |
| command-reference.md | 74 | ~11 | room for the `skill install` row + the small fixes only |
| authoring-workflow.md | 83 | ~2 | effectively FULL |
| conventions.md | 85 | 0 | AT CEILING — no room |
| quality-protocol.md | 68 | ~17 | only reference with real slack (absorbs G5/G7) |
| authoring-front-door.md.tmpl | 40 | n/a (resident) | cleanest surface; correct already |

**Implication:** the two big concept gaps each need ~20L and fit nowhere existing → **two NEW references**:
`native-surfaces.md` (G2) and `task-conventions.md` (G1). A small **concept reference** (or an expanded SKILL
spine + quality-protocol) carries G3/G4/G5. G6/G8/G9 are small in-place edits. All §6(B) drift fixes are
in-place. The front door is already correct.

---

## §8 — Recommended next steps (Phases C–E)

- **Phase C (delivery design):** lock the surface map — add `native-surfaces.md` + `task-conventions.md`; name
  the bet + minimal executor-loop in the SKILL spine; absorb doc-04 leftovers into quality-protocol; apply the 9
  §6(B) drift fixes; expand command-reference's build rows + the `skill install` row.
- **Phase D (write):** worker distils each cluster into its surface (terse, what-not-how, cite the doc); a
  **separate reviewer** checks each line against the source doc for faithfulness + length (the task-92 pattern).
- **Phase E (dogfood-verify):** give a cold agent ONLY the front door + skill (no docs) and have it author a
  small sample bundle end-to-end; every stall = a gap → loop. Add a "concept quiz" (explain *why*
  structure-not-content; what the executor does with the ACs) to test understanding, not just procedure.

**Decisions to surface to the human:**
1. **§6(A)-CRITICAL** — the missing `single-bundle`/`multi-bundle`/`with-payload-skill`/`adopts-system-tool`
   templates: **build them** (the docs assume them and they'd materially help authors) or **fix the docs to
   `minimal`/`default`**? This is a scope/spec call.
2. Is doc-05's front-door model worth reconciling to epic-3's `_AGENTS.md` (a docs change), or is distilling the
   current truth into the skill enough?
3. Run Phases C–E as a tracked **epic-4** (one task per reference + a dogfood-verify task), mirroring the SDLC we
   just used, or as a lighter single pass?
