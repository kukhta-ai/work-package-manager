# wpm — Roadmap

**wpm** (*work package manager*) is a way to distribute capabilities to people whose environments
you cannot see. Instead of shipping finished software or a brittle setup script, you ship a
self-contained **package of backlog bundles** — structured instructions paired with acceptance
criteria — and the recipient's own AI agent executes them to install, verify, update, and remove
the capability in their environment.

Today wpm is the **builder**: the authoring-and-packaging tool a maintainer uses to produce that
package (the `rpmbuild`/`electron-builder` slot, not the `npm` slot). The arc of this roadmap is to
grow it into the full work package manager the name promises — author → build → publish → discover →
install — by adding the distribution and ecosystem layers on top of a stable builder and install
contract.

> This is a living document. It commits to **sequence and themes, not dates**. The granular near-term
> plan lives in the foundational backlog (`FOUNDATION.md` and `backlog/`); this document is the
> altitude above it. Milestones ship when they're ready, and later items will shift as earlier ones
> teach us things.

---

## Where we are today

The design phase is complete; implementation has not yet begun. What exists:

- [x] **The design specification** — the document set `docs/00`–`docs/14`: the model, the three roles,
  the agent protocols, the project skeleton, the install contract, versioning/migrations, the
  installation process, and the builder's own architecture.
- [x] **The foundational backlog** — 33 dependency-ordered tasks (`FOUNDATION.md`) that turn the
  architecture in `13` into running code, built bottom-up along a hexagonal core.
- [x] **The development process** — an autonomous, BMAD-based SDLC (`AGENTS.md`, `docs/SDLC.md`):
  persistent specialist subagents, sequential branching, gated handoff, with Backlog.md driven only
  through its CLI and the committed docs steering every workflow.
- [ ] **Any builder code.** The next milestone is the first line of it.

---

## 0.1 — Foundation

*Status: next up. The 33-task foundational backlog.*

Stand up the builder's skeleton: a runnable, tested, CI-backed TypeScript-ESM package whose internals
follow `13`'s ports-and-adapters design.

- [ ] The pure domain **model** (branded types) and the four **ports** (file system, Backlog.md, clock,
  environment), each with a real and a fake adapter.
- [ ] The **services** tier — template rendering, resolution, version-constraint resolution,
  derived-artefacts, validation, authoring-task materialisation, and content integrity.
- [ ] The **operations** tier and the shared mutation lifecycle, the typed error model, and context
  resolution — the framework every command will plug into.
- [ ] The **CLI composition root** (dependency injection, error-to-exit-code mapping), `--help`
  contract, and tab-completion plumbing.
- [ ] The **minimal project** and **default bundle** templates, and the builder's own agent skill.
- [ ] A **walking skeleton**: one vertical slice through every layer, proving the architecture composes
  end to end. This is the *"foundation complete"* checkpoint.

Outcome: wpm can be built, tested, and run, and its layers are proven — but it has no end-user-facing
commands yet beyond the skeleton slice.

---

## 0.2 — Authoring

*Status: planned. Make wpm usable by a maintainer.*

Build out the command surface from `10` so a maintainer can author a bundle-project end to end, each
command standing up its operation on the 0.1 lifecycle.

- [ ] **Project commands** — `wpm init`, and `wpm project` (release metadata, target agents, validate).
- [ ] **Bundle commands** — `wpm bundle new`, `bundle list`, and the per-bundle authoring operations
  (payload, requires, confirmation level, files).
- [ ] **Build commands** — `wpm build dry-run` and `build package`, including frozen-lockfile
  verification of vendored content.
- [ ] The **idempotent authoring backlog** (`11`) — title-based, re-runnable — so authoring is itself a
  guided, resumable process rather than a one-shot.
- [ ] **Rename pass**: adopt `wpm` as the binary and project name across the docs and templates (they
  currently read `wpm`, predating the name).

Outcome: a maintainer can produce a complete, valid, self-contained package.

---

## 0.3 — Full lifecycle and author confidence

*Status: planned. Prove the whole install contract, not just authoring.*

- [ ] **The complete template set** beyond minimal/default (`06`): single-bundle, multi-bundle,
  with-payload-skill, and adopts-an-existing-tool.
- [ ] **Rehearsal and review** (`11`): the maintainer's agent role-plays the end-user install to feel
  the experience, plus the review-phase checks (simulate executor, simulate upgrade, step-slug
  uniqueness, Definition-of-Done compliance).
- [ ] **End-user execution maturity** (`09`): the looping reasoning-agent install — vendored discipline
  skills and a vendored loop realisation — working smoothly on a bare agent and on each target.
- [ ] **Update, repair, and uninstall proven** (`08`): a real version bump exercised through
  recipe-vs-receipt, migration tasks, drift repair, and inverse-op uninstall.
