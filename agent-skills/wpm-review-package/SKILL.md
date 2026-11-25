---
name: wpm-review-package
description: Review a WPM work package from fresh context for local handoff readiness without changing it. Use before handoff to expose package, executor, and build defects. This does not fix content and does not authorize publication.
---

# Review one WPM work package from fresh context

Run this review without relying on a prior authoring conversation. Derive the result from the durable WPM
workspace and prospective deliverable artifacts, without another WPM skill or hidden bootstrap context.

The review is read-only over its subject. Do not fix or rewrite reviewed content, update registries, check off
or close tasks, change task status, or claim authority to publish. If the user later authorizes fixes, treat
that as separately authorized work after returning the review result.

## Establish and preserve the review subject

Require an explicit workspace root. Do not auto-init, search upward into a different project, infer a bundle,
or enable a bundle to make the review pass.

Before running any evidence-producing command, snapshot the original workspace and any pre-existing
prospective deliverable. Record every relevant path and type, regular-file bytes, and symlink target. Include
the complete `builds/` region so an existing archive cannot be silently replaced and called review evidence.

Use only read surfaces against the original:

- `wpm project show --json` and `wpm bundle list` for orientation;
- `wpm bundle <id> show` for each manifest-declared bundle;
- `wpm project validate` as one bounded validation signal; and
- the exact `manifest.yml`, each `bundle.yml`, `wpm.lock`, task backlogs, referenced ordinary files, and
  existing prospective deliverables as authoritative artifacts.

Read paths without changing timestamps or following an unbounded link. For each reference, retain its portable
relative path, ordinary-file or directory type as appropriate, symlink identity and target, and owning project
or bundle scope. If one parent artifact cannot be read, mark its dependent checks `blocked`; continue every
independent check and include both in the result.

## Evaluate the complete bounded catalog

These seven categories are the complete boundary of this review. Evaluate each exactly once in the result. Do
not expand the finite catalog into a general style, security, publication-channel, or speculative quality
review.

### 1. Package structure

- Distinguish the workspace wrapper from the `wip/` deliverable. Workspace-root authoring front doors,
  `.authoring-backlog/`, native authoring skills, `builds/`, and distribution-preparation content are not
  deliverable structure.
- Reconcile `manifest.yml` bundle entries with enabled bundle directories. Report missing enabled bundles,
  unexpected package regions, and path or case collisions. A non-manifest bundle directory is disabled
  authoring state, not a defect merely because it is on disk; verify that it stays inert and does not ship.
  `bundles/bundle-template/` is the conventional authoring scaffold, not an orphan or enabled bundle; inspect
  its exclusion instead of reporting its presence.
- Verify reserved executor-front-door sources (`wip/_AGENTS.md` and per-bundle `_AGENTS.md`), bundle Backlog.md
  aliases, recipe roots, and the expected project/bundle region boundaries. Do not require a canonical
  executor `AGENTS.md` inside the authoring `wip/` tree; build derives it.

### 2. References

- Resolve every project and bundle installer-helper reference, payload file, template, script, and skill
  reference to its exact declared path and scope.
- Resolve task `--ref` relationships, install/uninstall recipe inputs, and `wpm.lock` references. Report each
  missing, escaping, wrong-type, ambiguous, or cross-scope reference with both the owner and target.
- A symlink is evidence only when its recorded target resolves inside the intended original package boundary
  and its role explicitly permits a link. WPM-managed scope aliases may store an OS-native absolute target;
  that absolute scope alias is not a defect when it resolves to the correct `installer-skills/` directory in
  the original workspace. Do not silently replace a link with the content it happens to reach.

### 3. Registrations

- The owning `manifest.yml` is authoritative for project `installerSkills`. The owning bundle's `bundle.yml`
  is authoritative for bundle `installerSkills` and `payload.skills`; its payload lists are authoritative for
  files, templates, and scripts. The conventional main `<project>-installer` and `<id>-advisor` roles are
  reserved and intentionally not registered as project helpers; do not report the main installer or an
  advisor as unregistered. Executor front doors likewise have no helper or payload-skill registration.
- An orientation view or disk scan is not registration. Disk presence is not registration, and registration
  is not complete authored content. Verify the exact registered name/path relationship and the ordinary file
  it names.
- A scaffold with TODO, placeholder, empty, or role-divergent content remains incomplete even when its role is
  convention-owned or registered. Registration absence and content incompleteness are distinct findings.

### 4. Version constraints

- Inspect project and bundle SemVer, every enabled-bundle `requires` edge, unsatisfied or missing dependencies,
  and dependency cycles. Compare the result with the exact lock evidence rather than selecting a version.
- For an evidenced version transition, inspect durable state, migration tasks, `from-version` gates, and
  consumer constraint-review tasks. Missing durable transition history is unresolved, never proof that an
  update is safe.
- `wpm project validate` checks dependency constraints, cycles, non-empty targets, and orphan bundle
  directories; it is not the whole package review. Capture all of its findings, then continue every independent
  structure, reference, registration, version, simulation, and build check.

### Aggregate coherence findings

Do not fail fast after the first parse, reference, registry, or constraint problem. Report every detected
defect in package structure, references, registrations, and version constraints in one result. Each finding
must name its category, affected artifact or relationship, and durable evidence. Sort findings by category,
artifact, relationship, and message so identical inputs produce a stable result.

