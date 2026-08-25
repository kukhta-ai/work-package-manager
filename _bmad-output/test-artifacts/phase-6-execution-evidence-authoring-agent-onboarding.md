# Phase 6 execution evidence — authoring-agent onboarding

Recorded: `2026-08-25T11:15:58Z`

## Verdict

- Exact-final cold checkout, static/build/test, package inspection, source-free installation, inertness, production dependency audit, and inactive candidate assessments: **PASS**.
- Authenticated Claude Code six-skill behavioral parity: **BLOCKED before the first skill cell** by an externally expired OAuth token.
- Overall Phase 6 acceptance: **BLOCKED**. No final onboarding acceptance, publication eligibility, release authorization, or receiving-agent acceptance is claimed.
- The exact-final cold evidence closes the execution gap previously tracked as NFR10, subject to TEA consuming this artifact. NFR8 remains open until a human reauthenticates Claude Code outside WPM and the complete 24-subrun six-skill matrix passes in a fresh authorized execution.

## Exact source and isolation

- Required source revision: `c7753aa4829c758964a1c6811fc05b8d06aad4cd`.
- Disposable clone: local `git clone --no-local --no-checkout`, then detached checkout of the exact commit. A setup-only checkout command was initially issued one directory above the new clone and returned 128; it changed no repository bytes. The corrected checkout preceded every gate.
- All commands below ran from the disposable clone or disposable installed-package roots, never from the shared checkout.
- Baseline and every post-gate check reported the exact commit, empty `git status --porcelain=v1 --untracked-files=all`, empty `git diff --check`, and empty `git diff --stat`.
- The shared checkout was not used for a gate and retained only root-owned `.serena/.gitignore` and `.serena/project.yml` before this evidence file was added.

## Cold CI-equivalent sequence

| Command | Exit | Result | Shell elapsed |
| --- | ---: | --- | ---: |
| `npm ci` | 0 | 108 packages added; normal `prepare`/Husky lifecycle ran | 3.233s |
| `npm run typecheck` | 0 | TypeScript clean | 2.895s |
| `npx biome ci .` | 0 | 271 files checked, no fixes | 0.378s |
| `npm run build` | 0 | Build clean | 1.581s |
| `npm test` | 0 | 140/140 files; 1,944/1,944 tests | 1,879.400s |
| `npm audit --omit=dev --json` | 0 | 0 production vulnerabilities at every severity | 2.260s |

Vitest reported 1,879.12s duration (`transform` 2.60s, `import` 9.61s, `tests` 1,872.37s, `environment` 6ms). The shell recorded 1,904.662s user and 647.796s system time.

The dev-inclusive `npm ci` advisory summary reported three high-severity findings. The required production-only audit independently reported 28 production dependencies and zero info, low, moderate, high, or critical vulnerabilities. Its evidence digest was `sha256:2fdf6c53f247781e25780d0aa5dec567f5f1fea352558917d72ba0cb8c2b8548`.

During the long suite, host `ps etime` displayed a known spurious additional day. `lstart` and active child progression proved the run began at 10:30:58 UTC and was healthy; no process was terminated or restarted. This was an observation-display diagnosis, not a gate failure.

## Single accepted package

Exactly one archive was created from the clean exact revision:

- Package: `wpm@0.1.0`
- Archive: `wpm-0.1.0.tgz`
- Size: 701,280 bytes
- SHA-256: `0bda2b18a1669d35d68ec1269399d73b125136e9a7e70a467f806f4fffc901ce`
- SHA-512: `e06bddb24f6540acd602feee950fdd517ad52ffe6da579c52824508b9ce31db072479ea04aafe5921d40fd943469cbd0c4322c95da181e3354a9f9534ebef611`
- Inspection: accepted, 479 expected paths, zero violations, clean requested/checkout revision binding
- Inspection report digest: `sha256:fbfdcee1f3774de7e5777a5ee914a51cd7d6cf61edaa24fc58edbb352ded79b4`

