---
id: TASK-139
title: Verify architecture and release candidates in private CI
status: In Progress
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-06 00:32'
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
- [ ] #1 A candidate is bound to its checked source and exact archive and untrusted CI cannot publish it.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source base 6c33347330c225dac198272d2c574228b25bcb05; private read-only CI, pinned Actions/tools, required aggregate and inactive candidate prepare/verify implemented. Groma 0.7.8 / scanner 0.2.4 actual scan/check passed (87 records); repeated scans preserve curation. The CLI deployment container remains DRAFT because the scanner cannot establish that boundary automatically ; 42 duplicate heuristics are advisory. Source exports stay private.

Actual security qualification (21 native controls) passed through shared production command builders, including complete Markdown fixtures and same-rule secrets in narrowly approved public-example files. Full-source Semgrep (146 files, zero findings, complete parse), Gitleaks (zero findings), actionlint/zizmor, tool doctor and fresh hash-locked Python tamper controls passed. Actual OSV refreshed DB scan (552 packages, zero affected). No vulnerability exceptions or broad vendor/path ignores.

Real full packed consumer journey passed in 129.83 s. Explicit root-lock-verified cache/peer archives retain ordinary npm installation and qualify mapped Backlog 1.45.2 while preserving legacy >=1 peer metadata. Candidate reuse binds source/notes/lock and explicit peer identities; captured original bytes are staged after quality. Independent focused suite (49 tests) passed. Next: clean source commit and actual candidate quality:release/prepare/verify. No remote CI, administrative protection or publication claimed.

2026-11-06 checkpoint: exact source 1632e0410205f33b8631f7f1dbb1a48538867b43 passed the mandatory quality:release band on Node 24.22.2/npm 11.19.1 Linux arm64: 165 files, 2303 tests passed, one Windows-only filesystem test skipped, 2736.00 s. Security/architecture/Knip/Groma and reviewed mutation gates passed. Candidate preparation subsequently refused contributor-local ignored state because it invoked the strict package boundary against the root checkout after quality populated .quality. No candidate was persisted. The boundary is retained; an independently reviewed owned exact-revision producer clone with its own locked install is being implemented. Next: focused regression/review, commit the stable fix, then rerun mandatory exact-source candidate qualification.

Producer fix ready: unchanged strict package boundary now runs in an owned full-tree Git clone at the captured commit with a fresh locked npm ci and isolated Git/npm environment. Independent review found no blocker; two real Git/npm fixture files passed 11 tests. Full quality:fast passed on the stable fix. Original ignored state/root dist/SDK stay intact; export-ignore tracked build inputs are retained and required ignored build inputs fail. Next: commit, real-repository producer preflight, then mandatory full candidate qualification on the new source revision.

Real-repository producer preflight at a9080ad191e6c9bcd06815b27832de6e531ee2c1 exposed shared-workspace UID ownership after system Git trust was isolated. The fix grants only canonical source checkout and actual Git directory paths in the owned temporary Git config; no wildcard or user/system configuration is changed. Existing producer regressions now also check exact trust entries and paths with spaces. Next: independent focused review, commit, repeat the real producer/consumer preflight, then full mandatory candidate band.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
