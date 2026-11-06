import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isolateIntegrationEnvironment } from "../helpers/integration-environment.js";
import { withTempDir } from "../helpers/tmpdir.js";

// Captured during module import: an afterEach/beforeAll-only sandbox would be too late.
const importedHome = process.env.HOME;
const stateVariables = [
  "HOME",
  "USERPROFILE",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "APPDATA",
  "LOCALAPPDATA",
];
afterEach(() => vi.unstubAllEnvs());

describe("integration file user-state isolation", () => {
  it("is active before test imports and provides real owned directories for every platform", () => {
    if (!importedHome) throw new Error("integration setup did not provide HOME");
    expect(basename(importedHome)).toMatch(/^wpm-integration-home-/);
    expect(process.env.USERPROFILE).toBe(importedHome);
    expect(process.env.PATH?.split(delimiter)[0]).toBe(
      fileURLToPath(new URL("../../node_modules/.bin", import.meta.url)),
    );
    for (const key of stateVariables) {
      const path = process.env[key];
      if (!path) throw new Error(`integration setup omitted ${key}`);
      expect(
        path === importedHome ||
          path.startsWith(`${importedHome}/`) ||
          path.startsWith(`${importedHome}\\`),
      ).toBe(true);
      const stat = lstatSync(path);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
  });

  it("does not copy user settings and restores inherited selectors without changing their files", async () => {
    await withTempDir((original) => {
      mkdirSync(join(original, ".claude"));
      const settings = join(original, ".claude/settings.json");
      const contents = '{"fixtureSetting":true}\n';
      writeFileSync(settings, contents);
      vi.stubEnv("HOME", original);
      vi.stubEnv("USERPROFILE", original);
      for (const key of ["GIT_CONFIG_GLOBAL", "NPM_CONFIG_USERCONFIG", "npm_config_userconfig"])
        vi.stubEnv(key, join(original, key));
      const originalEnvironment = Object.fromEntries(
        [...stateVariables, "PATH"].map((key) => [key, process.env[key]]),
      );
      const cache = process.env.NPM_CONFIG_CACHE;
      const restore = isolateIntegrationEnvironment();
      const temporary = process.env.HOME;
      try {
        if (!temporary) throw new Error("isolated HOME missing");
        expect(temporary).not.toBe(original);
        expect(existsSync(join(temporary, ".claude/settings.json"))).toBe(false);
        expect(process.env.GIT_CONFIG_GLOBAL).toBeUndefined();
        expect(process.env.NPM_CONFIG_USERCONFIG).toBeUndefined();
        expect(process.env.npm_config_userconfig).toBeUndefined();
        expect(process.env.NPM_CONFIG_CACHE).toBe(cache);
        expect(readFileSync(settings, "utf8")).toBe(contents);
      } finally {
        restore();
      }
      expect(
        Object.fromEntries([...stateVariables, "PATH"].map((key) => [key, process.env[key]])),
      ).toEqual(originalEnvironment);
      for (const key of ["GIT_CONFIG_GLOBAL", "NPM_CONFIG_USERCONFIG", "npm_config_userconfig"])
        expect(process.env[key]).toBe(join(original, key));
      if (!temporary) throw new Error("isolated HOME missing");
      expect(existsSync(temporary)).toBe(false);
      restore();
      expect(readFileSync(settings, "utf8")).toBe(contents);
    });
  });

  it("allocates distinct file homes while retaining an explicitly selected lowercase npm cache", () => {
    const cache = process.env.NPM_CONFIG_CACHE;
    if (!cache) throw new Error("integration setup omitted its existing npm cache");
    vi.stubEnv("NPM_CONFIG_CACHE", undefined);
    vi.stubEnv("npm_config_cache", cache);
    const restoreFirst = isolateIntegrationEnvironment();
    const first = process.env.HOME;
    try {
      const restoreSecond = isolateIntegrationEnvironment();
      try {
        expect(process.env.HOME).not.toBe(first);
        expect(process.env.NPM_CONFIG_CACHE).toBe(cache);
        expect(process.env.npm_config_cache).toBe(cache);
      } finally {
        restoreSecond();
      }
      expect(process.env.HOME).toBe(first);
    } finally {
      restoreFirst();
    }
    expect(process.env.NPM_CONFIG_CACHE).toBeUndefined();
    expect(process.env.npm_config_cache).toBe(cache);
  });

  it("captures a configured npm cache outside HOME before removing its userconfig selector", async () => {
    await withTempDir((fixture) => {
      const originalHome = process.env.HOME;
      const cache = join(fixture, "archive-cache");
      mkdirSync(cache);
      const configuration = join(fixture, "fixture.npmrc");
      const contents = `cache=${JSON.stringify(cache)}\n`;
      writeFileSync(configuration, contents);
      vi.stubEnv("NPM_CONFIG_CACHE", undefined);
      vi.stubEnv("npm_config_cache", undefined);
      vi.stubEnv("NPM_CONFIG_USERCONFIG", configuration);
      vi.stubEnv("npm_config_userconfig", configuration);
      const restore = isolateIntegrationEnvironment();
      try {
        expect(process.env.NPM_CONFIG_CACHE).toBe(cache);
        expect(process.env.HOME).not.toBe(originalHome);
        expect(process.env.NPM_CONFIG_USERCONFIG).toBeUndefined();
        expect(process.env.npm_config_userconfig).toBeUndefined();
        expect(readFileSync(configuration, "utf8")).toBe(contents);
      } finally {
        restore();
      }
      expect(process.env.NPM_CONFIG_CACHE).toBeUndefined();
      expect(process.env.npm_config_cache).toBeUndefined();
      expect(process.env.NPM_CONFIG_USERCONFIG).toBe(configuration);
      expect(process.env.npm_config_userconfig).toBe(configuration);
      expect(readFileSync(configuration, "utf8")).toBe(contents);
    });
  });

  it.each([
    { kind: "missing", message: "fixture local Backlog entry is unavailable" },
    { kind: "mismatched", message: "Integration requires local Backlog.md" },
  ])("fails setup closed for a $kind local native peer and restores user state", async ({
    kind,
    message,
  }) => {
    const before = { home: process.env.HOME, path: process.env.PATH };
    const load = createRequire(import.meta.url);
    const native = load("node:child_process") as typeof import("node:child_process");
    let probeHome: string | undefined;
    const spy = vi.spyOn(native, "execFileSync").mockImplementation(() => {
      probeHome = process.env.HOME;
      if (kind === "missing") throw new Error(message);
      return "0.0.0\n";
    });
    syncBuiltinESMExports();
    try {
      const setupModule = `./setup.ts?readiness=${kind}`;
      await expect(import(setupModule)).rejects.toThrow(message);
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        process.execPath,
        [
          fileURLToPath(new URL("../../node_modules/backlog.md/cli.js", import.meta.url)),
          "--version",
        ],
        { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
      );
      expect({ home: process.env.HOME, path: process.env.PATH }).toEqual(before);
      if (!probeHome) throw new Error("setup did not reach its native readiness probe");
      expect(probeHome).not.toBe(before.home);
      expect(existsSync(probeHome)).toBe(false);
    } finally {
      spy.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it.each([
    "missing",
    "broken",
    "non-executable",
    "wrong-target",
  ])("rejects a %s local npm shim without changing shared node_modules", async (kind) => {
    const localBin = fileURLToPath(new URL("../../node_modules/.bin", import.meta.url));
    const shim = join(localBin, process.platform === "win32" ? "backlog.cmd" : "backlog");
    const before = { home: process.env.HOME, path: process.env.PATH };
    const load = createRequire(import.meta.url);
    const native = load("node:fs") as typeof import("node:fs");
    const originalStat = native.lstatSync;
    const originalRealpath = native.realpathSync.native;
    const originalAccess = native.accessSync;
    const originalRead = native.readFileSync;
    let probeHome: string | undefined;
    const fault = `fixture ${kind} local npm shim`;
    const stat = ((...args: Parameters<typeof originalStat>) => {
      if (args[0] === shim && kind === "missing") {
        probeHome = process.env.HOME;
        return undefined;
      }
      return originalStat(...args);
    }) as typeof originalStat;
    const resolve = ((...args: Parameters<typeof originalRealpath>) => {
      if (args[0] === shim) {
        probeHome = process.env.HOME;
        if (kind === "broken") throw new Error(fault);
        if (kind === "wrong-target" && process.platform !== "win32") return `${shim}.unowned`;
      }
      return originalRealpath(...args);
    }) as typeof originalRealpath;
    const read = ((...args: Parameters<typeof originalRead>) => {
      if (args[0] === shim && kind === "wrong-target" && process.platform === "win32")
        return "@echo off\r\nnode C:\\unowned\\cli.js\r\n";
      return originalRead(...args);
    }) as typeof originalRead;
    const spies = [
      vi.spyOn(native, "lstatSync").mockImplementation(stat),
      vi.spyOn(native.realpathSync, "native").mockImplementation(resolve),
      vi.spyOn(native, "readFileSync").mockImplementation(read),
      vi.spyOn(native, "accessSync").mockImplementation((...args) => {
        if (args[0] === shim && kind === "non-executable") throw new Error(fault);
        originalAccess(...args);
      }),
    ];
    syncBuiltinESMExports();
    try {
      const setupModule = `./setup.ts?shim=${kind}`;
      await expect(import(setupModule)).rejects.toThrow(
        kind === "missing" || kind === "wrong-target"
          ? /local.*Backlog shim|local npm Backlog shim/
          : fault,
      );
      expect({ home: process.env.HOME, path: process.env.PATH }).toEqual(before);
      if (!probeHome) throw new Error("setup did not inspect its local shim");
      expect(probeHome).not.toBe(before.home);
      expect(existsSync(probeHome)).toBe(false);
    } finally {
      for (const spy of spies) spy.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it("blocks ambient native aliases when the preferred local bin directory is unavailable", () => {
    const before = process.env.PATH;
    const paths = (before ?? "").split(delimiter);
    const guard = paths[1];
    if (!guard) throw new Error("integration setup omitted its native alias guard");
    expect(guard).toBe(join(process.env.HOME ?? "", "native-bin-guard"));
    process.env.PATH = paths.slice(1).join(delimiter);
    try {
      const result = execaSync("backlog", ["--version"], {
        reject: false,
        stdin: "ignore",
        timeout: 15_000,
      });
      expect(result.exitCode).toBe(97);
      expect(result.stderr.trim()).toBe("WPM_TEST_BACKLOG_GUARD");
    } finally {
      if (before === undefined) delete process.env.PATH;
      else process.env.PATH = before;
    }
  });
});
