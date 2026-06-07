import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import type { AgentName, Project } from "../../../src/core/model/index.js";
import {
  type LifecycleDeps,
  type OperationSpec,
  type ReadSpec,
  runMutation,
  runRead,
} from "../../../src/core/operations/lifecycle.js";
import type { DesiredArtefacts } from "../../../src/core/services/derived-artefacts.js";

/**
 * Acceptance test for the shared mutation lifecycle harness (doc 13 §5/§8), exercised through its public API
 * as a BLACK BOX the way a command's composition root will drive it: a resolved authoring-workspace context
 * (from task-24/88 — the deliverable root `<workspace>/wip` plus the workspace root) plus the ports + an
 * artefact-derivation capability go in, an `OperationResult` comes out, and the harness threads the six beats
 * (LOAD → CHECK → APPLY → RERENDER → MATERIALISE → RESULT) around the operation. LOAD / APPLY / RERENDER act on
 * the DELIVERABLE root; ⑤ MATERIALISE writes the `.authoring-backlog/` at the WORKSPACE root. One `describe`
 * per acceptance criterion. Pure and deterministic: an in-memory filesystem + in-memory backlog + a fixture
 * deriver stand in for the real disk, Backlog.md CLI, and template-backed deriver — no real fs / process / git.
 */

const WS = "/app";
const DELIV = `${WS}/wip`;
/** The authoring backlog is its own Backlog.md root at the WORKSPACE root, beside `wip/` (doc 10 step 6; 06/11). */
const AUTHORING = `${WS}/.authoring-backlog`;
/** The harness context: the deliverable + workspace roots, kept distinct (task-88). */
const CTX = { deliverableRoot: DELIV, workspaceRoot: WS } as const;
/** The orchestrator file the fixture re-renders (a non-front-door derived artefact). */
const ORCHESTRATOR = "installer-skills/acme-installer/SKILL.md";

