# 03 · The Executing Agent

The third role, and the hinge the other two depend on. The agent is a user of this system too, and its experience is what decides whether everything in the other documents actually happens. If the package is legible to the agent, the install is reliable; if each bundle is a snowflake, no amount of good intent on the human side survives contact. So the package's real job is to hand the agent four things, cleanly.

## What the package must give the agent

**A front door.** One entry file that says: start here, this is the model, this is the loop you follow. The agent should never have to reverse-engineer how the project works from its contents.

**A selection protocol.** Detect what's detectable about the environment, take the bundles the user chose from the menu, resolve `requires` transitively so prerequisites come first (core before Chromium), check version constraints close, and produce an order. Selection is derivation, not improvisation.

**A uniform per-bundle loop**, identical across every bundle: detect → skip if already satisfied → plan → do → verify against acceptance criteria → record → move on. The **record** step writes the receipt into the task — the inverse op, the ownership flag, the checksum of what was placed — and the bundle's Definition-of-Done makes that a precondition for marking the task Done. Uniformity is the whole game. The agent should be able to execute a bundle it has never seen because every bundle has the same shape.

**Boundaries.** Don't touch other bundles. Don't assume a prerequisite that wasn't declared in `requires`. Stop at handoff points. Only ever reverse what you installed — never an adopted, pre-existing dependency. Never redo a decision the receipt already recorded. These guardrails are what keep an autonomous executor from quietly turning independent bundles back into a tangle.

## The package-manager patterns, from the agent's side

Resolution runs over the `requires` graph, transitively, the way a package manager walks a dependency tree — each edge a bundle id with a version constraint, satisfied by the depended-upon bundle's declared `version`. The target-agent axis behaves as a **peer dependency** — the agent it's wiring into must already exist; the executor checks for it rather than installing it. Before doing anything, the executor **reads the receipt** (the task records) and skips what was already resolved, reusing prior decisions instead of re-deciding them — this is how non-determinism gets tamed across runs, and it's exactly what makes Repair coherent rather than a fresh roll of the dice. Idempotent **detection is the repair primitive**: because re-running is safe, "fix the install" and "run the install" are the same operation pointed at a partially-complete state. And the lifecycle order within a bundle is fixed — detect, install, verify, surface the how-to-use — so the agent never has to invent sequence.

Three more patterns govern what the agent records and reverses, adapted from mature package managers to a reasoning executor. It writes an **inverse-op journal at do-time** rather than inferring an undo afterward — each step records its own concrete reversal as it runs, the way MSI builds a rollback script (you can't reliably reconstruct, later, which conditional branch actually fired). It tracks **ownership**: whether it *installed* a dependency or *adopted* a pre-existing one, because only the former may ever be reversed. And it computes **removability from the requires-graph** — "is this shared dependency still needed?" is answered from the graph plus the still-installed bundles, never from a stored counter, which drifts. Underlying all three is the executor's defining trait: it is smart but forgetful, so it **journals only the facts it cannot re-derive by inspection** — installed-vs-adopted, the inverse step, an overwritten file, a chosen value — and re-derives everything inspectable (presence, registration, file integrity) by looking, rather than trusting a record.

**Updating** is the same loop pointed at a higher target, not a separate mode. The agent compares the recipe's declared version to the version recorded in the receipt; if the recipe is newer, it runs that recipe against the persistent receipt — the idempotent state tasks reconcile (no-op where already satisfied), and the pending migration tasks, those whose introduced-version is newer than the recorded one and whose from-version gate matches, fire oldest-first, each recording itself into the receipt so the version advances and the ledger grows. No diff is computed; idempotent detection plus the version gate decide what actually runs. The convention these tasks follow — the two task kinds, the gate, immutability of shipped migrations — is in `08`.

## Handling the hard moments

At a **handoff point**, the agent pauses, surfaces the need in plain language, waits, and resumes from recorded state. It never proceeds past a handoff on its own initiative — that's the one place its autonomy is explicitly suspended.

On **partial failure**, it contains the damage to the failing bundle, reports per-bundle, leaves the others intact, and offers a retry that's safe because of detection. It does not let one bundle's failure cascade.

It respects **confirmation levels** at run time: auto-running the steps the author marked routine and pausing on the ones marked dangerous, all within the single up-front approval the user already gave. The author's authoring-time judgment becomes the agent's run-time behavior.

And it must **survive its own death**: on restart, re-read per-bundle task status and the recorded receipt and continue, never restarting completed work.

## The contract in one line

The human chooses, the agent executes, and the package keeps the choices few and the execution uniform. The agent's prime directive follows from that: turn the bundles the user picked into changes on their machine, pausing only where a human is genuinely needed, recording as it goes the facts it can't later re-derive, and never making a decision the receipt has already recorded.
