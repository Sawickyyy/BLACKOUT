"use client";

import { useGame } from "@/store/gameStore";

export default function StatusBar() {
  const engine = useGame((s) => s.engine);
  useGame((s) => s.tick); // re-render on state change
  const saving = useGame((s) => s.saving);
  const lastSavedAt = useGame((s) => s.lastSavedAt);
  const backend = useGame((s) => s.backend);
  if (!engine) return null;

  const p = engine.player;
  const host = engine.currentHost();
  const heat = p.suspicion.heat;
  const heatColor = heat > 70 ? "bg-danger" : heat > 40 ? "bg-warn" : "bg-accent";

  return (
    <div className="flex items-center gap-3 border-b border-line bg-panel px-3 py-2 text-xs">
      <span className="glow-text font-bold text-accent">BLACKNET</span>
      <span className="hidden text-muted sm:inline">
        {p.username}@{host.hostname}
      </span>
      <span className="ml-auto flex items-center gap-1 text-muted">
        <span className="text-fg">{p.credits}</span> kr
      </span>
      <span className="hidden items-center gap-1 text-muted sm:flex">
        bank <span className="text-fg">{p.bankBalance}</span>
      </span>
      <div className="flex items-center gap-1" title={`Poziom podejrzeń: ${heat}/100`}>
        <span className="hidden text-muted md:inline">alarm</span>
        <div className="h-2 w-16 overflow-hidden rounded bg-panel2">
          <div className={`h-full ${heatColor} transition-all`} style={{ width: `${heat}%` }} />
        </div>
      </div>
      <span className="text-[10px] text-muted" title={backend === "cloud" ? "Zapis w chmurze" : "Zapis lokalny"}>
        {saving ? "zapisywanie…" : lastSavedAt ? "zapisano ✓" : backend === "cloud" ? "☁" : "💾"}
      </span>
    </div>
  );
}
