// Compact declarative builder for a host's filesystem. A spec is a nested
// object: a string value is a file's content; an object is a directory; a
// { content, mode, uid, gid } object is a file with explicit metadata.

import { makeDir, makeFile, type VDir, type VNode } from "../fs/vfs";

export interface FileSpec {
  content: string;
  mode?: number;
  uid?: number;
  gid?: number;
}

export type TreeSpec = {
  [name: string]: string | FileSpec | TreeSpec;
};

function isFileSpec(v: unknown): v is FileSpec {
  return typeof v === "object" && v !== null && "content" in (v as object);
}

/** Build a VDir from a spec. `defaultUid/Gid` apply to nodes without overrides. */
export function buildTree(spec: TreeSpec, defaultUid = 0, defaultGid = 0, dirMode = 0o755): VDir {
  const dir = makeDir(defaultUid, defaultGid, dirMode);
  for (const [name, value] of Object.entries(spec)) {
    dir.children[name] = buildNode(value, defaultUid, defaultGid);
  }
  return dir;
}

function buildNode(value: string | FileSpec | TreeSpec, uid: number, gid: number): VNode {
  if (typeof value === "string") {
    return makeFile(value, uid, gid, 0o644);
  }
  if (isFileSpec(value)) {
    return makeFile(value.content, value.uid ?? uid, value.gid ?? gid, value.mode ?? 0o644);
  }
  return buildTree(value, uid, gid);
}

/** Merge a subtree into an existing VDir (used to graft /home/<user> dirs). */
export function graft(root: VDir, path: string[], node: VNode): void {
  let dir = root;
  for (const seg of path.slice(0, -1)) {
    const next = dir.children[seg];
    if (next && next.type === "dir") dir = next;
    else {
      const created = makeDir(dir.uid, dir.gid);
      dir.children[seg] = created;
      dir = created;
    }
  }
  dir.children[path[path.length - 1]!] = node;
}
