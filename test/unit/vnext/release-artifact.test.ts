import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contentDigest, hash } from "../../../src/vnext/adapters/package-archive.js";
import {
  createReleaseFiles,
  validateReleaseEnvelope,
} from "../../../src/vnext/adapters/release-artifact.js";
import { createReleaseZip, readReleaseZip } from "../../../src/vnext/adapters/release-codec.js";
import { stableJson } from "../../../src/vnext/core/model.js";

const contract = {
  path: "contract.json",
  bytes: Buffer.from(stableJson({ schemaVersion: 1, name: "sample", version: "1.0.0" })),
};
const source = () => [contract, { path: "payload/hello.txt", bytes: Buffer.from("hello") }];

describe("release envelopes", () => {
  it("records every payload byte and shares identity across orderings", () => {
    const a = createReleaseFiles(source()),
      b = createReleaseFiles(source().reverse());
    expect(a).toEqual(b);
    const parsed = validateReleaseEnvelope(a);
    expect(parsed).toEqual({
      files: source(),
      manifestPresent: true,
      contentDigest: contentDigest(source()),
      identity: { name: "sample", version: "1.0.0" },
    });
    const manifest: unknown = JSON.parse(
      a.find((file) => file.path === "release-manifest.json")?.bytes.toString() ?? "null",
    );
    expect(manifest).toMatchObject({
      inventory: source().map((file) => ({ path: file.path, sha256: hash(file.bytes) })),
    });
  });
  it("reads legacy payloads without claiming a manifest", () => {
    expect(validateReleaseEnvelope(source())).toMatchObject({ manifestPresent: false });
  });
  it("identifies the explicitly selected root of a versioned graph", () => {
    const files = [
      {
        path: "contract.json",
        bytes: Buffer.from(
          JSON.stringify({
            schemaVersion: 2,
            graph: {
              root: "root",
              nodes: { root: { record: { name: "root-package", version: "2.0.0" } } },
            },
          }),
        ),
      },
    ];
    expect(validateReleaseEnvelope(createReleaseFiles(files)).identity).toEqual({
      name: "root-package",
      version: "2.0.0",
    });
  });
  it.each([
    "changed",
    "extra",
    "missing",
    "manifest-edit",
    "manifest-extra",
  ])("rejects %s content", (mode) => {
    let files = createReleaseFiles(source()).map((file) => ({
      ...file,
      bytes: Buffer.from(file.bytes),
    }));
    if (mode === "changed")
      files = files.map((file) =>
        file.path === "payload/hello.txt" ? { ...file, bytes: Buffer.from("edited") } : file,
      );
    if (mode === "extra") files.push({ path: "surprise.txt", bytes: Buffer.from("foreign") });
    if (mode === "missing") files = files.filter((file) => file.path !== "payload/hello.txt");
    if (mode.startsWith("manifest"))
      files = files.map((file) =>
        file.path === "release-manifest.json"
          ? {
              ...file,
              bytes:
                mode === "manifest-edit"
                  ? Buffer.from("{}")
                  : Buffer.from(
                      file.bytes
                        .toString()
                        .replace('"schemaVersion": 1', '"schemaVersion": 1, "extra": true'),
                    ),
            }
          : file,
      );
    expect(() => validateReleaseEnvelope(files)).toThrow();
  });
  it.each([
    "../escape",
    "/absolute",
    "C:/drive",
    "a/../b",
    "x".repeat(101),
  ])("rejects nonportable path %s", (path) => {
    expect(() => createReleaseFiles([contract, { path, bytes: Buffer.from("x") }])).toThrow();
  });
  it("rejects reserved envelopes, duplicate paths and portable aliases", () => {
    expect(() => createReleaseFiles(createReleaseFiles(source()))).toThrow("reserved");
    expect(() => createReleaseFiles([contract, contract])).toThrow("collision");
    expect(() =>
      createReleaseFiles([
        contract,
        { path: "A/x", bytes: Buffer.from("") },
        { path: "a/y", bytes: Buffer.from("") },
      ]),
    ).toThrow("collision");
  });
});

describe("bounded ZIP32 container", () => {
  it("roundtrips varied binary payloads deterministically", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2048 }), (data) => {
        const files = [contract, { path: "payload/binary", bytes: Buffer.from(data) }];
        const encoded = createReleaseZip(files);
        expect(encoded).toEqual(createReleaseZip([...files].reverse()));
        expect(readReleaseZip(encoded)).toEqual(files);
      }),
      { numRuns: 50 },
    );
  });
  it("reads an independently generated Python zipfile deflate fixture", () => {
    const fixture = Buffer.from(
      "UEsDBBQAAAAIAAyhe12FEUoNDQAAAAsAAAAJAAAAaGVsbG8udHh0y0jNyclXKM8vykkBAFBLAQIUAxQAAAAIAAyhe12FEUoNDQAAAAsAAAAJAAAAAAAAAAAAAACAAQAAAABoZWxsby50eHRQSwUGAAAAAAEAAQA3AAAANAAAAAAA",
      "base64",
    );
    expect(readReleaseZip(fixture)).toEqual([
      { path: "hello.txt", bytes: Buffer.from("hello world") },
    ]);
  });
  it.each([
    "truncated",
    "prefix",
    "suffix",
    "crc",
    "local-name",
    "encrypted",
    "descriptor",
    "symlink",
    "zip64",
    "bomb",
    "directory-offset",
  ])("rejects %s ZIP", (mode) => {
    let bytes = createReleaseZip([{ path: "hello.txt", bytes: Buffer.from("hello") }]);
    const central = bytes.readUInt32LE(bytes.length - 6);
    if (mode === "truncated") bytes = bytes.subarray(0, bytes.length - 1);
    if (mode === "prefix") bytes = Buffer.concat([Buffer.from("prefix"), bytes]);
    if (mode === "suffix") bytes = Buffer.concat([bytes, Buffer.from("suffix")]);
    if (mode === "crc") bytes[39] = 0;
    if (mode === "local-name") bytes[30] = 0x41;
    if (mode === "encrypted" || mode === "descriptor")
      bytes.writeUInt16LE(mode === "encrypted" ? 1 : 8, central + 8);
    if (mode === "symlink") bytes.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    if (mode === "zip64") bytes.writeUInt16LE(65535, bytes.length - 14);
    if (mode === "bomb") bytes.writeUInt32LE(65 * 1024 * 1024, central + 24);
    if (mode === "directory-offset") bytes.writeUInt32LE(1, bytes.length - 6);
    expect(() => readReleaseZip(bytes)).toThrow();
  });
  it("rejects duplicate names and ignores no local/central discrepancies", () => {
    expect(() => createReleaseZip([contract, contract])).toThrow("collision");
    const zip = createReleaseZip(source());
    zip.writeUInt32LE(0, 14);
    expect(() => readReleaseZip(zip)).toThrow("differ");
  });
});
