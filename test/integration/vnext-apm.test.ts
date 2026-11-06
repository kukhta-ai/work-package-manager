import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { ApmBackend, preparedApmSetup } from "../../src/vnext/adapters/apm.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

type ApmCommand = NonNullable<ConstructorParameters<typeof ApmBackend>[4]>;
const EXPECTED_APM_VERSION = "0.35.0";

function fixture(root: string) {
  const source = join(root, "worker-setup/composed");
  mkdirSync(join(source, ".apm/instructions"), { recursive: true });
  writeFileSync(
    join(source, "apm.yml"),
    "name: composed\nversion: 1.0.0\ndependencies:\n  apm: []\ntargets: [codex, claude]\n",
  );
  writeFileSync(
    join(source, ".apm/instructions/context.instructions.md"),
    "---\napplyTo: '**'\n---\nUse the selected operation's acceptance criteria.\n",
  );
  const executable = join(root, "approved-apm");
  writeFileSync(executable, "fake approved external executable");
  const tool = {
    executable,
    sha256: createHash("sha256").update(readFileSync(executable)).digest("hex"),
  };
  return { source, tool };
}

/** Contract stub: verifies adapter argv/effects; it is separate from live CLI qualification evidence. */
function commandStub(
  source: string,
  calls: { args: string[]; env: Record<string, string> }[],
): ApmCommand {
  return (_executable, args, options) => {
    calls.push({ args, env: options.env });
    expect(options.env.APM_NO_SCRIPTS).toBe("1");
    if (args[0] === "--version")
      return { stdout: `APM CLI, version ${EXPECTED_APM_VERSION}`, stderr: "" };
    expect(options.cwd).toBe(source);
    if (args[0] === "lock")
      writeFileSync(
        join(source, "apm.lock.yaml"),
        "lockfile_version: '1'\napm_version: 0.35.0\ndependencies: []\n",
      );
    if (args[0] === "install" || args[0] === "compile") {
      const destination = args[args.indexOf("--root") + 1];
      if (!destination) throw new Error("adapter omitted owned destination");
      if (args[0] === "install") {
        mkdirSync(join(destination, ".agents/skills/brief"), { recursive: true });
        writeFileSync(
          join(destination, ".agents/skills/brief/SKILL.md"),
          "# Recipient brief skill\n",
        );
      } else writeFileSync(join(destination, "AGENTS.md"), "# Native compiled context\n");
    }
    return { stdout: "native fixture command succeeded", stderr: "" };
  };
}

