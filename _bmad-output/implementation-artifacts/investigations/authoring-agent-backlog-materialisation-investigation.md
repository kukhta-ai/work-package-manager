# Investigation: Authoring-agent backlog materialisation

## Hand-off Brief

1. **What happened.** The user asked whether authoring work is organized through deterministic backlog filling, especially whether `bundle new` guarantees that a newly added bundle receives authoring tasks instead of relying on agent memory.
2. **Where the case stands.** Active after the task-producing command inventory. Eleven user-visible command cases feed authoring-task materialisation; templates customize scaffold files, not this code-owned catalog.
3. **What's needed next.** Trace the production CLI/Backlog.md and authoring-agent consumption loop; separately decide whether template-defined authoring-task extension/replacement is a desired new product capability.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-08-20 |
| Status           | Active |
| System           | Linux 6.8.0-100-generic aarch64; branch `dev`; HEAD `24d4ed8cea92` |
| Evidence sources | Source code, tests, design/agent surfaces, version control, and a pending real CLI reproduction |

## Problem Statement

User-reported description, captured verbatim:

> "let's check now how work is being organised for authoring agent. do we have working determenistic backlog filling for the authoring agent for it not to forget to, for example, fill added bundle with tasks?"

The initial claim to test is that creation of the required bundle-authoring work may depend on the agent remembering instructions rather than on deterministic product behavior.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| `src/core/operations/create-bundle.ts` | Available | Declares the per-bundle catalog and wires it into the mutation's materialise step. |
| `src/core/services/materialisation.ts` | Available | Implements title-idempotent task creation over the BacklogMd port. |
| `test/unit/templates/default-bundle.test.ts` | Available | Proves 12 declared bundle tasks are created in the fake-backed lifecycle. |
| Template model and descriptor schema | Available | Permit name, scope, description, parameters, files, and snippets; expose no authoring-task field. |
| Shipped bundle/project `template.yml` descriptors | Available | Declare metadata and parameters only. |
| Shipped bundle template file tree | Available | Contains three starter *install-backlog* recipe tasks as scaffold files; these are not workspace authoring tasks. |
| CLI composition and lifecycle caller chain | Partial | Search found the surfaces; exact call/root/error semantics remain to be traced. |
| Real Backlog.md adapter and clean-workspace behavior | Partial | Adapter exists; end-to-end behavior has not yet been reproduced in this case. |
| Authoring-agent skill/front door consumption loop | Partial | Not yet mapped against the generated task backlog. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Trace `wpm bundle new` through CLI, mutation lifecycle, and BacklogMd adapter | High | Open | Establish whether production creation is automatic and failure-atomic. |
| 2 | Inventory every operation that materialises or archives authoring tasks | High | Done | Eleven user-visible creation cases identified; removal/disable/deregister and version-set exclusions checked. |
| 3 | Inspect authoring skill/front-door instructions for selecting and closing generated tasks | High | Open | Creation alone does not prove the agent cannot overlook pending work. |
| 4 | Run a fresh real-workspace `init` -> `bundle new` reproduction | High | Open | Verify exact task count, titles, ACs, idempotency, and non-zero failure behavior. |
| 5 | Compare docs 10/11/13 catalog to source-generated specs and tests | Medium | Open | Detect drift between declared and materialised work. |
| 6 | Decide whether custom templates should extend, replace, or parameterize authoring-task catalogs | Medium | Open | New product/design question; no such contract exists today. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-08-20 | User requested verification of deterministic authoring-agent backlog filling. | User message | Confirmed |
| 2026-08-20 | `dev` at `24d4ed8cea92` was selected as the investigation baseline. | Git | Confirmed |
| 2026-08-20 | Initial source scan located the `bundle new` materialise plan and a 12-task unit proof. | Source/test citations below | Confirmed |

## Confirmed Findings

### Finding 1: `bundle new` has an explicit per-bundle materialisation plan

**Evidence:** `src/core/operations/create-bundle.ts:132`, `src/core/operations/create-bundle.ts:143`, `src/core/operations/create-bundle.ts:375`

