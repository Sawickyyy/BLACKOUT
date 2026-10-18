// Text and data utilities: wc, sort, uniq, cut, sed, awk, tar, gzip/gunzip,
// base64, sha256sum. Behavior is a faithful subset of GNU coreutils; each
// command documents its supported flags in its usage string.

import { base64Decode, base64Encode, sha256 } from "../../util/hash";
import { parseArgs } from "./args";
import { err, ok, type CommandSpec, type ShellContext } from "../context";

function inputFrom(ctx: ShellContext, files: string[], stdin: string): { text: string; errs: string[] } {
  if (!files.length) return { text: stdin, errs: [] };
  const parts: string[] = [];
  const errs: string[] = [];
  for (const f of files) {
    try {
      parts.push(ctx.vfs.readFile(ctx.resolve(f), ctx.principal));
    } catch (e) {
      errs.push(`${(e as Error).message}`);
    }
  }
  return { text: parts.join(""), errs };
}

const wc: CommandSpec = {
  name: "wc",
  summary: "policz wiersze, słowa i bajty",
  usage: "wc [-l] [-w] [-c] [plik...]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const { text, errs } = inputFrom(ctx, positionals, io.stdin);
    const lines = text === "" ? 0 : text.replace(/\n$/, "").split("\n").length;
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
    const bytes = text.length;
    const parts: string[] = [];
    if (flags.has("l")) parts.push(String(lines));
    if (flags.has("w")) parts.push(String(words));
    if (flags.has("c")) parts.push(String(bytes));
    if (!parts.length) parts.push(String(lines), String(words), String(bytes));
    return {
      stdout: parts.map((p) => p.padStart(7)).join(" ") + "\n",
      stderr: errs.join("\n"),
      code: errs.length ? 1 : 0,
    };
  },
};

const sort: CommandSpec = {
  name: "sort",
  summary: "sortuj wiersze",
  usage: "sort [-r] [-n] [-u] [plik...]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const { text, errs } = inputFrom(ctx, positionals, io.stdin);
    let lines = text.replace(/\n$/, "").split("\n");
    if (text === "") lines = [];
    lines.sort((a, b) =>
      flags.has("n") ? parseFloat(a) - parseFloat(b) || a.localeCompare(b) : a.localeCompare(b),
    );
    if (flags.has("r")) lines.reverse();
    if (flags.has("u")) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    return { stdout: lines.join("\n") + (lines.length ? "\n" : ""), stderr: errs.join("\n"), code: 0 };
  },
};

const uniq: CommandSpec = {
  name: "uniq",
  summary: "usuń powtarzające się sąsiednie wiersze",
  usage: "uniq [-c] [plik]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const { text } = inputFrom(ctx, positionals, io.stdin);
    const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      let count = 1;
      while (i + count < lines.length && lines[i + count] === lines[i]) count++;
      out.push(flags.has("c") ? `${String(count).padStart(7)} ${lines[i]}` : lines[i]!);
      i += count;
    }
    return ok(out.join("\n") + (out.length ? "\n" : ""));
  },
};

const cut: CommandSpec = {
  name: "cut",
  summary: "wytnij pola z wierszy",
  usage: "cut -d DELIM -f N[,M] [plik...]",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["d", "f"] });
    const delim = values.d ?? "\t";
    const fieldsSpec = values.f;
    if (!fieldsSpec) return err("cut: musisz podać listę pól (-f)");
    const fields = fieldsSpec.split(",").map((n) => parseInt(n, 10));
    const { text, errs } = inputFrom(ctx, positionals, io.stdin);
    const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    const out = lines.map((line) => {
      const cols = line.split(delim);
      return fields.map((f) => cols[f - 1] ?? "").join(delim);
    });
    return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: errs.join("\n"), code: 0 };
  },
};

