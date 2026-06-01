import type { Clock } from "../core/ports/clock.js";

/**
 * The real {@link Clock} adapter — reads the system wall clock. It lives under `src/adapters/`, outside the
 * pure core, so constructing a `Date` here is correct. The composition root (`cli.ts`, task-27) wires this;
 * tests use the fixed-clock fake.
 */
export class SystemClock implements Clock {
  /** @inheritdoc */
  now(): Date {
    return new Date();
  }
}
