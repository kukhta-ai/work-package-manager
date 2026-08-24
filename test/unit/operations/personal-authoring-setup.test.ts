import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";
import {
  PersonalAuthoringSetupMutationFailure,
  PersonalAuthoringSetupPreflightError,
} from "../../../src/core/errors.js";
import {
  preparePersonalAuthoringSetup,
  readPersonalAuthoringDefaults,
  setupPersonalAuthoring,
} from "../../../src/core/operations/personal-authoring-setup.js";
import {
  PERSONAL_AUTHORING_STATE_PATH,
  parsePersonalAuthoringState,
  personalSetupQuarantineRoot,
  personalSetupRequestKey,
  serializePersonalAuthoringState,
} from "../../../src/core/services/personal-authoring-setup.js";

const HOME = "/home/author";
const PACKAGE = "/package/agent-skills";
const VERSION = "0.1.0";
const SOURCE = `${PACKAGE}/wpm-create-package/SKILL.md`;
const LEGACY = `${PACKAGE}/installer-builder`;
const CODEX = `${HOME}/.agents/skills/wpm-create-package`;
const CLAUDE = `${HOME}/.claude/skills/wpm-create-package`;
const STATE = `${HOME}/${PERSONAL_AUTHORING_STATE_PATH}`;
const SKILL =
  "---\nname: wpm-create-package\ndescription: create a WPM package\n---\n\nCreate it.\n";

function seed(fs: MemoryFileSystem, home = HOME, packageRoot = PACKAGE): void {
  fs.makeDirectories(home);
  fs.write(`${packageRoot}/wpm-create-package/SKILL.md`, SKILL);
  fs.write(
    `${packageRoot}/installer-builder/SKILL.md`,
    "---\nname: installer-builder\n---\nlegacy\n",
  );
  fs.write(`${packageRoot}/installer-builder/references/workflow.md`, "legacy reference\n");
}

function harness(): { fs: MemoryFileSystem; env: FakeEnvironment } {
  const fs = new MemoryFileSystem();
  seed(fs);
  return { fs, env: new FakeEnvironment({ cwd: "/workspace", env: { HOME } }) };
}

function run(fs: MemoryFileSystem, env: FakeEnvironment, clientIds: readonly string[] = ["codex"]) {
  return setupPersonalAuthoring(
    { fs, env },
    { bundledSkillsRoot: PACKAGE, clientIds, setupVersion: VERSION },
  );
}

