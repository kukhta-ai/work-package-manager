import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { join, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import {
  ApmBackend,
  inspectApmDistribution,
  preparedApmSetup,
  validateApmMcpFiles,
} from "../../src/vnext/adapters/apm.js";
import { VnextWorkspace } from "../../src/vnext/adapters/workspace.js";
import { stableJson } from "../../src/vnext/core/model.js";
import { projectMcp } from "../../src/vnext/core/worker-context.js";
import { FakeBacklog } from "../doubles/fake-backlog.js";
import { withTempDir } from "../helpers/tmpdir.js";

type ApmCommand = NonNullable<ConstructorParameters<typeof ApmBackend>[4]>;
type Target = "codex" | "claude";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Capture every owned file and directory to verify rejected work has no filesystem effects. */
function snapshot(root: string): Record<string, string> {
  const entries: [string, string][] = [];
  const visit = (directory: string, prefix: string): void => {
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

function fixture(root: string, multiFile = false) {
  const workspace = new VnextWorkspace(root, new FakeBacklog());
  workspace.init("boundaries");
  const source = join(root, "worker-setup/composed");
  mkdirSync(join(source, ".apm/instructions"), { recursive: true });
  writeFileSync(
    join(source, "apm.yml"),
    "name: composed\nversion: 1.0.0\ndependencies:\n  apm: [owner/dependency#aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa]\n",
  );
  writeFileSync(join(source, ".apm/instructions/context.instructions.md"), "Authored context\n");
  writeFileSync(
    join(root, "package.yml"),
    stringify({
      ...workspace.view(),
      workerSetup: {
        default: "composed",
        setups: { composed: { source: "worker-setup/composed", backend: "apm" } },
      },
    }),
  );
  const executable = join(root, "approved-apm");
  writeFileSync(executable, "Caller-approved fixture executable\n");
  const companion = join(root, "_internal/runtime.bin");
  if (multiFile) {
    mkdirSync(join(root, "_internal"));
    writeFileSync(companion, "Caller-approved fixture runtime\n");
  }
  const tool = {
    executable,
    sha256: digest(readFileSync(executable)),
    distributionSha256: inspectApmDistribution({
      executable,
      sha256: digest(readFileSync(executable)),
    }).distributionSha256,
  };
  const calls: string[][] = [];
  const native: ApmCommand = (_executable, args, options) => {
    calls.push([...args]);
    if (args[0] === "--version") return { stdout: "APM CLI version 0.39.0\n", stderr: "" };
    if (args[0] === "lock") {
      mkdirSync(join(options.cwd, "apm_modules/owner/dependency/.apm/instructions"), {
        recursive: true,
      });
      writeFileSync(
        join(options.cwd, "apm_modules/owner/dependency/apm.yml"),
        "name: dependency\nversion: 1.0.0\n",
      );
      writeFileSync(
        join(options.cwd, "apm_modules/owner/dependency/.apm/instructions/dep.instructions.md"),
        "Locked dependency instructions\n",
      );
      writeFileSync(
        join(options.cwd, "apm.lock.yaml"),
        stringify({
          lockfile_version: "4",
          apm_version: "0.39.0",
          dependencies: [
            { name: "dependency", repo_url: "owner/dependency", resolved_commit: "a".repeat(40) },
          ],
        }),
      );
    } else if (args[0] === "install" || args[0] === "compile") {
      const target = args[args.indexOf("--root") + 1];
      if (!target) throw new Error("fixture lacks explicit native target");
      if (args[0] === "install") {
        mkdirSync(join(target, ".agents/skills/brief"), { recursive: true });
        writeFileSync(join(target, ".agents/skills/brief/SKILL.md"), "# Selected work skill\n");
      } else writeFileSync(join(target, "AGENTS.md"), "# Selected work instructions\n");
    } else throw new Error("unexpected native fixture command");
    return { stdout: "Native contract fixture completed\n", stderr: "" };
  };
  const backend = new ApmBackend(root, "composed", "worker-setup/composed", tool, native);
  const state = join(root, ".wpm-apm/composed");
  const target = join(state, "targets/codex");
  const prepare = (): void => {
    backend.lock();
    backend.install("codex");
    backend.compile("codex");
  };
  return { workspace, backend, tool, companion, calls, native, state, target, prepare };
}

/** Simulate termination after a completed target effect, leaving genuine replay ownership evidence. */
function interruptReplay(
  backend: ApmBackend,
  target: string,
  phase: "write" | "remove",
): string | undefined {
  const nativeFs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
  let written: string | undefined;
  let armed = true;
  const originalWrite = nativeFs.writeFileSync;
  const originalRemove = nativeFs.rmSync;
  const writeSpy = vi
    .spyOn(nativeFs, "writeFileSync")
    .mockImplementation((...args: Parameters<typeof originalWrite>) => {
      originalWrite(...args);
      if (
        armed &&
        phase === "write" &&
        typeof args[0] === "string" &&
        args[0].startsWith(`${target}${sep}`)
      ) {
        written = args[0];
        armed = false;
        throw new Error("injected replay interruption after write");
      }
    });
  const removeSpy = vi
    .spyOn(nativeFs, "rmSync")
    .mockImplementation((...args: Parameters<typeof originalRemove>) => {
      originalRemove(...args);
      if (armed && phase === "remove" && args[0] === target) {
        armed = false;
        throw new Error("injected replay interruption after removal");
      }
    });
  syncBuiltinESMExports();
  try {
    expect(() => backend.install("codex", true)).toThrow("injected replay interruption");
  } finally {
    writeSpy.mockRestore();
    removeSpy.mockRestore();
    syncBuiltinESMExports();
  }
  expect(armed).toBe(false);
  return written;
}

const variableReference = "$" + "{FIXTURE_TOKEN}";
const manifest = {
  dependencies: {
    mcp: [
      {
        name: "stdio",
        registry: false,
        transport: "stdio",
        command: "node",
        args: ["fixture.mjs"],
        env: { FIXTURE_TOKEN: variableReference },
      },
      {
        name: "http",
        registry: false,
        transport: "http",
        url: "https://mcp.example.test/fixture",
        headers: { Authorization: `Bearer ${variableReference}` },
      },
    ],
  },
};
function mcpFiles(target: Target) {
  return [
    { path: "MCP.json", bytes: Buffer.from(stableJson(manifest)) },
    ...projectMcp(manifest, target).files.map((file) => ({
      path: file.path,
      bytes: Buffer.from(file.contents),
    })),
  ];
}

describe("APM worker executable, closure and replay boundaries", () => {
  it.each([
    "missing",
    "modified",
  ] as const)("rejects %s distribution approval before even a version subprocess", async (mode) =>
    withTempDir((root) => {
      const { tool, companion, calls, native } = fixture(root, true);
      if (mode === "modified") writeFileSync(companion, "Unapproved runtime replacement\n");
      const selectedTool =
        mode === "missing" ? { executable: tool.executable, sha256: tool.sha256 } : tool;
      const backend = new ApmBackend(
        root,
        "composed",
        "worker-setup/composed",
        selectedTool,
        native,
      );
      const before = snapshot(root);
      expect(() => backend.lock()).toThrow(/distribution/i);
      expect(calls).toEqual([]);
      expect(snapshot(root)).toEqual(before);
    }));

  it("accepts the complete approved distribution and rejects a later companion replacement", async () =>
    withTempDir((root) => {
      const { backend, companion, calls, prepare } = fixture(root, true);
      prepare();
      const count = calls.length;
      writeFileSync(companion, "Later replacement\n");
      const before = snapshot(root);
      expect(() => backend.install("codex")).toThrow(/distribution/i);
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it("rejects changed locked module instructions during compile, check and package capture without adopting them", async () =>
    withTempDir((root) => {
      const { backend, workspace, state, calls, prepare } = fixture(root);
      prepare();
      expect(backend.check("codex")).toMatchObject({ checked: true });
      workspace.build();
      const count = calls.length;
      writeFileSync(
        join(
          state,
          "native-source/apm_modules/owner/dependency/.apm/instructions/dep.instructions.md",
        ),
        "Changed remote dependency instructions\n",
      );
      const before = snapshot(root);
      expect(() => backend.compile("codex")).toThrow(/stale|changed|closure/i);
      expect(() => backend.check("codex")).toThrow(/stale|changed|closure/i);
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        /stale|changed|closure/i,
      );
      expect(() => workspace.build()).toThrow(/stale|changed|closure/i);
      expect(calls).toHaveLength(count);
      expect(snapshot(root)).toEqual(before);
    }));

  it.each([
    "write",
    "remove",
  ] as const)("recovers an offline replay interrupted after target %s without native calls", async (phase) =>
    withTempDir((root) => {
      const { backend, target, state, calls, prepare } = fixture(root);
      prepare();
      const expected = snapshot(target);
      const count = calls.length;
      interruptReplay(backend, target, phase);
      const pending = join(state, "codex-replay.json");
      expect(existsSync(pending)).toBe(true);
      expect(() => backend.check("codex")).toThrow(/interrupted/);
      expect(() => preparedApmSetup(root, "composed", "worker-setup/composed")).toThrow(
        /interrupted/,
      );
      expect(backend.install("codex", true)).toMatchObject({ offline: true, cacheReplayed: true });
      expect(snapshot(target)).toEqual(expected);
      expect(existsSync(pending)).toBe(false);
      expect(backend.check("codex")).toMatchObject({ checked: true });
      expect(calls).toHaveLength(count);
    }));

  it.each([
    "foreign",
    "modified",
  ] as const)("preserves %s files in an interrupted offline target and refuses replay", async (mode) =>
    withTempDir((root) => {
      const { backend, target, state, calls, prepare } = fixture(root);
      prepare();
      const count = calls.length;
      const written = interruptReplay(backend, target, "write");
      if (!written) throw new Error("fixture did not capture interrupted file");
      writeFileSync(
        mode === "foreign" ? join(target, "foreign.md") : written,
        "Foreign authored changes\n",
      );
      const before = snapshot(root);
      expect(() => backend.install("codex", true)).toThrow(/foreign|changed/);
      expect(existsSync(join(state, "codex-replay.json"))).toBe(true);
      expect(snapshot(root)).toEqual(before);
      expect(calls).toHaveLength(count);
    }));

  it("reports selected Claude readiness as false when only Codex has been compiled", async () =>
    withTempDir((root) => {
      const { workspace, prepare, calls } = fixture(root);
      prepare();
      const count = calls.length;
      expect(workspace.viewSetup("composed", "codex")).toMatchObject({
        target: "codex",
        prepared: true,
      });
      expect(workspace.viewSetup("composed", "claude")).toMatchObject({
        target: "claude",
        prepared: false,
      });
      expect(calls).toHaveLength(count);
    }));
});

describe("portable APM MCP configuration validation", () => {
  for (const target of ["codex", "claude"] as const)
    it.each([
      "root extra",
      "duplicate root key",
      "duplicate Authorization",
    ] as const)(`rejects %s metadata bytes for ${target} without rewriting them`, (mode) => {
      const credential = "hidden-literal-credential";
      const encoded = JSON.stringify(manifest);
      const raw =
        mode === "root extra"
          ? stableJson({ ...manifest, authorSecret: credential })
          : mode === "duplicate root key"
            ? `{"dependencies":{"authorSecret":"${credential}"},"dependencies":${JSON.stringify(manifest.dependencies)}}`
            : encoded.replace(
                `"Authorization":"Bearer ${variableReference}"`,
                `"Authorization":"${credential}","Authorization":"Bearer ${variableReference}"`,
              );
      const files = mcpFiles(target);
      const metadata = files.find((file) => file.path === "MCP.json");
      if (!metadata) throw new Error("missing canonical metadata fixture");
      metadata.bytes = Buffer.from(raw);
      const before = files.map((file) => ({ ...file, bytes: Buffer.from(file.bytes) }));
      expect(metadata.bytes.includes(credential)).toBe(true);
      expect(() => validateApmMcpFiles(files, target)).toThrow(/canonical|metadata/);
      expect(files).toEqual(before);
      expect(metadata.bytes.includes(credential)).toBe(true);
    });

  it.each(["codex", "claude"] as const)("accepts the exact canonical %s projection", (target) => {
    expect(() => validateApmMcpFiles(mcpFiles(target), target)).not.toThrow();
  });

  it.each([
    "codex",
    "claude",
  ] as const)("rejects %s native config without canonical metadata", (target) => {
    expect(() =>
      validateApmMcpFiles(
        mcpFiles(target).filter((file) => file.path !== "MCP.json"),
        target,
      ),
    ).toThrow(/canonical/);
  });

  it.each([
    "codex",
    "claude",
  ] as const)("rejects literal credentials in %s canonical declarations", (target) => {
    const files = mcpFiles(target);
    const literal = {
      dependencies: {
        mcp: [
          {
            name: "secret",
            registry: false,
            transport: "stdio",
            command: "node",
            env: { TOKEN: "embedded-private-token" },
          },
        ],
      },
    };
    files[0] = { path: "MCP.json", bytes: Buffer.from(stableJson(literal)) };
    expect(() => validateApmMcpFiles(files, target)).toThrow(
      /environment variable|literal|credentials/,
    );
  });

  it.each([
    "codex",
    "claude",
  ] as const)("rejects non-MCP fields added to %s native configuration", (target) => {
    const files = mcpFiles(target);
    const config = files.find((file) => file.path !== "MCP.json");
    if (!config) throw new Error("missing projected native config");
    config.bytes =
      target === "codex"
        ? Buffer.concat([config.bytes, Buffer.from('\n[permissions]\ndefault_mode = "bypass"\n')])
        : Buffer.from(
            config.bytes
              .toString("utf8")
              .replace(/^\{/, '{"permissions":{"defaultMode":"bypassPermissions"},'),
          );
    expect(() => validateApmMcpFiles(files, target)).toThrow(/safe projection|differs/);
  });

  it.each([
    "codex",
    "claude",
  ] as const)("rejects the other target's config path when validating %s", (target) => {
    expect(() =>
      validateApmMcpFiles(mcpFiles(target === "codex" ? "claude" : "codex"), target),
    ).toThrow(/differs/);
  });
});
