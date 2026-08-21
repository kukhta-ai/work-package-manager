# Spine Pair Review — work-package-manager

> **Adapted review scope:** Epic 2 is a terminal- and agent-mediated onboarding contract, not a graphical interface and not yet a `DESIGN.md`/`EXPERIENCE.md` pair. The rubric therefore treats visual tokens and visual references as not applicable, and reviews the CLI equivalents: journeys, commands/prompts, state transitions, output semantics, inheritance, and downstream story usability.

## Overall verdict

**Thin as a downstream UX contract, directionally strong as a requirements inventory.** Epic 2 names the right capabilities and safety boundaries—explicit selection, advisory detection, confirmation-before-write, headless parity, inert package install, idempotent results, independent target-agent state, and non-destructive migration—but they remain distributed across FRs, NFRs, and investigation prose rather than assembled into executable user journeys and a complete state model. Visual design is genuinely N/A; before story decomposition is approved, the CLI interaction contract needs the four high-impact gaps below resolved so separate implementers do not create different onboarding products.

**Finding count:** critical 0 · high 4 · medium 6 · low 0

## 1. Flow coverage — thin

Checked FR3–FR16, the Epic 2 goal, the investigated end-to-end flow, and current `skill install`/bootstrap guidance. The source requirements imply several journeys, but none is written as a complete Key Flow with a protagonist, numbered beats, a visible success climax, and applicable failure/recovery branches.

### Findings

- **[high] The interactive, headless, repeat, and legacy-migration journeys cannot be source-extracted end to end.** FR7–FR16 name individual capabilities, while the investigation supplies a proposed sequence, but neither source commits the user's observable path from adapter inspection through selection, confirmation, per-destination result, retained defaults, skill reload guidance, and the next safe action (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:34-52`; `_bmad-output/implementation-artifacts/investigations/agent-driven-onboarding-flow-investigation.md:494-501`). This leaves story authors free to order writes before confirmation, omit a recovery beat, or make headless behavior a second-class path. *Fix:* add three compact CLI Key Flows before story approval: (1) interactive multi-client machine with only one selected, (2) headless explicit selection including an undetected-but-supported adapter and invalid-input failure, and (3) repeat/update plus owned and user-modified legacy migration. Each flow should name the success proof and the failure path without prescribing implementation internals.

## 2. Token completeness — N/A

Epic 2 has no graphical surface, `DESIGN.md`, visual token frontmatter, or `{path.to.token}` references. Color, typography, spacing, shape, elevation, and contrast-token validation are not applicable and should not be invented for a terminal workflow.

### Findings

None.

## 3. Component coverage — thin

For this CLI review, “components” means the public interaction surfaces downstream stories must preserve: adapter inventory, detection/status reporting, interactive selection and confirmation, headless selection, setup result reporting, retained defaults, legacy migration, and the `wpm-create-package` bootstrap skill.

### Findings

- **[high] The public CLI interaction surface is not committed.** Epic 2 specifies what setup must accomplish but not which inspect/setup/status entry points expose it or how their human and machine-consumable results relate. The current product has only argument-less `wpm skill install`, whose help promises writes to every detected scope (`src/cli.ts:3351-3385`); the desired contract requires explicit one-or-many selection and separate inspection (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:26-46`). Without a stable public surface, CLI, documentation, packaged skill, completion, and tests can diverge. *Fix:* commit the semantic command topology and result contracts before slicing stories—inventory/detection, interactive setup, headless setup, and repeat/status behavior—while leaving parsing libraries and internal models open.

- **[medium] The adapter catalog does not define user-visible support status for recognized-but-deferred clients.** Current data recognizes Claude Code, Codex, Hermes, and OpenClaw (`src/core/services/agent-aliases.ts:26-32,63-68`), while current scope makes only Codex and Claude Code P0 and defers the other contracts (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:169-170`). FR3 says WPM enumerates “supported” adapters, but does not say whether deferred legacy IDs are hidden, shown as unavailable, or rejected as known-but-unsupported. *Fix:* define the observable catalog categories and selection outcome for P0, recognized/deferred, and unknown IDs; no deferred adapter should be presented as configured successfully.

## 4. State coverage — thin

Walked the personal setup surface through cold/no-detection, detected, selected, confirmed, installed, repeat/update, invalid selection, explicit-undetected selection, legacy migration, and failure states. FR7–FR15 and NFR3–NFR5 cover many invariants, but do not yet close the state transitions or output vocabulary.

### Findings

- **[high] Multi-destination partial failure has no concrete user-facing state model.** NFR4 requires exact completed and failed boundaries plus convergent rerun, while FR13 names only successful `installed`, `updated`, and `unchanged` outcomes (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:46,120-124`). On a Codex+Claude setup, a failure after one personal destination is written must not read like total failure or total success. *Fix:* define one per-destination result vocabulary covering planned/no-write, installed, updated, unchanged, preserved/conflict, completed-before-failure, and failed, plus the aggregate exit/result semantics and rerun promise. Keep rollback explicitly out of the promise.

- **[medium] Interactive selection lacks cancel and pre-confirmation state semantics.** FR7–FR8 distinguish detection, selection, and confirmation, but do not state what is initially selected, how zero detected clients is presented, whether a user can cancel cleanly, or how a selected but undetected supported adapter is explained (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:34-40`). *Fix:* add an interaction-state table for detected suggestion, explicit selection, confirmation summary, cancel, zero-detected recovery, and explicit-undetected selection; every path before confirmation must have a no-write outcome.

