---
name: wpm-author-skill
description: Author or revise one WPM agent capability—an advisor, project or bundle installer helper, delivered payload skill, or authoring/executor front door—after resolving its user, activation, registration, trigger, and discovery scope. Use for capability content and placement. Leave bundle planning to wpm-author-bundle, install recipes to wpm-author-recipe, package review to wpm-review-package, and general routing or managed workspace setup to wpm-author.
---

# Author one agent capability coherently

Use this skill without a prior bootstrap conversation. Turn the author's request and the durable WPM workspace
into one inspectable capability result. A `SKILL.md`-shaped file is not enough: the intended user, activation
moment, source path, registration, focused trigger, and native discovery must all agree with its role.

Do not use this skill to plan bundle metadata or dependencies, author install-recipe tasks, review the whole
package, route general WPM work, or install the WPM skill family into a workspace. Those remain separate work
for `wpm-author-bundle`, `wpm-author-recipe`, `wpm-review-package`, and `wpm-author`.

## Classify before any write or mutation

Inspect first. Run `wpm project show --json`, `wpm bundle list`, and, for each explicitly selected bundle,
`wpm bundle <id> show`. Inspect the exact mutation leaf with `--help` before invoking it. Never auto-init a
workspace, infer a bundle, enable a disabled bundle, or infer an executor target merely to make a command work.

Collect these facts for every requested capability:

- **role**: advisor, project installer helper, bundle installer helper, payload skill, deliverable executor
  front door, or workspace authoring front door;
- **intended user**: package adopter, installation executor, package recipient, or package author;
- **activation moment**: before install, during project install, during one bundle install, after delivery,
  while executing a delivered package, or while authoring its source workspace;
- **source path** and explicit project or bundle scope;
- **registration**: the exact WPM registry when the role has one, or explicitly `none`;
- **focused trigger**: what user request should load or invoke the capability, including an unrelated
  non-trigger; and
- **discovery**: which agent context can see the capability and when it becomes available.

Classify all requested artifacts and existing collisions before changing state. If any role or scope is
ambiguous, keep it unresolved. Do not guess or invent a placement.

For every skill-shaped capability, validate the common Codex and Claude Code identity before mutation. The
name is 1–64 characters of lowercase letters, digits, and single hyphens; it neither starts nor ends with a
hyphen. The native directory, frontmatter `name`, and explicit `$<name>` / `/<name>` invocation must identify
the same capability. Keep the frontmatter `description` focused, non-empty, free of angle brackets, and at most
1,024 characters so the same portable file remains valid in both clients.

For any source or custom path, require a portable relative path with forward slashes and no absolute, empty,
dot, or dot-dot segments. Resolve it inside the project or explicitly selected bundle, require the document to
be an ordinary file and not a symlink, and reject a symlinked package or parent that could escape that boundary.

## Use the role matrix

| Role | Intended user and activation | Default authoring source path | Registration and discovery |
|---|---|---|---|
| Advisor | Package adopter before installation | `wip/installer-skills/<bundle>-advisor/SKILL.md` | Create with `wpm bundle <id> advisor add`; root naming convention; no helper or payload registry entry |
| Project installer helper | Executor during project installation | `wip/installer-skills/<name>/SKILL.md` | `wpm project installer-skills add <name> [--path <path>]`; registered in project `installerSkills` |
| Bundle installer helper | Executor during the relevant enabled bundle install | `wip/bundles/<id>/installer-skills/<name>/SKILL.md` | `wpm bundle <id> installer-skills add <name> [--path <path>]`; registered in that bundle's `installerSkills` |
| Payload skill | Recipient only after delivery | `wip/bundles/<id>/payload/agent-skills/<name>/SKILL.md` by default | `wpm bundle <id> skills add <name> [--path <path>]`; registered in `bundle.yml.payload.skills`; inert in the authoring workspace |
| Executor front door | End user's executor after delivery | `wip/_AGENTS.md` or `wip/bundles/<id>/_AGENTS.md` | No skill registry; build strips the reserved prefix to `AGENTS.md` and creates target-specific aliases |
| Workspace front door | Package author's agent during authoring | workspace-root `AGENTS.md` and supported client aliases such as `CLAUDE.md` | Native workspace discovery; managed reconciliation is separate workspace-integration work |

The bundle installer-helper mutation leaf accepts an enabled bundle. Aggregate listing and completion may
scan a broader on-disk union, so a listed folder is not permission to select another or disabled bundle.
Require the author to resolve that boundary explicitly.

An advisor and another helper can both live under `wip/installer-skills/`, but they are not interchangeable.
Advisors are pre-install, convention-named, and intentionally absent from helper registries. Never silently
convert roles by deregistering, moving, renaming, or re-registering an artifact. Never bypass confirmation for
advisor removal with `--yes`.

Before an explicitly authorized removal or role conversion, preview its exact consequence and obtain the
author's decision:

- `advisor remove` deletes the whole advisor directory and archives its open content task;
- project and bundle helper `remove` commands deregister the exact reference but leave its source on disk, so
  a disk-scanning helper list can still show it;
- removing a registered payload skill deregisters it and leaves its source package on disk; and
- removing an unregistered payload skill deletes only its conventional on-disk stub directory. Never treat an
  unregistered custom path or registered authored content as that orphan-cleanup case.

## Keep disk, registration, and authored discovery separate

Treat these as three independent observations:

1. the expected content exists on disk at the resolved ordinary-file path;
2. the owning registry contains the exact name/path when the role requires registration; and
3. the content is complete and its frontmatter, trigger, activation, and discovery agree with that role.

On-disk helper listing or shell completion can expose unregistered folders. A registry can also point to a
scaffold whose TODO, placeholder description, or pending body remains incomplete. Registration is not content
completion, and disk presence is not registration. Advisors and front doors correctly have no helper or
payload registry entry.

