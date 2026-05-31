# 09 · The Installation Process

The dynamic view over `06`'s static structure: what actually happens, in order, from the moment a user points an agent at the project to a recorded, working install — and how the same process serves update, repair, and uninstall.

The earlier drafts of this doc drew the install as a flowchart the agent *obeys* — phases, diamonds, a program counter. That framing is a holdover from the deterministic-installer lineage, and it undersells what the executor now is. A modern coding agent handed a backlog and instructions doesn't step through a state machine; it **reads the situation, forms a plan, and works tasks under a discipline** — failing, retrying, adapting, resuming across context resets. The install process is therefore best understood not as a control-flow diagram but as **a backlog executed by a looping, reasoning agent under a stated per-task workflow**. The installer supplies the backlog (the recipe) and the workflow (stated in `AGENTS.md`, expanded in the orchestrator skill), and — at the author's option — strengthens the workflow from *stated* to *enforced* by vendoring a real discipline skill from the ecosystem, and enables unattended runs via plain loop instructions. Then it gets out of the agent's way.

This reframing matters because the ecosystem has converged on exactly this shape. Three primitives, all mainstream by 2026, are the substrate the install rides on.

## 1 · The three primitives the install rides on

**The agentic loop (the "Ralph" pattern).** Run a coding agent repeatedly, each iteration a fresh context, picking the next unfinished task from a list on disk, until everything is done. Memory survives between iterations not in the conversation but in the **filesystem** — a progress file, git history, and crucially for us, *the receipt*. The task source is deliberately swappable — a PRD, GitHub issues, Linear, or **a backlog** — and the pattern's two hard requirements are a clear definition of done per task and guardrails so an unattended agent can't wander. That is, almost line for line, the install-backlog executed against a receipt: each task is detect→setup→verify→record, the receipt is the cross-iteration memory, and the loop runs until every selected task verifies. Fresh-context-per-task is not a constraint we tolerate — it is a *feature we exploit*, because each bundle task was authored (per `04`) to be runnable by an executor with no conversational context. The pattern is also packaged as installable **runners**: real Ralph plugins for Claude Code and Codex (the `snarktank/ralph` plugin and its `ralph.sh`, the `ralph-wiggum` plugin, Ralph TUI) drive the loop natively, each feeding a per-iteration prompt to fresh instances. A project that wants unattended installs vendors one of these runners and supplies the prompt content in `RALPH-LOOP.md` (§2); the two are distinct — the plugin is the engine, `RALPH-LOOP.md` is the instructions it runs.

**Disciplined-workflow skills (the "superpowers" pattern).** A meta-skill, injected at session start, that *enforces* a development methodology the agent would otherwise skip under time pressure — brainstorm before plan, plan before code, test before implementation, review between tasks — and refuses to let phases be bypassed. The lesson its adoption taught the ecosystem is blunt: the gap between a brilliant agent and a reliable one is **discipline, not intelligence**. An unconstrained agent rationalizes shortcuts; a discipline skill removes the option. This is the exact mechanism the install needs, because every failure mode in `00`–`03` (skip detection and clobber a working tool, mark done without verifying, forget to record the inverse op) is a *discipline* failure, not a capability one.

**Goal-oriented kickoff (`/goal` and slash commands).** Agents increasingly expose an explicit entry point for "here's an objective, go achieve it autonomously." This is the modern front door alongside AGENTS.md — a place to point the agent at "install this project" and have it pick up the loop and the discipline without the user hand-narrating the steps.

The project template a generated install is built from carries this machinery as ordinary files (the per-file catalogue is in `06`). None of it is a separate package or a new kind of entity — it's the same template that supplies `AGENTS.md` and the manifest, with a few more files in it. None is mandatory either: the install still works on a bare agent reading `AGENTS.md` and the backlog by hand. But where the agent supports them, these files make the install disciplined and, if the user wants, unattended.

## 2 · What the generated project carries to make this happen

