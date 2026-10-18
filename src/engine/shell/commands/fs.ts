// Filesystem commands: pwd, ls, cd, mkdir, rmdir, touch, cp, mv, rm, cat,
// less, head, tail, find, grep, chmod, chown, stat, file, du, df.

import { basename, dirname } from "../../fs/path";
import { FsError, type VDir, type VNode } from "../../fs/vfs";
import { parseArgs } from "./args";
import { err, ok, type CommandSpec, type ShellContext } from "../context";

function modeString(node: VNode): string {
  const t = node.type === "dir" ? "d" : node.type === "symlink" ? "l" : "-";
  const p = (bits: number) =>
    (bits & 4 ? "r" : "-") + (bits & 2 ? "w" : "-") + (bits & 1 ? "x" : "-");
  return t + p((node.mode >> 6) & 7) + p((node.mode >> 3) & 7) + p(node.mode & 7);
}

function nodeSize(node: VNode): number {
  if (node.type === "file") return node.content.length;
  if (node.type === "symlink") return node.target.length;
  return 4096;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const mon = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"][
    d.getMonth()
  ];
  const day = String(d.getDate()).padStart(2, " ");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mon} ${day} ${hh}:${mm}`;
}

function userName(ctx: ShellContext, uid: number): string {
  return ctx.getUser(uid)?.name ?? String(uid);
}
function groupName(ctx: ShellContext, gid: number): string {
  return ctx.host.groups.find((g) => g.gid === gid)?.name ?? String(gid);
}

function fsErrMsg(cmd: string, e: unknown): string {
  if (e instanceof FsError) {
    const map: Record<string, string> = {
      ENOENT: "nie ma takiego pliku ani katalogu",
      ENOTDIR: "nie jest katalogiem",
      EISDIR: "jest katalogiem",
      EEXIST: "plik istnieje",
      EACCES: "brak dostępu",
      ENOTEMPTY: "katalog nie jest pusty",
      EINVAL: "nieprawidłowy argument",
    };
    return `${cmd}: ${e.path}: ${map[e.code] ?? e.code}`;
  }
  return `${cmd}: ${(e as Error).message}`;
}

const pwd: CommandSpec = {
  name: "pwd",
  summary: "wypisz bieżący katalog roboczy",
  usage: "pwd",
  run: (ctx) => ok(ctx.session.cwd + "\n"),
};

const cd: CommandSpec = {
  name: "cd",
  summary: "zmień katalog",
  usage: "cd [katalog]",
  run: (ctx, io) => {
    const target = io.argv[0] ?? ctx.user.home ?? "/";
    const dest = target === "-" ? ctx.session.env.OLDPWD ?? ctx.session.cwd : ctx.resolve(target);
    try {
      const { node } = ctx.vfs.stat(dest, ctx.principal);
      if (node.type !== "dir") return err(`cd: ${target}: nie jest katalogiem`);
      ctx.session.env.OLDPWD = ctx.session.cwd;
      ctx.session.cwd = dest;
      ctx.session.env.PWD = dest;
      return ok();
    } catch (e) {
      return err(fsErrMsg("cd", e));
    }
  },
};

const ls: CommandSpec = {
  name: "ls",
  summary: "wypisz zawartość katalogu",
  usage: "ls [-l] [-a] [-h] [ścieżka...]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const long = flags.has("l");
    const all = flags.has("a");
    const human = flags.has("h");
    const targets = positionals.length ? positionals : ["."];
    const out: string[] = [];
    const errs: string[] = [];
    let code = 0;

    for (const t of targets) {
      const abs = ctx.resolve(t);
      let node: VNode;
      try {
        node = ctx.vfs.stat(abs, ctx.principal).node;
      } catch (e) {
        errs.push(fsErrMsg("ls", e));
        code = 2;
        continue;
      }
      if (node.type !== "dir") {
        out.push(long ? longLine(ctx, node, basename(abs), human) : basename(abs));
        continue;
      }
      let names: string[];
      try {
        names = ctx.vfs.readdir(abs, ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("ls", e));
        code = 2;
        continue;
      }
      if (all) names = [".", "..", ...names];
      if (targets.length > 1) out.push(`${t}:`);
      if (long) {
        for (const name of names) {
          const childPath = name === "." ? abs : name === ".." ? dirname(abs) : `${abs}/${name}`;
          let child: VNode;
          try {
            child = ctx.vfs.stat(childPath, ctx.principal).node;
          } catch {
            continue;
          }
          out.push(longLine(ctx, child, name, human));
        }
      } else {
        out.push(names.join("  "));
      }
      if (targets.length > 1) out.push("");
    }
    return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: errs.join("\n") + (errs.length ? "\n" : ""), code };
  },
};

function longLine(ctx: ShellContext, node: VNode, name: string, human: boolean): string {
  const size = human ? humanSize(nodeSize(node)) : String(nodeSize(node));
  const link = node.type === "symlink" ? ` -> ${node.target}` : "";
  const nlinks = node.type === "dir" ? Object.keys((node as VDir).children).length + 2 : 1;
  return [
    modeString(node),
    String(nlinks).padStart(2),
    userName(ctx, node.uid).padEnd(8),
    groupName(ctx, node.gid).padEnd(8),
    size.padStart(7),
    fmtDate(node.mtime),
    name + link,
  ].join(" ");
}

function humanSize(n: number): string {
  if (n < 1024) return `${n}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}

