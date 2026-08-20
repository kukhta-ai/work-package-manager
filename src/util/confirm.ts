/**
 * The interactive confirmation read for a destructive command (doc 10 row 153 step 1: "Confirm with the author
 * (destructive)"). This is the IMPURE SHELL — it reads `process.stdin`-shaped input — and is the sanctioned place
 * for that effect: the import-boundary rule is scoped to `src/core/**`, which this `src/util/` file is not
 * (doc 13 §1/§6). The confirmation DECISION is made in the shell so the pure operation acts ONLY when confirmed;
 * `process.stdin` never reaches the core (doc 13 §3: stdin is not a port).
 *
 * It reads ONE line from the provided stream and resolves a boolean: `y`/`yes` (case-insensitive, trimmed) ⇒
 * confirmed; anything else — including an empty line, EOF with no input, or a non-`y` answer — ⇒ declined. A
 * destructive op must never proceed without an explicit yes, so every ambiguous/absent answer is a safe decline.
 */

/**
 * Read a y/N confirmation answer from `input`, resolving `true` iff the first line read is `y` or `yes`
 * (case-insensitive, surrounding whitespace ignored). Resolves `false` on any other first line, on an empty line,
 * or on end-of-stream before any line is read (the safe decline for a destructive action). Reads at most the
 * first line: it resolves as soon as a newline is seen, without consuming the rest of the stream.
 *
 * @param input - The input stream to read the answer from (the real `process.stdin`, or a test `Readable`).
 * @returns A promise resolving `true` when the answer affirms, `false` otherwise.
 */
export function readConfirmation(input: NodeJS.ReadableStream): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let buffer = "";
    let settled = false;

    const finish = (answer: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("error", onError);
      const normalised = answer.trim().toLowerCase();
      resolve(normalised === "y" || normalised === "yes");
    };

    const onData = (chunk: Buffer | string): void => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex >= 0) {
        finish(buffer.slice(0, newlineIndex));
      }
    };
    const onEnd = (): void => finish(buffer); // EOF with no newline: the accumulated text is the (last) answer.
    const onError = (): void => finish(""); // A read error is treated as a decline (never destroy on failure).

    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
  });
}