The source-free verifier installed the frozen archive with normal lifecycle scripts enabled and completed in 17.034s:

- Both `wpm` and `installer` shims resolved to `./dist/cli.js` and reported `0.1.0`.
- Installed resources were accepted with no missing paths.
- The isolated HOME and workspace roots, `.agents`, `.claude`, `AGENTS.md`, and `CLAUDE.md` remained unchanged during inert installation.
- The installed archive SHA-256 exactly matched the inspected archive.
- Packed-install report digest: `sha256:e991ea3dff08f55de4a32ec64281dda10fcd06fd05baaaaab3af6d41e9e6bd70`.

Exact installed/source skill hashes:

| Skill | SHA-256 |
| --- | --- |
| `wpm-create-package` | `a01a56f71428d82d9ca50cf8e3eb7abd1324f4fa0f36efc886c8ae8a18a4d5f7` |
| `wpm-author` | `272d37019235bec9ea657e49e1401f452a3b5f732ae47c887fa93b9e0984a8c8` |
| `wpm-author-bundle` | `54cee6e7527556448fa81a8daf879587d1cc419ec4c27038beb058ffbee84cd7` |
| `wpm-author-recipe` | `0cc30eaf3678784dd84ef7c0352a148bf5c1e9ba4efe0d58be6b88a7ad93ad4d` |
| `wpm-author-skill` | `fcfda5cd110507863db9e311db78c3b6e385160d84d5463eb8ea5cf7784ef56c` |
| `wpm-review-package` | `6d13b74090c40e60ff3888e47b9e9248032728c5a4eb3824aaef55af93e5aeb2` |

The archive contained none of the prohibited `src`, `test`, `backlog`, `.bmad`, `.serena`, `_bmad-output`, or `node_modules` package paths. Neither the shared source checkout path nor the disposable Phase 6 path occurred in decompressed archive bytes. Git and tar were available. `zip` and `unzip` were unavailable, so the suite's explicitly conditional ZIP branch remained conditional rather than being falsely claimed; the complete green suite exercised the established tar/Git/nonleak contract and its ZIP-availability decision.

## Inactive candidate and no-write assessments

- Candidate ID: `sha256:e52a524eefd625f1e72983eaeea85898726dc6a2ac2f16da201999d516e83659`
- Candidate record digest: `sha256:0dd810fdc6c3d60e3744707e0127b2d645ad7bf12390a6743a9bb52a57620352`
- Initial preparation outcome: `created`; identical preparation outcome: `reused`.
- Distribution state: inactive; activation disabled; release ineligible; publication incapable.
- All eight closed activation facts remained unresolved. No coordinate, repository, authority, trust, recovery policy, or publication decision was invented.
- GitHub assessment digest: `sha256:efa6abf24007c321bcc1b7168198b745e4f2e79a560dc927fcaf2c3b8546eec4`; zero conflicts, with tag/release/asset absent in the explicitly offline empty observation.
- npm assessment digest: `sha256:c1901c6a42f74c245d6e476d933c5cb36d4b78dbe9bfc991c0671326d98bd9eb`; zero conflicts, with coordinate/repository/provenance/authority policy unresolved and authority unverified.
- Convergence digest: `sha256:0de79c8a20642ffdc1515e21476c29613a04183eeba6848d5755104db3f1c403`; classification `blocked`, zero completed boundaries, zero conflicts, and no safe publication action.
- A complete candidate path-kind/mode/size/link/byte-hash snapshot, local tag list, and checkout-status snapshot was identical before and after the reuse plus repeated GitHub, npm, and convergence assessments.

The GitHub and npm observations above were offline deterministic inputs to prove the assessment contract; they were not remote-state claims and no remote read or write occurred.

## Claude Code preflight