The install behaviour rides in files the project template already supplies, copied into the project by `wpm init`. None is a new entity; the orchestrator skill and `AGENTS.md` are where the per-task workflow is *stated*, and the only genuinely new option is that the author may *vendor* an existing third-party discipline skill to have that workflow *enforced* rather than merely instructed.

```
   FILE (in the project, from its template)        WHAT ITS CONTENT DOES
   ─────────────────────────────────────────────────────────────────────────────────────────
   AGENTS.md  (project root)                        front door: recognition + kickoff + the install
                                                    shape + standing rules. States the per-task
                                                    workflow (§3) the agent follows; points at /goal.
   ─────────────────────────────────────────────────────────────────────────────────────────
   installer-skills/⟨project⟩-installer/ SKILL.md  the orchestrator: recognize → orient → offer →
                                                    resolve → work the backlog → close. Triggers on
                                                    "install this project". Carries the workflow procedure.
   ─────────────────────────────────────────────────────────────────────────────────────────
   installer-skills/⟨vendored-discipline⟩/         OPTIONAL real third-party skills the author copies
     SKILL.md  (e.g. from superpowers, MIT)         in to ENFORCE a workflow (TDD, code-review, etc.)
                                                    rather than rely on prose. Not authored by us; not
                                                    required. Pinned + surfaced in plan-preview (06).
   ─────────────────────────────────────────────────────────────────────────────────────────
   RALPH-LOOP.md  (project root)                    plain doc we author: the install task + per-iteration
                                                    SDLC instructions (the prompt a loop feeds each fresh
                                                    instance). Prose only. The loop RUNNER is separate —
                                                    a vendored Ralph plugin (next row) or a bare agent.
   ─────────────────────────────────────────────────────────────────────────────────────────
   installer-skills/⟨ralph-plugin⟩/  (optional)     a vendored loop-runner plugin (e.g. snarktank/ralph,
     .claude-plugin/ + skills/ + ralph.sh           MIT): the machinery that drives the unattended
                                                    fresh-context loop, reading RALPH-LOOP.md as its prompt.
                                                    Third-party, named on its own; not authored by us.
```

The per-task workflow itself (§3) is not a separate artifact we ship — it's stated in `AGENTS.md` and expanded procedurally in the orchestrator skill, where install instructions have always lived. Two things *are* genuinely new, and both are about reusing the ecosystem rather than building. An author who wants the workflow **enforced** — held to, not just described — can drop in a real discipline skill (`06` catalogues the options: obra's superpowers under MIT, or alternatives like BMAD-METHOD and Spec Kit) instead of us authoring a bespoke enforcer; the ecosystem already solved "make the agent write the test first" and "review before moving on." And an author who wants installs to run **unattended** vendors a real Ralph loop *runner* — a plugin like `snarktank/ralph` with its `ralph.sh` and `.claude-plugin/` manifest — rather than us shipping a runner. The one piece we *do* author for the loop is `RALPH-LOOP.md`: not the runner, just the plain-prose task-and-SDLC prompt the runner (or a bare agent) executes each iteration. Keep the two straight — the plugin is the engine, `RALPH-LOOP.md` is the instructions. (The full per-file catalogue of the project template is in `06`; the builder-side packaging is in `12`.)

## 3 · The per-task workflow

This is the workflow `AGENTS.md` states and the orchestrator skill expands, applied to **every** task in **every** bundle, regardless of mode. It is the system's "uniform loop." A vendored discipline skill, if the author included one, is what turns "the agent *should* follow this" into "the agent *can't skip* a step of it."

