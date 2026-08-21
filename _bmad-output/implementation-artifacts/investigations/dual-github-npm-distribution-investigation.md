# Investigation: Dual GitHub Release and npm Distribution

## Hand-off Brief

1. **What happened.** Dual GitHub/npm distribution is feasible, but only as one non-atomic, reconciliation-aware release protocol over one persisted npm tarball; parallel fire-and-forget publication is unsafe.
2. **Where the case stands.** The case is concluded with High confidence for current scope: this branch can deliver “distribution prepared but inactive” through eight non-mutating stories, while public identity, trust settings, tags, releases, publication, and public verification remain a later activation track.
3. **What's needed next.** Reconcile the eight preparation slices into the epic/user-story-map artifact, validate their WHAT-only acceptance criteria, and create them through the Backlog CLI; no activation or publication task belongs in the current ready set.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-08-20 |
| Status | Concluded |
| System | `work-package-manager` on `feature/authoring-agent-onboarding`; GitHub repository `kukhta-ai/work-package-manager`; npm registry queried 2026-08-20 UTC |
| Evidence sources | User scope request; `package.json`; `.github/workflows/ci.yml`; npm registry responses; GitHub Releases API; version control |

## Problem Statement

Investigate whether WPM should and can support two simultaneous distribution paths for the same release: a GitHub Release and a published npm package. Determine the compatible identity, version, artifact, automation, verification, partial-failure, and user-install contracts without publishing or changing release state during the investigation.

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| User scope request | Available | Dual GitHub Release plus npm publication is the hypothesis under test. |
| `package.json` | Available | Current package identity, executable, packaged files, peer dependency, version, and scripts. |
| `.github/workflows/ci.yml` | Available | CI comments explicitly reserve tag release/publish for an absent `release.yml`. |
| npm registry | Available | Current package-name ownership and availability were queried directly. |
| GitHub Releases API | Available | Current repository release inventory was queried directly. |
| Official GitHub release/action documentation | Available | Tag-backed drafts, exact asset upload/digests, immutable releases, attestations, permissions, environments, concurrency, and rerun constraints mapped from GitHub primary sources. |
| Official npm publication/provenance documentation | Available | Tarball publication, immutable versions, scoped identity, trusted publishing, provenance, dist-tags, install forms, and bootstrap constraints mapped from npm primary sources. |
| Local package dry-run | Available | `npm pack --dry-run --json` inspected the current boundary without creating a tarball or publishing. |
| Version-control and release history | Available | Current branches, historical release-convention commits, empty tag set, absent `release.yml`, and empty GitHub Release inventory inspected. |
| Existing release tests/artifact parity evidence | Partial | Source/build/bin tests exist, but there is no clean packed-install, package-content, dual-channel parity, or release-protocol test. |
| npm identity and maintainer authority | Missing | Registry state is known, but no approved controlled package/scope or first-publish credentials were established. |
| Repository release-policy settings | Missing | Immutable Releases, protected release environment, reviewers, and npm trusted-publisher binding are external configuration not yet proven. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | Inventory all local versioning, packaging, changelog, tag, and release configuration | High | Done | Current boundary, history, tests, dry-run contents, and missing surfaces mapped. |
| 2 | Verify official GitHub Release support for generated assets, checksums, attestations, and release-on-tag automation | High | Done | Primary-source contract mapped, including non-atomic and rerun behavior. |
| 3 | Verify official npm publication support for scoped identity, trusted publishing/OIDC, provenance, dist-tags, and immutable versions | High | Done | Primary-source contract mapped, including first-publish bootstrap. |
| 4 | Compare independent jobs, ordered jobs, and one orchestrated release job | High | Done | Parallel mutation rejected; ordered jobs are safe only as one reconciliation-aware logical state machine. |
| 5 | Determine whether the npm tarball itself should be attached to GitHub Releases | High | Done | Confirmed: persist one candidate and supply the same bytes to both channels. |
| 6 | Define version/tag authority and parity verification across both channels | High | Done | Authority is a verified tag/commit/package/version/tarball tuple, not the tag alone. |
| 7 | Define user-facing acquisition contract and channel precedence | High | Open | Both paths are viable; npm-primary/fallback versus equal-supported-channel language is a product decision. |
| 8 | Identify release permissions, environments, and human gates | Medium | Open | Required gates are identified; their external settings and owners remain to be confirmed. |
| 9 | Shape the surviving release protocol into backlog slices and dependencies | High | Done | Seven distribution slices plus one onboarding bridge are provisionally mapped below. |
| 10 | Trace exact code, workflow, test, and documentation seams for each slice | High | Done | Package, installed-resource, candidate, planner, CI, docs, and onboarding caller chains mapped. |
| 11 | Split preparation-now work from human-gated activation and publication | High | Done | Eight preparation slices are current scope; all remote mutations and identity activation moved later. |
| 12 | Finalize the case and hand the current-scope story map to epic/backlog workflows | High | Done | Outcome 5 completed; task materialization is the next workflow, not an investigation gap. |

## Timeline of Events

