# Prototype command coverage

Reference: the worker-setup-v1 prototype has 37 author-side invocable commands. Coverage describes behavior, not literal command aliases. The implementation remains under `wpm vnext`; repository candidate tooling is not a recipient work-package CLI.

| Prototype area | Implemented behavior | Remaining boundary |
| --- | --- | --- |
| workspace view/check | Local registration catalog, exact version selection and dependency-lock checks | Literal root namespace and broader agent-support inventory |
| init / package create/list | Workspace init/add and package create/list, independent native Backlogs, owned creation recovery | Presets/templates and one-step prototype initialization |
| package view/version | Source view, Codex/Claude project/session support and explicit SemVer read/set/increment; workspace identity serialization | Unified source/release projection flags |
| package deps add/remove/list | Local sources/archives, ordinary/dev/optional declarations, tree display, transactional reconciliation | Git, registries and peer dependencies |
| lock | Exact multi-version package graphs plus explicit APM setup resolution, preserved pins, check/upgrade and APM prepared-image cache replay | Network package-source resolution outside APM; cross-owner lock updates are not atomic |
| operation create/list/view/finalize/delete | Native task-backed authoring, readiness, setup assignment, source archival and recovery | Delayed authoring tasks, full source/release projection and transitive view |
| group create/list/view/add/remove/delete | Editable direct/nested membership, separate prerequisites, safe deletion | Preset generation and source group linkage to a published release digest |
| worker-setup | Plain/local/remote APM0.39 sources, pinned instruction/skill composition, secret-free MCP, project/session support and verified offline prepared images | Plugins, LSP, unresolved MCP registry entries and actual host context-loading/authentication |
| package check/test | Source and graph-lock validation; static graph archive extraction and byte checks | Named behavioral fixtures and real recipient-agent sessions |
| release build | Deterministic standalone or namespaced graph TGZ/ZIP/directory, complete release manifest, frozen archive dependencies, dev exclusion | Multiple explicit release roots |
| release view/review/verify | Saved-artifact inspection and full inventory/contract verification; external static review request and digest-bound report import | Automated reviewer/scanner execution, signatures and behavioral sessions |
| setup/doctor | Existing authoring setup and client inspection | Complete new authoring configuration/cleanup and host diagnostics contract |
| explain | Not implemented | Unified provenance queries |
| completion | Existing legacy shell completion | New vNext routes and PowerShell |

General prototype flags such as enforced offline delegation, uniform non-interactivity and the complete versioned JSON/pagination contract remain separate work. This map does not count prototype parity as complete merely because an equivalent command name exists.
