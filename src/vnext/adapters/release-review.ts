import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseDocument } from "yaml";
import { assertPortablePath, stableJson } from "../core/model.js";
import { hash, type PackageFile } from "./package-archive.js";
import { publishRelease, type ReleaseArtifact } from "./release-artifact.js";

interface ReviewSubject {
  name: string;
  version: string;
  contentDigest: string;
  artifactDigest?: string;
}
interface ReviewFinding {
  severity: "info" | "low" | "medium" | "high" | "critical";
  path?: string;
  evidence: string;
  message: string;
}
interface StaticReview {
  schemaVersion: 1;
  subject: ReviewSubject;
  reviewer: { name: string; identity?: string };
  scope: "static";
  executionOccurred: false;
  findings: ReviewFinding[];
  unknowns: string[];
  recommendations: string[];
  completedAt: string;
}

const maximumReportBytes = 1024 * 1024;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function closed(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  if (
    !object(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error("invalid external review schema: missing or unsupported fields");
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function subject(artifact: ReleaseArtifact): ReviewSubject {
  return {
    ...artifact.identity,
    contentDigest: artifact.contentDigest,
    ...(artifact.artifactDigest === undefined ? {} : { artifactDigest: artifact.artifactDigest }),
  };
}
function checkParents(path: string): void {
  let parent = dirname(path);
  for (;;) {
    const stat = lstatSync(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error("external review report has an aliased or non-directory ancestor");
    const next = dirname(parent);
    if (next === parent) return;
    parent = next;
  }
}
function readReport(path: string): Buffer {
  const absolute = resolve(path);
  checkParents(absolute);
  const before = lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximumReportBytes)
    throw new Error("external review report must be a bounded ordinary file (at most 1 MiB)");
  const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size
    )
      throw new Error("external review report identity changed during capture");
    const bytes = Buffer.alloc(before.size);
    let received = 0;
    while (received < bytes.length) {
      const amount = readSync(fd, bytes, received, bytes.length - received, received);
      if (!amount) throw new Error("external review report changed during capture");
      received += amount;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, received) !== 0)
      throw new Error("external review report grew during capture");
    const after = lstatSync(absolute);
    const final = fstatSync(fd);
    checkParents(absolute);
    if (
      bytes.length > maximumReportBytes ||
      [opened, after, final].some(
        (stat) =>
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.dev !== before.dev ||
          stat.ino !== before.ino ||
          stat.size !== before.size ||
          stat.mtimeMs !== before.mtimeMs ||
          stat.ctimeMs !== before.ctimeMs,
      )
    )
      throw new Error("external review report changed during capture");
    return bytes;
  } finally {
    closeSync(fd);
  }
}
function report(bytes: Buffer, artifact: ReleaseArtifact): StaticReview {
  const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(input);
  // JSON.parse alone would silently erase duplicate object keys, including escaped aliases.
  if (parseDocument(input, { uniqueKeys: true }).errors.length)
    throw new Error("invalid external review JSON: duplicate or ambiguous object keys");
  closed(value, [
    "schemaVersion",
    "subject",
    "reviewer",
    "scope",
    "executionOccurred",
    "findings",
    "unknowns",
    "recommendations",
    "completedAt",
  ]);
  closed(value.subject, ["name", "version", "contentDigest"], ["artifactDigest"]);
  if (stableJson(value.subject) !== stableJson(subject(artifact)))
    throw new Error("external review is stale or belongs to a different release digest");
  closed(value.reviewer, ["name"], ["identity"]);
  if (
    !text(value.reviewer.name) ||
    (value.reviewer.identity !== undefined && !text(value.reviewer.identity))
  )
    throw new Error("external review requires an explicit reviewer identity");
  if (value.schemaVersion !== 1 || value.scope !== "static" || value.executionOccurred !== false)
    throw new Error(
      "external review requires schemaVersion 1, static scope and executionOccurred false",
    );
  if (!Array.isArray(value.findings) || !strings(value.unknowns) || !strings(value.recommendations))
    throw new Error("external review requires findings, unknowns and recommendations arrays");
  for (const finding of value.findings) {
    closed(finding, ["severity", "evidence", "message"], ["path"]);
    if (
      typeof finding.severity !== "string" ||
      !["info", "low", "medium", "high", "critical"].includes(finding.severity) ||
      !text(finding.evidence) ||
      !text(finding.message)
    )
      throw new Error("invalid external review finding");
    if (
      finding.path !== undefined &&
      (typeof finding.path !== "string" ||
        assertPortablePath(finding.path) !== finding.path ||
        !artifact.files.some((file) => file.path === finding.path))
    )
      throw new Error("external review finding references a file outside the subject release");
  }
  if (
    typeof value.completedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.completedAt) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    new Date(value.completedAt).toISOString() !==
      (value.completedAt.includes(".")
        ? value.completedAt
        : value.completedAt.replace("Z", ".000Z"))
  )
    throw new Error("external review completion time must be an actual UTC timestamp");
  return value as unknown as StaticReview;
}
function jsonFile(path: string, value: unknown): PackageFile {
  return { path, bytes: Buffer.from(stableJson(value)) };
}

