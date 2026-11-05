import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gitleaksExactLinePattern,
  proveInventoryDigest,
  rejectImplicitGitleaksPolicy,
} from "../../scripts/secret-policy.mjs";

describe("reviewed non-secret proof bounds", () => {
  it("accepts only the exact public line with native newline framing", () => {
    const line = "    const example = 'public header...'; // Public example";
    const pattern = new RegExp(gitleaksExactLinePattern(line));
    for (const framed of [line, `\n${line}`, `${line}\r`, `\n${line}\r`])
      expect(pattern.test(framed)).toBe(true);
    for (const changed of [
      line.trim(),
      `${line} extra credential`,
      `\n\n${line}`,
      line.replace("...", ".payload.signature"),
    ])
      expect(pattern.test(changed)).toBe(false);
    expect(() => gitleaksExactLinePattern(`${line}\nsecond line`)).toThrow();
  });
  it("requires the computed digest of an exact Git-selected installed projection", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-secret-proof-"));
    try {
      const path = ".claude/skills/bmad-fixture/resources/source.md";
      const file = join(root, path);
      mkdirSync(join(root, ".claude/skills/bmad-fixture/resources"), { recursive: true });
      writeFileSync(file, "known source bytes\n");
      const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
      const declared = "tea/agents/bmad-fixture/resources/source.md";
      expect(proveInventoryDigest(root, declared, digest, new Set([path]))).toBe(digest);
      expect(() => proveInventoryDigest(root, declared, "0".repeat(64), new Set([path]))).toThrow();
      expect(() => proveInventoryDigest(root, declared, digest, new Set())).toThrow();
      expect(() => proveInventoryDigest(root, "../../outside", digest, new Set([path]))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects source ignore files rather than trusting the native override flag", () => {
    const root = mkdtempSync(join(tmpdir(), "wpm-secret-ignore-"));
    try {
      expect(() => rejectImplicitGitleaksPolicy(root)).not.toThrow();
      writeFileSync(join(root, ".gitleaksignore"), "hidden-fingerprint\n");
      expect(() => rejectImplicitGitleaksPolicy(root)).toThrow(/bypass/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
