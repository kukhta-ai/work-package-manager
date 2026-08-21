---
baseline_commit: cab5b24f5bca9fb97c5dee4f9ca1efeb9f6e6369
---

# Story 1.3: Deliver a Fresh Local Packed-Install Journey

Status: done

<!-- Created by literal bmad-create-story in YOLO mode for Backlog TASK-109. -->

## Story

As a package user or bootstrap agent,
I want to install and exercise the exact local package in a fresh environment,
so that I can verify the consumer journey independently of the source repository.

## Acceptance Criteria

1. Given an inspected package for a specific source revision and a fresh supported environment without its
   source checkout, when that exact package is installed, then installation succeeds.
2. Given the exact package is installed in the fresh environment, when each declared executable is invoked,
   then every executable starts and reports the installed package version consistently.
3. Given only the installed package is available, when its resources are resolved, then every packaged
   resource required by that revision's declared ship set remains available without a repository-relative
   path.
4. Given snapshots of supported coding-agent personal and workspace configuration, when the package is
   installed without explicit WPM setup, then every configuration remains unchanged.
5. Given a required prerequisite is absent or unsupported, when installation or invocation is attempted, then
   the failure identifies the prerequisite and an actionable recovery condition.

## Tasks / Subtasks

- [x] Consume and validate one accepted Story 1.2 package report without rebuilding it (AC: 1, 3, 5)
  - [x] Require an accepted, revision-bound report, the referenced artifact, and matching current archive
        evidence before installation; reject malformed, rejected, missing, or inconsistent inputs clearly.
  - [x] Freeze the inspected archive bytes into the isolated consumer environment and install that copy, so
        the install cannot silently substitute a source directory, rebuilt package, or different tarball.
  - [x] Preserve the generic declared-set contract: future required assets are checked by their reported paths,
        without WPM artifact-type inspection branches.
- [x] Exercise a real fresh global-prefix installation (AC: 1, 4, 5)
  - [x] Use a disposable HOME/workspace/npm cache/global prefix with the source checkout absent from cwd and
        from every resolved installed path.
  - [x] Perform a normal npm tarball installation (no link and no source-directory install), retaining normal
        package lifecycle behavior so inert installation is actually tested.
  - [x] Snapshot representative Codex and Claude Code personal and workspace configuration surfaces before the
        install and prove their complete fixture state is byte-for-byte unchanged afterward.
- [x] Invoke every npm-generated executable and resolve installed resources (AC: 2, 3, 5)
  - [x] Discover shims using npm's platform-specific global-prefix layout; invoke Unix shims directly and
        Windows `.cmd` shims through `cmd.exe`, without pretending `.cmd` files are native executables.
  - [x] Invoke every declared command with `--version`; require exit 0 and the exact installed manifest version.
  - [x] Resolve every declared ship-set path under the installed package root and run at least one installed
        CLI resource journey (built-in template discovery) from the isolated workspace.
  - [x] Emit structured revision/package/install/bin/resource/config evidence usable by Story 1.4, but do not
        persist a candidate identity or digest in this story.
- [x] Fail early and actionably for prerequisites (AC: 5)
  - [x] Validate the current Node.js runtime against the installed package's `engines.node` range because npm's
        engine declaration is advisory unless `engine-strict` is enabled.
  - [x] Prove missing npm, an unsupported Node runtime, a missing artifact, and a missing/failed generated shim
        identify the affected prerequisite and state one concrete recovery condition.
- [x] Add focused RED-to-GREEN automation and proportional gates (AC: 1-5)
  - [x] Unit-test report/archive validation, generic required-path evaluation, prerequisite classification, and
        portable shim resolution.
  - [x] Add a real clean-copy -> pack/inspect -> fresh-prefix install -> bin/resource/config integration journey.
  - [x] Keep all new preparation tooling in typecheck/Biome but outside the production build, npm ship set, and
        generated tar/Git/conditional-zip deliverables.
  - [x] Run the focused unit/integration band, typecheck, Biome, production build, archive inspection, and real
        packed-install journey. Leave the exact full `npm test` to the independent reviewer on the stable diff.