describe("optional pinned APM integration contract", () => {
  it.each([
    [".agents/skills/brief/docs/Guide.md", ".agents/skills/brief/docs/guide.md"],
    [".agents/skills/brief/caf\u00e9.md", ".agents/skills/brief/cafe\u0301.md"],
    [".agents/skills/brief/Doc", ".agents/skills/brief/doc/chapter.md"],
    [".agents/skills/Brief/one.md", ".agents/skills/brief/two.md"],
  ])("rejects colliding receipt paths %s and %s before accepting generated output", async (first, second) => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        commandStub(source, []),
      );
      backend.lock();
      backend.install("codex");
      backend.compile("codex");
      const path = join(root, ".wpm-apm/composed/codex.json");
      const receipt: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt))
        throw new Error("fixture receipt is not a mapping");
      writeFileSync(
        path,
        JSON.stringify({
          ...receipt,
          files: [first, second].map((path) => ({ path, sha256: "0".repeat(64) })),
        }),
      );
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "portable path collision",
      );
      expect(() => backend.compile("codex")).toThrow("portable path collision");
      expect(() => backend.install("codex")).toThrow("portable path collision");
    });
  });

  it.each([
    ["payload/Docs/one.md", "payload/docs/two.md"],
    ["payload/caf\u00e9/one.md", "payload/cafe\u0301/two.md"],
  ])("rejects complete archive directory aliases %s and %s before locking or building", async (first, second) => {
    await withTempDir((root) => {
      const workspace = new VnextWorkspace(root, new FakeBacklog());
      workspace.init("portable");
      for (const [index, path] of [first, second].entries()) {
        mkdirSync(join(root, path, ".."), { recursive: true });
        writeFileSync(join(root, path), `Distinct payload ${index}\n`);
      }
      writeFileSync(
        join(root, "package.yml"),
        stringify({ ...workspace.view(), files: [first, second] }),
      );
      expect(() => workspace.check()).toThrow("portable path collision");
      expect(() => workspace.lock()).toThrow("portable path collision");
      expect(() => workspace.build()).toThrow("portable path collision");
      expect(existsSync(join(root, "wpm.lock.json"))).toBe(false);
      expect(existsSync(join(root, "builds"))).toBe(false);
    });
  });

  it("rejects generated bytes changed between receipt verification and final capture", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        commandStub(source, calls),
      );
      backend.lock();
      backend.install("codex");
      backend.compile("codex");
      // Node's CJS built-in object provides a fault-injection seam without touching product source.
      const load = createRequire(import.meta.url);
      const nativeFs = load("node:fs") as typeof import("node:fs");
      const original = nativeFs.readFileSync;
      const target = join(root, ".wpm-apm/composed/targets/codex/AGENTS.md");
      let armed = true;
      const intercepted = ((...args: Parameters<typeof original>) => {
        const bytes = original(...args);
        if (armed && args[0] === target) {
          armed = false;
          writeFileSync(target, "Changed after receipt inventory read\n");
        }
        return bytes;
      }) as typeof original;
      const spy = vi.spyOn(nativeFs, "readFileSync").mockImplementation(intercepted);
      syncBuiltinESMExports();
      try {
        expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
          "changed during capture",
        );
        expect(armed).toBe(false);
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
    });
  });

  it("does not certify compiled output when source changed during the native command", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const native = commandStub(source, calls);
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        (executable, args, options) => {
          const result = native(executable, args, options);
          if (args[0] === "compile")
            writeFileSync(
              join(source, ".apm/instructions/context.instructions.md"),
              "Changed during compilation\n",
            );
          return result;
        },
      );
      backend.lock();
      backend.install("codex");
      expect(() => backend.compile("codex")).toThrow("source or lock changed during compilation");
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "stale or changed",
      );
    });
  });

  it("separates lock, frozen install and compile, then ships only receipt-bound target contexts", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        commandStub(source, calls),
      );
      expect(backend.lock()).toMatchObject({ phase: "locked", deployed: false });
      expect(calls.some((call) => call.args[0] === "install")).toBe(false);
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "needs explicit pinned",
      );
      expect(backend.install("codex")).toMatchObject({
        phase: "installed",
        servicesConfigured: false,
        agentLaunched: false,
      });
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "stale or changed",
      );
      expect(backend.install("codex")).toMatchObject({ frozenReplay: true });
      expect(backend.compile("codex")).toMatchObject({ phase: "compiled", agentLaunched: false });
      const prepared = preparedApmSetup(root, "composed", "worker-setup/composed");
      expect(prepared.map((file) => file.path)).toEqual([
        "targets/codex/.agents/skills/brief/SKILL.md",
        "targets/codex/AGENTS.md",
        "WORKER.md",
      ]);
      expect(prepared.find((file) => file.path === "WORKER.md")?.bytes.toString("utf8")).toContain(
        "Apply this setup only to operations that select it",
      );
      const install = calls.find((call) => call.args[0] === "install");
      expect(install?.args).toEqual(expect.arrayContaining(["--only", "apm", "--no-trust-bin"]));
      expect(install?.args).not.toContain("--global");
      expect(install?.args).not.toContain("--frozen");
      expect(calls.filter((call) => call.args[0] === "install")[1]?.args).toContain("--frozen");
      expect(install?.env.APM_HOME).toBe(join(root, ".wpm-apm/composed/home"));
      expect(install?.env).not.toHaveProperty("HOME");
      expect(calls.every((call) => call.env.APM_NO_SCRIPTS === "1")).toBe(true);
      writeFileSync(
        join(root, ".wpm-apm/composed/targets/codex/AGENTS.md"),
        "authored replacement",
      );
      expect(() => backend.install("codex")).toThrow("authored or unrecorded");
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "stale or changed",
      );
    });
  });
  it("fails closed for missing/wrong pins and unsupported lifecycle effects before composing", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        { ...tool, sha256: "0".repeat(64) },
        commandStub(source, calls),
      );
      expect(() => backend.lock()).toThrow("digest does not match");
      expect(calls).toEqual([]);
      expect(existsSync(join(root, ".wpm-apm"))).toBe(false);
      const correct = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        commandStub(source, calls),
      );
      writeFileSync(
        join(source, "apm.yml"),
        "name: composed\nscripts:\n  postinstall: echo unwanted\n",
      );
      expect(() => correct.lock()).toThrow("lifecycle scripts");
      expect(calls.every((call) => call.args[0] === "--version")).toBe(true);
      expect(existsSync(join(source, "apm.lock.yaml"))).toBe(false);
      writeFileSync(
        join(source, "apm.yml"),
        "name: composed\nlifecycle:\n  post-install:\n    - run: echo unwanted\n",
      );
      expect(() => correct.lock()).toThrow("lifecycle scripts");
      expect(calls.every((call) => call.args[0] === "--version")).toBe(true);
    });
  });
  it("invalidates composition when authored primitives or the native lock change", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        commandStub(source, calls),
      );
      backend.lock();
      backend.install("codex");
      backend.compile("codex");
      writeFileSync(join(source, ".apm/instructions/context.instructions.md"), "changed source");
      expect(() => backend.compile("codex")).toThrow("stale or changed");
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "stale or changed",
      );
    });
  });
  it("rejects generated agent definitions outside the qualified instructions and skills scope", async () => {
    await withTempDir((root) => {
      const { source, tool } = fixture(root);
      const calls: { args: string[]; env: Record<string, string> }[] = [];
      const native = commandStub(source, calls);
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        tool,
        (executable, args, options) => {
          const result = native(executable, args, options);
          if (args[0] === "compile") {
            const destination = args[args.indexOf("--root") + 1];
            if (!destination) throw new Error("adapter omitted owned destination");
            mkdirSync(join(destination, ".claude/agents"), { recursive: true });
            writeFileSync(
              join(destination, ".claude/agents/unqualified.md"),
              "# Unqualified agent\n",
            );
          }
          return result;
        },
      );
      backend.lock();
      backend.install("codex");
      expect(() => backend.compile("codex")).toThrow("unsupported generated APM target artifact");
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        "stale or changed",
      );
    });
  });
});
