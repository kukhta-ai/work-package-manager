# Investigation: Agent-driven onboarding flow

## Hand-off Brief

1. **What happened.** The user identified a two-agent onboarding requirement: a bootstrap agent must install/configure `wpm` and create a workspace, then an authoring agent rooted in that workspace must reliably take over.
2. **Where the case stands.** Outcome 4 is complete on `feature/authoring-agent-onboarding`: the source/caller trace confirms the adapter, provenance, Backlog reconciliation, lifecycle preflight, clone bootstrap, and prepared-handoff boundaries needed by the backlog.
3. **What's needed next.** Pause at the Outcome-4 gate. Deterministic template task packs are explicitly in scope and template-provided custom authoring skills are deferred; the only product-level blocker still open is the public distribution identity.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-08-20 |
| Status           | Outcome 4 complete — source boundaries traced; task packs in scope and template-provided skills deferred |
| System           | Linux 6.8.0-100-generic aarch64; branch `feature/authoring-agent-onboarding`; baseline `dev@24d4ed8cea92` |
| Evidence sources | User scope statement, existing onboarding investigation, README/design docs, templates, packaged authoring skill, CLI/source/tests, npm registry probes, version control |

## Problem Statement

User-reported scope, captured verbatim:

> "yeah, so since all of it the user will do with its agent we need to put instructions on both levels - for agent on wpm installation for it to know how to create a new package and that to author it an agent in the project directory needs to be spawned, and on the level of this spawned authoring agent in the directory. this both can be done with skills for the wpm and by mentions in agents.md and similar files. seems like we need to work on the project onboarding flow more on new feature branch, investigate the scope"

The product question is what deterministic, cross-agent onboarding contract should connect:

1. the user's existing/bootstrap agent, which obtains `wpm`, installs its skill, and scaffolds a package workspace;
2. a fresh authoring-agent session whose working root is that workspace and which consumes the project-local front door plus `.authoring-backlog/`.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `README.md` onboarding | Available | Describes install, skill install, init, and a manual "point your agent" step. |
| `agent-skills/installer-builder/` | Available | Personal authoring skill already teaches scaffold and authoring workflow. |
| Project-template authoring front door | Available | Produces workspace-root `AGENTS.md` plus `CLAUDE.md` alias. |
| `wpm skill install` implementation | Available | Copies the packaged skill into detected personal scopes; does not touch a workspace. |
| `wpm init` implementation | Available | Creates workspace/front door/backlog and prints a skill-install tip; does not launch an agent. |
| Public npm bootstrap | Missing | Documented package is unpublished; manifest package name is occupied by unrelated npm content. |
| Cross-agent session handoff contract | Partial | Human instruction exists; no explicit machine-observable handoff/receipt yet identified. |
| Agent-specific spawning APIs | Partial | Tool-specific and not owned by current SDLC-agnostic core. |
| BMAD installer at `67d876f1` | Available | Explicit multi-tool selection, headless `--tools`, config-driven project skill paths, shared-target de-duplication, and the `bmad-*` namespace. |
| Backlog.md at `6286bf97` | Available | Init selects CLI/MCP/none, maps clients to native instruction files, writes version-marked idempotent nudges, and exposes detailed workflow knowledge through `backlog instructions`. |
| Official Codex skill documentation | Available | Repository skills: `.agents/skills`; personal skills: `~/.agents/skills`; skill names/descriptions drive progressive disclosure. |
| Official Claude Code skill documentation | Available | Project skills: `.claude/skills`; personal skills: `~/.claude/skills`; project and user sources are discovered separately. |
| Installed Backlog.md CLI `1.45.2` help | Available | Create/edit accept labels and task detail has a plain view; task-list help exposes no JSON or label-rich listing, so current reconciliation cannot obtain managed identity from one list call. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Map the bootstrap-agent entry points before `wpm` or its skill is installed | High | Complete | Public package identity is unresolved; no skill can be assumed before bootstrap. |
| 2 | Trace `wpm skill install` → session restart → `wpm init` → workspace entry | High | Complete | Current flow is personal-skill copy followed by a human-only workspace handoff. |
| 3 | Audit the personal `installer-builder` skill for explicit fresh-session delegation | High | Complete | It teaches the full authoring arc but does not own an agent-specific handoff receipt or workspace-local installation. |
| 4 | Audit generated `AGENTS.md`/aliases for deterministic authoring-agent startup and resume | High | Complete | It orients correctly and names the backlog, but depends on a personal `installer-builder` skill and has no acceptance/status command. |
| 5 | Separate cross-agent portable requirements from Claude/Codex/Hermes/OpenClaw launch mechanics | High | Complete | Portable workflow and tool-specific discovery/launch are separable behind an adapter registry. |
| 6 | Define evidence and tests for the two-stage handoff | Medium | Complete | Cold journeys now cover Codex, Claude Code, multiple selected clients, headless operation, legacy migration, and handoff verification. |
| 7 | Resolve npm package naming/publication prerequisite | High | Confirmed blocker | `work-package-manager` is unpublished; `wpm` is occupied by an unrelated package. |
| 8 | Produce bounded feature slices and affected-file inventory | High | Complete | Outcome 3 identifies six slices and backlog-safe behavioral seams; task creation remains outside this investigation. |
| 9 | Decide whether templates may add non-core workspace authoring skills in this feature | Medium | Complete | User selected Option A: deterministic task packs are in scope; template-provided custom authoring skills are deferred. |
| 10 | Verify current Hermes/OpenClaw primary contracts | Low | Deferred | Preserve the existing identifiers without promising first-release onboarding coverage; Codex and Claude Code are P0. |
| 11 | Trace template provenance and task reconciliation through model, ports, operations, and adapters | High | Complete | Provenance is not persisted and title-only Backlog summaries cannot reconcile managed task identity. |
| 12 | Trace fresh-clone authoring recovery | High | Complete | Context deliberately survives an absent gitignored backlog, but no operation reconstructs it from project/template state. |
| 13 | Correct handoff state semantics | High | Complete | Init/receipt can establish `prepared`; only a receiver-side acknowledgement could establish `accepted`, which is deferred with orchestration. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-08-20 | User defined the two-level agent onboarding requirement. | User message | Confirmed |
| 2026-08-20 | Created `feature/authoring-agent-onboarding` from `dev@24d4ed8cea92`. | Git | Confirmed |
| 2026-08-20 | Prior investigation established that `wpm` does not launch agents and installs `installer-builder` only into personal scope. | `authoring-agent-backlog-materialisation-investigation.md` | Confirmed |
| 2026-08-20 | Sampled BMAD main at `67d876f1`: install explicitly selects one or more tools and generates project-local, `bmad-*` skills into each tool's configured target. | BMAD official repository | Confirmed |
| 2026-08-20 | Sampled Backlog.md main at `6286bf97`: init explicitly selects integration mode/tool surfaces, uses marked idempotent front-door blocks, and keeps detailed guidance behind a versioned CLI instruction command. | Backlog.md official repository | Confirmed |
| 2026-08-20 | Verified Codex and Claude Code personal/project skill discovery paths from their official documentation. | OpenAI and Anthropic documentation | Confirmed |
| 2026-06-01 | Foundation commits introduced the descriptor schema and title-idempotent task materialiser before the authoring-workspace handoff existed. | Commits `227d6e3`, `0dad89d`, `321dd31`, `0462740` | Confirmed |
| 2026-08-20 | Epic 2 added the authoring command surface and operation-owned task catalogs; Epic 3 then added the personal `installer-builder` and workspace front door as separate surfaces. | Commits `ed036a1`, `24d4ed8` | Confirmed |
| 2026-08-20 | Outcome 3 traced the resulting boundary: neither template data nor selected authoring-client state reaches the operations that materialise work, so an agent cannot make missing task creation deterministic through prose alone. | `src/core/services/schema/template.ts:20-102`, `src/core/operations/init-project.ts:132-188`, `src/core/operations/create-bundle.ts:134-223` | Deduced |
| 2026-08-20 | User selected Option A: deterministic template task packs remain in the feature; template-provided custom authoring skills are deferred. | User direction | Confirmed |
| 2026-08-20 | Outcome 4 traced the CLI → operation → lifecycle → materialiser → Backlog adapter chain and the direct init path, then tested six red-team concerns against source. | Source paths recorded below | Confirmed |

## Confirmed Findings

### Finding 1: Two existing instruction surfaces do not yet form a complete handoff

