# 13 · Core Application Architecture

`12` chose the stack and drew the directory scaffold. This doc architects the **core app** that lives inside it: the module-level contracts, the data flow, and the seams that keep the thing testable as it grows from the foundational backlog into every command leaf. It is the design that tasks 6–19 of the foundational backlog implement.

One refinement of `12` up front. `12` names three layers (CLI → domain → infra) and lists a `core/` that is mostly *pure services* (schema, render, resolver, version-constraint, derived-artefacts, validate). But a command like `bundle new` orchestrates eight steps — validate id, resolve template, render, write yaml, append to the manifest, run advisor-add, materialise authoring tasks, re-render derived artefacts — and `12` says the command itself "holds no business logic." That orchestration needs a home that isn't the thin command and isn't a single pure function. This doc gives it one: an **operations** (use-case) tier inside the core, sitting above the services. So `12`'s `core/` modules become the *services* layer, and `core/operations/` is added above them. Everything else in `12` stands.

## 0 · Two principles the whole architecture rests on

Both are framing rather than mechanism, but they decide what belongs in the core and what doesn't, so they come first.

**The product is a way to distribute instructions for AI agents — so the core's job is *delivery*, and execution is the agent's.** This is the "thin builder, fat agent" stance (the agent-skill ecosystem independently arrived at the same phrasing — "thin MCP, fat agent: handle the delivery of code and instructions, empower the agent to execute them in its own environment"). The builder authors and packages instructions; it never executes an install itself, never embeds a runtime, never reaches onto the target machine. Everything in `core/operations/` produces or transforms *artifacts on disk*; the acting-on-the-world half lives entirely in the user's agent at runtime (`09`). This is why the core needs only a filesystem port and a Backlog.md port and nothing resembling a process-executor or network-installer port — there is no install engine here to give one to.

**The system is SDLC-agnostic; a workflow is vendored content, never core.** The discipline an install runs under — Ralph-style looping, a superpowers-style review gate, spec-driven phases, or nothing at all — is not the builder's concern and is not represented anywhere in the domain model. It is *content* an author optionally vendors into a project's `installer-skills/` (`05`, `06`, `09`). The core has no `Workflow` type, no `Methodology` enum, no branch that behaves differently for TDD vs. spec-driven; it would not change if a new SDLC framework appeared tomorrow. The architectural consequence is a hard rule: **nothing under `core/` models, names, or depends on any particular workflow.** The "execution discipline" is a slot (a directory of vendored skills + an instruction file the agent reads), and the core's only relationship to it is that `build` copies it into the package like any other content. If you ever find a workflow concept leaking into the model or the operations, that's the same kind of boundary violation as a `commander` import in the core.

## 1 · Style: ports and adapters, and the one rule that enforces it

The architecture is hexagonal. The **core is pure** — it computes over an injected filesystem and an injected Backlog.md adapter and otherwise has no idea whether it's being driven by a CLI, a test, or anything else. Effects live at the edges, behind interfaces (**ports**) the core declares and the infrastructure (**adapters**) implements.

```
        ┌───────────────────────── driving side ──────────────────────────┐
        │  argv → cli.ts (commander) → commands/<leaf>   (thin adapters)    │
        │           parse argv → typed Input → call ONE operation → format  │
        └───────────────────────────────┬──────────────────────────────────┘
                                         │ calls (Input, Context, Ports)
        ┌────────────────────────────────▼──────────── core (pure) ────────┐
        │  operations/   use cases: createBundle, bumpVersion, validate …   │
        │       │ compose                                                   │
        │  services/     render · version-constraint · schemas · validate · │
        │       │        derived-artefacts · materialisation · scope-plan   │
        │  model/        Manifest · Bundle · Template · BundleId · SemVer …  │
        └───────┬───────────────────────────────────────────┬──────────────┘
                │ depends on (interfaces only)               │
        ┌───────▼──────────── driven side · ports ───────────▼──────────────┐
        │  FileSystem      BacklogMd      Clock      Environment             │
        └───────┬───────────────────────────────────────────┬──────────────┘
                │ implemented by                             │
        ┌───────▼─────────────── adapters ───────────────────▼──────────────┐
        │  node-fs        backlog-cli(execa)   system-clock   process-env    │
        │  memory-fs      fake-backlog         fixed-clock     fake-env  ◀ tests
        └────────────────────────────────────────────────────────────────────┘
```

**The dependency rule (the import-direction invariant).** Arrows point inward only:

- `commands/` → `operations/` → `services/` → `model/`
- `operations/` and `services/` → `ports/` (interfaces), **never** an adapter
- `adapters/` → `ports/` + the real library (`node:fs`, `execa`, `omelette`)
- `util/` is a leaf: pure infrastructure helpers, no domain knowledge, imported by adapters and occasionally services
- **Nothing under `core/` imports `commander`, `execa`, `omelette`, or `node:fs` directly.** If a core module reaches for one of those, the layering has been violated.

