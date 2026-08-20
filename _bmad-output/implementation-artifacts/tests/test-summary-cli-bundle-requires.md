# Test Automation Summary — cli-bundle-requires (Family K, tasks 62/63/64)

## Generated Tests

### Unit (in-process over in-memory ports — `run()` + MemoryFileSystem/FakeBacklog)
- [x] `test/unit/cli/bundle-requires-commands.test.ts` — 26 tests covering `bundle <id> requires add/list/remove`.

### E2E (through the BUILT `dist/cli.js` + real `NodeFileSystem` tmpdir + real Backlog.md)
- [x] `test/integration/cli.bundle-id.e2e.test.ts` — appended a `describeIfBuilt` block: 11 real-binary tests.

## Coverage by acceptance criterion

| AC | Where verified |
|----|----------------|
| 62#1 add explicit constraint (literal range to bundle.yml) | unit (raw-text + parsed-normalized) + E2E (real eemeli/yaml round-trip, literal `^0.1.0`) |
| 62#1 caret default `^<dep-version>` | unit (raw `^0.1.0`, not `>=0.1.0`) + E2E |
| 62#1 overwrite (one key, latest range) | unit |
| 62#1 bad range → UsageError exit 2, nothing written | unit |
| 62#2 cycle warns (2-bundle + self-loop), edge still written, exit 0 | unit (stderr) + E2E (stderr via `wpmFull`) |
| 62#2 non-cyclic add → no warning | unit |
| 62#3 materialise "Adapt <id>'s…use <dep>" idempotent by title | unit + E2E (real `.authoring-backlog` via `backlog task list`) |
| 62#4 dep-not-enabled → NotFound exit 1, nothing written | unit + E2E |
| 62#5 outside-project → exit 1 naming manifest.yml + init | unit |
| 62#5 dep completes from enabled bundles | unit + E2E (`__complete`) |
| 62#6 help (description, synopsis, dep+constraint positionals, example) | unit + E2E (leaf usage) |
| 63#1 list prints dep-id + range, one per line | unit + E2E |
| 63#1 empty requires → clear marker | unit + E2E (`(no requires)`) |
| 63#2 read-only (disk unchanged) | unit |
| 63#3 outside-project → exit 1 | unit |
| 63#3 id completes from enabled bundles | unit |
| 63#4 help | unit |
| 64#1 remove drops the entry, others + comment survive | unit + E2E |
| 64#2 materialise "Verify <id> no longer references <dep>" | unit + E2E (real `.authoring-backlog`) |
| 64#3 remove-not-present → NotFound exit 1, nothing written | unit + E2E |
| 64#4 outside-project → exit 1 | unit |
| 64#4 dep completes from THIS bundle's current requires (id-aware source) | unit + E2E (`__complete`) |
| 64#5 help | unit + E2E |

## Key findings baked into the tests
- `parseBundleManifest` NORMALIZES npm ranges (committed convention; `^0.3.0` → `>=0.3.0 <0.4.0-0`). The CLI
  writes the RAW caret to `bundle.yml` (human-readable), but reads (`requires list`, `bundle show`) display the
  normalized form. Tests assert the RAW caret against file text and the NORMALIZED form against parsed/printed
  values, via a `normalizedRange()` helper that re-derives through the model (no hand-typed comparators).
- `bundle new` scaffolds `requires: {}` as an INLINE flow map, so the first add lands as `requires: { b: ^0.1.0 }`
  (flow), not block — the E2E regex matches the literal caret regardless of layout.

## Result
- Unit: 26/26 pass. E2E (requires block): 11/11 pass (real binary + real Backlog.md). No skips when `dist/` built.
