---
name: wpm-repo-release
description: Prepare and verify an inactive WPM release candidate bound to
  source and artifact digests. Invoke explicitly for candidate qualification or
  release work.
disable-model-invocation: true
---

# Qualify a WPM candidate

Read [the development process](../../../docs/development.md) and the repository distribution-preparation contract before running candidate tooling. This skill does not authorize publication, remote writes, tags, or merges. Public distribution remains inactive until separately approved.

Establish a clean exact source revision and run `npm run quality:release`. Build the package once, retain its version, source SHA, SHA-256 digest, toolchain identity, and check results. Verify the same artifact bytes in a clean consumer, including the plain journey without APM and absence of repository development skills or private state.

Present the concrete candidate identity and evidence for human review. Approval applies to the recorded digest. A changed artifact, rebuilt tarball, mismatched source, missing tool, failed check, or unexplained mutation survivor requires renewed qualification. Never repair a candidate by changing its digest record to match unchecked bytes.

When publication is eventually activated, use the approved immutable artifact and separate authorized workflow. Keep PR credentials and caches out of publication authority. Integrity mismatches stop convergence; resolve them explicitly rather than overwriting external state. Store compact receipts durably and raw logs privately with their retention policy.
