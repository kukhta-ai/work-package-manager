# Input Reconciliation — Dual GitHub/npm Distribution Investigation

## Inputs compared

- `_bmad-output/implementation-artifacts/investigations/dual-github-npm-distribution-investigation.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/addendum.md` was not present; the dated scoped addendum is embedded in `prd.md`.

## Scope guard

This reconciliation preserves the approved boundary: the current increment prepares one exact inactive WPM package candidate and assesses supplied or read-only GitHub/npm state. Selecting a public identity or channel policy, configuring authority or trust, creating or moving tags, creating or publishing releases, publishing npm versions, public acquisition, and every other remote write remain deferred. The gaps below do not add those activities to the current increment.

## Material already preserved

The PRD retains the investigation's central result: dual distribution is prepared around one persisted, packed-install-tested tarball rather than independently rebuilt artifacts; installation is inert; public-coordinate claims remain inactive; GitHub and npm are assessed without writes; missing policy facts block eligibility rather than implementation; combined state is classified as blocked, ready, matching, resumable, conflicting, or complete; compatible partial completion is preserved; conflicts fail closed without rollback, overwrite, retagging, or version reuse; and preparation tooling stays outside `src/core`, the shipped CLI package, and generated work-package deliverables with no mutation or credential capability.

## Material gaps and tensions

### 1. The deferred activation fact set is no longer explicit

The investigation names the unresolved decisions that an activation record must eventually hold: controlled npm coordinate, public bin/alias policy, channel roles, stable-versus-prerelease mapping, GitHub immutability policy, and acceptance or rejection of the unavoidable bounded `npm public / GitHub pending` recovery state. PRD FR39 says to report “all activation facts,” and the deferred section mentions identity/channel policy broadly, but those concrete facts are not enumerated. This risks preparation implementations reporting different prerequisite sets while still claiming FR39 compliance.

**Scope-safe disposition:** retain these as named, unresolved inputs that the inactive assessment must report; do not decide them or require a human answer in this increment.

### 2. The npm first-publication constraint is compressed past a safety-relevant distinction

The investigation distinguishes first-publish bootstrap authority from routine trusted-publisher/OIDC operation and records that trusted-publisher OIDC cannot perform a later `npm dist-tag` mutation. Therefore the approved final dist-tag must be supplied during publication, and a matching version with a wrong or missing tag is a later manual-authority state. PRD FR44 mentions coordinate, final tag, provenance, authority, and manual-authority states, but it does not retain the first-publish-versus-routine-authority distinction or the “final tag at publish” constraint that explains those outcomes.

**Scope-safe disposition:** preserve these as facts the no-write npm assessment models and reports. No credential, trust configuration, publication, or dist-tag mutation enters current scope.

### 3. The validated later publication topology is absent as a deferred contract

The investigation rejects parallel fire-and-forget and simple blind retries. Its least-risk later protocol is: reconstruct external state on every attempt, prepare and verify a GitHub draft, pass the later human gate, publish the exact tarball to npm under its final tag, then publish and re-verify GitHub; a lost response or partial completion must converge from observed state. PRD FR43–FR45 preserve no-write staging and convergence classifications, but not this validated ordering or the reason publication cannot be described as simultaneous or transactional.

**Scope-safe disposition:** record the topology only as a deferred activation constraint consumed by the prepared planner. Do not add a publisher, release workflow, gate, or remote mutation story now.

### 4. The historical npm-only wording can silently decide an intentionally deferred channel policy

The historical PRD calls the eventual distribution model a global npm install. The investigation establishes that the same `.tgz` can also be attached to GitHub Releases as a pinned alternate acquisition artifact, while also establishing that this is not feature-equivalent to npm discovery, dist-tags, or update semantics. Whether npm is primary and GitHub a fallback, or both are presented as supported channels, remains a product decision. The current PRD adds dual-channel assessment but does not qualify the older npm-only wording, so a downstream reader could treat channel precedence as already decided.

**Scope-safe disposition:** clarify that the historical npm install statement does not settle channel role or precedence. Current work remains neutral: it prepares and assesses the exact candidate for both channels, makes no public acquisition claim, and leaves user-facing channel policy to later authorization.

## Conflict check

There is no conflict with the approved current-increment boundary. The only tension is interpretive: the historical npm-only distribution wording can be read as resolving a channel-policy choice that the investigation and the PRD's own deferred outcomes leave open. The four items above are preservation gaps for requirements wording and later activation handoff, not authorization to publish or to choose an identity, channel role, trust configuration, or public install command.
