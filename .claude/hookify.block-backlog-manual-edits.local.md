---
name: block-backlog-manual-edits
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: '(^|/)\.?[\w-]*backlog/'
---

🚫 **Manual edit of a Backlog.md file is forbidden — use the `backlog` CLI.**

This path is inside a Backlog.md root (the top-level `backlog/`, a bundle's
`install-backlog/`, the `.authoring-backlog/`, `.backlog/`, or any `*-backlog/`).
Per this project's `AGENTS.md` — a hard rule, on every layer:

> **Backlog.md is operated *only* through its CLI. Never hand-edit anything under `backlog/`.**

Hand-editing task files, `config.yml`, sequences, or the board corrupts the
index and the task IDs.

**Do it through the CLI instead** (run inside the relevant backlog root):
- `backlog task create "<title>" -l "kind:state,step:<slug>" -m <v> --ac "..." --dod "..."`
- `backlog task edit <id> -s "In Progress"` · `--check-ac <n>` · `--check-dod <n>` · `--notes "..."` · `--ac "..."`
- `backlog task list --plain` · `backlog sequence list` · `backlog task <id> --plain` · `backlog task archive <id>`
- Anything else: `backlog <cmd> --help`

Reading these files is fine — only writes are blocked. To change `config.yml`,
re-run the relevant `backlog` init/config flow rather than editing it by hand.
