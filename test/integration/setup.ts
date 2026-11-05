import { execFileSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execaSync } from "execa";
import { afterAll } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { isolateIntegrationEnvironment } from "../helpers/integration-environment.js";

// Vitest runs setup files before importing the test module, including its native availability probes.
const restore = isolateIntegrationEnvironment();
try {
  const cli = fileURLToPath(new URL("../../node_modules/backlog.md/cli.js", import.meta.url));
  const observed = execFileSync(process.execPath, [cli, "--version"], {
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const expected = pkg.devDependencies["backlog.md"];
  if (observed !== expected)
    throw new Error(`Integration requires local Backlog.md ${expected}; observed ${observed}`);
  const localBin = fileURLToPath(new URL("../../node_modules/.bin", import.meta.url));
  const shim = join(localBin, process.platform === "win32" ? "backlog.cmd" : "backlog");
  const stat = lstatSync(shim, { throwIfNoEntry: false });
  if (!stat || (process.platform === "win32" ? !stat.isFile() : !stat.isSymbolicLink()))
    throw new Error("Integration requires the local npm Backlog shim");
  const resolved = realpathSync.native(shim);
  accessSync(shim, constants.X_OK);
  if (
    process.platform === "win32"
      ? !readFileSync(shim, "utf8").includes('"%dp0%\\..\\backlog.md\\cli.js"')
      : resolved !== realpathSync.native(cli)
  )
    throw new Error("Integration local Backlog shim must target the exact local wrapper");
  const home = process.env.HOME;
  if (!home) throw new Error("Integration HOME was not isolated");
  const guard = join(home, "native-bin-guard");
  mkdirSync(guard);
  if (process.platform === "win32")
    writeFileSync(
      join(guard, "backlog.cmd"),
      "@echo off\r\necho WPM_TEST_BACKLOG_GUARD 1>&2\r\nexit /b 97\r\n",
    );
  else {
    const command = join(guard, "backlog");
    writeFileSync(command, "#!/bin/sh\nprintf '%s\\n' 'WPM_TEST_BACKLOG_GUARD' >&2\nexit 97\n");
    chmodSync(command, 0o755);
  }
  const path = (process.env.PATH ?? "").split(delimiter);
  path.splice(1, 0, guard);
  process.env.PATH = path.join(delimiter);
  const bare = execaSync("backlog", ["--version"], {
    stdin: "ignore",
    timeout: 15_000,
  }).stdout.trim();
  if (bare !== expected)
    throw new Error(
      `Integration bare Backlog must resolve the local pin ${expected}; observed ${bare}`,
    );
  afterAll(restore);
} catch (error) {
  restore();
  throw error;
}
