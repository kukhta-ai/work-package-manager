import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNpmInvocation } from "../../distribution-preparation/prepare-package.js";

/** Give one test file fresh user state while retaining the verified shared npm archive cache. */
export function isolateIntegrationEnvironment(): () => void {
  let cache = process.env.NPM_CONFIG_CACHE ?? process.env.npm_config_cache;
  if (!cache) {
    const npm = resolveNpmInvocation();
    cache = execFileSync(npm.executable, [...npm.argumentPrefix, "config", "get", "cache"], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
    if (!cache) throw new Error("npm did not report its existing archive cache");
  }
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), "wpm-integration-home-")));
  const directories = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
  };
  const environment = {
    ...directories,
    NPM_CONFIG_CACHE: cache,
    PATH: `${fileURLToPath(new URL("../../node_modules/.bin", import.meta.url))}${delimiter}${process.env.PATH ?? ""}`,
  };
  const unset = ["GIT_CONFIG_GLOBAL", "NPM_CONFIG_USERCONFIG", "npm_config_userconfig"];
  const previous = new Map(
    [...Object.keys(environment), ...unset].map((key) => [key, process.env[key]]),
  );
  for (const path of Object.values(directories)) mkdirSync(path, { recursive: true });
  Object.assign(process.env, environment);
  for (const key of unset) delete process.env[key];
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
  };
}
