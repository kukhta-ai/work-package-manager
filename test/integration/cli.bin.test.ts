import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import {
  parseWorkspaceHandoffReceipt,
  WORKSPACE_HANDOFF_RECEIPT_PATH,
} from "../../src/core/services/workspace-handoff.js";
import { makeTempDir, removeTempDir } from "../helpers/tmpdir.js";

/**
 * Through-the-edges integration test: builds and links the package into a temporary npm prefix, then invokes
 * its bare command names through a controlled PATH. This reaches the POSIX executable-mode boundary that
 * `node <bin-link>` bypasses, without mutating the user's global npm prefix.
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
  let linkedEnvironment: NodeJS.ProcessEnv;

  beforeAll(() => {
    dir = makeTempDir("wpm-bin-");
    const prefix = join(dir, "prefix");
    linkedEnvironment = {
      ...process.env,
      PATH: `${join(prefix, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      npm_config_prefix: prefix,
    };

    execFileSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      env: linkedEnvironment,
      stdio: "pipe",
    });
    execFileSync("npm", ["link", "--no-audit", "--no-fund"], {
      cwd: repositoryRoot,
      env: linkedEnvironment,
      stdio: "pipe",
    });
  });

  afterAll(() => {
    removeTempDir(dir);
  });

  function directVersion(binName: (typeof binNames)[number]): string {
    return execFileSync(binName, ["--version"], {
      cwd: dir,
      env: linkedEnvironment,
      encoding: "utf8",
    }).trim();
  }

  it("directly executes both linked commands before and after a clean rebuild", () => {
    for (const binName of binNames) {
      expect(directVersion(binName)).toBe(pkg.version);
    }

    execFileSync("npm", ["run", "build"], {
      cwd: repositoryRoot,
      env: linkedEnvironment,
      stdio: "pipe",
    });

    for (const binName of binNames) {
      expect(directVersion(binName)).toBe(pkg.version);
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
    });
    expect(out).toContain("verified fresh-agent handoff");
  });
});
