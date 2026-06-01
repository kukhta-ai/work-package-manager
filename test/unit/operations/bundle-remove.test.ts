import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../../src/adapters/fake-backlog.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  isRemovableBundle,
  removeBundleSpec,
  titleNamesBundle,
} from "../../../src/core/operations/bundle-remove.js";
import { runMutation } from "../../../src/core/operations/lifecycle.js";
import type { DesiredArtefacts } from "../../../src/core/services/derived-artefacts.js";

/**
 * Unit tests for the `bundle remove` core operation (task-53) — the pure `removeBundleSpec` over the in-memory
 * ports, plus the prefix-collision-safe `titleNamesBundle` matcher and the `isRemovableBundle` predicate. These
 * are the focused proofs the higher-level CLI AC tests + the real-binary E2E rely on; `titleNamesBundle` in
 * particular gets a dedicated table over the doc-11 §3 title shapes for `web` vs `web-extra` (the prefix hazard
 * the Q review caught for the advisor task).
 */

const PROJ = "/proj";
const AUTHORING = `${PROJ}/.authoring-backlog`;

/** A no-op artefact deriver — these tests assert the teardown effects, not the front-door re-render. */
function noDerive(): DesiredArtefacts {
  return { files: [], aliasPlan: { aliases: [], unknownTargets: [] } };
}

/** Seed a project at /proj with `enabled` bundles (each gets a bundle.yml) + the FakeBacklog at .authoring-backlog. */
function seed(enabled: readonly string[]): { fs: MemoryFileSystem; backlog: FakeBacklog } {
  const fs = new MemoryFileSystem();
  const backlog = new FakeBacklog();
  const bundleLines =
    enabled.length > 0
      ? `bundles:\n${enabled.map((b) => `  - ${b}`).join("\n")}\n`
      : "bundles: []\n";
  fs.write(
    `${PROJ}/manifest.yml`,
    `project:\n  name: demo\n  version: 1.0.0\ntargets:\n  - claude-code\n${bundleLines}`,
  );
  for (const id of enabled) {
    fs.write(
      `${PROJ}/bundles/${id}/bundle.yml`,
      `id: ${id}\nversion: 0.1.0\nsummary: ${id} bundle\nconfirmation: safe\nrequires: {}\n`,
    );
  }
  fs.makeDirectories(`${PROJ}/installer-skills`);
  backlog.init(AUTHORING, { taskPrefix: "authoring" });
  return { fs, backlog };
}

function lifecycleDeps(fs: MemoryFileSystem, backlog: FakeBacklog) {
  return { fs, backlog, deriveArtefacts: noDerive };
}

describe("titleNamesBundle — prefix-collision-safe whole-token matching (AC53#2)", () => {
  // The doc-11 §3 title shapes that name a bundle, instantiated for `web`.
  const webTitles = [
    "Plan bundle web",
    "Fill install-backlog for web",
    "Author payload for web",
    "Write advisor content for web",
    "Write payload skill handoff for web",
    "Review state-tasks for web at 0.2.0",
    "Consider migration tasks for web 0.1.0→0.2.0",
    "Review version constraint on web at 0.2.0",
    "Adapt web's install-backlog and payload to use core",
    "Verify web no longer references core",
    "Verify web's install-backlog works on claude-code",
  ];

  it("matches every doc-11 title shape that names `web`", () => {
    for (const title of webTitles) {
      expect(titleNamesBundle(title, "web")).toBe(true);
    }
  });

  it("does NOT match the SAME-shaped titles that name `web-extra` (the prefix hazard)", () => {
    const webExtraTitles = webTitles.map((t) => t.replace(/\bweb\b/g, "web-extra"));
    for (const title of webExtraTitles) {
      expect(titleNamesBundle(title, "web")).toBe(false);
    }
  });

  it("`web-extra` correctly matches its OWN titles (whole-token, hyphen included)", () => {
    expect(titleNamesBundle("Plan bundle web-extra", "web-extra")).toBe(true);
    expect(titleNamesBundle("Adapt web-extra's payload to use core", "web-extra")).toBe(true);
    // and `web-extra` must NOT match a `web` title (the reverse direction):
    expect(titleNamesBundle("Plan bundle web", "web-extra")).toBe(false);
  });

  it("does not match a substring inside an unrelated word", () => {
    expect(titleNamesBundle("Review the webhook integration", "web")).toBe(false); // `web` ⊂ `webhook`
    expect(titleNamesBundle("Plan bundle cobweb", "web")).toBe(false); // `web` at the end of `cobweb`
  });
});

