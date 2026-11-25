import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NodeFileSystem } from "../../src/adapters/node-fs.js";
import { ApmBackend, preparedApmSetup } from "../../src/vnext/adapters/apm.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

type ApmCommand = NonNullable<ConstructorParameters<typeof ApmBackend>[4]>;
interface Call {
  args: string[];
  cwd: string;
  env: Record<string, string>;
}
interface Cached {
  receipt: Record<string, unknown>;
  files: { path: string; bytes: string }[];
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Byte-and-directory inventory for no-effects assertions; excludes no files or directories. */
function snapshot(root: string): Record<string, string> {
  const entries: [string, string][] = [];
  const visit = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        entries.push([`${path}/`, "directory"]);
        visit(join(directory, entry.name), `${path}/`);
      } else entries.push([path, readFileSync(join(directory, entry.name)).toString("base64")]);
    }
  };
  if (existsSync(root)) visit(root, "");
  return Object.fromEntries(entries);
}
function fixture(root: string, locator = "worker-setup/composed") {
  const source = join(root, locator);
  mkdirSync(join(source, ".apm/instructions"), { recursive: true });
  writeFileSync(
    join(source, "apm.yml"),
    "name: composed\nversion: 1.0.0\ndependencies:\n  apm: []\n",
  );
  writeFileSync(
    join(source, ".apm/instructions/brief.instructions.md"),
    "---\napplyTo: '**'\n---\nRead the selected operation.\n",
  );
  const executable = join(root, "approved-apm");
  writeFileSync(executable, "approved APM fixture executable\n");
  const tool = { executable, sha256: digest(readFileSync(executable)) };
  const calls: Call[] = [];
  const native: ApmCommand = (_executable, args, options) => {
    calls.push({ args: [...args], cwd: options.cwd, env: { ...options.env } });
    expect(options.env.APM_NO_SCRIPTS).toBe("1");
    if (args[0] === "--version") return { stdout: "APM CLI, version 0.39.0\n", stderr: "" };
    if (args[0] === "lock")
      writeFileSync(
        join(options.cwd, "apm.lock.yaml"),
        "lockfile_version: '4'\napm_version: 0.39.0\ndependencies: []\n",
      );
    else if (args[0] === "install" || args[0] === "compile") {
      const target = args[args.indexOf("--root") + 1];
      if (!target) throw new Error("missing owned native target");
      if (args[0] === "install") {
        mkdirSync(join(target, ".agents/skills/brief"), { recursive: true });
        writeFileSync(
          join(target, ".agents/skills/brief/SKILL.md"),
          "# Explain the selected work\n",
        );
      } else
        writeFileSync(
          join(target, "AGENTS.md"),
          "# Prepared instructions\nRead the selected operation.\n",
        );
    } else throw new Error("unexpected native operation");
    return { stdout: "qualified contract fixture\n", stderr: "" };
  };
  const backend = new ApmBackend(root, "composed", locator, tool, native);
  const state = join(root, ".wpm-apm/composed");
  const target = join(state, "targets/codex");
  const prepare = () => {
    backend.lock();
    backend.install("codex");
    backend.compile("codex");
  };
  const cache = () => {
    const files = readdirSync(join(state, "prepared-cache"));
    expect(files).toHaveLength(1);
    const name = files[0];
    if (!name) throw new Error("missing prepared fixture cache");
    return join(state, "prepared-cache", name);
  };
  return { source, tool, calls, native, backend, state, target, prepare, cache };
}

