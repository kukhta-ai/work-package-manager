# Test Automation Summary — TASK-108 clean exact package boundary

## Generated and Audited Tests

### Maintainer package-preparation acceptance tests

- [x] `test/integration/distribution-preparation/package-preparation.test.ts` drives the actual unshipped Node
  entry through Git, npm lifecycle, real `.tgz` production, direct archive inspection, process exits, and JSON
  report boundaries.
- [x] QA added a clean committed fixture that successfully produces a real archive but exits `1` with one
  structured report containing its prohibited planning path, absent declared root, absent license, and missing
  executable target. This closes the gap between pure aggregate rejection and the real maintainer process.
- [x] Existing acceptance journeys cover invalid invocation, requested-versus-checked-out revision mismatch,
  dirty-source refusal, and an accepted clean copied WPM revision installed from the lockfile with no prior
  `dist/` and an injected ignored stale sentinel.
- [x] Independent review added a real process case proving ignored contributor-local input is rejected before
  lifecycle packing can consume it, while the accepted clean-copy journey remains green.

### Package contract, archive, and non-leakage tests

- [x] `test/unit/distribution-preparation/package-boundary.test.ts` covers exact-set success, arbitrary future
  asset omission, deterministic aggregate rejection, explicit prohibited path roles, prose false-positive
  avoidance, portable absolute/traversal paths, resolvable/broken/cyclic symbolic and hard links, malformed
  executable declarations, code-point ordering, duplicate paths, literal-root expansion, and invalid or
  incomplete declarations.
- [x] `test/unit/distribution-preparation/package-archive.test.ts` reads manifest, file, and link evidence from
  actual gzip/tar bytes, preserves hard-link semantics, and rejects truncated, checksum-invalid,
  unterminated, hidden-trailing, and unsupported-type archives while preserving invalid paths for the
  boundary evaluator.
- [x] `test/unit/distribution-preparation/prepare-package.test.ts` proves npm execution is shell-free on
  Windows, fails closed when npm's JavaScript entry is unavailable there, and retains the POSIX fallback.
- [x] `test/integration/distribution-preparation/public-surfaces.test.ts` keeps all preparation modules checked
  by TypeScript and Biome but outside `dist/`, the WPM npm allowlist, generated authoring deliverables, release
  credentials, publication automation, and public acquisition guidance.
- [x] `test/integration/cli.build.e2e.test.ts` proves a representative `distribution-preparation/` source and
  sentinel remain absent from generated tarball and Git deliverables, with identical zip coverage when the
  platform tools are available.
- [x] `test/integration/package-runtime-support.test.ts` and `test/integration/cli.bin.test.ts` retain the
  supported Node/dependency contract and both built executable aliases without pulling Story 1.3's fresh
  packed-install journey forward.

## Acceptance-Criteria Coverage

- **AC 1 — clean checkout produces without ambient state:** the accepted real-package journey copies a clean
  Git revision, installs with `npm ci --ignore-scripts`, proves `dist/` absent, injects stale ignored output,
  then observes clean-build removal and successful real packing.
- **AC 2 — package is bound to revision and declared ship set:** exact revision success reports the full SHA and
  equal expected/actual sets; separate process cases reject a mismatched requested revision and a dirty
  checkout before packing.
- **AC 3 — paths, identity, version, and executables are inspectable:** both pure and real-archive journeys
  assert sorted paths, `wpm@0.1.0`, and `{ wpm, installer } -> ./dist/cli.js`; QA's rejected real archive also
  proves structured evidence remains available on boundary failure.
- **AC 4 — every revision-required asset is present and resolvable:** literal declared roots expand to leaf
  paths; the accepted archive has exact parity and contains license, metadata, compiled CLI, WPM skill,
  templates, and docs; every packed bin target exists.
- **AC 5 — later declared assets need no special inspector:** an arbitrary future asset added only to the
  expected set is rejected when omitted, while an arbitrary nested asset under a literal root is discovered
  automatically. The evaluator has no skill/template/document artifact-type branch.