**Detail:** The operation does not merely tell the agent to remember future work. It constructs `perBundleAuthoringTasks(id, ...)` and passes that catalog to lifecycle step ⑤ `materialise`. The catalog explicitly includes `Fill install-backlog for <id>` and states the expected detect/setup/verify task structure.

### Finding 2: The creation mechanism is deterministic and title-idempotent at the core boundary

**Evidence:** `src/core/services/materialisation.ts:29`, `src/core/services/materialisation.ts:42`, `src/core/services/materialisation.ts:47`

**Detail:** Existing titles are loaded once, unseen task specs are created with their acceptance criteria, and repeated titles are skipped both across runs and within one batch.

### Finding 3: The fake-backed operation test proves the default 12-task set is created

**Evidence:** `test/unit/templates/default-bundle.test.ts:403`, `test/unit/templates/default-bundle.test.ts:414`, `test/unit/templates/default-bundle.test.ts:418`

**Detail:** The test executes the mutation lifecycle, checks every declared per-bundle title in the authoring backlog, and asserts that 12 tasks were materialised.

## Deduced Conclusions

### Deduction 1: Task declaration is not currently dependent on author memory

**Based on:** Findings 1–3.

**Reasoning:** `bundle new` supplies a fixed task catalog to a deterministic service, and the lifecycle test observes the catalog in the resulting backlog.

**Conclusion:** At the core/fake-backed boundary, adding a bundle automatically creates the authoring work, including the instruction to fill its install backlog.

## Hypothesized Paths

### Hypothesis 1: Bundle task filling may rely on the agent remembering instructions

**Status:** Open

**Theory:** A newly added bundle could exist without durable backlog tasks that force the authoring agent to plan and populate it.

**Supporting indicators:** The agent still self-attests against free-text acceptance criteria, and Outcome 1 has not yet proven the real CLI/Backlog.md write or the task-consumption loop.

**Would confirm:** A real `wpm bundle new <id>` succeeds without creating the expected authoring tasks, or the front door lets the agent finish while those tasks remain open without surfacing them.

**Would refute:** A clean real-workspace run creates the exact catalog idempotently and the authoring front door deterministically directs the agent through pending tasks to a checked completion gate.

**Resolution:** Pending Outcome 2–4 evidence.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Real CLI + Backlog.md task creation | Separates fake-backed proof from production behavior | Run a clean `wpm init`, then `wpm bundle new`, and inspect via `backlog task list --plain`. |
| Failure semantics | Determines whether a bundle can be created while task materialisation silently fails | Trace lifecycle/adapter exceptions and inject a failing BacklogMd probe. |
| Agent pending-work loop | Determines whether created tasks are reliably consumed rather than merely stored | Inspect generated `_AGENTS.md`, installer-builder skill, and authoring workflow references. |
| Catalog completeness/drift | Determines whether every relevant mutation creates the promised task set | Compare docs catalog, operations, and coverage tests. |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | Not symptom-driven; exploration anchor is `createBundleSpec().materialise`. |
| Trigger | `wpm bundle new <id>` (production caller chain pending). |
| Condition | A valid new bundle mutation reaches lifecycle step ⑤. |
| Related files | `src/core/operations/create-bundle.ts`, `src/core/services/materialisation.ts`, `test/unit/templates/default-bundle.test.ts` |

## Conclusion

**Confidence:** Medium

The evidence already refutes the narrow claim that `bundle new` merely relies on agent memory to create follow-up work: the core declares an explicit 12-task catalog and materialises it idempotently, including `Fill install-backlog for <id>`. The broader guarantee the user cares about is not yet fully proven because real Backlog.md execution, failure atomicity, catalog coverage, and the agent's deterministic pending-task consumption loop remain outside the current perimeter.

## Recommended Next Steps

### Fix direction

No fix is recommended at Outcome 1; diagnosis is incomplete.

### Diagnostic

Map the production caller chain, agent loop, and real-workspace behavior, then attempt to refute the deterministic guarantee with failure and repeat-run probes.

## Reproduction Plan

Create a fresh project through the built CLI, list its initial authoring backlog, add a uniquely named bundle, list the backlog again, verify the exact expected task delta and acceptance criteria, rerun the operation/no-op equivalent, and test a forced BacklogMd failure.

