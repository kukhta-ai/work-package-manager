# wpm — FAQ

Short answers to the questions people actually ask, with particular attention to *"how is this
different from X?"* — because wpm sits near several busy categories and is easy to mistake for one of
them. The one-line version: **wpm packages a *backlog* — a structured set of instructions — that a
recipient's agent runs to carry out a complex setup, with the project-management structure and
cross-agent adaptation a shared markdown prompt can't give you.**

---

## The basics

### What is wpm, in one sentence?
A tool an author uses to produce a **self-contained backlog — a structured set of instructions — that a
recipient's own agent executes to carry out a complex setup** in their environment (configuring the
environment, the agent, or both), and to keep, repair, and reverse it over time.

### What problem does it solve?
Getting a complex setup onto someone else's machine when you can't see their machine. Traditional
installers solved this for deterministic software; wpm targets the messier, environment-specific work —
wiring several tools together, configuring a project, adopting existing software, standing up a workflow
— that doesn't reduce to a single binary. The setup might be *for the end user themselves* (a
multi-piece toolchain) or *for their agent*, or both; either way wpm leans on the fact that the
recipient now *has* a capable agent that can do the adapting the author couldn't anticipate.

### What is the unit I ship — and why not just share a markdown prompt?
A **bundle**: at heart a **backlog — a structured set of instructions** — with whatever payload (skills,
config, scripts) it needs, and a project groups several bundles behind an orchestrator.

The "why not a prompt" is the point. People already share prompts and instruction documents as plain
markdown with each other. That works until it doesn't, in two ways wpm closes. First, **a flat prompt
has nowhere to put complexity** — dependencies between steps, state, what's done versus pending,
acceptance criteria, ordering — whereas a backlog is real project management that holds all of that.
Second, **a raw prompt has no adaptation**: hand the same markdown to a different model or a different
agent harness and it may not work. A bundle narrows that gap by traveling with what it needs to run
elsewhere — bundling the required skills, and laying down the symlinks/standard files that make it
discoverable to specific popular harnesses (`05`).

(wpm *does* have a concrete process for how a bundle runs — currently a detect → setup → verify →
record shape — but treat that as the present working draft of the execution model, not the definition.
The durable idea is the backlog-of-instructions plus the structure and portability around it.)

### Who runs the install — wpm?
No. **wpm never executes anything.** The author runs wpm to *build* the package; the **recipient's own
agent** reads and runs it. wpm is the authoring/packaging tool (the `rpmbuild` / `npm pack && publish`
role), and the "consuming client" is the user's agent rather than a daemon wpm ships. We call this
*thin builder, fat agent*.

### Does it need a specific AI agent?
wpm doesn't gate on one or run a check for "the right agent." Instead it makes the package **ready to be
used across agents by construction** — emitting the standard files and formats that known agent harnesses
already recognize, and supporting user-defined templates for setups those defaults don't cover (`05`).
The discipline an install runs under (a loop, a review gate, spec phases) is **vendored** third-party
content, not built in, so wpm stays workflow-agnostic. The aim is portability — the same bundle working
across models and harnesses — not a compatibility gate.

