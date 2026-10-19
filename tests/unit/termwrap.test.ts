import { describe, expect, it } from "vitest";
import { visibleWidth, wrapLine, wrapText } from "@/components/termWrap";

describe("terminal word-wrap (narrow iPhone screens)", () => {
  it("ignores ANSI colour codes when measuring width", () => {
    expect(visibleWidth("\x1b[1;32mabc\x1b[0m")).toBe(3);
  });

  it("leaves short lines untouched", () => {
    expect(wrapLine("ls -la", 40)).toBe("ls -la");
  });

  it("breaks between words, never mid-word, and fits the width", () => {
    const line = "Kilka prób nie wyszło. Wpisz hint po wskazówkę do aktywnego zlecenia albo tutorial po mini-kurs.";
    const out = wrapLine(line, 40).split("\n");
    for (const l of out) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
    // Every original word survives intact on some line.
    for (const w of line.split(" ")) expect(out.some((l) => l.split(" ").includes(w))).toBe(true);
  });

  it("keeps the indentation on continuation lines", () => {
    const out = wrapLine("    aaaa bbbb cccc dddd eeee ffff gggg", 20).split("\n");
    expect(out.length).toBeGreaterThan(1);
    for (const l of out.slice(1)) expect(l.startsWith("    ")).toBe(true);
  });

  it("hard-splits a token longer than the line", () => {
    const token = "x".repeat(50);
    const out = wrapLine(token, 20).split("\n");
    expect(out.join("")).toBe(token);
    for (const l of out) expect(l.length).toBeLessThanOrEqual(20);
  });

  it("wraps coloured text without breaking escape sequences", () => {
    const out = wrapText("\x1b[31m" + "słowo ".repeat(12) + "\x1b[0m", 20);
    for (const l of out.split("\n")) expect(visibleWidth(l)).toBeLessThanOrEqual(20);
    expect(out).toContain("\x1b[31m");
    expect(out).toContain("\x1b[0m");
  });
});

describe("aligned comments on narrow screens", () => {
  it("collapses alignment padding instead of stranding a lone #", () => {
    const out = wrapLine("  cat /etc/passwd | grep root        # tylko wiersze z 'root'", 40).split("\n");
    expect(out.some((l) => l.trimEnd().endsWith("#"))).toBe(false);
    for (const l of out) expect(visibleWidth(l)).toBeLessThanOrEqual(40);
  });
});
