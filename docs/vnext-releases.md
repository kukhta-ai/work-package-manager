# Portable work-package releases

The additive `wpm vnext release` surface builds one selected root and its runtime dependency closure. It operates on work packages; repository SDK candidate tooling has a separate purpose. Existing `wpm vnext build/test` and legacy commands retain their original formats and behavior.

## Build and inspect

```sh
wpm vnext --root ./suite --package app release build --format tgz --files
wpm vnext --root ./suite release build app --format zip --out ./delivery/app.wpm.zip
wpm vnext --root ./suite release build app --format directory --out ./delivery/app
wpm vnext --root ./delivery release view ./app.wpm.zip --files
wpm vnext --root ./delivery release view ./app.wpm.zip --agent-support --target claude-code --opening session
wpm vnext --root ./delivery release verify ./app.wpm.zip
```

TGZ is the default. New release output defaults to `builds/<name>-<version>.wpm.tgz`, `.wpm.zip`, or the directory `<name>-<version>.wpm` inside the selected package. Explicit `--out` resolves relative to `--root`. An omitted package requires an unambiguous existing selection; `--package-version` disambiguates registered versions. Multiple roots are not supported.

A directory is the same portable release already unpacked into a folder. All three forms carry identical package content, including `contract.json`, recipient instructions, operations, optional worker setups and payload. Graph releases retain namespaced instances and exclude dev-only dependencies. The recipient uses their own agent and needs no WPM, Backlog.md or APM installation.

Build consumes existing current locks and prepared APM outputs. It never resolves dependencies, refreshes locks, compiles APM, starts services or executes package work. Plain standalone packages need no artificial APM lock. An existing stale standalone integrity lock still blocks build. `--dry-run` reads and validates without creating output, journals, directories, locks or caches; `--files` includes the immutable inventory in the result.

TGZ and ZIP output are deterministic. ZIP uses stored ZIP32 regular-file entries; reading also supports the bounded deflate subset. Encryption, ZIP64, data descriptors, archive comments/extra fields and links are unsupported. Existing portable path restrictions, the 100-byte path ceiling and 64 MiB uncompressed USTAR accounting limit apply to every release representation. Directories may not contain unrecorded empty folders.

## Integrity and compatibility

New releases carry canonical `release-manifest.json` with `schemaVersion: 1`, the root name/version, a sorted `{path, sha256}` inventory and `contentDigest`. The inventory includes every release file except the manifest itself. Its identity is the existing SHA-256 of stable JSON for that inventory. The manifest bytes must exactly equal their canonical reconstruction.

`contentDigest` is identical for TGZ, ZIP and directory representations. `artifactDigest` identifies the exact archive bytes and therefore differs between TGZ and ZIP; directories use their content identity. `verify --expected-digest <sha256>` accepts a bare or `sha256:`-prefixed digest and checks archive bytes when available, otherwise directory content. Digests establish consistency with supplied evidence; they do not authenticate a publisher.

Saved-artifact `view`, `verify` and `review` need no authoring source or local native tool. They validate contract versions 1/2, finite runtime graph and instance inventories, operation/group/setup references, portable/private boundaries and canonical MCP/native configuration. Modified, missing, additional, corrupt or unsupported contents fail. New TGZ releases can be imported through existing local archive dependencies without changing their frozen graph.

Old TGZ releases without a manifest remain readable. `view` reports `integrity: unrecorded`; `verify` requires an externally supplied expected digest instead of inventing complete integrity evidence.

Publication uses an adjacent stage and ownership journal. Exact existing output is reused; differing content is preserved and reported as a conflict. A matching interrupted request can resume only when its recorded owned state remains exact. Ambiguous unowned stages or changed partial output require explicit inspection. A release directory is immutable delivery content: keep recipient work and review output outside it.

## External static review

```sh
wpm vnext --root ./delivery release review app.wpm.zip --out ./review-request
# An independently selected reviewer reads REVIEW.md and subject/ as data,
# then completes a copy of report-template.json outside the subject.
wpm vnext --root ./delivery release review app.wpm.zip --report ./completed-review.json --out ./accepted-review
```

The first invocation returns `awaiting-review` and writes `request.json`, `REVIEW.md`, `report-template.json` and a captured `subject/` tree. WPM never launches the reviewer. The package cannot select the authoritative reviewer. The template is incomplete and is not evidence of a completed review.

An external report uses `schemaVersion: 1`; `subject` contains `name`, `version`, `contentDigest` and the exact `artifactDigest` for archives. `reviewer` contains a nonempty `name` and optional `identity`. Other required fields are `scope: static`, `executionOccurred: false`, `findings`, `unknowns`, `recommendations` and an actual UTC `completedAt` timestamp. Each finding has `severity` (`info`, `low`, `medium`, `high`, `critical`), `evidence`, `message` and optionally an existing subject-relative `path`. Unknowns and recommendations are string arrays.

Import rejects malformed or duplicate JSON keys, unsupported fields, mismatched identities/digests and claims of dynamic execution. A valid report with findings still returns `reviewed`; its original bytes, digest, findings and unknowns remain evidence. The claimed reviewer identity remains `unverified`. Output requests and accepted reports use separate immutable destinations and never modify the subject release.

Configuration files included, context loaded, service authentication, actual behavior and completed review are separate facts. `view --agent-support` describes native files and explicit host actions for project/session opening; it does not claim execution. A successful verify or completed review is not a safety certificate. Signatures, publication, network package resolution and behavioral agent sessions are outside this release surface.