**Evidence:** `README.md:50-76`, `agent-skills/installer-builder/SKILL.md:48-68`, `templates/project/minimal/snippets/authoring-front-door.md.tmpl:22-40`

**Detail:** The personal skill teaches how to scaffold and author; the generated front door tells a workspace-root agent how to work. The README leaves the transition as "point [the agent] at the workspace," and no current `wpm` command launches or verifies a fresh workspace-root session.

### Finding 2: WPM installs by ambient detection, not by an explicit authoring-agent choice

**Evidence:** `src/core/operations/install-authoring-skill.ts:92-211`, `src/core/services/agent-aliases.ts:46-78`, `src/cli.ts:3351-3387`

**Detail:** `wpm skill install` treats the presence of a supported agent's top-level config directory as selection, then copies the same `installer-builder` tree into every detected personal scope. It has no `--agent`/`--agents`, `--list-agents`, workspace scope, managed install record, or non-interactive selection contract. Detection is useful as a default suggestion, but it cannot represent intent on a machine with several agents.

### Finding 3: Agent skill placement is a data problem; the authoring workflow need not fork

**Evidence:** OpenAI “Build skills” documentation; Anthropic “Extend Claude with skills”; BMAD `tools/installer/ide/platform-codes.yaml`

**Detail:** Codex uses `.agents/skills` in a repository and `~/.agents/skills` personally. Claude Code uses `.claude/skills` in a project and `~/.claude/skills` personally. Both consume the same open `SKILL.md` shape, while discovery paths, front-door names, optional metadata, and reload/launch advice differ. A config-driven adapter can own those differences without duplicating authoring semantics.

### Finding 4: BMAD's reusable pattern is explicit selection plus a generated, prefixed project skill family

**Evidence:** BMAD official repository at `67d876f1`, especially `docs/how-to/install-bmad.md`, `docs/reference/commands.md`, `tools/installer/ide/platform-codes.yaml`, and `tools/installer/ui.js:592-802`

**Detail:** BMAD supports interactive multi-selection, requires `--tools` for a fresh headless install, validates IDs, persists/reuses configured tools on update, maps each tool to a target directory, de-duplicates shared targets, and generates separately triggered skills under the `bmad-*` namespace. The useful precedent is the adapter/selection/ownership model, not BMAD's particular workflow taxonomy.

### Finding 5: Backlog.md's reusable pattern is a short native front door backed by versioned, on-demand knowledge

**Evidence:** Backlog.md official repository at `6286bf97`, especially `src/cli.ts:860-908,1230-1468`, `src/agent-instructions.ts`, and `src/guidelines/cli-agent-nudge.md`

**Detail:** Backlog init lets the user choose CLI/MCP/none and the exact instruction files or MCP clients. It updates only a version-marked managed block, preserves surrounding user content, reports created/updated/unchanged files, and tells the agent to fetch the detailed current workflow with `backlog instructions ...`. This is a strong model for keeping `AGENTS.md`/`CLAUDE.md` concise and update-safe.

### Finding 6: The existing personal skill contains several independently triggered jobs

**Evidence:** `agent-skills/installer-builder/SKILL.md` and its six references (576 lines total)

**Detail:** Bootstrap/scaffolding, project and bundle structure, install-recipe authoring, native skill/front-door authoring, quality review, and release/build guidance currently live behind one trigger. That makes a personal skill carry project-version-sensitive knowledge everywhere and prevents a template from installing only or extending the authoring capabilities relevant inside its workspace.

### Finding 7: Templates cannot currently customize authoring tasks or authoring skills

**Evidence:** `templates/project/minimal/template.yml`, `templates/bundle/default/template.yml`, `src/core/services/schema/template.ts`, `src/core/operations/init-project.ts:130-188`, `src/core/operations/create-bundle.ts:131-230`

**Detail:** A template descriptor has identity, scope, description, and parameters only. The eight project tasks and eleven/twelve per-bundle tasks are hard-coded in operations; no template field contributes task specs or workspace-local authoring skills. Any future customization must remain declarative and idempotent rather than letting templates execute code.

### Finding 8: The advertised clean-machine bootstrap is not publishable yet

**Evidence:** `README.md:50-55`, local `package.json`, npm registry probes on 2026-08-20

**Detail:** `work-package-manager` returns npm E404, while `wpm@0.1.0` is an unrelated package. Until package identity/publication is decided, neither a human nor a bootstrap agent can reliably follow the documented global install command.

### Finding 9: Current idempotency identifies authoring tasks only by mutable display title

**Evidence:** `src/core/services/materialisation.ts:20-62`, `src/core/operations/init-project.ts:132-188,417-424`, `src/core/operations/create-bundle.ts:134-223,375-377`

**Detail:** The materialiser builds an `existingTitles` set, skips a spec whose title already exists, and adds each newly created title to that set. This works for WPM's closed catalogs, but a third-party template task with the same title would be silently treated as already satisfied even though it has a different origin or acceptance contract.

### Finding 10: Authoring clients and a package's executor targets are separate selections

**Evidence:** `docs/10-authoring-cli.md:69,140,148,187-191`, `src/core/model/manifest.ts:33-43`, `src/core/services/agent-aliases.ts:6-20,47-67`

**Detail:** `manifest.yml.targets` names the agents the built installer supports and drives aliases inside the deliverable. The machine-level personal-skill operation is explicitly project-independent. Reusing `manifest.targets` for authoring integration would therefore change shipped executor behavior merely because an author chose a local authoring client.

### Finding 11: Template selection is resolved transiently but not persisted as authoring provenance

**Evidence:** `src/core/model/template.ts:38-50`, `src/core/services/template-resolver.ts:128-155`, `src/core/operations/create-bundle.ts:290-335`, `src/cli.ts:2042-2092`, `src/core/operations/derive-artefacts-capability.ts:27-35,78-95`

**Detail:** The model carries rendered template content but no pinned origin/revision. Bundle creation can clone the current default scaffold, template replacement removes/copies directories, and later derivation defaults back to the `minimal` project template. A created project/bundle therefore cannot prove which task-pack revision produced its authoring work after the template or WPM installation changes.

### Finding 12: The Backlog boundary cannot currently observe a stable managed task identity

**Evidence:** `src/core/model/operation.ts:3-14`, `src/core/ports/backlog.ts:32-90,103-146`, `src/core/services/materialisation.ts:28-65`, `src/adapters/backlog-cli.ts:60-92`

**Detail:** `AuthoringTaskSpec` has title and acceptance criteria; `TaskSummary` has id/title/status; the materialiser compares titles and calls create. Although task creation can carry labels, neither the summary nor the current adapter/materialiser exposes an origin key or contract revision for reconciliation, and no path updates a managed task safely.

### Finding 13: Fresh-clone recognition deliberately does not require the authoring backlog, but recovery is absent

**Evidence:** `src/core/services/context.ts:18-28,42-45`, `docs/11-authoring-process.md:26-32,141-143,219-227`, `src/core/operations/init-project.ts:294-300`, `src/core/operations/lifecycle.ts:274-312`

**Detail:** Workspace context keys on `wip/manifest.yml` specifically because `.authoring-backlog/` is gitignored and absent after a clone. Init refuses an existing target and lifecycle materialises tasks only while another structural mutation is already running. There is no idempotent operation that initializes/reconstructs a missing per-author backlog from persisted workspace/template state.

### Finding 14: Current lifecycle order cannot promise rollback after a late task failure

**Evidence:** `src/core/operations/lifecycle.ts:113-127,263-312`, `src/core/operations/init-project.ts:281-424`

**Detail:** Mutation checks run before apply, but structural apply and derived-artifact writes precede task materialisation. Init likewise writes the workspace tree before Backlog initialization/materialisation. Task-pack schema/key/contract validation can and should move before the first write; arbitrary filesystem or subprocess failure after apply cannot be made atomic without a broader transaction mechanism.

### Finding 15: A sender-issued handoff receipt can prove readiness, not receiver acceptance

**Evidence:** `README.md:50-76`, `templates/project/minimal/snippets/authoring-front-door.md.tmpl:24-31`, `src/core/operations/init-project.ts:390-424`, `src/core/operations/install-authoring-skill.ts:169-211`

**Detail:** Current init can write a front door/backlog and setup can write a personal skill, but no receiving session acknowledges a receipt. A generated record can establish that native surfaces and next-step instructions were prepared. Calling it `accepted` would require an explicit receiver-side action and does not follow merely from printing launch guidance.

### Finding 16: Installed Backlog.md can store a managed label but cannot list it in one current summary call

