# Test Automation Summary — task-16 (template render engine)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest** (the project's existing framework). The builder
> is a pure-logic CLI with no HTTP API and no UI, so the API-test and browser-E2E bands are N/A. `render`
> touches no file system (doc 13 §4 — the operation does the I/O), so its acceptance band is a unit-level
> end-to-end render of a realistic full template.

## Generated / relevant tests

### Unit (the engine's behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/render.test.ts` — substitution in content AND path; `.tmpl` stripping (incl. only
  the final `.tmpl`); unmatched-placeholder error (naming placeholder + file, in content and in path);
  substitution-only / NO logic (`{{#if}}`, `{{#each}}`, `{{> partial}}`, unknown bare token all error, never
  interpreted); `renderTree` vs `renderSnippet` distinct; empty tree; extra-unused-param harmless.

### Acceptance (full-template end-to-end — all three ACs together), this skill
- [x] `test/unit/services/render.acceptance.test.ts`
  - Renders a project-template-shaped `files/` tree (`manifest.yml.tmpl`, `AGENTS.md.tmpl`, a
    placeholder-in-path `installer-skills/{{project-name}}-installer/SKILL.md.tmpl`, `RALPH-LOOP.md.tmpl`)
    with `{project-name, version, tool}` → asserts the full rendered file map (paths `.tmpl`-stripped +
    substituted; content substituted).
  - Renders an on-demand advisor snippet via `renderSnippet`.
  - A missing parameter in the batch fails loudly, naming the file.
  - A `{{#if}}` logic token is not interpreted (errors as invalid placeholder).

## Coverage
- AC#1 (every placeholder substituted; unresolved → error): covered (content, path, batch, snippet).
- AC#2 (substitution only, no logic): covered (the four logic-token cases + the bare-unknown case all error).
- AC#3 (files vs snippets distinguishable/handled): covered (`renderTree` batch vs `renderSnippet` single).

## Result
`npx vitest run` → 217 passed (22 files). `tsc --noEmit` clean, `biome check .` clean.

## Next steps
- Run in CI (the matrix runs the three-command gate).
- `render` is consumed by the `init`/`bundle new` operations (task-25/26+) and pairs with the template
  resolver (task-17, which reads `files`/`snippets` off disk); behavioral coverage of the full scaffold flow
  grows there.
