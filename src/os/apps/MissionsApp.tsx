"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, CircleDot, Coins, Lock, SquareTerminal } from "lucide-react";
import { MISSIONS } from "@/engine/missions/defs";
import type { Mission } from "@/engine/missions/engine";
import type { MissionStatus } from "@/engine/types";
import { focusTerminal, sendToTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { useOS } from "../osStore";
import { OSBadge, OSButton, OSEmptyState, OSTabs, OSTabPanel } from "../ui";

type Filter = "all" | "open" | "done";

const STATUS: Record<MissionStatus, { label: string; tone: "ok" | "warn" | "info" | "danger" | "neutral" }> = {
  locked: { label: "Zablokowane", tone: "neutral" },
  available: { label: "Dostępne", tone: "info" },
  active: { label: "W toku", tone: "warn" },
  completed: { label: "Ukończone", tone: "ok" },
  failed: { label: "Nieudane", tone: "danger" },
};

/** Render a brief: `backticked` spans become inline code. */
function Brief({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-text2">
      {parts.map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.75rem] text-fg">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function Difficulty({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Trudność ${level} z 5`} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i < level ? "bg-warn" : "bg-white/10"}`} />
      ))}
    </span>
  );
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="rgb(var(--accent))"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / total)}
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dashoffset var(--dur-slow) var(--ease-out)" }}
      />
    </svg>
  );
}

