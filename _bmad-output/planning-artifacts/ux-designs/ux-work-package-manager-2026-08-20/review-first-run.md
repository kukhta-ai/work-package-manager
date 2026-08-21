# First-Run Journey Review — WPM Authoring Onboarding

## Verdict

**Needs revision before story acceptance, but the proposed direction is sound.** Epic 2 correctly replaces ambient detection with explicit Codex/Claude Code choice and reduces personal scope to one bootstrap skill. The remaining UX gap is the transition between “WPM is installed” and “the newly installed personal skill is usable”: a skill copied during a running agent session may not enter that session's catalog, while the current flow supplies no decisive reload-and-resume moment.

The shortest coherent journey is one explicit setup interaction, followed by one workspace-creation interaction and one fresh-workspace handoff. Adapter inspection, reconciliation, and migration may remain separate implementation boundaries, but they must not become extra mandatory steps in the happy path.

The final climax is not “files were scaffolded.” It is: **a fresh agent rooted in the workspace verifies that its native front door, workspace skills, receipt, and complete authoring backlog agree, then names or claims the next required task.** Epic 4's deterministic core-and-template task work is therefore part of the journey's readiness proof, even though it is not Epic 2 scope.

## Current Reality

- The package exposes `wpm` and `installer` and includes `agent-skills`, `templates`, and `docs`; runtime resource roots are resolved relative to the installed CLI (`package.json:18-27`, `src/cli.ts:3679-3688`). This supports a repository-independent local-package journey.

- The only current personal setup action is `wpm skill install`. It has no adapter-selection or confirmation option and describes itself as copying `installer-builder` into detected scopes (`src/cli.ts:3352-3385`).

- Detection is config-directory presence. The current operation scans Codex, Claude Code, Hermes, and OpenClaw and writes every detected destination (`src/core/services/agent-aliases.ts:47-68`, `src/core/operations/install-authoring-skill.ts:93-115,184-209`). Detection is therefore consent today.

- A rerun reports only `installed` or `updated` and copies over an existing tree; there is no `unchanged` or ownership-conflict result (`src/core/operations/install-authoring-skill.ts:54-64,195-211`).

- The installed personal skill is the full monolithic authoring workflow. It scaffolds, authors bundles, works the backlog, and builds in one surface (`agent-skills/installer-builder/SKILL.md:48-81`). It does not stop at a fresh-workspace handoff.

- The generated root front door tells a workspace agent to invoke that personal `installer-builder`, install it if missing, and restart (`templates/project/minimal/snippets/authoring-front-door.md.tmpl:22-35`). No workspace-local WPM authoring family exists yet.

- `wpm init` has no authoring-adapter input (`src/cli.ts:2252-2315`). It always writes both `AGENTS.md` and a `CLAUDE.md` alias (`src/core/operations/init-project.ts:390-403`), regardless of author choice.

- Init writes much of the workspace before it initializes and fills the Backlog.md root (`src/core/operations/init-project.ts:307-424`). A missing or failing Backlog.md prerequisite can therefore leave a partial first-run workspace.

- Init's positive output says the workspace was created and how many tasks were materialised; its only onboarding follow-up is an occasional tip to run `wpm skill install` (`src/core/operations/init-project.ts:448-456`, `src/cli.ts:2318-2328`). There is no prepared-handoff climax or receiving-session verification.

- Current public guidance presents five manual steps and says all detected scopes are written (`README.md:44-76`). The README's install coordinate also disagrees with `package.json`, while the FAQ says the product is not ready (`README.md:24,50-55`, `package.json:2`, `FAQ.md:62-64`). Epic 1 correctly owns making inactive distribution guidance truthful.

## Actor Contract

| Actor | Says or decides | Does not own |
|---|---|---|
| Package author | Describes the package intent; chooses which personal clients and which workspace clients to support; confirms mutations | Native paths, skill copying, state reconciliation, or task backfilling |
| Existing/bootstrap agent | Reads installed-package guidance; invokes WPM setup; explains the plan; invokes `wpm-create-package` when discoverable; creates the workspace; relays the handoff | Inferring consent from detection or claiming a new session accepted work |
| WPM | Enumerates adapters; validates and previews selection; writes only confirmed managed surfaces; reports reload/launch guidance; creates and verifies workspace state and required tasks | Installing or authenticating coding agents, choosing for the user, or owning an agent process |
| Fresh authoring agent | Starts at the workspace root; reads its native front door; invokes `wpm-author`; verifies/reconciles required work; claims or resumes the next task | Reconstructing missing intent from the bootstrap conversation |