```
   FOR THE NEXT UNFINISHED TASK (the loop picks it; deps satisfied first):

   ① READ      load this task's prior receipt entry (keyed by step: slug).
               understand what was done before and why — not just a status flag.
        ▼
   ② DETECT    is the task's intent ALREADY satisfied in this environment?
               (a reasoning check against the acceptance criteria, not a checkbox —
                the agent may find the intent met by a different mechanism than the
                recipe names, or find a partial prior attempt to reconcile)
        ├─ satisfied ─────────────────────────────▶ ⑥ RECORD (confirm + skip work)
        │ not satisfied
        ▼
   ③ PLAN      decide the concrete actions for THIS environment. surface them if the
               step is at a dangerous confirmation level; pause at a handoff (§5).
        ▼
   ④ DO        execute. honor the confirmation level the author set.
        ▼
   ⑤ VERIFY    check the acceptance criteria actually hold now. the agent reasons
               about real success, and may hand to the user to confirm. FAIL ──▶ §5.
        ▼
   ⑥ RECORD    write the receipt: inverse op, installed-vs-adopted, checksum of what
               was placed, decisions worth pinning. THIS IS DoD-GATED — the task may
               not be marked Done until the receipt entry exists. (`07`)
        ▼
   ⑦ ADVANCE   task Done. loop picks the next. (the agent's context may reset here;
               the receipt is what the next iteration reads.)
```

The four points the workflow turns on — the ones `AGENTS.md` states as non-negotiable and a vendored discipline skill, if present, will not let the agent skip:

- **Detect before do.** Never run setup whose intent is already satisfied — this is what makes re-runs (repair, update, retry) safe, and what protects a tool the user already had.
- **Verify before record.** A task is not done because the steps ran; it is done because its acceptance criteria hold. The agent checks, reasoning about genuine success rather than trusting that the command exited 0.
- **Record before advance.** The receipt entry is a Definition-of-Done precondition (`07`), not a courtesy. A forgetful executor that advances without recording has destroyed the only memory the next iteration has.
- **Never touch a sibling.** The task works only its own bundle; it never reaches into another bundle's state or assumes an undeclared prerequisite.

Detection being the load-bearing primitive is what collapses install, update, and repair into one workflow pointed at different starting states — the agent doesn't run three procedures, it runs this one against whatever the receipt and environment currently are.

## 4 · The data invariant: read the recipe, write the receipt

The one rule that survives every execution style — interactive or looped, disciplined or bare. The agent reads the shipped recipe and writes the persistent receipt, and the receipt keeps worked tasks *whole* (in `archive/`), so swapping in a new recipe on update never costs the per-step uninstall knowledge.

```
   SHIPPED RECIPE                          PERSISTENT RECEIPT  (its own Backlog.md backlog)
   bundles/<b>/install-backlog/            $STATE/<project>/<b>/
   (repo · versioned · read-only ·         ├─ tasks/    live current-version set: continuing
    a disposable working clone)            │            kind:state (reconciled in place) + pending migrations
                                           └─ archive/  durable history, full task files:
     tasks: instructions + AC                          applied kind:migration (the ledger) +
            + kind: + step: slug                        retired steps (tombstones, inverse op intact)
        │                                        ▲
        │  reads instructions for                │  executes here; archives a task whole when it's
        │  the current version                   │  done-forever; addresses preserved tasks by
        └──────────────▶ [ AGENT ] ──────────────┘  step: slug + version (IDs recycle, so never task-N)
                          reads recipe, writes receipt; never writes the recipe

   a new download SWAPS the recipe clone; the receipt — tasks/ AND archive/ — is untouched
   → every prior step's content and inverse op is preserved in full, not compacted
```

This is also exactly what makes the agentic-loop pattern safe for us: the loop's "memory in the filesystem" *is* this receipt. A fresh-context iteration re-reads it and knows precisely what the previous iterations did and decided, so a context reset between tasks costs nothing.

## 5 · The whole-install arc, and the two hard stops

Zooming out from the per-task workflow to the run as a whole. Only two points ever halt the agent against the user; everything else proceeds.