describe("setupPersonalAuthoring", () => {
  it("uses explicit selection even when another client is detected and the selected one is not", () => {
    const { fs, env } = harness();
    fs.makeDirectories(`${HOME}/.claude`);

    const result = run(fs, env, ["codex"]);

    expect(result.clients).toEqual([
      expect.objectContaining({
        id: "codex",
        destination: CODEX,
        outcome: "installed",
        changed: true,
      }),
    ]);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(SKILL);
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
    expect(readPersonalAuthoringDefaults({ fs, env })).toEqual(["codex"]);
  });

  it("refuses retained defaults through an aliased managed-state ancestor", () => {
    const { fs, env } = harness();
    run(fs, env);
    const state = fs.read(STATE);
    fs.remove(`${HOME}/.wpm`);
    fs.write(`/outside/.wpm/authoring-setup.json`, state);
    fs.ensureAlias("/outside/.wpm", `${HOME}/.wpm`);

    expect(() => readPersonalAuthoringDefaults({ fs, env })).toThrowError(
      PersonalAuthoringSetupPreflightError,
    );
  });

  it("does not report clean default absence while request-bound setup evidence is active", () => {
    const { fs, env } = harness();
    const generation = `${HOME}/.wpm/authoring-setup-quarantine/request`;
    fs.write(`${generation}/state-applying.preimage`, "PARTIAL STATE\n");

    let error: unknown;
    try {
      readPersonalAuthoringDefaults({ fs, env });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual([
      expect.objectContaining({
        code: "personal-quarantine-invalid",
        path: generation,
      }),
    ]);
    expect(fs.read(`${generation}/state-applying.preimage`)).toBe("PARTIAL STATE\n");
  });

  it("installs both clients once, preserves unrelated scope bytes, then reruns unchanged", () => {
    const { fs, env } = harness();
    fs.write(`${HOME}/.agents/skills/user-skill/SKILL.md`, "USER\n");
    fs.write(`${HOME}/.claude/settings.json`, "CLAUDE USER SETTINGS\n");

    const first = run(fs, env, ["claude-code", "codex", "claude-code"]);
    const firstState = fs.read(STATE);
    const second = run(fs, env, ["codex", "claude-code"]);

    expect(first.selectedClients).toEqual(["codex", "claude-code"]);
    expect(first.clients.map(({ outcome }) => outcome)).toEqual(["installed", "installed"]);
    expect(second.clients.map(({ outcome }) => outcome)).toEqual(["unchanged", "unchanged"]);
    expect(second.changedPaths).toEqual([]);
    expect(fs.read(STATE)).toBe(firstState);
    expect(fs.read(`${HOME}/.agents/skills/user-skill/SKILL.md`)).toBe("USER\n");
    expect(fs.read(`${HOME}/.claude/settings.json`)).toBe("CLAUDE USER SETTINGS\n");
  });

  it("rejects selected-skill or state drift after an unchanged plan is prepared", () => {
    const { fs, env } = harness();
    run(fs, env);
    const skillPlan = preparePersonalAuthoringSetup(
      { fs, env },
      { bundledSkillsRoot: PACKAGE, clientIds: ["codex"], setupVersion: VERSION },
    );
    fs.write(`${CODEX}/SKILL.md`, "USER ARRIVED AFTER PREVIEW\n");

    expect(() => skillPlan.apply()).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER ARRIVED AFTER PREVIEW\n");

    fs.write(`${CODEX}/SKILL.md`, SKILL);
    const statePlan = preparePersonalAuthoringSetup(
      { fs, env },
      { bundledSkillsRoot: PACKAGE, clientIds: ["codex"], setupVersion: VERSION },
    );
    fs.write(STATE, "USER STATE AFTER PREVIEW\n");

    expect(() => statePlan.apply()).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(STATE)).toBe("USER STATE AFTER PREVIEW\n");
  });

  it("does not expose mutable request arrays through the confirmation preview", () => {
    const { fs, env } = harness();
    const prepared = preparePersonalAuthoringSetup(
      { fs, env },
      {
        bundledSkillsRoot: PACKAGE,
        clientIds: ["codex", "claude-code"],
        setupVersion: VERSION,
      },
    );
    (prepared.preview.selectedClients as string[]).reverse();

    const result = prepared.apply();
    expect(result.selectedClients).toEqual(["codex", "claude-code"]);
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { defaults: ["codex", "claude-code"] },
    });
  });

  it("adopts an exact stateless current copy without rewriting it", () => {
    const { fs, env } = harness();
    fs.write(`${CODEX}/SKILL.md`, SKILL);

    const result = run(fs, env);

    expect(result.clients[0]).toMatchObject({ outcome: "unchanged", changed: false });
    expect(result.changedPaths).toEqual([STATE]);
  });

  it("updates only recorded older bytes and never silently recreates missing complete-owned bytes", () => {
    const { fs, env } = harness();
    run(fs, env);
    const state = parsePersonalAuthoringState(fs.read(STATE));
    expect(state.ok).toBe(true);
    if (!state.ok || state.value.status !== "complete") throw new Error("expected complete state");
    fs.write(`${CODEX}/SKILL.md`, "OLDER OWNED\n");
    fs.write(
      STATE,
      serializePersonalAuthoringState({
        ...state.value,
        setupVersion: "0.0.9",
        managed: state.value.managed.map((entry) => ({
          ...entry,
          version: "0.0.9",
          sha256: fs.digestFile(`${CODEX}/SKILL.md`),
        })),
      }),
    );
    expect(run(fs, env).clients[0]?.outcome).toBe("updated");

    fs.remove(CODEX);
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("migrates only the exact packaged legacy tree", () => {
    const { fs, env } = harness();
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);

    const result = run(fs, env);

    expect(result.clients[0]).toMatchObject({
      outcome: "migrated",
      legacy: "migrated",
    });
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(SKILL);
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("missing");
  });

  it("does not request reload when migration retires only legacy bytes", () => {
    const { fs, env } = harness();
    fs.write(`${CODEX}/SKILL.md`, SKILL);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);

    const client = run(fs, env).clients[0];
    expect(client).toMatchObject({
      outcome: "migrated",
      changed: true,
    });
    expect(client?.reloadGuidance).toBeUndefined();
  });

  it("preserves a modified sibling legacy copy and reports it without blocking", () => {
    const { fs, env } = harness();
    fs.write(`${HOME}/.agents/skills/installer-builder/SKILL.md`, "USER MODIFIED\n");

    const result = run(fs, env);

    expect(result.clients[0]).toMatchObject({
      outcome: "installed",
      legacy: "preserved-unowned-or-modified",
    });
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/SKILL.md`)).toBe("USER MODIFIED\n");
  });

  it("aggregates selection, package, state, destination, and HOME blockers before any write", () => {
    const { fs } = harness();
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.write(STATE, "not json\n");
    fs.write(`${CODEX}/EXTRA.md`, "occupied directory\n");
    const before = fs.read(STATE);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["codex", "openclaw", ""]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    const codes = (error as PersonalAuthoringSetupPreflightError).blockers.map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "personal-client-unsupported",
        "personal-source-invalid",
        "personal-state-invalid",
        "personal-destination-ambiguous",
      ]),
    );
    expect(fs.read(STATE)).toBe(before);
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
  });

  it.each([
    ["relative HOME", "relative/home"],
    ["missing HOME", "/missing/home"],
  ])("rejects %s without creating it", (_label, home) => {
    const { fs } = harness();
    const env = new FakeEnvironment({ env: { HOME: home } });
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(home).kind).toBe("missing");
  });

  it("rejects a filesystem-root HOME before any personal write", () => {
    const { fs } = harness();
    const env = new FakeEnvironment({ env: { HOME: "/" } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath("/.wpm").kind).toBe("missing");
    expect(fs.inspectPath("/.agents").kind).toBe("missing");
  });

  it("rejects a lexically noncanonical absolute HOME before any personal write", () => {
    const { fs } = harness();
    const env = new FakeEnvironment({ env: { HOME: `${HOME}/../author` } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("rejects a trailing-separator HOME before any personal write", () => {
    const { fs } = harness();
    const env = new FakeEnvironment({ env: { HOME: `${HOME}/` } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("rejects a symlinked HOME or selected ancestor before writes", () => {
    const { fs } = harness();
    fs.makeDirectories("/real-home");
    fs.ensureAlias("/real-home", "/home-link");
    expect(() => run(fs, new FakeEnvironment({ env: { HOME: "/home-link" } }))).toThrowError(
      PersonalAuthoringSetupPreflightError,
    );

    fs.makeDirectories("/outside");
    fs.ensureAlias("/outside", `${HOME}/.agents`);
    expect(() => run(fs, new FakeEnvironment({ env: { HOME } }))).toThrowError(
      PersonalAuthoringSetupPreflightError,
    );
    expect(fs.inspectPath("/outside/skills/wpm-create-package").kind).toBe("missing");
  });

  it("rejects extra packaged entries, a state-path collision, and an aliased current leaf together", () => {
    const { fs, env } = harness();
    fs.write(`${PACKAGE}/wpm-create-package/EXTRA.md`, "unexpected\n");
    fs.makeDirectories(STATE);
    fs.makeDirectories("/outside/current");
    fs.ensureAlias("/outside/current", CODEX);

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect(
      (error as PersonalAuthoringSetupPreflightError).blockers.map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "personal-source-invalid",
        "personal-state-invalid",
        "personal-destination-ambiguous",
      ]),
    );
    expect(fs.inspectPath("/outside/current/SKILL.md").kind).toBe("missing");
  });

  it("uses native Windows destinations while retaining portable state paths", () => {
    const fs = new MemoryFileSystem();
    const windowsHome = "C:\\Users\\author";
    const windowsPackage = "C:\\wpm\\agent-skills";
    seed(fs, windowsHome, windowsPackage);
    const env = new FakeEnvironment({
      platform: "win32",
      env: { HOME: windowsHome },
    });

    const result = setupPersonalAuthoring(
      { fs, env },
      { bundledSkillsRoot: windowsPackage, clientIds: ["codex"], setupVersion: VERSION },
    );

    expect(result.statePath).toBe("C:/Users/author/.wpm/authoring-setup.json");
    expect(result.clients[0]?.destination).toBe(
      "C:/Users/author/.agents/skills/wpm-create-package",
    );
    expect(fs.read("C:\\Users\\author\\.agents\\skills\\wpm-create-package\\SKILL.md")).toBe(SKILL);
  });

  it("rejects a noncanonical setup version before any state or client write", () => {
    const { fs, env } = harness();

    expect(() =>
      setupPersonalAuthoring(
        { fs, env },
        { bundledSkillsRoot: PACKAGE, clientIds: ["codex"], setupVersion: "not-semver" },
      ),
    ).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("keeps cumulative ownership while replacing only the retained default selection", () => {
    const { fs, env } = harness();
    run(fs, env, ["codex", "claude-code"]);
    const claudeBytes = fs.read(`${CLAUDE}/SKILL.md`);

    run(fs, env, ["codex"]);
    const parsed = parsePersonalAuthoringState(fs.read(STATE));

    expect(parsed.ok && parsed.value.status === "complete" ? parsed.value.defaults : []).toEqual([
      "codex",
    ]);
    expect(
      parsed.ok && parsed.value.status === "complete"
        ? parsed.value.managed.map(({ client }) => client)
        : [],
    ).toEqual(["codex", "claude-code"]);
    expect(fs.read(`${CLAUDE}/SKILL.md`)).toBe(claudeBytes);
  });
});

class FailOnceFileSystem extends MemoryFileSystem {
  writes = 0;
  failWrite = Number.POSITIVE_INFINITY;

  override write(path: string, content: string): void {
    this.writes += 1;
    if (this.writes === this.failWrite) throw new Error(`injected write ${this.writes}`);
    super.write(path, content);
  }
}

class DeniedCapabilityFileSystem extends MemoryFileSystem {
  override inspectMutationCapability(path: string) {
    return path.includes(".claude")
      ? ({ capable: false, reason: "injected read-only scope" } as const)
      : ({ capable: true } as const);
  }
}

class DeniedAggregateFileSystem extends MemoryFileSystem {
  override inspectMutationCapability(path: string) {
    return path.includes("/.wpm/") || path.includes("/.claude/")
      ? ({ capable: false, reason: "injected aggregate denial" } as const)
      : ({ capable: true } as const);
  }
}

class DeniedQuarantineCapabilityFileSystem extends MemoryFileSystem {
  override inspectMutationCapability(path: string) {
    return path.includes("/.wpm/authoring-setup-quarantine/")
      ? ({ capable: false, reason: "injected read-only quarantine" } as const)
      : ({ capable: true } as const);
  }
}

class DeniedQuarantineRootCapabilityFileSystem extends MemoryFileSystem {
  override inspectMutationCapability(path: string) {
    return /\/\.wpm\/authoring-setup-quarantine\/[^/]+$/.test(path)
      ? ({ capable: false, reason: "injected read-only quarantine root" } as const)
      : ({ capable: true } as const);
  }
}

class ToggleDeniedCapabilityFileSystem extends MemoryFileSystem {
  denied = false;

  override inspectMutationCapability(path: string) {
    return this.denied && (path.includes("/.wpm/") || path.includes("/.claude/"))
      ? ({ capable: false, reason: "injected later denial" } as const)
      : ({ capable: true } as const);
  }
}

class RetryDeniedCapabilityFileSystem extends FailOnceFileSystem {
  denied = false;

  override inspectMutationCapability(path: string) {
    return this.denied && (path.includes("/.wpm/") || path.includes("/.agents/"))
      ? ({ capable: false, reason: "injected retry denial" } as const)
      : ({ capable: true } as const);
  }
}

class CrossDeviceFileSystem extends MemoryFileSystem {
  override inspectMutationCompatibility(firstPath: string, secondPath: string) {
    return firstPath.includes("/.agents/") && secondPath.includes("/.wpm/")
      ? ({ capable: false, reason: "injected cross-device personal scope" } as const)
      : ({ capable: true } as const);
  }
}

class ToggleCrossDeviceFileSystem extends MemoryFileSystem {
  incompatible = false;

  override inspectMutationCompatibility(firstPath: string, secondPath: string) {
    return this.incompatible && firstPath.includes("/.agents/") && secondPath.includes("/.wpm/")
      ? ({ capable: false, reason: "injected cross-device personal scope" } as const)
      : ({ capable: true } as const);
  }
}

class UnreadableQuarantineFileSystem extends MemoryFileSystem {
  override list(path: string) {
    if (path.endsWith("/.wpm/authoring-setup-quarantine")) {
      throw new Error("injected unreadable personal quarantine");
    }
    return super.list(path);
  }
}

describe("personal setup ordered failure and retry", () => {
  it.each([
    ["applying state publication", 1, [], null, ["codex", "claude-code"]],
    ["the first selected client", 2, [], "codex", ["claude-code"]],
    ["complete state publication", 4, ["codex", "claude-code"], null, []],
  ])("reports and converges after failure at %s", (_label, failWrite, completed, failed, unattempted) => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = failWrite;

    let error: unknown;
    try {
      run(fs, env, ["codex", "claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    const failure = error as PersonalAuthoringSetupMutationFailure;
    expect(failure.completedClients.map(({ id }) => id)).toEqual(completed);
    expect(failure.failedClient?.id ?? null).toBe(failed);
    expect(failure.unattemptedClients.map(({ id }) => id)).toEqual(unattempted);

    const retried = run(fs, env, ["codex", "claude-code"]);
    expect(retried.clients.map(({ outcome }) => outcome)).toEqual(["installed", "installed"]);
    expect(retried.clients.map(({ changed }) => changed)).toEqual([true, true]);
    expect(retried.clients.every(({ reloadGuidance }) => reloadGuidance !== undefined)).toBe(true);
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });
  });

  it("reports completed, failed, and unattempted clients then the identical request converges", () => {
    const fs = new FailOnceFileSystem();
    fs.makeDirectories(HOME);
    fs.write(SOURCE, SKILL);
    fs.write(`${LEGACY}/SKILL.md`, "---\nname: installer-builder\n---\nlegacy\n");
    fs.write(`${LEGACY}/references/workflow.md`, "legacy reference\n");
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 3; // applying state, Codex skill, then Claude skill

    let error: unknown;
    try {
      run(fs, env, ["codex", "claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({
      completedClients: [expect.objectContaining({ id: "codex", destination: CODEX })],
      failedClient: expect.objectContaining({ id: "claude-code", destination: CLAUDE }),
      unattemptedClients: [],
      recovery: expect.stringMatching(/identical.*--client codex.*--client claude-code/i),
    });
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "applying" },
    });

    fs.failWrite = Number.POSITIVE_INFINITY;
    const retried = run(fs, env, ["codex", "claude-code"]);
    expect(retried.clients.map(({ outcome }) => outcome)).toEqual(["installed", "installed"]);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(SKILL);
    expect(fs.read(`${CLAUDE}/SKILL.md`)).toBe(SKILL);
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "complete", defaults: ["codex", "claude-code"] },
    });
  });

  it("rejects changed package bytes during an applying retry", () => {
    const fs = new FailOnceFileSystem();
    fs.makeDirectories(HOME);
    fs.write(SOURCE, SKILL);
    fs.write(`${LEGACY}/SKILL.md`, "legacy\n");
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env, ["codex"])).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const quarantineRoot = applying.value.pending.quarantineRoot;
    const applyingText = fs.read(STATE);

    fs.failWrite = Number.POSITIVE_INFINITY;
    fs.write(SOURCE, `${SKILL}changed package\n`);
    let error: unknown;
    try {
      run(fs, env, ["codex"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    const quarantineBlockers = (error as PersonalAuthoringSetupPreflightError).blockers.filter(
      ({ code }) => code.startsWith("personal-quarantine") || code.includes("applying-quarantine"),
    );
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-applying-request-mismatch" }),
      ]),
    );
    expect(
      quarantineBlockers.every(
        ({ path }) =>
          path === undefined || path === quarantineRoot || path.startsWith(`${quarantineRoot}/`),
      ),
    ).toBe(true);
    expect(fs.read(STATE)).toBe(applyingText);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("directory");
  });

  it("rejects destination drift during an applying retry", () => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env, ["codex"])).toThrowError(PersonalAuthoringSetupMutationFailure);

    fs.failWrite = Number.POSITIVE_INFINITY;
    fs.write(`${CODEX}/SKILL.md`, "USER RACE\n");
    expect(() => run(fs, env, ["codex"])).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER RACE\n");
  });

  it("rejects a canonical applying record that downgrades exact legacy migration to preservation", () => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    fs.failWrite = Number.POSITIVE_INFINITY;
    const parsed = parsePersonalAuthoringState(fs.read(STATE));
    expect(parsed.ok && parsed.value.status === "applying").toBe(true);
    if (!parsed.ok || parsed.value.status !== "applying")
      throw new Error("expected applying state");
    const client = parsed.value.pending.clients[0];
    if (client === undefined) throw new Error("expected Codex client plan");
    fs.write(
      STATE,
      serializePersonalAuthoringState({
        ...parsed.value,
        pending: {
          ...parsed.value.pending,
          clients: [
            {
              ...client,
              outcome: "installed",
              legacy: { ...client.legacy, action: "preserve" },
            },
          ],
        },
      }),
    );

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("directory");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("includes an unchanged client in typed progress when final state publication fails", () => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env, ["codex", "claude-code"]);
    fs.writes = 0;
    fs.failWrite = 2; // applying state, unchanged Codex client action, complete state

    let error: unknown;
    try {
      run(fs, env, ["codex"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({
      completedClients: [expect.objectContaining({ id: "codex", outcome: "unchanged" })],
      failedClient: null,
      unattemptedClients: [],
    });
    expect(run(fs, env, ["codex"]).clients[0]?.outcome).toBe("unchanged");
  });
});

describe("personal setup capability preflight", () => {
  it("checks request-root cleanup capability with or without packaged source evidence", () => {
    for (const sourceAvailable of [true, false]) {
      const fs = new DeniedQuarantineRootCapabilityFileSystem();
      seed(fs);
      if (!sourceAvailable) fs.remove(`${PACKAGE}/wpm-create-package`);
      const env = new FakeEnvironment({ env: { HOME } });

      let error: unknown;
      try {
        run(fs, env);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
      expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "personal-destination-not-writable",
            surface: "managed-state",
            path: expect.stringMatching(/\/\.wpm\/authoring-setup-quarantine\/[^/]+$/),
          }),
        ]),
      );
      if (!sourceAvailable) {
        expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
          expect.arrayContaining([expect.objectContaining({ code: "personal-source-invalid" })]),
        );
      }
      expect(fs.inspectPath(STATE).kind).toBe("missing");
      expect(fs.inspectPath(CODEX).kind).toBe("missing");
    }
  });

  it("aggregates every planned request-bound quarantine capability before writing", () => {
    const fs = new DeniedQuarantineCapabilityFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    const quarantinePaths = (error as PersonalAuthoringSetupPreflightError).blockers
      .filter(
        ({ code, path }) =>
          code === "personal-destination-not-writable" &&
          path?.includes("/.wpm/authoring-setup-quarantine/"),
      )
      .map(({ path }) => path);
    expect(quarantinePaths).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/state-applying\.preimage$/),
        expect.stringMatching(/\/state-complete\.preimage$/),
        expect.stringMatching(/\/codex\/current\.preimage$/),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("aggregates unreadable quarantine evidence into the typed no-write preflight", () => {
    const fs = new UnreadableQuarantineFileSystem();
    seed(fs);
    fs.makeDirectories(`${HOME}/.wpm/authoring-setup-quarantine`);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["codex", "unknown-client"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-client-unsupported" }),
        expect.objectContaining({
          code: "personal-quarantine-unreadable",
          path: `${HOME}/.wpm/authoring-setup-quarantine`,
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("blocks a selected scope on another device before publishing applying state", () => {
    const fs = new CrossDeviceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-quarantine-device-incompatible",
          client: "codex",
          surface: "destination",
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("aggregates predictable cross-device beats even when the current package source is missing", () => {
    const fs = new CrossDeviceFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    fs.remove(`${PACKAGE}/wpm-create-package`);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-quarantine-device-incompatible",
          client: "codex",
          surface: "destination",
        }),
        expect.objectContaining({
          code: "personal-quarantine-device-incompatible",
          client: "codex",
          surface: "ownership",
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/SKILL.md`)).toContain(
      "installer-builder",
    );
  });

  it("does not invent a client write from a version change while current source bytes are unavailable", () => {
    const fs = new ToggleCrossDeviceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    fs.incompatible = true;
    fs.remove(`${PACKAGE}/wpm-create-package`);

    let error: unknown;
    try {
      setupPersonalAuthoring(
        { fs, env },
        { bundledSkillsRoot: PACKAGE, clientIds: ["codex"], setupVersion: "0.2.0" },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "personal-source-invalid" })]),
    );
    expect(
      (error as PersonalAuthoringSetupPreflightError).blockers.filter(
        ({ code, client }) =>
          code === "personal-quarantine-device-incompatible" && client === "codex",
      ),
    ).toEqual([]);

    fs.write(`${PACKAGE}/wpm-create-package/SKILL.md`, SKILL);
    const result = setupPersonalAuthoring(
      { fs, env },
      { bundledSkillsRoot: PACKAGE, clientIds: ["codex"], setupVersion: "0.2.0" },
    );
    expect(result.clients[0]).toMatchObject({ id: "codex", changed: false });
    expect(result.changedPaths).toEqual([STATE]);
  });

  it("aggregates an unwritable selected scope before any selected or state write", () => {
    const fs = new DeniedCapabilityFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["codex", "claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "claude-code",
          path: `${CLAUDE}/SKILL.md`,
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
  });

  it("continues source-independent ownership and capability checks when legacy evidence is missing", () => {
    const fs = new DeniedAggregateFileSystem();
    seed(fs);
    fs.remove(LEGACY);
    fs.write(`${CODEX}/SKILL.md`, "UNRECORDED USER BOOTSTRAP\n");
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["codex", "claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-legacy-source-invalid" }),
        expect.objectContaining({ code: "personal-destination-ambiguous", client: "codex" }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "claude-code",
        }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          surface: "managed-state",
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("UNRECORDED USER BOOTSTRAP\n");
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
  });

  it("reports definitely needed state and destination capability blockers when current source is missing", () => {
    const fs = new DeniedAggregateFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.claude/skills/installer-builder`);
    fs.remove(`${PACKAGE}/wpm-create-package`);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          surface: "managed-state",
        }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "claude-code",
        }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "claude-code",
          surface: "ownership",
          path: `${HOME}/.claude/skills/installer-builder`,
        }),
      ]),
    );
    expect(fs.inspectPath(STATE).kind).toBe("missing");
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
  });

  it("reports a denied retained-state rewrite when a missing source accompanies a new default selection", () => {
    const fs = new ToggleDeniedCapabilityFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env, ["codex"]);
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.denied = true;

    let error: unknown;
    try {
      run(fs, env, ["claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          surface: "managed-state",
        }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "claude-code",
        }),
      ]),
    );
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "complete", defaults: ["codex"] },
    });
  });

  it("uses applying evidence to aggregate retry drift and capability blockers without current source", () => {
    const fs = new RetryDeniedCapabilityFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env, ["codex"]);
    const priorSkill = fs.read(`${CODEX}/SKILL.md`);
    fs.write(SOURCE, `${SKILL}next packaged revision\n`);
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env, ["codex"])).toThrowError(PersonalAuthoringSetupMutationFailure);
    expect(fs.inspectPath(CODEX).kind).toBe("directory");
    expect(fs.list(CODEX)).toEqual([]);
    const applyingText = fs.read(STATE);
    const applying = parsePersonalAuthoringState(applyingText);
    const retainedCurrent =
      applying.ok && applying.value.status === "applying"
        ? `${applying.value.pending.quarantineRoot}/codex/current.preimage`
        : "";
    expect(fs.read(retainedCurrent)).toBe(priorSkill);

    fs.failWrite = Number.POSITIVE_INFINITY;
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.denied = true;
    let capabilityError: unknown;
    try {
      run(fs, env, ["codex"]);
    } catch (caught) {
      capabilityError = caught;
    }
    expect(capabilityError).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((capabilityError as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          surface: "managed-state",
        }),
        expect.objectContaining({
          code: "personal-destination-not-writable",
          client: "codex",
          surface: "destination",
          path: `${CODEX}/SKILL.md`,
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(applyingText);
    expect(fs.inspectPath(CODEX).kind).toBe("directory");
    expect(fs.list(CODEX)).toEqual([]);
    expect(fs.read(retainedCurrent)).toBe(priorSkill);

    fs.denied = false;
    fs.write(`${CODEX}/SKILL.md`, "USER RETRY DRIFT\n");
    fs.write(`${HOME}/.agents/skills/installer-builder/SKILL.md`, "USER LEGACY ARRIVAL\n");
    let driftError: unknown;
    try {
      run(fs, env, ["codex"]);
    } catch (caught) {
      driftError = caught;
    }
    expect(driftError).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((driftError as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-applying-quarantine-mismatch",
          client: "codex",
        }),
        expect.objectContaining({
          code: "personal-applying-legacy-mismatch",
          client: "codex",
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(applyingText);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER RETRY DRIFT\n");
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/SKILL.md`)).toBe(
      "USER LEGACY ARRIVAL\n",
    );
  });

  it("aggregates recorded retry drift when source evidence and the repeated selection both differ", () => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env, ["codex"])).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const quarantineRoot = applying.value.pending.quarantineRoot;
    const unexpected = `${quarantineRoot}/codex/UNEXPECTED.txt`;
    fs.failWrite = Number.POSITIVE_INFINITY;
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.write(`${CODEX}/SKILL.md`, "USER RETRY DRIFT\n");
    fs.write(unexpected, "UNEXPECTED PRIVATE EVIDENCE\n");
    const stateBefore = fs.read(STATE);

    let error: unknown;
    try {
      run(fs, env, ["claude-code"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({ code: "personal-applying-request-mismatch" }),
        expect.objectContaining({
          code: "personal-applying-destination-mismatch",
          client: "codex",
          path: CODEX,
        }),
        expect.objectContaining({
          code: "personal-quarantine-invalid",
          path: unexpected,
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(stateBefore);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER RETRY DRIFT\n");
    expect(fs.read(unexpected)).toBe("UNEXPECTED PRIVATE EVIDENCE\n");
  });

  it("aggregates unexpected applying quarantine evidence when current source is missing", () => {
    const fs = new FailOnceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    fs.writes = 0;
    fs.failWrite = 2;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const unexpected = `${applying.value.pending.quarantineRoot}/USER.txt`;
    fs.write(unexpected, "USER PRIVATE EVIDENCE\n");
    fs.remove(`${PACKAGE}/wpm-create-package`);
    fs.failWrite = Number.POSITIVE_INFINITY;

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-quarantine-invalid",
          path: unexpected,
        }),
      ]),
    );
    expect(fs.read(unexpected)).toBe("USER PRIVATE EVIDENCE\n");
  });

  it("aggregates an unbound quarantine generation when current source is missing", () => {
    const fs = new MemoryFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    const unexpected = `${HOME}/.wpm/authoring-setup-quarantine/unbound/USER.txt`;
    fs.write(unexpected, "USER PRIVATE EVIDENCE\n");
    fs.remove(`${PACKAGE}/wpm-create-package`);

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "personal-source-invalid" }),
        expect.objectContaining({
          code: "personal-quarantine-invalid",
          path: `${HOME}/.wpm/authoring-setup-quarantine/unbound`,
        }),
      ]),
    );
    expect(fs.read(unexpected)).toBe("USER PRIVATE EVIDENCE\n");
  });

  it("orders unbound quarantine blockers deterministically by path", () => {
    const fs = new MemoryFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    const parent = `${HOME}/.wpm/authoring-setup-quarantine`;
    fs.write(`${parent}/b/USER.txt`, "B\n");
    fs.write(`${parent}/a/USER.txt`, "A\n");

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect(
      (error as PersonalAuthoringSetupPreflightError).blockers
        .filter(({ code }) => code === "personal-quarantine-invalid")
        .map(({ path }) => path),
    ).toEqual([`${parent}/a`, `${parent}/b`]);
  });
});

