import { delimiter, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertInstalledExecutableObservation,
  assertInstallPrerequisites,
  assertNodePrerequisite,
  evaluateInstalledPaths,
  resolveGlobalInstallLayout,
  resolveInstalledExecutableInvocation,
  validateInspectedPackageReport,
} from "../../../distribution-preparation/packed-install.js";
import { createIsolatedEnvironment } from "../../../distribution-preparation/verify-packed-install.js";

const manifest = {
  name: "wpm",
  version: "0.1.0",
  engines: { node: ">=20" },
  bin: { installer: "./dist/cli.js", wpm: "./dist/cli.js" },
};

const archive = {
  archiveSize: 4096,
  entries: [
    { path: "package.json", type: "file" as const },
    { path: "dist/cli.js", type: "file" as const },
    { path: "future/arbitrary.asset", type: "file" as const },
  ],
  packedManifest: manifest,
};

const report = {
  status: "accepted",
  sourceRevision: "abc123",
  sourceBinding: {
    requestedRevision: "HEAD",
    checkoutRevision: "abc123",
    clean: true,
  },
  package: {
    name: "wpm",
    version: "0.1.0",
    executableTargets: { installer: "./dist/cli.js", wpm: "./dist/cli.js" },
  },
  artifact: { path: "/artifacts/wpm-0.1.0.tgz", size: 4096 },
  expectedPaths: ["dist/cli.js", "future/arbitrary.asset", "package.json"],
  actualPaths: ["dist/cli.js", "future/arbitrary.asset", "package.json"],
  violations: [],
};

describe("packed-install evidence contract", () => {
  it("accepts current archive evidence and preserves a future declared asset generically", () => {
    expect(validateInspectedPackageReport(report, archive)).toEqual({
      sourceRevision: "abc123",
      requestedRevision: "HEAD",
      package: report.package,
      artifact: report.artifact,
      expectedPaths: report.expectedPaths,
    });
  });

  it("rejects rejected, malformed, and revision-mismatched inspection evidence", () => {
    expect(() =>
      validateInspectedPackageReport({ ...report, status: "rejected" }, archive),
    ).toThrow(/accepted package inspection/i);
    expect(() =>
      validateInspectedPackageReport({ ...report, expectedPaths: [42] }, archive),
    ).toThrow(/expectedPaths/i);
    expect(() =>
      validateInspectedPackageReport(
        {
          ...report,
          sourceBinding: { ...report.sourceBinding, checkoutRevision: "different" },
        },
        archive,
      ),
    ).toThrow(/source revision/i);
  });

  it("rejects archive evidence that no longer matches the accepted report", () => {
    expect(() =>
      validateInspectedPackageReport(report, {
        ...archive,
        entries: archive.entries.filter(({ path }) => path !== "future/arbitrary.asset"),
      }),
    ).toThrow(/future\/arbitrary\.asset/i);
    expect(() => validateInspectedPackageReport(report, { ...archive, archiveSize: 4097 })).toThrow(
      /artifact size/i,
    );
  });

  it("reports every missing installed declared path without artifact-type rules", () => {
    expect(evaluateInstalledPaths(report.expectedPaths, ["package.json"])).toEqual({
      status: "rejected",
      resolvedPaths: ["package.json"],
      missingPaths: ["dist/cli.js", "future/arbitrary.asset"],
    });
    expect(evaluateInstalledPaths(report.expectedPaths, report.expectedPaths)).toEqual({
      status: "accepted",
      resolvedPaths: report.expectedPaths,
      missingPaths: [],
    });
  });
});

