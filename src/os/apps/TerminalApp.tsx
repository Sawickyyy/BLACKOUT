"use client";

import { memo, useState } from "react";
import { ClipboardPaste, Copy, Eraser, Link2, Minus, Plus, ShieldCheck } from "lucide-react";
import Terminal from "@/components/Terminal";
import { focusTerminal, sendToTerminal, terminalSelection } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { OSBadge, OSIconButton } from "../ui";

// Memoised so window drags, focus changes and status updates never re-render
// (let alone rebuild) the xterm instance.
const StableTerminal = memo(Terminal);

function useSession() {
  const engine = useGame((s) => s.engine);
  useGame((s) => s.tick);
  if (!engine) return null;
  const host = engine.currentHost();
  const s = engine.player.session;
  const user = host.users.find((u) => u.uid === s.uid)?.name ?? String(s.uid);
  return { host, user, cwd: s.cwd, root: s.uid === 0, hops: s.stack.length };
}

/** Compact "user@host" for the desktop window title bar. */
export function TerminalSubtitle() {
  const s = useSession();
  if (!s) return null;
  return (
    <span className="font-mono">
      {s.user}@{s.host.hostname}
    </span>
  );
}

export default function TerminalApp({ mobile }: { mobile: boolean }) {
  const s = useSession();
  const lastExit = useGame((st) => st.lastExit);
  const fontSize = useGame((st) => st.engine?.player.settings.fontSize ?? 14);
  const applySettings = useGame((st) => st.applySettings);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = terminalSelection();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard denied */
    }
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) sendToTerminal(text.replace(/\r?\n/g, "\r"));
    } catch {
      /* clipboard denied — the native long-press paste still works */
    }
    focusTerminal();
  };

  return (
    <div className="flex h-full flex-col bg-[#0B1218]">
      <div className="flex shrink-0 items-center gap-2 border-b hairline px-3 py-1.5" role="toolbar" aria-label="Sesja terminala">
        {s && (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-2xs">
            {s.hops > 0 ? (
              <OSBadge tone="info">
                <Link2 size={11} aria-hidden /> SSH · {s.hops} {s.hops === 1 ? "przeskok" : "przeskoki"}
              </OSBadge>
            ) : (
              <OSBadge tone="ok">lokalnie</OSBadge>
            )}
            {s.root && (
              <OSBadge tone="danger">
                <ShieldCheck size={11} aria-hidden /> root
              </OSBadge>
            )}
            <span className="truncate font-mono text-text2" title={`${s.user}@${s.host.hostname}:${s.cwd}`}>
              {!mobile && (
                <>
                  <span className="text-fg">{s.user}</span>@{s.host.hostname} <span className="text-muted">({s.host.ip})</span>{" "}
                </>
              )}
              <span className="text-accent2">{s.cwd}</span>
            </span>
          </div>
        )}
        {lastExit && (
          <span
            className={`hidden shrink-0 font-mono text-2xs sm:inline ${lastExit.code === 0 ? "text-muted" : "text-danger"}`}
            title="Kod wyjścia ostatniego polecenia"
          >
            exit {lastExit.code}
          </span>
        )}
        <div className="flex shrink-0 items-center">
          <OSIconButton label="Zmniejsz czcionkę" size="sm" disabled={fontSize <= 10} onClick={() => applySettings({ fontSize: fontSize - 1 })}>
            <Minus size={14} />
          </OSIconButton>
          <OSIconButton label="Powiększ czcionkę" size="sm" disabled={fontSize >= 22} onClick={() => applySettings({ fontSize: fontSize + 1 })}>
            <Plus size={14} />
          </OSIconButton>
          {!mobile && (
            <OSIconButton label={copied ? "Skopiowano" : "Kopiuj zaznaczenie"} size="sm" onClick={copy}>
              <Copy size={14} />
            </OSIconButton>
          )}
          <OSIconButton label="Wklej do terminala" size="sm" onClick={paste}>
            <ClipboardPaste size={14} />
          </OSIconButton>
          <OSIconButton
            label="Wyczyść ekran (Ctrl+L)"
            size="sm"
            onClick={() => {
              // Ctrl+L: the line editor clears the screen and keeps the typed input.
              sendToTerminal("\x0c");
              focusTerminal();
            }}
          >
            <Eraser size={14} />
          </OSIconButton>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <StableTerminal />
      </div>
    </div>
  );
}
