---
name: wpm-repo-dev
description: Implement WPM repository changes using its domain boundaries, task evidence, and quality gates. Use for changes to WPM itself, not authoring a work package.
---

# Develop WPM

Read [the development process](../../../docs/development.md) and the relevant [vNext contract](../../../docs/vnext.md). Inspect the current diff and task before choosing a change. Preserve legacy CLI behavior.

Use `npm run quality:doctor` to establish available tools. Inspect ownership with `npm run groma:view -- <file>` before changing dependencies. Keep pure domain behavior behind injected ports; place effects in adapters and composition roots. Consult the architecture skill for boundary changes and the test skill for behavioral evidence.

Use Backlog.md only through its CLI. Read [task conventions](../../../docs/task-writing-conventions.md) before creating or changing criteria; keep observable outcomes separate from implementation choices. Update modified-file lists without dropping prior paths.

Run focused checks while editing, then `npm run quality:ci` on the stable diff. For instruction changes run `npm run agents:check`. Missing tools or skipped scope do not constitute passing evidence. Generate Claude projections with `npm run agents:generate`; edit canonical skills here rather than generated copies.

Record source revision, commands, outcomes, limitations, and next action in task notes. Keep raw output in ignored working memory. Request independent review before integration. Publishing, tagging, remote mutation, and global agent settings require their own authorization.
