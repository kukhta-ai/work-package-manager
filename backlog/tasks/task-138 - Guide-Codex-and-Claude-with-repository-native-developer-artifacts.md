---
id: TASK-138
title: Guide Codex and Claude with repository-native developer artifacts
status: In Progress
assignee: []
created_date: '2026-11-05 20:21'
updated_date: '2026-11-05 22:44'
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
- [ ] #1 Both native clients discover equivalent guidance and malformed or escaping managed artifacts fail verification.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source base 6c33347330c225dac198272d2c574228b25bcb05; five canonical .agents skills and generated Claude projections implemented through skill-creator tooling/validators. Root/scoped AGENTS, Claude import, explicit-only release policy, exact client manifest and frozen-index checks are executable. Native artifact suite (36 tests) passed; guard rejects escaping/private/generated references and malformed/stale projections. Local CLI guidance avoids PATH/global fallback.

Actual fresh Codex 0.166.0 read-only ephemeral model session discovered and interpreted five skills/quality routes. Claude 2.1.158 native startup enumerated all five skills and exact executable/static checks passed; its model turn stopped before API request with Not logged in. Static/discovery evidence does not certify autonomous implementation behavior. User authentication, model settings and global configuration were preserved.

Next: staged native-artifact verification and final full-source candidate gate; authenticated Claude behavioral scenarios remain explicit future qualification.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [ ] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [ ] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
