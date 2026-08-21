# PRD Addendum — Downstream Design Inputs

This companion preserves implementation-significant context extracted during the 2026-08-21 PRD update.
It does not extend the approved product scope, authorize publication, or supersede `docs/00`–`14`.

## Architecture inputs for authoring onboarding

The exact model and port shapes remain architecture decisions. These inputs constrain observable behavior
without prescribing class or function structure.

- Define each authoring adapter once, including its personal and workspace destinations, native front door,
  detection behavior, launch hint, and reload guidance. Reuse the adapter definition across setup, workspace
  integration, verification, and help.
- Keep personal-scope writes behind injected filesystem and environment boundaries. The pure core must be
  able to represent setup before any project workspace exists and to validate the complete plan for the
  selected destinations before the first write.
- Preserve stable template-task identity through a narrow Backlog.md boundary for reading task identity.
  Title-only matching is insufficient; this is not authorization for a second task engine or generic
  reconciliation.
- Represent a partial post-write failure as a structured non-success outcome that identifies which boundaries
  completed, which failed, and what recovery guidance applies. Do not imply success, automatic rollback, or a
  general resume engine.

## Deferred distribution-activation inputs

These are deferred activation constraints only. The current increment performs no credential handling,
trust configuration, public-identity selection, tag or release creation, npm publication, or other remote
writes and makes no user-facing channel-precedence decision.

This deferred distribution-activation assessment must preserve, but must not decide, the controlled npm
coordinate, public executable name or alias policy, channel roles and precedence, stable-versus-prerelease
mapping, GitHub immutability policy, and acceptance or rejection of the bounded npm-public/GitHub-pending
recovery state.

For future activation design, retain these distribution-investigation findings as inputs to a later
human-authorized decision:

- First npm publication requires bootstrap authority distinct from routine trusted-publisher/OIDC operation.
- A trusted publisher cannot be assumed to perform a later dist-tag mutation. The approved final tag must
  therefore be part of publication. If the matching version exists with a wrong or missing tag, correcting it
  requires later manual authority.
- Publication is not simultaneous or transactional. The investigation's candidate least-risk topology would
  reconstruct observed state, prepare and verify a GitHub draft, pass a human gate, publish the exact
  persisted tarball to npm under its final tag, and then publish and re-verify GitHub. The current increment
  does not adopt or implement that topology.
- Lost responses and compatible partial completion are handled by reconstructing external state. Blind retry,
  rollback, overwrite, retagging, version reuse, and independently rebuilt channel artifacts are rejected.
