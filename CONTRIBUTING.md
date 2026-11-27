# Contributing to WPM

**Public distribution is inactive.** The repository has no approved public package coordinate, publication authority, or public release channel. Local candidate preparation does not activate distribution.

This guide governs development of the WPM CLI. The current process is defined by [AGENTS.md](./AGENTS.md), [development guidance](./docs/development.md), and [private delivery](./docs/delivery.md). The approved vNext process supersedes the former BMAD branch topology and persona loop; historical design documents remain the legacy product specification.

## Branching model

Create a short topic branch from the current `main` baseline, make a coherent change, and open a PR to `main`. Existing work on another branch may finish on its current topic branch. Use `feat/<purpose>`, `fix/<purpose>`, or `chore/<purpose>` names. Keep unrelated work separate. Do not commit directly to protected `main`, merge your own PR, or promote work without the required human review.

The repository's development branching is independent of any branching performed by a recipient agent installing a generated work package.

## Pull requests, review & merge

Lead the PR description with the problem and resulting behavior. State verification, source revision and material limits. Include a Changeset for observable CLI or package changes; explain an empty Changeset for tooling-only work. Resolve concrete findings from an independent reviewer before asking for merge. Maintainers squash a green reviewed PR, preserving a useful summary and task references.

Run `npm run quality:doctor` before relying on checks. Use focused tests while implementing; run `npm run quality:ci` on the stable final source/test diff. Regenerate native projections with `npm run agents:generate` and verify them with `npm run agents:check`. Update Groma ownership and relationships after structural changes and verify with `npm run groma:check`. Do not skip a missing analyzer or weaken a rule to make a gate green. A quality-policy change needs independent review of both its implementation and bypass tests.

CI separates Linux policy/architecture checks from the OS × Node 24/26 consumer matrix. The `Required` aggregate fails on unsuccessful, cancelled or skipped bands. A repository administrator must configure it as a required status check and require independent review. Workflow YAML alone does not establish branch protection.

## Process-artifact retention

Generated plans, raw analyzer logs, agent transcripts and candidate exports are working memory. Use ignored local directories under the existing policy; a fresh checkout must work without them. Distil accepted facts into canonical documentation, accepted task evidence through Backlog.md, or compact schema-valid `research/evolution/` decisions and receipts. Follow [PROCESS-ARTIFACTS.md](./PROCESS-ARTIFACTS.md). Run `npm run check:process-artifacts` before staging and its CI variant on the candidate snapshot.

Groma's curated architecture records are intentional source documentation. Exported websites contain source context and remain local or access-controlled CI artifacts; never publish them by default. Private PR exports retain for 14 days and candidate evidence for 90 days. Archive availability never authorizes committing raw logs.

## Versioning & releases

Version the builder with Semantic Versioning. A removed command, incompatible flag or changed generated-artifact contract is breaking; an additive compatible capability is minor; a compatible correction is patch. Before 1.0, a breaking change may use a minor bump only when clearly documented. Builder and authored-package versions remain independent.

Use `npm run changeset` to record observable changes. Review a version PR before applying `npm run changeset -- version`; these commands do not authorize a release. Keep [CHANGELOG.md](./CHANGELOG.md) useful for readers and retain release records only for versions actually released.

For private qualification, start from a clean committed checkout and use `npm run candidate:prepare -- --output <directory-outside-checkout> --notes <committed-notes.md>`. This runs the release quality gate, builds one archive and verifies those exact bytes in a fresh consumer. `candidate:verify` checks the persisted archive and evidence without rebuilding. Review the source commit, package version and archive digest before any later release decision. The detailed identity, reuse, retention and future publishing contract is in [docs/delivery.md](./docs/delivery.md).

Public activation remains a separate human decision. No tag-triggered publishing workflow is installed. The existing lower-level `package:inspect`, `package:verify-install`, `package:prepare-candidate` and read-only channel assessment commands remain available for legacy evidence workflows. `wpm build publish` concerns authored work packages, not release of WPM itself.

## Tracking work — the dogfood backlog

Operate `backlog/` only with its CLI. Read [task-writing-conventions.md](./docs/task-writing-conventions.md) before creating tasks or editing criteria. Acceptance criteria describe observable outcomes; method belongs in a plan or implementation notes.

```sh
backlog task list --plain
backlog task <id> --plain
backlog task edit <id> -s "In Progress"
backlog task edit <id> --append-notes "Revision, commands, evidence, limits and next action"
backlog task edit <id> --check-ac <n>
backlog task edit <id> --check-dod <n>
backlog task edit <id> -s "Done"
```

Tick only demonstrated outcomes. A task is Done only when its criteria and shared Definition of Done hold. Preserve the complete existing list when using `--modified-file`, because that flag replaces rather than appends. Repository developer skills, package-author skills and recipient instructions are separate contexts; developer guidance must never enter a recipient package.
