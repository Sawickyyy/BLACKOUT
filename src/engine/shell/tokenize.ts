// Shell tokenizer. Splits a command line into words and operators, honoring
// single quotes (literal), double quotes (variable expansion allowed),
// backslash escapes, and variable expansion ($VAR, ${VAR}, $?).
//
// Supported operators: ; | || && > >> < 2> 2>> &>
// Not supported (documented): command substitution $(...), backticks,
// process substitution, globbing (expanded separately by the executor),
// here-docs.

export type Token =
  | { type: "word"; value: string }
  | { type: "op"; value: OpValue };

export type OpValue = ";" | "|" | "||" | "&&" | ">" | ">>" | "<" | "2>" | "2>>" | "&>";

export interface ExpandCtx {
  env: Record<string, string>;
  lastExit: number;
}

const OPERATOR_CHARS = new Set([";", "|", "&", ">", "<"]);

function expandVar(name: string, ctx: ExpandCtx): string {
  if (name === "?") return String(ctx.lastExit);
  if (name === "$") return "0"; // fake pid
  return ctx.env[name] ?? "";
}

/** Read a $VAR or ${VAR} starting at index i (i points at '$'). */
function readVar(src: string, i: number, ctx: ExpandCtx): { text: string; next: number } {
  let j = i + 1;
  if (src[j] === "{") {
    const end = src.indexOf("}", j);
    if (end === -1) return { text: "$", next: i + 1 };
    const name = src.slice(j + 1, end);
    return { text: expandVar(name, ctx), next: end + 1 };
  }
  if (src[j] === "?" || src[j] === "$") {
    return { text: expandVar(src[j]!, ctx), next: j + 1 };
  }
  let name = "";
  while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) {
    name += src[j];
    j++;
  }
  if (name === "") return { text: "$", next: i + 1 };
  return { text: expandVar(name, ctx), next: j };
}

export function tokenize(line: string, ctx: ExpandCtx): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;

  // current word accumulation
  let word = "";
  let hasWord = false; // whether we've started a word (so "" is a valid empty arg)

  const pushWord = () => {
    if (hasWord) {
      tokens.push({ type: "word", value: word });
      word = "";
      hasWord = false;
    }
  };

  while (i < n) {
    const c = line[i]!;

    // whitespace separates words
    if (c === " " || c === "\t") {
      pushWord();
      i++;
      continue;
    }

    // file-descriptor redirection (e.g. 2> 2>> 1>) — the fd digit only counts
    // when it starts a fresh token, matching shell semantics ("x2>f" is a word).
    if (!hasWord && (c === "0" || c === "1" || c === "2") && line[i + 1] === ">") {
      const append = line[i + 2] === ">";
      if (c === "2") {
        tokens.push({ type: "op", value: append ? "2>>" : "2>" });
      } else {
        tokens.push({ type: "op", value: append ? ">>" : ">" });
      }
      i += append ? 3 : 2;
      continue;
    }

    // operators
    if (OPERATOR_CHARS.has(c)) {
      pushWord();
      // multi-char operators
      const two = line.slice(i, i + 2);
      if (two === "||") {
        tokens.push({ type: "op", value: "||" });
        i += 2;
        continue;
      }
      if (two === "&&") {
        tokens.push({ type: "op", value: "&&" });
        i += 2;
        continue;
      }
      if (two === ">>") {
        tokens.push({ type: "op", value: ">>" });
        i += 2;
        continue;
      }
      if (two === "2>") {
        if (line[i + 2] === ">") {
          tokens.push({ type: "op", value: "2>>" });
          i += 3;
        } else {
          tokens.push({ type: "op", value: "2>" });
          i += 2;
        }
        continue;
      }
      if (two === "&>") {
        tokens.push({ type: "op", value: "&>" });
        i += 2;
        continue;
      }
      if (c === "|") {
        tokens.push({ type: "op", value: "|" });
        i++;
        continue;
      }
      if (c === ";") {
        tokens.push({ type: "op", value: ";" });
        i++;
        continue;
      }
      if (c === ">") {
        tokens.push({ type: "op", value: ">" });
        i++;
        continue;
      }
      if (c === "<") {
        tokens.push({ type: "op", value: "<" });
        i++;
        continue;
      }
      // a lone '&' is treated as a literal within a word in this sim
      word += c;
      hasWord = true;
      i++;
      continue;
    }

    // single quote: literal run
    if (c === "'") {
      hasWord = true;
      i++;
      while (i < n && line[i] !== "'") {
        word += line[i];
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // double quote: expansion allowed
    if (c === '"') {
      hasWord = true;
      i++;
      while (i < n && line[i] !== '"') {
        if (line[i] === "\\" && (line[i + 1] === '"' || line[i + 1] === "$" || line[i + 1] === "\\")) {
          word += line[i + 1];
          i += 2;
          continue;
        }
        if (line[i] === "$") {
          const r = readVar(line, i, ctx);
          word += r.text;
          i = r.next;
          continue;
        }
        word += line[i];
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // backslash escape outside quotes
    if (c === "\\") {
      if (i + 1 < n) {
        word += line[i + 1];
        hasWord = true;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    // variable expansion outside quotes
    if (c === "$") {
      const r = readVar(line, i, ctx);
      word += r.text;
      hasWord = true;
      i = r.next;
      continue;
    }

    word += c;
    hasWord = true;
    i++;
  }
  pushWord();
  return tokens;
}
