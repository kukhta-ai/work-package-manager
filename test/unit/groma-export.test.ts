import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  exportPrivateGroma,
  inspectCapturedSources,
  privateExportDestination,
} from "../../scripts/groma-export.mjs";

const owned = mkdtempSync(join(tmpdir(), "wpm-private-map-"));
const root = join(owned, "project");
mkdirSync(root);
const git = (...args: string[]) =>
  execFileSync("git", ["-c", `core.hooksPath=${join(owned, "no-hooks")}`, ...args], {
    cwd: root,
    encoding: "utf8",
  }).trim();
git("init", "--quiet", "--template=");
writeFileSync(join(root, "source.txt"), "first source");
git("add", "--all");
git(
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "commit",
  "--quiet",
  "-m",
  "before",
);
const before = git("rev-parse", "HEAD");
writeFileSync(join(root, "source.txt"), "second source");
git("add", "--all");
git(
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "commit",
  "--quiet",
  "-m",
  "after",
);
const after = git("rev-parse", "HEAD");
afterAll(() => rmSync(owned, { recursive: true, force: true }));

const captured = () => ({
  schemaVersion: 1,
  snapshots: [
    {
      revision: before,
      files: [{ path: "node_modules/fixture/removed.ts", content: "historical-only-secret" }],
    },
    { revision: after, files: [{ path: "src/current.ts", content: "clean current source" }] },
  ],
});

function exporter(manifest: unknown) {
  return (args: readonly string[]) => {
    expect(args).toContain("--ack-source-export");
    const site = args[1];
    const inventory = args[args.indexOf("--source-manifest") + 1];
    if (!site || !inventory) throw new Error("missing export paths");
    mkdirSync(site);
    writeFileSync(join(site, "index.html"), "private map");
    writeFileSync(inventory, JSON.stringify(manifest));
    return "exported";
  };
}

describe("confidential architecture exports", () => {
  it("requires caller acknowledgement before capturing source or creating staging", () => {
    const output = join(owned, "unacknowledged");
    let invoked = false;
    expect(() =>
      exportPrivateGroma(root, { output, revision: after }, () => {
        invoked = true;
        return "";
      }),
    ).toThrow("ack-source-export");
    expect(invoked).toBe(false);
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(owned).some((name) => name.startsWith(".wpm-groma-private-"))).toBe(false);
  });

  it("inspects both decoded revisions and rendered output before final delivery", () => {
    const output = join(owned, "accepted");
    let inspected = false;
    exportPrivateGroma(
      root,
      { output, revision: after, from: before, ackSourceExport: true },
      exporter(captured()),
      {
        scan(directory) {
          expect(existsSync(output)).toBe(false);
          expect(readFileSync(join(directory, "captured", before, "0.txt"), "utf8")).toBe(
            "historical-only-secret",
          );
          expect(readFileSync(join(directory, "captured", after, "0.txt"), "utf8")).toBe(
            "clean current source",
          );
          expect(readFileSync(join(directory, "site/index.html"), "utf8")).toBe("private map");
          inspected = true;
        },
      },
    );
    expect(inspected).toBe(true);
    if (process.platform !== "win32") expect(statSync(output).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(output, "index.html"), "utf8")).toBe("private map");
    expect(readdirSync(owned).some((name) => name.startsWith(".wpm-groma-private-"))).toBe(false);
  });

  it("does not deliver when a detector rejects a secret only in the old revision", () => {
    const output = join(owned, "rejected-secret");
    expect(() =>
      exportPrivateGroma(
        root,
        { output, revision: after, from: before, ackSourceExport: true },
        exporter(captured()),
        {
          scan(directory) {
            if (
              readFileSync(join(directory, "captured", before, "0.txt"), "utf8").includes(
                "historical-only-secret",
              )
            )
              throw new Error("secret detected");
          },
        },
      ),
    ).toThrow("secret detected");
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(owned).some((name) => name.startsWith(".wpm-groma-private-"))).toBe(false);
    expect(readFileSync(join(root, "source.txt"), "utf8")).toBe("second source");
  });

  it("preserves existing user data and rejects checkout destinations and aliases", () => {
    const output = join(owned, "foreign");
    mkdirSync(output);
    writeFileSync(join(output, "user.txt"), "preserve");
    expect(() => privateExportDestination(root, output)).toThrow("new private");
    expect(() => privateExportDestination(root, join(root, "site"))).toThrow("outside");
    const alias = join(owned, "alias");
    symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    expect(() => privateExportDestination(root, join(alias, "site"))).toThrow("aliases");
    expect(readFileSync(join(output, "user.txt"), "utf8")).toBe("preserve");
  });

  it("rejects missing revision coverage, extra authority fields and unsafe scanner paths", () => {
    expect(() =>
      inspectCapturedSources({ schemaVersion: 1, snapshots: captured().snapshots.slice(1) }, [
        before,
        after,
      ]),
    ).toThrow("cover");
    expect(() =>
      inspectCapturedSources({ ...captured(), session: "unexpected" }, [before, after]),
    ).toThrow("manifest");
    for (const path of [
      "../outside",
      "/outside",
      "C:/outside",
      "src/../outside",
      "src/NUL.txt",
      "src/file:stream",
      "src\\outside",
    ]) {
      expect(() =>
        inspectCapturedSources(
          {
            schemaVersion: 1,
            snapshots: [{ revision: after, files: [{ path, content: "content" }] }],
          },
          [after],
        ),
      ).toThrow("unsafe");
    }
    expect(() =>
      inspectCapturedSources(
        {
          schemaVersion: 1,
          snapshots: [
            {
              revision: after,
              files: [
                { path: "src/A.ts", content: "first" },
                { path: "src/a.ts", content: "other" },
              ],
            },
          ],
        },
        [after],
      ),
    ).toThrow("collide");
  });
});
