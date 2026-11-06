import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeJson } from "./json.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** @param {string} value */
function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Gitleaks v8.30.1 retains the preceding LF in non-first-line findings and a CR from CRLF input.
 * Keep only that native framing optional around one exact reviewed source line.
 * @param {string} line
 */
export function gitleaksExactLinePattern(line) {
  if (/[\r\n]/.test(line)) throw new Error("Reviewed public example must be one exact source line");
  return `^\\n?${escaped(line)}\\r?$`;
}
/** Gitleaks v8.30.1 also loads source/.gitleaksignore despite an explicit ignore-path.
 * @param {string} source
 */
export function rejectImplicitGitleaksPolicy(source) {
  if (lstatSync(resolve(source, ".gitleaksignore"), { throwIfNoEntry: false }))
    throw new Error(
      "Source-root .gitleaksignore is unsupported; it would bypass the mandatory secret gate",
    );
}
/** Semgrep has independent source ignore files in addition to Git ignore behavior.
 * @param {readonly string[]} selected
 */
export function rejectImplicitSemgrepPolicy(selected) {
  if (
    selected.some(
      (path) =>
        path === ".semgrepignore" ||
        /^(?:src|scripts|distribution-preparation)\/(?:.*\/)?\.semgrepignore$/.test(path),
    )
  )
    throw new Error("Source Semgrep ignore files cannot narrow the mandatory scanner scope");
}
/** @param {string} source @param {string} path @param {Set<string>} selected */
function selectedFile(source, path, selected) {
  if (
    !selected.has(path) ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    return undefined;
  const target = resolve(source, path);
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) return undefined;
  const delta = relative(realpathSync(source), realpathSync(target));
  if (delta === ".." || delta.startsWith(`..${sep}`) || isAbsolute(delta)) return undefined;
  return target;
}
/** Prove a declared digest against a regular Git-selected source or its deterministic native-skill projection.
 * @param {string} source @param {string} declaredPath @param {string} expectedHash @param {Set<string>} selected
 */
export function proveInventoryDigest(source, declaredPath, expectedHash, selected) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Inventory digest is not SHA256");
  const original = `_bmad/${declaredPath}`;
  const parts = declaredPath.split("/");
  const skillIndex = parts.findIndex((part) => part.startsWith("bmad-"));
  const projected = skillIndex >= 0 ? `.claude/skills/${parts.slice(skillIndex).join("/")}` : "";
  const file =
    selectedFile(source, original, selected) ??
    (projected ? selectedFile(source, projected, selected) : undefined);
  if (!file || createHash("sha256").update(readFileSync(file)).digest("hex") !== expectedHash)
    throw new Error(
      "Reviewed vendor inventory digest does not match its confined Git-selected source",
    );
  return expectedHash;
}

/** Prove only finite reviewed non-secret metadata; no automatic unknown-finding disposition.
 * @param {string} source @param {readonly string[]} entries
 */