## Dev Notes

### Scope and Outcome

This story is the consumer-side continuation of Story 1.2. It proves that the exact archive already accepted
for source revision `cab5b24f5bca9fb97c5dee4f9ca1efeb9f6e6369` can be installed and used without the source
checkout. It is not public distribution, setup, publication, activation, or candidate persistence.

The package remains private and distribution remains inactive. The only intended new surface is
maintainer-only, non-publishing evidence under `distribution-preparation/`, plus focused tests and a convenient
package script/documentation entry if needed. Do not add a product CLI command or change `src/core/**`.

### Required Reuse from Story 1.2

- `distribution-preparation/prepare-package.js` already clean-builds once, npm-packs once, inspects the actual
  gzip/tar bytes, binds the checkout revision, and reports `sourceBinding`, `artifact`, `package`,
  `expectedPaths`, `actualPaths`, and aggregate violations. Consume that evidence; do not duplicate its packer
  or create a second declared-ship-set collector.
- `distribution-preparation/package-archive.js` is the reviewed direct archive reader. Reinspect the supplied
  bytes with it rather than shelling out to platform tar tools or extracting untrusted paths with a bespoke
  unpacker.
- `distribution-preparation/package-boundary.js` owns normalized paths and the generic declared-versus-actual
  evaluator. Reuse its evaluator for current archive bytes against the report's expected set rather than
  encoding special rules for templates, skills, documents, or later asset types.
- Story 1.2 review hardened traversal aliases, dangling/cyclic symbolic and hard links, tar integrity,
  Windows npm invocation, ignored/local build inputs, late HEAD changes, malformed bins, and code-point
  ordering. Preserve those fixes; do not weaken or bypass them.

### Fresh-Environment Contract

- Install the filesystem `.tgz` itself. npm documents local tarballs as packages and strips the archive's
  single `package/` layer; a directory install may create a symlink and would not prove this story.
- Use an isolated global `--prefix`. npm's current contract places global packages under
  `{prefix}/lib/node_modules` on Unix and `{prefix}/node_modules` on Windows, with executable links under
  `{prefix}/bin` on Unix and directly under `{prefix}` on Windows.
- Keep HOME/USERPROFILE, cwd, npm cache, and prefix inside one disposable root. The installed package root and
  every resource-evidence path must be beneath that root and not beneath the repository.
- Install normally. `--ignore-scripts` would hide an accidental install-time mutation, so it cannot prove AC4.
  The source package's `prepack` already ran while producing the archive; do not rebuild from the consumer.
- npm 7+ installs required peer dependencies by default. Do not bundle `backlog.md`, rewrite peer semantics,
  or add a second prerequisite installer here. This journey may resolve declared dependencies from npm; it
  must make no publication, credential, tag, release, or registry-write call.

### Exact Artifact and Evidence

- Accept only a Story 1.2 report whose status is `accepted`, violations are empty, source binding is clean and
  internally consistent, artifact path/size exist, and package/paths match a fresh inspection of the supplied
  bytes. Treat malformed evidence as failure, not as missing optional data.
- Read the accepted archive bytes once, validate them, write those bytes into the disposable environment, and
  install that frozen copy. This gives the install an exact byte input without claiming Story 1.4's persisted
  digest/candidate identity.
- Report the source revision, installed name/version/root, npm version, executable invocation results, resolved
  declared paths, functional resource probe, and configuration-snapshot verdict. Story 1.4 can bind this
  evidence later; do not create its proposed tag, hashes, release-note preview, or candidate record now.

### Executables and Resources

- The current archive declares `wpm` and `installer`, both targeting `./dist/cli.js`; enumerate the manifest
  rather than hard-coding two calls. Each npm-created shim must return the installed manifest version for
  `--version`.
- On Windows, official Node guidance states `.cmd` files are not executable directly with `execFile`; spawn
  `cmd.exe` explicitly and quote a shim path containing spaces. On Unix, invoke the generated link directly.
