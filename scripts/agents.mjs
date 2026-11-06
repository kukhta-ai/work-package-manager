import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, stringify } from "yaml";

export const managedSkills = [
  "wpm-repo-dev",
  "wpm-repo-test",
  "wpm-repo-architecture",
  "wpm-repo-review",
  "wpm-repo-release",
];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} text @returns {unknown} */
function yaml(text) {
  const document = parseDocument(text, { uniqueKeys: true, strict: true });
  if (document.errors.length > 0) throw new Error(document.errors.map((e) => e.message).join("; "));
  return document.toJS({ maxAliasCount: 0 });
}

/** @param {string} root @param {string} path */
function confinedFile(root, path) {
  const absolute = resolve(root, path);
  const inside = relative(root, absolute);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`Reference escapes the repository: ${path}`);
  }
  const components = inside.split(sep);
  const normalized = components.map((part) => part.toLowerCase());
  const privateNames = new Set([
    ".git",
    "node_modules",
    "_bmad-output",
    "skills-results",
    ".quality",
    "dist",
    "builds",
    "coverage",
    "test-results",
    ".wpm",
    ".omc",
    ".remember",
    ".serena",
    ".ssh",
    ".aws",
    ".env",
    ".npmrc",
    "auth.json",
    "settings.local.json",
  ]);
  if (
    normalized.some(
      (part, index) =>
        privateNames.has(part) ||
        part.startsWith(".env.") ||
        part.startsWith(".wpm-") ||
        (part === ".bmad" && ["local", "archive-staging"].includes(normalized[index + 1] ?? "")),
    )
  ) {
    throw new Error(`Reference enters private or generated state: ${path}`);
  }
  let cursor = root;
  for (const part of components) {
    cursor = resolve(cursor, part);
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error(`Symlink in agent artifact path: ${path}`);
  }
  if (!lstatSync(absolute).isFile()) throw new Error(`Expected a regular file: ${path}`);
  return absolute;
}

/** @param {string} root @param {string} path */
function read(root, path) {
  return readFileSync(confinedFile(root, path), "utf8");
}

/** @param {string} root @param {string} path @param {boolean} create */
function safeDirectory(root, path, create) {
  const inside = relative(root, resolve(root, path));
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`Directory escapes repository: ${path}`);
  }
  let cursor = root;
  for (const part of inside.split(sep)) {
    cursor = resolve(cursor, part);
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Unsafe agent directory: ${path}`);
    } catch (error) {
      if (!(create && error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw error;
      mkdirSync(cursor);
    }
  }
}

/** @param {string} text @param {string} name @param {boolean} claude */
function skillDocument(text, name, claude) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match?.[1] || match[2] === undefined) throw new Error(`Missing frontmatter: ${name}`);
  const metadata = yaml(match[1]);
  if (!record(metadata)) throw new Error(`Invalid skill frontmatter: ${name}`);
  const expectedKeys =
    claude && name === "wpm-repo-release"
      ? ["name", "description", "disable-model-invocation"]
      : ["name", "description"];
  if (Object.keys(metadata).some((key) => !expectedKeys.includes(key))) {
    throw new Error(`Unsupported skill metadata: ${name}`);
  }
  if (
    metadata.name !== name ||
    typeof metadata.description !== "string" ||
    metadata.description.length < 20
  ) {
    throw new Error(`Invalid name or description: ${name}`);
  }
  if (claude && name === "wpm-repo-release" && metadata["disable-model-invocation"] !== true) {
    throw new Error("Claude release skill must require explicit invocation");
  }
  if (/\bTODO\b|\[INSERT|TBD/.test(match[2])) throw new Error(`Unfinished skill: ${name}`);
  return { metadata, body: match[2] };
}

/** @param {string} root */
function manifest(root) {
  /** @type {unknown} */
  const value = JSON.parse(read(root, ".agents/manifest.json"));
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.source !== ".agents/skills" ||
    value.projection !== ".claude/skills" ||
    value.releaseSkill !== "wpm-repo-release" ||
    JSON.stringify(value.skills) !== JSON.stringify(managedSkills) ||
    !record(value.clients)
  ) {
    throw new Error("Invalid agent manifest or incomplete managed skill scope");
  }
  for (const client of ["codex", "claude"]) {
    const pin = value.clients[client];
    if (!record(pin) || typeof pin.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pin.version)) {
      throw new Error(`Missing exact client version pin: ${client}`);
    }
  }
  return value;
}

/** @param {string} root @param {string} file @param {string} body */
function links(root, file, body) {
  const references = [
    ...body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g),
    ...body.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm),
  ];
  for (const match of references) {
    const target = match[1];
    if (!target) continue;
    if (/^https:\/\//.test(target)) continue;
    if (/^[a-z][\w+.-]*:|^\/|^~|^\\/i.test(target) || target.includes("\\")) {
      throw new Error(`Non-repository reference in ${file}: ${target}`);
    }
    const withoutFragment = target.split("#")[0];
    if (withoutFragment)
      confinedFile(root, relative(root, resolve(root, dirname(file), withoutFragment)));
  }
}

/** @param {string} root @param {string} directory */
function regularTree(root, directory) {
  safeDirectory(root, directory, false);
  const absolute = resolve(root, directory);
  if (lstatSync(absolute).isSymbolicLink())
    throw new Error(`Symlinked skill directory: ${directory}`);
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlinked agent artifact: ${child}`);
    if (entry.isDirectory()) regularTree(root, child);
    else confinedFile(root, child);
  }
}

