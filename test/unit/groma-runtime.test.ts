import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const account = vi.hoisted(() => ({ home: undefined as string | undefined }));
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    userInfo: () => ({
      ...original.userInfo(),
      homedir: account.home ?? original.userInfo().homedir,
    }),
  };
});

import {
  doctorGromaRuntime,
  gromaEnvironment,
  gromaRuntimeInvocation,
  gromaTreeInventory,
  setupGromaRuntime,
  validateGromaBuildReceipt,
  validateGromaRuntimePins,
} from "../../scripts/groma-runtime.mjs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
const fingerprint = (value: unknown) => hash(JSON.stringify(canonical(value)));
function pins() {
  return validateGromaRuntimePins({
    schemaVersion: 1,
    repository: "https://github.com/kukhta-ai/Groma.md",
    revision: "a".repeat(40),
    sourceSha256: fingerprint([["src/cli.ts", hash("reviewed source"), 0o644]]),
    lockSha256: hash("frozen lock"),
    version: "0.7.8",
    bunVersion: "1.4.4",
    nodeVersion: "26.12.1",
    tools: {
      "linux-x64": {
        bun: {
          url: "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip",
          sha256: "1".repeat(64),
          binarySha256: "2".repeat(64),
          member: "bun-linux-x64/bun",
          format: "zip",
        },
        node: {
          url: "https://nodejs.org/dist/v26.12.1/node-v26.12.1-linux-x64.tar.xz",
          sha256: "3".repeat(64),
          binarySha256: "4".repeat(64),
          member: "node-v26.12.1-linux-x64/bin/node",
          format: "tar.xz",
        },
      },
    },
    build: { args: ["run", "build"], binary: "dist/groma" },
    sdkRecipes: Object.fromEntries(
      ["typescript", "backlog"].map((id) => [
        id,
        {
          manifest: `quality/groma-sdk/${id}/package.json`,
          manifestSha256: "7".repeat(64),
          lock: `quality/groma-sdk/${id}/bun.lock`,
          lockSha256: "8".repeat(64),
        },
      ]),
    ),
    pluginTrust: {
      "linux-x64": {
        schemaVersion: 1,
        approvals: [
          {
            kind: "scanner",
            id: "typescript",
            source: "@groma/scanner-typescript@0.2.4",
            name: "@groma/scanner-typescript",
            version: "0.2.4",
            integrity: `sha256:${"5".repeat(64)}`,
          },
          {
            kind: "workSource",
            id: "backlog",
            source: "backlog.md@1.55.3",
            name: "backlog.md",
            version: "1.55.3",
            integrity: `sha256:${"6".repeat(64)}`,
          },
        ],
      },
    },
  });
}

