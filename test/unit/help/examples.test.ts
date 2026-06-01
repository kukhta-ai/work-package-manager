import { describe, expect, it } from "vitest";
import { EXAMPLE_HEADING, renderExamples } from "../../../src/help/examples.js";

/**
 * Unit test for the `renderExamples` formatter (task-28 §`src/help/examples.ts`) — the worked-example block
 * appended to a command's `--help`. Exercised in isolation (its JSDoc promises this), covering BOTH the
 * single-example (`Example:`) and multi-example (`Examples:`) headings + the optional note, so the plural
 * branch a future leaf (tasks 34-84) may use is not dead/unverified.
 */
describe("renderExamples — the --help worked-example formatter (doc 10 discoverability)", () => {
  it("renders a single example under the singular 'Example:' heading with the $ prompt", () => {
    const text = renderExamples([{ command: "wpm bundle new web-handoff --version 0.2.0" }]);
    expect(text).toContain(EXAMPLE_HEADING); // "Example:" (singular)
    expect(text).not.toContain("Examples:"); // not the plural heading
    expect(text).toContain("$ wpm bundle new web-handoff --version 0.2.0");
    // Leads with a blank line so the block separates from commander's built-in help.
    expect(text.startsWith("\n")).toBe(true);
  });

  it("renders an optional note beneath its example", () => {
    const text = renderExamples([
      { command: "wpm build package", note: "produce the distributable bundle" },
    ]);
    expect(text).toContain("$ wpm build package");
    expect(text).toContain("produce the distributable bundle");
  });

  it("renders multiple examples under the plural 'Examples:' heading", () => {
    const text = renderExamples([
      { command: "wpm bundle new web-handoff" },
      { command: "wpm bundle new doc-handoff --no-advisor" },
    ]);
    expect(text).toContain("Examples:"); // plural heading for >1
    expect(text).not.toContain(EXAMPLE_HEADING); // the singular "Example:" line is absent
    expect(text).toContain("$ wpm bundle new web-handoff");
    expect(text).toContain("$ wpm bundle new doc-handoff --no-advisor");
  });
});
