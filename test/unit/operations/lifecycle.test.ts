import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { ConflictError, isDomainError } from "../../../src/core/errors.js";
import type { AgentName, Project } from "../../../src/core/model/index.js";
import {
  type LifecycleDeps,
  type OperationSpec,
  type ReadSpec,
  runMutation,
  runRead,
} from "../../../src/core/operations/lifecycle.js";
import type { DesiredArtefacts } from "../../../src/core/services/derived-artefacts.js";

const ROOT = "/proj";

/**
 * Seed a minimal valid project (`manifest.yml`, one target, no bundles) into `fs` at `ROOT`, and initialise
 * its authoring backlog — modelling reality, where a prior operation (`init`) has already created both before
 * any later mutation runs.
 */
function seedProject(fs: MemoryFileSystem, backlog: FakeBacklog): void {
  fs.write(
    `${ROOT}/manifest.yml`,
    [
      "project:",
      "  name: demo",
      "  version: 1.0.0",
      "targets:",
      "  - claude",
      "bundles: []",
      "",
    ].join("\n"),
  );
  // The alias target a prior `init` would have created (doc-10 §init makes installer-skills/ BEFORE the
  // scope-alias symlink) — so the alias the harness creates points at a real dir, not a broken link.
  fs.makeDirectories(`${ROOT}/installer-skills`);
  backlog.init(ROOT, { taskPrefix: "demo" });
}

/**
 * Snapshot the full observable filesystem state under `dir`, plus the targets of a set of known alias link
 * paths — built from the public FileSystem surface (`list`/`read`) + the documented `aliasTarget` test
 * accessor, so AC#4/AC#3 "nothing changed" can be asserted by deep-equality without a bespoke dump method.
 */
function snapshot(fs: MemoryFileSystem, dir: string, aliasLinks: readonly string[]): unknown {
  const files: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const entry of fs.list(d)) {
      const child = `${d}/${entry.name}`;
      if (entry.kind === "directory") {
        walk(child);
      } else {
        files[child] = fs.read(child);
      }
    }
  };
  if (fs.exists(dir)) walk(dir);
  const aliases: Record<string, string | undefined> = {};
  for (const link of aliasLinks) {
    aliases[link] = fs.aliasTarget(link);
  }
  return { files, aliases };
}

const ALIAS_LINKS = [`${ROOT}/.claude/skills`];

/**
 * A fixture deriver: derives one front-door file (fixed content, so idempotent) plus a single root alias.
 * Records each invocation as "RERENDER" in `calls` for beat-order assertions. Stands in for the real
 * template-backed deriver (tasks 30–31).
 */
function fixtureDeriver(calls: string[]): (project: Project) => DesiredArtefacts {
  return (_project: Project): DesiredArtefacts => {
    calls.push("RERENDER");
    return {
      files: [{ path: "AGENTS.md", content: "# front-door\n" }],
      aliasPlan: {
        aliases: [
          {
            target: "claude" as AgentName,
            linkPath: ".claude/skills",
            aliasTo: "installer-skills",
          },
        ],
        unknownTargets: [],
      },
    };
  };
}

/** A harness deps bundle wired to the in-memory fakes + the fixture deriver. */
function deps(fs: MemoryFileSystem, backlog: FakeBacklog, calls: string[]): LifecycleDeps {
  return { fs, backlog, deriveArtefacts: fixtureDeriver(calls) };
}

