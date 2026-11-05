# WPM vNext implementation and technology decisions

The work is tracked by Backlog tasks 136–140 on `feat/wpm-vnext`. The approved scope combines the portable operation package, optional worker setup, native developer guidance, architecture constraints and private delivery. The additive `wpm vnext` namespace preserves existing commands while the new source format is qualified. The [product contract](vnext.md), [development process](development.md), [delivery contract](delivery.md) and [Groma contract](groma.md) describe the resulting behavior.

## Technology choices

| Boundary | Choice | Reason |
|---|---|---|
| CLI and runtime | TypeScript, ESM, Commander; preserve the existing Node >=20 product contract | Reuse the working CLI and its installed-consumer coverage. Node 24 is the normal development/CI target; Node 26 adds forward compatibility evidence. |
| Domain | Pure core, injected effect ports, explicit composition roots | Keep filesystem, subprocess, environment, time and agent tooling outside domain decisions. |
| Portable source | YAML with comment-preserving edits; strict JSON Schema through Ajv; SemVer | Provide a machine contract without discarding authored comments or conflating absent setup with explicit null. |
| Authoring tasks | Native Backlog.md CLI, stable WPM operation identities | Preserve the task tool's native ownership and separate group selections from prerequisites. |
| Worker setup | Plain WORKER.md first; optional pinned external APM adapter | The recipient already owns an agent. Locking, installation and compilation are separate explicit phases. |
| Unit and acceptance checks | Vitest and fast-check | Test observable outcomes, generated input boundaries, deterministic artifacts and repeat behavior after partial failures. |
| Source quality | Strict TypeScript including exact optional properties; Biome; type-aware ESLint | Syntax formatting and semantic checks have distinct responsibilities. Floating promises, unsafe values and non-exhaustive switches fail. |
| Architecture | dependency-cruiser plus transitive purity checks and real negative fixtures | Catch re-export, alias and utility bypasses rather than merely checking direct imports. |
| Dead code | Knip in default and production modes | Test imports must not make test-only implementations appear necessary in the shipped product. |
| Mutation testing | Stryker on declared critical pure modules | Require explanations or additional tests for survivors; preserve raw reports as ignored evidence. |
| Security and workflow checks | Local hash-locked Semgrep rules, actionlint, zizmor, Gitleaks and OSV-Scanner | Missing tools and failed analysis are errors. OSV uses a retained, fingerprinted offline database. |
| Package quality | publint against the actual archive, clean installed consumer | Qualification concerns the bytes being reviewed, with no silent repack. |
| Architecture navigation | Groma.md 0.7.8 and an exact TypeScript scanner | Keep curated responsibilities and relationships beside executable import constraints. Groma is not an architecture-test replacement. |
| Change and delivery | Short topic branches, independent PR review, Changesets, immutable candidate receipt | Public distribution remains inactive. Publication is a separate human decision about qualified bytes. |

Version pins and integrity reside in `package-lock.json`, `quality/toolchain.json`, the hash-locked Python requirements and Groma configuration. They take precedence over version examples in research notes. No application starter framework is needed for this CLI; adopting a web/SaaS template would add unrelated runtime and deployment assumptions.

## Implementation order and acceptance evidence

1. Preserve the legacy installed CLI and add a plain vertical slice: native operation tasks, groups, setup declarations, validation, locks, deterministic archives and a static recipient rehearsal. Exercise the installed archive outside its checkout, with no APM prerequisite.
2. Add canonical Codex skills, generated Claude projections, native explicit-release metadata and a confined checker. Validate frozen index bytes independently from the current working tree. Keep developer, author and recipient instructions separate.
3. Enforce typed source checks and the complete first-party dependency graph. Prove failures using isolated direct, re-export and alias fixtures, ambient-effect attempts and empty scopes. Move test doubles and test-only fixture writers outside shipped source.
4. Establish Groma ownership, exact scanner installation and isolated freshness checks. Preserve curation across rescans; leave deployment boundaries as drafts when the scanner cannot infer them truthfully.
5. Qualify optional APM with a real pinned executable and native local fixture. Bind generated setup context to its source, native lock, target and tool. Never infer successful target deployment or agent launch from static files.
6. Run the stable quality bands, clean installed-consumer matrix and mutation review. Prepare an inactive exact-archive candidate only after those checks pass. Bind its source revision, toolchain and archive digests; keep source-containing exports in private artifacts.
7. Submit the reviewable change for independent review and a human merge decision. Configure required checks and any eventual trusted publishing as separate authorized repository administration work.

Task notes record actual results and remaining limitations. A declared workflow or a static native-artifact check is not evidence that remote CI, branch protection, a fresh agent session or a release publication ran successfully.

## Evidence reused from neighboring projects

- `aiforyou-app` at `ca08f3f7`: committed typed lint rules, fail-closed graph availability, transitive import restrictions, exact SCC exceptions and positive/negative bypass fixtures. Its local ESLint run could not be qualified when the dependency was absent; the configuration was inspected, not reported as a passing run.
- `org-os` at `9ee435aa`: generated-artifact checks regenerate from an exported staged snapshot rather than trusting checksums or the working tree. Its focused generated-guard suite passed 14 tests during research.
- `ai-onboarding-helper` at `0856259`: explicit toolchain pins, fresh-checkout checks, native artifact management and preservation of user configuration. The inspected working-tree agent suite passed 11 tests; the repository had unrelated pending changes, so that result is not attributed to a pristine revision.

These are patterns transferred with their evidence limits, not copied project policies. The new repository implements its own tests and source boundaries.

## Primary references

- [Groma.md source](https://github.com/MrLesk/Groma.md)
- [TypeScript ESLint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)
- [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Knip production mode](https://knip.dev/features/production-mode)
- [Stryker configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [OSV offline mode and usage](https://google.github.io/osv-scanner/usage/)
- [APM lock](https://microsoft.github.io/apm/reference/cli/lock/), [install](https://microsoft.github.io/apm/reference/cli/install/) and [compile](https://microsoft.github.io/apm/reference/cli/compile/)
