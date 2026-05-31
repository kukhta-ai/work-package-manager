# 07 · The Install Contract

Where `06` defines the *structure* of a bundle-project, this defines the *contract* that turns that structure into a working install: the conventions and settings by which an executing agent produces a faithful, replayable install receipt using only Backlog.md's native surfaces — with no separate state store. It is the recording-and-enforcement layer that sits on the `AGENTS.md` and `install-backlog/` slots `06` reserves.

The governing idea, carried over from the package-manager study and the agent-native adaptation: **the task fields *are* the receipt.** A reasoning executor is smart but forgetful, so the contract leans on its reasoning for everything it can re-derive by looking, and writes down only the facts it cannot. Three parts cooperate — a policy surface that says what to record, an enforcement gate that makes recording non-optional, and a storage mapping that fits the receipt onto a schema we don't control.

```
LAYER            SURFACE                         ROLE
policy           AGENTS.md (always-live)         what to record, and the loop that does it
enforcement      Backlog.md Definition of Done   makes recording a precondition for "Done"
storage          task fields + labels + notes    where each fact lives, given a fixed schema
mechanism        MCP (preferred) / CLI --plain   how the agent writes it
```

## Template layout

The fillable counterpart to `06`'s skeleton: the same slots, but as starter files an author adapts, with the contract-bearing files in focus and the rest elided. `⟨…⟩` marks a placeholder; `←` marks a copy. Note the split by actor: execution-time skills under `installer-skills/` hold what the executing agent reads at install, while `bundles/bundle-template/` is the authoring-time scaffold the author copies to create a bundle.

```
LEGEND  TEMPLATE = ships fill-in content (⟨placeholders⟩)   ← stamped from   … = as in 06

project-installer-template/           author starter (instantiated, this is 06's hermes-handoff/)
│
├── AGENTS.md                TEMPLATE  front door: recognition line + the loop + standing rules (§policy)
├── manifest.yml             TEMPLATE  project release identity + flat list of enabled bundle IDs + targets ⟨…⟩
├── README.md                TEMPLATE  short human entry (draft: what it installs + pointer into docs/)
├── docs/                    …         project-wide reference (free-form, as in 06)
│
├── installer-skills/                  EXECUTION-TIME skills, symlinked into the scanned scopes
│   ├── ⟨project-name⟩-installer/      the main installer skill the executing agent runs (named per project)
│   │   ├── SKILL.md         TEMPLATE  when-to-use + loop mechanics + how to drive Backlog.md
│   │   └── references/
│   │       └── journaling.md TEMPLATE the receipt recipe: field/label/notes mapping, write via MCP (§storage)
│   └── ⟨bundle-id⟩-advisor/           optional, one per bundle; powers the "pull" UX (recommends that bundle by name)
│       └── SKILL.md         TEMPLATE  advisor shape: description triggers on the user's NEED; body recommends the bundle
│   (.agents/.claude/.openclaw skills → installer-skills/   …  scope aliases as in 06; symlinks, not templates)
│
└── bundles/
    ├── bundle-template/              AUTHORING scaffold: a COMPLETE bundle, copied in place to make each real
    │   │                             bundle (cp -r bundles/bundle-template bundles/<name>). Absent from
    │   │                             manifest.yml, so the executing agent never treats it as installable.
    │   ├── AGENTS.md        TEMPLATE  per-bundle scope notes ⟨…⟩ ("closest wins"); same front-door mechanic as root
    │   ├── CLAUDE.md                  → AGENTS.md  (per-bundle symlink alias, same as root; mechanism, not template)
    │   ├── installer-skills/          OPTIONAL bundle-local install helpers (+ .agents/.claude/.openclaw aliases)
    │   │   └── ⟨skill⟩/SKILL.md TEMPLATE  helper shape: active only while working THIS bundle (not a pull-UX advisor)
    │   ├── bundle.yml       TEMPLATE  id ⟨stable⟩ + version ⟨current⟩ + confirmation levels ⟨…⟩
    │   ├── payload/                   everything the bundle delivers (the data.tar analog)
    │   │   ├── files/ templates/      …  → environment: authoritative reference files + parameterized (as in 06)
    │   │   └── agent-skills/
    │   │       └── ⟨skill⟩/SKILL.md TEMPLATE  payload shape: namespaced; triggers on RUNTIME use, not install
    │   ├── installer-scripts/         …  install-time tooling (probes, smoke tests); not delivered (as in 06)
    │   └── install-backlog/
    │       ├── config.yml   TEMPLATE  task_prefix=⟨bundle-id⟩ + definition_of_done + filesystem-only git (§enforcement)
    │       └── tasks/       TEMPLATE  starter detect / setup / verify (the §storage recording shape)
    │
    └── ⟨core, web-handoff, doc-handoff⟩/   ←  each a copy of bundle-template/, listed in manifest + specialized
```

