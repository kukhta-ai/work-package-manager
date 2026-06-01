# Test Automation Summary — task-32 (Author the builder's own agent skill)

> bmad-qa-generate-e2e-tests output. Feature under test: "the builder's own agent skill
> (`agent-skills/installer-builder/`) lets an agent drive the `wpm` CLI to author a bundle-project." This is a
> STATIC, agent-facing skill (markdown content about `wpm` itself) — there is no UI and no runtime behavior to
> drive, so the "E2E" / acceptance layer is a content-acceptance test that reads the REAL shipped files and
> asserts the load-bearing signals. Framework: vitest (project's existing `unit` harness). Steps 2–3 (API /
> browser E2E) do not apply — the deliverable IS the skill content.

## Generated / confirmed tests — `test/unit/agent-skills/installer-builder-skill.test.ts`
Reads the genuine `agent-skills/installer-builder/{SKILL.md, references/*.md}` from disk via `node:fs` (static
content; no MemoryFileSystem / resolver / subprocess). One `describe` per acceptance criterion.

- [x] AC#2 — `SKILL.md` exists with valid frontmatter: `name: installer-builder` + a non-empty `description`.
- [x] AC#2 — the `description` fires on the doc-12 authoring intents (contains `author` + `bundle-project`/`installer`).
- [x] AC#2 — the body states the **thin-builder / fat-agent** principle (`thin builder` + `fat agent` + "never runs/installs").
- [x] AC#2 — the body states the **SDLC-agnostic** principle (`sdlc-agnostic` + a workflow is *vendored*).
- [x] AC#1 — the body references the load-bearing CLI verbs (`wpm init`, `bundle new`, `build`).
- [x] AC#1 — the body teaches driving Backlog.md directly for recipe tasks (the **no-mirror** rule).
- [x] AC#3 — all three `references/{command-reference,authoring-workflow,conventions}.md` exist and are non-trivial.
- [x] AC#3 — the `SKILL.md` NAMES all three references by filename (points at them).
- [x] AC#3 — the `SKILL.md` is lean — its byte length is less than the three references combined.
- [x] AC#3 — the `SKILL.md` does NOT inline a full command table (the leaf groups belong in command-reference.md).
- [x] (hygiene) no `{{placeholder}}` marker in the `SKILL.md` or any reference (static content about `wpm`).
- [x] AC#1/#3 (ADDED) — `command-reference.md` actually enumerates the command surface (`wpm init`/`project`/`bundle new`/`bundle <id>`/`build` + the no-mirror note).
- [x] AC#1/#3 (ADDED) — `conventions.md` covers V2 tagging (`kind:state`/`kind:migration`/`step:`/milestone) + the Backlog.md flag rules (one comma-separated `-l`, `--dep` by id) + structure-not-content + no-mirror.
- [x] AC#1/#3 (ADDED) — `authoring-workflow.md` covers the `init → bundle new → fill → build` arc + the authoring-backlog + `backlog task create` + self-attested completion.

## AC → coverage map
| AC | Covered by |
|----|------------|
| #1 an agent can drive the CLI to author a bundle-project without external instruction | SKILL CLI-verbs + backlog-directly cases; the three ADDED reference-depth cases (the depth the SKILL points at is actually present) |
| #2 activates on the authoring intents + conveys SDLC-agnostic + thin-builder | frontmatter + triggers case; the two principle cases |
| #3 detailed material reachable on demand, not front-loaded | references exist/non-trivial; SKILL names all 3; SKILL leaner than references; SKILL has no inlined command table |

## Gap found & closed
The pre-existing cases proved the references EXIST and are non-trivial *by length*, but AC#1's "without external
instruction" only holds if the depth the `SKILL.md` points at is actually IN the references (a non-trivial-but-
empty reference would pass the length floor yet break the AC). Added three focused cases asserting each
reference carries its promised content: the command surface (command-reference), the V2 tagging + flag rules
(conventions), and the authoring arc + self-attest loop (authoring-workflow). No existing coverage duplicated.

## Coverage
- ACs: 3/3 covered, each by ≥ 2 cases. 14 cases total, all green.
- Happy path: an agent reading the skill finds the triggers, the principles, the CLI verbs, and the deep
  references. Critical robustness: the references aren't hollow (depth-present checks); no template placeholders
  leaked into static content; the body stays lean (progressive disclosure preserved).
- No UI → no browser E2E applicable; no runtime API → no status-code tests applicable.

## Next steps
- Run in CI via the three-command gate (tsc + biome + vitest), which already includes the new file.
- `agent-skills/` is now in `package.json files`, so `npm pack` ships the skill; the post-install copy into the
  agent's scope (doc 12) is a later concern, not this task.
