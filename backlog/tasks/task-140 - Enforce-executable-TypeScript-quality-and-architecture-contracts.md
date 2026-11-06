---
id: TASK-140
title: Enforce executable TypeScript quality and architecture contracts
status: In Progress
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-06 00:24'
labels: []
dependencies: []
modified_files:
  - .dependency-cruiser.cjs
  - biome.json
  - eslint.config.mjs
  - knip.json
  - package-lock.json
  - package.json
  - quality/minimatch-compatibility.json
  - quality/mutation-waivers.json
  - quality/pure-eslint.config.mjs
  - scripts/architecture.mjs
  - scripts/check-process-artifacts.mjs
  - scripts/json.mjs
  - scripts/mutation.mjs
  - scripts/qualify-apm.mjs
  - scripts/quality.mjs
  - src/adapters/backlog-cli.ts
  - src/adapters/fake-backlog.ts
  - src/adapters/fake-env.ts
  - src/adapters/fixed-clock.ts
  - src/adapters/index.ts
  - src/adapters/memory-fs.ts
  - src/adapters/node-fs.ts
  - src/adapters/packager.ts
  - src/cli.ts
  - src/completion/agent-names.ts
  - src/completion/bundle-ids.ts
  - src/completion/bundle-requires.ts
  - src/completion/complete.ts
  - src/completion/enums.ts
  - src/completion/template-names.ts
  - src/core/errors.ts
  - src/core/model/archive.ts
  - src/core/model/bundle.ts
  - src/core/model/confirmation.ts
  - src/core/model/index.ts
  - src/core/model/manifest.ts
  - src/core/model/personal-setup.ts
  - src/core/model/skill-ref.ts
  - src/core/operations/advisor-commands.ts
  - src/core/operations/advisor.ts
  - src/core/operations/authoring-clients.ts
  - src/core/operations/build.ts
  - src/core/operations/bundle-authoring.ts
  - src/core/operations/bundle-lifecycle.ts
  - src/core/operations/bundle-list.ts
  - src/core/operations/bundle-meta.ts
  - src/core/operations/bundle-reads.ts
  - src/core/operations/bundle-remove.ts
  - src/core/operations/bundle-requires.ts
  - src/core/operations/bundle-version.ts
  - src/core/operations/create-bundle.ts
  - src/core/operations/derive-artefacts-capability.ts
  - src/core/operations/init-project.ts
  - src/core/operations/installer-skills-project.ts
  - src/core/operations/lifecycle.ts
  - src/core/operations/payload-refs.ts
  - src/core/operations/personal-authoring-setup.ts
  - src/core/operations/project-meta.ts
  - src/core/operations/scaffold-skill.ts
  - src/core/operations/skill-refs.ts
  - src/core/operations/targets.ts
  - src/core/operations/version.ts
  - src/core/operations/workspace-authoring-integration.ts
  - src/core/operations/workspace-handoff.ts
  - src/core/ports/index.ts
  - src/core/services/agent-aliases.ts
  - src/core/services/bundle-authoring-contributions.ts
  - src/core/services/bundle-authoring-task-plan.ts
  - src/core/services/bundle-mandatory-references.ts
  - src/core/services/context.ts
  - src/core/services/derived-artefacts.ts
  - src/core/services/frontmatter.ts
  - src/core/services/integrity.ts
  - src/core/services/materialisation.ts
  - src/core/services/personal-authoring-setup.ts
  - src/core/services/project-authoring-task-plan.ts
  - src/core/services/schema/bundle.ts
  - src/core/services/schema/index.ts
  - src/core/services/schema/manifest.ts
  - src/core/services/schema/problems.ts
  - src/core/services/schema/template.ts
  - src/core/services/skill-ref-path.ts
  - src/core/services/template-authoring-tasks.ts
  - src/core/services/template-resolver.ts
  - src/core/services/version-constraint.ts
  - src/core/services/workspace-authoring-integration.ts
  - src/core/services/workspace-handoff.ts
  - src/help/examples.ts
  - src/util/completion-install.ts
  - src/util/confirm.ts
  - src/util/exit.ts
  - src/util/shell.ts
  - src/util/yaml.ts
  - src/version.ts
  - stryker.config.mjs
  - test/doubles/fake-backlog.ts
  - test/doubles/fake-env.ts
  - test/doubles/fixed-clock.ts
  - test/doubles/memory-fs.ts
  - test/helpers/legacy-create-bundle.ts
  - test/helpers/legacy-lockfile.ts
  - test/helpers/legacy-serialization.ts
  - test/helpers/match.ts
  - test/integration/adapters/backlog-cli.test.ts
  - test/integration/adapters/backlog-parity.test.ts
  - test/integration/adapters/packager.test.ts
  - test/integration/architecture-quality.test.ts
  - test/integration/cli.authoring-clients.test.ts
  - test/integration/cli.build.e2e.test.ts
  - test/integration/cli.bundle-id.e2e.test.ts
  - test/integration/cli.bundle-lifecycle.e2e.test.ts
  - test/integration/cli.bundle-new.test.ts
  - test/integration/cli.bundle-remove-list.e2e.test.ts
  - test/integration/cli.bundle-template.e2e.test.ts
  - test/integration/cli.init.test.ts
  - test/integration/cli.project-installer-skills.e2e.test.ts
  - test/integration/cli.project-reads.test.ts
  - test/integration/cli.skill-install.test.ts
  - test/integration/cli.template-show.e2e.test.ts
  - test/integration/cli.version.test.ts
  - test/integration/cli.workspace-authoring-integration.test.ts
  - test/integration/cli.workspace-handoff.test.ts
  - test/integration/core-boundary.test.ts
  - test/integration/docs-template-examples.e2e.test.ts
  - test/integration/package-runtime-support.test.ts
  - test/integration/templates/default-bundle-install-backlog.test.ts
  - test/unit/adapters/fake-backlog.test.ts
  - test/unit/adapters/fake-env.test.ts
  - test/unit/adapters/fixed-clock.test.ts
  - test/unit/adapters/memory-fs.test.ts
  - test/unit/agent-skills/wpm-author-bundle-skill.test.ts
  - test/unit/agent-skills/wpm-author-recipe-skill.test.ts
  - test/unit/agent-skills/wpm-author-router-skill.test.ts
  - test/unit/agent-skills/wpm-author-skill-skill.test.ts
  - test/unit/agent-skills/wpm-create-package-skill.test.ts
  - test/unit/agent-skills/wpm-review-package-skill.test.ts
  - test/unit/cli.smoke.test.ts
  - test/unit/cli/authoring-clients-commands.test.ts
  - test/unit/cli/build-commands.test.ts
  - test/unit/cli/bundle-advisor-commands.test.ts
  - test/unit/cli/bundle-files-commands.test.ts
  - test/unit/cli/bundle-id-commands.test.ts
  - test/unit/cli/bundle-installer-skills-commands.test.ts
  - test/unit/cli/bundle-lifecycle-commands.test.ts
  - test/unit/cli/bundle-list-commands.test.ts
  - test/unit/cli/bundle-remove-commands.test.ts
  - test/unit/cli/bundle-requires-commands.test.ts
  - test/unit/cli/bundle-scripts-commands.test.ts
  - test/unit/cli/bundle-skills-commands.test.ts
  - test/unit/cli/bundle-template-commands.test.ts
  - test/unit/cli/bundle-templates-commands.test.ts
  - test/unit/cli/bundle-version-commands.test.ts
  - test/unit/cli/cli.acceptance.test.ts
  - test/unit/cli/dispatch-di.test.ts
  - test/unit/cli/help-contract.test.ts
  - test/unit/cli/personal-authoring-setup-commands.test.ts
  - test/unit/cli/project-installer-skills-commands.test.ts
  - test/unit/cli/project-meta-commands.test.ts
  - test/unit/cli/project-reads-commands.test.ts
  - test/unit/cli/skill-commands.test.ts
  - test/unit/cli/targets-commands.test.ts
  - test/unit/cli/template-commands.test.ts
  - test/unit/cli/version-commands.test.ts
  - test/unit/completion/completion.test.ts
  - test/unit/errors.acceptance.test.ts
  - test/unit/minimatch-compatibility.test.ts
  - test/unit/mutation.test.ts
  - test/unit/operations/build.test.ts
  - test/unit/operations/bundle-authoring.test.ts
  - test/unit/operations/bundle-remove.test.ts
  - test/unit/operations/create-bundle.acceptance.test.ts
  - test/unit/operations/create-bundle.test.ts
  - test/unit/operations/init-project.test.ts
  - test/unit/operations/lifecycle.acceptance.test.ts
  - test/unit/operations/lifecycle.test.ts
  - test/unit/operations/personal-authoring-setup.test.ts
  - test/unit/operations/scaffold-skill.test.ts
  - test/unit/operations/skill-refs.test.ts
  - test/unit/operations/workspace-authoring-integration.test.ts
  - test/unit/operations/workspace-handoff.test.ts
  - test/unit/process-artifacts/policy.test.ts
  - test/unit/process-artifacts/repository.test.ts
  - test/unit/quality-orchestration.test.ts
  - test/unit/quality.test.ts
  - test/unit/schema/bundle.test.ts
  - test/unit/schema/manifest.test.ts
  - test/unit/schema/template.test.ts
  - test/unit/services/authoring-clients.test.ts
  - test/unit/services/bundle-authoring-task-plan.test.ts
  - test/unit/services/context.acceptance.test.ts
  - test/unit/services/context.test.ts
  - test/unit/services/integrity.acceptance.test.ts
  - test/unit/services/integrity.test.ts
  - test/unit/services/materialisation.test.ts
  - test/unit/services/personal-authoring-setup.test.ts
  - test/unit/services/project-authoring-task-plan.test.ts
  - test/unit/services/template-authoring-tasks.test.ts
  - test/unit/services/template-resolver.acceptance.test.ts
  - test/unit/services/template-resolver.test.ts
  - test/unit/templates/default-bundle.test.ts
  - test/unit/templates/minimal-project.acceptance.test.ts
  - test/unit/templates/minimal-project.test.ts
  - test/unit/util/exit.test.ts
  - test/unit/util/yaml.test.ts
  - tsconfig.json
  - vitest.mutation.config.ts
  - vitest.config.ts
  - test/integration/cli.bin.test.ts
  - test/helpers/workspace.ts
  - test/helpers/integration-environment.ts
  - test/integration/setup.ts
  - test/integration/environment-isolation.test.ts