describe("packed-install prerequisites", () => {
  it("accepts a supported Node and npm pair", () => {
    expect(assertInstallPrerequisites(manifest, "22.22.1", "10.9.4")).toEqual({
      node: { observed: "22.22.1", required: ">=20" },
      npm: { observed: "10.9.4", required: null },
    });
  });

  it("identifies unsupported Node with an actionable recovery", () => {
    expect(() => assertNodePrerequisite(manifest, "18.20.0")).toThrowError(
      expect.objectContaining({
        prerequisite: "Node.js",
        recovery: expect.stringMatching(/matching >=20.*rerun/i),
      }),
    );
    expect(() => assertInstallPrerequisites(manifest, "18.20.0", "10.9.4")).toThrowError(
      expect.objectContaining({
        prerequisite: "Node.js",
        recovery: expect.stringMatching(/matching >=20.*rerun/i),
      }),
    );
  });

  it("identifies missing npm with an actionable recovery", () => {
    expect(() => assertInstallPrerequisites(manifest, "22.22.1", undefined)).toThrowError(
      expect.objectContaining({
        prerequisite: "npm",
        recovery: expect.stringMatching(/install.*npm.*rerun/i),
      }),
    );
  });
});

describe("portable global package layout and generated shims", () => {
  it("resolves Unix and Windows global package and executable roots", () => {
    expect(resolveGlobalInstallLayout("/consumer/prefix", "wpm", "linux")).toEqual({
      packageRoot: "/consumer/prefix/lib/node_modules/wpm",
      executableRoot: "/consumer/prefix/bin",
    });
    expect(resolveGlobalInstallLayout("C:\\consumer\\prefix", "wpm", "win32")).toEqual({
      packageRoot: "C:\\consumer\\prefix\\node_modules\\wpm",
      executableRoot: "C:\\consumer\\prefix",
    });
  });

  it("invokes Unix shims directly and Windows cmd shims through cmd.exe", () => {
    expect(
      resolveInstalledExecutableInvocation("linux", "/consumer/prefix/bin/wpm", ["--version"]),
    ).toEqual({
      executable: "/consumer/prefix/bin/wpm",
      args: ["--version"],
      shimPath: "/consumer/prefix/bin/wpm",
    });
    expect(
      resolveInstalledExecutableInvocation(
        "win32",
        "C:\\consumer root\\wpm",
        ["--version"],
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/v:off", "/c", '""C:\\consumer root\\wpm.cmd" --version"'],
      shimPath: "C:\\consumer root\\wpm.cmd",
      windowsVerbatimArguments: true,
    });
  });

  it("rejects unsafe Windows cmd syntax in installed-command arguments", () => {
    for (const unsafeArgument of ['quoted"argument', "%TEMP%", "line\rbreak", "line\nbreak"]) {
      expect(() =>
        resolveInstalledExecutableInvocation(
          "win32",
          "C:\\consumer root\\wpm",
          [unsafeArgument],
          "C:\\Windows\\System32\\cmd.exe",
        ),
      ).toThrow(/expansion or quoting syntax/i);
    }
  });

  it("rejects Windows cmd variable expansion in a generated shim path actionably", () => {
    expect(() =>
      resolveInstalledExecutableInvocation(
        "win32",
        "C:\\consumer-%TEMP%\\wpm",
        ["--version"],
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toThrowError(
      expect.objectContaining({
        prerequisite: "Windows executable shim path",
        recovery: expect.stringMatching(/output path.*without.*%/i),
      }),
    );
  });

  it("identifies a missing or failed generated shim with an actionable recovery", () => {
    expect(() =>
      assertInstalledExecutableObservation({
        name: "wpm",
        shimPath: "/consumer/prefix/bin/wpm",
        shimPresent: false,
        expectedVersion: "0.1.0",
      }),
    ).toThrowError(
      expect.objectContaining({
        prerequisite: "npm-generated executable wpm",
        recovery: expect.stringMatching(/reinstall the exact accepted archive.*rerun/i),
      }),
    );
    expect(() =>
      assertInstalledExecutableObservation({
        name: "wpm",
        shimPath: "/consumer/prefix/bin/wpm",
        shimPresent: true,
        exitStatus: 23,
        failureDetail: "synthetic process failure",
        expectedVersion: "0.1.0",
      }),
    ).toThrowError(
      expect.objectContaining({
        prerequisite: "installed executable wpm",
        recovery: expect.stringMatching(/restore.*wpm.*rerun.*--version/i),
      }),
    );
  });

  it("accepts the exact installed version and rejects version drift", () => {
    expect(
      assertInstalledExecutableObservation({
        name: "wpm",
        shimPath: "/consumer/prefix/bin/wpm",
        shimPresent: true,
        exitStatus: 0,
        stdout: "0.1.0\n",
        expectedVersion: "0.1.0",
      }),
    ).toBe("0.1.0");
    expect(() =>
      assertInstalledExecutableObservation({
        name: "wpm",
        shimPath: "/consumer/prefix/bin/wpm",
        shimPresent: true,
        exitStatus: 0,
        stdout: "0.2.0\n",
        expectedVersion: "0.1.0",
      }),
    ).toThrowError(
      expect.objectContaining({
        prerequisite: "installed executable wpm version",
        message: expect.stringMatching(
          /reported version 0\.2\.0.*expected installed version 0\.1\.0/i,
        ),
        recovery: expect.stringMatching(/reinstall the exact accepted archive.*rerun.*--version/i),
      }),
    );
  });
});

describe("source-independent child environment", () => {
  it("removes repository, Node-injection, npm-run, and credential context", () => {
    const sourceRoot = resolve("source-repository");
    const workspace = resolve("isolated-consumer", "workspace");
    const safeBin = resolve("system-bin");
    const env = createIsolatedEnvironment(
      {
        home: resolve("isolated-consumer", "home"),
        workspace,
        cache: resolve("isolated-consumer", "cache"),
        prefix: resolve("isolated-consumer", "prefix"),
        userConfig: resolve("isolated-consumer", "npmrc"),
        sourceRoot,
      },
      {
        PATH: `${join(sourceRoot, "node_modules", ".bin")}${delimiter}${safeBin}`,
        PWD: sourceRoot,
        INIT_CWD: sourceRoot,
        NODE_OPTIONS: `--require=${join(sourceRoot, "inject.js")}`,
        NODE_PATH: join(sourceRoot, "node_modules"),
        npm_config_userconfig: join(sourceRoot, ".npmrc"),
        npm_package_json: join(sourceRoot, "package.json"),
        npm_lifecycle_event: "package:verify-install",
        NPM_TOKEN: "must-not-cross-boundary",
        CODEX_HOME: join(sourceRoot, "host-codex-home"),
        CODEX_SESSION_ID: "host-codex-session",
        CODEX_THREAD_ID: "host-codex-thread",
        CODEX_MANAGED_PACKAGE_ROOT: join(sourceRoot, "host-codex-package"),
        CLAUDE_CONFIG_DIR: join(sourceRoot, "host-claude-config"),
        CLAUDE_CODE_SSE_PORT: "43123",
        CLAUDECODE: "1",
        SAFE_CONTEXT: "preserved",
      },
    );

    expect(env).toMatchObject({
      HOME: resolve("isolated-consumer", "home"),
      USERPROFILE: resolve("isolated-consumer", "home"),
      PWD: workspace,
      PATH: safeBin,
      SAFE_CONTEXT: "preserved",
      npm_config_userconfig: resolve("isolated-consumer", "npmrc"),
    });
    for (const key of [
      "INIT_CWD",
      "NODE_OPTIONS",
      "NODE_PATH",
      "npm_package_json",
      "npm_lifecycle_event",
      "NPM_TOKEN",
      "CODEX_HOME",
      "CODEX_SESSION_ID",
      "CODEX_THREAD_ID",
      "CODEX_MANAGED_PACKAGE_ROOT",
      "CLAUDE_CONFIG_DIR",
      "CLAUDE_CODE_SSE_PORT",
      "CLAUDECODE",
    ]) {
      expect(key in env, key).toBe(false);
    }
  });
});