The split is by actor. `bundle-template/` is authoring-time — a complete bundle the author copies in place (`cp -r`) and specializes. It sits inside `bundles/` so a new bundle is just a sibling copy, and the only thing keeping it disabled (and therefore inert) is its absence from `manifest.yml`: the executing agent discovers bundles through the manifest, never by scanning the directory, so an unlisted scaffold is never offered or installed. Because every real bundle is a copy of this one, the Definition-of-Done and the receipt-recording shape stay identical across bundles; the author fills placeholders in `AGENTS.md`, `manifest.yml`, and each copy's tasks. The first specialization step is to set the copy's `id`, `version`, and matching `task_prefix` *before authoring any tasks*, since the prefix must be in place when tasks are created (changing it afterward orphans the existing ones — see `08`).

Auditing `06` for what else is worth templating surfaces a clean finding: among the skills that are *rendered per project*, there are **three shapes**, each with a different description-trigger discipline, so each gets its own template. The **installer** skill (`⟨project-name⟩-installer`) triggers on "install this project" and orchestrates the loop. An **advisor** skill (`⟨bundle-id⟩-advisor`, optional, one per bundle, also in `installer-skills/`) triggers on the user's *need* and recommends adding that bundle — it's what powers the "pull" UX. A **payload** skill (`bundles/<b>/payload/agent-skills/⟨skill⟩`) is the delivered product: its description triggers on the bundle's *runtime* use, never on install, and it's inert in the repo until the install copies it into the agent's scope. The first was already templated; the advisor and payload shapes are the additions, plus a draftable `README.md` and the optional per-bundle `AGENTS.md` scope-notes. (The other install-time skill roles from `05` — the install-time *helper* and any *vendored discipline* skill — aren't templated: helpers are authored content like any skill, and vendored discipline skills are third-party folders the author copies in, neither of which the builder renders or bundles.)

The same template set recurs *per bundle*, because the front-door and install-time-skill surfaces are self-similar (see `06`, "Self-similar surfaces"). A bundle copy may carry its own `AGENTS.md` (closest-wins scope notes), its `CLAUDE.md`/other symlink aliases, and an optional bundle-local `installer-skills/` with its own scope aliases — install *helpers* that activate only while the agent is working that bundle as cwd. The one shape that does *not* recur is the advisor: pull-UX advisors must be catalogued before any bundle is entered, so they stay in the root `installer-skills/`.

Deliberately *not* templated, because they're mechanism or bespoke rather than fill-in content: `CLAUDE.md` (a symlink to `AGENTS.md`) and the `.agents/.claude/.openclaw` scope aliases (symlinks the install creates) — at *both* root and bundle level, since these mechanics recur; `payload/files/` (per-project content; the author's authoritative reference, not a guaranteed-verbatim placement — the receipt checksums what's actually placed, so divergence is detected); `installer-scripts/` (per-project, though detection probes and smoke tests have a recurring shape an author may choose to draft); and `docs/` (free-form). Everything templatable is a skill, the front door, the manifest, or the one scaffold bundle.

On naming: Backlog.md keeps its config as `config.yml` *inside* the backlog folder (the folder name is free — here `install-backlog/`), so the in-bundle file is `install-backlog/config.yml`. The root-level `backlog.config.yml` is a different thing — Backlog.md's single-root "root config discovery" variant — and isn't used here, since each bundle is its own root. The backlog also ships pre-initialized: a committed `config.yml` plus `tasks/` is all Backlog.md needs, so no `backlog init` runs on the end user's machine.

## The front door — policy

`AGENTS.md` is the only surface guaranteed live without registration, so it carries the work no skill can be relied on to do. Its design job is threefold and no more, because it must stay lean enough to sit in context the whole session.