class RaceAfterApplyingFileSystem extends MemoryFileSystem {
  raced = false;

  override write(path: string, content: string): void {
    super.write(path, content);
    if (!this.raced && path === STATE && content.includes('"status": "applying"')) {
      this.raced = true;
      super.write(`${CODEX}/SKILL.md`, "USER ARRIVED AFTER PREFLIGHT\n");
    }
  }
}

class PartialLegacyRemovalFileSystem extends MemoryFileSystem {
  failRemoval = true;

  override removeConfined(
    root: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: Parameters<MemoryFileSystem["removeConfined"]>[3],
  ): void {
    if (this.failRemoval) {
      this.failRemoval = false;
      super.remove(`${path}/SKILL.md`);
      throw new Error("injected partial legacy removal");
    }
    super.removeConfined(root, path, expectedTreeFingerprint, quarantine);
  }
}

class LegacyCaptureInterruptionFileSystem extends MemoryFileSystem {
  private interrupted = false;

  override removeConfined(
    root: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: Parameters<MemoryFileSystem["removeConfined"]>[3],
  ): void {
    if (!this.interrupted && quarantine !== undefined) {
      this.interrupted = true;
      this.write(`${quarantine.path}/SKILL.md`, this.read(`${path}/SKILL.md`));
      throw new Error("injected interruption after retained legacy capture");
    }
    super.removeConfined(root, path, expectedTreeFingerprint, quarantine);
  }
}