- The runtime already resolves `templates` and `agent-skills` as siblings of installed `dist/`, and
  `dist/version.js` resolves the installed root `package.json`. Preserve those relationships. A successful
  installed `template list/show` probe demonstrates runtime resolution; complete declared-path evidence
  demonstrates that all other revision-required assets are present.
- Path evaluation must remain declared-set driven. Adding a future path to the inspected report must make it a
  required installed path automatically, with no new artifact-type branch.

### Inert Coding-Agent Configuration

The isolated fixture must include content at both supported agents' current personal and workspace surfaces:

- Codex: personal `.agents/` content and workspace `.agents/` plus `AGENTS.md`.
- Claude Code: personal `.claude/` content and workspace `.claude/` plus `CLAUDE.md`.

Snapshot directory entries, file bytes, and link targets (where present) before normal npm installation and
compare the same surfaces afterward. Keep npm cache and prefix outside those locations so expected npm cache
writes cannot be mistaken for agent configuration. Do not invoke `wpm skill install` or any future setup action.

### Prerequisite and Failure Contract

- `package.json` declares Node `>=20`. Preflight it with the existing `semver` dependency and report both the
  observed version and required range. Do not rely on npm's default warning: official npm docs say `engines`
  is advisory unless `engine-strict` is set.
- Probe the resolved npm invocation and report its version before installation. A missing npm executable must
  say that npm is required and that installing/using npm with a supported Node.js runtime is the recovery.
- Missing report/artifact evidence must direct the maintainer to rerun `npm run package:inspect -- --revision
  HEAD` and use that accepted report. Missing or failing generated shims must direct the maintainer to reinstall
  the exact accepted archive in a fresh prefix after addressing the named prerequisite.
- Bad command syntax exits 2; validation, prerequisite, installation, invocation, resource, or configuration
  failure exits 1; success exits 0 with structured stdout. Do not hide a partial result behind exit 0.

### Architecture and Non-Leakage Guardrails

- Epic 1 distribution preparation stays outside `src/core`, outside the emitted `dist/` build inputs, outside
  `package.json#files`, and outside generated work-package zip/tar/Git artifacts (NFR17).
- No network abstraction, credentials, publication, registry mutation, tag/release action, or product command.
  npm dependency reads made by a normal local-tarball install do not authorize registry writes.
- Preserve `private: true` and the inactive public-surface guard. Update its preparation-file inventory if a
  new file is introduced so typecheck/lint inclusion and ship-set exclusion remain explicit.
- Avoid platform utilities for archive inspection. Use Node APIs and the existing reader; make subprocess
  argv explicit and never interpolate an archive, prefix, bin, or resource path into an untrusted shell string.

### Testing Requirements

- Unit tests should inject platform, Node/npm observations, report/archive metadata, and installed-path
  observations. Cover accepted evidence; rejected/malformed/revision-mismatched evidence; a future generic
  required asset; unsupported Node; missing npm; Unix and Windows root/shim layouts; and aggregate missing
  installed paths.
- The acceptance integration test must copy the current tracked/untracked feature source to a clean temporary
  Git repository, install source dependencies, run Story 1.2 preparation, persist its JSON report outside the
  source, then invoke this story's verifier from a distinct isolated cwd. Assert the archive path is the same
  artifact referenced by the accepted report and no source path appears in installed-resource evidence.
- Assert both real npm-generated shims, installed version, built-in template resolution, every expected path,
  and unchanged agent configuration fixtures. Keep the journey bounded with explicit timeouts.
- Focused moving-diff gate: new unit file(s), new integration journey, Story 1.2 preparation tests, CLI bin and
  runtime-support tests as affected, public-surface/non-leakage tests, `npm run typecheck`, `npm run lint`,
  `npm run build`, and the real clean package + packed-install journey. Do not run the exact full `npm test`;
  the independent reviewer owns that stable-diff gate.

### Project Structure Notes

Expected refinement, not a frozen filename mandate:

- New evaluator/orchestrator logic belongs under `distribution-preparation/`.
- Focused pure/helper coverage belongs under `test/unit/distribution-preparation/`.
- The real package-consumer journey belongs under `test/integration/distribution-preparation/`.
- If a package script is added, it must remain a local maintainer verification command and must not expose
  publish/release semantics.
