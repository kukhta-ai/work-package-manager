# 00 · Foundation

This is the entry point. It states what the system is, why it exists, how to read the documents that follow, the model they all build on, and the vocabulary they share. Start here; everything else assumes it.

## What this is, and why

Getting software onto someone else's machine has always been hard, because you can't see their machine. Installers and package managers spent decades taming that problem for *deterministic* software — fixed steps producing fixed artifacts. Two things have now changed: what people increasingly want installed is **capabilities for their AI agent** (skills, integrations, tools, setups), and the person on the other end has a capable, general-purpose agent of their own.

That combination lets us distribute something new. Instead of shipping finished software — or a brittle setup script that assumes a machine it never saw — you ship a **package of backlog bundles**: structured instructions, each paired with acceptance criteria, and the **user's own agent executes them** to stand the capability up in their environment. At its core this project is a way to **distribute instructions for AI agents to run** — an agent-native installer. The tool that builds and manages these is **work-package-manager** (`wpm`): you author a *work-package* — a status-tracked backlog of instructions, with the skills it needs bundled in and adapted per agent — and the recipient's agent runs it.

The bet is that *intent plus verification, executed by a reasoning agent* beats *fixed steps, executed by a dumb engine* exactly when the target environment is unknown — which is always. The agent adapts to the machine in front of it; the verification proves the adaptation worked. You give up determinism; you gain an install that bends to reality instead of breaking on it. The rest of this document makes that precise; the documents after it follow the idea through every role, surface, and tool.

## How to read these documents

They're meant to be read in order — each assumes the ones before it — in four movements, plus a reference appendix:

- **00 — Foundation (this document):** the model, the core bet, and the shared vocabulary.
- **01–03 — The three roles:** who touches the system and what they experience — the **author** who writes a package (`01`), the **end user** who installs from it (`02`), and the **executing agent** that does the work (`03`).
- **04–05 — Protocols and surfaces:** how the authoring and executing agents are expected to behave (`04`), and the native agent capabilities the system builds on — AGENTS.md, skills, slash commands (`05`).
- **06–09 — The artifact and its lifecycle:** the project skeleton (`06`), the install contract every bundle honors (`07`), versioning and migrations (`08`), and the installation process end to end (`09`).
- **10–13 — The tooling:** the authoring CLI (`10`), the authoring process it drives (`11`), and the builder's own architecture (`12`, `13`).
- **14 — Appendix:** a pattern-by-pattern map from traditional installers and package managers to this design — skim it now, return to it later.

Forward references are everywhere; on a first pass, follow them only when curious.

## The model

A **project** is a single repository you hand to someone. Inside it live several **bundles**, each an independent unit that delivers one piece of user-facing functionality — website handoff, document handoff, a specific agent integration — named by a human-readable `summary` field on the bundle itself. Each bundle is its own self-contained backlog — its own Backlog.md root, operated with the bundle as the working directory — a small graph of tasks with acceptance criteria, paired with whatever code, config, or data the author ships as the bundle's payload. An **orchestrator** — a front-door instruction file plus a manifest — sits above the bundles and decides which ones run. The thing that actually executes all of this is the end user's **agent**, not an installer binary.

The bundle is the contract. The author writes it, the executing agent reads it, and the two humans — author and end user — meet only at the decisions the contract chooses to expose. Everything else stays invisible.

## The new-generation thesis

An installer or `npm install` runs deterministic steps. Here the "installer" is part code, part script, part natural-language instruction, and — most importantly — a **backlog the agent reasons over**. That single swap, from deterministic steps to *intent plus verification executed by a reasoning agent*, buys open-ended adaptation to environments the author never saw, and it costs determinism.

