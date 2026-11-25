import { win32 } from "node:path";

/** A native connection declaration; preparing it neither starts nor authenticates a server. */
interface McpRequirement {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  requiredVariables: string[];
  authenticated: false;
  serverStarted: false;
}
interface ContextFile {
  path: string;
  contents: string;
}
interface Projection {
  files: ContextFile[];
  requirements: McpRequirement[];
  requiredVariables: string[];
}
type Target = "codex" | "claude";
type Mapping = Record<string, unknown>;
const variable = /^[A-Za-z_][A-Za-z0-9_]*$/;

function mapping(value: unknown, label: string): Mapping {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be a mapping`);
  return value as Mapping;
}
function text(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new Error(`${label} must be nonempty text without control characters`);
  return value;
}
function fields(value: Mapping, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`unsupported ${label} field: ${key}`);
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => text(item, label));
}
function reference(value: unknown, label: string): string {
  const source = text(value, label);
  const match = /^\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(source);
  if (!match?.[1])
    throw new Error(
      `${label} must reference one environment variable; literal values are not portable credentials`,
    );
  return match[1];
}
function bindings(value: unknown, label: string): [string, unknown][] {
  if (value === undefined) return [];
  const object = mapping(value, label);
  return Object.keys(object)
    .sort()
    .map((key) => [key, object[key]]);
}
function quoted(value: string): string {
  return JSON.stringify(value);
}
function endpoint(value: unknown): string {
  const result = text(value, "MCP URL");
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error("MCP URL must be an absolute HTTP endpoint");
  }
  if (url.username || url.password || url.search || url.hash || result.includes(`\${`))
    throw new Error(
      "MCP URL must not contain credentials, query parameters, fragments or variable substitutions",
    );
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    throw new Error("MCP URL must use HTTPS, or HTTP on literal loopback");
  return result;
}
function nonempty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Project fully resolved APM MCP declarations to portable, secret-free native project configuration.
 * Values remain declarations; no environment, filesystem, transport or process is consulted.
 */
export function projectMcp(manifest: unknown, target: Target): Projection {
  if (target !== "codex" && target !== "claude") throw new Error("unsupported MCP target");
  const source = mapping(manifest, "APM manifest");
  for (const field of ["scripts", "lifecycle"])
    if (nonempty(source[field]))
      throw new Error(`APM ${field} is outside worker-context projection`);
  const dependencies =
    source.dependencies === undefined ? {} : mapping(source.dependencies, "APM dependencies");
  if (nonempty(dependencies.lsp))
    throw new Error("APM LSP declarations are outside worker-context projection");
  const declarations = dependencies.mcp ?? [];
  if (!Array.isArray(declarations)) throw new Error("APM MCP dependencies must be an array");
  const names = new Set<string>();
  const requirements: McpRequirement[] = [];
  const native: [string, Mapping][] = [];
  const toml: string[] = [];
  for (const declaration of declarations) {
    if (typeof declaration === "string")
      throw new Error("resolve MCP registry entry before projection");
    const server = mapping(declaration, "MCP declaration");
    const name = text(server.name, "MCP name");
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))
      throw new Error("MCP name must be a portable identifier");
    if (names.has(name.toLowerCase())) throw new Error(`duplicate MCP name: ${name}`);
    names.add(name.toLowerCase());
    if (server.targets !== undefined) {
      const targets = strings(server.targets, "MCP targets");
      if (!targets.length) throw new Error("MCP targets must not be empty");
      if (targets.some((selected) => selected !== "codex" && selected !== "claude"))
        throw new Error("unsupported MCP target selector; use codex or claude");
      if (!targets.includes(target)) continue;
    }
    if (server.registry !== false)
      throw new Error(`resolve MCP registry entry before projection: ${name}`);
    fields(
      server,
      [
        "name",
        "registry",
        "transport",
        "command",
        "args",
        "env",
        "headers",
        "url",
        "targets",
        "version",
      ],
      "MCP",
    );
    if (server.version !== undefined) text(server.version, "MCP version");
    const transport = server.transport === "streamable-http" ? "http" : server.transport;
    if (transport !== "stdio" && transport !== "http")
      throw new Error(`unsupported MCP transport: ${String(transport)}`);
    const required = new Set<string>();
    const configuration: Mapping = { type: transport };
    const lines = [`[mcp_servers.${quoted(name)}]`];
    if (transport === "stdio") {
      if (server.url !== undefined || server.headers !== undefined)
        throw new Error("stdio MCP cannot declare URL or headers");
      const command = text(server.command, "MCP command");
      if (
        command.includes(`\${`) ||
        (command.includes(" ") && server.args === undefined && !win32.isAbsolute(command))
      )
        throw new Error(
          "MCP command must be an explicit binary path, not a shell command or variable",
        );
      const args = server.args === undefined ? [] : strings(server.args, "MCP args");
      if (
        args.some(
          (arg) =>
            arg.includes(`\${`) ||
            /(?:^|[-_])(?:token|password|secret|api[-_]?key|authorization)(?:=|:|$)/i.test(arg),
        )
      )
        throw new Error(
          "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
        );
      configuration.command = command;
      configuration.args = args;
      lines.push(`command = ${quoted(command)}`, `args = [${args.map(quoted).join(", ")}]`);
      const environment: [string, string][] = [];
      const environmentNames = new Set<string>();
      for (const [key, value] of bindings(server.env, "MCP environment")) {
        if (!variable.test(key)) throw new Error("MCP environment name must be an identifier");
        if (environmentNames.has(key.toLowerCase()))
          throw new Error("duplicate portable MCP environment name");
        environmentNames.add(key.toLowerCase());
        const name = reference(value, "MCP environment value");
        if (target === "codex" && key !== name)
          throw new Error(`Codex cannot rename runtime environment variable ${name} to ${key}`);
        required.add(name);
        environment.push([key, `\${${name}}`]);
      }
      if (environment.length) configuration.env = Object.fromEntries(environment);
      if (required.size) lines.push(`env_vars = [${[...required].map(quoted).join(", ")}]`);
      requirements.push({
        name,
        transport,
        command,
        requiredVariables: [...required].sort(),
        authenticated: false,
        serverStarted: false,
      });
    } else {
      if (server.command !== undefined || server.args !== undefined || server.env !== undefined)
        throw new Error("HTTP MCP cannot declare a command, args or stdio environment");
      const url = endpoint(server.url);
      configuration.url = url;
      lines.push(`url = ${quoted(url)}`);
      const headers: [string, string][] = [];
      const nativeHeaders: [string, string][] = [];
      const headerNames = new Set<string>();
      for (const [key, value] of bindings(server.headers, "MCP headers")) {
        if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key))
          throw new Error("invalid MCP HTTP header name");
        if (headerNames.has(key.toLowerCase()))
          throw new Error(`duplicate MCP HTTP header: ${key}`);
        headerNames.add(key.toLowerCase());
        const raw = text(value, "MCP header value");
        const bearer = /^Bearer (\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\})$/.exec(raw);
        const name = reference(bearer?.[1] ?? raw, "MCP header value");
        if (bearer && key.toLowerCase() !== "authorization")
          throw new Error("Bearer interpolation is supported only for Authorization");
        required.add(name);
        headers.push([key, `${bearer ? "Bearer " : ""}\${${name}}`]);
        if (bearer) lines.push(`bearer_token_env_var = ${quoted(name)}`);
        else nativeHeaders.push([key, name]);
      }
      if (headers.length) configuration.headers = Object.fromEntries(headers);
      if (nativeHeaders.length) {
        lines.push(`[mcp_servers.${quoted(name)}.env_http_headers]`);
        for (const [key, name] of nativeHeaders) lines.push(`${quoted(key)} = ${quoted(name)}`);
      }
      requirements.push({
        name,
        transport,
        requiredVariables: [...required].sort(),
        authenticated: false,
        serverStarted: false,
      });
    }
    native.push([name, configuration]);
    toml.push(`${lines.join("\n")}\n`);
  }
  const requiredVariables = [
    ...new Set(requirements.flatMap((item) => item.requiredVariables)),
  ].sort();
  const files =
    native.length === 0
      ? []
      : target === "claude"
        ? [
            {
              path: ".mcp.json",
              contents: `${JSON.stringify({ mcpServers: Object.fromEntries(native) }, null, 2)}\n`,
            },
          ]
        : [{ path: ".codex/config.toml", contents: `${toml.join("\n")}` }];
  return { files, requirements, requiredVariables };
}
