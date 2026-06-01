# Conventions (compressed from doc `08`, `10`, `11`)

The rules you apply when you create recipe tasks and decide which surface to use. For the full versioning and
migration model, read doc `08`.

## V2 recipe-task tagging (doc `08` §"Task tagging system")

Every install-backlog task carries three structural tags — and *only* these as tags; everything else the
executor records (inverse op, ownership, checksums) goes into the task's notes, not into more tags.

| Tag | Form | Job |
|---|---|---|
| **Identity** | `step:<slug>` (label, immutable) | stable correlation key — survives version changes and Backlog.md's ID recycling after archive. Address preserved tasks by slug, never by `task-N`. |
| **Kind** | `kind:state` or `kind:migration` (label, immutable) | which discipline applies. |
| **Version** | `-m <version>` (Backlog.md **milestone**) | the version whose recipe currently defines this task — the one natively queryable axis (`backlog task list -m <v>`). |

- **`kind:state`** — the idempotent "ensure desired state" steps: **detect → setup → verify**. Safe to re-run
  (that *is* Repair), and **editable across versions** (re-running reconciles to the new desired state).
- **`kind:migration`** — a step that only makes sense moving *from* a prior version (move a renamed config,
  transform data). Runs **once**, version-gated, and is **immutable once shipped** — fix forward with a new
  migration, never edit an applied one. The from-version gate lives in the task's AC body (it can't sit in a
  label), e.g. "applies when installed version < 0.2.0".

The detect/setup/verify trio is the floor of every bundle. A version-gated change coming from an older install
is the only reason to add a `kind:migration`.

## Backlog.md flag mechanics (doc `08` §"How these tags ride on Backlog.md")

These trip people up — get them right:

- **Labels do NOT accumulate** across repeated `-l` flags (only the last is kept) → put both labels in **one
  comma-separated** flag: `-l "kind:state,step:ensure-chromium"`.
- **`--ac` and `--dod` DO accumulate** across repeated flags — use one per criterion / DoD item.
- **`--dep` is by task id** (`web-handoff-1`), not by step slug. Look the id up first with
  `backlog task list --plain`. Ids display upper-cased (`WEB-HANDOFF-1`) but are referenced lower-case.
- A bundle's `task_prefix` is its id (set by `wpm bundle new` in `install-backlog/config.yml` **before** any
  task is created — changing it later orphans existing tasks), so its task ids are `<id>-1`, `<id>-2`, …

Example (a state task, then a dependent one):

```
cd bundles/web-handoff
backlog task create "ensure Chromium present" \
  -l "kind:state,step:ensure-chromium" -m 0.1.0 \
  --ac "chromium --version prints" --dod "ownership recorded"
backlog task create "place launcher config" \
  -l "kind:state,step:place-launcher-config" -m 0.1.0 --dep web-handoff-1 \
  --ac "launcher reachable from agent scope"
```

## The two cross-cutting rules

- **Structure, not content** (doc `10`). The `wpm` CLI manages structure — projects, bundles, manifest entries,
  the registered references to payload files and skills. The user-facing **content** — task descriptions,
  SKILL.md bodies, payload file contents — you write directly via the filesystem (your editor, write tools,
  `cat > … << EOF`). The CLI's role is to register, list, and validate what you placed, never to author prose.
- **No-mirror / above Backlog.md** (doc `10`, `11`). The CLI does **not** wrap Backlog.md task operations —
  not reads (list, view, search) and not writes (create, edit, reorder, archive). You operate every
  install-backlog task and the authoring-backlog with **Backlog.md directly**, inside the relevant backlog
  root. The CLI contributes to the authoring-backlog only by *materialising tasks when scope changes elsewhere*.

## Recipe vs receipt (doc `00`, `08`)

You author the **recipe** — the shipped, versioned `install-backlog/` task definitions (replaced wholesale on
update; holds no state). The **receipt** is the persistent filled-in copy the install stamps out on the user's
machine and writes as it goes. Never store state in the shippable recipe; never write the receipt yourself —
that is the executing agent's job at install time.