| Time | Event | Source | Confidence |
| --- | --- | --- | --- |
| 2026-08-20 | User requested investigation of simultaneous GitHub Release and npm distribution | Conversation | Confirmed |
| 2026-08-20 | npm registry returned E404 for `work-package-manager` and an unrelated `wpm@0.1.0` package | npm registry queries | Confirmed |
| 2026-08-20 | GitHub Releases API returned an empty release list for `kukhta-ai/work-package-manager` | GitHub API | Confirmed |
| 2026-08-20 | Local `npm pack --dry-run --json` described `wpm-0.1.0.tgz`: 420 entries, 458,914 packed bytes, 1,671,153 unpacked bytes | npm CLI against current workspace | Confirmed |
| 2026-08-20 | Official npm contracts for tarball publication, immutable versions, trusted publishing, provenance, scopes, tags, and install forms were mapped | npm documentation | Confirmed |
| 2026-08-20 | Official GitHub contracts for releases, exact assets, digests, immutable releases, attestations, environments, concurrency, and reruns were mapped | GitHub documentation | Confirmed |
| 2026-08-20 | Independent parallel, simply ordered, and coordinated state-machine topologies were tested against nine release/failure scenarios | Outcome 3 causal analysis | Confirmed |
| 2026-08-20 | The proposed staging-tag/final-dist-tag sequence was refuted because npm trusted-publisher OIDC cannot authorize later `npm dist-tag` mutation | npm trusted-publisher and dist-tag contracts | Confirmed |
| 2026-08-20 | A preceding “Verified WPM Distribution” user-value epic and one bridge into authoring onboarding were provisionally mapped | Outcome 3 user-story-map analysis | Deduced |
| 2026-08-20 | User fixed the branch boundary: publication is out of scope; all preparation that does not require a blocking human decision is in scope | User direction | Confirmed |
| 2026-08-20 | Package and installed-resource caller chains were traced from clean checkout through npm tarball, generated shims, package version, templates, and packaged skills | Outcome 4 source trace | Confirmed |
| 2026-08-20 | Release candidate and reconciliation seams were traced; no existing release scripts, candidate record, state planner, release workflow, or protocol tests exist | Outcome 4 source trace | Confirmed |
| 2026-08-20 | The user story map was split into eight preparation stories and a later human-gated activation track | Outcome 4 scope reconciliation | Deduced |

## Confirmed Findings

### Finding 1: The current npm identity cannot be published as genuine WPM

**Evidence:** `package.json:2-4`; npm registry query on 2026-08-20.

**Detail:** The manifest name is `wpm`, but npm currently resolves `wpm@0.1.0` to unrelated software. The unscoped name `work-package-manager` currently returns E404, but it is not the manifest identity and availability alone is not ownership or product approval.

### Finding 2: npm package contents and CLI entry already have an explicit local shape

**Evidence:** `package.json:7-27`.

**Detail:** The package declares Node 20+, a required Backlog.md peer, `wpm` and `installer` executable aliases, and an explicit published file set containing `agent-skills`, `dist`, `docs`, and `templates`.

### Finding 3: A separate release workflow is intended but absent

**Evidence:** `.github/workflows/ci.yml:12-13`; repository file inventory on 2026-08-20.

**Detail:** CI says tag-triggered npm release belongs in `release.yml`, while `.github/workflows/` currently contains only `ci.yml`.

### Finding 4: No GitHub Release baseline exists

**Evidence:** GitHub API response for `repos/kukhta-ai/work-package-manager/releases` on 2026-08-20 was `[]`.

**Detail:** There is no existing release, asset naming convention, checksum contract, or release-note pattern to preserve.

### Finding 5: The public package identity is internally contradictory

**Evidence:** `package.json:2`; `README.md:24,50`; `FAQ.md:186`; `docs/12-builder-architecture.md:36`; npm registry queries on 2026-08-20.

**Detail:** The manifest and lockfile name the package `wpm`; public instructions tell users to install `work-package-manager`; the architecture still labels the final package name TBD. The `wpm` registry name is occupied by unrelated software. `work-package-manager` returned E404, but that is neither a reservation nor proof that maintainers control it. The installed command can remain `wpm` regardless of the eventual package name because the npm `bin` map is independent of package identity.

### Finding 6: The observed npm boundary is real but not clean-release-safe

**Evidence:** `package.json:18-39`; `.gitignore:5-7`; `tsconfig.build.json:3-12`; local `npm pack --dry-run --json` on 2026-08-20.

**Detail:** The dry run described `wpm-0.1.0.tgz` with 420 entries. It included `README.md`, seven `agent-skills` files, 372 `dist` files, 17 docs, 22 template files, and `package.json`; it excluded source, tests, backlog, `CHANGELOG.md`, `CONTRIBUTING.md`, and any license file. Both executables require `dist/cli.js`, yet `dist/` is ignored and no `prepack` or `prepublishOnly` script builds it. The successful dry run therefore depended on existing workspace output. The `prepare` lifecycle (`husky`) also ran during the dry run.

### Finding 7: npm can publish the prebuilt candidate, but versions are one-way and first publication needs bootstrap authority

**Evidence:** npm `publish`, `pack`, scoped-package, trusted-publisher, provenance, and `trust` documentation.

**Detail:** `npm publish ./artifact.tgz` is a supported publication form. A package name/version can never be reused, even after unpublish, so rerunning publication is a reconciliation problem rather than an idempotent write. GitHub Actions trusted publishing can later use short-lived OIDC credentials, but the package must already exist before its trusted publisher can be configured. The first publication therefore needs account 2FA or a suitable granular token; later OIDC publication requires a GitHub-hosted runner, Node 22.14+, npm 11.5.1+, `id-token: write`, exact repository/workflow identity, and a matching `repository.url`. The current manifest has no `repository` field.