const sed: CommandSpec = {
  name: "sed",
  summary: "edycja strumieniowa (obsługiwane: s/wzorzec/zamiana/[g])",
  usage: "sed 's/wzorzec/zamiana/[g]' [plik...]",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    const script = positionals[0];
    if (!script) return err("sed: brak skryptu");
    const m = /^s(.)(.*)\1(.*)\1([gi]*)$/.exec(script);
    if (!m) return err(`sed: nieobsługiwane wyrażenie: ${script}`);
    const [, , pat, rep, modRaw] = m;
    const mods = modRaw ?? "";
    let rx: RegExp;
    try {
      rx = new RegExp(pat!, mods.includes("g") ? "g" : "");
    } catch {
      return err(`sed: nieprawidłowe wyrażenie regularne: ${pat}`);
    }
    const { text, errs } = inputFrom(ctx, positionals.slice(1), io.stdin);
    const lines = text.replace(/\n$/, "").split("\n");
    const out = lines.map((l) => l.replace(rx, rep!.replace(/\\(\d)/g, "$$$1")));
    return { stdout: out.join("\n") + (text.endsWith("\n") || out.length ? "\n" : ""), stderr: errs.join("\n"), code: 0 };
  },
};

const awk: CommandSpec = {
  name: "awk",
  summary: "przetwarzanie pól (obsługiwane: '{print $N}', $0, NF, -F)",
  usage: "awk [-F sep] '{print $1 $3}' [plik...]",
  run: (ctx, io) => {
    const { values, positionals } = parseArgs(io.argv, { valueFlags: ["F"] });
    const sep = values.F ?? /\s+/;
    const program = positionals[0];
    if (!program) return err("awk: brak programu");
    const printMatch = /\{\s*print\s*(.*)\}/.exec(program);
    if (!printMatch) return err(`awk: obsługiwane jest tylko '{print ...}'`);
    const expr = (printMatch[1] ?? "$0").trim();
    const { text, errs } = inputFrom(ctx, positionals.slice(1), io.stdin);
    const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    const out = lines.map((line) => {
      const cols = line.split(sep as any).filter((c, i, arr) => (typeof sep === "object" ? c !== "" || i === arr.length : true));
      const fields = line.trim() === "" ? [] : (typeof sep === "object" ? line.trim().split(sep as RegExp) : line.split(sep as string));
      if (expr === "" || expr === "$0") return line;
      // replace $N and NF
      const tokens = expr.split(/\s*,\s*|\s+/).filter(Boolean);
      return tokens
        .map((tok) => {
          if (tok === "NF") return String(fields.length);
          const fm = /^\$(\d+)$/.exec(tok);
          if (fm) {
            const n = parseInt(fm[1]!, 10);
            return n === 0 ? line : fields[n - 1] ?? "";
          }
          return tok.replace(/^"|"$/g, "");
        })
        .join(" ");
    });
    return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: errs.join("\n"), code: 0 };
  },
};

