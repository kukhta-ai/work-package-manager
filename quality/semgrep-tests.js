import { execSync as runShell, spawn as startProcess } from "node:child_process";
import * as childProcess from "node:child_process";
const processes = require("child_process");
function sample(command) {
  // ruleid: no-shell-interpolation
  execSync(command);
  // ruleid: no-shell-interpolation
  execSync("git status");
  // ruleid: no-shell-interpolation
  runShell(command);
  // ruleid: no-shell-interpolation
  childProcess.exec(command);
  // ruleid: no-shell-interpolation
  processes.execSync(command);
  // ok: no-shell-interpolation
  execFileSync("git", ["show", command]);
  // ok: no-shell-interpolation
  childProcess.execFileSync("git", ["show", command]);
  // ruleid: no-spawn-shell
  spawn(command, [], { shell: true });
  // ruleid: no-spawn-shell
  startProcess(command, [], { shell: true });
  // ruleid: no-spawn-shell
  childProcess.spawnSync("git", ["show", command], { shell: true });
  // ok: no-spawn-shell
  childProcess.spawnSync("git", ["show", command], { shell: false });
  // ruleid: no-tls-bypass
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  // ruleid: no-tls-bypass
  const insecure = { rejectUnauthorized: false };
  // ok: no-tls-bypass
  const secure = { rejectUnauthorized: true };
}
