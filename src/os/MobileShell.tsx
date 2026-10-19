"use client";

import { useEffect } from "react";
import { Bell, LayoutGrid } from "lucide-react";
import CommandToolbar from "@/components/CommandToolbar";
import { focusTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { APP_IDS, APPS, MOBILE_DOCK, type AppId } from "./apps";
import AppView from "./AppView";
import { useOS } from "./osStore";
import { NotificationCenter, OSToaster } from "./shell/Notifications";
import { AlarmMeter, Credits, SaveStatus } from "./shell/StatusWidgets";
import TerminalApp from "./apps/TerminalApp";
import { OSBottomSheet } from "./ui";
import { useVisualViewport } from "./viewport";

/** Phone BLACKNET OS: one full-screen app at a time, thumb-reachable dock. */
export default function MobileShell() {
  const { mobileApp, launcherOpen, notificationsOpen, set, setLauncher } = useOS();
  const { keyboardOpen } = useVisualViewport();
  const unread = useGame((s) => s.noteHistory.length);
  const app = APPS[mobileApp];
  const Icon = app.icon;

  useEffect(() => {
    setLauncher((id: AppId) => {
      set({ mobileApp: id, launcherOpen: false });
      if (id === "terminal") setTimeout(focusTerminal, 60);
    });
  }, [setLauncher, set]);

  const go = (id: AppId) => useOS.getState().launch(id);
  const inMore = !MOBILE_DOCK.includes(mobileApp);

  return (
    <div className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-bg" style={{ height: "var(--app-h)" }}>
      {/* Status bar sits below the notch / Dynamic Island. */}
      <header className="glass relative z-[60] shrink-0 rounded-none border-x-0 border-t-0 safe-top safe-x">
        <div className="flex h-12 items-center gap-2 px-3">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `rgb(${app.tint} / 0.16)`, color: `rgb(${app.tint})` }}
            aria-hidden
          >
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <h1 className="truncate text-[0.95rem] font-semibold tracking-tight text-fg">{app.title}</h1>
          <div className="ml-auto flex items-center">
            <AlarmMeter compact />
            <Credits />
            <SaveStatus showLabel={false} />
            <button
              onClick={() => set({ notificationsOpen: true })}
              aria-label={`Powiadomienia (${unread})`}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-text2 active:bg-white/[0.08]"
            >
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent" aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1" aria-label={app.title}>
        {/* Terminal stays mounted underneath so its session and buffer survive app switches. */}
        <div className={`absolute inset-0 ${mobileApp === "terminal" ? "" : "invisible"}`} aria-hidden={mobileApp !== "terminal"}>
          <TerminalApp mobile />
        </div>
        {mobileApp !== "terminal" && (
          <div key={mobileApp} className="absolute inset-0 overflow-hidden bg-bg animate-os-up safe-x">
            <AppView id={mobileApp as Exclude<AppId, "terminal">} mobile />
          </div>
        )}
      </main>

      {mobileApp === "terminal" && <CommandToolbar />}

      {!keyboardOpen && (
        <nav aria-label="Aplikacje" className="glass shrink-0 rounded-none border-x-0 border-b-0 safe-bottom safe-x">
          <ul className="flex h-[58px] items-stretch px-1">
            {[...MOBILE_DOCK, "more" as const].map((id) => {
              const isMore = id === "more";
              const meta = isMore ? null : APPS[id];
              const DockIcon = isMore ? LayoutGrid : meta!.icon;
              const active = isMore ? inMore : mobileApp === id;
              return (
                <li key={id} className="flex flex-1">
                  <button
                    onClick={() => (isMore ? set({ launcherOpen: true }) : go(id))}
                    aria-label={isMore ? "Wszystkie aplikacje" : meta!.title}
                    aria-current={active && !isMore ? "page" : undefined}
                    data-dock={id}
                    className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] font-medium transition-colors duration-fast active:bg-white/[0.06] ${
                      active ? "text-accent" : "text-text2"
                    }`}
                  >
                    <DockIcon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                    {isMore ? "Więcej" : meta!.short}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <OSBottomSheet open={launcherOpen} onClose={() => set({ launcherOpen: false })} title="Aplikacje">
        <ul className="grid grid-cols-3 gap-3 pb-2">
          {APP_IDS.map((id) => {
            const A = APPS[id];
            const AI = A.icon;
            return (
              <li key={id}>
                <button
                  onClick={() => go(id)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl p-3 text-center active:bg-white/[0.06]"
                >
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-[18px]"
                    style={{
                      background: `linear-gradient(160deg, rgb(${A.tint} / 0.24), rgb(${A.tint} / 0.08))`,
                      boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px rgb(${A.tint} / 0.2)`,
                      color: `rgb(${A.tint})`,
                    }}
                    aria-hidden
                  >
                    <AI size={24} strokeWidth={1.9} />
                  </span>
                  <span className="text-xs font-medium text-fg">{A.short}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </OSBottomSheet>

      <OSToaster mobile />
      <NotificationCenter open={notificationsOpen} onClose={() => set({ notificationsOpen: false })} mobile />
    </div>
  );
}
