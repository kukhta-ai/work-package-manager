---
id: TASK-139
title: Verify architecture and release candidates in private CI
status: Done
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-06 01:23'
labels: []
dependencies: []
modified_files:
  - .github/PULL_REQUEST_TEMPLATE.md
  - .github/dependabot.yml
  - .github/workflows/candidate.yml
  - .github/workflows/ci.yml
  - distribution-preparation/assess-convergence.js
  - distribution-preparation/assess-github.js
  - distribution-preparation/assess-npm.js
  - distribution-preparation/assess-readiness.js
  - distribution-preparation/assessment-files.js
  - distribution-preparation/candidate.js
  - distribution-preparation/convergence-assessment.js
  - distribution-preparation/github-assessment.js
  - distribution-preparation/package-archive.js
  - distribution-preparation/package-boundary.js
  - distribution-preparation/prepare-candidate.js
  - distribution-preparation/prepare-package.js
  - distribution-preparation/verify-packed-install.js
  - docs/delivery.md
  - docs/groma.md
  - groma/actors/work-package-author.md
  - groma/config.json
  - groma/externals/apm-cli.md
  - groma/externals/backlog-md-cli.md
  - groma/externals/recipient-coding-agent.md
  - groma/flows/author-a-plain-work-package.md
  - groma/index.md
  - groma/project.md
  - groma/systems/wpm/containers/wpm-cli/components/advisor-commands.md
  - groma/systems/wpm/containers/wpm-cli/components/advisor.md
  - groma/systems/wpm/containers/wpm-cli/components/agent-aliases.md
  - groma/systems/wpm/containers/wpm-cli/components/apm.md
  - groma/systems/wpm/containers/wpm-cli/components/backlog-cli.md
  - groma/systems/wpm/containers/wpm-cli/components/build.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/bundle-authoring-contributions.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/bundle-authoring-task-plan.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-authoring.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-lifecycle.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-list.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/bundle-mandatory-references.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-meta.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-reads.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-remove.md
  - groma/systems/wpm/containers/wpm-cli/components/bundle-version.md
  - groma/systems/wpm/containers/wpm-cli/components/code-unit-order.md
  - groma/systems/wpm/containers/wpm-cli/components/completion-install.md
  - groma/systems/wpm/containers/wpm-cli/components/confirm.md
  - groma/systems/wpm/containers/wpm-cli/components/confirmation.md
  - groma/systems/wpm/containers/wpm-cli/components/context.md
  - groma/systems/wpm/containers/wpm-cli/components/create-bundle.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/derive-artefacts-capability.md
  - groma/systems/wpm/containers/wpm-cli/components/derived-artefacts.md
  - groma/systems/wpm/containers/wpm-cli/components/descriptor-codecs.md
  - groma/systems/wpm/containers/wpm-cli/components/domain-contract.md
  - groma/systems/wpm/containers/wpm-cli/components/effect-ports.md
  - groma/systems/wpm/containers/wpm-cli/components/errors.md
  - groma/systems/wpm/containers/wpm-cli/components/examples.md
  - groma/systems/wpm/containers/wpm-cli/components/exit.md
  - groma/systems/wpm/containers/wpm-cli/components/frontmatter.md
  - groma/systems/wpm/containers/wpm-cli/components/init-project.md
  - groma/systems/wpm/containers/wpm-cli/components/installer-skills-project.md
  - groma/systems/wpm/containers/wpm-cli/components/integrity.md
  - groma/systems/wpm/containers/wpm-cli/components/lifecycle.md
  - groma/systems/wpm/containers/wpm-cli/components/materialisation.md
  - groma/systems/wpm/containers/wpm-cli/components/node-fs.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/operations-authoring-clients.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/operations-bundle-requires.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/operations-personal-authoring-setup.md
  - groma/systems/wpm/containers/wpm-cli/components/operations-version.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/operations-workspace-authoring-integration.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/operations-workspace-handoff.md
  - groma/systems/wpm/containers/wpm-cli/components/packager.md
  - groma/systems/wpm/containers/wpm-cli/components/payload-refs.md
  - groma/systems/wpm/containers/wpm-cli/components/personal-setup.md
  - groma/systems/wpm/containers/wpm-cli/components/portable-tree.md
  - groma/systems/wpm/containers/wpm-cli/components/posix-path.md
  - groma/systems/wpm/containers/wpm-cli/components/process-env.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/project-authoring-task-plan.md
  - groma/systems/wpm/containers/wpm-cli/components/project-meta.md
  - groma/systems/wpm/containers/wpm-cli/components/project-reads.md
  - groma/systems/wpm/containers/wpm-cli/components/render.md
  - groma/systems/wpm/containers/wpm-cli/components/scaffold-skill.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/services-authoring-clients.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/services-personal-authoring-setup.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/services-workspace-authoring-integration.md
  - >-
    groma/systems/wpm/containers/wpm-cli/components/services-workspace-handoff.md
  - groma/systems/wpm/containers/wpm-cli/components/shell-completion.md
  - groma/systems/wpm/containers/wpm-cli/components/shell.md
  - groma/systems/wpm/containers/wpm-cli/components/skill-ref-path.md
  - groma/systems/wpm/containers/wpm-cli/components/skill-ref.md
  - groma/systems/wpm/containers/wpm-cli/components/skill-refs.md
  - groma/systems/wpm/containers/wpm-cli/components/source-text.md
  - groma/systems/wpm/containers/wpm-cli/components/src-cli.md
  - groma/systems/wpm/containers/wpm-cli/components/src-version.md
  - groma/systems/wpm/containers/wpm-cli/components/symlink.md
  - groma/systems/wpm/containers/wpm-cli/components/system-clock.md
  - groma/systems/wpm/containers/wpm-cli/components/targets.md
  - groma/systems/wpm/containers/wpm-cli/components/template-authoring-tasks.md
  - groma/systems/wpm/containers/wpm-cli/components/template-resolver.md
  - groma/systems/wpm/containers/wpm-cli/components/validate.md
  - groma/systems/wpm/containers/wpm-cli/components/version-constraint.md
  - groma/systems/wpm/containers/wpm-cli/components/vnext-cli.md
  - groma/systems/wpm/containers/wpm-cli/components/vnext-contract.md
  - groma/systems/wpm/containers/wpm-cli/components/vnext-workspace.md
  - groma/systems/wpm/containers/wpm-cli/components/yaml.md
  - groma/systems/wpm/containers/wpm-cli/container.md
  - groma/systems/wpm/system.md
  - package-lock.json
  - package.json
  - quality/fixtures/osv-npm-known-vulnerability.json
  - quality/python-requirements.in
  - quality/python-requirements.lock
  - quality/secret-policy.json
  - quality/semgrep-tests.js
  - quality/semgrep.yml
  - quality/toolchain.json
  - scripts/candidate.mjs
  - scripts/groma.mjs
  - scripts/python-environment.mjs
  - scripts/quality-tools.mjs
  - scripts/secret-policy.mjs
  - scripts/security-commands.mjs
  - scripts/security-qualification.mjs
  - scripts/security.mjs
  - test/integration/distribution-preparation/package-preparation.test.ts
  - test/integration/distribution-preparation/packed-install.test.ts
  - test/integration/distribution-preparation/public-surfaces.test.ts
  - test/unit/candidate-publint.test.ts
  - test/unit/candidate-qualification.test.ts
  - test/unit/distribution-preparation/assess-convergence.test.ts
  - test/unit/distribution-preparation/assess-github.test.ts
  - test/unit/distribution-preparation/assess-npm.test.ts
  - test/unit/distribution-preparation/candidate.test.ts
  - test/unit/distribution-preparation/convergence-assessment.test.ts
  - test/unit/distribution-preparation/github-assessment.test.ts
  - test/unit/distribution-preparation/json-fixtures.ts
  - test/unit/distribution-preparation/npm-assessment.test.ts
  - test/unit/distribution-preparation/package-boundary.test.ts
  - test/unit/distribution-preparation/packed-install.test.ts
  - test/unit/distribution-preparation/prepare-candidate.test.ts
  - test/unit/distribution-preparation/readiness.test.ts
  - test/unit/groma-contract.test.ts
  - test/unit/python-environment.test.ts
  - test/unit/secret-policy.test.ts
  - test/unit/security-contract.test.ts
  - test/unit/security-qualification.test.ts
