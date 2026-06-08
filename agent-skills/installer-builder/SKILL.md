---
name: installer-builder
description: Author a bundle-project — a wpm agentic-installer that another person's AI agent installs — by driving the wpm CLI. Use when the user asks to author a bundle-project, build an installer, create a wpm project, package a capability as an agentic installer, or ship something as a bundle-project.
---

# Authoring a bundle-project with `wpm`

You are helping a human author a **bundle-project**: a repository they hand to someone else, whose own AI agent
then *installs* it. You drive the `wpm` CLI to scaffold and shape the project; you write the content; the
recipient's agent does the actual install later. This skill is the when-to-use and the workflow shape — the
depth lives in the six files under `references/`, which you read on demand.

**The bet you author into** (doc `00`): *intent plus verification, executed by a reasoning agent, beats fixed
steps* — because the install runs on a machine you never see. So a recipe task states an **outcome to verify, not
steps to replay**; the recipient's agent adapts the *how* to its environment, and the acceptance criteria prove
it worked. This is the why behind the what-not-how AC contract (`references/task-conventions.md`) and all below.

> The CLI binary is `wpm` (its `installer` alias is the same program). All examples below use `wpm`.

## What you are building

- A **bundle-project** is one repo with a `manifest.yml` (the project's release identity, the flat list of
  enabled **bundles**, and the **target agents** it supports) and one or more **bundles**.
- A **bundle** is an independent unit delivering one capability. It carries an **install-backlog** — the
  shipped **recipe**, a `detect → setup → verify` graph of Backlog.md tasks — plus a **payload** (the files,
  templates, and runtime skills it delivers) and a per-bundle **front-door** `AGENTS.md` (scope notes).
- At install time the recipient's agent walks each bundle's recipe and writes a **receipt** into the task
  records (state lives there, never in a separate store). You author the recipe; you never write the receipt.

Read the model in doc `00` if a term is unfamiliar; the vocabulary (bundle, manifest, install-backlog, recipe,
receipt, front-door, payload, authoring-backlog, target agent) is fixed.

## Two principles you operate under

These decide who does what — hold them the whole time.

- **Thin builder, fat agent.** `wpm` is a *thin builder*: it authors and packages instructions but **never runs
  an install itself** — it never installs anything, embeds no runtime, never reaches onto a target machine. The
  CLI does mechanical structure (scaffold dirs, edit YAML, register references) and materialises *authoring
  tasks*; **you** are the *fat agent* — you do the authoring thinking and write every piece of content (task
  bodies, SKILL.md bodies, payload files); the recipient's agent does the install. Don't wait for the CLI to "do
  the install" or to invent prose — neither is its job.
- **SDLC-agnostic.** The product models **no particular development process**. If a project wants a disciplined
  or unattended install (a Ralph-style loop, a review gate, spec-driven phases), the author **vendors** an
  existing skill or loop-runner into `installer-skills/` as *content* — there is no built-in "workflow" mode in
  `wpm`, by design.

## The workflow, end to end

Drive it in this arc; the per-phase detail and the exact authoring-task list are in
`references/authoring-workflow.md`.

1. **Elicit the author's intent** in your own words (what capability, for which agents, split into which
   bundles). There is no CLI command for this — it is your judgment.
2. **Scaffold** with `wpm init <name> [--template minimal]` (`minimal` is the only project template that ships
   today). This creates the **authoring workspace** — the deliverable wrapped in `wip/`, an empty `builds/`, and
   the hidden `.authoring-backlog/` — and materialises the project-wide authoring tasks.
3. **Add a bundle per capability** with `wpm bundle new <id>`. Each one materialises that bundle's authoring
   task set (plan / fill install-backlog / payload / review …).
4. **Work the authoring-backlog task by task.** List it with Backlog.md, pick a task by title, set it In
   Progress, do the work, then self-attest it Done — the CLI never auto-closes a task. For each bundle:
   - set its metadata and dependencies: `wpm bundle <id> meta …`, `wpm bundle <id> requires add <dep> "^x.y.z"`;
   - **fill its install-backlog by calling Backlog.md directly inside the bundle** —
     `backlog task create "…" -l "kind:state,step:<slug>" -m <version> --ac "…"` — building the
     detect→setup→verify trio with the V2 tags (see `references/conventions.md` for the exact invocation,
     incl. pointing Backlog.md at the install-backlog — a current CLI gap, TASK-102);
   - author payload content with your editor, then **register** it: `wpm bundle <id> files add …`,
     `wpm bundle <id> skills add <name>`.
5. **Validate and build.** `wpm build dry-run` (runs `project validate`), then `wpm build package`.

The `<project>-installer` orchestrator skill and the scope aliases re-render automatically on every mutating
command (no separate regenerate step). Your **author-owned** executor front door `wip/_AGENTS.md` is *not*
re-rendered — it is written once at `init` and you edit it by hand thereafter (see `references/conventions.md`).

## Which surface does what

- **The `wpm` CLI** manages **structure** — projects, bundles, manifest entries, registered references. It does
  *not* wrap Backlog.md task operations.
- **Backlog.md, used directly**, is how you create and edit every install-backlog *recipe task* and how you
  work the authoring-backlog (the **no-mirror** rule — `wpm` never aliases `backlog task …`).
- **Your editor / write tools** produce all user-facing **content** (the **structure-not-content** rule): task
  bodies, SKILL.md bodies, payload files. The CLI registers and validates what you placed; it never authors it.

## Where to go for depth (read these on demand)

- `references/command-reference.md` — the full `wpm` command surface, compressed from doc `10`.
- `references/authoring-workflow.md` — the phase-by-phase authoring process and the per-bundle task set, from
  doc `11`.
- `references/conventions.md` — the V2 recipe-task tagging (`kind:` / `step:` / version milestone), the
  Backlog.md flag rules, and the structure-not-content / no-mirror rules, from doc `08`.
- `references/quality-protocol.md` — the authoring quality discipline: the three author decisions, simulate the
  executor, the leaked-coupling check, and the must-nots, from doc `04`.
- `references/task-conventions.md` — the acceptance-criteria *what-not-how* contract for every recipe task you
  write (observable outcomes, the seam-vs-stuffing rule, the fast classifier), from `docs/task-writing-conventions.md`.
- `references/native-surfaces.md` — the native agent surfaces, the five skill roles (where each lives and what
  triggers it), scoped skill discovery, and the executor front-door / per-target alias mechanic, from doc `05`.

Keep this page in context; pull a reference in only when you reach for what it covers.