### Finding 8: GitHub can publish the exact same prebuilt bytes with independently verifiable identity

**Evidence:** GitHub Releases and release-assets REST documentation; GitHub immutable-release and release-integrity documentation.

**Detail:** A release can be keyed to an already-pushed tag, held as a draft, and accept a raw prebuilt `.tgz` as an asset. The asset response exposes state, size, SHA-256 digest, actual filename, and a public `browser_download_url`; tag-pinned download URLs are documented. If immutable releases are enabled, publication locks the tag and assets and creates a release attestation. GitHub CLI can verify both the immutable release and a local file against an attached asset.

### Finding 9: GitHub publication is a non-atomic protocol and npm does not remove that partial-failure boundary

**Evidence:** GitHub release/assets APIs, workflow rerun and concurrency documentation; npm publish contract.

**Detail:** Draft creation, asset uploads, attestations, release publication, and npm publication are separate mutations. GitHub rejects a duplicate asset name instead of overwriting it; a failed upload can leave an empty starter asset; npm rejects an already-published version. Workflow concurrency prevents overlapping attempts but does not make sequential reruns idempotent. A safe release design must inspect existing tag/release/assets/npm-version state, compare commit and digests, resume a compatible draft, accept a matching completed side as converged, and stop on conflict.

### Finding 10: The current repository proves source quality, not consumer-install or release quality

**Evidence:** `.github/workflows/ci.yml:40-85`; `test/integration/cli.bin.test.ts:10-40`; `test/unit/agent-skills/installer-builder-skill.test.ts:8-105`; `.github/workflows/release.yml` absent.

**Detail:** CI covers Node 20/22 across Linux, macOS, and Windows, then type-checks, lints, builds, and tests. Its bin test manually symlinks local `dist/`; the skill tests read repository files directly. No test creates a clean npm tarball, installs it, invokes both npm-generated bin shims, resolves templates/skills from the installed package, or compares the npm artifact to a GitHub asset. No tag-triggered publication workflow exists.

### Finding 11: `wpm build publish` is not the builder's npm release mechanism

**Evidence:** `docs/10-authoring-cli.md:184-186`; `src/adapters/packager.ts:366-383`; Backlog CLI record for TASK-84.

**Detail:** That command distributes generated work-package archives to a local directory or Git remote and explicitly defers npm/HTTP registry publication. It cannot be counted as release automation for the WPM CLI itself.

### Finding 12: Exact-byte dual publication is supported; independent rebuilding is not

**Evidence:** npm `pack`/`publish` contracts; GitHub release-assets API; Outcome 2 Finding 8.

**Detail:** npm accepts a prepared local `.tgz`, and GitHub accepts the raw bytes of that file as a release asset. Neither provenance nor attestation requires a second build. Official npm evidence does not promise byte-reproducible `npm pack` output across independent rebuilds, so the invariant is one persisted candidate reused by both channels—not “build twice from the same commit.” Cross-channel verification must hash both downloaded artifacts with the same algorithm rather than compare GitHub's SHA-256 string directly with npm's SHA-512 integrity string.

### Finding 13: “Simultaneous” publication cannot be atomic

**Evidence:** GitHub release/assets APIs; npm immutable version contract; Outcome 3 failure matrix.

**Detail:** Every ordering contains a period in which one platform has changed and the other has not. Parallel jobs widen and obscure that state; concurrency only prevents overlap and does not reconcile reruns. A lost success response can make a blind retry collide with an immutable npm version or an existing GitHub asset. The user's two-channel premise is feasible as one release, but literal simultaneous/atomic publication is refuted.

### Finding 14: The least-risk order is GitHub draft -> human gate -> npm public -> GitHub public

**Evidence:** GitHub draft and immutable-release contracts; npm publication immutability; Outcome 3 topology/refutation passes.

**Detail:** The candidate, notes, checksums, and attestations can be made complete and digest-verified in a non-public GitHub draft before the first irreversible public mutation. npm is then published from that persisted candidate and read back for integrity. Only after matching npm state exists is the prepared GitHub draft published and re-verified. If npm fails, no channel is public. If GitHub finalization fails after npm succeeds, a compatible rerun keeps npm untouched and resumes GitHub. Publishing GitHub first is less recoverable because an immutable public release could be stranded by a permanent npm name/version conflict.

### Finding 15: npm must receive its final dist-tag during publication

**Evidence:** npm trusted-publisher and dist-tag documentation; Outcome 3 correction pass.

**Detail:** Trusted-publisher OIDC authorizes `npm publish` but not a later `npm dist-tag`. With no stored long-lived publication token after bootstrap, the workflow cannot publish under a temporary tag and promote it later. A stable release must publish directly under its approved stable tag (normally `latest`); a prerelease must publish directly under an approved non-latest tag and have the corresponding GitHub prerelease classification. A matching version with a wrong or missing dist-tag is a manual-authority state, not an automated OIDC repair.

### Finding 16: Distribution is a preceding user journey, not an onboarding implementation detail

**Evidence:** README acquisition flow; current onboarding scope; Outcome 3 user-story mapping.