describe("APM worker resolution, cached replay and source ownership", () => {
  it("preserves unchanged resolution without a second native command", async () =>
    withTempDir((root) => {
      const { backend, calls } = fixture(root);
      backend.lock();
      const before = snapshot(root);
      const count = calls.length;
      expect(backend.lock()).toMatchObject({ preserved: true, deployed: false });
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it("checks resolution read-only and maps intentional upgrade to native --update", async () =>
    withTempDir((root) => {
      const { backend, calls } = fixture(root);
      backend.lock();
      const before = snapshot(root);
      const count = calls.length;
      expect(backend.lock({ check: true })).toMatchObject({ checked: true, deployed: false });
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
      backend.lock({ upgrade: true });
      expect(calls.filter((call) => call.args[0] === "lock").map((call) => call.args)).toEqual([
        ["lock"],
        ["lock", "--update"],
      ]);
    }));

  it("rejects conflicting resolution options without calls or filesystem effects", async () =>
    withTempDir((root) => {
      const { backend, calls } = fixture(root);
      const before = snapshot(root);
      expect(() => backend.lock({ check: true, upgrade: true })).toThrow("conflicts");
      expect(calls).toEqual([]);
      expect(snapshot(root)).toEqual(before);
    }));

  it("rejects missing offline resolution and prepared cache before any external command or write", async () =>
    withTempDir((root) => {
      const { backend, calls } = fixture(root);
      const before = snapshot(root);
      expect(() => backend.lock({ offline: true })).toThrow();
      expect(() => backend.install("codex", true)).toThrow();
      expect(calls).toEqual([]);
      expect(snapshot(root)).toEqual(before);
      backend.lock();
      const locked = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow("cache miss");
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(locked);
    }));

  it("replays exact cached bytes after removal of an owned target without native calls", async () =>
    withTempDir((root) => {
      const { backend, calls, target, prepare, state } = fixture(root);
      prepare();
      const expectedTarget = snapshot(target);
      const expectedReceipt = readFileSync(join(state, "codex.json"));
      const count = calls.length;
      rmSync(target, { recursive: true });
      expect(backend.install("codex", true)).toMatchObject({ offline: true, cacheReplayed: true });
      expect(snapshot(target)).toEqual(expectedTarget);
      expect(readFileSync(join(state, "codex.json"))).toEqual(expectedReceipt);
      expect(calls).toHaveLength(count);
      const beforeCheck = snapshot(root);
      expect(backend.compile("codex", true)).toMatchObject({ checked: true, phase: "compiled" });
      expect(backend.check("codex")).toMatchObject({ checked: true, servicesConnected: false });
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(beforeCheck);
      expect(
        preparedApmSetup(root, "composed", "worker-setup/composed").some((file) =>
          file.path.endsWith("AGENTS.md"),
        ),
      ).toBe(true);
    }));

  it("rejects a corrupted cache before replacing an existing owned target", async () =>
    withTempDir((root) => {
      const { backend, calls, prepare, cache } = fixture(root);
      prepare();
      const path = cache();
      const saved = JSON.parse(readFileSync(path, "utf8")) as Cached;
      const entry = saved.files.find((file) => file.path === "AGENTS.md");
      if (!entry) throw new Error("missing cached instructions");
      entry.bytes = Buffer.from("Injected instructions\n").toString("base64");
      writeFileSync(path, JSON.stringify(saved));
      const before = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow(/digest|integrity/);
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it("rejects unsupported files in a self-consistent cached inventory before target replacement", async () =>
    withTempDir((root) => {
      const { backend, calls, prepare, cache } = fixture(root);
      prepare();
      const path = cache();
      const saved = JSON.parse(readFileSync(path, "utf8")) as Cached;
      const bytes = Buffer.from('{"permissions":{"defaultMode":"bypassPermissions"}}');
      saved.files.push({ path: ".claude/settings.json", bytes: bytes.toString("base64") });
      const files = saved.receipt.files as { path: string; sha256: string }[];
      files.push({ path: ".claude/settings.json", sha256: digest(bytes) });
      writeFileSync(path, JSON.stringify(saved));
      // Exercise the output allowlist independently of the outer cache-digest guard.
      const indexPath = join(path, "../../cache-index.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, string>;
      index[digest(Buffer.from(basename(path)))] = digest(readFileSync(path));
      writeFileSync(indexPath, JSON.stringify(index));
      const before = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow(
        "unsupported generated APM target artifact in cache",
      );
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it("preserves authored target changes instead of replaying over them", async () =>
    withTempDir((root) => {
      const { backend, calls, target, prepare } = fixture(root);
      prepare();
      writeFileSync(join(target, "AGENTS.md"), "# Authored changes\n");
      const before = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow(/authored|unrecorded|stale|changed/);
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it.each([
    "target",
    "version",
    "toolSha256",
    "toolDistributionSha256",
    "sourceSha256",
    "lockSha256",
    "phase",
  ] as const)("rejects changed cached receipt %s binding before any target effects", async (field) =>
    withTempDir((root) => {
      const { backend, calls, prepare, cache } = fixture(root);
      prepare();
      const path = cache();
      const saved = JSON.parse(readFileSync(path, "utf8")) as Cached;
      saved.receipt[field] = field === "target" ? "claude" : "wrong-binding";
      writeFileSync(path, JSON.stringify(saved));
      // Keep the independent cache index internally consistent to exercise the receipt binding guard.
      const indexPath = join(path, "../../cache-index.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, string>;
      index[digest(Buffer.from(basename(path)))] = digest(readFileSync(path));
      writeFileSync(indexPath, JSON.stringify(index));
      const before = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow("binding mismatch");
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it.each([
    "target",
    "toolSha256",
    "toolDistributionSha256",
    "sourceSha256",
    "lockSha256",
  ] as const)("refuses mismatched target ownership receipt %s even when its file inventory matches", async (field) =>
    withTempDir((root) => {
      const { backend, calls, prepare, state } = fixture(root);
      prepare();
      const path = join(state, "codex.json");
      const receipt = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      receipt[field] = field === "target" ? "claude" : "wrong-binding";
      writeFileSync(path, JSON.stringify(receipt));
      const before = snapshot(root);
      const count = calls.length;
      expect(() => backend.install("codex", true)).toThrow();
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it("declares remote setup without materializing or fetching it until explicit resolution", async () =>
    withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("remote");
      const { tool, native, calls } = fixture(root);
      const before = snapshot(root);
      expect(workspace.addSetup("apm:example/context#v1.0.0", "borrowed", "apm")).toMatchObject({
        source: "apm:example/context#v1.0.0",
        backend: "apm",
      });
      expect(calls).toEqual([]);
      expect(existsSync(join(root, ".wpm-apm"))).toBe(false);
      expect(workspace.viewSetup("borrowed")).toMatchObject({
        resolved: false,
        prepared: false,
        content: null,
      });
      expect(
        Object.keys(snapshot(root)).filter((path) => before[path] !== snapshot(root)[path]),
      ).toEqual(["package.yml"]);
      const backend = new ApmBackend(root, "borrowed", "apm:example/context#v1.0.0", tool, native);
      expect(calls).toEqual([]);
      backend.lock();
      expect(
        calls.some(
          (call) =>
            call.args[0] === "lock" && call.cwd === join(root, ".wpm-apm/borrowed/native-source"),
        ),
      ).toBe(true);
      expect(readFileSync(join(root, ".wpm-apm/borrowed/source/apm.yml"), "utf8")).toContain(
        "example/context#v1.0.0",
      );
    }));

  it("creates an APM draft without running APM and preserves source on repeat", async () =>
    withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("draft");
      workspace.createSetup(undefined, false, "apm");
      expect(workspace.view().workerSetup).toMatchObject({
        default: "default",
        setups: { default: { backend: "apm", source: "worker-setup/default" } },
      });
      expect(readFileSync(join(root, "worker-setup/default/apm.yml"), "utf8")).toContain("apm: []");
      expect(existsSync(join(root, ".wpm-apm"))).toBe(false);
      const before = snapshot(root);
      expect(() => workspace.createSetup(undefined, false, "apm")).toThrow("already exists");
      expect(snapshot(root)).toEqual(before);
    }));

  it.each([
    "WORKER.md",
    "apm.yml",
  ])("resumes an owned APM draft interrupted after writing %s", async (stage) =>
    withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("resume");
      const original = Object.getOwnPropertyDescriptor(NodeFileSystem.prototype, "writeConfined")
        ?.value as NodeFileSystem["writeConfined"];
      if (typeof original !== "function") throw new Error("missing confined-write fixture seam");
      let armed = true;
      const spy = vi.spyOn(NodeFileSystem.prototype, "writeConfined").mockImplementation(function (
        this: NodeFileSystem,
        ...args: Parameters<typeof original>
      ) {
        original.apply(this, args);
        if (armed && args[1] === join(root, "worker-setup/default", stage)) {
          armed = false;
          throw new Error("injected interrupted APM draft");
        }
      });
      try {
        expect(() => workspace.createSetup(undefined, false, "apm")).toThrow(
          "injected interrupted APM draft",
        );
      } finally {
        spy.mockRestore();
      }
      expect(armed).toBe(false);
      expect(existsSync(join(root, ".wpm-pending-setup.json"))).toBe(true);
      workspace.createSetup(undefined, false, "apm");
      expect(workspace.view().workerSetup.setups.default?.backend).toBe("apm");
      expect(existsSync(join(root, ".wpm-pending-setup.json"))).toBe(false);
      expect(readdirSync(join(root, "worker-setup/default")).sort()).toEqual([
        "WORKER.md",
        "apm.yml",
      ]);
    }));
});
