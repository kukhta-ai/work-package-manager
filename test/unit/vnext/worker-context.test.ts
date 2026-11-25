import { describe, expect, it } from "vitest";
import { projectMcp } from "../../../src/vnext/core/worker-context.js";

const http = {
  name: "documents",
  registry: false,
  transport: "http",
  url: "https://mcp.example.test/api",
  headers: { Authorization: `Bearer \${DOCUMENT_TOKEN}`, "X-Tenant": `\${env:TENANT}` },
};
const stdio = {
  name: "local-tools",
  registry: false,
  transport: "stdio",
  command: "existing-server",
  args: ["--read-only", "document scope"],
  env: { SERVER_TOKEN: `\${env:SERVER_TOKEN}` },
};
const manifest = (...servers: unknown[]) => ({ dependencies: { mcp: servers } });

describe("secret-free worker MCP projection", () => {
  it("generates Claude project declarations with runtime references rather than credentials", () => {
    const result = projectMcp(manifest(http, stdio), "claude");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(".mcp.json");
    const value: unknown = JSON.parse(result.files[0]?.contents ?? "");
    expect(value).toEqual({
      mcpServers: {
        documents: {
          type: "http",
          url: "https://mcp.example.test/api",
          headers: { Authorization: `Bearer \${DOCUMENT_TOKEN}`, "X-Tenant": `\${TENANT}` },
        },
        "local-tools": {
          type: "stdio",
          command: "existing-server",
          args: ["--read-only", "document scope"],
          env: { SERVER_TOKEN: `\${SERVER_TOKEN}` },
        },
      },
    });
    expect(result.requiredVariables).toEqual(["DOCUMENT_TOKEN", "SERVER_TOKEN", "TENANT"]);
    expect(result.requirements).toEqual([
      {
        name: "documents",
        transport: "http",
        requiredVariables: ["DOCUMENT_TOKEN", "TENANT"],
        authenticated: false,
        serverStarted: false,
      },
      {
        name: "local-tools",
        transport: "stdio",
        command: "existing-server",
        requiredVariables: ["SERVER_TOKEN"],
        authenticated: false,
        serverStarted: false,
      },
    ]);
  });

  it("uses Codex native environment forwarding and HTTP credential fields", () => {
    const result = projectMcp(manifest(http, stdio), "codex");
    expect(result.files).toEqual([
      {
        path: ".codex/config.toml",
        contents:
          '[mcp_servers."documents"]\nurl = "https://mcp.example.test/api"\nbearer_token_env_var = "DOCUMENT_TOKEN"\n[mcp_servers."documents".env_http_headers]\n"X-Tenant" = "TENANT"\n\n[mcp_servers."local-tools"]\ncommand = "existing-server"\nargs = ["--read-only", "document scope"]\nenv_vars = ["SERVER_TOKEN"]\n',
      },
    ]);
    expect(result.files[0]?.contents).not.toContain(`\${`);
    expect(result.requirements.every((entry) => !entry.serverStarted && !entry.authenticated)).toBe(
      true,
    );
  });

  it("escapes TOML strings without admitting extra tables or directives", () => {
    const result = projectMcp(
      manifest({
        ...stdio,
        name: "server.with.dots",
        command: 'C:\\Program Files\\tools\\server"name.exe',
        args: ['backslash\\quote"', "tabs are rejected separately"],
      }),
      "codex",
    );
    expect(result.files[0]?.contents).toContain('[mcp_servers."server.with.dots"]');
    expect(result.files[0]?.contents).toContain(
      'command = "C:\\\\Program Files\\\\tools\\\\server\\"name.exe"',
    );
    expect(result.files[0]?.contents).toContain(
      'args = ["backslash\\\\quote\\"", "tabs are rejected separately"]',
    );
  });

  it("does not mutate manifest input or include dev-only connection declarations", () => {
    const source = { ...manifest(http), devDependencies: { mcp: [stdio] } };
    const before = JSON.stringify(source);
    expect(projectMcp(source, "codex").requirements.map((entry) => entry.name)).toEqual([
      "documents",
    ]);
    expect(JSON.stringify(source)).toBe(before);
    expect(projectMcp({}, "claude")).toEqual({
      files: [],
      requirements: [],
      requiredVariables: [],
    });
  });

  it("keeps projection deterministic across mapping key order", () => {
    const reordered = {
      ...http,
      headers: { "X-Tenant": `\${env:TENANT}`, Authorization: `Bearer \${DOCUMENT_TOKEN}` },
    };
    expect(projectMcp(manifest(http), "codex")).toEqual(projectMcp(manifest(reordered), "codex"));
    expect(projectMcp(manifest(http), "claude")).toEqual(projectMcp(manifest(reordered), "claude"));
  });

  it("honors explicit target selection and normalizes streamable HTTP", () => {
    const selected = manifest({ ...http, targets: ["claude"] });
    expect(projectMcp(selected, "codex").files).toEqual([]);
    expect(projectMcp(selected, "claude").files).toHaveLength(1);
    expect(projectMcp(manifest({ ...http, transport: "streamable-http" }), "codex")).toEqual(
      projectMcp(manifest(http), "codex"),
    );
  });

  it("permits an explicitly declared loopback HTTP fixture without relaxing remote HTTPS", () => {
    for (const url of [
      "http://localhost:9000/mcp",
      "http://127.0.0.1:9000/mcp",
      "http://[::1]:9000/mcp",
    ])
      expect(projectMcp(manifest({ ...http, url }), "codex").files).toHaveLength(1);
    expect(() =>
      projectMcp(manifest({ ...http, url: "http://example.test/mcp" }), "codex"),
    ).toThrow("HTTPS");
  });

  it("does not silently rename a Codex runtime environment variable", () => {
    const source = manifest({ ...stdio, env: { SERVER_TOKEN: `\${SOURCE_TOKEN}` } });
    expect(() => projectMcp(source, "codex")).toThrow("cannot rename");
    expect(projectMcp(source, "claude").requiredVariables).toEqual(["SOURCE_TOKEN"]);
  });

  it.each([
    { ...http, headers: { Authorization: "Bearer hardcoded-token" } },
    { ...http, headers: { "X-Api-Key": "hardcoded-token" } },
    { ...http, headers: { "X-Tenant": "tenant-literal" } },
    { ...stdio, env: { API_KEY: "hardcoded-token" } },
    { ...stdio, env: { SERVER_TOKEN: `\${SERVER_TOKEN:-fallback-secret}` } },
    { ...http, headers: { Authorization: `Bearer \${TOKEN} trailing-literal` } },
  ])("rejects secret or literal binding without echoing its value", (server) => {
    for (const target of ["codex", "claude"] as const) {
      expect(() => projectMcp(manifest(server), target)).toThrow("environment variable");
      try {
        projectMcp(manifest(server), target);
      } catch (error) {
        expect(String(error)).not.toMatch(
          /hardcoded-token|tenant-literal|fallback-secret|trailing-literal/,
        );
      }
    }
  });

  it.each([
    { ...http, name: 'x"]\n[model_providers.evil]' },
    { ...stdio, command: "existing-server\nmalicious" },
    { ...stdio, args: ["--scope\tprivate"] },
    { ...stdio, args: ["--token", "hardcoded-token"] },
    { ...stdio, args: ["--api-key=hardcoded-token"] },
    { ...stdio, args: ["--access-token=hardcoded-token"] },
    { ...stdio, args: ["--client-secret", "hardcoded-token"] },
    { ...http, url: "https://user:password@mcp.example.test/api" },
    { ...http, url: "https://mcp.example.test/api?token=literal" },
    { ...http, url: "https://mcp.example.test/api#fragment" },
    { ...http, headers: { "Authorization\r\nX-Evil": `\${TOKEN}` } },
  ])("rejects injection and inline credential channels", (server) => {
    expect(() => projectMcp(manifest(server), "codex")).toThrow();
    expect(() => projectMcp(manifest(server), "claude")).toThrow();
  });

  it.each([
    "io.github.example/server",
    { ...http, registry: true },
    { ...http, transport: "sse" },
    { ...http, targets: [] },
    { ...http, oauth: { clientSecret: "literal" } },
    { ...http, command: "unexpected-command" },
    { ...stdio, url: "https://example.test" },
  ])("fails explicitly for unresolved or unsupported connection behavior", (server) => {
    expect(() => projectMcp(manifest(server), "codex")).toThrow();
  });

  it("rejects duplicate identities and case-alias headers", () => {
    expect(() =>
      projectMcp(
        manifest({
          ...stdio,
          env: { SERVER_TOKEN: `\${SERVER_TOKEN}`, server_token: `\${server_token}` },
        }),
        "codex",
      ),
    ).toThrow("duplicate portable MCP environment name");
    expect(() => projectMcp(manifest(http, { ...http, name: "DOCUMENTS" }), "codex")).toThrow(
      "duplicate MCP name",
    );
    expect(() =>
      projectMcp(
        manifest({ ...http, headers: { Authorization: `\${TOKEN}`, authorization: `\${OTHER}` } }),
        "codex",
      ),
    ).toThrow("duplicate MCP HTTP header");
  });

  it.each([
    { dependencies: { mcp: {} } },
    { dependencies: { mcp: [null] } },
    { dependencies: { lsp: ["language-server"] } },
    { lifecycle: { install: ["run-script"] } },
    { scripts: { setup: "run-script" } },
    [],
    null,
  ])("rejects malformed or excluded manifest mechanisms", (source) => {
    expect(() => projectMcp(source, "codex")).toThrow();
  });
});