- **[medium] Legacy migration is outcome-correct but state-thin.** FR15 and NFR5 preserve unowned or user-modified content, yet do not distinguish an unchanged WPM-owned legacy copy, an obsolete WPM-owned copy, a modified copy, an unowned name collision, and coexistence with an already-current bootstrap skill (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:50,124`). The current implementation overwrites any existing destination it detects and reports only `installed` or `updated` (`src/core/operations/install-authoring-skill.ts:54-74,195-211`), so migration cannot safely inherit today's status language. *Fix:* define the observable migration matrix, including what remains on disk, what is installed alongside it, and the recovery message for every preserved conflict.

## 5. Visual reference coverage — N/A

No `mockups/`, `wireframes/`, visual imports, or graphical IA surfaces apply to this CLI epic. There are no visual-reference links to resolve and no reason to create mockups solely to satisfy the rubric.

### Findings

None.

## 6. Bloat & overspecification — adequate

The adapter paths, stable IDs, bootstrap skill name, status vocabulary, and separation from `manifest.yml.targets` are real public boundaries rather than internal stuffing. The epic is concise and generally avoids implementation prescription.

### Findings

- **[high] FR16 makes Epic 2 own a bootstrap skill whose promised journey terminates on future Epic 3 behavior.** It requires `wpm-create-package` to guide workspace creation and fresh-session handoff (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:52`), but workspace-local skills, front doors, receipts, and verification are Epic 3 outcomes (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:54-78,206-210`). If Epic 2 is independently releasable, its skill either routes to unavailable surfaces or silently weakens FR16. *Fix:* sequence the bootstrap-skill story only after every route it advertises exists, or split/remap its setup-only and complete-handoff acceptance so no shipped skill points at a future capability. Do not create placeholder commands or aspirational instructions.

## 7. Inheritance discipline — adequate

All source paths in the artifact frontmatter resolve, and the central invariants are consistent with the investigations: detection is advisory, personal authoring choice is distinct from deliverable targets, and only the bootstrap skill belongs in personal scope. Two cross-boundary contracts remain under-specified.

### Findings

- **[medium] Retained setup defaults have no complete consumer/override contract.** FR14 says setup retains selected adapters, and FR21 says workspace creation can use them, but it does not define the observable result when explicit workspace selection is also supplied, defaults are absent, or a retained adapter later becomes unavailable/deferred (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:48,62`). *Fix:* define precedence and visibility semantically: how defaults are reported, when explicit workspace selection overrides them, what absence means, and how stale defaults fail or warn—without fixing a storage filename or serializer.

- **[medium] User-facing vocabulary drifts among “adapter,” “client,” “agent,” “coding-agent configuration,” and “authoring agent.”** These terms appear within one short requirement run (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:24-52`), while `manifest.yml.targets` also uses agent identities for a different axis. *Fix:* add a compact glossary and use one noun for selectable authoring integrations, one for detected native applications, and one for deliverable target agents across CLI help, results, skills, and stories.

## 8. Shape fit — thin

Canonical `DESIGN.md` shape is not applicable. The CLI equivalent of the `EXPERIENCE.md` behavioral spine is only partially present: form factor and safety principles can be inferred, but IA/command surfaces, voice and output rules, interaction primitives, state patterns, accessibility floor, and Key Flows are not assembled in one reviewable contract. The artifact itself acknowledges that no standalone UX document exists (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:177-179`).

### Findings

- **[medium] Terminal output and accessibility conventions stop short of a usable interaction floor.** NFR9 and NFR12 require headless parity, machine-distinguishable failures, help, and recovery (`_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md:132-138`), but do not cover non-color-dependent detection/selection cues, no-TTY behavior, prompt cancellation, stable stdout/stderr separation, or readable summaries for narrow/plain terminals. *Fix:* add a lightweight CLI experience appendix covering command IA, prompt and cancellation rules, output ordering, plain/non-color semantics, stdout/stderr and exit behavior, and headless equivalence. A visual design spine is unnecessary.

## Mechanical notes

- Reviewed sources: Epic 2/FR3–FR16 and relevant NFRs/additional requirements; both onboarding investigations; current `wpm skill install`, adapter maps, init guidance, README onboarding, and packaged `installer-builder` skill/reference surfaces.
- `_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md` currently contains approved Epic 2 scope but no Epic 2 stories; the review therefore assesses whether the source is ready to generate them, not story conformance after generation.
- No `DESIGN.md`, `EXPERIENCE.md`, token references, components in the visual-design sense, mockups, wireframes, imports, or Mermaid diagrams were supplied. Their visual-only checks are N/A rather than failures.
- No broken source-frontmatter paths were found. The principal reference problem is semantic: FR16 crosses the Epic 2→3 availability boundary, and FR14/FR21 lack a fully committed default-consumption seam.
- Current implementation terminology and behavior (`installer-builder`; detected-all `wpm skill install`; `installed|updated`) are baseline migration inputs, not the desired Epic 2 contract (`src/cli.ts:3336-3387`; `src/core/operations/install-authoring-skill.ts:149-211`).
