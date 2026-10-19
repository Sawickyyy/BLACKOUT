// Text layout helpers for the xterm terminal: visible width of strings that
// carry ANSI colour codes, and word-wrapping output to the terminal width so a
// narrow phone screen breaks lines between words rather than mid-word.

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/y;

/** Display width of one code point (astral-plane glyphs such as emoji take two cells). */
function cellWidth(ch: string): number {
  return ch.codePointAt(0)! > 0xffff ? 2 : 1;
}

/** Visible width of a string, ignoring ANSI escape sequences. */
export function visibleWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; ) {
    ANSI.lastIndex = i;
    const m = ANSI.exec(s);
    if (m) {
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    w += cellWidth(ch);
    i += ch.length;
  }
  return w;
}

/** Split off the first `n` visible cells of `s`, keeping escape sequences intact. */
function splitVisible(s: string, n: number): [string, string] {
  let w = 0;
  let i = 0;
  while (i < s.length) {
    ANSI.lastIndex = i;
    const m = ANSI.exec(s);
    if (m) {
      i += m[0].length;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i)!);
    if (w + cellWidth(ch) > n) break;
    w += cellWidth(ch);
    i += ch.length;
  }
  return [s.slice(0, i), s.slice(i)];
}

/**
 * Word-wrap one line to `cols` cells so narrow screens (iPhone ≈ 40 columns)
 * break between words instead of mid-word. Continuation lines keep the
 * line's indentation; tokens longer than a whole line are split hard.
 */
export function wrapLine(line: string, cols: number): string {
  if (cols < 12 || visibleWidth(line) <= cols) return line;
  // Column alignment (padding before a "# comment") is lost once the line
  // breaks anyway, so collapse inner runs of spaces instead of stranding a
  // lone "#" at the end of a row.
  line = line.replace(/(\S) {2,}/g, "$1 ");
  if (visibleWidth(line) <= cols) return line;
  const lead = /^ */.exec(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""))![0].length;
  const indent = " ".repeat(Math.min(lead, Math.floor(cols / 3)));
  const out: string[] = [];
  let cur = "";
  let curW = 0;
  const flush = () => {
    out.push(cur.replace(/ +((?:\x1b\[[0-9;?]*[A-Za-z])*)$/, "$1"));
    cur = indent;
    curW = indent.length;
  };
  for (const part of line.split(/( +)/)) {
    if (!part) continue;
    const w = visibleWidth(part);
    if (/^ +$/.test(part)) {
      if (curW + w <= cols) {
        cur += part;
        curW += w;
      } else if (curW > indent.length) {
        flush();
      }
      continue;
    }
    if (curW + w <= cols) {
      cur += part;
      curW += w;
      continue;
    }
    if (curW > indent.length) flush();
    let word = part;
    while (curW + visibleWidth(word) > cols) {
      const [head, rest] = splitVisible(word, cols - curW);
      if (!head) break;
      cur += head;
      flush();
      word = rest;
    }
    cur += word;
    curW += visibleWidth(word);
  }
  if (visibleWidth(cur) > indent.length || out.length === 0) out.push(cur);
  return out.join("\n");
}

export function wrapText(text: string, cols: number): string {
  return text
    .split("\n")
    .map((l) => wrapLine(l, cols))
    .join("\n");
}
