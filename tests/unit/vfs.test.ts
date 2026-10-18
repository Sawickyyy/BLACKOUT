import { describe, expect, it } from "vitest";
import { FsError, VFS, makeDir, type Principal } from "@/engine/fs/vfs";

const root: Principal = { uid: 0, gid: 0, groups: [0] };
const alice: Principal = { uid: 1000, gid: 1000, groups: [1000] };
const bob: Principal = { uid: 1001, gid: 1001, groups: [1001] };

function fresh(): VFS {
  const vfs = new VFS(makeDir(0, 0, 0o755));
  vfs.mkdir("/home", root);
  vfs.mkdir("/home/alice", root);
  vfs.chown("/home/alice", 1000, 1000, root);
  vfs.chmod("/home/alice", 0o700, root);
  return vfs;
}

describe("VFS paths + basic ops", () => {
  it("writes and reads a file", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/secret.txt", "hello", alice);
    expect(vfs.readFile("/home/alice/secret.txt", alice)).toBe("hello");
  });

  it("resolves .. and .", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/a.txt", "x", alice);
    expect(vfs.readFile("/home/alice/../alice/./a.txt", alice)).toBe("x");
  });

  it("throws ENOENT for missing files", () => {
    const vfs = fresh();
    expect(() => vfs.readFile("/nope", alice)).toThrow(FsError);
  });
});

describe("VFS permissions", () => {
  it("denies another user reading a 0700 home", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/secret.txt", "classified", alice);
    expect(() => vfs.readFile("/home/alice/secret.txt", bob)).toThrow(/EACCES/);
  });

  it("lets root read anything", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/secret.txt", "classified", alice);
    expect(vfs.readFile("/home/alice/secret.txt", root)).toBe("classified");
  });

  it("enforces write permission on directories", () => {
    const vfs = fresh();
    expect(() => vfs.writeFile("/home/alice/x", "y", bob)).toThrow(/EACCES/);
  });

  it("chmod only by owner or root", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/f", "z", alice);
    expect(() => vfs.chmod("/home/alice/f", 0o777, bob)).toThrow(/EACCES/);
    vfs.chmod("/home/alice/f", 0o644, alice); // owner ok
  });

  it("chown only by root", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/f", "z", alice);
    expect(() => vfs.chown("/home/alice/f", 1001, 1001, alice)).toThrow(/EACCES/);
  });

  it("rm respects recursive flag", () => {
    const vfs = fresh();
    vfs.mkdir("/home/alice/d", alice);
    vfs.writeFile("/home/alice/d/f", "x", alice);
    expect(() => vfs.rm("/home/alice/d", alice)).toThrow(/EISDIR/);
    vfs.rm("/home/alice/d", alice, { recursive: true });
    expect(vfs.exists("/home/alice/d", alice)).toBe(false);
  });
});

describe("VFS serialization", () => {
  it("round-trips via JSON", () => {
    const vfs = fresh();
    vfs.writeFile("/home/alice/keep.txt", "persist me", alice);
    const json = JSON.parse(JSON.stringify(vfs.toJSON()));
    const restored = VFS.fromJSON(json);
    expect(restored.readFile("/home/alice/keep.txt", root)).toBe("persist me");
  });
});
