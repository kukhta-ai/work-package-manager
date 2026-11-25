---
name: wpm-create-package
description: Guide a user from an acquired WPM CLI and package-creation intent through readiness, explicit authoring-client selection, fresh workspace creation or safe adoption, and a prepared handoff. Use when the user asks to create, start, or bootstrap a WPM work-package authoring workspace. Do not use to continue or edit an existing prepared workspace, or to author or review an existing bundle, recipe, skill, front door, or package.
---

# Guide a WPM package bootstrap

Take one package-creation intent only as far as a prepared authoring-workspace handoff. Inspect facts before
asking for decisions, preflight the complete request before its first write, and stop at the workspace boundary.

## Keep the bootstrap boundary exact

- This is a personal skill. It is not one of the five workspace skills: `wpm-author`,
  `wpm-author-bundle`, `wpm-author-recipe`, `wpm-author-skill`, and `wpm-review-package`.
- Start only after the user has acquired WPM. Do not install this skill from inside itself and do not configure
  personal client scopes; personal setup is a separate operation.
- Do not author package content, invoke a workspace specialist, or continue work in an already prepared
  workspace. A request to resume/claim work belongs to `wpm-author`; bundle, recipe, capability/front-door,
  and review work belongs to the matching specialist.
- A personal skill must never enter a generated deliverable. Do not copy this skill into `wip/`, a bundle
  payload, installer assets, or build output.
- Do not mutate a workspace, its authoring backlog, its native integrations, or its handoff receipt until every
  unresolved decision and safely discoverable predictable blocker for the requested flow has been resolved.
- Use only the installed `wpm` and `backlog` commands plus the exact candidate root. Do not search for a source
  checkout or depend on repository-relative resources.

## Establish readiness before any write or mutation

Capture the user's stated package intent, root, client choices, and template choices. Then make these read-only
checks, retaining every failure instead of stopping at the first one:

1. Run `wpm --version` to prove the intended WPM executable is callable.
2. Run `backlog --version` to prove the Backlog.md prerequisite is callable.
3. Run `wpm authoring clients --json` to load the current supported authoring-client contract.
4. If the user named an existing root, inspect that exact root as described under adoption. Do not walk upward,
   substitute a nearby project, or silently choose a sibling.

If WPM is missing, report that blocker and one actionable recovery: make the acquired WPM executable available,
then repeat the same readiness check. If Backlog.md is missing or unavailable, report that blocker and one
actionable recovery: install or repair the supported Backlog.md CLI, then repeat readiness. Report all blockers
found, say `handoff prepared: no`, and make no mutation. Do not claim prepared merely because a binary or
personal skill exists.

Separate observed facts from author decisions. Ask only for the following unresolved decisions, and do not
re-ask anything already stated unambiguously or returned by inspection:

- **package intent** — the intended package name and purpose;
- **create or adopt** — create a fresh workspace or adopt one exact existing workspace;
- **workspace root** — the exact target/root at which WPM should operate;
- **authoring client selection** — a non-empty complete desired selection; and
- for creation only, the template and any template parameters still required by the selected template.

Do not ask a broad discovery questionnaire. When several decisions are unresolved, ask them together. When one
remains, ask only that one.

## Require an explicit complete authoring-client selection

Accept only the current supported IDs reported by WPM: `codex` and `claude-code`. Require at least one. Treat the
set the user supplies as the entire desired selection, not an additive client. Deduplicate it while preserving
WPM's canonical order.

For each proposed ID, use the read-only client result. An empty, unknown, unsupported, or deferred ID is a
blocker; give one recovery: choose one or more IDs currently reported as selectable. Do not infer selection from
client detection, an installed executable, HOME contents, personal skill locations, or
`manifest.yml.targets`. Deliverable targets are not authoring clients.

## Create a fresh prepared workspace

Use this branch only when the exact target does not already contain a workspace or user content and the author
explicitly chose creation. Resolve the template and required parameters before invoking WPM. Then issue one
request of this shape:

`wpm init <name> --template <template> --at <target> --authoring-client <id> [...]`

Repeat `--authoring-client <id>` for every ID in the complete desired selection. Pass only values the author
resolved; do not infer a client from `manifest.yml.targets` and do not overwrite an occupied target.

`wpm init` owns one complete preflight and one prepared handoff. On non-success, preserve and report all WPM
blockers or typed partial evidence, provide the recovery WPM returned, say `handoff prepared: no`, and stop. Do
not claim rollback and do not start another operation.

On success, require the returned result to say `handoffPrepared: true` or `handoff: prepared`. Do not run
`handoff prepare` after a successful init; a second preparation is redundant. Continue only to the truthful
prepared-result boundary below.

## Adopt an existing workspace without a cross-operation surprise

Adoption has two mutating commands, so its whole predictable request must be observed read-only before
integration changes anything.

### Inspect the exact root and receipt

1. Run `wpm -C <root> project show --json` against the exact author-approved root to prove the WPM wrapper and
   manifest are structurally readable. Do not use whole-project validation as an adoption gate: an empty
   `manifest.yml.targets` list is valid before later authoring work and must remain unchanged by bootstrap. The
   JSON field named `root` is the resolved deliverable root and must equal `<root>/wip`; it is observation, not
   a replacement for the candidate wrapper root. Retain the author-approved wrapper root for every later `-C`
   handoff/integration command. If the returned deliverable root does not match, block; never pass the returned
   deliverable root itself as the workspace root.
