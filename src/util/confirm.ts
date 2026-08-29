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
export interface InputLineSession {
  /** Read the next buffered line, or `undefined` after EOF/error with no line remaining. */
  readLine(): Promise<string | undefined>;
}

/**
 * Create one persistent buffered line session. A single stream chunk may contain multiple answers; none are
 * discarded between chooser and confirmation reads.
 */
export function createInputLineSession(input: NodeJS.ReadableStream): InputLineSession {
  const lines: string[] = [];
  const waiting: Array<(line: string | undefined) => void> = [];
  let buffer = "";
  let ended = false;

  const deliver = (line: string): void => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    const waiter = waiting.shift();
    if (waiter === undefined) lines.push(normalized);
    else waiter(normalized);
  };
  const finish = (discardBuffer = false): void => {
    if (ended) return;
    if (!discardBuffer && buffer.length > 0) deliver(buffer);
    buffer = "";
    ended = true;
    for (const waiter of waiting.splice(0)) waiter(undefined);
  };
  input.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      deliver(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  });
  input.once("end", () => finish());
  input.once("error", () => finish(true));

  return {
    readLine: async () => {
      const line = lines.shift();
      if (line !== undefined) return line;
      if (ended) return undefined;
      return new Promise<string | undefined>((resolve) => waiting.push(resolve));
    },
  };
}

/** Parse one safe affirmative answer. */
export function isAffirmativeConfirmation(answer: string | undefined): boolean {
  const normalised = answer?.trim().toLowerCase();
  return normalised === "y" || normalised === "yes";
}

export async function readConfirmation(input: NodeJS.ReadableStream): Promise<boolean> {
  return isAffirmativeConfirmation(await createInputLineSession(input).readLine());
}