const mkdir: CommandSpec = {
  name: "mkdir",
  summary: "utwórz katalog",
  usage: "mkdir [-p] katalog...",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("mkdir: brak operandu");
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        ctx.vfs.mkdir(ctx.resolve(t), ctx.principal, { recursive: flags.has("p") });
      } catch (e) {
        errs.push(fsErrMsg("mkdir", e));
      }
    }
    return errs.length ? err(errs.join("\n"), 1) : ok();
  },
};

const rmdir: CommandSpec = {
  name: "rmdir",
  summary: "usuń pusty katalog",
  usage: "rmdir katalog...",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("rmdir: brak operandu");
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        ctx.vfs.rmdir(ctx.resolve(t), ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("rmdir", e));
      }
    }
    return errs.length ? err(errs.join("\n"), 1) : ok();
  },
};

const touch: CommandSpec = {
  name: "touch",
  summary: "utwórz pusty plik lub odśwież znacznik czasu",
  usage: "touch plik...",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("touch: brak operandu");
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        ctx.vfs.touch(ctx.resolve(t), ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("touch", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

const rm: CommandSpec = {
  name: "rm",
  summary: "usuń pliki i katalogi",
  usage: "rm [-r] [-f] plik...",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const recursive = flags.has("r") || flags.has("R");
    const force = flags.has("f");
    if (!positionals.length) return force ? ok() : err("rm: brak operandu");
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        ctx.vfs.rm(ctx.resolve(t), ctx.principal, { recursive });
        ctx.emit({ kind: "file_delete", hostId: ctx.host.id, data: { path: ctx.resolve(t) } });
      } catch (e) {
        if (!force) errs.push(fsErrMsg("rm", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

const cp: CommandSpec = {
  name: "cp",
  summary: "kopiuj pliki i katalogi",
  usage: "cp [-r] źródło cel",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    if (positionals.length < 2) return err("cp: brak operandu pliku docelowego");
    const dst = positionals[positionals.length - 1]!;
    const srcs = positionals.slice(0, -1);
    const errs: string[] = [];
    for (const s of srcs) {
      try {
        ctx.vfs.cp(ctx.resolve(s), ctx.resolve(dst), ctx.principal, {
          recursive: flags.has("r") || flags.has("R"),
        });
      } catch (e) {
        errs.push(fsErrMsg("cp", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

const mv: CommandSpec = {
  name: "mv",
  summary: "przenieś/zmień nazwę pliku",
  usage: "mv źródło cel",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (positionals.length < 2) return err("mv: brak operandu pliku docelowego");
    const dst = positionals[positionals.length - 1]!;
    const srcs = positionals.slice(0, -1);
    const errs: string[] = [];
    for (const s of srcs) {
      try {
        ctx.vfs.mv(ctx.resolve(s), ctx.resolve(dst), ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("mv", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

function readFileForCat(ctx: ShellContext, path: string): string {
  return ctx.vfs.readFile(ctx.resolve(path), ctx.principal);
}

const cat: CommandSpec = {
  name: "cat",
  summary: "wypisz zawartość plików",
  usage: "cat [-n] [plik...]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    if (!positionals.length) return ok(io.stdin);
    const out: string[] = [];
    const errs: string[] = [];
    let code = 0;
    for (const t of positionals) {
      try {
        let content = readFileForCat(ctx, t);
        ctx.emit({ kind: "file_read", hostId: ctx.host.id, data: { path: ctx.resolve(t) } });
        if (flags.has("n")) {
          content = content
            .split("\n")
            .map((l, i) => `${String(i + 1).padStart(6)}  ${l}`)
            .join("\n");
        }
        out.push(content);
      } catch (e) {
        errs.push(fsErrMsg("cat", e));
        code = 1;
      }
    }
    return { stdout: out.join(""), stderr: errs.join("\n") + (errs.length ? "\n" : ""), code };
  },
};

const less: CommandSpec = {
  name: "less",
  summary: "przeglądaj zawartość pliku (w tej symulacji działa jak cat)",
  usage: "less plik",
  run: (ctx, io) => cat.run(ctx, io),
};

const head: CommandSpec = {
  name: "head",
  summary: "wypisz pierwsze wiersze",
  usage: "head [-n N] plik...",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["n"] });
    const n = values.n ? parseInt(values.n, 10) : 10;
    const render = (text: string) => {
      const body = text.endsWith("\n") ? text.slice(0, -1) : text;
      const lines = body === "" ? [] : body.split("\n");
      const picked = lines.slice(0, n);
      return picked.join("\n") + (picked.length ? "\n" : "");
    };
    if (!positionals.length) return ok(render(io.stdin));
    const out: string[] = [];
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        out.push(render(readFileForCat(ctx, t)));
      } catch (e) {
        errs.push(fsErrMsg("head", e));
      }
    }
    return { stdout: out.join(""), stderr: errs.join("\n"), code: errs.length ? 1 : 0 };
  },
};

const tail: CommandSpec = {
  name: "tail",
  summary: "wypisz ostatnie wiersze",
  usage: "tail [-n N] plik...",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["n"] });
    const n = values.n ? parseInt(values.n, 10) : 10;
    const render = (text: string) => {
      const body = text.endsWith("\n") ? text.slice(0, -1) : text;
      const lines = body === "" ? [] : body.split("\n");
      const picked = lines.slice(Math.max(0, lines.length - n));
      return picked.join("\n") + (picked.length ? "\n" : "");
    };
    if (!positionals.length) return ok(render(io.stdin));
    const out: string[] = [];
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        out.push(render(readFileForCat(ctx, t)));
      } catch (e) {
        errs.push(fsErrMsg("tail", e));
      }
    }
    return { stdout: out.join(""), stderr: errs.join("\n"), code: errs.length ? 1 : 0 };
  },
};

const find: CommandSpec = {
  name: "find",
  summary: "wyszukaj pliki w hierarchii katalogów",
  usage: "find [ścieżka] [-name wzorzec] [-type f|d]",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { longValueFlags: ["name", "type"] });
    // -name / -type are passed as positionals in our simplistic parser when
    // written as "find . -name foo"; handle both forms.
    const start = positionals[0] && !positionals[0].startsWith("-") ? positionals[0] : ".";
    let namePat = values.name;
    let typeFilter = values.type;
    // manual scan for "-name X" / "-type X" style
    for (let i = 0; i < io.argv.length - 1; i++) {
      if (io.argv[i] === "-name") namePat = io.argv[i + 1];
      if (io.argv[i] === "-type") typeFilter = io.argv[i + 1];
    }
    const abs = ctx.resolve(start);
    let entries;
    try {
      entries = ctx.vfs.walkTree(abs, ctx.principal);
    } catch (e) {
      return err(fsErrMsg("find", e));
    }
    const rx = namePat ? globToRegExp(namePat) : null;
    const out = entries
      .filter(({ node }) => {
        if (typeFilter === "f" && node.type !== "file") return false;
        if (typeFilter === "d" && node.type !== "dir") return false;
        return true;
      })
      .filter(({ path }) => (rx ? rx.test(basename(path)) : true))
      .map((e) => e.path);
    return ok(out.join("\n") + (out.length ? "\n" : ""));
  },
};

function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

const grep: CommandSpec = {
  name: "grep",
  summary: "wyszukaj wzorzec w tekście",
  usage: "grep [-i] [-n] [-v] [-r] wzorzec [plik...]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("grep: brak wzorca");
    const pattern = positionals[0]!;
    const files = positionals.slice(1);
    let rx: RegExp;
    try {
      rx = new RegExp(pattern, flags.has("i") ? "i" : "");
    } catch {
      return err(`grep: nieprawidłowe wyrażenie regularne: ${pattern}`);
    }
    const invert = flags.has("v");
    const showNum = flags.has("n");
    const recursive = flags.has("r") || flags.has("R");

    const matchText = (text: string, label?: string): string[] => {
      const res: string[] = [];
      text.split("\n").forEach((line, i) => {
        const hit = rx.test(line);
        if (hit !== invert) {
          const prefix = `${label ? label + ":" : ""}${showNum ? i + 1 + ":" : ""}`;
          res.push(prefix + line);
        }
      });
      return res;
    };

    if (!files.length) {
      return ok(matchText(io.stdin).join("\n") + "\n");
    }
    const out: string[] = [];
    const errs: string[] = [];
    let anyMatch = false;
    const multi = files.length > 1 || recursive;
    for (const f of files) {
      try {
        if (recursive) {
          const entries = ctx.vfs.walkTree(ctx.resolve(f), ctx.principal).filter(
            (e) => e.node.type === "file",
          );
          for (const e of entries) {
            const content = ctx.vfs.readFile(e.path, ctx.principal);
            const m = matchText(content, e.path);
            if (m.length) anyMatch = true;
            out.push(...m);
          }
        } else {
          const content = readFileForCat(ctx, f);
          const m = matchText(content, multi ? f : undefined);
          if (m.length) anyMatch = true;
          out.push(...m);
        }
      } catch (e) {
        errs.push(fsErrMsg("grep", e));
      }
    }
    return {
      stdout: out.join("\n") + (out.length ? "\n" : ""),
      stderr: errs.join("\n"),
      code: anyMatch ? 0 : 1,
    };
  },
};

const chmod: CommandSpec = {
  name: "chmod",
  summary: "zmień uprawnienia pliku",
  usage: "chmod TRYB plik...   (np. chmod 755 plik)",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (positionals.length < 2) return err("chmod: brak operandu");
    const modeStr = positionals[0]!;
    if (!/^[0-7]{3,4}$/.test(modeStr)) return err(`chmod: nieprawidłowy tryb: ${modeStr}`);
    const mode = parseInt(modeStr, 8);
    const errs: string[] = [];
    for (const t of positionals.slice(1)) {
      try {
        ctx.vfs.chmod(ctx.resolve(t), mode, ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("chmod", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

const chown: CommandSpec = {
  name: "chown",
  summary: "zmień właściciela pliku (wymaga root)",
  usage: "chown użytkownik[:grupa] plik...",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (positionals.length < 2) return err("chown: brak operandu");
    const spec = positionals[0]!;
    const [uName, gName] = spec.split(":");
    const u = ctx.getUser(uName!);
    if (!u) return err(`chown: nieprawidłowy użytkownik: ${uName}`);
    const gid = gName ? ctx.host.groups.find((g) => g.name === gName)?.gid : undefined;
    const errs: string[] = [];
    for (const t of positionals.slice(1)) {
      try {
        ctx.vfs.chown(ctx.resolve(t), u.uid, gid, ctx.principal);
      } catch (e) {
        errs.push(fsErrMsg("chown", e));
      }
    }
    return errs.length ? err(errs.join("\n")) : ok();
  },
};

const stat: CommandSpec = {
  name: "stat",
  summary: "pokaż szczegóły pliku",
  usage: "stat plik",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("stat: brak operandu");
    const out: string[] = [];
    const errs: string[] = [];
    for (const t of positionals) {
      try {
        const { node, path } = ctx.vfs.stat(ctx.resolve(t), ctx.principal);
        const octal = (node.mode & 0o7777).toString(8).padStart(4, "0");
        out.push(
          `  Plik: ${path}\n` +
            `Rozmiar: ${nodeSize(node)}\tTyp: ${node.type === "dir" ? "katalog" : node.type === "symlink" ? "dowiązanie" : "zwykły plik"}\n` +
            `Dostęp: (${octal}/${modeString(node)})  Uid: (${node.uid}/${userName(ctx, node.uid)})  Gid: (${node.gid}/${groupName(ctx, node.gid)})\n` +
            `Modyfikacja: ${new Date(node.mtime).toISOString()}`,
        );
      } catch (e) {
        errs.push(fsErrMsg("stat", e));
      }
    }
    return { stdout: out.join("\n") + "\n", stderr: errs.join("\n"), code: errs.length ? 1 : 0 };
  },
};

const fileCmd: CommandSpec = {
  name: "file",
  summary: "rozpoznaj typ pliku",
  usage: "file plik...",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (!positionals.length) return err("file: brak operandu");
    const out: string[] = [];
    for (const t of positionals) {
      try {
        const { node, path } = ctx.vfs.stat(ctx.resolve(t), ctx.principal);
        let desc: string;
        if (node.type === "dir") desc = "directory";
        else if (node.type === "symlink") desc = `symbolic link to ${node.target}`;
        else {
          const c = node.content;
          if (/^\x7fELF/.test(c)) desc = "ELF executable";
          else if (/^#!/.test(c)) desc = "script text executable";
          else if (/^\s*[{[]/.test(c)) desc = "JSON data";
          else if (c.length === 0) desc = "empty";
          else if (/[^\x09\x0a\x0d\x20-\x7e]/.test(c)) desc = "data";
          else desc = "ASCII text";
        }
        out.push(`${path}: ${desc}`);
      } catch (e) {
        out.push(fsErrMsg("file", e));
      }
    }
    return ok(out.join("\n") + "\n");
  },
};

const du: CommandSpec = {
  name: "du",
  summary: "oszacuj zużycie miejsca",
  usage: "du [-s] [-h] [ścieżka]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const start = positionals[0] ?? ".";
    const abs = ctx.resolve(start);
    let entries;
    try {
      entries = ctx.vfs.walkTree(abs, ctx.principal);
    } catch (e) {
      return err(fsErrMsg("du", e));
    }
    const total = entries.reduce((a, e) => a + nodeSize(e.node), 0);
    const blocks = Math.ceil(total / 1024);
    const fmt = (n: number) => (flags.has("h") ? humanSize(n * 1024) : String(n));
    if (flags.has("s")) return ok(`${fmt(blocks)}\t${abs}\n`);
    const lines = entries
      .filter((e) => e.node.type === "dir")
      .map((e) => `${fmt(Math.ceil(nodeSize(e.node) / 1024))}\t${e.path}`);
    lines.push(`${fmt(blocks)}\t${abs}`);
    return ok(lines.join("\n") + "\n");
  },
};

const df: CommandSpec = {
  name: "df",
  summary: "pokaż użycie systemu plików",
  usage: "df [-h]",
  run: (ctx, io) => {
    const { flags } = parseArgs(io.argv);
    const used = ctx.vfs.walkTree("/", { uid: 0, gid: 0, groups: [] }).reduce(
      (a, e) => a + nodeSize(e.node),
      0,
    );
    const totalKb = 20 * 1024 * 1024; // 20 GiB simulated
    const usedKb = Math.ceil(used / 1024);
    const availKb = totalKb - usedKb;
    const pct = Math.min(100, Math.round((usedKb / totalKb) * 100));
    const h = (kb: number) => (flags.has("h") ? humanSize(kb * 1024) : String(kb));
    return ok(
      `System plików   Rozmiar  Użyte  Dostępne  Użycie%  Zamontowany na\n` +
        `/dev/vda1       ${h(totalKb).padStart(7)}  ${h(usedKb).padStart(5)}  ${h(availKb).padStart(8)}  ${String(pct).padStart(6)}%  /\n`,
    );
  },
};

export const fsCommands: CommandSpec[] = [
  pwd,
  cd,
  ls,
  mkdir,
  rmdir,
  touch,
  rm,
  cp,
  mv,
  cat,
  less,
  head,
  tail,
  find,
  grep,
  chmod,
  chown,
  stat,
  fileCmd,
  du,
  df,
];
