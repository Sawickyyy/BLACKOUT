"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Globe, Lock, Radar, Server, ShieldAlert, ShieldCheck, Unlock, Wifi } from "lucide-react";
import type { Host } from "@/engine/types";
import { advisoriesFor, SEVERITY_LABEL } from "@/engine/vulns";
import { focusTerminal, sendToTerminal } from "@/components/terminalBridge";
import { useGame } from "@/store/gameStore";
import { GameEngine } from "@/engine/game";
import { useOS } from "../osStore";
import { OSBadge, OSBottomSheet, OSButton, OSEmptyState } from "../ui";

interface Node {
  host: Host;
  x: number;
  y: number;
  access: boolean;
  isLocal: boolean;
}

/** Deterministic radial layout grouped by organization (stable across renders). */
function layout(engine: GameEngine): Node[] {
  const ids = engine.player.discovered.filter((id) => engine.world.hosts[id]);
  const others = ids.filter((id) => id !== engine.player.localHostId);
  const byOrg = new Map<string, string[]>();
  for (const id of others) {
    const org = engine.world.hosts[id]!.org ?? "?";
    (byOrg.get(org) ?? byOrg.set(org, []).get(org)!).push(id);
  }
  const nodes: Node[] = [];
  const local = engine.world.hosts[engine.player.localHostId];
  if (local) nodes.push({ host: local, x: 0, y: 0, access: true, isLocal: true });
  const orgs = [...byOrg.keys()];
  orgs.forEach((org, oi) => {
    const members = byOrg.get(org)!;
    const baseAngle = (oi / Math.max(1, orgs.length)) * Math.PI * 2 - Math.PI / 2;
    members.forEach((id, mi) => {
      const ring = 150 + mi * 78;
      const spread = (mi === 0 ? 0 : ((mi % 2 ? 1 : -1) * Math.ceil(mi / 2) * 0.28));
      const a = baseAngle + spread;
      nodes.push({
        host: engine.world.hosts[id]!,
        x: Math.cos(a) * ring,
        y: Math.sin(a) * ring,
        access: (engine.player.accessByHost[id] ?? []).length > 0,
        isLocal: false,
      });
    });
  });
  return nodes;
}

