import type { Clock } from "../core/ports/clock.js";

/** A value {@link FixedClock} can be pinned to: a `Date`, an ISO-8601 string, or epoch milliseconds. */
export type FixedTime = Date | string | number;

/**
 * A {@link Clock} fake pinned to a fixed instant, for deterministic tests (AC#2). `now()` always returns the
 * pinned time until it is moved with {@link set} or {@link advance}. Pure: no `Date.now()`, no I/O.
 *
 * The pinned instant is stored as epoch milliseconds and {@link now} returns a **fresh** `Date` each call,
 * so a caller mutating the returned `Date` cannot move the clock.
 */
export class FixedClock implements Clock {
  private millis: number;

  /**
   * @param time - The instant to pin to (a `Date`, ISO string, or epoch ms). Defaults to the Unix epoch
   *   (`1970-01-01T00:00:00.000Z`) so an unconfigured fixed clock is still fully deterministic.
   */
  constructor(time: FixedTime = 0) {
    this.millis = FixedClock.toMillis(time);
  }

  /** Convert any {@link FixedTime} to epoch milliseconds, throwing on an unparseable value. */
  private static toMillis(time: FixedTime): number {
    const millis = time instanceof Date ? time.getTime() : new Date(time).getTime();
    if (Number.isNaN(millis)) {
      throw new Error(`FixedClock: invalid time ${JSON.stringify(time)}`);
    }
    return millis;
  }

  /** @inheritdoc */
  now(): Date {
    return new Date(this.millis);
  }

  /**
   * Re-pin the clock to a new instant.
   *
   * @param time - The new instant (a `Date`, ISO string, or epoch ms).
   */
  set(time: FixedTime): void {
    this.millis = FixedClock.toMillis(time);
  }

  /**
   * Move the clock forward (or backward, with a negative value) by a number of milliseconds.
   *
   * @param milliseconds - The amount to advance by; may be negative.
   */
  advance(milliseconds: number): void {
    this.millis += milliseconds;
  }
}
