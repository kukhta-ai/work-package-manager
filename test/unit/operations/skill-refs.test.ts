import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import { DomainError } from "../../../src/core/errors.js";
import type { SkillRef } from "../../../src/core/model/index.js";
import { makeArtefactDeriver } from "../../../src/core/operations/derive-artefacts-capability.js";
import {
  type LifecycleDeps,
  runMutation,
  runRead,
} from "../../../src/core/operations/lifecycle.js";
import {
  attachSkillRefSpec,
  listSkillRefsSpec,
  PAYLOAD_SKILLS_DESCRIPTOR,
  removeSkillRefSpec,
  removeUnregisteredSkillStubSpec,
  scaffoldSkillRefSpec,
} from "../../../src/core/operations/skill-refs.js";
import { parseBundleManifest } from "../../../src/core/services/schema/index.js";
import { parseYaml } from "../../../src/util/yaml.js";

/**
 * Unit tests for the GENERIC descriptor-driven skill-reference operation core (`skill-refs.ts`) driven through
 * the task-25 lifecycle harness over in-memory ports — the reusable seam P (bundle installer-skills) and F
 * (project installer-skills) reuse. They exercise the four specs (attach / scaffold / list / remove) against
 * `PAYLOAD_SKILLS_DESCRIPTOR`: the `{name, path}` registry mechanics, frontmatter validation on attach, the
 * snippet-rendered stub + the materialised "Write payload skill" task on scaffold, and deregister-not-delete on
 * remove. (The 3-way add DISPATCH — attach vs scaffold vs `--path`-missing error — is exercised at the CLI layer
 * in `bundle-skills-commands.test.ts`; here each branch's spec is driven directly.)
 */

const ROOT = "/proj";
const BUILTIN = "/builtin-templates";
const AUTHORING = `${ROOT}/.authoring-backlog`;

/** A bundle.yml with a leading comment + a known key order (NO payload key — the old-bundle.yml shape). */
function bundleYml(id: string): string {
  return [
    `# bundle ${id} — payload skills are edited via \`wpm bundle ${id} skills …\``,
    `id: ${id}`,
    "version: 0.1.0",
    `summary: bundle ${id}`,
    "confirmation: safe",
    "requires: {}",
    "",
  ].join("\n");
}

/** A valid SKILL.md (frontmatter with name + description). */
function skillMd(name: string): string {
  return `---\nname: ${name}\ndescription: Do ${name} for the user at runtime.\n---\n\n# ${name}\nbody\n`;
}