### What is it built on?
**Backlog.md** — a markdown/git task manager — so each bundle is a real backlog of tasks with
acceptance criteria. wpm doesn't reimplement task management; it builds on a backlog suited to
agent-driven execution (Backlog.md today; the design isn't wedded to it).

### Is it ready to use?
**Public distribution is inactive.** The builder can be developed and exercised from a local checkout, but
there is no approved or published npm coordinate or GitHub release channel yet. See `ROADMAP.md` for the arc
from *builder* to public distribution and discovery.

---

## How is wpm different from…

### …an agent **skill package manager** (skills.sh / `npx skills`, Microsoft APM, FastSkill, skillpm, Tessl, JFrog)?
This is the comparison that matters most, because it's the nearest category — and the distinction is
sharp. Those tools **install skill *files***: they copy a `SKILL.md` (and friends) into a directory like
`.claude/skills/`, pin it with a lockfile, and "uninstall" by deleting the file. **The scope of what
they change is the agent's instruction set.** wpm runs a **backlog of instructions that changes more
than that** — the **environment, the agent, or both**: it can set up and wire together software,
configure a project, adopt existing tooling, *and* arrange the agent, then keep that setup coherent over
time (re-converge it if it drifts, take it back out by reversing what was done — not by deleting a file).

Put bluntly: a skill package manager makes *instructions present on disk for the agent*; wpm makes a
*whole setup actually true on the machine* and keeps it that way. Skills modify the agent; wpm modifies
the environment and/or the agent — skills are one of the things a wpm bundle might deliver as part of a
larger setup, not the ceiling of what it does.

We borrow their good hygiene deliberately — a lockfile pinning vendored content to version + hash, with
a progressive supply-chain hardening path — so wpm is never behind on integrity while it leads on
lifecycle.

### …**spec-driven development** tools (GitHub Spec Kit, AWS Kiro, OpenSpec, BMAD, Taskmaster)?
We share DNA — *a written artifact is the source of truth and an agent executes it, against acceptance
criteria* — and that's good company to keep. The difference is **what gets produced and for whom**.
Spec-driven tools help **you build your own software in your own repo**: spec → plan → tasks →
implementation, landing as application code. wpm helps you **package a setup for a *third party's* agent to carry out** in *their* environment, with the post-build lifecycle (verify/update/repair/
uninstall) that building-software-in-a-repo doesn't have.

Two more distinctions: most of those tools **bake in one workflow** (Spec Kit's phase gates, Kiro's
EARS specs); wpm treats the workflow as **vendored, swappable content**. And several of them are
**IDE- or vendor-coupled** (Kiro to AWS); wpm is a portable CLI that produces a portable artifact. In
fact, a spec-driven framework is something you could *vendor into* a wpm bundle as its discipline —
they're inputs to wpm's model, not rivals to it.

### …an **autonomous agent loop** (Ralph, and "build until the PRD is done" runners)?
A loop is an *execution discipline* — keep iterating until the criteria pass. wpm doesn't compete with
that; it **vendors** exactly that kind of loop as the engine an install runs under (`09`). wpm's
contribution is everything around the loop: what the package *is*, how it's authored and built, how it's
verified, versioned, repaired, and removed. The loop is a part; wpm is the whole.

### …**classic installer builders** (WiX/MSI, Inno Setup, NSIS, electron-builder)?
This is the *right structural analogy* — wpm occupies the same slot (the tool that produces a
self-contained installer with a Modify/Repair/Uninstall lifecycle), and we borrow MSI's lifecycle model
on purpose. The difference is the **executor**: a classic installer ships a binary procedure run by a
dumb OS installer engine; wpm ships **natural-language instructions run by a reasoning agent**, which
is what lets the install *adapt* to an environment the author never saw instead of breaking on it. Same
job, new kind of executor.

### …**installer registries** (winget, Chocolatey, Scoop, Homebrew taps/casks)?
These are the *right precedent for wpm's registry roadmap* — they're registries of *installers*
(manifest repos, hash-verified, with scripted install and export/import), which is exactly the model a
future wpm registry follows (as opposed to a *library* registry like npm or crates.io). The difference
today is the same as above: no AI/agent-execution model, and wpm currently is the *builder*, with the
registry as a later milestone. See `ROADMAP.md` → *Beyond 1.0*.

### …**MCP servers and MCP registries** (the official MCP Registry, Smithery, Glama, PulseMCP)?
Orthogonal. An MCP server is a *tool the agent talks to at runtime*; an MCP registry helps the agent
*discover and connect* such servers. wpm provisions *setups into an environment* — and a bundle's
payload **may well include standing up an MCP server** as one step of a larger setup. So MCP registries are
a complementary layer wpm can build on, not a competitor: they connect tools; wpm provisions
environments.

