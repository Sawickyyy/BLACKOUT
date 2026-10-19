"use client";

import { useState } from "react";
import { Bell, Cloud, HardDrive, LayoutGrid, LogOut, Search, Settings2, UserRound } from "lucide-react";
import { useGame } from "@/store/gameStore";
import { APPS } from "../apps";
import { useOS } from "../osStore";
import { logout } from "../session";
import { useWM } from "../wm";
import { OSContextMenu, OSIconButton, useContextMenu } from "../ui";
import { AlarmMeter, Clock, Credits, SaveStatus } from "./StatusWidgets";
import Logo from "./Logo";

/** Desktop system bar: system menu, focused app, status, notifications, clock, user. */
export default function TopBar() {
  const focused = useWM((s) => s.focused);
  const arrange = useWM((s) => s.arrange);
  const username = useGame((s) => s.username);
  const backend = useGame((s) => s.backend);
  const history = useGame((s) => s.noteHistory.length);
  const { set, launch, notificationsOpen } = useOS();
  const sysMenu = useContextMenu();
  const userMenu = useContextMenu();
  const [seen, setSeen] = useState(0);
  const unread = Math.max(0, history - seen);

  const openMenu = (m: ReturnType<typeof useContextMenu>, label: string, items: Parameters<typeof m.open>[3]) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      m.open(r.left, r.bottom + 6, label, items);
    };

  return (
    <header className="glass relative z-[60] flex h-9 shrink-0 items-center gap-1 rounded-none border-x-0 border-t-0 px-2">
      <button
        onClick={openMenu(sysMenu, "Menu systemu", [
          { id: "palette", label: "Paleta poleceń", shortcut: "Ctrl K", icon: <Search size={14} />, onSelect: () => set({ paletteOpen: true }) },
          { id: "arrange", label: "Uporządkuj okna", icon: <LayoutGrid size={14} />, onSelect: arrange },
          { id: "settings", label: "Ustawienia systemu", icon: <Settings2 size={14} />, onSelect: () => launch("settings") },
          "separator",
          { id: "logout", label: "Wyloguj", icon: <LogOut size={14} />, onSelect: () => void logout() },
        ])}
        aria-haspopup="menu"
        aria-label="Menu systemu BLACKNET OS"
        className="flex h-7 items-center gap-2 rounded-md px-2 hover:bg-white/[0.07]"
      >
        <Logo size={16} />
        <span className="text-[0.8125rem] font-semibold tracking-tight text-fg">BLACKNET</span>
      </button>
      <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
      <span className="truncate px-1 text-[0.8125rem] font-medium text-text2" aria-live="polite">
        {focused ? APPS[focused].title : "Pulpit"}
      </span>

      <div className="ml-auto flex items-center gap-0.5">
        <OSIconButton label="Szukaj (Ctrl K)" size="sm" onClick={() => set({ paletteOpen: true })}>
          <Search size={15} />
        </OSIconButton>
        <AlarmMeter />
        <Credits />
        <SaveStatus />
        <span className="relative">
          <OSIconButton
            label={unread ? `Powiadomienia (${unread} nowych)` : "Powiadomienia"}
            size="sm"
            active={notificationsOpen}
            onClick={() => {
              set({ notificationsOpen: !notificationsOpen });
              setSeen(history);
            }}
          >
            <Bell size={15} />
          </OSIconButton>
          {unread > 0 && (
            <span className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_0_2px_rgb(var(--surface))]" aria-hidden />
          )}
        </span>
        <Clock />
        <button
          onClick={openMenu(userMenu, "Konto", [
            {
              id: "who",
              label: `${username} · ${backend === "cloud" ? "chmura" : "lokalnie"}`,
              icon: backend === "cloud" ? <Cloud size={14} /> : <HardDrive size={14} />,
              disabled: true,
              onSelect: () => undefined,
            },
            "separator",
            { id: "account", label: "Konto i zapisy", icon: <UserRound size={14} />, onSelect: () => launch("settings") },
            { id: "logout", label: "Wyloguj", icon: <LogOut size={14} />, onSelect: () => void logout() },
          ])}
          aria-haspopup="menu"
          aria-label={`Konto: ${username}`}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent/80 to-accent2/80 text-[0.7rem] font-bold uppercase text-[#04140D]"
        >
          {username.slice(0, 2)}
        </button>
      </div>
      <OSContextMenu menu={sysMenu.menu} onClose={sysMenu.close} />
      <OSContextMenu menu={userMenu.menu} onClose={userMenu.close} />
    </header>
  );
}