**Evidence:** `backlog 1.45.2` command help observed on 2026-08-20: `task create` supports `--labels`, `task edit` supports add/remove-label, `task view --plain` exists, and `task list --help` exposes status/assignee/milestone/parent/priority/sort/plain but no JSON or label-rich output.

**Detail:** A label-based task key is feasible through the existing external CLI, but the real adapter would need list-then-detail reads (and parsing) or a separate managed mapping. That choice remains architectural; the backlog outcome should require observable stable identity without prescribing the encoding.

## Deduced Conclusions

### Deduction 1: Onboarding is a handoff protocol, not only more prose

**Based on:** Finding 1 and the user's two-agent scope.

**Reasoning:** Both endpoints already contain substantial instructions. The unowned boundary is the transition: installation/discovery, session restart, workspace creation, fresh agent start, and proof that the new session adopted the correct root and backlog.

**Conclusion:** Scope analysis must define observable handoff states and failure recovery, then assign each instruction to the bootstrap skill, CLI output, or workspace front door.

### Deduction 2: Personal scope should contain only the pre-workspace bootstrap capability

**Based on:** Findings 3, 4, and 6.

**Reasoning:** Deep authoring knowledge is meaningful only inside a generated workspace and must stay aligned with that workspace's WPM/template version. Installing all of it personally creates global trigger noise and version skew.

**Conclusion:** Install one personal bootstrap skill; generate the authoring family into the workspace's selected agent scopes.

### Deduction 3: Agent detection should seed a choice, never silently become the choice

**Based on:** Findings 2, 4, and 5.

**Reasoning:** Several agents may coexist, directory presence can be stale, and automation cannot answer prompts. BMAD and Backlog both expose explicit selections and headless flags.

**Conclusion:** Use a validated adapter registry, interactive multi-select, explicit headless flags, and a list command. Treat detection only as suggested defaults.

### Deduction 4: WPM should own a portable handoff receipt, not a universal agent process launcher

**Based on:** Findings 1 and 3 and the thin-builder/SDLC-agnostic boundary.

**Reasoning:** Starting Codex, Claude Code, an IDE agent, or an in-process subagent has no common lifecycle or credential contract. What is portable is the required workspace root, selected adapter, front door, required skill, first action, and verification state.

**Conclusion:** `wpm` should emit and validate that handoff contract. An adapter may print the native launch command; the bootstrap agent may use its own native delegation capability, but the core should not claim it spawned an agent.

### Deduction 5: Template customization should extend, not replace, WPM's safety-critical authoring core

**Based on:** Finding 7 and the existing deterministic task materializer.

**Reasoning:** Templates need domain-specific authoring tasks and skills, but allowing them to remove the core backlog/review contract would make the generated workspace non-deterministic. Title-only de-duplication is also too weak once third-party template task packs can collide.

**Conclusion:** Add declarative template authoring task extensions with stable keys. Core WPM tasks and the core `wpm-*` skill family remain mandatory and WPM-owned; templates append scoped tasks and cannot execute code. Template-provided skills are a separate, optional scope decision.

### Deduction 6: Required authoring work must be created by the operation that introduces the scope

**Based on:** Findings 7 and 9 plus `docs/10-authoring-cli.md:23-32,189-191`.

**Reasoning:** `init`, `bundle new`/`enable`, target changes, version changes, and skill scaffolding already own incremental task creation. Asking `wpm-author` to notice and repair missing tasks later would make correctness depend on agent memory and on whether that skill happened to run.

**Conclusion:** The user's premise is correct that the backlog must be filled deterministically, but the producer is the CLI operation, not the agent. The agent consumes and completes materialised tasks; it does not reconstruct mandatory work from workspace inspection.

### Deduction 7: Personal setup selection and workspace integration selection need separate state

**Based on:** Findings 2, 3, and 10.

**Reasoning:** Personal selection answers “which installed clients on this machine should discover the bootstrap skill?” Workspace selection answers “which native authoring surfaces should this generated project carry?” A machine may have Codex and Claude Code while a project intentionally supports one authoring surface, and a repository must not inherit accidental machine-local detections.

**Conclusion:** Reuse one adapter registry, but keep personal managed-install state separate from authoring-only workspace state. Interactive init may offer personal selections as defaults; a headless init must receive the workspace selection explicitly.

### Deduction 8: Template task extension needs stable origin identity, not automatic task ownership

**Based on:** Findings 7 and 9.

**Reasoning:** A stable `(template identity, template version, task key, rendered scope)` can prove that the same task specification has already been materialised. It does not prove that WPM may overwrite or delete the resulting Backlog.md task after an author has changed its status, notes, or criteria.

**Conclusion:** Preflight all rendered task specs before mutation; create each origin key at most once; treat same-title/different-origin and same-key/changed-contract cases as visible conflicts. Do not silently edit, archive, or delete an existing authoring task during template reconciliation.

### Deduction 9: The `wpm-` prefix belongs only to builder-owned authoring capabilities

**Based on:** Findings 3, 4, and 6.

**Reasoning:** Prefixing the WPM-maintained family prevents collisions and makes its ownership/upgrade source visible. User payload skills and package-specific installer/advisor skills are delivered product content with different audiences and lifecycles.

**Conclusion:** Reserve `wpm-*` for WPM's personal/workspace authoring family. Template-specific authoring skills, if later allowed, must not occupy that namespace.

### Deduction 10: Stable keys require tracked template provenance outside the gitignored backlog

**Based on:** Findings 11-13.

**Reasoning:** A stable task key identifies a task only within a stable producer namespace. Neither the selected template revision nor the per-author backlog survives all update/clone journeys, so name/title alone cannot reconstruct that namespace.

**Conclusion:** Persist authoring-only project and per-bundle template origin plus an immutable revision/fingerprint in tracked workspace state outside `wip/` and `.authoring-backlog/`. If the source cannot be guaranteed reconstructible, retain enough rendered task-pack data to recreate it. Exact filename and encoding remain architecture choices.

### Deduction 11: Reconciliation is a first-class onboarding operation

**Based on:** Findings 12 and 13.

**Reasoning:** Mutation-time materialisation keeps one existing author's backlog current, but a new clone begins without that backlog by design. Requiring an unrelated structural edit merely to recreate tasks would be unsafe and incomplete.

**Conclusion:** Add an explicit, rerunnable authoring bootstrap/reconcile capability that initializes the per-author backlog when absent and creates missing core plus pinned-template task origins from tracked workspace state. It must never auto-complete work or silently rewrite existing tasks.

### Deduction 12: Preflight guarantees must be precise

**Based on:** Finding 14.

**Reasoning:** Descriptor, rendered task, duplicate-key, provenance, and known Backlog-collision errors are predictable before structural writes. Adapter/process failures after writes are not generally reversible under the current port contracts.

**Conclusion:** Require zero mutation for validation and reconciliation-plan errors; do not promise general atomic rollback. A filesystem/Backlog transaction engine is explicitly outside this feature.

### Deduction 13: Handoff needs a prepared state, not an implied acceptance state

**Based on:** Finding 15 and the no-universal-launch conclusion.

**Reasoning:** The sender controls workspace preparation but not whether a separate agent process launched, loaded instructions, or accepted the work. Native subagent orchestration may provide that observation for one host but is not portable WPM state.

**Conclusion:** This increment emits/verifies a `prepared` handoff: root, selected authoring client(s), native surfaces, first skill/action, reconcile/readiness command, and recovery advice. Durable `accepted` acknowledgement, session identity, and automatic spawning are deferred; the workspace agent still verifies its local root/backlog before working.

## Hypothesized Paths

### Hypothesis 1: Updating only the existing skill and front door is sufficient

**Status:** Refuted

**Theory:** Changing instructional content in `installer-builder` and `AGENTS.md`, without adding modeled selection, workspace delivery, template inputs, or handoff state, may close onboarding.

**Supporting indicators:** Agent spawning is tool-specific, while the current product is SDLC-agnostic and already relies on native front doors and personal skill discovery.

**Would confirm:** Every required handoff state can be expressed and tested without selecting an agent executable or process API, and a fresh session can deterministically resume from workspace-local state.

**Would refute:** Any required state must be produced outside those two prose surfaces, such as an explicit destination choice, generated workspace asset, template-to-materialiser input, or persisted verification record.

