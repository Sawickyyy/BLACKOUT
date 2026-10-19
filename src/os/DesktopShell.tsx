"use client";

import { useEffect, useRef } from "react";
import { LayoutGrid, Search, Settings2, SquareTerminal } from "lucide-react";
import { focusTerminal } from "@/components/terminalBridge";
import { APP_IDS, type AppId } from "./apps";
import AppView from "./AppView";
import OSWindow from "./OSWindow";
import { useOS } from "./osStore";
import { usePrefs } from "./prefs";
import Dock from "./shell/Dock";
import { NotificationCenter, OSToaster } from "./shell/Notifications";
import TopBar from "./shell/TopBar";
import TerminalApp, { TerminalSubtitle } from "./apps/TerminalApp";
import { OSContextMenu, useContextMenu } from "./ui";
import { useWM } from "./wm";

const DOCK_SPACE = 88;

/** Desktop BLACKNET OS: wallpaper, top bar, floating windows, dock. */
export default function DesktopShell() {
  const area = useRef<HTMLDivElement>(null);
  const hydrated = useWM((s) => s.hydrated);
  const wins = useWM((s) => s.wins);
  const { hydrate, setBounds, open, arrange } = useWM.getState();
  const { notificationsOpen, set, setLauncher } = useOS();
  const ambient = usePrefs((s) => s.ambient);
  const menu = useContextMenu();

  // The shell decides what "launch an app" means: here, open/focus its window.
  useEffect(() => {
    setLauncher((id: AppId) => {
      open(id);
      if (id === "terminal") setTimeout(focusTerminal, 30);
    });
  }, [setLauncher, open]);

  // Work area = everything under the top bar, above the dock.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const b = { top: r.top, left: r.left, width: Math.round(r.width), height: Math.round(r.height - DOCK_SPACE) };
      if (!useWM.getState().hydrated) hydrate(b);
      else setBounds(b);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hydrate, setBounds]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ height: "var(--app-h)" }}>
      <div className="os-wallpaper absolute inset-0" aria-hidden>
        <div className={`os-grid absolute inset-0 ${ambient ? "animate-os-drift" : ""}`} />
      </div>
      <TopBar />
      <main
        ref={area}
        className="relative isolate min-h-0 flex-1"
        aria-label="Pulpit BLACKNET OS"
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          menu.open(e.clientX, e.clientY, "Menu pulpitu", [
            { id: "term", label: "Otwórz terminal", icon: <SquareTerminal size={14} />, onSelect: () => useOS.getState().launch("terminal") },
            { id: "pal", label: "Paleta poleceń", shortcut: "Ctrl K", icon: <Search size={14} />, onSelect: () => set({ paletteOpen: true }) },
            { id: "arr", label: "Uporządkuj okna", icon: <LayoutGrid size={14} />, onSelect: arrange },
            "separator",
            { id: "set", label: "Ustawienia wyglądu", icon: <Settings2 size={14} />, onSelect: () => useOS.getState().launch("settings") },
          ]);
        }}
      >
        {hydrated && (
          <>
            <OSWindow id="terminal" persistent subtitle={<TerminalSubtitle />} onFocused={() => setTimeout(focusTerminal, 0)}>
              <TerminalApp mobile={false} />
            </OSWindow>
            {APP_IDS.filter((id): id is Exclude<AppId, "terminal"> => id !== "terminal").map((id) =>
              wins[id].open ? (
                <OSWindow key={id} id={id}>
                  <AppView id={id} mobile={false} />
                </OSWindow>
              ) : null,
            )}
          </>
        )}
      </main>
      <Dock />
      <OSToaster mobile={false} />
      <NotificationCenter open={notificationsOpen} onClose={() => set({ notificationsOpen: false })} mobile={false} />
      <OSContextMenu menu={menu.menu} onClose={menu.close} />
    </div>
  );
}