// tar/gzip: a self-consistent archive format for the sim. tar bundles file
// contents into a JSON envelope so extraction round-trips exactly; gzip marks
// a payload as compressed. Not a real tar/gzip byte stream (documented).
const tar: CommandSpec = {
  name: "tar",
  summary: "archiwizuj/rozpakuj pliki (format symulacji, round-trip)",
  usage: "tar -cf arch.tar pliki... | tar -xf arch.tar | tar -tf arch.tar",
  run: (ctx, io) => {
    const { flags, values, positionals } = parseArgs(io.argv, { valueFlags: ["f"] });
    const file = values.f ?? positionals.find((p) => p.endsWith(".tar") || p.endsWith(".tar.gz"));
    if (!file) return err("tar: nie podano pliku archiwum (-f)");
    const archPath = ctx.resolve(file);

    if (flags.has("c")) {
      const members = positionals.filter((p) => p !== file);
      const cwd = ctx.session.cwd;
      const rel = (abs: string) =>
        abs.startsWith(cwd + "/") ? abs.slice(cwd.length + 1) : abs.replace(/^\//, "");
      const entries: { path: string; content: string }[] = [];
      for (const m of members) {
        const start = ctx.resolve(m);
        try {
          const tree = ctx.vfs.walkTree(start, ctx.principal).filter((e) => e.node.type === "file");
          for (const e of tree) entries.push({ path: rel(e.path), content: (e.node as any).content });
        } catch (e) {
          return err(`tar: ${(e as Error).message}`);
        }
      }
      const envelope = "\x1ftarsim\x1f" + JSON.stringify(entries);
      const payload = flags.has("z") ? "\x1fgz\x1f" + base64Encode(envelope) : envelope;
      try {
        ctx.vfs.writeFile(archPath, payload, ctx.principal);
      } catch (e) {
        return err(`tar: ${(e as Error).message}`);
      }
      return ok();
    }

    // read archive
    let raw: string;
    try {
      raw = ctx.vfs.readFile(archPath, ctx.principal);
    } catch (e) {
      return err(`tar: ${(e as Error).message}`);
    }
    if (raw.startsWith("\x1fgz\x1f")) raw = base64Decode(raw.slice(4));
    if (!raw.startsWith("\x1ftarsim\x1f")) return err("tar: to nie jest archiwum tar (symulacja)");
    const entries: { path: string; content: string }[] = JSON.parse(raw.slice("\x1ftarsim\x1f".length));

    if (flags.has("t")) return ok(entries.map((e) => e.path.replace(/^\//, "")).join("\n") + "\n");

    if (flags.has("x")) {
      for (const e of entries) {
        const dest = ctx.resolve(e.path.replace(/^\//, ""));
        try {
          const dir = dest.split("/").slice(0, -1).join("/") || "/";
          if (!ctx.vfs.exists(dir, ctx.principal)) ctx.vfs.mkdir(dir, ctx.principal, { recursive: true });
          ctx.vfs.writeFile(dest, e.content, ctx.principal);
        } catch {
          /* skip unextractable entries */
        }
      }
      return ok();
    }
    return err("tar: podaj jedną z opcji -c, -x lub -t");
  },
};

const gzip: CommandSpec = {
  name: "gzip",
  summary: "kompresuj plik (symulacja: dodaje .gz)",
  usage: "gzip plik | gzip -d plik.gz",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv);
    const f = positionals[0];
    if (!f) return err("gzip: brak pliku");
    const abs = ctx.resolve(f);
    try {
      const content = ctx.vfs.readFile(abs, ctx.principal);
      if (flags.has("d")) {
        if (!content.startsWith("\x1fgz\x1f")) return err("gzip: nieprawidłowy format");
        const data = base64Decode(content.slice(4));
        const out = abs.replace(/\.gz$/, "");
        ctx.vfs.writeFile(out, data, ctx.principal);
        ctx.vfs.rm(abs, ctx.principal);
      } else {
        const payload = "\x1fgz\x1f" + base64Encode(content);
        ctx.vfs.writeFile(abs + ".gz", payload, ctx.principal);
        ctx.vfs.rm(abs, ctx.principal);
      }
      return ok();
    } catch (e) {
      return err(`gzip: ${(e as Error).message}`);
    }
  },
};

const gunzip: CommandSpec = {
  name: "gunzip",
  summary: "dekompresuj plik .gz",
  usage: "gunzip plik.gz",
  run: (ctx, io) => gzip.run(ctx, { argv: ["-d", ...io.argv], stdin: io.stdin }),
};

const base64Cmd: CommandSpec = {
  name: "base64",
  summary: "koduj/dekoduj Base64",
  usage: "base64 [-d] [plik]",
  run: (ctx, io) => {
    const { flags, positionals } = parseArgs(io.argv, {});
    const decode = flags.has("d") || flags.has("decode");
    const { text, errs } = inputFrom(ctx, positionals, io.stdin);
    if (errs.length) return err(errs.join("\n"));
    try {
      const out = decode ? base64Decode(text) : base64Encode(text.replace(/\n$/, ""));
      return ok(out + (decode ? "" : "\n"));
    } catch {
      return err("base64: nieprawidłowe dane wejściowe");
    }
  },
};

const sha256sum: CommandSpec = {
  name: "sha256sum",
  summary: "oblicz skrót SHA-256",
  usage: "sha256sum [plik...]",
  run: (ctx, io) => {
    const { positionals } = parseArgs(io.argv);
    if (!positionals.length) {
      return ok(`${sha256(io.stdin)}  -\n`);
    }
    const out: string[] = [];
    const errs: string[] = [];
    for (const f of positionals) {
      try {
        const content = ctx.vfs.readFile(ctx.resolve(f), ctx.principal);
        out.push(`${sha256(content)}  ${f}`);
      } catch (e) {
        errs.push(`sha256sum: ${f}: ${(e as Error).message}`);
      }
    }
    return { stdout: out.join("\n") + (out.length ? "\n" : ""), stderr: errs.join("\n"), code: errs.length ? 1 : 0 };
  },
};

export const utilCommands: CommandSpec[] = [
  wc,
  sort,
  uniq,
  cut,
  sed,
  awk,
  tar,
  gzip,
  gunzip,
  base64Cmd,
  sha256sum,
];