class PartialDisplacedLegacyFileSystem extends MemoryFileSystem {
  private interrupted = false;

  override removeConfined(
    root: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: Parameters<MemoryFileSystem["removeConfined"]>[3],
  ): void {
    if (!this.interrupted && quarantine !== undefined) {
      this.interrupted = true;
      this.copyTree(path, quarantine.path);
      this.copyTree(path, `${quarantine.path}.displaced`);
      this.remove(path);
      this.remove(`${quarantine.path}.displaced/SKILL.md`);
      throw new Error("injected partial displaced legacy cleanup");
    }
    super.removeConfined(root, path, expectedTreeFingerprint, quarantine);
  }
}

class LegacyRaceAfterApplyingFileSystem extends MemoryFileSystem {
  raced = false;

  override write(path: string, content: string): void {
    super.write(path, content);
    if (!this.raced && path === STATE && content.includes('"status": "applying"')) {
      this.raced = true;
      super.write(`${HOME}/.agents/skills/installer-builder/SKILL.md`, "USER RACE\n");
    }
  }
}

class AncestorRaceAfterApplyingFileSystem extends MemoryFileSystem {
  raced = false;

  override write(path: string, content: string): void {
    super.write(path, content);
    if (!this.raced && path === STATE && content.includes('"status": "applying"')) {
      this.raced = true;
      super.makeDirectories("/outside");
      super.ensureAlias("/outside", `${HOME}/.agents`);
    }
  }
}