function HostDetail({ host, access, onClose }: { host: Host; access: string[]; onClose?: () => void }) {
  const engine = useGame((s) => s.engine)!;
  const orgName = host.org ? engine.world.organizations[host.org]?.name : undefined;
  const openUrl = useOS((s) => s.openUrl);
  const services = engine.observedServices(host.id);
  const web = (host.services.find((s) => s.kind === "http") ?? host.services.find((s) => s.kind === "https")) && services?.some((s) => s.port === 80 || s.port === 443 || s.port === 8080);
  const advisories = (services ?? []).flatMap((s) => advisoriesFor(s.version));
  const term = (cmd: string) => {
    useOS.getState().launch("terminal");
    setTimeout(() => {
      sendToTerminal(cmd + "\r");
      focusTerminal();
    }, 60);
    onClose?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent2/12 text-accent2">
          <Server size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-fg">{host.hostname}</p>
          <p className="font-mono text-2xs text-text2">{host.ip}</p>
        </div>
        {access.length > 0 ? (
          <OSBadge tone="ok">
            <Unlock size={11} /> dostęp
          </OSBadge>
        ) : (
          <OSBadge tone="neutral">
            <Lock size={11} /> brak dostępu
          </OSBadge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border hairline bg-white/[0.04] text-xs">
        {[
          ["Organizacja", orgName ?? "—"],
          ["System", host.os],
          ["Sieć", host.cidr],
          ["Konta z dostępem", access.length ? access.join(", ") : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-2">
            <dt className="os-label">{k}</dt>
            <dd className="mt-0.5 truncate font-mono text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="os-label mb-1.5 flex items-center gap-1.5">
          <Radar size={12} /> Usługi {services ? `(${services.length})` : ""}
        </p>
        {!services ? (
          <p className="rounded-lg border border-dashed hairline px-3 py-3 text-2xs text-muted">
            Nie skanowano tego hosta. Uruchom <code className="font-mono text-text2">nmap {host.hostname}</code>, aby
            wykryć otwarte porty i usługi.
          </p>
        ) : services.length === 0 ? (
          <p className="text-2xs text-muted">Skan nie wykrył otwartych portów (filtrowane lub zamknięte).</p>
        ) : (
          <ul className="space-y-1">
            {services.map((s) => (
              <li key={s.port} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-2xs">
                <span className="w-16 text-accent">{s.port}/{s.proto}</span>
                <span className="flex-1 text-fg">{s.service ?? "?"}</span>
                {s.version && <span className="truncate text-muted">{s.version}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {advisories.length > 0 && (
        <div>
          <p className="os-label mb-1.5 flex items-center gap-1.5">
            <ShieldAlert size={12} className="text-accent2" /> Biuletyn podatności ({advisories.length})
          </p>
          <ul className="space-y-1">
            {advisories.map((a) => (
              <li key={a.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-2xs">
                <span className="font-mono text-accent2">{a.id}</span>{" "}
                <span className="text-fg">{a.title}</span>{" "}
                <span className="text-muted">· {SEVERITY_LABEL[a.severity]}</span>
                <p className="mt-0.5 text-muted">{a.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <OSButton size="sm" variant="secondary" icon={<Radar size={14} />} onClick={() => term(`nmap -sV ${host.hostname}`)}>
          nmap
        </OSButton>
        <OSButton size="sm" variant="secondary" icon={<Wifi size={14} />} onClick={() => term(`ping -c3 ${host.hostname}`)}>
          ping
        </OSButton>
        {web && (
          <OSButton size="sm" variant="secondary" icon={<Globe size={14} />} onClick={() => openUrl(`http://${host.hostname}/`)}>
            Otwórz WWW
          </OSButton>
        )}
        {access.length > 0 && (
          <OSButton size="sm" variant="primary" icon={<ShieldCheck size={14} />} onClick={() => term(`ssh ${access[0]}@${host.hostname}`)}>
            ssh {access[0]}
          </OSButton>
        )}
      </div>
    </div>
  );
}

export default function NetworkApp({ mobile }: { mobile: boolean }) {
  const engine = useGame((s) => s.engine)!;
  useGame((s) => s.tick);
  const tick = useGame((s) => s.tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute on discovery/access changes
  const nodes = useMemo(() => layout(engine), [engine, engine.player.discovered.length, tick]);
  const [selected, setSelected] = useState<string | null>(null);

  // Highlight hosts discovered since this app last rendered them, with a short
  // pulse so a newly-appeared node is obvious.
  const seen = useRef<Set<string> | null>(null);
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = nodes.map((n) => n.host.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // first mount: nothing is "new"
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    if (fresh.length) {
      fresh.forEach((id) => seen.current!.add(id));
      setPulsing(new Set(fresh));
      const t = setTimeout(() => setPulsing(new Set()), 4200);
      return () => clearTimeout(t);
    }
  }, [nodes]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);

  const selectedNode = nodes.find((n) => n.host.id === selected);

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(2.2, Math.max(0.5, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    setView((v) => ({ ...v, k }));
  };

  if (nodes.length <= 1) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <OSEmptyState
          icon={<Radar size={22} />}
          title="Brak odkrytych hostów"
          action={
            <OSButton
              size="sm"
              variant="primary"
              onClick={() => {
                useOS.getState().launch("terminal");
                setTimeout(() => {
                  sendToTerminal("nslookup aurora.example\r");
                  focusTerminal();
                }, 60);
              }}
            >
              Zacznij zwiad
            </OSButton>
          }
        >
          Użyj <code className="font-mono">nslookup</code>, <code className="font-mono">nmap</code> lub{" "}
          <code className="font-mono">curl</code>, aby odkryć hosty w sieci BLACKNET. Pojawią się tutaj automatycznie.
        </OSEmptyState>
      </div>
    );
  }

  const canvas = (
    <div
      className="relative h-full w-full touch-none overflow-hidden"
      onWheel={onWheel}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        moved.current = false;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 4) moved.current = true;
        setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
      }}
      onPointerUp={() => (drag.current = null)}
      role="application"
      aria-label="Mapa odkrytej sieci. Przeciągnij, aby przesunąć; kółko, aby przybliżyć."
    >
      <div className="os-grid absolute inset-0 opacity-40" aria-hidden />
      <svg className="absolute left-1/2 top-1/2 h-0 w-0 overflow-visible" aria-hidden>
        <g style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {nodes.filter((n) => !n.isLocal).map((n) => {
            const fresh = pulsing.has(n.host.id);
            return (
              <line
                key={`l-${n.host.id}`}
                x1={0}
                y1={0}
                x2={n.x}
                y2={n.y}
                stroke={fresh ? "rgb(var(--accent) / 0.8)" : n.access ? "rgb(var(--ok) / 0.3)" : "rgb(var(--line) / 0.14)"}
                strokeWidth={fresh ? 2 : 1}
                className={fresh ? "os-edge-flow" : undefined}
              />
            );
          })}
        </g>
      </svg>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: "0 0" }}
      >
        {nodes.map((n) => {
          const active = selected === n.host.id;
          const fresh = pulsing.has(n.host.id);
          const Icon = n.isLocal ? Crosshair : n.access ? Unlock : Server;
          return (
            <button
              key={n.host.id}
              onClick={() => {
                if (!moved.current) setSelected(n.host.id);
              }}
              aria-label={`${n.host.hostname}${n.access ? ", dostęp uzyskany" : ""}${fresh ? ", nowo odkryty" : ""}`}
              aria-pressed={active}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none"
              style={{ left: n.x, top: n.y }}
            >
              {fresh && (
                <span
                  aria-hidden
                  className="absolute left-1/2 top-[14px] h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-2xl border-2 border-accent/70"
                />
              )}
              <span
                className={`flex items-center justify-center rounded-2xl border transition-[transform,box-shadow,border-color] duration-base ${
                  n.isLocal ? "h-12 w-12" : "h-10 w-10"
                } ${
                  active
                    ? "scale-110 border-accent shadow-glow"
                    : n.isLocal
                      ? "border-accent/60"
                      : n.access
                        ? "border-ok/50"
                        : "border-white/15"
                }`}
                style={{
                  background: n.isLocal
                    ? "rgb(var(--accent) / 0.18)"
                    : n.access
                      ? "rgb(var(--ok) / 0.1)"
                      : "rgb(var(--elevated))",
                  color: n.isLocal ? "rgb(var(--accent))" : n.access ? "rgb(var(--ok))" : "rgb(var(--text-2))",
                }}
              >
                <Icon size={n.isLocal ? 20 : 17} strokeWidth={2} />
              </span>
              <span className="whitespace-nowrap rounded-md bg-bg/70 px-1.5 py-0.5 font-mono text-[9px] text-text2">
                {n.isLocal ? "ty" : n.host.hostname.split(".")[0]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between p-3">
        <span className="glass pointer-events-auto flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-2xs text-text2">
          <Radar size={12} className="text-accent2" /> {nodes.length - 1} hostów · {nodes.filter((n) => n.access).length} z dostępem
        </span>
        <span className="glass pointer-events-auto flex gap-1 rounded-lg p-1">
          {[
            ["−", () => setView((v) => ({ ...v, k: Math.max(0.5, v.k - 0.2) }))],
            ["⤢", () => setView({ x: 0, y: 0, k: 1 })],
            ["+", () => setView((v) => ({ ...v, k: Math.min(2.2, v.k + 0.2) }))],
          ].map(([label, fn], i) => (
            <button
              key={i}
              onClick={fn as () => void}
              aria-label={i === 0 ? "Oddal" : i === 1 ? "Wyśrodkuj" : "Przybliż"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-text2 hover:bg-white/10 hover:text-fg"
            >
              {label as string}
            </button>
          ))}
        </span>
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div className="h-full">
        {canvas}
        <OSBottomSheet open={!!selectedNode} onClose={() => setSelected(null)} title={selectedNode?.host.hostname ?? ""}>
          {selectedNode && (
            <HostDetail host={selectedNode.host} access={engine.player.accessByHost[selectedNode.host.id] ?? []} onClose={() => setSelected(null)} />
          )}
        </OSBottomSheet>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">{canvas}</div>
      <aside
        className={`shrink-0 border-l hairline bg-surface transition-[width] duration-base ${selectedNode ? "w-[300px]" : "w-0"}`}
        aria-hidden={!selectedNode}
      >
        {selectedNode && (
          <div className="scroll-area h-full p-4">
            <HostDetail host={selectedNode.host} access={engine.player.accessByHost[selectedNode.host.id] ?? []} />
          </div>
        )}
      </aside>
    </div>
  );
}