**Detail:** Users must obtain a genuine, installable WPM before its personal skill can guide agent selection or create an authoring workspace. The release protocol also serves every future WPM capability, not only the current onboarding epic. It therefore forms a distinct user-value epic—“Verified WPM Distribution”—with one explicit bridge into public agent-guided onboarding. Local onboarding development can use a verified local tarball earlier, but the public onboarding promise cannot close until both distribution channels and the bridge are complete.

### Finding 17: The current branch owns preparation, not activation or publication

**Evidence:** User direction on 2026-08-20.

**Detail:** In scope are every deterministic, non-mutating outcome needed to make a later dual release safe. Out of scope are selecting/claiming the permanent npm coordinate, creating or moving tags, creating or publishing a GitHub Release, publishing an npm version, configuring GitHub protections or Immutable Releases, and configuring npm ownership or trusted publishing. Preparation must remain useful with those values unresolved and must report them as later activation prerequisites rather than blocking current implementation.

### Finding 18: The clean package chain breaks before `npm pack`

**Evidence:** `package.json:28-39`; `.gitignore:5-8`; `tsconfig.build.json:1-15`.

**Detail:** `npm ci` runs Husky's `prepare` lifecycle but does not create `dist/`. `npm run build` cleans and compiles `src/` into the ignored `dist/`, while `npm pack` includes `dist/` through the files allowlist but has no lifecycle guarantee that it exists. A clean checkout can therefore pack an incomplete product unless candidate preparation explicitly builds first or the package lifecycle is corrected.

### Finding 19: Installed-layout production paths are already coherent; the archive boundary is unproven

**Evidence:** `src/cli.ts:3680-3688,3693-3727`; `src/version.ts:1-12`; `package.json:18-26`.

**Detail:** Both declared bins target `dist/cli.js`; the entry point handles npm-style symlinks; version resolution reads package-root `package.json`; real dependencies locate `templates/` and `agent-skills/` beside `dist/`. This agrees with the declared files allowlist. Existing tests, however, use repository-local `dist/`, manually create only the `installer` symlink, or inject repository resource roots. No test installs the produced `.tgz` and exercises npm-generated shims and naturally resolved resources.

### Finding 20: No builder-release preparation implementation exists

**Evidence:** `.github/workflows/ci.yml:12-13,65-86`; repository file inventory; release-related history.

**Detail:** The repository has no release-preparation script tree, candidate manifest/checksum contract, policy schema, channel-state snapshot, reconciliation planner, activation guard, or preparation workflow. Current CI stops after source quality, build, and Vitest. The existing `wpm build publish` caller chain ends in `src/adapters/packager.ts:365-405`, can copy or Git-push generated work-package archives, and must not be reused for releasing the WPM CLI.

### Finding 21: Preparation can be made structurally incapable of publishing

**Evidence:** Current absence of release mutators; Outcome 4 process-boundary analysis.

**Detail:** Candidate creation needs only local Git reads and local npm build/pack/install commands. Channel preparation needs only supplied or GET-derived snapshots plus pure classification. A preparation workflow needs only `contents: read`, ordinary branch/manual triggers, local verification, and optional ephemeral Actions artifacts. It requires no tag/release trigger, environment, secret, `id-token: write`, repository write permission, `npm publish`, `npm dist-tag`, `gh release`, tag push, or non-GET API method. Omitting a mutation port entirely is stronger than shipping dormant publishers behind a flag.

### Finding 22: Public onboarding claims must remain inactive while local onboarding becomes testable

**Evidence:** `README.md:24,50-70`; `FAQ.md:181-187`; `agent-skills/installer-builder/SKILL.md:1-18`; `templates/project/minimal/snippets/authoring-front-door.md.tmpl:22-40`.

**Detail:** README and FAQ currently claim an unpublished npm coordinate. At the same time, the packaged skill, explicit `wpm skill install`, and generated workspace front door form the handoff that a locally installed tarball can already exercise after current onboarding stories adapt them. Preparation must remove false public claims, prove the local tarball-to-explicit-setup journey, and leave the future public coordinate as inactive configuration. It must not claim the public acquisition requirement complete.

## Deduced Conclusions

### Deduction 1: Supporting both channels is a new release-system capability, not merely documentation

**Based on:** Findings 1-4.

**Reasoning:** Neither channel currently has a valid WPM publication identity or automated release path, and there is no published baseline to update.

**Conclusion:** The investigation must define one release authority and build/publish contract before the onboarding backlog can treat either install command as canonical.

### Deduction 2: One candidate artifact can technically serve both channels

**Based on:** Findings 6-8.

**Reasoning:** npm accepts a prepared `.tgz`, while GitHub uploads a prebuilt asset as raw bytes and exposes its digest. Neither platform requires rebuilding that candidate inside its publication step.

**Conclusion:** A build-once, inspect-once candidate can be passed unchanged to both publishers. This establishes feasibility, not yet the safe ordering or canonical channel.

### Deduction 3: Publication must be modeled as a convergent state machine

**Based on:** Findings 7-9.

**Reasoning:** One side may succeed after the other fails, and neither platform provides a cross-channel transaction or rollback. Repeating either write blindly produces a conflict.

**Conclusion:** Any recommended topology needs explicit preflight, per-channel observed state, digest/commit comparison, resumable draft behavior, and a hard stop on incompatible published state.

### Deduction 4: Package identity is a human/product gate, not an implementation default