/** A realistic workspace, set up the way a prior `init` would leave it: a manifest under `wip/` + an authoring backlog. */
function setUpProject(): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  fs.write(
    `${DELIV}/manifest.yml`,
    [
      "project:",
      "  name: acme",
      "  version: 2.1.0",
      "targets:",
      "  - claude",
      "bundles: []",
      "",
    ].join("\n"),
  );
  // The alias target a prior `init` would have created (doc-10 §init makes installer-skills/ BEFORE the
  // scope-alias symlink) — so the alias the harness creates points at a real dir, not a broken link.
  fs.makeDirectories(`${DELIV}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "app" });
  return { fs, backlog };
}

/**
 * The fixture artefact-derivation capability: a small, fixed {@link DesiredArtefacts} — the author-owned
 * front-door file (path `AGENTS.md`, excluded from re-render), the auto-derived orchestrator skill, and one
 * root alias. Fixed content ⇒ idempotent re-derivation. Stands in for the real template-backed deriver.
 */
function fixtureDeriver(): (project: Project) => DesiredArtefacts {
  return (_project: Project): DesiredArtefacts => ({
    files: [
      { path: "AGENTS.md", content: "# acme front-door\n" },
      { path: ORCHESTRATOR, content: "# acme orchestrator\n" },
    ],
    aliasPlan: {
      aliases: [
        { target: "claude" as AgentName, linkPath: ".claude/skills", aliasTo: "installer-skills" },
      ],
      unknownTargets: [],
    },
  });
}

/** Harness deps wired to the in-memory fakes + the fixture deriver. */
function lifecycleDeps(fs: MemoryFileSystem, backlog: FakeBacklog): LifecycleDeps {
  return { fs, backlog, deriveArtefacts: fixtureDeriver() };
}

/** A representative mutation: "enable a setting" — writes a settings file and asks for one authoring task. */
const enableSetting: OperationSpec = {
  summary: (project) => `enabled telemetry for ${project.manifest.meta.name}`,
  apply: ({ fs, root }) => {
    fs.write(`${root}/settings.yml`, "telemetry: on\n");
    return { changedPaths: [`${root}/settings.yml`] };
  },
  materialise: () => [
    { title: "Document the telemetry setting", acceptanceCriteria: ["the setting is documented"] },
  ],
};

/** The alias link paths this scenario's fixture creates, for snapshotting. */
const ALIAS_LINKS = [`${DELIV}/.claude/skills`];

/**
 * Snapshot the observable filesystem under `dir` + the targets of known alias links, from the PUBLIC port
 * surface (`list`/`read`/`exists`) + the `aliasTarget` test accessor — so "nothing changed" is a deep-equal.
 */
function snapshot(fs: MemoryFileSystem, dir: string): unknown {
  const files: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const entry of fs.list(d)) {
      const child = `${d}/${entry.name}`;
      if (entry.kind === "directory") walk(child);
      else files[child] = fs.read(child);
    }
  };
  if (fs.exists(dir)) walk(dir);
  const aliases: Record<string, string | undefined> = {};
  for (const link of ALIAS_LINKS) aliases[link] = fs.aliasTarget(link);
  return { files, aliases };
}

describe("lifecycle harness — acceptance (doc 13 §5/§8)", () => {
  describe("AC#1 — every state-changing operation runs the same six beats", () => {
    it("a mutating command rides the shared lifecycle (load, check, apply, re-derive, materialise, report)", () => {
      const { fs, backlog } = setUpProject();

      const result = runMutation(lifecycleDeps(fs, backlog), CTX, enableSetting, undefined);

      // ⑥ RESULT reflects ① LOAD (the manifest name), ③ APPLY, and ④ RERENDER all at once:
      expect(result.summary).toBe("enabled telemetry for acme");
      // changedPaths spans BOTH the operation's own file AND the harness's re-derived orchestrator + alias —
      // but NOT the author-owned front door (excluded on mutation, task-88):
      expect(result.changedPaths).toContain(`${DELIV}/settings.yml`); // ③ APPLY
      expect(result.changedPaths).toContain(`${DELIV}/${ORCHESTRATOR}`); // ④ RERENDER orchestrator
      expect(result.changedPaths).not.toContain(`${DELIV}/AGENTS.md`); // front door author-owned
      expect(result.changedPaths).toContain(`${DELIV}/.claude/skills`); // ④ RERENDER alias
      expect(result.materialisedTaskTitles).toEqual(["Document the telemetry setting"]); // ⑤

      // The observable end state proves each beat happened:
      expect(fs.read(`${DELIV}/settings.yml`)).toBe("telemetry: on\n"); // ③
      expect(fs.read(`${DELIV}/${ORCHESTRATOR}`)).toBe("# acme orchestrator\n"); // ④ orchestrator re-derived
      expect(fs.exists(`${DELIV}/AGENTS.md`)).toBe(false); // ④ front door NOT re-rendered
      expect(fs.aliasTarget(`${DELIV}/.claude/skills`)).toBe(`${DELIV}/installer-skills`); // ④ alias created
      expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
        "Document the telemetry setting",
      ); // ⑤ at the WORKSPACE-root backlog
    });
  });

  describe("task-88 — operates on the deliverable while materialising into the workspace backlog", () => {
    it("loads + writes under wip/ but creates authoring tasks at the workspace root", () => {
      const { fs, backlog } = setUpProject();

      runMutation(lifecycleDeps(fs, backlog), CTX, enableSetting, undefined);

      // The operation's effect + the re-rendered orchestrator landed under the DELIVERABLE root...
      expect(fs.exists(`${DELIV}/settings.yml`)).toBe(true);
      expect(fs.exists(`${DELIV}/${ORCHESTRATOR}`)).toBe(true);
      // ...while the authoring task went to the WORKSPACE-root backlog, NOT a backlog under wip/ (no backlog
      // was ever initialised under the deliverable, so querying one there throws):
      expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain(
        "Document the telemetry setting",
      );
      expect(() => backlog.listTasks(`${DELIV}/.authoring-backlog`)).toThrow();
    });
  });

  describe("AC#2 — re-deriving and materialising happen automatically, not arranged by the operation", () => {
    it("currency and task creation are the harness's job, not the operation's", () => {
      const { fs, backlog } = setUpProject();

      // This operation ONLY writes its own file and RETURNS a plan; it never calls deriveArtefacts/
      // planChanges/materialiseAuthoringTasks itself.
      const bareOp: OperationSpec = {
        summary: "flipped a flag",
        apply: ({ fs: afs, root }) => {
          afs.write(`${root}/flag.yml`, "on\n");
        },
        materialise: () => [{ title: "Note the flag", acceptanceCriteria: [] }],
      };

      const result = runMutation(lifecycleDeps(fs, backlog), CTX, bareOp, undefined);

      // The harness re-derived the orchestrator though the op did not ask (and left the front door alone):
      expect(fs.read(`${DELIV}/${ORCHESTRATOR}`)).toBe("# acme orchestrator\n");
      expect(fs.exists(`${DELIV}/AGENTS.md`)).toBe(false);
      expect(result.changedPaths).toContain(`${DELIV}/${ORCHESTRATOR}`);
      // ...and materialised the task though the op only returned the plan:
      expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toContain("Note the flag");
      expect(result.materialisedTaskTitles).toEqual(["Note the flag"]);
    });
  });

  describe("AC#3 — a read-only operation loads and reports without changing anything", () => {
    it("show/list/validate observe, they do not mutate", () => {
      const { fs, backlog } = setUpProject();

      const before = snapshot(fs, DELIV);
      const tasksBefore = backlog.listTasks(AUTHORING);

      const describeProject: ReadSpec<void, { name: string; bundleCount: number }> = {
        summary: "described the project",
        project: (project) => ({
          name: project.manifest.meta.name,
          bundleCount: project.bundles.size,
        }),
      };

      const outcome = runRead(fs, CTX, describeProject, undefined);

      // It projected a value from the loaded project:
      expect(outcome.value).toEqual({ name: "acme", bundleCount: 0 });
      // ...and reported an empty-effect result:
      expect(outcome.result.summary).toBe("described the project");
      expect(outcome.result.changedPaths).toEqual([]);
      expect(outcome.result.materialisedTaskTitles).toEqual([]);
      // ...and changed nothing on disk or in the backlog:
      expect(snapshot(fs, DELIV)).toEqual(before);
      expect(backlog.listTasks(AUTHORING)).toEqual(tasksBefore);
    });
  });

  describe("AC#4 — repeating an already-applied operation makes no further change", () => {
    it("the lifecycle is idempotent: a redundant re-run is a no-op", () => {
      const { fs, backlog } = setUpProject();

      const first = runMutation(lifecycleDeps(fs, backlog), CTX, enableSetting, undefined);
      expect(first.changedPaths).toContain(`${DELIV}/${ORCHESTRATOR}`);
      expect(first.changedPaths).toContain(`${DELIV}/.claude/skills`);
      expect(first.materialisedTaskTitles).toEqual(["Document the telemetry setting"]);

      const afterFirst = snapshot(fs, DELIV);
      const tasksAfterFirst = backlog.listTasks(AUTHORING).map((t) => t.title);

      const second = runMutation(lifecycleDeps(fs, backlog), CTX, enableSetting, undefined);

      // ④ planChanges is empty (orchestrator + alias already match), ⑤ the title already exists (skipped):
      expect(second.changedPaths).not.toContain(`${DELIV}/${ORCHESTRATOR}`);
      expect(second.changedPaths).not.toContain(`${DELIV}/.claude/skills`);
      expect(second.materialisedTaskTitles).toEqual([]);
      // The on-disk + backlog state is byte-identical to after the first run:
      expect(snapshot(fs, DELIV)).toEqual(afterFirst);
      expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toEqual(tasksAfterFirst);
    });
  });
});
