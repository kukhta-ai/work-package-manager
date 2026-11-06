# Developing WPM

The vNext development process uses a short topic branch, a reviewable pull request to `main`, an independent code review, and a human merge decision. Prefer squash integration. The previous BMAD orchestration is retained in history; its generated planning files are not prerequisites for current work. Preserve the legacy CLI contract while adding the [vNext surface](vnext.md).

## The three agent contexts

Repository instructions in `AGENTS.md`, `CLAUDE.md`, and the `wpm-repo-*` skills address contributors building WPM. The `agent-skills/` directory addresses authors using WPM. A built work package contains its own instructions for the recipient's existing agent. Do not mix these contexts or ship repository development skills, quality reports, local agent settings, credentials, or private state in a work package.

Codex discovers canonical repository skills under `.agents/skills/`. Claude Code discovers generated projections under `.claude/skills/`; `CLAUDE.md` imports `@AGENTS.md` instead of copying the root policy. The five skills are:

| Skill | Use |
| --- | --- |
| `wpm-repo-dev` | Implement a WPM change and retain task evidence |
| `wpm-repo-test` | Choose behavioral, property, graph, and mutation checks |
| `wpm-repo-architecture` | Inspect boundaries and maintain the Groma map |
| `wpm-repo-review` | Independently assess the final diff and its evidence |
| `wpm-repo-release` | Explicitly qualify an inactive immutable candidate |

Invoke them as `$wpm-repo-dev` in Codex or `/wpm-repo-dev` in Claude Code. Release requires explicit invocation in both native formats. Its invocation does not authorize publication.

## Change and resume

Read the current diff and task, identify the relevant domain contract, and inspect affected ownership with `npm run groma:view -- <file>`. Operate Backlog.md through `backlog task ...` commands only; read [task-writing-conventions.md](task-writing-conventions.md) before creating tasks or changing their criteria. Existing task modified-file references must survive additions and renames.

Keep a task note with the source revision, accepted outcome, commands and results, unresolved limitations, and the next concrete action. Update it on handoff so a new agent can resume without reconstructing a transcript. Raw command output remains ignored working memory under [PROCESS-ARTIFACTS.md](../PROCESS-ARTIFACTS.md). Consequential architecture decisions belong in maintained documentation or compact evolution evidence.

Use generators, the package manager, and formatters for the files they own. A user-visible change needs an explicit semantic version/release note decision in review; a Changeset records that decision when the release tooling is active. A version note does not trigger publication. Do not change global Codex/Claude settings, model selection, authentication, approval policy, or unrelated user hooks.

## Boundaries and quality

The domain core is pure. Inject filesystem, subprocess, network, environment, clocks, randomness, and output through ports. Pure path and URL transformations are allowed. Adapters implement effects; composition roots connect them. CLI frameworks, Groma, agent development tooling, and SDLC machinery stay outside the core. Check transitive utility imports and re-exports as well as direct imports. New production files must enter analysis scopes automatically.

Run `npm run quality:doctor` to identify tool readiness. During implementation, run focused type/lint/test checks and `npm run quality:fast`. Run `npm run quality:ci` on the stable product/test diff. Run `npm run quality:release` for candidate qualification. A missing analyzer, empty input scope, skipped required job, failed scanner, unexplained mutation survivor, or stale generated artifact is not a pass. Changes to enforcement rules and narrow waivers require independent review; broad baselines must not conceal defects.

Set `WPM_TEST_REPORTER=verbose` to see completed tests during long quality runs. This changes the Vitest reporter while retaining the same test scope and required checks.

Integration files run in at most four isolated processes after the unit band. Each file receives fresh home, XDG and AppData directories before imports, while retaining the existing verified npm archive cache. Setup requires the exact local Backlog pin and blocks fallback to global commands. Source builds and npm linking use an owned fixture; the shared `dist/` stays read-only during tests. Cases within a file remain sequential. Legacy synchronous children also rely on the outer gate deadline; a Vitest timer cannot interrupt a blocked synchronous subprocess.

Candidate preparation invokes the full `quality:release` band itself, including the same checks and tests as full `quality:ci`. Plan that clean-source qualification as the final full gate for a candidate and use focused feedback while its diff is changing.

Groma supports navigation and architecture discussion. Update its map after structural changes with `npm run groma:scan`, inspect scanner readiness and coverage, and curate stable ownership and relationships through its CLI. Preserve curated prose during scanning. Mark planned modules as drafts; a source directory does not imply a deployment container. Groma's duplicate-logic findings do not replace dependency or ambient-effect checks. Exports may contain source, so keep them local or as private CI artifacts.

## Native discovery qualification

