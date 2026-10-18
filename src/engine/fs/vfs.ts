// Virtual filesystem for BLACKNET. A serializable tree of inodes with
// Unix-style permission semantics. It knows nothing about the host FS and
// performs every mutation through permission-checked methods so the shell
// commands behave like a real Linux box.
//
// Implemented faithfully: rwx bits for user/group/other, uid/gid ownership,
// the root (uid 0) override, directory write/execute rules for create/delete
// and traversal, mtime updates. NOT implemented: setuid/setgid/sticky bits,
// hard links, device/FIFO nodes, ACLs. Symlinks are modeled as a file whose
// `link` target is resolved by the shell layer, not transparently here.

import { basename, dirname, normalize, split } from "./path";

export type NodeType = "file" | "dir" | "symlink";

export interface VNodeBase {
  type: NodeType;
  mode: number; // permission bits, e.g. 0o644
  uid: number;
  gid: number;
  mtime: number; // epoch ms
}

export interface VFile extends VNodeBase {
  type: "file";
  content: string;
}

export interface VDir extends VNodeBase {
  type: "dir";
  children: Record<string, VNode>;
}

export interface VSymlink extends VNodeBase {
  type: "symlink";
  target: string;
}

export type VNode = VFile | VDir | VSymlink;

/** Who is performing an operation. */
export interface Principal {
  uid: number;
  gid: number;
  groups: number[];
}

export type FsErrorCode =
  | "ENOENT" // no such file or directory
  | "ENOTDIR" // not a directory
  | "EISDIR" // is a directory
  | "EEXIST" // already exists
  | "EACCES" // permission denied
  | "ENOTEMPTY" // directory not empty
  | "EINVAL"; // invalid argument

export class FsError extends Error {
  constructor(
    public code: FsErrorCode,
    public path: string,
    message?: string,
  ) {
    super(message ?? `${code}: ${path}`);
    this.name = "FsError";
  }
}

export function isRoot(p: Principal): boolean {
  return p.uid === 0;
}

function ownsOrIn(node: VNodeBase, p: Principal): "user" | "group" | "other" {
  if (node.uid === p.uid) return "user";
  if (node.gid === p.gid || p.groups.includes(node.gid)) return "group";
  return "other";
}

/** Permission bit masks for a class. */
const R = 4;
const W = 2;
const X = 1;

function classBits(node: VNodeBase, p: Principal): number {
  switch (ownsOrIn(node, p)) {
    case "user":
      return (node.mode >> 6) & 7;
    case "group":
      return (node.mode >> 3) & 7;
    default:
      return node.mode & 7;
  }
}

export function canRead(node: VNodeBase, p: Principal): boolean {
  if (isRoot(p)) return true;
  return (classBits(node, p) & R) !== 0;
}

export function canWrite(node: VNodeBase, p: Principal): boolean {
  if (isRoot(p)) return true;
  return (classBits(node, p) & W) !== 0;
}

export function canExec(node: VNodeBase, p: Principal): boolean {
  // root can traverse/execute dirs always; for plain files root still needs
  // at least one x bit on real Linux, but we allow root to exec to keep the
  // sim forgiving.
  if (isRoot(p)) return node.type === "dir" ? true : (node.mode & 0o111) !== 0 || true;
  return (classBits(node, p) & X) !== 0;
}

export function now(): number {
  return Date.now();
}

export function makeDir(uid = 0, gid = 0, mode = 0o755): VDir {
  return { type: "dir", mode, uid, gid, mtime: now(), children: {} };
}

export function makeFile(content = "", uid = 0, gid = 0, mode = 0o644): VFile {
  return { type: "file", mode, uid, gid, mtime: now(), content };
}

export function makeSymlink(target: string, uid = 0, gid = 0): VSymlink {
  return { type: "symlink", mode: 0o777, uid, gid, mtime: now(), target };
}

export interface ResolveResult {
  node: VNode;
  path: string; // normalized absolute path
}

export class VFS {
  root: VDir;

  constructor(root?: VDir) {
    this.root = root ?? makeDir(0, 0, 0o755);
  }

  static fromJSON(data: VDir): VFS {
    return new VFS(data);
  }

