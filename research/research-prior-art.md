# Prior Art & Inspiration — research notes

Research into adjacent and prior work, to validate the architecture, borrow what's proven, and sharpen what's genuinely novel. Four threads: the configuration-management lineage (the install model), spec-driven development (the "agent executes instructions" model), hexagonal architecture (the core app), and the emerging agent-skill package-manager cluster (the competitive frame). Sources are 2024–2026 unless noted.

## 1 · Configuration management validates the install model

Ansible / Puppet / Chef / CloudFormation / Terraform all converge a system to a **desired state** by checking current state before acting — idempotency as the central guarantee. This is exactly the recipe-vs-receipt / detect-before-do model of `08`/`09`, and the lineage is worth claiming explicitly:

- **Desired-state + idempotency.** "Verify the current state of what will be modified; if already in the desired state, no action is taken" is the Ansible module contract — and our DETECT step verbatim. Puppet's "continuous convergence — systems regularly reconciled against declared state, reducing drift" is our repair mode.
- **Declarative source, imperative convergence.** Ansible playbooks, Puppet manifests, Chef recipes all *describe* end state in a readable format (YAML/DSL) while the engine figures out the *how*. Our recipe is the description; the executing agent is the convergence engine. Note Chef literally calls its units "recipes" — we landed on the same word independently, which is a good sign the metaphor is load-bearing rather than decorative.
- **The agentless/agent split mirrors our axis.** Ansible is *agentless* (a control node pushes over SSH); Puppet/Chef install a persistent agent that pulls and self-corrects. Our model is a third point: the *user already has* a general-purpose agent (their coding agent), so we neither push nor install a daemon — we ship instructions that the agent-they-have executes. That's a genuinely new position on a well-mapped axis.

