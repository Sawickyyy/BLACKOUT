// Parses a token stream into an executable program tree:
//   program := andor (";" andor)*
//   andor   := pipeline (("&&" | "||") pipeline)*
//   pipeline := command ("|" command)*
//   command := word+ with interleaved redirections

import type { OpValue, Token } from "./tokenize";

export interface Redir {
  fd: 0 | 1 | 2 | "both";
  mode: "read" | "write" | "append";
  target: string;
}

export interface SimpleCommand {
  argv: string[];
  redirs: Redir[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface AndOrItem {
  /** Operator that precedes this pipeline (undefined for the first). */
  op?: "&&" | "||";
  pipeline: Pipeline;
}

export interface AndOr {
  items: AndOrItem[];
}

export type Program = AndOr[];

export class ParseError extends Error {}

const REDIR_OPS: OpValue[] = [">", ">>", "<", "2>", "2>>", "&>"];

export function parse(tokens: Token[]): Program {
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];

  function parseCommand(): SimpleCommand {
    const argv: string[] = [];
    const redirs: Redir[] = [];
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.type === "op") {
        if (REDIR_OPS.includes(t.value)) {
          next();
          const tgt = next();
          if (!tgt || tgt.type !== "word") {
            throw new ParseError("błąd składni przy przekierowaniu: brak celu");
          }
          redirs.push(toRedir(t.value, tgt.value));
          continue;
        }
        break; // ; | || && stop the command
      }
      argv.push(t.value);
      next();
    }
    if (argv.length === 0 && redirs.length === 0) {
      throw new ParseError("błąd składni: pusta komenda");
    }
    return { argv, redirs };
  }

  function parsePipeline(): Pipeline {
    const commands: SimpleCommand[] = [parseCommand()];
    while (peek()?.type === "op" && (peek() as { value: OpValue }).value === "|") {
      next();
      commands.push(parseCommand());
    }
    return { commands };
  }

  function parseAndOr(): AndOr {
    const items: AndOrItem[] = [{ pipeline: parsePipeline() }];
    for (;;) {
      const t = peek();
      if (t?.type === "op" && (t.value === "&&" || t.value === "||")) {
        next();
        items.push({ op: t.value, pipeline: parsePipeline() });
      } else break;
    }
    return { items };
  }

  const program: Program = [];
  // skip leading separators
  while (peek()?.type === "op" && (peek() as { value: OpValue }).value === ";") next();
  if (!peek()) return program;

  program.push(parseAndOr());
  while (peek()?.type === "op" && (peek() as { value: OpValue }).value === ";") {
    next();
    if (!peek()) break;
    program.push(parseAndOr());
  }
  return program;
}

function toRedir(op: OpValue, target: string): Redir {
  switch (op) {
    case ">":
      return { fd: 1, mode: "write", target };
    case ">>":
      return { fd: 1, mode: "append", target };
    case "<":
      return { fd: 0, mode: "read", target };
    case "2>":
      return { fd: 2, mode: "write", target };
    case "2>>":
      return { fd: 2, mode: "append", target };
    case "&>":
      return { fd: "both", mode: "write", target };
    default:
      throw new ParseError("nieznane przekierowanie");
  }
}
