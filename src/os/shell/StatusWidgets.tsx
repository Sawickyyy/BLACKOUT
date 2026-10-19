"use client";

import { Coins, ShieldAlert } from "lucide-react";
import type { SaveState } from "@/lib/autosave/manager";
import { useGame } from "@/store/gameStore";
import { ago, useNow } from "@/components/SaveIndicator";
import { OSStatusIndicator, OSTooltip } from "../ui";
import { useClock } from "../viewport";

/** Suspicion meter. Colour + numeric label (never colour alone). */
export function AlarmMeter({ compact = false }: { compact?: boolean }) {
  const heat = useGame((s) => s.engine?.player.suspicion.heat ?? 0);
  useGame((s) => s.tick);
  const tone = heat > 70 ? "bg-danger" : heat > 40 ? "bg-warn" : "bg-accent";
  const label = heat > 70 ? "krytyczny" : heat > 40 ? "podwyższony" : "niski";
  return (
    <OSTooltip label={`Poziom alarmu: ${heat}/100 (${label})`}>
      <span
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs text-text2"
        role="meter"
        aria-label="Poziom alarmu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={heat}
        aria-valuetext={`${heat} na 100, ${label}`}
        tabIndex={0}
      >
        <ShieldAlert size={13} className={heat > 70 ? "text-danger" : heat > 40 ? "text-warn" : "text-text2"} aria-hidden />
        <span className={`relative h-1.5 overflow-hidden rounded-full bg-white/10 ${compact ? "w-8" : "w-14"}`}>
          <span className={`absolute inset-y-0 left-0 rounded-full ${tone} transition-[width] duration-slow`} style={{ width: `${Math.max(4, heat)}%` }} />
        </span>
        {!compact && <span className="tabular text-fg">{heat}</span>}
      </span>
    </OSTooltip>
  );
}

export function Credits() {
  const credits = useGame((s) => s.engine?.player.credits ?? 0);
  useGame((s) => s.tick);
  return (
    <span className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs" aria-label={`Saldo: ${credits} kredytów`}>
      <Coins size={13} className="text-accent" aria-hidden />
      <span className="tabular font-semibold text-fg">{credits.toLocaleString("pl-PL")}</span>
      <span className="text-2xs text-muted">kr</span>
    </span>
  );
}

const SAVE: Record<SaveState, { tone: "ok" | "warn" | "danger" | "info" | "neutral"; label: string; pulse?: boolean }> = {
  saved: { tone: "ok", label: "Zapisano" },
  dirty: { tone: "neutral", label: "Zmiany…" },
  syncing: { tone: "info", label: "Synchronizacja", pulse: true },
  pending: { tone: "info", label: "W kolejce" },
  offline: { tone: "warn", label: "Offline" },
  retrying: { tone: "warn", label: "Ponawianie", pulse: true },
  error: { tone: "danger", label: "Błąd zapisu" },
  suspended: { tone: "danger", label: "Inna karta" },
};

export function SaveStatus({ showLabel = true }: { showLabel?: boolean }) {
  const status = useGame((s) => s.saveStatus);
  const now = useNow(5000);
  if (!status) return null;
  const s = SAVE[status.state];
  const detail =
    `Autozapis: ${s.label}. Urządzenie: ${ago(status.lastLocalAt, now)}` +
    (status.backend === "cloud" ? `, chmura: ${ago(status.lastCloudAt, now)}` : "") +
    (status.error ? `. ${status.error}` : "");
  return (
    <OSTooltip label={detail}>
      <span tabIndex={0} className="flex items-center rounded-md px-1.5 py-1" data-save-state={status.state} aria-label={detail}>
        <OSStatusIndicator tone={s.tone} label={s.label} pulse={s.pulse} showLabel={showLabel} />
      </span>
    </OSTooltip>
  );
}

export function Clock() {
  const now = useClock(15_000);
  const time = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "short" });
  return (
    <time dateTime={now.toISOString()} className="flex items-center gap-2 px-1.5 text-xs tabular text-fg">
      <span className="hidden text-text2 lg:inline">{date}</span>
      <span className="font-medium">{time}</span>
    </time>
  );
}