This single rule is what makes `12`'s promise real — "unit tests work entirely in-memory with the adapter mocked." A lint rule (e.g. an import-boundary check) enforces it mechanically rather than by code-review vigilance.

## 2 · The domain model (`core/model/`)

Pure data plus the smart constructors that make illegal states unrepresentable. Validation lives *with the type*, not scattered through call sites: a bundle id cannot exist as a typed value unless it passed kebab-and-reserved-word validation, so anything holding one is already safe. The same goes for versions and version ranges — they are distinct types you can only obtain by parsing, never bare strings.

The model's nouns:

- **Branded primitives** — `BundleId` (kebab-case, not a reserved verb), `AgentName`, `SemVer`, `VersionRange` (npm-style: `^0.3.0`, `~1.2`, `>=2 <3`). Each is obtained only through a validating parser that returns either the typed value or a validation failure; that parser is the single way in.
- **Manifest** (from `manifest.yml`) — the project's release identity (name, version, and optional description / license / repository), the **flat list of enabled bundle ids**, and the **target agents**. A bundle directory not listed here is disabled (`06`); the targets are the peer-dependency agents (`00`).
- **BundleManifest** (from each `bundles/<id>/bundle.yml`) — the bundle's stable `id`, its `version`, the user-facing `summary` (the menu line, `02`), its confirmation level, and the `requires` map of `BundleId → VersionRange` (the dependency contract, `08`).
- **Template** — a template as *data*: its name, scope (project or bundle), declared parameters, the file tree copied at init (with substitution), and the snippet set rendered on demand by add-commands (`06`).
- **Project** — the loaded aggregate: the project root, the parsed manifest, and every bundle's parsed `BundleManifest`. This is an in-memory *projection* of a project on disk.
- **Value objects** produced by services and consumed by commands — an authoring-task spec (title + acceptance criteria), a validation report (ok flag + problems), and an operation result (a human summary, the paths that changed, and the titles of any authoring tasks materialised).

`Project` is the keystone: most operations begin by loading it and reason against it, rather than re-reading individual files ad hoc. It is a *projection* — loaded fresh per operation, never a long-lived mutable singleton — so there is no cache to invalidate.

## 3 · The ports (`core/ports/`)

Four interfaces. Each has a real adapter and a fake; the core is written against the interface and never learns which it got.

- **FileSystem** — the operations the core needs over a file tree: read, write (atomic in the real adapter — temp-write then rename), exists, make-directories, list, copy-tree, remove, and *ensure-alias* (create a scope-alias link from a target to a link path). Nothing more; the core's disk vocabulary is deliberately small.
- **BacklogMd** — a thin wrapper over the operations the builder needs from the Backlog.md CLI: initialise a backlog root with a given config, create a task, list tasks (optionally filtered), edit a task, archive a task. Reads come back as parsed summaries, not raw text. (Scope boundary below.)
- **Clock** — the current time, for dates in task creation, the changelog, and receipts. Injected so tests are deterministic.
- **Environment** — the current working directory, the platform, and environment-variable access — everything the core needs about *where* it's running, for project resolution and (in the adapter) the Windows alias decision.

Two boundaries worth stating because they prevent whole categories of mistake:

**`ensureAlias` hides the Windows fallback.** The symlink-vs-copy decision (`12`) is an *adapter* concern, not a core one. The core asks for an alias; the real adapter symlinks on POSIX and copies-with-warning on Windows, reporting back which it did. The core never branches on platform — it can't, it has no access to `os`.

