import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveNpmInvocation } from "../../distribution-preparation/prepare-package.js";
import pkg from "../../package.json" with { type: "json" };
import {
  parseWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../src/core/services/workspace-handoff.js";
import { makeTempDir, removeTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges integration test: builds and links the package into a temporary npm prefix, then invokes
 * its bare command names through a controlled PATH. Its copied producer owns a real npm installation and
 * both clean builds, keeping the shared checkout read only. This reaches the POSIX executable-mode boundary
 * that `node <bin-link>` bypasses, without mutating the user's global npm prefix.
 */
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const describeIfPosix = process.platform === "win32" ? describe.skip : describe;

const binNames = ["wpm", "installer"] as const;

describe("published CLI bin map (TASK-106 AC#5)", () => {
  it("declares both executable aliases against the built CLI entry point", () => {
    expect(pkg.bin).toEqual({
      wpm: "./dist/cli.js",
      installer: "./dist/cli.js",
    });
  });
});

describeIfPosix("documented linked command entrypoints (TASK-129)", () => {
  let dir: string;
  let source: string;
  let preferredBin: string;
  let linkedEnvironment: NodeJS.ProcessEnv;

  beforeAll(() => {
    dir = makeTempDir("wpm-bin-");
    source = join(dir, "source");
    mkdirSync(join(source, "scripts"), { recursive: true });
    for (const directory of ["src", "agent-skills", "templates", "docs"])
      cpSync(join(repositoryRoot, directory), join(source, directory), { recursive: true });
    for (const file of [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tsconfig.build.json",
    ])
      copyFileSync(join(repositoryRoot, file), join(source, file));
    copyFileSync(
      join(repositoryRoot, "scripts/ensure-cli-executable.mjs"),
      join(source, "scripts/ensure-cli-executable.mjs"),
    );
    const prefix = join(dir, "prefix");
    preferredBin = join(prefix, "bin");
    const guardBin = join(dir, "guard-bin");
    mkdirSync(guardBin);
    for (const name of binNames) {
      const path = join(guardBin, name);
      writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' 'WPM_TEST_BIN_GUARD:${name}' >&2\nexit 97\n`);
      chmodSync(path, 0o755);
    }
    linkedEnvironment = {
      ...process.env,
      PATH: `${preferredBin}${delimiter}${guardBin}${delimiter}${process.env.PATH ?? ""}`,
      npm_config_prefix: prefix,
      HUSKY: "0",
    };

    npm("ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund");
    npm("run", "build");
    npm("link", "--offline", "--no-audit", "--no-fund");
  });

  afterAll(() => {
    removeTempDir(dir);
  });

  function npm(...args: string[]): void {
    const invocation = resolveNpmInvocation();
    execFileSync(invocation.executable, [...invocation.argumentPrefix, ...args], {
      cwd: source,
      env: linkedEnvironment,
      stdio: "pipe",
      timeout: 180_000,
    });
  }

  function directVersion(binName: (typeof binNames)[number]): string {
    return execFileSync(binName, ["--version"], {
      cwd: dir,
      env: linkedEnvironment,
      encoding: "utf8",
      timeout: 120_000,
    }).trim();
  }

  it("directly executes both linked commands before and after a clean rebuild", () => {
    for (const binName of binNames) {
      expect(directVersion(binName)).toBe(pkg.version);
    }

    npm("run", "build");

    for (const binName of binNames) {
      expect(directVersion(binName)).toBe(pkg.version);
    }
  });

  it("refuses ambient global aliases when either owned linked shim is unavailable", () => {
    for (const name of binNames) {
      const preferred = join(preferredBin, name);
      const held = `${preferred}.held`;
      renameSync(preferred, held);
      try {
        const result = spawnSync(name, ["--version"], {
          cwd: dir,
          env: linkedEnvironment,
          encoding: "utf8",
          timeout: 120_000,
        });
        expect(result.status).toBe(97);
        expect(result.stderr).toBe(`WPM_TEST_BIN_GUARD:${name}\n`);
      } finally {
        renameSync(held, preferred);
      }
      expect(directVersion(name)).toBe(pkg.version);
    }
  });

  it("executes a prepared receipt's command, argv, and cwd literally through linked PATH", () => {
    const workspace = join(dir, "receipt-workspace");
    execFileSync(
      "wpm",
      ["init", "receipt-workspace", "--at", workspace, "--authoring-client", "codex"],
      {
        cwd: dir,
        env: linkedEnvironment,
        stdio: "pipe",
        timeout: 120_000,
      },
    );

    const parsed = parseWorkspaceHandoffReceipt(
      readFileSync(join(workspace, WORKSPACE_HANDOFF_RECEIPT_PATH), "utf8"),
    );
    expect(parsed).toMatchObject({
      ok: true,
      value: { status: "prepared", integrationVersion: pkg.version },
    });
    if (!parsed.ok || parsed.value.status !== "prepared") {
      throw new Error("expected a prepared workspace handoff receipt");
    }

    const verification = parsed.value.clients[0]?.verification;
    if (!verification) {
      throw new Error("expected the prepared receipt to contain a client verification command");
    }
    const out = execFileSync(verification.command, [...verification.args], {
      cwd: verification.workingDirectory,
      env: linkedEnvironment,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(out).toContain("verified fresh-agent handoff");
  });
});
