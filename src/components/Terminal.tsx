"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useGame } from "@/store/gameStore";
import { registerTerminal } from "./terminalBridge";

// xterm-based terminal with a full line editor: history, cursor movement,
// tab-completion, Ctrl-C / Ctrl-L, and paste. The engine runs synchronously
// so output is immediate. Loaded dynamically to stay client-only.

type XTermMod = typeof import("@xterm/xterm");
type FitMod = typeof import("@xterm/addon-fit");

// xterm palettes derived from the BLACKNET OS tokens. ANSI green/blue carry
// the theme accents, so the coloured prompt follows the selected theme.
type XTheme = import("@xterm/xterm").ITheme;
const BASE: XTheme = {
  background: "#0B1218",
  foreground: "#DCE8E5",
  cursorAccent: "#0B1218",
  selectionBackground: "rgba(90,184,255,0.28)",
  black: "#17212B",
  red: "#FF6478",
  yellow: "#FFBD59",
  magenta: "#C792EA",
  white: "#C9D6D8",
  brightBlack: "#647780",
  brightRed: "#FF8A9A",
  brightYellow: "#FFD08A",
  brightMagenta: "#D9B2F2",
  brightWhite: "#F2F8F6",
};
const THEMES: Record<string, XTheme> = {
  green: { ...BASE, cursor: "#35E6A5", green: "#35E6A5", brightGreen: "#6FF0C0", blue: "#5AB8FF", brightBlue: "#8CCFFF", cyan: "#5AB8FF", brightCyan: "#8CCFFF" },
  amber: { ...BASE, cursor: "#FFB547", green: "#FFB547", brightGreen: "#FFCB7A", blue: "#FF8A5C", brightBlue: "#FFAA85", cyan: "#FF8A5C", brightCyan: "#FFAA85" },
  blue: { ...BASE, cursor: "#5AB8FF", green: "#5AB8FF", brightGreen: "#8CCFFF", blue: "#35E6A5", brightBlue: "#6FF0C0", cyan: "#35E6A5", brightCyan: "#6FF0C0" },
};

