import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../helpers/tmpdir.js";

const builtCli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const describeIfBuilt = existsSync(builtCli) ? describe : describe.skip;

function snapshot(root: string): string {
  const entries: string[] = [];
  const walk = (directory: string, relative = ""): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const childRelative = relative === "" ? name : `${relative}/${name}`;
      if (statSync(path).isDirectory()) walk(path, childRelative);
      else entries.push(`${childRelative}=${readFileSync(path, "utf8")}`);
    }
  };
  walk(root);
  return entries.join("\n");
}

function seedWorkspace(root: string): void {
  const wip = join(root, "wip");
  mkdirSync(join(wip, "templates", "project", "valid-tasks"), { recursive: true });
  mkdirSync(join(wip, "templates", "bundle", "valid-bundle-tasks"), { recursive: true });
  mkdirSync(join(wip, "templates", "bundle", "invalid-tasks"), { recursive: true });
  writeFileSync(
    join(wip, "manifest.yml"),
    "project:\n  name: demo\n  version: 1.0.0\ntargets: []\nbundles: []\n",
  );
  writeFileSync(
    join(wip, "templates", "project", "valid-tasks", "template.yml"),
    [
      "name: valid-tasks",
      "scope: project",
      'revision: "1"',
      "authoring-tasks:",
      "  - key: write-docs",
      '    title: "Write docs for {{wpm.project.name}}"',
      "    acceptance-criteria:",
      '      - "The docs for {{wpm.project.name}} are observable"',
      "    depends-on: [wpm:project:set-metadata]",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(wip, "templates", "bundle", "valid-bundle-tasks", "template.yml"),
    [
      "name: valid-bundle-tasks",
      "scope: bundle",
      'revision: "2"',
      "authoring-tasks:",
      "  - key: write-docs",
      '    title: "Write docs for {{wpm.bundle.id}} at {{wpm.bundle.version}}"',
      "    acceptance-criteria:",
      '      - "The bundle docs for {{wpm.project.name}} are observable"',
      "    depends-on: [wpm:bundle:plan]",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(wip, "templates", "bundle", "invalid-tasks", "template.yml"),
    [
      "name: invalid-tasks",
      "scope: bundle",
      'revision: "1"',
      "authoring-tasks:",
      "  - key: cycle-a",
      '    title: "Same {{wpm.bundle.id}}"',
      '    acceptance-criteria: ["A is observable"]',
      "    depends-on: [self:cycle-b, task-raw-id]",
      "    hook: execute-me",
      "  - key: cycle-b",
      '    title: "Same <bundle-id>"',
      '    acceptance-criteria: ["B uses {{wpm.unknown}}"]',
      "    depends-on: [self:cycle-a]",
      "  - key: cycle-a",
      '    title: "Duplicate cycle key"',
      '    acceptance-criteria: ["The duplicate is observable"]',
      "",
    ].join("\n"),
  );
}

describeIfBuilt("built CLI template authoring-task inspection over a real filesystem", () => {
  it("shows valid/none/invalid contributions and leaves the entire workspace byte-identical", async () => {
    await withTempDir(async (temporaryRoot) => {
      const workspace = join(temporaryRoot, "workspace");
      mkdirSync(workspace, { recursive: true });
      seedWorkspace(workspace);
      const before = snapshot(temporaryRoot);

      const valid = spawnSync(
        process.execPath,
        [builtCli, "-C", workspace, "template", "show", "valid-tasks", "--scope", "project"],
        { cwd: temporaryRoot, encoding: "utf8" },
      );
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain("Additional authoring tasks: valid");
      expect(valid.stdout).toContain("Write docs for <project-name>");
      expect(valid.stdout).toContain("wpm:project:set-metadata -> wpm:project:set-metadata");

      const validBundle = spawnSync(
        process.execPath,
        [builtCli, "-C", workspace, "template", "show", "valid-bundle-tasks", "--scope", "bundle"],
        { cwd: temporaryRoot, encoding: "utf8" },
      );
      expect(validBundle.status).toBe(0);
      expect(validBundle.stdout).toContain("Materialisation: bundle-creation-or-enablement");
      expect(validBundle.stdout).toContain(
        "template:project-local:bundle:valid-bundle-tasks@2:write-docs",
      );
      expect(validBundle.stdout).toContain("Write docs for <bundle-id> at <bundle-version>");
      expect(validBundle.stdout).toContain("wpm:bundle:plan -> wpm:bundle:plan");
      expect(validBundle.stdout).not.toContain(
        "template:project-local:project:valid-tasks@1:write-docs",
      );

      const none = spawnSync(
        process.execPath,
        [builtCli, "template", "show", "minimal", "--scope", "project"],
        { cwd: temporaryRoot, encoding: "utf8" },
      );
      expect(none.status).toBe(0);
      expect(none.stdout).toContain("Additional authoring tasks: none");

      const invalid = spawnSync(
        process.execPath,
        [builtCli, "-C", workspace, "template", "show", "invalid-tasks", "--scope", "bundle"],
        { cwd: temporaryRoot, encoding: "utf8" },
      );
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toContain("Additional authoring tasks: invalid");
      for (const code of [
        "cyclic-dependency",
        "duplicate-key",
        "rendered-title-collision",
        "unresolved-dependency",
        "unsupported-context",
        "unsupported-field",
      ]) {
        expect(invalid.stdout).toContain(code);
      }
      expect(invalid.stderr).toContain("template authoring-task contribution is invalid");
      expect(snapshot(temporaryRoot)).toBe(before);
      expect(existsSync(join(workspace, ".authoring-backlog"))).toBe(false);
      expect(existsSync(join(workspace, "builds"))).toBe(false);
    });
  });
});
