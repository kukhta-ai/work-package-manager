import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryFileSystem } from "../../../src/adapters/memory-fs.js";

class FileArrivalAfterDetachmentMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedFileDetachment(path: string): void {
    this.write(path, "USER FILE\n");
  }
}

class FileChangeAfterPublicationMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedFilePublication(path: string): void {
    this.write(path, "USER FILE\n");
  }
}

class FilePublicationInterruptionMemoryFileSystem extends MemoryFileSystem {
  private interrupted = false;

  protected override afterConfinedFilePublication(): void {
    if (this.interrupted) return;
    this.interrupted = true;
    throw new Error("injected interruption after publication");
  }
}

class FileArrivalBeforePublicationMemoryFileSystem extends MemoryFileSystem {
  protected override beforeConfinedFilePublication(path: string): void {
    this.write(path, "USER FILE\n");
  }
}

class FileAncestorAliasAfterDetachmentMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedFileDetachment(): void {
    this.ensureAlias("/outside", "/home/tester/.agents");
  }
}

class TreeAncestorAliasAfterDetachmentMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedTreeDetachment(): void {
    this.ensureAlias("/outside", "/home/tester/.agents");
  }
}

class TreeArrivalAfterDetachmentMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedTreeDetachment(path: string): void {
    this.write(`${path}/USER.txt`, "USER TREE\n");
  }
}

class ParentReplacementBeforePublicationMemoryFileSystem extends MemoryFileSystem {
  protected override beforeConfinedFilePublication(path: string): void {
    const parent = path.slice(0, path.lastIndexOf("/"));
    this.remove(parent);
    this.makeDirectories(parent);
  }
}

class SiblingArrivalAfterPublicationMemoryFileSystem extends MemoryFileSystem {
  protected override afterConfinedFilePublication(path: string): void {
    this.write(`${path.slice(0, path.lastIndexOf("/"))}/USER.txt`, "USER SIBLING\n");
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

describe("MemoryFileSystem (the in-memory FileSystem fake — AC#1)", () => {
  it("retires only an exact confined file and preserves a raced replacement", () => {
    const home = "/home/tester";
    const marker = `${home}/.wpm-bundle-authoring.pending.json`;
    const quarantine = {
      root: `${home}/.wpm-bundle-authoring-quarantine`,
      path: `${home}/.wpm-bundle-authoring-quarantine/request/pending`,
    };
    const exact = new MemoryFileSystem();
    exact.makeDirectories(home);
    exact.write(marker, "PENDING\n");
    exact.removeFileConfined(home, marker, "PENDING\n", quarantine);
    expect(exact.inspectPath(marker).kind).toBe("missing");
    expect(exact.inspectPath(quarantine.root).kind).toBe("missing");

    const raced = new FileArrivalAfterDetachmentMemoryFileSystem();
    raced.makeDirectories(home);
    raced.write(marker, "PENDING\n");
    expect(() => raced.removeFileConfined(home, marker, "PENDING\n", quarantine)).toThrow(
      /raced after detachment/,
    );
    expect(raced.read(marker)).toBe("USER FILE\n");
    expect(raced.read(quarantine.path)).toBe("PENDING\n");
  });

  it("writes then reads a file back", () => {
    const fs = new MemoryFileSystem();
    fs.write("/proj/manifest.yml", "name: p\n");
    expect(fs.read("/proj/manifest.yml")).toBe("name: p\n");
  });

  it("overwrites an existing file with the full new content", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a.txt", "old");
    fs.write("/a.txt", "new content");
    expect(fs.read("/a.txt")).toBe("new content");
  });

  it("write creates missing parent directories (AC#4)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/deep/nested/dir/file.txt", "hi");
    expect(fs.read("/deep/nested/dir/file.txt")).toBe("hi");
    expect(fs.exists("/deep")).toBe(true);
    expect(fs.exists("/deep/nested/dir")).toBe(true);
  });

