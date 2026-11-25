import { describe, expect, it } from "vitest";
import { compareCodeUnits } from "../../../src/util/code-unit-order.js";

describe("compareCodeUnits", () => {
  it("orders exact non-ASCII filenames without consulting the process locale", () => {
    expect(["ä.txt", "z.txt", "a.txt"].sort(compareCodeUnits)).toEqual(["a.txt", "z.txt", "ä.txt"]);
  });
});
