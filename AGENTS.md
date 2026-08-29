# AGENTS.md — installer-builder (development)

> **This file governs *developing the builder*, not installing anything.** You are an engineering
> agent building the `wpm` CLI specified in `docs/00`–`docs/14`. The work is tracked as a
> Backlog.md backlog in `backlog/` (map: `FOUNDATION.md`). You take tasks from that backlog and
> implement them under the process below — an autonomous, **BMAD-based** SDLC with persistent
> specialist subagents, sequential git branching, and a tracked state machine.
>
> (Distinct from the *install* front door a generated bundle-project ships, which is a different
> AGENTS.md addressed to an end user's agent. This one is for contributors building the tool.)

---

## Before anything else — read the whole design set, in order

Your first action in this repo, before installing tooling, touching the backlog, or writing a line, is to
**read every design document fully and sequentially, `docs/00` through `docs/14`, in that order.** This is
mandatory, not optional skimming:

- Read each document in full before opening the next; they build on one another and assume the earlier ones.
- Do not skip, sample, or rely on summaries — the whole set is the specification you will conform to, and the
  rest of this file constantly refers back to specific documents by number.
- Read `FOUNDATION.md` last in this pass, then `backlog task list --plain`, so you enter the work with both
  the design and the task graph in mind.

Treat this as loading the project's source of truth into your head. Everything below — the BMAD process, the
state machine, the per-task loop — presupposes you have done this read and can cite the docs by number.

This full preload is **once per persistent specialist per source revision**, not once per workflow call. Record
the revision that was read. On resume, read the state tracker and only documents changed since that revision; a
replacement specialist must do the full preload. Do not spawn a nested agent merely to repeat work that the
persistent specialist can invoke directly.

---

## What is fixed vs. what is open to refinement

The design set is the source of truth, but it is **not all equally frozen.** Read it with this distinction,
because it governs how much you may adapt during the build:

- **Fixed — do not drift (the contract).** The **project goals**, the **user problems** being solved, and the
  **style** (the model, the vocabulary, the voice and conventions of the docs and the product). These are
  decided. Every workflow you run and every line you write must stay true to them. A change here is a scope
  change — a user gate; stop and surface it, never decide it yourself.
- **Open to refinement (proposals & drafts).** Much of the **architecture and most of the concrete code-level
  detail in the docs are proposals and drafts, not commitments.** Doc `13` is a strong intended design, the
  task acceptance criteria say *what* must be true, and code sketches illustrate intent — but the exact module
  shapes, internal APIs, data structures, and many decisions will rightly be refined as you reach concrete
  tasks and hit real problems. Some things are only knowable when you get there. The BMAD agents
  (`architect`, `tea`, the review loop) exist partly to **refine these as you go** — use them for that.

So: hold the goals, the user problems, and the style invariant; treat architecture and realization as the best
current proposal, to be sharpened by real implementation. When the code teaches you something the docs didn't
foresee, **the right move is to evolve the design, not to force the code to match a stale sketch** — and to
record the change. Concretely:

- When a task reveals that a doc's proposed approach is wrong or incomplete, prefer the better design that
  still serves the fixed goals/problems/style. Note the divergence in the task (`backlog task edit <id>
  --notes`), and if it changes something other tasks depend on, update the affected doc through the normal
  flow and flag it at the next gate.
- Keep architectural changes inside doc `13`'s **principles** (the pure core / ports-and-adapters boundary,
  thin-builder/fat-agent, SDLC-agnosticism) even while their *realization* shifts. Those principles are part
  of the fixed style; the specific class and function shapes that implement them are not.
- If a refinement would alter a goal, a user problem, or the model/vocabulary, that is the fixed core — stop
  and surface it as a user gate rather than absorbing it silently.

---

## Three hard rules — read first, they override convenience

**1. Backlog.md is operated *only* through its CLI. Never hand-edit anything under `backlog/`.**
Every task touch — create, read, status, acceptance-criteria check, dependency, note, archive — goes
through the `backlog` command. Task files, `config.yml`, sequences, and indexes are CLI-managed state;
editing them by hand corrupts the index and the IDs. There is always a `backlog task edit` flag for
what you want; opening `backlog/tasks/*.md` in an editor is never correct.