class StateRaceAfterApplyingFileSystem extends MemoryFileSystem {
  raced = false;

  override write(path: string, content: string): void {
    super.write(path, content);
    if (!this.raced && path === STATE && content.includes('"status": "applying"')) {
      this.raced = true;
      super.write(STATE, "USER STATE RACE\n");
    }
  }
}

class FinalOwnershipRaceFileSystem extends MemoryFileSystem {
  raced = false;

  override write(path: string, content: string): void {
    super.write(path, content);
    if (!this.raced && path === `${CLAUDE}/SKILL.md`) {
      this.raced = true;
      super.write(`${CODEX}/SKILL.md`, "USER CHANGED CODEX BEFORE COMPLETE\n");
    }
  }
}

class LegacyConfinedRaceFileSystem extends MemoryFileSystem {
  override removeConfined(
    root: string,
    path: string,
    expectedTreeFingerprint: string,
    quarantine?: Parameters<MemoryFileSystem["removeConfined"]>[3],
  ): void {
    super.write(`${path}/USER-RACE.txt`, "USER ARRIVED AT REMOVE BOUNDARY\n");
    super.removeConfined(root, path, expectedTreeFingerprint, quarantine);
  }
}

class CurrentDetachmentFailureFileSystem extends MemoryFileSystem {
  failDetachment = false;

