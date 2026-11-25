import { expect } from "vitest";

/** Narrow Vitest's intentionally `any` asymmetric matcher API at the test-library boundary. */
export const match = {
  any: (value: unknown): unknown => expect.any(value),
  anything: (): unknown => expect.anything(),
  stringContaining: (value: string): unknown => expect.stringContaining(value),
  stringMatching: (value: string | RegExp): unknown => expect.stringMatching(value),
  objectContaining: (value: Record<string, unknown>): unknown => expect.objectContaining(value),
  arrayContaining: (value: unknown[]): unknown => expect.arrayContaining(value),
};