function MissionCard({ m, index, open, onToggle }: { m: Mission; index: number; open: boolean; onToggle: () => void }) {
  const state = useGame((s) => s.engine?.player.missions[m.id]);
  const missions = useGame((s) => s.engine?.player.missions);
  const org = useGame((s) => (m.org ? s.engine?.world.organizations[m.org]?.name : undefined));
  const launch = useOS((s) => s.launch);
  const status: MissionStatus = state?.status ?? (m.prereq?.length ? "locked" : "available");
  const locked = status === "locked";
  const done = m.objectives.filter((o) => state?.objectives[o.id]).length;
  const total = m.objectives.length;
  const num = String(index + 1).padStart(2, "0");
  const st = STATUS[status];

  if (locked) {
    // Only name prerequisites the player can already see.
    const visible = (m.prereq ?? [])
      .map((p) => MISSIONS.find((x) => x.id === p))
      .filter((p): p is Mission => !!p && missions?.[p.id]?.status !== "locked" && missions?.[p.id] !== undefined);
    const hidden = (m.prereq?.length ?? 0) - visible.length;
    return (
      <li className="relative overflow-hidden rounded-os-lg border border-dashed border-white/[0.08] bg-white/[0.015] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] font-mono text-xs text-muted">
            {num}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-text2">
              <Lock size={13} aria-hidden /> Zlecenie zaszyfrowane
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              <span className="h-1.5 w-16 rounded-full bg-white/[0.06]" />
              <span className="h-1.5 w-24 rounded-full bg-white/[0.04]" />
              <span className="h-1.5 w-10 rounded-full bg-white/[0.04]" />
            </div>
          </div>
          <Difficulty level={m.difficulty} />
        </div>
        <p className="mt-3 text-2xs text-muted">
          Odblokujesz po ukończeniu:{" "}
          {visible.map((p) => `„${p.title}”`).join(", ")}
          {hidden > 0 && `${visible.length ? " oraz " : ""}${hidden === 1 ? "wcześniejszego zlecenia" : "wcześniejszych zleceń"}`}
        </p>
      </li>
    );
  }

  return (
    <li
      className={`overflow-hidden rounded-os-lg border transition-[border-color,background-color] duration-base ${
        status === "completed"
          ? "border-ok/25 bg-ok/[0.04]"
          : status === "active"
            ? "border-warn/25 bg-elevated/60"
            : "border-white/[0.08] bg-elevated/40"
      }`}
    >
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`mission-${m.id}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs ${
            status === "completed" ? "bg-ok/15 text-ok" : "bg-white/[0.06] text-fg"
          }`}
        >
          {status === "completed" ? <Check size={16} aria-label="ukończone" /> : num}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[0.9rem] font-semibold tracking-tight text-fg">{m.title}</span>
            <OSBadge tone={st.tone}>{st.label}</OSBadge>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
            {org && <span>{org}</span>}
            <Difficulty level={m.difficulty} />
            <span className="flex items-center gap-1 text-text2">
              <Coins size={12} aria-hidden /> {(m.reward.credits ?? 0).toLocaleString("pl-PL")} kr
            </span>
          </span>
          <span className="mt-3 flex items-center gap-2">
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
              role="progressbar"
              aria-label="Postęp celów"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-slow ease-os ${status === "completed" ? "bg-ok" : "bg-accent"}`}
                style={{ width: `${(done / total) * 100}%` }}
              />
            </span>
            <span className="tabular text-2xs text-text2">
              {done}/{total}
            </span>
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`mt-2 shrink-0 text-muted transition-transform duration-base ease-os ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* grid-rows trick: smooth height animation without measuring */}
      <div
        id={`mission-${m.id}`}
        className="grid transition-[grid-template-rows] duration-slow ease-os"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden" inert={!open || undefined}>
          <div className="space-y-4 border-t hairline px-4 pb-4 pt-4">
            <Brief text={m.brief} />
            <div>
              <p className="os-label mb-2">Cele</p>
              <ul className="space-y-1.5">
                {m.objectives.map((o) => {
                  const ok = state?.objectives[o.id];
                  return (
                    <li key={o.id} className="flex items-start gap-2.5 text-[0.8125rem]">
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          ok ? "border-ok bg-ok text-[#04140D]" : "border-white/25"
                        }`}
                        aria-hidden
                      >
                        {ok && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className={ok ? "text-text2 line-through decoration-white/20" : "text-fg"}>
                        {o.label}
                        {o.optional && <span className="text-muted"> (opcjonalny)</span>}
                        <span className="sr-only">{ok ? " — wykonany" : " — do zrobienia"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-text2">
                Nagroda: <span className="font-semibold text-accent">{(m.reward.credits ?? 0).toLocaleString("pl-PL")} kr</span>
                {m.reward.unlockCapabilities?.length ? ` + ${m.reward.unlockCapabilities.join(", ")}` : ""}
              </p>
              <OSButton
                size="sm"
                variant="secondary"
                icon={<SquareTerminal size={14} />}
                onClick={() => {
                  launch("terminal");
                  setTimeout(() => {
                    sendToTerminal(`mission ${index + 1}\r`);
                    focusTerminal();
                  }, 60);
                }}
              >
                Otwórz w terminalu
              </OSButton>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function MissionsApp({ mobile }: { mobile: boolean }) {
  const missions = useGame((s) => s.engine?.player.missions);
  useGame((s) => s.tick);
  const [filter, setFilter] = useState<Filter>("open");
  const [openId, setOpenId] = useState<string | null>(null);

  const status = (m: Mission): MissionStatus => missions?.[m.id]?.status ?? (m.prereq?.length ? "locked" : "available");
  const completed = MISSIONS.filter((m) => status(m) === "completed").length;
  const active = MISSIONS.filter((m) => ["available", "active"].includes(status(m))).length;

  const list = useMemo(() => {
    return MISSIONS.map((m, i) => ({ m, i })).filter(({ m }) => {
      const s = status(m);
      if (filter === "done") return s === "completed";
      if (filter === "open") return s !== "completed";
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions, filter, completed]);

  let empty: ReactNode = null;
  if (list.length === 0) {
    empty =
      filter === "done" ? (
        <OSEmptyState icon={<CircleDot size={20} />} title="Jeszcze nic ukończonego">
          Zacznij od zlecenia 01 — wpisz w terminalu <code className="font-mono">mission 1</code>.
        </OSEmptyState>
      ) : (
        <OSEmptyState icon={<Check size={20} />} title="Wszystkie zlecenia ukończone">
          Operacja BLACKOUT zamknięta. Świetna robota, operatorze.
        </OSEmptyState>
      );
  }

  return (
    <div className="scroll-area h-full">
      <div className={`mx-auto max-w-3xl ${mobile ? "px-4 pb-6 pt-4" : "p-5"}`}>
        <div className="mb-4 flex items-center gap-4 rounded-os-lg border hairline bg-gradient-to-br from-elevated to-surface p-4">
          <div className="relative">
            <Ring value={completed} total={MISSIONS.length} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular text-fg">
              {Math.round((completed / MISSIONS.length) * 100)}%
            </span>
          </div>
          <div className="min-w-0">
            <p className="os-label">Postęp operacji</p>
            <p className="text-lg font-semibold tracking-tight text-fg">
              {completed} <span className="text-text2">/ {MISSIONS.length} zleceń</span>
            </p>
            <p className="text-2xs text-text2">{active} dostępnych do wykonania</p>
          </div>
        </div>

        <OSTabs
          idPrefix="missions"
          label="Filtr zleceń"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "open", label: "Do zrobienia" },
            { id: "done", label: `Ukończone (${completed})` },
            { id: "all", label: "Wszystkie" },
          ]}
          className="mb-4"
        />

        <OSTabPanel idPrefix="missions" id={filter}>
          {empty ?? (
            <ul className="space-y-2.5">
              {list.map(({ m, i }) => (
                <MissionCard key={m.id} m={m} index={i} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />
              ))}
            </ul>
          )}
        </OSTabPanel>
      </div>
    </div>
  );
}