## Journey 1 — Maya, Codex Only

**Situation:** Maya has installed the verified local WPM package and already has a Codex session open outside any workspace.

**Maya says:** “Use WPM to create a package for our team setup. Configure Codex only.”

**Existing Codex agent does:**

1. Uses packaged help or getting-started guidance to discover the explicit setup entry point; it does not need a WPM skill yet.
2. Requests the `codex` adapter and shows Maya WPM's proposed personal destination and detected/not-detected annotation.
3. After Maya confirms, reports the result and follows the exact Codex reload/resume instruction.
4. Once `wpm-create-package` is discoverable, elicits the package name and initial intent, checks prerequisites, and invokes workspace creation with Codex as the workspace adapter.
5. Relays the prepared handoff and asks Maya to start a fresh Codex session at the reported workspace root.

**WPM does:**

1. Changes only `~/.agents/skills/wpm-create-package` plus WPM-owned personal setup state; `.claude` remains untouched even if detected.
2. Records Codex as a reusable default without changing deliverable targets.
3. Creates `.agents/skills/wpm-*`, `AGENTS.md`, managed authoring state, one authoring backlog, and a Codex-specific prepared receipt outside `wip/`.
4. Reports the exact root, first skill, verification action, and recovery path.

**Climax:** A fresh Codex session starts at the reported root, reads `AGENTS.md`, invokes `wpm-author`, verifies that the complete managed task set is present, and identifies the next task.

**Required failure paths:**

- `~/.agents` is absent: explicit Codex choice remains valid; WPM explains that it configures the skill scope but does not install Codex.
- The skill was copied but the running Codex session cannot discover it: completion output says whether a restart/new session is required and gives the exact resume prompt.
- Backlog.md is absent: workspace creation fails before scaffolding and reports the prerequisite, rather than leaving a partial workspace.
- The target path already exists: Maya receives a choose-another-path or adopt-existing-workspace recovery, never an overwrite suggestion.

## Journey 2 — Priya, Claude Code Only

**Situation:** Priya has installed the same local package and is speaking to Claude Code outside a WPM workspace.

**Priya says:** “Create a WPM package for our onboarding workflow. Use Claude Code only.”

**Existing Claude agent does:**

1. Discovers setup from installed-package guidance and explicitly requests `claude-code`.
2. Explains that detection is informational, shows `~/.claude/skills/wpm-create-package` as the destination, and obtains Priya's confirmation.
3. Applies the returned reload guidance. It does not assume that live reload found a newly created top-level skill directory.
4. Invokes the bootstrap skill, creates the workspace for Claude Code, and relays the handoff rather than continuing authoring from the bootstrap context.

**WPM does:**

1. Leaves `~/.agents` untouched and reports the Claude-specific personal result.
2. Creates `.claude/skills/wpm-*` and a concise `CLAUDE.md` workspace front door while preserving any user-owned content at an adoption/reconciliation boundary.
3. Emits Claude's launch and reload guidance in both human-readable output and the prepared receipt.

**Climax:** A fresh Claude Code session starts at the workspace root, reads `CLAUDE.md`, verifies the workspace, and claims the first required authoring task without needing Priya to repeat the bootstrap conversation.

**Required failure paths:**

- `~/.claude` is absent: the explicit supported selection is accepted, with a clear “Claude Code itself was not installed” boundary.
- `CLAUDE.md` already contains user-authored instructions: predictable ownership conflict is reported before mutation; adoption preserves surrounding content.
- Personal setup succeeds but workspace creation fails: the output distinguishes the usable personal bootstrap from the unprepared workspace and gives a safe retry point.

## Journey 3 — Jonas, Codex and Claude Code

**Situation:** Jonas begins in Codex, has both clients installed, and wants the workspace usable from either client while handing the first authoring session to Claude Code.

**Jonas says:** “Configure WPM for both Codex and Claude Code. Create the workspace for both, then hand authoring to Claude.”

**Existing Codex agent does:**

1. Requests both personal adapters in one setup action and presents one combined confirmation.
2. Uses the retained pair as the proposed workspace set and asks once whether Jonas wants both for this workspace; it does not conflate this choice with deliverable targets.
3. Creates the workspace and relays both native launch hints while foregrounding Claude only because Jonas chose it for this session.

**WPM does:**

1. Installs the same `wpm-create-package` version in both personal destinations and reports each destination separately.
2. Creates both native workspace skill scopes and front doors from one portable skill family.
3. Creates one managed authoring state, one receipt with two adapter entries, and one shared authoring backlog; it does not duplicate tasks per adapter.
4. Does not invent a single “active adapter” or claim it launched Claude Code.

