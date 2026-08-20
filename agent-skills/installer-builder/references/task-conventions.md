# Acceptance-criteria conventions (distilled from `docs/task-writing-conventions.md`)

The contract for the acceptance criteria (AC) you write on every recipe task in a bundle's install-backlog.
Get it right and a context-less executor can prove an install worked on a machine you never saw; get it wrong
and the bundle ships with nothing to verify against.

> Source: distilled from `docs/task-writing-conventions.md` — the project standard that governs **both** wpm's
> own backlog *and* every bundle you ship. Read it for the full rationale and worked rewrites; this is the
> runtime-usable essence, not a replacement.

## The principle

> **An acceptance criterion states what is observably true when the task is done — never the steps taken to get
> there.** It describes a *condition the world is in*, checkable from outside, independent of method.

This is correctness, not style. The AC you write **is** the verification that travels inside the bundle: it is
what the executor reasons against to DETECT "already satisfied here?", what it re-checks after DO to prove
success, and the basis of the receipt, repair, and idempotent re-runs. A *how*-criterion can't serve as proof,
and it replaces the executor's on-the-machine adaptation with a guess by an author who couldn't see the
target — the exact brittle failure wpm exists to escape. State the outcome; let the agent find the path.

## The rules

1. **Outcome, not action.** *"Invalid input is rejected with a typed error and a non-zero exit code"* — not
   *"add a try/catch that throws and exits."*
2. **Checkable from outside the boundary.** Confirmable by observing behaviour at the component's edge, without
   reading the implementation. If you can't check it without looking inside, rewrite it.
3. **One concern per criterion, written declaratively.** Split compound criteria; each maps to one thing you
   could test. State the end-state, not the loop that produces it.
4. **Cover the negatives and edges as outcomes too.** Error behaviour, boundaries, and "does nothing"
   guarantees are criteria, not afterthoughts: *"a missing path surfaces a catchable error"*; *"the step has no
   side effects."*
5. **Specify the seam, leave the stuffing.** Naming a *boundary contract* something else relies on is a *what*
   and allowed; naming an internal choice invisible from outside is a *how* and disallowed (table below).
6. **Never restate the Definition of Done.** The universal bar lives once in the bundle's `config.yml` DoD —
   don't repeat "tests pass / facts recorded" per task.

## Seam vs stuffing — what you may name

| Naming this is a **contract** (allowed) | Naming this is an **internal detail** (disallowed) |
|---|---|
| Exit codes others branch on (`0` / `2` / `1`) | the control-flow or data structure that produced them |
| A file / lockfile format others read | which serializer library wrote it |
| A content hash as the tamper-evidence *guarantee* | which hash algorithm, when nothing external pins it |
| A typed, machine-distinguishable error *kind* | the class hierarchy that models it |

Rule of thumb: if callers, other programs, or a public format depend on it, it's part of the *what*; if it's
only visible by reading the source, it's *how*.

## The fast classifier

> **Could two competent implementers satisfy this criterion with completely different code?**
> - **Yes** → it's a *what*. Keep it.
> - **No — it forces one implementation** → it's a *how*. Rewrite it as the outcome that code was meant to
>   produce.

## Quick rewrites (how → what)

- HOW *"Loop over each field and push error strings into an array."*
  WHAT *"Every distinct defect is reported in one pass, each naming its location."*
- HOW *"Run the installer with `sudo`, then copy the binary into `/usr/local/bin`."*
  WHAT *"The tool is on `PATH` and `--version` prints; elevation is requested only where the target requires it."*

## Where this binds you

Every `--ac` on a `kind:state` or `kind:migration` recipe task (see `conventions.md`). A migration's
from-version gate is itself an outcome stated in the AC body ("applies when installed < 0.2.0"), never a step.
And no bundle is done without a verify outcome — the AC is the proof (`quality-protocol.md`).