describe("reviewed Groma fork runtime", () => {
  it("rejects unapproved transports and alias SDK inputs before provisioning any executable state", async () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-inputs-"));
    const outside = mkdtempSync(join(tmpdir(), "wpm-groma-inputs-outside-"));
    try {
      mkdirSync(join(root, "quality"));
      writeFileSync(join(root, "quality/groma-runtime.json"), JSON.stringify(pins()));
      writeFileSync(join(outside, "preserve"), "outside data");
      symlinkSync(
        outside,
        join(root, "sdk-alias"),
        process.platform === "win32" ? "junction" : "dir",
      );
      await expect(
        setupGromaRuntime(root, { registry: "https://unreviewed.example" }),
      ).rejects.toThrow("transport");
      await expect(setupGromaRuntime(root, { sdkSource: join(root, "sdk-alias") })).rejects.toThrow(
        "canonical",
      );
      expect(existsSync(join(root, ".quality"))).toBe(false);
      expect(readFileSync(join(outside, "preserve"), "utf8")).toBe("outside data");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rechecks a selected private runtime and rejects changed execution closures without fallback",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "wpm-groma-doctor-"));
      const authority = mkdtempSync(join(tmpdir(), "wpm-groma-approvals-"));
      const accountHome = mkdtempSync(join(tmpdir(), "wpm-groma-account-"));
      account.home = accountHome;
      const base = join(root, ".quality/groma-runtime");
      const build = join(base, "builds/build-fixture");
      const source = join(build, "source");
      const platform = `${process.platform}-${process.arch}`;
      const tool = `#!${process.execPath}\nconst fs = require('node:fs'); const crypto = require('node:crypto'); process.stdout.write('sha256:' + crypto.createHash('sha256').update(fs.readFileSync(process.argv.at(-1) + '/marker')).digest('hex'));\n`;
      const binary = "owned compiled fixture";
      const fixtureFile = (path: string, bytes: string) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      };
      try {
        chmodSync(authority, 0o700);
        fixtureFile(join(source, "bun.lock"), "frozen lock");
        fixtureFile(join(source, "src/plugins/integrity.ts"), "reviewed digest helper fixture");
        fixtureFile(join(source, "AGENTS.md"), "reviewed contributor instructions");
        symlinkSync("AGENTS.md", join(source, "CLAUDE.md"));
        const sourceEntries = gromaTreeInventory(source, true);
        fixtureFile(join(source, "node_modules/dependency/index.js"), "frozen dependency bytes");
        fixtureFile(join(build, "tools/bun"), tool);
        chmodSync(join(build, "tools/bun"), 0o700);
        fixtureFile(join(build, "tools/node"), "owned build runtime");
        fixtureFile(join(build, "bin/groma"), binary);
        const template = pins();
        const artifacts = template.tools["linux-x64"];
        const approval = template.pluginTrust["linux-x64"];
        if (!artifacts || !approval) throw new Error("Missing fixture platform");
        const reviewed = validateGromaRuntimePins({
          ...template,
          sourceSha256: fingerprint(sourceEntries),
          tools: {
            [platform]: {
              bun: { ...artifacts.bun, binarySha256: hash(tool) },
              node: { ...artifacts.node, binarySha256: hash("owned build runtime") },
            },
          },
          pluginTrust: {
            [platform]: {
              ...approval,
              approvals: approval.approvals.map((item) => ({
                ...item,
                integrity: `sha256:${hash(item.id)}`,
              })),
            },
          },
          sdkRecipes: Object.fromEntries(
            Object.entries(template.sdkRecipes).map(([id, recipe]) => {
              fixtureFile(join(root, recipe.manifest), `manifest ${id}`);
              fixtureFile(join(root, recipe.lock), `lock ${id}`);
              fixtureFile(join(authority, `sdk/${id}/marker`), id);
              return [
                id,
                {
                  ...recipe,
                  manifestSha256: hash(`manifest ${id}`),
                  lockSha256: hash(`lock ${id}`),
                },
              ];
            }),
          ),
        });
        const profile = reviewed.pluginTrust[platform];
        if (!profile) throw new Error("Missing fixture profile");
        const manifest = {
          schemaVersion: 1,
          approvals: profile.approvals.map((item) => ({
            ...item,
            contentRoot: join(authority, "sdk", item.id),
          })),
        };
        fixtureFile(
          join(authority, "approved-plugins.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );
        const receipt = {
          schemaVersion: 1,
          buildDirectory: "builds/build-fixture",
          approvalsDirectory: authority,
          pinSha256: fingerprint(reviewed),
          platform: process.platform,
          arch: process.arch,
          implementationSha256: hash(readFileSync(resolve("scripts/groma-runtime.mjs"), "utf8")),
          sourceEntries,
          buildTreeSha256: fingerprint(gromaTreeInventory(source, true)),
          binarySha256: hash(binary),
        };
        fixtureFile(join(root, "quality/groma-runtime.json"), JSON.stringify(reviewed));
        fixtureFile(join(base, "receipt.json"), JSON.stringify(receipt));
        expect(() => gromaRuntimeInvocation(root, root)).toThrow();
        const setupAuthority = join(
          accountHome,
          ".local/share/wpm/groma-runtime-authority",
          `${hash(root)}.json`,
        );
        mkdirSync(dirname(setupAuthority), { recursive: true, mode: 0o700 });
        fixtureFile(
          setupAuthority,
          JSON.stringify({
            schemaVersion: 1,
            owner: root,
            runtimeBase: base,
            pinSha256: fingerprint(reviewed),
            receiptSha256: hash(JSON.stringify(receipt)),
          }),
        );
        chmodSync(setupAuthority, 0o600);
        expect(gromaRuntimeInvocation(root, root).executable).toBe(join(build, "bin/groma"));
        for (const untrustedHome of [root, join(base, "cache")]) {
          account.home = untrustedHome;
          expect(() => gromaRuntimeInvocation(root, root)).toThrow("project or its cache");
          expect(existsSync(join(untrustedHome, ".local"))).toBe(false);
        }
        account.home = accountHome;
        for (const [path, changed] of [
          [join(build, "bin/groma"), "same-version replacement"],
          [join(source, "node_modules/dependency/index.js"), "replacement transitive code"],
          [join(source, "src/plugins/integrity.ts"), "replacement helper"],
          [join(authority, "approved-plugins.json"), "{}"],
          [join(authority, "sdk/backlog/marker"), "replacement SDK"],
          [join(root, "quality/groma-sdk/backlog/bun.lock"), "changed frozen resolution"],
        ] as const) {
          const previous = readFileSync(path);
          writeFileSync(path, changed);
          expect(() => gromaRuntimeInvocation(root, root)).toThrow();
          writeFileSync(path, previous);
        }
        // A cache writer can coordinate both files. Only the independent setup authority establishes the expected result.
        for (const [path, changed, receiptChange] of [
          [
            join(build, "bin/groma"),
            "coordinated binary replacement",
            { binarySha256: hash("coordinated binary replacement") },
          ],
          [
            join(source, "node_modules/dependency/index.js"),
            "coordinated dependency replacement",
            {},
          ],
        ] as const) {
          const original = readFileSync(path);
          writeFileSync(path, changed);
          writeFileSync(
            join(base, "receipt.json"),
            JSON.stringify({
              ...receipt,
              ...receiptChange,
              buildTreeSha256: fingerprint(gromaTreeInventory(source, true)),
            }),
          );
          expect(() => gromaRuntimeInvocation(root, root)).toThrow("external setup authority");
          writeFileSync(path, original);
          writeFileSync(join(base, "receipt.json"), JSON.stringify(receipt));
        }
        writeFileSync(
          join(base, "receipt.json"),
          JSON.stringify({
            ...receipt,
            approvalsDirectory: join(root, "forged-external-authority"),
          }),
        );
        expect(() => gromaRuntimeInvocation(root, root)).toThrow("external setup authority");
        writeFileSync(join(base, "receipt.json"), JSON.stringify(receipt));
        expect(gromaRuntimeInvocation(root, root).executable).toBe(join(build, "bin/groma"));
        await expect(
          setupGromaRuntime(root, {
            bunBin: join(build, "tools/bun"),
            nodeBin: join(build, "tools/node"),
          }),
        ).rejects.toThrow();
        expect(existsSync(setupAuthority)).toBe(false);
        expect(existsSync(join(base, "receipt.json"))).toBe(false);
      } finally {
        account.home = undefined;
        rmSync(root, { recursive: true, force: true });
        rmSync(authority, { recursive: true, force: true });
        rmSync(accountHome, { recursive: true, force: true });
      }
    },
  );

  it("rejects pending, floating and upstream pins before creating local tool state", () => {
    const reviewed = pins();
    const profile = reviewed.pluginTrust["linux-x64"];
    const tools = reviewed.tools["linux-x64"];
    if (!profile || !tools) throw new Error("Missing test platform");
    for (const value of [
      { ...reviewed, revision: null },
      { ...reviewed, revision: "main" },
      { ...reviewed, repository: "https://github.com/MrLesk/Groma.md" },
      { ...reviewed, tools: {} },
      {
        ...reviewed,
        tools: { "linux-x64": { ...tools, node: { ...tools.node, member: "--version" } } },
      },
      { ...reviewed, bunVersion: "latest" },
      { ...reviewed, build: { ...reviewed.build, binary: "../outside" } },
      { ...reviewed, sdkRecipes: null },
      {
        ...reviewed,
        sdkRecipes: {
          ...reviewed.sdkRecipes,
          backlog: { ...reviewed.sdkRecipes.backlog, lock: "../../outside" },
        },
      },
      { ...reviewed, pluginTrust: {} },
      {
        ...reviewed,
        pluginTrust: {
          "linux-x64": {
            ...profile,
            approvals: profile.approvals.map((approval) => ({
              ...approval,
              contentRoot: "/project/self-trust",
            })),
          },
        },
      },
    ])
      expect(() => validateGromaRuntimePins(value)).toThrow();
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-pending-"));
    try {
      mkdirSync(join(root, "quality"));
      writeFileSync(
        join(root, "quality/groma-runtime.json"),
        JSON.stringify({ ...reviewed, revision: null }),
      );
      expect(() => doctorGromaRuntime(root, root)).toThrow("pending");
      expect(existsSync(join(root, ".quality"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds source, complete dependency/build bytes, compiler identity and binary separately", () => {
    const reviewed = pins();
    const observed = {
      platform: "linux",
      arch: "x64",
      implementationSha256: "implementation",
      sourceEntries: [["src/cli.ts", hash("reviewed source"), 0o644]] as [string, string, number][],
      buildTreeSha256: "all dependency and build bytes",
      binarySha256: "compiled executable",
      lockSha256: reviewed.lockSha256,
      pluginTrustSha256: fingerprint(reviewed.pluginTrust["linux-x64"]),
    };
    const receipt = { schemaVersion: 1, pinSha256: fingerprint(reviewed), ...observed };
    expect(validateGromaBuildReceipt(reviewed, receipt, observed)).toBe(receipt);
    for (const change of [
      { binarySha256: "tampered same-version binary" },
      { buildTreeSha256: "tampered dependency code" },
      {
        sourceEntries: [["src/cli.ts", hash("edited source"), 0o644]] as [string, string, number][],
      },
      { implementationSha256: "changed builder" },
      { lockSha256: hash("new lock") },
      { arch: "arm64" },
      { pluginTrustSha256: "a self-approved project is not authority" },
    ])
      expect(() =>
        validateGromaBuildReceipt(reviewed, receipt, { ...observed, ...change }),
      ).toThrow();
    expect(() =>
      validateGromaBuildReceipt({ ...reviewed, revision: "b".repeat(40) }, receipt, observed),
    ).toThrow();
  });

  it("strips production/agent/SSH/preload context and preserves only owned user and cache paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-environment-"));
    try {
      const env = gromaEnvironment(root, {
        GITHUB_TOKEN: "not forwarded",
        OPENAI_API_KEY: "not forwarded",
        ANTHROPIC_API_KEY: "not forwarded",
        SSH_AUTH_SOCK: "/agent/socket",
        NODE_OPTIONS: "--require untrusted",
        BUN_OPTIONS: "untrusted",
        CODEX_HOME: "/personal/agent",
        CLAUDE_CONFIG_DIR: "/personal/claude",
        HOME: "/personal",
        PATH: "/personal/bin",
        GROMA_PLUGIN_TRUST_FILE: "/project/self-approved.json",
        LANG: "C.UTF-8",
      });
      expect(env.HOME).toBe(join(root, "home"));
      expect(env.GROMA_PLUGIN_TRUST_FILE).toBeUndefined();
      expect(env.LANG).toBe("C.UTF-8");
      for (const key of [
        "GITHUB_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "SSH_AUTH_SOCK",
        "NODE_OPTIONS",
        "BUN_OPTIONS",
        "CODEX_HOME",
        "CLAUDE_CONFIG_DIR",
      ])
        expect(env[key]).toBeUndefined();
      expect(env.PATH).not.toContain("/personal/bin");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic private context without changing its outside target", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-context-"));
    const outside = mkdtempSync(join(tmpdir(), "wpm-groma-outside-"));
    try {
      writeFileSync(join(outside, "preserve"), "personal bytes");
      symlinkSync(outside, join(root, "home"), process.platform === "win32" ? "junction" : "dir");
      expect(() => gromaEnvironment(root)).toThrow("Symbolic");
      expect(readFileSync(join(outside, "preserve"), "utf8")).toBe("personal bytes");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("includes new dependency bytes and refuses links escaping an owned build tree", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-groma-inventory-"));
    const outside = mkdtempSync(join(tmpdir(), "wpm-groma-inventory-outside-"));
    try {
      writeFileSync(join(root, "source.ts"), "reviewed");
      const before = gromaTreeInventory(root);
      mkdirSync(join(root, "node_modules/dependency"), { recursive: true });
      writeFileSync(join(root, "node_modules/dependency/index.js"), "same version, new bytes");
      expect(gromaTreeInventory(root, true)).not.toEqual(before);
      symlinkSync(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
      expect(() => gromaTreeInventory(root, true)).toThrow("escapes");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