  protected override afterConfinedFileDetachment(path: string): void {
    if (this.failDetachment && path === `${CODEX}/SKILL.md`) {
      this.failDetachment = false;
      throw new Error("injected interruption after current detachment");
    }
  }
}

class NewInstallPrePublicationCrashFileSystem extends MemoryFileSystem {
  private interrupted = false;

  override writeConfined(
    root: string,
    path: string,
    content: string,
    expected: Parameters<MemoryFileSystem["writeConfined"]>[3],
    quarantine?: Parameters<MemoryFileSystem["writeConfined"]>[4],
  ): void {
    if (!this.interrupted && path === `${CODEX}/SKILL.md` && quarantine !== undefined) {
      this.interrupted = true;
      this.makeDirectories(CODEX);
      this.write(`${quarantine.path}.staged`, content);
      throw new Error("injected process stop before new-install publication");
    }
    super.writeConfined(root, path, content, expected, quarantine);
  }
}

class UnreadableApplyingDestinationFileSystem extends CurrentDetachmentFailureFileSystem {
  unreadable = false;

  override list(path: string) {
    if (this.unreadable && path === CODEX) {
      throw new Error("injected unreadable applying destination");
    }
    return super.list(path);
  }
}

class LegacyDetachmentFailureFileSystem extends MemoryFileSystem {
  failDetachment = true;

  protected override afterConfinedTreeDetachment(path: string): void {
    if (this.failDetachment && path === `${HOME}/.agents/skills/installer-builder`) {
      this.failDetachment = false;
      throw new Error("injected interruption after legacy detachment");
    }
  }
}

class CompletePublicationFailureFileSystem extends MemoryFileSystem {
  failCompletePublication = true;

  protected override afterConfinedFilePublication(path: string): void {
    if (
      this.failCompletePublication &&
      path === STATE &&
      this.read(path).includes('"status": "complete"')
    ) {
      this.failCompletePublication = false;
      throw new Error("injected interruption after complete publication");
    }
  }
}

class ApplyingPublicationFailureFileSystem extends MemoryFileSystem {
  failApplyingPublication = false;

  protected override afterConfinedFilePublication(path: string): void {
    if (
      this.failApplyingPublication &&
      path === STATE &&
      this.read(path).includes('"status": "applying"')
    ) {
      this.failApplyingPublication = false;
      throw new Error("injected interruption after applying publication");
    }
  }
}

class ClientRaceDuringCompletePublicationFileSystem extends MemoryFileSystem {
  raced = false;

  protected override afterConfinedFilePublication(path: string): void {
    if (!this.raced && path === STATE && this.read(path).includes('"status": "complete"')) {
      this.raced = true;
      this.write(`${CODEX}/SKILL.md`, "USER CHANGED DURING COMPLETE PUBLICATION\n");
    }
  }
}

class UnboundGenerationDuringCompletePublicationFileSystem extends MemoryFileSystem {
  private raced = false;

  protected override afterConfinedFilePublication(path: string): void {
    if (!this.raced && path === STATE && this.read(path).includes('"status": "complete"')) {
      this.raced = true;
      this.write(
        `${HOME}/.wpm/authoring-setup-quarantine/unbound/USER.txt`,
        "UNBOUND USER EVIDENCE\n",
      );
    }
  }
}

