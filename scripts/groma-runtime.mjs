#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { decodeJson } from "./json.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY = "https://github.com/kukhta-ai/Groma.md";
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
/** @typedef {Record<string, unknown>} JsonRecord */
/** @typedef {{url:string, sha256:string, binarySha256:string, member:string, format:'zip'|'tar.xz'}} ToolArtifact */
/** @typedef {{kind:'scanner'|'workSource',id:string,source:string,name:string,version:string,integrity:string}} Approval */
/** @typedef {{schemaVersion:1,approvals:Approval[]}} ApprovalManifest */
/** @typedef {{manifest:string,manifestSha256:string,lock:string,lockSha256:string}} SdkRecipe */
/** @typedef {{schemaVersion:1, repository:string, revision:string, sourceSha256:string, lockSha256:string, version:string, bunVersion:string, nodeVersion:string, tools:Record<string,{bun:ToolArtifact,node:ToolArtifact}>, build:{args:string[],binary:string}, sdkRecipes:Record<string,SdkRecipe>, pluginTrust:Record<string,ApprovalManifest>}} RuntimePins */
/** @typedef {[string,string,number]} TreeEntry */

/** @param {unknown} value @returns {value is JsonRecord} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** @param {Buffer|string} value */
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
/** Read through one regular descriptor so a substituted link cannot authorize outside bytes. @param {string} path */
function regularBytes(path) {
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error("Groma evidence must be a regular file");
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino)
      throw new Error("Groma evidence changed while opening");
    const bytes = readFileSync(descriptor);
    const current = lstatSync(path, { bigint: true });
    const after = fstatSync(descriptor, { bigint: true });
    if (
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      opened.size !== after.size ||
      opened.mtimeNs !== after.mtimeNs ||
      opened.ctimeNs !== after.ctimeNs
    )
      throw new Error("Groma evidence changed during capture");
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
/** @param {unknown} value @returns {unknown} */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
/** @param {unknown} value */
function fingerprint(value) {
  return hash(JSON.stringify(canonical(value)));
}
/** Check a fresh observation against reviewed inputs; cached version metadata never establishes authority.
 * @param {RuntimePins} pins @param {unknown} receipt
 * @param {{platform:string,arch:string,implementationSha256:string,sourceEntries:TreeEntry[],buildTreeSha256:string,binarySha256:string,lockSha256:string,pluginTrustSha256:string}} observed
 */