- Update existing preparation non-leakage inventories and maintainer documentation only where needed; do not
  edit the design set, Backlog.md, SDLC state, or agent instructions.

### Previous Story Intelligence

- Story 1.2 ended `done` after independent review with a 1353/1353 stable full suite. Its final focused package
  band was 59/59, runtime/bin 8/8, and generated-format non-leakage 1/1.
- The accepted report currently contains an absolute artifact path and size but no persisted digest. Keep exact
  install by freezing the validated current bytes; Story 1.4 owns durable digests and candidate identity.
- `prepare-package.js` uses Node plus `npm_execpath` to avoid direct Windows `.cmd` execution and fails closed
  when that supported entry point is unavailable. Reuse `resolveNpmInvocation`.
- The production CLI's `makeRealDeps()` resolves `../templates` and `../agent-skills` relative to installed
  `dist/`, while `src/version.ts` imports the package-root manifest. These are the installed runtime seams to
  exercise, not repository-relative paths.

### Git Intelligence

- Baseline: `cab5b24f5bca9fb97c5dee4f9ca1efeb9f6e6369` on
  `feature/authoring-agent-onboarding-task-109`.
- Relevant commits: `960e195 feat: establish clean package boundary (task-108)`, merged by `97c716f`, followed
  by the state-only `cab5b24 chore: advance onboarding epic after task-108`.
