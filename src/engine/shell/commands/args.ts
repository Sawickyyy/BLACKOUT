// Minimal getopt-style flag parsing shared by commands. Handles combined
// short flags (-la), long flags (--help), "--" terminator, and optional
// value-taking flags.

export interface ParsedArgs {
  /** Set of short/long flags present (without leading dashes). */
  flags: Set<string>;
  /** Values for flags that take an argument, keyed by flag name. */
  values: Record<string, string>;
  /** Positional (non-flag) arguments. */
  positionals: string[];
}

export function parseArgs(
  argv: string[],
  opts: { valueFlags?: string[]; longValueFlags?: string[] } = {},
): ParsedArgs {
  const valueFlags = new Set(opts.valueFlags ?? []);
  const longValueFlags = new Set(opts.longValueFlags ?? []);
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positionals: string[] = [];

  let i = 0;
  let noMoreFlags = false;
  while (i < argv.length) {
    const a = argv[i]!;
    if (noMoreFlags || a === "-" || !a.startsWith("-")) {
      positionals.push(a);
      i++;
      continue;
    }
    if (a === "--") {
      noMoreFlags = true;
      i++;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        const name = a.slice(2, eq);
        values[name] = a.slice(eq + 1);
        flags.add(name);
      } else {
        const name = a.slice(2);
        if (longValueFlags.has(name) && i + 1 < argv.length) {
          values[name] = argv[++i]!;
        }
        flags.add(name);
      }
      i++;
      continue;
    }
    // short flags, possibly combined
    const chars = a.slice(1);
    for (let k = 0; k < chars.length; k++) {
      const ch = chars[k]!;
      if (valueFlags.has(ch)) {
        const rest = chars.slice(k + 1);
        if (rest) {
          values[ch] = rest;
        } else if (i + 1 < argv.length) {
          values[ch] = argv[++i]!;
        }
        flags.add(ch);
        break;
      }
      flags.add(ch);
    }
    i++;
  }

  return { flags, values, positionals };
}
