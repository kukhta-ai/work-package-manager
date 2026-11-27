---
type: C4 Component
title: Shell completion
status: stable
groma:
  id: shell-completion
  parent: wpm-cli
  code:
    - scanner: typescript
      file: src/completion/complete.ts
    - scanner: typescript
      file: src/completion/skills-on-disk.ts
      symbol: skillNamesOnDisk
    - scanner: typescript
      file: src/completion/bundle-ids.ts
      symbol: bundleIds
    - scanner: typescript
      file: src/completion/payload-files-registered.ts
    - scanner: typescript
      file: src/completion/enums.ts
    - scanner: typescript
      file: src/completion/sources.ts
    - scanner: typescript
      file: src/completion/project-installer-skills.ts
    - scanner: typescript
      file: src/completion/installer-skills-on-disk.ts
      symbol: installerSkillNamesOnDisk
    - scanner: typescript
      file: src/completion/registry.ts
      symbol: defaultRegistry
    - scanner: typescript
      file: src/completion/skills-registered.ts
      symbol: skillNamesRegistered
    - scanner: typescript
      file: src/completion/agent-names.ts
    - scanner: typescript
      file: src/completion/bundle-requires.ts
      symbol: bundleRequires
    - scanner: typescript
      file: src/completion/disabled-bundle-ids.ts
      symbol: disabledBundleIds
    - scanner: typescript
      file: src/completion/skills-removable.ts
      symbol: skillNamesRemovable
    - scanner: typescript
      file: src/completion/template-names.ts
    - scanner: typescript
      file: src/completion/installer-skills-registered.ts
      symbol: installerSkillNamesRegistered
    - scanner: typescript
      file: src/completion/payload-files-on-disk.ts
  group: CLI interaction
description: Resolves command, option and project-specific completion candidates.
---

The dispatcher follows the Commander command tree and asks a named source registry for value candidates. Sources inspect project state through injected filesystem and environment ports and degrade to no suggestions when state is unavailable. The CLI shell integration owns terminal interaction.