**Based on:** Findings 5 and 7.

**Reasoning:** The working manifest name is occupied; the documented alternative is merely unclaimed at the query time; a scoped identity depends on verified ownership. Choosing among them changes the permanent public install coordinate.

**Conclusion:** Backlog decomposition may represent the decision and its prerequisites, but must not silently freeze a registry identity.

### Deduction 5: The release mechanism is one logical state machine, not one privileged monolithic job

**Based on:** Findings 9, 13-15.

**Reasoning:** Separate least-privilege jobs may own candidate creation, GitHub staging, npm OIDC publication, and finalization, but a simple `needs:` chain cannot recover from a mutation whose success response was lost. Every start must derive state from GitHub and npm and one coordinator must decide missing, matching, conflicting, or complete.

**Conclusion:** Backlog criteria should specify convergent observed outcomes and conflict behavior, not prescribe a single process or framework shape.

### Deduction 6: A temporary npm-public/GitHub-pending state is unavoidable in the recommended protocol

**Based on:** Findings 13-15.

**Reasoning:** npm becomes public under its final dist-tag in one mutation; GitHub publication is a later independent mutation. Staging GitHub first minimizes risk but cannot make those writes atomic.

**Conclusion:** The product owner must approve this bounded partial state. Automation must surface and converge it; it must never describe the operation as transactional or roll npm back.

### Deduction 7: Release stories must precede, but need not serialize all onboarding implementation

**Based on:** Finding 16.

**Reasoning:** Packed-install proof is enough for local onboarding slices to consume a real package boundary, while public bootstrap instructions require actual verified channels.

**Conclusion:** The clean package/install slices are early dependencies; remote publication may proceed in parallel with agent-adapter work; a final distribution-to-onboarding bridge joins both tracks.

### Deduction 8: Human choices can be moved behind an activation record instead of blocking preparation

**Based on:** Findings 17, 20-22.

**Reasoning:** Package completeness, local installation, candidate identity, and state classification can operate on observed metadata and representative policy inputs. The unresolved public coordinate and platform settings are necessary only before a remote write or public claim.

**Conclusion:** Current work should expose distribution as inactive, enumerate every missing activation fact, and make release eligibility fail closed. It should neither infer a package name from registry availability nor require a human answer to implement or verify preparation.

### Deduction 9: Release preparation belongs outside the shipped pure core

**Based on:** Findings 11, 20-21 and the architecture invariant in `docs/13`.

**Reasoning:** Repository release orchestration is development/release tooling, not the product's SDLC-agnostic domain. Putting it under `src/core/` would compile it into the shipped CLI and tempt reuse of generated-package mutation adapters.

**Conclusion:** The natural source boundary is an unshipped release-tooling surface plus schema/fixture/tests and a read-only workflow. Existing runtime code should change only if the packed-install test exposes a real installed-layout defect.

### Deduction 10: Public distribution and local onboarding have separate completion claims

**Based on:** Findings 16-17 and 22.

**Reasoning:** A local `.tgz` can prove WPM package acquisition, explicit agent setup, skill installation, and workspace handoff without any registry or release. It cannot prove that an unconfigured public user can find genuine WPM at either remote coordinate.

**Conclusion:** Current-branch onboarding evidence may close the local packed-artifact journey; the public acquisition requirement remains activation-gated until a later authorized release and cold public verification.

## Hypothesized Paths

### Hypothesis 1: One tag can safely drive both GitHub Release and npm publication

**Status:** Open

**Theory:** A single version/tag and tested release candidate can feed two channel-specific publication steps without creating divergent releases.

**Supporting indicators:** One pushed tag can key a GitHub release; one prebuilt `.tgz` can be accepted by both platforms; GitHub Actions can obtain npm OIDC credentials after bootstrap.

**Would confirm:** Official platform contracts plus a topology where both channels verify the same commit, version, and package bytes with safe reruns and explicit partial-failure handling.

**Would refute:** A platform constraint or artifact mismatch that requires independent version/build authority per channel.

**Refutation attempt:** A protected tag was tested as the only authority and failed: it does not prove the package manifest version or candidate bytes, and it cannot make the two public writes atomic. Independent publishers were also tested and rejected.

**Resolution:** One tag can trigger a technically convergent protocol only when joined to the verified commit/package/version/tarball tuple, staged ordering, external-state reconstruction, and conflict stops. It remains Open until the product owner accepts the unavoidable temporary npm-only state and conflict policy.

### Hypothesis 2: npm should be the convenience channel and GitHub Releases the transparent artifact/fallback channel

**Status:** Open

**Theory:** Users normally acquire the CLI through npm, while GitHub exposes the exact release artifact, checksums, notes, and a direct-install fallback.

**Supporting indicators:** The product is a Node CLI with an npm `bin`, while the repository is already hosted on GitHub.

**Would confirm:** User journey and platform evidence showing both paths can install the same package contents without different behavior.

**Would refute:** GitHub assets need a different executable/package format or the npm identity remains unavailable/unapproved.

**Refutation attempt:** Identical bytes were tested as proof of equivalent channel semantics and failed: npm provides registry discovery/dist-tags, while a GitHub URL is only a pinned alternate source and does not reproduce npm availability or update semantics.

