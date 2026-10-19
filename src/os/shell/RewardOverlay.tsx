"use client";

import { useEffect } from "react";
import { Award, Coins } from "lucide-react";
import { MISSIONS } from "@/engine/missions/defs";
import { useGame } from "@/store/gameStore";

const SKILL: Record<string, string> = {
  recon: "Rozpoznanie",
  exploitation: "Eksploatacja",
  crypto: "Kryptografia",
  forensics: "Informatyka śledcza",
  social: "Socjotechnika",
  stealth: "Skrytość",
};

/** Mission-complete card with the real reward from the mission definition. */
export default function RewardOverlay() {
  const queue = useGame((s) => s.celebrations);
  const dismiss = useGame((s) => s.dismissCelebration);
  const current = queue[0];
  const mission = current ? MISSIONS.find((m) => m.id === current.missionId) : undefined;

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismiss(current.id), 3200);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  if (!current || !mission) return null;
  const index = MISSIONS.indexOf(mission) + 1;
  const skills = Object.entries(mission.reward.skills ?? {});

  return (
    <div className="pointer-events-none fixed inset-0 z-[86] flex items-center justify-center p-6" role="status" aria-live="polite">
      <button
        className="glass pointer-events-auto w-full max-w-[340px] rounded-[22px] px-6 py-6 text-center shadow-window animate-os-pop"
        onClick={() => dismiss(current.id)}
        aria-label={`Zlecenie ${index} ukończone: ${mission.title}. Nagroda ${mission.reward.credits ?? 0} kredytów. Zamknij.`}
      >
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-glow">
          <Award size={28} />
        </span>
        <p className="os-label">Zlecenie {String(index).padStart(2, "0")} ukończone</p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-fg">{mission.title}</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
          <Coins size={15} />+{(mission.reward.credits ?? 0).toLocaleString("pl-PL")} kr
        </p>
        {skills.length > 0 && (
          <p className="mt-2 text-xs text-text2">
            {skills.map(([k, v]) => `${SKILL[k] ?? k} +${v}`).join(" · ")}
          </p>
        )}
      </button>
    </div>
  );
}
