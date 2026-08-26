# Process artifact lifecycle

This repository uses BMAD and other agent workflows to develop `wpm`, but their generated output is
working memory, not a fourth source of product truth. The durable truth remains deliberately small:

- `docs/` records approved product intent and architecture;
- `backlog/`, operated only through the Backlog.md CLI, records accepted work and story status;
- source code and executable tests record implemented behaviour; and
- `research/evolution/` records compact experimental learning and final gate dispositions.

Generated plans, stories, sprint mirrors, test summaries, investigations, and raw workflow transcripts do
not become normative merely because a tool wrote them. They may be useful during a run and misleading after
their last consumer has finished.

## The four stores

| Store | Examples | Git policy | Lifetime |
|---|---|---|---|
| Canonical truth | `docs/`, `backlog/`, source, tests | Tracked | Maintained until deliberately superseded |
| Live working memory | `_bmad-output/`, `Skills-Results/` | Ignored | Through the last workflow that consumes it |
| Compact orchestration state | `.bmad/sdlc-state.yaml` | Tracked | Current position only; rewritten at transitions |
| Durable research evidence | `research/evolution/records/`, `research/evolution/gates/` | Tracked | Permanent, compact, schema-validated |

BMAD installation and customization under `_bmad/` and `.claude/skills/` are executable development
tooling, not workflow-run output, and are outside this retention cleanup.

## Working-memory lifecycle

Every generated artifact follows the same lifecycle:

1. **Create locally.** Let the workflow write its conventional output below an ignored working-memory root.
2. **Consume.** Keep the artifact until the last named consumer has completed. A story file, for example, may
   remain through implementation, QA, and independent review; trace and NFR output may remain through the
   final epic-gate decision.
3. **Distil.** Before closeout, move only durable facts to their proper authority:
   - accepted requirements or architectural decisions to human-approved canonical docs;
   - story outcome, acceptance evidence, skill invocations, and unresolved follow-ups to Backlog.md through
     its CLI;
   - cross-project observations, causal lessons, waivers, residual risks, and possible evolution directions
     to an evolution record or gate receipt.
4. **Archive optionally.** Raw evidence may be copied to an external research store only after a human chooses
   the store and access classification. Record a credential-free pointer, checksum, expiry, and privacy class.
   Never commit raw output as a fallback when that store is unavailable.
5. **Clean locally.** Once the last consumer and distillation are complete, remove the ignored local copy when
   it is no longer useful. Local cleanup is an explicit maintainer action; the policy checker never mutates.

The default when no external archive is configured is `local-ignored-until-cleanup`: raw material may remain
on the current machine, ignored by Git, until a maintainer deletes it. A fresh checkout does not need it.

## What to retain

Retain a compact durable record when an episode teaches something that can change later work. Evolution
records distinguish observations and decisions from hypotheses, state the experimental maturity and
architecture status, link to canonical truth, and name residual risk. Candidate destinations must remain
labelled `hypothesis` until a human accepts them into the product architecture.

Retain one gate receipt per reviewable candidate or independently meaningful gate. It binds the candidate
identity to checks, verdict, waivers, and residual risks. A completed pre-PR gate and the later PR handoff are
separate receipts: the former keeps its immutable candidate verdict while the latter remains `pending` until
CI and human review finish. Intermediate matrices and raw command output remain working memory. A pending
receipt must not imply readiness; a `waived` receipt must identify the approving human authority and what was
not proven.

Investigations and retrospectives are working memory while active. At closure, distil root cause, rejected
hypotheses, consequential decisions, verification, lessons, and follow-ups into Backlog.md, canonical docs,
or the episode's evolution record. Then archive externally or clean the transcript.

## Current-state rules

`.bmad/sdlc-state.yaml` is a compact pointer, not an event log. It contains only the active phase, branch,
epic/change, current story and review cycle, currently relevant specialists and their last actual skills,
pending gates, waiver pointers, and update metadata. Git history already preserves earlier state revisions;
append-only comments, completed-story inventories, old agent narratives, and copied test results do not belong
in the live file. Backlog.md remains authoritative for story status.

## Archive safety

An external archive pointer is optional. When present, the validator requires an approved remote scheme,
SHA-256 digest, expiry date, privacy classification, and the approving human identity and timestamp. Pointers
must not contain credentials, query strings, or fragments. Secrets, tokens, private user content, and
unreviewed personal data must never enter either the archive or a durable record. Choosing a public or private
store, uploading evidence, or changing its retention is a human gate.

## Migration and recovery

The legacy corpus was removed from the branch index without deleting local files or rewriting history. Its
last fully tracked recovery point is commit `9d28f96903cb3cf9b9cb8765f4f33fd76d07af39`, recorded again in the
onboarding evolution record and gate receipt. A maintainer can inspect a historical file with
`git show 9d28f96903cb3cf9b9cb8765f4f33fd76d07af39:<path>` or recover the whole corpus in a disposable checkout.

Run `npm run check:process-artifacts` while editing to validate the working tree. CI runs
`npm run check:process-artifacts:ci`, which additionally requires every governance file, schema, state file,
evolution record, and gate receipt to be tracked and identical to the Git-index candidate. Both commands are
read-only, print every violation, and exit non-zero on drift.
