# Test Automation Summary — task-17 (two-tier template resolution)

> `bmad-qa-generate-e2e-tests` output. Framework: **vitest**. No HTTP API / UI (a CLI), so the API/E2E-UI
> bands are N/A. The resolver computes over the **FileSystem port**, so it is tested purely against the
> in-memory `MemoryFileSystem` fake (task-12) with fixture template trees — no real disk, no built-in
> templates needed (those are tasks 30–31).

## Generated / relevant tests

### Unit (resolver behavior — AC#1/#2/#3), `bmad-dev-story`
- [x] `test/unit/services/template-resolver.test.ts` — resolve from built-in (base); project-local shadows
  built-in; no-project context (built-ins only); nested `files/` tree → relative paths; `snippets/` read;
  absent `snippets/` → `[]`; not-found result naming both searched dirs (and that it does NOT throw);
  malformed `template.yml` (missing scope / bad scope) surfaces the schema error (throws); `listTemplates`
  both scopes, filtered to project, filtered to bundle, shadow-dedup, no-project, empty.

### Acceptance (resolve -> render thread — the resolver's purpose), this skill
- [x] `test/unit/services/template-resolver.acceptance.test.ts`
  - Seeds a built-in + project-local `project/minimal` (with a placeholder-in-path
    `installer-skills/{{project-name}}-installer/SKILL.md.tmpl`) and a `bundle/default`.
  - `resolveTemplate` returns the project-local override (AC#1); `listTemplates` shows both scopes and the
    filtered subset (AC#2).
  - Pipes the resolved `template.files` through `renderTree` with `{project-name, version, tool}` → asserts
    the final rendered file map (paths `.tmpl`-stripped + substituted) — proving **resolve + render
    compose** into the file map an `init` would write.
  - An unknown name yields the clear not-found result (AC#3).

## Coverage
- AC#1 (project-local before built-in): covered (unit shadow + acceptance shadow).
- AC#2 (list, filtered project vs bundle): covered (unit + acceptance).
- AC#3 (clear not-found): covered (discriminated `{found:false, name, scope, searched}`; no throw).
- Composition: the resolver's output drives render end-to-end.

## Result
`npx vitest run` → 234 passed (24 files). `tsc --noEmit` clean, `biome check .` clean.

## Next steps
- Run in CI (the matrix runs the three-command gate).
- The resolver + render are consumed by the `init` / `bundle new` operations (task-25/26+); the full scaffold
  flow (resolve → render → FS write through the port) is exercised there and at the walking skeleton.
