/** JSON boundaries for mutable test fixtures. These do not replace production validation. */
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("fixture JSON must contain an object");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("fixture JSON must contain text");
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("fixture JSON must contain an array");
  return value as unknown[];
}

function json(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function findingRecords(contents: string): { field: string; [key: string]: unknown }[] {
  return array(object(json(contents)).findings).map((entry) => {
    const value = object(entry);
    return { ...value, field: text(value.field) };
  });
}

interface CandidateFixture {
  candidateId: string;
  distribution: { unresolvedFacts: unknown[] };
  binding: {
    artifact: { path: string; digests: Record<string, string> };
    releaseNotes: { path: string; preview: string };
    evidence: { quality: { status: string; rawDigest: string } };
  };
  unexpectedEligibility?: string;
}

/** Validate the fields these tests read or mutate, preserving all other fixture bytes as parsed. */
function assertCandidateFixture(value: unknown): asserts value is CandidateFixture {
  const record = object(value);
  text(record.candidateId);
  array(object(record.distribution).unresolvedFacts);
  const binding = object(record.binding);
  const artifact = object(binding.artifact);
  text(artifact.path);
  for (const digest of Object.values(object(artifact.digests))) text(digest);
  const notes = object(binding.releaseNotes);
  text(notes.path);
  text(notes.preview);
  const quality = object(object(binding.evidence).quality);
  text(quality.status);
  text(quality.rawDigest);
}

export function candidateRecord(contents: string): CandidateFixture {
  const value = json(contents);
  assertCandidateFixture(value);
  return value;
}

interface QualityFixture {
  sourceRevision: string;
  checks: { name: string; status: string }[];
}

function assertQualityFixture(value: unknown): asserts value is QualityFixture {
  const record = object(value);
  text(record.sourceRevision);
  for (const check of array(record.checks)) {
    text(object(check).name);
    text(object(check).status);
  }
}

export function qualityRecord(contents: string): QualityFixture {
  const value = json(contents);
  assertQualityFixture(value);
  return value;
}

interface PackedInstallFixture {
  sourceRevision: string;
  sourceBinding: { checkoutRevision: string };
  configuration: { status: string };
}

function assertPackedInstallFixture(value: unknown): asserts value is PackedInstallFixture {
  const record = object(value);
  text(record.sourceRevision);
  text(object(record.sourceBinding).checkoutRevision);
  text(object(record.configuration).status);
}

export function packedInstallRecord(contents: string): PackedInstallFixture {
  const value = json(contents);
  assertPackedInstallFixture(value);
  return value;
}