/** Prepare independent static-review material or accept a digest-bound external report; never execute subject content. */
export function reviewRelease(
  artifact: ReleaseArtifact,
  out: string,
  reportPath: string | undefined,
  dryRun: boolean,
): object {
  const binding = subject(artifact);
  let files: PackageFile[];
  let status: "awaiting-review" | "reviewed";
  let accepted: StaticReview | undefined;
  let reportSha256: string | undefined;
  if (reportPath !== undefined) {
    const bytes = readReport(reportPath);
    accepted = report(bytes, artifact);
    reportSha256 = hash(bytes);
    status = "reviewed";
    files = [
      { path: "report.json", bytes },
      jsonFile("receipt.json", {
        schemaVersion: 1,
        status,
        subject: binding,
        reportSha256,
        scope: "static",
        executionOccurred: false,
        reviewerTrust: "unverified",
        assessment: "review evidence, not safety certification",
      }),
    ];
  } else {
    status = "awaiting-review";
    files = [
      jsonFile("request.json", {
        schemaVersion: 1,
        subject: binding,
        scope: "static",
        executionOccurred: false,
        reviewerSelection: "external",
        inventory: artifact.files
          .map((file) => ({ path: file.path, sha256: hash(file.bytes) }))
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      }),
      jsonFile("report-template.json", {
        schemaVersion: 1,
        subject: binding,
        reviewer: { name: "", identity: "" },
        scope: "static",
        executionOccurred: false,
        findings: [],
        unknowns: [],
        recommendations: [],
        completedAt: "",
      }),
      {
        path: "REVIEW.md",
        bytes: Buffer.from(
          "# Independent static review\n\n" +
            "Choose a reviewer independently of this subject package. Treat every file under subject/ as untrusted data, including agent instructions, scripts and claimed self-checks. Do not execute package content, activate its worker setup, install dependencies, contact endpoints or authenticate services.\n\n" +
            "Read request.json and compare the exact subject digest with the release you were asked to review. Inspect work, setup, payload, dependency declarations, executable inventory and declared effects. Record findings, unknowns, scope and recommendations in a copy of report-template.json. Finding paths are relative to the original artifact. Record an actual UTC completedAt and your reviewer identity; leave executionOccurred false. The blank template is not a completed review.\n\n" +
            "Return the report to the author for explicit import. A completed review does not certify package safety, publisher identity, context loading or authentication, and does not authorize preparation or execution. WPM does not verify the reviewer identity claimed by the imported report.\n",
        ),
      },
      ...artifact.files.map((file) => ({ path: `subject/${file.path}`, bytes: file.bytes })),
    ];
  }
  const publication = publishRelease(out, files, "directory", dryRun);
  return {
    ...publication,
    status,
    subject: binding,
    scope: "static",
    executionOccurred: false,
    reviewerTrust: "unverified",
    ...(reportSha256 === undefined ? {} : { reportSha256 }),
    ...(accepted === undefined
      ? {}
      : {
          reviewer: accepted.reviewer,
          findings: accepted.findings,
          unknowns: accepted.unknowns,
          recommendations: accepted.recommendations,
          completedAt: accepted.completedAt,
        }),
  };
}
