---
name: wpm-author-bundle
description: Plan or change one WPM bundle by establishing its capability boundary, purpose, metadata, dependencies, payload registrations, and enabled or disabled lifecycle. Use for focused one-bundle authoring; do not use it to author install recipes, agent skills or front doors, or to review a whole package.
---

# Author one WPM bundle

Work self-contained, without assuming a prior bootstrap conversation. Drive WPM's existing commands from the
workspace root. WPM owns project structure and YAML: never hand-edit `manifest.yml` or `bundle.yml`.

## Establish the boundary before changing state

Turn the request into four short lists:

- **Belongs:** outcomes and payload that this bundle itself must deliver.
- **External dependencies:** other enabled bundles this bundle requires, each with an explicit version range.
- **Separate capabilities:** recipe, agent-skill/front-door, or whole-package review work owned elsewhere.
- **Unresolved:** choices the author still needs to make.

Ask only about unresolved choices that affect the requested change. Preserve inspected WPM-managed values that
the request does not put in question; do not turn a focused edit into re-confirmation of unrelated state. For a
new bundle, or when the author asks whether the whole bundle boundary is complete, resolve the bundle ID,
whether it is new or existing, its one-line purpose, version, confirmation level, final enabled/disabled
lifecycle, required bundle dependencies and ranges, intended payload registrations, and whether it needs an
advisor. Do not guess, invent, or silently assume any required choice.

WPM may scaffold `<id> bundle`, version `0.1.0`, and confirmation level `safe`. Those defaults are state, not
author agreement. Replace them with agreed values or report them as unresolved; do not call a defaulted bundle
complete merely because the fields exist.

## Inspect and fail closed

Start with read-only WPM surfaces:

```sh
wpm project validate
wpm project show --json
wpm bundle list
wpm bundle <id> show
wpm bundle <id> requires list
wpm bundle <id> files list
wpm bundle <id> templates list
wpm bundle <id> scripts list
wpm bundle <id> skills list
wpm bundle <id> installer-skills list
```

Use only the commands applicable to the requested bundle. Per-bundle leaves require an enabled bundle. If an
existing bundle is disabled, report that lifecycle boundary before attempting a leaf command.

Treat `project validate` as an observation, not an all-or-nothing authoring gate. An unreadable or structurally
invalid workspace blocks bundle work. Unrelated package incompleteness—for example, no executor target selected
yet or unfinished work in another bundle—stays a separate pending boundary and must not block an independently
usable bundle change. Never add or infer a deliverable target to make validation pass.

Stop with a **blocked** result when the workspace is invalid, the bundle identity is invalid or conflicts with
an existing bundle, or a requested dependency cannot be represented safely. Do not auto-init a missing or
invalid workspace; leave workspace creation to `wpm-create-package` and name that recovery boundary.

For every dependency, verify that the dependency bundle is enabled and that its version satisfies the intended
constraint. Treat dependency conflicts—self-dependencies, cycles, invalid constraints, missing or disabled
bundles, and incompatible versions—as blockers. Always obtain an explicit range before:

```sh
wpm bundle <id> requires add <dependency-id> <explicit-range>
```

Omitting the range makes WPM derive a default range; that default must not hide an unresolved author choice.
Before invoking `requires add`, inspect the relevant existing `requires list` graph and reject a self-edge or
any edge whose dependency already reaches the host bundle. Do not use the command's cycle warning as
validation: WPM emits that warning only after writing the cyclic edge.

## Apply only the agreed plan

Read each leaf's `--help` before forming its exact invocation. For a new bundle, pass the agreed initial version
and make the advisor choice explicit:

```sh
wpm bundle new <id> --version <version>
wpm bundle new <id> --version <version> --no-advisor
```

Use `--disabled` only when the author explicitly wants the new bundle to remain disabled. `new --disabled`
cannot be followed by per-bundle leaf changes until the bundle is enabled. If the requested state needs those
changes and must finish disabled, surface and obtain agreement for the explicit lifecycle sequence: create
disabled, enable, change, then disable. Do not silently enable or disable a bundle.

Represent the agreed purpose and metadata through WPM-managed state:

```sh
wpm bundle <id> meta --summary <purpose> --confirmation-level <safe-or-dangerous>
wpm bundle <id> version set <version>
```

Use the existing add/list/remove families for dependencies, delivered payload, install-time tooling, and
installer-helper registration:

```sh
wpm bundle <id> requires add <dependency-id> <explicit-range>
wpm bundle <id> files add <path>
wpm bundle <id> templates add <path>
wpm bundle <id> scripts add <path>
wpm bundle <id> skills add <name>
wpm bundle <id> installer-skills add <name>
wpm bundle <id> advisor add
```

`files` and `templates` register delivered payload already placed at the documented bundle-relative location;
`scripts` registers already-placed install-time tooling, which is not delivered payload. Their add commands do
not author missing content. `skills` registers delivered agent skills; `installer-skills` registers
non-delivered install-time helpers; both commands may scaffold placeholders. `advisor add` may scaffold the
bundle's installer advisor. Registration is not completed content. Report placeholder content as pending and
route agent-skill, installer-skill, advisor, or front-door authoring to `wpm-author-skill`.

When the request introduces or reveals needed recipe tasks or recipe meaning, leave that work pending for
`wpm-author-recipe`. When it requires whole-package readiness, leave that review pending for
`wpm-review-package`. Name only separate work the request or inspected state actually requires. Those pending
boundaries do not erase a valid, independently usable bundle result, but never present the bundle result as
completing the separate work.

Lifecycle changes are explicit:

```sh
wpm bundle enable <id>
wpm bundle disable <id>
```

Bundle removal destroys the directory, advisor, and authoring tasks. Never bypass its confirmation with
`--yes`; surface the destructive confirmation boundary rather than treating removal as an ordinary lifecycle
edit.

## Verify and report

Re-run `wpm project validate`, `wpm project show --json`, `wpm bundle <id> show`, and the relevant family
`list` commands. Report:

- **Bundle:** ID and whether it is new or existing.
- **Boundary:** belongs, external dependencies, and separate capabilities.
- **WPM state:** purpose, lifecycle, version, confirmation metadata, dependencies, delivered payload, install-time
  scripts and helpers, and advisor state.
- **Resolved:** bundle-level concerns proven in WPM-managed state.
- **Unresolved:** author decisions or missing bundle content.
- **Blocked:** invalid/conflicting state and its affected boundary.
- **Pending:** recipe, skill/front-door, and whole-package review work, with the responsible focused skill.
- **Bundle result:** `complete`, `incomplete`, or `blocked`.

Report each successful state change under **Resolved**, even when other work remains. Do not call the overall
bundle result `complete` while any bundle-level concern is unresolved or blocked, and never present a blocked
bundle result as successful. If only separate capability work is pending, say that the bundle result is
independently usable and that the package as a whole is not yet complete.