2. Inspect the root `.wpm-handoff.json` path without changing it. Missing may be part of the planned repair. An
   occupied foreign receipt, malformed receipt, non-regular path, unreadable path, receipt bound to another
   root, or receipt/state root, version, or client disagreement is a blocker before the first mutation. There
   are two bounded exceptions for an exact canonical `prepared` receipt at the same workspace root that agrees
   exactly with the current canonical complete managed state:
   - if it differs only from the newly requested complete client selection, that is a repairable re-selection,
     not a foreign conflict; and
   - a receipt and state that agree on one prior integration version, but differ from the current executing WPM
     version for that reason alone, are repairable stale WPM-managed integration.
   Either exception may apply together. Continue only through integration's authoritative complete no-write
   preflight, then prepare on integration success; integration may replace the selection/version before
   preparation republishes the receipt. A foreign root, noncanonical bytes, receipt/state disagreement, or an
   applying state is not this exception and remains a blocker. Classify an exact WPM-owned `preparing` receipt
   by its request-key prefix:
   - `init|` belongs only to the identical original `wpm init` retry. Stop adoption and recover by repeating
     that exact init request; never schedule integration or standalone preparation for it.
   - `handoff|` belongs only to the identical standalone handoff plan. When root, version, complete client
     selection, and managed state still match, recover by repeating exactly
     `wpm -C <root> authoring handoff prepare --json` without running integration first. If that exact retry
     succeeds, go directly to **Report only a prepared handoff** and exit adoption; never fall through to
     integration or another preparation. On non-success, stop. Otherwise stop before the retry.
   - an unknown, absent, or malformed preparing-key prefix is a blocker. Do not guess its producer.
3. For every selected client, run the read-only command below even if an earlier selected client failed:

   `wpm -C <root> authoring handoff verify --client <id> --json`

The verifier is expected to return non-zero when managed integration or a prepared receipt is absent. That does
not make every blocker ignorable. Aggregate every selected-client result and all shared blockers first. The
read-only verification must happen before the first integration mutation and must expose the authoring Backlog
root, mandatory core task plan, managed state, receipt, selected native front doors, and skill surfaces that it
can inspect.

### Decide whether the observed failure is repairable

Continue only when every observed blocker is exactly repairable by this requested sequence:

- missing or stale WPM-managed integration for the complete requested selection, including one coherent
  same-root canonical complete state and prepared receipt at a prior WPM integration version;
- a missing or stale selected native surface that integration owns; or
- a missing or stale exact WPM-owned **prepared** handoff receipt whose disagreement is solely caused by that
  managed integration or the explicitly requested complete client re-selection.

Any other blocker stops the adoption before the first write. This includes an invalid root or unreadable
manifest/package wrapper, Backlog root, mandatory core task, unsupported selection, foreign/modified receipt,
unowned or ambiguous native path, unreadable evidence, incoherent or receipt/state-disagreeing version, or
unknown blocker code. Do not
ignore or translate an unfamiliar blocker into an expected integration failure. Report every affected surface,
one applicable recovery per blocker or prerequisite group, `handoff prepared: no`, and that the workspace,
authoring backlog, generated deliverable, native integrations, and handoff evidence remain unchanged.

### Integrate and prepare in order

Enter this section only when no `preparing` receipt recovery branch was taken.

Immediately before mutation, retain the complete preflight result. Then invoke integration exactly once with
the entire client selection:

`wpm -C <root> authoring integrate --client <id> [...]`

Repeat `--client <id>` for every selected client. A single `--client` is not additive: omitted previously
configured clients may be retired. Never issue one integration command per client.

Integration performs its own aggregate preflight. If it returns non-success, report its exact blockers or typed
partial evidence and stop. Do not run preparation, retry automatically, or claim rollback. A successful
integration that says `handoff prepared: no` is not bootstrap success.

Only after successful integration, invoke preparation exactly once:

`wpm -C <root> authoring handoff prepare --json`

If preparation returns non-success, report its exact blockers or typed partial evidence and stop; do not claim
prepared. A race or unforeseen post-preflight failure is a truthful non-success, not permission to hide the
earlier integration change or invent a transaction. Follow only the exact recovery WPM returns.

## Report only a prepared handoff

Success requires WPM's `handoffPrepared: true` or `status: prepared` result. Preserve and report:

- the canonical workspace root;
- the complete configured authoring-client selection;
- each selected client's launch command and workspace-root working directory;
- each selected client's reload guidance and native front door;
- each selected client's fresh-session verification command; and
- the required first `wpm-author` invocation.

Tell the user to start a fresh session for the selected client at the recorded workspace root, follow the
reported reload guidance, and run the exact verification entry from WPM. Then stop at the workspace boundary.

Do not spawn or start an agent, do not authenticate a client, and do not claim receiving-agent acceptance. Do
not invoke `wpm-author`, inspect or select authoring work, claim or progress a task, route a specialist, or
author bundle/package content. Agent process, authentication, acceptance, and task progress are not claimed by
bootstrap.