**Resolution:** Refuted. The refutation pass searched for an existing path by which front-door prose could select a destination, deliver workspace-local skills, or cause template tasks to reach the materialiser. The front door can only name `installer-builder` (`templates/project/minimal/snippets/authoring-front-door.md.tmpl:24-31`), installation writes every detected personal scope (`src/core/operations/install-authoring-skill.ts:186-205`), and the descriptor cannot carry authoring tasks (`src/core/services/schema/template.ts:20-102`). Prose remains necessary, but it cannot create those states.

### Hypothesis 2: `wpm` should launch the second agent itself

**Status:** Refuted

**Theory:** A new `wpm` command could choose and spawn an authoring agent rooted in the generated workspace.

**Supporting indicators:** It would make the handoff concrete for users.

**Would confirm:** Supported agents expose a stable common launch contract and this responsibility fits the thin-builder/SDLC-agnostic boundary.

**Would refute:** Launch semantics are tool-specific, require policy/credentials/session ownership, or contradict the existing product boundary.

**Resolution:** Refuted as a portable core responsibility. The refutation pass found path mappings but no common executable/session contract in the existing registry (`src/core/services/agent-aliases.ts:6-20,47-78`). Native launch hints/delegation remain adapter- or agent-owned; WPM owns a persisted, observable handoff contract.

### Hypothesis 3: One remembered agent selection can silently drive both setup and init

**Status:** Refuted

**Theory:** The clients selected when installing the personal bootstrap skill can automatically become every new workspace's authoring integrations.

**Supporting indicators:** Reusing one choice would shorten the happy path.

**Would confirm:** Personal client presence and project authoring intent are the same state and cannot diverge.

**Would refute:** A multi-client machine may create a single-client workspace, a team workspace may require clients absent on the creator's machine, or reuse would affect deliverable targets.

**Resolution:** Refuted. Findings 2 and 10 show that ambient machine state, authoring integration, and shipped executor targeting have distinct scopes. Personal choices may seed an interactive default, but cannot silently decide project contents; headless use must be explicit.

### Hypothesis 4: Template customization should be an executable task-creation hook

**Status:** Refuted

**Theory:** A template-owned script/callback can implement arbitrary task creation behavior.

**Supporting indicators:** It would maximize template flexibility.

**Would confirm:** Arbitrary execution is necessary to express project- and bundle-scope tasks and can remain deterministic, inspectable, and safe before mutation.

**Would refute:** Static rendered task specs cover the required behavior and executable hooks introduce unbounded side effects or partial writes.

**Resolution:** Refuted. The requested cases need only event-bound declarative packs: project tasks on init and bundle tasks on new/enable. A hook would bypass the current template-as-data boundary (`src/core/services/schema/template.ts:15-24`) and make preflight/rollback unknowable. Conditional mini-languages are likewise unnecessary in this slice; template choice and mechanical parameter rendering provide the variation boundary.

### Hypothesis 5: Title-based de-duplication remains sufficient when templates add tasks

**Status:** Refuted

**Theory:** Template tasks can use the existing title-idempotent materialiser without additional identity.

**Supporting indicators:** It already prevents duplicate core tasks on command re-entry.

**Would confirm:** Titles are immutable, globally unique identifiers across WPM and every template source.

**Would refute:** Two origins can render the same title or one origin can change its title while retaining the same semantic task.

**Resolution:** Refuted. `src/core/services/materialisation.ts:47-62` proves that equal title currently means “already materialised,” regardless of origin or acceptance criteria. Stable origin keys plus collision reporting are required before third-party specs enter this path.

### Hypothesis 6: The full authoring family should be installed personally

**Status:** Refuted

**Theory:** Installing every `wpm-*` skill into each user's personal agent scope makes authoring available everywhere.

**Supporting indicators:** It avoids copying skills into each workspace.

**Would confirm:** Deep authoring guidance is project-version independent and broad personal triggers do not cause ambiguity.

**Would refute:** Workspace version/template context affects the guidance or only bootstrap is useful before entering a workspace.

**Resolution:** Refuted. The existing monolith combines independently triggered jobs (Finding 6), while the generated workspace is the first point at which its WPM/template version and backlog exist. Only `wpm-create-package` belongs personally; the routed authoring family belongs at workspace scope.

### Hypothesis 7: Template-provided authoring skills are required to solve deterministic backlog filling

**Status:** Refuted

**Theory:** Templates must be able to inject their own skill directories as part of the same feature that adds template task packs.

**Supporting indicators:** A domain-specific template may eventually benefit from domain-specific guidance.

**Would confirm:** A required template task cannot be completed through its acceptance contract plus the core workspace family.

**Would refute:** Deterministic task materialisation and the core routing/authoring skills cover the stated journeys.

**Resolution:** The current requirement is satisfied without arbitrary skill injection: the template declares the missing work and `wpm-author` routes it. Allowing extra skills adds trust, namespace, managed-update, and collision policy and should be a separately approved scope item rather than an implicit part of template task support.

### Hypothesis 8: The operation that introduces scope is the deterministic producer of its authoring tasks

**Status:** Confirmed

**Theory:** Project-template tasks belong in init materialisation, and bundle-template tasks belong in bundle new/enable materialisation, before the authoring agent starts or resumes work.

**Supporting indicators:** The current contract already creates tasks incrementally when scope first becomes known.

**Would confirm:** Those operations possess both the resolved template context and the authoring-backlog materialisation boundary.

**Would refute:** A different guaranteed producer runs before agent work, or the scope-introducing operations lack enough information to render the tasks.

**Resolution:** Confirmed. `docs/10-authoring-cli.md:140,153-154,189-191` explicitly assigns project and bundle task materialisation to init/new/enable, and the implementations already pass their fixed specs into the shared materialiser (`src/core/operations/init-project.ts:417-424`, `src/core/operations/create-bundle.ts:375-377`). The refutation pass found no later guaranteed synchronization step; making the agent backfill tasks would weaken an existing deterministic boundary.

### Hypothesis 9: Adding a stable key to `AuthoringTaskSpec` is sufficient for deterministic reconciliation

**Status:** Refuted

**Theory:** The materialiser can switch from title to a new key without changing template provenance or the Backlog port.

**Supporting indicators:** The current materialiser is small and centrally used.

**Would confirm:** The selected template namespace/revision survives, and existing Backlog tasks expose the new key and contract revision to the materialiser.

**Would refute:** Either producer provenance is lost or the Backlog summary cannot return the key.

**Resolution:** Refuted by both conditions. Template provenance is not persisted (Finding 11), while `TaskSummary` and the real adapter expose no managed key (Finding 12). The feature needs provenance state plus a Backlog reconciliation contract, not merely another model field.

### Hypothesis 10: Mutation-time task materialisation is sufficient after a fresh clone

**Status:** Refuted

**Theory:** Existing init/new/enable flows will naturally recreate the gitignored authoring backlog for a new author.

**Supporting indicators:** Those commands already materialise tasks when authoring scope changes.

**Would confirm:** One of them runs safely and necessarily on an existing cloned workspace before the author needs its backlog.

**Would refute:** Init refuses the existing workspace and other operations assume an initialized backlog or require an unrelated mutation.

**Resolution:** Refuted. `src/core/operations/init-project.ts:294-300` rejects an existing target; `src/core/services/context.ts:42-45` explicitly recognizes clones without the backlog; lifecycle materialisation runs only as beat ⑤ of a mutation (`src/core/operations/lifecycle.ts:274-312`). A dedicated rerunnable reconcile/bootstrap path is required.

### Hypothesis 11: Issuing the handoff receipt proves the new authoring agent accepted it

**Status:** Refuted

**Theory:** Init/setup can mark a handoff successful after writing the workspace surfaces and printing the receipt.

**Supporting indicators:** The written root, front door, skills, and backlog are all observable sender-side facts.

**Would confirm:** A distinct receiving session performs an acknowledgement that WPM observes.

**Would refute:** Only preparation and launch guidance are observed.

**Resolution:** Refuted for this increment. No receiving-session action exists in the current call chain. The backlog may claim `prepared` and locally verifiable readiness, but not `accepted`, fresh-session identity, or successful spawn.

### Hypothesis 12: Deterministic task packs require a general atomic rollback mechanism

**Status:** Refuted

**Theory:** Because task materialisation currently occurs after structural writes, the feature must make every filesystem and Backlog effect transactional.

**Supporting indicators:** Late Backlog failure can leave partial structural state.

**Would confirm:** The scoped correctness outcomes require rollback from arbitrary adapter/process failures.

**Would refute:** All deterministic task-pack validation/collision failures can be planned before mutation, while residual I/O failure is explicitly reported as partial operation state.

