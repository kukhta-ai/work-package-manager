import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  inspectAuthoringClient,
  inspectAuthoringClients,
} from "../../../src/core/operations/authoring-clients.js";
import {
  AUTHORING_CLIENT_IDS,
  evaluateAuthoringClientId,
  listAuthoringClientDefinitions,
} from "../../../src/core/services/authoring-clients.js";

const HOME = "/home/author";

function deps(configRoots: readonly string[] = [], home: string | null = HOME) {
  const fs = new MemoryFileSystem();
  for (const root of configRoots) {
    fs.makeDirectories(`${HOME}/${root}`);
  }
  const env = new FakeEnvironment(home === null ? {} : { env: { HOME: home } });
  return { fs, env };
}

describe("authoring-client registry", () => {
  it("exposes exactly the two stable selectable P0 definitions in deterministic order", () => {
    expect(AUTHORING_CLIENT_IDS).toEqual(["codex", "claude-code"]);
    expect(listAuthoringClientDefinitions()).toEqual([
      {
        id: "codex",
        displayName: "Codex",
        personalSkillsDirectory: "~/.agents/skills",
        workspaceSkillsDirectory: ".agents/skills",
        workspaceFrontDoor: "AGENTS.md",
        detection: {
          basis: "personal-config-directory",
          path: "~/.agents",
        },
        launch: { command: "codex", workingDirectory: "workspace-root" },
        reload: { kind: "automatic-with-restart-fallback" },
      },
      {
        id: "claude-code",
        displayName: "Claude Code",
        personalSkillsDirectory: "~/.claude/skills",
        workspaceSkillsDirectory: ".claude/skills",
        workspaceFrontDoor: "CLAUDE.md",
        detection: {
          basis: "personal-config-directory",
          path: "~/.claude",
        },
        launch: { command: "claude", workingDirectory: "workspace-root" },
        reload: { kind: "live-watch-with-new-directory-restart" },
      },
    ]);
    expect(listAuthoringClientDefinitions()).toEqual(listAuthoringClientDefinitions());
  });

  it("keeps the exported stable ID order immutable at runtime", () => {
    expect(Object.isFrozen(AUTHORING_CLIENT_IDS)).toBe(true);
    expect(() => (AUTHORING_CLIENT_IDS as unknown as string[]).push("unexpected-client")).toThrow(
      TypeError,
    );
    expect(AUTHORING_CLIENT_IDS).toEqual(["codex", "claude-code"]);
  });

  it("does not let one caller mutate the stable catalog seen by later callers", () => {
    const first = listAuthoringClientDefinitions();
    if (first[0] === undefined) {
      throw new Error("Codex definition missing from catalog");
    }
    const codex = first[0] as unknown as {
      displayName: string;
      detection: { path: string };
    };
    codex.displayName = "changed";
    codex.detection.path = "~/changed";

    expect(listAuthoringClientDefinitions()[0]).toMatchObject({
      displayName: "Codex",
      detection: { path: "~/.agents" },
    });
  });

  it.each([
    "codex",
    "claude-code",
  ])("classifies %s as selectable without claiming configuration", (id) => {
    expect(evaluateAuthoringClientId(id)).toMatchObject({
      id,
      supportStatus: "selectable",
      selectable: true,
      configured: false,
    });
  });

  it.each(["hermes", "openclaw"])("classifies %s as recognized but deferred", (id) => {
    expect(evaluateAuthoringClientId(id)).toEqual({
      id,
      supportStatus: "deferred",
      selectable: false,
      configured: false,
      reason: "contract-deferred",
    });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["Codex", "unknown"],
    ["claude", "unknown"],
    ["unknown-client", "unknown"],
  ] as const)("classifies invalid input %j as %s", (input, reason) => {
    expect(evaluateAuthoringClientId(input)).toEqual({
      id: input,
      supportStatus: "invalid",
      selectable: false,
      configured: false,
      reason,
    });
  });
});

