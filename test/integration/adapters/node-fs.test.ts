import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFileSystem } from "../../../src/adapters/node-fs.js";
import { withTempDir } from "../../helpers/tmpdir.js";

class FilePublicationRaceFileSystem extends NodeFileSystem {
  constructor(
    private readonly racedPath: string,
    private readonly racedContent: string,
  ) {
    super();
  }

  protected override beforeConfinedFilePublication(path: string): void {
    if (path === this.racedPath) writeFileSync(path, this.racedContent);
  }
}

class FileArrivalDuringStagingFileSystem extends NodeFileSystem {
  constructor(private readonly racedContent: string) {
    super();
  }

  protected override afterConfinedFileStaging(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.racedContent);
  }
}

class TreeDetachmentRaceFileSystem extends NodeFileSystem {
  constructor(private readonly racedTree: string) {
    super();
  }

  protected override beforeConfinedTreeDetachment(path: string): void {
    if (path === this.racedTree) writeFileSync(join(path, "USER-RACE.txt"), "USER TREE\n");
  }
}

class TreeArrivalDuringPrivatePreparationFileSystem extends NodeFileSystem {
  constructor(private readonly content: string) {
    super();
  }

  protected override afterConfinedTreePrivatePreparation(path: string): void {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "SKILL.md"), this.content);
  }
}

class FileDetachmentInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  constructor(
    private readonly interruptedPath: string,
    private readonly racedContent?: string,
  ) {
    super();
  }

  protected override afterConfinedFileDetachment(path: string): void {
    if (path !== this.interruptedPath || this.interrupted) return;
    this.interrupted = true;
    if (this.racedContent !== undefined) writeFileSync(path, this.racedContent);
    throw new Error("injected interruption after confined file detachment");
  }
}

class FilePublicationInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  constructor(private readonly interruptedPath: string) {
    super();
  }

  protected override afterConfinedFilePublication(path: string): void {
    if (path !== this.interruptedPath || this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected interruption after confined file publication");
  }
}

class FileArrivalAfterDetachmentFileSystem extends NodeFileSystem {
  private raced = false;

  constructor(
    private readonly racedPath: string,
    private readonly racedContent: string,
  ) {
    super();
  }

  protected override afterConfinedFileDetachment(path: string): void {
    if (path !== this.racedPath || this.raced) return;
    this.raced = true;
    writeFileSync(path, this.racedContent);
  }
}

class FileReplacementDuringDetachmentFileSystem extends NodeFileSystem {
  private raced = false;

  constructor(
    private readonly racedPath: string,
    private readonly racedContent: string,
  ) {
    super();
  }

  protected override beforeConfinedFileDetachment(path: string): void {
    if (path !== this.racedPath || this.raced) return;
    this.raced = true;
    unlinkSync(path);
    writeFileSync(path, this.racedContent);
  }
}

class FileDisplacementInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  constructor(private readonly interruptedPath: string) {
    super();
  }

  protected override afterConfinedFileDisplacement(path: string): void {
    if (path !== this.interruptedPath || this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected interruption after atomic displacement");
  }
}

class TreeDetachmentInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  constructor(private readonly interruptedPath: string) {
    super();
  }

  protected override afterConfinedTreeDetachment(path: string): void {
    if (path !== this.interruptedPath || this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected interruption after confined tree detachment");
  }
}

class TreeCaptureInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  constructor(private readonly interruptedPath: string) {
    super();
  }

  protected override beforeConfinedTreeDetachment(path: string): void {
    if (path !== this.interruptedPath || this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected interruption after retained tree capture");
  }
}

class TreeReplacementBeforeDetachmentFileSystem extends NodeFileSystem {
  private raced = false;

  protected override beforeConfinedTreeDetachment(path: string): void {
    if (this.raced) return;
    this.raced = true;
    const original = `${path}.original`;
    renameSync(path, original);
    cpSync(original, path, { recursive: true });
  }
}

class PartialTreeCleanupInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  protected override beforeConfinedTreeCleanup(displacedPath: string): void {
    if (this.interrupted) return;
    this.interrupted = true;
    unlinkSync(join(displacedPath, "SKILL.md"));
    throw new Error("injected partial displaced-tree cleanup");
  }
}

class StagedCleanupInterruptionFileSystem extends NodeFileSystem {
  private interrupted = false;

  protected override afterConfinedStagedCleanup(): void {
    if (this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected staged cleanup interruption");
  }
}

class PublicRaceDuringStagedCleanupFileSystem extends NodeFileSystem {
  private raced = false;

  constructor(
    private readonly racedPath: string,
    private readonly racedContent: string,
  ) {
    super();
  }

  protected override afterConfinedStagedCleanup(): void {
    if (this.raced) return;
    this.raced = true;
    writeFileSync(this.racedPath, this.racedContent);
  }
}

class ParentReplacementBeforePublicationFileSystem extends NodeFileSystem {
  protected override beforeConfinedFilePublication(path: string): void {
    const parent = dirname(path);
    rmdirSync(parent);
    mkdirSync(parent);
  }
}

class SiblingArrivalAfterPublicationFileSystem extends NodeFileSystem {
  protected override afterConfinedFilePublication(path: string): void {
    writeFileSync(join(dirname(path), "USER.txt"), "USER SIBLING\n");
  }
}

class TreeOpenHandleRaceFileSystem extends NodeFileSystem {
  private raced = false;

  constructor(
    private readonly racedPath: string,
    private readonly descriptor: number,
  ) {
    super();
  }

  protected override afterConfinedTreeDetachment(path: string): void {
    if (path !== this.racedPath || this.raced) return;
    this.raced = true;
    writeSync(this.descriptor, "RACED LEGACY\n", 0, "utf8");
  }
}

class AliasCopyPublicationRaceFileSystem extends NodeFileSystem {
  constructor(private readonly racedAlias: string) {
    super({ platform: "win32" });
  }

  protected override beforeConfinedAliasCopyPublication(aliasPath: string): void {
    if (aliasPath === this.racedAlias) {
      writeFileSync(join(aliasPath, "SKILL.md"), "CONCURRENT ALIAS BYTES\n");
    }
  }
}

class AliasCopyStagingFailureFileSystem extends NodeFileSystem {
  protected override copyConfinedAliasTree(
    from: string,
    to: string,
    phase: "retained" | "staged",
  ): void {
    if (phase === "staged") {
      mkdirSync(to, { recursive: true });
      writeFileSync(join(to, "partial.txt"), `partial from ${from}\n`);
      throw new Error("injected alias-copy staging failure");
    }
    super.copyConfinedAliasTree(from, to, phase);
  }
}

class AliasCopyPostDetachmentRaceFileSystem extends NodeFileSystem {
  racedIdentity: { readonly dev: bigint; readonly ino: bigint } | undefined;

