"use client";

import { useState } from "react";
import Terminal from "./Terminal";
import StatusBar from "./StatusBar";
import Notifications from "./Notifications";
import ThemeEffect from "./ThemeEffect";
import CommandToolbar from "./CommandToolbar";
import MissionsPanel from "./panels/MissionsPanel";
import WalletPanel from "./panels/WalletPanel";
import HostsPanel from "./panels/HostsPanel";
import FilesPanel from "./panels/FilesPanel";
import BrowserPanel from "./panels/BrowserPanel";
import SettingsPanel from "./panels/SettingsPanel";
import { focusTerminal } from "./terminalBridge";
import { useGame } from "@/store/gameStore";

type View = "terminal" | "missions" | "wallet" | "net" | "files" | "browser" | "settings";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: ">_" },
  { id: "missions", label: "Zlecenia", icon: "◈" },
  { id: "wallet", label: "Portfel", icon: "₿" },
  { id: "net", label: "Sieć", icon: "⇄" },
  { id: "files", label: "Pliki", icon: "▤" },
  { id: "browser", label: "WWW", icon: "◐" },
  { id: "settings", label: "Ustaw.", icon: "⚙" },
];

function Panel({ view }: { view: View }) {
  switch (view) {
    case "missions":
      return <MissionsPanel />;
    case "wallet":
      return <WalletPanel />;
    case "net":
      return <HostsPanel />;
    case "files":
      return <FilesPanel />;
    case "browser":
      return <BrowserPanel />;
    case "settings":
      return <SettingsPanel />;
    default:
      return null;
  }
}

export default function GameShell() {
  const [view, setView] = useState<View>("terminal");
  const [deskTab, setDeskTab] = useState<View>("missions");
  const suspended = useGame((s) => s.saveStatus?.state === "suspended");
  const suspendedReason = useGame((s) => s.saveStatus?.suspendedReason);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg">
      <ThemeEffect />
      <div className="safe-t" />
      <StatusBar />
      <Notifications />

      {suspended && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-6 backdrop-blur-sm"
          data-testid="tab-takeover"
        >
          <div className="surface max-w-sm rounded-lg p-5 text-center text-sm">
            <p className="mb-2 font-bold text-accent">Sesja wstrzymana</p>
            <p className="mb-4 text-xs text-muted">
              {suspendedReason} Twój postęp został zapisany. Ta karta nie zapisuje już zmian, żeby nie nadpisać
              gry w drugiej karcie.
            </p>
            <button className="btn btn-primary w-full" onClick={() => window.location.reload()}>
              Graj tutaj
            </button>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Terminal — always mounted to preserve xterm state. */}
        <div className={`relative min-h-0 flex-1 ${view !== "terminal" ? "hidden md:block" : "block"}`}>
          <Terminal />
        </div>

        {/* Desktop sidebar with its own tab bar. */}
        <aside className="hidden w-[380px] flex-col border-l border-line bg-bg md:flex">
          <div className="flex shrink-0 overflow-x-auto border-b border-line">
            {NAV.filter((n) => n.id !== "terminal").map((n) => (
              <button
                key={n.id}
                className={`flex-1 whitespace-nowrap px-2 py-2 text-[11px] ${
                  deskTab === n.id ? "bg-panel text-accent" : "text-muted"
                }`}
                onClick={() => setDeskTab(n.id)}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <Panel view={deskTab} />
          </div>
        </aside>

        {/* Mobile full-screen panel overlay (terminal stays mounted behind). */}
        {view !== "terminal" && (
          <div className="absolute inset-0 z-10 overflow-auto bg-bg md:hidden">
            <Panel view={view} />
          </div>
        )}
      </div>

      {/* Mobile command toolbar — only over the terminal. */}
      {view === "terminal" && <CommandToolbar />}

      {/* Mobile bottom navigation. */}
      <nav className="flex shrink-0 border-t border-line bg-panel safe-b md:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] ${
              view === n.id ? "text-accent" : "text-muted"
            }`}
            onClick={() => {
              setView(n.id);
              if (n.id === "terminal") setTimeout(focusTerminal, 50);
            }}
          >
            <span className="text-sm leading-none">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