  it("reports mutation capability without creating the candidate path", () => {
    const fs = new MemoryFileSystem();
    fs.makeDirectories("/home/author");
    expect(fs.inspectMutationCapability("/home/author/.agents/skills/demo")).toEqual({
      capable: true,
    });
    expect(fs.inspectPath("/home/author/.agents").kind).toBe("missing");
  });

  it("preserves public and retained bytes when a file appears after confined detachment", () => {
    const fs = new FileArrivalAfterDetachmentMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, oldContent);

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
    expect(fs.read(skill)).toBe("USER FILE\n");
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.read(`${quarantinePath}.staged`)).toBe(desiredContent);
  });

  it("preserves retained evidence when published bytes change before cleanup", () => {
    const fs = new FileChangeAfterPublicationMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, oldContent);

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
    ).toThrow(/publication changed after final boundary/);
    expect(fs.read(skill)).toBe("USER FILE\n");
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.inspectPath(`${quarantinePath}.staged`).kind).toBe("missing");
  });

  it("replays a new install whose desired bytes were published before interruption", () => {
    const fs = new FilePublicationInterruptionMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const desiredContent = "NEW WPM FILE\n";
    const request = () =>
      fs.writeConfined(
        home,
        skill,
        desiredContent,
        { kind: "missing", parentTree: "missing" },
        { root: quarantineRoot, path: quarantinePath },
      );
    fs.makeDirectories(home);

    expect(request).toThrow(/injected interruption after publication/);
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.inspectPath(`${quarantinePath}.staged`).kind).toBe("missing");

    expect(request).not.toThrow();
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("replays a new install from exact staged bytes and its empty created parent", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const destination = `${home}/.agents/skills/wpm-create-package`;
    const skill = `${destination}/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(destination);
    fs.write(`${quarantinePath}.staged`, desiredContent);

    expect(() =>
      fs.writeConfined(
        home,
        skill,
        desiredContent,
        { kind: "missing", parentTree: "missing" },
        { root: quarantineRoot, path: quarantinePath },
      ),
    ).not.toThrow();
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("rejects desired-looking replacement bytes without their retained prior", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const destination = `${home}/.agents/skills/wpm-create-package`;
    const skill = `${destination}/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.write(skill, desiredContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

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
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.read(`${quarantinePath}.staged`)).toBe(desiredContent);
    expect(fs.inspectPath(quarantinePath).kind).toBe("missing");
  });

  it("rechecks an already-published retry before deleting retained evidence", () => {
    const fs = new FileChangeAfterPublicationMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, desiredContent);
    fs.write(quarantinePath, oldContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

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
    ).toThrow(/publication changed after final boundary/);
    expect(fs.read(skill)).toBe("USER FILE\n");
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.inspectPath(`${quarantinePath}.staged`).kind).toBe("missing");
  });

  it("rejects a desired-looking public race while displaced evidence exists", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, desiredContent);
    fs.write(quarantinePath, oldContent);
    fs.write(`${quarantinePath}.displaced`, oldContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

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
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.read(`${quarantinePath}.displaced`)).toBe(oldContent);
  });

  it("rejects a recreated publication parent without writing into it", () => {
    const fs = new ParentReplacementBeforePublicationMemoryFileSystem();
    const home = "/home/tester";
    const destination = `${home}/.agents/skills/wpm-create-package`;
    const skill = `${destination}/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    fs.makeDirectories(home);

    expect(() =>
      fs.writeConfined(
        home,
        skill,
        "NEW WPM FILE\n",
        { kind: "missing", parentTree: "missing" },
        { root: quarantineRoot, path: quarantinePath },
      ),
    ).toThrow(/parent identity changed/);
    expect(fs.inspectPath(destination).kind).toBe("directory");
    expect(fs.inspectPath(skill).kind).toBe("missing");
    expect(fs.read(`${quarantinePath}.staged`)).toBe("NEW WPM FILE\n");
  });

  it("preserves retained evidence when a sibling appears after publication", () => {
    const fs = new SiblingArrivalAfterPublicationMemoryFileSystem();
    const home = "/home/tester";
    const destination = `${home}/.agents/skills/wpm-create-package`;
    const skill = `${destination}/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, oldContent);

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
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.read(`${destination}/USER.txt`)).toBe("USER SIBLING\n");
    expect(fs.read(quarantinePath)).toBe(oldContent);
  });

  it("preserves retained evidence when a sibling appears on an already-published retry", () => {
    const fs = new SiblingArrivalAfterPublicationMemoryFileSystem();
    const home = "/home/tester";
    const destination = `${home}/.agents/skills/wpm-create-package`;
    const skill = `${destination}/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, desiredContent);
    fs.write(quarantinePath, oldContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

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
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.read(`${destination}/USER.txt`)).toBe("USER SIBLING\n");
    expect(fs.read(quarantinePath)).toBe(oldContent);
  });

  it("replays exact displaced file evidence and removes every request-bound slot", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    const request = () =>
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
      );
    fs.makeDirectories(`${home}/.agents/skills/wpm-create-package`);
    fs.write(quarantinePath, oldContent);
    fs.write(`${quarantinePath}.displaced`, oldContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

    expect(request).not.toThrow();
    expect(fs.read(skill)).toBe(desiredContent);
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("rejects a missing replacement parent while preserving retained evidence", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    const desiredContent = "NEW WPM FILE\n";
    fs.makeDirectories(home);
    fs.write(quarantinePath, oldContent);
    fs.write(`${quarantinePath}.staged`, desiredContent);

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
    ).toThrow(/parent tree is not a regular directory/);
    expect(fs.inspectPath(skill).kind).toBe("missing");
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.read(`${quarantinePath}.staged`)).toBe(desiredContent);
  });

  it("rejects quarantine evidence outside the confinement root", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const legacy = `${home}/.agents/skills/installer-builder`;
    const outsideRoot = "/outside/request";
    fs.makeDirectories(home);
    fs.write(`${legacy}/SKILL.md`, "OWNED LEGACY\n");

    expect(() =>
      fs.writeConfined(
        home,
        skill,
        "WPM FILE\n",
        { kind: "missing", parentTree: "missing" },
        { root: outsideRoot, path: `${outsideRoot}/codex/current.preimage` },
      ),
    ).toThrow(/strict descendant of HOME/);
    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint("OWNED LEGACY\n"), {
        root: outsideRoot,
        path: `${outsideRoot}/codex/legacy`,
      }),
    ).toThrow(/strict descendant of HOME/);
    expect(fs.inspectPath(outsideRoot).kind).toBe("missing");
    expect(fs.read(`${legacy}/SKILL.md`)).toBe("OWNED LEGACY\n");
  });

  it("does not clobber a public file that appears at the no-clobber publication boundary", () => {
    const fs = new FileArrivalBeforePublicationMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    fs.makeDirectories(home);

    expect(() =>
      fs.writeConfined(
        home,
        skill,
        "NEW WPM FILE\n",
        { kind: "missing", parentTree: "missing" },
        { root: quarantineRoot, path: quarantinePath },
      ),
    ).toThrow(/public path raced before publication/);
    expect(fs.read(skill)).toBe("USER FILE\n");
    expect(fs.read(`${quarantinePath}.staged`)).toBe("NEW WPM FILE\n");
  });

  it("fails closed when a file ancestor becomes an alias after detachment", () => {
    const fs = new FileAncestorAliasAfterDetachmentMemoryFileSystem();
    const home = "/home/tester";
    const skill = `${home}/.agents/skills/wpm-create-package/SKILL.md`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/current.preimage`;
    const oldContent = "OWNED FILE\n";
    fs.makeDirectories(home);
    fs.write(skill, oldContent);

    expect(() =>
      fs.writeConfined(
        home,
        skill,
        "NEW WPM FILE\n",
        {
          kind: "sha256",
          sha256: createHash("sha256").update(oldContent).digest("hex"),
          parentTree: "one-file",
        },
        { root: quarantineRoot, path: quarantinePath },
      ),
    ).toThrow(/contains a symbolic link/);
    expect(fs.read(quarantinePath)).toBe(oldContent);
    expect(fs.inspectPath("/outside/skills/wpm-create-package/SKILL.md").kind).toBe("missing");
  });

  it("preserves a public tree that appears after confined legacy detachment", () => {
    const fs = new TreeArrivalAfterDetachmentMemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/legacy`;
    const oldContent = "OWNED LEGACY\n";
    fs.makeDirectories(home);
    fs.write(`${legacy}/SKILL.md`, oldContent);

    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint(oldContent), {
        root: quarantineRoot,
        path: quarantinePath,
      }),
    ).toThrow(/public tree raced after detachment/);
    expect(fs.read(`${legacy}/USER.txt`)).toBe("USER TREE\n");
    expect(fs.read(`${quarantinePath}/SKILL.md`)).toBe(oldContent);
  });

  it("replays exact displaced legacy evidence and removes every private slot", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/legacy`;
    const oldContent = "OWNED LEGACY\n";
    fs.makeDirectories(home);
    fs.write(`${quarantinePath}/SKILL.md`, oldContent);
    fs.write(`${quarantinePath}.displaced/SKILL.md`, oldContent);

    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint(oldContent), {
        root: quarantineRoot,
        path: quarantinePath,
      }),
    ).not.toThrow();
    expect(fs.inspectPath(legacy).kind).toBe("missing");
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("replays an exact displaced legacy subset against its complete retained copy", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/legacy`;
    const firstContent = "FIRST\n";
    const secondContent = "SECOND\n";
    const entries = [
      {
        path: "a.txt",
        kind: "file",
        sha256: createHash("sha256").update(firstContent).digest("hex"),
      },
      {
        path: "b.txt",
        kind: "file",
        sha256: createHash("sha256").update(secondContent).digest("hex"),
      },
    ];
    const fingerprint = `sha256:${createHash("sha256")
      .update(JSON.stringify(entries), "utf8")
      .digest("hex")}`;
    fs.makeDirectories(home);
    fs.write(`${quarantinePath}/a.txt`, firstContent);
    fs.write(`${quarantinePath}/b.txt`, secondContent);
    fs.write(`${quarantinePath}.displaced/b.txt`, secondContent);

    expect(() =>
      fs.removeConfined(home, legacy, fingerprint, {
        root: quarantineRoot,
        path: quarantinePath,
      }),
    ).not.toThrow();
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("treats an already-clean confined legacy retirement replay as a no-op", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    fs.makeDirectories(home);

    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint("OWNED LEGACY\n"), {
        root: quarantineRoot,
        path: `${quarantineRoot}/codex/legacy`,
      }),
    ).not.toThrow();
    expect(fs.inspectPath(quarantineRoot).kind).toBe("missing");
  });

  it("never detaches an exact public legacy tree when retained evidence conflicts", () => {
    const fs = new MemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/legacy`;
    const content = "OWNED LEGACY\n";
    fs.makeDirectories(home);
    fs.write(`${legacy}/SKILL.md`, content);
    fs.write(`${quarantinePath}/SKILL.md`, "CHANGED PRIVATE\n");

    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint(content), {
        root: quarantineRoot,
        path: quarantinePath,
      }),
    ).toThrow(/conflicts with public capture/);
    expect(fs.read(`${legacy}/SKILL.md`)).toBe(content);
    expect(fs.read(`${quarantinePath}/SKILL.md`)).toBe("CHANGED PRIVATE\n");
  });

  it("fails closed when a tree ancestor becomes an alias after detachment", () => {
    const fs = new TreeAncestorAliasAfterDetachmentMemoryFileSystem();
    const home = "/home/tester";
    const legacy = `${home}/.agents/skills/installer-builder`;
    const quarantineRoot = `${home}/.wpm/authoring-setup-quarantine/request`;
    const quarantinePath = `${quarantineRoot}/codex/legacy`;
    const oldContent = "OWNED LEGACY\n";
    fs.makeDirectories(home);
    fs.write(`${legacy}/SKILL.md`, oldContent);

    expect(() =>
      fs.removeConfined(home, legacy, singleFileTreeFingerprint(oldContent), {
        root: quarantineRoot,
        path: quarantinePath,
      }),
    ).toThrow(/contains a symbolic link/);
    expect(fs.read(`${quarantinePath}/SKILL.md`)).toBe(oldContent);
    expect(fs.inspectPath("/outside/skills/installer-builder").kind).toBe("missing");
  });

  it("read of a missing file throws", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.read("/missing")).toThrow();
  });

  it("exists distinguishes present files/dirs from absent paths", () => {
    const fs = new MemoryFileSystem();
    fs.write("/x/y.txt", "1");
    fs.makeDirectories("/empty");
    expect(fs.exists("/x/y.txt")).toBe(true);
    expect(fs.exists("/x")).toBe(true);
    expect(fs.exists("/empty")).toBe(true);
    expect(fs.exists("/nope")).toBe(false);
  });

  it("makeDirectories creates an (empty) directory that lists as empty", () => {
    const fs = new MemoryFileSystem();
    fs.makeDirectories("/d/e/f");
    expect(fs.exists("/d/e/f")).toBe(true);
    expect(fs.list("/d/e/f")).toEqual([]);
  });

  it("list returns immediate entries with file/directory kind", () => {
    const fs = new MemoryFileSystem();
    fs.write("/root/a.txt", "a");
    fs.write("/root/sub/b.txt", "b");
    fs.makeDirectories("/root/emptydir");
    const entries = fs.list("/root").sort((x, y) => x.name.localeCompare(y.name));
    expect(entries).toEqual([
      { name: "a.txt", kind: "file" },
      { name: "emptydir", kind: "directory" },
      { name: "sub", kind: "directory" },
    ]);
  });

  it("list of a missing directory throws", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.list("/nope")).toThrow();
  });

  it("list of a path that is a FILE throws ENOTDIR, not ENOENT (parity with node)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a/file.txt", "x");
    // The real adapter's readdirSync throws ENOTDIR for a file; the fake must distinguish "is a file"
    // from "doesn't exist" so a downstream operation test can't pass against the fake but fail for real.
    expect(() => fs.list("/a/file.txt")).toThrow(/ENOTDIR/);
    expect(() => fs.list("/a/file.txt")).not.toThrow(/ENOENT/);
  });

  it("copyTree copies a directory subtree (files + nested dirs)", () => {
    const fs = new MemoryFileSystem();
    fs.write("/src/a.txt", "A");
    fs.write("/src/nested/b.txt", "B");
    fs.copyTree("/src", "/dst");
    expect(fs.read("/dst/a.txt")).toBe("A");
    expect(fs.read("/dst/nested/b.txt")).toBe("B");
    // The original is untouched.
    expect(fs.read("/src/a.txt")).toBe("A");
  });

  it("copyTree copies a single file", () => {
    const fs = new MemoryFileSystem();
    fs.write("/one.txt", "ONE");
    fs.copyTree("/one.txt", "/copy.txt");
    expect(fs.read("/copy.txt")).toBe("ONE");
  });

  it("remove deletes a file", () => {
    const fs = new MemoryFileSystem();
    fs.write("/gone.txt", "x");
    fs.remove("/gone.txt");
    expect(fs.exists("/gone.txt")).toBe(false);
  });

  it("remove deletes a directory subtree", () => {
    const fs = new MemoryFileSystem();
    fs.write("/dir/a.txt", "a");
    fs.write("/dir/sub/b.txt", "b");
    fs.remove("/dir");
    expect(fs.exists("/dir")).toBe(false);
    expect(fs.exists("/dir/a.txt")).toBe(false);
    expect(fs.exists("/dir/sub/b.txt")).toBe(false);
  });

  it("remove of an absent path is a no-op (force semantics)", () => {
    const fs = new MemoryFileSystem();
    expect(() => fs.remove("/never-existed")).not.toThrow();
  });

  it("ensureAlias records the alias and reports the symlink kind", () => {
    const fs = new MemoryFileSystem();
    const result = fs.ensureAlias("/installer-skills", "/.claude/skills");
    expect(result.kind).toBe("symlink");
    expect(fs.aliasTarget("/.claude/skills")).toBe("/installer-skills");
  });

  it("exists follows an alias to its target: broken link is false, then true once the target exists", () => {
    // Parity with the real adapter's `existsSync`, which follows the symlink: a dangling link is `false`,
    // and the same link reads as present once its target is created. (Guards task-19/task-25 idempotency,
    // whose re-derivation probes `exists(linkPath)`.)
    const fs = new MemoryFileSystem();
    fs.ensureAlias("/installer-skills", "/.claude/skills"); // target does NOT exist yet
    expect(fs.exists("/.claude/skills")).toBe(false); // broken link → false (ELOOP-free)

    fs.makeDirectories("/installer-skills"); // now the target exists
    expect(fs.exists("/.claude/skills")).toBe(true); // link resolves → true
  });

  it("exists resolves a chain of aliases and does not hang on a cycle", () => {
    const fs = new MemoryFileSystem();
    // A chain a → b → real dir resolves to true.
    fs.makeDirectories("/real");
    fs.ensureAlias("/real", "/b");
    fs.ensureAlias("/b", "/a");
    expect(fs.exists("/a")).toBe(true);

    // A cycle x → y → x terminates and yields false (mirrors existsSync's ELOOP → false).
    const cyc = new MemoryFileSystem();
    cyc.ensureAlias("/y", "/x");
    cyc.ensureAlias("/x", "/y");
    expect(cyc.exists("/x")).toBe(false);
  });

  it("a RELATIVE alias reads back relative (readlink parity) and resolves against the link's parent dir (TASK-102)", () => {
    const fs = new MemoryFileSystem();
    // Model the per-bundle `backlog → install-backlog` link: relative target, created beside install-backlog.
    fs.write("/bundles/web/install-backlog/config.yml", "task_prefix: web\n");
    fs.ensureAlias("install-backlog", "/bundles/web/backlog");

    // The stored target is the RAW relative string (what `readlinkSync` would return) — never absolutized:
    expect(fs.aliasTarget("/bundles/web/backlog")).toBe("install-backlog");
    // …yet `exists` resolves it against the LINK's parent (POSIX symlink semantics), so it points at the real
    // install-backlog dir — not `/install-backlog`:
    expect(fs.exists("/bundles/web/backlog")).toBe(true);
    expect(fs.exists("/install-backlog")).toBe(false);

    // A relative link whose target is absent resolves to false (dangling), like a real symlink:
    fs.ensureAlias("install-backlog", "/bundles/empty/backlog");
    expect(fs.exists("/bundles/empty/backlog")).toBe(false);
  });

  it("normalizes paths (trailing slash, '.', '..') consistently", () => {
    const fs = new MemoryFileSystem();
    fs.write("/a/b/../c.txt", "v");
    expect(fs.read("/a/c.txt")).toBe("v");
    expect(fs.exists("/a/c.txt/")).toBe(true);
  });
});

describe("MemoryFileSystem alias observations", () => {
  it("records an absolute Win32 target as POSIX and resolves it in the fake namespace", () => {
    const fs = new MemoryFileSystem();
    fs.write("C:\\work\\proj\\installer-skills\\demo\\SKILL.md", "# demo\n");

    fs.ensureAlias("C:\\work\\proj\\installer-skills", "C:\\work\\proj\\.claude\\skills");

    expect(fs.aliasTarget("C:\\work\\proj\\.claude\\skills")).toBe("C:/work/proj/installer-skills");
    expect(fs.exists("C:\\work\\proj\\.claude\\skills")).toBe(true);
  });

  it("preserves relative alias targets byte-for-byte", () => {
    const fs = new MemoryFileSystem();
    fs.ensureAlias("install-backlog", "/proj/bundles/web/backlog");
    fs.ensureAlias("nested\\relative-target", "/proj/other-alias");

    expect(fs.aliasTarget("/proj/bundles/web/backlog")).toBe("install-backlog");
    expect(fs.aliasTarget("/proj/other-alias")).toBe("nested\\relative-target");
  });
});
