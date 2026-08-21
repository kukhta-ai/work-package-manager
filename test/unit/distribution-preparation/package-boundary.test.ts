import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectDeclaredShipSet,
  evaluatePackageBoundary,
  normalizePackagePath,
} from "../../../distribution-preparation/package-boundary.js";

const sourceManifest = {
  name: "wpm",
  version: "0.1.0",
  license: "MIT",
  type: "module",
  private: true,
  engines: { node: ">=20" },
  files: ["agent-skills", "dist", "docs", "templates"],
  bin: { wpm: "./dist/cli.js", installer: "./dist/cli.js" },
  dependencies: { commander: "14.0.3" },
  peerDependencies: { "backlog.md": ">=1.0.0" },
  peerDependenciesMeta: { "backlog.md": { optional: false } },
};

const expectedPaths = [
  "README.md",
  "LICENSE",
  "package.json",
  "dist/cli.js",
  "agent-skills/installer-builder/SKILL.md",
  "docs/00-foundation-and-lineage.md",
  "templates/project/minimal/template.yml",
];

const entries = (paths: readonly string[]) =>
  paths.map((path) => ({ path, type: "file" as const }));

const tempRoots: string[] = [];

function tempPackage(): string {
  const root = mkdtempSync(join(tmpdir(), "wpm-package-boundary-unit-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("revision-scoped package-boundary contract", () => {
  it("accepts an exact set and reports revision, identity, version, bins, and sorted paths", () => {
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths: [...expectedPaths].reverse(),
      actualEntries: entries(expectedPaths),
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.status).toBe("accepted");
    expect(result.sourceRevision).toBe("abc123");
    expect(result.package).toEqual({
      name: "wpm",
      version: "0.1.0",
      executableTargets: {
        installer: "./dist/cli.js",
        wpm: "./dist/cli.js",
      },
    });
    expect(result.expectedPaths).toEqual([...expectedPaths].sort());
    expect(result.actualPaths).toEqual([...expectedPaths].sort());
    expect(result.violations).toEqual([]);
  });

  it("rejects a later declared asset omission without an artifact-specific rule", () => {
    const futureAsset = "extensions/arbitrary/new-contract.asset";
    const result = evaluatePackageBoundary({
      sourceRevision: "future-revision",
      expectedPaths: [...expectedPaths, futureAsset],
      actualEntries: entries(expectedPaths),
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.status).toBe("rejected");
    expect(result.violations).toContainEqual({
      kind: "missing-required-path",
      path: futureAsset,
      detail: "declared package path is absent from the packed archive",
    });
  });

  it("aggregates missing, invalid, prohibited, duplicate, link, metadata, and bin violations stably", () => {
    const actualEntries = [
      ...entries(
        expectedPaths.filter(
          (path) => path !== "LICENSE" && path !== "agent-skills/installer-builder/SKILL.md",
        ),
      ),
      { path: "src/leaked.ts", type: "file" as const },
      { path: "agent-skills/leaked/.npmrc", type: "file" as const },
      { path: "backlog/tasks/task.md", type: "file" as const },
      { path: "agent-skills/leaked/_bmad-output/plan.md", type: "file" as const },
      { path: "AGENTS.md", type: "file" as const },
      {
        path: "agent-skills/leaked/distribution-preparation/evidence.json",
        type: "file" as const,
      },
      { path: "extensions/unexpected.txt", type: "file" as const },
      { path: "../escape", type: "file" as const },
      { path: "README.md", type: "file" as const },
      { path: "docs/escape", type: "symlink" as const, linkTarget: "../../outside" },
      { path: "docs/windows-escape", type: "symlink" as const, linkTarget: "C:\\outside" },
    ];
    const packedManifest = {
      ...structuredClone(sourceManifest),
      name: "wrong-package",
      version: "9.9.9",
      bin: { wpm: "./dist/missing.js" },
    };

    const first = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths,
      actualEntries,
      sourceManifest,
      packedManifest,
    });
    const second = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths,
      actualEntries: [...actualEntries].reverse(),
      sourceManifest,
      packedManifest,
    });

    expect(first.status).toBe("rejected");
    expect(second.violations).toEqual(first.violations);
    expect(first.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "invalid-packed-path", path: "../escape" }),
        expect.objectContaining({ kind: "duplicate-packed-path", path: "README.md" }),
        expect.objectContaining({ kind: "missing-required-path", path: "LICENSE" }),
        expect.objectContaining({
          kind: "missing-required-path",
          path: "agent-skills/installer-builder/SKILL.md",
        }),
        expect.objectContaining({ kind: "prohibited-development", path: "src/leaked.ts" }),
        expect.objectContaining({
          kind: "prohibited-credential",
          path: "agent-skills/leaked/.npmrc",
        }),
        expect.objectContaining({
          kind: "prohibited-backlog",
          path: "backlog/tasks/task.md",
        }),
        expect.objectContaining({
          kind: "prohibited-planning",
          path: "agent-skills/leaked/_bmad-output/plan.md",
        }),
        expect.objectContaining({
          kind: "prohibited-workspace-authoring",
          path: "AGENTS.md",
        }),
        expect.objectContaining({
          kind: "prohibited-preparation",
          path: "agent-skills/leaked/distribution-preparation/evidence.json",
        }),
        expect.objectContaining({ kind: "unexpected-path", path: "extensions/unexpected.txt" }),
        expect.objectContaining({ kind: "escaping-link", path: "docs/escape" }),
        expect.objectContaining({ kind: "escaping-link", path: "docs/windows-escape" }),
        expect.objectContaining({ kind: "metadata-mismatch", path: "package.json#name" }),
        expect.objectContaining({ kind: "metadata-mismatch", path: "package.json#version" }),
        expect.objectContaining({ kind: "metadata-mismatch", path: "package.json#bin" }),
        expect.objectContaining({ kind: "missing-bin-target", path: "dist/missing.js" }),
      ]),
    );
  });

  it("does not classify prose about planning or credentials as prohibited content", () => {
    const documentation = "docs/security/credential-and-planning-guide.md";
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths: [...expectedPaths, documentation],
      actualEntries: entries([...expectedPaths, documentation]),
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.status).toBe("accepted");
  });

  it("orders same-kind violations by portable code-point order", () => {
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths,
      actualEntries: [...entries(expectedPaths), ...entries(["a-extra", "Z-extra"])],
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(
      result.violations.filter(({ kind }) => kind === "unexpected-path").map(({ path }) => path),
    ).toEqual(["Z-extra", "a-extra"]);
  });

  it("rejects portable and platform-specific absolute paths, traversal, and duplicates", () => {
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths: [...expectedPaths, "README.md", "/absolute", "../escape", "C:\\escape"],
      actualEntries: entries(expectedPaths),
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "duplicate-declared-path", path: "README.md" }),
        expect.objectContaining({ kind: "invalid-declared-path", path: "/absolute" }),
        expect.objectContaining({ kind: "invalid-declared-path", path: "../escape" }),
        expect.objectContaining({ kind: "invalid-declared-path", path: "C:\\escape" }),
      ]),
    );
  });

  it("rejects traversal aliases and drive-relative paths before normalization", () => {
    expect(normalizePackagePath("docs/../README.md")).toBeUndefined();
    expect(normalizePackagePath("docs\\..\\README.md")).toBeUndefined();
    expect(normalizePackagePath("C:README.md")).toBeUndefined();
    expect(normalizePackagePath("./docs/guide.md")).toBe("docs/guide.md");
  });

  it("accepts symbolic and hard links only when they resolve inside the package", () => {
    const linkedPaths = ["docs/current", "dist/cli-alias.js"];
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths: [...expectedPaths, ...linkedPaths],
      actualEntries: [
        ...entries(expectedPaths),
        { path: "docs/current", type: "symlink", linkTarget: "../README.md" },
        { path: "dist/cli-alias.js", type: "hardlink", linkTarget: "dist/cli.js" },
      ],
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.status).toBe("accepted");
    expect(result.violations).toEqual([]);
  });

  it("rejects absent and cyclic in-package link targets", () => {
    const links = ["docs/broken", "docs/cycle-a", "docs/cycle-b"];
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths: [...expectedPaths, ...links],
      actualEntries: [
        ...entries(expectedPaths),
        { path: "docs/broken", type: "symlink", linkTarget: "missing.md" },
        { path: "docs/cycle-a", type: "symlink", linkTarget: "cycle-b" },
        { path: "docs/cycle-b", type: "symlink", linkTarget: "cycle-a" },
      ],
      sourceManifest,
      packedManifest: structuredClone(sourceManifest),
    });

    expect(result.status).toBe("rejected");
    expect(result.violations).toEqual(
      expect.arrayContaining(
        links.map((path) => expect.objectContaining({ kind: "unresolvable-link", path })),
      ),
    );
  });

  it("rejects malformed executable declarations instead of silently dropping them", () => {
    const malformedManifest = { ...structuredClone(sourceManifest), bin: { wpm: 42 } };
    const result = evaluatePackageBoundary({
      sourceRevision: "abc123",
      expectedPaths,
      actualEntries: entries(expectedPaths),
      sourceManifest: malformedManifest,
      packedManifest: structuredClone(malformedManifest),
    });

    expect(result.status).toBe("rejected");
    expect(result.package.executableTargets).toEqual({});
    expect(result.violations).toContainEqual({
      kind: "invalid-bin-target",
      path: 'package.json#bin["wpm"]',
      detail: "declared executable target must be a non-empty string",
    });
  });

  it("expands literal declared roots and npm-required root assets into leaf paths", () => {
    const root = tempPackage();
    mkdirSync(join(root, "dist"), { recursive: true });
    mkdirSync(join(root, "assets", "nested"), { recursive: true });
    writeFileSync(join(root, "README.md"), "read me");
    writeFileSync(join(root, "LICENSE"), "license");
    writeFileSync(join(root, "dist", "cli.js"), "#!/usr/bin/env node\n");
    writeFileSync(join(root, "assets", "nested", "future.asset"), "future");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        license: "MIT",
        files: ["dist", "assets"],
        bin: { fixture: "./dist/cli.js" },
      }),
    );

    expect(collectDeclaredShipSet(root)).toMatchObject({
      expectedPaths: [
        "LICENSE",
        "README.md",
        "assets/nested/future.asset",
        "dist/cli.js",
        "package.json",
      ],
      declarationViolations: [],
    });
  });

  it("reports missing license and unsupported package globs as declaration violations", () => {
    const root = tempPackage();
    writeFileSync(join(root, "README.md"), "read me");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0", license: "MIT", files: ["dist/**"] }),
    );

    expect(collectDeclaredShipSet(root).declarationViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "missing-required-path", path: "LICENSE" }),
        expect.objectContaining({ kind: "invalid-declared-path", path: "dist/**" }),
      ]),
    );
  });
});
