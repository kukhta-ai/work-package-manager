---
id: TASK-138
title: Guide Codex and Claude with repository-native developer artifacts
status: Done
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-06 01:23'
labels: []
dependencies: []
modified_files:
  - .agents/manifest.json
  - .agents/skills/wpm-repo-architecture/SKILL.md
  - .agents/skills/wpm-repo-architecture/agents/openai.yaml
  - .agents/skills/wpm-repo-dev/SKILL.md
  - .agents/skills/wpm-repo-dev/agents/openai.yaml
  - .agents/skills/wpm-repo-release/SKILL.md
  - .agents/skills/wpm-repo-release/agents/openai.yaml
  - .agents/skills/wpm-repo-review/SKILL.md
  - .agents/skills/wpm-repo-review/agents/openai.yaml
  - .agents/skills/wpm-repo-test/SKILL.md
  - .agents/skills/wpm-repo-test/agents/openai.yaml
  - .claude/skills/wpm-repo-architecture/SKILL.md
  - .claude/skills/wpm-repo-dev/SKILL.md
  - .claude/skills/wpm-repo-release/SKILL.md
  - .claude/skills/wpm-repo-review/SKILL.md
  - .claude/skills/wpm-repo-test/SKILL.md
  - .husky/pre-commit
  - AGENTS.md
  - CLAUDE.md
  - docs/development.md
  - scripts/agents.mjs
  - src/core/AGENTS.md
  - test/unit/agents.test.ts
ordinal: 138000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both native clients discover equivalent guidance and malformed or escaping managed artifacts fail verification.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Five canonical .agents skills and generated Claude projections are implemented through skill-creator tooling and validators. Root/scoped AGENTS, Claude import, explicit-only release metadata, pinned client manifest, confined references and frozen-index checking are executable. Native-artifact guards reject malformed, stale, private or escaping inputs; staged verification passed. Guidance uses local Backlog/Groma entry points.

Qualified exact source f716aedbe4b4c586819a3169a3aeb7d5c8f35524 on Linux arm64, Node 24.22.2/npm 11.19.1. Mandatory npm run quality:release passed: 165 files, 2305 tests passed, one native Windows-only filesystem test skipped, 2734.54 s. TypeScript/Biome/typed ESLint, architecture, both Knip modes, native artifacts, security, Groma and reviewed mutation checks passed.

Fresh Codex 0.166.0 read-only ephemeral model session discovered/interpreted the five managed skills and quality routes. Claude 2.1.158 native startup discovered the five managed skills; executable/static checks passed. Its attempted model turn stopped before API request with Not logged in. User authentication/settings/global configuration were preserved. Canonical process: docs/development.md.

Limits: discovery/static evidence does not certify autonomous implementation behavior. Authenticated Claude model scenarios require that environment. Next: review the native artifacts; publication remains inactive.
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