## Side Findings

- Acceptance criteria are deliberately free text and agent-self-attested (`src/core/operations/create-bundle.ts:132`); deterministic task creation is distinct from deterministic proof that the task's content was completed correctly.

## Follow-up: 2026-08-20

### New Evidence

The user asked whether the existing template definition can customize authoring-task creation behavior.

- `Template` contains only name, scope, description, parameters, resolved files, and snippets (`src/core/model/template.ts:33-50`).
- `TemplateDescriptorData` contains only name, scope, description, and parameters (`src/core/services/schema/template.ts:13-29`).
- Parsing returns only those known fields plus empty file/snippet collections; an additional task-catalog key is not retained (`src/core/services/schema/template.ts:98-105`).
- Template resolution supplies only `scaffoldFiles` to the apply phase (`src/core/operations/create-bundle.ts:290-310`).
- Materialisation separately calls `perBundleAuthoringTasks(input.id, { advisor })`, without receiving the selected template (`src/core/operations/create-bundle.ts:375-377`).
- The default bundle template carries detect/setup/verify *install-backlog* tasks under `templates/bundle/default/files/install-backlog/tasks/`; these are scaffolded recipe content, not entries in `.authoring-backlog/`.
- The design explicitly separates template-driven scaffolding from task-driven materialisation (`docs/10-authoring-cli.md:32`, `docs/10-authoring-cli.md:153`).

### Additional Findings

#### Finding 4: Template definitions cannot currently declare authoring tasks

**Evidence:** `src/core/model/template.ts:38-50`, `src/core/services/schema/template.ts:20-29`, `src/core/services/schema/template.ts:98-105`

**Detail:** There is no descriptor/model field for authoring tasks, their acceptance criteria, inheritance, or merge policy. Adding an ad-hoc key to `template.yml` would not feed the model or the materialiser.

#### Finding 5: Template choice and authoring-task choice are independent paths

**Evidence:** `src/core/operations/create-bundle.ts:290-310`, `src/core/operations/create-bundle.ts:375-377`

**Detail:** The selected template controls the files copied into `bundles/<id>/`. After apply, the operation always generates the same code-owned per-bundle catalog, with only the existing `advisor` boolean affecting its size.

#### Finding 6: Templates can customize install-recipe tasks, not authoring-workspace tasks

**Evidence:** `templates/bundle/default/files/install-backlog/tasks/`, `templates/bundle/default/template.yml:1-13`

**Detail:** A custom bundle template can ship a different initial set of files beneath `install-backlog/tasks/`. Those tasks tell a future executor how to install the resulting bundle. They do not customize the `.authoring-backlog/` tasks that tell the current authoring agent how to finish authoring it.

### Updated Hypotheses

#### Hypothesis 2: A template definition can customize authoring-task creation

**Status:** Refuted

**Theory:** A custom `template.yml` can declare additional or replacement workspace authoring tasks that `bundle new --template <name>` materialises.

**Would confirm:** A schema/model field reaches `createBundleSpec().materialise`, with defined extension/replacement semantics and coverage.

**Would refute:** The descriptor excludes task data and materialisation ignores the resolved template.

**Resolution:** Refuted by Findings 4–5. No such input reaches the authoring-task generator.

### Backlog Changes

- Added a product/design decision item for template task-catalog semantics.
- The template-definition evidence perimeter is complete; production Backlog.md execution and agent consumption remain separate open threads.

### Updated Conclusion

**Confidence:** High for template customization; Medium for the broader end-to-end guarantee.

No: template definitions cannot currently customize `.authoring-backlog/` task creation. They can customize the scaffold—including the starter `install-backlog/tasks/` recipe—but `bundle new` always materialises its code-owned 12-task authoring catalog (11 with `--no-advisor`). Supporting template-defined authoring tasks would be a new contract requiring schema/model support and an explicit composition rule such as extend versus replace.

## Follow-up: 2026-08-20 #2

### User Question

> "tell me in which cases we now add authoring tasks"

### Complete creation inventory