/** Seed a project at /proj with bundle `a`; `aYml` overrides its bundle.yml. */
function seed(aYml?: string): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  fs.write(
    `${ROOT}/manifest.yml`,
    "project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\nbundles:\n  - a\n",
  );
  fs.write(`${ROOT}/bundles/a/bundle.yml`, aYml ?? bundleYml("a"));
  fs.makeDirectories(`${ROOT}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });

  // Project template snippets so ④ RERENDER resolves AND the SCAFFOLD branch finds the payload-skill snippet.
  fs.write(`${BUILTIN}/project/minimal/template.yml`, "name: minimal\nscope: project\n");
  fs.write(`${BUILTIN}/project/minimal/snippets/AGENTS.md`, "# {{project-name}}\n\n{{bundles}}\n");
  fs.write(
    `${BUILTIN}/project/minimal/snippets/installer-skills/{{project-name}}-installer/SKILL.md`,
    "---\nname: {{project-name}}-installer\n---\nInstall {{project-name}}.\n",
  );
  fs.write(
    `${BUILTIN}/project/minimal/snippets/advisor.SKILL.md.tmpl`,
    "---\nname: {{bundle-id}}-advisor\n---\n\n# {{bundle-id}} advisor\n",
  );
  // The payload-skill snippet the SCAFFOLD branch renders (mirrors templates/project/minimal/snippets/, which
  // uses {{skill-name}} and carries a placeholder runtime-trigger description + a "Stub" marker).
  fs.write(
    `${BUILTIN}/project/minimal/snippets/payload-skill.SKILL.md.tmpl`,
    '---\nname: {{skill-name}}\ndescription: "TODO (RUNTIME trigger): when the USER would invoke {{skill-name}}."\n---\n\n# {{skill-name}}\n\n> Stub — fill this in.\n',
  );
  return { fs, backlog };
}

function lifecycleDeps(fs: MemoryFileSystem, backlog: FakeBacklog): LifecycleDeps {
  return {
    fs,
    backlog,
    deriveArtefacts: makeArtefactDeriver({ fs, builtinTemplatesRoot: BUILTIN }),
  };
}

/** The parsed `payload.skills` of `<id>`'s bundle.yml on disk. */
function skillsOf(fs: MemoryFileSystem, id: string): readonly SkillRef[] {
  const parsed = parseBundleManifest(parseYaml(fs.read(`${ROOT}/bundles/${id}/bundle.yml`)));
  if (!parsed.ok) throw new Error(`bundle ${id} did not parse: ${parsed.problem.message}`);
  return parsed.value.payload.skills;
}

const CONVENTIONAL = "payload/agent-skills";

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// ATTACH (attachSkillRefSpec) — validate frontmatter + register; NO materialise
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("attachSkillRefSpec", () => {
  it("registers {name, conventional path} for a valid SKILL.md at the conventional location; leaves the file unchanged; no task", () => {
    const { fs, backlog } = seed();
    const path = `${CONVENTIONAL}/handoff/SKILL.md`;
    fs.write(`${ROOT}/bundles/a/${path}`, skillMd("handoff"));
    const before = fs.read(`${ROOT}/bundles/a/${path}`);

    const result = runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "handoff", path },
    );

    expect(skillsOf(fs, "a")).toEqual([{ name: "handoff", path }]);
    expect(fs.read(`${ROOT}/bundles/a/${path}`)).toBe(before); // structure-not-content
    expect(result.materialisedTaskTitles).toEqual([]); // attach queues no writing
    expect(backlog.listTasks(AUTHORING)).toHaveLength(0);
  });

  it("registers the --path location verbatim when the SKILL.md was relocated off the conventional path", () => {
    const { fs, backlog } = seed();
    const path = "elsewhere/custom/SKILL.md";
    fs.write(`${ROOT}/bundles/a/${path}`, skillMd("relocated"));

    runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "relocated", path },
    );

    expect(skillsOf(fs, "a")).toEqual([{ name: "relocated", path }]); // the --path, not the conventional path
  });

  it("rejects a SKILL.md with invalid frontmatter (no description) WITHOUT registering anything", () => {
    const { fs, backlog } = seed();
    const path = `${CONVENTIONAL}/bad/SKILL.md`;
    fs.write(`${ROOT}/bundles/a/${path}`, "---\nname: bad\n---\nno description\n");
    const before = fs.read(`${ROOT}/bundles/a/bundle.yml`);

    let thrown: unknown;
    try {
      runMutation(
        lifecycleDeps(fs, backlog),
        { deliverableRoot: ROOT, workspaceRoot: ROOT },
        attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
        { id: "a", name: "bad", path },
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).category).toBe("validation");
    expect(skillsOf(fs, "a")).toEqual([]); // nothing registered
    expect(fs.read(`${ROOT}/bundles/a/bundle.yml`)).toBe(before); // bundle.yml byte-identical
  });

  it("is set-like on name: attaching the same name twice keeps one entry", () => {
    const { fs, backlog } = seed();
    const path = `${CONVENTIONAL}/dup/SKILL.md`;
    fs.write(`${ROOT}/bundles/a/${path}`, skillMd("dup"));
    const d = lifecycleDeps(fs, backlog);
    runMutation(
      d,
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      {
        id: "a",
        name: "dup",
        path,
      },
    );
    runMutation(
      d,
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      {
        id: "a",
        name: "dup",
        path,
      },
    );
    expect(skillsOf(fs, "a")).toEqual([{ name: "dup", path }]);
  });

  it("preserves the bundle.yml comment + key order on registration", () => {
    const { fs, backlog } = seed();
    const path = `${CONVENTIONAL}/k/SKILL.md`;
    fs.write(`${ROOT}/bundles/a/${path}`, skillMd("k"));
    runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      attachSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "k", path },
    );
    const text = fs.read(`${ROOT}/bundles/a/bundle.yml`);
    expect(text).toContain("# bundle a —");
    const keyOrder = text
      .split("\n")
      .map((l) => l.match(/^([a-z_]+):/)?.[1])
      .filter((kk): kk is string => kk !== undefined);
    expect(keyOrder).toEqual(["id", "version", "summary", "confirmation", "requires", "payload"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// SCAFFOLD (scaffoldSkillRefSpec) — render a stub + register + materialise the writing task
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("scaffoldSkillRefSpec", () => {
  it("renders a stub at the conventional path (name + placeholder description, no invented prose), registers it, and materialises the writing task", () => {
    const { fs, backlog } = seed();
    const result = runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      scaffoldSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR, { builtinTemplatesRoot: BUILTIN }),
      { id: "a", name: "fresh" },
    );

    const stubPath = `${ROOT}/bundles/a/${CONVENTIONAL}/fresh/SKILL.md`;
    expect(fs.exists(stubPath)).toBe(true);
    const stub = fs.read(stubPath);
    expect(stub).toContain("name: fresh"); // frontmatter name substituted
    expect(stub).toContain("TODO (RUNTIME trigger)"); // placeholder runtime-trigger description, not invented prose
    expect(stub).toContain("Stub"); // the structural stub marker

    expect(skillsOf(fs, "a")).toEqual([{ name: "fresh", path: `${CONVENTIONAL}/fresh/SKILL.md` }]);

    // the doc-11 "Write payload skill <name> for <id>" task is materialised into the authoring backlog:
    expect(result.materialisedTaskTitles).toContain("Write payload skill fresh for a");
    const titles = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(titles).toContain("Write payload skill fresh for a");
  });

  it("no-ops the render when a stub already exists, but still registers", () => {
    const { fs, backlog } = seed();
    const rel = `${CONVENTIONAL}/exists/SKILL.md`;
    fs.write(
      `${ROOT}/bundles/a/${rel}`,
      "---\nname: exists\ndescription: pre-existing\n---\nkept\n",
    );
    const before = fs.read(`${ROOT}/bundles/a/${rel}`);

    runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      scaffoldSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR, { builtinTemplatesRoot: BUILTIN }),
      { id: "a", name: "exists" },
    );
    expect(fs.read(`${ROOT}/bundles/a/${rel}`)).toBe(before); // not clobbered
    expect(skillsOf(fs, "a")).toEqual([{ name: "exists", path: rel }]); // still registered
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// LIST (listSkillRefsSpec) — registry-based, read-only
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("listSkillRefsSpec", () => {
  it("projects the registered refs (names + paths) and changes nothing", () => {
    const aYml =
      "id: a\nversion: 0.1.0\nsummary: a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: one\n      path: payload/agent-skills/one/SKILL.md\n    - name: two\n      path: custom/two.md\n";
    const { fs } = seed(aYml);
    const before = fs.read(`${ROOT}/bundles/a/bundle.yml`);
    const { value } = runRead(
      fs,
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      listSkillRefsSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      {
        id: "a",
      },
    );
    expect(value).toEqual([
      { name: "one", path: "payload/agent-skills/one/SKILL.md" },
      { name: "two", path: "custom/two.md" },
    ]);
    expect(fs.read(`${ROOT}/bundles/a/bundle.yml`)).toBe(before); // read-only
  });

  it("returns [] for a bundle with no registered skills", () => {
    const { fs } = seed();
    const { value } = runRead(
      fs,
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      listSkillRefsSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      {
        id: "a",
      },
    );
    expect(value).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// REMOVE (removeSkillRefSpec) — deregister, leave the SKILL.md on disk
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("removeSkillRefSpec", () => {
  const A_WITH_REFS =
    "# bundle a comment\nid: a\nversion: 0.1.0\nsummary: a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: one\n      path: payload/agent-skills/one/SKILL.md\n    - name: two\n      path: payload/agent-skills/two/SKILL.md\n";

  it("deregisters by name, leaves the SKILL.md on disk, and reports its directory", () => {
    const { fs, backlog } = seed(A_WITH_REFS);
    fs.write(`${ROOT}/bundles/a/payload/agent-skills/one/SKILL.md`, skillMd("one"));
    const contentBefore = fs.read(`${ROOT}/bundles/a/payload/agent-skills/one/SKILL.md`);

    const result = runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      removeSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "one" },
    );

    expect(skillsOf(fs, "a")).toEqual([{ name: "two", path: "payload/agent-skills/two/SKILL.md" }]);
    expect(result.summary).toContain("left at payload/agent-skills/one/");
    // deregister-not-delete: the file is still on disk, unchanged.
    expect(fs.exists(`${ROOT}/bundles/a/payload/agent-skills/one/SKILL.md`)).toBe(true);
    expect(fs.read(`${ROOT}/bundles/a/payload/agent-skills/one/SKILL.md`)).toBe(contentBefore);
  });

  it("names the registered --path directory for a relocated skill's remove message", () => {
    const aYml =
      "id: a\nversion: 0.1.0\nsummary: a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: moved\n      path: custom/place/SKILL.md\n";
    const { fs, backlog } = seed(aYml);
    const result = runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      removeSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "moved" },
    );
    expect(result.summary).toContain("left at custom/place/");
  });

  it("rejects deregistering a name that is not registered (NotFound) and changes nothing", () => {
    const { fs, backlog } = seed(A_WITH_REFS);
    const before = fs.read(`${ROOT}/bundles/a/bundle.yml`);
    let thrown: unknown;
    try {
      runMutation(
        lifecycleDeps(fs, backlog),
        { deliverableRoot: ROOT, workspaceRoot: ROOT },
        removeSkillRefSpec(PAYLOAD_SKILLS_DESCRIPTOR),
        { id: "a", name: "ghost" },
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).category).toBe("not-found");
    expect(fs.read(`${ROOT}/bundles/a/bundle.yml`)).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// REMOVE ORPHAN (removeUnregisteredSkillStubSpec, TASK-103) — delete a present-but-unregistered stub; the
// companion of removeSkillRefSpec, and it NEVER deletes registered content (the guard preserves 76#1/#2).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("removeUnregisteredSkillStubSpec (TASK-103)", () => {
  it("AC#2 — deletes an on-disk stub directory that is NOT registered, leaves the registry empty, reports it", () => {
    const { fs, backlog } = seed(); // bundle a has no payload.skills (the old-bundle.yml shape)
    // A stray scaffold on disk (e.g. an old `bundle new` payload-skill stub) — present but never registered:
    fs.write(`${ROOT}/bundles/a/payload/agent-skills/stray/SKILL.md`, skillMd("stray"));
    expect(skillsOf(fs, "a")).toEqual([]);

    const result = runMutation(
      lifecycleDeps(fs, backlog),
      { deliverableRoot: ROOT, workspaceRoot: ROOT },
      removeUnregisteredSkillStubSpec(PAYLOAD_SKILLS_DESCRIPTOR),
      { id: "a", name: "stray" },
    );

    // the stray scaffold dir + its SKILL.md are gone; the registry is still empty (nothing was deregistered):
    expect(fs.exists(`${ROOT}/bundles/a/payload/agent-skills/stray`)).toBe(false);
    expect(fs.exists(`${ROOT}/bundles/a/payload/agent-skills/stray/SKILL.md`)).toBe(false);
    expect(skillsOf(fs, "a")).toEqual([]);
    expect(result.summary).toContain("removed unregistered payload skill stray");
    expect(result.summary).toContain("payload/agent-skills/stray/");
  });

  it("errors (NotFound) when the name is neither registered nor on disk, changing nothing", () => {
    const { fs, backlog } = seed();
    const before = fs.read(`${ROOT}/bundles/a/bundle.yml`);
    let thrown: unknown;
    try {
      runMutation(
        lifecycleDeps(fs, backlog),
        { deliverableRoot: ROOT, workspaceRoot: ROOT },
        removeUnregisteredSkillStubSpec(PAYLOAD_SKILLS_DESCRIPTOR),
        { id: "a", name: "ghost" },
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).category).toBe("not-found");
    expect(fs.read(`${ROOT}/bundles/a/bundle.yml`)).toBe(before);
  });

  it("GUARD — refuses (Constraint) to delete a REGISTERED skill's content (deregister-not-delete preserved)", () => {
    const aYml =
      "id: a\nversion: 0.1.0\nsummary: a\nconfirmation: safe\nrequires: {}\npayload:\n  skills:\n    - name: kept\n      path: payload/agent-skills/kept/SKILL.md\n";
    const { fs, backlog } = seed(aYml);
    fs.write(`${ROOT}/bundles/a/payload/agent-skills/kept/SKILL.md`, skillMd("kept"));
    let thrown: unknown;
    try {
      runMutation(
        lifecycleDeps(fs, backlog),
        { deliverableRoot: ROOT, workspaceRoot: ROOT },
        removeUnregisteredSkillStubSpec(PAYLOAD_SKILLS_DESCRIPTOR),
        { id: "a", name: "kept" },
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).category).toBe("constraint");
    // the guard fired in ② CHECK, BEFORE any delete — the registered skill's content is untouched:
    expect(fs.exists(`${ROOT}/bundles/a/payload/agent-skills/kept/SKILL.md`)).toBe(true);
  });
});