**Resolution:** Refuted as a scope requirement. Move schema/render/key/provenance/collision checks into preflight and guarantee no writes for those failures. A cross-port transaction/rollback engine would be a materially larger architectural feature and is not needed to make template task selection deterministic.

## Outcome 2: Evidence Perimeter and Provisional Product Boundary

### Recommended levels

| Level | Audience and lifetime | WPM-owned surface | What belongs here |
| ----- | --------------------- | ----------------- | ----------------- |
| Distribution | Before `wpm` or any WPM skill exists | Published package/repository/plugin metadata and minimal README | How to obtain a genuine WPM release and run setup; no assumed skill. |
| Personal | The user's existing agent, across projects | `wpm-create-package` only | Install/update prerequisites, choose agent adapter(s), create a workspace, emit/perform the fresh-session handoff. |
| Authoring workspace | A fresh agent launched with the workspace as cwd | Project-local `wpm-*` authoring family plus short `AGENTS.md`/`CLAUDE.md` front doors | Resume the authoring backlog, author project/bundles/recipes/skills, review and build. Versioned with the workspace. |
| Bundle focus | Same workspace agent while working on one bundle | Triggered workspace skills, not copies under `wip/` | Bundle/recipe/skill knowledge receives the bundle id as context; authoring instructions never ship. |
| Deliverable/executor | The end user's installation agent | Existing `<project>-installer`, advisors, helpers, payload skills, and built `AGENTS.md` aliases | Installation-time behavior. These are deliverable-owned names and are not renamed to `wpm-*`. |

### Recommended WPM skill family

| Skill | Install level | Trigger/job | Knowledge boundary |
| ----- | ------------- | ----------- | ------------------ |
| `wpm-create-package` | Personal | “Install/setup WPM”, “create a work package”, or “start a bundle-project” | Package acquisition, prerequisite checks, explicit agent selection, `wpm init`, and preparation of the fresh workspace-session handoff. It reports prepared surfaces and launch/recovery guidance without claiming receiver acceptance. |
| `wpm-author` | Workspace | “Continue/author this WPM project” | Workspace anatomy, backlog claim/resume loop, project-level intent/metadata/targets, and the CLI-vs-Backlog-vs-filesystem ownership rule. Routes specialized work to the skills below. |
| `wpm-author-bundle` | Workspace | Plan or change one bundle | Capability decomposition, bundle metadata/dependencies, payload categories, registration, and bundle lifecycle. |
| `wpm-author-recipe` | Workspace | Create or revise install-backlog tasks | Detect/setup/verify/state/migration semantics, version milestones/labels, direct Backlog.md operations, and observable what-not-how acceptance criteria. |
| `wpm-author-skill` | Workspace | Add/revise an advisor, installer helper, payload skill, or front door | Skill roles, discovery scopes, trigger design, native aliases, front-door boundaries, registration, and non-leakage between authoring and executor context. |
| `wpm-review-package` | Workspace | Review, validate, simulate, or release | Context-less executor simulation, independence/coupling checks, reference/version/registration checks, dry-run, package, and release readiness. |

The `wpm-` prefix is reserved for builder-owned skills. It should not be forced onto user-authored payload skills, `<project>-installer`, or `<bundle>-advisor` names because those identify the package being delivered, not WPM itself.

### Agent adapter contract

| Field | Codex | Claude Code |
| ----- | ----- | ----------- |
| Adapter id | `codex` | `claude-code` |
| Personal skill destination | `~/.agents/skills/<name>` | `~/.claude/skills/<name>` |
| Workspace skill destination | `.agents/skills/<name>` | `.claude/skills/<name>` |
| Workspace front door | `AGENTS.md` | `CLAUDE.md` (managed alias/block to canonical authoring front door) |
| Native launch hint | run Codex with cwd = workspace root | run `claude` with cwd = workspace root |
| Reload note | skills are auto-detected; report restart as recovery if absent | live reload is supported, but creating a previously absent top-level skill directory may require restart |

The registry must also carry display name, supported scopes, optional agent metadata/pointers, detection probes, and managed-file ownership. Codex and Claude Code are the P0 adapters. Existing Hermes/OpenClaw entries should be ported only after their current primary contracts are re-verified.

### Proposed end-to-end flow

1. The distribution entry point resolves the npm/package identity and runs an interactive setup, or a headless equivalent such as `wpm setup --agents codex,claude-code`.
2. Setup validates explicit adapter IDs, installs/updates only `wpm-create-package` in selected personal scopes, safely migrates a WPM-owned legacy `installer-builder`, and reports exact paths/reload advice.
3. The bootstrap agent elicits the initial package intent and runs `wpm init <name> --authoring-agents <ids>`.
4. Init generates the workspace-local skill family into each selected agent's native project scope, writes concise native front doors, materialises the base authoring backlog plus template extensions, and records managed onboarding state outside `wip/`.
5. Init emits a machine-readable `prepared` handoff receipt: workspace root, selected agent, native launch hint, expected front door, required first skill/action, reconcile/readiness command, and recovery advice.
6. A fresh session starts at the workspace root. Its front door invokes `wpm-author`; that skill verifies local cwd/context, reconciles/reads the per-author backlog, claims the next appropriate task, and routes bundle/recipe/skill/review work to the focused skill. This local readiness check is not a durable cross-session acceptance acknowledgement.
7. Build proves none of the authoring-only skills, metadata, backlog, or front doors entered the deliverable archive.

### Template extension boundary

The current descriptors need an optional declarative `authoring` section. The exact schema remains an architecture decision, but it needs these observable semantics:

- project-template tasks materialise on `wpm init`; bundle-template tasks materialise on `wpm bundle new`/enable;
- every template task has a portable stable key plus rendered title and outcome-focused acceptance criteria;
- template tasks append to the mandatory core set and materialise idempotently;
- the current feature requires template-provided authoring tasks only; user-selected Option A explicitly defers template-provided custom authoring skills/references;
- task-pack schema/render/key/provenance and known collision errors fail during preflight before the first structural write; no general cross-port rollback guarantee is implied;
- managed origin/version data permits deterministic re-entry and drift reporting; it does not authorize silent overwrite, archival, or deletion of an existing Backlog.md task.

### Bounded implementation slices

1. **Distribution identity and onboarding contract.** Decide the publishable package/plugin name, canonical commands, adapter vocabulary, and handoff receipt fields.
2. **Agent adapter registry and setup CLI.** Add explicit interactive/headless selection, list/detect/report behavior, managed ownership, and Codex/Claude adapters; keep detection advisory.
3. **`wpm-*` skill-family split and migration.** Replace the monolithic `installer-builder` with the six scoped skills and safely handle existing managed copies.
4. **Workspace-local delivery and prepared handoff.** Generate selected native skill/front-door surfaces at init, persist managed authoring state outside `wip/`, and report locally verifiable readiness without claiming receiver acceptance.
5. **Template provenance, stable-key reconciliation, and task packs.** Persist selected project/bundle template provenance, extend the Backlog boundary for managed identity, materialise declarative task packs, and provide fresh-clone authoring reconciliation; custom template skills remain deferred.
6. **Cross-agent cold onboarding coverage.** Exercise Codex-only, Claude-only, multi-agent, headless, re-run/update, migration, fresh clone/reconcile, template extension, prepared handoff, and build non-leakage paths.

## Outcome 3: Causal and Trade-off Analysis

### Causal trace

