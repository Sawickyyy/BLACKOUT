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

const THEMES: Record<string, Record<string, string>> = {
  green: { background: "#060907", foreground: "#cbf0d5", cursor: "#36f38a", green: "#36f38a", red: "#ff5660" },
  amber: { background: "#0a0805", foreground: "#f0dcb4", cursor: "#ffb000", green: "#ffb000", red: "#ff7a3c" },
  blue: { background: "#05080c", foreground: "#c8dcf5", cursor: "#56aaff", green: "#56aaff", red: "#ff6472" },
};

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

    const writePrompt = () => {
      prompt = engine.prompt();
      term!.write("\x1b[1m\x1b[38;5;120m" + prompt + "\x1b[0m");
    };

    const refreshLine = () => {
      term!.write("\r\x1b[K");
      term!.write("\x1b[1m\x1b[38;5;120m" + prompt + "\x1b[0m" + input);
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
      if (disposed) return;
      const palette = THEMES[theme] ?? THEMES.green!;
      term = new xterm.Terminal({
        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
        fontSize,
        cursorBlink: true,
        convertEol: true,
        scrollback: 2000,
        theme: {
          background: palette.background,
          foreground: palette.foreground,
          cursor: palette.cursor,
          selectionBackground: "rgba(54,243,138,0.3)",
        },
      });
      fit = new fitMod.FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current!);
      try {
        fit.fit();
      } catch {
        /* layout not ready */
      }
      term.writeln("\x1b[1m\x1b[38;5;120m██ BLACKNET ██\x1b[0m  terminal operatora");
      term.writeln("Wpisz \x1b[1mhelp\x1b[0m aby zobaczyć polecenia, \x1b[1mmissions\x1b[0m aby zacząć.");
      term.writeln("");
      writePrompt();
      term.onData(onData);
      term.focus();

      cleanupBridge = registerTerminal({ onInput: onData, focus: () => term?.focus() });

      ro = new ResizeObserver(() => {
        try {
          fit?.fit();
        } catch {
          /* ignore */
        }
      });
      ro.observe(containerRef.current!);
    })();

    const onViewport = () => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    };
    window.visualViewport?.addEventListener("resize", onViewport);

    return () => {
      disposed = true;
      window.visualViewport?.removeEventListener("resize", onViewport);
      ro?.disconnect();
      cleanupBridge?.();
      term?.dispose();
    };
    // Re-create the terminal when theme/font changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, theme, fontSize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      onClick={() => {
        // Tap-to-focus brings up the iOS keyboard.
        const ta = containerRef.current?.querySelector("textarea");
        (ta as HTMLTextAreaElement | null)?.focus();
      }}
    />
  );
}