describe("isRemovableBundle (AC53#2/#5)", () => {
  it("is removable when enabled in the manifest", () => {
    expect(isRemovableBundle({ manifest: { bundles: ["web"] } }, "web", false)).toBe(true);
  });
  it("is removable when present on disk even if NOT enabled (a disabled bundle dir)", () => {
    expect(isRemovableBundle({ manifest: { bundles: [] } }, "web", true)).toBe(true);
  });
  it("is NOT removable when neither enabled nor on disk", () => {
    expect(isRemovableBundle({ manifest: { bundles: ["other"] } }, "web", false)).toBe(false);
  });
});

describe("removeBundleSpec — the teardown (AC53#2/#3)", () => {
  it("drops the id from the manifest, deletes the dir + advisor, archives the bundle's tasks", () => {
    const { fs, backlog } = seed(["web"]);
    // an advisor stub + a couple of authoring tasks naming `web`:
    fs.write(
      `${PROJ}/installer-skills/web-advisor/SKILL.md`,
      "---\nname: web-advisor\n---\nbody\n",
    );
    backlog.createTask(AUTHORING, { title: "Plan bundle web" });
    backlog.createTask(AUTHORING, { title: "Write advisor content for web" });

    const result = runMutation(lifecycleDeps(fs, backlog), { root: PROJ }, removeBundleSpec(), {
      id: "web",
    });

    // manifest no longer lists web:
    expect(fs.read(`${PROJ}/manifest.yml`)).not.toMatch(/-\s*web\b/);
    // the bundle dir is gone:
    expect(fs.exists(`${PROJ}/bundles/web`)).toBe(false);
    // the advisor stub dir is gone:
    expect(fs.exists(`${PROJ}/installer-skills/web-advisor`)).toBe(false);
    // both authoring tasks are archived (excluded from the active list):
    expect(backlog.listTasks(AUTHORING)).toHaveLength(0);
    // the summary reports what was removed:
    expect(result.summary).toContain("removed bundle web");
    expect(result.summary).toContain("+ advisor");
    expect(result.summary).toContain("archived 2 authoring task(s)");
  });

  it("PREFIX SAFETY — removing `web` archives ONLY web's tasks, never web-extra's", () => {
    const { fs, backlog } = seed(["web", "web-extra"]);
    backlog.createTask(AUTHORING, { title: "Plan bundle web" });
    backlog.createTask(AUTHORING, { title: "Author payload for web" });
    backlog.createTask(AUTHORING, { title: "Plan bundle web-extra" });
    backlog.createTask(AUTHORING, { title: "Author payload for web-extra" });

    runMutation(lifecycleDeps(fs, backlog), { root: PROJ }, removeBundleSpec(), { id: "web" });

    const remaining = backlog.listTasks(AUTHORING).map((t) => t.title);
    expect(remaining).toEqual(["Plan bundle web-extra", "Author payload for web-extra"]);
    // web-extra itself is untouched on disk + in the manifest:
    expect(fs.exists(`${PROJ}/bundles/web-extra`)).toBe(true);
    expect(fs.read(`${PROJ}/manifest.yml`)).toMatch(/web-extra/);
  });

  it("removes a DISABLED-but-present bundle (no manifest entry) — deletes the dir, summary omits advisor", () => {
    const { fs, backlog } = seed([]); // manifest lists nothing
    // a present-but-disabled bundle dir:
    fs.write(
      `${PROJ}/bundles/draft/bundle.yml`,
      "id: draft\nversion: 0.1.0\nsummary: draft bundle\nconfirmation: safe\nrequires: {}\n",
    );

    const result = runMutation(lifecycleDeps(fs, backlog), { root: PROJ }, removeBundleSpec(), {
      id: "draft",
    });

    expect(fs.exists(`${PROJ}/bundles/draft`)).toBe(false);
    expect(result.summary).toContain("removed bundle draft");
    expect(result.summary).not.toContain("+ advisor"); // no advisor existed
    expect(result.summary).not.toContain("archived"); // no tasks named draft
  });

  it("does not archive a task naming a DIFFERENT bundle", () => {
    const { fs, backlog } = seed(["web"]);
    backlog.createTask(AUTHORING, { title: "Plan bundle other" });
    runMutation(lifecycleDeps(fs, backlog), { root: PROJ }, removeBundleSpec(), { id: "web" });
    expect(backlog.listTasks(AUTHORING).map((t) => t.title)).toEqual(["Plan bundle other"]);
  });
});
