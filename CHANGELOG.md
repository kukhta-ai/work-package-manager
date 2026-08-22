# Changelog

All notable changes to **the `wpm` builder** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (see
[`CONTRIBUTING.md` → Versioning & releases](./CONTRIBUTING.md#versioning--releases)).

This changelog tracks the **builder's** releases only. Each bundle the builder *produces* carries its own
independent version in its `bundle.yml` and is not recorded here.

## [Unreleased]

### Added

- A revision-bound local package-preparation command that clean-builds, packs, and inspects the exact WPM npm
  archive without enabling public distribution or remote mutation.
- A fresh local packed-install verifier that consumes the accepted inspection evidence, installs only those
  archive bytes in an isolated consumer prefix, and exercises the installed bins and resources without running
  WPM setup or changing coding-agent configuration.
- A deterministic local inactive-candidate command that persists one verified package, SHA-256/SHA-512
  digests, inspection/quality/install evidence, and release-note preview without replacing changed bindings or
  creating any public distribution state.
- A read-only local GitHub staging assessment that compares an exact inactive candidate with caller-supplied
  policy and observations, recognizing compatible tag/release/asset state and aggregating missing proof and
  hard conflicts without creating or changing Git or GitHub objects.
- Foundation work in progress (pre-1.0): the `wpm` CLI package, its TypeScript/ESM toolchain, and the
  ports-and-adapters core are under active development against the design set (`docs/00`–`14`). Individual
  changes will be itemized here as the surface stabilizes toward the first tagged release.

---

The builder's current version is `0.1.0` (unreleased). When the first release is cut, the entries above move
under a dated `## [X.Y.Z] - YYYY-MM-DD` heading and a fresh `## [Unreleased]` section takes their place — see
[`CONTRIBUTING.md` → Release activation is deferred](./CONTRIBUTING.md#release-activation-is-deferred).