### …**Claude Code plugins / plugin marketplaces**?
A plugin bundles skills, commands, hooks, and MCP config and installs them into Claude Code; a
marketplace is a git repo cataloging plugins, with commit-SHA pinning. It's a real packaging-and-
distribution mechanism — and the most plausible place a competitor could *grow* lifecycle features. But
today it installs **bundles of files/config into one agent**, without a runtime-acceptance-criterion
verify or a reversible environment-mutation lifecycle, and it's **Claude-Code-specific**. wpm is
cross-agent, sets up more than one agent's files, and keeps the setup coherent over time. (You could ship a plugin *as* part of a wpm
bundle's payload.)

### …Anthropic **Agent Skills** (the `SKILL.md` standard itself)?
The `SKILL.md` format is a **substrate wpm uses**, not a competitor. Skills are how an agent packages
instructions/scripts for itself; a wpm bundle is a backlog that may *deliver* skills as part of a
larger setup and that *carries out, keeps, and reverses* changes to the environment and/or the agent
around them. We're a layer up: a skill is an ingredient, the packaged setup is the dish.

### …an **"app store for AI agents"** / agent marketplace?
Those sell *finished agents or outcomes*, often with platform-managed provisioning ("install the agent,
get a sandboxed tenant"). wpm distributes *author-built, reversible setups* that the
user's *own* agent runs in the user's *own* environment. The emerging "installing provisions an
environment" trend is the closest macro-signal to wpm's vision — but it's vendor-managed and
per-platform, where wpm is author-authored and portable.

---

## Boundaries and design

### What will wpm deliberately *not* be?
A runtime/execution engine (the *tool* never executes — though a *package* may bundle an execution
harness), a tool tied to one SDLC, the author of discipline/loop tooling (it vendors real ones), a
resident daemon (state lives on disk in a per-install **receipt**, exactly as npm keeps state on disk),
a many-language binding sprawl (one reference implementation, a faster reimplementation possible later),
or a task-management tool of its own. The full list with rationale is in `ROADMAP.md` → *Non-goals*.

### Why an agent instead of a deterministic installer?
Because the target environment is unknown, always. A deterministic engine breaks when reality differs
from the author's assumptions; a reasoning agent **adapts to the machine in front of it**, and the
acceptance criteria prove the adaptation worked. You trade determinism for an install that bends instead
of breaking — see the thesis in `00`.

### How does update / repair / uninstall work without a daemon?
Through the **receipt** — the on-disk record of what was actually resolved and done in this environment,
plus each step's inverse op. **Update** is repair against a bumped recipe; **repair** re-converges drift
via idempotent detection (Ansible-style); **uninstall** replays the recorded inverse ops in reverse.
This is the MSI lifecycle model, not a background manager. See `08`.

### Is this secure to run — it's executing instructions on my machine?
Two layers. For the **end user**: nothing happens without an up-front, plain-language **plan preview**
their agent presents for approval (consent + safety gate), and execution is mediated entirely by their
own agent. For **supply chain**: vendored third-party content is pinned by version + content hash in a
lockfile and verified at build (tamper-evident), with signing/attestation on the hardening roadmap. See
`02`, `08`.

### Is "wpm" related to "words per minute" or the Windows Package Manager?
No. The three-letter name is overloaded: **wpm** most often means *words per minute* (typing speed),
and is sometimes used informally for the *Windows Package Manager* (whose real command is `winget`).
This **wpm** is **work-package-manager** — the Backlog.md-based builder described in these docs. It
packages a **work-package**: a structured, status-tracked backlog of instructions plus the skills it
needs, adapted to run on a recipient's agent. The public package coordinate remains unresolved and
unpublished; `wpm` is the command name used by local builds.

### Where do I start reading?
`00` for the model and vocabulary, then `01`–`03` for the three roles (author, end user, executing
agent). `ROADMAP.md` for direction, `docs/SDLC.md` and `AGENTS.md` for how it's being built.