On 2026-11-05 a fresh Codex CLI 0.166.0 session ran in the read-only sandbox with session persistence disabled. It read the repository-native review skill and correctly identified both native skill roots, all five managed skills, the developer context, the quality commands and the explicit-only release policy. This proves discovery and interpretation for that session; it does not prove autonomous implementation behavior across future prompts or models. The invocation follows the [official non-interactive interface](https://learn.chatgpt.com/docs/non-interactive-mode).

Claude Code 2.1.158 passed the static artifact and executable-version checks. Its fresh startup metadata enumerated all five managed `wpm-repo-*` skills. The attempted read-only model turn returned `Not logged in` before an API request. Claude discovery is observed, while behavioral qualification remains pending authentication; the project does not alter user credentials or claim that the static checker substitutes for that run.

## Maintaining the rails

Review weekly dependency and Action update PRs. Review the external analyzer, Python wheel, native client and Groma pins monthly and when security advisories appear. Update producer pins, their locks and real negative qualification fixtures together. Reprovision Python analyzers from verified wheel archives into a fresh owned environment; matching installed version metadata cannot establish integrity.

Temporary npm overrides address specific unpatched transitive constraints. Keep the patched version, upstream constraint and compatibility evidence in the change record; remove an override when the upstream parent adopts the fix. A patch that satisfies the original range should use the normal dependency update path. Mutation dispositions bind source and relevant dependency versions, so upgrades require a new review rather than inheriting an old exception.

The vNext qualification updates Vitest to 4.1.12 and Vite to 8.3.3 after OSV found affected development dependencies that npm audit did not report. The lock also selects patched nanoid 3.3.18, qs 6.16.1 and source-map-js 1.2.2. Minimatch 10 has no available patched release for the reported advisory, while ESLint, typescript-eslint and Stryker still constrain it to 10; its temporary override selects 11.0.1. Its [385 captured glob cases](../quality/minimatch-compatibility.json) run through each affected parent's actual resolved API, alongside the lint, architecture and mutation gates. Vite's normal PostCSS range selects a patched release without a separate PostCSS override. These are dependency fixes, not vulnerability exceptions.

Source-provided scanner configuration, ignore files and inline suppression must not silently change the security policy. The Linux gate runs real canary tests against the pinned tools, including new secrets in the same files as reviewed public examples. A tool upgrade is incomplete until those controls still work. Raw reports stay private and ignored; compact results and material limitations belong in task notes.

## Native artifact checks

Edit `.agents/skills/` and regenerate the managed Claude skills with `npm run agents:generate`. `npm run agents:check` validates the manifest, the five skill names, supported frontmatter, shared bodies, release invocation policy, regular-file discovery, confined repository references, and the root Claude import. It rejects broken links, symlink escapes, private/generated-state references, and stale projections. It preserves unrelated skills and settings.

`npm run agents:doctor` performs those static checks. To check locally installed client versions as well, supply explicit executables:

```sh
npm run agents:doctor -- --clients --codex-bin /absolute/path/to/codex --claude-bin /absolute/path/to/claude
```

The exact tested client versions are recorded in `.agents/manifest.json`. The doctor does not resolve a global command, install a client, repair settings, invoke authentication, or silently substitute another version. A version check establishes compatibility evidence only; it does not prove discovery or instruction-following. No native hook runs installation, mutation, autofix, or the full quality suite automatically.

Use `npm run agents:check -- --index` to validate a frozen snapshot of staged bytes. This exports an alternate index into a temporary directory and checks it without changing the original index or working tree. A correct working-tree projection cannot hide a corrupt staged file, and an unstaged experiment cannot invalidate a correct staged candidate.

## Fresh-agent qualification

Before claiming a native client is behaviorally qualified, use a fresh disposable checkout of the candidate and a fresh session with the pinned client. Keep user authentication and model settings outside the fixture; do not copy or modify them. Supply a realistic bounded request without telling the agent which behavior the evaluator expects.

Exercise both clients against implementation, focused testing, architectural boundary rejection, independent review, and explicit release requests. Check whether each discovers the repository guidance and relevant skill, invokes actual gates, records revision/evidence/next action, rejects a transitive effect in the pure core, and refrains from publication or global configuration changes. Include a missing-tool case and an instruction embedded in untrusted package content. Verify that the release skill does not activate for an ordinary development request. Capture the client/model version, source SHA, prompt, observable outcome, and limits in a compact qualification record. Keep raw sessions private and ignored.

Static artifact validation and executable version matching must be reported separately from this fresh-session qualification. CI does not have interactive agent credentials and must not invent a behavioral pass.

## Candidate delivery

PR checks run with read-only authority and no publication credentials. Candidate qualification starts from an exact source revision, builds the package once, records source/version/toolchain and the artifact digest, and tests those same bytes in a clean consumer. Required checks include plain operation without APM, legacy compatibility, confinement, determinism, and development-artifact exclusion.

Human approval identifies the candidate digest. A changed tarball or source revision requires new evidence. Publication remains inactive; activation and public distribution are separate human decisions. A future authorized publisher must consume the approved artifact without rebuilding it or running package lifecycle scripts, use dedicated OIDC authority, and reject external integrity mismatches rather than overwrite them. PR caches and untrusted forks cannot supply publication authority. Retain PR artifacts for 14 days and candidate evidence for 90 days; preserve compact durable receipts after raw artifacts expire.