| Observed output | Producing condition | State that emerges | Backlog-safe correction |
| --------------- | ------------------- | ------------------ | ----------------------- |
| `wpm skill install` writes `installer-builder` to every detected personal scope | Agent identity is inferred from config-directory presence and is not an explicit input (`src/core/operations/install-authoring-skill.ts:93-125,186-205`) | A stale or merely installed client is mutated; headless intent and “only configure this client” cannot be represented | Explicit one-or-many adapter selection; detection supplies suggestions/reporting only |
| A generated workspace front door invokes the personal `installer-builder` | The workspace does not receive version-matched authoring skills (`templates/project/minimal/snippets/authoring-front-door.md.tmpl:24-31`) | A fresh agent's behavior depends on unrelated machine-global state and may use guidance from a different WPM version | Install only bootstrap personally; generate the routed `wpm-*` authoring family into selected project scopes |
| `init` and `bundle new` always create fixed WPM catalogs | Task specs are functions embedded in operations, while `template.yml` exposes only metadata/parameters (`src/core/operations/init-project.ts:132-188`, `src/core/operations/create-bundle.ts:134-223`, `src/core/services/schema/template.ts:20-102`) | A template can add files but cannot declare the authoring work those files require | Add static project- and bundle-scope task packs to template data and merge them with mandatory core specs at the scope-producing operation |
| Re-entry skips any equal task title | Materialisation has no origin key beyond title (`src/core/services/materialisation.ts:47-62`) | An unrelated template task can be silently suppressed, or a renamed task duplicated | Identify generated intent by stable origin key and surface title/spec conflicts before writing |
| The README says to “point” the agent at the workspace | No persisted handoff state connects selected adapter, cwd, expected front door, first skill, and backlog (`README.md:50-76`) | Readiness is a human inference and receiver acceptance is unobserved | Persist and print a `prepared` handoff receipt plus local readiness/recovery guidance; native launching and accepted acknowledgement remain out of scope |
| `manifest.targets` already lists agents | That field controls the agents supported by the shipped installer and its deliverable aliases (`docs/10-authoring-cli.md:69,148`, `src/core/model/manifest.ts:33-43`) | Reusing it for authoring setup would couple a developer's client choice to release behavior | Store authoring adapters only in authoring-level managed state outside `wip/` |

The causal center is therefore not weak wording. Three pieces of state are absent from the current model: explicit authoring-client selection, managed workspace authoring assets/handoff state, and stable template-task origin. The proposed stories should add those concepts at their producing boundaries rather than ask an agent to infer them afterward.

### Journey and refutation matrix

| Journey | Failure in the current flow | Required observable outcome |
| ------- | --------------------------- | --------------------------- |
| Clean Codex machine | Public command is unresolved; after a local install, ambient detection and a manual handoff remain | One explicit bootstrap command configures only Codex, init writes `.agents/skills/wpm-*`, and the prepared receipt names a fresh root-session readiness action |
| Clean Claude Code machine | Same, with a different personal/project discovery path | The same semantic flow writes Claude's native personal/project surfaces and provides its reload/launch recovery hint |
| Both clients installed, one selected | Both detected personal scopes are currently written | Only the selected personal destination and selected workspace integration change; the other remains untouched |
| Both clients selected | No persisted one-to-many intent exists | Both native surfaces are generated from the same WPM skill sources, while one shared authoring backlog is materialised once |
| Headless/CI setup | Detection chooses implicitly and there is no selection flag | Explicit validated adapter IDs produce deterministic output; missing/unknown IDs fail before mutation |
| Project template with pre-included bundle | Only WPM's fixed project and per-bundle catalogs are created | Core project tasks, project-template tasks, each pre-included bundle's core tasks, and its bundle-template tasks each appear exactly once |
| Later `bundle new`/`enable` | Only the hard-coded per-bundle catalog is reachable | The chosen bundle template's rendered task pack is appended at the same operation boundary, exactly once per stable origin key |
| Re-run or changed template spec | Title equality suppresses work; no origin/version contract exists | Same key/same contract is a no-op; duplicate key, title collision, or changed contract is reported without silently changing existing work |
| Existing `installer-builder` installation/workspace | A rename can strand old front-door references or overwrite user-modified copies | Recognizably WPM-managed legacy assets migrate or receive a compatibility path; ambiguous/user-modified content is preserved and reported |
| Unsupported adapter | The implementation can only infer from a built-in map | The command lists supported IDs and fails without guessing or partial writes; manual portable handoff guidance remains available |
| Build after authoring setup | New project-local skills could accidentally enter the release | The archive remains derived only from `wip/`; authoring skills, state, receipt, front doors, and `.authoring-backlog/` are absent (`docs/06-project-skeleton.md:7-13`) |

### Decisions safe enough to become backlog outcomes

1. **Explicit setup, never package-install side effects.** After the publishable WPM entry point resolves, a user or bootstrap agent invokes a setup operation. It supports one or many authoring adapters interactively and explicitly in headless mode; it does not mutate HOME from an npm lifecycle hook.
2. **One adapter registry, two selections.** The registry owns native personal/project skill destinations, front-door behavior, probes, display/reload/launch hints, and shared-path de-duplication. Personal bootstrap destinations and workspace integrations are recorded separately; neither is `manifest.targets`.
3. **Detection is advisory.** Detected clients may be preselected in an interactive UI and are included in reports, but only validated explicit selection authorizes writes. Unknown IDs and unsupported scopes fail before any destination changes.
4. **Codex and Claude Code are the P0 acceptance matrix.** Preserve existing Hermes/OpenClaw identifiers without guessing new behavior; do not claim first-release onboarding support until their primary contracts are verified.
5. **Personal scope contains one job.** `wpm-create-package` covers acquisition/setup, initial intent, init, and preparation of the fresh-session handoff. It reports prepared state and does not claim receiver acceptance.
6. **Workspace scope contains the routed family.** WPM generates `wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package` into every selected native project scope. `wpm-author` is the orientation/router; the other descriptions trigger only for their focused jobs. User payload skills, `<project>-installer`, and `<bundle>-advisor` keep their package-owned names.
7. **Handoff preparation is observable but acceptance is not implied.** Authoring-only managed state records the resolved workspace root, selected adapter(s), expected native front door and first skill/action, backlog root, launch/reload hint, reconcile/readiness action, and recovery advice. The bootstrap skill may use native delegation, but WPM claims only `prepared`; automatic spawn, session identity, and durable `accepted` acknowledgement are deferred.
8. **The scope-producing operation owns task completeness.** Init merges mandatory project specs, project-template specs, and specs for pre-included bundles. Bundle new/enable merges mandatory per-bundle specs and the chosen bundle-template specs. The authoring agent works the result; no “scan and remember to backfill” behavior is part of the correctness path.
9. **Template behavior stays declarative.** An optional template authoring-task pack provides stable keys, rendered titles, and outcome-focused acceptance criteria. Project/bundle template scope determines the materialisation event. No executable hooks, arbitrary commands, or general condition language enter the descriptor in this slice.
10. **Core work is append-only and mandatory.** Template tasks extend but cannot replace/suppress WPM's planning, safety, review, or release tasks. Schema/render/key/provenance and predictable collision failures are reported before the first structural write; arbitrary adapter failure is not covered by a general rollback promise.
11. **Idempotency preserves human work and survives clones.** Tracked authoring state preserves project/per-bundle template origin plus revision/fingerprint outside `wip/` and the gitignored backlog. Same origin key and unchanged rendered contract is a no-op. Changed/removed specs report drift without rewrite/archive/delete, and an explicit reconcile path recreates missing task origins for a fresh author.
12. **Managed migration is non-destructive.** WPM may replace or remove only content it can identify as its own managed output. A user-modified or ambiguous `installer-builder`/front-door destination remains intact with an actionable conflict report; existing workspaces retain a functional compatibility route during migration.
13. **Cold acceptance spans the boundary.** Tests cover Codex-only, Claude-only, both-to-one, both-to-both, headless, unknown adapter, rerun, legacy migration, fresh clone/reconcile, template pre-inclusion, bundle new/enable, collisions/drift, prepared-handoff readiness, and authoring-asset non-leakage in built archives.

These are behavioral seams, not prescribed internal shapes. Command spelling (`setup` versus an expanded `skill install`), repeatable versus comma-separated flags, the managed-state filename/schema, and whether native copies or generated links implement discovery remain implementation/design decisions inside the existing ports-and-adapters constraint.

### Genuinely open user choice

1. **Public distribution identity/channel.** The documented install cannot work until the user chooses the canonical publishable package or plugin identity. The required outcome is a resolvable clean-machine entry point; the exact name/channel is product-owned and cannot be inferred from the repository.

Template-provided custom authoring skills are no longer open: Option A defers them while keeping deterministic template task packs in scope. No user choice is required for automatic launching/accepted acknowledgement, core-task replacement, title-only idempotency, or reuse of `manifest.targets`: those paths are deferred or refuted for this scope.

## Outcome 4: Source and Boundary Trace

### Explicit scope decision

**Option A is fixed for backlog preparation.** Templates may declare deterministic authoring task packs. This includes schema/render validation, stable task keys, persisted producer provenance/revision, append-only reconciliation, init/bundle integration, and fresh-clone reconstruction. Templates may not provide custom authoring skills, references, executable hooks, or workspace file payloads in this feature; those trust/layout/namespace concerns are deferred.

### Mandated first-pass scans

The first pass ran three independent scans in parallel:

