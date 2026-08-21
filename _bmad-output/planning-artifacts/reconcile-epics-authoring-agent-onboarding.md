# Input Reconciliation — `epics-authoring-agent-onboarding.md`

## Scope

Compared `_bmad-output/planning-artifacts/epics-authoring-agent-onboarding.md` with the updated
`_bmad-output/planning-artifacts/prd.md`. No `addendum.md` exists. This extract identifies material
content from the epic artifact that is absent, ambiguous, or less clear in the PRD; it does not propose
story decomposition changes.

## Coverage result

- All 48 current functional requirements are present in both artifacts as the same stable ID set,
  `FR2`–`FR49`, with unchanged requirement wording.
- All 18 non-functional requirements are present in both artifacts as `NFR1`–`NFR18`, also with
  unchanged wording.
- The missing `FR1` is intentional in both artifacts: public acquisition remains an unnumbered,
  deferred activation outcome until a human authorizes identity and channel policy.
- The six WPM-owned skill names, the three-epic boundary, the inactive-distribution boundary, and the
  template-evolution/reconstruction deferrals are preserved.

There is therefore no numbered-requirement omission or renumbering defect. The remaining gaps are in
details carried by the epic narratives, acceptance criteria, and Additional Requirements.

## Material gaps

### 1. The promised stable authoring-client IDs are not bound to literal values in the PRD

PRD `FR3` promises stable IDs and human-readable names, but does not name the IDs. Epic Story 2.1 makes
the contract concrete: Codex is `codex` and Claude Code is `claude-code`. Because these values cross help,
headless setup, persisted defaults, handoff state, and tests, leaving them only in a story weakens the
stable public vocabulary.

**Recommended destination:** bind `codex` and `claude-code` in the PRD's authoring-adapter definitions or
in `FR3`, without changing the requirement number. Also standardize the nearby nouns: the human chooses an
**authoring tool/client ID**, while an **authoring adapter** is WPM's integration description for that ID.

### 2. The low-bureaucracy, continuous onboarding experience is dispersed rather than stated as a goal

The epic's UX requirement says the intended experience is one continuous
setup → reload/resume → workspace create/adopt → fresh-session verification journey. Adapter inspection,
detection, update, reconciliation, and legacy migration are implementation states, not extra user steps.
The Additional Requirements also say an existing agent normally supplies its own ID, while a direct human
invocation gets one chooser and one confirmation, followed by only applicable reload guidance and one exact
resume action.

The PRD contains most of these mechanics across `FR7`–`FR16` and `FR26`–`FR29`, but it does not preserve the
qualitative product goal that the journey must feel like one handoff rather than a sequence of maintenance
workflows. That was a central simplification decision in the epic work.

**Recommended destination:** add one concise experience principle or success-quality sentence to the scoped
addendum narrative; do not add another feature or workflow.

### 3. Two story-level safety guarantees are not explicit at PRD level

- Story 2.5 makes `wpm-review-package` read-only unless separate fix authorization was supplied. `FR49`
  defines review breadth but does not preserve that no-mutation default.
- Story 2.8 promises that retrying handoff preparation after a partial write converges without duplicate or
  corrupted managed state. `NFR3` lists repeatable operations but does not name handoff preparation, while
  `NFR4` correctly disclaims *generic* rollback, resume, or reconciliation. The current wording therefore
  leaves the intended operation-specific retry guarantee ambiguous.

**Recommended destination:** promote the review no-mutation default to `FR49` or a shared safety requirement;
either add handoff preparation to the explicitly repeatable operations in `NFR3`, or narrow Story 2.8 so it
promises boundary reporting without unsupported convergence.

### 4. Architecture-significant constraints have no downstream home because there is no addendum

The epic's Additional Requirements preserve several implementation seams that should not inflate the PRD
but are important for consistent architecture:

- adapter path/front-door/launch/reload/detection facts are defined once and reused;
- personal-scope writes remain behind injected filesystem and environment boundaries;
- title-only backlog materialisation is insufficient for template stable keys, requiring an identity/read
  boundary rather than a general reconciliation engine; and
- the applicable mandatory-plus-template plan is validated before structural APPLY or backlog writes.

The PRD keeps the observable outcomes in `NFR1`, `NFR4`, and `NFR13`, but the concrete seams above are not
preserved elsewhere in this PRD workspace. With no `addendum.md`, they can be lost before architecture is
updated.

**Recommended destination:** preserve these four items in an architecture addendum or architecture decision
record. They do not need to become new FRs.

### 5. The two artifacts now describe circular provenance

The updated PRD says its scoped addendum is a projection of the approved epic artifact. The epic artifact's
frontmatter lists `prd.md` as an input and its Overview says the PRD supplies constraints. This reflects the
workflow history, but a future reader cannot tell whether the current PRD or the epic artifact is the
requirements source for the increment.

**Recommended destination:** clarify provenance only: the historical PRD/design set supplied the baseline;
the approved epic run supplied the scoped change signal; the updated PRD is now the requirements projection,
and the epic artifact remains its implementation decomposition. This is a documentation fix, not a scope
change.

## Reconciliation verdict

The updated PRD preserves the complete numbered requirement contract and the approved scope. Before final
status, resolve or explicitly defer the five gaps above—especially the literal adapter IDs, the continuous
onboarding quality, and the two safety guarantees. Route the architecture seams to a downstream companion
rather than expanding the PRD with technical design.
