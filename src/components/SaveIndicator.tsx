"use client";

import { useEffect, useState } from "react";
import type { SaveState } from "@/lib/autosave/manager";
import { useGame } from "@/store/gameStore";

const LOOK: Record<SaveState, { label: string; cls: string; dot: string }> = {
  saved: { label: "zapisano", cls: "text-muted", dot: "bg-ok" },
  dirty: { label: "zmiany…", cls: "text-muted", dot: "bg-warn" },
  syncing: { label: "synchronizacja…", cls: "text-accent2", dot: "bg-accent2 animate-pulse" },
  pending: { label: "w kolejce", cls: "text-muted", dot: "bg-accent2" },
  offline: { label: "offline", cls: "text-warn", dot: "bg-warn" },
  retrying: { label: "ponawianie", cls: "text-warn", dot: "bg-warn animate-pulse" },
  error: { label: "błąd zapisu", cls: "text-danger", dot: "bg-danger" },
  suspended: { label: "inna karta", cls: "text-danger", dot: "bg-danger" },
};

export function ago(ts: number | undefined, now: number): string {
  if (!ts) return "nigdy";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "przed chwilą";
  if (s < 60) return `${s} s temu`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min temu`;
  return new Date(ts).toLocaleString("pl-PL");
}

/** Re-render every few seconds so relative times stay fresh. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function SaveIndicator() {
  const status = useGame((s) => s.saveStatus);
  const now = useNow(1000);
  if (!status) return null;

  const look = LOOK[status.state];
  let label = look.label;
  if (status.state === "retrying" && status.retryAt) {
    label = `ponowienie za ${Math.max(1, Math.ceil((status.retryAt - now) / 1000))} s`;
  }
  const where = status.backend === "cloud" ? (status.pendingCloud ? "urządzenie ✓, chmura ⏳" : "urządzenie ✓, chmura ✓") : "urządzenie ✓";
  const title =
    `Autozapis: ${label}\n` +
    `Lokalnie: ${ago(status.lastLocalAt, now)}` +
    (status.backend === "cloud" ? `\nChmura: ${ago(status.lastCloudAt, now)}` : "") +
    (status.error ? `\n${status.error}` : "") +
    `\n${where}`;

  return (
    <span className={`flex items-center gap-1.5 text-[10px] ${look.cls}`} title={title} data-save-state={status.state}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${look.dot}`} />
      <span className="hidden sm:inline">{label}</span>
      {status.backend === "cloud" && <span aria-hidden>{status.pendingCloud ? "☁︎⏳" : "☁︎"}</span>}
    </span>
  );
}
