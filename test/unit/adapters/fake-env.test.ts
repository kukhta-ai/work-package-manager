import { describe, expect, it } from "vitest";
import { FakeEnvironment } from "../../../src/adapters/fake-env.js";
import type { Environment } from "../../../src/core/ports/environment.js";

describe("FakeEnvironment (the Environment fake — pins cwd/platform/env, AC#2)", () => {
  it("returns the constructed cwd, platform, and env vars", () => {
    const env = new FakeEnvironment({
      cwd: "/work/project",
      platform: "win32",
      env: { HOME: "/home/x", FOO: "bar" },
    });
    expect(env.cwd()).toBe("/work/project");
    expect(env.platform()).toBe("win32");
    expect(env.getEnv("HOME")).toBe("/home/x");
    expect(env.getEnv("FOO")).toBe("bar");
  });

  it("defaults to '/', 'linux', and an empty env", () => {
    const env = new FakeEnvironment();
    expect(env.cwd()).toBe("/");
    expect(env.platform()).toBe("linux");
    expect(env.getEnv("ANYTHING")).toBeUndefined();
  });

  it("getEnv returns undefined for an unset variable", () => {
    const env = new FakeEnvironment({ env: { SET: "1" } });
    expect(env.getEnv("SET")).toBe("1");
    expect(env.getEnv("UNSET")).toBeUndefined();
  });

  it("setCwd pins the working directory", () => {
    const env = new FakeEnvironment();
    env.setCwd("/elsewhere");
    expect(env.cwd()).toBe("/elsewhere");
  });

  it("setPlatform pins the platform (for the Windows-vs-POSIX distinction)", () => {
    const env = new FakeEnvironment({ platform: "linux" });
    env.setPlatform("darwin");
    expect(env.platform()).toBe("darwin");
  });

  it("setEnv and deleteEnv mutate the env map", () => {
    const env = new FakeEnvironment();
    env.setEnv("KEY", "value");
    expect(env.getEnv("KEY")).toBe("value");
    env.deleteEnv("KEY");
    expect(env.getEnv("KEY")).toBeUndefined();
  });

  it("pins all four facets at once (the AC#2 scenario)", () => {
    const env = new FakeEnvironment();
    env.setCwd("/pinned");
    env.setPlatform("win32");
    env.setEnv("XDG_CONFIG_HOME", "/pinned/.config");
    expect([env.cwd(), env.platform(), env.getEnv("XDG_CONFIG_HOME")]).toEqual([
      "/pinned",
      "win32",
      "/pinned/.config",
    ]);
  });

  it("is usable wherever an Environment is required (AC#1, type-level)", () => {
    const env: Environment = new FakeEnvironment({ cwd: "/x" });
    expect(env.cwd()).toBe("/x");
  });
});
