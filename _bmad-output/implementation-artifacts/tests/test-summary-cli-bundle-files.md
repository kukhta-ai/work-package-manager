# Test Automation Summary — cli-bundle-files (Family L, tasks 65/66/67)

## Generated / Extended Tests

### Schema unit (the new payload registry round-trip)
- [x] `test/unit/schema/bundle.test.ts` — extended: absent payload ⇒ empty (old-bundle.yml compat), populated
  round-trip, serialize always emits payload.files, malformed payload / payload.files rejection.

### Unit (in-process over in-memory ports)
- [x] `test/unit/cli/bundle-files-commands.test.ts` — 35 tests covering `bundle <id> files add/list/remove`.

### E2E (through the BUILT dist/cli.js + real NodeFileSystem tmpdir + real Backlog.md)
- [x] `test/integration/cli.bundle-id.e2e.test.ts` — appended a `describeIfBuilt` block: 8 real-binary tests.

## Coverage by acceptance criterion

| AC | Where verified |
|----|----------------|
| 65#1 register, no content written, comment+order preserved | unit (payload.files + file bytes unchanged + key order incl `payload`) + E2E (real eemeli/yaml round-trip lists agents.md; file content unchanged) |
| 65#1 set-like idempotent add | unit |
| 65#1 nested path + registration order | unit |
| 65#2 not-on-disk → typed error exit 1, nothing registered | unit (byte-unchanged) + E2E |
| 65#3 outside-project exit 1 naming manifest.yml + init | unit |
| 65#3 path completes from files present under payload/files | unit + E2E (`__complete`) |
| 65#4 help (description, synopsis, path positional, example) | unit + E2E (leaf usage) |
| 66#1 list one-per-line / empty marker | unit (exact stdout `(no files)`) + E2E |
| 66#2 read-only | unit (manifest + bundle.yml unchanged) |
| 66#3 outside-project / id completion | unit |
| 66#4 help | unit |
| 67#1 deregister + prints "left at payload/files/<path>" | unit + E2E (the doc-10:167 message) |
| 67#2 file left on disk (deregister-not-delete) | unit (exists + content unchanged) + E2E |
| 67#3 not-registered → NotFound exit 1, nothing changed | unit + E2E |
| 67#4 outside-project / path completes from registered refs | unit + E2E (`__complete`) |
| 67#5 help | unit + E2E |
| OLD bundle.yml without payload still parses (absent ⇒ empty) | schema unit + E2E (overwrite to strip payload → list `(no files)` + add introduces the field) |

## Key findings baked into the tests
- The `payload` field is OPTIONAL and absent ⇒ empty (`payload.files = []`). This is mandatory: `parseBundleManifest`
  is on the load path for EVERY command, and many existing fixtures/tests omit `payload`. Verified via the schema
  test + a real-binary old-bundle.yml-overwrite test.
- Every mutation rides the ⑤ MATERIALISE beat, which lists the authoring backlog even when the operation
  materialises NO task — so the in-process unit seed must `backlog.init(.authoring-backlog)` (as `wpm init` does).
  (Caught during dev: a missing init surfaced as "No backlog initialised at .../.authoring-backlog".)
- `bundle new` (createBundle) now scaffolds `payload: { files: [] }`, so the first real add appends to it; the
  old-bundle.yml compat E2E explicitly overwrites bundle.yml to strip the field.
- Several model/services test fixtures construct `BundleManifest` literals — each updated with `payload: { files: [] }`.

## Result
- Schema unit: pass. Files unit: 35/35 pass. E2E (files block): 8/8 pass (real binary + real Backlog.md). No skips
  when `dist/` built.

## Generalization seam (M/N)
- The op is descriptor-driven (`PayloadRefDescriptor { onDiskDir, ymlPath, select, noun }` + `FILES_DESCRIPTOR`).
  M (templates → `payload/templates`, `payload.templates`) and N (scripts → `installer-scripts`, `payload.scripts`)
  are each a new descriptor + one `PerBundleCommandModule` + adding their category to `BundlePayload` + the schema
  round-trip — no re-implementation.
