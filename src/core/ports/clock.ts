/**
 * The Clock port (doc 13 §3) — the core's window onto the current time, for dates in task creation, the
 * changelog, and receipts. Time is injected so the core is deterministic: tests pin it via the fixed-clock
 * fake, production reads the wall clock via the system-clock adapter.
 *
 * Synchronous (the cross-cutting decision), and pure as an interface — this file lives under `src/core/`, so
 * the import-boundary rule applies, but an interface constructs no `Date` and imports nothing effectful, so
 * it is trivially clean.
 */
export interface Clock {
  /**
   * The current instant.
   *
   * @returns A `Date` for "now" (the real time from the system adapter, or the pinned time from the fake).
   */
  now(): Date;
}
