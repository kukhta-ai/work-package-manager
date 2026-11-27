import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  createReleaseFiles,
  publishRelease,
  type ReleaseFormat,
  readReleaseArtifact,
} from "../../src/vnext/adapters/release-artifact.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { registerReleaseCommands } from "../../src/vnext/release-cli.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

function command(root: string) {
  let output = "";
  const program = new Command("wpm").exitOverride().configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  const vnext = program
    .command("vnext")
    .option("--root <directory>", "path anchor", root)
    .option("--package <name>", "selected package")
    .option("--package-version <version>", "selected package version")
    .option("--dry-run", "preview effects", false);
  registerReleaseCommands(vnext, {
    write: (text) => {
      output += text;
    },
  });
  return {
    program,
    invoke: (...args: string[]): Record<string, unknown> => {
      program.parse(["vnext", ...args], { from: "user" });
      return JSON.parse(output) as Record<string, unknown>;
    },
  };
}
function snapshot(root: string): Record<string, string> {
  const entries: [string, string][] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        entries.push([`${path}/`, "directory"]);
        visit(join(directory, entry.name), `${path}/`);
      } else entries.push([path, readFileSync(join(directory, entry.name)).toString("base64")]);
    }
  };
  visit(root, "");
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
function saved(root: string, format: ReleaseFormat): string {
  const author = join(root, "author");
  const workspace = new VnextWorkspace(author, new FakeBacklog());
  workspace.init("release-cli");
  workspace.addOperation("brief", "Write a brief", {
    prerequisites: [],
    acceptanceCriteria: ["A readable brief exists"],
    dryRun: false,
  });
  const files = createReleaseFiles(workspace.captureForGraph().files);
  const path = format === "directory" ? "saved" : `saved.${format}`;
  publishRelease(join(root, path), files, format);
  rmSync(author, { recursive: true });
  return path;
}

describe("release CLI against saved artifacts and native source", () => {
  it.each([
    "tgz",
    "zip",
    "directory",
  ] as const)("views and verifies saved %s without an authoring workspace", async (format) =>
    withTempDir((root) => {
      const artifact = saved(root, format);
      const before = snapshot(root);
      const view = command(root).invoke(
        "release",
        "view",
        artifact,
        "--files",
        "--agent-support",
        "--target",
        "codex",
        "--opening",
        "session",
      );
      expect(JSON.stringify(view)).toContain("release-cli");
      expect(JSON.stringify(view)).toContain("brief");
      expect(command(root).invoke("release", "verify", artifact)).toBeTypeOf("object");
      const inspected = readReleaseArtifact(join(root, artifact));
      const digest = inspected.artifactDigest ?? inspected.contentDigest;
      expect(
        command(root).invoke(
          "release",
          "verify",
          artifact,
          "--expected-digest",
          `sha256:${digest}`,
        ),
      ).toBeTypeOf("object");
      expect(() =>
        command(root).invoke("release", "verify", artifact, "--expected-digest", "0".repeat(64)),
      ).toThrow(/digest|identity/i);
      expect(snapshot(root)).toEqual(before);
    }));

  it("builds three equivalent representations while a dry run leaves native source unchanged", async () =>
    withTempDir((root) => {
      const workspace = new VnextWorkspace(root);
      workspace.init("native-release");
      workspace.addOperation("brief", "Write a brief", {
        prerequisites: [],
        acceptanceCriteria: ["A readable brief exists"],
        dryRun: false,
      });
      const before = snapshot(root);
      command(root).invoke(
        "--dry-run",
        "release",
        "build",
        "--format",
        "directory",
        "--out",
        "preview",
      );
      expect(snapshot(root)).toEqual(before);
      expect(existsSync(join(root, "preview"))).toBe(false);
      const digests: string[] = [];
      for (const format of ["tgz", "zip", "directory"] as const) {
        const out = `artifacts/native.${format}`;
        command(root).invoke("release", "build", "--format", format, "--out", out, "--files");
        expect(existsSync(join(root, out))).toBe(true);
        digests.push(readReleaseArtifact(join(root, out)).contentDigest);
      }
      expect(new Set(digests).size).toBe(1);
    }));

  it("prepares and imports external review evidence without changing or executing a release", async () =>
    withTempDir((root) => {
      const artifact = saved(root, "zip");
      const original = readFileSync(join(root, artifact));
      const before = snapshot(root);
      expect(
        command(root).invoke("--dry-run", "release", "review", artifact, "--out", "preview"),
      ).toMatchObject({ status: "awaiting-review" });
      expect(snapshot(root)).toEqual(before);
      expect(command(root).invoke("release", "review", artifact, "--out", "request")).toMatchObject(
        { status: "awaiting-review" },
      );
      const report = JSON.parse(
        readFileSync(join(root, "request/report-template.json"), "utf8"),
      ) as Record<string, unknown>;
      report.reviewer = { name: "External reviewer", identity: "test-session" };
      report.completedAt = "2026-11-27T20:00:00.000Z";
      report.findings = [
        {
          severity: "high",
          path: "AGENTS.md",
          message: "Requires attention",
          evidence: "Declared instruction wording",
        },
      ];
      report.unknowns = ["Runtime was not executed"];
      report.recommendations = ["Inspect commands"];
      writeFileSync(join(root, "external-report.json"), JSON.stringify(report));
      const accepted = command(root).invoke(
        "release",
        "review",
        artifact,
        "--report",
        "external-report.json",
        "--out",
        "accepted",
      );
      expect(accepted).toMatchObject({ status: "reviewed" });
      expect(JSON.stringify(accepted)).toContain("Requires attention");
      expect(readFileSync(join(root, artifact))).toEqual(original);
      expect(JSON.parse(readFileSync(join(root, "accepted/report.json"), "utf8"))).toEqual(report);
    }));

  it.each([
    ["release", "build", "--format", "rar"],
    ["release", "build", "first", "second"],
    ["--package", "one", "release", "build", "two"],
    ["release", "view", "missing.zip", "--target", "unknown"],
    ["release", "view", "missing.zip", "--opening", "automatic"],
    ["release", "verify", "missing.zip", "--expected-digest", "invalid"],
    ["release", "review", "missing.zip"],
    ["release", "review", "missing.zip", "--report", "", "--out", "request"],
  ])("rejects invalid invocation before effects: %j", async (...args) =>
    withTempDir((root) => {
      writeFileSync(join(root, "keep.txt"), "Foreign bytes");
      const before = snapshot(root);
      expect(() => command(root).invoke(...args)).toThrow();
      expect(snapshot(root)).toEqual(before);
    }));

  it("requires no native Backlog or source for missing-artifact diagnostics", async () =>
    withTempDir((root) => {
      mkdirSync(join(root, "ordinary-directory"));
      expect(() => command(root).invoke("release", "view", "ordinary-directory")).toThrow();
      expect(readdirSync(root)).toEqual(["ordinary-directory"]);
    }));

  it.each([
    "build",
    "view",
    "verify",
    "review",
  ])("documents a worked example for release %s", (name) => {
    const { program } = command(".");
    const vnext = program.commands.find((item) => item.name() === "vnext");
    const release = vnext?.commands.find((item) => item.name() === "release");
    const leaf = release?.commands.find((item) => item.name() === name);
    expect(leaf).toBeDefined();
    let help = "";
    leaf?.configureOutput({
      writeOut: (text) => {
        help += text;
      },
    });
    leaf?.outputHelp();
    expect(help).toContain("Example:");
    expect(help).toContain(`wpm vnext`);
  });
});
