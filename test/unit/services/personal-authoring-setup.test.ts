import { describe, expect, it } from "vitest";
import {
  type ApplyingPersonalAuthoringState,
  type CompletePersonalAuthoringState,
  PERSONAL_AUTHORING_STATE_PATH,
  PERSONAL_BOOTSTRAP_SKILL_NAME,
  parsePersonalAuthoringState,
  personalSetupQuarantineRoot,
  personalSetupRequestKey,
  serializePersonalAuthoringState,
} from "../../../src/core/services/personal-authoring-setup.js";

const COMPLETE: CompletePersonalAuthoringState = {
  schemaVersion: 1,
  status: "complete",
  home: "/home/author",
  setupVersion: "0.1.0",
  defaults: ["codex"],
  managed: [
    {
      client: "codex",
      destination: "/home/author/.agents/skills/wpm-create-package",
      version: "0.1.0",
      sha256: "a".repeat(64),
    },
  ],
};

const NEXT_SHA = "b".repeat(64);
const REQUEST_KEY = personalSetupRequestKey(["codex"], COMPLETE.setupVersion, NEXT_SHA);
const APPLYING: ApplyingPersonalAuthoringState = {
  schemaVersion: 1,
  status: "applying",
  home: COMPLETE.home,
  setupVersion: COMPLETE.setupVersion,
  defaults: ["codex"],
  managed: [
    {
      client: "codex",
      destination: "/home/author/.agents/skills/wpm-create-package",
      version: "0.1.0",
      sha256: NEXT_SHA,
    },
  ],
  pending: {
    requestKey: REQUEST_KEY,
    sourceSha256: NEXT_SHA,
    quarantineRoot: personalSetupQuarantineRoot(COMPLETE.home, REQUEST_KEY),
    previous: COMPLETE,
    clients: [
      {
        client: "codex",
        destination: COMPLETE.managed[0]?.destination ?? "",
        outcome: "updated",
        beforeSha256: COMPLETE.managed[0]?.sha256 ?? "",
        afterSha256: NEXT_SHA,
        legacy: {
          path: "/home/author/.agents/skills/installer-builder",
          action: "absent",
          fingerprint: null,
        },
      },
    ],
  },
};

describe("personal authoring setup state", () => {
  it("uses one durable personal-only state path and bootstrap identity", () => {
    expect(PERSONAL_AUTHORING_STATE_PATH).toBe(".wpm/authoring-setup.json");
    expect(PERSONAL_BOOTSTRAP_SKILL_NAME).toBe("wpm-create-package");
  });

  it("round-trips canonical complete state bytes", () => {
    const text = serializePersonalAuthoringState(COMPLETE);
    expect(text).toBe(`${JSON.stringify(COMPLETE, null, 2)}\n`);
    expect(parsePersonalAuthoringState(text)).toEqual({ ok: true, value: COMPLETE });
  });

  it.each([
    ["unknown field", { ...COMPLETE, extra: true }],
    ["empty defaults", { ...COMPLETE, defaults: [] }],
    ["duplicate defaults", { ...COMPLETE, defaults: ["codex", "codex"] }],
    ["noncanonical defaults", { ...COMPLETE, defaults: ["claude-code", "codex"] }],
    [
      "duplicate managed client",
      { ...COMPLETE, managed: [COMPLETE.managed[0], COMPLETE.managed[0]] },
    ],
    [
      "invalid digest",
      { ...COMPLETE, managed: [{ ...COMPLETE.managed[0], sha256: "not-a-digest" }] },
    ],
    ["empty version", { ...COMPLETE, setupVersion: "" }],
    ["relative HOME", { ...COMPLETE, home: "home/author" }],
    ["noncanonical HOME", { ...COMPLETE, home: "/home/../author" }],
  ])("rejects %s", (_label, value) => {
    expect(parsePersonalAuthoringState(`${JSON.stringify(value)}\n`).ok).toBe(false);
  });

  it("rejects noncanonical JSON bytes even when their value is valid", () => {
    expect(parsePersonalAuthoringState(JSON.stringify(COMPLETE))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("canonical"),
    });
  });

  it("round-trips one coherent applying plan", () => {
    const text = serializePersonalAuthoringState(APPLYING);
    expect(parsePersonalAuthoringState(text)).toEqual({ ok: true, value: APPLYING });
  });

  it.each([
    ["a default without cumulative ownership", { ...COMPLETE, managed: [] }],
    [
      "a selected default whose ownership version differs from setup version",
      {
        ...COMPLETE,
        setupVersion: "0.2.0",
        managed: [{ ...COMPLETE.managed[0], version: "0.1.0" }],
      },
    ],
    [
      "a foreign complete destination",
      {
        ...COMPLETE,
        managed: [{ ...COMPLETE.managed[0], destination: "/foreign/wpm-create-package" }],
      },
    ],
    [
      "an applying request key not derived from the request",
      { ...APPLYING, pending: { ...APPLYING.pending, requestKey: "forged" } },
    ],
    [
      "an applying quarantine root not derived from the request",
      { ...APPLYING, pending: { ...APPLYING.pending, quarantineRoot: "/foreign/quarantine" } },
    ],
    [
      "an applying source that differs from the desired client digest",
      {
        ...APPLYING,
        pending: {
          ...APPLYING.pending,
          clients: [{ ...APPLYING.pending.clients[0], afterSha256: "c".repeat(64) }],
        },
      },
    ],
    [
      "an applying client with a foreign destination",
      {
        ...APPLYING,
        pending: {
          ...APPLYING.pending,
          clients: [{ ...APPLYING.pending.clients[0], destination: "/foreign/skill" }],
        },
      },
    ],
    [
      "an applying legacy path outside HOME",
      {
        ...APPLYING,
        pending: {
          ...APPLYING.pending,
          clients: [
            {
              ...APPLYING.pending.clients[0],
              legacy: { ...APPLYING.pending.clients[0]?.legacy, path: "/foreign/legacy" },
            },
          ],
        },
      },
    ],
    [
      "a previous state for another HOME",
      {
        ...APPLYING,
        pending: {
          ...APPLYING.pending,
          previous: {
            ...COMPLETE,
            home: "/foreign",
            managed: [
              {
                ...COMPLETE.managed[0],
                destination: "/foreign/.agents/skills/wpm-create-package",
              },
            ],
          },
        },
      },
    ],
    [
      "an outcome inconsistent with its before and after digests",
      {
        ...APPLYING,
        pending: {
          ...APPLYING.pending,
          clients: [{ ...APPLYING.pending.clients[0], outcome: "installed" }],
        },
      },
    ],
  ])("rejects %s", (_label, value) => {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    expect(parsePersonalAuthoringState(text).ok).toBe(false);
  });
});
