---
name: wpm-repo-test
description: Select and run WPM behavioral, property, architecture, and mutation
  checks. Use when implementing or evaluating WPM repository changes.
---

# Verify WPM behavior

Read [the development process](../../../docs/development.md). Match the check to the behavior: pure core tests use injected fakes; adapter tests use isolated temporary directories; installed CLI journeys exercise actual packed bytes. Do not put temporary source fixtures into the shared checkout.

Use focused Vitest files while the diff changes. Include observable rejection paths, filesystem confinement, deterministic output, dry-run no-effects, setup inheritance and explicit null, and batch-removal preflight when affected. Properties should probe an invariant across varied data; they should not reproduce implementation logic.

Use `npm run quality:fast` for fast local checks and `npm run quality:ci` once the product/test diff is stable. Run `npm run quality:release` for release qualification. Architecture checks need positive and negative bypass cases; critical mutation survivors require a fix or a narrow reviewed disposition. Do not lower thresholds or silently omit inputs to make checks pass.

Report exactly which commands ran, source revision, failures, and external prerequisites. A schema check of skill files does not prove that a fresh agent discovers or follows them. Keep that behavioral qualification separate, using the protocol in the development document.
