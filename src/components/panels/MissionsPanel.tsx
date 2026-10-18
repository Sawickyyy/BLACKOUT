"use client";

import { useState } from "react";
import { MISSIONS } from "@/engine/missions/defs";
import type { MissionStatus } from "@/engine/types";
import { useGame } from "@/store/gameStore";

const BADGE: Record<MissionStatus, { label: string; cls: string }> = {
  locked: { label: "zablokowana", cls: "text-muted" },
  available: { label: "dostępna", cls: "text-accent2" },
  active: { label: "aktywna", cls: "text-warn" },
  completed: { label: "ukończona", cls: "text-ok" },
  failed: { label: "nieudana", cls: "text-danger" },
};

export default function MissionsPanel() {
  const engine = useGame((s) => s.engine);
  useGame((s) => s.tick);
  const [open, setOpen] = useState<string | null>(null);
  if (!engine) return null;

  return (
    <div className="flex flex-col gap-2 p-3">
      <h2 className="text-sm font-bold text-accent">Zlecenia</h2>
      <p className="text-xs text-muted">
        Wszystkie cele osiągasz prawdziwymi komendami w terminalu. Postęp zapisuje się automatycznie.
      </p>
      {MISSIONS.map((m, i) => {
        const st = engine.player.missions[m.id]?.status ?? (m.prereq?.length ? "locked" : "available");
        const badge = BADGE[st];
        const state = engine.player.missions[m.id];
        const isOpen = open === m.id;
        const locked = st === "locked";
        return (
          <div key={m.id} className="surface rounded-md">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              onClick={() => setOpen(isOpen ? null : m.id)}
              disabled={locked}
            >
              <span className="text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className={`flex-1 ${locked ? "text-muted" : "text-fg"}`}>
                {locked ? "████████" : m.title}
              </span>
              <span className="text-[10px]">{"★".repeat(m.difficulty)}</span>
              <span className={`text-[10px] ${badge.cls}`}>{badge.label}</span>
            </button>
            {isOpen && !locked && (
              <div className="border-t border-line px-3 py-2 text-xs">
                <p className="mb-2 whitespace-pre-wrap text-muted">{m.brief}</p>
                <ul className="space-y-1">
                  {m.objectives.map((o) => {
                    const done = state?.objectives[o.id];
                    return (
                      <li key={o.id} className={done ? "text-ok" : "text-fg"}>
                        [{done ? "x" : " "}] {o.label}
                        {o.optional ? " (opcjonalny)" : ""}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-accent">Nagroda: {m.reward.credits ?? 0} kr</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
