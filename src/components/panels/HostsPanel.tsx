"use client";

import type { Host } from "@/engine/types";
import { sendToTerminal, focusTerminal } from "../terminalBridge";
import { useGame } from "@/store/gameStore";

export default function HostsPanel() {
  const engine = useGame((s) => s.engine);
  useGame((s) => s.tick);
  if (!engine) return null;

  const discovered = engine.player.discovered
    .map((id) => engine.world.hosts[id])
    .filter((h): h is Host => Boolean(h));

  const center = { x: 150, y: 130 };
  const radius = 95;
  const others = discovered.filter((h) => h.id !== "local");

  const quick = (cmd: string) => {
    sendToTerminal(cmd);
    focusTerminal();
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      <h2 className="text-sm font-bold text-accent">Sieć</h2>

      <svg viewBox="0 0 300 260" className="w-full surface rounded-md">
        {others.map((h, i) => {
          const angle = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
          const x = center.x + Math.cos(angle) * radius;
          const y = center.y + Math.sin(angle) * radius;
          const access = (engine.player.accessByHost[h.id] ?? []).length > 0;
          return (
            <g key={h.id}>
              <line x1={center.x} y1={center.y} x2={x} y2={y} stroke="rgb(var(--line))" strokeWidth={1} />
              <circle
                cx={x}
                cy={y}
                r={9}
                fill={access ? "rgb(var(--ok))" : "rgb(var(--panel2))"}
                stroke="rgb(var(--accent))"
                strokeWidth={1}
              />
              <text x={x} y={y + 20} textAnchor="middle" fontSize="7" fill="rgb(var(--muted))">
                {h.hostname.split(".")[0]}
              </text>
            </g>
          );
        })}
        <circle cx={center.x} cy={center.y} r={13} fill="rgb(var(--accent))" />
        <text x={center.x} y={center.y + 28} textAnchor="middle" fontSize="8" fill="rgb(var(--accent))">
          ty
        </text>
      </svg>

      <div className="space-y-2">
        {discovered.map((h) => {
          const access = engine.player.accessByHost[h.id] ?? [];
          return (
            <div key={h.id} className="surface rounded-md p-2">
              <div className="flex items-center justify-between">
                <span className="text-fg">{h.hostname}</span>
                <span className="text-muted">{h.ip}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{engine.world.organizations[h.org ?? ""]?.name ?? h.org}</span>
                {access.length > 0 && <span className="text-ok">dostęp: {access.join(", ")}</span>}
              </div>
              {h.id !== "local" && (
                <div className="mt-1 flex gap-1">
                  <button className="btn py-0.5 text-[10px]" onClick={() => quick(`nmap -sV ${h.hostname}`)}>
                    nmap
                  </button>
                  <button className="btn py-0.5 text-[10px]" onClick={() => quick(`curl http://${h.hostname}/`)}>
                    curl
                  </button>
                  <button className="btn py-0.5 text-[10px]" onClick={() => quick(`ping -c3 ${h.hostname}`)}>
                    ping
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