```
   user points an agent at the project   (AGENTS.md auto-read)  ── or ──  /goal: "install this project"
        │                                                                  (the installer skill fires)
        ▼
   RECOGNIZE   stance flips from "edit this repo" to "install this project"
        ▼
   ORIENT      read manifest.yml (enabled bundles + targets) and each bundle.yml (version, summary, requires)
        ▼
   ⟨ is this agent a declared target? ⟩ ── no ──▶ STOP, say so plainly
        │ yes
        ▼
   DETECT+OFFER   inspect the environment; present each bundle's summary as a menu; user multi-selects
        ▼
   RESOLVE+PLAN   resolve requires transitively (deps by id + version constraint); preview every change,
        │         every elevation, every skill that will land in the agent's scope
        ▼
   ⟨ user approves the plan? ⟩ ── no ──▶ STOP                    ◀── the consent-and-safety gate (the grown-up EULA)
        │ yes
        ▼
   ENGAGE THE LOOP   for each selected bundle in dependency order, work its backlog task-by-task
        │            through the §3 workflow (enforced by a vendored discipline skill if the author
        │            included one). interactive: the agent runs it inline. unattended: per RALPH-LOOP.md,
        │            fresh context per task, halting only on a handoff or a DoD failure.
        ▼
   CLOSE       per bundle: "here's what you now have, and how to trigger it"
```

The two insets the workflow branches into — neither is exceptional control flow; both resume the same workflow:

```
   HANDOFF  (elevation / re-auth / "restart required")     PARTIAL FAILURE  (one bundle)
     pause; mark the task Blocked, note what's awaited       contain to the failing bundle only
     surface the need in plain language; this is the ONE     replay its completed steps' inverse ops
       place the agent's autonomy is suspended                 (soft rollback, best-effort)
     wait for the human; resume from the recorded receipt    leave sibling bundles intact
     the once-blocked step finishes after the restart        report per bundle; offer a safe retry
                                                             (safe BECAUSE of detect-before-do)
```

For an unattended run — driven by a vendored Ralph runner (its `ralph.sh` looping fresh instances) or by a bare agent re-reading `RALPH-LOOP.md` each pass — a handoff or an unrecoverable failure is precisely the halt condition: the agent stops and surfaces, rather than pressing on past a point that needs a human. This is the guardrail half of the Ralph pattern's "DoD + guardrails" requirement, and it lives in the prompt content of `RALPH-LOOP.md` (which the runner executes) rather than being left to the user's loop config.

Reversal is soft, not transactional: reliable on what the inverse-op journal recorded, best-effort on side effects that aren't cleanly reversible. True MSI-style atomic rollback isn't achievable when a reasoning agent is touching a real machine, and the design is upfront about that rather than implying a guarantee it can't keep.

## 6 · One workflow, four modes — entered by reading the receipt

Install, update, repair, and uninstall are not four procedures. They are the §3 workflow run against different receipt states, plus reverse. The agent doesn't *select* a mode; it reads the receipt and the recipe and the mode falls out.

```
   INSTALL (fresh)   empty receipt        → every state task's DETECT comes up empty; all run. migrations' gates skip.
   UPDATE            recorded < declared  → state tasks reconcile (DETECT skips the satisfied ones);
                                            pending migrations (introduced-version > recorded, from-gate matches)
                                            fire oldest-first, each archived to the ledger on RECORD.
   REPAIR            recorded = declared  → DETECT re-checks every AC; only drifted tasks DO; no migrations.
   UNINSTALL         reverse              → read tasks/ AND archive/ by slug for every inverse op; replay
                                            (own-installed only, never adopted); shared-dep removal decided
                                            from the requires-graph; tombstones cleared.
```

Uninstall is why worked tasks are archived whole rather than compacted: the inverse op for something the current version no longer mentions still lives, in full, in `archive/`. And update needing no diff — just detection plus the version gate deciding what runs — is the same property that lets the agentic loop re-enter an install idempotently after any interruption.

Read with `03` (the executing agent's protocol in prose — this doc is the shape that protocol takes when an agent runs it under the stated per-task workflow), `06` (the structure these phases move through, and the per-file catalogue of what the project's files say — including how an author vendors a discipline skill), `07` (what RECORD writes and how DoD gates it), `08` (the version comparison and migration gating behind UPDATE), and `12` (how the builder packages the project templates that carry this).