describe("read-only authoring-client inspection", () => {
  it("reports current detected/not-detected hints without turning detection into selection", () => {
    const inspected = inspectAuthoringClients(deps([".agents"]));

    expect(inspected.map(({ id, currentDetection }) => ({ id, currentDetection }))).toEqual([
      {
        id: "codex",
        currentDetection: {
          status: "detected",
          basis: "personal-config-directory",
          observedPath: `${HOME}/.agents`,
        },
      },
      {
        id: "claude-code",
        currentDetection: {
          status: "not-detected",
          basis: "personal-config-directory",
          observedPath: `${HOME}/.claude`,
        },
      },
    ]);
    expect(inspected.every((client) => client.configured === false)).toBe(true);
  });

  it("reports detection unavailable for both clients when HOME is absent", () => {
    expect(
      inspectAuthoringClients(deps([], null)).map(({ id, currentDetection }) => ({
        id,
        currentDetection,
      })),
    ).toEqual([
      {
        id: "codex",
        currentDetection: {
          status: "unavailable",
          basis: "personal-config-directory",
          reason: "home-unavailable",
        },
      },
      {
        id: "claude-code",
        currentDetection: {
          status: "unavailable",
          basis: "personal-config-directory",
          reason: "home-unavailable",
        },
      },
    ]);
  });

  it.each([
    "",
    "   ",
    ".",
    "relative/home",
  ])("reports detection unavailable when HOME cannot identify an absolute personal root (%j)", (home) => {
    expect(
      inspectAuthoringClients(deps([], home)).map(({ currentDetection }) => currentDetection),
    ).toEqual([
      {
        status: "unavailable",
        basis: "personal-config-directory",
        reason: "home-unavailable",
      },
      {
        status: "unavailable",
        basis: "personal-config-directory",
        reason: "home-unavailable",
      },
    ]);
  });

  it("does not report a regular file as a detected personal configuration directory", () => {
    const harness = deps();
    harness.fs.write(`${HOME}/.agents`, "not a directory\n");

    expect(inspectAuthoringClient(harness, "codex")).toMatchObject({
      currentDetection: {
        status: "not-detected",
        basis: "personal-config-directory",
        observedPath: `${HOME}/.agents`,
      },
    });
  });

  it.each([
    [[], ["not-detected", "not-detected"]],
    [
      [".agents", ".claude"],
      ["detected", "detected"],
    ],
  ] as const)("covers the closed neither/both detection state for %j", (roots, statuses) => {
    expect(
      inspectAuthoringClients(deps(roots)).map(({ currentDetection }) => currentDetection.status),
    ).toEqual(statuses);
  });

  it("uses the injected Windows path dialect and returns portable observation paths", () => {
    const fs = new MemoryFileSystem();
    const home = "C:\\Users\\author";
    fs.makeDirectories(`${home}\\.claude`);
    const env = new FakeEnvironment({ platform: "win32", env: { HOME: home } });

    expect(
      inspectAuthoringClients({ fs, env }).map(({ id, currentDetection }) => ({
        id,
        currentDetection,
      })),
    ).toEqual([
      {
        id: "codex",
        currentDetection: {
          status: "not-detected",
          basis: "personal-config-directory",
          observedPath: "C:/Users/author/.agents",
        },
      },
      {
        id: "claude-code",
        currentDetection: {
          status: "detected",
          basis: "personal-config-directory",
          observedPath: "C:/Users/author/.claude",
        },
      },
    ]);
  });

  it("returns the supported contract with detection and leaves deferred/invalid evaluations distinct", () => {
    expect(inspectAuthoringClient(deps([".claude"]), "claude-code")).toMatchObject({
      id: "claude-code",
      supportStatus: "selectable",
      selectable: true,
      configured: false,
      currentDetection: { status: "detected" },
    });
    expect(inspectAuthoringClient(deps(), "hermes")).toEqual(evaluateAuthoringClientId("hermes"));
    expect(inspectAuthoringClient(deps(), "not-a-client")).toEqual(
      evaluateAuthoringClientId("not-a-client"),
    );
  });

  it("is stable across reruns and never writes a personal or workspace surface", () => {
    const harness = deps([".agents"]);
    const first = inspectAuthoringClients(harness);
    const second = inspectAuthoringClients(harness);

    expect(second).toEqual(first);
    expect(harness.fs.exists(`${HOME}/.agents/skills`)).toBe(false);
    expect(harness.fs.exists(`${HOME}/.claude/skills`)).toBe(false);
    expect(harness.fs.exists("/workspace/AGENTS.md")).toBe(false);
    expect(harness.fs.exists("/workspace/CLAUDE.md")).toBe(false);
  });
});
