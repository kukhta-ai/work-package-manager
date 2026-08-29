---
id: TASK-74
title: Implement the wpm bundle ID skills add command
status: Done
assignee: []
created_date: '2026-06-01 02:23'
updated_date: '2026-06-01 17:11'
labels:
  - cli
dependencies:
  - TASK-33
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-bundle command (doc 10): registers a payload runtime agent skill (the delivered product). With an existing SKILL.md it attaches after validating frontmatter; with none and no --path it scaffolds a payload-skill stub from the template snippet and materialises a write-payload-skill task (doc 11); registers either way. Structure-not-content: never authors the skill body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a SKILL.md exists at the resolved path (default payload/agent-skills/name/SKILL.md) or the --path location, its frontmatter is validated and the reference is registered.
- [x] #2 When none exists and no --path is given, a payload-skill stub with frontmatter plus a placeholder runtime-trigger description and no invented prose is rendered at the conventional path, a write-payload-skill task is materialised, and the reference is registered.
- [x] #3 When --path is given but nothing exists there, the command fails with a typed error.
- [x] #4 The command prints what it did (attached, or scaffolded with the materialised task id).
- [x] #5 Run outside any project it exits non-zero naming the missing manifest.yml and suggesting init or the -C override; the id completes from enabled bundles.
- [x] #6 Help output is substantive (description, synopsis, the name positional and --path, an example); on success exits 0.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bundle id skills add. BMAD skills run: bmad-create-story, bmad-dev-story, bmad-qa-generate-e2e-tests (worker8); bmad-story-automator-review (reviewer APPROVE, thorough). ESTABLISHES the skill scaffold-or-attach pattern. 3-way add (doc-10:170): attach (SKILL.md at default payload/agent-skills/name/SKILL.md or --path, validate frontmatter, register) | scaffold (none and no --path, render a payload-skill stub from the project-template snippet with a placeholder runtime-trigger description and no invented prose, materialise Write payload skill name for id, register) | error (--path but nothing there, exit 1). Reusable core skill-refs.ts (SkillRefDescriptor); scaffold-skill.ts generalizes scaffoldAdvisor to renderSkillStub (advisor.ts delegates, PROVEN byte-identical bundle-new advisor pre/post by SHA256); frontmatter.ts pure validator (requires name+description, all malformed heads to ValidationError exit 1, nothing registered). Registry payload.skills as name+path objects (path captured because --path relocates), absent maps to empty, backward-compatible. Verified on the real binary. Gate 923.
<!-- SECTION:NOTES:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Typechecks clean (tsc --noEmit) and Biome clean (biome ci)
- [x] #2 Tests added and green (vitest): unit for pure logic, integration where it touches ports
- [x] #3 Public functions documented; no dead code; the core import-boundary rule is not violated
<!-- DOD:END -->
