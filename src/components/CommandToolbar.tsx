"use client";

import { focusTerminal, sendToTerminal } from "./terminalBridge";

// Touch-friendly key bar for mobile: keys an on-screen keyboard lacks
// (Tab, Ctrl-C, arrows) plus common shell tokens and quick commands.
const KEYS: { label: string; seq: string; wide?: boolean }[] = [
  { label: "Tab", seq: "\t" },
  { label: "Ctrl-C", seq: "\x03" },
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "←", seq: "\x1b[D" },
  { label: "→", seq: "\x1b[C" },
  { label: "|", seq: "|" },
  { label: "/", seq: "/" },
  { label: "-", seq: "-" },
  { label: "~", seq: "~" },
  { label: "sudo", seq: "sudo " },
  { label: "ls", seq: "ls -la " },
  { label: "cat", seq: "cat " },
  { label: "clear", seq: "clear\r" },
];

export default function CommandToolbar() {
  return (
    <div className="flex gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-1.5 md:hidden">
      {KEYS.map((k) => (
        <button
          key={k.label}
          className="shrink-0 rounded border border-line bg-panel2 px-3 py-1.5 text-xs text-fg active:bg-accent/20"
          onClick={() => {
            sendToTerminal(k.seq);
            focusTerminal();
          }}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