/** @param {string} root @returns {string[]} */
export function checkArtifacts(root) {
  const errors = [];
  try {
    manifest(root);
  } catch (error) {
    return [String(error)];
  }
  for (const name of managedSkills) {
    try {
      const source = `.agents/skills/${name}/SKILL.md`;
      const projection = `.claude/skills/${name}/SKILL.md`;
      regularTree(root, `.agents/skills/${name}`);
      regularTree(root, `.claude/skills/${name}`);
      const canonical = skillDocument(read(root, source), name, false);
      const generated = skillDocument(read(root, projection), name, true);
      if (
        generated.body !== canonical.body ||
        generated.metadata.description !== canonical.metadata.description
      ) {
        throw new Error(`Stale Claude projection: ${name}; run agents:generate`);
      }
      links(root, source, canonical.body);
      links(root, projection, generated.body);
      const policy = yaml(read(root, `.agents/skills/${name}/agents/openai.yaml`));
      if (
        !record(policy) ||
        !record(policy.interface) ||
        typeof policy.interface.short_description !== "string"
      ) {
        throw new Error(`Invalid OpenAI UI metadata: ${name}`);
      }
      if (
        name === "wpm-repo-release" &&
        (!record(policy.policy) || policy.policy.allow_implicit_invocation !== false)
      ) {
        throw new Error("Codex release skill must require explicit invocation");
      }
      if (
        name !== "wpm-repo-release" &&
        record(policy.policy) &&
        policy.policy.allow_implicit_invocation === false
      ) {
        throw new Error(`Unexpected explicit-only policy: ${name}`);
      }
    } catch (error) {
      errors.push(String(error));
    }
  }
  for (const directory of [".agents/skills", ".claude/skills"]) {
    for (const entry of readdirSync(resolve(root, directory))) {
      if (entry.startsWith("wpm-repo-") && !managedSkills.includes(entry))
        errors.push(`Unmanaged repository skill: ${directory}/${entry}`);
    }
  }
  try {
    read(root, "AGENTS.md");
    if (read(root, "CLAUDE.md") !== "@AGENTS.md\n")
      errors.push("CLAUDE.md must import @AGENTS.md without duplicating policy");
  } catch (error) {
    errors.push(String(error));
  }
  return errors;
}

