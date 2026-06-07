---
id: TASK-86
title: Specify the workspace CLI and build behavior in the design set
status: To Do
assignee: []
created_date: '2026-06-06 23:38'
updated_date: '2026-06-06 23:55'
labels:
  - authoring-workspace
  - docs
dependencies:
  - TASK-85
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Companion to task 85: evolves the CLI and build docs so the tool creates and operates the workspace. The executor front door becomes a build artifact so it never competes with the authoring front door in the working tree, and the install contract and process are clarified to apply to the un-nested archive. Edits the human-owned design set. Depends on task 85 so the layout vocabulary is fixed first. Docs: 10, 12, 07, 09, and the authoring-backlog catalog in 11. Non-goals: the layout and authoring-side spec (task 85); any code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 doc 10 specifies that init creates an authoring workspace (authoring front door and authoring backlog at the root, the deliverable subdirectory, and the build-output directory) rather than the deliverable at the project root.
- [ ] #2 doc 10 specifies that project-bound commands resolve the workspace and operate on the deliverable subdirectory, and that a command run anywhere within the workspace resolves the same deliverable root.
- [ ] #3 doc 10 specifies that a project-bound command run outside any workspace fails, naming the workspace marker and pointing at init or the -C override.
- [ ] #4 doc 10 specifies that build writes the packaged artifact into the build-output directory, named by the project release name and version, with the artifact root being the un-nested deliverable.
- [ ] #5 doc 12 specifies that the authoring backlog, the authoring front door, and the build-output directory are excluded from every build artifact.
- [ ] #6 docs 07 and 09 state that the install contract and installation process apply to the un-nested built archive whose root is the deliverable, and that the workspace wrapper is not part of the shipped artifact.
- [ ] #7 doc 12 specifies that the deliverable executor front door is author-owned content held under a reserved, build-stripped prefix so it is editable but not auto-discovered during authoring, and that the build restores it to its canonical name in the archive, while the per-project installer skill and advisors remain authored deliverable content.
- [ ] #8 the authoring-backlog catalog in doc 11 keeps a task to verify the author-owned executor front door reflects the current manifest bundles and targets, since the front door is author-owned rather than auto-regenerated.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prefix research (2026-06): agent instruction-file discovery is by EXACT basename match, no globs/wildcards. Claude Code: CLAUDE.md, fallback AGENTS.md. Codex: AGENTS.md, AGENTS.override.md, + exact-name project_doc_fallback_filenames (no globs). Gemini CLI: GEMINI.md (default config also recognizes AGENTS.md, CONTEXT.md). Cursor: AGENTS.md. ALL do on-demand subdirectory loading, so nesting alone does NOT shield. DECISION: reserved prefix = a leading underscore on the canonical name. The deliverable executor front door is authored as _AGENTS.md (per-bundle: bundles/<id>/_AGENTS.md), kept .md so it stays author-editable; build strips the leading underscore to produce AGENTS.md and creates the CLAUDE.md/GEMINI.md aliases per targets (only _AGENTS.md needs the prefix; the others are build-created symlinks). Source names to AVOID: AGENTS.md, CLAUDE.md, GEMINI.md, AGENTS.override.md, CONTEXT.md. Do NOT use .tmpl (that is the repo placeholder-template convention; these are author-owned content). Caveat: a user could non-default-configure Codex/Gemini to also read _AGENTS.md; we design against defaults and document it.
<!-- SECTION:NOTES:END -->