export function validateGromaBuildReceipt(pins, receipt, observed) {
  if (
    !record(receipt) ||
    receipt.schemaVersion !== 1 ||
    receipt.pinSha256 !== fingerprint(pins) ||
    receipt.platform !== observed.platform ||
    receipt.arch !== observed.arch ||
    receipt.implementationSha256 !== observed.implementationSha256 ||
    !Array.isArray(receipt.sourceEntries) ||
    fingerprint(receipt.sourceEntries) !== pins.sourceSha256 ||
    !isDeepStrictEqual(receipt.sourceEntries, observed.sourceEntries) ||
    receipt.buildTreeSha256 !== observed.buildTreeSha256 ||
    receipt.binarySha256 !== observed.binarySha256 ||
    observed.lockSha256 !== pins.lockSha256 ||
    observed.pluginTrustSha256 !==
      fingerprint(pins.pluginTrust[`${observed.platform}-${observed.arch}`])
  )
    throw new Error("Groma runtime provenance or bytes changed; run quality:setup");
  return receipt;
}
/** @param {unknown} value @returns {string} */
function localPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\:\p{Cc}\p{Cs}]/u.test(value) ||
    isAbsolute(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid relative Groma runtime path");
  return value;
}
/** Validate the reviewed contract before touching source or executing any fork code. @param {unknown} value @returns {RuntimePins} */
export function validateGromaRuntimePins(value) {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.repository !== REPOSITORY ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.revision) ||
    typeof value.sourceSha256 !== "string" ||
    !SHA256.test(value.sourceSha256) ||
    typeof value.lockSha256 !== "string" ||
    !SHA256.test(value.lockSha256) ||
    typeof value.version !== "string" ||
    !VERSION.test(value.version) ||
    value.bunVersion !== "1.4.4" ||
    value.nodeVersion !== "26.12.1" ||
    !record(value.tools) ||
    !Object.keys(value.tools).length ||
    !record(value.build) ||
    !Array.isArray(value.build.args) ||
    !value.build.args.length ||
    !value.build.args.every((arg) => typeof arg === "string" && arg.length > 0) ||
    !record(value.sdkRecipes) ||
    !record(value.pluginTrust) ||
    !Object.keys(value.pluginTrust).length
  )
    throw new Error(
      "Groma fork provenance is pending or invalid; a reviewed immutable pin is required",
    );
  localPath(value.build.binary);
  for (const id of ["typescript", "backlog"]) {
    const recipe = value.sdkRecipes[id];
    if (
      !record(recipe) ||
      typeof recipe.manifestSha256 !== "string" ||
      !SHA256.test(recipe.manifestSha256) ||
      typeof recipe.lockSha256 !== "string" ||
      !SHA256.test(recipe.lockSha256) ||
      recipe.manifest !== `quality/groma-sdk/${id}/package.json` ||
      recipe.lock !== `quality/groma-sdk/${id}/bun.lock`
    )
      throw new Error("Invalid frozen Groma SDK recipe");
  }
  for (const [platform, tools] of Object.entries(value.tools)) {
    if (!/^(linux|darwin)-(x64|arm64)$/.test(platform) || !record(tools))
      throw new Error("Unsupported Groma tool platform");
    for (const name of ["bun", "node"]) {
      const artifact = tools[name];
      if (
        !record(artifact) ||
        typeof artifact.url !== "string" ||
        !(name === "bun"
          ? artifact.url.startsWith("https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/")
          : artifact.url.startsWith("https://nodejs.org/dist/v26.12.1/")) ||
        typeof artifact.sha256 !== "string" ||
        !SHA256.test(artifact.sha256) ||
        typeof artifact.binarySha256 !== "string" ||
        !SHA256.test(artifact.binarySha256) ||
        !["zip", "tar.xz"].includes(String(artifact.format))
      )
        throw new Error(`Invalid pinned Groma ${name} artifact`);
      const member = localPath(artifact.member);
      if (member.startsWith("-") || /[?*[\]]/.test(member))
        throw new Error("Archive member must be literal");
    }
  }
  for (const [platform, manifest] of Object.entries(value.pluginTrust)) {
    if (
      !Object.hasOwn(value.tools, platform) ||
      !record(manifest) ||
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.approvals) ||
      manifest.approvals.length !== 2
    )
      throw new Error("Groma plugin approvals require a reviewed per-platform manifest");
    const approvals = /** @type {unknown[]} */ (manifest.approvals);
    for (const approval of approvals)
      if (
        !record(approval) ||
        Object.keys(approval).some(
          (key) => !["kind", "id", "source", "name", "version", "integrity"].includes(key),
        ) ||
        !["scanner", "workSource"].includes(String(approval.kind)) ||
        typeof approval.integrity !== "string" ||
        !/^sha256:[a-f0-9]{64}$/.test(approval.integrity)
      )
        throw new Error("Invalid Groma plugin execution approval");
    const scanner = approvals.find((entry) => record(entry) && entry.kind === "scanner");
    const work = approvals.find((entry) => record(entry) && entry.kind === "workSource");
    if (
      !record(scanner) ||
      scanner.id !== "typescript" ||
      scanner.source !== "@groma/scanner-typescript@0.2.4" ||
      scanner.name !== "@groma/scanner-typescript" ||
      scanner.version !== "0.2.4" ||
      !record(work) ||
      work.id !== "backlog" ||
      work.name !== "backlog.md" ||
      work.version !== "1.55.3" ||
      work.source !== `backlog.md@${work.version}`
    )
      throw new Error(
        "Groma approvals must bind the exact TypeScript scanner and native Backlog SDK",
      );
  }
  const trust = value.pluginTrust;
  if (
    Object.keys(value.sdkRecipes).length !== 2 ||
    Object.keys(value.tools).some((platform) => !Object.hasOwn(trust, platform))
  )
    throw new Error("Every Groma platform requires the exact frozen SDK approvals");
  return /** @type {RuntimePins} */ (/** @type {unknown} */ (value));
}
/** @param {RuntimePins} pins */
function approvalsFor(pins) {
  const manifest = pins.pluginTrust[`${process.platform}-${process.arch}`];
  if (!record(manifest)) throw new Error("No reviewed Groma plugin approvals for this platform");
  return manifest;
}
/** Verify committed package-manager outputs before restoring a private SDK. @param {string} root @param {RuntimePins} pins @param {string} id */
function sdkRecipe(root, pins, id) {
  const recipe = pins.sdkRecipes[id];
  if (!recipe) throw new Error("Missing frozen Groma SDK recipe");
  const manifest = regularBytes(confined(root, recipe.manifest, "file"));
  const lock = regularBytes(confined(root, recipe.lock, "file"));
  if (hash(manifest) !== recipe.manifestSha256 || hash(lock) !== recipe.lockSha256)
    throw new Error("Frozen Groma SDK recipe changed; review and repin");
  return { manifest, lock };
}
/** Use the reviewed fork's one digest implementation without loading a plugin. @param {string} source @param {string} bun @param {string} sdk @param {NodeJS.ProcessEnv} env */
function sdkIntegrity(source, bun, sdk, env) {
  const helper = confined(source, "src/plugins/integrity.ts", "file");
  const value = execute(
    bun,
    [
      "--no-env-file",
      "--eval",
      "const {pluginContentIntegrity} = await import(process.argv[1]); process.stdout.write(await pluginContentIntegrity(process.argv[2]));",
      helper,
      sdk,
    ],
    source,
    env,
  )
    .toString()
    .trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Invalid Groma SDK integrity result");
  return value;
}
/** Copy verified data without preserving aliases to another prefix. Every copied byte is rehashed before it can become executable authority. @param {string} source @param {string} destination */
function copySdk(source, destination) {
  if (
    !isAbsolute(source) ||
    realpathSync.native(source) !== source ||
    !lstatSync(source).isDirectory() ||
    lstatSync(source).isSymbolicLink()
  )
    throw new Error("Explicit Groma SDK source must be an ordinary canonical directory");
  const root = source;
  /** @param {string} directory @param {string} output */
  function copy(directory, output) {
    const canonicalDirectory = relative(root, realpathSync.native(directory));
    if (
      canonicalDirectory === ".." ||
      canonicalDirectory.startsWith(`..${sep}`) ||
      isAbsolute(canonicalDirectory)
    )
      throw new Error("Explicit Groma SDK directory escaped its captured root");
    mkdirSync(output, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(directory).sort()) {
      localPath(name);
      if (name.toLowerCase() === ".git")
        throw new Error("Explicit frozen Groma SDK cannot carry Git control state");
      const path = join(directory, name);
      const target = join(output, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const link = readlinkSync(path);
        const resolved = relative(root, realpathSync.native(path));
        if (
          isAbsolute(link) ||
          resolved === ".." ||
          resolved.startsWith(`..${sep}`) ||
          isAbsolute(resolved)
        )
          throw new Error("Explicit Groma SDK link escaped its captured root");
        symlinkSync(link, target);
      } else if (stat.isDirectory()) copy(path, target);
      else if (stat.isFile())
        writeFileSync(target, regularBytes(path), { mode: stat.mode & 0o777, flag: "wx" });
      else throw new Error("Explicit Groma SDK contains a non-regular entry");
    }
  }
  copy(source, destination);
}
/** The committed identity/digest pin acquires only its verified deployed contentRoot. @param {RuntimePins} pins @param {string} authority */
function deployedApprovals(pins, authority) {
  return {
    schemaVersion: 1,
    approvals: approvalsFor(pins).approvals.map((approval) => ({
      ...approval,
      contentRoot: confined(authority, `sdk/${approval.id}`, "directory"),
    })),
  };
}
/** @param {string} root */
function pinsAt(root) {
  return validateGromaRuntimePins(
    decodeJson(regularBytes(join(root, "quality/groma-runtime.json")).toString("utf8")),
  );
}
/** Only the repository's intentional outer .quality alias may resolve outside the checkout. @param {string} root */
function boundary(root) {
  const quality = join(root, ".quality");
  if (!existsSync(quality)) mkdirSync(quality, { mode: 0o700 });
  const parent = realpathSync.native(quality);
  const base = join(parent, "groma-runtime");
  const stat = lstatSync(base, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
    throw new Error("Groma runtime root must be an ordinary owned directory");
  return base;
}
/** @param {string} base @param {string} name @param {'file'|'directory'|'optional'} kind */
function confined(base, name, kind = "optional") {
  const safe = localPath(name);
  let path = base;
  for (const part of safe.split("/")) {
    path = join(path, part);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error("Symbolic Groma runtime state is forbidden");
    if (stat && path !== join(base, safe) && !stat.isDirectory())
      throw new Error("Groma runtime parent is not a directory");
  }
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (kind !== "optional" && (!stat || (kind === "file" ? !stat.isFile() : !stat.isDirectory())))
    throw new Error(`Missing Groma runtime ${kind}: ${name}`);
  return path;
}
/** Hash complete trees, including confined workspace links and executable modes. @param {string} root @param {boolean} links @returns {TreeEntry[]} */
export function gromaTreeInventory(root, links = false) {
  /** @type {TreeEntry[]} */
  const entries = [];
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error("Groma tree root must be an ordinary directory");
  const canonicalRoot = realpathSync.native(root);
  /** @param {string} directory */
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const rel = relative(root, path).split(sep).join("/");
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = relative(canonicalRoot, realpathSync.native(path));
        if (!links || target === ".." || target.startsWith(`..${sep}`) || isAbsolute(target))
          throw new Error(`Groma tree link escapes its owned source: ${rel}`);
        entries.push([rel, `link:${readlinkSync(path)}`, 0]);
      } else if (stat.isDirectory()) walk(path);
      else if (stat.isFile())
        entries.push([rel, hash(regularBytes(path)), stat.mode & 0o111 ? 0o755 : 0o644]);
      else throw new Error(`Non-regular Groma source: ${rel}`);
    }
  }
  walk(root);
  if (!entries.length) throw new Error("Empty Groma source inventory");
  return entries;
}
/** Observe an original archive entry while permitting only its confined, explicitly inventoried source links. @param {string} source @param {unknown} entry @returns {TreeEntry} */
function sourceEntry(source, entry) {
  if (
    !Array.isArray(entry) ||
    entry.length !== 3 ||
    typeof entry[0] !== "string" ||
    typeof entry[1] !== "string"
  )
    throw new Error("Invalid Groma source evidence");
  const name = localPath(entry[0]);
  if (entry[1].startsWith("link:")) {
    const parent = dirname(name);
    if (parent !== ".") confined(source, parent.split(sep).join("/"), "directory");
    const path = join(source, name);
    const stat = lstatSync(path);
    const target = relative(realpathSync.native(source), realpathSync.native(path));
    if (
      !stat.isSymbolicLink() ||
      target === ".." ||
      target.startsWith(`..${sep}`) ||
      isAbsolute(target)
    )
      throw new Error("Groma reviewed source link changed or escaped");
    return [name, `link:${readlinkSync(path)}`, 0];
  }
  const path = confined(source, name, "file");
  return [name, hash(regularBytes(path)), lstatSync(path).mode & 0o111 ? 0o755 : 0o644];
}
/** Construct a child environment from an allowlist; inherited credentials and agent/preload state never cross this boundary. @param {string} base @param {NodeJS.ProcessEnv} inherited */
export function gromaEnvironment(base, inherited = process.env, tools = join(base, "tools")) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const key of ["LANG", "LC_ALL", "TERM", "COLORTERM", "NO_COLOR", "CI"])
    if (inherited[key] !== undefined) env[key] = inherited[key];
  const stat = lstatSync(base);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Groma environment root must be an ordinary directory");
  for (const name of [
    "home",
    "home/config",
    "home/data",
    "home/state",
    "tmp",
    "cache",
    "cache/bun",
    "cache/transpile",
  ])
    mkdirSync(confined(base, name), { recursive: true, mode: 0o700 });
  const home = confined(base, "home");
  const temporary = confined(base, "tmp");
  const cache = confined(base, "cache");
  for (const path of [home, temporary, cache]) mkdirSync(path, { recursive: true, mode: 0o700 });
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_CACHE_HOME: cache,
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    PATH: `${tools}${sep === "/" ? ":" : ";"}/usr/local/bin:/usr/bin:/bin`,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    BUN_INSTALL_CACHE_DIR: join(cache, "bun"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(cache, "transpile"),
  });
  return env;
}
/** @param {string} executable @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} env @returns {Buffer} */
function execute(executable, args, cwd, env) {
  const result = spawnSync(executable, args, {
    cwd,
    env,
    timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Groma tool phase failed: ${executable} ${args[0] ?? ""}: ${result.error?.message ?? result.stderr.toString()}`,
    );
  return result.stdout;
}
/** @param {string} base @param {RuntimePins} pins */
function toolsFor(base, pins) {
  const artifacts = pins.tools[`${process.platform}-${process.arch}`];
  if (!artifacts) throw new Error("No reviewed Groma tool artifacts for this platform");
  for (const name of ["bun", "node"]) {
    const tool = confined(base, `tools/${name}`, "file");
    if (hash(regularBytes(tool)) !== artifacts[/** @type {'bun'|'node'} */ (name)].binarySha256)
      throw new Error(`Groma ${name} binary changed; run quality:setup`);
  }
  return artifacts;
}
/** Validate an approval authority outside project Git and ordinary private user-owned state.
 * @param {string} directory @param {NodeJS.ProcessEnv} env
 */
function externalApprovalDirectory(directory, env) {
  if (!isAbsolute(directory) || !/^wpm-groma-approvals-[A-Za-z0-9]+$/.test(basename(directory)))
    throw new Error("Invalid external Groma approval directory");
  const stat = lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync.native(directory) !== directory ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error("Groma approvals require an ordinary private owned directory");
  outsideGit(directory, env);
  return confined(directory, "approved-plugins.json");
}
/** @param {string} directory @param {NodeJS.ProcessEnv} env */
function outsideGit(directory, env) {
  const git = spawnSync("git", ["-C", directory, "rev-parse", "--show-toplevel"], {
    env: { ...env, LANG: "C", LC_ALL: "C" },
    encoding: "utf8",
    timeout: 30_000,
  });
  if (git.error || git.status !== 128 || !git.stderr.includes("not a git repository"))
    throw new Error("Groma authority must be outside project Git state");
}
/** A cache receipt never selects its own authority. The OS account home is independent of project-controlled HOME/XDG selectors.
 * @param {string} owner @param {string} base @param {NodeJS.ProcessEnv} env @param {boolean} create
 */
function setupAuthorityFile(owner, base, env, create) {
  const home = userInfo().homedir;
  if (!isAbsolute(home) || realpathSync.native(home) !== home)
    throw new Error("Groma setup authority requires an ordinary OS account home");
  const name = ".local/share/wpm/groma-runtime-authority";
  const authority = confined(home, name);
  for (const untrusted of [realpathSync.native(owner), realpathSync.native(dirname(base))]) {
    const location = relative(untrusted, authority);
    if (
      !location ||
      (location !== ".." && !location.startsWith(`..${sep}`) && !isAbsolute(location))
    )
      throw new Error("Groma setup authority cannot live in the project or its cache");
  }
  let existing = authority;
  while (!existsSync(existing)) existing = dirname(existing);
  outsideGit(existing, env);
  if (create) mkdirSync(authority, { recursive: true, mode: 0o700 });
  confined(home, name, "directory");
  const stat = lstatSync(authority);
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
    throw new Error("Groma setup authority requires a private owned directory");
  outsideGit(authority, env);
  return join(authority, `${hash(realpathSync.native(owner))}.json`);
}
/** @param {string} owner @param {string} base @param {RuntimePins} pins @param {Buffer} receiptBytes */
function setupBinding(owner, base, pins, receiptBytes) {
  return {
    schemaVersion: 1,
    owner: realpathSync.native(owner),
    runtimeBase: realpathSync.native(base),
    pinSha256: fingerprint(pins),
    receiptSha256: hash(receiptBytes),
  };
}
/** Only fresh setup establishes this independent result authority; a cache writer cannot mint a new digest by rewriting its receipt.
 * @param {string} owner @param {string} base @param {RuntimePins} pins @param {Buffer} receiptBytes @param {NodeJS.ProcessEnv} env
 */
function authorizeSetup(owner, base, pins, receiptBytes, env) {
  const filename = setupAuthorityFile(owner, base, env, true);
  const temporary = mkdtempSync(join(dirname(filename), "pending-"));
  try {
    const pending = join(temporary, "authority.json");
    writeFileSync(
      pending,
      `${JSON.stringify(setupBinding(owner, base, pins, receiptBytes), null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    renameSync(pending, filename);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
/** @param {string} owner @param {string} base @param {RuntimePins} pins @param {Buffer} receiptBytes @param {NodeJS.ProcessEnv} env */
function verifySetupAuthority(owner, base, pins, receiptBytes, env) {
  const filename = setupAuthorityFile(owner, base, env, false);
  const stat = lstatSync(filename);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error("Groma setup authority requires a private ordinary owned file");
  const authority = decodeJson(regularBytes(filename).toString("utf8"));
  if (!isDeepStrictEqual(authority, setupBinding(owner, base, pins, receiptBytes)))
    throw new Error("Groma selected receipt differs from external setup authority; reprovision");
}
/** Verify exact source bindings and all installed/build bytes, never just a version string. @param {string} root @param {string} owner */
export function doctorGromaRuntime(root = ROOT, owner = ROOT) {
  const pins = pinsAt(root);
  if (!isDeepStrictEqual(pins, pinsAt(owner)))
    throw new Error("Groma snapshot pin differs from qualified runtime");
  const base = boundary(owner);
  const receiptBytes = regularBytes(confined(base, "receipt.json", "file"));
  const privateEnv = gromaEnvironment(base);
  verifySetupAuthority(owner, base, pins, receiptBytes, privateEnv);
  const receipt = decodeJson(receiptBytes.toString("utf8"));
  if (
    !record(receipt) ||
    typeof receipt.buildDirectory !== "string" ||
    !/^builds\/build-[A-Za-z0-9]+$/.test(receipt.buildDirectory)
  )
    throw new Error("Invalid selected Groma build receipt");
  const build = confined(base, receipt.buildDirectory, "directory");
  toolsFor(build, pins);
  const source = confined(build, "source", "directory");
  const binary = confined(build, "bin/groma", "file");
  const env = gromaEnvironment(base, process.env, join(build, "tools"));
  if (typeof receipt.approvalsDirectory !== "string")
    throw new Error("Missing external Groma approvals");
  const approvalsFile = externalApprovalDirectory(receipt.approvalsDirectory, env);
  const manifest = approvalsFor(pins);
  if (!Array.isArray(receipt.sourceEntries)) throw new Error("Invalid Groma source evidence");
  const observedEntries = receipt.sourceEntries.map((entry) => sourceEntry(source, entry));
  validateGromaBuildReceipt(pins, receipt, {
    platform: process.platform,
    arch: process.arch,
    implementationSha256: hash(regularBytes(fileURLToPath(import.meta.url))),
    sourceEntries: observedEntries,
    buildTreeSha256: fingerprint(gromaTreeInventory(source, true)),
    binarySha256: hash(regularBytes(binary)),
    lockSha256: hash(regularBytes(confined(source, "bun.lock", "file"))),
    pluginTrustSha256: fingerprint(manifest),
  });
  // The digest helper is executed only after all reviewed source and tool bytes have been checked.
  const deployed = deployedApprovals(pins, receipt.approvalsDirectory);
  if (!regularBytes(approvalsFile).equals(Buffer.from(`${JSON.stringify(deployed, null, 2)}\n`)))
    throw new Error("External Groma execution approvals changed; review and reprovision");
  for (const approval of deployed.approvals) {
    sdkRecipe(owner, pins, approval.id);
    if (
      sdkIntegrity(source, join(build, "tools/bun"), approval.contentRoot, env) !==
      approval.integrity
    )
      throw new Error(`Approved Groma SDK content changed: ${approval.id}`);
  }
  return {
    pins,
    base,
    source,
    binary,
    approvalsFile,
    env,
  };
}
/** Resolve only the privately built reviewed fork. @param {string} root @param {string} owner */
export function gromaRuntimeInvocation(root = ROOT, owner = ROOT) {
  const runtime = doctorGromaRuntime(root, owner);
  return {
    executable: runtime.binary,
    args: ["--plugin-approvals", runtime.approvalsFile],
    env: {
      ...runtime.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: realpathSync.native(root),
    },
  };
}
/** @param {ToolArtifact} artifact @param {string} destination @param {string} work @param {NodeJS.ProcessEnv} env @param {string|undefined} supplied */
async function installTool(artifact, destination, work, env, supplied) {
  if (supplied !== undefined) {
    if (!isAbsolute(supplied)) throw new Error("Supplied Groma build tools require absolute paths");
    const bytes = regularBytes(supplied);
    if (hash(bytes) !== artifact.binarySha256)
      throw new Error("Supplied Groma build tool differs from its reviewed digest");
    writeFileSync(destination, bytes, { mode: 0o700, flag: "wx" });
    return;
  }
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error("Pinned Groma tool download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== artifact.sha256)
    throw new Error("Pinned Groma tool archive integrity mismatch");
  const archive = join(work, `tool.${artifact.format}`);
  writeFileSync(archive, bytes);
  const binary = execute(
    artifact.format === "zip" ? "unzip" : "tar",
    artifact.format === "zip"
      ? ["-p", archive, artifact.member]
      : ["-xJOf", archive, "--", artifact.member],
    work,
    env,
  );
  if (hash(binary) !== artifact.binarySha256)
    throw new Error("Pinned Groma tool executable integrity mismatch");
  writeFileSync(destination, binary, { mode: 0o700, flag: "wx" });
}
/** Provision from a fresh immutable source export and an empty Bun dependency cache.
 * Explicit local inputs must match the same committed pins; they are never automatic fallbacks.
 * @param {string} root @param {{bunBin?:string,nodeBin?:string,source?:string,registry?:string,sdkSource?:string}} supplied
 */
export async function setupGromaRuntime(root = ROOT, supplied = {}) {
  const pins = pinsAt(root);
  const sdkRegistry = supplied.registry ?? "https://registry.npmjs.org";
  if (!["https://registry.npmjs.org", "https://registry.npmmirror.com"].includes(sdkRegistry))
    throw new Error("Unsupported explicit frozen SDK registry transport");
  if (
    supplied.sdkSource &&
    (!isAbsolute(supplied.sdkSource) ||
      realpathSync.native(supplied.sdkSource) !== supplied.sdkSource ||
      !lstatSync(supplied.sdkSource).isDirectory() ||
      lstatSync(supplied.sdkSource).isSymbolicLink())
  )
    throw new Error("Explicit Groma SDK input must be an ordinary absolute canonical directory");
  const artifacts = pins.tools[`${process.platform}-${process.arch}`];
  if (!artifacts) throw new Error("No reviewed Groma runtime for this platform");
  const manifest = approvalsFor(pins);
  const base = boundary(root);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const setupEnv = gromaEnvironment(base);
  // Starting a new setup revokes the previous selection, including its independent authority.
  rmSync(setupAuthorityFile(root, base, setupEnv, true), { force: true });
  const builds = confined(base, "builds");
  mkdirSync(builds, { recursive: true, mode: 0o700 });
  rmSync(confined(base, "receipt.json"), { force: true });
  const work = mkdtempSync(join(builds, "build-"));
  let qualified = false;
  /** @type {string|undefined} */
  let approvalsDirectory;
  try {
    for (const name of ["tools", "bin", "source"]) mkdirSync(join(work, name), { mode: 0o700 });
    const env = gromaEnvironment(work);
    for (const name of ["bun", "node"])
      await installTool(
        artifacts[/** @type {'bun'|'node'} */ (name)],
        join(work, "tools", name),
        work,
        env,
        name === "bun" ? supplied.bunBin : supplied.nodeBin,
      );
    const bun = join(work, "tools/bun");
    const node = join(work, "tools/node");
    if (
      execute(bun, ["--version"], work, env).toString().trim() !== pins.bunVersion ||
      execute(node, ["--version"], work, env).toString().trim() !== `v${pins.nodeVersion}`
    )
      throw new Error("Groma build tool version differs from reviewed pin");
    const git = join(work, "checkout.git");
    execute("git", ["init", "--bare", git], work, env);
    if (supplied.source !== undefined && !isAbsolute(supplied.source))
      throw new Error("Supplied Groma source requires an absolute repository path");
    execute(
      "git",
      ["-C", git, "fetch", "--depth=1", supplied.source ?? pins.repository, pins.revision],
      work,
      env,
    );
    if (
      execute("git", ["-C", git, "rev-parse", "FETCH_HEAD"], work, env).toString().trim() !==
      pins.revision
    )
      throw new Error("Groma fetch did not resolve the reviewed immutable commit");
    const archive = join(work, "source.tar");
    writeFileSync(
      archive,
      execute("git", ["-C", git, "archive", "--format=tar", pins.revision], work, env),
    );
    const source = join(work, "source");
    execute("tar", ["-xf", archive, "-C", source], work, env);
    const sourceEntries = gromaTreeInventory(source, true);
    if (
      fingerprint(sourceEntries) !== pins.sourceSha256 ||
      hash(readFileSync(confined(source, "bun.lock", "file"))) !== pins.lockSha256
    )
      throw new Error("Groma reviewed source or frozen dependency lock differs from pin");
    execute(
      bun,
      [
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--no-progress",
        "--cache-dir",
        join(work, "cache/bun"),
        "--registry",
        sdkRegistry,
      ],
      source,
      env,
    );
    execute(bun, pins.build.args, source, env);
    const compiled = confined(source, pins.build.binary, "file");
    const binary = join(work, "bin/groma");
    copyFileSync(compiled, binary);
    chmodSync(binary, 0o700);
    if (execute(binary, ["--version"], source, env).toString().trim() !== pins.version)
      throw new Error("Compiled Groma version differs from its reviewed source");
    if (
      !isDeepStrictEqual(
        sourceEntries,
        sourceEntries.map((entry) => sourceEntry(source, entry)),
      )
    )
      throw new Error("Groma build modified reviewed source inputs");
    const receipt = {
      schemaVersion: 1,
      buildDirectory: relative(base, work).split(sep).join("/"),
      pinSha256: fingerprint(pins),
      implementationSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
      platform: process.platform,
      arch: process.arch,
      sourceEntries,
      buildTreeSha256: fingerprint(gromaTreeInventory(source, true)),
      binarySha256: hash(readFileSync(binary)),
      sdkRegistry,
      sdkOrigin: supplied.sdkSource ? "verified-explicit-copy" : "frozen-lock-registry",
      approvalsDirectory: "",
    };
    approvalsDirectory = realpathSync.native(mkdtempSync(join(tmpdir(), "wpm-groma-approvals-")));
    const approvalsFile = externalApprovalDirectory(approvalsDirectory, env);
    for (const approval of manifest.approvals) {
      const recipe = sdkRecipe(root, pins, approval.id);
      const sdk = confined(approvalsDirectory, `sdk/${approval.id}`);
      if (supplied.sdkSource) {
        const input = confined(supplied.sdkSource, approval.id, "directory");
        if (
          !regularBytes(confined(input, "package.json", "file")).equals(recipe.manifest) ||
          !regularBytes(confined(input, "bun.lock", "file")).equals(recipe.lock) ||
          sdkIntegrity(source, bun, input, env) !== approval.integrity
        )
          throw new Error("Explicit Groma SDK differs from reviewed closure and recipe");
        copySdk(input, sdk);
      } else {
        mkdirSync(sdk, { recursive: true, mode: 0o700 });
        writeFileSync(join(sdk, "package.json"), recipe.manifest, { mode: 0o600, flag: "wx" });
        writeFileSync(join(sdk, "bun.lock"), recipe.lock, { mode: 0o600, flag: "wx" });
        execute(
          bun,
          [
            "install",
            "--frozen-lockfile",
            "--ignore-scripts",
            "--no-progress",
            "--cache-dir",
            join(work, "cache/bun"),
            "--registry",
            sdkRegistry,
          ],
          sdk,
          env,
        );
      }
      if (sdkIntegrity(source, bun, sdk, env) !== approval.integrity)
        throw new Error(`Frozen Groma SDK differs from reviewed content: ${approval.id}`);
    }
    writeFileSync(
      approvalsFile,
      `${JSON.stringify(deployedApprovals(pins, approvalsDirectory), null, 2)}\n`,
      {
        mode: 0o600,
        flag: "wx",
      },
    );
    receipt.approvalsDirectory = approvalsDirectory;
    for (const name of [
      "checkout.git",
      "source.tar",
      "tool.zip",
      "tool.tar.xz",
      "cache",
      "home",
      "tmp",
    ])
      rmSync(join(work, name), { recursive: true, force: true });
    const pending = join(work, "receipt.json");
    writeFileSync(pending, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    authorizeSetup(root, base, pins, regularBytes(pending), env);
    renameSync(pending, confined(base, "receipt.json"));
    const runtime = doctorGromaRuntime(root, root);
    if (runtime.source !== source)
      throw new Error("Selected Groma build changed during qualification");
    qualified = true;
    return runtime;
  } finally {
    if (!qualified) {
      rmSync(work, { recursive: true, force: true });
      if (approvalsDirectory) rmSync(approvalsDirectory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "setup") {
      /** @type {{bunBin?:string,nodeBin?:string,source?:string,registry?:string,sdkSource?:string}} */
      const supplied = {};
      for (let index = 0; index < args.length; index += 2) {
        const flag = args[index];
        const value = args[index + 1];
        if (!value) throw new Error("Missing explicit Groma build input");
        if (flag === "--bun-bin" && supplied.bunBin === undefined) supplied.bunBin = value;
        else if (flag === "--node-bin" && supplied.nodeBin === undefined) supplied.nodeBin = value;
        else if (flag === "--source" && supplied.source === undefined) supplied.source = value;
        else if (flag === "--registry" && supplied.registry === undefined)
          supplied.registry = value;
        else if (flag === "--sdk-source" && supplied.sdkSource === undefined)
          supplied.sdkSource = value;
        else throw new Error("Unknown or duplicate explicit Groma build input");
      }
      await setupGromaRuntime(ROOT, supplied);
    } else if (mode === "doctor" && !args.length) doctorGromaRuntime();
    else if (mode === "cli" && args.length) {
      if (args.some((arg) => arg === "--plugin-approvals" || arg.startsWith("--plugin-approvals=")))
        throw new Error("WPM owns its reviewed external Groma approval authority");
      const invocation = gromaRuntimeInvocation();
      const result = spawnSync(invocation.executable, [...invocation.args, ...args], {
        cwd: ROOT,
        env: invocation.env,
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } else throw new Error("usage: groma-runtime.mjs setup|doctor|cli <native arguments>");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