/** Generate only repository-owned Claude skill files. @param {string} root */
export function generateArtifacts(root) {
  manifest(root);
  for (const name of managedSkills) {
    const canonical = skillDocument(read(root, `.agents/skills/${name}/SKILL.md`), name, false);
    const folder = resolve(root, `.claude/skills/${name}`);
    safeDirectory(root, `.claude/skills/${name}`, true);
    regularTree(root, `.claude/skills/${name}`);
    const metadata = { ...canonical.metadata };
    if (name === "wpm-repo-release") metadata["disable-model-invocation"] = true;
    const file = resolve(folder, "SKILL.md");
    try {
      confinedFile(root, relative(root, file));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    writeFileSync(file, `---\n${stringify(metadata)}---\n${canonical.body}`);
  }
}

/** @param {string} root @param {string[]} args @returns {string[]} */
export function doctor(root, args) {
  const errors = checkArtifacts(root);
  const value = manifest(root);
  const flags = new Set(["--clients", "--codex-bin", "--claude-bin"]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!flag || !flags.has(flag)) errors.push(`Unsupported doctor argument: ${String(flag)}`);
    else if (flag !== "--clients") {
      if (!args.includes("--clients")) errors.push(`${flag} requires --clients`);
      index++;
    }
  }
  if (args.includes("--clients")) {
    for (const client of ["codex", "claude"]) {
      const index = args.indexOf(`--${client}-bin`);
      const binary = index >= 0 ? args[index + 1] : undefined;
      if (!binary || !isAbsolute(binary)) {
        errors.push(`Explicit absolute --${client}-bin required; no PATH/global fallback`);
        continue;
      }
      const result = spawnSync(binary, ["--version"], {
        cwd: root,
        encoding: "utf8",
        timeout: 10_000,
        shell: false,
      });
      const clients = value.clients;
      const pin = record(clients) ? clients[client] : undefined;
      const expected = record(pin) ? pin.version : undefined;
      const actual = result.stdout?.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
      if (result.error || result.status !== 0 || actual !== expected)
        errors.push(`Client ${client} does not match pinned version ${String(expected)}`);
    }
  }
  return errors;
}

/** Check a frozen Git-index tree without reading working-tree artifact bytes.
 * @param {string} root @returns {string[]}
 */
export function checkIndex(root) {
  const temporary = mkdtempSync(resolve(tmpdir(), "wpm-agents-index-"));
  const snapshot = resolve(temporary, "snapshot");
  mkdirSync(snapshot);
  try {
    const tree = spawnSync("git", ["write-tree"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      shell: false,
    });
    if (tree.error || tree.status !== 0 || !/^[a-f0-9]{40,64}\s*$/.test(tree.stdout))
      throw new Error("Cannot freeze Git index for agent artifact validation");
    const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, "index") };
    const load = spawnSync("git", ["read-tree", tree.stdout.trim()], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 30_000,
      shell: false,
    });
    if (load.error || load.status !== 0) throw new Error("Cannot load frozen agent artifact index");
    const checkout = spawnSync(
      "git",
      ["checkout-index", "--all", `--prefix=${snapshot.replaceAll("\\", "/")}/`],
      { cwd: root, env, encoding: "utf8", timeout: 30_000, shell: false },
    );
    if (checkout.error || checkout.status !== 0)
      throw new Error("Cannot export frozen agent artifact index");
    return checkArtifacts(snapshot);
  } catch (error) {
    return [String(error)];
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const invoked = process.argv[1];
if (invoked && realpathSync(invoked) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const mode = process.argv[2];
  try {
    if (mode === "generate") generateArtifacts(root);
    else if (mode !== "check" && mode !== "doctor")
      throw new Error(
        "Usage: agents.mjs generate|check|doctor [--clients --codex-bin ABS --claude-bin ABS]",
      );
    const args = process.argv.slice(3);
    if (mode !== "doctor" && args.some((arg) => mode !== "check" || arg !== "--index"))
      throw new Error("Only check accepts --index; doctor accepts explicit client flags");
    const errors =
      mode === "doctor"
        ? doctor(root, args)
        : args.includes("--index")
          ? checkIndex(root)
          : checkArtifacts(root);
    for (const error of errors) process.stderr.write(`${error}\n`);
    if (errors.length > 0) process.exitCode = 1;
    else
      process.stdout.write(
        `Native agent artifacts valid${mode === "doctor" ? "; static/version checks do not qualify fresh-agent behavior" : ""}.\n`,
      );
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  }
}