/** Colour a plain prompt "user@host:cwd$ " — identity in accent, path in accent2, root sigil red. */
function colorPrompt(prompt: string): string {
  const m = /^([^@]+@[^:]+):(.*)([#$]) $/.exec(prompt);
  if (!m) return "\x1b[1;32m" + prompt + "\x1b[0m";
  const [, who, path, sigil] = m;
  const sig = sigil === "#" ? "\x1b[1;31m#" : "\x1b[0;37m$";
  return `\x1b[1;32m${who}\x1b[0;90m:\x1b[1;34m${path}${sig}\x1b[0m `;
}

function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let prefix = strs[0]!;
  for (const s of strs) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

export default function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const run = useGame((s) => s.run);
  const complete = useGame((s) => s.complete);
  const engine = useGame((s) => s.engine);
  const theme = useGame((s) => s.engine?.player.settings.theme ?? "green");
  const fontSize = useGame((s) => s.engine?.player.settings.fontSize ?? 14);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const refitRef = useRef<() => void>(() => undefined);
  // Read the latest look at creation time without making it an effect dependency.
  const look = useRef({ theme, fontSize });
  look.current = { theme, fontSize };

  // Theme / font changes are applied live — the terminal (and its scrollback)
  // is never rebuilt for presentation changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = THEMES[theme] ?? THEMES.green!;
    term.options.fontSize = fontSize;
    refitRef.current();
  }, [theme, fontSize]);

  useEffect(() => {
    if (!containerRef.current || !engine) return;
    let disposed = false;
    let term: import("@xterm/xterm").Terminal | null = null;
    let fit: import("@xterm/addon-fit").FitAddon | null = null;
    let cleanupBridge: (() => void) | null = null;
    let ro: ResizeObserver | null = null;

    // editor state
    let input = "";
    let cursor = 0;
    let historyIdx = engine.player.terminalHistory.length;
    let savedDraft = "";
    let prompt = engine.prompt();

    const normalize = (s: string) => s.replace(/\n/g, "\r\n");

    // Fit to the container and expose the width to the shell as $COLUMNS,
    // like a real terminal, so commands can lay out output for phones.
    const refit = () => {
      try {
        fit?.fit();
      } catch {
        /* layout not ready */
      }
      if (term) engine.player.session.env.COLUMNS = String(term.cols);
    };

    const writePrompt = () => {
      prompt = engine.prompt();
      term!.write(colorPrompt(prompt));
    };

    const refreshLine = () => {
      term!.write("\r\x1b[K");
      term!.write(colorPrompt(prompt) + input);
      const back = input.length - cursor;
      if (back > 0) term!.write(`\x1b[${back}D`);
    };

    const printOutput = (res: { stdout: string; stderr: string } | null) => {
      if (!res) return;
      if (res.stdout) term!.write(normalize(res.stdout));
      if (res.stderr) term!.write("\x1b[31m" + normalize(res.stderr) + "\x1b[0m");
      const combined = (res.stdout || "") + (res.stderr || "");
      if (combined && !combined.endsWith("\n")) term!.write("\r\n");
    };

    const commit = () => {
      term!.write("\r\n");
      const line = input;
      input = "";
      cursor = 0;
      if (line.trim() === "") {
        historyIdx = engine.player.terminalHistory.length;
        writePrompt();
        return;
      }
      const res = run(line);
      historyIdx = engine.player.terminalHistory.length;
      printOutput(res);
      writePrompt();
    };

    const backspace = () => {
      if (cursor === 0) return;
      input = input.slice(0, cursor - 1) + input.slice(cursor);
      cursor--;
      refreshLine();
    };

    const insert = (ch: string) => {
      input = input.slice(0, cursor) + ch + input.slice(cursor);
      cursor += ch.length;
      refreshLine();
    };

    const historyPrev = () => {
      const h = engine.player.terminalHistory;
      if (historyIdx === h.length) savedDraft = input;
      if (historyIdx > 0) {
        historyIdx--;
        input = h[historyIdx] ?? "";
        cursor = input.length;
        refreshLine();
      }
    };

    const historyNext = () => {
      const h = engine.player.terminalHistory;
      if (historyIdx < h.length) {
        historyIdx++;
        input = historyIdx === h.length ? savedDraft : h[historyIdx] ?? "";
        cursor = input.length;
        refreshLine();
      }
    };

    const doComplete = () => {
      const cands = complete(input);
      if (!cands.length) return;
      const parts = input.split(" ");
      const frag = parts[parts.length - 1] ?? "";
      const common = cands.length === 1 ? cands[0]! : longestCommonPrefix(cands);
      if (common && common.length >= frag.length) {
        parts[parts.length - 1] = common;
        input = parts.join(" ");
        if (cands.length === 1) input += " ";
        cursor = input.length;
      }
      if (cands.length > 1) {
        term!.write("\r\n" + cands.join("  ") + "\r\n");
      }
      refreshLine();
    };

    const handleChar = (ch: string) => {
      if (ch === "\r" || ch === "\n") return commit();
      if (ch === "\x7f" || ch === "\b") return backspace();
      if (ch === "\x03") {
        term!.write("^C\r\n");
        input = "";
        cursor = 0;
        writePrompt();
        return;
      }
      if (ch === "\x0c") {
        term!.write("\x1b[2J\x1b[H");
        writePrompt();
        refreshLine();
        return;
      }
      if (ch === "\x01") {
        cursor = 0;
        refreshLine();
        return;
      }
      if (ch === "\x05") {
        cursor = input.length;
        refreshLine();
        return;
      }
      if (ch < " ") return; // ignore other control chars
      insert(ch);
    };

    const onData = (data: string) => {
      // recognized multi-byte escape sequences
      switch (data) {
        case "\x1b[A":
          return historyPrev();
        case "\x1b[B":
          return historyNext();
        case "\x1b[C":
          if (cursor < input.length) {
            cursor++;
            term!.write("\x1b[C");
          }
          return;
        case "\x1b[D":
          if (cursor > 0) {
            cursor--;
            term!.write("\x1b[D");
          }
          return;
        case "\x1b[H":
          cursor = 0;
          return refreshLine();
        case "\x1b[F":
          cursor = input.length;
          return refreshLine();
        case "\t":
          return doComplete();
      }
      if (data.startsWith("\x1b")) return; // ignore other escapes
      for (const ch of data) handleChar(ch);
    };

    (async () => {
      const xterm: XTermMod = await import("@xterm/xterm");
      const fitMod: FitMod = await import("@xterm/addon-fit");
      // xterm measures glyphs once at open — wait for the real font first.
      await document.fonts?.load(`${look.current.fontSize}px "JetBrains Mono"`).catch(() => undefined);
      if (disposed) return;
      term = new xterm.Terminal({
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize: look.current.fontSize,
        lineHeight: 1.22,
        cursorBlink: true,
        cursorStyle: "bar",
        cursorWidth: 2,
        convertEol: true,
        scrollback: 4000,
        theme: THEMES[look.current.theme] ?? THEMES.green!,
      });
      fit = new fitMod.FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current!);
      termRef.current = term;
      refitRef.current = refit;
      refit();
      term.writeln("\x1b[1;32mBLACKNET OS\x1b[0m \x1b[90m· terminal operatora · sieć fikcyjna, odizolowana\x1b[0m");
      term.writeln("\x1b[90mWpisz\x1b[0m help \x1b[90maby zobaczyć polecenia,\x1b[0m missions \x1b[90maby zacząć.\x1b[0m");
      term.writeln("");
      writePrompt();
      term.onData(onData);
      term.focus();

      cleanupBridge = registerTerminal({
        onInput: onData,
        focus: () => term?.focus(),
        getSelection: () => term?.getSelection() ?? "",
      });

      ro = new ResizeObserver(refit);
      ro.observe(containerRef.current!);
    })();

    const onViewport = refit;
    window.visualViewport?.addEventListener("resize", onViewport);

    return () => {
      disposed = true;
      window.visualViewport?.removeEventListener("resize", onViewport);
      ro?.disconnect();
      cleanupBridge?.();
      termRef.current = null;
      term?.dispose();
    };
    // Rebuilt only when a different game is loaded (restore/import/new game).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return (
    <div
      ref={containerRef}
      className="terminal-host relative h-full w-full overflow-hidden"
      data-testid="terminal"
      onClick={() => {
        // Tap-to-focus brings up the iOS keyboard.
        const ta = containerRef.current?.querySelector("textarea");
        (ta as HTMLTextAreaElement | null)?.focus();
      }}
    />
  );
}