1. exact-term/control scan for `materialiseAuthoringTasks`, `installAuthoringSkill`, template resolution, authoring backlog, agent maps, task create/archive, and manifest targets across source/tests/design docs;
2. affected-file inventory across core models/services/operations/ports, adapters, CLI, templates, and tests;
3. version-control scan over the relevant paths.

The version sequence is coherent rather than a single regression: the Backlog port (`de1bf96`), template resolver (`e871e52`), title materialiser (`94ba549`), mutation lifecycle (`b9d7089`), create-bundle path (`0dad89d`), and built-in templates (`601df55`, `bf880e9`) preceded the later authoring command/workspace layers (`ed036a1`, `24d4ed8`). Provenance, clone reconciliation, and an authoring-client axis were never introduced when those layers were joined.

### Caller chain 1: Personal setup and authoring-client selection

| Stage | Source | Observed responsibility/gap |
| ----- | ------ | --------------------------- |
| CLI leaf | `src/cli.ts:3336-3387` | `wpm skill install` has no explicit adapter-set input and invokes one install operation. |
| Detection/write operation | `src/core/operations/install-authoring-skill.ts:93-125,169-211` | Config-directory presence becomes selection; the same `installer-builder` tree is copied to every detected personal scope. |
| Path data | `src/core/services/agent-aliases.ts:4-20,27-32,47-67` | Project aliases describe deliverable target-agent skill scopes; personal paths are a second map. Neither is a complete authoring-client adapter contract. |
| Workspace init | `src/core/operations/init-project.ts:342-381,390-403` | Deliverable aliases derive from `manifest.targets`, while workspace `AGENTS.md` and `CLAUDE.md` are written unconditionally. No selected authoring-client set reaches init. |

**Trace conclusion:** introduce a closed authoring-client registry/input at the CLI/core seam, reuse path facts where valid, and persist workspace authoring clients separately from `manifest.targets`. Multi-selection must also distinguish the set of installed workspace integrations from any single native launch hint; WPM need not select or own a running session.

### Caller chain 2: Template resolution, provenance, and task production

| Stage | Source | Observed responsibility/gap |
| ----- | ------ | --------------------------- |
| Domain model | `src/core/model/template.ts:38-50` | A template holds name/scope/description/parameters/files/snippets; no authoring tasks or pinned origin/revision. |
| Descriptor parser | `src/core/services/schema/template.ts:20-29,42-105,108-126` | `template.yml` accepts/round-trips only descriptor metadata and parameters. |
| Resolver | `src/core/services/template-resolver.ts:128-155` | A source is resolved for the current call, but selected provenance is not committed as workspace/bundle authoring state. |
| Init producer | `src/core/operations/init-project.ts:281-424` | Init renders/writes the workspace and then combines code-owned project/per-bundle specs; template task data cannot enter the plan. |
| Bundle producer | `src/cli.ts:1826-1848`, `src/core/operations/create-bundle.ts:241-335,375-377` | CLI runs `createBundleSpec`; the operation resolves/clones the current scaffold but returns only the hard-coded per-bundle task set. |
| Default-template replacement | `src/cli.ts:2007-2092` | `bundle template set` replaces the default directory directly, outside mutation lifecycle, without a persisted origin/revision contract. |
| Later derivation | `src/cli.ts:253-264`, `src/core/operations/derive-artefacts-capability.ts:27-35,78-95` | Normal lifecycle construction defaults project derivation to `minimal`, so init-time template identity is not a durable input. |

**Trace conclusion:** descriptor support alone is insufficient. Tracked authoring state must pin a stable producer identity and revision/fingerprint for the project and every created bundle/default scaffold. Reconciliation needs either a reconstructible pinned source or a retained rendered task-pack snapshot; the exact representation is an architecture decision.

### Caller chain 3: Mutation lifecycle to Backlog.md

```text
CLI action
  -> runMutation(operation spec)
     -> LOAD -> CHECK -> APPLY -> RERENDER -> MATERIALISE
        -> materialiseAuthoringTasks(backlog, authoringRoot, specs)
           -> BacklogMd.listTasks(root)
           -> BacklogMd.createTask(root, input)
              -> backlog-cli adapter -> Backlog.md subprocess
```

| Boundary | Source | Observed responsibility/gap |
| -------- | ------ | --------------------------- |
| Task spec | `src/core/model/operation.ts:3-14` | Title and acceptance criteria only; no namespaced producer key or contract revision. |
| Lifecycle | `src/core/operations/lifecycle.ts:113-127,263-312` | Check precedes effects, but apply/rerender precede materialisation; there is no task reconciliation preflight plan. |
| Materialiser | `src/core/services/materialisation.ts:28-65` | One active-task title list, then create-missing by exact title. |
| Core port | `src/core/ports/backlog.ts:32-90,103-146` | Create can send labels, but returned/listed summaries expose only id/title/status; edit has no acceptance-contract replacement (correctly avoiding silent ownership). |
| Real adapter | `src/adapters/backlog-cli.ts:60-92`; installed `backlog 1.45.2` help | Shell adapter implements the narrow create/list surface and returns no managed origin metadata. The external CLI can store labels, but its list command does not expose a label-rich/JSON summary; per-task plain detail or a separate mapping would be needed. |
| Fake/test seam | `src/adapters/fake-backlog.ts`, `test/unit/services/materialisation.test.ts`, `test/integration/services/materialisation.test.ts` | Existing tests codify title identity and must migrate with the port contract. |

**Trace conclusion:** stable-key reconciliation crosses model, service, port, real adapter, fake, and tests. It remains within the existing authoring-Backlog port and does not violate the no-mirror rule because it never authors bundle install-backlogs. Initial semantics are create-missing-only: unchanged key/contract is a no-op; conflicting revision/title is reported; existing task content/status is never rewritten.

### Caller chain 4: Init, preflight, and partial-failure boundary

Init is a direct bootstrap operation rather than `runMutation` (`src/core/operations/init-project.ts:25-26,281-424`; caller at `src/cli.ts:2303`). It refuses an existing target at `src/core/operations/init-project.ts:294-300`, writes project structure/front doors before initializing `.authoring-backlog/` at lines 390-424, and can therefore leave structure behind if the Backlog subprocess fails.

For lifecycle operations, `src/core/operations/lifecycle.ts:274-312` likewise applies and rerenders before task creation. The backlog must therefore distinguish two promises:

- **in scope:** resolve, render, namespace, and validate the complete core+template task plan; inspect predictable managed-key/title conflicts; fail these planning errors before the first structural write;
- **out of scope:** rollback arbitrary filesystem, symlink, or Backlog subprocess failures after effects begin.

This incorporates the red-team preflight concern while refuting the need for a general transaction engine.

### Caller chain 5: Fresh clone and authoring reconciliation

`src/core/services/context.ts:18-28,42-45` deliberately recognizes a workspace by `wip/manifest.yml`, not `.authoring-backlog/`, because that backlog is gitignored and may be absent after clone. `docs/11-authoring-process.md:26-32,219-227` declares it per-author state, yet the only producers are init and structural mutation. Since init refuses an existing target and no periodic rescan exists, a clone can be recognized but cannot deterministically regain its authoring work.

**Trace conclusion:** a dedicated authoring bootstrap/reconcile operation is required. It reads tracked authoring clients and template provenance, initializes `.authoring-backlog/` if absent, computes mandatory core plus pinned template origins, creates missing tasks idempotently, and reports drift/conflicts. It never marks tasks Done based on filesystem inference. The root front door should route a missing-backlog session to this operation before telling the agent to claim work.

### Caller chain 6: Handoff and build boundary

The workspace front door currently names a personal `installer-builder` and recovery via `wpm skill install` (`templates/project/minimal/snippets/authoring-front-door.md.tmpl:24-31`). Init writes that front door and its Claude alias, then initializes/materialises the backlog (`src/core/operations/init-project.ts:390-424`). No receiving-session call appears in the chain.

The portable state transition for this increment is therefore:

```text
not configured -> personal setup complete -> workspace prepared -> handoff prepared
                                                        \-> fresh agent performs local readiness/reconcile and works
```

There is no portable `accepted` transition. Native delegation may start an agent, but durable acknowledgement/session identity and automatic spawning are deferred. Build non-leakage remains structurally protected because workspace authoring state lives outside `wip/`, while the build's builder-only exclusions also name `.authoring-backlog` (`src/core/operations/build.ts:83-88,318-337`).

### Red-team dispositions