- [ ] **A shipping worked example** — the `hermes-handoff` package (core / web-handoff / doc-handoff)
  as both a reference and an end-to-end demonstrator.

Outcome: the full install/update/repair/uninstall lifecycle works on a real, non-trivial package.

---

## 0.x → 1.0 — Production-ready

*Status: planned. Stabilize the contract and the surface.*

- [ ] **Integrity floor solid** (`08`): `wpm.lock` (version + content hash) verified at build and
  surfaced in the end user's plan-preview, so consent is informed.
- [ ] **Documentation**: a getting-started path, an authoring guide, and the conceptual docs rendered as
  a browsable site.
- [ ] **Stability commitment**: the CLI surface (`10`) and the install contract (`07`) declared stable;
  semantic-versioning guarantees for wpm and for the bundle format begin here.
- [ ] **Hardening**: error messages, edge cases, and cross-platform behaviour (POSIX/Windows alias
  handling and the like) shaken out across real use.

Outcome: 1.0 — a maintainer can depend on the format and the tool.

---

## Beyond 1.0 — The work package manager

*Status: exploratory. The distribution and ecosystem layers that complete the name.*

This is where the "package manager" in wpm fully lands. The closest precedents are the
**registries of installers** — winget's manifest repository, Chocolatey, Scoop buckets, and Homebrew
taps — not library registries; each entry is a self-contained installer, discovered and fetched by name.

- [ ] **Distribution** — `wpm build publish <destination>` wired to real targets (a git remote, an
  object store, a registry URL).
- [ ] **A registry** — discovery, fetch-by-name-and-version, and namespacing, so a user's agent can
  "get the *X* package and run it" rather than being handed a repo or archive. The integrity substrate
  (lockfile, content hashing) and the publish path are designed for exactly this.
- [ ] **Supply-chain hardening (SLSA progression)** — building on the integrity floor: signing of
  published packages, then signed provenance/attestation, then reproducible builds. Each is opt-in
  hardening on top of the previous, mirroring how the supply-chain frameworks tier their levels.
- [ ] **More target agents** (`05`) — broaden the supported set as the ecosystem grows.
- [ ] **A richer vendored-discipline ecosystem** — more SDLC frameworks and loop realisations vendorable
  off-the-shelf, since the system is workflow-agnostic by design.
- [ ] **A faster reference implementation** — a compiled-language port for speed and single-binary
  distribution, made viable by the spec living in the docs rather than the code.

---

## Non-goals

What wpm deliberately will **not** become — these boundaries are load-bearing, not provisional:

- **The builder never executes; a package may carry its executor.** The wpm *tool* authors and
  packages instructions and never runs an install itself or reaches onto the target machine (thin
  builder, fat agent) — execution is always the user's agent. A *package*, however, may legitimately
  bundle or declare a dependency on a concrete execution-agent harness and ship them together, the same
  way it vendors loop realisations and declares its target agents. The invariant is about the builder,
  not about what a package is allowed to deliver.
- **Not tied to one SDLC.** The discipline an install runs under is *vendored content*, never core.
  Nothing in wpm's core models or depends on a particular workflow framework.
- **Not the author of discipline or loop tooling.** wpm *vendors* real third-party discipline skills
  and loop realisations (pinned and integrity-checked); it does not reinvent them.
- **No resident daemon — state lives on disk, exactly as in npm.** wpm runs no persistent background
  process managing a global view of installs. This is not a departure from package managers: npm has no
  daemon either — it is a per-invocation CLI whose state is on disk (`package-lock.json`, `node_modules`,
  its cache), reconciled each run. wpm's per-install **receipt** plays the same role — the on-disk state
  an agent reads and reconciles on the next run. (A registry would add *distribution*, still not a
  resident manager.)
- **One implementation at a time, not many language bindings.** wpm won't fragment into parallel
  bindings across many languages. But TypeScript being the reference implementation is a *current* state,
  not a permanent one: because the document set — not the code — is the language-neutral specification, a
  single **faster reimplementation** (in a compiled language, for speed and single-binary distribution)
  is an open future direction rather than something foreclosed.
- **Not a task-management tool of its own.** wpm builds on an existing, agent-suitable backlog system
  rather than reimplementing task management — Backlog.md today, though the design isn't wedded to it: a
  different backlog better suited to agent-driven execution could serve the same role behind the same
  boundary.

---

## Influencing the roadmap

The near-term, task-level plan is the foundational backlog (`FOUNDATION.md`); this roadmap is the
overview above it. Priorities and sequence are open to discussion — proposals, use cases, and target
environments that would reshuffle the order are welcome through the project's issues and discussions.
The fixed points are the project's goals, the user problems it solves, and its model and style
(`docs/00`); much of the architecture and the concrete detail below that line will rightly evolve as
real implementation teaches us where the design was a draft.
