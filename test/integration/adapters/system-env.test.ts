import { afterEach, describe, expect, it } from "vitest";
import { ProcessEnvironment } from "../../../src/adapters/process-env.js";
import { SystemClock } from "../../../src/adapters/system-clock.js";

/**
 * Acceptance/integration tests for the real Clock and Environment adapters: they must faithfully reflect the
 * actual system (the counterpart to the fakes' pin-the-value unit tests). Touching `process` / the wall
 * clock makes these integration tests. Any `process.env` mutation is restored in `afterEach` so nothing
 * leaks across tests; the integration project runs serially (`fileParallelism: false`).
 */
describe("SystemClock (real Clock adapter reflects the wall clock)", () => {
  it("now() returns a Date close to the real current time", () => {
    const before = Date.now();
    const observed = new SystemClock().now();
    const after = Date.now();
    expect(observed).toBeInstanceOf(Date);
    // Within the window bracketing the call (generous tolerance for scheduling jitter).
    expect(observed.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(observed.getTime()).toBeLessThanOrEqual(after + 1000);
  });
});

describe("ProcessEnvironment (real Environment adapter reflects process)", () => {
  const TEST_VAR = "WPM_TASK15_ENV_PROBE";
  const hadVar = TEST_VAR in process.env;
  const previous = process.env[TEST_VAR];

  afterEach(() => {
    // Restore process.env exactly so this test leaks nothing.
    if (hadVar) {
      process.env[TEST_VAR] = previous;
    } else {
      delete process.env[TEST_VAR];
    }
  });

  it("cwd() matches process.cwd()", () => {
    expect(new ProcessEnvironment().cwd()).toBe(process.cwd());
  });

  it("platform() matches process.platform", () => {
    expect(new ProcessEnvironment().platform()).toBe(process.platform);
  });

  it("getEnv reads a variable set on process.env, and undefined for an unset one", () => {
    const env = new ProcessEnvironment();
    process.env[TEST_VAR] = "probe-value";
    expect(env.getEnv(TEST_VAR)).toBe("probe-value");

    delete process.env[TEST_VAR];
    expect(env.getEnv(TEST_VAR)).toBeUndefined();
  });
});