Use the registry's owning YAML as read-only evidence; never treat an orientation view or a disk scan as
registration proof:

- `wpm project show --json` is project orientation, not registration. Read `wip/manifest.yml` and require the
  exact `{name, path}` under top-level `installerSkills` for a project helper. `project installer-skills list`
  scans disk and is not registry evidence.
- `wpm bundle <id> show` reports metadata and a file tree, not registration. Read the selected bundle's
  `bundle.yml`: top-level `installerSkills` is authoritative for bundle helpers, while `payload.skills` is
  authoritative for payload skills. Bundle `installer-skills list` scans disk; `skills list` proves registered
  names but not their paths.
- An advisor has no registry. Verify its exact `<bundle>-advisor` directory, frontmatter identity, explicit
  invocation identity, completed content, and pre-install trigger directly.

For a new helper or payload skill, prefer attach when complete content already exists and scaffold only when
the author wants pending content created. Drive registration through the relevant WPM command; do not
hand-edit a manifest or `bundle.yml`. Then author the actual file content, remove every TODO or placeholder,
and re-read the file plus the registry-authoritative YAML after mutation.

For every skill-shaped capability, verify all of the following together:

- YAML frontmatter is bounded by `---`, contains a non-empty `name` and focused `description`, and the body is
  complete;
- the requested identity, frontmatter `name`, native directory and explicit invocation agree; a registry key
  agrees too when the role has a registry;
- the default folder name and exact `SKILL.md` entry agree with that identity. Preserve an explicitly registered
  custom payload document path, including an arbitrary document basename; do not use that basename as the
  identity or silently rename the registered path;
- a custom helper path is not discoverable unless its native package remains under the role's scanned
  `installer-skills` directory, with an identity-matching directory and exact `SKILL.md`; block otherwise;
- the description states what the skill does and when to use it, with exclusions that keep unrelated work from
  triggering it; and
- the capability is discoverable only at its intended activation moment.

## Preserve namespace ownership

The `wpm-` prefix is reserved for WPM-owned skills. The product-owned family is `wpm-create-package`,
`wpm-author`, `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package`.
Report a namespace conflict when a package author requests another user-authored `wpm-*` identity. Do not
silently rename it.

Package-owned names remain package-owned: preserve user payload skill names, `<project>-installer`, and
`<bundle>-advisor`. Do not impose a `wpm-` prefix on package-owned capabilities. A package-owned name colliding
with an existing path, registry key, or WPM-owned identity is blocked until the author explicitly resolves it.

## Keep the two front-door contexts distinct

The deliverable executor front door is authored only under its reserved authoring name: `wip/_AGENTS.md` for
the delivered package and `wip/bundles/<id>/_AGENTS.md` for a bundle. Edit those files directly only after the
executor role and scope are explicit. Never create canonical `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` under
`wip/`; WPM build creates the delivered canonical front door and target aliases.

The workspace-root `AGENTS.md` and `CLAUDE.md` address the package author's agent. They are separate from
executor content even when similar prose is needed. Inspect and report their authoring role here, but do not
create, replace, or reconcile a managed workspace front door. That integration belongs to TASK-120 / the
`wpm-author` workspace-integration flow. Authoring-client selection is independent of `manifest.targets`; do
not infer or add a deliverable target from the current Codex or Claude Code host.

## Mutate only after the preflight is coherent

Before a write, aggregate every discoverable issue across the requested capabilities:

- ambiguous role, intended user, activation moment, project/bundle scope, or trigger;
- disabled, missing, or conflicting bundle scope;
- existing content at a different role's path;
- missing or divergent registry entry, registry key, frontmatter identity, or custom path;
- user-authored `wpm-*` namespace use;
- TODO, placeholder, empty description, broad trigger, or incomplete body; and
- workspace/executor front-door confusion or a requested managed workspace-front-door mutation.

If any issue prevents a coherent placement, return `blocked` with all conflicts and unresolved decisions. Do
not claim the capability is correctly discoverable. If any requested capability is blocked or unresolved at
preflight, no requested capability is mutated; return the complete aggregate result first. If an unexpected
failure occurs after an authorized write, report every partial mutation exactly; a successful write never masks
another blocker and does not make the overall result `ready`.

When the preflight is coherent:

1. run only the owning WPM scaffold-or-attach command when registration or advisor creation is needed;
2. write or revise only the resolved capability content (or resolved `_AGENTS.md` executor content);
3. re-read the ordinary file, exact registry entry where applicable, and registration/path relationship;
4. verify the focused trigger and unrelated non-trigger from a context-less agent's perspective; and
5. leave managed workspace-front-door reconciliation and adjacent specialist work pending.

Do not use bare file edits for registry state, silently remove and re-add an artifact to convert its role, or
claim a scaffold is complete because its command exited successfully.

## Return one inspectable result

Return one result with:

- `status`: `ready`, `incomplete`, or `blocked`;
- `resolved`: role, intended user, activation moment, source path, registration, focused trigger, and discovery
  scope for every capability;
- `completed mutations`: exact WPM mutations and authored files that were re-read successfully;
- `unresolved`: every author decision still required;
- `blocked`: every conflicting path, identity, registry, lifecycle, or front-door fact; and
- `pending`: separately owned bundle, recipe, package-review, routing, or workspace-integration work, naming
  `wpm-author-bundle`, `wpm-author-recipe`, `wpm-review-package`, or `wpm-author` only when actually required.

Use `ready` only when every requested capability has coherent role, complete content, correct path and
registration where applicable, focused trigger, and intended discovery. Use `incomplete` for an unblocked
scaffold or content revision that still has explicit pending author work. Otherwise use `blocked` without
guessing placement or claiming discovery.