**What to borrow:** the vocabulary of convergence and drift; the discipline that *every* unit is idempotent (Ansible's "command modules" — `shell`, `command`, `raw` — must be made idempotent via guards, exactly our concern with free-form agent steps). **What to claim:** the agent-executes axis is new; the desired-state core is proven, and saying so borrows their credibility rather than pretending we invented idempotent install.

## 2 · Spec-driven development is the closest active paradigm

SDD (GitHub **Spec Kit**, AWS **Kiro**, Thoughtworks' writing) exploded in 2025–2026 and shares our deepest premise: **a written artifact, not chat history, is the source of truth, and an agent executes it.** The convergence is striking and worth studying closely.

- **The hierarchy matches ours.** Spec Kit's flow is *Constitution → Spec → Plan → Tasks → Implement*, "each a markdown file the next phase reads," letting "AI execute development like a project manager following rules." Our flow is *manifest → bundle → install-backlog tasks → execute*, with `AGENTS.md` as the constitution. Same shape, different domain (installing capabilities vs. building features).
- **"Start vibe, finish spec-driven."** The industry rule-of-thumb — vibe-code throwaways, spec-drive anything long-lived where drift is costly — is the same argument for why an *install* (long-lived, drift-prone, must survive updates) deserves a spec rather than a one-shot prompt.
- **Drift detection** is SDD's headline feature (code drifting from spec over time). Our receipt-vs-recipe comparison and repair mode are the install-domain version of exactly this.
- **The low-tech finding is permission to stay simple.** Multiple 2026 sources independently conclude that the core value of SDD — "spec context injected into every agent interaction" — "can be achieved with entirely low-tech tooling: well-structured markdown in a docs/ folder, loaded on each task," and that the heavy platforms only "add automation, verification, synchronization." This directly validates our markdown-and-Backlog.md floor over a bespoke engine.

### The sibling: `spec_driven_develop` (a near-twin to study)

One project (zhu1090093659/spec_driven_develop) is so close it's worth treating as a reference design and a differentiation test. Its self-description: *"not a framework, not a runtime, **not a package manager** — a single SKILL.md that teaches any AI coding agent a structured methodology."* It has:

- a `MASTER.md` "persistent source of truth across conversations" (our receipt/manifest role),
- loads pending tasks into the agent's **native task tool** (TodoWrite) for in-IDE visibility (we use Backlog.md instead — heavier, but gives us the archive/versioning we need),
- an **archive mode** that moves artifacts to `docs/archives/<project-name>/` on completion (our `archive/` for done-forever tasks — near-identical),
- **graceful degradation** when sub-agents aren't available, falling back to sequential (our "works on a bare agent that just reads AGENTS.md" floor),
- explicit "platform-neutral, no platform-specific logic" (our multi-target-agent stance).

**The differences that define us**, against this near-twin:
1. **It builds software; we install capabilities.** SDD's output is application code in the user's repo. Our output is working tools/skills in the user's environment. Different domain, and ours has no analogue to "the code compiles" — our success test is a runtime acceptance criterion (`does chromium launch`), closer to config-management than to codegen.
2. **It's one SKILL.md; we're a structured multi-bundle project with a dependency graph.** Their methodology is monolithic and per-project. We have independently-versioned bundles, an npm-style `requires` graph, and a manifest — because installing a *suite* of capabilities with shared dependencies is our problem, not building one feature.
3. **We have a builder CLI; they have only the methodology doc.** This is the sharpest line. SDD tools mostly ship *a methodology* (instructions) and stop. We ship a methodology *and* a builder (`10`–`13`) that authors the artifacts structurally, with the structure-not-content discipline. We're "the tool that builds the thing that the agent executes."
4. **Recipe/receipt separation.** Their MASTER.md is one evolving file. Our shipped recipe (read-only, swappable on update) and persistent receipt (the user's install state, with whole-task archival for uninstall) are deliberately distinct — because we must support *update* (swap the recipe, keep the receipt) and *uninstall* (replay inverse ops from the archive), which a single living spec doesn't cleanly do.

**Takeaway:** we are not alone, but no one in the SDD cluster occupies our exact niche — *spec-driven **installation** of multi-capability suites, with a builder CLI and a recipe/receipt lifecycle.* The near-twin's existence is validation that the core bet (ship instructions, the user's agent executes) is sound; the four differences are the moat.

## 3 · Hexagonal architecture confirms the core app (doc 13)

Doc 13's ports-and-adapters design is textbook-correct, and the literature validates specific choices nearly verbatim:

- **Cockburn's founding insight maps to us directly:** the pattern exists because "traditional layered architecture treats UI and databases *asymmetrically*, when both are external actors that should interact with the application in fundamentally similar ways." Our equivalent: the CLI (driving) and the filesystem + Backlog.md (driven) are all just adapters around a pure core — exactly that symmetry.
- **"Run by different kinds of clients (humans, test cases, other applications)"** is the canonical motivation — and precisely why doc 13 has operations callable by both commander and tests with fake ports.
- **Verbatim-matching guidance** from current practitioner writing: "use-case functions must receive the adapters they need during initialization" (our operation signature); "wire everything in a **composition root** using dependency injection" (our `cli.ts`); "**ports must support contract tests** to validate interchangeable adapters" (our real-vs-fake adapter pairs); "the core must be compilable and **testable without any framework**" (our pure-core rule); "prevent framework annotations from contaminating the core" (our "nothing under core/ imports commander/execa" invariant).
- **TypeScript fit confirmed:** "Ports are TS interfaces, adapters are classes that implement them" — exactly doc 13's port/adapter split, and reassurance the pattern is idiomatic in our stack, not imported from Java.

**Takeaway:** no change needed to doc 13; the research is corroboration. The one nuance worth adopting from the literature: name things with `Port`/`Adapter`/`Service` suffixes for legibility, and treat the import-boundary lint rule as the thing that actually keeps the hexagon honest (every source warns the pattern "breaks down without a clear place where dependencies are wired").

## 4 · The agent-skill package-manager cluster (the competitive frame)

A real cluster is forming around "package management for agent skills." Mapping it precisely is how we see our white space.

- **Skills MCP** ("The Package Manager for AI Agents") — an MCP server connecting an agent to a global skill registry to "autonomously discover, install, and learn new skills." Its stated philosophy is **"Thin MCP, Fat Agent: handle the delivery of code and instructions, empowering the agent to execute them using its own environment (uv, bash)."** That is *our* philosophy almost word-for-word — strong validation of the "deliver instructions, the agent executes in its own env" bet.
- **FastSkill** — "skill package manager and operational toolkit": registry services, semantic search, version management, **manifest system with lock files for reproducible installs**, deployment tooling. The most infrastructure-heavy entrant; closest to a classic package manager. Notably calls skills "recipes" too.
- **Claude Code plugin marketplaces** (`/plugin marketplace add …`; agent-kit, dev-utils, cc-plugins, spjoshis, et al.) — the *native* distribution channel: plugins bundling skills, agents, commands, hooks, MCP servers, installed by name. Several explicitly "Agent-First," with Linear/GitHub/Jira task integration and 9-agent "one man team" workflows.
- **Composer agent-skill plugin** (PHP) — language-ecosystem skill distribution: discovers packages of type `ai-agent-skill`, generates an `AGENTS.md` skill index, "progressive disclosure: lightweight index, full details on demand," "security first: rejects absolute paths, validates metadata." Confirms our progressive-disclosure and security instincts are becoming standard hygiene.

**Where everyone in this cluster stops, and we don't:** every one of these distributes **skills as the unit** — discover a skill, install a skill, the agent gains a capability. None of them *install a working system into the user's environment via a verified, idempotent, reversible procedure.* They deliver instructions-as-capability; we deliver instructions-as-installer. Concretely, our differentiators against the whole cluster:

1. **The unit is a capability *install*, not a skill file.** A bundle's payload may include skills, but the bundle is a detect→setup→verify→record procedure that changes the environment (installs Chromium, writes config, adopts an existing tool), with a runtime acceptance criterion as its success test. The cluster ships the SKILL.md; we ship the thing that *makes the SKILL.md's prerequisites true on this machine.*
2. **Recipe/receipt lifecycle: update, repair, uninstall.** The cluster does install (and FastSkill does versioned install with lockfiles). None does the full lifecycle — drift-repair, migration-on-update, inverse-op uninstall — because skills are stateless files; our installs are stateful environment changes that must be reversible.
3. **A builder, not just a registry/runtime.** Skills MCP and FastSkill are *delivery*; the marketplaces are *distribution*. We are *authoring*: a CLI that builds the bundle-project structurally (`10`–`13`). The closest builder-like entrant is "agent-skill-builder" (a plugin that helps write one skill) — an order of magnitude smaller in scope.
4. **We compose the cluster rather than competing with all of it.** This is the key strategic note: we *vendor* discipline skills (superpowers) and loop runners (`snarktank/ralph`) and we *install into* the same scope these marketplaces use. We sit one level up — the cluster is our distribution substrate and our vendored-tooling supply, not (mostly) our rival. The one place we do overlap is FastSkill's "manifest + lockfile + versioned install"; worth watching whether it grows toward stateful installs.

**Borrowed hygiene to adopt explicitly:** lockfile-style reproducibility (FastSkill) is worth considering for pinning vendored skills/plugins (we already say "pin the version" for superpowers/ralph — a lockfile is the mechanism); `/plugin marketplace` is the native install channel we should target for the vendored runners; the Composer plugin's "reject absolute paths, validate metadata, progressive-disclosure index" is a good security/UX checklist for our own skill handling.

## 5 · Net assessment

- **The install core is proven** (config management). Don't reinvent idempotency; claim the lineage and the new agent-executes axis.
- **The execute-a-spec premise is the hottest paradigm of 2025–26** (SDD). We're aligned with the winning direction; a near-twin exists; our moat is *installation* (vs. codegen), *multi-bundle + dependency graph* (vs. monolithic methodology), *a builder* (vs. methodology-only), and *recipe/receipt lifecycle* (vs. single living spec).
- **The core app architecture is textbook** (hexagonal). Doc 13 needs no change; adopt the naming + import-lint discipline the literature stresses.
- **A package-manager-for-skills cluster is forming** and partly shares our language ("Thin MCP, Fat Agent"; skills-as-"recipes"). We are one level up and largely *compose* it: we install capabilities (not files), run a full reversible lifecycle (not just install), and ship a builder (not a registry). White space is real; the overlap to watch is FastSkill drifting toward stateful, lifecycle-managed installs.

**Inspiration to fold back into the docs (candidates, not yet applied):**
- `00` lineage table could gain a row pair: *Ansible idempotent module → DETECT step* and *Spec-Driven Development → ship-a-spec-the-agent-executes*, positioning us in both lineages.
- A short "Prior art & positioning" section somewhere (maybe `00` or a new `14`) stating the four-way differentiation against the SDD near-twin and the skill-PM cluster, so the novelty is on the record.
- Consider a **lockfile** for vendored discipline-skills/loop-runners (borrow FastSkill), making "pin the version" concrete and reproducible.
- Target **`/plugin marketplace`** as the documented install path for vendored runners (the native channel the cluster uses).