describe("worker-context diagnostics and native capability boundaries", () => {
  const message = "must be nonempty text without control characters";
  it.each([
    [null, "APM manifest must be a mapping"],
    [false, "APM manifest must be a mapping"],
    [42, "APM manifest must be a mapping"],
    [[], "APM manifest must be a mapping"],
    [{ dependencies: false }, "APM dependencies must be a mapping"],
    [{ dependencies: { mcp: false } }, "APM MCP dependencies must be an array"],
    [manifest(null), "MCP declaration must be a mapping"],
    [manifest(42), "MCP declaration must be a mapping"],
    [manifest("io.example/server"), "resolve MCP registry entry before projection"],
    [
      manifest({ ...http, registry: true }),
      "resolve MCP registry entry before projection: documents",
    ],
    [manifest({ ...http, name: undefined }), `MCP name ${message}`],
    [manifest({ ...http, name: 42 }), `MCP name ${message}`],
    [manifest({ ...http, name: "" }), `MCP name ${message}`],
    [manifest({ ...http, name: "x\u007f" }), `MCP name ${message}`],
    [manifest({ ...http, name: "/documents" }), "MCP name must be a portable identifier"],
    [manifest({ ...http, name: "documents/" }), "MCP name must be a portable identifier"],
    [manifest({ ...http, targets: {} }), "MCP targets must be an array"],
    [manifest({ ...http, targets: [0] }), `MCP targets ${message}`],
    [manifest({ ...http, targets: [] }), "MCP targets must not be empty"],
    [manifest({ ...http, version: false }), `MCP version ${message}`],
    [manifest({ ...http, transport: "sse" }), "unsupported MCP transport: sse"],
    [manifest({ ...http, transport: undefined }), "unsupported MCP transport: undefined"],
    [manifest({ ...http, tools: ["read"] }), "unsupported MCP field: tools"],
    [manifest({ ...stdio, headers: {} }), "stdio MCP cannot declare URL or headers"],
    [
      manifest({ ...stdio, url: "https://example.test" }),
      "stdio MCP cannot declare URL or headers",
    ],
    [manifest({ ...stdio, command: undefined }), `MCP command ${message}`],
    [manifest({ ...stdio, command: 42 }), `MCP command ${message}`],
    [
      manifest({ ...stdio, command: "some binary", args: undefined }),
      "MCP command must be an explicit binary path, not a shell command or variable",
    ],
    [
      manifest({ ...stdio, command: `\${BINARY}`, args: [] }),
      "MCP command must be an explicit binary path, not a shell command or variable",
    ],
    [manifest({ ...stdio, args: {} }), "MCP args must be an array"],
    [manifest({ ...stdio, args: [false] }), `MCP args ${message}`],
    [
      manifest({ ...stdio, args: ["--scope", `\${VALUE}`] }),
      "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
    ],
    [
      manifest({ ...stdio, args: ["--password", "value"] }),
      "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
    ],
    [
      manifest({ ...stdio, args: ["apikey=value"] }),
      "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
    ],
    [
      manifest({ ...stdio, args: ["--api_key=value"] }),
      "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
    ],
    [
      manifest({ ...stdio, args: ["--api-key=value"] }),
      "MCP arguments cannot embed credentials or variable substitutions; use environment bindings",
    ],
    [manifest({ ...stdio, env: false }), "MCP environment must be a mapping"],
    [
      manifest({ ...stdio, env: { "/TOKEN": `\${TOKEN}` } }),
      "MCP environment name must be an identifier",
    ],
    [
      manifest({ ...stdio, env: { "TOKEN/": `\${TOKEN}` } }),
      "MCP environment name must be an identifier",
    ],
    [manifest({ ...stdio, env: { TOKEN: false } }), `MCP environment value ${message}`],
    [manifest({ ...stdio, env: { TOKEN: "" } }), `MCP environment value ${message}`],
    [
      manifest({ ...stdio, env: { TOKEN: `prefix\${TOKEN}` } }),
      "MCP environment value must reference one environment variable; literal values are not portable credentials",
    ],
    [
      manifest({ ...stdio, env: { TOKEN: `\${TOKEN}suffix` } }),
      "MCP environment value must reference one environment variable; literal values are not portable credentials",
    ],
    [
      manifest({ ...http, args: [] }),
      "HTTP MCP cannot declare a command, args or stdio environment",
    ],
    [
      manifest({ ...http, env: {} }),
      "HTTP MCP cannot declare a command, args or stdio environment",
    ],
    [
      manifest({ ...http, command: "binary" }),
      "HTTP MCP cannot declare a command, args or stdio environment",
    ],
    [manifest({ ...http, url: false }), `MCP URL ${message}`],
    [manifest({ ...http, url: "not-a-url" }), "MCP URL must be an absolute HTTP endpoint"],
    [
      manifest({ ...http, url: "https://user@host.test/path" }),
      "MCP URL must not contain credentials, query parameters, fragments or variable substitutions",
    ],
    [
      manifest({ ...http, url: "https://:password@host.test/path" }),
      "MCP URL must not contain credentials, query parameters, fragments or variable substitutions",
    ],
    [
      manifest({ ...http, url: `https://\${HOST}/path` }),
      "MCP URL must not contain credentials, query parameters, fragments or variable substitutions",
    ],
    [
      manifest({ ...http, url: "ftp://localhost/path" }),
      "MCP URL must use HTTPS, or HTTP on literal loopback",
    ],
    [manifest({ ...http, headers: false }), "MCP headers must be a mapping"],
    [manifest({ ...http, headers: { "/Header": `\${TOKEN}` } }), "invalid MCP HTTP header name"],
    [manifest({ ...http, headers: { Authorization: false } }), `MCP header value ${message}`],
    [
      manifest({ ...http, headers: { Authorization: `prefixBearer \${TOKEN}` } }),
      "MCP header value must reference one environment variable; literal values are not portable credentials",
    ],
    [
      manifest({ ...http, headers: { "X-Token": `Bearer \${TOKEN}` } }),
      "Bearer interpolation is supported only for Authorization",
    ],
  ])("returns specific domain feedback for invalid native declaration %#", (source, expected) => {
    for (const target of ["codex", "claude"] as const)
      expect(() => projectMcp(source, target)).toThrow(expected);
  });

  it("rejects unknown target without parsing source", () => {
    expect(() => projectMcp({}, "unsupported" as "codex")).toThrow("unsupported MCP target");
  });
  it.each([undefined, null, {}, []])("permits empty optional excluded declarations %#", (empty) => {
    expect(
      projectMcp(
        { scripts: empty, lifecycle: empty, dependencies: { lsp: empty, mcp: null } },
        "codex",
      ),
    ).toEqual({ files: [], requirements: [], requiredVariables: [] });
  });
  it.each([
    0,
    false,
    "",
    ["entry"],
    { entry: "value" },
  ])("rejects populated or malformed excluded declarations %#", (value) => {
    expect(() => projectMcp({ scripts: value }, "codex")).toThrow(
      "APM scripts is outside worker-context projection",
    );
    expect(() => projectMcp({ lifecycle: value }, "codex")).toThrow(
      "APM lifecycle is outside worker-context projection",
    );
    expect(() => projectMcp({ dependencies: { lsp: value } }, "codex")).toThrow(
      "APM LSP declarations are outside worker-context projection",
    );
  });
  it("omits empty native containers rather than publishing meaningless configuration", () => {
    const minimalStdio = {
      name: "local",
      registry: false,
      transport: "stdio",
      command: "existing-server",
      version: "1.0.0",
    };
    const minimalHttp = {
      name: "remote",
      registry: false,
      transport: "http",
      url: "https://example.test/mcp",
    };
    expect(projectMcp(manifest(minimalStdio, minimalHttp), "claude").files).toEqual([
      {
        path: ".mcp.json",
        contents: `${JSON.stringify({ mcpServers: { local: { type: "stdio", command: "existing-server", args: [] }, remote: { type: "http", url: "https://example.test/mcp" } } }, null, 2)}\n`,
      },
    ]);
    expect(projectMcp(manifest(minimalStdio), "codex").files).toEqual([
      {
        path: ".codex/config.toml",
        contents: '[mcp_servers."local"]\ncommand = "existing-server"\nargs = []\n',
      },
    ]);
  });
  it("sorts variable requirements independently from declaration keys", () => {
    const input = { ...stdio, env: { A: `\${Z}`, Z: `\${A}` } };
    expect(projectMcp(manifest(input), "claude").requirements[0]?.requiredVariables).toEqual([
      "A",
      "Z",
    ]);
    const inputHttp = {
      ...http,
      headers: { Authorization: `Bearer \${Z}`, "X-Variable": `\${A}` },
    };
    expect(projectMcp(manifest(inputHttp), "codex").requirements[0]?.requiredVariables).toEqual([
      "A",
      "Z",
    ]);
    const pair = { ...stdio, env: { Z: `\${Z}`, A: `\${A}` } };
    expect(projectMcp(manifest(pair), "codex").files[0]?.contents).toContain(
      'env_vars = ["A", "Z"]',
    );
  });
});