export function proveReviewedNonSecrets(source, entries) {
  const policy = decodeJson(readFileSync(resolve(root, "quality/secret-policy.json"), "utf8"));
  if (
    !record(policy) ||
    policy.schemaVersion !== 1 ||
    !record(policy.manifest) ||
    policy.manifest.path !== "_bmad/_config/files-manifest.csv" ||
    !Array.isArray(policy.manifest.entries) ||
    !Array.isArray(policy.truncatedJwtPaths)
  )
    throw new Error("Invalid reviewed non-secret policy");
  const selected = new Set(entries);
  /** @type {string[]} */
  const hashes = [];
  const manifestPath = selectedFile(source, policy.manifest.path, selected);
  /** @type {{path:string,content:string} | undefined} */
  let manifestFixture;
  if (manifestPath) {
    const lines = readFileSync(manifestPath, "utf8").split(/\r?\n/);
    if (lines[0] !== "type,name,module,path,hash")
      throw new Error("Vendor inventory schema changed; review non-secret proof");
    const rows = lines
      .slice(1)
      .filter(Boolean)
      .map((line) => /^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([a-f0-9]{64})"$/.exec(line));
    for (const entry of /** @type {unknown[]} */ (policy.manifest.entries)) {
      if (
        !record(entry) ||
        ["type", "name", "module", "path"].some((key) => typeof entry[key] !== "string")
      )
        throw new Error("Invalid reviewed inventory identity");
      const matches = rows.filter(
        (row) =>
          row &&
          row[1] === entry.type &&
          row[2] === entry.name &&
          row[3] === entry.module &&
          row[4] === entry.path,
      );
      const row = matches.length === 1 ? matches[0] : undefined;
      if (!row || typeof row[4] !== "string" || typeof row[5] !== "string")
        throw new Error("Reviewed vendor inventory identity is missing or ambiguous");
      hashes.push(proveInventoryDigest(source, row[4], row[5], selected));
      manifestFixture ??= {
        path: policy.manifest.path,
        content: `type,name,module,path,hash\n${row[0]}\n`,
      };
    }
  }
  const publicHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const publicLine = `    const expiredToken = '${publicHeader}...'; // Expired token`;
  /** @type {string[]} */
  const jwtPaths = [];
  /** @type {{path:string,content:string} | undefined} */
  let jwtFixture;
  for (const value of /** @type {unknown[]} */ (policy.truncatedJwtPaths)) {
    if (
      typeof value !== "string" ||
      !/^\.claude\/skills\/bmad-[a-z-]+\/resources\/knowledge\/api-testing-patterns\.md$/.test(
        value,
      )
    )
      throw new Error("Invalid reviewed JWT example path");
    const file = selectedFile(source, value, selected);
    if (!file) continue;
    const content = readFileSync(file, "utf8");
    if (!content.split(/\r?\n/).includes(publicLine))
      throw new Error("Reviewed truncated JWT example changed; secret waiver is not applicable");
    jwtPaths.push(value);
    jwtFixture ??= { path: value, content };
  }
  return {
    hashes: [...new Set(hashes)].sort(),
    manifestPath: policy.manifest.path,
    jwtPaths,
    publicLine,
    manifestFixture,
    jwtFixture,
  };
}
/** Generate trusted default-only configurations outside scanned source, with checked and narrow non-secret evidence.
 * @param {string} source @param {string} scratchParent @param {readonly string[]} selected
 */
export function securityPolicies(source, scratchParent, selected) {
  rejectImplicitGitleaksPolicy(source);
  const proof = proveReviewedNonSecrets(source, selected);
  mkdirSync(scratchParent, { recursive: true });
  const directory = mkdtempSync(resolve(scratchParent, "security-policy-"));
  let config =
    "# Mandatory WPM defaults; source policy files cannot override this file.\n[extend]\nuseDefault = true\n";
  if (proof.hashes.length)
    config += `\n[[allowlists]]\ndescription = "Verified vendor file inventory SHA256 values"\ntargetRules = ["generic-api-key"]\ncondition = "AND"\npaths = [${JSON.stringify(`^${escaped(proof.manifestPath)}$`)}]\nregexTarget = "secret"\nregexes = [${JSON.stringify(`^(?:${proof.hashes.join("|")})$`)}]\n`;
  if (proof.jwtPaths.length)
    config += `\n[[allowlists]]\ndescription = "Reviewed public JWT header truncated before payload and signature"\ntargetRules = ["generic-api-key"]\ncondition = "AND"\npaths = [${proof.jwtPaths.map((path) => JSON.stringify(`^${escaped(path)}$`)).join(", ")}]\nregexTarget = "line"\nregexes = [${JSON.stringify(gitleaksExactLinePattern(proof.publicLine))}]\n`;
  const gitleaksConfig = resolve(directory, "gitleaks.toml");
  const gitleaksIgnore = resolve(directory, ".gitleaksignore");
  const osvConfig = resolve(directory, "osv-scanner.toml");
  writeFileSync(gitleaksConfig, config);
  writeFileSync(gitleaksIgnore, "");
  writeFileSync(osvConfig, "# Mandatory empty WPM policy: no vulnerability ignores.\n");
  return {
    gitleaksConfig,
    gitleaksIgnore,
    osvConfig,
    reviewedFixtures: [
      ...(proof.manifestFixture ? [proof.manifestFixture] : []),
      ...(proof.jwtFixture ? [proof.jwtFixture] : []),
    ],
    proof,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
