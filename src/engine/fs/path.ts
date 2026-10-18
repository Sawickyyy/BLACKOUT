// POSIX-style path helpers for the virtual filesystem. These operate on
// string paths only; they never touch the host filesystem.

export function isAbsolute(p: string): boolean {
  return p.startsWith("/");
}

/** Split a path into components, dropping empty segments. */
export function split(p: string): string[] {
  return p.split("/").filter((s) => s.length > 0);
}

/**
 * Resolve `target` against `cwd` (which must be absolute) and normalize
 * `.`/`..`. The result is always absolute and has no trailing slash
 * (except for the root "/").
 */
export function resolve(cwd: string, target: string): string {
  const base = isAbsolute(target) ? [] : split(cwd);
  const parts = isAbsolute(target) ? split(target) : [...base, ...split(target)];
  const out: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return "/" + out.join("/");
}

/** Normalize an already-absolute path (collapse `.`/`..` and slashes). */
export function normalize(p: string): string {
  return resolve("/", p);
}

/** The directory portion of a path, e.g. dirname("/a/b/c") === "/a/b". */
export function dirname(p: string): string {
  const norm = normalize(p);
  if (norm === "/") return "/";
  const idx = norm.lastIndexOf("/");
  return idx <= 0 ? "/" : norm.slice(0, idx);
}

/** The final component of a path, e.g. basename("/a/b/c") === "c". */
export function basename(p: string): string {
  const parts = split(p);
  return parts.length === 0 ? "/" : parts[parts.length - 1]!;
}

export function join(...parts: string[]): string {
  return normalize(parts.join("/"));
}
