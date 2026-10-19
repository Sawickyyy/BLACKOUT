"use client";

import { APP_IDS, APPS, type AppId } from "../apps";
import { useWM } from "../wm";
import { OSTooltip } from "../ui";

/** Desktop dock: launch, focus, or minimise apps. Running apps show an indicator. */
export default function Dock() {
  const wins = useWM((s) => s.wins);
  const focused = useWM((s) => s.focused);
  const activate = useWM((s) => s.activate);

  return (
    <nav aria-label="Dock aplikacji" className="pointer-events-none absolute inset-x-0 bottom-3 z-[55] flex justify-center">
      <ul className="glass pointer-events-auto flex items-end gap-1.5 rounded-[20px] px-2.5 py-2 shadow-window">
        {APP_IDS.map((id: AppId) => {
          const app = APPS[id];
          const Icon = app.icon;
          const w = wins[id];
          const running = w.open;
          const isFocused = focused === id && running && !w.minimized;
          return (
            <li key={id} className="flex flex-col items-center">
              <OSTooltip label={app.title} side="top">
                <button
                  onClick={() => activate(id)}
                  aria-label={`${app.title}${running ? (w.minimized ? " (zminimalizowane)" : " (otwarte)") : ""}`}
                  aria-pressed={isFocused}
                  data-dock={id}
                  className="group flex h-12 w-12 items-center justify-center rounded-[14px] transition-transform duration-base ease-spring hover:-translate-y-1 active:scale-95"
                  style={{
                    background: `linear-gradient(160deg, rgb(${app.tint} / 0.22), rgb(${app.tint} / 0.07))`,
                    boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px rgb(${app.tint} / ${isFocused ? 0.5 : 0.16})`,
                    color: `rgb(${app.tint})`,
                  }}
                >
                  <Icon size={22} strokeWidth={1.9} />
                </button>
              </OSTooltip>
              <span
                aria-hidden
                className={`mt-1 h-1 w-1 rounded-full transition-opacity duration-base ${running ? "opacity-100" : "opacity-0"} ${
                  isFocused ? "bg-accent" : "bg-white/50"
                }`}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