**Resolution:** The GitHub asset is technically viable as an alternate pinned acquisition path, not an outage-independent or feature-equivalent npm replacement. Channel precedence and user-facing language remain a product choice.

### Hypothesis 3: Building once and publishing the same npm tarball to both channels minimizes drift

**Status:** Confirmed

**Theory:** `npm pack` produces the canonical release candidate; npm publishes it, and GitHub Releases attaches that same tarball plus verification metadata.

**Supporting indicators:** `package.json:18-27` defines one package boundary; npm accepts a local `.tgz`; GitHub accepts the same file as a raw release asset and reports its digest.

**Would confirm:** npm supports publishing the prebuilt tarball and GitHub supports attaching it unchanged; checksums and installed-content tests agree.

**Would refute:** npm trusted publication/provenance or GitHub attestation requirements force channel-specific rebuilding.

**Refutation attempt:** Provenance, attestation, trusted publishing, independent rebuilds, and the platforms' different digest algorithms were tested for a forced channel-specific build. None requires one; independent rebuilding instead introduces an unproven byte-equivalence assumption.

**Resolution:** Confirmed. Build and packed-install-test one candidate, persist it, and supply those exact bytes to both publishers. The first authorized release still needs to verify the operational prebuilt-tarball/OIDC combination, but that is a narrow execution check rather than a conflicting platform contract.

## User Story Map: Preparation Now, Activation Later

The aliases below are planning handles, not Backlog.md task IDs. Current-branch tasks may be materialized only through the Backlog CLI after Outcome 5. The activation track is recorded for dependency integrity but is not part of this branch's ready set.

### Current branch: “Distribution prepared but inactive”

```text
DIST-PREP-01 -> DIST-PREP-02 -> DIST-PREP-03 -> DIST-PREP-04
                                                       |---> DIST-PREP-05 --|
                                                       `---> DIST-PREP-06 --+-> DIST-PREP-07