```
backlog task list --plain                 # the backlog (ALWAYS --plain for agents)
backlog task <id> --plain                  # one task: its AC + DoD
backlog sequence list                      # dependency-ordered execution plan (what's ready next)
backlog task edit <id> -s "In Progress"    # status
backlog task edit <id> --check-ac <n>      # tick an acceptance criterion (only when truly met)
backlog task edit <id> --check-dod <n>     # tick a Definition-of-Done item
backlog task edit <id> --notes "<text>"    # record an implementation note / decision
backlog task create "<title>" --ac "..." --dep <id>   # only if the process below calls for it
```
For anything else: `backlog <cmd> --help`. Never a text editor.

The CLI governs *how* you touch a task; **the acceptance-criteria contract below governs *what* goes into
one** — and reading that contract (`docs/task-writing-conventions.md`) is mandatory before any `backlog
task create` or acceptance-criteria edit.

**2. Prefer tools over hand-editing, everywhere a tool exists.** Scaffold with generators, fix
formatting/lint with the formatter and linter (never manual whitespace), manage dependencies through
the package manager (never hand-edit the manifest), apply review feedback by re-running the relevant
workflow. Hand-writing files is for genuinely new logic only — not for what a tool does deterministically.
This extends to BMAD — its workflows are **run**, not transcribed (Rule 3).

**3. The BMAD workflows are *run*, not paraphrased — inside the specialist whose workflow it is.** Every
persona step in the SDLC below is a literal invocation of its BMAD skill *by that persistent subagent*: the
`worker` invokes `create-story`, then `dev-story`, then `qa-generate-e2e-tests`; the reviewer invokes
`story-automator-review`; the planning personas invoke `product-brief` / `prd` / `create-architecture` /
`testarch-*`. You **steer** each workflow from the committed docs — you supply its elicitation answers (see
"How the doc-set maps onto BMAD") — but you never replace it with a hand-written brief that merely *describes*
what the workflow would do. A freehand approximation of a workflow is the same defect as hand-editing a task
file instead of using its CLI: it looks like the SDLC and isn't. Make each invocation **visible** — record
*which* skill the specialist actually ran, in its state-file entry and the story's `--notes`, so a skipped
workflow can't hide behind plausible output. If a skill genuinely cannot run unattended, that is a deviation
to **surface** (name the blocker, drive the step from the docs as a stated fallback, record it) — never a
silent substitution. Confirm *once*, at Step 0's confirmation step, that a spawned specialist can actually
invoke its skill; never assume it.

**Execution ownership and retry budget.** The persistent specialist for a role invokes its workflow directly.
An outer `story-automator` session is optional coordination, not another worker/reviewer layer; never run it in
a way that duplicates already-active specialists. Give a deterministic launcher, authentication, sandbox, or
configuration failure one diagnosis. Then record the deviation and continue with the same workflow in the
persistent specialist. Retries are reserved for demonstrably transient failures.

**Generated workflow output is working memory, not project truth.** BMAD still writes its conventional files
under `_bmad-output/`, and other skills may write `Skills-Results/`; both roots are gitignored so the workflows
remain usable without making their projections permanent. Keep an artifact through its last consumer, then
distil durable facts into the proper authority: canonical docs for approved intent, Backlog.md notes/status for
story evidence, or `research/evolution/` for experimental learning and gate disposition. Never stage raw output
as a fallback. Follow [`PROCESS-ARTIFACTS.md`](./PROCESS-ARTIFACTS.md) and run
`npm run check:process-artifacts` before integration.

---

## How tasks are written — read the contract before you create one

**Before you create or edit any task, you must have read `docs/task-writing-conventions.md` in full. This
is mandatory, not optional** — do not run `backlog task create`, and do not add or change a task's
acceptance criteria, until you have. That doc is the binding standard for task *content*; what follows is
only the gate, not a substitute for reading it.

