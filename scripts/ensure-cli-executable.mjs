import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  const emittedCli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  chmodSync(emittedCli, 0o755);
}