- **AC 6 — prohibited or missing content is rejected together:** the pure aggregate fixture covers all six
  prohibited categories plus invalid, duplicate, escaping-link, missing, unexpected, metadata, and bin issues
  in stable order; QA's real rejected archive proves aggregate process-level failure; npm and generated
  tar/Git/conditional-zip non-leakage remain explicit.
- TASK-108 acceptance criteria: **6/6 covered**.
- API endpoints: not applicable; this feature exposes no HTTP/service API.
- UI workflows and semantic locators: not applicable; WPM is a Node CLI and this seam is maintainer-only.

## Verification

- QA-added real rejected-package journey: **1/1 passed**.
- Focused distribution-preparation automation: **46/46 passed across 6 files**.
- Generated tarball/Git/conditional-zip non-leakage journey: **1/1 passed**.
- Built runtime and executable-alias regressions: **8/8 passed across 2 files**.
- Focused total executed in this QA run: **55/55 passed**.
- `npm run typecheck`: passed.
- `npx biome ci .`: passed, **212 files checked**.
- `npm run build`: passed; explicit inspection found no distribution-preparation output under `dist/`.
- `git diff --check`: passed.
- Per the current direct-specialist fast-feedback policy, the one exact full `npm test` stable-diff gate is
  deliberately reserved for the independent reviewer.

### Independent Review Verification

- Automatic review fixes: **5 high + 3 medium; 0 findings remain open**.
- Final focused distribution-preparation automation: **59/59 passed across 7 files**.
- Generated tarball/Git/conditional-zip non-leakage journey: **1/1 passed**.
- Built runtime and executable-alias regressions: **8/8 passed across 2 files**.
- `npm run typecheck`, `npx biome ci .` (**213 files**), `npm run build`, explicit preparation-tool build
  exclusion, and `git diff --check`: passed.
- Exact stable-diff `npm test`: **1,353/1,353 passed across 107 files in 396.28 seconds**.
- Stable product/test hash:
  `45bbf491e7b3bbf7f253eb8c7a65e86c5b34af2ce41a71467855aa5e4f8e7301`.

## Test Quality

- Vitest 4.1.7 and the repository's existing unit/integration project conventions are used; no new framework,
  dependency, fixture layer, API harness, or browser tool was introduced.
- Process tests have behavior-oriented descriptions, isolated temporary Git repositories, no sleeps or
  retries, explicit timeouts only for subprocess safety, and deterministic cleanup after every case.
- Happy and critical failure paths are both observed through the executable boundary. Assertions focus on
  status, structured evidence, archive existence, exact paths, and machine-readable violations rather than
  incidental npm console text.
- The QA addition exercises a missing acceptance seam rather than duplicating the pure evaluator: it proves
  build/pack success and boundary rejection can coexist in one real process result.

## Deliberate Scope Deferrals

- Fresh-prefix installation, npm-generated shims, executable invocation, and installed-resource resolution
  remain Story 1.3 / TASK-109.
- Persisted candidate bytes, size/digests, and quality/install evidence remain Story 1.4 / TASK-110.
- Live read-only GitHub/npm assessment and combined channel convergence remain Stories 1.5–1.7 /
  TASK-111–TASK-113.
- No publication, release, credential, remote-write, activation, or artifact-specific inspection behavior was
  added.

## Workflow Evidence

- The actual `bmad-qa-generate-e2e-tests` skill was invoked in YOLO mode for TASK-108 against the explicit
  Story 1.2 artifact and current implementation.
- Customization resolved no activation prepend/append steps; the persistent `project-context.md` glob matched
  no files; no workflow override applied; the completion hook resolved empty.
- Existing framework selected: Vitest 4.1.7. API and UI generation steps were inapplicable; local maintainer
  subprocesses, real archives, repository/package boundaries, and generated deliverable formats are this
  feature's through-the-edges surfaces.
- The independent reviewer invoked the actual `bmad-story-automator-review` skill in automatic-fix mode;
  the skill had no review customization file or completion hook, and no project-context fact file or override
  resolved. Review verdict: **APPROVE with 0 open findings**.