ordinal: 139000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A candidate is bound to its checked source and exact archive and untrusted CI cannot publish it.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Private read-only CI, pinned Actions/tools, a fail-closed aggregate, Groma and inactive candidate prepare/verify are implemented. Exact producer clone retains the full committed tree, installs its own locked SDK and preserves contributor ignored state/root dist. Git trust is limited to the exact source checkout/Git directory in owned temporary configuration. Independent real Git/npm regression review passed 11 tests; actual foreign-UID repository preflight, publint and fresh mapped-peer installation passed.

Qualified exact source f716aedbe4b4c586819a3169a3aeb7d5c8f35524 on Linux arm64, Node 24.22.2/npm 11.19.1. Mandatory npm run quality:release passed: 165 files, 2305 tests passed, one native Windows-only filesystem test skipped, 2734.54 s. TypeScript/Biome/typed ESLint, architecture, both Knip modes, native artifacts, security, Groma and reviewed mutation checks passed.

Groma 0.7.8/scanner 0.2.4 check passed with 87 records and preserved curation; the deployment container remains DRAFT and 42 duplicate heuristics advisory. Actual 21 native security controls passed, including same-rule secret detection inside narrowly approved public examples. Semgrep: 146 files/complete parse/zero findings; Gitleaks: zero; actionlint/zizmor passed; refreshed OSV: 552 packages/zero affected. No vulnerability exceptions or broad vendor ignores.

Candidate sha256:a78b267215722ea6107936829af2ba6b0396ae61abaaf57099faf2a885b16e06, source f716aedbe4b4c586819a3169a3aeb7d5c8f35524, archive SHA256 2e0b1cd0cec1d912ce98945a6ec7c31e0b676c760b2f106e64e7a315b9a8f8e4, size 731345 bytes. Persisted at /workspace/active/wpm-vnext-candidate-final; qualification binds Node/npm/platform/lock digest. candidate:prepare, independent candidate:verify and same-request reuse passed; all seven candidate files remained byte-identical. Strict publint and fresh ordinary npm installation qualified explicit Backlog 1.45.2, retaining legacy >=1 peer metadata. Publication is inactive.

Limits: remote GitHub jobs, other host/runtime cells and branch protection were not executed/configured locally; no publisher/OIDC authority was activated. Newer peers are not inferred qualified. Canonical contracts: docs/delivery.md and docs/groma.md. Next: human review; remote administration/distribution requires separate authorization.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and locally qualified at f716aedbe4b4c586819a3169a3aeb7d5c8f35524; mandatory full release gate passed, exact inactive candidate verified. See implementation notes for scope and limitations.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