**The `BacklogMd` port's scope is the authoring-backlog and initial scaffolding only — never install-backlog content.** This is the `10` "no-mirror" principle made structural. The CLI uses this port to materialise *authoring* tasks (the builder's own work tracking) and to initialise each backlog root with the right task-prefix. It never creates or edits the *content* of a bundle's install-backlog — those tasks are authored by the human/agent calling `backlog` directly (`10`, `11`). The port simply offers no operation that targets install-backlog content, so the principle can't be violated by accident. (Setting the task-prefix in a bundle's `install-backlog/config.yml` is a YAML write through `FileSystem`, not a backlog op.)

**Output is not a port.** The core does not print. Operations *return* a structured result; the command layer formats and writes it. This keeps the core free of stdout/stderr entirely and makes results assertable in tests without capturing streams. (A debug logger, if ever needed, is the one optional exception — injected, silent by default.)

## 4 · Services (`core/services/`) — the pure logic tier

These are `12`'s `core/` modules, recast as the layer beneath operations. Each is a focused, mostly-pure unit; the ones that read content take it as data (the operation does the I/O) so the service itself stays testable in memory.

- **`schema`** (`manifest` / `bundle-yml` / `template`) — parse + validate + serialize the three schemas; the home of the branded-type constructors.
- **`version-constraint`** — parse npm-style ranges; `satisfies(version, range)`; and `resolve(requiresGraph)` → satisfied / unsatisfied / **cycle**. Pure; unit-tested against semver fixtures.
- **`render`** — `(TemplateTree, params)` → a file map. No conditionals or loops, only `{{placeholder}}` substitution (Structure-not-Content, `10`). The operation reads the template via `FileSystem` and writes the result; `render` itself touches no disk.
- **`derived-artefacts`** — `(Project)` → the rendered `AGENTS.md`, the orchestrator skill, and the *set of scope aliases that should exist*. A pure projection of desired on-disk state; the operation diffs it against reality and applies it. Idempotent by construction: same `Project` ⇒ same output.
- **`scope-plan`** — `(targets)` → the alias paths that should exist at root and per bundle (using the built-in agent-name → alias-path map). Pairs with `FileSystem.ensureAlias`.
- **`materialisation`** — `(intent, Project)` → `AuthoringTaskSpec[]`. Pure: decides *which* authoring tasks a given command should create. The operation creates them idempotently (title-based, `11`) via `BacklogMd`.
- **`validate`** — `(Project)` → `ValidationReport`: constraints resolve, no cycles, targets non-empty, no orphan bundle directories (a dir under `bundles/` absent from the manifest is flagged). The `project validate` logic (`10`). Deeper checks (step-slug uniqueness, DoD compliance) are review-phase *tasks* (`11`), not CLI checks, and deliberately live outside this service.
- **`integrity`** — computes and verifies content hashes for vendored third-party artifacts (discipline skills, loop runners) and emits/checks the lockfile that pins them. Pure over file content the operation supplies. This is the service that makes "pin the version" (`06`, `09`) a concrete, verifiable mechanism rather than a hope; rationale and the lockfile shape are in `08`. It exists because the thing we distribute is *instructions an agent will execute*, so tamper-evidence on bundled-in third-party content is structural, not optional.

## 5 · Operations (`core/operations/`) — the use-case tier

One operation per command intent. Each composes services and ports to fulfil exactly what a command means, and returns a structured result. This is the orchestration `12` left unplaced. Every operation has the same shape: it takes a typed **input** (the command's arguments, already parsed and validated into domain values), a **context** (the located project root plus the environment, from `resolveContext` in §7), and the **ports** (filesystem, backlog, clock, environment — injected once at the CLI boundary), and returns an operation result. Because the signature is uniform, the lifecycle below applies to all of them.

Representative operations (the full set tracks `10`'s command tree): init-project, create-bundle, enable-bundle, disable-bundle, remove-bundle, set-project-meta, bump-version, add-target, remove-target, add-require, remove-require, register-file, register-skill, add-installer-skill, add-advisor, validate-project, build.

### The shared mutation lifecycle

Every *mutating* operation walks the same six beats. This uniformity is the point — it's why a new command leaf is "fill in one operation," and why the automatic-currency guarantee of `10` (derived artefacts never drift) holds everywhere without per-command effort.

```
operation(input, ctx, ports):
  ① LOAD        ctx + fs           → Project projection (manifest + every bundle.yml)
  ② CHECK       pure services      → validate the change vs current state ──fail──▶ throw DomainError
  ③ APPLY       fs / backlog       → structural effects (YAML writes, dirs, task_prefix, backlog init)
  ④ RERENDER    derived-artefacts  → AGENTS.md + orchestrator skill + scope aliases  (idempotent)
  ⑤ MATERIALISE materialisation→backlog → authoring tasks, title-idempotent (skip those already present)
  ⑥ RESULT      → OperationResult  → (command formats + prints, exit 0)
```

Read-only operations (`show`, `list`, `validateProject`) run **① → pure projection → ⑥** with no ③④⑤. Steps ④ and ⑤ are *automatic*, not per-command: an operation declares its structural effect in ③ and the lifecycle handles currency (④) and task materialisation (⑤) around it. `createBundle`, for instance, supplies ③ (scaffold dir from template + append to manifest) and a ⑤ plan (the per-bundle authoring tasks + the advisor task); ④ falls out of the changed `Project` for free.

Idempotency is structural at two points: ④ writes only what differs (re-running an unchanged operation is a no-op), and ⑤ skips any task whose title already exists. Re-running `enableBundle` on an already-authored bundle therefore does nothing, exactly as `11` requires.

## 6 · The command layer (`src/commands/`) — the driving adapter

A command module is genuinely thin. For `bundle new`, it declares the command, its positional id, and its flags (`--template`, `--disabled`, `--version`, `--no-advisor`); then its action does just five things in order: parse the argv into a typed input (which may raise a usage error), resolve the project context (honouring a `-C/--project` override), call the one operation (`create-bundle`), format the returned result to stdout, and let any thrown domain error bubble to the top-level handler. No domain rules, no orchestration, no I/O of its own — every one of those lives in the operation it calls.

The `--help` content contract and tab-completion (`10`'s discoverability principle) are wired here too — the `help/` modules build the synopsis, flag table, and examples; the `completion/` modules supply the dynamic value sources — but both are adapter concerns layered onto the command, never reaching into the core. `cli.ts` is the composition root: it constructs the **real** ports once and registers every command with them. A test constructs **fake** ports and calls the operation directly, skipping commander entirely.

## 7 · Cross-cutting: context, errors, exit codes

**Context resolution** (task-15) is a service used before any project-bound operation: walk the working directory upward (via the environment and filesystem ports) until a `manifest.yml` is found, git-style; honour a `-C/--project` override; and yield either a located project context or an explicit *no-project* result (which `template list`/`show` tolerate by falling back to built-ins).

**Error model.** The core raises a small set of typed domain errors and never terminates the process or writes to stderr itself. Each error category carries a fixed meaning and exit code:

| Error category | Raised when | Exit |
|---|---|---|
| Usage | bad invocation or bad input value | 2 |
| Not-found | project, bundle, or template missing | 1 |
| Conflict | id already exists, bundle already enabled, … | 1 |
| Constraint | unsatisfiable `requires`, or a dependency cycle | 1 |
| Validation | schema / kebab / reserved-word failure | 1 (or 2 when it's a bad argument) |

A single top-level handler at the CLI boundary catches these, maps each to its exit code, and prints a clean message; an unexpected (non-domain) error exits 1 and prints a stack only under `--debug`. Commander handles pure-syntax usage errors (unknown flag, missing argument) as exit 2 before the core is ever reached. So exit codes are **0** success, **2** usage, **1** everything else — decided in one place, not sprinkled through the commands.

## 8 · Two data-flow traces

**`wpm bundle new web-handoff`** (a mutation — exercises the full lifecycle):

```
argv
 → command layer:  parse argv → typed input (id = web-handoff, advisor on, …)
 → resolve context (locate the project root)
 → create-bundle operation:
     ① LOAD       read the project: manifest + every bundle.yml
     ② CHECK      validate the id (kebab + reserved-word) and that it isn't already enabled
     ③ APPLY      resolve the default bundle template and render it to disk;
                  write bundle.yml + install-backlog/config.yml (task-prefix = web-handoff);
                  add web-handoff to the manifest (comment-preserving);
                  initialise the bundle's install-backlog root
     ④ RERENDER   re-render AGENTS.md + the orchestrator skill; ensure a scope alias per target agent
     ⑤ MATERIALISE plan this command's authoring tasks → create each (skipping any title that exists);
                  advisor sub-step: render the advisor stub + its "write advisor content" task
     ⑥ RESULT     return summary + changed paths + materialised task titles
 → command layer:  format result → stdout, exit 0
```

**`wpm project validate`** (a read — load, pure check, result):

```
argv
 → command layer → resolve context → load the project
 → validate-project operation:
     ① LOAD       read manifest + every bundle.yml
     —            run the validate service over the projection:
                  requires-graph resolves · targets non-empty · no orphan bundle directories
                  → validation report (no APPLY / RERENDER / MATERIALISE — nothing mutates)
 → command layer:  format report → stdout; exit 0 if ok, else 1
```

## 9 · How this maps to the foundational backlog and to `12`

The foundational tasks (`builder-backlog/`) build this architecture bottom-up: task-6 is `model/` + `schema`; task-7 is the `FileSystem` port + its two adapters; task-8 is the `BacklogMd` port + adapters; task-9 the comment-preserving YAML inside the fs adapter; tasks 10–13 are the `render`, `template-resolver`, `version-constraint`, and `scope-plan` services; task-14 is the commander composition root + the command-registration pattern; task-15 is the context-resolution service; tasks 16–17 the `help/` and `completion/` adapters; task-18 the `derived-artefacts` service + its lifecycle hook; task-19 the `materialisation` service. The **walking skeleton** (task-23) is the first end-to-end thread — `commands → operation → services → ports → fs` against a real tmpdir — proving the hexagon composes before the per-command leaves are filled in.

Against `12`: this doc keeps every engineering decision and the scaffold, and refines the layering in exactly one way — splitting `12`'s `core/` into a **services** tier (its original module list) and an **operations** tier above it (the use cases), with the **ports** made explicit as injected interfaces. Read `12` for *what ships and why this stack*; read this for *how the core is shaped internally*; read `10` for the command surface each operation backs, and `11` for the authoring-task materialisation each mutating operation drives.