describe("lifecycle harness — runMutation (doc 13 §5/§8)", () => {
  it("AC#1 — fires the six beats in order: CHECK→APPLY→RERENDER→MATERIALISE (LOAD before, RESULT after)", () => {
    const fs = new MemoryFileSystem();
    const backlog = new FakeBacklog();
    seedProject(fs, backlog);
    const calls: string[] = [];
    let projectAtCheck: Project | undefined;

    const spec: OperationSpec = {
      summary: (project) => `did it for ${project.manifest.meta.name}`,
      check: (project) => {
        calls.push("CHECK");
        projectAtCheck = project; // proves ① LOAD ran before ② CHECK
      },
      apply: ({ fs: afs, root }) => {
        calls.push("APPLY");
        afs.write(`${root}/applied.txt`, "x");
        return { changedPaths: [`${root}/applied.txt`] };
      },
      materialise: () => {
        calls.push("MATERIALISE");
        return [{ title: "Author the thing", acceptanceCriteria: ["it is authored"] }];
      },
    };

    const result = runMutation(deps(fs, backlog, calls), { root: ROOT }, spec, undefined);

    // Observable beat order from the harness-invoked hooks:
    expect(calls).toEqual(["CHECK", "APPLY", "RERENDER", "MATERIALISE"]);
    // ① LOAD ran before ② CHECK (the check received a fully loaded project):
    expect(projectAtCheck?.manifest.meta.name).toBe("demo");
    // ③ the change applied:
    expect(fs.exists(`${ROOT}/applied.txt`)).toBe(true);
    // ④ the artefacts re-derived (fixture front-door written + alias created):
    expect(fs.read(`${ROOT}/AGENTS.md`)).toBe("# front-door\n");
    expect(fs.aliasTarget(`${ROOT}/.claude/skills`)).toBe(`${ROOT}/installer-skills`);
    // ⑤ the authoring task materialised:
    expect(backlog.listTasks(ROOT).map((t) => t.title)).toContain("Author the thing");
    // ⑥ RESULT built last, carrying ③'s + ④'s changed paths + ⑤'s title:
    expect(result.summary).toBe("did it for demo");
    expect(result.changedPaths).toContain(`${ROOT}/applied.txt`);
    expect(result.changedPaths).toContain(`${ROOT}/AGENTS.md`);
    expect(result.changedPaths).toContain(`${ROOT}/.claude/skills`);
    expect(result.materialisedTaskTitles).toEqual(["Author the thing"]);
  });

  it("AC#2 — RERENDER and MATERIALISE happen automatically, the spec arranging neither", () => {
    const fs = new MemoryFileSystem();
    const backlog = new FakeBacklog();
    seedProject(fs, backlog);
    const calls: string[] = [];

    // This spec does ONLY its own structural write; it never calls deriveArtefacts/planChanges/materialise*.
    const spec: OperationSpec = {
      summary: "minimal",
      apply: ({ fs: afs, root }) => {
        afs.write(`${root}/effect.txt`, "y");
      },
      materialise: () => [{ title: "Auto materialised", acceptanceCriteria: [] }],
    };

    const result = runMutation(deps(fs, backlog, calls), { root: ROOT }, spec, undefined);

    // The harness re-derived the front-door even though the spec did not ask it to:
    expect(fs.read(`${ROOT}/AGENTS.md`)).toBe("# front-door\n");
    expect(calls).toContain("RERENDER");
    // ...and materialised the task even though the spec only returned the plan:
    expect(backlog.listTasks(ROOT).map((t) => t.title)).toContain("Auto materialised");
    expect(result.materialisedTaskTitles).toEqual(["Auto materialised"]);
  });

  it("AC#4 — re-running an already-applied operation makes no further change", () => {
    const fs = new MemoryFileSystem();
    const backlog = new FakeBacklog();
    seedProject(fs, backlog);
    const calls: string[] = [];

    // An idempotent apply: writes the same file/content every time (so the second write is a no-op in effect).
    const spec: OperationSpec = {
      summary: "idem",
      apply: ({ fs: afs, root }) => {
        afs.write(`${root}/once.txt`, "stable");
      },
      materialise: () => [{ title: "One time task", acceptanceCriteria: [] }],
    };

    const first = runMutation(deps(fs, backlog, calls), { root: ROOT }, spec, undefined);
    // first run: front-door + alias written, task created
    expect(first.changedPaths).toContain(`${ROOT}/AGENTS.md`);
    expect(first.changedPaths).toContain(`${ROOT}/.claude/skills`);
    expect(first.materialisedTaskTitles).toEqual(["One time task"]);

    const afterFirst = snapshot(fs, ROOT, ALIAS_LINKS);
    const tasksAfterFirst = backlog.listTasks(ROOT).map((t) => t.title);

    const second = runMutation(deps(fs, backlog, calls), { root: ROOT }, spec, undefined);

    // ④ planChanges empty (front-door + alias already present), ⑤ title already present → skipped:
    expect(second.changedPaths).not.toContain(`${ROOT}/AGENTS.md`);
    expect(second.changedPaths).not.toContain(`${ROOT}/.claude/skills`);
    expect(second.materialisedTaskTitles).toEqual([]);
    // on-disk + backlog byte-identical to after the first run:
    expect(snapshot(fs, ROOT, ALIAS_LINKS)).toEqual(afterFirst);
    expect(backlog.listTasks(ROOT).map((t) => t.title)).toEqual(tasksAfterFirst);
  });

  it("a failing CHECK raises the DomainError and skips APPLY/RERENDER/MATERIALISE entirely", () => {
    const fs = new MemoryFileSystem();
    const backlog = new FakeBacklog();
    seedProject(fs, backlog);
    const calls: string[] = [];

    const spec: OperationSpec = {
      summary: "guarded",
      check: () => {
        throw new ConflictError("already exists");
      },
      apply: ({ fs: afs, root }) => {
        calls.push("APPLY");
        afs.write(`${root}/should-not-exist.txt`, "z");
      },
      materialise: () => [{ title: "Should not be created", acceptanceCriteria: [] }],
    };

    let thrown: unknown;
    try {
      runMutation(deps(fs, backlog, calls), { root: ROOT }, spec, undefined);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ConflictError);
    expect(isDomainError(thrown)).toBe(true);
    // ③④⑤ did not run:
    expect(calls).not.toContain("APPLY");
    expect(calls).not.toContain("RERENDER");
    expect(fs.exists(`${ROOT}/should-not-exist.txt`)).toBe(false);
    expect(fs.exists(`${ROOT}/AGENTS.md`)).toBe(false);
    expect(backlog.listTasks(ROOT)).toEqual([]);
  });
});

describe("lifecycle harness — runRead (doc 13 §8 read trace)", () => {
  it("AC#3 — a read loads and reports, changing nothing", () => {
    const fs = new MemoryFileSystem();
    const backlog = new FakeBacklog();
    seedProject(fs, backlog);

    const before = snapshot(fs, ROOT, ALIAS_LINKS);
    const tasksBefore = backlog.listTasks(ROOT);

    const readSpec: ReadSpec<void, string> = {
      summary: "read the name",
      project: (project) => project.manifest.meta.name,
    };

    const outcome = runRead(fs, { root: ROOT }, readSpec, undefined);

    // projected the value:
    expect(outcome.value).toBe("demo");
    // empty-effect result:
    expect(outcome.result.changedPaths).toEqual([]);
    expect(outcome.result.materialisedTaskTitles).toEqual([]);
    expect(outcome.result.summary).toBe("read the name");
    // nothing changed on disk or in the backlog:
    expect(snapshot(fs, ROOT, ALIAS_LINKS)).toEqual(before);
    expect(backlog.listTasks(ROOT)).toEqual(tasksBefore);
  });
});