Two consequences fall out of that trade and recur in every document. First, **verification has to travel inside each bundle** — the bundle must carry its own proof of success, because the author can't pre-test the user's machine and the agent's choices aren't fixed. Second, the executor is **smart but forgetful**, the inverse of a traditional installer's dumb-but-reliable engine — so the design moves work into the agent's reasoning (inspect the environment, reason over the graph, converse) and keeps only a minimal **receipt** as external memory for the few facts reasoning can't recover. That receipt, not a separate lockfile, is what stops a second run from making different choices than the first, and it's what makes "Repair" mean something other than "do it all again, differently." The discipline that keeps a forgetful executor honest is enforcement: recording the receipt is a Definition-of-Done precondition, not a good intention.

## Vocabulary

So the documents agree on terms:

- **Bundle id** — the internal, stable, kebab-case identifier for a bundle (`web-handoff`). It names the bundle's directory, its Backlog.md `task_prefix`, and how other bundles refer to it in `requires`. It never changes across releases. Distinct from the **summary**, which is the user-facing prose the menu shows; the id is machinery, the summary is for humans.
- **Bundle summary** — the user-facing one-liner describing what a bundle delivers, declared in `bundle.yml.summary`; this is what the menu shows.
- **Target agent** — an agent runtime this installer declares support for (Claude Code, Hermes, Codex, …), listed in the manifest. It behaves as a peer dependency: the executing agent must *be* one of the targets (the install checks, never installs it), and each target gets a scope-alias so the install-time skills are discoverable when that agent runs the project. Managed by `wpm project targets add/remove`.
- **Manifest** — the project's release identity plus the flat list of enabled bundle IDs and target agents. Per-bundle metadata (version, summary, `requires` map) lives in each bundle's own `bundle.yml`, npm-style.
- **Detection** — the idempotent check at the head of every bundle that answers "is this already done?"
- **Handoff point** — a step that pauses and hands control to the human.
- **Confirmation level** — how much consent a step needs, decided by the author, respected at run time.
- **Receipt** — the record of what was actually resolved and decided *in this environment*, plus, per step, its inverse op and whether each dependency was installed or adopted. It lives inside the Backlog.md task records (not a separate file) and is what makes resume, repair, and uninstall coherent.
- **Uninstall** — by default, replaying the receipt's recorded inverse ops in reverse; an authored reverse backlog is an optional escalation for genuinely complex cases.
- **Recipe vs receipt** — the *recipe* is the shipped, versioned task definitions in the repo (replaced wholesale on update); the *receipt* is the persistent filled-in copy the install stamps out elsewhere. State never lives in the shippable recipe.
- **Version / migration** — a bundle carries a stable `id` and a moving `version`; bundles depend on each other by `requires: {dep-id: "<npm-style constraint>"}`. An **Update** is Repair against a bumped version, and a **migration** is a run-once, version-gated task for changes that only make sense coming from an older version. Full convention in `08`.

## Standing on installer and package-manager tradition

We borrow heavily and deliberately from installers (MSI, dpkg/apt, RPM) and package managers (npm, Cargo, Homebrew), plus the migration discipline of Flyway and the desired-state convergence of Ansible and Puppet. They solved the same social problem we have — get software onto a stranger's machine without surprising or breaking them — and that's decades of refinement we have no reason to reinvent.

What changes is the executor: every one of those patterns assumed something that *just runs steps*, and ours reasons, so each borrowed idea shifts shape on the way in. A wizard's component menu becomes a list of bundle summaries the agent can pre-filter by inspecting the machine; an EULA becomes a plain-language plan preview that is both consent and safety gate; an MSI rollback script becomes an inverse-op journal the agent writes as it goes; Flyway's versioned-versus-repeatable migrations become two kinds of task. The one worth stating here, because the whole lifecycle turns on it: **idempotent detection** — Ansible's "check the current state before you act" — is what makes install, repair, and update the *same* operation pointed at different starting states.

The full pattern-by-pattern translation, twenty-odd rows of old-world-to-new, is the reference appendix in `14`. With the model, the thesis, and the vocabulary in hand, the next document turns to the first of the three roles: the author.
