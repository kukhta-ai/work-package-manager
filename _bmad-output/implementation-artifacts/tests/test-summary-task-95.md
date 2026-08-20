# Test Automation Summary — TASK-95 Git-format build parity

> `bmad-qa-generate-e2e-tests` output. Feature under test: `wpm build package --format git` packages the same
> un-nested, executor-ready deliverable as tarball and zip. Framework: Vitest 4.1.7 (`unit` and `integration`
> projects) plus the real `git` and `tar` tools. The product is a Node CLI with no HTTP API or browser UI, so
> API status-code tests and browser-locator checks are not applicable; the highest-value E2E surface is the
> built `dist/cli.js` operating on a real authoring workspace.

## Generated and extended tests

### Adapter / real-tool tests — `test/unit/adapters/packager.test.ts`

- Git receives a deliberately larger committed source repository but must archive only `PackageRequest.files`.
- Root and enabled-bundle `_AGENTS.md` sources become canonical `AGENTS.md` files plus relative target aliases;
  no reserved-prefix name survives.
- Authoring backlog and disabled-bundle sentinels are committed on disk but absent from the supplied build plan
  and therefore absent from the Git archive.
- Source `.gitignore` and `.gitattributes export-ignore` rules cannot override the already-computed build plan.
- Source `ident` and `working-tree-encoding` attributes cannot rewrite or transcode author-owned bytes while
  Git constructs its temporary tree; extracted bytes are compared directly with the source.
- The normalized Git archive layout equals the normalized tarball layout exactly.
- Git packaging succeeds when the source deliverable is not itself a Git repository.
- A deterministic Zip stand-in requires Info-ZIP's `-y`/`--symlinks` option, so symlink-preserving invocation is
  covered even on environments without a Zip binary; when real Zip exists, its happy path must succeed.

### Built-CLI E2E — `test/integration/cli.build.e2e.test.ts`

- A real `wpm init` authoring workspace is configured with a target and enabled bundle, then packaged through
  the built CLI as tarball and Git.
- The Git archive root contains the un-nested deliverable (`manifest.yml`, not `wip/`) and its normalized layout
  equals tarball's.
- Canonical root/bundle executor front doors and `CLAUDE.md` aliases are present; `_AGENTS.md` is absent.
- Workspace `.authoring-backlog/`, `builds/`, archive-self, and unique wrapper-content sentinels are absent.
- Extraction proves root and bundle executor bytes are verbatim and the Git-format alias is a symlink.
- When both platform tools exist, zip's normalized layout is compared with the same tarball baseline. This
  environment has neither `zip` nor `unzip`, so that intentionally conditional branch was not exercised here.

## Acceptance-criterion coverage

| Criterion | Automated evidence |
| --- | --- |
| AC #1 — un-nested Git archive, same layout | Adapter Git↔tar exact-list comparison; built-CLI Git↔tar comparison; explicit absence of `wip/` |
| AC #2 — no workspace wrapper or disabled bundles | Built-CLI wrapper path/content leak guards; adapter exact-set test with committed authoring and disabled-bundle sentinels; existing pure-plan disabled-bundle regression |
| AC #3 — canonical executor front doors only | Root and bundle canonical/alias presence, reserved-prefix absence, extracted verbatim bytes, alias-symlink assertion |
| AC #4 — supported-format layout parity | Git↔tar always; zip joins the same assertion when its authoring/listing executables are available |

- Acceptance criteria automated: **4/4**.
- TASK-95-specific cases: **4** (three adapter scenarios and one built-binary workspace scenario).
- Negative/edge outcomes include exact-set leak prevention, source Git policy isolation, disabled-bundle omission,
  builder-wrapper omission, reserved-prefix omission, and source-repository independence.

## Verification

- QA focused gate: `npm run build` — passed.
- QA/review focused adapter run: **10/10 passed**.
- QA focused TASK-95 built-CLI run: **1/1 passed** (22 unrelated cases filtered).
- Development regression gate: complete build E2E file **23/23 passed**.
- Development/review full suite: **1,237/1,237 passed across 97 files**.
- Post-review static/build gates: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` — passed.

## Checklist disposition

- Standard Vitest APIs and existing real-workspace helpers are used; descriptions name observable behavior.
- Tests are isolated by fresh temporary directories and have no ordering dependency, sleeps, or hardcoded waits.
- Happy path and critical leak/error boundaries are covered.
- API-response and browser-locator items are **N/A** because wpm exposes neither surface.

## Review disposition

- The separate `bmad-story-automator-review` workflow completed with **APPROVE** after automatically fixing the
  Git-attribute byte-mutation and Zip-symlink findings.
- On an environment providing `zip` and `unzip`, the same E2E automatically exercises real three-format parity.