describe("explicit MCP target and executable selection", () => {
  it.each([
    { targets: ["typo"] },
    { targets: ["claude-code"] },
    { targets: ["codex", "typo"] },
    { targets: ["all"] },
  ])("rejects unsupported required targets %# instead of dropping declarations", ({ targets }) => {
    for (const target of ["codex", "claude"] as const)
      expect(() => projectMcp(manifest({ ...http, targets }), target)).toThrow(
        "unsupported MCP target selector; use codex or claude",
      );
  });
  it.each([
    "/opt/Approved Tools/mcp-server",
    "C:\\Approved Tools\\server.exe",
    "D:/Approved Tools/server.exe",
  ])("accepts a literal absolute executable path with spaces %s", (command) => {
    const server = { ...stdio, command, args: undefined };
    expect(projectMcp(manifest(server), "codex").files[0]?.contents).toContain(
      `command = ${JSON.stringify(command)}`,
    );
    expect(
      JSON.parse(projectMcp(manifest(server), "claude").files[0]?.contents ?? ""),
    ).toMatchObject({ mcpServers: { "local-tools": { command, args: [] } } });
  });
  it("omits a Codex HTTP header table when no header is declared", () => {
    const server = { ...http, headers: undefined };
    expect(projectMcp(manifest(server), "codex").files).toEqual([
      {
        path: ".codex/config.toml",
        contents: '[mcp_servers."documents"]\nurl = "https://mcp.example.test/api"\n',
      },
    ]);
    const bearerOnly = { ...http, headers: { Authorization: `Bearer \${TOKEN}` } };
    expect(projectMcp(manifest(bearerOnly), "codex").files).toEqual([
      {
        path: ".codex/config.toml",
        contents:
          '[mcp_servers."documents"]\nurl = "https://mcp.example.test/api"\nbearer_token_env_var = "TOKEN"\n',
      },
    ]);
  });
});

describe("explicit native selection preserves supported declarations", () => {
  it.each([
    "codex",
    "claude",
  ] as const)("keeps explicitly selected %s connection and omits it for the other target", (target) => {
    const source = manifest({ ...http, targets: [target] });
    expect(projectMcp(source, target).requirements.map((item) => item.name)).toEqual(["documents"]);
    expect(projectMcp(source, target === "codex" ? "claude" : "codex").files).toEqual([]);
  });
  it("accepts an explicitly disambiguated relative binary path containing spaces", () => {
    const server = { ...stdio, command: "relative tools/server", args: [] };
    expect(projectMcp(manifest(server), "codex").files[0]?.contents).toContain(
      'command = "relative tools/server"\nargs = []\n',
    );
  });
});
