import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { decodeJson } from "./json.mjs";
import { provisionFreshPython, qualifyFreshPython } from "./python-environment.mjs";

/** @typedef {{schemaVersion: 1, python: Record<string,string>, go: Record<string,string>, runtime: Record<string,string>}} Pins */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const local = resolve(root, ".quality");
const lockPath = resolve(root, "quality/python-requirements.lock");
const inputPath = resolve(root, "quality/python-requirements.in");
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** @param {Buffer | string} value */
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}
/** @param {unknown} value @param {readonly string[]} names @param {RegExp} grammar */
function stringPins(value, names, grammar) {
  if (!record(value) || Object.keys(value).length !== names.length)
    throw new Error("Invalid analyzer pin inventory");
  /** @type {Record<string, string>} */
  const result = {};
  for (const name of names) {
    const pin = value[name];
    if (typeof pin !== "string" || !grammar.test(pin))
      throw new Error(`Invalid analyzer pin: ${name}`);
    result[name] = pin;
  }
  return result;
}
/** @param {unknown} value @returns {Pins} */
export function validateAnalyzerPins(value) {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    Object.keys(value).some((key) => !["schemaVersion", "python", "go", "runtime"].includes(key))
  )
    throw new Error("Invalid analyzer toolchain schema");
  return {
    schemaVersion: 1,
    python: stringPins(value.python, ["semgrep", "zizmor"], /^\d+\.\d+\.\d+$/),
    go: stringPins(
      value.go,
      ["actionlint", "gitleaks", "osv-scanner"],
      /^github\.com\/[A-Za-z0-9_./-]+@v\d+\.\d+\.\d+$/,
    ),
    runtime: stringPins(value.runtime, ["python", "uv", "go"], /^\d+\.\d+\.\d+$/),
  };
}
const pins = validateAnalyzerPins(
  decodeJson(readFileSync(resolve(root, "quality/toolchain.json"), "utf8")),
);
export const SETUP_CONTRACT_DIGEST =
  hash(readFileSync(fileURLToPath(import.meta.url))) +
  ":" +
  hash(readFileSync(resolve(root, "scripts/python-environment.mjs")));

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} env */
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1_200_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw new Error(`${command}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
/** Network and cache policy is scoped to child processes and never saved to global configuration. */
function setupEnvironment() {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(?:UV_|PIP_|PYTHON|GO(?:ENV|TOOLCHAIN|WORK|PATH|BIN|CACHE|MODCACHE|TMPDIR|PROXY|SUMDB|NOSUMDB|PRIVATE|NOPROXY|FLAGS|ROOT)$)/i.test(
          key,
        ),
    ),
  );
  return {
    ...inherited,
    UV_CACHE_DIR: resolve(local, "cache/uv"),
    UV_PYTHON_INSTALL_DIR: resolve(local, "python-runtimes"),
    UV_NO_CONFIG: "1",
    UV_NO_PROGRESS: "1",
    UV_DEFAULT_INDEX: "https://pypi.org/simple",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    GOENV: "off",
    GOTOOLCHAIN: "local",
    GOWORK: "off",
    GOPATH: resolve(local, "go-path"),
    GOBIN: resolve(local, "bin"),
    GOCACHE: resolve(local, "go-build"),
    GOMODCACHE: resolve(local, "go-mod"),
    GOTMPDIR: resolve(local, "go-tmp"),
    GOPROXY: "https://proxy.golang.org",
    GOSUMDB: "sum.golang.org",
    GONOSUMDB: "",
    GOPRIVATE: "",
    GONOPROXY: "",
    CGO_ENABLED: "0",
    GOFLAGS: "-p=2",
  };
}
function python() {
  return resolve(local, "python/bin/python");
}
function go() {
  const scoped = resolve(local, "go/bin/go");
  return existsSync(scoped) ? scoped : "go";
}
const inventoryCode = `
import hashlib,importlib.metadata,json,pathlib,re,sys
prefix=pathlib.Path(sys.prefix).resolve()
entries=[]
for path in sorted(prefix.rglob('*')):
 rel=path.relative_to(prefix).as_posix()
 if path.is_symlink():
  target=path.resolve()
  if not target.is_relative_to(prefix) and not rel.startswith('bin/python'):
   raise RuntimeError('Python environment link escapes its root: '+rel)
  if path.is_file(): entries.append((rel,hashlib.sha256(path.read_bytes()).hexdigest()))
  else: entries.append((rel,'link:'+str(path.readlink())))
 elif path.is_file(): entries.append((rel,hashlib.sha256(path.read_bytes()).hexdigest()))
versions={re.sub(r'[-_.]+','-',d.metadata['Name'].lower()):d.version for d in importlib.metadata.distributions()}
print(json.dumps({'python':'.'.join(map(str,sys.version_info[:3])),'versions':versions,'digest':hashlib.sha256(json.dumps(entries,separators=(',',':')).encode()).hexdigest()}))
`;
/** Bind every installed dependency version and all virtual-environment bytes, not just console wrappers. */
function pythonInventory() {
  const value = decodeJson(run(python(), ["-I", "-B", "-c", inventoryCode], setupEnvironment()));
  if (
    !record(value) ||
    typeof value.digest !== "string" ||
    !record(value.versions) ||
    value.python !== pins.runtime.python
  )
    throw new Error("Python environment or runtime differs from the pinned toolchain");
  /** @type {Record<string, string>} */
  const locked = {};
  for (const match of readFileSync(lockPath, "utf8").matchAll(/^([A-Za-z0-9_.-]+)==([^\s\\]+)/gm)) {
    const name = match[1];
    const version = match[2];
    if (!name || !version) throw new Error("Invalid Python lock entry");
    locked[name.toLowerCase().replace(/[-_.]+/g, "-")] = version;
  }
  if (!Object.keys(locked).length || !isDeepStrictEqual(value.versions, locked))
    throw new Error("Installed Python dependencies differ from the complete hash lock");
  for (const [name, expected] of Object.entries(pins.python))
    if (value.versions[name] !== expected) throw new Error(`Python analyzer pin mismatch: ${name}`);
  return { python: value.python, versions: value.versions, digest: value.digest };
}
/** Resolve only repository-local analyzers. @param {string} name */
export function analyzer(name) {
  if (!Object.hasOwn(pins.python, name) && !Object.hasOwn(pins.go, name))
    throw new Error(`Unknown analyzer ${name}`);
  const path = resolve(local, Object.hasOwn(pins.python, name) ? "python/bin" : "bin", name);
  if (!existsSync(path)) throw new Error(`${name} missing; run npm run quality:setup`);
  return path;
}
/** Validate all provenance bindings independently of the caller's receipt contents.
 * @param {unknown} receipt @param {{lockfileDigest: string, inputDigest: string, pythonInventoryDigest: string, digests: Record<string,string>}} observed
 */
export function validateAnalyzerReceipt(receipt, observed) {
  if (
    !record(receipt) ||
    receipt.schemaVersion !== 2 ||
    !record(receipt.freshEnvironmentQualification) ||
    receipt.freshEnvironmentQualification.sameVersionTamperRepaired !== true ||
    receipt.freshEnvironmentQualification.corruptWheelRejected !== true ||
    receipt.setupContractDigest !== SETUP_CONTRACT_DIGEST ||
    !isDeepStrictEqual(receipt.pins, pins) ||
    receipt.lockfileDigest !== observed.lockfileDigest ||
    receipt.inputDigest !== observed.inputDigest ||
    receipt.pythonInventoryDigest !== observed.pythonInventoryDigest ||
    !isDeepStrictEqual(receipt.digests, observed.digests)
  )
    throw new Error("Analyzer pins, dependency lock or installed bytes changed; reprovision tools");
  return receipt;
}
/** Check installed provenance and full Python dependency bytes against the setup receipt. */
export function doctorAnalyzers() {
  const receiptPath = resolve(local, "tools.json");
  if (!existsSync(receiptPath))
    throw new Error("Analyzer receipt missing; run npm run quality:setup");
  const observed = {
    lockfileDigest: hash(readFileSync(lockPath)),
    inputDigest: hash(readFileSync(inputPath)),
    pythonInventoryDigest: pythonInventory().digest,
    digests: Object.fromEntries(
      [...Object.keys(pins.python), ...Object.keys(pins.go)].map((name) => [
        name,
        hash(readFileSync(analyzer(name))),
      ]),
    ),
  };
  return validateAnalyzerReceipt(decodeJson(readFileSync(receiptPath, "utf8")), observed);
}
/** Provision exact Python hashes and Go modules locally. Runtime prerequisites are explicit and pinned. */
export function setupAnalyzers() {
  if (process.platform === "win32")
    throw new Error(
      "Full analyzer qualification currently requires a Linux/macOS host; the product Windows consumer gate is separate",
    );
  mkdirSync(local, { recursive: true });
  const env = setupEnvironment();
  for (const path of ["bin", "go-tmp", "cache/uv", "python-runtimes"])
    mkdirSync(resolve(local, path), { recursive: true });
  if (!run("uv", ["--version"], env).startsWith(`uv ${pins.runtime.uv} `))
    throw new Error(`Install uv ${pins.runtime.uv} before quality:setup`);
  if (!run(go(), ["version"], env).includes(`go${pins.runtime.go} `))
    throw new Error(
      `Install Go ${pins.runtime.go} before quality:setup; implicit toolchain downloads are disabled`,
    );
  const pythonVersion = pins.runtime.python;
  if (!pythonVersion) throw new Error("Missing Python runtime pin");
  rmSync(resolve(local, "tools.json"), { force: true });
  const wheelhouse = resolve(local, "bootstrap/wheels");
  provisionFreshPython({
    boundary: local,
    destination: resolve(local, "python"),
    lockfile: lockPath,
    pythonVersion,
    ...(existsSync(wheelhouse) ? { wheelhouse } : {}),
    env,
    run,
  });
  const freshEnvironmentQualification = qualifyFreshPython({
    boundary: local,
    python: python(),
    pythonVersion,
    env,
    run,
  });
  for (const module of Object.values(pins.go)) run(go(), ["install", "-trimpath", module], env);
  const inventory = pythonInventory();
  for (const [name, module] of Object.entries(pins.go)) {
    const at = module.lastIndexOf("@");
    const version = module.slice(at + 1);
    const path = module.slice(0, at);
    const build = run(go(), ["version", "-m", analyzer(name)], env);
    if (
      !build.includes(`\t${version}\t`) ||
      !build.includes(`\tpath\t${path}\n`) ||
      !build.includes(`go${pins.runtime.go}`)
    )
      throw new Error(`Go build provenance mismatch: ${name}`);
  }
  const digests = Object.fromEntries(
    [...Object.keys(pins.python), ...Object.keys(pins.go)].map((name) => [
      name,
      hash(readFileSync(analyzer(name))),
    ]),
  );
  const receipt = {
    schemaVersion: 2,
    setupContractDigest: SETUP_CONTRACT_DIGEST,
    freshEnvironmentQualification,
    pins,
    lockfileDigest: hash(readFileSync(lockPath)),
    inputDigest: hash(readFileSync(inputPath)),
    pythonInventoryDigest: inventory.digest,
    digests,
  };
  writeFileSync(resolve(local, "tools.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  return doctorAnalyzers();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "setup") setupAnalyzers();
    else doctorAnalyzers();
    console.log("Pinned analyzers ready");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