describe("personal setup immediate preimage protection", () => {
  it("reconciles an exact applying-state preimage captured before private staging", () => {
    const { fs, env } = harness();
    run(fs, env);
    const previousState = fs.read(STATE);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    const requestKey = personalSetupRequestKey(["codex"], VERSION, fs.digestFile(SOURCE));
    const quarantineRoot = personalSetupQuarantineRoot(HOME, requestKey);
    fs.write(`${quarantineRoot}/state-applying.preimage`, previousState);

    expect(run(fs, env).status).toBe("complete");
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(`${SKILL}next revision\n`);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("reconciles retained applying-state cleanup after public applying bytes were published", () => {
    const fs = new ApplyingPublicationFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failApplyingPublication = true;

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/state-applying.preimage`;
    expect(fs.inspectPath(retained).kind).toBe("file");

    expect(run(fs, env).status).toBe("complete");
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });
    expect(fs.inspectPath(applying.value.pending.quarantineRoot).kind).toBe("missing");
  });

  it("preflights a present public state against displaced applying-state evidence", () => {
    const fs = new ApplyingPublicationFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failApplyingPublication = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/state-applying.preimage`;
    const displaced = `${retained}.displaced`;
    fs.write(displaced, fs.read(retained));
    const stateBefore = fs.read(STATE);

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-quarantine-invalid",
          path: displaced,
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(stateBefore);
    expect(fs.read(displaced)).toBe(fs.read(retained));
  });

  it("reconciles a request-bound current preimage after public detachment", () => {
    const fs = new CurrentDetachmentFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    const prior = fs.read(`${CODEX}/SKILL.md`);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failDetachment = true;

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    expect(applying).toMatchObject({ ok: true, value: { status: "applying" } });
    const quarantineRoot =
      applying.ok && applying.value.status === "applying"
        ? applying.value.pending.quarantineRoot
        : "";
    expect(fs.list(CODEX)).toEqual([]);
    expect(fs.read(`${quarantineRoot}/codex/current.preimage`)).toBe(prior);

    expect(run(fs, env).clients[0]?.outcome).toBe("updated");
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(`${SKILL}next revision\n`);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("preflights a present current destination against displaced bootstrap evidence", () => {
    const fs = new CurrentDetachmentFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    const prior = fs.read(`${CODEX}/SKILL.md`);
    const desired = `${SKILL}next revision\n`;
    fs.write(SOURCE, desired);
    fs.failDetachment = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/current.preimage`;
    const displaced = `${retained}.displaced`;
    fs.write(displaced, prior);
    fs.write(`${CODEX}/SKILL.md`, desired);
    const stateBefore = fs.read(STATE);

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-applying-quarantine-mismatch",
          client: "codex",
          path: displaced,
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(stateBefore);
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(desired);
    expect(fs.read(displaced)).toBe(prior);
  });

  it("reconciles a new install stopped after parent creation but before publication", () => {
    const fs = new NewInstallPrePublicationCrashFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const staged = `${applying.value.pending.quarantineRoot}/codex/current.preimage.staged`;
    expect(fs.inspectPath(CODEX).kind).toBe("directory");
    expect(fs.list(CODEX)).toEqual([]);
    expect(fs.read(staged)).toBe(SKILL);

    expect(run(fs, env).status).toBe("complete");
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe(SKILL);
    expect(fs.inspectPath(applying.value.pending.quarantineRoot).kind).toBe("missing");
  });

  it("rejects a missing replacement parent before retry effects", () => {
    const fs = new CurrentDetachmentFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    const prior = fs.read(`${CODEX}/SKILL.md`);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failDetachment = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/current.preimage`;
    fs.remove(CODEX);
    const stateBefore = fs.read(STATE);

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(STATE)).toBe(stateBefore);
    expect(fs.read(retained)).toBe(prior);
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
  });

  it("resumes cleanup when complete state is already public", () => {
    const fs = new CompletePublicationFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const publicComplete = parsePersonalAuthoringState(fs.read(STATE));
    expect(publicComplete).toMatchObject({ ok: true, value: { status: "complete" } });
    const quarantineParent = `${HOME}/.wpm/authoring-setup-quarantine`;
    expect(fs.list(quarantineParent)).toHaveLength(1);
    const requestRoot = `${quarantineParent}/${fs.list(quarantineParent)[0]?.name}`;
    fs.makeDirectories(`${requestRoot}/codex`);

    expect(run(fs, env).status).toBe("complete");
    expect(fs.inspectPath(quarantineParent).kind).toBe("missing");
    expect(run(fs, env).status).toBe("complete");
  });

  it("reconciles an empty request-bound cleanup skeleton after complete evidence is public", () => {
    const fs = new CompletePublicationFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const quarantineParent = `${HOME}/.wpm/authoring-setup-quarantine`;
    const requestRoot = `${quarantineParent}/${fs.list(quarantineParent)[0]?.name}`;
    for (const entry of fs.list(requestRoot)) {
      if (entry.kind === "file") fs.remove(`${requestRoot}/${entry.name}`);
    }
    fs.makeDirectories(`${requestRoot}/codex`);

    expect(run(fs, env).status).toBe("complete");
    expect(fs.inspectPath(quarantineParent).kind).toBe("missing");
  });

  it("does not report success when a selected client changes during complete-state publication", () => {
    const fs = new ClientRaceDuringCompletePublicationFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({ failedClient: expect.objectContaining({ id: "codex" }) });
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER CHANGED DURING COMPLETE PUBLICATION\n");
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "complete" },
    });

    fs.write(`${CODEX}/SKILL.md`, SKILL);
    expect(run(fs, env).status).toBe("complete");
  });

  it("reconciles an exact request-bound legacy tree after detachment", () => {
    const fs = new LegacyDetachmentFailureFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    const quarantineRoot =
      applying.ok && applying.value.status === "applying"
        ? applying.value.pending.quarantineRoot
        : "";
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("missing");
    expect(fs.read(`${quarantineRoot}/codex/legacy/SKILL.md`)).toContain("installer-builder");

    expect(run(fs, env).clients[0]?.legacy).toBe("migrated");
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("preserves empty directories in retained legacy evidence across state retry cleanup", () => {
    const fs = new LegacyDetachmentFailureFileSystem();
    seed(fs);
    fs.makeDirectories(`${LEGACY}/empty`);
    fs.write(`${LEGACY}/foo.displaced`, "LEGITIMATE LEGACY FILE\n");
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/legacy`;
    expect(fs.inspectPath(`${retained}/empty`).kind).toBe("directory");
    expect(fs.inspectPath(`${retained}.displaced/empty`).kind).toBe("directory");

    expect(run(fs, env).clients[0]?.legacy).toBe("migrated");
    expect(fs.inspectPath(applying.value.pending.quarantineRoot).kind).toBe("missing");
  });

  it("aggregates an unreadable applying destination into a typed retry preflight", () => {
    const fs = new UnreadableApplyingDestinationFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    const prior = fs.read(`${CODEX}/SKILL.md`);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failDetachment = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/current.preimage`;
    fs.unreadable = true;

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-applying-destination-mismatch",
          client: "codex",
        }),
      ]),
    );
    expect(fs.read(retained)).toBe(prior);
  });

  it("rejects orphan displaced quarantine evidence before any retry effect", () => {
    const fs = new CurrentDetachmentFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    const prior = fs.read(`${CODEX}/SKILL.md`);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failDetachment = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/current.preimage`;
    fs.remove(retained);
    fs.write(`${retained}.displaced`, prior);
    const stateBefore = fs.read(STATE);

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupPreflightError);
    expect((error as PersonalAuthoringSetupPreflightError).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "personal-quarantine-invalid",
          path: `${retained}.displaced`,
        }),
      ]),
    );
    expect(fs.read(STATE)).toBe(stateBefore);
    expect(fs.read(`${retained}.displaced`)).toBe(prior);
  });

  it("does not report success when an unbound generation appears during final publication", () => {
    const fs = new UnboundGenerationDuringCompletePublicationFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    const unbound = `${HOME}/.wpm/authoring-setup-quarantine/unbound/USER.txt`;

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    expect(fs.read(unbound)).toBe("UNBOUND USER EVIDENCE\n");
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(unbound)).toBe("UNBOUND USER EVIDENCE\n");
  });

  it("blocks and preserves an unexpected request-bound quarantine entry", () => {
    const fs = new CurrentDetachmentFailureFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });
    run(fs, env);
    fs.write(SOURCE, `${SKILL}next revision\n`);
    fs.failDetachment = true;
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    const quarantineRoot =
      applying.ok && applying.value.status === "applying"
        ? applying.value.pending.quarantineRoot
        : "";
    const unexpected = `${quarantineRoot}/USER.txt`;
    fs.write(unexpected, "USER\n");

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(unexpected)).toBe("USER\n");
  });

  it("preserves a destination that appears after preflight and reports a typed client failure", () => {
    const fs = new RaceAfterApplyingFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({
      failedClient: expect.objectContaining({ id: "codex", destination: CODEX }),
    });
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER ARRIVED AFTER PREFLIGHT\n");
  });

  it("reports granular progress and converges from an exact remaining legacy subset", () => {
    const fs = new PartialLegacyRemovalFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({
      completedClients: [],
      failedClient: expect.objectContaining({ id: "codex", outcome: "migrated" }),
      unattemptedClients: [],
      completed: expect.arrayContaining([
        expect.objectContaining({ id: "personal-client:codex:bootstrap", path: CODEX }),
      ]),
      failed: expect.objectContaining({
        id: "personal-client:codex:legacy",
        path: `${HOME}/.agents/skills/installer-builder`,
      }),
    });
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("directory");
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/references/workflow.md`)).toBe(
      "legacy reference\n",
    );

    expect(run(fs, env).clients[0]).toMatchObject({
      outcome: "migrated",
      legacy: "migrated",
      changed: true,
      reloadGuidance: expect.any(String),
    });
    expect(fs.inspectPath(`${HOME}/.agents/skills/installer-builder`).kind).toBe("missing");
  });

  it("retries exact retained legacy evidence captured before public detachment", () => {
    const fs = new LegacyCaptureInterruptionFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/legacy`;
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/SKILL.md`)).toContain(
      "installer-builder",
    );
    expect(fs.read(`${retained}/SKILL.md`)).toContain("installer-builder");

    const retryResult = run(fs, env);
    expect(retryResult.clients[0]).toMatchObject({ outcome: "migrated", legacy: "migrated" });
    expect(fs.inspectPath(applying.value.pending.quarantineRoot).kind).toBe("missing");
  });

  it("retries an exact displaced legacy subset against its complete retained copy", () => {
    const fs = new PartialDisplacedLegacyFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    const applying = parsePersonalAuthoringState(fs.read(STATE));
    if (!applying.ok || applying.value.status !== "applying") {
      throw new Error("expected applying personal setup state");
    }
    const retained = `${applying.value.pending.quarantineRoot}/codex/legacy`;
    expect(fs.read(`${retained}/SKILL.md`)).toContain("installer-builder");
    expect(fs.read(`${retained}.displaced/references/workflow.md`)).toBe("legacy reference\n");

    expect(run(fs, env).clients[0]).toMatchObject({ outcome: "migrated", legacy: "migrated" });
    expect(fs.inspectPath(applying.value.pending.quarantineRoot).kind).toBe("missing");
  });

  it("blocks an unexpected user entry added to partial legacy-removal residue", () => {
    const fs = new PartialLegacyRemovalFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });
    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    fs.write(`${HOME}/.agents/skills/installer-builder/USER.txt`, "USER\n");

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupPreflightError);
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/USER.txt`)).toBe("USER\n");
  });

  it("preserves a legacy path changed after preflight before writing the current skill", () => {
    const fs = new LegacyRaceAfterApplyingFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/SKILL.md`)).toBe("USER RACE\n");
  });

  it("rejects a selected ancestor alias raced in after preflight without writing outside HOME", () => {
    const fs = new AncestorRaceAfterApplyingFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    expect(fs.inspectPath("/outside/skills/wpm-create-package").kind).toBe("missing");
  });

  it("checks exact applying-state identity before the first selected client effect", () => {
    const fs = new StateRaceAfterApplyingFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env, ["codex", "claude-code"])).toThrowError(
      PersonalAuthoringSetupMutationFailure,
    );
    expect(fs.read(STATE)).toBe("USER STATE RACE\n");
    expect(fs.inspectPath(CODEX).kind).toBe("missing");
    expect(fs.inspectPath(CLAUDE).kind).toBe("missing");
  });

  it("refuses complete ownership publication when an earlier selected client drifts", () => {
    const fs = new FinalOwnershipRaceFileSystem();
    seed(fs);
    const env = new FakeEnvironment({ env: { HOME } });

    let error: unknown;
    try {
      run(fs, env, ["codex", "claude-code"]);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PersonalAuthoringSetupMutationFailure);
    expect(error).toMatchObject({ failedClient: expect.objectContaining({ id: "codex" }) });
    expect(fs.read(`${CODEX}/SKILL.md`)).toBe("USER CHANGED CODEX BEFORE COMPLETE\n");
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "applying" },
    });
  });

  it("binds legacy retirement to the exact tree preimage inside the confined remove boundary", () => {
    const fs = new LegacyConfinedRaceFileSystem();
    seed(fs);
    fs.copyTree(LEGACY, `${HOME}/.agents/skills/installer-builder`);
    const env = new FakeEnvironment({ env: { HOME } });

    expect(() => run(fs, env)).toThrowError(PersonalAuthoringSetupMutationFailure);
    expect(fs.read(`${HOME}/.agents/skills/installer-builder/USER-RACE.txt`)).toBe(
      "USER ARRIVED AT REMOVE BOUNDARY\n",
    );
    expect(parsePersonalAuthoringState(fs.read(STATE))).toMatchObject({
      ok: true,
      value: { status: "applying" },
    });
  });
});