- No `docs/00`-`docs/14` file changed since this persistent worker's full preload revision
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`; TASK-108 story/QA and every changed
  `distribution-preparation/**` handoff file were re-read before this story was created.

### Latest Technical Information

- npm CLI v11 documentation, accessed 2026-08-21: local `.tgz` installation requirements and global install
  behavior: <https://docs.npmjs.com/cli/v11/commands/npm-install/>.
- npm CLI v11 folder layout, accessed 2026-08-21: Unix/Windows global package and executable locations:
  <https://docs.npmjs.com/cli/v11/configuring-npm/folders/>.
- npm CLI v11 package metadata, accessed 2026-08-21: `engines` advisory semantics and npm 7+ automatic peer
  installation: <https://docs.npmjs.com/cli/v11/configuring-npm/package-json/>.
- Node child-process documentation, accessed 2026-08-21: Windows `.cmd` invocation requires a command shell or
  explicit `cmd.exe`: <https://nodejs.org/api/child_process.html#spawning-bat-and-cmd-files-on-windows>.
- Execution environment observed during story creation: Node `v22.22.1`, npm `10.9.4`. Preserve package support
  for the declared Node >=20 and CI Node 20/22 lines; do not upgrade dependencies in this story.

### References

- [Source: _bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md#Story-13-Deliver-a-Fresh-Local-Packed-Install-Journey]
- [Source: _bmad-output/planning-artifacts/prd.md#Inactive-distribution-preparation]
- [Source: _bmad-output/planning-artifacts/prd.md#Cross-cutting-non-functional-requirements]
- [Source: _bmad-output/planning-artifacts/architecture-authoring-agent-onboarding-addendum.md#Requirements-and-Epic-Mapping]
- [Source: _bmad-output/implementation-artifacts/1-2-establish-the-clean-exact-package-boundary.md]
- [Source: _bmad-output/implementation-artifacts/tests/test-summary-task-108.md]
- [Source: _bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md#Proposed-Backlog-Shape]
- [Source: distribution-preparation/prepare-package.js]
- [Source: distribution-preparation/package-archive.js]
- [Source: distribution-preparation/package-boundary.js]
- [Source: src/cli.ts#makeRealDeps]
- [Source: src/version.ts]

## Dev Agent Record

### Agent Model Used

GPT-5.6 (Codex persistent worker)

### Debug Log References

- 2026-08-21: literal `bmad-create-story` activation in YOLO mode; customization resolved with no prepend,
  append, persistent project-context content, or completion hook.
- 2026-08-21: revision-delta preload from `5d1c08a` to `cab5b24`; no changed design doc under
  `docs/00`-`docs/14`; TASK-108 story, QA, package implementation, tests, metadata, and relevant runtime seams
  re-read.
- 2026-08-21: official npm v11 and Node child-process contracts refreshed for tarball install, global layout,
  engine/peer behavior, and Windows npm-generated shim invocation.
- 2026-08-21: literal `bmad-dev-story` activation in YOLO mode; customization resolved with no prepend,
  append, persistent project-context content, or completion hook.
- 2026-08-21: focused RED established by missing `packed-install.js` (unit 1/1 file failed) and missing
  `verify-packed-install.js`/script (integration 2/2 failed); GREEN reached at package unit 31/31 and focused
  package/bin/runtime integration 25/25.
- 2026-08-21: literal `bmad-qa-generate-e2e-tests` activation in YOLO mode; customization resolved with no
  prepend, append, persistent project-context content, or completion hook. QA strengthened missing/failed shim
  and version-observation coverage at the deterministic contract seam.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Create-story checklist verdict: PASS. The story reuses Task 1.2's reviewed boundary, keeps exact-install
  evidence distinct from Story 1.4 candidate persistence, preserves inactive/no-write distribution scope,
  specifies the fresh installed consumer proof without prescribing a product-layer redesign, and includes
  platform/prerequisite/non-leakage failure coverage.
- Dev-story checklist verdict: PASS. The verifier consumes and revalidates one accepted Task 1.2 report,
  freezes the exact archive bytes, performs a normal isolated-prefix install, invokes both real declared npm
  shims, probes installed template resources, and proves all six agent-configuration fixtures unchanged.
- Focused dev gates: typecheck PASS; Biome PASS (217 files); production build PASS; package unit band 31/31;
  package/public-surface/bin/runtime integration band 25/25 in 86.79s. The exact full `npm test` remains
  reserved for the independent stable-diff reviewer under the proportional gate policy.
- QA checklist verdict: PASS. Final package units are 33/33 across four files; package preparation/install,
  public-surface, bin, and runtime integrations are 25/25 across six files in 152.84s; typecheck, repo-wide
  Biome (217 files), build, explicit `dist` exclusion, and `git diff --check` are green. QA total: 58/58;
  stable product/test aggregate hash:
  `721d83f72943fbaa3398dad2ef82585bccb9660437e73040e9c01366df15fb6d`.

### File List

- `_bmad-output/implementation-artifacts/1-3-deliver-a-fresh-local-packed-install-journey.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/tests/test-summary-task-109.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `distribution-preparation/packed-install.js`
- `distribution-preparation/verify-packed-install.js`
- `package.json`
- `test/integration/distribution-preparation/packed-install.test.ts`
- `test/integration/distribution-preparation/public-surfaces.test.ts`
- `test/unit/distribution-preparation/packed-install.test.ts`

### Change Log

- 2026-08-21: Added accepted-report validation, isolated local-tarball installation, portable real-shim
  invocation, installed declared-resource evidence, inert agent-configuration snapshots, actionable
  prerequisite failures, maintainer documentation, and focused RED-to-GREEN automation for TASK-109.
- 2026-08-21: Independent automatic-fix review closed one high and three medium findings, strengthened
  prerequisite recovery and source-free/platform boundaries, and approved Story 1.3 after the exact full
  1,368-test gate.

## Senior Developer Review (AI)

### Outcome

**APPROVE — 0 open findings.** All five acceptance criteria are implemented and the story is `done`.

### Findings and Automatic Fixes

- **HIGH — version drift omitted the required recovery contract.** A generated shim that started but reported
  the wrong installed version raised a generic error. It now identifies the installed executable-version
  prerequisite and tells the maintainer to reinstall the exact accepted archive before rerunning `--version`.
- **MEDIUM — the child journey could inherit repository-side Node/npm context.** The isolated environment now
  removes Node injection/search variables, npm-run metadata, source-checkout `PATH` entries, and credential-like
  variables; it resets `PWD`, HOME/USERPROFILE, npm config, cache, and prefix to the consumer fixture. Installed
  package/resource real paths are also confined to the fresh consumer/package roots.
- **MEDIUM — unsupported Node could be obscured by an earlier npm failure.** The packed manifest's Node range
  is now checked before npm is spawned, while the combined Node/npm evidence remains unchanged on success.
- **MEDIUM — a Windows shim path containing `%VAR%` was expanded by `cmd.exe`.** Windows invocation now disables
  delayed expansion, rejects percent/quote/line-break expansion syntax actionably, retains quoted paths with
  spaces, and continues to invoke npm-generated `.cmd` shims explicitly through `cmd.exe`.

Review fixes changed only `distribution-preparation/packed-install.js`,
`distribution-preparation/verify-packed-install.js`,
`test/unit/distribution-preparation/packed-install.test.ts`, and
`test/integration/distribution-preparation/packed-install.test.ts`. The story File List remains complete and
matches the in-scope working-tree changes; concurrent policy/state/backlog files were excluded and untouched.

### Acceptance and Regression Evidence

- **AC 1 — PASS:** accepted revision/package evidence is re-inspected, read once, frozen byte-for-byte, and
  installed from the tarball after the packaged-source checkout is deleted; installed real paths remain in the
  isolated consumer.
- **AC 2 — PASS:** both report-declared aliases (`installer`, `wpm`) use actual npm-generated platform shims,
  start successfully, and return the exact installed `0.1.0` manifest version.
- **AC 3 — PASS:** every declared path resolves generically under the installed package real root, and the
  installed CLI resolves the built-in `minimal` template without a repository-relative runtime path.
- **AC 4 — PASS:** complete tree/byte/link-aware snapshots of six Codex/Claude personal and workspace surfaces
  remain unchanged after normal installation and the read-only bin/resource probes.
- **AC 5 — PASS:** Node, npm, report/artifact, installation/root, missing/failed/version-drift shim, Windows-path,
  and resource failures identify the affected condition and an actionable recovery.
- TASK-108 archive/source-binding/path/link/bin/non-leakage regressions remain green. No setup, candidate,
  digest, release, publication, credential use, remote mutation, public coordinate, product command, or
  `src/core/**` behavior entered the story.

### Verification Evidence

- Focused review band: **83/83 passed across 12 files** (package units 35/35; real packed install 2/2 in
  80.51s; Task 1.2 package/public integration 13/13; readiness 18/18; assessment 6/6; built runtime/bin 8/8;
  generated tar/Git/conditional-zip non-leakage 1/1).
- `npm run typecheck`, `npm run lint`, exact `npx biome ci .` (**217 files**), `npm run build`, explicit
  preparation-tool `dist/` exclusion, JavaScript syntax checks, and `git diff --check`: passed.
- Exact stable-diff `npm test`: **1,368/1,368 tests across 109 files in 466.06 seconds**.
- Stable executable product/test hash: `6f9ff96d046ffa5f96c10bc5ad34f7d2f2658c90122e916ed3a65fc36e7bf2db`.
  Stable nine-file in-scope non-evidence hash (including maintainer docs):
  `12b6f0c15ed3ba2610e0fa8ed5440943e60e0cae0705b5e7887b44185e923667`.

### Workflow Evidence

- The actual `bmad-story-automator-review` skill was invoked in automatic-fix mode by the persistent independent
  reviewer against baseline `cab5b24f5bca9fb97c5dee4f9ca1efeb9f6e6369`, after revision-delta preload from
  `5d1c08aaa03be0211274936cfa3715a4a962be2f`; no `docs/00`–`docs/14` file changed in that interval.
- Review workflow sources were read completely (`SKILL.md` SHA-256 `74318c6c…1104e63b`, `workflow.yaml`
  `ec6973fa…e4f75`, `instructions.xml` `c6b4fd10…41c5d`, checklist `e30d2890…1dd28`).
- No activation prepend/append customization, matching persistent `project-context.md`, workflow override, or
  completion hook applied. Official npm folder-layout, Node child-process, and Microsoft `cmd.exe` contracts
  were refreshed during the platform audit.