DIST-PREP-03 + existing onboarding setup/skill/front-door slices -> ONB-DIST-PREP
```

| User activity | Preparation story | Observable outcomes | Depends on |
| --- | --- | --- | --- |
| Keep distribution truthful while inactive | `DIST-PREP-01` Expose an inactive distribution contract | Readiness is blocked without an activation record; every missing policy fact is reported together; public surfaces do not claim an unavailable npm coordinate; the occupied `wpm` identity cannot become eligible accidentally | None |
| Produce the real package | `DIST-PREP-02` Establish the clean packed-package boundary | A clean checkout packs without ambient ignored output; required runtime, templates, WPM skills, docs, license, and metadata are present; developer/local state is absent; declared bins resolve inside the artifact | `DIST-PREP-01` |
| Use the package as a consumer | `DIST-PREP-03` Deliver a clean local packed-install journey | Fresh supported environments install the local tarball, invoke every declared bin, resolve packaged resources, and receive actionable prerequisite failures; installation alone changes no agent or workspace scope | `DIST-PREP-02` |
| Bind one candidate | `DIST-PREP-04` Produce an inactive verifiable release candidate | One record binds observed package/version, proposed tag, commit, exact tarball, size/digests, packed-install evidence, and notes preview; all rehearsals consume those bytes; mismatches make it ineligible; no remote state is created | `DIST-PREP-03` |
| Rehearse GitHub staging | `DIST-PREP-05` Prepare the GitHub release staging contract | A no-write plan reports the required tag/draft/assets/checksums/notes/evidence; missing policy is an activation prerequisite; matching snapshots converge; incompatible tag/release/asset state is a hard conflict; no tag, draft, release, or asset is created | `DIST-PREP-04` |
| Rehearse npm publication | `DIST-PREP-06` Prepare the npm publication contract | A no-write plan reports required coordinate/final dist-tag/provenance/trust facts; missing identity or authority is an activation prerequisite; matching registry state converges; incompatible bytes/metadata/tag state is conflict or manual authority; no package or trust state is mutated | `DIST-PREP-04` |
| Prove convergence before activation | `DIST-PREP-07` Report convergent dual-channel release state | Combined snapshots classify as blocked, ready, matching, resumable, conflicting, or complete; compatible partial success preserves completed work; conflicts name the channel and never recommend rollback/overwrite/retag/version reuse; repeated rehearsals are stable | `DIST-PREP-05`, `DIST-PREP-06` |
| Join distribution to agent onboarding | `ONB-DIST-PREP` Prepare the distribution-to-onboarding bridge | Inactive README/FAQ are truthful; an agent starting from the local tarball reaches explicit adapter setup and workspace creation without repository-relative resources; acquisition is inert; packaged skills, setup help, and front doors agree on personal/workspace handoff | `DIST-PREP-01`, `DIST-PREP-03` + existing adapter/setup/skill/front-door stories |

### Backlog-safe implementation boundaries

- `DIST-PREP-02/03` may correct package lifecycle/metadata, add the already-declared MIT license, and add clean tarball/install evidence without changing the package name.
- `DIST-PREP-04` owns one candidate; matrix jobs must verify or transport it rather than independently rebuild and assume byte equality.
- `DIST-PREP-05/06/07` own declarative observations and plans only. No mutation interface is present in this increment.
- Preparation tooling stays outside `src/core/` and outside the npm files allowlist. It does not reuse `wpm build publish` or its generated-package adapters.
- A preparation workflow, if added, has read-only repository permission, no tag/release trigger, no protected environment/secrets/OIDC, and no publication command.
- Every slice owns its verification; there is no detached final test-only task.
- Local onboarding may proceed after `DIST-PREP-03`; neither the distribution epic nor public acquisition requirement is Done at the preparation milestone.

### Later activation track—recorded, not current-branch work

| Deferred activity | Later outcome |
| --- | --- |
| Approve distribution policy | A controlled npm coordinate, bin policy, channel roles, release-class mapping, immutability policy, and bounded partial-public-state policy are explicitly authorized without publishing |
| Activate identity in source-controlled surfaces | Manifest/lock, public docs, candidate metadata, CLI help, and bootstrap guidance use the approved contract and the packed-install journey remains green |
| Establish external authority | GitHub protections and approved immutability policy are configured; first-publish npm authority exists; routine work still stores no long-lived publication secret |
| Add gated mutation capability | Narrow GitHub/npm mutation adapters and an environment-gated release workflow consume the prepared planner; preparation remains the source of candidate and reconciliation truth |
| Perform and verify the first release | One authorized tag/commit/version/digest is present in both channels; compatible partial success resumes; trusted publishing is bound after the package exists |
| Activate public onboarding | A cold agent can acquire the same release through the approved npm coordinate or pinned GitHub asset and reach the prepared explicit setup/handoff journey |

All human gates block only this later track. They are not dependencies of the eight current preparation stories.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| Approved, controlled npm namespace/identity | Blocks later activation only; does not block preparation | Human product decision plus proof of user/org scope ownership or successful authorized name claim. |
| First-publication authority | Blocks later npm activation only | Confirm maintainer 2FA and an approved granular-token/bootstrap path; no credentials were inspected. |
| Exact GitHub/npm trust binding | Blocks a future mutating workflow only | Confirm public owner/repo, workflow filename, environment, `repository.url`, runner, and npm trusted-publisher settings. |
| Repository Immutable Releases and environment protections | Blocks later public-policy verification only | Repository administrator inspects and configures settings; preparation reports them as unresolved inputs. |
| Clean packed-install evidence | Blocks current preparation completion | Current-branch story: isolated clean build, pack, inspect, install, invoke both bins, and exercise installed templates/skills/docs. |
| Exact prepared package contents | Blocks current package-boundary completion | Current-branch story adds the already-declared MIT license and exact allow/deny evidence; policy-dependent alias/changelog choices remain reported activation inputs. |
| Channel-role and partial-public-state approval | Blocks later confirmation of Hypotheses 1-2 only | Product owner decides whether both paths are equal or npm is primary, and accepts or rejects the bounded npm-public/GitHub-pending recovery state. |
| Stable/prerelease policy | Blocks later final dist-tag selection only | Preparation fails closed when mapping is unresolved; activation chooses stable-only or explicit non-latest prerelease tags. |
| Release-ready `main` | Blocks a real tag release only | Human-reviewed promotion from `dev`; current `main` is still the initial commit and lacks the package. |
| Exact prebuilt-tarball + trusted-publishing trial | Leaves a later operational uncertainty | Preparation proves the tarball locally; the first explicitly authorized release verifies the combined OIDC operation. |

## Source Code Trace

| Element | Detail |
| --- | --- |
| Error origin | N/A — exploratory release-system investigation |
| Current package caller chain | `npm ci` (Husky only) -> `npm run build` -> clean `dist/` compile -> `npm pack` files allowlist -> local npm install -> generated `wpm`/`installer` shims -> `dist/cli.js` |
| Installed resource chain | `dist/cli.js` -> package-root `package.json` for version; package-root `templates/` for list/init; package-root `agent-skills/` for explicit skill installation; static `docs/` ship without a runtime caller |
| Existing evidence bypass | `test/integration/cli.bin.test.ts` manually symlinks only `installer` to repository `dist/`; init/skill tests use repository resource roots rather than an installed tarball |
| Prepared candidate chain | Clean checkout -> ordinary quality/build gate -> `npm pack` exactly once -> exact ship-set inspection -> isolated local install -> candidate record/checksums/notes -> no-write eligibility result |
| Prepared planner chain | Candidate + inactive policy + representative or GET-derived GitHub/npm snapshots -> pure reconciliation classification -> structured blocked/ready/resumable/conflict/complete report |
| Activation guard | No mutation interface; read-only workflow permissions; no tag/release trigger, environment, secret, OIDC, `npm publish/dist-tag`, `gh release`, Git push, or non-GET API call |
| Later activation chain | Human-approved identity/settings -> same candidate/planner -> GitHub draft -> npm final-tag publication -> GitHub publication -> read-back parity; entirely out of current scope |
| Recovery states | Missing compatible work -> plan only missing work; matching state -> converge; wrong npm tag with matching bytes -> later manual authority; incompatible identity/digest -> `CONFLICT` |

### Affected source and test boundaries

| Boundary | Existing surfaces | Missing preparation surface |
| --- | --- | --- |
| Package lifecycle and ship set | `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.build.json`, `LICENSE` absent | Clean pack lifecycle, exact allow/deny checks, coherent repository metadata, license payload |
| Installed CLI/resources | `src/cli.ts`, `src/version.ts`, `templates/`, `agent-skills/`, `docs/` | Local-tarball install test using npm-created shims and naturally resolved resources |
| Candidate identity | No implementation | Unshipped release-preparation tooling, machine-readable candidate/checksum contract, ignored/ephemeral output |
| Channel observations and reconciliation | No implementation | Inactive policy example/schema, GitHub/npm snapshot schemas or fixtures, pure no-write planner and scenario tests |
| CI preparation | `.github/workflows/ci.yml`; no release workflow | Non-publishing package/candidate gate or read-only preparation workflow with activation-guard evidence |
| Truthful docs and bridge | `README.md`, `FAQ.md`, `CONTRIBUTING.md`, `docs/12-builder-architecture.md`, packaged skill/front-door surfaces | Inactive-distribution language, preparation/activation handoff, local-tarball onboarding evidence |

## Final Conclusion

**Confidence:** High for current-branch scope, source boundaries, and dependency shape

Two distribution paths can represent one release but cannot be made atomic. The later safe protocol remains one persisted, packed-install-tested tarball, GitHub staged first, npm published once with its final approved dist-tag, and GitHub published last under a reconciliation-aware coordinator.

This branch does not cross that protocol's public boundary. It can complete a coherent “distribution prepared but inactive” milestone without any blocking human choice: expose unresolved policy truthfully; make packaging clean; prove consumer installation and packaged resources; bind one inactive candidate; rehearse GitHub and npm independently from snapshots; prove combined convergence; and join the local tarball to the prepared agent-onboarding journey. The exact code trace shows this work belongs in unshipped release tooling and tests, not `src/core/`, and requires no publisher or write-capable workflow.

The backlog is therefore split into eight current preparation slices and a separate later activation track. Package identity, channel roles, immutability, prerelease policy, external trust, tag/main promotion, and actual publication cannot block the current branch because they are inputs only to later activation. The mental model and source trace are sufficient for epic preparation; remaining missing evidence belongs exclusively to that deferred activation track.

## Recommended Next Steps

### Fix direction

1. **Package boundary:** make clean packing self-contained, include the required license/resources, and prove the exact installed artifact rather than repository-local output.
2. **Candidate identity:** emit and verify one inactive candidate binding observed package/version, proposed tag, commit, exact tarball, checksums, install evidence, and notes—without remote mutation.
3. **Release planning:** classify supplied/read-only GitHub and npm snapshots through a pure convergent planner with no mutation port and explicit activation refusal.
4. **Onboarding bridge:** make inactive public guidance truthful while proving the local tarball reaches explicit agent setup and workspace handoff.
5. **Backlog handoff:** reconcile these four mechanisms into the eight user-value slices above; keep later activation/publication outside the current ready set.

### Diagnostic

No additional diagnosis blocks current work. During epic validation, verify that no preparation criterion claims a remote release, selected npm identity, applied repository setting, or public acquisition completion; verify dependency joins against existing adapter/setup/skill/front-door stories; verify no acceptance criterion prescribes source filenames or implementation steps.

### Recommended workflow handoff

- **Recommended now:** `bmad-create-epics-and-stories` to reconcile the preparation epic and onboarding bridge into the existing user-story map.
- **Then:** create the accepted current-scope stories through the Backlog CLI and use `bmad-create-story` when implementation begins.
- **Later scope change:** use `bmad-correct-course` when humans authorize identity activation or publication.
- **Not recommended now:** `bmad-quick-dev`; implementation before epic/backlog reconciliation risks mixing preparation with prohibited publication behavior.

## Reproduction Plan

In an isolated clean checkout, build and pack once; inspect the exact allow/deny boundary; install the tarball into an isolated prefix; invoke both declared bins; exercise installed templates, skills, and docs; generate one inactive candidate; feed it representative missing/matching/partial/conflicting GitHub/npm snapshots; confirm stable no-write classifications and activation refusal. The plan must complete without a network write, package-name choice, credential, tag, release, or publication.

## Side Findings

- `package.json:20` still exposes the legacy `installer` executable alias alongside `wpm`; whether both remain public should be resolved with distribution identity rather than accidentally frozen into the first release.
- The current dry-run package contains no `LICENSE`, despite `package.json` declaring MIT and `docs/12` marking the file required.
- GitHub-generated source ZIP/TAR archives are not substitutes for the WPM-owned `.tgz`: they are generated on demand and do not participate in GitHub's documented release-asset verification command.
- An npm Git/GitHub install is a weaker fallback than a pinned release `.tgz`: it can install development dependencies, run `prepare`, and defaults to the repository's default branch if not pinned.
- The current local npm 10.9.4 is below npm's documented 11.5.1 trusted-publishing minimum; a release workflow must pin a compatible npm CLI rather than inherit the CI default.

## Primary External Sources

- npm: [publish](https://docs.npmjs.com/cli/v12/commands/npm-publish/), [pack](https://docs.npmjs.com/cli/v12/commands/npm-pack/), [trusted publishers](https://docs.npmjs.com/trusted-publishers/), [provenance](https://docs.npmjs.com/generating-provenance-statements/), [scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), [dist-tags](https://docs.npmjs.com/cli/v12/commands/npm-dist-tag/), and [install forms](https://docs.npmjs.com/cli/v12/commands/npm-install/).
- GitHub: [release API](https://docs.github.com/en/rest/releases/releases?apiVersion=2022-11-28), [release asset API](https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28), [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases), [release verification](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity), [artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), and [concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