First, **recognition and kickoff**: its opening must flip the agent's default stance from "read and edit this codebase" to "install this project," because every other behavior depends on that reframing happening before the agent does anything else. It also names the entry points — pointing the agent here, invoking the `⟨project-name⟩-installer` skill, or a goal-style kickoff (`/goal: install this project`) — and points at any discipline skills the author vendored into `installer-skills/`, plus, for unattended runs, the `RALPH-LOOP.md` prompt doc and any vendored loop runner that executes it (`09`). Second, the **shape of the install**: orient on the manifest, detect what's already present, offer the bundles as a menu (rendered by each bundle's `summary` field), resolve `requires` dependencies and preview a plan for consent, then work each selected bundle's backlog task-by-task, deferring and resuming across restarts, and closing with how to use what was installed. `AGENTS.md` states the per-task workflow (detect→…→verify→record); the orchestrator skill expands it procedurally, and a vendored discipline skill, if present, enforces it. Third, the **standing rules** that govern recording and reversal — record only what inspection can't recover; read a task's prior record before acting and reuse decisions rather than re-deciding; only ever reverse what you installed; decide a shared dependency's removability from the graph, not a counter; compare a config file to its recorded checksum before overwriting and ask on conflict; contain a failing bundle so it can't touch the others; pause at confirmation points and resume from the record.

Mechanics — the exact commands and the shape of each recorded fact — are deliberately *not* here; they live in the `⟨project-name⟩-installer` skill (`references/journaling.md`), loaded on demand. The front door states policy and the workflow; the orchestrator skill supplies procedure; a vendored discipline skill, where the author included one, supplies enforcement. This is the same progressive-disclosure split the rest of the system uses.

## The enforcement — Definition of Done

Instructions alone will not make a forgetful, non-deterministic executor record reliably, so the contract borrows Backlog.md's native gate. Each bundle's `install-backlog` config sets a project-level Definition of Done whose items correspond one-to-one with the receipt facts: effect verified, files referenced and checksummed, ownership recorded, inverse step recorded, decisions recorded, non-file effects recorded. Because the agent cannot mark a setup task Done until those hold, recording stops being a thing the agent *should* do and becomes a thing it *must* do to make progress.

This is enforcement-by-checklist — the agent self-attests against the list — not schema validation, which is why it is paired with the bundle's `verify` task re-reading the entries to confirm them. DoD gates; verify confirms. Authors can add per-task conditions with `--dod` or opt a task out of the defaults with `--no-dod-defaults` where a step genuinely produces no reversible effect.

## The receipt — storage on a schema we don't own

Backlog.md has a **fixed task schema and no custom-field mechanism** — there is no config to define fields and no flag to set arbitrary keys, and hand-added frontmatter is liable to be normalized away on the next edit. The contract therefore does not fight the schema; it shapes the receipt to the real fields, and turns the constraint into an advantage by routing every *enumerable* fact through labels, which are queryable, rather than through free text.

| Receipt fact | Home | Why there |
|---|---|---|
| Files placed / modified | `--ref` | typed; later found via `search --modified-file`. The owned-files manifest, for free. |
| What "done" means | `--ac` | typed, checkable; doubles as the repair integrity check. |
| Per-task requirement | `--dep` | typed graph edge; feeds removability. |
| Recording is mandatory | `definition_of_done` / `--dod` | the native gate. |
| **Ownership: installed vs adopted** | structured notes block (free-form line) | a per-environment observation, not a recipe property; lives next to the inverse op since the two are read together at uninstall time. |
| Inverse op (command + condition) | structured notes block | irreducibly free-form. |
| Checksum of a placed file | structured notes block | free-form value. |
| Decision + rationale | structured notes block (or `--final`) | free-form. |
| Paused / awaiting external event | Backlog.md `status: Blocked` + a notes line | native lifecycle state covers it; no separate label needed. |

The principle behind the table: tags are reserved for the recipe's structural vocabulary (identity, kind, version — see `08`), and everything the *executor* records about what actually happened in this environment goes into the typed Backlog.md fields (`--ref`, `--ac`, `--dep`) plus a single structured notes block per task. Ownership — the installed-vs-adopted distinction that uninstall safety depends on — is one such per-environment fact: the executor journals it as a notes line at the moment it decides, alongside the inverse op, the chosen value, any overwritten file. Uninstall scans tasks' notes anyway to source inverse ops, so reading ownership from the same block costs nothing extra. Notes are written via the MCP server where possible (structured tool calls beat hand-built CLI strings), with `--plain` and `--append-notes` as the universal fallback. Because the agent journals only the non-recoverable facts, the notes block stays small.

## Reading it back

The contract is designed around its read paths, not just its writes. At install, the loop fills these fields under the DoD gate. At **uninstall**, the agent walks the bundle's tasks (in `tasks/` and `archive/`), reads each one's notes for the journaled ownership and inverse op, replays the inverse op only for steps the executor recorded as installed (and leaves any adopted dependency untouched), and decides whether a shared dependency is still needed from the `--dep` graph plus the still-installed bundles. **Repair** re-runs detection and re-checks each `--ac`, then reconciles drift by re-applying. **Config** files are compared against their recorded checksums, with user-modified files preserved and a keep/replace/merge offered. Concretely: `web-handoff`'s setup task, after running, has its `--ac` ("a version prints and the user confirms a test page"), its `--ref` listing the launcher file it placed, and its notes block recording whether Chromium was installed by us (with the removal command) or adopted from the user's machine. That single task, after running, is the receipt for that step.

One split matters once a bundle changes over time: the *shipped* `install-backlog/` is a replaceable, versioned recipe that holds no state, while the receipt described here is a persistent copy the install stamps out elsewhere and fills in — so an update can replace the recipe without losing the record. That same receipt, read along the time axis, is the applied-migration ledger; the versioning and migration convention built on it is `08`.

## Hard rules

The task records *are* the receipt — there is no separate state store, and anything not recoverable by inspection (installed-vs-adopted, the inverse op, an overwritten file, a chosen value) must be written at do-time, because it erases its own evidence. Never invent custom frontmatter keys; the fixed schema will normalize them away, so use only the real fields. Tags are reserved for the recipe's structural vocabulary (identity, kind, version — see `08`); the executor's per-environment observations go into the notes block alongside the inverse op. Recording is gated by Definition of Done and confirmed by the verify task, never left to good intentions. And reading is uniform: uninstall and repair scan the same notes blocks they need anyway for the inverse op, so ownership rides along at no extra cost.

Read with `06`: that doc reserves the slots, this one defines what fills them and how it is read back; the concrete recording recipe those rules imply belongs in the `⟨project-name⟩-installer` skill's `references/journaling.md`.