- Executable: `/home/agent/.npm-global/bin/claude`
- Version: `2.1.158 (Claude Code)`
- Isolated HOME: `/tmp/wpm-phase6-c7753aa-TgQjYt/claude-home`
- Isolated config: `/tmp/wpm-phase6-c7753aa-TgQjYt/claude-home/.claude`
- Isolated workspace: `/tmp/wpm-phase6-c7753aa-TgQjYt/claude-workspaces/claude-parity`
- Real HOME was never used as the live session HOME.
- A mode-600 disposable copy of the existing credential was used, as explicitly permitted. Source and copy initially matched `sha256:e39d788e6bb36d1e05a9a3ac2eb4d77e87381ccd433cd2c3f2654f2d7552004e`.
- Isolated `claude auth status --json` exited 0 and reported `loggedIn=true`, `authMethod=claude.ai`, `apiProvider=firstParty`, `subscriptionType=max`.
- Installed `wpm authoring setup --client claude-code --json` created the exact personal `wpm-create-package` native skill.
- Installed `wpm init` created a prepared Claude-only workspace with the exact five workspace skills, shared Backlog, managed state, front door, and receipt.
- Installed handoff verification exited 0 with `sharedValid=true`, Claude valid, and dependency-eligible work evidence.

Two zero-write setup corrections occurred before live inference: `wpm init` does not expose `--json`, and the first source-free PATH omitted the installed package's nested Backlog peer bin. The usage/preflight failures changed no workspace bytes; the corrected installed-only PATH succeeded.

## Claude Code live result

The first local canary launch did not reach authentication because Claude's variadic `--tools ""` option consumed a trailing prompt. It exited locally with zero stdout and the exact prompt-required usage error. This was the single allowed launcher diagnosis; only argument order was corrected.

The corrected, sole inference call used:

- fresh process and empty trusted working directory;
- isolated HOME/config and copied OAuth credential;
- `--print`, JSON output, `--no-session-persistence`, project-only settings, strict empty MCP config, no Chrome, no prompt suggestions, `dontAsk`, and no tools;
- no `--continue`, `--resume`, `--bare`, login, logout, token setup, auth refresh, or dangerously-skip-permissions mode.

It exited 1 with a result-level API error:

```text
401 OAuth access token has expired. Re-authenticate to continue.
```

The call consumed zero input tokens, zero output tokens, zero tool events, and USD 0. No skill discovery, explicit invocation, natural trigger, adjacent non-trigger, or representative-outcome cell was run. The required 24 fresh behavioral subruns therefore remain wholly unexecuted and cannot be inferred from deterministic compatibility tests.

Before/after evidence:

- Workspace snapshot digest remained exactly `7530f65943360650bdbf8f943e671af654a06273275a553ae2acc745c022f06d`.
- The isolated HOME metadata snapshot changed from `d0e7873228ccf1b8e0b4d20a8335645c69c5c302c045d2977cb58889833e78ca` to `0fb1082495c52e632934af521f9b827649204f7b7cd382b334cca5d6b7864102`; Claude created only isolated `.claude.json`, backup, project-memory directories, and a session directory. No source or shared workspace path changed.
- Canary evidence digest: `sha256:eae904a23044d42459f7acd9936c1f863618b8403f78a49e08c9a28aa733e909`.

## Cleanup and required next action

- No Phase 6-owned process remained after the failed canary.
- Both disposable `.credentials.json` copies were unlinked and a search proved no copy remained under the disposable root.
- Source credential hash, mode (600), size (471), and mtime remained unchanged.
- The entire validated disposable root `/tmp/wpm-phase6-c7753aa-TgQjYt` was removed with a confined no-follow deletion; the exact path and all matching `wpm-phase6-c7753aa-*` temp roots were proved absent.
- The shared checkout remained at exact `c7753aa4829c758964a1c6811fc05b8d06aad4cd` with only the pre-existing root-owned `.serena` files plus this evidence artifact.

Required next action: a human must reauthenticate Claude Code outside WPM. After that external state change, authorize a fresh isolated execution that first proves auth with one canary and then runs all 24 fresh six-skill subruns against one newly accepted exact package. Do not reuse this blocked result as behavioral acceptance.