**Climax:** Fresh Claude verifies the shared workspace and claims the next task. A later Codex session can enter the same root, verify the same backlog, and resume without a second handoff protocol.

**Required failure paths:**

- Both clients are detected but only one is selected: only the selected personal and workspace surfaces change.
- One selected personal destination has an ownership conflict: all predictable conflicts are reported before either selected destination changes.
- One native workspace front door is missing or stale: verification reports that adapter's mismatch without declaring the other adapter or the shared backlog invalid.
- Both clients are selected but the task materialiser sees the same required work twice: one stable managed task exists, not one task per adapter.

## Unnecessary First-Run Surfaces and Steps

1. **Do not require adapter inspection as a separate happy-path command.** The registry/report is valuable for help, automation, and recovery, but setup should present the same facts in context.

2. **Do not require both a generic setup command and a second skill-install command.** One canonical explicit setup interaction should select, confirm, install/reconcile `wpm-create-package`, retain defaults, and report the next action. A legacy `wpm skill install` may remain a compatibility route, not another user decision.

3. **Do not ask the user for native paths.** The user chooses Codex, Claude Code, or both; adapters own the destinations.

4. **Do not ask the same adapter question twice without context.** Personal selection answers where the reusable bootstrap lives. Workspace selection answers which native surfaces this project carries. Workspace creation should offer retained personal choices as defaults and make an override explicit.

5. **Do not require the user to read a receipt file manually.** The receipt is durable machine state; the CLI and bootstrap agent should summarize its actionable fields.

6. **Do not add an “accepted handoff” or universal launch surface.** “Prepared” plus a fresh agent's local readiness verification is sufficient and truthful.

7. **Do not place the full workspace authoring family in personal scope.** That would make package-specific, version-sensitive guidance global and recreate the monolithic-skill problem.

## Missing Climax and Failure Coverage

### Critical

- **Cold-start instruction loop.** `wpm-create-package` cannot teach an already-running unskilled agent how to install itself. Installed-package help must expose the one setup entry point and enough adapter vocabulary for that agent to act without repository context.

- **Personal setup completion.** Success must say which clients were configured, where the bootstrap landed, whether it is discoverable in the current session, the exact reload/restart action, and the prompt/action that resumes package creation.

- **Fresh-workspace completion.** A scaffold summary or sender-issued receipt is not the climax. A fresh native session must verify the root and complete authoring work before readiness is claimed.

- **Task completeness join.** The current init path creates code-owned tasks by title (`src/core/operations/init-project.ts:415-424`), while FR30-FR37 add template tasks and stable reconciliation (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:80-94`). Epic 4's final cold journey must extend the handoff test and prove every mandatory, project-template, pre-included-bundle, created/enabled-bundle, and bundle-template task appears exactly once.

### High

- **Prerequisite preflight.** Backlog.md availability and predictable task-plan failures must be known before init writes a workspace. Current ordering permits a late failure after files and front doors exist.

- **Reload differences.** Codex and Claude Code cannot receive one vague “restart if missing” line. Each selected adapter needs an explicit discoverability result and recovery action.

- **Multi-destination failure.** Selection must be fully planned before writes so a predictable conflict in one destination cannot silently leave the other configured.

- **Workspace recovery.** Existing target, legacy workspace, user-owned front door, wrong cwd, missing backlog, and stale skill version each need a distinct recovery path; “run init again” is not sufficient because current init refuses existing targets (`src/core/operations/init-project.ts:294-300`).

### Medium

- **Terminology during first run.** “Personal adapter,” “workspace adapter,” and “deliverable target” are accurate internal distinctions but too similar as prompts. User-facing copy should ask, respectively, “Which agents should know how to create WPM packages on this machine?”, “Which agents should be able to author this workspace?”, and later “Which agents should run the package?”

- **Conflicting readiness copy.** README, FAQ, package metadata, skill name, CLI help, and generated front door currently describe different availability and handoff states. Epic 1 and FR46 must make the locally installed journey internally consistent without claiming public distribution.

## Validation Decision

Epic 2's FR3-FR16 are sufficient if their stories preserve one continuous setup experience rather than exposing implementation seams as required steps. Strengthen acceptance around the cold-start entry, adapter-specific skill discoverability, setup completion output, and prerequisite failure before workspace writes.

Epic 3 should own the prepared receipt and local verification, while Epic 4 completes the decisive authoring-readiness climax by reconciling the full required task set. The journey should not be signed off end to end until a fresh Codex-only, Claude-only, and combined-client session can verify that state and claim real work.
