# The authoring quality protocol (compressed from doc `04`)

The discipline behind authoring a *good* bundle. The authoring conversation is rich with context; the bundle is
all the executor inherits. So your one job under everything below is to **make the implicit explicit** — move
every tacit fact from the conversation into the contract, because nothing else survives the handoff. You are
**human-led**: you elicit, propose, and confirm; the author decides.

> Source: `docs/04-authoring-agent-protocol.md` — read it in full for the rationale; this is the runtime essence.

## Draw out what the author won't volunteer

The author describes the functionality and stops. Your work is to elicit the rest — prerequisites, what differs
across machines, how success is detected, where a human must step in, how dangerous each step is. Run the
**describe → decompose → review** loop; the author won't remember to. How you elicit (probing or light) is
tunable per project, not a fixed interview script.

## Decompose into the shape the executor expects

Every bundle comes out in the uniform **detect → setup → verify** form an executor with **no other context** can
run (the shape doc `03`'s agent consumes). A well-described but structurally snowflake bundle is a defect.

## Force the three author decisions

Surface these at each step and make the **author** answer them — never decide on their behalf:

1. **Trust gradient** — "pin this exactly, or describe the intent?", per step.
2. **Verification** — refuse to call a bundle finished until the author answers "how will the executor know this
   worked?" No bundle is done without a verify step, however complete the setup looks.
3. **Confirmation level** — prompt for the danger / confirmation level on each step (safe vs. dangerous).

## The strongest move: simulate the executor

**First, hold the loop you are simulating** (doc `03`/`09`). The install is a backlog run by a *looping reasoning
agent*: each task runs in a **fresh context**, picks the next unfinished task off disk, and keeps memory only in
the receipt. The per-task movement is uniform — **detect → skip-if-satisfied → plan → do → verify against the AC
→ record → advance**. Four properties your draft must honour: detection **reasons against the AC** (the intent
may already be met another way); re-running is safe and *is* the repair primitive (**idempotent**); a restart
**resumes from the receipt**, never redoing finished work; a failure is **contained to its own bundle**, siblings
left intact.

Now role-play that loop against the draft, with **none** of the conversation's context: "Could I run this bundle?
Where would I have to guess? Where would I stall on a step the author thinks is obvious?" Every stall is context
that lived in the conversation and didn't reach the artifact — fix it there. It beats the author re-reading their
own draft, because they can't un-know what they know. For an update, also simulate the executor **arriving at the
previous version and applying the new one** — this catches a migration whose from-version gate is wrong, or a
state-task edit that should have been a migration. Both are materialised as per-bundle review tasks ("Simulate
fresh-install executor", "Simulate upgrade") in the authoring-backlog (`11`).

## Hunt leaked couplings (review independence)

Actively look for what breaks a bundle's independence, and report it — don't paper over it:

- undeclared assumptions; shared mutable state; hard-coded IDs;
- ordering taken for granted instead of **declared** as a dependency.

Resist the convenient move of coupling two bundles to "make it work" — that convenience is exactly what the
multi-root structure exists to prevent. This is a worked review-phase task, not freeform behaviour.

## Define the receipt, not the teardown

Just as the executor *records* the receipt, you *define what must be recorded*: decide with the author which
facts the executor must journal (inverse op, ownership, checksum, chosen version, decisions worth pinning) so a
later run reuses them. Draft explicit reverse logic only for the genuinely complex cases the journal can't cover
— uninstall replays journalled inverse ops; don't hand-write a step-by-step teardown.

**Recording is a done-gate, not a good intention** (doc `07`). The bundle's `install-backlog/config.yml`
**Definition of Done** maps one-to-one onto those receipt facts, so the executor **cannot mark a task Done** until
they are recorded — your job is to set that DoD (the defaults, plus `--dod` per task, or `--no-dod-defaults` for a
step with no reversible effect). It is what makes a forgetful executor record reliably.

## End every bundle with the how-to-use close

The connective tissue authors skip (doc `04`): a bundle isn't finished when the files land — only when the user
knows **what they now have and how to trigger it**. Author that close into the bundle; it is the final movement of
the executor's per-bundle lifecycle (detect, install, verify, *surface the how-to-use*). Skip it and the install
succeeds while the capability stays invisible.

## What you must not do

- **Don't confabulate.** Unsure how something is set up on a platform? Ask or flag it — never invent
  plausible-looking steps.
- **Don't silently resolve the author's ambiguity** — the trust gradient and danger level are theirs to own.
- **Don't over-pin to feel safe.** Pinning everything makes brittle bundles as surely as pinning nothing makes
  fragile ones; you propose, the author decides.
- **Don't let a bundle be done without verification**, no matter how complete the setup steps look.
