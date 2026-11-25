# APM worker contexts

WPM supports APM **0.39.0** as an explicitly selected authoring tool. Worker setup describes context for the recipient's existing agent. It does not install or manage that agent. Plain setups continue working without APM.

## Tool provisioning and approval

Obtain the official versioned distribution and verify its upstream archive checksum before inspecting its contents. Keep the complete extracted distribution together. WPM never installs APM or resolves it from PATH.

```sh
wpm vnext worker-setup apm inspect-tool --executable /approved/apm
```

Inspection reads bytes without executing APM and reports `approved: false`. For a multi-file distribution, approve both the entry SHA-256 and the reported distribution SHA-256 from that verified distribution. Every native invocation, including `--version`, verifies both before execution. The distribution digest hashes stable JSON containing the actual entry digest and the sorted regular-file path/hash inventory of its `_internal` companions. Modified companions require a new explicit approval; a receipt cannot grant it.

The examples below abbreviate these explicit options as `$APM_PIN`: `--executable /approved/apm --sha256 <entry-digest> --distribution-sha256 <distribution-digest>`. This is explanatory shell notation, not a WPM option.

## Sources and phases

```sh
wpm vnext --root ./brief worker-setup create --backend apm
wpm vnext --root ./brief worker-setup add ./shared/research --as research --backend apm
wpm vnext --root ./brief worker-setup add 'apm:owner/repo/subpath#revision' --as external --backend apm
wpm vnext --root ./brief worker-setup apm lock research $APM_PIN
wpm vnext --root ./brief worker-setup apm install research --target codex $APM_PIN
wpm vnext --root ./brief worker-setup apm compile research --target codex $APM_PIN
wpm vnext --root ./brief worker-setup apm check research --target codex $APM_PIN
```

Unnamed creation selects the default; named creation leaves the default unchanged. APM creation adds editable `WORKER.md` and `apm.yml`; ordinary `create` remains plain. Adding a remote source records its reference without fetching. `apm:owner/repo[/subpath][#revision]` and credential-free HTTPS references are supported. Native shorthand supplied with explicit `--backend apm` is normalized to the `apm:` source form. Private source credentials can be forwarded only through repeated `--auth-env` selections of supported Git/GitHub authentication variables; service credentials are not forwarded.

`lock` preserves a current decision. `lock --upgrade` deliberately resolves again, mapping to native `apm lock --update`. `lock --check` is read-only; it rejects stale evidence. A native lock uses format 4. APM 0.35.0 locks and composition receipts require explicit re-resolution and preparation; they are never silently relabelled. Preserve old preparation state and reference the same authored source under a new setup name, lock/install/compile it with 0.39.0, then update work associations and retire the unused old declaration. This avoids adopting old outputs or deleting user files.

WPM stages authored inputs in an owned native project, anchors local dependency paths there, and strips MCP declarations from the native install input. It preserves authored files and comments. Local dependency closure must remain within the selected setup source root. Journals bind source preimages and transformed afterimages, including interrupted staging and relocation. Native install/compile can write only owned preparation state; the original native lock is published intentionally after source/lock drift checks.

The first native deployment uses `--no-frozen` to establish APM's deployment ledger; subsequent matching installs use `--frozen`. Exact dependency resolution fields remain checked. Native deployment metadata and `manifest_targets` are compared separately from pins; selected target and authored source remain receipt-bound. `--frozen` alone is not an offline guarantee.

`wpm vnext lock $APM_PIN` also locks the selected package's APM setups before its package integrity/graph lock. APM locks and `wpm.dependencies.lock.json` remain separate owners. A preparation change invalidates the package graph capture. If a later phase fails, completed native locks remain evidence; no aggregate atomic success is reported.

## MCP declarations and opening methods

WPM supports explicit self-defined MCP objects (`registry: false`) using stdio or HTTP/streamable-http. Registry-only server entries must first be expressed as resolved declarations; unsupported transports, LSP, plugins and generated agent definitions are rejected. Instructions and skills retain APM's native formats. Lifecycle scripts never execute through WPM; every subprocess has `APM_NO_SCRIPTS=1`.

Environment and header values must use runtime variable references, never credential values. Claude project `.mcp.json` retains `${VAR}` references. Codex uses native `env_vars`, `bearer_token_env_var` and `env_http_headers`; unsupported renaming/interpolation fails. Declarations do not install server binaries, contact endpoints, perform OAuth or prove authentication. Required variables and remaining host actions are reported separately.

WPM composes declarations from the exact selected dependency closure, rejecting conflicting connection identities. It emits canonical `MCP.json` metadata alongside native configuration. Archive imports regenerate and compare that configuration, so unrelated native settings or embedded credentials cannot enter through an imported graph.

```sh
wpm vnext --root ./brief worker-setup view research --target codex --opening project
wpm vnext --root ./brief package view --agent-support --target claude-code --opening session
```

Project mode names the prepared native project and required host approvals. Session mode instructs the existing agent to read the selected setup and its native instructions, and lists explicit host configuration/reload actions for connections. WPM does not claim that an already running session automatically discovers new skills or MCP servers. Selected target readiness is distinct from overall release readiness.

## Cache, recovery and release

`lock --offline`, `install --offline` and `compile --offline` perform no native APM invocation. Lock checks exact evidence; install restores a verified previously compiled target; compile checks that restored preparation. A cache miss fails before effects. Prepared-image digests have a separate index binding, plus source/lock/tool/target/closure bindings. Missing transport caches do not require refetching for static prepared-image use; present but changed module bytes fail.

Replay records its exact request and before/after inventories before replacing owned output. An identical retry can finish an interrupted replay; foreign or changed partial files block it. Pending replay, stale inputs, edited outputs or unfinished compilation block release capture. A failed native phase retains owned evidence for inspection and explicit retry.

Only receipt-bound instructions, skills, MCP configuration and canonical metadata enter the release. Native caches, source Backlogs, tool distributions, credentials and development skills remain private. Package graph instances retain separate setup namespaces. Build/check/static rehearsal never resolve dependencies or run APM implicitly.

## Qualification

`node scripts/qualify-apm.mjs --executable /approved/apm --sha256 <entry> --distribution-sha256 <distribution>` exercises real local/transitive and exact public remote dependencies, both targets, lifecycle suppression, cache replay, drift and relocation. Add `--network-isolator /absolute/unshare` for network-denied offline evidence on supported Linux hosts. Explicit `--codex-bin` and `--claude-bin` enable isolated native MCP configuration inspection. `--wpm-cli` can point to an installed saved SDK archive.

Configuration parsing, generated bytes, context discovery, authentication and actual agent execution are separate evidence. The qualifier does not run a model or authenticate production services. Public distribution remains inactive.
