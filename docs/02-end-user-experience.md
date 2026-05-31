# 02 · The End User (human)

The second role, and the one everything else is ultimately for. The end user wants outcomes, not internal structure — and crucially, they never touch a UI we built. There is no installer window, no wizard screen, no menu we ship. The user works entirely through **their own AI agent**, in ordinary conversation: they point it at the project, and the agent reads the package and walks them through it. So "what the user experiences" is really "what their agent surfaces to them, on our package's behalf." Everything below describes that conversation — the few things the agent should put in front of the human, and the much larger amount it should handle silently. They should rarely, if ever, hear a bare bundle ID; what the agent offers them are short, human-readable descriptions of what each bundle does.

## What the agent offers, not a menu we built

The choice the agent puts to the user is, in effect, a **short list of what's on offer** — phrased from each bundle's `summary` field, never as bundle IDs and never as an internal "capability" label. But this isn't a screen with checkboxes; it's the agent saying, in conversation, "this package can set up web-page handoff and document handoff — which do you want?" There are really only two things a human should ever have to decide: which agent they're wiring this into (usually the very agent they're talking to, so it *confirms* rather than asks) and which pieces of functionality they want.

Crucially, **dependencies are derived, never asked**. The user picks "Hand off a web page to the user's browser"; the `core` bundle that web-handoff requires gets pulled in silently, and Chromium with it. They are never asked "do you also need core?" or "do you want to install Chromium?" — those are implementation details of a choice they already made. This is the wizard's Typical / Custom split done better: a recommended default selection is offered, full control is available, but auto-detection collapses most of the clicks a real wizard forces, because the agent can simply look at the machine.

## The moments the agent surfaces, in order

These are the only points where the package expects the agent to stop and involve the human; everything between them the agent handles on its own. They're conversational beats, not screens.

1. **Plan preview before any change.** Before a single thing is installed or edited, the agent lays out, in plain language, what it's about to do across the selected bundles, and waits for the user to approve. This is the EULA grown up — it's simultaneously the trust gate and the safety gate, because what's about to run is open-ended setup on the user's own machine, and the agent talking the user through the plan first is what makes that consensual rather than alarming.

2. **Narrated, bundle-level progress.** As it works, the agent keeps the user oriented at the bundle level — "core is done, Chromium is installing, documents are still pending" — rather than dumping a log firehose or going silent. It's richer than a progress bar precisely because the agent can explain what it's doing and why, and the separate-roots structure gives it that granularity for free.

3. **Human-in-the-loop pauses.** Passwords, permission grants, genuine choices — the UAC moment, made conversational. There's a satisfying recursion to notice here: the product this project installs *is* a handoff capability, and the install itself needs handoff. The core bundle can stand up the very channel that later bundles then use to ask the user things.

4. **Deferred completion.** The "a reboot is required" of this world: a step that can only finish after a later condition — the user re-authenticates, or restarts their agent. The agent should say so plainly and pick up where it left off rather than pretending it's done.

5. **Partial failure, contained.** Chromium setup fails; Documents still succeeds. The agent reports a per-bundle result rather than a single red X over everything, and offers a retry — which is safe to take because each bundle's detection step no-ops whatever already happened. Isolation is what turns a failure into a contained inconvenience instead of a poisoned install.

6. **Completion and how-to-use.** The close is never just "done." It's "your plugin now hands off web pages and documents — here's how to trigger it," handing the user back a capability they can actually use.

## Maintenance mode

This is the most underused idea in the installer lineage, and it's where the design earns its keep. Once installed, the project stays **re-enterable**.

Adding a bundle later is the `npm install <package>` move: the user asks their agent for one more piece of functionality and it adds that bundle; because bundles are independent, nothing else is reinstalled or disturbed. **Update** is offered when a bundle's shipped version is newer than what's recorded as installed — the signal is simply that gap; the agent previews what will change and brings the bundle current by running the new recipe against the recorded state, applying only the pending steps, per bundle so the user can update one and leave the rest. **Repair** is re-running detection and re-checking acceptance criteria to find and fix drift — semantic repair, not checksum repair, made natural by idempotency; it's the install loop run in reconcile mode. **Uninstall** replays the recorded inverse ops in reverse: it removes only what the install actually installed, leaves any pre-existing dependency it merely *adopted* untouched, and decides whether a shared dependency is still needed from the `requires` graph rather than a counter. Where the user has edited a placed config file, update, uninstall, and repair preserve their version and offer keep/replace/merge rather than blindly overwriting or deleting it. (The versioning and migration machinery behind Update is in `08`.)

One honest limit: true transactional rollback, MSI-style, is hard when a reasoning agent is touching a real machine. What the design gives instead is partial-failure containment from isolation and soft rollback by replaying the inverse-op journal — reliable on what it recorded, best-effort on side effects that aren't cleanly reversible. Robust in practice, but not atomic, and worth being upfront about rather than implying a guarantee the system can't keep.
