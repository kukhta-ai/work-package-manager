import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeBacklog } from "../../src/adapters/fake-backlog.js";
import { FixedClock } from "../../src/adapters/fixed-clock.js";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { ProcessEnvironment } from "../../src/adapters/process-env.js";
import { type CliDeps, run } from "../../src/cli.js";
import type { CliIo, OutputSink } from "../../src/util/exit.js";
import { withTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges (integration) test for the read-only `project show` / `project root` / `project validate`
 * family (tasks 37/49/48): drives `run()` against a REAL {@link NodeFileSystem} in a real tmpdir with a project
 * written to disk. Proves the framework path — DI → resolveContext → runRead → format → exit — reads real files
 * and is side-effect-free end-to-end. The backlog is the in-memory fake (reads never touch it).
 */

function collector(): OutputSink & { text: string } {
  return {
    text: "",
    write(chunk: string) {
      this.text += chunk;
    },
  };
}
function io(): CliIo & { out: ReturnType<typeof collector>; err: ReturnType<typeof collector> } {
  return { out: collector(), err: collector(), debug: false };
}

/** Write a coherent fixture project (manifest + one enabled bundle's bundle.yml) into `dir` on the real disk. */
function seedOnDisk(dir: string): void {
  writeFileSync(
    join(dir, "manifest.yml"),
    [
      "project:",
      "  name: demo",
      "  version: 2.0.0",
      "  description: a real-disk demo",
      "targets:",
      "  - claude-code",
      "bundles:",
      "  - web",
      "",
    ].join("\n"),
  );
  mkdirSync(join(dir, "bundles", "web"), { recursive: true });
  writeFileSync(
    join(dir, "bundles", "web", "bundle.yml"),
    "id: web\nversion: 0.5.0\nsummary: the web bundle\nconfirmation: safe\nrequires: {}\n",
  );
  mkdirSync(join(dir, "installer-skills"), { recursive: true });
}

function realDeps(): CliDeps {
  return {
    fs: new NodeFileSystem(),
    backlog: new FakeBacklog(),
    clock: new FixedClock("2026-01-01T00:00:00.000Z"),
    env: new ProcessEnvironment(),
    builtinTemplatesRoot: join(import.meta.dirname ?? ".", "..", "..", "templates"),
  };
}

describe("cli `project` reads over a real filesystem (tasks 37/49/48)", () => {
  it("show prints the orientation (incl bundle version) and --json parses; root prints the bare path", async () => {
    await withTempDir(async (dir) => {
      seedOnDisk(dir);

      // show (37): the bundle's version read off its bundle.yml on real disk.
      const showIo = io();
      expect(await run(["project", "show", "-C", dir], realDeps(), showIo)).toBe(0);
      expect(showIo.out.text).toContain("web 0.5.0");
      expect(showIo.out.text).toContain("a real-disk demo");

      // show --json (37#2): valid JSON with the bundle version.
      const jsonIo = io();
      expect(await run(["project", "show", "--json", "-C", dir], realDeps(), jsonIo)).toBe(0);
      const parsed = JSON.parse(jsonIo.out.text) as {
        bundles: { id: string; version: string }[];
        root: string;
      };
      expect(parsed.bundles).toContainEqual({
        id: "web",
        version: "0.5.0",
        summary: "the web bundle",
      });

      // root (49): the bare resolved path on a single line.
      const rootIo = io();
      expect(await run(["project", "root", "-C", dir], realDeps(), rootIo)).toBe(0);
      expect(rootIo.out.text).toBe(`${dir}\n`);
    });
  });

  it("validate passes a coherent project (exit 0) and reports + exits 1 on an orphan dir, changing nothing", async () => {
    await withTempDir(async (dir) => {
      seedOnDisk(dir);

      // coherent → exit 0.
      const okIo = io();
      expect(await run(["project", "validate", "-C", dir], realDeps(), okIo)).toBe(0);
      expect(okIo.out.text.toLowerCase()).toContain("coherent");

      // introduce an orphan bundles/stray dir → a finding + exit 1, and the manifest is untouched.
      mkdirSync(join(dir, "bundles", "stray"), { recursive: true });
      writeFileSync(join(dir, "bundles", "stray", "x.txt"), "orphan");
      const before = readFileSync(join(dir, "manifest.yml"), "utf8");

      const badIo = io();
      expect(await run(["project", "validate", "-C", dir], realDeps(), badIo)).toBe(1);
      expect(badIo.out.text).toContain('bundle directory "stray"');
      expect(readFileSync(join(dir, "manifest.yml"), "utf8")).toBe(before); // no side effects
    });
  });
});