The contract in one line: a task's **acceptance criteria state an observable outcome (the *what*), never
the method (the *how*)** — one concern per criterion, negative and edge behaviour covered as outcomes too,
and the Definition of Done never restated per task. Name a thing only when it is a genuine boundary (an
exit code, a file format, a port's method shape, a typed error kind) — *specify the seam, leave the
stuffing.* A task whose criteria prescribe steps is mis-written: the same defect class as hand-editing a
task file instead of using its CLI. The doc's **author checklist** is the gate for "well-formed," and its
**worked rewrites** show *how*→*what* in this backlog's own style.

This binds **both** backlogs, for the same reason (`00`'s core bet): wpm's own foundation tasks *and* the
work-package bundles wpm ships. A *how*-criterion both destroys the executing agent's adaptation and
leaves a shipped bundle with nothing to verify against — so the discipline is a correctness requirement
here, not a style preference.

---

## The spec already exists — conform, don't re-derive

This is greenfield code, but the front of the SDLC is **already done and committed** as the design-doc
set. These are the source of truth — read them with the fixed-vs-open distinction above (goals, user
problems, and style are fixed; architecture and code-level detail are refinable proposals):

- **`docs/00`** — foundation, model, vocabulary. Read first.
- **`docs/01`–`05`** — roles, agent protocols, native surfaces.
- **`docs/06`–`09`** — artifact structure, install contract, versioning, installation process.
- **`docs/10`–`13`** — authoring CLI surface (`10`), authoring process (`11`), **builder architecture (`12`, `13`)**.
  `13` is what you implement: honor its ports-and-adapters layering.
- **`docs/14`** — lineage appendix (skim).
- **`docs/SDLC.md`** — the development process as a sequence diagram (this file's companion; the authoritative flow).
- **`FOUNDATION.md` + `backlog/`** — the 33 foundational tasks, in dependency order, that turn `13` into code.
- **`docs/task-writing-conventions.md`** — how tasks and their acceptance criteria are written: the *what*-not-*how*
  contract. Governs **both** backlogs — wpm's own foundation backlog *and* every bundle wpm ships (`00`, `07`, `11`).
  **Mandatory reading before you create or edit any task** (see the contract under the hard rules).

**Enforced architectural invariant (`13`):** nothing under `src/core/` may import the CLI framework, the
subprocess library, or OS/file-system modules. The core is pure; effects live behind injected ports. A
violating import is a defect the linter catches — never work around it. (This is a *principle* and stays
fixed even as the specific module/API shapes that realize it are refined.)

The product is **SDLC-agnostic** (`13` §0). The process below is *our development method*; it must never
leak into `src/core/`.

---

## How the doc-set + backlog map onto BMAD

The attached BMAD SDLC is a full greenfield pipeline (analyst -> pm -> ux -> architect -> tea -> sm ->
workers -> retro -> epic gate -> handoff). **In this repo, BMAD's analysis / planning / solutioning phases
are already satisfied** by `docs/00`–`14` and the existing backlog. So:

| BMAD artifact (diagram) | Already exists here as |
|---|---|
| product brief, PRD, UX spec | `docs/00`–`05` (the model + roles) |
| architecture decisions | `docs/12`, `docs/13` |
| epics + stories | the `backlog/` tasks (the foundation = **epic-1**; each task = a **story**) |
| test architecture / CI design | `docs/06`–`09` + tasks 5, 6, 8 |

You therefore should **not treat these as open design questions** — the goals, scope, and architecture are
already decided in the docs. But BMAD's workflows and the automator expect certain **named artifacts to
physically exist** (`prd.md`, `architecture.md`, `sprint-status.yaml`, per-story files, a test-design doc,
etc.), and a phase or tool may refuse to proceed without them. You still produce these **locally** by running
the proper BMAD workflow (e.g. the `pm` agent's PRD workflow, `architect`'s `create-architecture`) — never by
hand-writing the file. They remain ignored compatibility inputs through their last consumer; they are not a
second source of truth or a routine commit. Your job is to **steer each workflow from our committed docs as it
runs:**

- **Feed the workflow our docs, not fresh invention.** When a workflow elicits goals, scope, requirements, or
  decisions, your answers come straight from `docs/00`–`14` and the backlog: the brief/PRD content from
  `docs/00`–`05`; architecture inputs from `docs/12`/`13`; epics/stories from the `backlog/` tasks; test
  architecture from `docs/06`–`09` and tasks 5/6/8. Quote and cite the source document as you answer the
  workflow's prompts.
- **Don't drift from the goals.** Do not let a workflow lead you into a goal, scope item, constraint, or
  decision that isn't already in the docs. If a workflow asks for something the docs don't cover, keep the
  answer minimal and note "out of scope per design set" rather than inventing to fill the field.
- **The docs win on conflict.** If a workflow's default or suggestion would contradict a doc (a different
  architecture, testing approach, or scope), the doc is authoritative — answer to conform the output to the
  doc. If the workflow can't be steered to match, stop and surface the conflict (a user gate) rather than
  letting the workflow's version stand.
- **Point the generated docs back at ours.** Where a workflow lets you supply or edit content, prefer
  referencing the canonical doc (`see docs/13 §4`) over restating it; the workflow-produced artifact is a shim
  the BMAD tooling requires, not a second source of truth. Let it land wherever BMAD expects it under ignored
  working memory.

Net: the planning personas still run their workflows to produce what BMAD needs, but you drive every elicitation
from the committed docs so the outputs are projections of our spec, not new design. Your real effort then goes
into BMAD's **per-story build loop (Phase 5, "BAUT")**, applied to each backlog task. The full schema is below;
follow it in order.

---

## Step 0 — Install BMAD and initialize the persistent specialists  (do this once, first)

You cannot run the SDLC without the BMAD agents and workflows installed; they are not in this repo. The
diagram's personas and workflows are real BMAD v6 modules living in separate packages — install them, then
keep one long-lived ("persistent") session per specialist, spawned once and **resumed** for each later call
within its lifetime (the diagram's SPAWN vs RESUME distinction).

1. **Install the framework and the modules this SDLC uses** (from the repo root):
   ```
   npx bmad-method install --modules bmm,tea
   ```
   - **BMM** — the core method: agents `analyst, pm, ux-designer, architect, sm, dev, tea, tech-writer`
     and the workflows `create-story, dev-story, qa-generate-e2e-tests, retrospective, sprint-planning,
     create-architecture, create-epics-and-stories, check-implementation-readiness`.
   - **TEA** (test architecture) — agent `tea` (Murat) and the `testarch-*` workflows the diagram names:
     `test-design, framework, ci, trace, nfr, atdd, automate, test-review`.
2. **Install the review workflow and optional autonomous coordinator** (the diagram's
   `story-automator-review` / `story-automator` in Phase 5):
   ```
   npx bmad-method install --modules automator        # bmad-automator: bmad-story-automator + -review skills
   ```
   If the registry resolves automator to a pre-release channel, pin a stable build rather than tracking HEAD.
   Direct persistent worker/reviewer sessions are the default execution path. Enable the outer coordinator and
   its stop hook only after a smoke test proves its launcher, authentication, sandbox, and monitor work in the
   current environment. On a deterministic failure, disable the hook and use the direct path; do not nest a
   second worker or reviewer underneath the existing one.
3. **If any package fails to resolve or its commands are unknown, STOP and clone the source to learn the real
   surface before proceeding** — do not invent agent names or workflow steps:
   - `git clone https://github.com/bmad-code-org/BMAD-METHOD`
   - `git clone https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise`
   - `git clone https://github.com/bmad-code-org/bmad-automator`
   Read each module's `module.yaml` / agent definitions / workflow folders to confirm the exact commands.
4. **Spawn the persistent specialists** you will resume throughout (one session each, kept alive):
   `analyst, pm, ux-designer, architect, tea, sm`, plus the build **worker**, independent **reviewer**, and
   **investigator** roles (spun from `dev`/`qa`) and **retro** (from the retrospective workflow). Record, in
   the state file below, that each is initialized and what role it plays. Resume them by their session rather
   than re-spawning.
5. **Confirm** the install *and that a subagent can drive it*: the BMAD agents respond to their commands, the
   `testarch-*` and `story-automator` workflows are present, `bmad-help` (if available) reports the modules —
   and, decisively, **a spawned specialist subagent can itself invoke its skill** (run one persona's skill from
   inside its own subagent once, end-to-end, before trusting the loop to it). If a subagent cannot load or run a
   BMAD skill, STOP and surface it: the SDLC below assumes the workflow runs *inside* the specialist (Rule 3),
   not that you paraphrase it on their behalf — so this is a precondition, not a nicety.

> Persistent != stateless: a specialist spawned in an early phase is **resumed** in a later one (e.g. `tea` is
> spawned in solutioning and resumed at the epic gate; a `worker` spawned for a story is resumed across its
> build->review cycles). Treat each as a durable collaborator, not a fresh call each time.

---

## The SDLC state tracker — you must always know where you are

Because this loop is long and resumable, **maintain an explicit, durable record of current SDLC position** and
re-read it on every resume. Keep two things in sync:

1. **A compact state file in the repo** — `.bmad/sdlc-state.yaml` (create it in Step 0, rewrite it at every
   transition). It is a current pointer, never an append-only activity log; Git already holds its history.
   Minimum contents:
   ```yaml
   schemaVersion: 1
   phase: 5
   phaseName: "Autonomous build (BAUT)"
   branch: feature/foundation-task-12
   epic: foundation
   activeStory: task-12
   reviewCycle: 2
   specialists:
     worker:   {role: "implementation", lastSkill: "dev-story @ task-12"}
     reviewer: {role: "independent review", lastSkill: "story-automator-review @ task-12"}
   gatesPending: []
   waivers: []
   lastUpdated: "<timestamp>"
   ```
2. **Backlog.md status is the source of truth for *story* progress** — task status (`To Do` / `In Progress` /
   `Done`) and ticked AC/DoD are the authoritative per-story state. `backlog sequence list` tells you which task
   is ready next. The state file points *at* the current task; the task's own record holds its detail.

On any resume: read `.bmad/sdlc-state.yaml`, then `backlog task list --plain` and `backlog sequence list`,
reconcile, and continue from exactly that point. Never restart completed work; never guess the phase. Do not
copy completed-story lists, test transcripts, old agent status narratives, or historical gates into the live
state file; distil durable research evidence under `research/evolution/` instead.

---

## Branch topology  (sequential — one story in flight, single working tree, no worktrees)

```
main -> dev -> feature/foundation -> feature/foundation/task-<id>
                       \__ fix/foundation/<issue>     (only at the epic gate, on failure)
```
- `dev` holds long-lived work. The foundation **epic** lives on `feature/foundation` (off `dev`).
- Each task (story) gets its own sub-branch off `feature/foundation`, merged back **`--no-ff`** when Done,
  then the sub-branch is **deleted**. One worker active at a time.
- A failure at the epic gate gets a `fix/foundation/<issue>` sub-branch, same merge-and-delete rule.

---

## The full SDLC schema — phases, personas, workflows, git, gates

The complete sequence — every persona call, workflow, git operation, and gate — is the diagram in
**`docs/SDLC.md`** (an agent-readable Mermaid sequence). This section is the prose form; read them together,
and consult the diagram whenever you need the exact ordering or the SPAWN-vs-RESUME lifetime of a persona.

Run top to bottom. For *this* repo, Phases 1–3 are **conformance reviews against the committed docs**, not
generation from scratch; Phase 4 onward is the live work. (check) = a user gate: **stop and wait for a human**.
Update `.bmad/sdlc-state.yaml` at every phase boundary.

**Phase 1 — Analysis** · branch `dev` · persona `analyst`
- Confirm the product brief is captured by `docs/00`–`05`; if a gap exists, surface it (don't invent scope).
- (check) human confirms the brief/docs are the basis.

**Phase 2 — Planning** · branch `dev` · personas `pm`, `ux-designer` (optional)
- *(Optional, if you use Agent OS)* inject coding standards into the agent context (`/inject-standards`).
- Treat `docs/00`–`05` as the PRD/UX spec; `pm`/`ux` review for internal consistency only. If a workflow
  *requires* a `prd.md`/`ux-spec.md` to exist, produce it by running the workflow and answering its prompts
  from `docs/00`–`05` (quote and cite; don't add goals) per "How the doc-set maps onto BMAD" above.
- Keep produced planning projections in ignored working memory. Commit only a human-approved change to the
  canonical docs or a compact evolution decision when the review finds something durable.
- (check) human approves the plan-of-record (the docs).

**Phase 3 — Solutioning + test architecture** · branch `feature/foundation` (off `dev`) · personas `architect`, `tea`
- `git checkout -b feature/foundation` from `dev`.
- `architect`: confirm `docs/12`/`13` are the architecture of record; run `check-implementation-readiness`.
  If an `architecture.md` artifact is required, produce it via the `create-architecture` workflow, answering
  its decisions from `docs/12`/`13` (cite them; don't re-decide); the docs win on any conflict with a default.
- `architect`: if BMAD needs epic/story files, run `create-epics-and-stories` seeded from the backlog — the
  foundation is **epic-1** and the tasks are its stories; don't invent new scope.
- `tea`: `testarch-test-design`, `testarch-framework`, `testarch-ci` — reconciled with this repo's decisions
  (Biome + the three-command gate, vitest, the core-boundary lint rule). Do not contradict tasks 5/6/8.
- Keep generated architecture, epics, and test plans in ignored working memory. Commit executable CI/code,
  approved canonical design refinements, and compact evolution decisions only.
- (check) human approves solutioning.

**Phase 4 — Sprint setup** · branch `feature/foundation` · personas `sm`, `tea`
- The "sprint" is the foundation backlog. `sm` confirms the ready set via `backlog sequence list`; you do
  **not** invent new stories — the backlog tasks *are* the stories. If BMAD requires per-story files or a
  `sprint-status.yaml`, produce them by running the relevant workflow (e.g. `create-story`) seeded one-to-one
  from the existing tasks (a task's acceptance criteria are the story's; don't alter the goal), and keep
  Backlog.md the source of truth for status.
- `tea`: `testarch-test-design` scoped to the epic if useful.
- Keep story files and `sprint-status.yaml` local until their last workflow consumer finishes; Backlog.md is
  the committed story authority.
- (check) human marks the sprint ready to build.

**Phase 5 — Autonomous build (BAUT)** · branch `feature/foundation` -> per-story sub-branches · personas `worker` (dev), `reviewer`, `tea`, `retro`
- Use the persistent worker and independent reviewer directly. The outer **automator** is optional and may be
  enabled only after the Step 0 smoke test. Then, **per backlog task**, run the story loop below.
- After the epic's tasks are Done (culminating in the walking skeleton, task-33), spawn `retro` to run the
  `retrospective` workflow. Distil cross-epic lessons, decisions, and follow-ups into the epic's evolution
  record; keep the transcript as ignored working memory through that distillation.

**Phase 6 — Epic gate** · branch `feature/foundation` (+ `fix/foundation/<issue>` if needed) · personas `tea`, `investigator`, `worker`
- `tea`: `testarch-trace` (initial coverage matrix + interim gate) and `testarch-nfr` (NFR report).
- Reset to a clean environment (e.g. compose down/up) and run the whole E2E suite **cold**, the way CI does —
  a fresh checkout, nothing warm.
- On failure: spawn `investigator` (systematic debugging) -> root cause + fix plan -> `git checkout -b
  fix/foundation/<issue>` -> `worker` applies the fix (re-spawn `dev-story`) -> commit on the fix branch ->
  `git checkout feature/foundation; merge --no-ff fix; branch -d fix` -> re-run cold-start E2E. Repeat until green.
- `tea`: re-run `testarch-trace` after the fix -> **final** gate verdict (PASS / CONCERNS / FAIL / WAIVED).
- Write one schema-valid `research/evolution/gates/<candidate>.json` receipt for the final candidate. Trace,
  NFR, and raw execution output remain working memory; the receipt retains verdict, checks, waivers, and risk.
- (check) human disposes any CONCERNS.

**Phase 7 — Handoff** · branch `feature/foundation` -> `dev` -> `main` · system
- *(Optional, if you use Agent OS)* `/discover-standards` + `/index-standards`; commit any standards updates.
- Push `feature/foundation`; open a PR `--base dev` (`gh pr create`). The PR must show green CI (the
  three-command gate from task-8).
- (check) human reviews the PR and merges -> `dev`. Promotion to `main` is a separate human decision.
- Never self-merge to `dev` or `main`.

---

## Fast feedback and proportional review

Keep correctness gates, but run each at the point where it produces useful information:

- During implementation, run the smallest relevant test files plus typecheck/lint for touched boundaries.
  Build only when generated output, package boundaries, or built-CLI behavior is affected.
- QA runs the focused acceptance/E2E band it adds or changes; it does not automatically repeat the full suite.
- Use one independent reviewer by default. Finish the complete audit and all fixes before the expensive gate.
- Run the exact full CI-equivalent local gate **once on the stable final product/test diff**. If executable source
  or test behavior changes afterward, rerun focused checks and then one new full gate. Story, QA-record, status,
  or comment-only changes may reuse the last full result when product/test hashes are unchanged.
- Add another reviewer or review cycle only for a concrete unresolved finding or demonstrated high-risk seam
  such as security, external authority, concurrency, or platform behavior—not as a ritual.
- Cold-environment and full platform-matrix confirmation remain Phase 6/CI gates; do not duplicate them in
  every story cycle.

---

## The per-story loop (Phase 5, applied to one backlog task)

Pick the **next task whose dependencies are all Done** (`backlog sequence list`; ids are in dependency order).
Then:

1. **Claim & read.** `backlog task edit <id> -s "In Progress"`; `backlog task <id> --plain`. Set `active_story`
   and `review_cycle: 0` in the state file. The acceptance criteria are the contract — they say *what* must be
   true, not *how* (the standard is `docs/task-writing-conventions.md`); you pick the how, within `13`'s layering.
2. **Branch.** `git checkout feature/foundation && git checkout -b feature/foundation/task-<id>`. Update `branch`.
3. **create-story (worker).** The worker **invokes the `create-story` skill** (the Skill tool) — not a
   hand-written spec (Rule 3) — to turn the task into a concrete work spec grounded in the docs, steered from
   `13`/`10` and the task's AC. (The task is the story; this ignored file fleshes out working detail through
   implementation and review.)
4. **dev-story (worker).** The worker **invokes `dev-story`** to implement the task with its tests together.
   Use focused checks while the diff is moving; the stable-diff gate below proves the full DoD.
5. **qa-generate-e2e-tests (worker / tea).** **Invoke `qa-generate-e2e-tests`** to add the end-to-end/acceptance
   tests for the task's behavior, then run its focused acceptance band.
6. **story-automator-review cycle (reviewer — a *separate* subagent, never the worker self-reviewing).** The
   reviewer **invokes `story-automator-review`**, completes the audit, and auto-fixes or returns concrete
   findings. Treat real findings as blocking and bump `review_cycle`; loop dev-story -> review until clean. Run
   the full local CI-equivalent suite once the product/test diff is stable, following the fast-feedback policy
   above. Record and raise a genuinely non-converging review; do not multiply cycles for evidence-only edits.
7. **Verify against acceptance criteria.** Criterion by criterion, each observably true; tick as they pass
   (`--check-ac <n>`). Never tick what you haven't shown.
8. **Record & close.** Tick DoD items (`--check-dod <n>`), record in `--notes` which BMAD skills this story
   actually ran (create-story / dev-story / qa / review — Rule 3's evidence trail), add a decision note if
   worth keeping, transfer unresolved follow-ups, then `backlog task edit <id> -s "Done"`. Backlog notes hold
   the durable story evidence; generated stories and QA summaries do not.
9. **Integrate.** Commit on the sub-branch (message references `task-<id>`); `git checkout feature/foundation &&
   git merge --no-ff feature/foundation/task-<id>`; `git branch -d feature/foundation/task-<id>`. Clear
   `activeStory`; update state. Before staging, run `npm run check:process-artifacts` so working memory cannot
   enter the merge.
10. **Next.** Return to the top with the next dependency-ready task. When the epic's tasks are Done — culminating
    in the **walking skeleton (task-33)** — proceed to the Phase 6 epic gate.

Honor the repo's branching, PR/review, and versioning conventions (tasks 2–4, in `CONTRIBUTING.md`) for commit
and merge mechanics.

## Process-artifact closeout

At every story, investigation, retrospective, epic, and candidate boundary, name the **last consumer** of
each generated artifact. Once that consumer finishes: distil accepted facts into canonical docs, Backlog.md,
an evolution record, or a gate receipt; optionally archive raw evidence only to a human-approved external
store with safe metadata; then leave it ignored locally or clean it. Archive unavailability never authorizes
committing raw output. The complete ownership and retention contract is
[`PROCESS-ARTIFACTS.md`](./PROCESS-ARTIFACTS.md); `.bmad/artifact-policy.yaml` and
`npm run check:process-artifacts` enforce its tracked boundary.

---

## User gates — pause and wait for a human
Stop and ask rather than proceeding past any of: a change to scope or to the design docs (the spec is
human-owned); the phase gates above; merging into `dev` or `main`; an epic-gate verdict of CONCERNS/FAIL;
anything destructive or irreversible.

## Definition of Done (also enforced per task in the backlog)
A task is Done only when it type-checks and the linter is clean (including the core import-boundary rule), tests
are added and green, public functions are documented with no dead code, every acceptance criterion is observably
satisfied and ticked, and the work is committed on its sub-branch and merged to `feature/foundation`.

## When stuck
Re-read the relevant doc (`13` architecture, `10` CLI surface, `08` versioning/integrity, `06`/`07` the generated
artifact). For BMAD mechanics, read the cloned module sources rather than guessing. If a task's acceptance
criteria seem to contradict a doc, that's a real conflict — stop and surface it.