  constructor(
    private readonly racedAlias: string,
    platform?: NodeJS.Platform,
  ) {
    super(platform === undefined ? {} : { platform });
  }

  protected override beforeConfinedAliasCopyStagedPublication(aliasPath: string): void {
    if (aliasPath !== this.racedAlias) return;
    mkdirSync(aliasPath);
    const raced = lstatSync(aliasPath, { bigint: true });
    this.racedIdentity = { dev: raced.dev, ino: raced.ino };
  }
}

class AliasCopyDirectoryPublicationFailureFileSystem extends NodeFileSystem {
  constructor() {
    super({ platform: "win32" });
  }

  protected override publishConfinedAliasDirectory(): void {
    throw new Error("injected staged-directory publication failure");
  }
}

function singleFileTreeFingerprint(content: string): string {
  const entries = [
    {
      path: "SKILL.md",
      kind: "file",
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  ];
  return `sha256:${createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex")}`;
}

function legacyTreeFingerprint(skillContent: string, referenceContent: string): string {
  const entries = [
    {
      path: "SKILL.md",
      kind: "file",
      sha256: createHash("sha256").update(skillContent).digest("hex"),
    },
    { path: "references", kind: "directory" },
    {
      path: "references/workflow.md",
      kind: "file",
      sha256: createHash("sha256").update(referenceContent).digest("hex"),
    },
  ];
  return `sha256:${createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex")}`;
}

function legacyTreeWithEmptyDirectoryFingerprint(skillContent: string): string {
  const entries = [
    {
      path: "SKILL.md",
      kind: "file",
      sha256: createHash("sha256").update(skillContent).digest("hex"),
    },
    { path: "empty", kind: "directory" },
  ];
  return `sha256:${createHash("sha256").update(JSON.stringify(entries), "utf8").digest("hex")}`;
}

describe("NodeFileSystem (the real FileSystem adapter, against a real tmpdir)", () => {
  it("writes then reads a file round-trip", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "manifest.yml");
      fs.write(p, "name: p\n");
      expect(fs.read(p)).toBe("name: p\n");
    });
  });

  it("write is atomic: overwrite fully replaces, leaving no .tmp residue (AC#2)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "f.txt");
      fs.write(p, "first version - longer content");
      fs.write(p, "second");
      expect(fs.read(p)).toBe("second");
      // No leftover temp files in the directory (the temp is named ".<hex>.tmp").
      const leftovers = readdirSync(dir).filter((n) => n.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    });
  });

  it("a failed write leaves the pre-existing file intact and drops no .tmp residue (AC#2)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "keep.txt");
      fs.write(p, "ORIGINAL");
      // Force the rename to fail by making the target path a directory (renaming a file over a
      // non-empty directory fails). The original file content must survive and no .tmp may remain.
      const asDir = join(dir, "target-is-dir");
      fs.makeDirectories(join(asDir, "child"));
      expect(() => fs.write(asDir, "should fail")).toThrow();
      // Original untouched.
      expect(fs.read(p)).toBe("ORIGINAL");
      // No temp residue in either directory.
      expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    });
  });

  it("a failed first write removes only the empty parent directories it created", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const createdParent = join(dir, "bootstrap", "workspace");
      const invalidLeaf = "x".repeat(300);

      expect(() => fs.write(join(createdParent, invalidLeaf), "cannot rename here")).toThrow();
      expect(existsSync(join(dir, "bootstrap"))).toBe(false);
      expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });

  it("write creates missing parent directories (AC#4)", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const p = join(dir, "a", "b", "c", "file.txt");
      fs.write(p, "deep");
      expect(fs.read(p)).toBe("deep");
      expect(existsSync(join(dir, "a", "b", "c"))).toBe(true);
    });
  });

  it("rejects malformed UTF-8 when text and digest must describe the exact same bytes", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const path = join(dir, "invalid-utf8.md");
      writeFileSync(path, Buffer.from([0xc3, 0x28]));

      expect(() => fs.readWithDigest(path)).toThrow();
    });
  });

  it("preserves a valid UTF-8 BOM in the exact text/digest capture", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const path = join(dir, "bom.md");
      const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61]);
      writeFileSync(path, bytes);

      const captured = fs.readWithDigest(path);
      expect(Buffer.from(captured.content, "utf8")).toEqual(bytes);
    });
  });

  it.runIf(process.platform !== "win32")(
    "binds confined writes/removals to no-follow descendants at the mutation boundary",
    async () => {
      await withTempDir((dir) => {
        const fs = new NodeFileSystem();
        const home = join(dir, "home");
        const outside = join(dir, "outside");
        mkdirSync(home);
        mkdirSync(outside);
        symlinkSync(outside, join(home, ".agents"), "dir");

        const escapedSkill = join(home, ".agents", "skills", "wpm-create-package", "SKILL.md");
        expect(() =>
          fs.writeConfined(home, escapedSkill, "must not escape\n", { kind: "missing" }),
        ).toThrow(/symbolic link/i);
        expect(existsSync(join(outside, "skills", "wpm-create-package", "SKILL.md"))).toBe(false);

        symlinkSync(outside, join(home, ".wpm"), "dir");
        const escapedState = join(home, ".wpm", "authoring-setup.json");
        expect(() => fs.writeConfined(home, escapedState, "{}\n", { kind: "missing" })).toThrow(
          /symbolic link/i,
        );
        expect(existsSync(join(outside, "authoring-setup.json"))).toBe(false);
        expect(() =>
          fs.removeConfined(home, join(home, ".agents"), `sha256:${"0".repeat(64)}`, {
            root: join(home, ".wpm", "authoring-setup-quarantine", "request"),
            path: join(home, ".wpm", "authoring-setup-quarantine", "request", "legacy"),
          }),
        ).toThrow(/symbolic link/i);
        expect(existsSync(outside)).toBe(true);
      });
    },
  );

  it("retires only an exact confined file and preserves a raced replacement", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const marker = join(home, ".wpm-bundle-authoring.pending.json");
      const quarantine = {
        root: join(home, ".wpm-bundle-authoring-quarantine"),
        path: join(home, ".wpm-bundle-authoring-quarantine", "request", "pending"),
      };
      mkdirSync(home);
      writeFileSync(marker, "PENDING\n");
      new NodeFileSystem().removeFileConfined(home, marker, "PENDING\n", quarantine);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(quarantine.root)).toBe(false);

      writeFileSync(marker, "PENDING\n");
      const raced = new FileArrivalAfterDetachmentFileSystem(marker, "USER FILE\n");
      expect(() => raced.removeFileConfined(home, marker, "PENDING\n", quarantine)).toThrow(
        /raced after detachment/,
      );
      expect(readFileSync(marker, "utf8")).toBe("USER FILE\n");
      expect(readFileSync(quarantine.path, "utf8")).toBe("PENDING\n");
    });
  });

  it("publishes exact bytes beneath a stable non-empty parent and removes private staging", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const content = "WPM FILE\r\nκ\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "KEEP.txt"), "KEEP\n");

      new NodeFileSystem().writeConfined(
        home,
        skill,
        content,
        { kind: "missing" },
        {
          root: quarantineRoot,
          path: quarantinePath,
        },
      );

      expect(readFileSync(skill)).toEqual(Buffer.from(content, "utf8"));
      expect(readdirSync(destination).sort()).toEqual(["KEEP.txt", "SKILL.md"]);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("publishes a missing direct child of a stable non-empty confinement root without transient residue", async () => {
    await withTempDir((dir) => {
      const root = join(dir, "home");
      const destination = join(root, "authoring-setup.json");
      const content = '{"message":"WPM κ"}\r\n';
      mkdirSync(root);
      writeFileSync(join(root, "KEEP.txt"), "KEEP\n");

      new NodeFileSystem().writeConfined(root, destination, content, { kind: "missing" });

      expect(readFileSync(destination)).toEqual(Buffer.from(content, "utf8"));
      expect(readdirSync(root).sort()).toEqual(["KEEP.txt", "authoring-setup.json"]);
    });
  });

  it("replaces direct-child workspace state and retires quarantine nested beneath its parent", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const stateParent = join(home, ".wpm");
      const state = join(stateParent, "authoring-setup.json");
      const quarantineRoot = join(stateParent, "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "state-complete.preimage");
      const applying = '{"status":"applying"}\n';
      const complete = '{"status":"complete","message":"WPM κ"}\r\n';
      mkdirSync(stateParent, { recursive: true });
      writeFileSync(join(stateParent, "KEEP.txt"), "KEEP\n");
      writeFileSync(state, applying);

      new NodeFileSystem().writeConfined(
        home,
        state,
        complete,
        {
          kind: "sha256",
          sha256: createHash("sha256").update(applying).digest("hex"),
        },
        { root: quarantineRoot, path: quarantinePath },
      );

      expect(readFileSync(state)).toEqual(Buffer.from(complete, "utf8"));
      expect(readdirSync(stateParent).sort()).toEqual(["KEEP.txt", "authoring-setup.json"]);
      expect(existsSync(quarantinePath)).toBe(false);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);
      expect(existsSync(`${quarantinePath}.displaced`)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("first-publishes direct-child workspace state and retires nested private staging", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const stateParent = join(home, ".wpm");
      const state = join(stateParent, "authoring-setup.json");
      const quarantineRoot = join(stateParent, "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "state-complete.preimage");
      const complete = '{"status":"complete","message":"WPM κ"}\r\n';
      mkdirSync(stateParent, { recursive: true });
      writeFileSync(join(stateParent, "KEEP.txt"), "KEEP\n");

      new NodeFileSystem().writeConfined(
        home,
        state,
        complete,
        { kind: "missing" },
        { root: quarantineRoot, path: quarantinePath },
      );

      expect(readFileSync(state)).toEqual(Buffer.from(complete, "utf8"));
      expect(readdirSync(stateParent).sort()).toEqual(["KEEP.txt", "authoring-setup.json"]);
      expect(existsSync(quarantinePath)).toBe(false);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);
      expect(existsSync(`${quarantinePath}.displaced`)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("refuses existing and escaped direct-file requests without changing unrelated entries", async () => {
    await withTempDir((dir) => {
      const root = join(dir, "home");
      const destination = join(root, "authoring-setup.json");
      const outside = join(dir, "outside.json");
      mkdirSync(root);
      writeFileSync(join(root, "KEEP.txt"), "KEEP\n");
      writeFileSync(destination, "USER FILE\n");
      const fs = new NodeFileSystem();

      expect(() =>
        fs.writeConfined(root, destination, "WPM FILE\n", { kind: "missing" }),
      ).toThrow();
      expect(() =>
        fs.writeConfined(root, outside, "MUST NOT ESCAPE\n", { kind: "missing" }),
      ).toThrow(/escapes its root/i);

      expect(readFileSync(destination, "utf8")).toBe("USER FILE\n");
      expect(existsSync(outside)).toBe(false);
      expect(readdirSync(root).sort()).toEqual(["KEEP.txt", "authoring-setup.json"]);
    });
  });

  it("does not create a required publication parent that is absent", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      mkdirSync(home);

      expect(() =>
        new NodeFileSystem().writeConfined(
          home,
          skill,
          "WPM FILE\n",
          { kind: "missing" },
          {
            root: quarantineRoot,
            path: quarantinePath,
          },
        ),
      ).toThrow(/parent identity changed/);

      expect(existsSync(destination)).toBe(false);
      expect(existsSync(skill)).toBe(false);
    });
  });

  it("publishes a missing confined file without clobbering one that races in", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantine = join(quarantineRoot, "codex", "current.preimage");
      mkdirSync(home);
      const fs = new FilePublicationRaceFileSystem(skill, "USER FILE\n");

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          "WPM FILE\n",
          {
            kind: "missing",
            parentTree: "missing",
          },
          { root: quarantineRoot, path: quarantine },
        ),
      ).toThrow();
      expect(readFileSync(skill, "utf8")).toBe("USER FILE\n");
      expect(readdirSync(destination)).toEqual(["SKILL.md"]);
      expect(
        readdirSync(join(home, ".agents", "skills")).some((name) => name.endsWith(".tmp")),
      ).toBe(false);
      expect(readFileSync(`${quarantine}.staged`, "utf8")).toBe("WPM FILE\n");
    });
  });

  it("does not adopt desired-looking public bytes that arrive during private staging", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const desiredContent = "WPM FILE\n";
      mkdirSync(home);
      const fs = new FileArrivalDuringStagingFileSystem(desiredContent);

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          { kind: "missing", parentTree: "missing" },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/raced while private bytes were staged/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
    });
  });

  it("retains exact prior bytes when an existing public file changes during private staging", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const racedContent = "USER RACE\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileArrivalDuringStagingFileSystem(racedContent);

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/changed while private bytes were staged/);
      expect(readFileSync(skill, "utf8")).toBe(racedContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
    });
  });

  it("preserves an existing confined file that changes at publication", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantine = join(quarantineRoot, "codex", "current.preimage");
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, "OWNED FILE\n");
      const expected = createHash("sha256").update("OWNED FILE\n").digest("hex");
      const fs = new FilePublicationRaceFileSystem(skill, "USER UPDATE\n");

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          "NEW WPM FILE\n",
          {
            kind: "sha256",
            sha256: expected,
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantine },
        ),
      ).toThrow();
      expect(readFileSync(skill, "utf8")).toBe("USER UPDATE\n");
      expect(readdirSync(destination)).toEqual(["SKILL.md"]);
      expect(
        readdirSync(join(home, ".agents", "skills")).some(
          (name) => name.endsWith(".tmp") || name.endsWith(".preimage"),
        ),
      ).toBe(false);
      expect(readFileSync(quarantine, "utf8")).toBe("OWNED FILE\n");
      expect(readFileSync(`${quarantine}.staged`, "utf8")).toBe("NEW WPM FILE\n");
    });
  });

  it("rejects a recreated publication parent without writing into it", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      mkdirSync(home);
      writeFileSync(join(home, "KEEP.txt"), "KEEP\n");
      const fs = new ParentReplacementBeforePublicationFileSystem();

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          "WPM FILE\n",
          { kind: "missing", parentTree: "missing" },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/parent identity changed/);
      expect(existsSync(destination)).toBe(true);
      expect(existsSync(skill)).toBe(false);
      expect(readFileSync(join(home, "KEEP.txt"), "utf8")).toBe("KEEP\n");
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe("WPM FILE\n");
    });
  });

  it("preserves retained evidence when a sibling appears after publication", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new SiblingArrivalAfterPublicationFileSystem();

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/parent tree changed/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(join(destination, "USER.txt"), "utf8")).toBe("USER SIBLING\n");
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
    });
  });

  it("restores a confined legacy tree when an entry races in before detachment", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantine = join(quarantineRoot, "codex", "legacy");
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), "OWNED LEGACY\n");
      const entries = [
        {
          path: "SKILL.md",
          kind: "file",
          sha256: createHash("sha256").update("OWNED LEGACY\n").digest("hex"),
        },
      ];
      const fingerprint = `sha256:${createHash("sha256")
        .update(JSON.stringify(entries), "utf8")
        .digest("hex")}`;
      const fs = new TreeDetachmentRaceFileSystem(legacy);

      expect(() =>
        fs.removeConfined(home, legacy, fingerprint, {
          root: quarantineRoot,
          path: quarantine,
        }),
      ).toThrow();
      expect(readFileSync(join(legacy, "SKILL.md"), "utf8")).toBe("OWNED LEGACY\n");
      expect(readFileSync(join(legacy, "USER-RACE.txt"), "utf8")).toBe("USER TREE\n");
      expect(
        readdirSync(join(home, ".agents", "skills")).some((name) =>
          name.endsWith(".wpm-quarantine"),
        ),
      ).toBe(false);
    });
  });

  it("replays an interrupted confined replacement from its deterministic retained slot", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(oldContent).digest("hex"),
        parentTree: "one-file" as const,
      };
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileDetachmentInterruptionFileSystem(skill);

      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /injected interruption after confined file detachment/,
      );
      expect(existsSync(skill)).toBe(false);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);

      expect(() =>
        fs.writeConfined(home, skill, desiredContent, precondition, quarantine),
      ).not.toThrow();
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("preserves a public user file raced in after confined detachment and fails retry closed", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const userContent = "USER FILE\n";
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(oldContent).digest("hex"),
        parentTree: "one-file" as const,
      };
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileArrivalAfterDetachmentFileSystem(skill, userContent);

      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /public path raced after detachment/,
      );
      expect(readFileSync(skill, "utf8")).toBe(userContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);

      expect(() =>
        fs.writeConfined(home, skill, desiredContent, precondition, quarantine),
      ).toThrow();
      expect(readFileSync(skill, "utf8")).toBe(userContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(true);
    });
  });

  it("does not adopt desired-looking bytes raced in after confined detachment", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileArrivalAfterDetachmentFileSystem(skill, desiredContent);

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/public path raced after detachment/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
    });
  });

  it("does not adopt desired-looking bytes raced into an initially absent retry path", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      mkdirSync(dirname(quarantinePath), { recursive: true });
      writeFileSync(quarantinePath, oldContent);
      writeFileSync(`${quarantinePath}.staged`, desiredContent);
      const fs = new FilePublicationRaceFileSystem(skill, desiredContent);

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/public path raced before publication|parent tree changed/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
    });
  });

  it.runIf(process.platform !== "win32")(
    "retains immutable prior bytes and restores a public replacement raced in during displacement",
    async () => {
      await withTempDir((dir) => {
        const home = join(dir, "home");
        const destination = join(home, ".agents", "skills", "wpm-create-package");
        const skill = join(destination, "SKILL.md");
        const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
        const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
        const quarantine = { root: quarantineRoot, path: quarantinePath };
        const oldContent = "OWNED FILE\n";
        const desiredContent = "NEW WPM FILE\n";
        const userContent = "USER REPLACEMENT\n";
        const precondition = {
          kind: "sha256" as const,
          sha256: createHash("sha256").update(oldContent).digest("hex"),
          parentTree: "one-file" as const,
        };
        mkdirSync(destination, { recursive: true });
        writeFileSync(skill, oldContent);
        const fs = new FileReplacementDuringDetachmentFileSystem(skill, userContent);

        expect(() =>
          fs.writeConfined(home, skill, desiredContent, precondition, quarantine),
        ).toThrow(/raced during displacement/);
        expect(readFileSync(skill, "utf8")).toBe(userContent);
        expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
        expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
        expect(existsSync(`${quarantinePath}.displaced`)).toBe(false);
      });
    },
  );

  it("replays exact deterministic displacement evidence after interruption", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(oldContent).digest("hex"),
        parentTree: "one-file" as const,
      };
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileDisplacementInterruptionFileSystem(skill);

      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /injected interruption after atomic displacement/,
      );
      expect(existsSync(skill)).toBe(false);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.displaced`, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);

      expect(() =>
        fs.writeConfined(home, skill, desiredContent, precondition, quarantine),
      ).not.toThrow();
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("rejects a desired-looking public race while displaced evidence exists", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, desiredContent);
      mkdirSync(dirname(quarantinePath), { recursive: true });
      writeFileSync(quarantinePath, oldContent);
      writeFileSync(`${quarantinePath}.displaced`, oldContent);
      writeFileSync(`${quarantinePath}.staged`, desiredContent);
      const fs = new NodeFileSystem();

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/public path raced while displaced bytes were retained/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(readFileSync(`${quarantinePath}.displaced`, "utf8")).toBe(oldContent);
    });
  });

  it("replays an interruption after confined publication and cleans retained evidence", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(oldContent).digest("hex"),
        parentTree: "one-file" as const,
      };
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FilePublicationInterruptionFileSystem(skill);

      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /injected interruption after confined file publication/,
      );
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);

      expect(() =>
        fs.writeConfined(home, skill, desiredContent, precondition, quarantine),
      ).not.toThrow();
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("replays a new install whose desired bytes were already published", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(home);
      const fs = new FilePublicationInterruptionFileSystem(skill);
      const request = () =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          { kind: "missing", parentTree: "missing" },
          { root: quarantineRoot, path: quarantinePath },
        );

      expect(request).toThrow(/injected interruption after confined file publication/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);

      expect(request).not.toThrow();
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("replays a new install from exact staged bytes and its empty created parent", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      mkdirSync(dirname(quarantinePath), { recursive: true });
      writeFileSync(`${quarantinePath}.staged`, desiredContent);
      const fs = new NodeFileSystem();

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          { kind: "missing", parentTree: "missing" },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).not.toThrow();
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("rejects desired-looking replacement bytes without their retained prior", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      mkdirSync(destination, { recursive: true });
      mkdirSync(dirname(quarantinePath), { recursive: true });
      writeFileSync(skill, desiredContent);
      writeFileSync(`${quarantinePath}.staged`, desiredContent);
      const fs = new NodeFileSystem();

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/lacks its retained prior bytes/);
      expect(readFileSync(skill, "utf8")).toBe(desiredContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantinePath)).toBe(false);
    });
  });

  it("replays an interrupted confined legacy-tree retirement from its deterministic slot", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const content = "OWNED LEGACY\n";
      const fingerprint = singleFileTreeFingerprint(content);
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), content);
      const fs = new TreeDetachmentInterruptionFileSystem(legacy);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).toThrow(
        /injected interruption after confined tree detachment/,
      );
      expect(existsSync(legacy)).toBe(false);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(content);
      expect(readFileSync(join(`${quarantinePath}.displaced`, "SKILL.md"), "utf8")).toBe(content);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).not.toThrow();
      expect(existsSync(legacy)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it.runIf(process.platform !== "win32")(
    "retains relative symbolic-link bytes while retiring an exact confined tree",
    async () => {
      await withTempDir((dir) => {
        const root = join(dir, "workspace");
        const tree = join(root, "wip", "bundles", "bundle-template");
        const target = join(tree, "install-backlog");
        const link = join(tree, "backlog");
        const quarantine = {
          root: join(root, ".wpm-bundle-authoring-quarantine"),
          path: join(root, ".wpm-bundle-authoring-quarantine", "request", "prior-scaffold"),
        };
        const config = "task_prefix: authoring\n";
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "config.yml"), config);
        symlinkSync("install-backlog", link, "dir");
        const entries = [
          { path: "backlog", kind: "symbolic-link", target: "install-backlog" },
          { path: "install-backlog", kind: "directory" },
          {
            path: "install-backlog/config.yml",
            kind: "file",
            sha256: createHash("sha256").update(config).digest("hex"),
          },
        ];
        const fingerprint = `sha256:${createHash("sha256")
          .update(JSON.stringify(entries), "utf8")
          .digest("hex")}`;

        expect(() =>
          new NodeFileSystem().removeConfined(root, tree, fingerprint, quarantine),
        ).not.toThrow();
        expect(existsSync(tree)).toBe(false);
        expect(existsSync(quarantine.root)).toBe(false);
      });
    },
  );

  it("preserves empty directories in retained legacy evidence until retry completes", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const content = "OWNED LEGACY\n";
      mkdirSync(join(legacy, "empty"), { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), content);
      const fs = new TreeDetachmentInterruptionFileSystem(legacy);
      const request = () =>
        fs.removeConfined(home, legacy, legacyTreeWithEmptyDirectoryFingerprint(content), {
          root: quarantineRoot,
          path: quarantinePath,
        });

      expect(request).toThrow(/injected interruption after confined tree detachment/);
      expect(existsSync(join(quarantinePath, "empty"))).toBe(true);
      expect(existsSync(join(`${quarantinePath}.displaced`, "empty"))).toBe(true);

      expect(request).not.toThrow();
      expect(existsSync(legacy)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("replays exact retained legacy evidence captured before public detachment", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const content = "OWNED LEGACY\n";
      const fingerprint = singleFileTreeFingerprint(content);
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), content);
      const fs = new TreeCaptureInterruptionFileSystem(legacy);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).toThrow(
        /interruption after retained tree capture/,
      );
      expect(readFileSync(join(legacy, "SKILL.md"), "utf8")).toBe(content);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(content);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).not.toThrow();
      expect(existsSync(legacy)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("does not retire an exact-looking public legacy tree that arrives during private setup", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const content = "OWNED LEGACY\n";
      mkdirSync(quarantinePath, { recursive: true });
      writeFileSync(join(quarantinePath, "SKILL.md"), content);
      const fs = new TreeArrivalDuringPrivatePreparationFileSystem(content);

      expect(() =>
        fs.removeConfined(home, legacy, singleFileTreeFingerprint(content), {
          root: quarantineRoot,
          path: quarantinePath,
        }),
      ).toThrow(/raced while private evidence was prepared/);
      expect(readFileSync(join(legacy, "SKILL.md"), "utf8")).toBe(content);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(content);
    });
  });

  it("completes an exact retained-tree subset before detaching the full public legacy tree", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const skillContent = "OWNED LEGACY\n";
      const referenceContent = "OWNED REFERENCE\n";
      mkdirSync(join(legacy, "references"), { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), skillContent);
      writeFileSync(join(legacy, "references", "workflow.md"), referenceContent);
      mkdirSync(quarantinePath, { recursive: true });
      writeFileSync(join(quarantinePath, "SKILL.md"), skillContent);
      const fingerprint = legacyTreeFingerprint(skillContent, referenceContent);
      const fs = new NodeFileSystem();

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).not.toThrow();
      expect(existsSync(legacy)).toBe(false);
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("replays an exact displaced-tree subset left by interrupted cleanup", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const skillContent = "OWNED LEGACY\n";
      const referenceContent = "OWNED REFERENCE\n";
      mkdirSync(join(legacy, "references"), { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), skillContent);
      writeFileSync(join(legacy, "references", "workflow.md"), referenceContent);
      const fs = new PartialTreeCleanupInterruptionFileSystem();
      const fingerprint = legacyTreeFingerprint(skillContent, referenceContent);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).toThrow(
        /partial displaced-tree cleanup/,
      );
      expect(existsSync(legacy)).toBe(false);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(skillContent);
      expect(
        readFileSync(join(`${quarantinePath}.displaced`, "references", "workflow.md"), "utf8"),
      ).toBe(referenceContent);

      expect(() => fs.removeConfined(home, legacy, fingerprint, quarantine)).not.toThrow();
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("keeps retained evidence discoverable when desired staged cleanup is interrupted", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const state = join(home, ".wpm", "authoring-setup.json");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "state-complete.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const applying = '{"status":"applying"}\n';
      const complete = '{"status":"complete"}\n';
      mkdirSync(join(home, ".wpm"), { recursive: true });
      writeFileSync(state, applying);
      const fs = new StagedCleanupInterruptionFileSystem();
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(applying).digest("hex"),
      };

      expect(() => fs.writeConfined(home, state, complete, precondition, quarantine)).toThrow(
        /staged cleanup interruption/,
      );
      expect(readFileSync(state, "utf8")).toBe(complete);
      expect(readFileSync(quarantinePath, "utf8")).toBe(applying);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);

      expect(() => fs.writeConfined(home, state, complete, precondition, quarantine)).not.toThrow();
      expect(existsSync(quarantineRoot)).toBe(false);
    });
  });

  it("preserves retained evidence when the public file changes at staged cleanup", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const userContent = "USER FILE\n";
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new PublicRaceDuringStagedCleanupFileSystem(skill, userContent);

      expect(() =>
        fs.writeConfined(
          home,
          skill,
          desiredContent,
          {
            kind: "sha256",
            sha256: createHash("sha256").update(oldContent).digest("hex"),
            parentTree: "one-file",
          },
          { root: quarantineRoot, path: quarantinePath },
        ),
      ).toThrow(/changed after staged cleanup/);
      expect(readFileSync(skill, "utf8")).toBe(userContent);
      expect(readFileSync(quarantinePath, "utf8")).toBe(oldContent);
      expect(existsSync(`${quarantinePath}.staged`)).toBe(false);
    });
  });

  it("never detaches an exact public legacy tree when retained evidence conflicts", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const content = "OWNED LEGACY\n";
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), content);
      mkdirSync(quarantinePath, { recursive: true });
      writeFileSync(join(quarantinePath, "SKILL.md"), "CHANGED PRIVATE\n");
      const fs = new NodeFileSystem();

      expect(() =>
        fs.removeConfined(home, legacy, singleFileTreeFingerprint(content), {
          root: quarantineRoot,
          path: quarantinePath,
        }),
      ).toThrow(/conflicts with public capture/);
      expect(readFileSync(join(legacy, "SKILL.md"), "utf8")).toBe(content);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe("CHANGED PRIVATE\n");
    });
  });

  it("preserves an exact-content replacement raced in at legacy detachment", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const legacy = join(home, ".agents", "skills", "installer-builder");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "legacy");
      const content = "OWNED LEGACY\n";
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), content);
      const fs = new TreeReplacementBeforeDetachmentFileSystem();

      expect(() =>
        fs.removeConfined(home, legacy, singleFileTreeFingerprint(content), {
          root: quarantineRoot,
          path: quarantinePath,
        }),
      ).toThrow(/raced tree retained/);
      expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(content);
      expect(readFileSync(join(`${quarantinePath}.displaced.raced`, "SKILL.md"), "utf8")).toBe(
        content,
      );
    });
  });

  it.runIf(process.platform !== "win32")(
    "retains an immutable legacy preimage when an open public handle changes displaced bytes",
    async () => {
      await withTempDir((dir) => {
        const home = join(dir, "home");
        const legacy = join(home, ".agents", "skills", "installer-builder");
        const legacySkill = join(legacy, "SKILL.md");
        const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
        const quarantinePath = join(quarantineRoot, "codex", "legacy");
        const quarantine = { root: quarantineRoot, path: quarantinePath };
        const content = "OWNED LEGACY\n";
        const descriptor = (() => {
          mkdirSync(legacy, { recursive: true });
          writeFileSync(legacySkill, content);
          return openSync(legacySkill, "r+");
        })();
        try {
          const fs = new TreeOpenHandleRaceFileSystem(legacy, descriptor);
          expect(() =>
            fs.removeConfined(home, legacy, singleFileTreeFingerprint(content), quarantine),
          ).toThrow(/changed during displacement/);
          expect(existsSync(legacy)).toBe(false);
          expect(readFileSync(join(quarantinePath, "SKILL.md"), "utf8")).toBe(content);
          expect(readFileSync(join(`${quarantinePath}.displaced.raced`, "SKILL.md"), "utf8")).toBe(
            "RACED LEGACY\n",
          );
        } finally {
          closeSync(descriptor);
        }
      });
    },
  );

  it("fails closed and preserves an unexpectedly changed private retained slot", async () => {
    await withTempDir((dir) => {
      const home = join(dir, "home");
      const destination = join(home, ".agents", "skills", "wpm-create-package");
      const skill = join(destination, "SKILL.md");
      const quarantineRoot = join(home, ".wpm", "authoring-setup-quarantine", "request");
      const quarantinePath = join(quarantineRoot, "codex", "current.preimage");
      const quarantine = { root: quarantineRoot, path: quarantinePath };
      const oldContent = "OWNED FILE\n";
      const desiredContent = "NEW WPM FILE\n";
      const changedPrivateContent = "UNEXPECTED PRIVATE FILE\n";
      const precondition = {
        kind: "sha256" as const,
        sha256: createHash("sha256").update(oldContent).digest("hex"),
        parentTree: "one-file" as const,
      };
      mkdirSync(destination, { recursive: true });
      writeFileSync(skill, oldContent);
      const fs = new FileDetachmentInterruptionFileSystem(skill);
      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /injected interruption after confined file detachment/,
      );
      writeFileSync(quarantinePath, changedPrivateContent);

      expect(() => fs.writeConfined(home, skill, desiredContent, precondition, quarantine)).toThrow(
        /retained preimage changed/,
      );
      expect(existsSync(skill)).toBe(false);
      expect(readFileSync(quarantinePath, "utf8")).toBe(changedPrivateContent);
      expect(readFileSync(`${quarantinePath}.staged`, "utf8")).toBe(desiredContent);
      expect(existsSync(quarantineRoot)).toBe(true);
    });
  });

  it("inspects mutation capability without creating the candidate path", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const candidate = join(dir, "personal", "skills", "demo");
      expect(fs.inspectMutationCapability(candidate)).toEqual({ capable: true });
      expect(existsSync(join(dir, "personal"))).toBe(false);

      const restrictedParent = join(dir, "restricted-parent");
      const writableHome = join(restrictedParent, "home");
      mkdirSync(writableHome, { recursive: true });
      chmodSync(writableHome, 0o700);
      chmodSync(restrictedParent, 0o500);
      try {
        expect(fs.inspectMutationCapability(join(writableHome, ".wpm", "state.json"))).toEqual({
          capable: true,
        });
      } finally {
        chmodSync(restrictedParent, 0o700);
      }

      const occupiedAncestor = join(dir, "occupied");
      writeFileSync(occupiedAncestor, "file\n");
      expect(fs.inspectMutationCapability(join(occupiedAncestor, "child"))).toMatchObject({
        capable: false,
      });
    });
  });

  it("exists / makeDirectories / list work over real entries", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      fs.makeDirectories(join(dir, "sub"));
      fs.write(join(dir, "top.txt"), "t");
      fs.write(join(dir, "sub", "inner.txt"), "i");
      expect(fs.exists(join(dir, "sub"))).toBe(true);
      expect(fs.exists(join(dir, "missing"))).toBe(false);
      const entries = fs.list(dir).sort((a, b) => a.name.localeCompare(b.name));
      expect(entries).toEqual([
        { name: "sub", kind: "directory" },
        { name: "top.txt", kind: "file" },
      ]);
    });
  });

  it("copyTree recursively copies files and nested dirs, preserving bytes", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      const src = join(dir, "src");
      fs.write(join(src, "a.txt"), "A");
      fs.write(join(src, "nested", "b.txt"), "B");
      // A binary file written outside the port to assert byte preservation.
      const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      writeFileSync(join(src, "bin.dat"), bytes);

      const dst = join(dir, "dst");
      fs.copyTree(src, dst);
      expect(fs.read(join(dst, "a.txt"))).toBe("A");
      expect(fs.read(join(dst, "nested", "b.txt"))).toBe("B");
      expect(readFileSync(join(dst, "bin.dat")).equals(bytes)).toBe(true);
    });
  });

  it("refreshAliasCopyConfined publishes an exact staged tree and retires private evidence", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem({ platform: "win32" });
      const source = join(dir, "wip", "installer-skills");
      const alias = join(dir, "wip", ".claude", "skills");
      const quarantine = {
        root: join(dir, ".wpm", "bundle-authoring-quarantine"),
        path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
      };
      fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
      fs.copyTree(source, alias);
      fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");
      fs.write(join(source, "web-advisor", "SKILL.md"), "NEW ADVISOR\n");

      fs.refreshAliasCopyConfined(
        dir,
        source,
        alias,
        singleFileTreeFingerprint("OLD INSTALLER\n"),
        quarantine,
      );

      expect(readFileSync(join(alias, "SKILL.md"), "utf8")).toBe("NEW INSTALLER\n");
      expect(readFileSync(join(alias, "web-advisor", "SKILL.md"), "utf8")).toBe("NEW ADVISOR\n");
      expect(lstatSync(alias).isDirectory()).toBe(true);
      expect(existsSync(quarantine.root)).toBe(false);
    });
  });

  it.runIf(process.platform !== "win32")(
    "refreshAliasCopyConfined promotes an inherited POSIX copy to an exact relative symlink",
    async () => {
      await withTempDir((dir) => {
        const fs = new NodeFileSystem({ platform: "linux" });
        const source = join(dir, "wip", "installer-skills");
        const alias = join(dir, "wip", ".claude", "skills");
        const quarantine = {
          root: join(dir, ".wpm", "bundle-authoring-quarantine"),
          path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
        };
        fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
        fs.copyTree(source, alias);
        fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");

        fs.refreshAliasCopyConfined(
          dir,
          source,
          alias,
          singleFileTreeFingerprint("OLD INSTALLER\n"),
          quarantine,
        );

        expect(lstatSync(alias).isSymbolicLink()).toBe(true);
        expect(readlinkSync(alias)).toBe(relative(dirname(alias), source));
        expect(readFileSync(join(alias, "SKILL.md"), "utf8")).toBe("NEW INSTALLER\n");
        expect(existsSync(quarantine.root)).toBe(false);
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "refreshAliasCopyConfined preserves an empty POSIX destination raced in after detachment",
    async () => {
      await withTempDir((dir) => {
        const source = join(dir, "wip", "installer-skills");
        const alias = join(dir, "wip", ".claude", "skills");
        const quarantine = {
          root: join(dir, ".wpm", "bundle-authoring-quarantine"),
          path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
        };
        const fs = new AliasCopyPostDetachmentRaceFileSystem(alias, "linux");
        fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
        fs.copyTree(source, alias);
        fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");

        expect(() =>
          fs.refreshAliasCopyConfined(
            dir,
            source,
            alias,
            singleFileTreeFingerprint("OLD INSTALLER\n"),
            quarantine,
          ),
        ).toThrow();
        const raced = lstatSync(alias, { bigint: true });
        expect(raced.isDirectory()).toBe(true);
        expect({ dev: raced.dev, ino: raced.ino }).toEqual(fs.racedIdentity);
        expect(readdirSync(alias)).toEqual([]);
        expect(readFileSync(join(quarantine.path, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
        expect(readFileSync(`${quarantine.path}.displaced/SKILL.md`, "utf8")).toBe(
          "OLD INSTALLER\n",
        );
      });
    },
  );

  it("refreshAliasCopyConfined restores Windows old-copy evidence after publication failure", async () => {
    await withTempDir((dir) => {
      const fs = new AliasCopyDirectoryPublicationFailureFileSystem();
      const source = join(dir, "wip", "installer-skills");
      const alias = join(dir, "wip", ".claude", "skills");
      const quarantine = {
        root: join(dir, ".wpm", "bundle-authoring-quarantine"),
        path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
      };
      fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
      fs.copyTree(source, alias);
      const oldAlias = lstatSync(alias, { bigint: true });
      fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");

      expect(() =>
        fs.refreshAliasCopyConfined(
          dir,
          source,
          alias,
          singleFileTreeFingerprint("OLD INSTALLER\n"),
          quarantine,
        ),
      ).toThrow("injected staged-directory publication failure");
      const restoredAlias = lstatSync(alias, { bigint: true });
      expect({ dev: restoredAlias.dev, ino: restoredAlias.ino }).toEqual({
        dev: oldAlias.dev,
        ino: oldAlias.ino,
      });
      expect(readFileSync(join(alias, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
      expect(readFileSync(join(quarantine.path, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
      expect(readFileSync(`${quarantine.path}.staged/SKILL.md`, "utf8")).toBe("NEW INSTALLER\n");
      expect(existsSync(`${quarantine.path}.displaced`)).toBe(false);
    });
  });

  it.runIf(process.platform === "win32")(
    "refreshAliasCopyConfined uses native Windows no-replace directory publication",
    async () => {
      await withTempDir((dir) => {
        const source = join(dir, "wip", "installer-skills");
        const alias = join(dir, "wip", ".claude", "skills");
        const quarantine = {
          root: join(dir, ".wpm", "bundle-authoring-quarantine"),
          path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
        };
        const fs = new AliasCopyPostDetachmentRaceFileSystem(alias);
        fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
        fs.copyTree(source, alias);
        fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");

        expect(() =>
          fs.refreshAliasCopyConfined(
            dir,
            source,
            alias,
            singleFileTreeFingerprint("OLD INSTALLER\n"),
            quarantine,
          ),
        ).toThrow();
        const raced = lstatSync(alias, { bigint: true });
        expect(raced.isDirectory()).toBe(true);
        expect({ dev: raced.dev, ino: raced.ino }).toEqual(fs.racedIdentity);
        expect(readdirSync(alias)).toEqual([]);
        expect(readFileSync(`${quarantine.path}.displaced/SKILL.md`, "utf8")).toBe(
          "OLD INSTALLER\n",
        );
      });
    },
  );

  it("refreshAliasCopyConfined preserves a collision introduced after its final evidence check", async () => {
    await withTempDir((dir) => {
      const source = join(dir, "wip", "installer-skills");
      const alias = join(dir, "wip", ".claude", "skills");
      const quarantine = {
        root: join(dir, ".wpm", "bundle-authoring-quarantine"),
        path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
      };
      const fs = new AliasCopyPublicationRaceFileSystem(alias);
      fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
      fs.copyTree(source, alias);
      fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");
      fs.write(join(source, "web-advisor", "SKILL.md"), "NEW ADVISOR\n");

      expect(() =>
        fs.refreshAliasCopyConfined(
          dir,
          source,
          alias,
          singleFileTreeFingerprint("OLD INSTALLER\n"),
          quarantine,
        ),
      ).toThrow("destination raced during detachment");
      expect(readFileSync(join(alias, "SKILL.md"), "utf8")).toBe("CONCURRENT ALIAS BYTES\n");
      expect(existsSync(join(alias, "web-advisor"))).toBe(false);
      expect(readFileSync(join(quarantine.path, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
    });
  });

  it("refreshAliasCopyConfined keeps a failed partial stage private and the public copy exact", async () => {
    await withTempDir((dir) => {
      const fs = new AliasCopyStagingFailureFileSystem();
      const source = join(dir, "wip", "installer-skills");
      const alias = join(dir, "wip", ".claude", "skills");
      const quarantine = {
        root: join(dir, ".wpm", "bundle-authoring-quarantine"),
        path: join(dir, ".wpm", "bundle-authoring-quarantine", "request", "alias"),
      };
      fs.write(join(source, "SKILL.md"), "OLD INSTALLER\n");
      fs.copyTree(source, alias);
      fs.write(join(source, "SKILL.md"), "NEW INSTALLER\n");

      expect(() =>
        fs.refreshAliasCopyConfined(
          dir,
          source,
          alias,
          singleFileTreeFingerprint("OLD INSTALLER\n"),
          quarantine,
        ),
      ).toThrow("injected alias-copy staging failure");
      expect(readFileSync(join(alias, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
      expect(readdirSync(alias)).toEqual(["SKILL.md"]);
      expect(readFileSync(`${quarantine.path}.staged/partial.txt`, "utf8")).toContain(
        "partial from",
      );
      expect(readFileSync(join(quarantine.path, "SKILL.md"), "utf8")).toBe("OLD INSTALLER\n");
    });
  });

  it("remove deletes a subtree, and removing an absent path is a no-op", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem();
      fs.write(join(dir, "d", "x.txt"), "x");
      fs.remove(join(dir, "d"));
      expect(existsSync(join(dir, "d"))).toBe(false);
      expect(() => fs.remove(join(dir, "never"))).not.toThrow();
    });
  });

  it.runIf(process.platform !== "win32")(
    "ensureAlias on POSIX creates a working symlink pointing at the target (AC#3)",
    async () => {
      await withTempDir((dir) => {
        const fs = new NodeFileSystem();
        const target = join(dir, "installer-skills");
        fs.makeDirectories(target);
        fs.write(join(target, "SKILL.md"), "# skill");
        const link = join(dir, ".claude-skills");

        const result = fs.ensureAlias(target, link);
        expect(result.kind).toBe("symlink");
        // It is really a symlink, and it resolves to the target (so reading through it works).
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
        expect(realpathSync(link)).toBe(realpathSync(target));
        expect(fs.read(join(link, "SKILL.md"))).toBe("# skill");
      });
    },
  );

  it.runIf(process.platform !== "win32")(
    "ensureAlias with a RELATIVE target creates a relative symlink that resolves (TASK-102)",
    async () => {
      await withTempDir((dir) => {
        const fs = new NodeFileSystem();
        // Model the per-bundle recipe layout: install-backlog beside the `backlog` link.
        const bundle = join(dir, "bundles", "web");
        fs.makeDirectories(join(bundle, "install-backlog", "tasks"));
        fs.write(join(bundle, "install-backlog", "config.yml"), "task_prefix: web\n");
        const link = join(bundle, "backlog");

        const result = fs.ensureAlias("install-backlog", link);
        expect(result.kind).toBe("symlink");
        expect(lstatSync(link).isSymbolicLink()).toBe(true);
        // RELATIVE: the link's raw content is exactly `install-backlog`, never an absolute path — so it stays
        // valid after the archive is extracted to any path (archive portability):
        expect(readlinkSync(link)).toBe("install-backlog");
        // …and it resolves to the real sibling install-backlog dir, so reading through it works:
        expect(fs.read(join(link, "config.yml"))).toBe("task_prefix: web\n");
      });
    },
  );

  it("ensureAlias copy fallback resolves a RELATIVE target against the link's parent, not cwd (TASK-102)", async () => {
    await withTempDir((dir) => {
      // Force the win32 copy branch on this Linux runner.
      const fs = new NodeFileSystem({ platform: "win32" });
      const bundle = join(dir, "bundles", "web");
      fs.makeDirectories(join(bundle, "install-backlog"));
      fs.write(join(bundle, "install-backlog", "config.yml"), "task_prefix: web\n");
      const link = join(bundle, "backlog");

      const result = fs.ensureAlias("install-backlog", link);
      expect(result.kind).toBe("copy");
      // The fallback copied the SIBLING install-backlog (resolved against the link's parent dir), not a
      // cwd-relative `install-backlog` — so the copy carries the recipe content.
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(fs.read(join(link, "config.yml"))).toBe("task_prefix: web\n");
    });
  });

  it("ensureAlias falls back to a copy when the platform is forced to win32 (AC#3)", async () => {
    await withTempDir((dir) => {
      // Inject platform win32 so the copy branch runs on this Linux runner.
      const fs = new NodeFileSystem({ platform: "win32" });
      const target = join(dir, "skills");
      fs.makeDirectories(target);
      fs.write(join(target, "SKILL.md"), "# s");
      const link = join(dir, "alias");

      const result = fs.ensureAlias(target, link);
      expect(result.kind).toBe("copy");
      if (result.kind === "copy") {
        expect(result.warning).toContain("Windows");
      }
      // It is a real copy (not a symlink) and the content is present.
      expect(lstatSync(link).isSymbolicLink()).toBe(false);
      expect(fs.read(join(link, "SKILL.md"))).toBe("# s");
    });
  });

  it("a failed Windows fallback copy leaves neither a partial alias nor a temporary sibling", async () => {
    await withTempDir((dir) => {
      const fs = new NodeFileSystem({
        platform: "win32",
        copy: (_from, to) => {
          mkdirSync(to, { recursive: true });
          writeFileSync(join(to, "partial.txt"), "partial");
          throw new Error("injected copy failure");
        },
      });
      const target = join(dir, "skills");
      fs.write(join(target, "SKILL.md"), "# s");
      const link = join(dir, "alias");

      expect(() => fs.ensureAlias(target, link)).toThrow("injected copy failure");
      expect(existsSync(link)).toBe(false);
      expect(readdirSync(dir).filter((name) => name.startsWith("alias.wpm-"))).toEqual([]);
    });
  });
});