The current source has nine mutation specs with a `materialise` hook, one direct `init` materialisation, and one generic skill-scaffold hook used by two CLI families. This yields eleven user-visible command cases:

| Command case | Newly planned authoring work |
| --- | --- |
| `wpm init` | Eight project-wide tasks, plus the 12-task per-bundle catalog for every bundle pre-included by the project template. |
| `wpm bundle new <id>` | Twelve per-bundle tasks; eleven with `--no-advisor`. `--disabled` does not suppress the authoring catalog. |
| `wpm bundle enable <id>` | The same 12/11 per-bundle catalog, so a disabled directory that did not yet have those titles gets them. |
| `wpm bundle <id> version bump <level>` | Three version-review tasks, plus a title-deduplicated constraint-review task when another enabled bundle requires the bumped bundle. |
| `wpm bundle <id> requires add <dep>` | One task to adapt the host bundle's install backlog and payload to use the dependency. |
| `wpm bundle <id> requires remove <dep>` | One task to verify the host bundle no longer references the dependency. |
| `wpm project targets add <agent>` | One compatibility-verification task per enabled bundle; zero when no bundle is enabled. |
| `wpm bundle <id> skills add <name>` | One payload-skill writing task only on the scaffold branch. Attaching an existing skill creates none. |
| `wpm bundle <id> installer-skills add <name>` | One bundle-scoped installer-skill writing task only on the scaffold branch. Attaching creates none. |
| `wpm project installer-skills add <name>` | One project-scoped installer-skill writing task only on the scaffold branch. Attaching creates none. |
| `wpm bundle <id> advisor add` | One advisor-content task. Re-running skips an existing title; re-adding after an open task was archived can create a fresh task. |

### Governing conditions

- Mutation checks must succeed first; a failed precondition aborts before task materialisation (`src/core/operations/lifecycle.ts:263-312`).
- Materialisation is by exact title across every non-archived backlog status and within the current batch (`src/core/services/materialisation.ts:29-63`). A matching To Do, In Progress, or Done title is skipped rather than reopened.
- Task creation is incremental and command-driven, not a periodic reconciliation scan (`docs/11-authoring-process.md:32-44`).

### Commands checked as deliberately non-creating

No authoring tasks are added by project version bump/set, bundle version set, target removal, bundle disable, bundle removal, advisor removal, skill/installer-skill removal, payload file/template/script mutations, reads/lists, validation, or build. Some removal commands archive existing authoring tasks instead.

### Evidence

- Complete materialisation-hook scan: `src/core/operations/{advisor-commands,bundle-lifecycle,bundle-requires,bundle-version,create-bundle,installer-skills-project,skill-refs,targets}.ts`, plus direct init in `init-project.ts`.
- Catalog and conditions: `docs/11-authoring-process.md:46-100`.
- Central ordering/idempotency: `src/core/operations/lifecycle.ts:260-312`; `src/core/services/materialisation.ts:29-63`.

### Updated conclusion

**Confidence: High for the command inventory.** Authoring tasks are introduced at eleven explicit mutation points. The catalog is deterministic but not a state reconciler: exact-title idempotency prevents duplicates and also means a previously completed task is not automatically reopened when the same scope-changing cycle happens again.

## Follow-up: 2026-08-20 #3

### User Question

> "do templates include skills for authoring agent into working directory?"

### Finding 7: Templates provide the authoring front door, not the authoring skill

**Evidence:** `templates/project/minimal/snippets/authoring-front-door.md.tmpl:1-31`, `src/core/operations/init-project.ts:390-403`

The project template supplies the content rendered to workspace-root `AGENTS.md`, with `CLAUDE.md` as an alias. That front door tells the authoring agent to drive `.authoring-backlog/` and invoke `installer-builder`. It is project-local guidance, not a locally installed skill.

### Finding 8: The actual `installer-builder` skill is packaged separately and installed into user scope

**Evidence:** `agent-skills/installer-builder/SKILL.md`, `src/core/operations/install-authoring-skill.ts:8-19`, `src/core/operations/install-authoring-skill.ts:149-211`, `src/cli.ts:3351-3385`