ordinal: 140000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Transitive architecture bypasses and missing quality analyzers fail an executable gate.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source base 6c33347330c225dac198272d2c574228b25bcb05; strict/exact-optional TypeScript, Biome, typed ESLint(no inline disabling), dependency-cruiser/transitive ambient-effect gates and Knip default+production are enforced. Test doubles/fixture writers moved out of shipped source, cycles removed and unused exports eliminated. Actual policy band passed architecture (127 modules) and all mandatory analyzers; real negative fixtures cover aliases/re-exports/JS utilities/unresolved or empty graphs/layer bypasses.

Critical Stryker gate accepted a 99.53% raw score: 413 Killed, 8 Timeout, 2 independently reviewed semantic equivalents, 0 NoCoverage, 0 unreviewed; one unscored invalid-schema initialization RuntimeError retained explicitly. Waivers bind exact source/validator versions and semantic fingerprints. Unit checkpoint (1884 tests) passed; final delivery focused suite (49 tests) independently passed.

OSV found eight affected development dependencies missed by npm audit; package-manager updates/temporary overrides fixed them. Final OSV: 552 packages, zero affected. Minimatch 11.0.1 major override preserves 385 captured cases through four actual parent APIs; actual lint/graph/mutation gates pass. Next: full frozen-source integration/release qualification and durable candidate evidence.

Integration infrastructure now uses four isolated forks with unit group before integration, fresh HOME/XDG/AppData before imports, preserved verified npm archive cache, and mandatory exact local Backlog/shim checks with a fail-closed guard. The linked-bin test owns its source/dependencies/builds; all 448 shared dist identities stayed unchanged. Eleven environment and thirteen native/bin checks passed; mixed-project smoke passed 16 tests. Root TypeScript configs are now included in typed lint/typecheck. Final full release gate remains pending the clean source commit.

2026-11-06 checkpoint: exact source 1632e0410205f33b8631f7f1dbb1a48538867b43 passed the mandatory quality:release band on Node 24.22.2/npm 11.19.1 Linux arm64: 165 files, 2303 tests passed, one Windows-only filesystem test skipped, 2736.00 s. Security/architecture/Knip/Groma and reviewed mutation gates passed. Candidate preparation subsequently refused contributor-local ignored state because it invoked the strict package boundary against the root checkout after quality populated .quality. No candidate was persisted. The boundary is retained; an independently reviewed owned exact-revision producer clone with its own locked install is being implemented. Next: focused regression/review, commit the stable fix, then rerun mandatory exact-source candidate qualification.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