  toJSON(): VDir {
    return this.root;
  }

  /**
   * Walk to a node. Checks execute (traverse) permission on every directory
   * along the way. Does not require the final component to exist unless
   * `mustExist` is true (default). Symlinks in intermediate components are
   * not auto-followed here (kept simple); use the shell's resolver for that.
   */
  private walk(
    abs: string,
    p: Principal,
    mustExist = true,
  ): { parent: VDir; name: string; node: VNode | undefined; path: string } {
    const path = normalize(abs);
    const parts = split(path);
    let dir: VDir = this.root;

    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!;
      if (!canExec(dir, p)) throw new FsError("EACCES", "/" + parts.slice(0, i).join("/"));
      const next = dir.children[seg];
      if (!next) throw new FsError("ENOENT", "/" + parts.slice(0, i + 1).join("/"));
      if (next.type !== "dir") throw new FsError("ENOTDIR", "/" + parts.slice(0, i + 1).join("/"));
      dir = next;
    }

    const name = parts.length === 0 ? "" : parts[parts.length - 1]!;
    if (parts.length === 0) {
      return { parent: this.root, name: "", node: this.root, path: "/" };
    }
    if (!canExec(dir, p)) throw new FsError("EACCES", dirname(path));
    const node = dir.children[name];
    if (mustExist && !node) throw new FsError("ENOENT", path);
    return { parent: dir, name, node, path };
  }

  exists(abs: string, p: Principal): boolean {
    try {
      this.walk(abs, p, false);
      const { node } = this.walk(abs, p, false);
      return node !== undefined;
    } catch {
      return false;
    }
  }

  stat(abs: string, p: Principal): ResolveResult {
    const { node, path } = this.walk(abs, p, true);
    return { node: node!, path };
  }

  readFile(abs: string, p: Principal): string {
    const { node, path } = this.walk(abs, p, true);
    if (node!.type === "dir") throw new FsError("EISDIR", path);
    if (node!.type === "symlink") throw new FsError("EINVAL", path);
    if (!canRead(node!, p)) throw new FsError("EACCES", path);
    return (node as VFile).content;
  }

  /** Create or overwrite a file. */
  writeFile(abs: string, content: string, p: Principal, mode = 0o644): void {
    const { parent, name, node, path } = this.walk(abs, p, false);
    if (node) {
      if (node.type === "dir") throw new FsError("EISDIR", path);
      if (!canWrite(node, p)) throw new FsError("EACCES", path);
      (node as VFile).content = content;
      node.mtime = now();
      return;
    }
    if (!canWrite(parent, p)) throw new FsError("EACCES", dirname(path));
    parent.children[name] = makeFile(content, p.uid, p.gid, mode);
    parent.mtime = now();
  }

  appendFile(abs: string, content: string, p: Principal): void {
    let existing = "";
    try {
      existing = this.readFile(abs, p);
    } catch (e) {
      if (!(e instanceof FsError) || e.code !== "ENOENT") throw e;
    }
    this.writeFile(abs, existing + content, p);
  }

  mkdir(abs: string, p: Principal, opts: { recursive?: boolean; mode?: number } = {}): void {
    const path = normalize(abs);
    if (opts.recursive) {
      const parts = split(path);
      let cur = "";
      for (const seg of parts) {
        cur += "/" + seg;
        if (!this.exists(cur, p)) this.mkdir(cur, p, { mode: opts.mode });
      }
      return;
    }
    const { parent, name, node } = this.walk(path, p, false);
    if (node) throw new FsError("EEXIST", path);
    if (!canWrite(parent, p)) throw new FsError("EACCES", dirname(path));
    parent.children[name] = makeDir(p.uid, p.gid, opts.mode ?? 0o755);
    parent.mtime = now();
  }

  readdir(abs: string, p: Principal): string[] {
    const { node, path } = this.walk(abs, p, true);
    if (node!.type !== "dir") throw new FsError("ENOTDIR", path);
    if (!canRead(node!, p)) throw new FsError("EACCES", path);
    return Object.keys((node as VDir).children).sort();
  }

  rmdir(abs: string, p: Principal): void {
    const { parent, name, node, path } = this.walk(abs, p, true);
    if (node!.type !== "dir") throw new FsError("ENOTDIR", path);
    if (Object.keys((node as VDir).children).length > 0) throw new FsError("ENOTEMPTY", path);
    if (!canWrite(parent, p)) throw new FsError("EACCES", dirname(path));
    delete parent.children[name];
    parent.mtime = now();
  }

  /** Remove a file or (optionally recursively) a directory. */
  rm(abs: string, p: Principal, opts: { recursive?: boolean } = {}): void {
    const { parent, name, node, path } = this.walk(abs, p, true);
    if (node!.type === "dir") {
      if (!opts.recursive) throw new FsError("EISDIR", path);
      if (Object.keys((node as VDir).children).length > 0 && !canWrite(node!, p))
        throw new FsError("EACCES", path);
    }
    if (!canWrite(parent, p)) throw new FsError("EACCES", dirname(path));
    delete parent.children[name];
    parent.mtime = now();
  }

  /** Copy a file or directory tree. */
  cp(src: string, dst: string, p: Principal, opts: { recursive?: boolean } = {}): void {
    const { node, path } = this.walk(src, p, true);
    if (node!.type === "dir" && !opts.recursive) throw new FsError("EISDIR", path);
    const clone = structuredClone(node!) as VNode;
    this.place(dst, clone, p);
  }

  mv(src: string, dst: string, p: Principal): void {
    const srcRes = this.walk(src, p, true);
    if (!canWrite(srcRes.parent, p)) throw new FsError("EACCES", dirname(srcRes.path));
    const node = srcRes.node!;
    this.place(dst, node, p);
    delete srcRes.parent.children[srcRes.name];
    srcRes.parent.mtime = now();
  }

  /** Place a node at dst, honoring "dst is an existing directory" semantics. */
  private place(dst: string, node: VNode, p: Principal): void {
    const dstRes = this.walk(dst, p, false);
    if (dstRes.node && dstRes.node.type === "dir") {
      // Place inside the directory under the source's own basename.
      const target = dstRes.node as VDir;
      if (!canWrite(target, p)) throw new FsError("EACCES", dstRes.path);
      const name = basename(dst) === "/" ? "" : basename(normalize(dst));
      // When dst resolves to a dir, keep source name:
      const srcName = name || "node";
      target.children[srcName] = node;
      target.mtime = now();
      return;
    }
    if (!canWrite(dstRes.parent, p)) throw new FsError("EACCES", dirname(dstRes.path));
    dstRes.parent.children[dstRes.name] = node;
    dstRes.parent.mtime = now();
  }

  chmod(abs: string, mode: number, p: Principal): void {
    const { node, path } = this.walk(abs, p, true);
    if (!isRoot(p) && node!.uid !== p.uid) throw new FsError("EACCES", path);
    node!.mode = mode & 0o7777;
    node!.mtime = now();
  }

  chown(abs: string, uid: number, gid: number | undefined, p: Principal): void {
    const { node, path } = this.walk(abs, p, true);
    // Only root may change ownership (matches Linux for arbitrary chown).
    if (!isRoot(p)) throw new FsError("EACCES", path);
    node!.uid = uid;
    if (gid !== undefined) node!.gid = gid;
    node!.mtime = now();
  }

  touch(abs: string, p: Principal): void {
    const { parent, name, node } = this.walk(abs, p, false);
    if (node) {
      node.mtime = now();
      return;
    }
    if (!canWrite(parent, p)) throw new FsError("EACCES", dirname(normalize(abs)));
    parent.children[name] = makeFile("", p.uid, p.gid);
    parent.mtime = now();
  }

  /** Recursively collect paths under `abs` (for find). */
  walkTree(abs: string, p: Principal): { path: string; node: VNode }[] {
    const out: { path: string; node: VNode }[] = [];
    const start = this.walk(abs, p, true);
    const visit = (path: string, node: VNode) => {
      out.push({ path, node });
      if (node.type === "dir" && canRead(node, p)) {
        for (const name of Object.keys(node.children).sort()) {
          visit(path === "/" ? "/" + name : path + "/" + name, node.children[name]!);
        }
      }
    };
    visit(start.path, start.node!);
    return out;
  }
}