When unreadable or invalid parent data blocks dependent checks, name those checks and the missing boundary.
Continue all independent checks; a blocked dependent observation does not erase an independently detected
defect.

### 5. Context-less executor simulation

Simulate the executor from the prospective extracted deliverable alone, with no authoring workspace or prior
conversation. Cover a fresh install and every version transition supported by durable state and migration
evidence.

Trace discover, detect, setup, verify, receipt/state recording, recovery, and first-use guidance in their
declared order. Report every:

- unstated prerequisite;
- ambiguous outcome or acceptance condition that is not observable;
- unresolved reference;
- undeclared coupling or ordering dependency; and
- missing verification, receipt fact, recovery instruction, or usage guidance.

Do not supply a missing decision from memory or another skill. Record it as unresolved and identify the
affected fresh-install or transition path.

### 6. Build non-leakage

A dry-run listing alone is not build evidence. Before copying or planting review data, snapshot the original
workspace: every path and type, regular-file bytes, symlink target, and any pre-existing build output. Create a
symlink-preserving disposable copy of the complete workspace in a fresh temporary root outside the original
workspace and outside any source Git worktree that contains it. Immediately snapshot the unmodified copy and
compare it with the original baseline. Re-snapshot the original at the same boundary. A mismatch means the
review subject changed during capture; stop and return `not-ready` rather than reviewing mixed-time bytes.

After that equivalence proof, neutralize root Git metadata only in the disposable copy and verify that Git
discovery from the copy cannot resolve the original workspace or a containing source repository. Remove the
copy's `builds/` and recreate it empty. A copied pre-existing archive is historical input, never fresh build
evidence; prove each expected output is absent before invoking the builder. Never alter either Git metadata or
build output in the original workspace.

Preserving a WPM-managed OS-native absolute scope alias can leave its copied raw target pointing at the
original workspace. Do not traverse that alias as disposable-build source, and do not call it non-portable
when its original resolution is correct. Prove instead that the builder derives the archive's scope aliases
from the copied manifest and emits relative, bounded archive links without importing original-workspace bytes.

Only after the original baseline and unmodified-copy equivalence checks pass, plant a unique review marker in
the disposable copy at both workspace-native paths below. Never plant the marker in the original workspace:

- `.agents/skills/wpm-review-package/SKILL.md`; and
- `.claude/skills/wpm-review-package/SKILL.md`.

Run `wpm build dry-run` and then fresh real `wpm build package --format tarball` and `wpm build package
--format git` commands only in that disposable copy, using the accepted installed WPM runtime. Also exercise
`--format zip` when its platform tools are available. Inspect each archive immediately before a later format
can replace a shared output path, and compare their root-relative layouts. Never run `wpm build publish`.

Inspect every real archive's paths, link targets, and relevant file content. Authoring backlog/front-door bytes,
native workspace skill paths, `wpm-review-package`, the planted marker, disabled or orphan bundle content,
builder templates, `builds/`, distribution preparation, and bytes reached by ascending into a source Git
repository must not ship. An executor `AGENTS.md` produced from `_AGENTS.md` and its declared target aliases are
legitimate deliverable front doors; allow that executor `AGENTS.md` when its bytes come from the reserved
source. Require its archive aliases to be relative and bounded in every exercised format. Any
workspace-authoring leak is a build-non-leakage finding and blocks readiness.

If a real prospective archive cannot be produced, record missing build evidence and return `not-ready`.
Inspecting only an old archive, an independently rebuilt package, or a dry-run is not a substitute. Delete the
disposable copy after evidence is retained.

Re-snapshot the original workspace and pre-existing deliverable after inspection. The original must be
unchanged in paths, types, regular-file bytes, symlink targets, and build outputs. Any original mutation is a
review failure, not a fix.

### 7. Release readiness

Join package coherence, context-less executor simulation, and real build evidence. Use `ready` only when every
one of the seven categories completed without a defect, blocked check, or unresolved required fact. Otherwise
use `not-ready` and retain all findings. One successful validation, simulation step, or build must not erase an
independent problem.

This is local handoff readiness, not publication authorization. Do not run or propose `wpm build publish`, Git
tag or release writes, npm publication or dist-tag changes, credential operations, or remote channel
assessment as part of this review.

## Return one inspectable result

Return one stable result with:

- `workspace`: the explicit reviewed root and durable identity available locally;
- `prospective archive`: path, format, size, digest, and binding to the disposable copy used for inspection;
- `catalog`: all seven categories and `complete | findings | blocked` status for each;
- `findings`: the sorted aggregate, with category, affected artifact or relationship, and evidence;
- `blocked`: checks that could not run and the exact missing parent or prerequisite;
- `unresolved`: missing author decisions or transition facts, without guessed answers;
- `simulation`: fresh-install and each evidenced version-transition outcome;
- `build`: dry-run, real archive, link/layout/content, and planted-marker non-leakage evidence;
- `unchanged`: before/after proof for the original workspace and any pre-existing deliverable; and
- `release readiness`: exactly `ready` or `not-ready`, followed by “local handoff readiness; not publication
  authorization.”

Do not mutate the subject after reporting `not-ready`. Name separately authorized follow-up work without
performing it.
