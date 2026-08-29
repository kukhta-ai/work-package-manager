<!--
  Thanks for contributing to wpm. This template prompts for what a PR must carry to merge.
  See CONTRIBUTING.md → "Pull requests, review & merge" for the full rules.
  Reviewer reminders: at least one approving review is required, and no one merges their own PR.
-->

## Summary

<!-- What does this change do, and why? One short paragraph. -->

## Linked task

<!-- Every PR traces to a Backlog.md story. Use "Closes" if this PR completes the task,
     or "Relates to" if it only advances it. -->
Closes task-<id>

## Definition of Done

<!-- The project DoD (CONTRIBUTING.md / AGENTS.md). Tick each; all must hold to merge. -->

- [ ] Type-checks clean (`tsc --noEmit`) and Biome is clean (`biome ci`) — **including the core
      import-boundary rule**.
- [ ] Tests added and green (`vitest`) — unit for pure logic, integration where it touches ports.
- [ ] Public functions documented; no dead code.
- [ ] Every acceptance criterion of the linked task is observably satisfied.

## How this was verified

<!-- Paste the real output of the three-command gate (the same suite CI runs). -->

```text
$ npm run typecheck   # tsc --noEmit
$ npm run lint        # biome check .
$ npm test            # vitest run
```

## CI

- [ ] CI is green — the three-command gate (`tsc --noEmit` + `biome ci` + `vitest`) passes across the
      supported Node and OS matrix.