The authoring skill ships with the npm package under `agent-skills/installer-builder/`. Only the explicit, project-independent `wpm skill install` command copies it, targeting detected personal scopes such as `~/.claude/skills/installer-builder/` and `~/.agents/skills/installer-builder/`. The operation explicitly never writes it into a workspace or its `wip/` deliverable.

### Finding 9: `wpm init` detects and advises; it does not install

**Evidence:** `src/cli.ts:2318-2328`, `test/unit/cli/skill-commands.test.ts:111-147`

After initialization, the CLI checks whether the authoring skill is present in detected user scopes. If absent, it prints `wpm skill install`; if present, it stays quiet. The durable workspace `AGENTS.md` carries the same instruction.

### Important distinction

The minimal project template also produces `wip/installer-skills/<project>-installer/SKILL.md` and skill-stub snippets. Those are deliverable/executor-side installer helpers or authorable payload scaffolds. They are not the `installer-builder` authoring skill addressed to the agent building the project.

### Updated conclusion

**Confidence: High.** No current template installs an authoring skill into the working directory. Templates install the authoring front door and executor-side scaffold content; the authoring skill is a separate package asset installed explicitly into the user's agent skill scope.

## Follow-up: 2026-08-20 #4

### User Question

> "how a user that wants to create a package now installs our project? in which scope the user's agent will be spawn?"

### Finding 10: The designed public npm installation is not currently available under the documented name

**Evidence:** `README.md:24`, `README.md:50-59`, `package.json:2-10`; npm registry probes on 2026-08-20.

The README instructs `npm i -g work-package-manager backlog.md`, but `work-package-manager` currently returns npm registry `E404`. The repository manifest is instead named `wpm`; that npm name is already occupied by an unrelated package (`wpm@0.1.0`, "Data Dependence Async Module System"). Therefore the reliable current installation path is development-from-source: clone this repository, `npm ci`, `npm run build`, and `npm link`, with `backlog.md` installed globally. Package naming/publication remains a release blocker for the advertised one-line user install.

### Finding 11: `wpm` does not spawn an authoring agent

**Evidence:** `README.md:57-67`, `agent-skills/installer-builder/SKILL.md:35-68`; source scan for agent-launch/process boundaries.

The CLI scaffolds the workspace, materialises tasks, and packages the deliverable. The human then enters the generated workspace and starts their existing agent tool themselves. There is no `wpm` command that selects, launches, or owns a Claude Code, Codex, Hermes, or OpenClaw process.

### Finding 12: The authoring agent's process scope and skill scope are intentionally different

**Evidence:** `README.md:70-97`, `src/core/services/agent-aliases.ts:47-68`, `templates/project/minimal/snippets/authoring-front-door.md.tmpl:8-31`.

- **Process working directory:** the generated authoring workspace root, e.g. `my-handoff/`. This is where workspace `AGENTS.md`/`CLAUDE.md` and `.authoring-backlog/` live. `wip/` is a child deliverable under construction, not the intended session root.
- **Authoring skill discovery:** the user's personal agent scope populated by `wpm skill install`: Claude Code `~/.claude/skills`, Codex `~/.agents/skills`, Hermes `~/.hermes/skills`, OpenClaw `~/.openclaw/skills`.
- **Target-agent scopes:** `manifest.yml.targets` controls project-relative aliases inside the eventual deliverable. It does not choose or spawn the authoring agent.

The agent should be restarted after `wpm skill install` so it catalogues the skill, then launched manually with the generated workspace root as cwd.

### Current end-to-end author setup

```bash
npm i -g backlog.md
git clone https://github.com/kukhta-ai/work-package-manager.git
cd work-package-manager
npm ci
npm run build
npm link

wpm skill install
cd ..
wpm init my-package
cd my-package
# Start the user's chosen agent here (Codex, Claude Code, Hermes, OpenClaw, ...).
```

### Updated conclusion

**Confidence: High for the implemented scope model; High for the current npm publication gap.** The user manually launches their agent at the generated workspace root; `wpm` does not spawn it. The authoring skill is loaded from personal scope, while workspace `AGENTS.md` supplies project-local authoring context. A public package name must be secured and the manifest/README aligned before the intended `npm i -g ...` onboarding works as written.