| Concern | Disposition | Backlog consequence |
| ------- | ----------- | ------------------- |
| Authoring-client axis conflated with executor targets | **Confirmed** | Separate domain/config prerequisite; explicit selection and independence tests before workspace generation. |
| Selected template provenance is discarded | **Confirmed** | Persist tracked project, default-bundle, and per-bundle producer identity/revision before task-pack reconciliation. |
| Backlog port cannot reconcile stable identity | **Confirmed** | Expand task identity/read contract through core port, real/fake adapters, and materialiser; create-missing-only policy. |
| Fail-before-partial-mutation conflicts with lifecycle order | **Partially confirmed** | Require validation/reconciliation preflight before writes; explicitly exclude general rollback. |
| Fresh clone cannot reconstruct its gitignored backlog | **Confirmed** | Add a rerunnable authoring reconcile/bootstrap story; include it in cold onboarding, not migration extras. |
| Issued receipt was described as accepted handoff | **Confirmed wording defect** | Rename the promised state to `prepared`; defer durable acceptance/orchestration and test only sender-observable readiness plus receiver-local startup. |

### Affected boundary inventory for story authors

| Boundary | Existing files/seams | Required story outcome |
| -------- | -------------------- | ---------------------- |
| Authoring-client domain | `src/core/services/agent-aliases.ts`, `src/core/operations/install-authoring-skill.ts`, `src/cli.ts` | Explicit P0 adapter registry and separate personal/workspace selections; no `manifest.targets` coupling. |
| Tracked authoring state | New authoring-only state outside `wip/`; context rooted by `src/core/services/context.ts` | Persist selected authoring clients, managed asset versions, template producer provenance, and prepared-handoff fields; survives clone and never ships. |
| Template model/schema | `src/core/model/template.ts`, `src/core/services/schema/template.ts`, `src/core/services/template-resolver.ts` | Declarative task packs with stable keys and outcome ACs; origin/revision preserved; custom template skills rejected/deferred. |
| Template-consuming operations | `src/core/operations/init-project.ts`, `src/core/operations/create-bundle.ts`, `src/core/operations/bundle-lifecycle.ts`, `src/cli.ts` template-set path | Preflight and materialise correct project/default/pre-included/new/enabled task packs; persist provenance at selection time. |
| Task reconciliation | `src/core/model/operation.ts`, `src/core/services/materialisation.ts`, `src/core/ports/backlog.ts`, `src/adapters/backlog-cli.ts`, `src/adapters/fake-backlog.ts` | Namespaced key/contract visibility, create-missing-only reconciliation, collision/drift reporting, no human-task rewrite. |
| Clone bootstrap | New core operation + CLI/front-door route; existing `src/core/services/context.ts` | Initialize/reconcile a missing per-author backlog from tracked state, safe on repeat. |
| WPM skill family/front doors | `agent-skills/installer-builder/**`, `templates/project/minimal/snippets/authoring-front-door.md.tmpl`, skill-install tests | One personal bootstrap plus five generated workspace skills, `wpm-*` namespace, non-destructive legacy compatibility, prepared-handoff language. |
| Lifecycle safety | `src/core/operations/lifecycle.ts`, direct init path | No mutation on task-pack schema/render/key/provenance/planned-collision failures; partial runtime failures reported without rollback claims. |
| Acceptance/non-leakage | Unit/integration/CLI/build tests around the above seams | Codex/Claude, one/many, headless, provenance, init/new/enable, rerun/drift, clone reconcile, migration, prepared handoff, and archive exclusion. |

### Dependency constraints for backlog preparation

1. The tracked authoring-state/provenance contract precedes template reconciliation, clone reconstruction, and a persisted prepared receipt.
2. The authoring-client registry precedes personal setup and workspace-native skill/front-door generation.
3. The template task-pack schema and Backlog managed-identity contract can be designed independently, but both precede init/bundle integration.
4. Preflight integration accompanies the init/bundle stories; it does not require a generic transaction story.
5. Clone reconcile depends on tracked provenance plus Backlog managed identity and is required before cold onboarding can be called complete.
6. Skill-family migration and prepared-handoff/front-door work depend on the authoring-client/state contracts but do not depend on template-provided custom skills.
7. Cross-agent cold coverage is last and verifies all preceding boundaries, including that nothing authoring-only enters a built archive.

Outcome 4 stops here. No source modification or implementation is authorized by this trace.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Publishable package/plugin identity | Blocks a genuine clean-machine bootstrap and determines the distribution entry point | Product decision plus registry/repository availability check. |
| Exact managed-state filename/schema | Needed for deterministic adapter/skill updates without owning user content | Resolve during architecture after the level model is confirmed. |
| Managed task-identity encoding | Installed Backlog.md can store labels but cannot return them in one list summary, so reconciliation must choose per-task detail reads or a separate mapping | Resolve during architecture while preserving the BacklogMd port boundary and create-missing-only policy. |
| Hermes/OpenClaw current contracts | Determines whether they remain first-release adapters | Verify current primary documentation before porting them. |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Exploration anchor | README's manual step 4: point the agent at the generated workspace. |
| Trigger | User asks an existing agent to install `wpm` and create a new package. |
| Condition | `wpm`/skill may be absent initially; after init, authoring readiness depends on selected native surfaces, tracked provenance, and a per-author backlog that is intentionally absent after clone. |
| Error origin | No single exception: the gap is distributed across missing authoring-client/provenance state and title-only materialisation. |
| Primary call paths | `src/cli.ts:3336-3387` → `install-authoring-skill`; `src/cli.ts:2303` → direct `initProject`; `src/cli.ts:1826-1848` → `runMutation` → `createBundleSpec` → `materialiseAuthoringTasks` → `BacklogMd` → adapter. |
| Related files | `README.md`, `agent-skills/installer-builder/**`, `templates/project/minimal/snippets/authoring-front-door.md.tmpl`, `src/cli.ts`, `src/core/model/template.ts`, `src/core/model/operation.ts`, `src/core/operations/install-authoring-skill.ts`, `src/core/operations/init-project.ts`, `src/core/operations/create-bundle.ts`, `src/core/operations/lifecycle.ts`, `src/core/services/agent-aliases.ts`, `src/core/services/context.ts`, `src/core/services/schema/template.ts`, `src/core/services/template-resolver.ts`, `src/core/services/materialisation.ts`, `src/core/ports/backlog.ts`, `src/adapters/backlog-cli.ts`, `src/adapters/fake-backlog.ts` |

## Conclusion

**Confidence:** High for product and source boundaries; Medium for exact command/schema/state representation

The current single personal skill should become one personal `wpm-create-package` bootstrap plus five workspace-local `wpm-*` authoring skills. Personal and workspace authoring-client selections must be explicit and separate from shipped executor targets. Deterministic template task packs require tracked project/per-bundle producer provenance, a stable managed identity visible through the Backlog port, validation/reconciliation preflight, and an explicit fresh-clone reconcile path; existing human tasks remain append-only and untouched. The portable handoff state in this increment is `prepared`, not `accepted`, and automatic spawning/session acknowledgement remain deferred. Per Option A, template-provided custom authoring skills are out of scope.

## Recommended Next Steps

### Fix direction

Do not implement from the case file. Pause at Outcome 4. The parent backlog-preparation flow may now translate the traced boundaries and dependencies into outcome-focused stories after re-reading `docs/task-writing-conventions.md`; public distribution identity remains a product decision rather than an inferred task detail.

### Diagnostic

Outcome 4 is complete. Outcome 5 finalization has not been run and requires explicit continuation; no code, state, backlog, or tests were changed here.

## Reproduction Plan

Model clean Codex-only and Claude-only machines with no `wpm` or `installer-builder`; follow only shipped/public instructions through installation, explicit adapter selection, skill discovery, init, prepared receipt, fresh workspace-local readiness, and first `.authoring-backlog` claim. Repeat with both clients installed (one selected and both selected). Create project/pre-included/new/enabled bundles from pinned template task packs, rerun reconciliation, change a task contract, and verify origin-aware no-op/drift behavior. Finally clone without `.authoring-backlog/`, reconstruct it from tracked state, and prove no authoring-only asset enters the build.

## Side Findings

- Public npm naming/publication is a prerequisite rather than merely documentation polish: the bootstrap command currently cannot resolve the intended product.
- Because v1 templates are copied directories rather than a distribution/update system (`docs/10-authoring-cli.md:21`), deterministic provenance may require a content revision/fingerprint or rendered task-pack snapshot rather than assuming a remotely resolvable template version.
