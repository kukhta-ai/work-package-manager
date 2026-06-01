import { describe, expect, it } from "vitest";
import { FixedClock } from "../../../src/adapters/fixed-clock.js";
import type { Clock } from "../../../src/core/ports/clock.js";

describe("FixedClock (the Clock fake — pins time, AC#2)", () => {
  it("now() returns the pinned instant (Date construction)", () => {
    const pinned = new Date("2026-01-02T03:04:05.000Z");
    const clock = new FixedClock(pinned);
    expect(clock.now().toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("accepts an ISO string and epoch ms", () => {
    expect(new FixedClock("2026-06-01T00:00:00.000Z").now().toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(new FixedClock(0).now().toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("defaults to the Unix epoch when unconfigured", () => {
    expect(new FixedClock().now().getTime()).toBe(0);
  });

  it("returns a fresh Date each call; mutating it does not move the clock", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    const first = clock.now();
    first.setFullYear(1999); // mutate the returned Date
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now()).not.toBe(first); // a new instance each time
  });

  it("set() re-pins the clock", () => {
    const clock = new FixedClock(0);
    clock.set("2030-12-25T12:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2030-12-25T12:00:00.000Z");
  });

  it("advance(ms) moves time forward and backward deterministically", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");
    clock.advance(1000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.000Z");
    clock.advance(-1000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws on an invalid time", () => {
    expect(() => new FixedClock("not-a-date")).toThrow();
  });

  it("is usable wherever a Clock is required (AC#1, type-level)", () => {
    const clock: Clock = new FixedClock("2026-01-01T00:00:00.000Z");
    expect(clock.now()).toBeInstanceOf(Date);
  });
});
